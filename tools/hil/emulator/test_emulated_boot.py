"""Boot tests of the emulated bench: they run the firmware in its emulator and skip when either is missing.

    python3 -B -m unittest test_emulated_boot          (from tools/hil/emulator, after setup.sh and build.sh)
"""
import json
import os
import re
import select
import tempfile
import time
import unittest
from pathlib import Path

import bench_emulated as emu

PICO_IMAGE = Path(os.environ.get("ZPLC_EMU_IMAGE") or emu.fw_out() / "emu-pico/zephyr/zephyr.uf2")
HAVE_PICO = (emu.emu_dir() / "rp2040js/node_modules/tsx").is_dir() and PICO_IMAGE.is_file()


def shell(port: str, command: str, until: str, timeout: float = 10.0) -> str:
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY)
    try:
        os.write(fd, command.encode() + b"\r")
        text, end = "", time.monotonic() + timeout
        while until not in text and time.monotonic() < end:
            ready, _, _ = select.select([fd], [], [], 0.1)
            if ready:
                text += os.read(fd, 4096).decode(errors="replace")
        return text
    finally:
        os.close(fd)


def info(bench) -> dict:
    """The identity the image reports, once its boot messages, which the shell prints too, are over."""
    bench.sleep(1.5)
    text = shell(bench.port(), "zplc sys info --json", "}}")
    return json.loads(re.search(r'\{"board".*\}\}', text).group(0))


@unittest.skipUnless(HAVE_PICO, f"needs rp2040js in {emu.emu_dir()} (setup.sh) and {PICO_IMAGE} (build.sh pico)")
class PicoBootTests(unittest.TestCase):
    def test_the_image_boots_answers_on_the_bench_port_and_a_power_cycle_reboots_it_on_the_same_port(self):
        with tempfile.TemporaryDirectory() as work:
            bench = emu.EmulatorBench("rpi_pico", workdir=Path(work))
            try:
                bench.flash(PICO_IMAGE)
                port = bench.port()
                first = info(bench)
                self.assertEqual(first["board"], "rpi_pico")
                self.assertGreaterEqual(bench.now_ms(), 1500.0)  # simulated time
                bench.power_cycle()
                self.assertEqual(bench.port(), port)
                again = info(bench)
                self.assertEqual(again["board"], "rpi_pico")
                self.assertLess(again["uptime_ms"], first["uptime_ms"] + 1000)
                self.assertEqual(bench.boots, 2)
            finally:
                bench.close()


if __name__ == "__main__":
    unittest.main()
