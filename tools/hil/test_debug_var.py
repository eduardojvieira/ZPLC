"""IL debug: a variable compared with a literal.

Runs il.debug_var of tools/hil/fixtures.json on the device (the expected values are there, and the host test
packages/zplc-ide/src/cli/hilFixtures.test.ts checks the same ones), and exits non-zero when a value differs (HIL-004, HIL-005).
"""
from fixture_script import main
from zplc_tester import cli


def run_tests(tester=None):
    return main(ids=['il.debug_var'], tester=tester)


if __name__ == "__main__":
    cli(run_tests)
