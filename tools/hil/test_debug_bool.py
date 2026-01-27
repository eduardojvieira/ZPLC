import sys
import os
from language_tester import LanguageTester


def run_tests():
    tester = LanguageTester()
    results = []

    print("\n--- TEST: IL Debug Bool ---")
    try:
        tester.compile_and_run("tools/hil/il_tests/debug_bool.il", duration=0.2)
        # res_true (%Q0.0) -> Byte 0, Bit 0 -> Should be True
        r1 = tester.expect_bool(0, 0, True, "res_true")

        # res_false (%Q0.1) -> Byte 0, Bit 1 -> Should be False
        r2 = tester.expect_bool(0, 1, False, "res_false")

        results.append(all([r1, r2]))
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    tester.close()
    return all(results)


if __name__ == "__main__":
    run_tests()
