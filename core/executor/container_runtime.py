"""
Container runtime — manages the inner Gym container's lifecycle.

We support two backends:
  - "docker" — talks to dockerd. Inside a 0G CVM this means DinD (the executor
               runs its own dockerd in the entrypoint script). Outside, it can
               use the host docker socket.
  - "podman" — rootless, no daemon. Preferred for non-TEE edge deployments.

The runtime is selected by $RUNTIME (default "docker"). All commands shell out
to the appropriate CLI — both speak nearly identical surface syntax for the
operations we need (run, stop, rm, port mapping, resource limits).
"""
from __future__ import annotations

import logging
import os
import secrets
import subprocess
import time
from typing import Optional

log = logging.getLogger(__name__)

RUNTIME = os.environ.get("RUNTIME", "docker")  # "docker" or "podman"


class GymContainer:
    """One running Gym container instance. Use as a context manager."""

    def __init__(
        self,
        image: str,
        host_port: int,
        container_port: int = 8080,
        cpu_limit: float = 2.0,
        memory_limit: str = "4g",
        env: Optional[dict[str, str]] = None,
    ):
        self.image = image
        self.host_port = host_port
        self.container_port = container_port
        self.cpu_limit = cpu_limit
        self.memory_limit = memory_limit
        self.env = env or {}
        self.name = f"440hz-gym-{secrets.token_hex(4)}"
        self.container_id: Optional[str] = None

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.host_port}"

    def start(self) -> None:
        cmd = [
            RUNTIME, "run", "-d",
            "--name", self.name,
            "--rm",
            "-p", f"{self.host_port}:{self.container_port}",
            "--cpus", str(self.cpu_limit),
            "--memory", self.memory_limit,
            "-e", f"GYM_PORT={self.container_port}",
            # Network restriction: deny outbound traffic from inside the gym so
            # user code can't exfiltrate data. The trainer reaches the gym via
            # the published port from the host side.
            #
            # NOTE: docker --network=none disables ALL networking including the
            # published port, which we don't want. The proper fix is a custom
            # bridge with only the executor allowed in. Wire that up in the
            # entrypoint script — for the MVP we leave default networking and
            # rely on the CVM as the egress boundary.
        ]
        for k, v in self.env.items():
            cmd.extend(["-e", f"{k}={v}"])
        cmd.append(self.image)

        log.info("Starting gym container: %s", " ".join(cmd))
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        self.container_id = res.stdout.strip()
        log.info("Gym container started: %s (name=%s)", self.container_id[:12], self.name)

    def stop(self) -> None:
        if self.container_id is None:
            return
        log.info("Stopping gym container: %s", self.name)
        subprocess.run(
            [RUNTIME, "stop", "-t", "5", self.name],
            capture_output=True, text=True,
        )
        # `--rm` on `run` means the container auto-removes after stop.
        self.container_id = None

    def logs(self, tail: int = 200) -> str:
        if self.container_id is None:
            return ""
        res = subprocess.run(
            [RUNTIME, "logs", "--tail", str(tail), self.name],
            capture_output=True, text=True,
        )
        return (res.stdout or "") + (res.stderr or "")

    def __enter__(self) -> "GymContainer":
        self.start()
        return self

    def __exit__(self, *_exc) -> None:
        try:
            self.stop()
        except Exception as e:
            log.warning("Error stopping gym container: %s", e)
