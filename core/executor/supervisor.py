"""
Supervisor — the RLAIF reward signal.

The supervisor is a (typically smaller, frontier) LLM that scores the agent's
actions inside the Gym. Three backends are supported:

  - "0g_inference"      → 0G Compute provider via the broker SDK (TEE-attested).
  - "openai_compatible" → any HTTPS endpoint speaking OpenAI's chat-completions API.
  - "none"              → disabled; reward comes only from the gym itself.

The supervisor returns a score in [0, 1]. We coerce noisy LLM output into a float
defensively — the model occasionally wraps JSON in prose despite the instruction.

Two scoring modes:
  - "per_step"      → score every (obs, action, next_obs) triple. Dense reward.
  - "terminal_only" → score the entire trajectory once at the end. Sparse reward.

For GRPO with group_size > 1, the executor calls `score_group()` to score N
candidate completions for the same state in one batch — these get advantage-
normalized within the group.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional, Union

import httpx
from pydantic import BaseModel

from .task_config import SupervisorConfig

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Score envelope returned by the supervisor LLM
# ---------------------------------------------------------------------------

class SupervisorScore(BaseModel):
    score: float          # clamped to [0, 1]
    reason: str = ""      # one-sentence justification


# ---------------------------------------------------------------------------
# Backend interface
# ---------------------------------------------------------------------------

class _SupervisorBackend:
    def chat(self, messages: list[dict], temperature: float = 0.0) -> str:
        raise NotImplementedError


class _NullBackend(_SupervisorBackend):
    """No-op backend — used when supervisor.type == 'none'."""
    def chat(self, messages: list[dict], temperature: float = 0.0) -> str:
        return '{"score": 0.0, "reason": "supervisor disabled"}'


class _OpenAICompatibleBackend(_SupervisorBackend):
    """
    Speaks OpenAI's /v1/chat/completions. Works with:
      - vLLM / TGI / Ollama self-hosted endpoints
      - 0G inference endpoints once we've fetched (endpoint, headers) via the broker
        and use those values here
    """
    def __init__(self, base_url: str, model: str, api_key: Optional[str] = None,
                 extra_headers: Optional[dict] = None):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.extra_headers = extra_headers or {}
        self._client = httpx.Client(timeout=60.0)

    def chat(self, messages: list[dict], temperature: float = 0.0) -> str:
        headers = {"Content-Type": "application/json", **self.extra_headers}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        body = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 200,
        }
        r = self._client.post(f"{self.base_url}/chat/completions",
                              json=body, headers=headers)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]


class _ZGInferenceBackend(_SupervisorBackend):
    """
    0G Compute inference via the broker SDK.

    The 0G broker is a Node SDK. Rather than reimplement it in Python, the
    executor image bundles a tiny Node helper (`scripts/zg_broker.mjs`) that we
    call once at startup to fetch (endpoint, model, auth headers) for the
    configured provider. After that, requests are plain OpenAI-compatible
    calls — this backend is just an _OpenAICompatibleBackend with the broker-
    issued endpoint and headers.
    """
    def __init__(self, provider_address: str, model: str):
        endpoint, headers = self._fetch_provider_metadata(provider_address)
        self._inner = _OpenAICompatibleBackend(
            base_url=endpoint,
            model=model,
            api_key=None,
            extra_headers=headers,
        )

    def chat(self, messages: list[dict], temperature: float = 0.0) -> str:
        return self._inner.chat(messages, temperature=temperature)

    @staticmethod
    def _fetch_provider_metadata(provider_address: str) -> tuple[str, dict[str, str]]:
        """
        Calls the bundled Node helper and returns (endpoint, auth_headers).

        The helper script does:
            const broker = await createZGComputeNetworkBroker(wallet);
            const { endpoint, model } = await broker.inference.getServiceMetadata(provider);
            const headers = await broker.inference.getRequestHeaders(provider);
            console.log(JSON.stringify({ endpoint, headers }));
        """
        import subprocess
        result = subprocess.run(
            ["node", "/opt/440hz/scripts/zg_broker.mjs",
             "fetch-inference-meta", provider_address],
            capture_output=True, text=True, check=True,
        )
        payload = json.loads(result.stdout.strip())
        return payload["endpoint"], payload["headers"]


# ---------------------------------------------------------------------------
# Public Supervisor class
# ---------------------------------------------------------------------------

class Supervisor:
    def __init__(self, cfg: SupervisorConfig):
        self.cfg = cfg
        self.backend = self._build_backend(cfg)

    @staticmethod
    def _build_backend(cfg: SupervisorConfig) -> _SupervisorBackend:
        if cfg.type == "none":
            return _NullBackend()
        if cfg.type == "openai_compatible":
            assert cfg.base_url and cfg.model, \
                "openai_compatible supervisor requires base_url and model"
            return _OpenAICompatibleBackend(cfg.base_url, cfg.model, cfg.api_key)
        if cfg.type == "0g_inference":
            assert cfg.provider_address and cfg.model, \
                "0g_inference supervisor requires provider_address and model"
            return _ZGInferenceBackend(cfg.provider_address, cfg.model)
        raise ValueError(f"unknown supervisor type: {cfg.type}")

    # ------------------------------------------------------------------
    # Scoring API
    # ------------------------------------------------------------------

    def score_step(
        self,
        observation: str,
        action: Union[str, dict],
        next_observation: str,
    ) -> SupervisorScore:
        """Score a single (s, a, s') triple."""
        if self.cfg.type == "none":
            return SupervisorScore(score=0.0, reason="disabled")

        action_str = action if isinstance(action, str) else json.dumps(action)
        user = (
            f"Observation:\n{observation}\n\n"
            f"Agent action:\n{action_str}\n\n"
            f"Resulting observation:\n{next_observation}"
        )
        messages = [
            {"role": "system", "content": self.cfg.rubric},
            {"role": "user", "content": user},
        ]
        raw = self.backend.chat(messages, temperature=0.0)
        return self._parse_score(raw)

    def score_group(
        self,
        observation: str,
        candidates: list[Union[str, dict]],
    ) -> list[SupervisorScore]:
        """
        Score N candidate actions for the same state. Used by GRPO for group-
        relative advantage normalization.

        We score each candidate independently. A pairwise/listwise variant
        would be more sample-efficient but adds prompt-design complexity that
        is not worth the gain at small group sizes (<= 16).
        """
        return [self.score_step(observation, c, "<not yet observed>")
                for c in candidates]

    def score_trajectory(
        self,
        steps: list[tuple[str, Union[str, dict], str]],
    ) -> SupervisorScore:
        """Terminal-only mode: score an entire (s, a, s') sequence at once."""
        if self.cfg.type == "none":
            return SupervisorScore(score=0.0, reason="disabled")

        rendered = []
        for i, (obs, action, next_obs) in enumerate(steps):
            action_str = action if isinstance(action, str) else json.dumps(action)
            rendered.append(
                f"--- Step {i+1} ---\nObservation: {obs}\n"
                f"Action: {action_str}\nResult: {next_obs}"
            )
        user = "Full trajectory:\n\n" + "\n\n".join(rendered)
        messages = [
            {"role": "system", "content": self.cfg.rubric},
            {"role": "user", "content": user},
        ]
        return self._parse_score(self.backend.chat(messages, temperature=0.0))

    # ------------------------------------------------------------------
    # Defensive parsing — LLMs sometimes wrap JSON in prose despite instructions
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_score(raw: str) -> SupervisorScore:
        # First try clean JSON parse.
        try:
            data = json.loads(raw)
            return SupervisorScore(
                score=max(0.0, min(1.0, float(data.get("score", 0.0)))),
                reason=str(data.get("reason", "")),
            )
        except Exception:
            pass

        # Fall back to regex extraction of a {...} block.
        match = re.search(r"\{[^{}]*\"score\"[^{}]*\}", raw, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
                return SupervisorScore(
                    score=max(0.0, min(1.0, float(data.get("score", 0.0)))),
                    reason=str(data.get("reason", "")),
                )
            except Exception:
                pass

        # Last resort — look for a bare float in [0, 1].
        match = re.search(r"\b(0(?:\.\d+)?|1(?:\.0+)?)\b", raw)
        if match:
            return SupervisorScore(score=float(match.group(1)),
                                   reason="parsed from prose")

        log.warning("Could not parse supervisor output: %s", raw[:200])
        return SupervisorScore(score=0.0, reason="unparseable")
