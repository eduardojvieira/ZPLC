#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
SPECS = ROOT / "specs"


def main() -> int:
    offenders: list[str] = []
    for spec_file in sorted(SPECS.glob("*/spec.md")):
        text = spec_file.read_text().lower()
        if "**status**: archived" in text or "**status**: superseded" in text:
            continue
        line_count = len(text.splitlines())
        if (
            line_count < 20
            or "to be expanded" in text
            or "[needs clarification" in text
        ):
            offenders.append(str(spec_file.relative_to(ROOT)))

    if offenders:
        print("Spec scope audit found placeholder or stale specs:")
        for offender in offenders:
            print(f" - {offender}")
        return 1

    print("Spec scope audit passed: no placeholder specs detected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
