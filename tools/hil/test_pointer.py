from zplc_tester import ZPLCTester
import time
import struct


def h2i(bytes_list):
    if len(bytes_list) < 2:
        return 0
    return struct.unpack("<h", bytearray(bytes_list))[0]


def test_pointer():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC POINTER TEST (REF/DEREF)             ")
    print("====================================================")

    st_file = "tools/hil/st_tests/pointer_test.st"

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
    opi_data = tester.peek(0x1000, 4)

    if len(opi_data) < 4:
        print(f"ERROR: Incomplete data ({len(opi_data)} bytes)")
        tester.close()
        return

    res_read = h2i(opi_data[0:2])
    res_write = h2i(opi_data[2:4])

    print("\n--- RESULTS ---")
    print(
        f"Dereference Read (ptr^)  : {res_read} (Expected: 42) {'✅' if res_read == 42 else '❌'}"
    )
    print(
        f"Dereference Write (val)  : {res_write} (Expected: 99) {'✅' if res_write == 99 else '❌'}"
    )

    if res_read == 42 and res_write == 99:
        print("RESULT: POINTERS PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: POINTERS FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_pointer()
