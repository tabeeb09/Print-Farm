#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-website}"
PROJECT_ROOT="${PROJECT_ROOT:-/srv/$PROJECT_NAME/app}"
STATE_DIR="${STATE_DIR:-/etc/$PROJECT_NAME}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$STATE_DIR/deploy.env}"
RUSTFS_COMPOSE_PROJECT="${RUSTFS_COMPOSE_PROJECT:-rustfs}"
RUSTFS_EXTRA_COMPOSE_FILES="${RUSTFS_EXTRA_COMPOSE_FILES:-}"
RUSTFS_MIN_FREE_MB="${RUSTFS_MIN_FREE_MB:-512}"

cd "$PROJECT_ROOT"

if [[ ! -f "$DEPLOY_ENV_FILE" ]]; then
  echo "Missing $DEPLOY_ENV_FILE. Run scripts/bootstrap-app-vps.sh first." >&2
  exit 1
fi

available_mb="$(df -Pm "$PROJECT_ROOT" | awk 'NR == 2 { print $4 }')"
if [[ -n "$available_mb" && "$available_mb" -lt "$RUSTFS_MIN_FREE_MB" ]]; then
  echo "Not enough free disk for RustFS startup: ${available_mb}MB available, ${RUSTFS_MIN_FREE_MB}MB required." >&2
  echo "Free disk space or attach a larger volume before starting RustFS." >&2
  exit 1
fi

compose_files=(-f docker-compose.rustfs.yaml)

if [[ -n "$RUSTFS_EXTRA_COMPOSE_FILES" ]]; then
  IFS=':' read -r -a extra_files <<<"$RUSTFS_EXTRA_COMPOSE_FILES"
  for extra_file in "${extra_files[@]}"; do
    [[ -n "$extra_file" ]] && compose_files+=(-f "$extra_file")
  done
fi

docker compose -p "$RUSTFS_COMPOSE_PROJECT" "${compose_files[@]}" --env-file "$DEPLOY_ENV_FILE" pull
docker compose -p "$RUSTFS_COMPOSE_PROJECT" "${compose_files[@]}" --env-file "$DEPLOY_ENV_FILE" up -d

set -a
# shellcheck source=/dev/null
source "$DEPLOY_ENV_FILE"
set +a

required_vars=(S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY)
for required_var in "${required_vars[@]}"; do
  if [[ -z "${!required_var:-}" ]]; then
    echo "Missing $required_var in $DEPLOY_ENV_FILE; cannot initialize RustFS bucket." >&2
    exit 1
  fi
done

echo "Waiting for RustFS S3 API..."
for _ in {1..60}; do
  if docker run --rm \
    --network "${RUSTFS_NETWORK:-rustfs_internal}" \
    -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
    amazon/aws-cli s3api list-buckets \
      --endpoint-url "$S3_ENDPOINT" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! docker run --rm \
  --network "${RUSTFS_NETWORK:-rustfs_internal}" \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
  amazon/aws-cli s3api list-buckets \
    --endpoint-url "$S3_ENDPOINT" >/dev/null; then
  echo "RustFS S3 API did not become ready." >&2
  exit 1
fi

if ! docker run --rm \
  --network "${RUSTFS_NETWORK:-rustfs_internal}" \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
  amazon/aws-cli s3api head-bucket \
    --bucket "$S3_BUCKET" \
    --endpoint-url "$S3_ENDPOINT" >/dev/null 2>&1; then
  echo "Creating RustFS bucket: $S3_BUCKET"
  docker run --rm \
    --network "${RUSTFS_NETWORK:-rustfs_internal}" \
    -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
    amazon/aws-cli s3 mb "s3://$S3_BUCKET" \
      --endpoint-url "$S3_ENDPOINT"
fi

docker run --rm \
  --network "${RUSTFS_NETWORK:-rustfs_internal}" \
  --entrypoint sh \
  -e S3_ENDPOINT="$S3_ENDPOINT" \
  -e S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
  -e S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  -e S3_BUCKET="$S3_BUCKET" \
  minio/mc:latest -lc '
    mc alias set rustfs "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
    mc anonymous set download "rustfs/$S3_BUCKET"
  '

cors_file="$(mktemp)"
cat >"$cors_file" <<JSON
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
JSON

docker run --rm \
  --network "${RUSTFS_NETWORK:-rustfs_internal}" \
  -v "$cors_file:/tmp/cors.json:ro" \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
  amazon/aws-cli s3api put-bucket-cors \
    --bucket "$S3_BUCKET" \
    --cors-configuration file:///tmp/cors.json \
    --endpoint-url "$S3_ENDPOINT"
rm -f "$cors_file"

echo "RustFS bucket is ready: $S3_BUCKET"
