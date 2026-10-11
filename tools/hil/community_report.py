#!/usr/bin/env python3
"""Record a report from a user as a community-reported record of a board (HIL-011).

A person other than the project's bench built, flashed or ran ZPLC on a board and told the project through the "Board
report" issue form (.github/ISSUE_TEMPLATE/board_report.yml). A maintainer reads the issue and runs

    python3 tools/hil/community_report.py --board rpi_pico --firmware-version 2.0.0-rc.4 \\
        --commit <40 hex> --image-sha256 <64 hex> --result pass|fail \\
        --issue https://github.com/eduardojvieira/ZPLC/issues/<n> --reported-by <handle> [--out DIR]

which writes `<board_id>-<date>-issue-<n>.json`, a flat `zplc.community-report/1` record. Adding it to `evidence_refs` of
the board in firmware/app/boards/boards.json is a person's edit, as for a hardware record. A community report is listed
beside the hardware records of the board (tools/docs/generate_board_reference.py) and is never a hardware record: it does
not raise the support level, which stays `cross-build` until a person ran the recorded procedure, and it never turns the
hardware watchdog on (RT-020).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "firmware/app/boards/boards.json"
SCHEMA = "zplc.community-report/1"
LEVEL = "community-reported"
ISSUE = re.compile(r"^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/issues/(\d+)$")


def _text(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ""


def record_from_report(report: dict[str, Any], manifest: list[dict[str, Any]]) -> dict[str, Any]:
    """The record of a report, or ValueError naming what keeps it from being bound to an exact image of a known board."""
    board = next((entry for entry in manifest if report.get("board") in (entry.get("ide_id"), entry.get("board_id"))), None)
    if board is None:
        raise ValueError(f"board {report.get('board')!r} is not in the board manifest")
    if not _text(report.get("firmware_version")):
        raise ValueError("the report names no firmware version (the output of `zplc version`)")
    if not re.fullmatch(r"[0-9a-f]{40}", str(report.get("commit", ""))):
        raise ValueError("the report names no 40-digit commit that the image reports")
    if not re.fullmatch(r"[0-9a-f]{64}", str(report.get("image_sha256", ""))):
        raise ValueError("the report names no 64-digit SHA-256 of the image that was flashed")
    if report.get("result") not in ("pass", "fail"):
        raise ValueError("the result of a report is pass or fail")
    if not ISSUE.fullmatch(str(report.get("issue", ""))):
        raise ValueError("the report names no issue of the project (https://github.com/<owner>/<repository>/issues/<n>)")
    if not _text(report.get("reported_by")):
        raise ValueError("the report names no reporter")
    return {
        "schema": SCHEMA,
        "level": LEVEL,
        "board_id": board["board_id"],
        "firmware_version": report["firmware_version"].strip(),
        "commit": report["commit"],
        "image_sha256": report["image_sha256"],
        "result": report["result"],
        "issue": report["issue"],
        "reported_by": report["reported_by"].strip(),
        "reported_at": report.get("reported_at"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--board", required=True, help="ide_id or board_id of the board in firmware/app/boards/boards.json")
    parser.add_argument("--firmware-version", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--image-sha256", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument("--issue", required=True)
    parser.add_argument("--reported-by", required=True)
    parser.add_argument("--date", help="the day the issue was filed, YYYY-MM-DD (default: today)")
    parser.add_argument("--out", default=str(ROOT / "build/hil-records"), help="the folder to write the record to")
    args = parser.parse_args(argv)
    from datetime import date

    try:
        record = record_from_report(
            {
                "board": args.board, "firmware_version": args.firmware_version, "commit": args.commit,
                "image_sha256": args.image_sha256, "result": args.result, "issue": args.issue,
                "reported_by": args.reported_by, "reported_at": args.date or date.today().isoformat(),
            },
            json.loads(MANIFEST.read_text()),
        )
    except ValueError as error:
        print(f"community_report: {error}", file=sys.stderr)
        return 2
    folder = Path(args.out)
    folder.mkdir(parents=True, exist_ok=True)
    number = ISSUE.fullmatch(record["issue"]).group(1)  # type: ignore[union-attr]
    path = folder / f"{record['board_id']}-{record['reported_at']}-issue-{number}.json"
    path.write_text(json.dumps(record, indent=2) + "\n")
    print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
