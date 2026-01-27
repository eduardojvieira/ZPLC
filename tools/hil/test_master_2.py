from zplc_tester import ZPLCTester
import time
import struct


def h2i(bytes_list):
    """Convierte 2 bytes (list) a int 16-bit signed."""
    if len(bytes_list) < 2:
        return 0
    return struct.unpack("<h", bytearray(bytes_list))[0]


def test_master_2():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC MASTER INTEGRATION TEST 2            ")
    print("====================================================")

    st_file = "tools/hil/st_tests/master_test_2.st"

    # 1. Compilar y subir
    print("Compiling and uploading master test 2...")
    bytecode = tester.compile_st(st_file)
    tester.upload_bytecode(bytecode)

    # 2. Correr por 12 segundos (para estar seguros de los 100ms * 100)
    print("Running master test sequence for 12 seconds...")
    tester.start_and_wait(duration=12.0)

    # 3. Leer resultados de WORK
    # res_tof @ 8234, res_tp @ 8235, res_for @ 8236 (2b), res_case @ 8238 (2b)
    print("Peeking results from WORK memory...")

    cycle_count = tester.peek(8192, 2)
    print(f"DEBUG: PLC Cycles: {h2i(cycle_count)}")

    res_data = tester.peek(8234, 6)
    if len(res_data) < 6:
        print(f"ERROR: Incomplete data read ({len(res_data)} bytes)")
        tester.close()
        return

    results = {
        "TOF (Off Delay)": res_data[0] == 1,
        "TP (Pulse)": res_data[1] == 1,
        "FOR Loop (1..5)": h2i(res_data[2:4]) == 15,
        "CASE Statement": h2i(res_data[4:6]) == 200,
    }

    print("\n--- TEST REPORT ---")
    all_ok = True
    for test, passed in results.items():
        val = ""
        if "FOR" in test:
            val = f" (Val: {h2i(res_data[2:4])})"
        if "CASE" in test:
            val = f" (Val: {h2i(res_data[4:6])})"

        status = "PASS ✅" if passed else "FAIL ❌"
        if not passed:
            all_ok = False
        print(f"{test:<20} : {status}{val}")

    print("====================================================")
    if all_ok:
        print("RESULT: MASTER TEST 2 PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: MASTER TEST 2 FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_master_2()
