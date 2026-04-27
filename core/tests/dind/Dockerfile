# DinD integration test runner for 440hz gym_sdk.
#
# This image runs inside a privileged container. The entrypoint starts a nested
# dockerd, loads the gym image from the shared volume, then drives the test.
#
# Build context: core/

FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        docker.io \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/440hz

# Python deps needed by gym_client + gym_sdk
RUN pip install --no-cache-dir fastapi uvicorn pydantic httpx

# gym_sdk (wire protocol + server — needed by GymClient)
COPY gym_sdk/ /opt/440hz/gym_sdk/

# executor modules under test (no changes to these files)
COPY executor/gym_client.py /opt/440hz/executor/gym_client.py
COPY executor/container_runtime.py /opt/440hz/executor/container_runtime.py

# Test harness
COPY tests/dind/entrypoint.sh /entrypoint.sh
COPY tests/dind/test_dind_gym.py /test_dind_gym.py

RUN chmod +x /entrypoint.sh && \
    touch /opt/440hz/executor/__init__.py

ENV PYTHONPATH=/opt/440hz

# /gym-images/ is mounted from the gym-builder service (shared volume).
# It must contain sample-sql-gym.tar before this container starts.
ENTRYPOINT ["/entrypoint.sh"]
