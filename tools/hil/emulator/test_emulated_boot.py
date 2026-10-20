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
ESP_IMAGE = emu.fw_out() / "emu-esp32s3/zephyr/zephyr.bin"
HAVE_ESP = (emu.emu_dir() / "qemu-esp/qemu/bin/qemu-system-xtensa").is_file() and ESP_IMAGE.is_file()


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
                port = bench.port()  # opened before the flash, as the chain does: the build's image runs
                bench.flash(PICO_IMAGE)
                self.assertEqual(bench.port(), port)
                first = info(bench)
                self.assertEqual(first["board"], "rpi_pico")
                self.assertGreaterEqual(bench.now_ms(), 1500.0)  # simulated time
                bench.sleep(5.0)
                before = bench.now_ms()  # simulated time of this boot, over 5 s more than the uptime a boot needs
                bench.power_cycle()
                self.assertEqual(bench.port(), port)
                again = info(bench)
                self.assertEqual(again["board"], "rpi_pico")
                self.assertLess(again["uptime_ms"], before)
                self.assertEqual(bench.boots, 3)  # the build, the flashed image, the power cycle
            finally:
                bench.close()


@unittest.skipUnless(HAVE_ESP, f"needs Espressif QEMU in {emu.emu_dir()} (setup.sh) and {ESP_IMAGE} (build.sh esp32s3)")
class Esp32s3BootTests(unittest.TestCase):
    def test_the_emulation_image_boots_in_qemu_answers_on_uart0_and_reboots_on_a_power_cycle(self):
        with tempfile.TemporaryDirectory() as work:
            bench = emu.EmulatorBench("esp32s3_devkitc", workdir=Path(work))
            try:
                port = bench.port()
                bench.flash(ESP_IMAGE)
                first = info(bench)
                self.assertEqual((first["board"], first["memory"]["work_size"]), ("esp32s3_devkitc", 2048))
                time.sleep(5.0)
                bench.power_cycle()
                self.assertEqual(bench.port(), port)
                again = info(bench)
                self.assertLess(again["uptime_ms"], first["uptime_ms"] + 4000)
                self.assertEqual(len((Path(work) / "flash.bin").read_bytes()), emu.ESP_FLASH_SIZE)
            finally:
                bench.close()


if __name__ == "__main__":
    unittest.main()
