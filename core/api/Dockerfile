# 440hz Provider API Daemon
#
# Lightweight FastAPI service that manages training tasks, streams real metrics
# to the web console, and handles 0G network provider registration.
#
# Node.js is included so register_provider.mjs can call @0glabs/0g-serving-broker.

FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install Node.js 20 + curl
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/440hz

# Python deps for the API daemon
COPY api/requirements.txt /opt/440hz/api/requirements.txt
RUN pip install --no-cache-dir -r /opt/440hz/api/requirements.txt

# Node deps for the registration script
COPY scripts/package.json /opt/440hz/scripts/package.json
RUN cd /opt/440hz/scripts && npm install --production

# Python source: API daemon + executor (needed so task_manager can spawn it)
COPY api/ /opt/440hz/api/
COPY executor/ /opt/440hz/executor/
COPY gym_sdk/ /opt/440hz/gym_sdk/
COPY scripts/ /opt/440hz/scripts/

# State directory for persisted task metadata
RUN mkdir -p /root/.440hz/tasks

ENV PYTHONPATH=/opt/440hz
ENV PORT=8420

EXPOSE 8420

CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8420"]
