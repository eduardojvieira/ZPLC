#!/usr/bin/env python3
"""firmware/app on native_sim with the Pico channel map (`tools/firmware-test/run.sh app-native`): emulation only.

    python3 tools/hil/emulator/native_sim.py --check <build>/zephyr/zephyr.exe     boot it and check the channel map

`NativeSim` starts zephyr.exe on a flash file (a kill and a new start on the same file is a power cycle), talks to
its shell on the host pty it opens, and drives the I/O through the `emu` command of
firmware/tests/app_native_emulation: `press` an input, set an `adc` input, read the `outputs`.
"""
from __future__ import annotations

import os
import re
import select
import subprocess
import sys
import tempfile
import threading
import time
import tty
from pathlib import Path

PROMPT = "zplc:~$"


class NativeSim:
    def __init__(self, exe: Path, flash: Path):
        self.exe, self.flash = Path(exe), Path(flash)
        self.process: subprocess.Popen | None = None
        self.fd: int | None = None

    def start(self) -> None:
        self.process = subprocess.Popen([str(self.exe), f"-flash={self.flash}", "-rt"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        for line in self.process.stdout:
            match = re.search(rb"(/dev/pts/\d+)", line)
            if match:
                self.fd = os.open(match.group(1), os.O_RDWR | os.O_NOCTTY)
                tty.setraw(self.fd)
                break
        if self.fd is None:
            raise RuntimeError(f"{self.exe} did not report its pty")
        threading.Thread(target=self.process.stdout.read, daemon=True).start()
        self.read_until(PROMPT, 10)

    def stop(self) -> None:
        if self.process is not None:
            self.process.kill()
            self.process.wait()
            self.process = None
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def power_cycle(self) -> None:
        self.stop()
        self.start()

    def read_until(self, marker: str, timeout: float) -> str:
        text, end = "", time.monotonic() + timeout
        while marker not in text and time.monotonic() < end:
            ready, _, _ = select.select([self.fd], [], [], 0.05)
            if ready:
                text += os.read(self.fd, 4096).decode(errors="replace")
        return text

    def command(self, text: str, until: str = PROMPT, timeout: float = 5.0) -> str:
        while select.select([self.fd], [], [], 0)[0]:  # what an earlier command left (its prompt) is not this answer
            os.read(self.fd, 4096)
        os.write(self.fd, text.encode() + b"\r")
        return self.read_until(until, timeout)

    def press(self, gpio: int, active: bool) -> None:
        """A switch to GND on an input with a pull-up: pressed reads low."""
        self.command(f"emu pin {gpio} {0 if active else 1}", "OK:")

    def adc(self, channel: int, raw: int) -> None:
        self.command(f"emu adc {channel} {raw}", "OK:")

    def outputs(self) -> int:
        match = re.search(r"OUT 0x([0-9a-f]{8})", self.command("emu out"))
        if not match:
            raise RuntimeError("`emu out` did not answer")
        return int(match.group(1), 16)


def check(exe: Path) -> list[str]:
    """Problems found when booting the image: the Pico map is there and the emu command drives and reads it."""
    problems: list[str] = []
    with tempfile.TemporaryDirectory() as work:
        sim = NativeSim(exe, Path(work) / "flash.bin")
        sim.start()
        try:
            io = sim.command("zplc sys io")
            if "rpi-pico-rp2040" not in io:
                problems.append(f"`zplc sys io` does not report the Pico's description: {io.strip()[-160:]}")
            if "OK:" not in sim.command("emu pin 15 0", "OK:"):
                problems.append("`emu pin` did not drive GP15")
            if "OK:" not in sim.command("emu adc 0 2048", "OK:"):
                problems.append("`emu adc` did not set ADC input 0")
            sim.outputs()
        except RuntimeError as error:
            problems.append(str(error))
        finally:
            sim.stop()
    return problems


def main(argv: list[str] | None = None) -> int:
    import argparse  # noqa: PLC0415

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", type=Path, required=True, metavar="ZEPHYR_EXE")
    args = parser.parse_args(argv)
    problems = check(args.check)
    for problem in problems:
        print(f"app-native: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
