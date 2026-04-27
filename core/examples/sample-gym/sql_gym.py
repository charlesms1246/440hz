"""
Example Gym — SQL debugging.

Scenario: the agent is given a buggy SQL query and an error message, and must
return a corrected query. This is the kind of task RLAIF excels at: there's no
single ground-truth output (many corrections work), but a supervisor LLM can
score correctness and quality of the fix.

To make this gym truly useful in production you'd swap the in-memory schema +
fault library for a real sandboxed Postgres or DuckDB instance. The shape of
this file is what matters — anything implementing `Gym` works.
"""
from __future__ import annotations

import random
from typing import Any, Optional, Union

from gym_sdk import Gym, GymSpec, serve


# A tiny library of (buggy_sql, db_error_message) pairs. Each entry is one
# scenario the agent must debug. In production this would be hundreds-thousands
# of pairs sourced from the customer's own incident logs.
FAULTS = [
    (
        "SELECT user_id, COUNT(*) FROM orders WHERE created_at > '2024-01-01';",
        "ERROR: column 'user_id' must appear in the GROUP BY clause or be used "
        "in an aggregate function",
    ),
    (
        "SELECT * FROM orders LEFT JOIN users WHERE orders.user_id = users.id;",
        "ERROR: syntax error at or near 'WHERE' — LEFT JOIN expects an ON clause",
    ),
    (
        "SELECT product_name, SUM(price * quantity) AS total FROM line_items;",
        "ERROR: column 'product_name' must appear in the GROUP BY clause",
    ),
    (
        "DELETE orders WHERE status = 'cancelled';",
        "ERROR: syntax error at or near 'orders' — did you mean DELETE FROM?",
    ),
    (
        "SELECT name FROM users WHERE created_at = LAST_WEEK();",
        "ERROR: function 'last_week' does not exist",
    ),
]


class SQLDebuggingGym(Gym):
    """
    One-shot SQL fix gym. Each episode is a single buggy query — the agent
    submits one corrected version, the gym evaluates it (here: trivial regex
    sanity check; the real signal comes from the supervisor LLM).
    """

    def __init__(self):
        self._current: Optional[tuple[str, str]] = None

    def spec(self) -> GymSpec:
        return GymSpec(
            name="sql-debugging",
            version="0.1.0",
            description=(
                "Given a buggy SQL query and an error message, return a "
                "corrected version. One step per episode."
            ),
            action_format="text",
            max_steps_per_episode=1,
            dense_reward=False,  # supervisor provides the real reward
            system_prompt=(
                "You are a senior data engineer. When given a buggy SQL query "
                "and a database error, respond ONLY with the corrected SQL — "
                "no explanation, no markdown, just the SQL ending in a semicolon."
            ),
        )

    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[dict[str, Any]] = None,
    ) -> tuple[str, dict[str, Any]]:
        rng = random.Random(seed)
        self._current = rng.choice(FAULTS)
        bug, err = self._current
        observation = (
            f"Buggy query:\n```sql\n{bug}\n```\n\n"
            f"Database error:\n{err}\n\n"
            f"Return the corrected SQL."
        )
        return observation, {"original_query": bug, "error": err}

    def step(
        self,
        action: Union[str, dict[str, Any]],
    ) -> tuple[str, float, bool, bool, dict[str, Any]]:
        assert isinstance(action, str), "sql-debugging gym uses text actions"
        candidate = action.strip()

        # Sparse gym reward: tiny positive for "looks like SQL", zero otherwise.
        # The supervisor will provide the meaningful score.
        looks_like_sql = candidate.upper().startswith(
            ("SELECT", "INSERT", "UPDATE", "DELETE", "WITH", "CREATE")
        ) and candidate.endswith(";")
        gym_reward = 0.05 if looks_like_sql else 0.0

        observation = f"Submitted query:\n```sql\n{candidate}\n```"
        return observation, gym_reward, True, False, {
            "looks_like_sql": looks_like_sql,
            "original_query": self._current[0] if self._current else "",
        }


if __name__ == "__main__":
    serve(SQLDebuggingGym())
