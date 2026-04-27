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

import logging
import os
import shutil
import subprocess
import tarfile
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

def fetch_gym_image(image_ref: str, root_hash: Optional[str]) -> str:
    """
    Resolve a gym image_ref into a docker-loadable image tag.

    - Refs starting with `0g://` are pulled from 0G Storage as a tarball
      produced by `docker save`, loaded into the local docker daemon, and the
      resolved tag is returned.
    - Anything else is treated as a registry ref and `docker pull`-ed.
    """
    if image_ref.startswith("0g://"):
        if not root_hash:
            root_hash = image_ref.removeprefix("0g://")
        return _load_image_from_0g(root_hash)

    log.info("Pulling gym image from registry: %s", image_ref)
    _run(["docker", "pull", image_ref])
    return image_ref


def _load_image_from_0g(root_hash: str) -> str:
    """Download a docker image tarball from 0G Storage and load it."""
    log.info("Fetching gym image tarball from 0G Storage: %s", root_hash)
    tmp = Path("/tmp/440hz-gym-image.tar")
    cmd = [
        "0g-compute-cli", "fine-tuning", "download",
        "--data-path", str(tmp),
        "--data-root", root_hash,
    ]
    _run(cmd)

    # `docker load` prints "Loaded image: <tag>" — capture the tag.
    res = subprocess.run(
        ["docker", "load", "-i", str(tmp)],
        capture_output=True, text=True, check=True,
    )
    tmp.unlink()
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
) -> str:
    """
    Package and upload the trained LoRA adapter. Returns either the 0G Storage
    root hash or the local path, depending on `destination`.
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
        return str(dest)

    if destination == "0g_storage":
        # Tar the adapter dir.
        archive = Path("/tmp/440hz-adapter.tar.gz")
        with tarfile.open(archive, "w:gz") as tf:
            tf.add(src, arcname=src.name)

        # Encrypt to the user's pubkey before upload, if provided. We stub the
        # encryption call out — production should use a vetted ECIES library
        # (e.g. eciespy) keyed off `encryption_pubkey` (a hex-encoded secp256k1
        # public key, matching the user's wallet).
        upload_path = archive
        if encryption_pubkey:
            upload_path = _encrypt_for_pubkey(archive, encryption_pubkey)

        # Upload via the 0G CLI. The CLI prints the resulting root hash.
        res = _run([
            "0g-compute-cli", "fine-tuning", "upload",
            "--data-path", str(upload_path),
        ])
        # Parse "Root hash: 0x..." from stdout.
        for line in res.splitlines():
            if "Root hash:" in line:
                return line.split("Root hash:", 1)[1].strip()
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
