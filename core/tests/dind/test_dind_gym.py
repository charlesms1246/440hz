"""
Real DinD integration test for 440hz gym_sdk.

Runs inside a privileged container where entrypoint.sh has already started a
nested dockerd and loaded the gym image. Uses the real GymContainer +
GymClient — no mocks, no simulations.

Exit 0 on all pass, non-zero on any failure.
"""
from __future__ import annotations

import socket
import sys
import traceback
from contextlib import closing

sys.path.insert(0, "/opt/440hz")

from executor.container_runtime import GymContainer
from executor.gym_client import GymClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("", 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]


def ok(msg: str) -> None:
    print(f"  ✓ {msg}", flush=True)


def section(title: str) -> None:
    print(f"\n── {title} ──", flush=True)


# ---------------------------------------------------------------------------
# Tests — all run against a single GymContainer instance
# ---------------------------------------------------------------------------

def run_tests() -> None:
    port = free_port()

    section("Container lifecycle")
    container = GymContainer(
        image="440hz/sample-sql-gym:latest",
        host_port=port,
        cpu_limit=1.0,
        memory_limit="256m",
    )
    container.start()
    ok(f"GymContainer.start() — id={container.container_id[:12]}, port={port}")

    try:
        with GymClient(container.base_url, request_timeout=30.0) as client:

            # ------------------------------------------------------------------
            section("/healthz")
            client.wait_until_healthy(timeout=30.0)
            ok("healthz responded within 30s")

            # ------------------------------------------------------------------
            section("/spec")
            spec = client.spec()
            assert spec.name == "sql-debugging", f"unexpected name: {spec.name}"
            assert spec.version == "0.1.0", f"unexpected version: {spec.version}"
            assert spec.action_format == "text", f"unexpected format: {spec.action_format}"
            assert spec.max_steps_per_episode == 1
            assert spec.dense_reward is False
            assert spec.system_prompt is not None and len(spec.system_prompt) > 0
            ok(f"spec OK — name={spec.name} v{spec.version}")

            # Spec is stable across repeated calls (cached internally)
            spec2 = client.spec()
            assert spec == spec2
            ok("spec stable across repeated calls")

            # ------------------------------------------------------------------
            section("/reset")
            resp = client.reset(seed=0)
            assert resp.session_id and len(resp.session_id) > 0
            assert "sql" in resp.observation.lower(), \
                f"observation has no SQL content: {resp.observation[:100]}"
            ok(f"reset OK — session_id={resp.session_id[:8]}… obs_len={len(resp.observation)}")

            # Different seeds produce different observations
            obs_set = set()
            for seed in range(5):
                r = client.reset(seed=seed)
                obs_set.add(r.observation)
            assert len(obs_set) > 1, "all seeds produced identical observations"
            ok(f"seeded resets vary — {len(obs_set)} distinct observations across 5 seeds")

            # Repeated same seed is deterministic
            r_a = client.reset(seed=7)
            r_b = client.reset(seed=7)
            assert r_a.observation == r_b.observation
            ok("same seed → deterministic observation")

            # ------------------------------------------------------------------
            section("/step — valid SQL")
            client.reset(seed=0)
            step = client.step(
                "SELECT user_id, COUNT(*) FROM orders "
                "WHERE created_at > '2024-01-01' GROUP BY user_id;"
            )
            assert step.reward == 0.05, f"expected reward=0.05, got {step.reward}"
            assert step.terminated is True
            assert step.truncated is False
            assert step.info.get("looks_like_sql") is True
            ok(f"valid SQL → reward={step.reward}, terminated={step.terminated}")

            # ------------------------------------------------------------------
            section("/step — non-SQL prose")
            client.reset(seed=0)
            step = client.step("I don't know how to fix this query.")
            assert step.reward == 0.0, f"expected reward=0.0, got {step.reward}"
            assert step.info.get("looks_like_sql") is False
            ok(f"non-SQL prose → reward={step.reward}")

            # ------------------------------------------------------------------
            section("/step — all SQL keywords score positively")
            keywords = [
                ("SELECT", "SELECT id FROM t;"),
                ("INSERT", "INSERT INTO t VALUES (1);"),
                ("UPDATE", "UPDATE t SET x=1;"),
                ("DELETE", "DELETE FROM t WHERE id=1;"),
                ("WITH", "WITH cte AS (SELECT 1) SELECT * FROM cte;"),
                ("CREATE", "CREATE TABLE t (id INT);"),
            ]
            for keyword, sql in keywords:
                client.reset(seed=0)
                s = client.step(sql)
                assert s.reward == 0.05, \
                    f"keyword {keyword!r}: expected 0.05, got {s.reward}"
            ok(f"all {len(keywords)} SQL-keyword prefixes scored correctly")

            # ------------------------------------------------------------------
            section("Multi-reset session isolation")
            # Start episode A
            r1 = client.reset(seed=1)
            sid1 = r1.session_id
            # Start episode B (replaces A)
            r2 = client.reset(seed=2)
            sid2 = r2.session_id
            assert sid1 != sid2
            # Step with current session (B) — must work
            s = client.step("SELECT id FROM users;")
            assert s.reward == 0.05
            ok(f"fresh reset replaces session — sid1≠sid2 ✓, step on sid2 OK")

            # ------------------------------------------------------------------
            section("Container logs")
            logs = container.logs(tail=30)
            assert len(logs) > 0, "expected some container logs"
            ok(f"container.logs() returned {len(logs)} chars")

    finally:
        container.stop()
        ok("GymContainer.stop() — container cleaned up")
        # Verify container is gone from docker ps
        import subprocess
        result = subprocess.run(
            ["docker", "ps", "-q", "--filter", f"name={container.name}"],
            capture_output=True, text=True,
        )
        assert result.stdout.strip() == "", \
            f"container still running after stop: {result.stdout.strip()}"
        ok("docker ps confirms container is gone")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("═" * 50)
    print("  440hz DinD Gym Integration Test")
    print("═" * 50)

    try:
        run_tests()
        print("\n" + "═" * 50)
        print("  ALL TESTS PASSED")
        print("═" * 50)
        sys.exit(0)
    except Exception as exc:
        print(f"\n✗ FAILED: {exc}", flush=True)
        traceback.print_exc()
        sys.exit(1)
