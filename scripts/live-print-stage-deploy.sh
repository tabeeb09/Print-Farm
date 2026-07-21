#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/srv/website/app}"
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

  cd "$REPO_ROOT"
  git config --global --add safe.directory "$REPO_ROOT"
  git fetch --all --prune
  git checkout main
  git pull --ff-only origin main

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
