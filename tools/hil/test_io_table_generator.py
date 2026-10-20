#!/usr/bin/env python3
"""IO-001, IO-002, IO-005, IO-018: the firmware I/O table is generated from the board description.

firmware/zephyr/scripts/gen_io_table.py turns one board entry of firmware/app/boards/boards.json into a C file. The
tests pin what the file says: the channels, their image addresses and HAL numbers, the checks that fail the build
when the description and the devicetree disagree, and the image sizes.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "firmware/zephyr/scripts"
MANIFEST = ROOT / "firmware/app/boards/boards.json"
DEFAULT_PROFILE = ROOT / "firmware/zephyr/io-default.json"


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


boards_lib = load("zplc_boards")
generator = load("gen_io_table")


def digital(channel_id: str, direction: str, address: str, alias: str, pin: int, **extra: object) -> dict[str, object]:
    channel: dict[str, object] = {
        "id": channel_id, "direction": direction, "kind": "digital", "address": address, "pin": f"P{pin}",
        "dt": {"alias": alias, "controller": "gpio0", "pin": pin}, "electrical": "3.3 V logic",
        "pin_status": "devicetree", "source": "firmware/zephyr/io-default.json",
    }
    if direction == "output":
        channel["safe"] = 0
    channel.update(extra)
    return channel


def board(channels: list[dict[str, object]]) -> dict[str, object]:
    return {"board_id": "synthetic", "io": {"schema_version": 1, "channels": channels, "unmapped": []}}


class RenderTests(unittest.TestCase):
    def render(self, channels: list[dict[str, object]]) -> str:
        return generator.render_io_table(board(channels), "test")

    def test_the_table_lists_each_channel_with_its_image_address_and_hal_number(self) -> None:
        text = self.render([
            digital("DI0", "input", "%IX0.0", "sw0", 1),
            digital("DO0", "output", "%QX0.0", "led0", 0),
            digital("DO9", "output", "%QX1.1", "led9", 9),
        ])
        self.assertIn('{"DO0", "P0", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U}', text)
        self.assertIn('{"DO9", "P9", 1U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 1U, 1U, 0U, 1U}', text)
        self.assertIn('{"DI0", "P1", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 0U, 2U, 0U, 1U}', text)

    def test_an_analog_input_is_numbered_apart_and_sits_on_its_word(self) -> None:
        analog = {
            "id": "AI0", "direction": "input", "kind": "analog", "address": "%IW4", "pin": "GP26",
            "dt": {"controller": "adc", "channel": 0}, "resolution_bits": 12,
            "range": {"raw_min": 0, "raw_max": 4095, "eng_min": 0.0, "eng_max": 3.3, "unit": "V"},
            "electrical": "0 V to 3.3 V", "pin_status": "devicetree", "source": "firmware/zephyr/io-default.json",
        }
        text = self.render([digital("DO0", "output", "%QX0.0", "led0", 0), analog])
        self.assertIn('{"AI0", "GP26", 8U, ZPLC_IO_KIND_ANALOG, ZPLC_IO_DIR_INPUT, 0U, 0U, 0U, 1U}', text)
        self.assertIn("DEVICE_DT_GET(DT_NODELABEL(adc))", text)
        self.assertIn("#ifdef CONFIG_ADC", text)

    def test_the_build_fails_when_the_devicetree_has_no_such_alias(self) -> None:
        text = self.render([digital("DO0", "output", "%QX0.0", "led0", 0)])
        self.assertIn("BUILD_ASSERT(DT_NODE_EXISTS(DT_ALIAS(led0))", text)
        self.assertIn("channel DO0", text)

    def test_the_build_fails_when_the_devicetree_pin_is_not_the_described_one(self) -> None:
        text = self.render([digital("DO0", "output", "%QX0.0", "led0", 7)])
        self.assertIn("DT_GPIO_PIN(DT_ALIAS(led0), gpios) == 7", text)
        self.assertIn("DT_SAME_NODE(DT_GPIO_CTLR(DT_ALIAS(led0), gpios), DT_NODELABEL(gpio0))", text)

    def test_an_optional_channel_is_bound_only_when_the_devicetree_has_it(self) -> None:
        optional = digital("DO0", "output", "%QX0.0", "led0", 0, optional=True)
        del optional["dt"]["controller"]  # type: ignore[attr-defined]
        del optional["dt"]["pin"]  # type: ignore[attr-defined]
        text = self.render([optional])
        self.assertNotIn("BUILD_ASSERT(DT_NODE_EXISTS(DT_ALIAS(led0))", text)
        self.assertIn("COND_CODE_1(DT_NODE_EXISTS(DT_ALIAS(led0))", text)
        self.assertIn('{"DO0", "P0", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 0U}', text)

    def test_the_image_sizes_follow_the_channels_and_a_kconfig_override_must_cover_them(self) -> None:
        text = self.render([digital("DO0", "output", "%QX0.0", "led0", 0), digital("DI9", "input", "%IX2.1", "sw9", 9)])
        self.assertIn("ZPLC_IO_INPUT_BYTES_NEEDED 3U", text)
        self.assertIn("ZPLC_IO_OUTPUT_BYTES_NEEDED 1U", text)
        self.assertIn("CONFIG_ZPLC_IO_INPUT_IMAGE_BYTES == 0 || CONFIG_ZPLC_IO_INPUT_IMAGE_BYTES >= ZPLC_IO_INPUT_BYTES_NEEDED", text)

    def test_the_table_carries_the_hash_of_the_description(self) -> None:
        description = board([digital("DO0", "output", "%QX0.0", "led0", 0)])
        text = generator.render_io_table(description, "test")
        self.assertIn(f"0x{boards_lib.description_hash(description)}U", text)

    def test_the_same_description_renders_the_same_text(self) -> None:
        channels = [digital("DO0", "output", "%QX0.0", "led0", 0)]
        self.assertEqual(self.render(channels), self.render(channels))

    def test_an_invalid_description_does_not_render(self) -> None:
        with self.assertRaises(ValueError):
            self.render([digital("DO0", "output", "%QX0.0", "led0", 0, safe=7)])


class SelectionTests(unittest.TestCase):
    def test_the_board_is_chosen_by_its_zephyr_target(self) -> None:
        manifest = json.loads(MANIFEST.read_text())
        selected = generator.select_board(manifest, zephyr_board="rpi_pico/rp2040")
        self.assertEqual("rpi-pico-rp2040", selected["board_id"])

    def test_the_board_is_chosen_from_the_target_the_firmware_build_passes(self) -> None:
        # firmware/CMakeLists.txt passes "${BOARD}${BOARD_QUALIFIERS}", and Zephyr 4.4 sets BOARD_QUALIFIERS without
        # the leading slash ("rp2040", "esp32s3/procpu"): every board fell back to the default alias profile.
        manifest = json.loads(MANIFEST.read_text())
        default = json.loads(DEFAULT_PROFILE.read_text())
        for target, board_id in (("rpi_picorp2040", "rpi-pico-rp2040"), ("esp32s3_devkitcesp32s3/procpu", "esp32-s3-devkitc")):
            selected = generator.select_board(manifest, zephyr_board=target, default=default)
            self.assertEqual(board_id, selected["board_id"], target)

    def test_an_unlisted_target_uses_the_default_profile(self) -> None:
        manifest = json.loads(MANIFEST.read_text())
        default = json.loads(DEFAULT_PROFILE.read_text())
        selected = generator.select_board(manifest, zephyr_board="native_sim/native/64", default=default)
        self.assertEqual(default["board_id"], selected["board_id"])

    def test_an_unlisted_target_without_a_default_is_an_error(self) -> None:
        with self.assertRaises(ValueError):
            generator.select_board(json.loads(MANIFEST.read_text()), zephyr_board="nowhere/board")


class DefaultProfileTests(unittest.TestCase):
    def test_the_default_profile_is_valid_and_keeps_the_legacy_alias_map(self) -> None:
        profile = json.loads(DEFAULT_PROFILE.read_text())
        self.assertEqual([], boards_lib.validate_io_description(profile, ROOT))
        by_id = {c["id"]: c for c in profile["io"]["channels"]}
        for index in range(4):
            self.assertEqual(f"%QX0.{index}", by_id[f"DO{index}"]["address"])
            self.assertEqual(f"led{index}", by_id[f"DO{index}"]["dt"]["alias"])
            self.assertEqual(f"%IX0.{index}", by_id[f"DI{index}"]["address"])
            self.assertEqual(f"sw{index}", by_id[f"DI{index}"]["dt"]["alias"])
        for index in range(5):
            self.assertEqual(f"%IW{4 + index}", by_id[f"AI{index}"]["address"])
        self.assertTrue(all(c.get("optional") for c in profile["io"]["channels"]))


class CommandLineTests(unittest.TestCase):
    def test_the_command_writes_the_file_for_a_board_of_the_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "zplc_io_table.c"
            result = subprocess.run(
                [sys.executable, "-B", str(SCRIPTS / "gen_io_table.py"), "--manifest", str(MANIFEST),
                 "--zephyr-board", "rpi_pico/rp2040", "--default-profile", str(DEFAULT_PROFILE), "--output", str(output)],
                capture_output=True, text=True,
            )
            self.assertEqual(0, result.returncode, result.stderr)
            text = output.read_text()
            self.assertIn('"rpi-pico-rp2040"', text)
            self.assertIn('{"DO4", "GP25"', text)

    def test_the_command_refuses_a_broken_description(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            broken = Path(directory) / "boards.json"
            entry = {"board_id": "b", "zephyr_board": "x/y", "io": {"schema_version": 1, "channels": []}}
            broken.write_text(json.dumps([entry]))
            result = subprocess.run(
                [sys.executable, "-B", str(SCRIPTS / "gen_io_table.py"), "--manifest", str(broken),
                 "--zephyr-board", "x/y", "--output", str(Path(directory) / "out.c")],
                capture_output=True, text=True,
            )
            self.assertNotEqual(0, result.returncode)
            self.assertIn("at least one channel", result.stderr)


if __name__ == "__main__":
    unittest.main()
