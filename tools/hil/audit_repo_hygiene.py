#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SUSPICIOUS_PATTERNS = (
    "/build/",
    "docs/build/",
    ".docusaurus/",
    "node_modules/",
    "dist/",
    ".log",
)
ALLOWLIST = {
    "packages/zplc-ide/build/entitlements.mac.plist",
}


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def main() -> int:
    offenders: list[str] = []
    for path in tracked_files():
        if path in ALLOWLIST:
            continue
        normalized = f"/{path}"
        if any(
            pattern in normalized or path.endswith(pattern)
            for pattern in SUSPICIOUS_PATTERNS
        ):
            offenders.append(path)

    if offenders:
        print("Repository hygiene audit found tracked suspicious paths:")
        for offender in offenders:
            print(f" - {offender}")
        return 1

    print("Repository hygiene audit passed: no tracked suspicious paths detected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
