"""Bench utility: send Ctrl+C and Enter five times, then `zplc stop`, and say whether the board is alive.

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


def rescue(argv=None, tester=None):
    args = arguments(argv, __doc__)
    tester = tester or ZPLCTester(port=args.port, board=args.board)
    print("Attempting rescue...")
    for _ in range(5):
        tester.ser.write(b"\x03\r\n")
        time.sleep(0.1)
    tester.ser.write(b"zplc stop\r\n")
    time.sleep(0.5)
    answer = tester.ser.read_all().decode(errors="ignore")
    print(f"Rescue Response: {answer!r}")
    alive = "zplc" in answer or "OK" in answer
    print("ALIVE! Device responded." if alive else "DEAD. Device is unresponsive.")
    tester.close()
    return 0 if alive else 1


if __name__ == "__main__":
    cli(rescue)
