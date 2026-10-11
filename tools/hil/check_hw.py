"""Bench utility: open the port, wake the shell with two CRs and print the first bytes of the answer to `help`.

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


def check_connection(argv=None, tester=None):
    args = arguments(argv, __doc__)
    tester = tester or ZPLCTester(port=args.port, board=args.board)
    print("Port opened. Sending wakeup CRs...")
    tester.ser.write(b"\r\n\r\n")
    time.sleep(0.5)
    tester.ser.reset_input_buffer()
    print("Sending help...")
    tester.ser.write(b"help\r\n")
    time.sleep(1.0)
    answer = tester.ser.read_all().decode("utf-8", errors="ignore")
    print(f"Response len: {len(answer)}")
    print(f"Response: {answer[:100]}...")
    tester.close()
    return 0 if answer else 1


if __name__ == "__main__":
    cli(check_connection)
