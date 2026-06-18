#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/tabeeb09/website:latest}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Missing docker. Run scripts/provision-app-vps.sh first on a blank VPS." >&2
  exit 1
fi

echo "Testing anonymous pull for $IMAGE"
docker pull "$IMAGE"
echo "Pull succeeded: $IMAGE"
