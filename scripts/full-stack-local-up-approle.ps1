$ErrorActionPreference = "Stop"
if (Test-Path Variable:\PSNativeCommandUseErrorActionPreference) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$baseEnvFile = Join-Path $repoRoot ".env.full.local"
$generatedEnvFile = Join-Path $repoRoot ".env.full.local.generated"

if (-not (Test-Path $baseEnvFile)) {
  throw "Missing $baseEnvFile"
}

$baoAddr = Read-Host "BAO_ADDR from this Windows host, usually http://localhost:8200"
$roleId = Read-Host "OPENBAO_ROLE_ID"
$secretId = Read-Host "OPENBAO_SECRET_ID"

Push-Location $repoRoot
try {
  $env:BAO_ADDR = $baoAddr
  $env:OPENBAO_ROLE_ID = $roleId
  $env:OPENBAO_SECRET_ID = $secretId
  Remove-Item Env:BAO_TOKEN -ErrorAction SilentlyContinue

  node scripts/fetch-openbao-secrets.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to fetch secrets from OpenBao. App stack startup aborted."
  }

  node scripts/prepare-full-stack-env.mjs --mode local --base .env.full.local --runtime .env.runtime --output .env.full.local.generated
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to prepare generated env. App stack startup aborted."
  }

  docker compose -f docker-compose.app.local.yaml --env-file $generatedEnvFile up -d --build
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to start app stack."
  }
}
finally {
  Remove-Item Env:BAO_ADDR -ErrorAction SilentlyContinue
  Remove-Item Env:OPENBAO_ROLE_ID -ErrorAction SilentlyContinue
  Remove-Item Env:OPENBAO_SECRET_ID -ErrorAction SilentlyContinue
  Pop-Location
}
