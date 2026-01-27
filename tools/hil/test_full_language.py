from zplc_tester import ZPLCTester
import struct
import os


def test_full():
    tester = ZPLCTester()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    st_file = os.path.join(script_dir, "st_tests", "full_language_test.st")

    print("\n====================================================")
    print("          ZPLC Full Language HIL TEST               ")
    print("====================================================")

    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"Compilation failed: {e}")
        return False

    tester.upload_bytecode(bytecode)
    print("Running for 3.0 seconds...")
    tester.start_and_wait(duration=3.0)

    # Read block from 0x2000
    mem = tester.peek(0x2000, 512)

    def get_bool(offset):
        return mem[offset] > 0

    def get_real(offset):
        return struct.unpack("<f", bytearray(mem[offset : offset + 4]))[0]

    def get_int(offset):
        return struct.unpack("<h", bytearray(mem[offset : offset + 2]))[0]

    # Offsets relative to 0x2000
    currentState = get_int(0x16C)
    calc_res1 = get_real(0x178)
    calc_res2 = get_real(0x17C)

    flag_enum = get_bool(0x182)
    flag_oop = get_bool(0x183)
    flag_temp = get_bool(0x184)
    flag_types = get_bool(0x185)

    print(f"CurrentState: {currentState} (Expected: 2)")
    print(f"Calc Res1: {calc_res1} (Expected: 20.0)")
    print(f"Calc Res2: {calc_res2} (Expected: 40.0)")

    all_pass = True

    if flag_enum:
        print("Enum Test: PASS ✅")
    else:
        print("Enum Test: FAIL ❌")
        all_pass = False

    if flag_oop:
        print("OOP Test: PASS ✅")
    else:
        print("OOP Test: FAIL ❌")
        all_pass = False

    if flag_temp:
        print("VAR_TEMP Test: PASS ✅")
    else:
        print(f"VAR_TEMP Test: FAIL ❌ (Got {calc_res1}, {calc_res2})")
        all_pass = False

    if flag_types:
        print("Types Test: PASS ✅")
    else:
        print("Types Test: FAIL ❌")
        all_pass = False

    tester.close()
    return all_pass


if __name__ == "__main__":
    test_full()
