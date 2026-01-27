from zplc_tester import ZPLCTester
import struct
import os


def test_vartemp():
    tester = ZPLCTester()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    st_file = os.path.join(script_dir, "st_tests", "vartemp_hil.st")

    print("\n====================================================")
    print("          ZPLC VAR_TEMP HIL TEST                    ")
    print("====================================================")

    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"Compilation failed: {e}")
        return False

    tester.upload_bytecode(bytecode)
    print("Running for 2.0 seconds...")
    tester.start_and_wait(duration=2.0)

    # 0x2000: __M_FB_TempTest_AddTemp_In (INT, 2 bytes)
    # 0x2002: __M_FB_TempTest_AddTemp_tmp (INT, 2 bytes)
    # 0x2004: res1 (INT, 2 bytes)
    # 0x2006: res2 (INT, 2 bytes)

    mem = tester.peek(0x2000, 8)
    if not mem:
        print("FAIL: Could not read memory (PLC Crash?)")
        return False

    in_val = struct.unpack("<h", bytearray(mem[0:2]))[0]
    tmp_val = struct.unpack("<h", bytearray(mem[2:4]))[0]
    res1 = struct.unpack("<h", bytearray(mem[4:6]))[0]
    res2 = struct.unpack("<h", bytearray(mem[6:8]))[0]

    print(f"in_val: {in_val}")
    print(f"tmp: {tmp_val}")
    print(f"res1: {res1} (Expected 10)")
    print(f"res2: {res2} (Expected 20)")

    if res1 == 10 and res2 == 20:
        print("PASS ✅")
        return True
    else:
        print("FAIL ❌")
        return False


if __name__ == "__main__":
    test_vartemp()
