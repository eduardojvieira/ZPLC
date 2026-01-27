import sys
import os
import time
from language_tester import LanguageTester


def run_tests():
    tester = LanguageTester()
    results = []

    print("\n--- TEST: SFC Single Step ---")
    try:
        tester.compile_and_run("tools/hil/sfc_tests/single_step.sfc.json", duration=0.1)
        # OutLed should be 1
        r1 = tester.expect_bool(0, 0, True, "OutLed")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    print("\n--- TEST: SFC Two States (Time) ---")
    try:
        # S1 (State=1) -> wait 200ms -> S2 (State=2)
        tester.compile_and_run("tools/hil/sfc_tests/two_states.sfc.json", duration=0.4)
        r1 = tester.expect_int16(0, 2, "State (Final)")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    tester.close()
    return all(results)


if __name__ == "__main__":
    run_tests()
