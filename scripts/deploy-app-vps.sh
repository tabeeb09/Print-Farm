#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-website}"
PROJECT_ROOT="${PROJECT_ROOT:-/srv/$PROJECT_NAME/app}"
STATE_DIR="${STATE_DIR:-/etc/$PROJECT_NAME}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$STATE_DIR/deploy.env}"
APP_COMPOSE_PROJECT="${APP_COMPOSE_PROJECT:-app}"
RUSTFS_NETWORK="${RUSTFS_NETWORK:-rustfs_internal}"
USE_LOCAL_RUSTFS_NETWORK="${USE_LOCAL_RUSTFS_NETWORK:-true}"
APP_EXTRA_COMPOSE_FILES="${APP_EXTRA_COMPOSE_FILES:-}"

cd "$PROJECT_ROOT"

if [[ ! -f "$DEPLOY_ENV_FILE" ]]; then
  echo "Missing $DEPLOY_ENV_FILE. Run scripts/bootstrap-app-vps.sh first." >&2
  exit 1
fi

compose_files=(-f docker-compose.full.yaml)

if [[ "$USE_LOCAL_RUSTFS_NETWORK" == "true" ]]; then
  if ! docker network inspect "$RUSTFS_NETWORK" >/dev/null 2>&1; then
    echo "Missing Docker network '$RUSTFS_NETWORK'." >&2
    echo "Start RustFS first with scripts/deploy-rustfs-vps.sh, or set USE_LOCAL_RUSTFS_NETWORK=false if RustFS is remote." >&2
    exit 1
  fi

  compose_files+=(-f docker-compose.same-host-rustfs.yaml)
fi

if [[ -n "$APP_EXTRA_COMPOSE_FILES" ]]; then
  IFS=':' read -r -a extra_files <<<"$APP_EXTRA_COMPOSE_FILES"
  for extra_file in "${extra_files[@]}"; do
    [[ -n "$extra_file" ]] && compose_files+=(-f "$extra_file")
  done
fi

docker compose -p "$APP_COMPOSE_PROJECT" "${compose_files[@]}" --env-file "$DEPLOY_ENV_FILE" pull
docker compose -p "$APP_COMPOSE_PROJECT" "${compose_files[@]}" --env-file "$DEPLOY_ENV_FILE" up -d
