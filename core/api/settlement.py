"""
On-chain settlement for 440hz training jobs.

Two paths:
  ZK path  — Groth16 proof via 0g-zk-settlement-server sidecar →
              ZKSettlementVerifier.settleWithProof() → TrainingEscrow.completeJob()
  Oracle   — provider wallet calls TrainingEscrow.completeJob() directly (fallback)

The ZK path is used when:
  - ZK_VERIFIER_ADDRESS env var is set
  - ZK_SERVER_URL is reachable (health-checked before each settlement)
  - The task record contains user_zk_signature + user_zk_pubkey (set at submission)

If any condition fails, settlement falls back to the oracle path with a warning log.

The oracle path continues to work as long as TrainingEscrow.oracle == provider wallet.
Only call TrainingEscrow.setOracle(zkVerifierAddress) once the ZK path is confirmed.

jobId is computed identically to the web UI: keccak256(toUtf8Bytes(task_id))
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

log = logging.getLogger("440hz.api.settlement")

PRIVATE_KEY = os.environ.get("PRIVATE_KEY", "")
RPC_URL = os.environ.get("RPC_URL", "https://evmrpc-testnet.0g.ai")
ESCROW_ADDRESS = "0x558298297E714312D5670dBe4dbc15E1D240a811"

# ZK settlement configuration
ZK_SERVER_URL = os.environ.get("ZK_SERVER_URL", "")
ZK_VERIFIER_ADDRESS = os.environ.get("ZK_VERIFIER_ADDRESS", "")
_PROVIDER_EDDSA_PRIVKEY: list = json.loads(os.environ.get("PROVIDER_EDDSA_PRIVKEY", "[]"))
_PROVIDER_EDDSA_PUBKEY: list = json.loads(os.environ.get("PROVIDER_EDDSA_PUBKEY", "[]"))

_ESCROW_ABI = [
    {
        "name": "completeJob",
        "type": "function",
        "inputs": [{"name": "jobId", "type": "bytes32"}],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
]

_ZK_VERIFIER_ABI = [
    {
        "name": "settleWithProof",
        "type": "function",
        "inputs": [
            {"name": "jobId", "type": "bytes32"},
            {"name": "in_proof", "type": "uint256[]"},
            {"name": "public_signals", "type": "uint256[]"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
]


def _build_zk_request(
    task_id: str,
    submitter_address: str,
    provider_address: str,
    escrow_amount_wei: int,
    model_ref: str,
    gym_hash: str,
    algorithm_name: str,
) -> dict:
    """Map 440hz job fields to the ZK server Request format."""
    from web3 import Web3
    BN254_FIELD = 2 ** 253
    nonce = int(Web3.keccak(text=task_id).hex(), 16) % BN254_FIELD
    req_fee = escrow_amount_wei
    res_fee = int(req_fee * 0.8)
    request_hash_input = f"{model_ref}:{gym_hash}:{algorithm_name}"
    request_hash = int(Web3.keccak(text=request_hash_input).hex(), 16) % BN254_FIELD
    return {
        "nonce": str(nonce),
        "reqFee": str(req_fee),
        "userAddress": submitter_address,
        "providerAddress": provider_address,
        "requestHash": request_hash,
        "resFee": str(res_fee),
    }


async def _settle_job_zk(task_id: str, task_record: dict) -> str | None:
    """
    ZK settlement path.
    Collects provider EdDSA signature, combines with user's stored signature,
    posts to /solidity-calldata-combined, and submits proof to ZKSettlementVerifier.
    """
    if not _PROVIDER_EDDSA_PRIVKEY or not _PROVIDER_EDDSA_PUBKEY:
        log.debug("ZK settlement skipped: PROVIDER_EDDSA_PRIVKEY/PUBKEY not set")
        return None

    metadata = task_record.get("metadata", {})
    user_zk_signature = metadata.get("user_zk_signature")
    user_zk_pubkey = metadata.get("user_zk_pubkey")
    if not user_zk_signature or not user_zk_pubkey:
        log.debug("ZK settlement skipped: no user_zk_signature in task record for %s", task_id)
        return None

    submitter = metadata.get("submitter_address", "0x0000000000000000000000000000000000000000")
    escrow_wei = int(metadata.get("escrow_amount_og", 0.0) * 1e18)

    base_model = task_record.get("base_model", {})
    gym = task_record.get("gym", {})
    algorithm = task_record.get("algorithm", {})

    # We need the provider's own address — derive from PRIVATE_KEY
    if not PRIVATE_KEY:
        return None
    try:
        from eth_account import Account
        key = PRIVATE_KEY if PRIVATE_KEY.startswith("0x") else "0x" + PRIVATE_KEY
        provider_address = Account.from_key(key).address
    except Exception as exc:
        log.warning("ZK settlement: could not derive provider address: %s", exc)
        return None

    zk_req = _build_zk_request(
        task_id=task_id,
        submitter_address=submitter,
        provider_address=provider_address,
        escrow_amount_wei=escrow_wei,
        model_ref=base_model.get("ref", ""),
        gym_hash=gym.get("root_hash", ""),
        algorithm_name=algorithm.get("name", "grpo"),
    )

    import aiohttp
    async with aiohttp.ClientSession() as session:
        # Provider signs the response (signResponse=True)
        sig_resp = await session.post(
            f"{ZK_SERVER_URL}/signature",
            json={
                "requests": [zk_req],
                "privKey": _PROVIDER_EDDSA_PRIVKEY,
                "signResponse": True,
            },
            timeout=aiohttp.ClientTimeout(total=30),
        )
        sig_resp.raise_for_status()
        provider_sigs = (await sig_resp.json())["signatures"]

        # Combine user + provider sigs to get Groth16 calldata
        calldata_resp = await session.post(
            f"{ZK_SERVER_URL}/solidity-calldata-combined",
            json={
                "requests": [zk_req],
                "l": 1,
                "reqPubkey": user_zk_pubkey,
                "reqSignatures": user_zk_signature,
                "resPubkey": _PROVIDER_EDDSA_PUBKEY,
                "resSignatures": provider_sigs,
            },
            timeout=aiohttp.ClientTimeout(total=60),
        )
        calldata_resp.raise_for_status()
        calldata = await calldata_resp.json()

    in_proof: list = calldata["proof"]
    public_signals: list = calldata["publicSignals"]

    from web3 import AsyncWeb3
    key = PRIVATE_KEY if PRIVATE_KEY.startswith("0x") else "0x" + PRIVATE_KEY
    from eth_account import Account
    account = Account.from_key(key)
    w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(RPC_URL))
    job_id = w3.keccak(text=task_id)

    contract = w3.eth.contract(
        address=AsyncWeb3.to_checksum_address(ZK_VERIFIER_ADDRESS),
        abi=_ZK_VERIFIER_ABI,
    )
    nonce = await w3.eth.get_transaction_count(account.address)
    tx = await contract.functions.settleWithProof(
        job_id, in_proof, public_signals
    ).build_transaction({
        "from": account.address,
        "nonce": nonce,
        "gas": 500_000,
    })
    signed = account.sign_transaction(tx)
    tx_hash = await w3.eth.send_raw_transaction(signed.raw_transaction)
    return tx_hash.hex()


async def _settle_job_oracle(task_id: str) -> str | None:
    """Oracle path: provider wallet calls TrainingEscrow.completeJob() directly."""
    if not PRIVATE_KEY:
        log.warning("PRIVATE_KEY not set — skipping on-chain settlement for task %s", task_id)
        return None

    try:
        from web3 import AsyncWeb3
        from eth_account import Account

        key = PRIVATE_KEY if PRIVATE_KEY.startswith("0x") else "0x" + PRIVATE_KEY
        account = Account.from_key(key)

        w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(RPC_URL))
        contract = w3.eth.contract(
            address=AsyncWeb3.to_checksum_address(ESCROW_ADDRESS),
            abi=_ESCROW_ABI,
        )

        job_id = w3.keccak(text=task_id)
        nonce = await w3.eth.get_transaction_count(account.address)
        tx = await contract.functions.completeJob(job_id).build_transaction({
            "from": account.address,
            "nonce": nonce,
            "gas": 200_000,
        })
        signed = account.sign_transaction(tx)
        tx_hash = await w3.eth.send_raw_transaction(signed.raw_transaction)
        hex_hash = tx_hash.hex()
        log.info("Oracle settlement tx submitted for task %s: %s", task_id, hex_hash)
        return hex_hash

    except Exception as exc:
        log.warning(
            "Oracle settlement failed for task %s (provider wallet may not be oracle): %s",
            task_id, exc,
        )
        return None


async def settle_job(task_id: str, task_record: dict | None = None) -> str | None:
    """
    Settle a completed training job on-chain.
    Tries the ZK path first if the sidecar is configured and the user sig is present.
    Falls back to the oracle path on any failure.
    """
    if ZK_VERIFIER_ADDRESS and ZK_SERVER_URL and task_record:
        try:
            import aiohttp
            async with aiohttp.ClientSession() as s:
                health = await s.get(
                    f"{ZK_SERVER_URL}/vkey",
                    timeout=aiohttp.ClientTimeout(total=2),
                )
                zk_alive = health.status == 200
        except Exception:
            zk_alive = False

        if zk_alive:
            try:
                tx = await _settle_job_zk(task_id, task_record)
                if tx:
                    log.info("ZK settlement tx submitted for task %s: %s", task_id, tx)
                    return tx
            except Exception as exc:
                log.warning(
                    "ZK settlement failed for task %s, falling back to oracle: %s",
                    task_id, exc,
                )

    return await _settle_job_oracle(task_id)
