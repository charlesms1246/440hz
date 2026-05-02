"""
On-chain settlement oracle — calls TrainingEscrow.completeJob() after training finishes.

The provider wallet must be registered as the oracle on the TrainingEscrow contract:
  TrainingEscrow.setOracle(providerWalletAddress)  — one-time admin action by contract owner.

jobId is computed identically to the web UI: keccak256(toUtf8Bytes(task_id))
"""
from __future__ import annotations

import asyncio
import logging
import os

log = logging.getLogger("440hz.api.settlement")

PRIVATE_KEY = os.environ.get("PRIVATE_KEY", "")
RPC_URL = os.environ.get("RPC_URL", "https://evmrpc-testnet.0g.ai")
ESCROW_ADDRESS = "0x558298297E714312D5670dBe4dbc15E1D240a811"

_ESCROW_ABI = [
    {
        "name": "completeJob",
        "type": "function",
        "inputs": [{"name": "jobId", "type": "bytes32"}],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
]


async def settle_job(task_id: str) -> str | None:
    """
    Call TrainingEscrow.completeJob(keccak256(task_id)) signed by the provider wallet.
    Returns the tx hash on success, None if wallet is not configured or the call fails.
    """
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
        log.info("Settlement tx submitted for task %s: %s", task_id, hex_hash)
        return hex_hash

    except Exception as exc:
        log.warning(
            "Settlement failed for task %s (provider wallet may not be oracle): %s",
            task_id, exc,
        )
        return None
