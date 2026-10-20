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
from zplc_tester import PROMPT, ZPLCTester  # noqa: E402

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


class EvidenceHint(unittest.TestCase):
    def test_only_a_hardware_record_is_offered_for_evidence_refs(self):
        import run_chain  # noqa: PLC0415

        self.assertIn("adds it to evidence_refs", run_chain.evidence_hint({"evidence_level": "hardware"}, "rpi-pico"))
        emulated = run_chain.evidence_hint({"evidence_level": "emulated"}, "rpi-pico")
        self.assertNotIn("adds it", emulated)
        self.assertIn("never added to evidence_refs", emulated)


if __name__ == "__main__":
    unittest.main()
