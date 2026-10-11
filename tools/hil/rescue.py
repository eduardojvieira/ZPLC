"""Bench utility: send a break and then `zplc stop` ten times and `zplc reset`, for a board that is stuck.

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
    print("Sending break...")
    getattr(tester.ser, "send_break", lambda **_: None)(duration=0.25)
    answered = False
    print("Sending stops...")
    for _ in range(10):
        tester.ser.write(b"zplc stop\r\n")
        time.sleep(0.1)
        reply = tester.ser.read_all()
        if reply:
            answered = True
            print(f"Response: {reply!r}")
    print("Sending reset...")
    tester.ser.write(b"zplc reset\r\n")
    time.sleep(0.5)
    reply = tester.ser.read_all()
    print(reply)
    tester.close()
    return 0 if (answered or reply) else 1


if __name__ == "__main__":
    cli(rescue)
