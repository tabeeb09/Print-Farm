param(
  [string] $OrcaRoot = "C:\website\OrcaSlicer"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$printStage = Resolve-Path (Join-Path $scriptDir "..")
$sourceFile = Join-Path $printStage "orca-lan-wrapper\src\main.cpp"
$orcaSrc = Join-Path $OrcaRoot "src"
$targetFile = Join-Path $orcaSrc "OrcaSlicer_lan_print.cpp"
$cmakeFile = Join-Path $orcaSrc "CMakeLists.txt"

if (-not (Test-Path $sourceFile)) {
  throw "Missing wrapper source: $sourceFile"
}
if (-not (Test-Path $cmakeFile)) {
  throw "Missing Orca CMake file: $cmakeFile"
}

Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force

$cmake = Get-Content -LiteralPath $cmakeFile -Raw
if ($cmake -match "OrcaSlicer_lan_print") {
  Write-Host "[orca-lan] OrcaSlicer_lan_print target already present"
  exit 0
}

$marker = "# On Windows, a shim application is required"
$block = @'

if (SLIC3R_GUI)
    add_executable(OrcaSlicer_lan_print OrcaSlicer_lan_print.cpp)
    target_link_libraries(OrcaSlicer_lan_print PRIVATE libslic3r_gui libslic3r cereal::cereal)
    target_compile_definitions(OrcaSlicer_lan_print PRIVATE -DBOOST_ALL_NO_LIB -DBOOST_USE_WINAPI_VERSION=0x602 -DBOOST_SYSTEM_USE_UTF8)

    if (MSVC)
        target_link_options(OrcaSlicer_lan_print PUBLIC "$<$<CONFIG:RELEASE>:/DEBUG>")
        target_link_libraries(OrcaSlicer_lan_print PRIVATE ws2_32.lib user32.lib Setupapi.lib)
    elseif (MINGW)
        target_link_libraries(OrcaSlicer_lan_print PRIVATE ws2_32 uxtheme setupapi)
    elseif (APPLE)
        target_link_libraries(OrcaSlicer_lan_print PRIVATE "-framework OpenGL")
    else ()
        target_link_libraries(OrcaSlicer_lan_print PRIVATE ${CMAKE_DL_LIBS} Threads::Threads pangoft2-1.0 -ldl)
    endif ()

    install(TARGETS OrcaSlicer_lan_print RUNTIME DESTINATION ".")
endif ()

'@

if (-not $cmake.Contains($marker)) {
  throw "Could not find CMake insertion marker in $cmakeFile"
}

$cmake = $cmake.Replace($marker, $block + $marker)
Set-Content -LiteralPath $cmakeFile -Value $cmake -NoNewline
Write-Host "[orca-lan] installed OrcaSlicer_lan_print target into $OrcaRoot"
