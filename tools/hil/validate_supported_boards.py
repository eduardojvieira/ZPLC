#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "firmware/app/boards/supported-boards.v1.5.0.json"


REQUIRED_KEYS = {
    "board_id",
    "display_name",
    "ide_id",
    "zephyr_board",
    "support_assets",
    "build_command",
    "network_class",
    "network_interface",
    "validation_level",
    "docs_ref",
}

VALID_NETWORK_CLASSES = {"serial-focused", "network-capable", "other"}
VALID_NETWORK_INTERFACES = {"none", "wifi", "ethernet"}


def main() -> int:
    data = json.loads(MANIFEST.read_text())
    errors: list[str] = []
    serial_count = 0
    network_count = 0

    if not isinstance(data, list) or not data:
        errors.append("supported board manifest must contain a non-empty list")

    for index, entry in enumerate(data):
        missing = sorted(REQUIRED_KEYS - entry.keys())
        if missing:
            errors.append(f"entry {index} missing keys: {', '.join(missing)}")
            continue

        assets = entry["support_assets"]
        if not isinstance(assets, list) or not assets:
            errors.append(f"{entry['ide_id']} must list support_assets")
        else:
            for asset in assets:
                if not (ROOT / asset).exists():
                    errors.append(
                        f"{entry['ide_id']} references missing asset: {asset}"
                    )

        network_class = entry["network_class"]
        network_interface = entry["network_interface"]
        if network_class not in VALID_NETWORK_CLASSES:
            errors.append(
                f"{entry['ide_id']} has invalid network_class: {network_class}"
            )
        if network_interface not in VALID_NETWORK_INTERFACES:
            errors.append(
                f"{entry['ide_id']} has invalid network_interface: {network_interface}"
            )
        if network_class == "serial-focused":
            serial_count += 1
        if network_class == "network-capable":
            network_count += 1

    if serial_count == 0:
        errors.append("manifest must contain at least one serial-focused board")
    if network_count == 0:
        errors.append("manifest must contain at least one network-capable board")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(f"Validated {len(data)} supported boards from {MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
