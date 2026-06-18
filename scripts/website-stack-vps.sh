#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-website}"
PROJECT_ROOT="${PROJECT_ROOT:-/srv/$PROJECT_NAME/app}"
STATE_DIR="${STATE_DIR:-/etc/$PROJECT_NAME}"
BASE_ENV_FILE="${BASE_ENV_FILE:-$STATE_DIR/base.env}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$STATE_DIR/deploy.env}"
REPO_URL="${REPO_URL:-https://github.com/tabeeb09/Print-Farm.git}"
REPO_REF="${REPO_REF:-main}"
USE_LOCAL_RUSTFS_NETWORK="${USE_LOCAL_RUSTFS_NETWORK:-true}"
APP_COMPOSE_PROJECT="${APP_COMPOSE_PROJECT:-app}"
RUSTFS_COMPOSE_PROJECT="${RUSTFS_COMPOSE_PROJECT:-rustfs}"
APP_EXTRA_COMPOSE_FILES="${APP_EXTRA_COMPOSE_FILES:-}"
RUSTFS_EXTRA_COMPOSE_FILES="${RUSTFS_EXTRA_COMPOSE_FILES:-}"

usage() {
  cat <<EOF
Usage: sudo bash scripts/website-stack-vps.sh <command>

Commands:
  setup      Install dependencies, checkout/update repo, configure env, bootstrap secrets, deploy RustFS, deploy app.
  bootstrap  Fetch OpenBao secrets and regenerate $DEPLOY_ENV_FILE.
  deploy     Deploy RustFS first, then deploy the website app.
  rustfs     Deploy only the RustFS/media stack.
  app        Deploy only the website app.
  status     Show app and RustFS container status.
  logs       Show recent app and RustFS logs.
  down       Stop app and RustFS stacks.

Environment:
  USE_LOCAL_RUSTFS_NETWORK=true  Attach website to same-host RustFS Docker network.
  USE_LOCAL_RUSTFS_NETWORK=false Use remote RustFS/S3 endpoint; website does not require local RustFS network.
  APP_EXTRA_COMPOSE_FILES=file.yaml[:file2.yaml]       Extra app compose overrides.
  RUSTFS_EXTRA_COMPOSE_FILES=file.yaml[:file2.yaml]    Extra RustFS compose overrides.
EOF
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Run as root, for example: sudo bash scripts/website-stack-vps.sh setup" >&2
    exit 1
  fi
}

detect_pkg_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo apt
  elif command -v dnf >/dev/null 2>&1; then
    echo dnf
  elif command -v yum >/dev/null 2>&1; then
    echo yum
  else
    echo "Unsupported package manager. Install git and curl manually, then rerun." >&2
    exit 1
  fi
}

install_bootstrap_dependencies() {
  if command -v git >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
    return
  fi

  case "$(detect_pkg_manager)" in
    apt)
      apt-get update
      apt-get install -y ca-certificates curl git
      ;;
    dnf)
      dnf install -y ca-certificates curl git
      ;;
    yum)
      yum install -y ca-certificates curl git
      ;;
  esac
}

checkout_repo() {
  mkdir -p "$(dirname "$PROJECT_ROOT")"

  if [[ ! -d "$PROJECT_ROOT/.git" ]]; then
    git clone --branch "$REPO_REF" "$REPO_URL" "$PROJECT_ROOT"
  else
    git -C "$PROJECT_ROOT" fetch --all --tags
    git -C "$PROJECT_ROOT" checkout "$REPO_REF"
    git -C "$PROJECT_ROOT" pull --ff-only origin "$REPO_REF"
  fi
}

prompt_if_placeholder() {
  local key="$1"
  local prompt="$2"
  local default="$3"
  local current value
  current="$(grep -E "^$key=" "$BASE_ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"

  if [[ -n "$current" && "$current" != *example.com* && "$current" != "https://openbao.internal.example.com" ]]; then
    return
  fi

  read -r -p "$prompt [$default]: " value
  value="${value:-$default}"

  if grep -qE "^$key=" "$BASE_ENV_FILE"; then
    sed -i "s|^$key=.*|$key=$value|" "$BASE_ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$BASE_ENV_FILE"
  fi
}

ensure_base_env() {
  if [[ ! -f "$BASE_ENV_FILE" ]]; then
    echo "Missing $BASE_ENV_FILE after provisioning." >&2
    exit 1
  fi
}

configure_base_env() {
  ensure_base_env

  echo "Configuring website and RustFS deployment values in $BASE_ENV_FILE"
  prompt_if_placeholder APP_HOST "Website host" "app.example.com"
  prompt_if_placeholder MEDIA_HOST "Media host" "media.example.com"
  prompt_if_placeholder RUSTFS_ADMIN_HOST "RustFS admin host" "rustfs-admin.example.com"
  prompt_if_placeholder OAUTH2_PROXY_HOST "OAuth2 proxy host" "oauth2.example.com"
  prompt_if_placeholder NEXT_PUBLIC_SITE_URL "Website public URL" "https://app.example.com"
  prompt_if_placeholder NEXT_PUBLIC_MEDIA_BASE_URL "Media public URL" "https://media.example.com"
  prompt_if_placeholder NEXTAUTH_URL "NextAuth public URL" "https://app.example.com"
  prompt_if_placeholder S3_PUBLIC_ENDPOINT "S3 public/media endpoint" "https://media.example.com"
  prompt_if_placeholder KEYCLOAK_ISSUER "Keycloak issuer URL" "https://auth.example.com/realms/website"
  prompt_if_placeholder BAO_ADDR "OpenBao URL reachable from this VPS" "https://bao.example.com"
  prompt_if_placeholder OAUTH2_PROXY_REDIRECT_URL "OAuth2 Proxy redirect URL" "https://oauth2.example.com/oauth2/callback"

  grep -qE '^RUSTFS_NETWORK=' "$BASE_ENV_FILE" || printf '%s\n' 'RUSTFS_NETWORK=rustfs_internal' >>"$BASE_ENV_FILE"
  grep -qE '^RUSTFS_HTTP_PORT=' "$BASE_ENV_FILE" || printf '%s\n' 'RUSTFS_HTTP_PORT=8082' >>"$BASE_ENV_FILE"
  grep -qE '^RUSTFS_HTTPS_PORT=' "$BASE_ENV_FILE" || printf '%s\n' 'RUSTFS_HTTPS_PORT=9443' >>"$BASE_ENV_FILE"
}

run_provision() {
  REPO_URL="$REPO_URL" REPO_REF="$REPO_REF" PROJECT_NAME="$PROJECT_NAME" PROJECT_ROOT="$PROJECT_ROOT" STATE_DIR="$STATE_DIR" bash "$PROJECT_ROOT/scripts/provision-app-vps.sh"
}

run_bootstrap() {
  cd "$PROJECT_ROOT"
  PROJECT_ROOT="$PROJECT_ROOT" PROJECT_NAME="$PROJECT_NAME" STATE_DIR="$STATE_DIR" bash ./scripts/bootstrap-app-vps.sh
}

deploy_rustfs() {
  cd "$PROJECT_ROOT"
  PROJECT_ROOT="$PROJECT_ROOT" PROJECT_NAME="$PROJECT_NAME" STATE_DIR="$STATE_DIR" RUSTFS_COMPOSE_PROJECT="$RUSTFS_COMPOSE_PROJECT" RUSTFS_EXTRA_COMPOSE_FILES="$RUSTFS_EXTRA_COMPOSE_FILES" bash ./scripts/deploy-rustfs-vps.sh
}

deploy_app() {
  cd "$PROJECT_ROOT"
  PROJECT_ROOT="$PROJECT_ROOT" PROJECT_NAME="$PROJECT_NAME" STATE_DIR="$STATE_DIR" APP_COMPOSE_PROJECT="$APP_COMPOSE_PROJECT" USE_LOCAL_RUSTFS_NETWORK="$USE_LOCAL_RUSTFS_NETWORK" APP_EXTRA_COMPOSE_FILES="$APP_EXTRA_COMPOSE_FILES" bash ./scripts/deploy-app-vps.sh
}

upload_site_resources() {
  cd "$PROJECT_ROOT"
  if [[ ! -f "$DEPLOY_ENV_FILE" ]]; then
    echo "Skipping site resource upload; missing $DEPLOY_ENV_FILE." >&2
    return
  fi

  mapfile -t app_files < <(app_compose_files)
  docker compose -p "$APP_COMPOSE_PROJECT" "${app_files[@]}" --env-file "$DEPLOY_ENV_FILE" exec -T website node scripts/upload-site-resources.mjs
}

app_compose_files() {
  printf '%s\n' -f docker-compose.full.yaml
  if [[ "$USE_LOCAL_RUSTFS_NETWORK" == "true" ]]; then
    printf '%s\n' -f docker-compose.same-host-rustfs.yaml
  fi
  if [[ -n "$APP_EXTRA_COMPOSE_FILES" ]]; then
    IFS=':' read -r -a extra_files <<<"$APP_EXTRA_COMPOSE_FILES"
    for extra_file in "${extra_files[@]}"; do
      [[ -n "$extra_file" ]] && printf '%s\n' -f "$extra_file"
    done
  fi
}

rustfs_compose_files() {
  printf '%s\n' -f docker-compose.rustfs.yaml
  if [[ -n "$RUSTFS_EXTRA_COMPOSE_FILES" ]]; then
    IFS=':' read -r -a extra_files <<<"$RUSTFS_EXTRA_COMPOSE_FILES"
    for extra_file in "${extra_files[@]}"; do
      [[ -n "$extra_file" ]] && printf '%s\n' -f "$extra_file"
    done
  fi
}

show_status() {
  cd "$PROJECT_ROOT"
  if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    echo "App stack:"
    mapfile -t app_files < <(app_compose_files)
    docker compose -p "$APP_COMPOSE_PROJECT" "${app_files[@]}" --env-file "$DEPLOY_ENV_FILE" ps || true
    echo ""
    echo "RustFS stack:"
    mapfile -t rustfs_files < <(rustfs_compose_files)
    docker compose -p "$RUSTFS_COMPOSE_PROJECT" "${rustfs_files[@]}" --env-file "$DEPLOY_ENV_FILE" ps || true
  else
    echo "Missing $DEPLOY_ENV_FILE. Run bootstrap first." >&2
    exit 1
  fi
}

show_logs() {
  cd "$PROJECT_ROOT"
  mapfile -t app_files < <(app_compose_files)
  mapfile -t rustfs_files < <(rustfs_compose_files)
  docker compose -p "$APP_COMPOSE_PROJECT" "${app_files[@]}" --env-file "$DEPLOY_ENV_FILE" logs --tail=120 || true
  docker compose -p "$RUSTFS_COMPOSE_PROJECT" "${rustfs_files[@]}" --env-file "$DEPLOY_ENV_FILE" logs --tail=120 || true
}

stop_stacks() {
  cd "$PROJECT_ROOT"
  mapfile -t app_files < <(app_compose_files)
  mapfile -t rustfs_files < <(rustfs_compose_files)
  docker compose -p "$APP_COMPOSE_PROJECT" "${app_files[@]}" --env-file "$DEPLOY_ENV_FILE" down || true
  docker compose -p "$RUSTFS_COMPOSE_PROJECT" "${rustfs_files[@]}" --env-file "$DEPLOY_ENV_FILE" down || true
}

setup_all() {
  install_bootstrap_dependencies
  checkout_repo
  run_provision
  configure_base_env
  run_bootstrap
  deploy_rustfs
  deploy_app
}

main() {
  require_root

  case "${1:-}" in
    setup)
      setup_all
      ;;
    bootstrap)
      run_bootstrap
      ;;
    deploy)
      deploy_rustfs
      deploy_app
      upload_site_resources
      ;;
    rustfs)
      deploy_rustfs
      ;;
    app)
      deploy_app
      upload_site_resources
      ;;
    status)
      show_status
      ;;
    logs)
      show_logs
      ;;
    down)
      stop_stacks
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      echo "Unknown command: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
