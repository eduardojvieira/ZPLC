"""Run the language suites (IL, LD, FBD, SFC, ST) and the reference projects, and report them (HIL-004).

Exit status: 0 when every suite passed, 1 when one failed. A suite is a script with run_tests() that returns its status.
"""
import importlib
import sys
import time

from zplc_tester import EXIT_SKIPPED

SUITES = [
    ("test_il_suite", "IL (Instruction List)"),
    ("test_ld_suite", "LD (Ladder Diagram)"),
    ("test_fbd_suite", "FBD (Function Block Diagram)"),
    ("test_sfc_suite", "SFC (Sequential Function Chart)"),
    ("test_st_suite", "ST (Structured Text)"),
    ("test_examples_suite", "Reference projects (blinky, motor control)"),
]


def run_suite(module_name):
    try:
        return importlib.import_module(module_name).run_tests()
    except Exception as error:
        print(f"ERROR in {module_name}: {error}")
        return 1


def main(suites=SUITES):
    print("ZPLC MULTI-LANGUAGE HIL TEST RUNNER")
    print(f"Started at: {time.ctime()}")
    results = []
    for module_name, title in suites:
        print(f"\n>>> Running Suite: {title}...")
        results.append((title, run_suite(module_name)))
    print("\nFINAL REPORT")
    for title, status in results:
        print(f"{title:<45} : {'SUCCESS' if status == 0 else 'SKIPPED' if status == EXIT_SKIPPED else 'FAILED'}")
    failed = [title for title, status in results if status not in (0, EXIT_SKIPPED)]
    print("SOME SUITES FAILED" if failed else "ALL SUITES PASSED")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
