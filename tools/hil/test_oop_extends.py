"""
ZPLC OOP Extends (Inheritance) Test

Tests IEC 61131-3 EXTENDS:
- Member inheritance (base vars accessible in child)
- Method inheritance (base methods callable on child)
- Method override (child replaces base method)
"""

from zplc_tester import ZPLCTester
import struct
import os


def test_oop_extends():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC OOP EXTENDS (INHERITANCE) TEST       ")
    print("====================================================")

    # Get the directory where this script lives
    script_dir = os.path.dirname(os.path.abspath(__file__))
    st_file = os.path.join(script_dir, "st_tests", "oop_extends_simple.st")

    print("Compiling and uploading...")
    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"ERROR: Compilation failed: {e}")
        tester.close()
        return False

    print(f"Bytecode size: {len(bytecode)} bytes")
    tester.upload_bytecode(bytecode)

    print("Running for 2 seconds (capturing traces)...")
    tester.start_and_wait(duration=2.0)

    # Check status
    # print("Checking status...")
    # status = tester.send("zplc dbg status")
    # print(f"Status: {status.strip()}")

    print("Peeking memory...")

    # Read debug (INT at 0x1000)
    debug_data = tester.peek(0x1000, 2)
    debug_val = (
        struct.unpack("<h", bytearray(debug_data))[0] if len(debug_data) >= 2 else 0
    )

    print("\n--- RESULTS ---")
    print(f"debug_val:       {debug_val} (Expected: 222)")

    all_pass = True

    if debug_val != 222:
        print(f"FAIL: debug_val ({debug_val}) != 222 (Override failed?)")
        all_pass = False
    else:
        print("PASS ✅")

    print("\n" + "=" * 52)
    tester.close()
    return all_pass
    if all_pass:
        print("RESULT: OOP EXTENDS TEST PASSED! ✅🎉")
    else:
        print("RESULT: OOP EXTENDS TEST FAILED! ❌💀")
    print("=" * 52)

    tester.close()
    return all_pass


if __name__ == "__main__":
    success = test_oop_extends()
    exit(0 if success else 1)
