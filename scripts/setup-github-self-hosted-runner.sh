#!/usr/bin/env bash
set -euo pipefail

GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tabeeb09/Print-Farm}"
RUNNER_USER="${RUNNER_USER:-github-runner}"
RUNNER_ROOT="${RUNNER_ROOT:-/opt/github-runner}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname)-website-deploy}"
RUNNER_LABELS="${RUNNER_LABELS:-website-deploy,private-network}"
RUNNER_GROUP="${RUNNER_GROUP:-Default}"
RUNNER_VERSION="${RUNNER_VERSION:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/website/app}"
PROJECT_NAME="${PROJECT_NAME:-website}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_RUNNER_REGISTRATION_TOKEN="${GITHUB_RUNNER_REGISTRATION_TOKEN:-}"
NONINTERACTIVE="${NONINTERACTIVE:-0}"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Run as root, for example: sudo bash scripts/setup-github-self-hosted-runner.sh" >&2
    exit 1
  fi
}

prompt_default() {
  local var_name="$1"
  local prompt="$2"
  local default_value="$3"
  local value

  read -r -p "$prompt [$default_value]: " value
  printf -v "$var_name" '%s' "${value:-$default_value}"
}

prompt_secret() {
  local var_name="$1"
  local prompt="$2"
  local value

  read -r -s -p "$prompt: " value
  echo ""
  printf -v "$var_name" '%s' "$value"
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)
      echo x64
      ;;
    aarch64|arm64)
      echo arm64
      ;;
    *)
      echo "Unsupported runner architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

install_dependencies() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl jq tar git sudo
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl jq tar git sudo
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl jq tar git sudo
    return
  fi

  echo "Unsupported package manager. Install ca-certificates curl jq tar git sudo manually." >&2
  exit 1
}

latest_runner_version() {
  curl -fsSL https://api.github.com/repos/actions/runner/releases/latest |
    jq -r '.tag_name' |
    sed 's/^v//'
}

get_registration_token() {
  local github_token="$1"
  curl -fsSL \
    -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $github_token" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runners/registration-token" |
    jq -r '.token'
}

set_repo_variable() {
  local github_token="$1"
  local name="$2"
  local value="$3"
  local status

  status="$(curl -sS -o /tmp/github-variable-response.json -w '%{http_code}' \
    -X PATCH \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $github_token" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    --data "$(jq -nc --arg name "$name" --arg value "$value" '{name:$name,value:$value}')" \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/variables/$name")"

  if [[ "$status" == "204" ]]; then
    return
  fi

  status="$(curl -sS -o /tmp/github-variable-response.json -w '%{http_code}' \
    -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $github_token" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    --data "$(jq -nc --arg name "$name" --arg value "$value" '{name:$name,value:$value}')" \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/variables")"

  if [[ "$status" != "201" ]]; then
    echo "Warning: failed to set GitHub variable $name. HTTP $status:" >&2
    cat /tmp/github-variable-response.json >&2
    return 1
  fi
}

ensure_runner_user() {
  if ! id "$RUNNER_USER" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash "$RUNNER_USER"
  fi

  mkdir -p "$RUNNER_ROOT"
  chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_ROOT"
}

install_sudo_policy() {
  cat >"/etc/sudoers.d/$RUNNER_USER-website-deploy" <<EOF
$RUNNER_USER ALL=(root) NOPASSWD: ALL
EOF
  chmod 0440 "/etc/sudoers.d/$RUNNER_USER-website-deploy"
}

download_runner() {
  local arch="$1"
  local version="$2"
  local archive="actions-runner-linux-$arch-$version.tar.gz"
  local url="https://github.com/actions/runner/releases/download/v$version/$archive"

  if [[ -f "$RUNNER_ROOT/.runner" ]]; then
    echo "Runner already configured at $RUNNER_ROOT"
    return
  fi

  curl -fL "$url" -o "/tmp/$archive"
  sudo -u "$RUNNER_USER" tar -xzf "/tmp/$archive" -C "$RUNNER_ROOT"
  rm -f "/tmp/$archive"
}

configure_runner() {
  local registration_token="$1"
  local repo_url="https://github.com/$GITHUB_REPOSITORY"

  if [[ -f "$RUNNER_ROOT/.runner" ]]; then
    return
  fi

  sudo -u "$RUNNER_USER" "$RUNNER_ROOT/config.sh" \
    --unattended \
    --url "$repo_url" \
    --token "$registration_token" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --runnergroup "$RUNNER_GROUP" \
    --work "$RUNNER_ROOT/_work" \
    --replace
}

install_service() {
  cd "$RUNNER_ROOT"
  local service_name
  service_name="$(./svc.sh status 2>/dev/null | awk '/actions\\.runner\\./ { print $2; exit }' || true)"

  if [[ -n "$service_name" ]] && systemctl list-unit-files "$service_name" >/dev/null 2>&1; then
    systemctl enable "$service_name" >/dev/null 2>&1 || true
    systemctl restart "$service_name"
    return
  fi

  if ! ./svc.sh install "$RUNNER_USER"; then
    ./svc.sh start
    return
  fi
  ./svc.sh start
}

print_required_variables() {
  local labels_json
  labels_json="$(printf '%s' "$RUNNER_LABELS" | jq -Rc 'split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0)) | ["self-hosted", "linux"] + . | unique')"

  cat <<EOF

GitHub repository variables required for self-hosted deploy mode:

DEPLOY_MODE=local
DEPLOY_RUNNER_LABELS=$labels_json
USE_LOCAL_RUSTFS_NETWORK=true
APP_EXTRA_COMPOSE_FILES=docker-compose.website-only.same-vm-auth.override.yaml
RUSTFS_EXTRA_COMPOSE_FILES=docker-compose.rustfs.same-vm-auth.override.yaml

No DEPLOY_SSH_* GitHub secrets are required in DEPLOY_MODE=local.
EOF
}

main() {
  require_root
  install_dependencies

  if [[ "$NONINTERACTIVE" != "1" ]]; then
    prompt_default GITHUB_REPOSITORY "GitHub repository" "$GITHUB_REPOSITORY"
    prompt_default RUNNER_USER "Local Linux user for the runner" "$RUNNER_USER"
    prompt_default RUNNER_ROOT "Runner install directory" "$RUNNER_ROOT"
    prompt_default RUNNER_NAME "Runner name" "$RUNNER_NAME"
    prompt_default RUNNER_LABELS "Runner labels, comma-separated" "$RUNNER_LABELS"
  fi

  local github_token="$GITHUB_TOKEN"
  local registration_token="$GITHUB_RUNNER_REGISTRATION_TOKEN"

  if [[ "$NONINTERACTIVE" != "1" && -z "$github_token" && -z "$registration_token" ]]; then
    prompt_secret github_token "GitHub token with repo admin access, or leave blank to paste runner registration token"
  fi

  if [[ -n "$github_token" ]]; then
    registration_token="$(get_registration_token "$github_token")"
  elif [[ "$NONINTERACTIVE" != "1" ]]; then
    prompt_secret registration_token "GitHub runner registration token"
  fi

  if [[ -z "$registration_token" || "$registration_token" == "null" ]]; then
    echo "Missing runner registration token." >&2
    exit 1
  fi

  local arch version
  arch="$(detect_arch)"
  version="${RUNNER_VERSION:-$(latest_runner_version)}"

  ensure_runner_user
  install_sudo_policy
  download_runner "$arch" "$version"
  configure_runner "$registration_token"
  install_service

  if [[ -n "$github_token" ]]; then
    local labels_json
    labels_json="$(printf '%s' "$RUNNER_LABELS" | jq -Rc 'split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0)) | ["self-hosted", "linux"] + . | unique')"
    set_repo_variable "$github_token" DEPLOY_MODE local || true
    set_repo_variable "$github_token" DEPLOY_RUNNER_LABELS "$labels_json" || true
    set_repo_variable "$github_token" USE_LOCAL_RUSTFS_NETWORK true || true
    set_repo_variable "$github_token" APP_EXTRA_COMPOSE_FILES docker-compose.website-only.same-vm-auth.override.yaml || true
    set_repo_variable "$github_token" RUSTFS_EXTRA_COMPOSE_FILES docker-compose.rustfs.same-vm-auth.override.yaml || true
  fi

  print_required_variables
  echo ""
  echo "Runner service status:"
  "$RUNNER_ROOT/svc.sh" status || true
}

main "$@"
