"""Stack operations: DUP, DROP, SWAP, OVER, ROT and PICK.

A table of opcode cases (opcode_cases.py); it exits non-zero when a case fails (HIL-004).
Needs a firmware image built with CONFIG_ZPLC_HIL_DEBUG=y for the trace frames; exits 77 (skipped) without it.
"""
from opcode_cases import *  # noqa: F401,F403
from zplc_tester import ZPLCTester, cli

OP = ZPLCTester.OP
CASES = [
    dict(name='DUP', code=[OP['PUSH8'], 42, OP['DUP'], OP['HALT']], sp=2, tos=42),
    dict(name='DROP', code=[OP['PUSH8'], 43, OP['PUSH8'], 10, OP['DROP'], OP['HALT']], sp=1, tos=43),
    dict(name='SWAP', code=[OP['PUSH8'], 44, OP['PUSH8'], 10, OP['SWAP'], OP['HALT']], sp=2, tos=44),
    dict(name='OVER', code=[OP['PUSH8'], 45, OP['PUSH8'], 10, OP['OVER'], OP['HALT']], sp=3, tos=45),
    dict(name='ROT', code=[OP['PUSH8'], 100, OP['PUSH8'], 101, OP['PUSH8'], 102, OP['ROT'], OP['HALT']], sp=3, tos=100),
    dict(name='PICK', code=[OP['PUSH8'], 110, OP['PUSH8'], 111, OP['PUSH8'], 112, OP['PICK'], 2, OP['HALT']], sp=4, tos=110),
]

def test_stack_ops(tester=None):
    return run(tester or ZPLCTester(), CASES)


if __name__ == "__main__":
    cli(test_stack_ops)
