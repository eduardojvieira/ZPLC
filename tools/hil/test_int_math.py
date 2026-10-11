"""Integer arithmetic: ADD, SUB, MUL, DIV, MOD, NEG and ABS.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='ADD 10+20', code=[OP['PUSH8'], 10, OP['PUSH8'], 20, OP['ADD'], OP['HALT']], tos=30),
    dict(name='SUB 50-20', code=[OP['PUSH8'], 50, OP['PUSH8'], 20, OP['SUB'], OP['HALT']], tos=30),
    dict(name='MUL 6*5', code=[OP['PUSH8'], 6, OP['PUSH8'], 5, OP['MUL'], OP['HALT']], tos=30),
    dict(name='DIV 100/3', code=[OP['PUSH8'], 100, OP['PUSH8'], 3, OP['DIV'], OP['HALT']], tos=33),
    dict(name='MOD 10%3', code=[OP['PUSH8'], 10, OP['PUSH8'], 3, OP['MOD'], OP['HALT']], tos=1),
    dict(name='NEG 42', code=[OP['PUSH8'], 42, OP['NEG'], OP['HALT']], tos=-42),
    dict(name='ABS -10', code=[OP['PUSH8'], 0xF6, OP['ABS'], OP['HALT']], tos=10),
]

def test_int_math(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_int_math)
