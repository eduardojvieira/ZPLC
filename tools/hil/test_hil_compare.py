#!/usr/bin/env python3
"""HIL-015: the reference projects run in native simulation and on a bench, and a difference in their traces is recorded."""
# ---- HIL-015 stopgap: the comparison of native simulation and a bench records a difference; no board ran it ----
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

import compare_sim  # noqa: E402
import hil_devices  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUNTIME = os.environ.get("ZPLC_NATIVE_SIM_BIN", "")
needs_runtime = unittest.skipUnless(RUNTIME and Path(RUNTIME).is_file(), "ZPLC_NATIVE_SIM_BIN does not name the native runtime binary")


class SlowOutputs(hil_devices.HostRuntimeDevice):
    """The native runtime whose output image is seen inverted: a bench that does not behave like the simulator."""

    def handle(self, line):
        reply = super().handle(line)
        if line.startswith("zplc dbg peek 0x1000"):
            head, _, data = reply.partition("1000: ")
            value = int(data.split()[0], 16) ^ 0x01
            reply = f"{head}1000: {value:02X} \r\n"
        return reply


class TraceTests(unittest.TestCase):
    def test_the_same_trace_has_no_difference_and_a_late_or_missing_change_is_named(self):
        sim = [[0, 0], [500, 1], [1000, 0]]
        self.assertEqual(compare_sim.differences(sim, [[0, 0], [530, 1], [1040, 0]], 100), [])
        self.assertEqual(compare_sim.differences(sim, [[0, 0], [500, 1]], 100), [], "the last change may fall off the end")
        late = compare_sim.differences(sim, [[0, 0], [700, 1], [1000, 0]], 100)
        self.assertTrue(any("700 ms" in d for d in late), late)
        other = compare_sim.differences(sim, [[0, 1], [500, 0]], 100)
        self.assertTrue(any("change through" in d for d in other), other)

    def test_the_first_differing_sample_is_named_with_its_index_time_and_both_values(self):
        found = compare_sim.differences([[0, 0], [500, 1], [1000, 0]], [[0, 0], [510, 1], [990, 3]], 100)
        self.assertTrue(any("first differing sample is #2" in d and "0x00 at 1000 ms in simulation" in d and "0x03 at 990 ms on the bench" in d for d in found), found)
        longer = compare_sim.differences([[0, 0], [500, 1]], [[0, 0], [500, 1], [900, 0], [1300, 1]], 100)
        self.assertTrue(any("first differing sample is #2" in d and "nothing in simulation" in d for d in longer), longer)

    def test_a_bench_comparison_needs_a_terminal_or_the_emulator(self):
        env = {k: v for k, v in os.environ.items() if k != "ZPLC_SERIAL_PORT"}
        done = subprocess.run([sys.executable, "-B", str(HERE / "compare_sim.py"), "rpi_pico"], capture_output=True, text=True, cwd=ROOT, env=env, stdin=subprocess.DEVNULL)
        self.assertEqual(done.returncode, 2)
        self.assertIn("interactive terminal", done.stderr)


@needs_runtime
class CompareTests(unittest.TestCase):
    def compare(self, opener):
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        with tempfile.TemporaryDirectory() as out, redirect_stdout(io.StringIO()):
            code = compare_sim.main(["rpi_pico", "--device", "host", "--projects", "blinky,motor_control", "--seconds", "2", "--out", out], stdout=io.StringIO(), opener=opener)
            (path,) = Path(out).glob("*.json")
            return code, json.loads(path.read_text())

    def test_native_against_native_is_the_same_and_the_record_says_it_is_no_evidence(self):
        code, record = self.compare(lambda name: hil_devices.HostRuntimeDevice())
        self.assertEqual((code, record["result"], record["evidence_level"]), (0, "same", None))
        blinky = next(p for p in record["projects"] if p["id"] == "blinky")
        self.assertGreaterEqual(len(blinky["simulation"]), 3, "the blinky toggles in the trace")
        motor = next(p for p in record["projects"] if p["id"] == "motor_control")
        self.assertIn(3, [value for _, value in motor["simulation"]], "start seals in both outputs")

    def test_a_bench_that_differs_is_recorded_as_different(self):
        code, record = self.compare(lambda name: SlowOutputs())
        self.assertEqual((code, record["result"]), (1, "different"))
        self.assertTrue(all(p["differences"] for p in record["projects"]))


if __name__ == "__main__":
    unittest.main()
