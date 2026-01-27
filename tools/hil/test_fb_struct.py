from zplc_tester import ZPLCTester
import time
import struct


def h2i(bytes_list):
    if len(bytes_list) < 2:
        return 0
    return struct.unpack("<h", bytearray(bytes_list))[0]


def test_fb_struct():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC STRUCT TEST                          ")
    print("====================================================")

    st_file = "tools/hil/st_tests/struct_revisited.st"

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
    opi_data = tester.peek(0x1000, 2)

    if len(opi_data) < 2:
        print(f"ERROR: Incomplete data ({len(opi_data)} bytes)")
        tester.close()
        return

    res_sum = h2i(opi_data)

    print("\n--- RESULTS ---")
    print(
        f"Struct Sum (10+20) : {res_sum} (Expected: 30) {'✅' if res_sum == 30 else '❌'}"
    )

    if res_sum == 30:
        print("RESULT: STRUCT PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: STRUCT FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_fb_struct()
