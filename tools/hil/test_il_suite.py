import sys
import os
from language_tester import LanguageTester


def run_tests():
    tester = LanguageTester()
    results = []

    print("\n--- TEST: IL Arithmetic ---")
    try:
        tester.compile_and_run("tools/hil/il_tests/arithmetic.il", duration=1.0)
        # Check a=10 (0), b=5 (2)
        # res_add (4) = 15
        # res_sub (6) = 5
        # res_mul (8) = 50
        # res_div (10) = 2
        # res_mod (12) = 0

        r1 = tester.expect_int16(0, 10, "a")
        r2 = tester.expect_int16(2, 5, "b")
        r3 = tester.expect_int16(4, 15, "res_add")
        r4 = tester.expect_int16(6, 5, "res_sub")
        r5 = tester.expect_int16(8, 50, "res_mul")
        r6 = tester.expect_int16(10, 2, "res_div")
        r7 = tester.expect_int16(12, 0, "res_mod")

        results.append(all([r1, r2, r3, r4, r5, r6, r7]))
    except Exception as e:
        print(f"FAILED: {e}")
        import traceback

        traceback.print_exc()
        results.append(False)

    print("\n--- TEST: IL Comparison ---")
    try:
        tester.compile_and_run("tools/hil/il_tests/comparison.il", duration=1.0)
        # val=50 at %Q0 (bytes 0-1)

        # is_gt at %Q2.0 -> Byte 2, Bit 0
        r1 = tester.expect_bool(2, 0, True, "is_gt (50 > 40)")
        # is_lt at %Q3.0 -> Byte 3, Bit 0
        r2 = tester.expect_bool(3, 0, True, "is_lt (50 < 60)")
        # is_eq at %Q4.0 -> Byte 4, Bit 0
        r3 = tester.expect_bool(4, 0, True, "is_eq (50 == 50)")
        # is_ne at %Q5.0 -> Byte 5, Bit 0
        r4 = tester.expect_bool(5, 0, True, "is_ne (50 != 99)")

        results.append(all([r1, r2, r3, r4]))
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    print("\n--- TEST: IL Logic ---")
    try:
        tester.compile_and_run("tools/hil/il_tests/logic.il", duration=1.0)
        # t=1 (0), f=0 (1)
        # and=0 (2), or=1 (3), xor=1 (4), not=0 (5)

        r1 = tester.expect_bool(2, 0, False, "res_and")
        r2 = tester.expect_bool(3, 0, True, "res_or")
        r3 = tester.expect_bool(4, 0, True, "res_xor")
        r4 = tester.expect_bool(5, 0, False, "res_not")  # NOT t -> NOT TRUE -> FALSE

        results.append(all([r1, r2, r3, r4]))
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    print("\n--- TEST: IL Jumps ---")
    try:
        tester.compile_and_run("tools/hil/il_tests/jumps.il", duration=1.0)
        # skip1_result (0) = 0 (skipped by JMPC when jump_cond=TRUE)
        # skip2_result (2) = 0 (always skipped by JMP)
        # exec1_result (4) = 42 (always executed)
        # exec2_result (6) = 77 (always executed)

        r1 = tester.expect_int16(0, 0, "skip1_result (JMPC skipped)")
        r2 = tester.expect_int16(2, 0, "skip2_result (JMP skipped)")
        r3 = tester.expect_int16(4, 42, "exec1_result (after JMPC)")
        r4 = tester.expect_int16(6, 77, "exec2_result (after JMP)")

        results.append(all([r1, r2, r3, r4]))
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    tester.close()
    return all(results)


if __name__ == "__main__":
    run_tests()
