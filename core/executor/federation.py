"""
Flower client used by the executor to submit a locally-trained LoRA adapter
to the federation aggregator.

Workflow (one-shot mode):
    1. Local training has finished. Adapter sits at /var/440hz/adapter/final/.
    2. Orchestrator constructs a `FederatedSubmitter(adapter_dir, weight, addr)`.
    3. Submitter loads adapter_model.safetensors as bytes.
    4. Connects to the aggregator's gRPC endpoint as a Flower NumPyClient.
    5. fit() returns (parameters, num_examples, metrics) — the parameters
       carry the safetensors blob, num_examples is the FedAvg weight.
    6. Disconnects after the aggregator finishes its single round.

The client retries the connection — aggregators may not be ready when the
client first tries (clients usually finish at different times, and the
aggregator has a `min_clients` threshold).
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Optional

import flwr as fl
import numpy as np

log = logging.getLogger(__name__)


class _AdapterClient(fl.client.NumPyClient):
    """
    Single-shot Flower client. Loads the adapter once, returns it on `fit`,
    no-ops `evaluate`. We don't use Flower's parameter-update mechanism — the
    locally-trained adapter is the only thing we ship.
    """

    def __init__(self, adapter_blob: bytes, num_examples: int, round_id: str):
        self.adapter_blob = adapter_blob
        self.num_examples = num_examples
        self.round_id = round_id

    def get_parameters(self, config):
        return [np.frombuffer(self.adapter_blob, dtype=np.uint8)]

    def fit(self, parameters, config):
        # `parameters` here is whatever the server broadcast. In one-shot mode
        # the server sends an empty array — we ignore it and submit our adapter.
        log.info("Submitting adapter to aggregator (round=%s, weight=%d, bytes=%d)",
                 config.get("server_round"), self.num_examples, len(self.adapter_blob))
        return (
            [np.frombuffer(self.adapter_blob, dtype=np.uint8)],
            self.num_examples,
            {"round_id": self.round_id, "adapter_bytes": len(self.adapter_blob)},
        )

    def evaluate(self, parameters, config):
        # We don't run evaluation client-side in one-shot mode.
        return 0.0, 0, {}


def submit_adapter(
    adapter_dir: str,
    aggregator_address: str,
    round_id: str,
    num_examples: int,
    connect_timeout_s: int = 600,
    retry_interval_s: int = 5,
) -> None:
    """
    Connect to the aggregator and submit the adapter at `adapter_dir`. Blocks
    until the aggregator closes the connection (which happens after it has
    received `min_clients` adapters and aggregated them).
    """
    safetensors_path = Path(adapter_dir) / "adapter_model.safetensors"
    if not safetensors_path.exists():
        raise FileNotFoundError(
            f"adapter_model.safetensors not found at {adapter_dir} — "
            "did training complete and save successfully?"
        )

    blob = safetensors_path.read_bytes()
    log.info("Loaded adapter from %s (%d bytes)", safetensors_path, len(blob))

    client = _AdapterClient(blob, num_examples, round_id)

    deadline = time.monotonic() + connect_timeout_s
    last_err: Optional[Exception] = None
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        try:
            log.info("Connecting to aggregator at %s (attempt %d)…",
                     aggregator_address, attempt)
            fl.client.start_numpy_client(
                server_address=aggregator_address,
                client=client,
                grpc_max_message_length=int(2 * 1024**3),  # match server cap
            )
            log.info("Aggregator confirmed receipt; client done.")
            return
        except Exception as e:
            last_err = e
            log.warning("Connection attempt %d failed: %s. Retrying in %ds…",
                        attempt, e, retry_interval_s)
            time.sleep(retry_interval_s)

    raise RuntimeError(
        f"Could not reach aggregator at {aggregator_address} within "
        f"{connect_timeout_s}s (last error: {last_err!r})"
    )
