"""
Unit tests for the LoRA aggregation logic.

Pure-CPU, no Flower server needed — we exercise the aggregation arithmetic
directly by constructing fake state dicts, calling the strategy's aggregation
machinery, and verifying the math.

Run:
    PYTHONPATH=. python -m pytest tests/test_lora_aggregation.py -v

Or directly:
    PYTHONPATH=. python tests/test_lora_aggregation.py
"""
from __future__ import annotations

import io
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch
from safetensors.torch import load as st_load
from safetensors.torch import save as st_save


def _make_fake_lora_state_dict(
    seed: int, scale: float = 1.0, dtype: torch.dtype = torch.bfloat16
) -> dict[str, torch.Tensor]:
    """Construct a state dict that looks like a peft LoRA save."""
    g = torch.Generator().manual_seed(seed)
    sd = {}
    for layer in ["q_proj", "k_proj", "v_proj", "o_proj"]:
        sd[f"base_model.model.model.layers.0.self_attn.{layer}.lora_A.weight"] = (
            torch.randn(16, 768, generator=g, dtype=torch.float32) * scale
        ).to(dtype)
        sd[f"base_model.model.model.layers.0.self_attn.{layer}.lora_B.weight"] = (
            torch.randn(768, 16, generator=g, dtype=torch.float32) * scale
        ).to(dtype)
    return sd


def _client_blob(seed: int, scale: float = 1.0) -> bytes:
    return st_save(_make_fake_lora_state_dict(seed, scale))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_equal_weights_average_to_arithmetic_mean():
    """Three clients with equal weight → result = mean of inputs."""
    from flwr.common import FitRes, Parameters, Status, Code, ndarrays_to_parameters

    from aggregator.lora_aggregation import LoRAFedAvg

    sd1 = _make_fake_lora_state_dict(seed=1)
    sd2 = _make_fake_lora_state_dict(seed=2)
    sd3 = _make_fake_lora_state_dict(seed=3)

    blobs = [st_save(sd) for sd in (sd1, sd2, sd3)]

    # Build fake FitRes for each client.
    class _FakeProxy:
        def __init__(self, cid: str): self.cid = cid

    results = []
    for i, blob in enumerate(blobs):
        params = ndarrays_to_parameters([np.frombuffer(blob, dtype=np.uint8)])
        results.append((
            _FakeProxy(f"client-{i}"),
            FitRes(
                status=Status(code=Code.OK, message="ok"),
                parameters=params,
                num_examples=1000,
                metrics={},
            ),
        ))

    with tempfile.TemporaryDirectory() as td:
        strategy = LoRAFedAvg(min_clients=3, output_dir=td)
        agg_params, metrics = strategy.aggregate_fit(
            server_round=1, results=results, failures=[]
        )

        # Reload the aggregated adapter from disk and verify
        out = (Path(td) / "adapter_model.safetensors").read_bytes()
        agg_sd = st_load(out)

        for key in sd1.keys():
            expected = (sd1[key].float() + sd2[key].float() + sd3[key].float()) / 3.0
            torch.testing.assert_close(
                agg_sd[key].float(), expected.float(), rtol=1e-2, atol=1e-2,
                msg=f"mismatch on {key}",
            )

    assert metrics["num_clients"] == 3
    assert metrics["total_weight"] == 3000


def test_weighted_average_respects_num_examples():
    """Client with 4× more examples should dominate aggregation 4:1."""
    from flwr.common import FitRes, Status, Code, ndarrays_to_parameters
    from aggregator.lora_aggregation import LoRAFedAvg

    sd1 = _make_fake_lora_state_dict(seed=10, scale=1.0)
    sd2 = _make_fake_lora_state_dict(seed=20, scale=1.0)

    class _FakeProxy:
        def __init__(self, cid: str): self.cid = cid

    results = []
    for sd, weight in [(sd1, 4000), (sd2, 1000)]:
        params = ndarrays_to_parameters([
            np.frombuffer(st_save(sd), dtype=np.uint8)
        ])
        results.append((
            _FakeProxy(f"c{weight}"),
            FitRes(
                status=Status(code=Code.OK, message="ok"),
                parameters=params,
                num_examples=weight,
                metrics={},
            ),
        ))

    with tempfile.TemporaryDirectory() as td:
        strategy = LoRAFedAvg(min_clients=2, output_dir=td)
        strategy.aggregate_fit(server_round=1, results=results, failures=[])
        agg_sd = st_load((Path(td) / "adapter_model.safetensors").read_bytes())

        for key in sd1.keys():
            expected = (sd1[key].float() * 4000 + sd2[key].float() * 1000) / 5000.0
            torch.testing.assert_close(
                agg_sd[key].float(), expected.float(), rtol=1e-2, atol=1e-2,
                msg=f"mismatch on {key}",
            )


def test_key_mismatch_returns_error():
    """Clients with different LoRA configs (different keys) should be rejected."""
    from flwr.common import FitRes, Status, Code, ndarrays_to_parameters
    from aggregator.lora_aggregation import LoRAFedAvg

    sd1 = _make_fake_lora_state_dict(seed=1)
    # Drop one tensor from client 2 to simulate a mismatched LoRA config.
    sd2 = _make_fake_lora_state_dict(seed=2)
    bad_key = next(iter(sd2.keys()))
    sd2.pop(bad_key)

    class _FakeProxy:
        def __init__(self, cid): self.cid = cid

    results = []
    for sd, cid in [(sd1, "client-good"), (sd2, "client-mismatched")]:
        params = ndarrays_to_parameters([
            np.frombuffer(st_save(sd), dtype=np.uint8)
        ])
        results.append((
            _FakeProxy(cid),
            FitRes(
                status=Status(code=Code.OK, message="ok"),
                parameters=params,
                num_examples=1000,
                metrics={},
            ),
        ))

    with tempfile.TemporaryDirectory() as td:
        strategy = LoRAFedAvg(min_clients=2, output_dir=td)
        agg_params, metrics = strategy.aggregate_fit(
            server_round=1, results=results, failures=[]
        )
        assert agg_params is None
        assert metrics["error"] == "key_mismatch"


def test_dtype_preserved():
    """Aggregated tensors should match input dtype (bfloat16, fp16)."""
    from flwr.common import FitRes, Status, Code, ndarrays_to_parameters
    from aggregator.lora_aggregation import LoRAFedAvg

    for dtype in [torch.bfloat16, torch.float16, torch.float32]:
        sd1 = _make_fake_lora_state_dict(seed=1, dtype=dtype)
        sd2 = _make_fake_lora_state_dict(seed=2, dtype=dtype)

        class _FakeProxy:
            def __init__(self, cid): self.cid = cid

        results = []
        for sd, cid in [(sd1, "a"), (sd2, "b")]:
            params = ndarrays_to_parameters([
                np.frombuffer(st_save(sd), dtype=np.uint8)
            ])
            results.append((
                _FakeProxy(cid),
                FitRes(
                    status=Status(code=Code.OK, message="ok"),
                    parameters=params,
                    num_examples=500,
                    metrics={},
                ),
            ))

        with tempfile.TemporaryDirectory() as td:
            strategy = LoRAFedAvg(min_clients=2, output_dir=td)
            strategy.aggregate_fit(server_round=1, results=results, failures=[])
            agg_sd = st_load((Path(td) / "adapter_model.safetensors").read_bytes())

            for key, tensor in agg_sd.items():
                assert tensor.dtype == dtype, \
                    f"dtype drift on {key}: got {tensor.dtype}, want {dtype}"


# ---------------------------------------------------------------------------
# Standalone runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Running LoRA aggregation tests…")
    test_equal_weights_average_to_arithmetic_mean()
    print("  ✓ equal-weights arithmetic mean")
    test_weighted_average_respects_num_examples()
    print("  ✓ weighted average")
    test_key_mismatch_returns_error()
    print("  ✓ key-mismatch detection")
    test_dtype_preserved()
    print("  ✓ dtype preservation")
    print("All tests passed.")
