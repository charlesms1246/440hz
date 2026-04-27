#!/bin/bash
# Run a 440hz training task end-to-end on local hardware.
#
# Usage:
#   ./scripts/local-test.sh                       # uses configs/task.example.json
#   ./scripts/local-test.sh path/to/my-task.json  # custom config
#
# Prereqs:
#   - Images built (./scripts/build-images.sh)
#   - GPU + nvidia-container-toolkit
#   - Ollama running on host with qwen2.5:7b (or edit task config)

set -euo pipefail

cd "$(dirname "$0")/.."

TASK_CONFIG="${1:-configs/task.example.json}"

if [ ! -f "$TASK_CONFIG" ]; then
    echo "task config not found: $TASK_CONFIG" >&2
    exit 1
fi

echo "==> Using task config: $TASK_CONFIG"

# Override the compose-mounted config with whichever the user passed in.
export TASK_CONFIG_HOST="$(realpath "$TASK_CONFIG")"

# Down first to ensure a clean state.
docker compose down --remove-orphans 2>/dev/null || true

# Bring up gym + executor. The executor will run to completion and exit.
docker compose up \
    --abort-on-container-exit \
    --exit-code-from executor

echo
echo "==> Done. Receipt:"
docker run --rm \
    -v "440hz-executor_executor_scratch:/var/440hz:ro" \
    alpine cat /var/440hz/receipt.json 2>/dev/null \
    || echo "(receipt not found — check executor logs above)"
