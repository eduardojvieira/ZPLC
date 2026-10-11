"""Bench utility: wake the shell with a CR and ask `help`, to see whether a board answers.

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


def check_alive(argv=None, tester=None):
    args = arguments(argv, __doc__)
    tester = tester or ZPLCTester(port=args.port, board=args.board)
    tester.ser.reset_input_buffer()
    print("Sending CR...")
    tester.ser.write(b"\r\n")
    time.sleep(0.5)
    first = tester.ser.read_all().decode(errors="ignore")
    print(f"Response 1: {first!r}")
    print("Sending 'help'...")
    tester.ser.write(b"help\r\n")
    time.sleep(0.5)
    second = tester.ser.read_all().decode(errors="ignore")
    print(f"Response 2: {second!r}")
    tester.close()
    return 0 if (first or second) else 1


if __name__ == "__main__":
    cli(check_alive)
