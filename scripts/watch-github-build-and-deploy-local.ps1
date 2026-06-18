param(
  [string]$Repository = "tabeeb09/oi.loftrop.com",
  [string]$WorkflowName = "Build and Push Website",
  [string]$Ref = "main",
  [string]$HostName = "host.docker.internal",
  [string]$SshHostName = "127.0.0.1",
  [string]$UserName = "project",
  [int]$Port = 2222,
  [string]$Password,
  [string]$PuttyHostKey,
  [ValidateSet("app", "full", "rustfs", "status")]
  [string]$DeployScope = "app",
  [string]$AppExtraComposeFiles = "",
  [string]$RustfsExtraComposeFiles = "",
  [int]$PollSeconds = 15,
  [int]$TimeoutMinutes = 20
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "."
$sha = (git rev-parse $Ref).Trim()
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$headers = @{ "User-Agent" = "website-local-actions-watcher" }

Write-Host "Watching $Repository for successful '$WorkflowName' run at $sha"

while ((Get-Date) -lt $deadline) {
  $runs = (Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Repository/actions/runs?per_page=20").workflow_runs
  $run = $runs |
    Where-Object { $_.head_sha -eq $sha -and $_.name -eq $WorkflowName } |
    Select-Object -First 1

  if ($run) {
    Write-Host "$($run.status) $($run.conclusion) $($run.html_url)"

    if ($run.status -eq "completed") {
      if ($run.conclusion -ne "success") {
        throw "Build workflow completed with conclusion '$($run.conclusion)'."
      }

      & "$repoRoot\scripts\test-github-actions-deploy-local.ps1" `
        -HostName $HostName `
        -SshHostName $SshHostName `
        -UserName $UserName `
        -Port $Port `
        -Password $Password `
        -PuttyHostKey $PuttyHostKey `
        -InstallTemporaryAccess `
        -DeployScope $DeployScope `
        -AppExtraComposeFiles $AppExtraComposeFiles `
        -RustfsExtraComposeFiles $RustfsExtraComposeFiles

      if ($LASTEXITCODE -ne 0) {
        throw "Local act deploy failed with exit code $LASTEXITCODE."
      }

      exit 0
    }
  }
  else {
    Write-Host "No matching run found yet."
  }

  Start-Sleep -Seconds $PollSeconds
}

throw "Timed out waiting for $WorkflowName at $sha."
