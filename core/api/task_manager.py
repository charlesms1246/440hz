"""
Task lifecycle manager for the 440hz provider daemon.

Responsibilities:
  - Convert a TaskSubmitRequest into the executor's task.json format.
  - Spawn core/executor/orchestrator.py as an asyncio subprocess.
  - Parse structured JSONL events from executor stdout and fan them out to
    per-task asyncio queues (consumed by SSE endpoints).
  - Enforce the runtime wall-clock deadline (kills the subprocess at timeout).
  - Persist task state to ~/.440hz/tasks.json so restarts don't lose history.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import AsyncIterator

from .models import (
    AlgorithmConfig,
    ExternalConnector,
    FederationConfig,
    LogEntry,
    OverseerRef,
    OutputConfig,
    TaskStatus,
    TaskSubmitRequest,
)

log = logging.getLogger("440hz.api.task_manager")

# Root directory for per-task scratch space and state persistence.
_STATE_DIR = Path(os.environ.get("HZ_STATE_DIR", Path.home() / ".440hz"))
_TASKS_FILE = _STATE_DIR / "tasks.json"

# Path to the executor module. Can be overridden for local dev.
_EXECUTOR_PYTHON = os.environ.get("HZ_PYTHON", sys.executable)
_EXECUTOR_MODULE = os.environ.get("HZ_EXECUTOR_MODULE", "executor.orchestrator")
_EXECUTOR_PYTHONPATH = os.environ.get(
    "HZ_PYTHONPATH",
    str(Path(__file__).resolve().parent.parent),
)

# In-memory state (authoritative; persisted to disk on every mutation).
_tasks: dict[str, TaskStatus] = {}
# Per-task asyncio queues that SSE consumers read from.
_log_queues: dict[str, asyncio.Queue] = {}
# Global DA stream queue — all DA checkpoint events from all tasks go here.
_da_queue: asyncio.Queue = asyncio.Queue(maxsize=512)
# Running subprocess handles for cancellation.
_processes: dict[str, asyncio.subprocess.Process] = {}
# Cache of submitted ZGTask objects (for 0G protocol tasks only).
_zg_tasks: dict[str, object] = {}


# ---------------------------------------------------------------------------
# Init / persistence
# ---------------------------------------------------------------------------

def load_persisted_tasks() -> None:
    _STATE_DIR.mkdir(parents=True, exist_ok=True)
    if not _TASKS_FILE.exists():
        return
    try:
        raw = json.loads(_TASKS_FILE.read_text())
        for item in raw:
            ts = TaskStatus(**item)
            # Jobs that were running when the daemon died are now failed.
            if ts.state in ("pending", "running"):
                ts.state = "failed"
                ts.error = "daemon restarted while task was running"
                ts.updated_at = time.time()
            _tasks[ts.id] = ts
        log.info("Loaded %d persisted tasks", len(_tasks))
    except Exception as exc:
        log.warning("Could not load persisted tasks: %s", exc)


def _persist() -> None:
    try:
        _STATE_DIR.mkdir(parents=True, exist_ok=True)
        data = [t.model_dump() for t in _tasks.values()]
        _TASKS_FILE.write_text(json.dumps(data, indent=2))
    except Exception as exc:
        log.warning("Could not persist tasks: %s", exc)


# ---------------------------------------------------------------------------
# Task submission
# ---------------------------------------------------------------------------

def _build_task_json(req: TaskSubmitRequest, task_id: str) -> dict:
    """
    Convert a TaskSubmitRequest to the JSON format the executor reads as task.json.
    Maps API field names to the executor's task_config.TaskConfig schema.
    """
    # source mapping: API uses "huggingface" / "0g_storage" / "local",
    # executor uses "hf" / "0g_storage".
    source_map = {"huggingface": "hf", "0g_storage": "0g_storage", "local": "hf"}

    base_model = {
        "source": source_map.get(req.base_model.source, "hf"),
        "ref": req.base_model.ref,
        "root_hash": req.base_model.root_hash,
        "quantization": req.base_model.quantization,
        "dtype": req.base_model.dtype,
    }

    # Gym: stored as 0G Storage bundle → use the 0g:// image_ref convention.
    gym_env = dict(req.gym.env)
    if req.base_system_prompt:
        gym_env["SYSTEM_PROMPT"] = req.base_system_prompt
    # Mount external connectors that specify an env var name.
    for conn in req.external_connectors:
        if conn.mount_env:
            gym_env[conn.mount_env] = conn.uri

    gym = {
        "image_ref": f"0g://{req.gym.root_hash}",
        "root_hash": req.gym.root_hash,
        "port": req.gym.port,
        "cpu_limit": req.gym.cpu_limit,
        "memory_limit": req.gym.memory_limit,
        "env": gym_env,
    }

    supervisor = {
        "type": req.overseer.type,
        "provider_address": req.overseer.provider_address,
        "model": req.overseer.model,
        "base_url": req.overseer.base_url,
        "api_key": req.overseer.api_key,
        "scoring_mode": req.overseer.scoring_mode,
    }
    if req.overseer.rubric:
        supervisor["rubric"] = req.overseer.rubric

    algorithm = {
        "name": req.algorithm.name,
        "num_episodes": req.algorithm.num_episodes,
        "learning_rate": req.algorithm.learning_rate,
        "lora_rank": req.algorithm.lora_rank,
        "lora_alpha": req.algorithm.lora_alpha,
        "lora_dropout": req.algorithm.lora_dropout,
        "target_modules": req.algorithm.target_modules,
        "max_new_tokens": req.algorithm.max_new_tokens,
        "temperature": req.algorithm.temperature,
        "top_p": req.algorithm.top_p,
        "kl_coef": req.algorithm.kl_coef,
        "batch_size": req.algorithm.batch_size,
        "grad_accum_steps": req.algorithm.grad_accum_steps,
        "group_size": req.algorithm.group_size,
        "save_every": req.algorithm.save_every,
    }

    output = {
        "destination": req.output.destination,
        "encryption_pubkey": req.output.encryption_pubkey,
        "local_path": req.output.local_path or f"/var/440hz/output/{task_id}",
    }

    federation = {
        "enabled": req.federation.enabled,
        "aggregator_address": req.federation.aggregator_address,
        "round_id": req.federation.round_id,
        "num_examples": req.federation.num_examples,
        "connect_timeout_s": req.federation.connect_timeout_s,
    }

    return {
        "task_id": task_id,
        "base_model": base_model,
        "gym": gym,
        "supervisor": supervisor,
        "algorithm": algorithm,
        "output": output,
        "federation": federation,
        "metadata": {
            "arena_name": req.arena_name,
            "submitter_address": req.submitter_address,
            "escrow_tx_hash": req.runtime.escrow_tx_hash,
            "escrow_amount_og": req.runtime.escrow_amount_og,
            "estimated_cost_og": req.runtime.estimated_cost_og,
            "max_runtime_seconds": req.runtime.max_runtime_seconds,
        },
    }


async def submit_task(req: TaskSubmitRequest) -> TaskStatus:
    task_id = str(uuid.uuid4())
    now = time.time()

    task_dir = _STATE_DIR / "tasks" / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    # Write task.json for the executor.
    task_json = _build_task_json(req, task_id)
    task_config_path = task_dir / "task.json"
    task_config_path.write_text(json.dumps(task_json, indent=2))

    receipt_path = task_dir / "receipt.json"

    status = TaskStatus(
        id=task_id,
        arena_name=req.arena_name,
        submitter_address=req.submitter_address,
        state="pending",
        created_at=now,
        updated_at=now,
    )
    _tasks[task_id] = status
    _log_queues[task_id] = asyncio.Queue(maxsize=4096)
    _persist()

    # Spawn the executor in the background.
    asyncio.create_task(
        _run_executor(task_id, task_config_path, receipt_path, req.runtime.max_runtime_seconds),
        name=f"executor-{task_id}",
    )

    return status


# ---------------------------------------------------------------------------
# Executor subprocess management
# ---------------------------------------------------------------------------

async def _run_executor(
    task_id: str,
    task_config_path: Path,
    receipt_path: Path,
    max_runtime_seconds: int,
) -> None:
    env = {
        **os.environ,
        "TASK_CONFIG": str(task_config_path),
        "RECEIPT_PATH": str(receipt_path),
        "PYTHONPATH": _EXECUTOR_PYTHONPATH,
        "PYTHONUNBUFFERED": "1",
    }

    _tasks[task_id].state = "running"
    _tasks[task_id].updated_at = time.time()
    _persist()

    _emit_log(task_id, "status", {"stage": "starting", "task_id": task_id})

    try:
        proc = await asyncio.create_subprocess_exec(
            _EXECUTOR_PYTHON,
            "-m",
            _EXECUTOR_MODULE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,  # merge stderr into stdout
            env=env,
        )
        _processes[task_id] = proc

        # Drain stdout in a separate task so we can enforce timeout independently.
        drain_task = asyncio.create_task(_drain_stdout(task_id, proc))

        try:
            await asyncio.wait_for(
                asyncio.shield(drain_task),
                timeout=float(max_runtime_seconds),
            )
        except asyncio.TimeoutError:
            log.warning("Task %s exceeded runtime limit (%ds), killing", task_id, max_runtime_seconds)
            _emit_log(task_id, "error", {"message": f"Runtime limit of {max_runtime_seconds}s exceeded"})
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await drain_task
            _finish_task(task_id, "failed", receipt_path, error="runtime limit exceeded")
            return

        await proc.wait()
        rc = proc.returncode

        if rc == 0:
            _finish_task(task_id, "completed", receipt_path)
        else:
            _finish_task(task_id, "failed", receipt_path, error=f"executor exited with code {rc}")

    except Exception as exc:
        log.exception("Error running executor for task %s", task_id)
        _finish_task(task_id, "failed", receipt_path, error=str(exc))
    finally:
        _processes.pop(task_id, None)
        # Signal SSE consumers that the stream is done.
        await _log_queues[task_id].put(None)


async def _drain_stdout(task_id: str, proc: asyncio.subprocess.Process) -> None:
    """Read stdout line by line, parse JSONL events, push to queues."""
    assert proc.stdout is not None
    async for raw_line in proc.stdout:
        line = raw_line.decode(errors="replace").rstrip()
        if not line:
            continue
        # Try to parse as a structured JSONL event emitted by _emit() in orchestrator.
        if line.startswith("{"):
            try:
                event = json.loads(line)
                event_type = event.get("type", "log")
                entry = LogEntry(ts=event.get("ts", time.time()), type=event_type, payload=event)
                await _push_log(task_id, entry)
                if event_type == "da_checkpoint":
                    try:
                        await _da_queue.put_nowait(entry)
                    except asyncio.QueueFull:
                        pass
                continue
            except json.JSONDecodeError:
                pass
        # Plain text line → wrap as a generic log entry.
        entry = LogEntry(ts=time.time(), type="log", payload={"message": line})
        await _push_log(task_id, entry)


async def _push_log(task_id: str, entry: LogEntry) -> None:
    q = _log_queues.get(task_id)
    if q is None:
        return
    try:
        q.put_nowait(entry)
    except asyncio.QueueFull:
        # Drop oldest entry to make room.
        try:
            q.get_nowait()
        except asyncio.QueueEmpty:
            pass
        q.put_nowait(entry)


def _emit_log(task_id: str, event_type: str, payload: dict) -> None:
    entry = LogEntry(ts=time.time(), type=event_type, payload=payload)
    q = _log_queues.get(task_id)
    if q:
        try:
            q.put_nowait(entry)
        except asyncio.QueueFull:
            pass


def _finish_task(
    task_id: str,
    state: str,
    receipt_path: Path,
    error: str | None = None,
) -> None:
    ts = _tasks.get(task_id)
    if ts is None:
        return
    ts.state = state  # type: ignore[assignment]
    ts.updated_at = time.time()
    ts.elapsed_seconds = int(ts.updated_at - ts.created_at)
    ts.error = error
    if receipt_path.exists():
        try:
            ts.receipt = json.loads(receipt_path.read_text())
        except Exception:
            pass
    _emit_log(task_id, "complete" if state == "completed" else "error", {
        "state": state,
        "error": error,
        "receipt_path": str(receipt_path),
    })
    _persist()
    log.info("Task %s finished: state=%s", task_id, state)


# ---------------------------------------------------------------------------
# Public accessors
# ---------------------------------------------------------------------------

def list_tasks() -> list[TaskStatus]:
    return list(_tasks.values())


def get_task(task_id: str) -> TaskStatus | None:
    return _tasks.get(task_id)


async def cancel_task(task_id: str) -> bool:
    ts = _tasks.get(task_id)
    if ts is None or ts.state not in ("pending", "running"):
        return False
    proc = _processes.get(task_id)
    if proc:
        try:
            proc.terminate()
        except ProcessLookupError:
            pass
    ts.state = "cancelled"
    ts.updated_at = time.time()
    ts.elapsed_seconds = int(ts.updated_at - ts.created_at)
    _emit_log(task_id, "error", {"message": "task cancelled by user"})
    _persist()
    return True


async def stream_task_logs(task_id: str) -> AsyncIterator[LogEntry]:
    """Yield LogEntry objects until the task finishes (None sentinel)."""
    q = _log_queues.get(task_id)
    if q is None:
        return
    while True:
        entry = await q.get()
        if entry is None:
            break
        yield entry


async def stream_da_events() -> AsyncIterator[LogEntry]:
    """Yield DA checkpoint events from all running tasks."""
    while True:
        entry = await _da_queue.get()
        yield entry


# ---------------------------------------------------------------------------
# 0G fine-tuning provider protocol bridge
# ---------------------------------------------------------------------------

def _state_to_zg_progress(state: str, log_entries: list[LogEntry] | None = None) -> str:
    """Map internal task state + log events to 0G progress enum values."""
    if state == "failed":
        return "Failed"
    if state == "cancelled":
        return "Failed"
    if state == "completed":
        return "Finished"
    if state == "pending":
        return "Init"
    # running — check last status event for finer granularity
    if state == "running" and log_entries:
        stage_map = {
            "starting":              "Init",
            "loaded_config":         "SettingUp",
            "fetching_model":        "SettingUp",
            "fetching_gym":          "SettingUp",
            "gym_override":          "SettingUp",
            "gym_ready":             "SetUp",
            "building_supervisor":   "SetUp",
            "loading_model":         "SetUp",
            "model_loaded":          "SetUp",
            "training":              "Training",
            "training_complete":     "Trained",
            "uploading_adapter":     "Delivering",
            "federation_submitted":  "Delivered",
        }
        for entry in reversed(log_entries):
            if entry.type == "status":
                stage = entry.payload.get("stage", "")
                if stage in stage_map:
                    return stage_map[stage]
            if entry.type == "complete":
                return "Delivered"
    return "Training"  # default running state


async def submit_zg_task(zg_task) -> tuple:
    """
    Translate a ZGTask (from 0G SDK) into an internal TaskSubmitRequest and submit it.
    Returns (ZGTask with id populated, internal task_id).
    """
    from .models import (
        BaseModelRef, GymRef, OverseerRef as OverseerRefModel, AlgorithmConfig,
        OutputConfig, FederationConfig, RuntimeBudget, TaskSubmitRequest, ZGTask
    )

    # Parse trainingParams JSON string into algo config fields.
    try:
        params = json.loads(zg_task.trainingParams) if zg_task.trainingParams else {}
    except (json.JSONDecodeError, TypeError):
        params = {}

    algo = AlgorithmConfig(
        name=params.get("name", "grpo"),
        num_episodes=int(params.get("num_episodes", 50)),
        learning_rate=float(params.get("learning_rate", 2e-5)),
        lora_rank=int(params.get("lora_rank", 16)),
        lora_alpha=int(params.get("lora_alpha", 32)),
        lora_dropout=float(params.get("lora_dropout", 0.05)),
        target_modules=params.get("target_modules", ["q_proj", "k_proj", "v_proj", "o_proj"]),
        max_new_tokens=int(params.get("max_new_tokens", 256)),
        temperature=float(params.get("temperature", 0.9)),
        top_p=float(params.get("top_p", 0.95)),
        kl_coef=float(params.get("kl_coef", 0.04)),
        batch_size=int(params.get("batch_size", 1)),
        grad_accum_steps=int(params.get("grad_accum_steps", 4)),
        group_size=int(params.get("group_size", 4)),
        save_every=int(params.get("save_every", 10)),
    )

    # Resolve supervisor config from trainingParams or sensible default.
    judge_url = params.get("judge_base_url", os.environ.get("OLLAMA_HOST", ""))
    overseer = OverseerRefModel(
        type="openai_compatible" if judge_url else "none",
        base_url=f"http://{judge_url}/v1" if judge_url and not judge_url.startswith("http") else (judge_url or None),
        model=params.get("judge_model", None),
        rubric=params.get("rubric", None),
        scoring_mode=params.get("scoring_mode", "per_step"),
    )

    try:
        fee_og = float(zg_task.fee) / 1e18  # aOG → OG
    except (ValueError, TypeError):
        fee_og = 0.0

    req = TaskSubmitRequest(
        arena_name=params.get("arena_name", f"0g-task-{zg_task.nonce[:8]}"),
        base_system_prompt=params.get("system_prompt", None),
        submitter_address=zg_task.userAddress,
        base_model=BaseModelRef(
            source="0g_storage",
            ref=zg_task.preTrainedModelHash,
            root_hash=zg_task.preTrainedModelHash,
        ),
        gym=GymRef(
            root_hash=zg_task.datasetHash,
        ),
        overseer=overseer,
        algorithm=algo,
        output=OutputConfig(destination="0g_storage"),
        runtime=RuntimeBudget(
            max_runtime_seconds=int(params.get("max_runtime_seconds", 7200)),
            escrow_tx_hash=zg_task.nonce,  # nonce serves as the payment proof reference
            escrow_amount_og=fee_og,
        ),
    )

    status = await submit_task(req)

    zg_task.id = status.id
    import datetime
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    zg_task.createdAt = now_iso
    zg_task.updatedAt = now_iso
    zg_task.progress = "Init"

    # Cache the ZGTask so get_zg_task can return the original fields.
    _zg_tasks[status.id] = zg_task

    return zg_task, status.id


def get_zg_task(task_id: str):
    """Return a ZGTask view of an internal task for the 0G protocol."""
    from .models import ZGTask
    ts = _tasks.get(task_id)
    if ts is None:
        return None

    # Snapshot log queue for progress derivation.
    q = _log_queues.get(task_id)
    log_entries: list[LogEntry] = list(q._queue) if q else []  # type: ignore[attr-defined]

    progress = _state_to_zg_progress(ts.state, log_entries)
    deliver_index = None
    if ts.receipt and isinstance(ts.receipt, dict):
        deliver_index = ts.receipt.get("adapter_ref")

    import datetime
    updated = datetime.datetime.utcfromtimestamp(ts.updated_at).isoformat() + "Z"

    # If we have the original ZGTask cached (submitted via 0G protocol), update it.
    cached = _zg_tasks.get(task_id)
    if cached is not None:
        cached.progress = progress  # type: ignore[attr-defined]
        cached.updatedAt = updated  # type: ignore[attr-defined]
        if deliver_index:
            cached.deliverIndex = deliver_index  # type: ignore[attr-defined]
        return cached

    # Fallback: reconstruct from persisted state (e.g. after restart, or internal submit).
    created = datetime.datetime.utcfromtimestamp(ts.created_at).isoformat() + "Z"
    return ZGTask(
        id=task_id,
        createdAt=created,
        updatedAt=updated,
        userAddress=ts.submitter_address,
        preTrainedModelHash="",
        datasetHash="",
        trainingParams="{}",
        fee="0",
        nonce="",
        signature="",
        progress=progress,
        deliverIndex=deliver_index,
    )


def get_zg_task_logs(task_id: str, max_lines: int = 200) -> list[str]:
    """Return recent log lines for the task as plain strings."""
    q = _log_queues.get(task_id)
    if not q:
        return []
    lines = []
    for entry in list(q._queue):  # type: ignore[attr-defined]
        if isinstance(entry, LogEntry):
            msg = entry.payload.get("message", "")
            if not msg:
                msg = json.dumps(entry.payload)
            lines.append(f"[{entry.type}] {msg}")
    return lines[-max_lines:]
