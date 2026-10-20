#!/usr/bin/env python3
"""The shell tester keeps each answer with its command while the firmware prints log lines (HIL-012).

A Zephyr log line ("[00:00:01.100,000] <inf> fs_nvs: ...", "--- 3 messages dropped ---") is printed whenever the firmware
logs, and the shell prints its prompt again after it. A tester that takes the first prompt it sees for the end of an
answer then reads the previous command's prompt, or a reprint, as the answer to this one, and every answer after that is
one command late: the flaky fixtures, force results and restart verdicts of the emulated runs.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hil_devices import ShellDevice  # noqa: E402
from zplc_tester import PROMPT, UploadError, ZPLCTester  # noqa: E402

NVS = "[00:00:01.100,000] <inf> fs_nvs: 8 Sectors of 4096 bytes"
DROPPED = "--- 3 messages dropped ---"


class ChattyBoard(ShellDevice):
    """Answers like the shell, with log lines around the answers: during a command (the shell prints its prompt and the
    line being run again after each), and late, after the prompt, so that they land before the next command's echo."""

    def __init__(self):
        super().__init__()
        self.forces, self.late, self.chunks = 0, "", []

    # the serial port hands over what has arrived so far: here one piece of the shell's output at a time
    @property
    def in_waiting(self):
        return len(self.chunks[0]) if self.chunks else 0

    def read(self, size=1):
        chunk = self.chunks.pop(0) if self.chunks else b""
        if len(chunk) > size:
            self.chunks.insert(0, chunk[size:])
        return chunk[:size]

    def reset_input_buffer(self):
        self.chunks.clear()

    def handle(self, line):
        if line.startswith("zplc dbg force set"):
            self.forces += 1
            return "OK: Forced 1 byte(s) at 0x1000\r\n"
        if line == "zplc dbg force list --json":
            return json.dumps({"count": self.forces, "items": []}) + "\r\n"
        if line.startswith("zplc dbg peek"):
            return self.dump(bytes([0x0F]), 0x1000)
        if line == "zplc status --json":
            return json.dumps({"state": "running", "uptime_ms": 1234}) + "\r\n"
        return ""

    def _answer(self, line):
        reply = self.handle(line) if line else ""
        during = f"{NVS}\r\n{PROMPT} {line}\r\n"
        pieces = [self.late, f"{line}\r\n", during, f"{reply}{PROMPT} "]
        self.chunks += [piece.encode() for piece in pieces if piece]
        self.late = f"\r\n{DROPPED}\r\n{PROMPT} "  # printed after this prompt: it arrives with the next command


class TesterAndLogLines(unittest.TestCase):
    def setUp(self):
        self.tester = ZPLCTester(transport=ChattyBoard())

    def test_each_answer_belongs_to_its_command(self):
        sequence = [self.tester.send(c) for c in ("zplc status --json", "zplc dbg force list --json", "zplc status --json")]
        self.assertIn('"uptime_ms": 1234', sequence[0])
        self.assertIn('"count": 0', sequence[1])
        self.assertNotIn("uptime_ms", sequence[1])
        self.assertIn('"uptime_ms": 1234', sequence[2])

    def test_log_lines_are_not_part_of_an_answer(self):
        answer = self.tester.send("zplc dbg force set 0x1000 0f", wait_for="OK:")
        self.assertIn("OK: Forced", answer)
        self.assertNotIn("fs_nvs", answer)
        self.assertNotIn("messages dropped", self.tester.send("zplc dbg force list --json"))
        self.assertEqual(json.loads(self.tester.send("zplc dbg force list --json").split(PROMPT)[0])["count"], 1)

    def test_a_read_between_log_lines(self):
        self.tester.send("zplc status --json")
        self.assertEqual(self.tester.peek(0x1000, 1), [0x0F])


class RefusingLoader(ShellDevice):
    """A loader that refuses what it was sent, as the ESP32-S3 refused a program for 8 KB of work memory: the refusal
    ends the load, and every chunk after it is answered with "Not in loading state"."""

    def __init__(self, refuse_load=False):
        super().__init__()
        self.refuse_load, self.loading, self.expected, self.received, self.sent = refuse_load, False, 0, 0, []

    def handle(self, line):
        self.sent.append(line)
        words = line.split()
        if words[:2] == ["zplc", "load"]:
            if self.refuse_load:
                return "ERROR: Runtime faulted; use 'zplc reset' before loading\r\n"
            self.loading, self.expected, self.received = True, int(words[2]), 0
            return f"OK: Ready to receive {self.expected} bytes\r\n"
        if words[:2] == ["zplc", "data"]:
            if not self.loading:
                return "ERROR: Not in loading state (use 'zplc sched load' first)\r\n"
            self.received += len(words[2]) // 2
            if self.received < self.expected:
                return f"OK: Received {len(words[2]) // 2} bytes ({self.received}/{self.expected})\r\n"
            self.loading = False
            return "ERROR: Program validation failed (-13)\r\n"
        return "OK: done\r\n"


class UploadRefusal(unittest.TestCase):
    """A refusal is the device's verdict on the program: sending the chunk again only hides it (the emulated ESP32-S3
    record said "Not in loading state" where the loader had said ZPLC_LOADER_ERR_MEMORY)."""

    def test_a_refused_program_raises_with_the_devices_text_and_is_not_sent_again(self):
        board = RefusingLoader()
        tester = ZPLCTester(transport=board)
        tester.settle_scale = 0
        with self.assertRaises(UploadError) as raised:
            tester.upload_bytecode(list(range(40)))
        self.assertIn("Program validation failed (-13)", str(raised.exception))
        self.assertNotIn("Not in loading state", str(raised.exception))
        self.assertEqual(sum(line.startswith("zplc data") for line in board.sent), 3, "three chunks, the last one once")

    def test_a_refused_load_is_not_asked_again(self):
        board = RefusingLoader(refuse_load=True)
        tester = ZPLCTester(transport=board)
        tester.settle_scale = 0
        with self.assertRaises(UploadError) as raised:
            tester.upload_bytecode(list(range(8)))
        self.assertIn("Runtime faulted", str(raised.exception))
        self.assertEqual(sum(line.startswith("zplc load") for line in board.sent), 1)


class EvidenceHint(unittest.TestCase):
    def test_only_a_hardware_record_is_offered_for_evidence_refs(self):
        import run_chain  # noqa: PLC0415

        self.assertIn("adds it to evidence_refs", run_chain.evidence_hint({"evidence_level": "hardware"}, "rpi-pico"))
        emulated = run_chain.evidence_hint({"evidence_level": "emulated"}, "rpi-pico")
        self.assertNotIn("adds it", emulated)
        self.assertIn("never added to evidence_refs", emulated)


if __name__ == "__main__":
    unittest.main()
