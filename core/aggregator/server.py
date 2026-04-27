"""
440hz Aggregator — Flower server entry point.

Runs the LoRA-aware FedAvg over N clients, then uploads the aggregated adapter
to 0G Storage. Designed to run inside its own TEE (separate from the executors)
so the aggregation step is itself attestable.

Reads /etc/440hz/round_config.json:

    {
      "round_id":           "round-abc-123",
      "min_clients":        3,
      "lora_config_ref":    "/etc/440hz/adapter_config.json",   // template config copied into output
      "tokenizer_dir":      "/etc/440hz/tokenizer",             // copied into output
      "output_destination": "0g_storage" | "local",
      "encryption_pubkey":  "0x...",
      "host":               "0.0.0.0",
      "port":               8080
    }

After Flower stops (when min_clients have submitted and aggregation is done):
    1. Copy adapter_config.json + tokenizer files into output dir alongside the
       aggregated adapter_model.safetensors. This makes the directory a valid
       peft adapter that `PeftModel.from_pretrained` can load.
    2. Tar + upload to 0G Storage (or save locally).
    3. Emit /var/440hz/aggregator_receipt.json with the resulting root hash.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import sys
import tarfile
import time
import traceback
from pathlib import Path

import flwr as fl

# Reuse the executor's storage helpers — same upload behaviour, encryption logic,
# 0G CLI invocation. The aggregator image installs `executor` as a sibling
# package so this import is clean.
from executor.storage import upload_adapter

from .lora_aggregation import LoRAFedAvg

log = logging.getLogger("440hz.aggregator")


def _setup_logging() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )


def _load_round_config() -> dict:
    path = os.environ.get("ROUND_CONFIG", "/etc/440hz/round_config.json")
    with open(path) as f:
        return json.load(f)


def _assemble_adapter_dir(
    aggregated_safetensors_path: Path,
    adapter_config_path: str,
    tokenizer_dir: str,
    output_dir: Path,
) -> Path:
    """
    The aggregation strategy only writes adapter_model.safetensors. To make the
    output a peft-loadable adapter, we also copy in:
      - adapter_config.json (the LoRA config — same across all clients, by
        constraint of the round)
      - tokenizer.json + tokenizer_config.json (so users don't need to fetch them
        from the base model separately)

    All of these are passed into the aggregator at startup time as part of the
    round config. The adapter_config.json + tokenizer come from the round's
    canonical base-model bundle on 0G Storage, fetched once at round-open time
    and shared with all clients (which themselves used the same files locally).
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # adapter_model.safetensors should already be at output_dir from the strategy
    if aggregated_safetensors_path != output_dir / "adapter_model.safetensors":
        shutil.copy(aggregated_safetensors_path,
                    output_dir / "adapter_model.safetensors")

    if Path(adapter_config_path).exists():
        shutil.copy(adapter_config_path, output_dir / "adapter_config.json")
    else:
        log.warning("adapter_config.json not found at %s — output adapter will "
                    "not be peft-loadable until config is added.", adapter_config_path)

    tok_dir = Path(tokenizer_dir) if tokenizer_dir else None
    if tok_dir and tok_dir.exists() and tok_dir.is_dir():
        copied = 0
        for f in tok_dir.iterdir():
            if f.is_file():
                shutil.copy(f, output_dir / f.name)
                copied += 1
        log.info("Copied %d tokenizer file(s) into output dir", copied)
    else:
        log.warning("Tokenizer dir not provided or empty (%s) — user must supply "
                    "tokenizer separately when loading the aggregated adapter.",
                    tokenizer_dir)

    return output_dir


def main() -> int:
    _setup_logging()
    receipt: dict = {"started_at": time.time()}

    try:
        cfg = _load_round_config()
        receipt["round_id"] = cfg["round_id"]

        host = cfg.get("host", "0.0.0.0")
        port = int(cfg.get("port", 8080))
        min_clients = int(cfg["min_clients"])

        adapter_workdir = Path("/var/440hz/aggregated")
        adapter_workdir.mkdir(parents=True, exist_ok=True)

        log.info("=== 440hz Aggregator ===")
        log.info("round_id=%s, min_clients=%d, listen=%s:%d",
                 cfg["round_id"], min_clients, host, port)

        # Build the strategy. Initial adapter is None — one-shot mode.
        strategy = LoRAFedAvg(
            min_clients=min_clients,
            output_dir=str(adapter_workdir),
            initial_adapter_path=None,
        )

        # Server config: exactly one round in one-shot mode.
        server_config = fl.server.ServerConfig(num_rounds=1)

        # Block until min_clients have submitted and aggregation completes.
        history = fl.server.start_server(
            server_address=f"{host}:{port}",
            config=server_config,
            strategy=strategy,
            grpc_max_message_length=int(2 * 1024**3),  # 2 GB cap for big adapters
        )

        if not strategy._aggregation_done:
            raise RuntimeError("Flower exited but aggregation never completed")

        receipt["fit_metrics"] = [
            {"round": r, **dict(m)} for r, m in (history.metrics_distributed_fit or [])
        ]

        # Assemble the output dir into a valid peft adapter.
        output_dir = Path(os.environ.get("AGGREGATED_OUTPUT_DIR", "/var/440hz/output"))
        _assemble_adapter_dir(
            aggregated_safetensors_path=adapter_workdir / "adapter_model.safetensors",
            adapter_config_path=cfg["lora_config_ref"],
            tokenizer_dir=cfg.get("tokenizer_dir", ""),
            output_dir=output_dir,
        )
        log.info("Assembled aggregated peft adapter at %s", output_dir)

        # Upload via the same code path the single-node executor uses.
        adapter_ref = upload_adapter(
            adapter_dir=str(output_dir),
            destination=cfg.get("output_destination", "0g_storage"),
            encryption_pubkey=cfg.get("encryption_pubkey"),
            local_path=cfg.get("local_path", "/var/440hz/output"),
        )
        receipt["aggregated_adapter_ref"] = adapter_ref
        receipt["status"] = "success"
        log.info("Aggregator done. adapter_ref=%s", adapter_ref)

    except Exception as e:
        log.exception("Aggregator failed")
        receipt["status"] = "failed"
        receipt["error"] = str(e)
        receipt["traceback"] = traceback.format_exc()

    receipt["finished_at"] = time.time()
    out = Path(os.environ.get("RECEIPT_PATH", "/var/440hz/aggregator_receipt.json"))
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(receipt, f, indent=2)
    log.info("Receipt: %s (%s)", out, receipt["status"])

    return 0 if receipt["status"] == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
