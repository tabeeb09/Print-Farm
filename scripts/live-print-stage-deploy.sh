#!/usr/bin/env bash
set -euo pipefail

PRINT_REPO_URL="${PRINT_REPO_URL:-https://github.com/tabeeb09/Print-Farm.git}"
PRINT_REPO_REF="${PRINT_REPO_REF:-main}"
REPO_ROOT="${REPO_ROOT:-/srv/print/repo}"
PRINT_DEPLOY_PATH="${PRINT_DEPLOY_PATH:-/srv/print/app}"
PRINT_STATE_DIR="${PRINT_STATE_DIR:-/etc/print}"
CAID_INIT_FILE="${CAID_INIT_FILE:-/etc/caid/openbao-init.json}"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Run as root." >&2
    exit 1
  fi
}

unseal_openbao_if_needed() {
  local bao_addr
  bao_addr="$(grep -E '^BAO_ADDR=' /etc/website/deploy.env | tail -n 1 | cut -d= -f2- || true)"
  [[ -n "$bao_addr" ]] || return 0

  if ! curl -fsS "$bao_addr/v1/sys/seal-status" | grep -q '"sealed":true'; then
    return 0
  fi

  if [[ ! -f "$CAID_INIT_FILE" ]]; then
    echo "OpenBao is sealed and $CAID_INIT_FILE is missing." >&2
    exit 1
  fi

  local unseal_key
  unseal_key="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const key=(data.unseal_keys_b64&&data.unseal_keys_b64[0])||(data.unseal_keys_hex&&data.unseal_keys_hex[0]); if (!key) process.exit(1); process.stdout.write(key);' "$CAID_INIT_FILE")"
  curl -fsS -X POST \
    -H "Content-Type: application/json" \
    --data "$(node -e 'process.stdout.write(JSON.stringify({key: process.argv[1]}))' "$unseal_key")" \
    "$bao_addr/v1/sys/unseal" >/dev/null
}

main() {
  require_root

  if [[ ! -d "$REPO_ROOT/.git" ]]; then
    mkdir -p "$(dirname "$REPO_ROOT")"
    git clone --branch "$PRINT_REPO_REF" "$PRINT_REPO_URL" "$REPO_ROOT"
  fi

  cd "$REPO_ROOT"
  git config --global --add safe.directory "$REPO_ROOT"

  local origin_url
  origin_url="$(git remote get-url origin || true)"
  if [[ "$origin_url" != "$PRINT_REPO_URL" && "$origin_url" != "${PRINT_REPO_URL%.git}" ]]; then
    echo "Refusing to deploy print stage from $REPO_ROOT because origin is $origin_url, expected $PRINT_REPO_URL." >&2
    echo "Set REPO_ROOT to a dedicated Print-Farm checkout such as /srv/print/repo." >&2
    exit 1
  fi

  git fetch --all --prune
  git checkout "$PRINT_REPO_REF"
  git pull --ff-only origin "$PRINT_REPO_REF"

  unseal_openbao_if_needed

  install -d -m 755 "$PRINT_DEPLOY_PATH"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude .env.local \
    "$REPO_ROOT/deployables/print-stage/" "$PRINT_DEPLOY_PATH/"

  install -d -m 700 "$PRINT_STATE_DIR"
  BOOTSTRAP_ON_FAILURE=exit STATE_DIR="$PRINT_STATE_DIR" bash "$REPO_ROOT/scripts/bootstrap-print-vps.sh"

  cd "$PRINT_DEPLOY_PATH"
  docker compose -p print \
    -f docker-compose.print.yaml \
    -f docker-compose.print.same-host-rustfs.yaml \
    up -d --build

  for attempt in {1..30}; do
    if curl -fsS https://print.loftrop.com >/dev/null; then
      break
    fi
    if [[ "$attempt" -eq 30 ]]; then
      echo "print.loftrop.com did not become healthy after deployment." >&2
      exit 1
    fi
    sleep 2
  done
  echo "LIVE_PRINT_STAGE_DEPLOY_DONE"
}

main "$@"
