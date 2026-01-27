from zplc_tester import ZPLCTester
import struct
import os


def test_named():
    tester = ZPLCTester()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    st_file = os.path.join(script_dir, "st_tests", "named_params_test.st")

    print("\n====================================================")
    print("          ZPLC Named Params HIL TEST (REAL)         ")
    print("====================================================")

    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"Compilation failed: {e}")
        return False

    tester.upload_bytecode(bytecode)
    print("Running for 2.0 seconds...")
    tester.start_and_wait(duration=2.0)

    # 0x2000: A (REAL, 4)
    # 0x2004: B (REAL, 4)
    # 0x2008: res (REAL, 4)

    mem = tester.peek(0x2000, 16)
    if not mem:
        print("FAIL: PLC Crash (No memory read)")
        return False

    res = struct.unpack("<f", bytearray(mem[8:12]))[0]

    print(f"res: {res} (Expected 30.0)")

    if abs(res - 30.0) < 0.1:
        print("PASS ✅")
        return True
    else:
        print("FAIL ❌")
        return False


if __name__ == "__main__":
    test_named()
