"""EXTENDS: inherited members and methods, and an override.

Runs st.oop_extends_simple, st.oop_extends of tools/hil/fixtures.json on the device (the expected values are there, and the host test
packages/zplc-ide/src/cli/hilFixtures.test.ts checks the same ones), and exits non-zero when a value differs (HIL-004, HIL-005).
"""
from fixture_script import main
from zplc_tester import cli


def test_oop_extends(tester=None):
    return main(ids=['st.oop_extends_simple', 'st.oop_extends'], tester=tester)


if __name__ == "__main__":
    cli(test_oop_extends)
