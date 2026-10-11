"""Float arithmetic: ADDF, SUBF, MULF, DIVF, NEGF and ABSF.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='ADDF 1.5+2.5', code=[OP['PUSH32']] + pushf(1.5) + [OP['PUSH32']] + pushf(2.5) + [OP['ADDF'], OP['HALT']], real=4.0),
    dict(name='SUBF 5.0-2.5', code=[OP['PUSH32']] + pushf(5.0) + [OP['PUSH32']] + pushf(2.5) + [OP['SUBF'], OP['HALT']], real=2.5),
    dict(name='MULF 2.0*3.5', code=[OP['PUSH32']] + pushf(2.0) + [OP['PUSH32']] + pushf(3.5) + [OP['MULF'], OP['HALT']], real=7.0),
    dict(name='DIVF 10.0/4.0', code=[OP['PUSH32']] + pushf(10.0) + [OP['PUSH32']] + pushf(4.0) + [OP['DIVF'], OP['HALT']], real=2.5),
    dict(name='NEGF 1.23', code=[OP['PUSH32']] + pushf(1.23) + [OP['NEGF'], OP['HALT']], real=-1.23),
    dict(name='ABSF -1.23', code=[OP['PUSH32']] + pushf(-1.23) + [OP['ABSF'], OP['HALT']], real=1.23),
]

def test_float_math(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_float_math)
