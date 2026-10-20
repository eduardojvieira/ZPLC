#!/usr/bin/env python3
"""The harness the device scripts stand on: checks, exit status, fake devices and compiled fixtures (HIL-004, HIL-006).

Nothing here opens a serial port. A device is a fake: NullDevice shows nothing, HostRuntimeDevice is the native POSIX
runtime of this tree behind the shell grammar (ZPLC_NATIVE_SIM_BIN names its binary; those tests are skipped without it).
"""
# ---- HIL-006: compiled fixtures are produced at run time and never tracked ----
import io
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import hil_record
from hil_devices import HostRuntimeDevice, NullDevice
from hil_record import IDENTITY_KEYS
from zplc_tester import ZPLCTester

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = os.environ.get("ZPLC_NATIVE_SIM_BIN", "")
needs_runtime = unittest.skipUnless(RUNTIME and Path(RUNTIME).is_file(), "ZPLC_NATIVE_SIM_BIN does not name the native runtime binary")
needs_bun = unittest.skipUnless(shutil.which("bun"), "bun is not on PATH")

ADD = """PROGRAM Main
VAR
  a AT %QW0 : INT;
  b AT %QW1 : INT;
END_VAR
a := 7;
b := a + 35;
END_PROGRAM
"""


class QuietCase(unittest.TestCase):
    """A test case that swallows what the scripts under test print: their PASS and FAIL lines are not this run's output."""

    def run(self, result=None):
        with redirect_stdout(io.StringIO()):
            return super().run(result)


class ChecksTests(QuietCase):
    def tester(self):
        return ZPLCTester(transport=NullDevice())

    def test_a_run_that_checked_nothing_is_a_failure(self):
        self.assertEqual(self.tester().finish(), 1)

    def test_one_failed_check_fails_the_run_and_the_passing_ones_do_not_hide_it(self):
        tester = self.tester()
        tester.check("first", True)
        tester.check("second", False, "got 3, wanted 4")
        self.assertEqual(tester.finish(), 1)
        self.assertEqual([(c.name, c.ok) for c in tester.checks], [("first", True), ("second", False)])

    def test_all_checks_passing_is_success(self):
        tester = self.tester()
        tester.check("only", True)
        self.assertEqual(tester.finish(), 0)

    def test_a_skipped_run_has_its_own_status_and_is_not_a_pass(self):
        tester = self.tester()
        tester.skip("firmware has no HIL trace")
        self.assertEqual(tester.finish(), 77)


class TablesAreTheContractTests(QuietCase):
    """HIL-008: the opcode and error tables of the Python tools are the generated contract, not copies."""

    def test_the_tester_uses_every_opcode_of_the_generated_table_with_its_number(self):
        import zplc_contract

        self.assertEqual(ZPLCTester.OP, {op.name: int(op) for op in zplc_contract.Opcode})
        self.assertGreater(len(ZPLCTester.OP), 100)

    def test_the_error_codes_of_the_opcode_scripts_are_the_generated_table(self):
        import opcode_cases
        import zplc_contract

        self.assertEqual(opcode_cases.ERR, {error.name: int(error) for error in zplc_contract.VmError})

    def test_inspect_zplc_reads_the_header_layout_of_the_contract(self):
        import struct

        import inspect_zplc
        import zplc_contract

        header = struct.pack(zplc_contract.HEADER_STRUCT, zplc_contract.ZPLC_MAGIC, 1, 0, 0, 0, 0, 0, 0, 0, zplc_contract.ZPLC_DRAFT_COUNTER)
        with redirect_stdout(io.StringIO()) as out:
            self.assertEqual(inspect_zplc.inspect(header), 0)
        self.assertIn(f"Contract draft: {zplc_contract.ZPLC_DRAFT_COUNTER}", out.getvalue())
        with redirect_stdout(io.StringIO()):
            self.assertEqual(inspect_zplc.inspect(b"\x00" * 64), 1)


@needs_runtime
class IdentityTests(QuietCase):
    """REL-023 as the tools read it: the same identity object from `zplc sys build --json` and from the text of `zplc version`."""

    def test_the_host_runtime_reports_its_identity_in_the_shapes_of_the_shell(self):
        device = HostRuntimeDevice(RUNTIME)
        try:
            tester = ZPLCTester(transport=device)
            built = tester.build_identity()
            self.assertEqual(set(built), set(IDENTITY_KEYS))
            self.assertRegex(built["commit"], r"^[0-9a-f]{40}$|^unknown$")
            self.assertEqual(built["draft_counter"], device.hello["draft_counter"])
            self.assertIn("ZPLC Runtime v", tester.send("zplc version"))
            self.assertEqual(hil_record.parse_identity_text(tester.send("zplc version")), built)
        finally:
            device.close()

    def test_a_device_that_shows_nothing_has_no_identity(self):
        self.assertEqual(ZPLCTester(transport=NullDevice()).build_identity(), {})


class NullDeviceTests(QuietCase):
    def test_it_acknowledges_commands_and_shows_zero_memory_and_no_traces(self):
        tester = ZPLCTester(transport=NullDevice())
        self.assertIn("OK", tester.send("zplc stop"))
        self.assertEqual(tester.peek(0x1000, 4), [0, 0, 0, 0])
        self.assertEqual(tester.run_bytecode([tester.OP["NOP"], tester.OP["HALT"]]), [])


@needs_runtime
class HostRuntimeDeviceTests(QuietCase):
    def test_a_compiled_program_runs_and_its_outputs_are_peeked(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "add.st"
            source.write_text(ADD)
            tester = ZPLCTester(transport=HostRuntimeDevice(RUNTIME))
            try:
                tester.upload_bytecode(tester.compile_st(str(source)))
                self.assertEqual(tester.observe(0.3, [(0x1000, 4)]), [[7, 0, 42, 0]])
            finally:
                tester.close()

    def test_unknown_commands_are_refused_like_the_shell_refuses_them(self):
        device = HostRuntimeDevice(RUNTIME)
        try:
            tester = ZPLCTester(transport=device)
            self.assertIn("command not found", tester.send("zplc persist clear"))
        finally:
            device.close()


@needs_bun
class CompiledFixturesAreNotKeptTests(QuietCase):
    def test_compiling_leaves_nothing_next_to_the_source_and_cleans_up_after_itself(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "add.st"
            source.write_text(ADD)
            tester = ZPLCTester(transport=NullDevice())
            artifact = tester.compile_st(str(source))
            self.assertGreater(len(artifact), 32)
            self.assertEqual(sorted(p.name for p in Path(directory).iterdir()), ["add.st"])
            workdir = tester.workdir
            self.assertTrue(Path(workdir).is_dir())
            tester.close()
            self.assertFalse(Path(workdir).exists())

    def test_a_program_the_compiler_refuses_raises_with_the_compiler_message(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "bad.st"
            source.write_text("PROGRAM Main\nVAR x AT %Q0.0 : INT; END_VAR\nEND_PROGRAM\n")
            tester = ZPLCTester(transport=NullDevice())
            with self.assertRaises(Exception) as caught:
                tester.compile_st(str(source))
            self.assertIn("BOOL", str(caught.exception))
            tester.close()


if __name__ == "__main__":
    unittest.main()
