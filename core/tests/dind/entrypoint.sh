#!/bin/bash
# DinD test entrypoint.
#
# 1. Start a nested dockerd (same flags as executor/entrypoint.sh).
# 2. Wait for it to be ready.
# 3. Load the gym image tar (built by the gym-builder compose service).
# 4. Run the Python integration test.

set -euo pipefail

LOG="[dind-entrypoint]"
log() { echo "$LOG $*" >&2; }

# --------------------------------------------------------------------------
# 1. Start nested dockerd
# --------------------------------------------------------------------------
log "Starting nested dockerd (storage-driver=vfs, iptables=false)…"
dockerd \
    --host=unix:///var/run/docker.sock \
    --storage-driver=vfs \
    --iptables=false \
    > /var/log/dockerd.log 2>&1 &

DOCKERD_PID=$!
log "dockerd PID=$DOCKERD_PID — waiting for socket…"

for i in $(seq 1 60); do
    if docker info > /dev/null 2>&1; then
        log "dockerd is up (attempt $i)."
        break
    fi
    if ! kill -0 "$DOCKERD_PID" 2>/dev/null; then
        log "dockerd died. Last 30 lines of /var/log/dockerd.log:"
        tail -30 /var/log/dockerd.log >&2 || true
        exit 1
    fi
    sleep 1
done

if ! docker info > /dev/null 2>&1; then
    log "dockerd never became ready after 60s. Aborting."
    tail -30 /var/log/dockerd.log >&2 || true
    exit 1
fi

# --------------------------------------------------------------------------
# 2. Load gym image into the inner docker
# --------------------------------------------------------------------------
GYM_TAR="/gym-images/sample-sql-gym.tar"
if [ ! -f "$GYM_TAR" ]; then
    log "ERROR: gym image tar not found at $GYM_TAR"
    exit 1
fi

log "Loading gym image from $GYM_TAR…"
docker load < "$GYM_TAR"
log "Gym image loaded:"
docker images 440hz/sample-sql-gym >&2

# --------------------------------------------------------------------------
# 3. Run integration tests
# --------------------------------------------------------------------------
log "Running DinD gym integration tests…"
python /test_dind_gym.py
TEST_EXIT=$?

# --------------------------------------------------------------------------
# 4. Cleanup
# --------------------------------------------------------------------------
log "Stopping nested dockerd…"
kill "$DOCKERD_PID" 2>/dev/null || true
wait "$DOCKERD_PID" 2>/dev/null || true

exit $TEST_EXIT
