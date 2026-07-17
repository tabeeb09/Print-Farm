#!/usr/bin/env bash
set -euo pipefail

TOOLS_ROOT="${TOOLS_ROOT:-$(pwd)}"
PROJECT_NAME="${PROJECT_NAME:-print}"
STATE_DIR="${STATE_DIR:-/etc/$PROJECT_NAME}"
BOOTSTRAP_ENV_FILE="${BOOTSTRAP_ENV_FILE:-$STATE_DIR/openbao-bootstrap.env}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-$STATE_DIR/runtime.env}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$STATE_DIR/deploy.env}"
BASE_ENV_FILE="${BASE_ENV_FILE:-$STATE_DIR/base.env}"
LEGACY_ENV_SOURCE_FILE="${LEGACY_ENV_SOURCE_FILE:-$STATE_DIR/deploy.env}"
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
    (
      cd "$TOOLS_ROOT"
      node "$@"
    )
    return
  fi

  docker run --rm \
    --network host \
    -v "$TOOLS_ROOT:/app" \
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
    -e "BAO_SECRET_PATH_PRINT=${BAO_SECRET_PATH_PRINT:-}" \
    -e "BAO_SECRET_GROUPS=${BAO_SECRET_GROUPS:-}" \
    -e "PRINT_APP_BASE_URL=${PRINT_APP_BASE_URL:-}" \
    -e "PRINT_STRIPE_SECRET_KEY=${PRINT_STRIPE_SECRET_KEY:-}" \
    -e "PRINT_STRIPE_WEBHOOK_SECRET=${PRINT_STRIPE_WEBHOOK_SECRET:-}" \
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

seed_bootstrap_from_website_state() {
  local website_bootstrap="/etc/website/openbao-bootstrap.env"
  local website_deploy="/etc/website/deploy.env"

  if [[ -f "$website_bootstrap" ]]; then
    cp "$website_bootstrap" "$BOOTSTRAP_ENV_FILE"
    chmod 600 "$BOOTSTRAP_ENV_FILE"
    return 0
  fi

  if [[ -f "$website_deploy" ]]; then
    # shellcheck disable=SC1090
    source "$website_deploy"

    if [[ -n "${BAO_ADDR:-}" && -n "${OPENBAO_ROLE_ID:-}" && -n "${OPENBAO_SECRET_ID:-}" ]]; then
      write_secure_file "$BOOTSTRAP_ENV_FILE" <<EOF
BAO_ADDR=$BAO_ADDR
OPENBAO_ROLE_ID=$OPENBAO_ROLE_ID
OPENBAO_SECRET_ID=$OPENBAO_SECRET_ID
EOF
      return 0
    fi
  fi

  return 1
}

seed_bao_addr_from_website_state() {
  local website_bootstrap="/etc/website/openbao-bootstrap.env"
  local website_deploy="/etc/website/deploy.env"

  if [[ -f "$website_bootstrap" ]]; then
    # shellcheck disable=SC1090
    source "$website_bootstrap"
  elif [[ -f "$website_deploy" ]]; then
    # shellcheck disable=SC1090
    source "$website_deploy"
  fi

  if [[ -n "${BAO_ADDR:-}" ]]; then
    export BAO_ADDR
    return 0
  fi

  return 1
}

load_bootstrap_env() {
  if [[ -n "${BAO_JWT_TOKEN:-}" || -n "${BAO_TOKEN:-}" || -n "${BAO_DEV_ROOT_TOKEN:-}" ]]; then
    return
  fi

  if [[ ! -f "$BOOTSTRAP_ENV_FILE" ]]; then
    seed_bootstrap_from_website_state || true
  fi

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

migrate_legacy_env_if_needed() {
  if [[ ! -f "$LEGACY_ENV_SOURCE_FILE" ]]; then
    return
  fi

  BAO_ADDR="$BAO_ADDR" \
    OPENBAO_ROLE_ID="$OPENBAO_ROLE_ID" \
    OPENBAO_SECRET_ID="$OPENBAO_SECRET_ID" \
    run_node scripts/seed-print-openbao-from-env.mjs --source "$LEGACY_ENV_SOURCE_FILE"
}

wait_for_valid_bootstrap() {
  while true; do
    local fetch_status=0

    if [[ -n "${BAO_JWT_TOKEN:-}" || -n "${BAO_TOKEN:-}" || -n "${BAO_DEV_ROOT_TOKEN:-}" ]]; then
      if [[ -z "${BAO_ADDR:-}" ]]; then
        seed_bao_addr_from_website_state || true
      fi
      : "${BAO_ADDR:?Missing BAO_ADDR for token-based OpenBao bootstrap}"
      migrate_legacy_env_if_needed || fetch_status=$?
      if [[ "$fetch_status" -eq 0 ]]; then
        BAO_SECRET_GROUPS="${BAO_SECRET_GROUPS:-website,print,keycloak}" \
          run_node scripts/fetch-openbao-secrets.mjs --groups "${BAO_SECRET_GROUPS:-website,print,keycloak}" || fetch_status=$?
      fi
    else
      load_bootstrap_env
      migrate_legacy_env_if_needed || fetch_status=$?
      if [[ "$fetch_status" -eq 0 ]]; then
        BAO_ADDR="$BAO_ADDR" \
          OPENBAO_ROLE_ID="$OPENBAO_ROLE_ID" \
          OPENBAO_SECRET_ID="$OPENBAO_SECRET_ID" \
          BAO_SECRET_GROUPS="${BAO_SECRET_GROUPS:-website,print,keycloak}" \
          run_node scripts/fetch-openbao-secrets.mjs --groups "${BAO_SECRET_GROUPS:-website,print,keycloak}" || fetch_status=$?
      fi
    fi

    if [[ "$fetch_status" -eq 0 ]]; then
      break
    fi

    echo "OpenBao bootstrap credentials or token were rejected, or print secret bootstrap failed."

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
  local base_args=()

  if [[ -f "$BASE_ENV_FILE" ]]; then
    base_args=(--base "$BASE_ENV_FILE")
  fi

  run_node scripts/prepare-print-env.mjs \
    --runtime ".env.runtime" \
    "${base_args[@]}" \
    --output "$DEPLOY_ENV_FILE"

  cp "$TOOLS_ROOT/.env.runtime" "$RUNTIME_ENV_FILE"
  chmod 600 "$RUNTIME_ENV_FILE" "$DEPLOY_ENV_FILE"
}

main() {
  require_command docker

  wait_for_valid_bootstrap
  prepare_deploy_env

  echo "Print bootstrap complete."
  echo "Runtime env: $RUNTIME_ENV_FILE"
  echo "Deploy env:  $DEPLOY_ENV_FILE"
}

main "$@"
