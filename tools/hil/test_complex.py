from zplc_tester import ZPLCTester
import time
import struct


def h2i(bytes_list):
    """Convierte 2 bytes (list) a int 16-bit signed."""
    if len(bytes_list) < 2:
        return 0
    return struct.unpack("<h", bytearray(bytes_list))[0]


def test_complex():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC COMPLEX TYPES TEST                   ")
    print("====================================================")

    st_file = "tools/hil/st_tests/complex_types.st"

    print("Compiling and uploading complex types test...")
    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"ERROR: Compilation failed: {e}")
        tester.close()
        return

    tester.upload_bytecode(bytecode)

    print("Running sequence...")
    tester.start_and_wait(duration=2.0)

    print("Peeking OPI memory...")
    opi_data = tester.peek(0x1000, 2)

    if len(opi_data) < 2:
        print(f"ERROR: Incomplete data read ({len(opi_data)} bytes)")
        tester.close()
        return

    res_x = h2i(opi_data[0:2])

    print("\n--- RESULTS ---")
    print(f"Matrix Diag Sum: {res_x} (Expected: 50) {'✅' if res_x == 50 else '❌'}")

    print("====================================================")
    if res_x == 50:
        print("RESULT: COMPLEX TYPES PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: COMPLEX TYPES FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_complex()
