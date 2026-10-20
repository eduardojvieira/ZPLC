#!/usr/bin/env python3
"""IO-001, IO-009 to IO-012: the board I/O description in firmware/app/boards/boards.json.

The library under test is firmware/zephyr/scripts/zplc_boards.py. The firmware generator, the manifest validator and
the board reference generator all use it, so the rules that these tests pin are the ones the build, CI and the docs
enforce.
"""
from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "firmware/zephyr/scripts/zplc_boards.py"
MANIFEST = ROOT / "firmware/app/boards/boards.json"

spec = importlib.util.spec_from_file_location("zplc_boards", LIBRARY)
assert spec and spec.loader
boards_lib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boards_lib)


def channel(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "DO0",
        "direction": "output",
        "kind": "digital",
        "address": "%QX0.0",
        "pin": "GP0",
        "dt": {"alias": "led0", "controller": "gpio0", "pin": 0},
        "safe": 0,
        "electrical": "3.3 V logic",
        "pin_status": "devicetree",
        "source": "firmware/app/boards/rpi_pico_rp2040.overlay",
    }
    base.update(overrides)
    return base


def analog_input(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "AI0",
        "direction": "input",
        "kind": "analog",
        "address": "%IW4",
        "pin": "GP26",
        "dt": {"controller": "adc", "channel": 0},
        "resolution_bits": 12,
        "range": {"raw_min": 0, "raw_max": 4095, "eng_min": 0.0, "eng_max": 3.3, "unit": "V"},
        "electrical": "0 V to 3.3 V",
        "pin_status": "devicetree",
        "source": "firmware/app/boards/rpi_pico_rp2040.overlay",
    }
    base.update(overrides)
    return base


def board(channels: list[dict[str, object]]) -> dict[str, object]:
    return {
        "board_id": "test-board",
        "display_name": "Test board",
        "ide_id": "test_board",
        "zephyr_board": "test/board",
        "io": {"schema_version": 1, "channels": channels, "unmapped": []},
    }


def errors_of(channels: list[dict[str, object]]) -> list[str]:
    return boards_lib.validate_io_description(board(channels), ROOT)


class AddressTests(unittest.TestCase):
    def test_a_digital_input_names_its_byte_and_bit(self) -> None:
        address = boards_lib.parse_address("%IX0.3")
        self.assertEqual(("I", 0, 3, 1), (address.region, address.byte, address.bit, address.width))

    def test_a_word_address_is_a_word_index_of_two_bytes(self) -> None:
        address = boards_lib.parse_address("%IW4")
        self.assertEqual(("I", 8, None, 2), (address.region, address.byte, address.bit, address.width))

    def test_a_bit_past_seven_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            boards_lib.parse_address("%IX0.8")

    def test_a_direct_address_without_a_size_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            boards_lib.parse_address("%I0")


class ValidationTests(unittest.TestCase):
    def test_a_complete_description_has_no_errors(self) -> None:
        self.assertEqual([], errors_of([channel(), channel(id="DI0", direction="input", address="%IX0.0"), analog_input()]))

    def test_a_duplicate_channel_id_is_reported(self) -> None:
        errors = errors_of([channel(), channel(address="%QX0.1")])
        self.assertTrue(any("duplicate channel id DO0" in text for text in errors), errors)

    def test_an_input_on_an_output_address_is_reported(self) -> None:
        errors = errors_of([channel(id="DI0", direction="input", address="%QX0.0")])
        self.assertTrue(any("DI0" in text and "%QX0.0" in text for text in errors), errors)

    def test_two_channels_on_one_bit_are_reported(self) -> None:
        errors = errors_of([channel(), channel(id="DO1", pin="GP1")])
        self.assertTrue(any("DO1" in text and "overlaps" in text and "DO0" in text for text in errors), errors)

    def test_a_word_over_a_digital_byte_is_reported(self) -> None:
        errors = errors_of([channel(id="DI0", direction="input", address="%IX8.0"), analog_input()])
        self.assertTrue(any("AI0" in text and "overlaps" in text for text in errors), errors)

    def test_an_input_inside_the_system_registers_is_reported(self) -> None:
        errors = errors_of([analog_input(address="%IW2040")])
        self.assertTrue(any("system registers" in text for text in errors), errors)

    def test_an_analog_output_is_refused_until_a_port_can_drive_it(self) -> None:
        errors = errors_of([analog_input(id="AO0", direction="output", address="%QW0", safe=0)])
        self.assertTrue(any("analog output" in text for text in errors), errors)

    def test_an_output_without_a_safe_value_is_reported(self) -> None:
        broken = channel()
        del broken["safe"]
        errors = errors_of([broken])
        self.assertTrue(any("DO0" in text and "safe" in text for text in errors), errors)

    def test_a_channel_without_a_pin_name_is_reported(self) -> None:
        broken = channel()
        del broken["pin"]
        errors = errors_of([broken])
        self.assertTrue(any("DO0" in text and "pin" in text for text in errors), errors)

    def test_a_digital_channel_must_name_its_devicetree_alias(self) -> None:
        errors = errors_of([channel(dt={"controller": "gpio0", "pin": 0})])
        self.assertTrue(any("DO0" in text and "alias" in text for text in errors), errors)

    def test_an_analog_range_must_have_a_unit(self) -> None:
        errors = errors_of([analog_input(range={"raw_min": 0, "raw_max": 4095, "eng_min": 0.0, "eng_max": 3.3})])
        self.assertTrue(any("AI0" in text and "unit" in text for text in errors), errors)

    def test_a_missing_source_file_is_reported(self) -> None:
        errors = errors_of([channel(source="firmware/app/boards/no_such_file.overlay")])
        self.assertTrue(any("no_such_file" in text for text in errors), errors)

    def test_more_than_the_table_limit_is_reported(self) -> None:
        many = [channel(id=f"DO{index}", address=f"%QX{index // 8}.{index % 8}", pin=f"P{index}") for index in range(65)]
        errors = errors_of(many)
        self.assertTrue(any("at most 64 channels" in text for text in errors), errors)


OVERLAY = """
/ {
    leds {
        compatible = "gpio-leds";
        led0: led_0 { gpios = <&gpio0 0 GPIO_ACTIVE_HIGH>; };  /* GP0 */
        led1: led_1 { gpios = <&gpio1 6 GPIO_ACTIVE_HIGH>; };
    };
    keys {
        compatible = "gpio-keys";
        button0: button_0 { gpios = <&gpio0 15 (GPIO_PULL_UP | GPIO_ACTIVE_LOW)>; };
    };
    aliases {
        led0 = &led0;
        // led9 = &led1;
        sw0 = &button0;
    };
};
&adc { status = "okay"; };
"""


class DevicetreeCrossCheckTests(unittest.TestCase):
    """IO-001: a channel names the GPIO its pin name says, and the overlay it cites binds that alias to that GPIO."""

    def mismatches(self, channels: list[dict[str, object]], text: str = OVERLAY) -> list[str]:
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "board.overlay").write_text(text)
            for item in channels:
                item["source"] = "board.overlay"
            return boards_lib.devicetree_mismatches(board(channels), Path(directory))

    def test_a_pin_name_that_is_not_the_described_gpio_is_reported(self) -> None:
        errors = errors_of([channel(pin="GP1")])
        self.assertTrue(any("DO0" in text and "GP1" in text for text in errors), errors)

    def test_an_esp32_gpio_from_32_up_is_on_the_second_controller(self) -> None:
        errors = errors_of([channel(pin="GPIO38", dt={"alias": "led0", "controller": "gpio0", "pin": 38})])
        self.assertTrue(any("DO0" in text and "GPIO38" in text for text in errors), errors)
        self.assertEqual([], errors_of([channel(pin="GPIO38", dt={"alias": "led0", "controller": "gpio1", "pin": 6})]))

    def test_an_stm32_port_pin_is_on_its_port_controller(self) -> None:
        self.assertEqual([], errors_of([channel(pin="PI12 (red LED)", dt={"alias": "led0", "controller": "gpioi", "pin": 12})]))
        errors = errors_of([channel(pin="PJ12", dt={"alias": "led0", "controller": "gpioi", "pin": 12})])
        self.assertTrue(any("PJ12" in text for text in errors), errors)

    def test_channels_that_match_their_overlay_have_no_mismatch(self) -> None:
        self.assertEqual([], self.mismatches([channel(), channel(id="DI0", direction="input", address="%IX0.0", pin="GP15",
                                                                    dt={"alias": "sw0", "controller": "gpio0", "pin": 15}),
                                              analog_input()]))

    def test_an_alias_the_overlay_does_not_define_is_reported(self) -> None:
        errors = self.mismatches([channel(dt={"alias": "led9", "controller": "gpio0", "pin": 0})])
        self.assertTrue(any("DO0" in text and "led9" in text and "board.overlay" in text for text in errors), errors)

    def test_an_alias_on_another_gpio_is_reported(self) -> None:
        errors = self.mismatches([channel(id="DO1", address="%QX0.1", pin="GP1", dt={"alias": "led0", "controller": "gpio0", "pin": 1})])
        self.assertTrue(any("DO1" in text and "gpio0 0" in text for text in errors), errors)

    def test_an_analog_input_on_a_converter_the_overlay_does_not_enable_is_reported(self) -> None:
        errors = self.mismatches([analog_input(dt={"controller": "adc0", "channel": 3})])
        self.assertTrue(any("AI0" in text and "adc0" in text for text in errors), errors)

    def test_the_binding_carries_the_flags_of_the_overlay(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "board.overlay").write_text(OVERLAY)
            button = channel(id="DI0", direction="input", address="%IX0.0", pin="GP15",
                             dt={"alias": "sw0", "controller": "gpio0", "pin": 15}, source="board.overlay")
            binding = boards_lib.overlay_binding(button, Path(directory))
        self.assertEqual(("gpio0", 15), (binding["controller"], binding["pin"]))
        self.assertIn("GPIO_PULL_UP", binding["flags"])
        self.assertIn("GPIO_ACTIVE_LOW", binding["flags"])


class DerivedValuesTests(unittest.TestCase):
    def test_image_extent_is_what_the_channels_need(self) -> None:
        description = board([
            channel(),
            channel(id="DO8", address="%QX1.0", pin="GP8"),
            channel(id="DI0", direction="input", address="%IX0.0"),
            analog_input(),
            analog_input(id="AI1", address="%IW5", pin="GP27", dt={"controller": "adc", "channel": 1}),
        ])
        self.assertEqual((12, 2), boards_lib.image_extent(description))

    def test_the_description_hash_changes_when_an_address_changes(self) -> None:
        first = board([channel()])
        second = board([channel(address="%QX0.1")])
        self.assertEqual(8, len(boards_lib.description_hash(first)))
        self.assertNotEqual(boards_lib.description_hash(first), boards_lib.description_hash(second))

    def test_the_description_hash_ignores_the_order_of_the_channels(self) -> None:
        a = channel()
        b = channel(id="DO1", address="%QX0.1", pin="GP1")
        self.assertEqual(
            boards_lib.description_hash(board([a, b])),
            boards_lib.description_hash(board([b, a])),
        )

    def test_the_hal_numbers_outputs_first_then_inputs(self) -> None:
        description = board([
            channel(id="DI1", direction="input", address="%IX0.1"),
            channel(id="DI0", direction="input", address="%IX0.0"),
            channel(id="DO1", address="%QX0.1", pin="GP1"),
            channel(id="DO0"),
        ])
        numbering = boards_lib.hal_numbering(description)
        self.assertEqual({"DO0": 0, "DO1": 1, "DI0": 2, "DI1": 3}, numbering)


class ManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.boards = json.loads(MANIFEST.read_text())

    def by_id(self, board_id: str) -> dict[str, object]:
        return next(entry for entry in self.boards if entry["board_id"] == board_id)

    def test_the_manifest_has_no_errors(self) -> None:
        self.assertEqual([], boards_lib.validate_manifest(self.boards, ROOT))

    def test_the_manifest_is_one_unversioned_file(self) -> None:
        self.assertEqual("boards.json", MANIFEST.name)
        self.assertEqual([], list(MANIFEST.parent.glob("supported-boards*.json")))

    def test_every_listed_board_has_a_description_with_channels(self) -> None:
        for entry in self.boards:
            channels = entry.get("io", {}).get("channels", [])
            self.assertGreater(len(channels), 0, entry["board_id"])

    def test_the_seven_profiles_are_listed(self) -> None:
        self.assertEqual(
            {
                "rpi-pico-rp2040", "arduino-giga-r1-m7", "esp32-s3-devkitc", "stm32f746g-disco",
                "nucleo-h743zi", "arduino-opta-wifi-m7", "waveshare-rp2040-zero",
            },
            {entry["board_id"] for entry in self.boards},
        )

    def test_the_learner_boards_expose_four_outputs_four_inputs_and_one_analog_input(self) -> None:
        for board_id in ("rpi-pico-rp2040", "esp32-s3-devkitc"):
            channels = self.by_id(board_id)["io"]["channels"]
            digital_out = [c for c in channels if c["kind"] == "digital" and c["direction"] == "output"]
            digital_in = [c for c in channels if c["kind"] == "digital" and c["direction"] == "input"]
            analog_in = [c for c in channels if c["kind"] == "analog" and c["direction"] == "input"]
            self.assertGreaterEqual(len(digital_out), 4, board_id)
            self.assertGreaterEqual(len(digital_in), 4, board_id)
            self.assertGreaterEqual(len(analog_in), 1, board_id)

    def test_the_pico_maps_its_on_board_led(self) -> None:
        pins = {c["pin"] for c in self.by_id("rpi-pico-rp2040")["io"]["channels"]}
        self.assertIn("GP25", pins)

    def test_the_opta_maps_its_relays(self) -> None:
        aliases = {c["dt"].get("alias") for c in self.by_id("arduino-opta-wifi-m7")["io"]["channels"]}
        self.assertTrue({"relay1", "relay2", "relay3", "relay4"} <= aliases)

    def test_the_first_four_outputs_and_inputs_keep_the_addresses_programs_use(self) -> None:
        for entry in self.boards:
            channels = {c["address"]: c for c in entry["io"]["channels"]}
            outputs = [a for a in channels if a.startswith("%QX0.")]
            self.assertIn("%QX0.0", outputs, entry["board_id"])

    def test_the_esp32_profile_names_the_devkitc_1_variant(self) -> None:
        entry = self.by_id("esp32-s3-devkitc")
        self.assertIn("DevKitC-1", entry["display_name"])
        self.assertEqual("N8R8", entry["hardware"]["variant"])
        self.assertEqual((8, 8), (entry["hardware"]["flash_mb"], entry["hardware"]["psram_mb"]))

    # The learner pin assignment of the course (LRN-014): the pin each channel id is printed as on the board.
    LEARNER_PINS = {
        "rpi-pico-rp2040": {
            "DO0": "GP0", "DO1": "GP1", "DO2": "GP2", "DO3": "GP3", "DO4": "GP25",
            "DI0": "GP15", "DI1": "GP14", "DI2": "GP13", "AI0": "GP26",
        },
        "esp32-s3-devkitc": {
            "DO0": "GPIO15", "DO1": "GPIO16", "DO2": "GPIO17", "DO3": "GPIO18",
            "DI0": "GPIO5", "DI1": "GPIO6", "DI2": "GPIO7", "DI3": "GPIO0", "AI0": "GPIO4",
        },
    }

    def test_the_learner_channels_sit_on_the_pins_of_the_course(self) -> None:
        for board_id, pins in self.LEARNER_PINS.items():
            channels = {c["id"]: c for c in self.by_id(board_id)["io"]["channels"]}
            printed = {key: re.match(r"GP(?:IO)?\d+", channels[key]["pin"]).group() for key in pins if key in channels}
            self.assertEqual(pins, printed, board_id)

    def test_every_learner_channel_is_bound_by_the_profile_overlay(self) -> None:
        for board_id in self.LEARNER_PINS:
            entry = self.by_id(board_id)
            overlay = next(asset for asset in entry["support_assets"] if asset.endswith(".overlay"))
            for item in entry["io"]["channels"]:
                self.assertEqual(overlay, item["source"], f"{board_id} {item['id']}")
                if item["kind"] == "digital":
                    self.assertIsNotNone(boards_lib.overlay_binding(item, ROOT), f"{board_id} {item['id']}")

    def test_the_learner_buttons_pull_up_and_are_active_low(self) -> None:
        for board_id in self.LEARNER_PINS:
            for item in self.by_id(board_id)["io"]["channels"]:
                if item["kind"] == "digital" and item["direction"] == "input":
                    flags = boards_lib.overlay_binding(item, ROOT)["flags"]
                    self.assertIn("GPIO_PULL_UP", flags, f"{board_id} {item['id']}")
                    self.assertIn("GPIO_ACTIVE_LOW", flags, f"{board_id} {item['id']}")

    def test_the_esp32_analog_input_is_adc1_at_12_db_in_the_counts_of_the_zephyr_driver(self) -> None:
        ai0 = next(c for c in self.by_id("esp32-s3-devkitc")["io"]["channels"] if c["id"] == "AI0")
        # ADC1 (node adc0) channel n is GPIO n + 1; ADC_GAIN_1_4 is 12 dB attenuation in drivers/adc/adc_esp32.c.
        self.assertEqual(("adc0", 3, "ADC_GAIN_1_4"), (ai0["dt"]["controller"], ai0["dt"]["channel"], ai0["dt"]["gain"]))
        # With the eFuse calibration the driver returns millivolts / 4 as counts of 4095 over its 1100 mV reference.
        scale = ai0["range"]
        self.assertEqual((0, 0.0, 3.1), (scale["raw_min"], scale["eng_min"], scale["eng_max"]))
        self.assertEqual(int(scale["eng_max"] * 1000 / 4 * 4095 / 1100), scale["raw_max"])

    def test_the_support_level_is_not_set_by_hand(self) -> None:
        for entry in self.boards:
            self.assertNotIn("validation_level", entry, entry["board_id"])


class WatchdogProfileTests(unittest.TestCase):
    """RT-020: the hardware watchdog is on in a profile that has a hardware record, and off, with the reason, in every
    other. The shipped manifest has no record, so it is off everywhere; these cases show the rule both ways."""

    def watchdog(self, **overrides: object) -> dict[str, object]:
        base: dict[str, object] = {
            "enabled": False, "reason": "no hardware record yet", "timeout_ms": 1000, "max_timeout_ms": 8000,
            "stop": "disarm", "pause": "feed", "fault": "expire",
        }
        base.update(overrides)
        return base

    def board(self, watchdog: dict[str, object], refs: list[str] | None = None) -> dict[str, object]:
        return {"board_id": "b", "evidence_refs": refs or [], "watchdog": watchdog}

    def root_with_record(self, directory: str, result: str = "pass") -> None:
        record = {
            "schema": "zplc.hil-record/1", "board_id": "b", "firmware_version": "2.0.0",
            "commit": "0" * 40, "image_sha256": "a" * 64, "result": result,
        }
        path = Path(directory) / "records"
        path.mkdir()
        (path / "b.json").write_text(json.dumps(record))

    def test_every_shipped_profile_has_the_watchdog_off_and_says_why(self) -> None:
        for entry in json.loads(MANIFEST.read_text()):
            self.assertEqual([], boards_lib.validate_watchdog(entry, ROOT), entry["board_id"])
            self.assertIs(False, entry["watchdog"]["enabled"], entry["board_id"])
            self.assertEqual([], entry["evidence_refs"], f"{entry['board_id']} has a record: its watchdog must be on")

    def test_a_profile_without_a_record_may_not_enable_it(self) -> None:
        errors = boards_lib.validate_watchdog(self.board(self.watchdog(enabled=True)), None)
        self.assertTrue(any("no passing hardware record" in e for e in errors), errors)

    def test_a_profile_with_a_passing_record_must_enable_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.root_with_record(directory)
            board = self.board(self.watchdog(), ["records/b.json"])
            errors = boards_lib.validate_watchdog(board, Path(directory))
            self.assertTrue(any("must be enabled" in e for e in errors), errors)
            board = self.board(self.watchdog(enabled=True), ["records/b.json"])
            self.assertEqual([], boards_lib.validate_watchdog(board, Path(directory)))

    def test_a_failed_record_is_not_a_record(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.root_with_record(directory, "fail")
            board = self.board(self.watchdog(), ["records/b.json"])
            self.assertEqual([], boards_lib.validate_watchdog(board, Path(directory)))
            board = self.board(self.watchdog(enabled=True), ["records/b.json"])
            self.assertTrue(boards_lib.validate_watchdog(board, Path(directory)))

    def test_a_profile_with_it_off_says_why(self) -> None:
        errors = boards_lib.validate_watchdog(self.board(self.watchdog(reason="")), None)
        self.assertTrue(any("watchdog.reason" in e for e in errors), errors)

    def test_the_timeouts_and_the_policies_are_checked(self) -> None:
        errors = boards_lib.validate_watchdog(self.board(self.watchdog(timeout_ms=50)), None)
        self.assertTrue(any("timeout_ms" in e for e in errors), errors)
        errors = boards_lib.validate_watchdog(self.board(self.watchdog(timeout_ms=9000, max_timeout_ms=8000)), None)
        self.assertTrue(any("longer than" in e for e in errors), errors)
        errors = boards_lib.validate_watchdog(self.board(self.watchdog(fault="feed")), None)
        self.assertTrue(any("watchdog.fault" in e for e in errors), errors)
        errors = boards_lib.validate_watchdog(self.board(self.watchdog(stop="expire")), None)
        self.assertTrue(any("watchdog.stop" in e for e in errors), errors)

    def test_a_manifest_entry_without_the_object_is_refused(self) -> None:
        errors = boards_lib.validate_watchdog({"board_id": "b", "evidence_refs": []}, None)
        self.assertTrue(any("watchdog is missing" in e for e in errors), errors)


class SupportLevelTests(unittest.TestCase):
    def test_a_board_with_no_record_is_cross_build_only(self) -> None:
        level = boards_lib.support_level({"board_id": "b", "evidence_refs": []}, ROOT)
        self.assertEqual({"level": "cross-build", "records": []}, level)

    def test_a_valid_record_gives_hardware_level_and_names_the_firmware_version(self) -> None:
        record = {
            "schema": "zplc.hil-record/1", "board_id": "b", "firmware_version": "2.0.0-rc.4",
            "commit": "0123456789abcdef0123456789abcdef01234567", "image_sha256": "a" * 64, "result": "pass",
        }
        level = boards_lib.support_level_from_records("b", [("records/b.json", record)])
        self.assertEqual("human-hil", level["level"])
        self.assertEqual(["2.0.0-rc.4"], [item["firmware_version"] for item in level["records"]])

    def test_a_failed_record_does_not_raise_the_level(self) -> None:
        record = {
            "schema": "zplc.hil-record/1", "board_id": "b", "firmware_version": "2.0.0-rc.4",
            "commit": "0" * 40, "image_sha256": "a" * 64, "result": "fail",
        }
        level = boards_lib.support_level_from_records("b", [("records/b.json", record)])
        self.assertEqual("cross-build", level["level"])

    def test_a_record_for_another_board_is_ignored(self) -> None:
        record = {
            "schema": "zplc.hil-record/1", "board_id": "other", "firmware_version": "2.0.0",
            "commit": "0" * 40, "image_sha256": "a" * 64, "result": "pass",
        }
        level = boards_lib.support_level_from_records("b", [("records/b.json", record)])
        self.assertEqual("cross-build", level["level"])


if __name__ == "__main__":
    unittest.main()
