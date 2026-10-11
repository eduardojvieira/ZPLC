"""System operations: NOP and GET_TICKS.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='NOP', code=[OP['NOP'], OP['NOP'], OP['HALT']], ops=['NOP']),
    dict(name='GET_TICKS is a running millisecond count', code=[OP['GET_TICKS'], OP['HALT']], tos_gt=0),
]

def test_system(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_system)
