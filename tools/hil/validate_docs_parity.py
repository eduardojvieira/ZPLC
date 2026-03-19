#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "docs/docs/reference/v1-5-canonical-docs-manifest.md"


def parse_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in MANIFEST.read_text().splitlines():
        if not line.startswith("|"):
            continue
        if "slug" in line or set(line.replace("|", "").strip()) == {"-"}:
            continue
        parts = [part.strip() for part in line.strip().strip("|").split("|")]
        if len(parts) != 7:
            continue
        rows.append(
            {
                "slug": parts[0],
                "english_path": parts[1],
                "spanish_path": parts[2],
                "area": parts[3],
                "release_blocking": parts[4],
                "owner": parts[5],
                "status": parts[6],
            }
        )
    return rows


def main() -> int:
    rows = parse_rows()
    errors: list[str] = []
    if not rows:
        errors.append("canonical docs manifest has no rows")

    for row in rows:
        if row["release_blocking"] != "yes":
            continue
        english = ROOT / row["english_path"]
        spanish = ROOT / row["spanish_path"]
        if not english.exists():
            errors.append(
                f"missing English page for {row['slug']}: {row['english_path']}"
            )
        if not spanish.exists():
            errors.append(
                f"missing Spanish page for {row['slug']}: {row['spanish_path']}"
            )

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(
        f"Validated {len(rows)} canonical docs rows from {MANIFEST.relative_to(ROOT)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
