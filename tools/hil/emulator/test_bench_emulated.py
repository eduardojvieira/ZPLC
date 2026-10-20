"""Tests of the emulated bench that need no emulator (run by tools/ci/hil-emulator.test.ts).

The tests that boot an emulator are in test_emulated_boot.py and skip when the emulator or the image is missing.
"""
import hashlib
import os
import tempfile
import unittest
from pathlib import Path

import bench_emulated as emu


class BoardMapTests(unittest.TestCase):
    def test_pins_and_converter_inputs_are_read_from_the_manifest_text(self):
        self.assertEqual(emu.gpio_of("GP15"), 15)
        self.assertEqual(emu.gpio_of("GPIO0 (BOOT button)"), 0)
        self.assertIsNone(emu.gpio_of("VSYS/3 (ADC3)"))
        self.assertEqual(emu.adc_of("GP26 (ADC0)"), 0)
        self.assertEqual(emu.adc_of("Temperature sensor (ADC4)"), 4)
        self.assertIsNone(emu.adc_of("GPIO4 (ADC1_CH3)"))  # an ESP32-S3 pin: no rp2040 converter input

    def test_the_pico_loopback_is_the_contract_wiring_do_n_to_di_n(self):
        pairs = emu.loopback_pairs(emu.find_board("rpi_pico"))
        self.assertEqual(pairs, [(0, 15), (1, 14), (2, 13), (3, 12)])

    def test_the_esp32s3_loopback_skips_the_boot_button(self):
        pairs = emu.loopback_pairs(emu.find_board("esp32s3_devkitc"))
        self.assertEqual(pairs, [(15, 5), (16, 6), (17, 7), (18, 8)])


class EvidenceTests(unittest.TestCase):
    def test_the_pico_bench_is_emulated_and_names_rp2040js_and_the_patch_hash(self):
        with tempfile.TemporaryDirectory() as work:
            bench = emu.EmulatorBench("rpi_pico", workdir=Path(work))
            try:
                self.assertEqual(bench.level, "emulated")
                self.assertEqual(bench.emulator["name"], "rp2040js")
                self.assertEqual(bench.emulator["patch_sha256"], hashlib.sha256(emu.PATCH.read_bytes()).hexdigest())
                self.assertTrue(bench.rtu_port.startswith("/dev/pts/"))
            finally:
                bench.close()

    def test_the_esp32s3_bench_names_qemu_and_refuses_what_qemu_cannot_model(self):
        with tempfile.TemporaryDirectory() as work:
            bench = emu.EmulatorBench("esp32s3_devkitc", workdir=Path(work))
            self.addCleanup(bench.close)
            self.assertEqual((bench.level, bench.emulator["name"]), ("emulated", "espressif-qemu"))
            for wiring in ("digital-loopback", "analog", "network"):
                with self.assertRaises(emu.Unsupported):
                    bench.confirm_wiring(wiring)
            with self.assertRaises(emu.Unsupported):
                bench.set_analog("AI0", 0.5)
            self.assertEqual(bench.actions, [])  # nothing refused is recorded as done

    def test_a_board_without_an_emulator_is_refused(self):
        with tempfile.TemporaryDirectory() as work, self.assertRaises(emu.Unsupported):
            emu.EmulatorBench("nucleo_h743zi", workdir=Path(work))

    def test_a_bench_starts_from_erased_flash_unless_asked_to_keep_it(self):
        with tempfile.TemporaryDirectory() as work:
            flash = Path(work) / "flash.bin"
            flash.write_bytes(b"old")
            emu.EmulatorBench("esp32s3_devkitc", workdir=Path(work))
            self.assertFalse(flash.exists())
            flash.write_bytes(b"old")
            os.environ["ZPLC_EMU_KEEP_FLASH"] = "1"
            try:
                emu.EmulatorBench("esp32s3_devkitc", workdir=Path(work))
            finally:
                del os.environ["ZPLC_EMU_KEEP_FLASH"]
            self.assertEqual(flash.read_bytes(), b"old")


class FlashImageTests(unittest.TestCase):
    def test_writing_an_esp_image_keeps_the_sectors_after_it_like_esptool(self):
        with tempfile.TemporaryDirectory() as work:
            flash = Path(work) / "flash.bin"
            emu.compose_esp_flash(flash, b"\x01" * 5000, size=0x10000)
            data = flash.read_bytes()
            self.assertEqual(len(data), 0x10000)
            self.assertEqual(data[:5000], b"\x01" * 5000)
            self.assertEqual(data[5000:8192], b"\xff" * (8192 - 5000))  # the rest of the last sector is erased
            stored = bytearray(data)
            stored[0x8000:0x8004] = b"NVS!"  # a record the firmware wrote
            flash.write_bytes(bytes(stored))
            emu.compose_esp_flash(flash, b"\x02" * 100, size=0x10000)
            data = flash.read_bytes()
            self.assertEqual(data[:100], b"\x02" * 100)
            self.assertEqual(data[0x8000:0x8004], b"NVS!")

    def test_elf_symbols_reads_a_symbol_table_and_clears_the_thumb_bit(self):
        with tempfile.TemporaryDirectory() as work:
            path = Path(work) / "tiny.elf"
            path.write_bytes(tiny_elf({"flash_range_erase": 0x20001235, "other": 0x10}))
            self.assertEqual(emu.elf_symbols(path, ("flash_range_erase",)), {"flash_range_erase": 0x20001234})
            with self.assertRaises(ValueError):
                emu.elf_symbols(path, ("flash_write_partial",))


def tiny_elf(symbols: dict) -> bytes:
    """An ELF32 little-endian file with only a section table, a symbol table and its string table."""
    import struct

    strings = b"\0" + b"".join(name.encode() + b"\0" for name in symbols)
    entries, at = [bytes(16)], 1
    for name, value in symbols.items():
        entries.append(struct.pack("<IIIBBH", at, value, 0, 0x12, 0, 1))
        at += len(name) + 1
    symtab = b"".join(entries)
    header_size = 52
    symtab_at, strings_at = header_size, header_size + len(symtab)
    sections_at = strings_at + len(strings)
    sections = [
        bytes(40),
        struct.pack("<10I", 0, 2, 0, 0, symtab_at, len(symtab), 2, 1, 4, 16),
        struct.pack("<10I", 0, 3, 0, 0, strings_at, len(strings), 0, 0, 1, 0),
    ]
    header = b"\x7fELF\x01\x01\x01" + bytes(9) + struct.pack("<HHIIIIIHHHHHH", 2, 40, 1, 0, 0, sections_at, 0, 52, 0, 0, 40, 3, 0)
    return header + symtab + strings + b"".join(sections)


if __name__ == "__main__":
    unittest.main()
