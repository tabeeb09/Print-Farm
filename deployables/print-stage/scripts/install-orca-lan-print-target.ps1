param(
  [string] $OrcaRoot = "C:\website\OrcaSlicer"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$printStage = Resolve-Path (Join-Path $scriptDir "..")
$sourceFile = Join-Path $printStage "orca-lan-wrapper\src\main.cpp"
$fileTransferSourceFile = Join-Path $printStage "orca-lan-wrapper\src\file_transfer_min.cpp"
$orcaSrc = Join-Path $OrcaRoot "src"
$targetFile = Join-Path $orcaSrc "OrcaSlicer_lan_print.cpp"
$fileTransferTargetFile = Join-Path $orcaSrc "OrcaSlicer_lan_file_transfer_min.cpp"
$cmakeFile = Join-Path $orcaSrc "CMakeLists.txt"

if (-not (Test-Path $sourceFile)) {
  throw "Missing wrapper source: $sourceFile"
}
if (-not (Test-Path $fileTransferSourceFile)) {
  throw "Missing wrapper file transfer source: $fileTransferSourceFile"
}
if (-not (Test-Path $cmakeFile)) {
  throw "Missing Orca CMake file: $cmakeFile"
}

Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
Copy-Item -LiteralPath $fileTransferSourceFile -Destination $fileTransferTargetFile -Force

$cmake = Get-Content -LiteralPath $cmakeFile -Raw
$marker = "# On Windows, a shim application is required"
$block = @'

if (SLIC3R_GUI)
    add_executable(OrcaSlicer_lan_print
        OrcaSlicer_lan_print.cpp
        OrcaSlicer_lan_file_transfer_min.cpp
        slic3r/Utils/BBLNetworkPlugin.cpp
        slic3r/Utils/BBLPrinterAgent.cpp
        slic3r/Utils/NetworkAgent.cpp
    )
    target_include_directories(OrcaSlicer_lan_print PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/slic3r/Utils)
    target_link_libraries(OrcaSlicer_lan_print PRIVATE libslic3r cereal::cereal boost_libs)
    target_compile_definitions(OrcaSlicer_lan_print PRIVATE -DBOOST_ALL_NO_LIB -DBOOST_USE_WINAPI_VERSION=0x602 -DBOOST_SYSTEM_USE_UTF8)

    if (MSVC)
        target_link_options(OrcaSlicer_lan_print PUBLIC "$<$<CONFIG:RELEASE>:/DEBUG>")
        target_link_libraries(OrcaSlicer_lan_print PRIVATE ws2_32.lib user32.lib Setupapi.lib)
        set(_orca_dep_lib_dir "${DEP_BUILD_DIR}/OrcaSlicer_dep/usr/local/lib")
        if (EXISTS "${_orca_dep_lib_dir}/libmpfr-4.lib" AND EXISTS "${_orca_dep_lib_dir}/libgmp-10.lib")
            target_link_libraries(OrcaSlicer_lan_print PRIVATE "${_orca_dep_lib_dir}/libmpfr-4.lib" "${_orca_dep_lib_dir}/libgmp-10.lib")
        endif ()
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

if ($cmake -match "OrcaSlicer_lan_print") {
  if ($cmake -match "OrcaSlicer_lan_file_transfer_min\.cpp") {
    Write-Host "[orca-lan] OrcaSlicer_lan_print target already present"
    exit 0
  }

  $targetPattern = "(?s)\r?\nif \(SLIC3R_GUI\)\s+add_executable\(OrcaSlicer_lan_print.*?\r?\nendif \(\)\r?\n\r?\n(?=$([regex]::Escape($marker)))"
  if ($cmake -notmatch $targetPattern) {
    throw "OrcaSlicer_lan_print target exists, but the installer could not safely upgrade its CMake block in $cmakeFile"
  }

  $cmake = [regex]::Replace($cmake, $targetPattern, $block, 1)
  Set-Content -LiteralPath $cmakeFile -Value $cmake -NoNewline
  Write-Host "[orca-lan] upgraded OrcaSlicer_lan_print target in $OrcaRoot"
  exit 0
}

if (-not $cmake.Contains($marker)) {
  throw "Could not find CMake insertion marker in $cmakeFile"
}

$cmake = $cmake.Replace($marker, $block + $marker)
Set-Content -LiteralPath $cmakeFile -Value $cmake -NoNewline
Write-Host "[orca-lan] installed OrcaSlicer_lan_print target into $OrcaRoot"
