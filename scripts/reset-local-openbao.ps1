$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
  docker compose -f docker-compose.openbao.yaml down -v --remove-orphans
}
finally {
  Pop-Location
}
