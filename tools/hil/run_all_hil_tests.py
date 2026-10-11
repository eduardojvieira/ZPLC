"""Run the opcode-level device scripts one after another and report them (HIL-004).

Exit status: 0 when every suite passed (a skipped suite is reported and is not a pass), 1 when one failed.
"""
import sys
import time

from test_comparison import test_comparison
from test_control_flow import test_control_flow
from test_conversion import test_conversion
from test_errors import test_errors
from test_float_math import test_float_math
from test_int_math import test_int_math
from test_load_store import test_load_store
from test_logic import test_logic
from test_push import test_push
from test_stack_ops import test_stack_ops
from test_strings import test_strings
from test_system import test_system
from zplc_tester import EXIT_SKIPPED

SUITES = [
    ("System Operations", test_system),
    ("Stack Operations", test_stack_ops),
    ("Integer Arithmetic", test_int_math),
    ("Logical/Bitwise", test_logic),
    ("Comparison", test_comparison),
    ("Push Variants", test_push),
    ("Control Flow", test_control_flow),
    ("Load/Store", test_load_store),
    ("Type Conversion", test_conversion),
    ("Float Arithmetic", test_float_math),
    ("String Operations", test_strings),
    ("Error Conditions", test_errors),
]


def label(status):
    return {0: "PASSED", EXIT_SKIPPED: "SKIPPED"}.get(status, "FAILED")


def run_all(suites=SUITES):
    print("ZPLC HIL TEST SUITE RUNNER")
    print(f"Started at: {time.ctime()}")
    results = []
    for name, suite in suites:
        print(f"\n>>> Running {name}...")
        try:
            status = suite()
        except Exception as error:
            print(f"ERROR in {name}: {error}")
            status = 1
        results.append((name, status if isinstance(status, int) else 1))
    print("\nFINAL TEST REPORT")
    for name, status in results:
        print(f"{name:<25} : {label(status)}")
    failed = [name for name, status in results if status not in (0, EXIT_SKIPPED)]
    print("RESULT: " + ("SOME TESTS FAILED" if failed else "ALL TESTS PASSED" if any(s == 0 for _, s in results) else "NOTHING RAN"))
    return 1 if failed or not any(status == 0 for _, status in results) else 0


if __name__ == "__main__":
    sys.exit(run_all())
