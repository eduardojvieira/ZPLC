#!/usr/bin/env python3
"""A shipped board profile does not turn the HIL trace on (HIL-013).

The HIL trace puts a hook in the VM run loop. Release firmware must not carry it unless a build option enables it,
and the option is the one of tools/hil/hil_debug.conf, added to a HIL build with -DEXTRA_CONF_FILE=. This checks the
profiles of firmware/app/boards that the manifest lists, the files Zephyr applies for the Zephyr board name of each
entry, every .conf of that directory and prj.conf, and that the overlay still turns the option on.

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


def zephyr_names(zephyr_board: str) -> list[str]:
    """The file stems Zephyr applies from the application's boards/ for a board: <board>, <board>_<soc>, <board>_<soc>_<cluster>."""
    name, *qualifiers = zephyr_board.split("/")
    return [name] + ["_".join([name, *qualifiers[: i + 1]]) for i in range(len(qualifiers))]


def checked_assets(manifest: list[dict], root: Path, app_dir: Path | None = None, profile_dir: Path | None = None) -> list[str]:
    """Every .conf that can set the option for a shipped board, as a path relative to `root`; only files that exist.

    The `.conf` assets the manifest lists, the files Zephyr applies for the Zephyr board name of each entry, every
    `.conf` of the profile directory (a profile the manifest forgot is checked too), and the application's prj.conf.
    """
    boards_dir = profile_dir if profile_dir is not None else (app_dir / "boards" if app_dir is not None else None)
    assets = [asset for board in manifest for asset in board.get("support_assets", [])]
    if boards_dir is not None:
        for board in manifest:
            if board.get("zephyr_board"):
                assets += [(boards_dir / f"{stem}.conf").relative_to(root).as_posix() for stem in zephyr_names(board["zephyr_board"])]
        assets += [path.relative_to(root).as_posix() for path in sorted(boards_dir.glob("*.conf"))]
    if app_dir is not None:
        assets.append((app_dir / "prj.conf").relative_to(root).as_posix())
    return [asset for asset in dict.fromkeys(assets) if asset.endswith(".conf") and (root / asset).is_file()]


def problems(manifest: list[dict], root: Path, overlay: Path, profile_dir: Path | None = None, app_dir: Path | None = None) -> list[str]:
    """What breaks the rule: the option set to y in any of `checked_assets`, or an overlay that does not turn it on."""
    found = []
    for asset in checked_assets(manifest, root, app_dir, profile_dir):
        for number, line in enumerate((root / asset).read_text().splitlines(), start=1):
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
    app_dir = root / "firmware/app"
    found = problems(manifest, root, Path(args.overlay), app_dir=app_dir if app_dir.is_dir() else None)
    for line in found:
        print(f"ERROR: {line}")
    if not found:
        print("HIL trace profile check passed: no shipped profile turns the HIL trace on")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
