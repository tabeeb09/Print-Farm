param(
  [string] $OrcaRoot = "C:\website\OrcaSlicer",
  [switch] $SkipDeps,
  [switch] $AllowInsecureHashPinnedDownloads
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$printStage = Resolve-Path (Join-Path $scriptDir "..")
$installer = Join-Path $scriptDir "install-orca-lan-print-target.ps1"
$vsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"

if (-not (Test-Path $OrcaRoot)) {
  git clone --depth 1 --filter=blob:none https://github.com/OrcaSlicer/OrcaSlicer.git $OrcaRoot
}

& $installer -OrcaRoot $OrcaRoot

$orcaPath = (Resolve-Path $OrcaRoot).Path
$driveName = [System.IO.Path]::GetPathRoot($orcaPath).Substring(0, 1)
$drive = Get-PSDrive -Name $driveName
if ($drive.Free -lt 20GB) {
  Write-Warning ("Only {0:N1} GB free on {1}:. Orca's dependency build is large; free disk space if the build fails." -f ($drive.Free / 1GB), $drive.Name)
}

$batch = Join-Path $env:TEMP "build-orca-lan-print-target.cmd"
$tlsLine = if ($AllowInsecureHashPinnedDownloads) { "set CMAKE_TLS_VERIFY=0" } else { "rem CMAKE_TLS_VERIFY unchanged" }
$depsBlock = if ($SkipDeps) {
  "echo Skipping Orca dependency build"
} else {
  @"
cd /d "$OrcaRoot\deps"
if not exist build mkdir build
cd build
set CMAKE_POLICY_VERSION_MINIMUM=3.5
cmake ../ -G "Visual Studio 17 2022" -A x64 -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 exit /b 1
cmake --build . --config Release --target deps -- -m
if errorlevel 1 exit /b 1
"@
}

@"
@echo off
setlocal
$tlsLine
call "$vsDevCmd" -arch=x64
cd /d "$OrcaRoot"
$depsBlock
if errorlevel 1 exit /b 1
cd /d "$OrcaRoot"
if not exist build mkdir build
cd build
set CMAKE_POLICY_VERSION_MINIMUM=3.5
cmake .. -G "Visual Studio 17 2022" -A x64 -DORCA_TOOLS=ON -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 exit /b 1
cmake --build . --config Release --target OrcaSlicer_lan_print -- -m
if errorlevel 1 exit /b 1
"@ | Set-Content -LiteralPath $batch -Encoding ASCII

cmd.exe /d /c $batch

$exe = Join-Path $OrcaRoot "build\src\Release\OrcaSlicer_lan_print.exe"
if (-not (Test-Path $exe)) {
  throw "Build finished but expected executable was not found: $exe"
}

$binDir = Join-Path $printStage "orca-lan-wrapper\bin"
New-Item -ItemType Directory -Force $binDir | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $binDir "OrcaSlicer_lan_print.exe") -Force
Write-Host "[orca-lan] built $exe"
Write-Host "[orca-lan] copied wrapper to $(Join-Path $binDir "OrcaSlicer_lan_print.exe")"
