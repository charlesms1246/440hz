"""
0G network provider registration for the 440hz compute daemon.

Reads provider config from env vars and exposes:
  - get_provider_info()  → current registration status
  - register_provider()  → triggers on-chain registration via register_provider.mjs
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from .models import ProviderInfo

log = logging.getLogger("440hz.api.provider")

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
_REGISTER_SCRIPT = _SCRIPTS_DIR / "register_provider.mjs"

# Env-driven provider config.
PROVIDER_PRIVATE_KEY = os.environ.get("PROVIDER_PRIVATE_KEY") or os.environ.get("PRIVATE_KEY", "")
PROVIDER_ENDPOINT = os.environ.get("PROVIDER_ENDPOINT", "http://localhost:8420")
PROVIDER_MODELS_RAW = os.environ.get(
    "PROVIDER_MODELS",
    "Qwen/Qwen2.5-7B-Instruct,meta-llama/Llama-3.1-8B-Instruct",
)
PROVIDER_MODELS: list[str] = [m.strip() for m in PROVIDER_MODELS_RAW.split(",") if m.strip()]
PROVIDER_PRICE_PER_TOKEN = int(os.environ.get("PROVIDER_PRICE_PER_TOKEN", "1000000000"))
PROVIDER_CPU_COUNT = os.environ.get("PROVIDER_CPU_COUNT", "8")
PROVIDER_MEMORY_GB = os.environ.get("PROVIDER_MEMORY_GB", "64")
PROVIDER_GPU_COUNT = os.environ.get("PROVIDER_GPU_COUNT", "1")
PROVIDER_GPU_TYPE  = os.environ.get("PROVIDER_GPU_TYPE", "")
PROVIDER_STORAGE_GB = os.environ.get("PROVIDER_STORAGE_GB", "200")
RPC_URL = os.environ.get("RPC_URL", "https://evmrpc-testnet.0g.ai")

# In-memory registration state (refreshed after successful registration).
_registration_cache: dict | None = None


def _derive_address_from_key(private_key: str) -> str:
    """Derive the Ethereum address from a private key via eth_account (best-effort)."""
    if not private_key:
        return "0x0000000000000000000000000000000000000000"
    try:
        from eth_account import Account
        return Account.from_key(private_key).address
    except Exception:
        return "0x" + "0" * 40


async def get_provider_info() -> ProviderInfo:
    global _registration_cache
    address = _derive_address_from_key(PROVIDER_PRIVATE_KEY)
    registered = bool(_registration_cache and _registration_cache.get("registered"))
    return ProviderInfo(
        address=address,
        endpoint=PROVIDER_ENDPOINT,
        registered=registered,
        models=PROVIDER_MODELS,
        price_per_token=PROVIDER_PRICE_PER_TOKEN,
    )


async def register_provider() -> dict:
    """
    Invoke register_provider.mjs to register this machine on the 0G network.
    Returns the script's JSON output (includes txHash and registered flag).
    """
    global _registration_cache

    if not PROVIDER_PRIVATE_KEY:
        raise ValueError("PROVIDER_PRIVATE_KEY (or PRIVATE_KEY) is not set")

    if not _REGISTER_SCRIPT.exists():
        raise FileNotFoundError(f"Registration script not found: {_REGISTER_SCRIPT}")

    env = {
        **os.environ,
        "PRIVATE_KEY": PROVIDER_PRIVATE_KEY,
        "RPC_URL": RPC_URL,
        "PROVIDER_ENDPOINT": PROVIDER_ENDPOINT,
        "PROVIDER_MODELS": ",".join(PROVIDER_MODELS),
        "PROVIDER_PRICE_PER_TOKEN": str(PROVIDER_PRICE_PER_TOKEN),
        "PROVIDER_CPU_COUNT": PROVIDER_CPU_COUNT,
        "PROVIDER_MEMORY_GB": PROVIDER_MEMORY_GB,
        "PROVIDER_GPU_COUNT": PROVIDER_GPU_COUNT,
        "PROVIDER_GPU_TYPE": PROVIDER_GPU_TYPE,
        "PROVIDER_STORAGE_GB": PROVIDER_STORAGE_GB,
    }

    log.info("Invoking provider registration script…")
    proc = await asyncio.create_subprocess_exec(
        "node",
        str(_REGISTER_SCRIPT),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120.0)
    except asyncio.TimeoutError:
        proc.kill()
        raise TimeoutError("Provider registration script timed out after 120s")

    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace").strip()
        log.error("Registration script failed (rc=%d): %s", proc.returncode, err_msg)
        raise RuntimeError(f"Registration failed (exit {proc.returncode}): {err_msg}")

    try:
        result = json.loads(stdout.decode())
    except json.JSONDecodeError:
        result = {"raw_output": stdout.decode(errors="replace").strip()}

    result["registered"] = True
    _registration_cache = result
    log.info("Provider registered: %s", result)
    return result
