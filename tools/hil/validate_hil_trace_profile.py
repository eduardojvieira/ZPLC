#!/usr/bin/env python3
"""A shipped board profile does not turn the HIL trace on (HIL-013).

The HIL trace puts a hook in the VM run loop. Release firmware must not carry it unless a build option enables it,
and the option is the one of tools/hil/hil_debug.conf, added to a HIL build with -DEXTRA_CONF_FILE=. This checks the
profiles of firmware/app/boards that the manifest lists, and that the overlay still turns the option on.

    python3 tools/hil/validate_hil_trace_profile.py        exit 0 when no profile sets it, 1 otherwise
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "firmware/app/boards/boards.json"
OVERLAY = Path(__file__).resolve().with_name("hil_debug.conf")
ON = re.compile(r"^\s*CONFIG_ZPLC_HIL_DEBUG\s*=\s*y\s*$")


def problems(manifest: list[dict], root: Path, overlay: Path, profile_dir: Path | None = None) -> list[str]:
    """What breaks the rule: every .conf the manifest lists, and every .conf of `profile_dir` (a profile the manifest forgot is checked too)."""
    found = []
    assets = [asset for board in manifest for asset in board.get("support_assets", [])]
    if profile_dir is not None:
        assets += [path.relative_to(root).as_posix() for path in sorted(profile_dir.glob("*.conf"))]
    for asset in dict.fromkeys(a for a in assets if a.endswith(".conf")):
        path = root / asset
        if not path.is_file():
            continue
        for number, line in enumerate(path.read_text().splitlines(), start=1):
            if ON.match(line):
                found.append(f"{asset}:{number} sets CONFIG_ZPLC_HIL_DEBUG=y: release firmware carries no HIL trace (HIL-013); use the overlay")
    if not overlay.is_file() or not any(ON.match(line) for line in overlay.read_text().splitlines()):
        found.append(f"{overlay.name} does not set CONFIG_ZPLC_HIL_DEBUG=y, so a HIL build has no trace")
    return found


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default=str(MANIFEST))
    parser.add_argument("--root", default=str(ROOT), help="the directory the support_assets paths are relative to")
    parser.add_argument("--overlay", default=str(OVERLAY))
    args = parser.parse_args(argv)
    manifest = json.loads(Path(args.manifest).read_text())
    root = Path(args.root)
    found = problems(manifest, root, Path(args.overlay), root / "firmware/app/boards" if (root / "firmware/app/boards").is_dir() else None)
    for line in found:
        print(f"ERROR: {line}")
    if not found:
        print("HIL trace profile check passed: no shipped profile turns the HIL trace on")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
