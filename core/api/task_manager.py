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
