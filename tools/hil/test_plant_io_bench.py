#!/usr/bin/env python3
"""plant_io_bench.py and validate_plant_io_evidence.py on a Python fake of the board (no port, no hardware).

The fake engine answers the plant messages as the firmware contract says (plan-m6 R-M6-1 to R-M6-7): ENTER is refused
with RANGE when the response cannot fit the negotiated payload, frames from another session answer STATE, an exit raised
in the scan arrives as EVT_PLANT_EXIT, and `late` counts scans that found no new frame. Its bytes are checked against
tools/contract/plant_vectors.json. A fake that claims to be a serial port here is a stand-in for the logic; no evidence
file made on it means anything about a board.
"""
import io
import json
import os
import struct
import sys
import tempfile
import unittest
import zlib
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

os.environ["ZPLC_HIL_FORBID_SERIAL"] = "1"  # a tripwire: nothing in this test run may open a port

import plant_io_bench as bench  # noqa: E402
import validate_plant_io_evidence as validator  # noqa: E402
from hil_devices import ShellDevice  # noqa: E402
from zplc_tester import ZPLCTester  # noqa: E402

HERE = Path(__file__).resolve().parent
VECTORS = {v["name"]: v for v in json.loads((HERE.parents[0] / "contract" / "plant_vectors.json").read_text())["vectors"]}
proto, DEF, MSG, ERR = bench.proto, bench.DEFINITION, bench.MSG, {v: k for k, v in bench.ERR.items()}
PROGRAM = b"echo-program-bytes"


class FakeBoard(ShellDevice):
    """A board behind a shell: the framed link in `zplc link` lines, `zplc sched status --json` and a peek of the output image."""

    kind = "serial"

    def __init__(self, program=PROGRAM, enter_status=0, exit_after=None, stale_session=False):
        super().__init__()
        self.crc, self.enter_status, self.exit_after, self.stale = zlib.crc32(program) & 0xFFFFFFFF, enter_status, exit_after, stale_session
        self.running, self.active, self.mirror, self.frames, self.applied, self.image = True, False, 0, 0, 0, b"\x00\x00"
        self.plugged, self.pull_in, self.event_sequence = True, None, 0
        self.deaf = False  # answers nothing

    # the person's hands ---------------------------------------------------------------------------
    def pull_cable(self):
        self.plugged, self.running, self.active, self.image = False, False, False, b"\x00\x00"

    def plug(self):
        self.plugged = True

    def write(self, data):
        if not self.plugged:
            raise OSError("the port is gone")
        if self.pull_in is not None and b"zplc link" in data:
            self.pull_in -= 1
            if self.pull_in <= 0:
                self.pull_cable()
                raise OSError("the port is gone")
        return super().write(data)

    # the shell ----------------------------------------------------------------------------------------
    def handle(self, line):
        if line.startswith("zplc link "):
            decoder = proto.Decoder(DEF, 512)
            decoder.push(bytes.fromhex(line.split()[2]))
            return "".join(f"ZF:{frame.hex()}\r\n" for frame in self.link(decoder.frames[0])) if not self.deaf else ""
        if line == "zplc version":
            return "ZPLC 2.1.0-test\r\n"
        if line.startswith("zplc sys"):
            return ""
        if line == "zplc sched status --json":
            return '{"state":"%s"}\r\n' % ("running" if self.running else "idle")
        if line.startswith("zplc dbg peek"):
            return self.dump(self.image, 0x1000)
        return "ERROR: unknown\r\n"

    def reply(self, frame, status, body=b""):
        return proto.encode_frame(DEF, 1, frame["message"], frame["sequence"], bytes([status]) + body)

    def link(self, frame):
        name = {v: k for k, v in MSG.items()}[frame["message"]]
        payload = frame["payload"]
        if name == "HELLO":
            return [self.reply(frame, 0, struct.pack("<BBHIBBHB", 1, 1, 512, 1 << 12, 0, 0, 30, 0))]
        if name == "SESSION_OPEN":
            return [self.reply(frame, 0, struct.pack("<IHB", 7, 30, 0))]
        if name == "EVENTS_SET":
            return [self.reply(frame, 0)]
        if name == "PROGRAM_INFO":
            return [self.reply(frame, 0, struct.pack("<BIII", 1, len(PROGRAM), self.crc, 1))]
        if name == "RUN":
            self.running = True
            return [self.reply(frame, 0, b"\x01")]
        if name == "PLANT_ENTER":
            if self.enter_status:
                return [self.reply(frame, self.enter_status)]
            self.active = True
            return [self.reply(frame, 0, struct.pack("<HHHBH", 1, 7, 1, 32, 500))]
        if name == "PLANT_MIRROR":
            self.mirror = payload[0]
            return [self.reply(frame, 0, bytes([self.mirror]))]
        if name == "PLANT_EXIT":
            self.active, self.running, self.image = False, False, b"\x00\x00"
            return [self.reply(frame, 0, struct.pack("<BIHH", 0, self.frames, 0, 0))]
        if name == "PLANT_FRAME":
            if not self.active or self.stale:
                return [self.reply(frame, ERR["STATE"])]
            plant_id, seq = struct.unpack_from("<HI", payload, 0)
            self.frames, self.applied = self.frames + 1, seq
            self.image = bytes([payload[6] & 3, 0])  # the echo program: IPI 0.0 and 0.1 to OPI 0.0 and 0.1
            out = [self.reply(frame, 0, struct.pack("<IIBHHB", seq, self.frames, self.mirror, 0, 0, self.image[0]))]
            if self.exit_after is not None and self.frames >= self.exit_after:
                self.active, self.running = False, False
                self.event_sequence += 1
                out.append(proto.encode_frame(DEF, 2, bench.EVT["EVT_PLANT_EXIT"], self.event_sequence, struct.pack("<BI", 1, self.frames)))
            return out
        return [self.reply(frame, ERR["UNKNOWN_MESSAGE"])]


class Person:
    """A person at the keyboard: types the board id, confirms (or not), pulls and replugs the cable."""

    def __init__(self, board, device, says=("yes", "yes", "yes", "yes")):
        self.board, self.device, self.says, self.prompts = board, device, list(says), []

    def __call__(self, prompt):
        self.prompts.append(prompt)
        if "board id" in prompt:
            return self.board
        if "Plug the cable" in prompt:
            self.device.plug()
            return ""
        answer = self.says.pop(0)
        if "pull the cable" in prompt and answer == "yes":
            self.device.pull_in = 3  # the cable goes out three frames later
        return answer


class QuietCase(unittest.TestCase):
    def run(self, result=None):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return super().run(result)


class BenchCase(QuietCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.program = Path(self.dir.name) / "echo.zplc"
        self.program.write_bytes(PROGRAM)
        self.out = Path(self.dir.name) / "evidence.json"

    def argv(self, *extra, frames="30"):
        return ["--board", "esp32s3_devkitc", "--transport", "usb-serial", "--program", str(self.program), "--frames", frames,
                "--frame-ms", "1", "--phase-s", "0.01", "--response-timeout-ms", "200", "--out", str(self.out), *extra]

    def run_bench(self, device=None, person=None, tty=True, extra=(), **kwargs):
        device = device or FakeBoard()
        opened = []

        def open_tester():
            opened.append(1)
            return ZPLCTester(transport=device)

        person = person or Person("esp32s3_devkitc", device)
        code = bench.main(self.argv(*extra, **kwargs), is_tty=tty, ask=person, open_tester=open_tester, sleep=lambda s: None)
        return code, opened, person

    def evidence(self):
        return json.loads(self.out.read_text())


class StartRulesTests(BenchCase):
    def test_refuses_without_a_tty(self):
        code, opened, _ = self.run_bench(tty=False)
        self.assertEqual((code, opened, self.out.exists()), (2, [], False))

    def test_refuses_when_the_typed_board_id_differs(self):
        device = FakeBoard()
        code, opened, _ = self.run_bench(device, Person("rpi_pico", device))
        self.assertEqual((code, opened, self.out.exists()), (2, [], False))

    def test_a_fake_device_cannot_make_hil_evidence(self):
        device = FakeBoard()
        device.kind = "fake"
        code, _, _ = self.run_bench(device)
        self.assertEqual(code, 1)
        self.assertIn("fake", self.evidence()["run"]["stopped_by"])

    def test_never_overwrites_evidence(self):
        self.out.write_text("{}")
        self.assertEqual(self.run_bench()[0], 2)
        self.assertEqual(self.out.read_text(), "{}")


class MeasureTests(QuietCase):
    def test_computes_percentiles_and_the_worst_gap_on_a_scripted_trace(self):
        self.assertEqual(bench.percentiles(list(range(1, 101))), {"count": 100, "p50": 50, "p95": 95, "p99": 99, "max": 100})
        self.assertEqual(bench.percentiles([])["max"], 0)
        ends = iter([0.000, 0.020, 0.040, 0.090, 0.110])  # the gaps: 20, 20, 50, 20 ms
        rtts = iter([3.0, 4.0, 5.0, 9.0, 4.0])

        class Scripted:
            timeout = 1.0

            def request(self, name, payload):
                seq = struct.unpack_from("<I", payload, 2)[0]
                values = struct.pack("<IIBHHB", seq, seq, 0, 0, 0, bench.expected_outputs(seq))
                return {"payload": b"\x00" + values}, next(rtts)

        run = bench.Bench(type("A", (), {"frame_ms": 20})(), None, None, clock=lambda: next(ends), sleep=lambda s: None)
        for _ in range(5):
            run.exchange(Scripted(), 1, True)
        self.assertAlmostEqual(bench.percentiles(run.stats["gap"])["max"], 50.0)
        self.assertEqual([round(g) for g in run.stats["gap"]], [20, 20, 50, 20])
        self.assertEqual((bench.percentiles(run.stats["rtt"])["p50"], bench.percentiles(run.stats["rtt"])["max"]), (4.0, 9.0))
        self.assertEqual(run.stats["echo_mismatches"], 0)

    def test_the_bytes_are_the_ones_of_plant_vectors(self):
        inputs = [(0, 0, 0), (0, 0, 1), (1, 0, 7), (2, 1, 0), (4, 2, 0)]
        self.assertEqual(bench.encode_enter(inputs, [(0, 0, 0), (0, 0, 3)], 500).hex(), VECTORS["plant_enter_request"]["payload"])
        self.assertEqual(bench.encode_values([True, False, True], -2, 1.5).hex(), VECTORS["plant_frame_request"]["payload"][12:])


class RunTests(BenchCase):
    def test_a_full_run_makes_evidence_that_validates_against_the_schema(self):
        code, _, person = self.run_bench()
        evidence = self.evidence()
        self.assertEqual(code, 0)
        self.assertEqual(validator.hil_record.validate(evidence, json.loads(validator.SCHEMA.read_text())), [])
        self.assertEqual(validator.problems_of(evidence, "hil"), [])
        self.assertEqual((evidence["level"], evidence["measurements"]["frames_ok"], evidence["measurements"]["rtt_ms"]["count"]), ("hil", 30, 30))
        self.assertEqual([s["step"] for s in evidence["physical"]], ["mirror-off", "mirror-on", "link-loss"])
        self.assertEqual(evidence["physical"][2]["device_check"]["state"], "idle")
        self.assertEqual(evidence["physical"][2]["device_check"]["output_image_hex"], "0000")
        self.assertEqual(len(person.prompts), 6)  # the board id, then the four confirmations and the replug
        self.assertTrue(evidence["firmware"]["version_output"] and evidence["repository"]["commit"])
        self.assertEqual(sorted(evidence), sorted({"schema", "level", "board", "transport", "date", "repository", "tools", "run", "device", "firmware",
                                                    "program", "measurements", "limits", "events", "physical"}))

    def test_the_three_confirmations_are_required(self):
        for refused in range(3):
            with self.subTest(refused=refused):
                self.out.unlink(missing_ok=True)
                device = FakeBoard()
                says = ["yes", "yes", "yes", "yes"]
                # the confirmations in order: mirror off, mirror on, ready to pull, is the LED off
                says[(0, 1, 3)[refused]] = "no"
                code, _, _ = self.run_bench(device, Person("esp32s3_devkitc", device, says))
                self.assertEqual(code, 1)
                self.assertTrue(any("did not confirm" in p for p in validator.problems_of(self.evidence())) or len(self.evidence()["physical"]) < 3)

    def test_a_missing_sequence_fails_the_validator(self):
        self.run_bench()
        evidence = self.evidence()
        del evidence["physical"][1]
        self.assertTrue(any("three physical sequences" in p for p in validator.problems_of(evidence, "hil")))

    def test_a_refused_entry_is_reported_with_its_status(self):
        code, _, _ = self.run_bench(FakeBoard(enter_status=ERR["RANGE"]))
        self.assertEqual(code, 1)
        self.assertIn("RANGE", self.evidence()["run"]["stopped_by"])

    def test_a_frame_from_another_session_answers_state_and_the_run_fails(self):
        code, _, _ = self.run_bench(FakeBoard(stale_session=True))
        self.assertEqual(code, 1)
        evidence = self.evidence()
        self.assertEqual(evidence["measurements"]["refused"], 1)
        self.assertIn("STATE", evidence["run"]["stopped_by"])

    def test_an_exit_raised_in_the_scan_arrives_as_an_event_and_the_run_fails(self):
        code, _, _ = self.run_bench(FakeBoard(exit_after=5))
        self.assertEqual(code, 1)
        self.assertEqual(self.evidence()["events"], [{"reason": "TIMEOUT", "frames": 5}])

    def test_a_board_that_does_not_answer_is_counted_as_a_timeout(self):
        device = FakeBoard()
        device.exit_after = None
        original = device.link

        def deaf_after_ten(frame):
            if device.frames >= 10 and frame["message"] == MSG["PLANT_FRAME"]:
                return []
            return original(frame)

        device.link = deaf_after_ten
        code, _, _ = self.run_bench(device)
        self.assertEqual(code, 1)
        self.assertEqual(self.evidence()["measurements"]["timeouts"], 1)

    def test_a_program_other_than_the_one_given_stops_the_run(self):
        self.program.write_bytes(b"another program")
        code, _, _ = self.run_bench()
        self.assertEqual(code, 1)
        self.assertIn("different program", self.evidence()["run"]["stopped_by"])

    def test_late_is_information_not_an_error(self):
        code, _, _ = self.run_bench()
        evidence = self.evidence()
        evidence["measurements"]["late"] = 500
        self.assertEqual(code, 0)
        self.assertEqual(validator.problems_of(evidence, "hil"), [])


class ValidatorTests(BenchCase):
    def test_a_trace_with_a_gap_above_the_limit_makes_the_validator_exit_1(self):
        self.run_bench()
        evidence = self.evidence()
        self.assertEqual(validator.main(["--level", "hil", str(self.out)]), 0)
        evidence["measurements"]["gap_ms"]["max"] = evidence["limits"]["max_gap_ms"] + 1
        self.out.write_text(json.dumps(evidence))
        self.assertEqual(validator.main(["--level", "hil", str(self.out)]), 1)
        self.assertEqual(validator.main(["--max-gap-ms", str(evidence["measurements"]["gap_ms"]["max"]), str(self.out)]), 0)

    def test_a_file_with_a_level_other_than_hil_is_refused_by_level_hil(self):
        device = FakeBoard()
        device.kind = "fake"
        code, _, _ = self.run_bench(device, Person("x", device), extra=("--level", "native-sim", "--port", "/dev/pts/9"))
        self.assertEqual(code, 0)
        self.assertEqual(self.evidence()["level"], "native-sim")
        self.assertEqual(self.evidence()["physical"], [])
        self.assertEqual(validator.main(["--level", "native-sim", str(self.out)]), 0)
        self.assertEqual(validator.main(["--level", "hil", str(self.out)]), 1)
        self.assertEqual(validator.main([str(self.out)]), 0)

    def test_native_sim_needs_a_pseudo_terminal(self):
        device = FakeBoard()
        code, opened, _ = self.run_bench(device, extra=("--level", "native-sim", "--port", "/dev/ttyACM0"))
        self.assertEqual((code, opened), (2, []))

    def test_the_example_file_validates_at_its_own_level_only(self):
        example = str(validator.SCHEMA.with_name("plant-io-example.json"))
        self.assertEqual(validator.main(["--level", "native-sim", example]), 0)
        self.assertEqual(validator.main(["--level", "hil", example]), 1)

    def test_an_unreadable_file_fails(self):
        self.assertEqual(validator.main([str(self.out)]), 1)


if __name__ == "__main__":
    unittest.main()
