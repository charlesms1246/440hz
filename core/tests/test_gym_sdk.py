"""
Tests for the 440hz gym_sdk.

Covers:
- Protocol model construction and validation (GymSpec, requests, responses)
- HTTP server via FastAPI TestClient (healthz, spec, reset, step, session enforcement)
- Concrete gym implementations (EchoGym inline, SQLDebuggingGym from examples)
- Edge cases: wrong session_id → 409, multi-step episodes, close() on shutdown

Run:
    PYTHONPATH=. python -m pytest tests/test_gym_sdk.py -v
Or:
    PYTHONPATH=. python tests/test_gym_sdk.py
"""
from __future__ import annotations

import sys
import os
from pathlib import Path
from typing import Any, Optional, Union

import pytest

# Ensure both core/ and examples/sample-gym/ are importable.
_CORE = Path(__file__).parent.parent
sys.path.insert(0, str(_CORE))
sys.path.insert(0, str(_CORE / "examples" / "sample-gym"))

from gym_sdk import Gym, GymSpec, build_app, serve
from gym_sdk.protocol import (
    ResetRequest,
    ResetResponse,
    StepRequest,
    StepResponse,
    StepRecord,
    Trajectory,
)

try:
    from starlette.testclient import TestClient
except ImportError:
    from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Minimal concrete gyms for testing
# ---------------------------------------------------------------------------

class EchoGym(Gym):
    """Agent must echo back the observation exactly — reward=1.0 on match."""

    def spec(self) -> GymSpec:
        return GymSpec(
            name="echo",
            version="0.1.0",
            description="Echo gym for testing.",
            action_format="text",
            max_steps_per_episode=1,
            dense_reward=True,
        )

    def reset(self, seed=None, options=None):
        self.target = "hello"
        return f"Say: {self.target}", {"target": self.target}

    def step(self, action):
        reward = 1.0 if action.strip() == self.target else 0.0
        return ("done", reward, True, False, {"matched": reward == 1.0})


class CounterGym(Gym):
    """Multi-step gym — agent must respond 'step N' for N=1,2,3. Terminates at 3."""

    def spec(self) -> GymSpec:
        return GymSpec(
            name="counter",
            version="0.1.0",
            description="Multi-step counter gym.",
            action_format="text",
            max_steps_per_episode=3,
            dense_reward=True,
        )

    def reset(self, seed=None, options=None):
        self._n = 0
        return "step 1", {}

    def step(self, action):
        self._n += 1
        expected = f"step {self._n}"
        reward = 1.0 if action.strip() == expected else 0.0
        terminated = self._n >= 3
        next_obs = f"step {self._n + 1}" if not terminated else "done"
        return next_obs, reward, terminated, False, {"step": self._n}


class ClosingGym(Gym):
    """Gym that tracks whether close() was called."""

    def __init__(self):
        self.closed = False

    def spec(self) -> GymSpec:
        return GymSpec(name="closing", version="0.1.0", description="Tracks close().")

    def reset(self, seed=None, options=None):
        return "obs", {}

    def step(self, action):
        return "done", 0.0, True, False, {}

    def close(self):
        self.closed = True


# ---------------------------------------------------------------------------
# Protocol model tests
# ---------------------------------------------------------------------------

class TestGymSpec:
    def test_minimal_construction(self):
        spec = GymSpec(name="x", version="1.0", description="test")
        assert spec.action_format == "text"
        assert spec.max_steps_per_episode == 20
        assert spec.dense_reward is False
        assert spec.tools is None
        assert spec.system_prompt is None

    def test_code_action_format(self):
        spec = GymSpec(
            name="coder", version="0.1", description="code gym",
            action_format="code", code_language="python"
        )
        assert spec.action_format == "code"
        assert spec.code_language == "python"

    def test_tool_call_format_with_tools(self):
        tools = [{"type": "function", "function": {"name": "search", "parameters": {}}}]
        spec = GymSpec(
            name="agent", version="0.1", description="agent gym",
            action_format="tool_call", tools=tools
        )
        assert spec.action_format == "tool_call"
        assert len(spec.tools) == 1

    def test_invalid_action_format(self):
        with pytest.raises(Exception):
            GymSpec(name="x", version="1", description="d", action_format="invalid")

    def test_json_roundtrip(self):
        spec = GymSpec(name="echo", version="0.1.0", description="Echo", dense_reward=True)
        roundtripped = GymSpec.model_validate_json(spec.model_dump_json())
        assert roundtripped == spec


class TestRequestResponseModels:
    def test_reset_request_defaults(self):
        req = ResetRequest()
        assert req.seed is None
        assert req.options == {}

    def test_reset_request_with_values(self):
        req = ResetRequest(seed=42, options={"difficulty": "hard"})
        assert req.seed == 42
        assert req.options["difficulty"] == "hard"

    def test_reset_response(self):
        resp = ResetResponse(session_id="abc123", observation="obs text")
        assert resp.session_id == "abc123"
        assert resp.info == {}

    def test_step_request_text_action(self):
        req = StepRequest(session_id="abc", action="SELECT * FROM users;")
        assert req.action == "SELECT * FROM users;"

    def test_step_request_dict_action(self):
        req = StepRequest(session_id="abc", action={"name": "search", "arguments": {"q": "x"}})
        assert isinstance(req.action, dict)

    def test_step_response_defaults(self):
        resp = StepResponse(observation="obs")
        assert resp.reward == 0.0
        assert resp.terminated is False
        assert resp.truncated is False
        assert resp.info == {}


class TestTrajectoryModels:
    def test_step_record(self):
        rec = StepRecord(
            observation="obs1",
            action="act",
            next_observation="obs2",
            gym_reward=0.5,
        )
        assert rec.supervisor_reward is None
        assert rec.info == {}

    def test_trajectory(self):
        steps = [
            StepRecord(observation="o1", action="a", next_observation="o2", gym_reward=0.1),
            StepRecord(observation="o2", action="b", next_observation="done", gym_reward=1.0),
        ]
        traj = Trajectory(session_id="s1", steps=steps, terminated=True, truncated=False)
        assert len(traj.steps) == 2
        assert traj.total_reward is None

    def test_trajectory_with_total_reward(self):
        traj = Trajectory(
            session_id="s1", steps=[], terminated=True, truncated=False, total_reward=2.5
        )
        assert traj.total_reward == 2.5


# ---------------------------------------------------------------------------
# HTTP server tests (using FastAPI TestClient)
# ---------------------------------------------------------------------------

class TestHealthAndSpec:
    def setup_method(self):
        self.client = TestClient(build_app(EchoGym()))

    def test_healthz(self):
        r = self.client.get("/healthz")
        assert r.status_code == 200
        assert r.json() == "ok"

    def test_spec_returns_gymspec(self):
        r = self.client.get("/spec")
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "echo"
        assert data["version"] == "0.1.0"
        assert data["action_format"] == "text"
        assert data["max_steps_per_episode"] == 1
        assert data["dense_reward"] is True

    def test_spec_consistent_across_calls(self):
        r1 = self.client.get("/spec")
        r2 = self.client.get("/spec")
        assert r1.json() == r2.json()


class TestResetEndpoint:
    def setup_method(self):
        self.client = TestClient(build_app(EchoGym()))

    def test_reset_returns_session_id_and_observation(self):
        r = self.client.post("/reset", json={})
        assert r.status_code == 200
        data = r.json()
        assert "session_id" in data
        assert len(data["session_id"]) > 0
        assert data["observation"] == "Say: hello"

    def test_reset_with_seed(self):
        r = self.client.post("/reset", json={"seed": 42})
        assert r.status_code == 200

    def test_reset_returns_fresh_session_each_time(self):
        r1 = self.client.post("/reset", json={})
        r2 = self.client.post("/reset", json={})
        sid1 = r1.json()["session_id"]
        sid2 = r2.json()["session_id"]
        assert sid1 != sid2

    def test_reset_with_options(self):
        r = self.client.post("/reset", json={"options": {"difficulty": "easy"}})
        assert r.status_code == 200


class TestStepEndpoint:
    def setup_method(self):
        self.client = TestClient(build_app(EchoGym()))

    def _reset(self):
        r = self.client.post("/reset", json={})
        return r.json()["session_id"]

    def test_correct_action_gets_reward_1(self):
        sid = self._reset()
        r = self.client.post("/step", json={"session_id": sid, "action": "hello"})
        assert r.status_code == 200
        data = r.json()
        assert data["reward"] == 1.0
        assert data["terminated"] is True
        assert data["truncated"] is False

    def test_wrong_action_gets_reward_0(self):
        sid = self._reset()
        r = self.client.post("/step", json={"session_id": sid, "action": "wrong"})
        assert r.status_code == 200
        assert r.json()["reward"] == 0.0

    def test_wrong_session_id_returns_409(self):
        self._reset()
        r = self.client.post("/step", json={"session_id": "bad-id", "action": "hello"})
        assert r.status_code == 409

    def test_step_before_reset_returns_409(self):
        r = self.client.post("/step", json={"session_id": "no-session", "action": "x"})
        assert r.status_code == 409

    def test_step_with_stale_session_after_new_reset(self):
        old_sid = self._reset()
        self._reset()  # replaces active session
        r = self.client.post("/step", json={"session_id": old_sid, "action": "hello"})
        assert r.status_code == 409


class TestMultiStepEpisode:
    def setup_method(self):
        self.client = TestClient(build_app(CounterGym()))

    def test_full_episode_rewards(self):
        r = self.client.post("/reset", json={})
        sid = r.json()["session_id"]
        assert r.json()["observation"] == "step 1"

        rewards = []
        for n in range(1, 4):
            r = self.client.post("/step", json={"session_id": sid, "action": f"step {n}"})
            assert r.status_code == 200
            data = r.json()
            rewards.append(data["reward"])
            if n < 3:
                assert data["terminated"] is False
            else:
                assert data["terminated"] is True

        assert all(r == 1.0 for r in rewards)

    def test_wrong_action_mid_episode(self):
        r = self.client.post("/reset", json={})
        sid = r.json()["session_id"]
        r = self.client.post("/step", json={"session_id": sid, "action": "wrong"})
        assert r.json()["reward"] == 0.0

    def test_fresh_reset_after_episode(self):
        r = self.client.post("/reset", json={})
        sid1 = r.json()["session_id"]
        # Complete the episode
        for n in range(1, 4):
            self.client.post("/step", json={"session_id": sid1, "action": f"step {n}"})
        # Fresh reset should work fine
        r2 = self.client.post("/reset", json={})
        sid2 = r2.json()["session_id"]
        assert sid2 != sid1
        r3 = self.client.post("/step", json={"session_id": sid2, "action": "step 1"})
        assert r3.status_code == 200


class TestGymClose:
    def test_close_called_on_app_shutdown(self):
        gym = ClosingGym()
        app = build_app(gym)
        client = TestClient(app)
        assert gym.closed is False
        with client:
            client.get("/healthz")
        # Exiting the context manager triggers lifespan/shutdown
        assert gym.closed is True


# ---------------------------------------------------------------------------
# SQLDebuggingGym integration tests
# ---------------------------------------------------------------------------

class TestSQLDebuggingGym:
    def setup_method(self):
        from sql_gym import SQLDebuggingGym
        self.client = TestClient(build_app(SQLDebuggingGym()))

    def test_spec(self):
        r = self.client.get("/spec")
        data = r.json()
        assert data["name"] == "sql-debugging"
        assert data["action_format"] == "text"
        assert data["max_steps_per_episode"] == 1
        assert data["dense_reward"] is False
        assert data["system_prompt"] is not None

    def test_reset_produces_sql_observation(self):
        r = self.client.post("/reset", json={"seed": 0})
        assert r.status_code == 200
        data = r.json()
        assert "sql" in data["observation"].lower()
        assert "session_id" in data

    def test_valid_sql_fix_gets_positive_reward(self):
        r = self.client.post("/reset", json={"seed": 0})
        sid = r.json()["session_id"]
        # A syntactically complete SQL answer
        r = self.client.post("/step", json={
            "session_id": sid,
            "action": "SELECT user_id, COUNT(*) FROM orders WHERE created_at > '2024-01-01' GROUP BY user_id;"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["reward"] == 0.05
        assert data["terminated"] is True
        assert data["info"]["looks_like_sql"] is True

    def test_invalid_action_gets_zero_reward(self):
        r = self.client.post("/reset", json={"seed": 0})
        sid = r.json()["session_id"]
        r = self.client.post("/step", json={
            "session_id": sid,
            "action": "I don't know how to fix this."
        })
        assert r.json()["reward"] == 0.0
        assert r.json()["info"]["looks_like_sql"] is False

    def test_seeded_reset_is_deterministic(self):
        r1 = self.client.post("/reset", json={"seed": 7})
        r2 = self.client.post("/reset", json={"seed": 7})
        assert r1.json()["observation"] == r2.json()["observation"]

    def test_different_seeds_vary_scenario(self):
        observations = set()
        for seed in range(10):
            r = self.client.post("/reset", json={"seed": seed})
            observations.add(r.json()["observation"])
        assert len(observations) > 1  # not all seeds produce the same scenario


# ---------------------------------------------------------------------------
# Standalone runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import subprocess, sys
    result = subprocess.run(
        [sys.executable, "-m", "pytest", __file__, "-v"],
        cwd=str(_CORE),
        env={**os.environ, "PYTHONPATH": str(_CORE)},
    )
    sys.exit(result.returncode)
