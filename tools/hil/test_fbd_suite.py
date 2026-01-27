import sys
import os
from language_tester import LanguageTester


def run_tests():
    tester = LanguageTester()
    results = []

    print("\n--- TEST: FBD NOT Gate ---")
    try:
        tester.compile_and_run("tools/hil/fbd_tests/not_gate.fbd.json", duration=0.1)
        # InA=0 (def) at %Q0.0 -> OutQ at %Q1.0 = NOT 0 = TRUE
        r1 = tester.expect_bool(1, 0, True, "OutQ (NOT 0)")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    print("\n--- TEST: FBD AND Gate ---")
    try:
        tester.compile_and_run("tools/hil/fbd_tests/and_gate.fbd.json", duration=0.1)
        # InA=0 at %Q0.0, InB=0 at %Q1.0 -> OutQ at %Q2.0 = 0 AND 0 = FALSE
        r1 = tester.expect_bool(2, 0, False, "OutQ (0 AND 0)")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    print("\n--- TEST: FBD Math ADD (Const) ---")
    try:
        tester.compile_and_run("tools/hil/fbd_tests/math_ops.fbd.json", duration=0.1)
        # 10 + 20 -> OutAdd=30
        r1 = tester.expect_int16(4, 30, "OutAdd")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    tester.close()
    return all(results)


if __name__ == "__main__":
    run_tests()
