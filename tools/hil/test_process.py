"""Process control blocks: HYSTERESIS, DEADBAND, LAG_FILTER, RAMP_REAL and PID_Compact.

Runs st.process_test of tools/hil/fixtures.json on the device (the expected values are there, and the host test
packages/zplc-ide/src/cli/hilFixtures.test.ts checks the same ones), and exits non-zero when a value differs (HIL-004, HIL-005).
"""
from fixture_script import main
from zplc_tester import cli


def test_process(tester=None):
    return main(ids=['st.process_test'], tester=tester)


if __name__ == "__main__":
    cli(test_process)
