# Orca LAN Helper

This helper is a thin C++ entry point that links against OrcaSlicer internals and invokes the Bambu LAN networking path directly.

It is intended to be built against an OrcaSlicer source checkout, not against the standalone print worker repo alone.

## Build

Use the print-stage build script from PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File C:\website\Print-Farm\deployables\print-stage\scripts\build-orca-lan-print-target.ps1 `
  -OrcaRoot C:\website\OrcaSlicer `
  -AllowInsecureHashPinnedDownloads
```

The script injects a minimal headless target into the OrcaSlicer checkout. It compiles the wrapper plus Orca's Bambu networking source files, avoiding a full `libslic3r_gui` build. It also copies `bambu_networking_*.dll` from the local Orca profile plugin folder into `orca-lan-wrapper\bin\plugins` when available.

## Run

```powershell
C:\website\Print-Farm\deployables\print-stage\orca-lan-wrapper\bin\OrcaSlicer_lan_print.exe `
  --job C:\temp\job.gcode.3mf `
  --ip 192.168.1.123 `
  --serial PRINTER_SERIAL `
  --access-code ACCESS_CODE `
  --project-name job `
  --plate-index 1
```

Use `--send-to-sdcard` if you want upload-only behavior instead of immediate local print.
