"""Control flow: JMP, JR, JZ taken and not taken, CALL and RET.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='JMP absolute skips a push', code=[OP['PUSH8'], 10, OP['JMP'], 0x07, 0x00, OP['PUSH8'], 20, OP['HALT']], tos=10, sp=1),
    dict(name='JR relative skips a push', code=[OP['PUSH8'], 30, OP['JR'], 0x02, OP['PUSH8'], 40, OP['HALT']], tos=30, sp=1),
    dict(name='JZ taken', code=[OP['PUSH8'], 0, OP['JZ'], 0x07, 0x00, OP['PUSH8'], 99, OP['HALT']], tos=0),
    dict(name='JZ not taken', code=[OP['PUSH8'], 1, OP['JZ'], 0x07, 0x00, OP['PUSH8'], 99, OP['HALT']], tos=99),
    dict(name='CALL and RET', code=[OP['CALL'], 0x05, 0x00, OP['HALT'], OP['NOP'], OP['PUSH8'], 42, OP['RET']], tos=42),
]

def test_control_flow(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_control_flow)
