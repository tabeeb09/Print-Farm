#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import zipfile
from pathlib import Path


def inspect_3mf(path: Path) -> dict:
    with zipfile.ZipFile(path, "r") as archive:
        names = archive.namelist()
        gcode_name = next((name for name in names if re.fullmatch(r"Metadata/plate_\d+\.gcode", name)), None)
        slice_info_name = next((name for name in names if name == "Metadata/slice_info.config"), None)
        return {
            "kind": "sliced" if gcode_name and slice_info_name else "project",
            "gcode_member": gcode_name,
            "has_slice_info": bool(slice_info_name),
        }


def extract_first_plate_gcode(path: Path, output_path: Path) -> dict:
    with zipfile.ZipFile(path, "r") as archive:
        names = archive.namelist()
        gcode_name = next((name for name in names if re.fullmatch(r"Metadata/plate_\d+\.gcode", name)), None)
        if not gcode_name:
            raise FileNotFoundError("Could not find Metadata/plate_*.gcode in the 3MF package.")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(gcode_name, "r") as src, open(output_path, "wb") as dst:
            dst.write(src.read())

        return {
            "gcode_member": gcode_name,
            "output_path": str(output_path),
            "size_bytes": output_path.stat().st_size,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect or extract Orca/Bambu 3MF package content.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_parser = subparsers.add_parser("inspect")
    inspect_parser.add_argument("input")

    extract_parser = subparsers.add_parser("extract-gcode")
    extract_parser.add_argument("input")
    extract_parser.add_argument("output")

    args = parser.parse_args()

    if args.command == "inspect":
      result = inspect_3mf(Path(args.input).expanduser().resolve())
      print(json.dumps(result))
      return 0

    if args.command == "extract-gcode":
      result = extract_first_plate_gcode(
          Path(args.input).expanduser().resolve(),
          Path(args.output).expanduser().resolve(),
      )
      print(json.dumps(result))
      return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
