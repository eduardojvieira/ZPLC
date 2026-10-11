"""Comparisons: EQ, NE, LT, LE, GT, GE and the unsigned LTU and GTU.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='EQ 10==10', code=[OP['PUSH8'], 10, OP['PUSH8'], 10, OP['EQ'], OP['HALT']], tos=1),
    dict(name='EQ 10==20', code=[OP['PUSH8'], 10, OP['PUSH8'], 20, OP['EQ'], OP['HALT']], tos=0),
    dict(name='NE 10!=20', code=[OP['PUSH8'], 10, OP['PUSH8'], 20, OP['NE'], OP['HALT']], tos=1),
    dict(name='NE 10!=10', code=[OP['PUSH8'], 10, OP['PUSH8'], 10, OP['NE'], OP['HALT']], tos=0),
    dict(name='LT 10<20', code=[OP['PUSH8'], 10, OP['PUSH8'], 20, OP['LT'], OP['HALT']], tos=1),
    dict(name='LT -10<0 (signed)', code=[OP['PUSH8'], 0xF6, OP['PUSH8'], 0, OP['LT'], OP['HALT']], tos=1),
    dict(name='LE 10<=10', code=[OP['PUSH8'], 10, OP['PUSH8'], 10, OP['LE'], OP['HALT']], tos=1),
    dict(name='GT 20>10', code=[OP['PUSH8'], 20, OP['PUSH8'], 10, OP['GT'], OP['HALT']], tos=1),
    dict(name='GE 10>=10', code=[OP['PUSH8'], 10, OP['PUSH8'], 10, OP['GE'], OP['HALT']], tos=1),
    dict(name='LTU 1<0xFFFFFFFF', code=[OP['PUSH8'], 1, OP['PUSH32']] + [0xFF] * 4 + [OP['LTU'], OP['HALT']], tos=1),
    dict(name='GTU 0xFFFFFFFF>1', code=[OP['PUSH32']] + [0xFF] * 4 + [OP['PUSH8'], 1, OP['GTU'], OP['HALT']], tos=1),
]

def test_comparison(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_comparison)
