"""
Schema for the `task.json` file the executor reads at startup.

This is the single source of modularity in 440hz: one executor image, but the
combination of (base_model × gym × supervisor × algorithm) is fully
data-driven by the task config.

The executor mounts /etc/440hz/task.json read-only. In production this file is
delivered by the 0G Compute Provider after the on-chain task is matched; in
local dev you write it by hand and pass it via volume mount.
"""
from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Base model
# ---------------------------------------------------------------------------

class BaseModelConfig(BaseModel):
    # `hf` pulls from HuggingFace; `0g_storage` pulls by root_hash from 0G Storage.
    source: Literal["hf", "0g_storage"]
    # HF repo id (e.g. "Qwen/Qwen2.5-7B-Instruct") or 0G human-readable name.
    ref: str
    # Required when source=="0g_storage". 0G Storage Merkle root.
    root_hash: Optional[str] = None
    # Quantization for QLoRA. "nf4" is the standard 4-bit choice.
    quantization: Literal["nf4", "fp4", "int8", "none"] = "nf4"
    # Forces a specific torch dtype for the unquantized layers.
    dtype: Literal["bfloat16", "float16", "float32"] = "bfloat16"


# ---------------------------------------------------------------------------
# Gym
# ---------------------------------------------------------------------------

class GymConfig(BaseModel):
    # Container image reference. `0g://<root_hash>` triggers a fetch from 0G Storage.
    # Anything else (`docker.io/...`, `localhost/...`) is passed straight to the runtime.
    image_ref: str
    # Required when image_ref starts with `0g://`. Verified after pull.
    root_hash: Optional[str] = None
    # Port the gym binds inside its container. Default 8080.
    port: int = 8080
    # Resource caps applied via the container runtime.
    cpu_limit: float = 2.0
    memory_limit: str = "4g"
    # Extra env vars piped into the gym container.
    env: dict[str, str] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Supervisor (RLAIF reward)
# ---------------------------------------------------------------------------

class SupervisorConfig(BaseModel):
    # `0g_inference` calls a 0G Compute inference endpoint via the broker SDK.
    # `openai_compatible` calls any OpenAI-compatible HTTP endpoint (self-hosted,
    # private cluster, etc.). `none` disables supervisor and uses only gym reward.
    type: Literal["0g_inference", "openai_compatible", "none"] = "0g_inference"

    # 0G provider address. Required when type=="0g_inference".
    provider_address: Optional[str] = None
    # Model name on the provider (e.g. "gpt-oss-120b", "qwen3-vl-30b-a3b-instruct").
    model: Optional[str] = None
    # For openai_compatible: the base URL.
    base_url: Optional[str] = None
    # For openai_compatible: API key. For 0g_inference, the broker SDK handles auth.
    api_key: Optional[str] = None

    # Rubric prompt — the system prompt the supervisor uses to score trajectories.
    # The supervisor sees (observation, action, next_observation) and the rubric.
    rubric: str = (
        "You are evaluating an AI agent's action inside a training environment. "
        "Score the action from 0.0 to 1.0 based on whether it makes meaningful "
        "progress toward the goal. Respond with ONLY a JSON object of the form "
        '{"score": <float>, "reason": "<one sentence>"}.'
    )

    # Whether to score per-step (dense supervisor reward) or only at episode end.
    scoring_mode: Literal["per_step", "terminal_only"] = "per_step"


# ---------------------------------------------------------------------------
# Algorithm
# ---------------------------------------------------------------------------

class AlgorithmConfig(BaseModel):
    name: Literal["grpo", "ppo", "dpo"] = "grpo"

    # Common
    num_episodes: int = 100
    learning_rate: float = 2e-5
    lora_rank: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    target_modules: list[str] = Field(
        default_factory=lambda: ["q_proj", "k_proj", "v_proj", "o_proj"]
    )
    max_new_tokens: int = 256
    temperature: float = 0.9
    top_p: float = 0.95
    kl_coef: float = 0.04
    # Training mini-batch size for the policy update step.
    batch_size: int = 4
    grad_accum_steps: int = 4

    # GRPO-specific: how many completions per state to sample for group-relative
    # advantage normalization. Larger = more stable, more compute.
    group_size: int = 8

    # PPO-specific
    ppo_epochs: int = 4
    cliprange: float = 0.2

    # Checkpoint frequency (every N episodes).
    save_every: int = 25


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

class OutputConfig(BaseModel):
    destination: Literal["0g_storage", "local"] = "0g_storage"
    # Hex-encoded ECIES public key the LoRA adapter should be encrypted to.
    # The user holds the matching private key and decrypts after settlement.
    encryption_pubkey: Optional[str] = None
    # When destination=="local", the path inside the executor where the adapter
    # is written. Useful for local dev.
    local_path: Optional[str] = "/var/440hz/output"


# ---------------------------------------------------------------------------
# Federation
# ---------------------------------------------------------------------------

class FederationConfig(BaseModel):
    """
    Federated aggregation settings. When `enabled=False` (the default), the
    executor uploads its locally-trained adapter directly per OutputConfig.
    When `enabled=True`, the executor instead connects to the aggregator as a
    Flower client after local training, and the aggregator handles the final
    upload.

    Mode A (one_shot) — current implementation:
        Each node trains locally to completion, then submits its adapter once.
        Aggregator does weighted FedAvg and uploads the global adapter.

    Mode B (multi_round) — schema reserved, not implemented in MVP.
    """
    enabled: bool = False
    mode: Literal["one_shot", "multi_round"] = "one_shot"

    # Aggregator gRPC endpoint, e.g. "aggregator.440hz.local:8080".
    # In production this is published on-chain when the round is opened.
    aggregator_address: Optional[str] = None

    # Round identifier — every client in the same round must use the same value.
    # Production: this is the on-chain round_id from the 0G task contract.
    round_id: Optional[str] = None

    # Weight this client's adapter in the FedAvg by its training data size.
    # Larger num_examples → more influence on the global adapter.
    num_examples: int = 1000

    # Connection retry. The aggregator may not be ready when the client first
    # tries to connect — clients usually finish training at different times.
    connect_timeout_s: int = 600
    connect_retry_interval_s: int = 5


# ---------------------------------------------------------------------------
# Top-level
# ---------------------------------------------------------------------------

class TaskConfig(BaseModel):
    task_id: str
    base_model: BaseModelConfig
    gym: GymConfig
    supervisor: SupervisorConfig = Field(default_factory=SupervisorConfig)
    algorithm: AlgorithmConfig = Field(default_factory=AlgorithmConfig)
    output: OutputConfig = Field(default_factory=OutputConfig)
    federation: FederationConfig = Field(default_factory=FederationConfig)

    # Free-form metadata passed through to logs and the final on-chain receipt.
    metadata: dict[str, Any] = Field(default_factory=dict)
