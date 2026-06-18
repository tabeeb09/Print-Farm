#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-website}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_GROUP="${DEPLOY_GROUP:-$DEPLOY_USER}"
PROJECT_ROOT="${PROJECT_ROOT:-/srv/$PROJECT_NAME/app}"
STATE_DIR="${STATE_DIR:-/etc/$PROJECT_NAME}"
REPO_URL="${REPO_URL:?REPO_URL is required}"
REPO_REF="${REPO_REF:-main}"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Run this script as root." >&2
    exit 1
  fi
}

detect_pkg_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    echo "dnf"
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    echo "yum"
    return
  fi

  echo "Unsupported package manager." >&2
  exit 1
}

install_dependencies() {
  local manager
  manager="$(detect_pkg_manager)"

  case "$manager" in
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

  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "Installing Docker Engine and Compose plugin from Docker's official installer..."
    curl -fsSL https://get.docker.com | sh
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker installation failed: docker command is unavailable." >&2
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker installation failed: docker compose plugin is unavailable." >&2
    exit 1
  fi

  systemctl enable --now docker
}

ensure_user() {
  if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash "$DEPLOY_USER"
  fi

  usermod -aG docker "$DEPLOY_USER" || true
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

  chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$PROJECT_ROOT"
}

prepare_state_dir() {
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  chown root:root "$STATE_DIR"

  if [[ ! -f "$STATE_DIR/base.env" && -f "$PROJECT_ROOT/deploy/app-vps.base.env.example" ]]; then
    cp "$PROJECT_ROOT/deploy/app-vps.base.env.example" "$STATE_DIR/base.env"
    chmod 600 "$STATE_DIR/base.env"
    chown root:root "$STATE_DIR/base.env"
  fi
}

main() {
  require_root
  install_dependencies
  ensure_user
  checkout_repo
  prepare_state_dir
}

main "$@"
