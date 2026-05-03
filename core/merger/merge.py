"""
LoRA weight merger for 440hz.

Reads env vars, downloads the LoRA adapter from 0G Storage (or uses a local
stub for mock:// refs), merges it into the base model with peft, and uploads
the merged weights back to 0G Storage.

Emits JSONL status events on stdout (same format as orchestrator.py).
Set via task_manager as:
  python -m merger.merge
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ADAPTER_REF  = os.environ.get("ADAPTER_REF", "")
BASE_MODEL   = os.environ.get("BASE_MODEL", "")
RECEIPT_PATH = Path(os.environ.get("RECEIPT_PATH", "/tmp/merge_receipt.json"))


def _emit(payload: dict) -> None:
    print(json.dumps({"ts": time.time(), **payload}), flush=True)


def _run(cmd: list[str], cwd: str | None = None) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return result.stdout


def _download_adapter(adapter_ref: str, dest_dir: Path) -> Path:
    """Download adapter from 0G Storage. Returns local directory path."""
    if adapter_ref.startswith("mock://"):
        # Dev stub: no real adapter, return empty dir (merge will use random weights)
        dest_dir.mkdir(parents=True, exist_ok=True)
        return dest_dir

    # Shell out to 0g-compute-cli to download the tarball
    root_hash = adapter_ref  # 0x... hex hash
    _emit({"type": "log", "message": f"Downloading adapter {root_hash[:20]}… from 0G Storage"})
    stdout = _run([
        "0g-compute-cli", "fine-tuning", "download",
        "--root-hash", root_hash,
        "--output-dir", str(dest_dir),
    ])
    # CLI prints something like "Downloaded to: /tmp/..."
    for line in stdout.splitlines():
        if "Downloaded to:" in line:
            return Path(line.split("Downloaded to:")[-1].strip())
    return dest_dir


def _upload_merged(merged_dir: Path) -> str:
    """Upload merged model directory to 0G Storage. Returns root hash."""
    _emit({"type": "log", "message": "Uploading merged model to 0G Storage…"})
    stdout = _run([
        "0g-compute-cli", "fine-tuning", "upload",
        "--data-path", str(merged_dir),
    ])
    for line in stdout.splitlines():
        if "Root hash:" in line:
            return line.split("Root hash:")[-1].strip()
    raise RuntimeError(f"Could not parse root hash from upload output:\n{stdout}")


def main() -> int:
    if not BASE_MODEL:
        _emit({"type": "error", "message": "BASE_MODEL env var not set"})
        return 1
    if not ADAPTER_REF:
        _emit({"type": "error", "message": "ADAPTER_REF env var not set"})
        return 1

    is_mock = ADAPTER_REF.startswith("mock://")

    with tempfile.TemporaryDirectory(prefix="440hz-merge-") as tmpdir:
        adapter_dir = Path(tmpdir) / "adapter"
        merged_dir  = Path(tmpdir) / "merged"
        merged_dir.mkdir(parents=True, exist_ok=True)

        # ── Step 1: download adapter ──────────────────────────────────────────
        _emit({"type": "status", "stage": "downloading_adapter"})
        adapter_dir = _download_adapter(ADAPTER_REF, adapter_dir)

        # ── Step 2: load base model ───────────────────────────────────────────
        _emit({"type": "status", "stage": "loading_base_model", "model": BASE_MODEL})
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
            from peft import PeftModel
        except ImportError as e:
            _emit({"type": "error", "message": f"Missing dependency: {e}. Install: pip install torch transformers peft"})
            return 1

        try:
            if is_mock:
                # Stub: build a tiny random model for dev testing without real weights
                from transformers import AutoConfig
                _emit({"type": "log", "message": "Mock mode: loading tiny stub model (no real weights)"})
                config = AutoConfig.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")
                # Shrink it to load in <1s on CPU
                config.num_hidden_layers = 2
                config.hidden_size = 64
                config.intermediate_size = 128
                config.num_attention_heads = 2
                config.num_key_value_heads = 2
                base_model = AutoModelForCausalLM.from_config(config)
                tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")
            else:
                base_model = AutoModelForCausalLM.from_pretrained(
                    BASE_MODEL,
                    device_map="cpu",
                    torch_dtype=torch.float32,
                    low_cpu_mem_usage=True,
                )
                tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
        except Exception as exc:
            _emit({"type": "error", "message": f"Failed to load base model {BASE_MODEL}: {exc}"})
            return 1

        # ── Step 3: merge ─────────────────────────────────────────────────────
        _emit({"type": "status", "stage": "merging"})
        try:
            if is_mock:
                # No real adapter to load — save the base model directly as "merged"
                merged_model = base_model
            else:
                merged_model = PeftModel.from_pretrained(base_model, str(adapter_dir))
                merged_model = merged_model.merge_and_unload()

            merged_model.save_pretrained(str(merged_dir))
            tokenizer.save_pretrained(str(merged_dir))
            _emit({"type": "log", "message": f"Merged model saved ({len(list(merged_dir.iterdir()))} files)"})
        except Exception as exc:
            _emit({"type": "error", "message": f"Merge failed: {exc}"})
            return 1

        # ── Step 4: upload ────────────────────────────────────────────────────
        _emit({"type": "status", "stage": "uploading"})
        if is_mock:
            # Simulate an upload root hash so the UI flow can be tested end-to-end
            merged_model_ref = "mock://merged/" + ADAPTER_REF.split("/")[-1]
            _emit({"type": "log", "message": f"Mock mode: skipping real upload, stub ref = {merged_model_ref}"})
        else:
            try:
                merged_model_ref = _upload_merged(merged_dir)
            except Exception as exc:
                _emit({"type": "error", "message": f"Upload failed: {exc}"})
                return 1

    # ── Step 5: write receipt ─────────────────────────────────────────────────
    receipt = {
        "merged_model_ref": merged_model_ref,
        "base_model": BASE_MODEL,
        "adapter_ref": ADAPTER_REF,
        "merged_at": time.time(),
    }
    RECEIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2))

    _emit({"type": "complete", "merged_model_ref": merged_model_ref})
    return 0


if __name__ == "__main__":
    sys.exit(main())
