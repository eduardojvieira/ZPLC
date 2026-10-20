#!/usr/bin/env python3
"""HIL-010.31 to .33: the step reads its results as one snapshot, even though the program sets them in one scan.

The device is a fake whose values change between two peeks, at every possible peek of the read.
"""
import unittest

import hil_steps


class Bench:
    def __init__(self):
        self.ms = 0.0

    def now_ms(self):
        return self.ms

    def sleep(self, seconds):
        self.ms += seconds * 1000


class ChangingDevice(hil_steps.BenchSteps):
    """The program sets `got`, `err` and `heard` first or together with `done` in one scan, at the `flip`th peek of the read."""

    def __init__(self, flip, final):
        self.bench, self.flip, self.final, self.peeks = Bench(), flip, final, 0
        self.symbols = {"got": 1, "done": 2, "err": 3, "heard": 4}

    def dint(self, address):
        self.peeks += 1
        name = next(n for n, a in self.symbols.items() if a == address)
        return self.final[name] if self.peeks >= self.flip else 0


class TornReadTests(unittest.TestCase):
    def test_no_poll_returns_a_half_written_result_wherever_the_scan_lands(self):
        final = {"got": 0x5A17, "done": 1, "err": 0, "heard": 2}
        for names in (("got", "done", "err"), ("got", "done", "err", "heard")):
            for flip in range(1, 14):
                with self.subTest(names=names, flip=flip):
                    device = ChangingDevice(flip, final)
                    found = device._read_results(device.symbols, names)
                    self.assertEqual(found, {n: final[n] for n in names})

    def test_a_program_that_never_finishes_ends_the_wait_with_what_was_read(self):
        device = ChangingDevice(10**9, {"got": 1, "done": 1, "err": 0, "heard": 1})
        self.assertEqual(device._read_results(device.symbols, ("got", "done", "err")), {"got": 0, "done": 0, "err": 0})


if __name__ == "__main__":
    unittest.main()
