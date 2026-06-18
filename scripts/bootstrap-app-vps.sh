#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-website}"
PROJECT_ROOT="${PROJECT_ROOT:-/srv/$PROJECT_NAME/app}"
STATE_DIR="${STATE_DIR:-/etc/$PROJECT_NAME}"
BOOTSTRAP_ENV_FILE="${BOOTSTRAP_ENV_FILE:-$STATE_DIR/openbao-bootstrap.env}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-$STATE_DIR/runtime.env}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$STATE_DIR/deploy.env}"
BASE_ENV_FILE="${BASE_ENV_FILE:-$STATE_DIR/base.env}"
BOOTSTRAP_ON_FAILURE="${BOOTSTRAP_ON_FAILURE:-wait}"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

host_node_is_usable() {
  command -v node >/dev/null 2>&1 &&
    node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >/dev/null 2>&1
}

run_node() {
  if host_node_is_usable; then
    node "$@"
    return
  fi

  docker run --rm \
    --network host \
    -v "$PROJECT_ROOT:/app" \
    -v "$STATE_DIR:$STATE_DIR" \
    -w /app \
    -e "BAO_ADDR=${BAO_ADDR:-}" \
    -e "BAO_APPROLE_AUTH_PATH=${BAO_APPROLE_AUTH_PATH:-}" \
    -e "OPENBAO_ROLE_ID=${OPENBAO_ROLE_ID:-}" \
    -e "OPENBAO_SECRET_ID=${OPENBAO_SECRET_ID:-}" \
    -e "BAO_ROLE_ID=${BAO_ROLE_ID:-}" \
    -e "BAO_SECRET_ID=${BAO_SECRET_ID:-}" \
    -e "BAO_TOKEN=${BAO_TOKEN:-}" \
    -e "BAO_DEV_ROOT_TOKEN=${BAO_DEV_ROOT_TOKEN:-}" \
    -e "BAO_KV_MOUNT=${BAO_KV_MOUNT:-}" \
    -e "BAO_SECRET_PATH_WEBSITE=${BAO_SECRET_PATH_WEBSITE:-}" \
    -e "BAO_SECRET_PATH_RUSTFS=${BAO_SECRET_PATH_RUSTFS:-}" \
    -e "BAO_SECRET_PATH_OAUTH2_PROXY=${BAO_SECRET_PATH_OAUTH2_PROXY:-}" \
    -e "BAO_SECRET_PATH_KEYCLOAK=${BAO_SECRET_PATH_KEYCLOAK:-}" \
    -e "NODE_TLS_REJECT_UNAUTHORIZED=${NODE_TLS_REJECT_UNAUTHORIZED:-}" \
    node:20-alpine node "$@"
}

write_secure_file() {
  local target="$1"
  umask 077
  cat >"$target"
  chmod 600 "$target"
}

prompt_for_bootstrap_env() {
  local bao_addr role_id secret_id

  echo "OpenBao AppRole bootstrap credentials are required."
  read -r -p "BAO_ADDR: " bao_addr
  read -r -p "OPENBAO_ROLE_ID: " role_id
  read -r -s -p "OPENBAO_SECRET_ID: " secret_id
  echo

  write_secure_file "$BOOTSTRAP_ENV_FILE" <<EOF
BAO_ADDR=$bao_addr
OPENBAO_ROLE_ID=$role_id
OPENBAO_SECRET_ID=$secret_id
EOF

  echo "Saved bootstrap credentials to $BOOTSTRAP_ENV_FILE"
}

load_bootstrap_env() {
  if [[ ! -f "$BOOTSTRAP_ENV_FILE" ]]; then
    if [[ -t 0 ]]; then
      prompt_for_bootstrap_env
    else
      echo "Missing $BOOTSTRAP_ENV_FILE. Re-run interactively or create it manually." >&2
      exit 1
    fi
  fi

  # shellcheck disable=SC1090
  source "$BOOTSTRAP_ENV_FILE"

  : "${BAO_ADDR:?Missing BAO_ADDR in $BOOTSTRAP_ENV_FILE}"
  : "${OPENBAO_ROLE_ID:?Missing OPENBAO_ROLE_ID in $BOOTSTRAP_ENV_FILE}"
  : "${OPENBAO_SECRET_ID:?Missing OPENBAO_SECRET_ID in $BOOTSTRAP_ENV_FILE}"
}

wait_for_valid_bootstrap() {
  while true; do
    load_bootstrap_env

    if BAO_ADDR="$BAO_ADDR" \
      OPENBAO_ROLE_ID="$OPENBAO_ROLE_ID" \
      OPENBAO_SECRET_ID="$OPENBAO_SECRET_ID" \
      run_node scripts/fetch-openbao-secrets.mjs; then
      break
    fi

    echo "OpenBao bootstrap credentials were rejected or secret fetch failed."

    if [[ -t 0 ]]; then
      rm -f "$BOOTSTRAP_ENV_FILE"
      prompt_for_bootstrap_env
      continue
    fi

    if [[ "$BOOTSTRAP_ON_FAILURE" == "exit" || "${CI:-}" == "true" ]]; then
      echo "Bootstrap failed in non-interactive mode. Correct $BOOTSTRAP_ENV_FILE, then rerun." >&2
      exit 1
    fi

    echo "Waiting for corrected credentials at $BOOTSTRAP_ENV_FILE ..."
    sleep 15
  done
}

prepare_deploy_env() {
  if [[ ! -f "$BASE_ENV_FILE" ]]; then
    echo "Missing $BASE_ENV_FILE. Create it from deploy/app-vps.base.env.example before bootstrap." >&2
    exit 1
  fi

  run_node scripts/prepare-full-stack-env.mjs \
    --mode prod \
    --base "$BASE_ENV_FILE" \
    --runtime .env.runtime \
    --output "$DEPLOY_ENV_FILE"

  cp .env.runtime "$RUNTIME_ENV_FILE"
  chmod 600 "$RUNTIME_ENV_FILE" "$DEPLOY_ENV_FILE"
}

main() {
  require_command docker

  cd "$PROJECT_ROOT"
  wait_for_valid_bootstrap
  prepare_deploy_env

  echo "Bootstrap complete."
  echo "Runtime env: $RUNTIME_ENV_FILE"
  echo "Deploy env:  $DEPLOY_ENV_FILE"
}

main "$@"
