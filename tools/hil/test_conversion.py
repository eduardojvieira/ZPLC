"""Type conversion: I2F, F2I, I2B, EXT8 and ZEXT8.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='I2F 42', code=[OP['PUSH8'], 42, OP['I2F'], OP['HALT']], tos=f32(42.0)),
    dict(name='F2I 42.0', code=[OP['PUSH32'], 0x00, 0x00, 0x28, 0x42, OP['F2I'], OP['HALT']], tos=42),
    dict(name='I2B 42 is 1', code=[OP['PUSH8'], 42, OP['I2B'], OP['HALT']], tos=1),
    dict(name='I2B 0 is 0', code=[OP['PUSH8'], 0, OP['I2B'], OP['HALT']], tos=0),
    dict(name='EXT8 sign-extends a loaded byte', code=[OP['PUSH8'], 0x80, OP['STORE8'], 0x00, 0x20, OP['LOAD8'], 0x00, 0x20, OP['EXT8'], OP['HALT']], tos=-128),
    dict(name='ZEXT8 keeps the low byte', code=[OP['PUSH8'], 0x80, OP['PUSH32'], 0xFF, 0x00, 0x00, 0x00, OP['AND'], OP['ZEXT8'], OP['HALT']], tos=128),
]

def test_conversion(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_conversion)
