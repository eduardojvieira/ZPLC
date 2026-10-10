"""Logical and bitwise operations: AND, OR, XOR, NOT, SHL, SHR and SAR.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='AND 0x0F & 0x55', code=[OP['PUSH8'], 0x0F, OP['PUSH8'], 0x55, OP['AND'], OP['HALT']], tos=5),
    dict(name='OR 0x0F | 0x50', code=[OP['PUSH8'], 0x0F, OP['PUSH8'], 0x50, OP['OR'], OP['HALT']], tos=95),
    dict(name='XOR 0x55 ^ 0x33', code=[OP['PUSH8'], 0x55, OP['PUSH8'], 0x33, OP['XOR'], OP['HALT']], tos=102),
    dict(name='NOT 0', code=[OP['PUSH8'], 0, OP['NOT'], OP['HALT']], tos=-1),
    dict(name='SHL 1 << 4', code=[OP['PUSH8'], 1, OP['PUSH8'], 4, OP['SHL'], OP['HALT']], tos=16),
    dict(name='SHR 32 >> 3', code=[OP['PUSH8'], 32, OP['PUSH8'], 3, OP['SHR'], OP['HALT']], tos=4),
    dict(name='SAR -16 >> 2', code=[OP['PUSH8'], 0xF0, OP['PUSH8'], 2, OP['SAR'], OP['HALT']], tos=-4),
]

def test_logic(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_logic)
