"""String operations: STRLEN, STRCPY and STRCMP on strings poked into work memory.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
import struct

from opcode_cases import run
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
STR1 = 0x2100
STR2 = 0x2200


def put_string(tester, address, text, capacity=10):
    """A string as the VM keeps it: a length and a capacity (two 16-bit words), then the bytes and a NUL."""
    data = struct.pack("<HH", len(text), capacity) + text.encode() + b"\0"
    tester.poke(address, data)


def address(value):
    return [value & 0xFF, (value >> 8) & 0xFF]


CASES = [
    dict(name="STRLEN of Hello", code=[OP["PUSH16"]] + address(STR1) + [OP["STRLEN"], OP["HALT"]], tos=5,
         pre=lambda t: put_string(t, STR1, "Hello")),
    dict(name="STRCPY then STRLEN of the copy", code=[OP["PUSH16"]] + address(STR1) + [OP["PUSH16"]] + address(STR2) + [OP["STRCPY"], OP["PUSH16"]] + address(STR2) + [OP["STRLEN"], OP["HALT"]], tos=4,
         pre=lambda t: (put_string(t, STR1, "ZPLC"), put_string(t, STR2, ""))),
    dict(name="STRCMP of AAA and BBB is -1", code=[OP["PUSH16"]] + address(STR1) + [OP["PUSH16"]] + address(STR2) + [OP["STRCMP"], OP["HALT"]], tos=-1,
         pre=lambda t: (put_string(t, STR1, "AAA"), put_string(t, STR2, "BBB"))),
]


def test_strings(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_strings)
