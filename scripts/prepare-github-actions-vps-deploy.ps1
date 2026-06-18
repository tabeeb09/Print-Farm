param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [Parameter(Mandatory = $true)]
  [string]$UserName,

  [int]$Port = 22,

  [string]$KeyPath = "$HOME\.ssh\website-github-actions-ed25519",

  [switch]$InstallPublicKey
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

Require-Command ssh-keygen
Require-Command ssh-keyscan

$keyDir = Split-Path -Parent $KeyPath
if (-not (Test-Path $keyDir)) {
  New-Item -ItemType Directory -Path $keyDir | Out-Null
}

if (-not (Test-Path $KeyPath)) {
  ssh-keygen -t ed25519 -N "" -C "github-actions-website-deploy" -f $KeyPath | Out-Null
}

$publicKeyPath = "$KeyPath.pub"
$privateKey = Get-Content -Raw -Path $KeyPath
$privateKeyB64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($privateKey))
$publicKey = Get-Content -Raw -Path $publicKeyPath
$knownHosts = ssh-keyscan -p $Port -t ed25519,rsa $HostName 2>$null
if (-not $knownHosts) {
  throw "ssh-keyscan returned no host keys for $HostName on port $Port."
}
$knownHostsB64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(($knownHosts -join "`n") + "`n"))

if ($InstallPublicKey) {
  Require-Command ssh
  $escapedPublicKey = $publicKey.Trim().Replace("'", "'\''")
  ssh -p $Port "$UserName@$HostName" "install -m 700 -d ~/.ssh && grep -qxF '$escapedPublicKey' ~/.ssh/authorized_keys 2>/dev/null || printf '%s\n' '$escapedPublicKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
}

Write-Host ""
Write-Host "Add these GitHub repository secrets:"
Write-Host "DEPLOY_HOST=$HostName"
Write-Host "DEPLOY_USER=$UserName"
Write-Host "DEPLOY_SSH_PRIVATE_KEY:"
Write-Host $privateKey
Write-Host "DEPLOY_SSH_PRIVATE_KEY_B64:"
Write-Host $privateKeyB64
Write-Host "DEPLOY_SSH_KNOWN_HOSTS:"
Write-Host $knownHosts
Write-Host "DEPLOY_SSH_KNOWN_HOSTS_B64:"
Write-Host $knownHostsB64
Write-Host ""
Write-Host "Add this GitHub repository variable:"
Write-Host "DEPLOY_PORT=$Port"
Write-Host ""
Write-Host "Public key installed/generated at:"
Write-Host $publicKeyPath
