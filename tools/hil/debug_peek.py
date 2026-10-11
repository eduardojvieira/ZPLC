"""Bench utility: write the output and input images with `zplc dbg poke` while stopped, then read them back with `peek`.

A person runs it at the bench; it is not a pass or fail check and is listed in tools/hil/non-gating.json (HIL-004).
It exits 2 when no port can be chosen and 1 when the device does not answer.
"""
import argparse
import sys
import time

from zplc_tester import ZPLCTester, cli


def arguments(argv, description):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--port", help="serial port; else ZPLC_SERIAL_PORT, else found from the USB identifiers of --board")
    parser.add_argument("--board", help="ide_id of the board (rpi_pico, esp32s3_devkitc), to find its port")
    return parser.parse_args(argv)


def debug_peek(argv=None, tester=None):
    args = arguments(argv, __doc__)
    tester = tester or ZPLCTester(port=args.port, board=args.board)
    for command in ("zplc stop", "zplc dbg poke 0x1000 0xAA", "zplc dbg poke 0 0xBB", "zplc dbg peek 0 16", "zplc dbg peek 0x1000 16"):
        print(f"SEND: {command}")
        print(f"RECV: {tester.send(command, timeout=2.0)}")
    tester.close()
    return 0


if __name__ == "__main__":
    cli(debug_peek)
