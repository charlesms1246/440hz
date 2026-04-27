#!/bin/bash
# 440hz Executor entrypoint.
#
# Two responsibilities:
#   1. Bring up the in-container Docker daemon (DinD) so we can launch the gym.
#   2. Hand off to the Python orchestrator.
#
# The "in-container Docker daemon" only runs when RUNTIME=docker (the default).
# When RUNTIME=podman, podman is rootless and needs no daemon — we skip step 1.

set -euo pipefail

LOG_PREFIX="[440hz-entrypoint]"
log() { echo "$LOG_PREFIX $*" >&2; }

# --------------------------------------------------------------------------
# 1. Container runtime bring-up
# --------------------------------------------------------------------------

RUNTIME="${RUNTIME:-docker}"

if [ "$RUNTIME" = "docker" ]; then
    log "Starting nested dockerd (DinD)…"
    # Start dockerd in the background. We use the vfs storage driver because
    # overlayfs-on-overlayfs is the classic DinD failure mode and not all CVMs
    # ship with the kernel modules required for overlay2 to nest cleanly.
    # vfs is slower but always works.
    dockerd \
        --host=unix:///var/run/docker.sock \
        --storage-driver=vfs \
        --iptables=false \
        > /var/log/dockerd.log 2>&1 &

    DOCKERD_PID=$!
    log "dockerd started (pid=$DOCKERD_PID), waiting for socket…"

    # Wait for the socket to be ready.
    for i in $(seq 1 30); do
        if docker info > /dev/null 2>&1; then
            log "dockerd is up."
            break
        fi
        if ! kill -0 "$DOCKERD_PID" 2>/dev/null; then
            log "dockerd died unexpectedly. tail /var/log/dockerd.log:"
            tail -50 /var/log/dockerd.log >&2 || true
            exit 1
        fi
        sleep 1
    done

    if ! docker info > /dev/null 2>&1; then
        log "dockerd never became ready. Aborting."
        tail -50 /var/log/dockerd.log >&2 || true
        exit 1
    fi
elif [ "$RUNTIME" = "podman" ]; then
    log "Using rootless podman — no daemon needed."
else
    log "Unknown RUNTIME=$RUNTIME"
    exit 1
fi

# --------------------------------------------------------------------------
# 2. Sanity checks
# --------------------------------------------------------------------------

if [ ! -f "${TASK_CONFIG:-/etc/440hz/task.json}" ]; then
    log "Task config not found at ${TASK_CONFIG:-/etc/440hz/task.json}"
    exit 1
fi

# --------------------------------------------------------------------------
# 3. Hand off to the orchestrator
# --------------------------------------------------------------------------

log "Launching 440hz orchestrator…"
exec python -m executor.orchestrator
