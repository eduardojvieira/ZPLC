"""FBD suite: NOT, AND and ADD blocks.

Runs every FBD fixture of tools/hil/fixtures.json on the device and exits non-zero when a value differs (HIL-004, HIL-005).
"""
from fixture_script import main
from zplc_tester import cli


def run_tests(tester=None):
    return main(language='FBD', tester=tester)


if __name__ == "__main__":
    cli(run_tests)
