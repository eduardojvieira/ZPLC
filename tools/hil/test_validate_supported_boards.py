#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import re
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("validate_supported_boards.py")
SPEC = importlib.util.spec_from_file_location("validate_supported_boards", MODULE_PATH)
assert SPEC and SPEC.loader
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)
ROOT = MODULE_PATH.parents[2]


def workflow(include: str, extra: str = "") -> str:
    return f"""jobs:
  zephyr-cross-build:
    strategy:
      fail-fast: false
      matrix:
        include:
{include}
{extra}  docs-and-truth:
    runs-on: ubuntu-latest
"""


class CrossBuildMatrixTests(unittest.TestCase):
    def read(self, contents: str) -> list[str]:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ci.yml"
            path.write_text(contents)
            return validator.read_cross_build_boards(path)

    def test_valid_fixture_ignores_board_outside_include(self) -> None:
        boards = self.read(
            workflow(
                """          - id: first
            board: board/first
          - id: second
            board: board/second
""",
                """    env:
      board: board/second
""",
            )
        )
        self.assertEqual(["board/first", "board/second"], boards)

    def test_foreign_board_does_not_compensate_for_missing_include_board(self) -> None:
        boards = self.read(
            workflow(
                """          - id: first
            board: board/first
""",
                """    env:
      board: board/second
""",
            )
        )
        errors = validator.cross_build_board_errors(
            ["board/first", "board/second"], boards
        )
        self.assertIn("zephyr-cross-build missing boards: board/second", errors)

    def test_duplicate_and_missing_board_are_reported(self) -> None:
        errors = validator.cross_build_board_errors(
            ["board/first", "board/second"], ["board/first", "board/first"]
        )
        self.assertIn("zephyr-cross-build missing boards: board/second", errors)
        self.assertIn("zephyr-cross-build duplicate boards: board/first", errors)

    def test_malformed_include_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "only one board after id"):
            self.read(
                workflow(
                    """          - id: first
            unexpected: board/first
"""
                )
            )

    def test_id_with_yaml_syntax_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid id"):
            self.read(
                workflow(
                    """          - id: rpi-pico: invalid
            board: board/first
"""
                )
            )


class Rc3CrossBuildGuardTests(unittest.TestCase):
    def test_websocket_backport_is_target_scoped_and_zplc_warnings_are_errors(self) -> None:
        cmake = (ROOT / "firmware/app/CMakeLists.txt").read_text()
        self.assertRegex(
            cmake,
            re.compile(
                r"if\(CONFIG_MQTT_LIB_WEBSOCKET\).*?"
                r"if\(NOT TARGET subsys__net__lib__mqtt\).*?"
                r"message\(FATAL_ERROR.*?"
                r"target_compile_options\(subsys__net__lib__mqtt PRIVATE "
                r"-include zephyr/net/net_log\.h\).*?endif\(\)",
                re.DOTALL,
            ),
        )
        self.assertIn("target_compile_options(app PRIVATE -Werror)", cmake)

    def test_opta_keeps_modbus_disabled_without_disabling_warnings(self) -> None:
        config = (ROOT / "firmware/app/boards/arduino_opta_stm32h747xx_m7.conf").read_text()
        self.assertIn("CONFIG_MODBUS=n", config)
        self.assertIn("CONFIG_MODBUS_ROLE_CLIENT_SERVER=n", config)
        self.assertNotIn("CONFIG_COMPILER_WARNINGS_AS_ERRORS=n", config)

    def test_owned_warning_fixes_remain_guarded_or_removed(self) -> None:
        modbus_client = (ROOT / "firmware/app/src/zplc_modbus_client.c").read_text()
        shell = (ROOT / "firmware/app/src/shell_cmds.c").read_text()
        config = (ROOT / "firmware/app/src/zplc_config.c").read_text()
        cloud_handler = (ROOT / "firmware/app/src/zplc_comm_cloud_handler.c").read_text()
        aws_fleet = (ROOT / "firmware/app/src/zplc_aws_fleet.c").read_text()
        mqtt = (ROOT / "firmware/app/src/zplc_mqtt.c").read_text()

        self.assertIn(
            "#if ZPLC_HAS_MODBUS_RTU\nstatic enum uart_config_parity zplc_modbus_parity_to_uart",
            modbus_client,
        )
        self.assertIn(
            "#ifndef CONFIG_ZPLC_SCHEDULER\nstatic const char *state_name", shell
        )
        self.assertIn("PARTITION_DEVICE(storage_partition)", config)
        self.assertNotIn("copy_to_fb_str", cloud_handler)
        self.assertNotIn("static int json_extract_string(", aws_fleet)
        self.assertIn("json_extract_string_unescaped", aws_fleet)
        self.assertNotIn("s_c2d_topic", mqtt)


if __name__ == "__main__":
    unittest.main()
