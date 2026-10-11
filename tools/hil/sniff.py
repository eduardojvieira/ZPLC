"""Bench utility: load a four-byte program (NOP, NOP, NOP, HALT), start it in verbose HIL mode and print what the shell says for five seconds.

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


def sniff(argv=None, tester=None):
    args = arguments(argv, __doc__)
    tester = tester or ZPLCTester(port=args.port, board=args.board)
    for command in ("zplc stop", "zplc reset", "zplc hil mode verbose", "zplc load 4", "zplc data 00000001", "zplc start"):
        print(f"SEND: {command}")
        tester.ser.write(f"{command}\r\n".encode())
        time.sleep(0.1)
    print("READING (5s)...")
    deadline = time.time() + 5 * (tester.pace or 0)
    lines = 0
    while time.time() < deadline:
        line = tester.ser.readline().decode("utf-8", errors="ignore").strip()
        if line:
            lines += 1
            print(f"RECV: {line}")
    tester.close()
    return 0 if lines or not tester.pace else 1


if __name__ == "__main__":
    cli(sniff)
