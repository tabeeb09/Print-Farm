[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$ImageName = "oi-loftrop/bootstrap-tools:local",
  [string]$GoogleClientSecretsFile = "",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$BootstrapArgs
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$repoRootPath = $repoRoot.Path.TrimEnd("\")

function Get-CleanPath {
  param(
    [string]$HostPath
  )

  $cleanPath = $HostPath.Trim()
  $cleanPath = $cleanPath -replace '[\u0000-\u001F]', ''
  $cleanPath = $cleanPath -replace '[`"''“”‘’]', ''
  return $cleanPath.Trim()
}

function Get-MountedGoogleSecretFile {
  param(
    [string]$HostPath
  )

  $cleanPath = Get-CleanPath -HostPath $HostPath
  $resolved = Resolve-Path -LiteralPath $cleanPath
  return Get-Item -LiteralPath $resolved
}

function Convert-RepoPathForContainer {
  param(
    [string]$HostPath
  )

  $cleanPath = Get-CleanPath -HostPath $HostPath
  $resolved = Resolve-Path -LiteralPath $cleanPath
  $resolvedPath = $resolved.Path

  if (-not $resolvedPath.StartsWith($repoRootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Config file must be inside the repository so it can be mounted into the bootstrap container: $resolvedPath"
  }

  $relative = $resolvedPath.Substring($repoRootPath.Length).TrimStart("\")
  return "/work/$($relative -replace '\\','/')"
}

function Convert-RepoFileArgs {
  param(
    [string[]]$ArgsToConvert
  )

  $converted = New-Object System.Collections.Generic.List[string]
  $keys = @("--config", "--config-file")

  for ($i = 0; $i -lt $ArgsToConvert.Count; $i++) {
    $arg = $ArgsToConvert[$i]
    $matchedInline = $false

    foreach ($key in $keys) {
      $prefix = "$key="
      if ($arg.StartsWith($prefix)) {
        $converted.Add("$key=$(Convert-RepoPathForContainer -HostPath $arg.Substring($prefix.Length))")
        $matchedInline = $true
        break
      }
    }

    if ($matchedInline) {
      continue
    }

    if ($keys -contains $arg) {
      if ($i + 1 -ge $ArgsToConvert.Count) {
        throw "$arg requires a file path argument."
      }

      $converted.Add($arg)
      $converted.Add((Convert-RepoPathForContainer -HostPath $ArgsToConvert[$i + 1]))
      $i++
      continue
    }

    $converted.Add($arg)
  }

  return $converted.ToArray()
}

function Convert-GoogleSecretArg {
  param(
    [string[]]$ArgsToConvert
  )

  $converted = New-Object System.Collections.Generic.List[string]
  $mount = $null
  $keys = @("--google-client-secrets-file", "--google-client-secret-file")

  for ($i = 0; $i -lt $ArgsToConvert.Count; $i++) {
    $arg = $ArgsToConvert[$i]
    $matchedInline = $false

    foreach ($key in $keys) {
      $prefix = "$key="
      if ($arg.StartsWith($prefix)) {
        $hostPath = $arg.Substring($prefix.Length)
        $file = Get-MountedGoogleSecretFile -HostPath $hostPath
        $mount = $file.DirectoryName
        $converted.Add("$key=/google-oauth/$($file.Name)")
        $matchedInline = $true
        break
      }
    }

    if ($matchedInline) {
      continue
    }

    if ($keys -contains $arg) {
      if ($i + 1 -ge $ArgsToConvert.Count) {
        throw "$arg requires a file path argument."
      }

      $hostPath = $ArgsToConvert[$i + 1]
      $file = Get-MountedGoogleSecretFile -HostPath $hostPath
      $mount = $file.DirectoryName
      $converted.Add($arg)
      $converted.Add("/google-oauth/$($file.Name)")
      $i++
      continue
    }

    $converted.Add($arg)
  }

  return @{
    Args = $converted.ToArray()
    Mount = $mount
  }
}

$effectiveBootstrapArgs = New-Object System.Collections.Generic.List[string]
if ($GoogleClientSecretsFile) {
  $effectiveBootstrapArgs.Add("--google-client-secrets-file")
  $effectiveBootstrapArgs.Add($GoogleClientSecretsFile)
}
$effectiveBootstrapArgs.AddRange($BootstrapArgs)

$repoPathConversion = Convert-RepoFileArgs -ArgsToConvert $effectiveBootstrapArgs.ToArray()
$googleSecretConversion = Convert-GoogleSecretArg -ArgsToConvert $repoPathConversion

$dockerRunFlags = @("--rm")
if ([Console]::IsInputRedirected) {
  $dockerRunFlags += "-i"
} else {
  $dockerRunFlags += "-it"
}

$dockerArgs = @(
  "run",
  $dockerRunFlags,
  "-v",
  "${repoRoot}:/work"
)

if ($googleSecretConversion.Mount) {
  $dockerArgs += @("-v", "$($googleSecretConversion.Mount):/google-oauth:ro")
}

$dockerArgs += @(
  "-w",
  "/work",
  $ImageName
)
$dockerArgs += $googleSecretConversion.Args

docker build `
  -f (Join-Path $repoRoot "infra\bootstrap-tools.Dockerfile") `
  -t $ImageName `
  $repoRoot

& docker @dockerArgs
