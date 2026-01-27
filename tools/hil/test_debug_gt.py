import sys
import os
from language_tester import LanguageTester


def run_tests():
    tester = LanguageTester()
    results = []

    print("\n--- TEST: IL Debug GT ---")
    try:
        tester.compile_and_run("tools/hil/il_tests/debug_gt.il", duration=0.2)
        # 50 > 40 -> True
        r1 = tester.expect_bool(0, 0, True, "res_gt")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    tester.close()
    return all(results)


if __name__ == "__main__":
    run_tests()
