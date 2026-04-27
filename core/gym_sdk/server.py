"""
HTTP server that wraps any `Gym` subclass and exposes the 440hz wire protocol.
Gym authors call `serve(MyGym())` from their module's __main__.
"""
from __future__ import annotations

import os
import uuid
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException

from .base import Gym
from .protocol import (
    GymSpec,
    ResetRequest,
    ResetResponse,
    StepRequest,
    StepResponse,
)


def build_app(gym: Gym) -> FastAPI:
    """Wrap a Gym instance into a FastAPI app speaking the 440hz protocol."""
    app = FastAPI(title="440hz Gym", version=gym.spec().version)
    spec_cache = gym.spec()

    # Sessions are kept in-memory per-process. Each /reset starts a fresh episode
    # and replaces the active session — gyms run one-episode-at-a-time, in line
    # with the executor's serial rollout loop.
    state = {"session_id": None}

    @app.get("/healthz")
    def healthz() -> str:
        return "ok"

    @app.get("/spec", response_model=GymSpec)
    def get_spec() -> GymSpec:
        return spec_cache

    @app.post("/reset", response_model=ResetResponse)
    def reset(req: ResetRequest) -> ResetResponse:
        observation, info = gym.reset(seed=req.seed, options=req.options)
        sid = uuid.uuid4().hex
        state["session_id"] = sid
        return ResetResponse(session_id=sid, observation=observation, info=info)

    @app.post("/step", response_model=StepResponse)
    def step(req: StepRequest) -> StepResponse:
        if state["session_id"] != req.session_id:
            raise HTTPException(
                status_code=409,
                detail=f"session_id mismatch (active={state['session_id']!r})",
            )
        obs, reward, terminated, truncated, info = gym.step(req.action)
        return StepResponse(
            observation=obs,
            reward=reward,
            terminated=terminated,
            truncated=truncated,
            info=info,
        )

    @app.on_event("shutdown")
    def _shutdown() -> None:
        try:
            gym.close()
        except Exception:
            pass

    return app


def serve(gym: Gym, host: str = "0.0.0.0", port: Optional[int] = None) -> None:
    """Run the gym as an HTTP service. Reads $GYM_PORT, defaults to 8080."""
    if port is None:
        port = int(os.environ.get("GYM_PORT", "8080"))
    app = build_app(gym)
    uvicorn.run(app, host=host, port=port, log_level="info")
