"""Error conditions: division by zero, stack underflow and overflow, an invalid opcode.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='DIV by zero', code=[OP['PUSH8'], 10, OP['PUSH8'], 0, OP['DIV'], OP['HALT']], error='DIV_BY_ZERO'),
    dict(name='stack underflow', code=[OP['DROP'], OP['HALT']], error='STACK_UNDERFLOW'),
    dict(name='stack overflow', code=[OP['PUSH8'], 1] * 260 + [OP['HALT']], error='STACK_OVERFLOW'),
    dict(name='invalid opcode', code=[0xFE, OP['HALT']], error='INVALID_OPCODE'),
]

def test_errors(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_errors)
