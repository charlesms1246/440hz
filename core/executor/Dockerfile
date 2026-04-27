# --------------------------------------------------------------------------
# 440hz Executor — outer training image.
#
# This is the trusted, hash-attested image that runs inside a 0G CVM (or on
# enterprise edge hardware). Everything user-supplied (the gym, the base
# model weights, the task config) is fetched at runtime — nothing about a
# specific training task is baked into this image. That's what makes it
# reusable across tasks.
#
# Multi-stage to keep the final image lean:
#   - stage `node-deps` builds @0glabs/0g-serving-broker into node_modules
#   - final stage copies that in alongside the Python deps
# --------------------------------------------------------------------------

# --------- Stage 1: Node deps (0G broker SDK) ---------
FROM node:22-slim AS node-deps
WORKDIR /opt/440hz
COPY executor/package.json executor/package-lock.json* ./
RUN npm install --production


# --------- Stage 2: Final runtime image ---------
# CUDA 12.1 + Python 3.11. Match the 0G fine-tuning provider's CUDA version
# so we have predictable bitsandbytes/torch behaviour.
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# OS deps:
#   - python3.11 + pip (for the orchestrator)
#   - docker.io + iptables + uidmap (for the nested DinD)
#   - nodejs (for the 0G broker SDK helper)
#   - ca-certificates, curl, git for general fetching
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 \
        python3-pip \
        python3.11-dev \
        docker.io \
        iptables \
        uidmap \
        curl \
        ca-certificates \
        git \
        && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
        && apt-get install -y --no-install-recommends nodejs \
        && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/bin/python && \
    ln -sf /usr/bin/python3.11 /usr/local/bin/python

WORKDIR /opt/440hz

# --------- Python deps ---------
COPY executor/requirements.txt /opt/440hz/executor/requirements.txt
COPY gym_sdk/requirements.txt /opt/440hz/gym_sdk/requirements.txt
RUN pip install --break-system-packages -r /opt/440hz/executor/requirements.txt && \
    pip install --break-system-packages -r /opt/440hz/gym_sdk/requirements.txt

# --------- Node deps from stage 1 ---------
COPY --from=node-deps /opt/440hz/node_modules /opt/440hz/node_modules

# --------- 0G CLI (for storage upload/download) ---------
RUN npm install -g @0glabs/0g-serving-broker

# --------- Source ---------
# Both the executor and the gym_sdk get installed into the Python path. The
# trainer imports from gym_sdk.protocol so that the wire schemas stay
# byte-identical with whatever the gym container uses.
COPY executor/ /opt/440hz/executor/
COPY gym_sdk/ /opt/440hz/gym_sdk/
COPY executor/zg_broker.mjs /opt/440hz/scripts/zg_broker.mjs

ENV PYTHONPATH=/opt/440hz

# Mount points the orchestrator expects.
RUN mkdir -p /etc/440hz /var/440hz/base_model /var/440hz/adapter /var/440hz/output

RUN chmod +x /opt/440hz/executor/entrypoint.sh

# --------- Volume conventions ---------
# /etc/440hz/task.json   — task config (provided by the 0G provider broker at runtime)
# /var/440hz             — scratch space for model weights, adapters, receipts
# /var/lib/docker        — DinD storage. Should be a tmpfs or volume in production.
VOLUME ["/var/lib/docker"]

ENTRYPOINT ["/opt/440hz/executor/entrypoint.sh"]
