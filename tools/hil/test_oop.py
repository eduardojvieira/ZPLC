"""
ZPLC OOP (Methods & THIS) Hardware-in-the-Loop Test

Tests IEC 61131-3 OOP extensions:
- FUNCTION_BLOCK with METHOD
- THIS keyword for member access
- Method calls on FB instances
- Method return values

Memory Layout (OPI starts at 0x1000):
- 0x1000: test_passed BOOL (bit 0)
- 0x1002: counter_value INT (2 bytes)
- 0x1004: method_result INT (2 bytes)
- 0x1006: cycle_count INT (2 bytes)

Work memory:
- 0x2000: myCounter.Count INT
- 0x2002: myCounter.MaxVal INT
"""

from zplc_tester import ZPLCTester
import struct
import os


def test_oop():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC OOP (Methods & THIS) TEST            ")
    print("====================================================")

    # Get the directory where this script lives
    script_dir = os.path.dirname(os.path.abspath(__file__))
    st_file = os.path.join(script_dir, "st_tests", "oop_test.st")

    print("Compiling and uploading...")
    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"ERROR: Compilation failed: {e}")
        tester.close()
        return False

    print(f"Bytecode size: {len(bytecode)} bytes")
    tester.upload_bytecode(bytecode)

    print("Running for 2 seconds...")
    tester.start_and_wait(duration=2.0)

    print("Peeking memory...")

    # Read test_passed (BOOL at 0x1000)
    test_passed_data = tester.peek(0x1000, 1)
    test_passed = test_passed_data[0] if test_passed_data else 0

    # Read counter_value (INT at 0x1002)
    counter_data = tester.peek(0x1002, 2)
    counter_value = (
        struct.unpack("<h", bytearray(counter_data))[0] if len(counter_data) >= 2 else 0
    )

    # Read method_result (INT at 0x1004)
    method_data = tester.peek(0x1004, 2)
    method_result = (
        struct.unpack("<h", bytearray(method_data))[0] if len(method_data) >= 2 else 0
    )

    # Read cycle_count (INT at 0x1006)
    cycle_data = tester.peek(0x1006, 2)
    cycle_count = (
        struct.unpack("<h", bytearray(cycle_data))[0] if len(cycle_data) >= 2 else 0
    )

    # Also peek at myCounter.Count in work memory (0x2000)
    fb_count_data = tester.peek(0x2000, 2)
    fb_count = (
        struct.unpack("<h", bytearray(fb_count_data))[0]
        if len(fb_count_data) >= 2
        else 0
    )

    print("\n--- RESULTS ---")
    print(f"PLC Cycles:      {cycle_count}")
    print(f"test_passed:     {test_passed} {'✅' if test_passed else '❌'}")
    print(
        f"counter_value:   {counter_value} (Expected: >=11) {'✅' if counter_value >= 11 else '❌'}"
    )
    print(
        f"method_result:   {method_result} (Expected: >=11) {'✅' if method_result >= 11 else '❌'}"
    )
    print(f"FB Count (work): {fb_count}")

    # Validation logic:
    # After 1 cycle: Reset() called (Count=0), Increment() (Count=1), AddTen() (Count=11)
    # counter_value should be 11 (GetValue returns Count)
    # method_result should be 11 (AddTen returns Count after adding 10)
    # After 2+ cycles: values should be higher (each cycle adds 11 more)

    all_pass = True

    if not test_passed:
        print("FAIL: test_passed flag not set")
        all_pass = False

    if counter_value < 11:
        print(f"FAIL: counter_value ({counter_value}) should be >= 11")
        all_pass = False

    if method_result < 11:
        print(f"FAIL: method_result ({method_result}) should be >= 11")
        all_pass = False

    if cycle_count < 1:
        print(f"FAIL: cycle_count ({cycle_count}) should be >= 1")
        all_pass = False

    # Check consistency: counter_value should equal fb_count (both are Count)
    if counter_value != fb_count:
        print(f"WARN: counter_value ({counter_value}) != FB Count ({fb_count})")

    print("\n" + "=" * 52)
    if all_pass:
        print("RESULT: OOP TEST PASSED! ✅🎉")
    else:
        print("RESULT: OOP TEST FAILED! ❌💀")
    print("=" * 52)

    tester.close()
    return all_pass


if __name__ == "__main__":
    success = test_oop()
    exit(0 if success else 1)
