#!/bin/bash
# Run the federated 3-node demo end-to-end.
#
# Sequence:
#   1. Bring up gym + aggregator
#   2. Bring up 3 executors in parallel
#   3. Each executor: load base model → train locally → submit adapter
#   4. Aggregator: wait for 3 submissions → FedAvg → upload
#   5. Print the aggregator's receipt with the global adapter root hash
#
# Prereqs:
#   - Images built (./scripts/build-images.sh)
#   - GPU + nvidia-container-toolkit
#   - Ollama running on host with qwen2.5:7b (or edit task.federated.example.json)
#   - Stub aggregator template files in configs/aggregator-templates/ (see below)

set -euo pipefail
cd "$(dirname "$0")/.."

# --------------------------------------------------------------------------
# Make sure the aggregator template stubs exist. In production these are
# fetched from 0G Storage by content hash; for local dev we ship empty stubs.
# --------------------------------------------------------------------------
mkdir -p configs/aggregator-templates/tokenizer
if [ ! -f configs/aggregator-templates/adapter_config.json ]; then
    echo "==> Creating stub adapter_config.json"
    cat > configs/aggregator-templates/adapter_config.json <<'EOF'
{
  "base_model_name_or_path": "Qwen/Qwen2.5-0.5B-Instruct",
  "bias": "none",
  "lora_alpha": 32,
  "lora_dropout": 0.05,
  "peft_type": "LORA",
  "r": 16,
  "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj"],
  "task_type": "CAUSAL_LM"
}
EOF
fi

echo "==> Bringing down any previous federation stack"
docker compose -f docker-compose.federated.yml down --remove-orphans 2>/dev/null || true

echo "==> Starting federation: 1 gym + 1 aggregator + 3 executors"
docker compose -f docker-compose.federated.yml up \
    --abort-on-container-exit \
    --exit-code-from aggregator

echo
echo "==> Aggregator receipt:"
docker run --rm \
    -v "$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]')_aggregator_output:/out:ro" \
    alpine sh -c 'cat /out/aggregator_receipt.json 2>/dev/null || echo "(no receipt found)"'

echo
echo "==> Federation demo complete."
