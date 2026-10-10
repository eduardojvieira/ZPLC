#!/usr/bin/env python3
"""Tests of the build rules of the communication safety requirements (COM-016, COM-022).

Run: python3 tools/firmware-test/test_comm_rules.py

Each rule is a CMake function (firmware/app/cmake/*.cmake) that the application's CMakeLists.txt calls with
its Kconfig values. The functions are called here, one combination per run, through `cmake -P`, and the
build must stop with the rule's name for the combinations that break it and pass for the ones that do not:
a rule that cannot fail would also let a firmware with TLS on a test random generator through.
"""

import subprocess
import tempfile
import unittest
from pathlib import Path

CMAKE_DIR = Path(__file__).resolve().parents[2] / "firmware" / "app" / "cmake"


def run_rule(rule_file: str, call: str) -> subprocess.CompletedProcess:
    with tempfile.TemporaryDirectory() as directory:
        script = Path(directory) / "call.cmake"
        script.write_text(f'include("{CMAKE_DIR / rule_file}")\n{call}\n')
        return subprocess.run(["cmake", "-P", str(script)], capture_output=True, text=True, check=False)


class TlsRandomRule(unittest.TestCase):
    """COM-016: TLS on a generator that is not cryptographic fails the build."""

    def test_tls_with_the_test_generator_fails(self):
        result = run_rule("zplc_tls_rng_rule.cmake", 'zplc_check_tls_random(ON "y" "y")')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("zplc_rule_tls_with_test_random_generator", result.stderr)

    def test_tls_without_a_cryptographic_source_fails(self):
        result = run_rule("zplc_tls_rng_rule.cmake", 'zplc_check_tls_random(ON "" "")')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("zplc_rule_tls_without_cryptographic_random", result.stderr)

    def test_tls_with_a_hardware_source_passes(self):
        result = run_rule("zplc_tls_rng_rule.cmake", 'zplc_check_tls_random(ON "" "y")')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_no_tls_passes_whatever_the_generator_is(self):
        for test_generator, csprng in (("y", ""), ("", ""), ("y", "y"), ("", "y")):
            with self.subTest(test_generator=test_generator, csprng=csprng):
                result = run_rule(
                    "zplc_tls_rng_rule.cmake", f'zplc_check_tls_random(OFF "{test_generator}" "{csprng}")'
                )
                self.assertEqual(result.returncode, 0, result.stderr)


class ShellRule(unittest.TestCase):
    """COM-022: the raw memory command exists only in the diagnostic image."""

    def test_devmem_without_the_diagnostic_switch_fails(self):
        result = run_rule("zplc_shell_rules.cmake", 'zplc_check_shell_rules("y" "")')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("zplc_rule_devmem_needs_diagnostic_image", result.stderr)

    def test_the_switch_without_the_command_fails(self):
        result = run_rule("zplc_shell_rules.cmake", 'zplc_check_shell_rules("" "y")')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("zplc_rule_raw_memory_switch_without_command", result.stderr)

    def test_release_and_diagnostic_images_pass(self):
        for devmem, switch in (("", ""), ("y", "y")):
            with self.subTest(devmem=devmem, switch=switch):
                result = run_rule("zplc_shell_rules.cmake", f'zplc_check_shell_rules("{devmem}" "{switch}")')
                self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
