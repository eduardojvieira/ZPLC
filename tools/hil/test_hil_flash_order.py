#!/usr/bin/env python3
"""HIL-010.01: the chain flashes before it opens the device link.

A blank board has no serial port, and a flashed board re-enumerates, so a handle opened before the flash is dead.
No serial port is opened here: the transport and the bench are fakes.
"""
import io
import os
import unittest
from contextlib import redirect_stdout

os.environ["ZPLC_HIL_FORBID_SERIAL"] = "1"

import hil_guard  # noqa: E402
import run_chain  # noqa: E402
from hil_ports import PortError  # noqa: E402


class AppearsAfterFlash:
    """A bench whose port exists only once flashed, and under a new name, after `late` failed lookups (a board that re-enumerates)."""

    level = "hardware"

    def __init__(self, late=0):
        self.flashed, self.late, self.calls = False, late, 0

    def port(self):
        self.calls += 1
        if not self.flashed or self.calls <= self.late:
            raise PortError("no port matches the board: it is blank")
        return "/dev/ttyACM-new"

    def flash(self, image):
        self.flashed = True


class FakeSerial:
    kind = "serial"
    opened = []

    def __init__(self, port):
        FakeSerial.opened.append(port)

    def close(self):
        pass


def chain_with(bench):
    args = run_chain.parse(["rpi_pico", "--operator", "CI"])
    chain = run_chain.Chain(args, hil_guard.PipedIo(), run_chain.find_board("rpi_pico"), bench=bench)
    ticks = [0.0]
    chain.clock = lambda: ticks[0]
    chain.sleep = lambda seconds: ticks.__setitem__(0, ticks[0] + seconds)
    return chain


class FlashOrderTests(unittest.TestCase):
    def setUp(self):
        FakeSerial.opened = []
        self.serial, run_chain.SerialTransport = run_chain.SerialTransport, FakeSerial
        self.sleep, run_chain.time.sleep = run_chain.time.sleep, lambda seconds: None

    def tearDown(self):
        run_chain.SerialTransport, run_chain.time.sleep = self.serial, self.sleep

    def test_the_chain_flashes_before_it_opens_the_device_link(self):
        chain = chain_with(AppearsAfterFlash())
        order = []
        chain.step = lambda step_id, *rest: order.append(step_id)
        chain.physical = lambda step_id, *rest, **kw: order.append(step_id)
        with redirect_stdout(io.StringIO()):
            chain.run()
        self.assertLess(order.index("flash"), order.index("open"))
        self.assertLess(order.index("open"), order.index("handshake"))

    def test_a_port_that_appears_only_after_the_flash_is_opened_after_it(self):
        bench = AppearsAfterFlash()
        chain = chain_with(bench)
        chain.flash_prompt()
        chain.open_device()
        self.assertEqual(FakeSerial.opened, ["/dev/ttyACM-new"])

    def test_a_board_that_re_enumerates_after_the_flash_is_waited_for(self):
        bench = AppearsAfterFlash(late=3)
        chain = chain_with(bench)
        chain.flash_prompt()
        chain.open_device()
        self.assertEqual((FakeSerial.opened, bench.calls), (["/dev/ttyACM-new"], 4))

    def test_a_port_that_never_comes_back_is_an_error_not_a_hang(self):
        chain = chain_with(AppearsAfterFlash(late=10**9))
        chain.flash_prompt()
        with self.assertRaises(PortError):
            chain.open_device()


if __name__ == "__main__":
    unittest.main()
