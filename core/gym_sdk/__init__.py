"""
440hz Gym SDK — public API for domain experts building training environments.

Usage:
    from gym_sdk import Gym, GymSpec, serve

    class MyGym(Gym):
        def spec(self): ...
        def reset(self, seed=None, options=None): ...
        def step(self, action): ...

    if __name__ == "__main__":
        serve(MyGym())
"""
from .base import Gym
from .protocol import (
    GymSpec,
    ResetRequest,
    ResetResponse,
    StepRequest,
    StepResponse,
    StepRecord,
    Trajectory,
)
from .server import build_app, serve

__all__ = [
    "Gym",
    "GymSpec",
    "ResetRequest",
    "ResetResponse",
    "StepRequest",
    "StepResponse",
    "StepRecord",
    "Trajectory",
    "build_app",
    "serve",
]
