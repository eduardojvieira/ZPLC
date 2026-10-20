#!/usr/bin/env python3
"""RT-020, HIL-010: the hardware watchdog is on only in the HIL image until a board has its record.

The rule of firmware/app/CMakeLists.txt, both ways, on the Raspberry Pi Pico (whose boards.json entry keeps the
watchdog off until its record exists):

  refused   a build that turns the watchdog on by itself stops at configure time, and says to build the HIL image
  accepted  the HIL image (-DCONFIG_ZPLC_HIL_IMAGE=y) builds, with the watchdog on, and says what it is: HIL_IMAGE=y in
            the build options `zplc sys build` reports, and the line `zplc version` prints, in the image itself
  RETAIN    the HIL image also keeps RETAIN across a power cycle (CONFIG_ZPLC_RETAIN_PERSIST, RT-025), which the RETAIN
            step of the record needs, and it fits the Pico's storage partition; the shipped profile has it on too (RT-025)

It needs a west workspace whose `zplc` is this checkout, named by ZPLC_FW_WS (tools/firmware-test/setup.sh); without
one it is skipped and says so, as in the CI job of the Python tests, which has no Zephyr workspace.

Usage:  ZPLC_FW_WS=<west workspace> python3 -B -m unittest tools/hil/test_hil_image.py
Builds only: nothing here runs on a board.
"""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORKSPACE = Path(os.environ.get("ZPLC_FW_WS", "/nonexistent"))
BOARD = "rpi_pico/rp2040"
VERSION_LINE = b"HIL image, hardware watchdog on for a record run"


def west(directory: Path, *options: str, cmake_only: bool = False) -> tuple[int, str]:
    command = (
        f'. "{REPO}/tools/firmware-test/env.sh" && cd "{WORKSPACE}" && '
        f'west build -p always -b {BOARD} zplc/firmware/app -d "{directory}"{" --cmake-only" if cmake_only else ""} -- '
        + " ".join(options)
    )
    result = subprocess.run(["bash", "-c", command], env={**os.environ, "ZPLC_FW_WS": str(WORKSPACE)},
                            capture_output=True, text=True, check=False)
    return result.returncode, result.stdout + result.stderr


def workspace_ready() -> bool:
    linked = WORKSPACE / "zplc"
    return (WORKSPACE / "zephyr" / "VERSION").exists() and linked.exists() and linked.samefile(REPO)


@unittest.skipUnless(workspace_ready(), "needs ZPLC_FW_WS: a west workspace whose zplc is this checkout")
class HilImageRule(unittest.TestCase):
    def test_the_watchdog_is_on_only_in_the_hil_image(self) -> None:
        work = Path(tempfile.mkdtemp(prefix="zplc-hil-image-"))

        code, text = west(work / "watchdog-alone", "-DCONFIG_WATCHDOG=y", "-DCONFIG_ZPLC_HARDWARE_WATCHDOG=y", cmake_only=True)
        self.assertNotEqual(code, 0, "a build that turns the watchdog on in a profile without a record is refused")
        self.assertIn("keeps the hardware watchdog of", text)
        self.assertIn("-DCONFIG_ZPLC_HIL_IMAGE=y", text, "and the refusal says to build the HIL image for the record run")

        code, text = west(work / "plain", cmake_only=True)
        self.assertEqual(code, 0, f"the shipped profile configures: {text[-2000:]}")
        self.assertIn("CONFIG_ZPLC_RETAIN_PERSIST=y", (work / "plain" / "zephyr" / ".config").read_text(),
                      "the shipped profile keeps RETAIN across a power cycle (RT-025)")

        code, text = west(work / "hil-image", "-DCONFIG_ZPLC_HIL_IMAGE=y")
        self.assertEqual(code, 0, f"the HIL image builds: {text[-3000:]}")
        config = (work / "hil-image" / "zephyr" / ".config").read_text()
        self.assertIn("CONFIG_ZPLC_HIL_IMAGE=y", config)
        self.assertIn("CONFIG_ZPLC_HARDWARE_WATCHDOG=y", config, "with the hardware watchdog on")
        headers = [h for h in (work / "hil-image").rglob("*.h") if "ZPLC_FW_OPTIONS" in h.read_text(errors="ignore")]
        self.assertTrue(any("HIL_IMAGE=y" in h.read_text() for h in headers), "its build options say HIL_IMAGE=y")
        self.assertIn("CONFIG_ZPLC_RETAIN_PERSIST=y", config, "with RETAIN persistence on, for the RETAIN step")
        self.assertTrue(any("RETAIN_PERSIST=y" in h.read_text() for h in headers), "which its build options say too")
        self.assertIn(VERSION_LINE, (work / "hil-image" / "zephyr" / "zephyr.elf").read_bytes(),
                      "and the image carries the line `zplc version` prints for it")


if __name__ == "__main__":
    unittest.main()
