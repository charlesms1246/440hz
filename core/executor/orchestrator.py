"""
440hz Executor — main entrypoint.

Top-level pipeline:
    1. Load task.json from /etc/440hz/task.json (or $TASK_CONFIG path).
    2. Fetch base model (HF or 0G Storage) → /var/440hz/base_model
    3. Fetch gym image (registry pull or 0G Storage), start container.
    4. Wait for gym /healthz, fetch gym /spec.
    5. Build supervisor (0G inference, OpenAI-compat, or none).
    6. Load base model with QLoRA, attach LoRA adapter.
    7. Run RLAIFTrainer.train() — the RL loop.
    8. Save final adapter, encrypt, upload to 0G Storage.
    9. Emit a receipt JSON: {task_id, adapter_root_hash, metrics...}.
   10. Stop and remove the gym container.

Errors at any stage are caught at the top level, logged, and a failure receipt
is emitted to /var/440hz/receipt.json so the calling provider broker can settle
the task as Failed on-chain.
"""
from __future__ import annotations

import json
import logging
import os
import socket
import sys
import time
import traceback
from pathlib import Path
from typing import Optional

from .container_runtime import GymContainer
from .gym_client import GymClient
from .storage import fetch_base_model, fetch_gym_image, upload_adapter
from .supervisor import Supervisor
from .task_config import TaskConfig
from .trainer import RLAIFTrainer, attach_lora, load_base_model

log = logging.getLogger("440hz.executor")


# ---------------------------------------------------------------------------
# Structured event emitter
# Task manager parses these JSONL lines from stdout to drive SSE streams.
# ---------------------------------------------------------------------------

def _emit(payload: dict) -> None:
    """Write a JSONL event to stdout for the provider API daemon to consume."""
    print(json.dumps({"ts": time.time(), **payload}), flush=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _free_port() -> int:
    """Pick an unused port for the gym container's host-side mapping."""
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def _setup_logging() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )


def _load_task() -> TaskConfig:
    path = os.environ.get("TASK_CONFIG", "/etc/440hz/task.json")
    log.info("Loading task config from %s", path)
    with open(path) as f:
        data = json.load(f)
    return TaskConfig.model_validate(data)


def _emit_receipt(receipt: dict, status: str) -> None:
    receipt["status"] = status
    receipt["finished_at"] = time.time()
    out = Path(os.environ.get("RECEIPT_PATH", "/var/440hz/receipt.json"))
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(receipt, f, indent=2)
    log.info("Receipt written to %s (status=%s)", out, status)


class _NullContext:
    """No-op context manager — used when the gym is supplied externally
    (e.g. in local docker-compose dev mode via GYM_OVERRIDE_URL)."""
    def __enter__(self): return self
    def __exit__(self, *_exc): return None
    def logs(self, tail: int = 0) -> str: return ""
    @property
    def base_url(self) -> str: return ""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    _setup_logging()
    task: Optional[TaskConfig] = None
    receipt: dict = {"started_at": time.time()}

    try:
        task = _load_task()
        receipt["task_id"] = task.task_id
        receipt["base_model"] = task.base_model.ref
        receipt["gym_image"] = task.gym.image_ref
        _emit({"type": "status", "stage": "loaded_config", "task_id": task.task_id})

        # ------------------------------------------------------------------
        # 1. Fetch base model
        # ------------------------------------------------------------------
        log.info("=== Stage 1/5: fetch base model ===")
        _emit({"type": "status", "stage": "fetching_model", "model": task.base_model.ref})
        model_path = fetch_base_model(
            source=task.base_model.source,
            ref=task.base_model.ref,
            root_hash=task.base_model.root_hash,
            dest_dir="/var/440hz/base_model",
        )
        receipt["base_model_path"] = model_path

        # ------------------------------------------------------------------
        # 2. Fetch gym image and start container
        # ------------------------------------------------------------------
        # Local-dev escape hatch: if GYM_OVERRIDE_URL is set, we skip pulling
        # and starting the gym ourselves and just point the client at an
        # already-running gym (typically a sibling docker-compose service).
        # This is what lets us iterate without nested DinD on a laptop.
        gym_override = os.environ.get("GYM_OVERRIDE_URL")
        gym_container_cm = _NullContext()
        gym_base_url: str

        if gym_override:
            log.info("=== Stage 2/5: using gym override at %s (skipping container launch) ===",
                     gym_override)
            _emit({"type": "status", "stage": "gym_override", "url": gym_override})
            gym_base_url = gym_override
        else:
            log.info("=== Stage 2/5: launch gym container ===")
            _emit({"type": "status", "stage": "fetching_gym", "image": task.gym.image_ref})
            gym_image = fetch_gym_image(task.gym.image_ref, task.gym.root_hash)
            host_port = _free_port()
            gym_container_cm = GymContainer(
                image=gym_image,
                host_port=host_port,
                container_port=task.gym.port,
                cpu_limit=task.gym.cpu_limit,
                memory_limit=task.gym.memory_limit,
                env=task.gym.env,
            )
            gym_base_url = gym_container_cm.base_url  # set by .start()

        with gym_container_cm:
            # When using container_cm.start() the base_url is set after start.
            # The override case is already set above. Re-read it here either way.
            url_for_client = (
                gym_override
                if gym_override
                else gym_container_cm.base_url
            )
            with GymClient(url_for_client) as gym_client:
                gym_client.wait_until_healthy(timeout=60.0)
                spec = gym_client.spec()
                log.info("Gym ready: %s v%s — %s", spec.name, spec.version, spec.description)
                receipt["gym_spec"] = spec.model_dump()
                _emit({"type": "status", "stage": "gym_ready", "gym_name": spec.name, "gym_version": spec.version})

                # ----------------------------------------------------------
                # 3. Supervisor
                # ----------------------------------------------------------
                log.info("=== Stage 3/5: build supervisor (%s) ===", task.supervisor.type)
                _emit({"type": "status", "stage": "building_supervisor", "supervisor_type": task.supervisor.type})
                supervisor = Supervisor(task.supervisor)

                # ----------------------------------------------------------
                # 4. Load base model + attach LoRA
                # ----------------------------------------------------------
                log.info("=== Stage 4/5: load base model + attach LoRA ===")
                _emit({"type": "status", "stage": "loading_model"})
                model, tokenizer = load_base_model(task.base_model, model_path)
                model = attach_lora(model, task.algorithm)
                # Sanity-print the trainable param count.
                trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
                total = sum(p.numel() for p in model.parameters())
                log.info("Trainable params: %d / %d (%.2f%%)",
                         trainable, total, 100 * trainable / total)
                receipt["trainable_params"] = trainable
                _emit({"type": "status", "stage": "model_loaded", "trainable_params": trainable, "total_params": total})

                # ----------------------------------------------------------
                # 5. Train
                # ----------------------------------------------------------
                log.info("=== Stage 5/5: RLAIF training loop ===")
                _emit({"type": "status", "stage": "training", "algorithm": task.algorithm.name, "num_episodes": task.algorithm.num_episodes})
                trainer = RLAIFTrainer(
                    model=model,
                    tokenizer=tokenizer,
                    gym=gym_client,
                    supervisor=supervisor,
                    algo=task.algorithm,
                    output_dir="/var/440hz/adapter",
                )
                last_traj = trainer.train()
                receipt["final_total_reward"] = last_traj.total_reward
                receipt["final_episode_steps"] = len(last_traj.steps)

                # Capture gym logs for the receipt before we exit the with-block.
                # Skipped in override mode since we don't own the gym container.
                if not gym_override:
                    receipt["gym_logs_tail"] = gym_container_cm.logs(tail=200)

        # gym container is now stopped + removed
        _emit({"type": "status", "stage": "training_complete",
               "final_reward": receipt.get("final_total_reward"),
               "final_steps": receipt.get("final_episode_steps")})

        # ------------------------------------------------------------------
        # Output: either submit to a federation aggregator, or upload directly
        # ------------------------------------------------------------------
        adapter_dir = "/var/440hz/adapter/final"

        if task.federation.enabled:
            log.info("=== Federation: submitting adapter to aggregator ===")
            from .federation import submit_adapter

            if not task.federation.aggregator_address:
                raise RuntimeError(
                    "federation.enabled=true but no aggregator_address configured"
                )
            submit_adapter(
                adapter_dir=adapter_dir,
                aggregator_address=task.federation.aggregator_address,
                round_id=task.federation.round_id or task.task_id,
                num_examples=task.federation.num_examples,
                connect_timeout_s=task.federation.connect_timeout_s,
                retry_interval_s=task.federation.connect_retry_interval_s,
            )
            receipt["federation"] = {
                "submitted": True,
                "aggregator": task.federation.aggregator_address,
                "round_id": task.federation.round_id,
                "num_examples": task.federation.num_examples,
            }
            # In federation mode, the aggregator handles the final upload — we
            # don't write our local adapter to 0G Storage. The user retrieves
            # the *aggregated* adapter via the round's on-chain receipt.
            log.info("Federation submission complete. Aggregator owns the upload.")
            _emit({"type": "status", "stage": "federation_submitted",
                   "aggregator": task.federation.aggregator_address})

        else:
            log.info("=== Uploading adapter ===")
            _emit({"type": "status", "stage": "uploading_adapter", "destination": task.output.destination})
            adapter_ref = upload_adapter(
                adapter_dir=adapter_dir,
                destination=task.output.destination,
                encryption_pubkey=task.output.encryption_pubkey,
                local_path=task.output.local_path,
            )
            receipt["adapter_ref"] = adapter_ref

        _emit_receipt(receipt, status="success")
        _emit({"type": "complete", "status": "success",
               "adapter_ref": receipt.get("adapter_ref"),
               "receipt_path": os.environ.get("RECEIPT_PATH", "/var/440hz/receipt.json")})
        return 0

    except Exception as e:
        log.exception("Training task failed")
        receipt["error"] = str(e)
        receipt["traceback"] = traceback.format_exc()
        _emit_receipt(receipt, status="failed")
        _emit({"type": "error", "message": str(e)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
