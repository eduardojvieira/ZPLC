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
                r"\"SHELL:-include zephyr/net/net_log\.h\"\).*?endif\(\)",
                re.DOTALL,
            ),
        )
        self.assertIn("target_compile_options(app PRIVATE -Werror)", cmake)

    def test_rc3_cross_build_guards_and_sdk_download_authentication(self) -> None:
        modbus = (ROOT / "firmware/app/src/zplc_modbus.c").read_text()
        ci = (ROOT / ".github/workflows/ci.yml").read_text()
        nightly = (ROOT / ".github/workflows/nightly-quality.yml").read_text()

        self.assertRegex(
            modbus,
            re.compile(
                r"#if ZPLC_HAS_MODBUS_RTU \|\| defined\(CONFIG_NET_SOCKETS\)\s*"
                r"static int handle_read.*?\n}\s*#endif",
                re.DOTALL,
            ),
        )
        for workflow, expected_installs in ((ci, 2), (nightly, 1)):
            installs = re.findall(r'^.*west" sdk install.*$', workflow, re.MULTILINE)
            self.assertEqual(len(installs), expected_installs)
            self.assertEqual(
                workflow.count("ZPLC_WEST_SDK_GITHUB_TOKEN: ${{ github.token }}"),
                expected_installs,
            )
            for install in installs:
                self.assertIn(
                    '--personal-access-token "${ZPLC_WEST_SDK_GITHUB_TOKEN}"',
                    install,
                )
                self.assertNotIn("secrets.", install)

    def test_modbus_role_follows_zephyr_choice_defaults(self) -> None:
        common = (ROOT / "firmware/app/prj.conf").read_text()
        opta = (ROOT / "firmware/app/boards/arduino_opta_stm32h747xx_m7.conf").read_text()

        self.assertIn("CONFIG_MODBUS=y", common)
        self.assertNotIn("CONFIG_MODBUS_ROLE_CLIENT_SERVER", common)
        self.assertIn("CONFIG_MODBUS=n", opta)
        self.assertNotIn("CONFIG_MODBUS_ROLE_CLIENT_SERVER", opta)
        self.assertNotIn("CONFIG_COMPILER_WARNINGS_AS_ERRORS=n", opta)

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
        self.assertIn(".storage_dev = (void *)PARTITION_DEVICE(storage_partition)", config)
        self.assertNotIn("copy_to_fb_str", cloud_handler)
        self.assertNotIn("static int json_extract_string(", aws_fleet)
        self.assertIn("json_extract_string_unescaped", aws_fleet)
        self.assertNotIn("s_c2d_topic", mqtt)

    def test_cross_build_warning_fixes_keep_feature_boundaries(self) -> None:
        common = (ROOT / "firmware/app/prj.conf").read_text()
        esp32 = (
            ROOT / "firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.conf"
        ).read_text()
        giga = (ROOT / "firmware/app/boards/arduino_giga_r1_stm32h747xx_m7.conf").read_text()
        f746 = (ROOT / "firmware/app/boards/stm32f746g_disco.conf").read_text()
        f746_overlay = (ROOT / "firmware/app/boards/stm32f746g_disco.overlay").read_text()
        modbus = (ROOT / "firmware/app/src/zplc_modbus.c").read_text()
        modbus_client = (ROOT / "firmware/app/src/zplc_modbus_client.c").read_text()
        shell = (ROOT / "firmware/app/src/shell_cmds.c").read_text()

        self.assertNotIn("CONFIG_SNTP=y", common)
        self.assertIn("CONFIG_SNTP=y", esp32)
        self.assertNotIn("CONFIG_USB_DEVICE_PRODUCT", giga)
        self.assertNotIn("CONFIG_USB_DEVICE_", f746)
        self.assertRegex(
            f746_overlay,
            r"&quadspi_memory\s*\{\s*status\s*=\s*\"disabled\";\s*\};",
        )
        self.assertRegex(
            modbus,
            re.compile(
                r"#if defined\(CONFIG_NET_SOCKETS\)\s*"
                r"static int modbus_tcp_read.*?"
                r"static int modbus_tcp_write.*?#endif",
                re.DOTALL,
            ),
        )
        self.assertRegex(
            modbus_client,
            re.compile(
                r"#if defined\(CONFIG_NET_SOCKETS\)\s*"
                r"static struct k_thread s_tcp_client_thread;\s*"
                r"static K_THREAD_STACK_DEFINE\(s_tcp_client_stack, 3072\);\s*"
                r"static uint16_t s_tcp_transaction_id;\s*#endif",
                re.DOTALL,
            ),
        )
        self.assertRegex(
            modbus_client,
            re.compile(
                r"#if defined\(CONFIG_NET_SOCKETS\)\s*"
                r"static void modbus_tcp_client_thread.*?\n}\s*#endif",
                re.DOTALL,
            ),
        )
        self.assertRegex(
            shell,
            re.compile(
                r"#if defined\(CONFIG_FILE_SYSTEM\)\s*"
                r"#define CERT_STAGING_MAX_BYTES 4096U\s*"
                r"static struct \{.*?\} cert_staging;\s*#endif",
                re.DOTALL,
            ),
        )


if __name__ == "__main__":
    unittest.main()
