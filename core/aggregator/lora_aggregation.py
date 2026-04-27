"""
LoRA-aware FedAvg strategy.

The standard `flwr.server.strategy.FedAvg` aggregates flat NumPy NDArrays in a
fixed order. That works for fully-supervised classifiers where every client
returns parameters in the same Module-walk order, but it breaks for LoRA
adapters whenever there's any drift in `peft`'s parameter naming (different
peft versions, different `target_modules` order, modules_to_save additions).

Instead, we serialize each client's adapter as a `safetensors` file (the peft
canonical format) and aggregate at the **named-tensor level**. Keys are stable
strings of the form `base_model.model.{...}.lora_A.weight`, so order doesn't
matter — we average per-key.

Wire format between client and aggregator:
    parameters = [bytes(adapter_model.safetensors)]
That is, one Flower NDArray (a uint8 byte string) carrying the entire
serialized adapter. We unpack on the server, aggregate, repack for broadcast
(though in one-shot mode we never broadcast — the server just writes the
final aggregate to disk).
"""
from __future__ import annotations

import io
import logging
from collections import defaultdict
from pathlib import Path
from typing import Optional

import flwr as fl
import numpy as np
import torch
from flwr.common import (
    EvaluateIns,
    EvaluateRes,
    FitIns,
    FitRes,
    Parameters,
    Scalar,
    ndarrays_to_parameters,
    parameters_to_ndarrays,
)
from flwr.server.client_manager import ClientManager
from flwr.server.client_proxy import ClientProxy
from safetensors.torch import load as st_load
from safetensors.torch import save as st_save

log = logging.getLogger(__name__)


def _bytes_to_state_dict(blob: bytes) -> dict[str, torch.Tensor]:
    """Deserialize a safetensors blob into a name → tensor dict."""
    return st_load(blob)


def _state_dict_to_bytes(sd: dict[str, torch.Tensor]) -> bytes:
    return st_save(sd)


class LoRAFedAvg(fl.server.strategy.Strategy):
    """
    Custom Flower strategy that aggregates LoRA adapters at the safetensors level.

    Workflow (one-shot mode):
      1. Server starts, listens for `min_clients` clients.
      2. Each connected client returns its locally-trained adapter via
         `client.fit(parameters=initial, config={...})`. We pass empty initial
         parameters and ask clients to ignore them — they have already trained.
      3. Strategy.aggregate_fit() collects safetensors blobs from every client,
         keyed by client_id. Each blob carries weighted-mean instructions in
         its FitRes.num_examples field.
      4. We compute a weighted per-key tensor average across all clients.
      5. The aggregated adapter is written to `output_dir`.
      6. After one round, the server stops.
    """

    def __init__(
        self,
        min_clients: int,
        output_dir: str,
        # Optional: a "seed" adapter to initialize with. Pass None for one-shot mode.
        initial_adapter_path: Optional[str] = None,
    ):
        super().__init__()
        self.min_clients = min_clients
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.initial_adapter_path = initial_adapter_path

        # Captured from the first client to send us a non-empty FitRes — used
        # for keying the safetensors output and inferring tensor dtypes.
        self._reference_state_dict: Optional[dict[str, torch.Tensor]] = None
        self._aggregation_done = False

    # ------------------------------------------------------------------
    # Strategy interface
    # ------------------------------------------------------------------

    def initialize_parameters(
        self, client_manager: ClientManager
    ) -> Optional[Parameters]:
        """Initial parameters broadcast to clients. In one-shot mode this is empty."""
        if self.initial_adapter_path is not None:
            blob = (Path(self.initial_adapter_path) / "adapter_model.safetensors").read_bytes()
            return ndarrays_to_parameters([np.frombuffer(blob, dtype=np.uint8)])
        return ndarrays_to_parameters([np.array([], dtype=np.uint8)])

    def configure_fit(
        self,
        server_round: int,
        parameters: Parameters,
        client_manager: ClientManager,
    ) -> list[tuple[ClientProxy, FitIns]]:
        """
        Tell every connected client to send us their (already-trained) adapter.
        We block until at least `min_clients` are available.
        """
        clients = client_manager.sample(
            num_clients=self.min_clients,
            min_num_clients=self.min_clients,
        )
        config: dict[str, Scalar] = {"server_round": server_round, "mode": "one_shot"}
        fit_ins = FitIns(parameters, config)
        return [(c, fit_ins) for c in clients]

    def aggregate_fit(
        self,
        server_round: int,
        results: list[tuple[ClientProxy, FitRes]],
        failures: list,
    ) -> tuple[Optional[Parameters], dict[str, Scalar]]:
        """The actual LoRA aggregation."""
        if not results:
            return None, {"error": "no_results"}

        # Decode each client's adapter blob into a state dict and capture weights.
        per_client: list[tuple[dict[str, torch.Tensor], int]] = []
        for client, fit_res in results:
            ndarrays = parameters_to_ndarrays(fit_res.parameters)
            if not ndarrays or ndarrays[0].size == 0:
                log.warning("Client %s returned empty parameters; skipping",
                            client.cid[:8])
                continue
            blob = ndarrays[0].tobytes()
            sd = _bytes_to_state_dict(blob)
            per_client.append((sd, fit_res.num_examples))
            log.info("Got adapter from client %s: %d tensors, weight=%d",
                     client.cid[:8], len(sd), fit_res.num_examples)

        if not per_client:
            return None, {"error": "all_clients_empty"}

        # Capture reference shapes/dtypes from the first client.
        self._reference_state_dict = {k: v.clone() for k, v in per_client[0][0].items()}

        # Verify all clients agree on the parameter set. If not, we either need
        # padding or we abort — in production this is a hard-fail because
        # mismatched LoRA configs mean the aggregation is meaningless.
        ref_keys = set(self._reference_state_dict.keys())
        for sd, _ in per_client[1:]:
            client_keys = set(sd.keys())
            if client_keys != ref_keys:
                missing = ref_keys - client_keys
                extra = client_keys - ref_keys
                log.error("Adapter key mismatch. missing=%s, extra=%s",
                          list(missing)[:5], list(extra)[:5])
                return None, {
                    "error": "key_mismatch",
                    "missing_count": len(missing),
                    "extra_count": len(extra),
                }

        # Weighted per-tensor average.
        total_weight = sum(w for _, w in per_client)
        aggregated: dict[str, torch.Tensor] = {}
        for key in ref_keys:
            tensors = [sd[key].to(torch.float32) * w for sd, w in per_client]
            aggregated[key] = (torch.stack(tensors).sum(dim=0) / total_weight).to(
                self._reference_state_dict[key].dtype
            )

        log.info("Aggregated %d tensors across %d clients (total_weight=%d)",
                 len(aggregated), len(per_client), total_weight)

        # Persist the aggregated adapter to disk. The aggregator main loop picks
        # this up after `start_server` returns and uploads to 0G Storage.
        out_safetensors = self.output_dir / "adapter_model.safetensors"
        out_safetensors.write_bytes(_state_dict_to_bytes(aggregated))
        log.info("Wrote aggregated adapter to %s", out_safetensors)

        self._aggregation_done = True

        # Return the aggregated parameters so Flower's history tracks them.
        out_blob = _state_dict_to_bytes(aggregated)
        return (
            ndarrays_to_parameters([np.frombuffer(out_blob, dtype=np.uint8)]),
            {"num_clients": len(per_client), "total_weight": total_weight},
        )

    # ------------------------------------------------------------------
    # Evaluation — not used in one-shot mode, return no-ops
    # ------------------------------------------------------------------

    def configure_evaluate(
        self, server_round, parameters, client_manager
    ) -> list[tuple[ClientProxy, EvaluateIns]]:
        return []

    def aggregate_evaluate(
        self, server_round, results, failures
    ) -> tuple[Optional[float], dict[str, Scalar]]:
        return None, {}

    def evaluate(
        self, server_round, parameters
    ) -> Optional[tuple[float, dict[str, Scalar]]]:
        return None
