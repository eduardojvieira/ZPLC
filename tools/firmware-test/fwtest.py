#!/usr/bin/env python3
"""Reports for the firmware test runner (tools/firmware-test/run.sh).

    fwtest.py twister <mode> <twister.json>
        One line per Twister scenario and a verdict. Exit 1 unless every
        scenario that was not filtered out passed.

    fwtest.py size --budget size-budget.json --logs <dir> [--board ID ...]
        Reads <dir>/<board id>.log (the output of `west build`), takes the
        linker's memory usage table, and prints flash and RAM per board next
        to its budget. Exit 1 when a board is over its budget, has no budget,
        or has no usable log.

    fwtest.py size --budget size-budget.json --log <file> --zephyr-board <name>
        The same check for one build log and the board whose "zephyr_board"
        is <name> (what the CI cross-build matrix has at hand).

    fwtest.py size --budget size-budget.json --logs <dir> --rebaseline
        Rewrites the measured values and the budgets of the boards that have a
        log, applying the margin policy stored in the file.

Standard library only. These numbers come from a host build or a QEMU run;
they are not hardware evidence.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

UNITS = {"B": 1, "KB": 1024, "MB": 1024 * 1024, "GB": 1024 * 1024 * 1024}
ROW = re.compile(
    r"^\s*([A-Za-z0-9_.]+):\s+(\d+)\s+(B|KB|MB|GB)\s+(\d+)\s+(B|KB|MB|GB)\s+([\d.]+)%\s*$"
)


# --------------------------------------------------------------- twister


def twister_summary(mode: str, report: Path) -> int:
    data = json.loads(report.read_text())
    suites = data.get("testsuites", [])
    failures = 0
    ran = 0
    filtered = 0
    for suite in suites:
        status = suite.get("status", "")
        if status == "filtered":
            filtered += 1
            continue
        ran += 1
        cases = suite.get("testcases", [])
        passed = sum(1 for c in cases if c.get("status") == "passed")
        verdict = "PASS" if status == "passed" else "FAIL"
        if verdict == "FAIL":
            failures += 1
        reason = suite.get("reason") or ""
        print(
            f"{verdict} {mode:<9} {suite.get('name', '?'):<46} "
            f"{passed}/{len(cases)} cases{('  ' + reason) if reason else ''}"
        )
    if ran == 0:
        print(f"FAIL {mode:<9} no scenario ran ({filtered} filtered out)")
        return 1
    print(
        f"{'PASS' if failures == 0 else 'FAIL'} {mode:<9} "
        f"{ran - failures}/{ran} scenarios passed, {filtered} filtered out"
    )
    return 0 if failures == 0 else 1


# ------------------------------------------------------------------ size


def parse_regions(text: str) -> dict[str, int]:
    """Used bytes per memory region from the linker's memory usage table."""
    regions: dict[str, int] = {}
    in_table = False
    for line in text.splitlines():
        if line.startswith("Memory region"):
            in_table = True
            continue
        if not in_table:
            continue
        match = ROW.match(line)
        if match is None:
            if line.strip() == "":
                continue
            in_table = False
            continue
        name, used, used_unit = match.group(1), int(match.group(2)), match.group(3)
        regions[name] = used * UNITS[used_unit]
    return regions


def region_total(regions: dict[str, int], names: list[str]) -> int | None:
    if not names or any(name not in regions for name in names):
        return None
    return sum(regions[name] for name in names)


def margin_budget(measured: int, policy: dict) -> int:
    grown = measured * (100 + int(policy["percent"])) / 100
    step = int(policy["round_to_bytes"])
    return int(math.ceil(grown / step) * step)


def size_report(
    budget_path: Path,
    logs: Path | None,
    boards: list[str],
    rebaseline: bool,
    single_log: Path | None = None,
    zephyr_board: str | None = None,
) -> int:
    budget = json.loads(budget_path.read_text())
    policy = budget["margin_policy"]
    selected = boards or sorted(budget["boards"])
    if single_log is not None:
        match = [k for k, v in budget["boards"].items() if v.get("zephyr_board") == zephyr_board]
        selected = match or [str(zephyr_board)]
    failures = 0
    rows = []

    for board_id in selected:
        entry = budget["boards"].get(board_id)
        if entry is None:
            rows.append((board_id, "FAIL", "no budget recorded for this board", None, None))
            failures += 1
            continue
        log = single_log if single_log is not None else logs / f"{board_id}.log"
        if not log.is_file():
            rows.append((board_id, "FAIL", f"no build log {log.name}", None, None))
            failures += 1
            continue
        regions = parse_regions(log.read_text(errors="replace"))
        flash = region_total(regions, entry["regions"]["flash"])
        ram = region_total(regions, entry["regions"]["ram"])
        if flash is None or ram is None:
            rows.append(
                (board_id, "FAIL", f"regions {entry['regions']} not in the build output {sorted(regions)}", None, None)
            )
            failures += 1
            continue

        if rebaseline:
            entry["measured"] = {"flash": flash, "ram": ram}
            entry["budget"] = {"flash": margin_budget(flash, policy), "ram": margin_budget(ram, policy)}

        over = []
        for kind, value in (("flash", flash), ("ram", ram)):
            limit = entry["budget"][kind]
            if value > limit:
                over.append(f"{kind} {value} > {limit} (+{value - limit})")
        verdict = "FAIL" if over and not rebaseline else "PASS"
        if verdict == "FAIL":
            failures += 1
        rows.append((board_id, verdict, "; ".join(over) or "within budget", flash, ram))

    print(f"{'board':<22} {'flash B':>9} {'budget':>9} {'ram B':>9} {'budget':>9}  verdict")
    for board_id, verdict, note, flash, ram in rows:
        entry = budget["boards"].get(board_id, {})
        limits = entry.get("budget", {})
        cells = (
            f"{flash if flash is not None else '-':>9} {limits.get('flash', '-'):>9} "
            f"{ram if ram is not None else '-':>9} {limits.get('ram', '-'):>9}"
        )
        print(f"{board_id:<22} {cells}  {verdict} {note if verdict == 'FAIL' else ''}".rstrip())

    if rebaseline:
        budget_path.write_text(json.dumps(budget, indent=2) + "\n")
        print(f"rewrote {budget_path}")
    print(f"{'PASS' if failures == 0 else 'FAIL'} size      {len(rows) - failures}/{len(rows)} boards within budget")
    return 0 if failures == 0 else 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    tw = sub.add_parser("twister")
    tw.add_argument("mode")
    tw.add_argument("report", type=Path)

    sz = sub.add_parser("size")
    sz.add_argument("--budget", type=Path, required=True)
    sz.add_argument("--logs", type=Path)
    sz.add_argument("--log", type=Path)
    sz.add_argument("--zephyr-board")
    sz.add_argument("--board", action="append", default=[])
    sz.add_argument("--rebaseline", action="store_true")

    args = parser.parse_args(argv)
    if args.command == "twister":
        return twister_summary(args.mode, args.report)
    if (args.log is None) == (args.logs is None):
        parser.error("size needs exactly one of --logs <dir> or --log <file>")
    if args.log is not None and not args.zephyr_board:
        parser.error("--log needs --zephyr-board")
    if args.log is not None and args.rebaseline:
        parser.error("--rebaseline works on --logs")
    return size_report(args.budget, args.logs, args.board, args.rebaseline, args.log, args.zephyr_board)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
