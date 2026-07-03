# Orca LAN Helper

This helper is a thin C++ entry point that links against OrcaSlicer internals and invokes the Bambu LAN networking path directly.

It is intended to be built against an OrcaSlicer source checkout, not against the standalone print worker repo alone.

## Build

Provide Orca include paths, library paths, and libraries via CMake cache variables:

```powershell
cmake -S . -B build `
  -DORCA_INCLUDE_DIRS=C:/src/OrcaSlicer/src `
  -DORCA_LIBRARY_DIRS=C:/src/OrcaSlicer/build/lib `
  -DORCA_LIBRARIES="orca_gui;orca_utils;orca_network"

cmake --build build --config Release
```

## Run

```powershell
orca-lan-helper.exe `
  --job C:\temp\job.gcode.3mf `
  --ip 192.168.1.123 `
  --serial PRINTER_SERIAL `
  --access-code ACCESS_CODE `
  --project-name job `
  --plate-index 1
```

Use `--send-to-sdcard` if you want upload-only behavior instead of immediate local print.
