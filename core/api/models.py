"""
API-level Pydantic schemas for the 440hz provider daemon.

These are the types the web UI posts to POST /tasks and what the API returns.
task_manager.py translates TaskSubmitRequest → the executor's task_config.TaskConfig.
"""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


# ── Base model ref ────────────────────────────────────────────────────────────

class BaseModelRef(BaseModel):
    source: Literal["huggingface", "0g_storage", "local"] = "huggingface"
    # HuggingFace repo ID, 0G root hash (0x...), or absolute local path.
    ref: str
    # Required when source="0g_storage". Verified after pull.
    root_hash: str | None = None
    quantization: Literal["nf4", "int8", "none"] = "nf4"
    dtype: Literal["bfloat16", "float16", "float32"] = "bfloat16"


# ── Gym (supplied as 0G Storage root hash) ────────────────────────────────────

class GymRef(BaseModel):
    # 0G Storage root hash of the gym bundle uploaded by the Gym Builder.
    root_hash: str
    port: int = 8080
    cpu_limit: float = 2.0
    memory_limit: str = "4g"
    # Extra env vars injected into the gym container at launch.
    env: dict[str, str] = Field(default_factory=dict)


# ── Overseer / supervisor model ───────────────────────────────────────────────

class OverseerRef(BaseModel):
    type: Literal["0g_inference", "openai_compatible", "none"] = "none"
    # 0G inference provider address (required when type="0g_inference").
    provider_address: str | None = None
    # Model name at the provider or OpenAI-compatible endpoint.
    model: str | None = None
    # For openai_compatible: the base URL (e.g. http://localhost:11434/v1).
    base_url: str | None = None
    api_key: str | None = None
    # Scoring rubric injected as the supervisor's system prompt.
    rubric: str | None = None
    scoring_mode: Literal["per_step", "terminal_only"] = "per_step"


# ── External connectors (datasets, tool APIs, extra links) ────────────────────

class ExternalConnector(BaseModel):
    type: Literal["0g_storage", "https", "ipfs", "s3"] = "https"
    # Human label shown in the UI (e.g. "training dataset", "tool API").
    label: str
    # URI: 0G root hash, URL, IPFS CID, or S3 URI.
    uri: str
    # If set, the URI is passed into the gym container via this env var name.
    mount_env: str | None = None


# ── Algorithm hyperparameters ─────────────────────────────────────────────────

class AlgorithmConfig(BaseModel):
    name: Literal["grpo", "ppo", "dpo"] = "grpo"
    num_episodes: int = 100
    learning_rate: float = 3e-4
    lora_rank: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    target_modules: list[str] = Field(
        default_factory=lambda: ["q_proj", "k_proj", "v_proj", "o_proj"]
    )
    max_new_tokens: int = 256
    temperature: float = 0.9
    top_p: float = 0.95
    kl_coef: float = 0.02
    batch_size: int = 4
    grad_accum_steps: int = 4
    # GRPO group size: number of completions sampled per state for advantage normalisation.
    group_size: int = 8
    save_every: int = 25


# ── Runtime budget & escrow ───────────────────────────────────────────────────

class RuntimeBudget(BaseModel):
    # Hard wall-clock limit. task_manager kills the executor at this deadline.
    max_runtime_seconds: int = 3600
    # Pre-calculated by the UI for display; not validated on the provider side.
    estimated_cost_og: float = 0.0
    # On-chain tx hash confirming payment is locked before the job starts.
    # The provider daemon should verify this before spawning the executor.
    escrow_tx_hash: str
    escrow_amount_og: float = 0.0
    # ZK settlement: user's EdDSA signature over the job request fields.
    # Populated by the web UI when the ZK sidecar is reachable at submission time.
    # If absent, settlement falls back to the oracle path.
    user_zk_signature: list | None = None
    user_zk_pubkey: list[str] | None = None


# ── Federation (optional) ─────────────────────────────────────────────────────

class FederationConfig(BaseModel):
    enabled: bool = False
    # host:port of the Flower aggregator gRPC server.
    aggregator_address: str | None = None
    round_id: str | None = None
    num_examples: int = 1000
    connect_timeout_s: int = 600


# ── Output ────────────────────────────────────────────────────────────────────

class OutputConfig(BaseModel):
    destination: Literal["0g_storage", "local"] = "0g_storage"
    # Hex-encoded secp256k1 pubkey. Adapter is encrypted to this before upload.
    encryption_pubkey: str | None = None
    local_path: str | None = None


# ── Top-level task submission ─────────────────────────────────────────────────

class TaskSubmitRequest(BaseModel):
    # Arena metadata (displayed in the arenas table).
    arena_name: str
    # Pre-assigned task ID from the web UI (must match the jobId used in depositJob()).
    # If omitted, the provider generates one — but then escrow jobId and settlement jobId diverge.
    task_id: str | None = None
    # Injected as SYSTEM_PROMPT env var into the gym container.
    base_system_prompt: str | None = None
    # Wallet address of the job requester (for receipt attribution).
    submitter_address: str

    # Core training components.
    base_model: BaseModelRef
    gym: GymRef
    overseer: OverseerRef = Field(default_factory=OverseerRef)
    algorithm: AlgorithmConfig = Field(default_factory=AlgorithmConfig)
    output: OutputConfig = Field(default_factory=OutputConfig)

    # Optional extensions.
    external_connectors: list[ExternalConnector] = Field(default_factory=list)
    federation: FederationConfig = Field(default_factory=FederationConfig)
    runtime: RuntimeBudget


# ── Task status (returned by GET /tasks and GET /tasks/{id}) ──────────────────

class TaskStatus(BaseModel):
    id: str
    arena_name: str
    submitter_address: str
    state: Literal["pending", "running", "completed", "failed", "cancelled"]
    created_at: float   # Unix timestamp
    updated_at: float
    elapsed_seconds: int | None = None
    # Full content of the executor's receipt.json once the job finishes.
    receipt: dict | None = None
    error: str | None = None
    # Set after POST /tasks/{id}/merge completes successfully.
    merged_model_ref: str | None = None


# ── System metrics ────────────────────────────────────────────────────────────

class SystemMetrics(BaseModel):
    gpu_pct: float = 0.0
    vram_used_mb: float = 0.0
    vram_total_mb: float = 0.0
    cpu_pct: float = 0.0
    mem_used_gb: float = 0.0
    mem_total_gb: float = 0.0


# ── SSE log event ─────────────────────────────────────────────────────────────

class LogEntry(BaseModel):
    ts: float
    # "log" | "episode" | "da_checkpoint" | "adapter_saved" | "status" | "complete" | "error"
    type: str
    payload: dict


# ── Provider info ─────────────────────────────────────────────────────────────

class ProviderInfo(BaseModel):
    address: str
    endpoint: str
    registered: bool = False
    models: list[str] = Field(default_factory=list)
    # Price in aOG (1e-18 OG) per token.
    price_per_token: int = 0


# ── 0G standard fine-tuning provider protocol ─────────────────────────────────
# These models match the TypeScript interface in @0glabs/0g-serving-broker v2.x
# provider/provider.ts — the SDK calls these routes on the registered endpoint.

class ZGTask(BaseModel):
    """Task as seen by the 0G SDK (camelCase to match TypeScript interface)."""
    id: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None
    userAddress: str
    preTrainedModelHash: str   # 0G Storage root hash of the base model
    datasetHash: str           # 0G Storage root hash of the gym/dataset bundle
    trainingParams: str        # JSON string of training hyperparameters
    fee: str                   # locked fee in aOG
    nonce: str
    signature: str             # user's request signature for verification
    # Populated by provider once training progresses
    progress: str | None = None   # Init|SettingUp|SetUp|Training|Trained|Delivering|Delivered|Finished|Failed
    deliverIndex: str | None = None  # 0G Storage root hash of the delivered model


class QuoteResponse(BaseModel):
    """Response to GET /v1/quote — used by consumer to verify TEE attestation."""
    quote: str           # TEE attestation bytes (hex); "0x" for non-TEE providers
    provider_signer: str  # Ethereum address of the provider's signing key
