"""
Base class for 440hz Gyms.

Domain experts subclass `Gym`, implement `reset()` and `step()`, and the
gym-sdk's `serve()` function turns it into a containerized HTTP service that
the 440hz executor can drive.

Minimal example:

    from gym_sdk import Gym, GymSpec, serve

    class EchoGym(Gym):
        def spec(self) -> GymSpec:
            return GymSpec(
                name="echo",
                version="0.1.0",
                description="Trivial gym — agent must echo the observation back.",
                action_format="text",
                max_steps_per_episode=1,
                dense_reward=True,
            )

        def reset(self, seed=None, options=None):
            self.target = "hello"
            return f"Say: {self.target}", {}

        def step(self, action):
            reward = 1.0 if action.strip() == self.target else 0.0
            return ("done", reward, True, False, {})

    if __name__ == "__main__":
        serve(EchoGym())
"""
from __future__ import annotations

import abc
from typing import Any, Optional, Union

from .protocol import GymSpec


class Gym(abc.ABC):
    """Abstract base class for a 440hz training environment."""

    @abc.abstractmethod
    def spec(self) -> GymSpec:
        """Return the static description of this gym."""

    @abc.abstractmethod
    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[dict[str, Any]] = None,
    ) -> tuple[str, dict[str, Any]]:
        """
        Start a new episode.

        Returns:
            (observation, info)
        """

    @abc.abstractmethod
    def step(
        self,
        action: Union[str, dict[str, Any]],
    ) -> tuple[str, float, bool, bool, dict[str, Any]]:
        """
        Apply the agent's action and advance one step.

        Returns:
            (observation, reward, terminated, truncated, info)

        - `reward` is the gym's own reward; the supervisor LLM provides additional
          dense reward on top of this and is the primary signal in most RLAIF setups.
          Return 0.0 if your gym is purely sparse / supervisor-driven.
        - `terminated` means the episode reached a definitive outcome (success or
          unrecoverable failure).
        - `truncated` means a soft time-limit was hit. The executor enforces
          `max_steps_per_episode` from the spec, so truncation is optional here.
        """

    def close(self) -> None:
        """Optional: clean up resources at shutdown. Override if needed."""
        return None
