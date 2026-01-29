import sys
import os
import time
from language_tester import LanguageTester


def run_tests():
    tester = LanguageTester()
    results = []

    print("\n--- TEST: LD Basic Coil ---")
    try:
        tester.compile_and_run("tools/hil/ld_tests/basic_coil.ld.json", duration=1.0)
        # InButton default 0 -> OutLamp 0
        r1 = tester.expect_bool(1, 0, False, "OutLamp (Initial)")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    print("\n--- TEST: LD Series (AND) ---")
    try:
        tester.compile_and_run(
            "tools/hil/ld_tests/series_contacts.ld.json", duration=1.0
        )
        # Default A=0, B=0 -> Q=0
        r1 = tester.expect_bool(2, 0, False, "Q (0 AND 0)")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    print("\n--- TEST: LD Parallel (OR) ---")
    try:
        tester.compile_and_run(
            "tools/hil/ld_tests/parallel_contacts.ld.json", duration=1.0
        )
        # Default A=0, B=0 -> Q=0
        r1 = tester.expect_bool(2, 0, False, "Q (0 OR 0)")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    print("\n--- TEST: LD Timer (TON) ---")
    try:
        # Just ensure it compiles and runs without crash
        tester.compile_and_run("tools/hil/ld_tests/timer_ton.ld.json", duration=1.0)
        r1 = tester.expect_bool(1, 0, False, "OutDone (Initial)")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    tester.close()
    return all(results)


if __name__ == "__main__":
    run_tests()
