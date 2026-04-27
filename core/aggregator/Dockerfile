# --------------------------------------------------------------------------
# 440hz Aggregator — Flower server image.
#
# CPU-only by design: aggregation is just weighted tensor addition; no model
# inference, no rollouts, no GPU needed. This keeps the image small (~1.5GB)
# and lets aggregators run on cheap, widely-available compute (or inside a
# smaller TEE budget than the executors).
# --------------------------------------------------------------------------

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Node.js for the 0G CLI (used by executor.storage.upload_adapter to push the
# aggregated adapter to 0G Storage).
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        git \
        && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
        && apt-get install -y --no-install-recommends nodejs \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/440hz

# Aggregator deps + a small subset of the executor (just storage.py + its deps).
COPY aggregator/requirements.txt /opt/440hz/aggregator/requirements.txt
RUN pip install --no-cache-dir -r /opt/440hz/aggregator/requirements.txt

# 0G CLI for storage upload.
RUN npm install -g @0glabs/0g-serving-broker

# Source. We need the executor module for `storage.upload_adapter` — copy only
# what's needed to keep the image lean. `__init__.py` plus `storage.py` is
# enough for the import in aggregator.server to succeed.
RUN mkdir -p /opt/440hz/executor
COPY executor/__init__.py /opt/440hz/executor/__init__.py
COPY executor/storage.py /opt/440hz/executor/storage.py
COPY executor/task_config.py /opt/440hz/executor/task_config.py

COPY aggregator/ /opt/440hz/aggregator/

ENV PYTHONPATH=/opt/440hz

RUN mkdir -p /etc/440hz /var/440hz/aggregated /var/440hz/output

EXPOSE 8080

ENTRYPOINT ["python", "-m", "aggregator.server"]
