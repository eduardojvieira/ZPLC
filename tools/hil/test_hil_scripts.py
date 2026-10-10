#!/usr/bin/env python3
"""Every device script of tools/hil exits non-zero when a check fails (HIL-004), takes its port from a parameter (HIL-007)
and makes no compiled file in the tree (HIL-006). No serial port is opened here: the scripts run on a fake device.

    null          shows nothing, so every check against it must fail
    host-runtime  the native POSIX runtime of this tree (ZPLC_NATIVE_SIM_BIN names it); the passing paths need it
"""
import importlib
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

os.environ["ZPLC_HIL_FORBID_SERIAL"] = "1"  # a tripwire: nothing in this test run may open a port

import hil_ports  # noqa: E402

hil_ports.list_serial_ports = lambda: []  # nor may the list of real ports be asked for

from hil_devices import HostRuntimeDevice, NullDevice  # noqa: E402
from language_tester import LanguageTester  # noqa: E402
from zplc_tester import EXIT_SKIPPED, ZPLCTester  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUNTIME = os.environ.get("ZPLC_NATIVE_SIM_BIN", "")
needs_runtime = unittest.skipUnless(RUNTIME and Path(RUNTIME).is_file(), "ZPLC_NATIVE_SIM_BIN does not name the native runtime binary")
FULL = bool(os.environ.get("ZPLC_HIL_FULL"))

# script module -> the function that runs it
OPCODE_SCRIPTS = {
    "test_system": "test_system", "test_stack_ops": "test_stack_ops", "test_int_math": "test_int_math", "test_logic": "test_logic",
    "test_comparison": "test_comparison", "test_push": "test_push", "test_control_flow": "test_control_flow",
    "test_load_store": "test_load_store", "test_conversion": "test_conversion", "test_float_math": "test_float_math",
    "test_strings": "test_strings", "test_errors": "test_errors",
}
FIXTURE_SCRIPTS = {
    "test_blinky": "test_blinky", "test_complex": "test_complex", "test_counters_extra": "test_counters", "test_debug_bool": "run_tests",
    "test_debug_gt": "run_tests", "test_debug_peek": "run_test", "test_debug_var": "run_tests", "test_fb_ctu": "test_fb_ctu",
    "test_fb_rs": "test_fb_rs", "test_fb_struct": "test_fb_struct", "test_fb_ton": "test_fb_ton", "test_full_language": "test_full",
    "test_il": "test_il", "test_il_minimal": "test_il_minimal", "test_loop": "test_loop", "test_loop_control": "test_loop_control",
    "test_master": "test_master", "test_master_2": "test_master_2", "test_math_control": "test_math_control",
    "test_math_real": "test_math_real", "test_moving_avg": "test_moving_avg", "test_named_params": "test_named",
    "test_oop": "test_oop", "test_oop_extends": "test_oop_extends", "test_pointer": "test_pointer", "test_process": "test_process",
    "test_user_function": "test_user_function", "test_vartemp": "test_vartemp",
    "test_il_suite": "run_tests", "test_ld_suite": "run_tests", "test_fbd_suite": "run_tests", "test_sfc_suite": "run_tests",
    "test_st_suite": "run_tests", "test_examples_suite": "run_tests",
    "test_scheduler_task_replacement": "run_test", "run_pico_blinky": "run",
}
# scripts that take their own command line and open the serial port themselves
SERIAL_SCRIPTS = ["test_modbus_rtu_serial", "test_modbus_tcp", "test_comm_security"]
# what a script is when it is not a device script: libraries, host checks with their own exit status, and unit tests
LIBRARIES = {"zplc_tester", "language_tester", "fixture_script", "opcode_cases", "hil_ports", "hil_devices"}
HOST_CHECKS = {
    "audit_repo_hygiene", "audit_specs_scope", "validate_docs_parity", "validate_release_evidence", "validate_supported_boards",
    "run_board_matrix", "verify_compilation", "run_all_hil_tests", "run_all_languages",
}


def load(name):
    return importlib.import_module(name)


class QuickLanguageTester(LanguageTester):
    """Compiles nothing: the fixtures are compiled by the host test and by verify_compilation, and a null device runs no program."""

    def compile_st(self, source):
        return [0] * 40

    def compile_project(self, directory):
        return [0] * 40


class NoTraceDevice(NullDevice):
    """A device that says it has no HIL trace mode, as a release image does."""

    def handle(self, line):
        return "ERROR: hil: command not found\r\n" if line.startswith("zplc hil") else super().handle(line)


class DeviceScriptsFailTests(unittest.TestCase):
    def test_every_opcode_script_fails_on_a_device_that_shows_nothing(self):
        for module, function in OPCODE_SCRIPTS.items():
            with self.subTest(script=module):
                self.assertEqual(getattr(load(module), function)(ZPLCTester(transport=NullDevice())), 1)

    def test_an_opcode_script_is_skipped_not_passed_when_the_device_has_no_trace(self):
        for module, function in OPCODE_SCRIPTS.items():
            with self.subTest(script=module):
                self.assertEqual(getattr(load(module), function)(ZPLCTester(transport=NoTraceDevice())), EXIT_SKIPPED)

    def test_every_fixture_and_project_script_fails_on_a_device_that_shows_nothing(self):
        for module, function in FIXTURE_SCRIPTS.items():
            with self.subTest(script=module):
                self.assertEqual(getattr(load(module), function)(QuickLanguageTester(transport=NullDevice())), 1)


class ScriptsAreSafeToImportAndRunTests(unittest.TestCase):
    def test_every_script_imports_without_a_port_or_pyserial(self):
        for module in [*OPCODE_SCRIPTS, *FIXTURE_SCRIPTS, *SERIAL_SCRIPTS, "check_alive", "check_hw", "debug_peek", "sniff", "rescue", "rescue_device", "inspect_zplc"]:
            with self.subTest(script=module):
                load(module)

    def test_a_script_with_no_port_to_use_exits_2_and_says_what_to_pass(self):
        env = {k: v for k, v in os.environ.items() if k not in ("ZPLC_SERIAL_PORT", "ZPLC_PORT", "ZPLC_HIL_DEVICE")}
        env["ZPLC_HIL_FORBID_SERIAL"] = "1"
        for script in ["test_loop.py", "test_system.py", "check_alive.py", "sniff.py", "debug_peek.py", "rescue.py", "test_modbus_tcp.py", "test_comm_security.py"]:
            with self.subTest(script=script):
                done = subprocess.run([sys.executable, "-B", str(HERE / script)], capture_output=True, text=True, env=env, cwd=ROOT)
                self.assertEqual(done.returncode, 2, done.stdout + done.stderr)
                self.assertIn("error:", done.stderr)

    def test_a_script_on_the_null_device_exits_1_from_the_command_line(self):
        env = {**os.environ, "ZPLC_HIL_DEVICE": "null", "ZPLC_HIL_FORBID_SERIAL": "1"}
        done = subprocess.run([sys.executable, "-B", str(HERE / "test_system.py")], capture_output=True, text=True, env=env, cwd=ROOT)
        self.assertEqual(done.returncode, 1, done.stdout + done.stderr)

    def test_the_serial_scripts_do_not_open_a_port_they_were_not_given(self):
        for module in SERIAL_SCRIPTS:
            with self.subTest(script=module):
                saved = sys.argv
                sys.argv = [module, "--port", "FAKE-PORT"]
                try:
                    code = load(module).main()
                except Exception as error:  # a failing open is a failure, whatever its type: what matters is that it is not 0
                    code = repr(error)
                finally:
                    sys.argv = saved
                self.assertNotEqual(code, 0)


class BenchUtilitiesTests(unittest.TestCase):
    def test_every_non_gating_script_is_listed_with_its_purpose_in_the_readme(self):
        listed = json.loads((HERE / "non-gating.json").read_text())["scripts"]
        readme = (HERE / "README.md").read_text()
        for name, entry in listed.items():
            with self.subTest(script=name):
                self.assertTrue((HERE / name).is_file())
                self.assertTrue(entry["purpose"].strip() and entry["reason"].strip())
                self.assertIn(name, readme)

    def test_every_script_of_tools_hil_is_gating_or_listed_as_a_bench_utility(self):
        non_gating = set(json.loads((HERE / "non-gating.json").read_text())["scripts"])
        gating = {f"{m}.py" for m in [*OPCODE_SCRIPTS, *FIXTURE_SCRIPTS, *SERIAL_SCRIPTS]}
        known = non_gating | gating | {f"{m}.py" for m in [*LIBRARIES, *HOST_CHECKS]}
        scripts = {p.name for p in HERE.glob("*.py") if not p.name.startswith("test_hil_") and not p.name.startswith("test_validate_")}
        self.assertEqual(sorted(scripts - known), [], "a script of tools/hil is neither gating nor on tools/hil/non-gating.json")
        self.assertEqual(sorted(non_gating & gating), [], "a script is both gating and non-gating")
        self.assertEqual(sorted(known - scripts), [], "a script that the lists name is gone")


@needs_runtime
class FixtureScriptsPassOnTheHostRuntimeTests(unittest.TestCase):
    """The passing paths: the scripts run on the native runtime of this tree and exit 0, so that their expected values are right."""

    QUICK = ["test_il_suite", "test_ld_suite", "test_fbd_suite", "test_sfc_suite", "test_loop", "test_pointer", "test_vartemp",
             "test_fb_rs", "test_fb_struct", "test_complex", "test_examples_suite", "test_scheduler_task_replacement"]

    def test_the_scripts_exit_0_on_the_native_runtime(self):
        for module in (FIXTURE_SCRIPTS if FULL else {m: FIXTURE_SCRIPTS[m] for m in self.QUICK}):
            with self.subTest(script=module):
                tester = LanguageTester(transport=HostRuntimeDevice(RUNTIME))
                self.assertEqual(getattr(load(module), FIXTURE_SCRIPTS[module])(tester), 0)


if __name__ == "__main__":
    unittest.main()
