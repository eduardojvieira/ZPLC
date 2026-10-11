#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "firmware/app/boards/boards.json"
LIBRARY = ROOT / "firmware/zephyr/scripts/zplc_boards.py"


def _load_library():
    spec = importlib.util.spec_from_file_location("zplc_boards", LIBRARY)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# The manifest rules (keys, channels, addresses, safe values, support level) live in one place, the library that the
# firmware generator and the board reference generator use as well (IO-001, IO-012).
boards_lib = _load_library()


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


def read_cross_build_entries(workflow: Path) -> list[dict[str, str]]:
    """The include items of the zephyr-cross-build matrix: id, board and, when present, tidy_board."""
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

    entries: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for line in lines[include + 1 : include_end]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        line_indent = indent(line)
        if line_indent == 10:
            match = re.fullmatch(r"- id:\s*(.*)", stripped)
            if not match:
                raise ValueError("zephyr-cross-build include items must start with - id")
            if current is not None and "board" not in current:
                raise ValueError("zephyr-cross-build include item is missing board")
            item_id = scalar(match.group(1), "an id")
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", item_id):
                raise ValueError("zephyr-cross-build include item has an invalid id")
            current = {"id": item_id}
            entries.append(current)
            continue
        if line_indent == 12 and current is not None:
            # board names what is built; tidy_board names the board in clang-tidy-app-baseline.json
            match = re.fullmatch(r"(board|tidy_board):\s*(.*)", stripped)
            # tidy_board follows the board it qualifies: before it, the item is as malformed as it was before the key existed
            if not match or match.group(1) in current or (match.group(1) == "tidy_board" and "board" not in current):
                raise ValueError(
                    "zephyr-cross-build include items may contain only one board after id"
                )
            current[match.group(1)] = scalar(match.group(2), "a board entry")
            continue
        raise ValueError("zephyr-cross-build include has malformed indentation or structure")

    if current is None:
        raise ValueError("zephyr-cross-build include contains no items")
    if "board" not in current:
        raise ValueError("zephyr-cross-build include item is missing board")
    return entries


def read_cross_build_boards(workflow: Path) -> list[str]:
    return [entry["board"] for entry in read_cross_build_entries(workflow)]


def tidy_board_errors(entries: list[dict[str, str]], boards: list[dict[str, object]]) -> list[str]:
    """tidy_board must be the manifest board id of the zephyr board it sits next to."""
    by_zephyr = {str(b.get("zephyr_board")): str(b.get("board_id")) for b in boards if isinstance(b, dict)}
    errors: list[str] = []
    for entry in entries:
        tidy = entry.get("tidy_board")
        if tidy is None:
            errors.append(f"zephyr-cross-build item {entry['id']} is missing tidy_board")
        elif by_zephyr.get(entry["board"]) not in (None, tidy):
            errors.append(
                f"zephyr-cross-build item {entry['id']}: tidy_board {tidy} is not the manifest board id "
                f"{by_zephyr[entry['board']]} of {entry['board']}"
            )
    return errors


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

    errors.extend(boards_lib.validate_manifest(data, ROOT))
    if not isinstance(data, list) or not data:
        data = []

    for index, entry in enumerate(data):
        if not isinstance(entry, dict) or any(key not in entry for key in boards_lib.BOARD_REQUIRED):
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
            matrix_entries = read_cross_build_entries(ROOT / ".github/workflows/ci.yml")
        except ValueError as error:
            errors.append(str(error))
        else:
            matrix_boards = [entry["board"] for entry in matrix_entries]
            errors.extend(cross_build_board_errors(expected_boards, matrix_boards))
            errors.extend(tidy_board_errors(matrix_entries, data))

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
