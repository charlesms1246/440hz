"""
Client for talking to the inner Gym container over HTTP.

The orchestrator uses this to drive rollouts. It encapsulates session management,
retries on transient failures, and translates between the wire protocol and
in-process Python objects.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional, Union

import httpx

# Both modules live next to each other in the executor's Python path. The gym-sdk
# protocol module is mounted into the executor image at build time so the schemas
# stay byte-identical on both sides of the wire.
from gym_sdk.protocol import (
    GymSpec,
    ResetRequest,
    ResetResponse,
    StepRequest,
    StepResponse,
)


log = logging.getLogger(__name__)


class GymClient:
    """HTTP client for one Gym container instance."""

    def __init__(self, base_url: str, request_timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(base_url=self.base_url, timeout=request_timeout)
        self._session_id: Optional[str] = None
        self._spec: Optional[GymSpec] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def wait_until_healthy(self, timeout: float = 60.0, interval: float = 0.5) -> None:
        """Block until the gym responds 200 on /healthz, or raise after `timeout`."""
        deadline = time.monotonic() + timeout
        last_err: Optional[Exception] = None
        while time.monotonic() < deadline:
            try:
                r = self._client.get("/healthz")
                if r.status_code == 200:
                    log.info("Gym healthy at %s", self.base_url)
                    return
            except Exception as e:
                last_err = e
            time.sleep(interval)
        raise RuntimeError(
            f"Gym at {self.base_url} did not become healthy within {timeout}s "
            f"(last error: {last_err!r})"
        )

    def spec(self) -> GymSpec:
        """Return the gym's static spec, cached after first call."""
        if self._spec is None:
            r = self._client.get("/spec")
            r.raise_for_status()
            self._spec = GymSpec.model_validate(r.json())
        return self._spec

    def close(self) -> None:
        self._client.close()

    # ------------------------------------------------------------------
    # Episode loop
    # ------------------------------------------------------------------

    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[dict[str, Any]] = None,
    ) -> ResetResponse:
        req = ResetRequest(seed=seed, options=options or {})
        r = self._client.post("/reset", json=req.model_dump())
        r.raise_for_status()
        resp = ResetResponse.model_validate(r.json())
        self._session_id = resp.session_id
        return resp

    def step(self, action: Union[str, dict[str, Any]]) -> StepResponse:
        if self._session_id is None:
            raise RuntimeError("must call reset() before step()")
        req = StepRequest(session_id=self._session_id, action=action)
        r = self._client.post("/step", json=req.model_dump())
        r.raise_for_status()
        return StepResponse.model_validate(r.json())

    # Context-manager sugar for `with GymClient(...) as g:` usage.
    def __enter__(self) -> "GymClient":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()
