param(
  [string]$HostName = "host.docker.internal",
  [string]$SshHostName = "127.0.0.1",
  [string]$UserName = "project",
  [int]$Port = 2222,
  [string]$Password,
  [string]$PuttyHostKey,
  [string]$Ref = "main",
  [ValidateSet("app", "full", "rustfs", "status")]
  [string]$DeployScope = "app",
  [string]$AppExtraComposeFiles = "",
  [string]$RustfsExtraComposeFiles = "",
  [switch]$InstallTemporaryAccess,
  [switch]$KeepTemporaryAccess
)

$ErrorActionPreference = "Stop"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    if ($Name -eq "act") {
      $wingetAct = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter act.exe -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
      if ($wingetAct) {
        $script:ActPath = $wingetAct
        return
      }
    }
    throw "Required command '$Name' was not found on PATH."
  }
}

function New-LfFile($Path, $Content) {
  [IO.File]::WriteAllText($Path, ($Content -replace "`r`n", "`n"), [Text.Encoding]::ASCII)
}

function Invoke-Plink($Command) {
  Require-Command plink
  if (-not $Password) {
    throw "-Password is required when using -InstallTemporaryAccess."
  }

  $args = @(
    "-ssh",
    "-P", "$Port",
    "-l", $UserName,
    "-pw", $Password,
    "-batch",
    "-no-antispoof"
  )

  if ($PuttyHostKey) {
    $args += @("-hostkey", $PuttyHostKey)
  }

  $args += @($SshHostName, $Command)
  & plink @args
  if ($LASTEXITCODE -ne 0) {
    throw "plink command failed with exit code $LASTEXITCODE."
  }
}

function Invoke-Pscp($LocalPath, $RemotePath) {
  Require-Command pscp
  if (-not $Password) {
    throw "-Password is required when using -InstallTemporaryAccess."
  }

  $args = @(
    "-P", "$Port",
    "-l", $UserName,
    "-pw", $Password,
    "-batch"
  )

  if ($PuttyHostKey) {
    $args += @("-hostkey", $PuttyHostKey)
  }

  $args += @($LocalPath, "${SshHostName}:$RemotePath")
  & pscp @args
  if ($LASTEXITCODE -ne 0) {
    throw "pscp command failed with exit code $LASTEXITCODE."
  }
}

Require-Command act
Require-Command docker
Require-Command ssh-keygen

docker version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker is not running. Start Docker Desktop, then rerun this script."
}

$repoRoot = Resolve-Path "."
$localActRoot = Join-Path $repoRoot ".act-local"
New-Item -ItemType Directory -Force -Path $localActRoot | Out-Null
$tempRoot = Join-Path $localActRoot ("website-act-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$keyPath = Join-Path $tempRoot "id_ed25519"
$knownHostsPath = Join-Path $tempRoot "known_hosts"
$secretsPath = Join-Path $tempRoot "act.secrets"
$publicKey = $null

try {
  & cmd.exe /c "ssh-keygen -t ed25519 -N """" -C website-act-local-deploy -f ""$keyPath""" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "ssh-keygen failed."
  }

  $publicKey = (Get-Content -Raw "$keyPath.pub").Trim()

  if ($InstallTemporaryAccess) {
    $sudoPrefix = if ($Password) { "echo '$Password' | sudo -S" } else { "sudo" }
    $installScript = @"
set -eu
install -m 700 -d ~/.ssh
grep -qxF '$publicKey' ~/.ssh/authorized_keys 2>/dev/null || printf '%s\n' '$publicKey' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
${sudoPrefix} sh -c "printf '%s\n' '$UserName ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/website-act-local-deploy"
$sudoPrefix chmod 440 /etc/sudoers.d/website-act-local-deploy
"@
    $installPath = Join-Path $tempRoot "install-act-access.sh"
    New-LfFile $installPath $installScript
    Invoke-Pscp $installPath "/tmp/install-act-access.sh"
    Invoke-Plink "bash /tmp/install-act-access.sh"
    Invoke-Plink "sudo -k; sudo -n true"
  }

  $knownHosts = Get-Content "$HOME\.ssh\known_hosts" -ErrorAction SilentlyContinue |
    Select-String -Pattern "\[$([Regex]::Escape($SshHostName))\]:$Port" |
    ForEach-Object { $_.Line -replace "\[$([Regex]::Escape($SshHostName))\]:$Port", "[$HostName]:$Port" }

  if (-not $knownHosts) {
    $knownHosts = docker run --rm node:20-bookworm bash -lc "apt-get update >/dev/null && apt-get install -y openssh-client >/dev/null && ssh-keyscan -T 10 -p $Port $HostName 2>/dev/null"
  }

  if (-not $knownHosts) {
    throw "Could not determine SSH known_hosts for $HostName on port $Port."
  }

  New-LfFile $knownHostsPath (($knownHosts -join "`n") + "`n")

  $privateKeyB64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes((Get-Content -Raw $keyPath)))
  $knownHostsB64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes((Get-Content -Raw $knownHostsPath)))

  $secrets = @(
    "DEPLOY_HOST=$HostName",
    "DEPLOY_USER=$UserName",
    "DEPLOY_SSH_PRIVATE_KEY_B64=$privateKeyB64",
    "DEPLOY_SSH_KNOWN_HOSTS_B64=$knownHostsB64"
  ) -join "`n"
  New-LfFile $secretsPath $secrets

  $actArgs = @(
    "workflow_dispatch",
    "-W", ".github/workflows/app-deploy-vps.yml",
    "-j", "deploy",
    "--input", "ref=$Ref",
    "--input", "deploy_scope=$DeployScope",
    "--pull=false",
    "--container-architecture", "linux/amd64",
    "--bind",
    "--action-offline-mode",
    "--var", "DEPLOY_PORT=$Port",
    "--secret-file", $secretsPath
  )

  if ($AppExtraComposeFiles) {
    $actArgs += @("--var", "APP_EXTRA_COMPOSE_FILES=$AppExtraComposeFiles")
  }

  if ($RustfsExtraComposeFiles) {
    $actArgs += @("--var", "RUSTFS_EXTRA_COMPOSE_FILES=$RustfsExtraComposeFiles")
  }

  $actCommand = if ($script:ActPath) { $script:ActPath } else { "act" }
  & $actCommand @actArgs
  if ($LASTEXITCODE -ne 0) {
    throw "act workflow test failed with exit code $LASTEXITCODE."
  }
}
finally {
  if ($InstallTemporaryAccess -and -not $KeepTemporaryAccess -and $publicKey) {
    $sudoPrefix = if ($Password) { "echo '$Password' | sudo -S" } else { "sudo" }
    $cleanupScript = @"
set -eu
tmp=`$(mktemp)
grep -vxF '$publicKey' ~/.ssh/authorized_keys > "`$tmp" || true
cat "`$tmp" > ~/.ssh/authorized_keys
rm -f "`$tmp"
chmod 600 ~/.ssh/authorized_keys
$sudoPrefix rm -f /etc/sudoers.d/website-act-local-deploy
"@
    $cleanupPath = Join-Path $tempRoot "cleanup-act-access.sh"
    New-LfFile $cleanupPath $cleanupScript
    try {
      Invoke-Pscp $cleanupPath "/tmp/cleanup-act-access.sh"
      Invoke-Plink "bash /tmp/cleanup-act-access.sh"
    }
    catch {
      Write-Warning "Temporary access cleanup failed: $($_.Exception.Message)"
    }
  }

  try {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction Stop
    }
  }
  catch {
    Write-Warning "Temporary local file cleanup failed: $($_.Exception.Message)"
  }
}
