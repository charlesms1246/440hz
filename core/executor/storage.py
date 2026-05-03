"""
Storage adapter for fetching base models / Gym images and uploading LoRA adapters.

Two backends:
  - "0g_storage" — uses the 0G Storage CLI bundled in the executor image.
                   Fetches by Merkle root hash, verifies content integrity
                   automatically (the CLI does this for us).
  - "hf"         — HuggingFace Hub for base models.
  - "local"      — for local dev. Skips network entirely.

We shell out to the 0G CLI (Node) rather than reimplementing the storage protocol
in Python. The CLI is the canonical client and it does Merkle verification on
download. Subprocess call overhead is irrelevant compared to download time.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


class StorageError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Base model fetch
# ---------------------------------------------------------------------------

def fetch_base_model(
    source: str,
    ref: str,
    root_hash: Optional[str],
    dest_dir: str,
) -> str:
    """
    Fetch a base model into `dest_dir`. Returns the path the trainer should load from.
    """
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)

    if source == "hf":
        return _fetch_from_huggingface(ref, dest)
    if source == "0g_storage":
        if not root_hash:
            raise StorageError("0g_storage source requires root_hash")
        return _fetch_from_0g_storage(root_hash, dest)
    raise StorageError(f"unknown base model source: {source}")


def _fetch_from_huggingface(repo_id: str, dest: Path) -> str:
    """Pull a base model from HF using huggingface_hub.snapshot_download."""
    log.info("Fetching base model from HuggingFace: %s", repo_id)
    from huggingface_hub import snapshot_download
    path = snapshot_download(
        repo_id=repo_id,
        local_dir=str(dest),
        local_dir_use_symlinks=False,
    )
    return path


def _fetch_from_0g_storage(root_hash: str, dest: Path) -> str:
    """
    Pull a tarball from 0G Storage by root hash, then extract.

    Convention: model artifacts are stored as a single tar.gz on 0G Storage.
    The CLI verifies the Merkle root automatically.
    """
    log.info("Fetching base model from 0G Storage: %s", root_hash)
    archive_path = dest / "model.tar.gz"
    cmd = [
        "0g-compute-cli", "fine-tuning", "download",
        "--data-path", str(archive_path),
        "--data-root", root_hash,
    ]
    _run(cmd)

    extract_dir = dest / "extracted"
    extract_dir.mkdir(exist_ok=True)
    with tarfile.open(archive_path, "r:gz") as tf:
        tf.extractall(extract_dir)
    archive_path.unlink()

    # The tarball convention is: top-level directory == model name. Pick whichever
    # subdirectory contains config.json.
    for child in extract_dir.iterdir():
        if (child / "config.json").exists():
            return str(child)
    raise StorageError(f"no config.json found in extracted archive at {extract_dir}")


# ---------------------------------------------------------------------------
# Gym image fetch
# ---------------------------------------------------------------------------

def fetch_gym_image(image_ref: str, root_hash: Optional[str], gym_env: Optional[dict] = None) -> Optional[str]:
    """
    Resolve a gym image_ref into a docker-loadable image tag, OR launch a
    Python source gym subprocess and return None (caller uses GYM_OVERRIDE_URL).

    - `0g://` refs are downloaded from 0G Storage. If the file is a 440hz gym
      bundle (JSON with `version`, `files`, `graph`), it's run as a Python
      subprocess and GYM_OVERRIDE_URL is set in the environment. Otherwise it's
      treated as a Docker tarball (`docker load`).
    - Any other ref is `docker pull`-ed from a registry.
    """
    if image_ref.startswith("0g://"):
        if not root_hash:
            root_hash = image_ref.removeprefix("0g://")
        raw = _download_raw_from_0g(root_hash)
        if _is_gym_bundle(raw):
            port = _find_free_port()
            _launch_source_gym(raw, port, env=gym_env or {})
            os.environ["GYM_OVERRIDE_URL"] = f"http://localhost:{port}"
            log.info("Python source gym launched on port %d", port)
            return None  # orchestrator uses GYM_OVERRIDE_URL path
        return _load_docker_tarball(raw)

    log.info("Pulling gym image from registry: %s", image_ref)
    _run(["docker", "pull", image_ref])
    return image_ref


def _download_raw_from_0g(root_hash: str) -> bytes:
    """Download a file from 0G Storage by root hash, return raw bytes."""
    log.info("Downloading from 0G Storage: %s", root_hash)
    tmp = Path(tempfile.mktemp(prefix="440hz-0g-"))
    _run([
        "0g-compute-cli", "fine-tuning", "download",
        "--data-path", str(tmp),
        "--data-root", root_hash,
    ])
    data = tmp.read_bytes()
    tmp.unlink(missing_ok=True)
    return data


def _is_gym_bundle(data: bytes) -> bool:
    """Return True if data looks like a 440hz gym bundle (JSON with version+files+graph)."""
    try:
        obj = json.loads(data[:8192])
        return obj.get("version") == "1.0" and "files" in obj and "graph" in obj
    except Exception:
        return False


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _launch_source_gym(data: bytes, port: int, env: dict) -> subprocess.Popen:
    """
    Extract a 440hz gym bundle, pip-install its requirements, run the gym server.
    The subprocess inherits the current environment plus the supplied env vars.
    """
    bundle = json.loads(data)
    tmpdir = Path(tempfile.mkdtemp(prefix="440hz-gym-src-"))
    log.info("Extracting gym source to %s", tmpdir)

    for name, b64_content in bundle["files"].items():
        dest = tmpdir / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(base64.b64decode(b64_content))

    req_file = tmpdir / "requirements.txt"
    if req_file.exists():
        log.info("Installing gym requirements from %s", req_file)
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-q", "-r", str(req_file)],
            check=True,
        )

    proc_env = {**os.environ, **env, "GYM_PORT": str(port)}
    proc = subprocess.Popen(
        [sys.executable, "-c",
         f"import sys; sys.path.insert(0, '{tmpdir}'); "
         f"from gym_env import GymEnv; from gym_sdk import serve; serve(GymEnv, port={port})"],
        cwd=str(tmpdir),
        env=proc_env,
    )

    # Wait for gym to be ready (up to 60 seconds)
    deadline = time.time() + 60
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                break
        except OSError:
            time.sleep(0.5)
    else:
        proc.terminate()
        raise StorageError(f"Source gym did not become ready on port {port} within 60s")

    return proc


def _load_docker_tarball(data: bytes) -> str:
    """Load a Docker image tarball, return the image tag."""
    tmp = Path(tempfile.mktemp(suffix=".tar", prefix="440hz-gym-img-"))
    tmp.write_bytes(data)
    res = subprocess.run(
        ["docker", "load", "-i", str(tmp)],
        capture_output=True, text=True, check=True,
    )
    tmp.unlink(missing_ok=True)
    for line in res.stdout.splitlines():
        if line.startswith("Loaded image:"):
            return line.split(":", 1)[1].strip()
    raise StorageError(f"docker load did not report a tag: stdout={res.stdout!r}")


# ---------------------------------------------------------------------------
# Adapter upload
# ---------------------------------------------------------------------------

def upload_adapter(
    adapter_dir: str,
    destination: str,
    encryption_pubkey: Optional[str],
    local_path: Optional[str],
) -> tuple[str, int | None]:
    """
    Package and upload the trained LoRA adapter.
    Returns (ref, tx_seq) where ref is the 0G root hash or local path,
    and tx_seq is the 0G storage sequence ID (None for local).
    """
    src = Path(adapter_dir)
    if not src.exists():
        raise StorageError(f"adapter dir does not exist: {src}")

    if destination == "local":
        dest = Path(local_path or "/var/440hz/output")
        dest.mkdir(parents=True, exist_ok=True)
        if dest.resolve() != src.resolve():
            shutil.copytree(src, dest, dirs_exist_ok=True)
        log.info("Adapter saved locally at %s", dest)
        return str(dest), None

    if destination == "0g_storage":
        # Tar the adapter dir.
        archive = Path("/tmp/440hz-adapter.tar.gz")
        with tarfile.open(archive, "w:gz") as tf:
            tf.add(src, arcname=src.name)

        upload_path = archive
        if encryption_pubkey:
            upload_path = _encrypt_for_pubkey(archive, encryption_pubkey)

        # Upload via the zg_broker Node helper (uses @0gfoundation/0g-ts-sdk).
        broker_script = Path(__file__).parent / "zg_broker.mjs"
        res = _run(["node", str(broker_script), "upload-adapter", str(upload_path)])
        try:
            data = json.loads(res.strip())
            if "rootHash" in data:
                return data["rootHash"], data.get("txSeq")
        except Exception:
            pass
        raise StorageError(f"could not parse root hash from upload output: {res!r}")

    raise StorageError(f"unknown destination: {destination}")


def _encrypt_for_pubkey(path: Path, pubkey_hex: str) -> Path:
    """
    Encrypt `path` to the recipient's public key. STUB.

    Production: use an audited ECIES implementation. The 0G fine-tuning service
    uses ECIES with secp256k1 (matching wallet keys), so we mirror that.
    """
    log.warning(
        "Encryption stub: writing plaintext archive. "
        "Replace with real ECIES before production use. pubkey=%s...",
        pubkey_hex[:10],
    )
    return path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd: list[str]) -> str:
    """Run a subprocess, log the command, raise on nonzero exit, return stdout."""
    log.info("$ %s", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise StorageError(
            f"command failed (exit {res.returncode}): {' '.join(cmd)}\n"
            f"stderr: {res.stderr}"
        )
    return res.stdout
