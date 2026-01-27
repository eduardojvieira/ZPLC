from zplc_tester import ZPLCTester
import time
import struct


def h2f(bytes_list):
    if len(bytes_list) < 4:
        return 0.0
    return struct.unpack("<f", bytearray(bytes_list))[0]


def test_user_function():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC USER FUNCTION TEST                   ")
    print("====================================================")

    st_file = "tools/hil/st_tests/user_function.st"

    print("Compiling and uploading...")
    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"ERROR: Compilation failed: {e}")
        tester.close()
        return

    tester.upload_bytecode(bytecode)

    print("Running sequence (2s)...")
    tester.start_and_wait(duration=2.0)

    print("Peeking OPI memory...")
    cycle_data = tester.peek(0x1004, 2)
    cycle = 0
    if len(cycle_data) == 2:
        cycle = struct.unpack("<h", bytearray(cycle_data))[0]
    print(f"DEBUG: PLC Cycles: {cycle}")

    opi_data = tester.peek(0x1000, 4)

    if len(opi_data) < 4:
        print(f"ERROR: Incomplete data ({len(opi_data)} bytes)")

        tester.close()
        return

    res_val = h2f(opi_data)

    print("\n--- RESULTS ---")
    print(
        f"Hypotenuse(3, 4) : {res_val:.2f} (Expected: 5.00) {'✅' if 4.99 <= res_val <= 5.01 else '❌'}"
    )

    if 4.99 <= res_val <= 5.01:
        print("RESULT: USER FUNCTION PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: USER FUNCTION FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_user_function()
