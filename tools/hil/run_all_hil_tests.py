import sys
import os
import time

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from test_system import test_system
from test_stack_ops import test_stack_ops
from test_int_math import test_int_math
from test_logic import test_logic
from test_comparison import test_comparison
from test_push import test_push
from test_control_flow import test_control_flow
from test_load_store import test_load_store
from test_conversion import test_conversion
from test_float_math import test_float_math
from test_strings import test_strings
from test_errors import test_errors


def run_all():
    print("====================================================")
    print("          ZPLC HIL TEST SUITE RUNNER                ")
    print("====================================================")
    print(f"Started at: {time.ctime()}")

    test_suites = [
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

    results = []

    for name, func in test_suites:
        try:
            print(f"\n>>> Running {name}...")
            func()
            results.append((name, "SUCCESS ✅"))
        except Exception as e:
            print(f"\n❌ ERROR in {name}: {e}")
            results.append((name, "FAILED ❌"))

    print("\n\n====================================================")
    print("                FINAL TEST REPORT                   ")
    print("====================================================")
    for name, status in results:
        print(f"{name:<25} : {status}")
    print("====================================================")

    all_passed = all(status == "SUCCESS ✅" for _, status in results)
    if all_passed:
        print("RESULT: ALL TESTS PASSED! 🚀")
        sys.exit(0)
    else:
        print("RESULT: SOME TESTS FAILED! 💀")
        sys.exit(1)


if __name__ == "__main__":
    run_all()
