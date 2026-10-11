"""Load and store: direct, indirect, and the output image.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='STORE8 then LOAD8', code=[OP['PUSH8'], 42, OP['STORE8'], 0x00, 0x20, OP['LOAD8'], 0x00, 0x20, OP['HALT']], tos=42),
    dict(name='STORE32 then LOAD32', code=[OP['PUSH32']] + push32(0x12345678) + [OP['STORE32'], 0x10, 0x20, OP['LOAD32'], 0x10, 0x20, OP['HALT']], tos=305419896),
    dict(name='indirect STOREI32 then LOADI32', code=[OP['PUSH16'], 0x20, 0x20, OP['PUSH8'], 99, OP['STOREI32'], OP['PUSH16'], 0x20, 0x20, OP['LOADI32'], OP['HALT']], tos=99),
    dict(name='output image write is read back while running', code=[OP['PUSH8'], 0xAA, OP['STORE8'], 0x00, 0x10, OP['LOAD8'], 0x00, 0x10, OP['HALT']], tos=170),
]

def test_load_store(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_load_store)
