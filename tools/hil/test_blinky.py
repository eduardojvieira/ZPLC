"""Blinky and multitask: two timers toggle two outputs at their own rates.

Runs st.master_blinky of tools/hil/fixtures.json on the device (the expected values are there, and the host test
packages/zplc-ide/src/cli/hilFixtures.test.ts checks the same ones), and exits non-zero when a value differs (HIL-004, HIL-005).
"""
from fixture_script import main
from zplc_tester import cli


def test_blinky(tester=None):
    return main(ids=['st.master_blinky'], tester=tester)


if __name__ == "__main__":
    cli(test_blinky)
