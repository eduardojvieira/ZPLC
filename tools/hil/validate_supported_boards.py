#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import re
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


def find_duplicates(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: list[str] = []
    for value in values:
        if value in seen and value not in duplicates:
            duplicates.append(value)
        seen.add(value)
    return duplicates


def indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def block_end(lines: list[str], start: int, end: int, block_indent: int) -> int:
    for index in range(start + 1, end):
        if lines[index].strip() and indent(lines[index]) <= block_indent:
            return index
    return end


def require_child(
    lines: list[str], start: int, end: int, parent_indent: int, name: str
) -> int:
    matches = [
        index
        for index in range(start + 1, end)
        if indent(lines[index]) == parent_indent + 2
        and lines[index].strip() == f"{name}:"
    ]
    if len(matches) != 1:
        raise ValueError(
            f"zephyr-cross-build must contain exactly one {name} block, found {len(matches)}"
        )
    return matches[0]


def scalar(value: str, description: str) -> str:
    result = value.split("#", 1)[0].strip()
    if not result:
        raise ValueError(f"zephyr-cross-build contains {description} without a value")
    return result


def read_cross_build_boards(workflow: Path) -> list[str]:
    try:
        lines = workflow.read_text().splitlines()
    except OSError as error:
        raise ValueError(f"cannot read workflow: {error}") from error

    jobs = [
        index
        for index, line in enumerate(lines)
        if line == "  zephyr-cross-build:"
    ]
    if len(jobs) != 1:
        raise ValueError(
            "workflow must contain exactly one top-level zephyr-cross-build job, "
            f"found {len(jobs)}"
        )
    job_start = jobs[0]
    job_end = next(
        (
            index
            for index in range(job_start + 1, len(lines))
            if re.match(r"^ {2}[A-Za-z0-9_-]+:\s*$", lines[index])
        ),
        len(lines),
    )
    if any("\t" in line for line in lines[job_start:job_end]):
        raise ValueError("zephyr-cross-build must not contain tab indentation")

    strategy = require_child(lines, job_start, job_end, 2, "strategy")
    strategy_end = block_end(lines, strategy, job_end, 4)
    matrix = require_child(lines, strategy, strategy_end, 4, "matrix")
    matrix_end = block_end(lines, matrix, strategy_end, 6)
    include = require_child(lines, matrix, matrix_end, 6, "include")
    include_end = block_end(lines, include, matrix_end, 8)

    boards: list[str] = []
    item_id: str | None = None
    item_board: str | None = None
    for line in lines[include + 1 : include_end]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        line_indent = indent(line)
        if line_indent == 10:
            match = re.fullmatch(r"- id:\s*(.*)", stripped)
            if not match:
                raise ValueError("zephyr-cross-build include items must start with - id")
            if item_id is not None and item_board is None:
                raise ValueError("zephyr-cross-build include item is missing board")
            item_id = scalar(match.group(1), "an id")
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", item_id):
                raise ValueError("zephyr-cross-build include item has an invalid id")
            item_board = None
            continue
        if line_indent == 12:
            match = re.fullmatch(r"board:\s*(.*)", stripped)
            if not match or item_id is None or item_board is not None:
                raise ValueError(
                    "zephyr-cross-build include items may contain only one board after id"
                )
            item_board = scalar(match.group(1), "a board entry")
            boards.append(item_board)
            continue
        raise ValueError("zephyr-cross-build include has malformed indentation or structure")

    if item_id is None:
        raise ValueError("zephyr-cross-build include contains no items")
    if item_board is None:
        raise ValueError("zephyr-cross-build include item is missing board")
    return boards


def cross_build_board_errors(expected: list[str], matrix: list[str]) -> list[str]:
    errors: list[str] = []
    missing = sorted(set(expected) - set(matrix))
    unexpected = sorted(set(matrix) - set(expected))
    duplicates = find_duplicates(matrix)
    manifest_duplicates = find_duplicates(expected)
    if len(matrix) != len(expected):
        errors.append(
            "zephyr-cross-build board cardinality mismatch: "
            f"expected {len(expected)}, found {len(matrix)}"
        )
    if missing:
        errors.append("zephyr-cross-build missing boards: " + ", ".join(missing))
    if unexpected:
        errors.append("zephyr-cross-build unexpected boards: " + ", ".join(unexpected))
    if duplicates:
        errors.append("zephyr-cross-build duplicate boards: " + ", ".join(duplicates))
    if manifest_duplicates:
        errors.append(
            "supported board manifest duplicate zephyr_board values: "
            + ", ".join(manifest_duplicates)
        )
    return errors


def main() -> int:
    try:
        data = json.loads(MANIFEST.read_text())
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: cannot read supported board manifest: {error}")
        return 1
    errors: list[str] = []
    serial_count = 0
    network_count = 0

    if not isinstance(data, list) or not data:
        errors.append("supported board manifest must contain a non-empty list")
        data = []

    for index, entry in enumerate(data):
        if not isinstance(entry, dict):
            errors.append(f"entry {index} must be an object")
            continue
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

    if isinstance(data, list):
        expected_boards = [
            entry["zephyr_board"]
            for entry in data
            if isinstance(entry, dict) and "zephyr_board" in entry
        ]
        try:
            matrix_boards = read_cross_build_boards(ROOT / ".github/workflows/ci.yml")
        except ValueError as error:
            errors.append(str(error))
        else:
            errors.extend(cross_build_board_errors(expected_boards, matrix_boards))

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
