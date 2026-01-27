from zplc_tester import ZPLCTester
import time
import struct


def h2i(bytes_list):
    if len(bytes_list) < 2:
        return 0
    return struct.unpack("<h", bytearray(bytes_list))[0]


def test_loop():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC LOOP CONTROL TEST (WHILE/REPEAT)     ")
    print("====================================================")

    st_file = "tools/hil/st_tests/loop_test.st"

    print("Compiling and uploading...")
    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"ERROR: Compilation failed: {e}")
        tester.close()
        return

    tester.upload_bytecode(bytecode)

    print("Running sequence (0.1s)...")
    tester.start_and_wait(duration=0.1)

    print("Peeking OPI memory...")
    opi_data = tester.peek(0x1000, 4)

    if len(opi_data) < 4:
        print(f"ERROR: Incomplete data ({len(opi_data)} bytes)")
        tester.close()
        return

    res_while = h2i(opi_data[0:2])
    res_repeat = h2i(opi_data[2:4])

    print("\n--- RESULTS ---")
    print(
        f"WHILE Loop (0..10)  : {res_while} (Expected: 10) {'✅' if res_while == 10 else '❌'}"
    )
    print(
        f"REPEAT Loop (0..20) : {res_repeat} (Expected: 20) {'✅' if res_repeat == 20 else '❌'}"
    )

    if res_while == 10 and res_repeat == 20:
        print("RESULT: LOOPS PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: LOOPS FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_loop()
