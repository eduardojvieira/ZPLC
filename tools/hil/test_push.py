"""Push variants: PUSH8, PUSH16 and PUSH32 with the limits of each width.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='PUSH8 127', code=[OP['PUSH8'], 127, OP['HALT']], tos=127),
    dict(name='PUSH8 -128', code=[OP['PUSH8'], 0x80, OP['HALT']], tos=-128),
    dict(name='PUSH16 32767', code=[OP['PUSH16'], 0xFF, 0x7F, OP['HALT']], tos=32767),
    dict(name='PUSH16 -32768', code=[OP['PUSH16'], 0x00, 0x80, OP['HALT']], tos=-32768),
    dict(name='PUSH32 0x7FFFFFFF', code=[OP['PUSH32']] + push32(0x7FFFFFFF) + [OP['HALT']], tos=2147483647),
    dict(name='PUSH32 -1', code=[OP['PUSH32']] + push32(0xFFFFFFFF) + [OP['HALT']], tos=-1),
]

def test_push(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_push)
