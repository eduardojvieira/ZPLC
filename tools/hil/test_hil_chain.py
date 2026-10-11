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

    @needs_runtime
    def test_the_chain_runs_for_every_board_that_has_an_io_description(self):
        """HIL-011: nothing in the harness is written for one board. Each board of the manifest, named by its IDE id or its
        manifest id, gets its own record, its own build command and its own I/O description in the loopback step."""
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        manifest = json.loads((ROOT / "firmware/app/boards/boards.json").read_text())
        self.assertGreaterEqual(len(manifest), 7)
        for board in manifest:
            self.assertTrue(board["io"]["channels"], f"{board['board_id']} has no I/O description")
            for name in (board["ide_id"], board["board_id"]):
                with self.subTest(name), tempfile.TemporaryDirectory() as directory:
                    code = run_chain.main([name, "--dry-run", "--device", "host", "--out", directory, "--operator", "CI", "--only", "il.minimal"], stdout=io.StringIO())
                    (path,) = Path(directory).glob("*.json")
                    record = json.loads(path.read_text())
                    self.assertEqual(code, 0)
                    self.assertEqual(record["board"]["board_id"], board["board_id"])
                    self.assertEqual(record["evidence"], "host-runtime", "a stand-in is never evidence of a board")
                    flash = next(step for step in record["steps"] if step["id"] == "flash")
                    self.assertIn(board["build_command"], flash.get("detail", ""))
                    loopback = next(step for step in record["steps"] if step["id"] == "digital-loopback")
                    for channel in (c["id"] for c in board["io"]["channels"] if c["kind"] == "digital"):
                        self.assertIn(channel, loopback["detail"])

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


def pico():
    boards = json.loads((ROOT / "firmware/app/boards/boards.json").read_text())
    return next(b for b in boards if b["ide_id"] == "rpi_pico")


def boards_library():
    import importlib.util

    spec = importlib.util.spec_from_file_location("zplc_boards_under_test", ROOT / "firmware/zephyr/scripts/zplc_boards.py")
    library = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(library)
    return library


class IoDescriptionDevice(hil_devices.HostRuntimeDevice):
    """The native runtime that also answers `zplc sys io` with the identity it is given: what a board whose image carries an I/O description says.

    Given `kind="serial"` it only pretends to be a flashed board, with a clean 40-digit commit: no port is opened.
    """

    def __init__(self, io_identity=None, kind="host-runtime"):
        super().__init__(RUNTIME)
        self.io_identity, self.kind = io_identity, kind
        if kind == "serial":
            self.hello["build"] = {**self.hello["build"], "commit": "ab" * 20, "dirty": False}

    def handle(self, line):
        if line.startswith("zplc sys io"):
            if self.io_identity is None:
                return "zplc: command not found\r\n"
            if "--json" in line:
                return json.dumps({"schema": 1, **self.io_identity}, separators=(",", ":")) + "\r\n"
            i = self.io_identity
            return f"I/O description: {i['board_id']}, {i['channels']} channels, hash {i['hash']}, {i['input_bytes']} B in, {i['output_bytes']} B out\r\n"
        return super().handle(line)


@needs_runtime
class IoDescriptionTests(QuietCase):
    """IO-004 as the chain uses it: the image's description must be the one boards.json has for the board, and nothing about wiring is invented."""

    def setUp(self):
        self.library = boards_library()
        self.board = pico()
        inputs, outputs = self.library.image_extent(self.board)
        self.good = {
            "board_id": self.board["board_id"], "hash": self.library.description_hash(self.board),
            "channels": len(self.board["io"]["channels"]), "input_bytes": inputs, "output_bytes": outputs,
        }

    def chain(self, identity, *extra, kind="host-runtime"):
        """Returns the exit code, the run records and the flat evidence records the chain wrote."""
        with tempfile.TemporaryDirectory() as directory:
            code = run_chain.main(
                ["rpi_pico", "--dry-run", "--out", directory, "--operator", "CI", "--only", "il.minimal", *extra],
                stdout=io.StringIO(), opener=lambda name: IoDescriptionDevice(identity, kind),
            )
            names = sorted(p.name for p in Path(directory).glob("*.json"))
            load = lambda name: json.loads((Path(directory) / name).read_text())  # noqa: E731
            return (
                code,
                [load(n) for n in names if not n.endswith(".evidence.json")],
                {n: load(n) for n in names if n.endswith(".evidence.json")},
            )

    def step(self, record, step_id="io-description"):
        return next(s for s in record["steps"] if s["id"] == step_id)

    def test_an_image_built_from_the_description_of_the_board_passes_and_both_sides_are_recorded(self):
        code, (record,), _ = self.chain(self.good)
        self.assertEqual(code, 0)
        self.assertEqual(self.step(record)["result"], "pass")
        self.assertEqual(record["device"]["io"], self.good)
        self.assertEqual(record["board"]["board_id"], "rpi-pico-rp2040")
        self.assertEqual(record["board"]["io"]["hash"], self.good["hash"])
        self.assertEqual(record["board"]["io"]["channels"], len(self.board["io"]["channels"]))
        self.assertEqual(hil_record.validate(record), [])

    def test_an_image_of_another_boards_description_fails_the_chain(self):
        code, (record,), _ = self.chain({**self.good, "board_id": "nucleo-h743zi"})
        self.assertEqual(code, 1)
        self.assertEqual(self.step(record)["result"], "fail")
        self.assertIn("nucleo-h743zi", self.step(record)["detail"])

    def test_an_image_with_another_hash_or_size_fails_the_chain(self):
        for changed in ({"hash": "00000000"}, {"channels": self.good["channels"] + 1}, {"input_bytes": self.good["input_bytes"] + 1}):
            with self.subTest(changed=changed):
                code, (record,), _ = self.chain({**self.good, **changed})
                self.assertEqual((code, self.step(record)["result"]), (1, "fail"))

    def test_an_image_that_reports_no_description_is_skipped_not_passed(self):
        code, (record,), _ = self.chain(None)
        self.assertEqual(self.step(record)["result"], "skipped")
        self.assertNotIn("io", record["device"])
        self.assertEqual(code, 0)

    def test_the_loopback_item_names_the_channels_of_the_description_and_leaves_the_wiring_to_the_person(self):
        _, (record,), _ = self.chain(self.good)
        item = self.step(record, "digital-loopback")
        channels = self.board["io"]["channels"]
        digital = [c["id"] for c in channels if c["kind"] == "digital"]
        self.assertEqual(item["result"], "pending")
        for channel_id in digital:
            self.assertIn(channel_id, item["detail"])
        self.assertIn("TO BE FILLED", item["detail"])
        self.assertNotRegex(item["detail"], r"(?i)\bwire\b[^.]* to ", "no wiring is invented")
        analog = self.step(record, "analog-read")
        for channel_id in (c["id"] for c in channels if c["kind"] == "analog"):
            self.assertIn(channel_id, analog["detail"])

    def test_a_hardware_run_writes_the_evidence_record_the_manifest_derives_its_support_level_from(self):
        with tempfile.TemporaryDirectory() as scratch:
            image = Path(scratch) / "zephyr.uf2"
            image.write_bytes(b"an image that was flashed")
            code, (full,), written = self.chain(self.good, "--firmware-image", str(image), kind="serial")
        self.assertEqual(full["evidence"], "hardware")
        (name, evidence), = written.items()
        self.assertEqual(evidence["schema"], "zplc.hil-record/1")
        self.assertEqual(evidence["board_id"], "rpi-pico-rp2040")
        self.assertEqual(evidence["firmware_version"], full["firmware"]["version"])
        self.assertEqual(evidence["commit"], "ab" * 20)
        self.assertEqual(evidence["image_sha256"], hil_record.sha256_hex(b"an image that was flashed"))
        self.assertEqual(evidence["result"], full["result"])
        self.assertEqual(evidence["run_id"], full["run_id"])
        self.assertTrue(name.startswith(evidence["run_record"].removesuffix(".json")))
        self.assertTrue(evidence["coverage"]["pending"], "a record says what it did not run")
        # the manifest's consumer takes it: schema, board id, version, 40-digit commit, 64-digit image hash and a result
        derived = boards_library().support_level_from_records("rpi-pico-rp2040", [(name, evidence)])
        self.assertEqual([r["result"] for r in derived["records"]], [evidence["result"]])
        self.assertEqual(derived["level"], "human-hil" if evidence["result"] == "pass" else "cross-build")
        why = next(log for log in full["logs"] if log["name"] == "evidence-record")
        self.assertIn(name, why["text"])

    def test_a_run_on_a_stand_in_writes_no_evidence_record_and_says_so(self):
        _, (record,), written = self.chain(self.good)
        self.assertEqual(written, {})
        why = next(log for log in record["logs"] if log["name"] == "evidence-record")
        self.assertIn("not written", why["text"])
        self.assertIn("host-runtime", why["text"])

    def test_a_hardware_run_that_cannot_name_its_image_writes_no_evidence_record_and_says_why(self):
        _, (record,), written = self.chain(self.good, kind="serial")
        self.assertEqual(written, {})
        why = next(log for log in record["logs"] if log["name"] == "evidence-record")
        self.assertIn("--firmware-image", why["text"])

    def test_an_image_from_an_uncommitted_tree_is_not_evidence_of_a_commit(self):
        class Dirty(IoDescriptionDevice):
            def __init__(self, *a, **k):
                super().__init__(*a, **k)
                self.hello["build"] = {**self.hello["build"], "dirty": True}

        with tempfile.TemporaryDirectory() as scratch:
            image = Path(scratch) / "zephyr.uf2"
            image.write_bytes(b"x")
            with tempfile.TemporaryDirectory() as directory:
                run_chain.main(
                    ["rpi_pico", "--dry-run", "--out", directory, "--operator", "CI", "--only", "il.minimal", "--firmware-image", str(image)],
                    stdout=io.StringIO(), opener=lambda name: Dirty(self.good, "serial"),
                )
                self.assertEqual(list(Path(directory).glob("*.evidence.json")), [])
                record = json.loads(next(Path(directory).glob("*.json")).read_text())
        self.assertIn("uncommitted", next(log for log in record["logs"] if log["name"] == "evidence-record")["text"])


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
