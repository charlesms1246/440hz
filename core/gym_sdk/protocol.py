"""
440hz Gym Wire Protocol
=======================
HTTP protocol spoken between the 440hz training executor and a user-submitted Gym
container. Both sides import these schemas — the gym-sdk uses them to validate
incoming requests, the executor uses them to validate gym responses.

Wire format is JSON over HTTP. The Gym binds to 0.0.0.0:GYM_PORT (default 8080)
inside its container, and the executor reaches it via the docker network.

Endpoints:
    POST /reset          → ResetResponse
    POST /step           → StepResponse
    GET  /spec           → GymSpec       (static description, called once at startup)
    GET  /healthz        → "ok"
"""
from __future__ import annotations

from typing import Any, Literal, Optional, Union
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Static description of a Gym — fetched once by the executor at startup so it
# knows the action space, observation format, episode budget, etc.
# ---------------------------------------------------------------------------

class GymSpec(BaseModel):
    name: str
    version: str
    description: str

    # Action format the agent must produce.
    #   "text"       → free-form text completion
    #   "tool_call"  → structured tool call (OpenAI function-calling format)
    #   "code"       → code block in a specified language
    action_format: Literal["text", "tool_call", "code"] = "text"
    code_language: Optional[str] = None  # only set when action_format=="code"

    # Available tools when action_format=="tool_call". Same shape as OpenAI tools.
    tools: Optional[list[dict[str, Any]]] = None

    # Episode budget. The executor will truncate at max_steps even if the gym
    # never returns terminated=True.
    max_steps_per_episode: int = 20

    # Whether the gym emits a dense per-step reward or only sparse terminal reward.
    # When dense=False the supervisor LLM is the primary reward signal.
    dense_reward: bool = False

    # Optional: a system prompt the executor should prepend to the agent's context.
    system_prompt: Optional[str] = None


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

class ResetRequest(BaseModel):
    seed: Optional[int] = None
    # Free-form options the gym may interpret (difficulty level, scenario id, etc.)
    options: dict[str, Any] = Field(default_factory=dict)


class ResetResponse(BaseModel):
    session_id: str
    observation: str  # rendered as a chat message to the agent
    info: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Step
# ---------------------------------------------------------------------------

class StepRequest(BaseModel):
    session_id: str
    # The agent's action. Shape depends on GymSpec.action_format:
    #   text        → str
    #   tool_call   → {"name": str, "arguments": dict}
    #   code        → str  (raw code body)
    action: Union[str, dict[str, Any]]


class StepResponse(BaseModel):
    observation: str
    # Per-step reward from the gym itself. May be 0.0 if the gym is sparse.
    # The supervisor LLM provides additional dense reward on top of this.
    reward: float = 0.0
    terminated: bool = False  # task complete (success or definitive failure)
    truncated: bool = False   # step budget exceeded
    info: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Trajectory & training shapes — used by the trainer, not by the gym
# ---------------------------------------------------------------------------

class StepRecord(BaseModel):
    """One (state, action, next_state, reward) tuple inside a trajectory."""
    observation: str
    action: Union[str, dict[str, Any]]
    next_observation: str
    gym_reward: float
    supervisor_reward: Optional[float] = None  # filled in after RLAIF scoring
    info: dict[str, Any] = Field(default_factory=dict)


class Trajectory(BaseModel):
    session_id: str
    steps: list[StepRecord]
    terminated: bool
    truncated: bool
    # Total reward = sum(gym_reward) + sum(supervisor_reward).
    # Set by the trainer after the supervisor pass.
    total_reward: Optional[float] = None
