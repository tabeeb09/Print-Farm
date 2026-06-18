#!/usr/bin/env bash
set -euo pipefail

CAID_HOME="${CAID_HOME:-/srv/caid}"
CAID_CADDY_CONTAINER="${CAID_CADDY_CONTAINER:-caid-caddy-1}"
APP_NETWORK="${APP_NETWORK:-app_edge}"
RUSTFS_NETWORK="${RUSTFS_NETWORK:-rustfs_internal}"
AUTH_HOST="${AUTH_HOST:-auth.loftrop.com}"
BAO_HOST="${BAO_HOST:-bao.loftrop.com}"
APP_HOST="${APP_HOST:?APP_HOST is required}"
WEBSITE_ALIAS_HOSTS="${WEBSITE_ALIAS_HOSTS:-}"
MEDIA_HOST="${MEDIA_HOST:?MEDIA_HOST is required}"
RUSTFS_ADMIN_HOST="${RUSTFS_ADMIN_HOST:?RUSTFS_ADMIN_HOST is required}"
OAUTH2_PROXY_HOST="${OAUTH2_PROXY_HOST:?OAUTH2_PROXY_HOST is required}"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Run as root." >&2
    exit 1
  fi
}

connect_network_if_needed() {
  local network="$1"
  shift || true

  if ! docker network inspect "$network" >/dev/null 2>&1; then
    echo "Docker network does not exist yet: $network" >&2
    exit 1
  fi

  if docker inspect "$CAID_CADDY_CONTAINER" --format '{{json .NetworkSettings.Networks}}' | grep -q "\"$network\""; then
    if [[ "$#" -gt 0 ]]; then
      docker network disconnect "$network" "$CAID_CADDY_CONTAINER"
      docker network connect "$@" "$network" "$CAID_CADDY_CONTAINER"
    fi
    return
  fi

  docker network connect "$@" "$network" "$CAID_CADDY_CONTAINER"
}

write_routes() {
  local caddyfile="$CAID_HOME/caddy/Caddyfile"
  local tmp
  local app_hosts
  tmp="$(mktemp)"
  app_hosts="$APP_HOST"

  if [[ -n "$WEBSITE_ALIAS_HOSTS" ]]; then
    app_hosts="$app_hosts, $WEBSITE_ALIAS_HOSTS"
  fi

  if [[ ! -f "$caddyfile" ]]; then
    echo "Missing CAId Caddyfile: $caddyfile" >&2
    exit 1
  fi

  awk '
    /^# BEGIN website single-vps routes$/ { skip = 1; next }
    /^# END website single-vps routes$/ { skip = 0; next }
    skip != 1 { print }
  ' "$caddyfile" >"$tmp"

  cat >>"$tmp" <<EOF

# BEGIN website single-vps routes
$app_hosts {
  reverse_proxy app-website-1:3000
}

$MEDIA_HOST {
  reverse_proxy rustfs:9000
}

$OAUTH2_PROXY_HOST {
  reverse_proxy oauth2-proxy:4180
}

$RUSTFS_ADMIN_HOST {
  reverse_proxy oauth2-proxy:4180
}
# END website single-vps routes
EOF

  install -m 0644 "$tmp" "$caddyfile"
  rm -f "$tmp"
}

main() {
  require_root
  connect_network_if_needed "$APP_NETWORK" --alias "$AUTH_HOST" --alias "$BAO_HOST" --alias caid-caddy
  connect_network_if_needed "$RUSTFS_NETWORK"
  write_routes
  docker restart "$CAID_CADDY_CONTAINER" >/dev/null
  echo "Single-VPS routing configured through $CAID_CADDY_CONTAINER."
}

main "$@"
