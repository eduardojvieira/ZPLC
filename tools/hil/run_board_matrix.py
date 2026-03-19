#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "firmware/app/boards/supported-boards.v1.5.0.json"


def main() -> int:
    manifest = json.loads(MANIFEST.read_text())
    failures: list[str] = []

    for entry in manifest:
        command = entry["build_command"]
        result = subprocess.run(
            command,
            cwd=ROOT,
            shell=True,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            failures.append(f"{entry['ide_id']}: {command}")

    if failures:
        print("Supported-board cross-build matrix failed:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print(f"Supported-board cross-build matrix passed for {len(manifest)} boards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
