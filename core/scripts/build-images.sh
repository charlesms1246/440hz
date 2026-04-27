#!/bin/bash
# Build all 440hz container images.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building sample SQL gym image"
docker build -t 440hz/sample-sql-gym:latest \
    -f examples/sample-gym/Dockerfile .

echo "==> Building 440hz executor image"
docker build -t 440hz/executor:latest \
    -f executor/Dockerfile .

echo "==> Building 440hz aggregator image"
docker build -t 440hz/aggregator:latest \
    -f aggregator/Dockerfile .

echo "==> Done."
docker images | grep "440hz/"
