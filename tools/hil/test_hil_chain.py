#!/usr/bin/env python3
"""HIL-003 and HIL-012: the chain command for a board needs a person at a terminal, prompts for each physical step, and writes a record.

No serial port is opened here. The chain runs against fake devices (`--dry-run --device null|host`) and scripted people.
"""
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

os.environ["ZPLC_HIL_FORBID_SERIAL"] = "1"

import hil_ports  # noqa: E402

hil_ports.list_serial_ports = lambda: []

import hil_devices  # noqa: E402
import hil_guard  # noqa: E402
import hil_record  # noqa: E402
import run_chain  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUNTIME = os.environ.get("ZPLC_NATIVE_SIM_BIN", "")
needs_runtime = unittest.skipUnless(RUNTIME and Path(RUNTIME).is_file(), "ZPLC_NATIVE_SIM_BIN does not name the native runtime binary")


class ScriptedPerson:
    """A terminal that answers the questions in order, and says it is interactive."""

    interactive = True

    def __init__(self, *answers):
        self.answers, self.said = list(answers), []

    def say(self, text):
        self.said.append(text)

    def ask(self, prompt):
        self.said.append(prompt)
        return self.answers.pop(0) if self.answers else ""


class QuietCase(unittest.TestCase):
    """A test case that swallows what the scripts under test print: their PASS and FAIL lines are not this run's output."""

    def run(self, result=None):
        with redirect_stdout(io.StringIO()):
            return super().run(result)


class GuardTests(QuietCase):
    def test_a_terminal_that_is_not_interactive_is_refused(self):
        with self.assertRaises(hil_guard.NotInteractive):
            hil_guard.require_interactive(hil_guard.PipedIo(), "the chain")

    def test_a_physical_step_needs_the_identity_the_device_reports_typed_by_the_person(self):
        person = ScriptedPerson("rpi_pico")
        confirmation = hil_guard.confirm_physical(person, {"id": "flash", "instruction": "Flash the board."}, "rpi_pico")
        self.assertEqual(confirmation["confirmed_identity"], "rpi_pico")
        self.assertRegex(confirmation["confirmed_at"], r"^\d{4}-\d{2}-\d{2}T")
        self.assertTrue(any("Flash the board." in line for line in person.said))

    def test_enter_alone_does_not_confirm_a_physical_step(self):
        with self.assertRaises(hil_guard.IdentityMismatch):
            hil_guard.confirm_physical(ScriptedPerson("", ""), {"id": "flash", "instruction": "x"}, "rpi_pico")

    def test_the_identity_of_another_board_does_not_confirm_it(self):
        with self.assertRaises(hil_guard.IdentityMismatch):
            hil_guard.confirm_physical(ScriptedPerson("esp32s3", "esp32s3"), {"id": "flash", "instruction": "x"}, "rpi_pico")


class StartTests(QuietCase):
    def run_script(self, *args):
        env = {k: v for k, v in os.environ.items() if k not in ("ZPLC_SERIAL_PORT", "ZPLC_HIL_DEVICE")}
        env["ZPLC_HIL_FORBID_SERIAL"] = "1"
        return subprocess.run([sys.executable, "-B", str(HERE / "run_chain.py"), *args], capture_output=True, text=True, cwd=ROOT, env=env, stdin=subprocess.DEVNULL)

    def test_started_without_an_interactive_terminal_it_exits_with_an_error_before_touching_a_port(self):
        done = self.run_script("rpi_pico")
        self.assertEqual(done.returncode, 2, done.stdout + done.stderr)
        self.assertIn("interactive terminal", done.stderr)

    def test_an_unknown_board_is_refused(self):
        done = self.run_script("no_such_board", "--dry-run", "--device", "null")
        self.assertEqual(done.returncode, 2, done.stdout + done.stderr)
        self.assertIn("no_such_board", done.stderr)


class DryRunTests(QuietCase):
    def chain(self, *extra):
        with tempfile.TemporaryDirectory() as directory:
            code = run_chain.main(["rpi_pico", "--dry-run", "--out", directory, "--operator", "CI", *extra], stdout=io.StringIO())
            records = sorted(Path(directory).glob("*.json"))
            return code, [json.loads(p.read_text()) for p in records]

    def test_a_device_that_shows_nothing_fails_the_chain_and_the_record_says_so(self):
        code, records = self.chain("--device", "null", "--only", "il.minimal")
        self.assertEqual(code, 1)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["result"], "fail")
        self.assertEqual(records[0]["evidence"], "fake")
        self.assertEqual(hil_record.validate(records[0]), [])

    @needs_runtime
    def test_on_the_host_runtime_the_flow_passes_and_the_record_is_never_hardware_evidence(self):
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        code, records = self.chain("--device", "host", "--only", "il.minimal,ld.basic_coil")
        self.assertEqual(code, 0)
        record = records[0]
        self.assertEqual(record["evidence"], "host-runtime")
        self.assertEqual(record["result"], "pass")
        self.assertEqual(hil_record.validate(record), [])
        ids = [step["id"] for step in record["steps"]]
        for expected in ("preflight", "flash", "handshake", "confirm-identity", "deploy", "run", "force", "stop"):
            self.assertIn(expected, ids)
        self.assertEqual({t["id"]: t["result"] for t in record["tests"]}, {"il.minimal": "pass", "ld.basic_coil": "pass"})
        self.assertEqual(record["device"]["reported_board"], "native_posix")
        self.assertTrue(record["coverage"]["pending"], "the HIL-010 items the chain cannot run yet are listed, not hidden")

    def test_physical_steps_in_a_dry_run_are_not_confirmed_by_anyone(self):
        code, records = self.chain("--device", "null", "--only", "il.minimal")
        physical = [step for step in records[0]["steps"] if step["kind"] == "physical"]
        self.assertTrue(physical)
        self.assertTrue(all("confirmed_at" not in step and "dry run" in step.get("detail", "") for step in physical))


class BuildCommandAndTraceTests(QuietCase):
    """HIL-013: the chain says how to build the image under test, and the record says whether that image has the trace on."""

    def chain(self, *extra, options=None):
        def opener(name):
            device = hil_devices.open_fake(name)
            if options is not None:
                device.hello["build"]["options"] = options
            return device

        with tempfile.TemporaryDirectory() as directory:
            out = io.StringIO()
            code = run_chain.main(["rpi_pico", "--dry-run", "--out", directory, "--operator", "CI", "--only", "il.minimal", *extra], stdout=out, opener=opener)
            record = json.loads(next(Path(directory).glob("*.json")).read_text())
            return code, record, out.getvalue()

    @needs_runtime
    def test_the_record_carries_the_exact_build_command_and_the_identity_the_image_reports(self):
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        code, record, _ = self.chain()
        self.assertEqual(code, 0)
        manifest = json.loads((ROOT / "firmware/app/boards/boards.json").read_text())
        wanted = next(b["build_command"] for b in manifest if b["ide_id"] == "rpi_pico")
        self.assertEqual(record["firmware"]["build_command"], wanted)
        self.assertNotIn("EXTRA_CONF_FILE", record["firmware"]["build_command"])
        self.assertRegex(record["firmware"]["commit"], r"^[0-9a-f]{40}$")
        self.assertRegex(record["firmware"]["options_hash"], r"^[0-9a-f]{8}$")
        self.assertNotIn("hil_trace", record["firmware"], "a host runtime has no such option, so the record does not say")
        self.assertIn(wanted, [step.get("detail", "") for step in record["steps"] if step["id"] == "flash"][0])

    def test_with_the_trace_asked_for_the_command_names_the_overlay_and_the_overlay_turns_the_option_on(self):
        command = run_chain.build_command({"build_command": "west build -b rpi_pico/rp2040 firmware/app --pristine"}, with_trace=True)
        self.assertTrue(command.startswith("west build -b rpi_pico/rp2040 firmware/app --pristine -- -DEXTRA_CONF_FILE="))
        overlay = Path(command.split("-DEXTRA_CONF_FILE=")[1])
        self.assertTrue(overlay.is_file())
        self.assertEqual([l for l in overlay.read_text().splitlines() if l and not l.startswith("#")], ["CONFIG_ZPLC_HIL_DEBUG=y"])

    @needs_runtime
    def test_an_image_with_the_trace_on_in_a_run_that_did_not_ask_for_it_fails_the_chain(self):
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        code, record, _ = self.chain(options="HIL_DEBUG=y,SCHEDULER=y")
        self.assertEqual(code, 1)
        self.assertIs(record["firmware"]["hil_trace"], True)
        trace = next(step for step in record["steps"] if step["id"] == "trace-option")
        self.assertEqual(trace["result"], "fail")

    @needs_runtime
    def test_an_image_without_the_trace_in_a_run_that_asked_for_it_fails_the_chain(self):
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        code, record, _ = self.chain("--hil-trace", options="SCHEDULER=y")
        self.assertEqual(code, 1)
        self.assertIs(record["firmware"]["hil_trace"], False)
        self.assertIn("EXTRA_CONF_FILE", record["firmware"]["build_command"])

    @needs_runtime
    def test_an_image_with_the_trace_in_a_run_that_asked_for_it_passes_the_option_check(self):
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        code, record, _ = self.chain("--hil-trace", options="HIL_DEBUG=y,SCHEDULER=y")
        trace = next(step for step in record["steps"] if step["id"] == "trace-option")
        self.assertEqual(trace["result"], "pass")
        self.assertEqual(code, 0)

    def test_a_device_that_reports_no_identity_leaves_the_firmware_fields_out_and_the_option_unchecked(self):
        code, record, _ = self.chain("--device", "null")
        self.assertEqual(code, 1)  # nothing it shows passes a fixture
        self.assertNotIn("commit", record["firmware"])
        self.assertEqual(next(s for s in record["steps"] if s["id"] == "trace-option")["result"], "skipped")


class InteractiveRunTests(QuietCase):
    @needs_runtime
    def test_a_person_confirms_each_physical_step_by_typing_what_the_device_reports(self):
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        person = ScriptedPerson("", "native_posix", "native_posix", "native_posix")  # Enter after the flash, then the identity of each physical step
        with tempfile.TemporaryDirectory() as directory:
            code = run_chain.run(
                run_chain.parse(["rpi_pico", "--out", directory, "--operator", "A. Person", "--device", "host", "--only", "il.minimal"]),
                person,
            )
            record = json.loads(next(Path(directory).glob("*.json")).read_text())
        self.assertEqual(code, 0)
        confirmed = [s for s in record["steps"] if s["kind"] == "physical" and s.get("confirmed_identity")]
        self.assertEqual([s["id"] for s in confirmed], ["confirm-identity", "safe-to-drive"])
        self.assertTrue(all(s["confirmed_identity"] == "native_posix" and s["confirmed_at"] for s in confirmed))
        self.assertEqual(person.answers, ["native_posix"], "the flash step asks for Enter, and the person is asked for each identity")
        self.assertEqual(record["evidence"], "host-runtime")


if __name__ == "__main__":
    unittest.main()
