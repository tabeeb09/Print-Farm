#!/usr/bin/env sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-oi-loftrop/bootstrap-tools:local}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
GOOGLE_MOUNT=""
BOOTSTRAP_ARGS=""

append_arg() {
  if [ -z "$BOOTSTRAP_ARGS" ]; then
    BOOTSTRAP_ARGS=$1
  else
    BOOTSTRAP_ARGS="$BOOTSTRAP_ARGS
$1"
  fi
}

set_google_secret_mount() {
  file_path=$1
  file_dir=$(CDPATH= cd -- "$(dirname -- "$file_path")" && pwd)
  file_name=$(basename -- "$file_path")
  GOOGLE_MOUNT=$file_dir
  GOOGLE_CONTAINER_PATH="/google-oauth/$file_name"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --google-client-secrets-file|--google-client-secret-file)
      [ "$#" -ge 2 ] || { echo "$1 requires a file path argument." >&2; exit 1; }
      set_google_secret_mount "$2"
      append_arg "$1"
      append_arg "$GOOGLE_CONTAINER_PATH"
      shift 2
      ;;
    --google-client-secrets-file=*|--google-client-secret-file=*)
      key=${1%%=*}
      value=${1#*=}
      set_google_secret_mount "$value"
      append_arg "$key=$GOOGLE_CONTAINER_PATH"
      shift
      ;;
    *)
      append_arg "$1"
      shift
      ;;
  esac
done

docker build \
  -f "$REPO_ROOT/infra/bootstrap-tools.Dockerfile" \
  -t "$IMAGE_NAME" \
  "$REPO_ROOT"

set -- 
if [ -n "$BOOTSTRAP_ARGS" ]; then
  while IFS= read -r arg; do
    set -- "$@" "$arg"
  done <<EOF
$BOOTSTRAP_ARGS
EOF
fi

if [ -n "$GOOGLE_MOUNT" ]; then
  docker run --rm -it \
    -v "$REPO_ROOT:/work" \
    -v "$GOOGLE_MOUNT:/google-oauth:ro" \
    -w /work \
    "$IMAGE_NAME" \
    "$@"
else
  docker run --rm -it \
    -v "$REPO_ROOT:/work" \
    -w /work \
    "$IMAGE_NAME" \
    "$@"
fi
