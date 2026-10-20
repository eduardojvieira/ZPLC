#!/usr/bin/env python3
"""RT-020, HIL-010: the hardware watchdog is on only in the HIL image until a board has its record.

The rule of firmware/app/CMakeLists.txt, both ways, on the Raspberry Pi Pico (whose boards.json entry keeps the
watchdog off until its record exists):

  refused   a build that turns the watchdog on by itself stops at configure time, and says to build the HIL image
  accepted  the HIL image (-DCONFIG_ZPLC_HIL_IMAGE=y) builds, with the watchdog on, and says what it is: HIL_IMAGE=y in
            the build options `zplc sys build` reports, and the line `zplc version` prints, in the image itself

Usage:  ZPLC_FW_WS=<west workspace> python3 firmware/tests/hil_image/test_hil_image.py
Builds only: nothing here runs on a board.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
WORKSPACE = Path(os.environ.get("ZPLC_FW_WS", Path.home() / "zplc-zephyr-ws"))
BOARD = "rpi_pico/rp2040"
VERSION_LINE = b"HIL image, hardware watchdog on for a record run"


def check(condition: bool, message: str) -> None:
    if not condition:
        print(f"FAIL: {message}")
        sys.exit(1)
    print(f"ok: {message}")


def west(directory: Path, *options: str, cmake_only: bool = False) -> tuple[int, str]:
    command = (
        f'. "{REPO}/tools/firmware-test/env.sh" && cd "{WORKSPACE}" && '
        f'west build -p always -b {BOARD} zplc/firmware/app -d "{directory}"{" --cmake-only" if cmake_only else ""} -- '
        + " ".join(options)
    )
    result = subprocess.run(["bash", "-c", command], env={**os.environ, "ZPLC_FW_WS": str(WORKSPACE)},
                            capture_output=True, text=True, check=False)
    return result.returncode, result.stdout + result.stderr


def main() -> int:
    if not (WORKSPACE / "zephyr" / "VERSION").exists():
        print(f"error: no Zephyr workspace at {WORKSPACE}; set ZPLC_FW_WS (tools/firmware-test/setup.sh)", file=sys.stderr)
        return 2
    work = Path(tempfile.mkdtemp(prefix="zplc-hil-image-"))

    code, text = west(work / "watchdog-alone", "-DCONFIG_WATCHDOG=y", "-DCONFIG_ZPLC_HARDWARE_WATCHDOG=y", cmake_only=True)
    check(code != 0, "a build that turns the watchdog on in a profile without a record is refused")
    check("keeps the hardware watchdog of" in text and "-DCONFIG_ZPLC_HIL_IMAGE=y" in text,
          "and the refusal says to build the HIL image for the record run")

    code, text = west(work / "hil-image", "-DCONFIG_ZPLC_HIL_IMAGE=y")
    if code != 0:
        print(text[-3000:])
    check(code == 0, "the HIL image builds")
    config = (work / "hil-image" / "zephyr" / ".config").read_text()
    check("CONFIG_ZPLC_HIL_IMAGE=y" in config and "CONFIG_ZPLC_HARDWARE_WATCHDOG=y" in config,
          "with the hardware watchdog on")
    headers = [h for h in (work / "hil-image").rglob("*.h") if "ZPLC_FW_OPTIONS" in h.read_text(errors="ignore")]
    check(any("HIL_IMAGE=y" in h.read_text() for h in headers), "its build options say HIL_IMAGE=y (zplc sys build)")
    check(VERSION_LINE in (work / "hil-image" / "zephyr" / "zephyr.elf").read_bytes(),
          "and the image carries the line `zplc version` prints for it")
    return 0


if __name__ == "__main__":
    sys.exit(main())
