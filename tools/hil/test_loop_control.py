from zplc_tester import ZPLCTester
import time
import struct


def h2i(bytes_list):
    if len(bytes_list) < 2:
        return 0
    return struct.unpack("<h", bytearray(bytes_list))[0]


def test_loop_control():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC LOOP CONTROL (EXIT/CONTINUE)         ")
    print("====================================================")

    st_file = "tools/hil/st_tests/loop_control.st"

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
    opi_data = tester.peek(0x1000, 6)  # Need up to 0x1005 (covers 0x1000 and 0x1002)

    if len(opi_data) < 6:
        print(f"ERROR: Incomplete data ({len(opi_data)} bytes)")
        tester.close()
        return

    # res_exit @ 0x1000 (2 bytes)
    # res_cont @ 0x1002 (2 bytes) (offset 2 in data)
    res_exit = h2i(opi_data[0:2])
    res_cont = h2i(opi_data[4:6])  # Wait, offset for %Q2.0 is 0x1002 ? NO.

    # %Q0.0 -> Byte 0 (0x1000)
    # %Q2.0 -> Byte 2 (0x1002)

    # opi_data[0]: 0x1000
    # opi_data[1]: 0x1001
    # opi_data[2]: 0x1002
    # opi_data[3]: 0x1003

    res_cont_real = h2i(opi_data[2:4])

    print("\n--- RESULTS ---")
    print(
        f"EXIT Loop (Stop at 5)   : {res_exit} (Expected: 5) {'✅' if res_exit == 5 else '❌'}"
    )
    print(
        f"CONTINUE Loop (Sum!=3)  : {res_cont_real} (Expected: 12) {'✅' if res_cont_real == 12 else '❌'}"
    )

    if res_exit == 5 and res_cont_real == 12:
        print("RESULT: LOOP CONTROL PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: LOOP CONTROL FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_loop_control()
