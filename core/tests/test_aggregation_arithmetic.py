"""
Numerical equivalence test for the LoRA aggregation logic — torch-free.

The core arithmetic in lora_aggregation.LoRAFedAvg.aggregate_fit() is just
weighted per-key tensor averaging. We can verify the math holds with pure
NumPy without instantiating Flower or torch.

This serves as documentation of the expected behaviour, runnable in any
minimal Python environment.
"""
from __future__ import annotations

import numpy as np


def weighted_average(state_dicts: list[dict[str, np.ndarray]],
                     weights: list[int]) -> dict[str, np.ndarray]:
    """
    The arithmetic the strategy performs, ported to NumPy.
    Mirrors aggregator/lora_aggregation.py::LoRAFedAvg.aggregate_fit lines
    that compute the weighted per-key average.
    """
    total = sum(weights)
    keys = set(state_dicts[0].keys())
    for sd in state_dicts[1:]:
        if set(sd.keys()) != keys:
            raise ValueError("key mismatch")

    result = {}
    for key in keys:
        # Stack and weighted-sum, divide by total weight.
        stacked = np.stack([sd[key].astype(np.float32) * w
                            for sd, w in zip(state_dicts, weights)])
        result[key] = (stacked.sum(axis=0) / total).astype(state_dicts[0][key].dtype)
    return result


def test_three_clients_equal_weight():
    rng = np.random.default_rng(seed=42)
    sd1 = {"lora_A": rng.standard_normal((16, 768)).astype(np.float32),
           "lora_B": rng.standard_normal((768, 16)).astype(np.float32)}
    sd2 = {"lora_A": rng.standard_normal((16, 768)).astype(np.float32),
           "lora_B": rng.standard_normal((768, 16)).astype(np.float32)}
    sd3 = {"lora_A": rng.standard_normal((16, 768)).astype(np.float32),
           "lora_B": rng.standard_normal((768, 16)).astype(np.float32)}

    aggregated = weighted_average([sd1, sd2, sd3], [1000, 1000, 1000])

    # Match the impl's order of operations: weight first, sum, divide.
    expected_A = (sd1["lora_A"]*1000 + sd2["lora_A"]*1000 + sd3["lora_A"]*1000) / 3000
    expected_B = (sd1["lora_B"]*1000 + sd2["lora_B"]*1000 + sd3["lora_B"]*1000) / 3000
    np.testing.assert_allclose(aggregated["lora_A"], expected_A, rtol=1e-5)
    np.testing.assert_allclose(aggregated["lora_B"], expected_B, rtol=1e-5)
    print("  ✓ three clients equal weight")


def test_unequal_weight():
    rng = np.random.default_rng(seed=99)
    sdA = {"w": rng.standard_normal((10, 10)).astype(np.float32)}
    sdB = {"w": rng.standard_normal((10, 10)).astype(np.float32)}

    # 4× weight on A, 1× on B → result should be much closer to A.
    aggregated = weighted_average([sdA, sdB], [4000, 1000])

    expected = (sdA["w"] * 4000 + sdB["w"] * 1000) / 5000
    np.testing.assert_allclose(aggregated["w"], expected, rtol=1e-5)

    # Sanity: aggregated should be distinguishably closer to A than to B.
    dist_A = np.linalg.norm(aggregated["w"] - sdA["w"])
    dist_B = np.linalg.norm(aggregated["w"] - sdB["w"])
    assert dist_A < dist_B, f"weighted aggregation should land closer to higher-weight client (got dist_A={dist_A:.3f}, dist_B={dist_B:.3f})"
    print(f"  ✓ unequal weight (A:B = 4:1, dist_A={dist_A:.3f} < dist_B={dist_B:.3f})")


def test_single_client_passthrough():
    """One client → result should equal the input verbatim."""
    rng = np.random.default_rng(seed=7)
    sd = {"w": rng.standard_normal((5, 5)).astype(np.float32)}
    aggregated = weighted_average([sd], [42])
    np.testing.assert_allclose(aggregated["w"], sd["w"])
    print("  ✓ single-client passthrough is identity")


def test_key_mismatch_raises():
    sd1 = {"a": np.zeros(3, dtype=np.float32), "b": np.zeros(3, dtype=np.float32)}
    sd2 = {"a": np.zeros(3, dtype=np.float32)}  # missing "b"
    try:
        weighted_average([sd1, sd2], [1, 1])
        raise AssertionError("expected ValueError for key mismatch")
    except ValueError as e:
        assert "mismatch" in str(e).lower()
    print("  ✓ key mismatch raises")


if __name__ == "__main__":
    print("LoRA aggregation arithmetic (NumPy reference)")
    test_three_clients_equal_weight()
    test_unequal_weight()
    test_single_client_passthrough()
    test_key_mismatch_raises()
    print("All tests passed.")
