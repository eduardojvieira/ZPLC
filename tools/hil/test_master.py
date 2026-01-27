from zplc_tester import ZPLCTester
import time


def test_master():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC MASTER INTEGRATION TEST              ")
    print("====================================================")

    st_file = "tools/hil/st_tests/master_test.st"

    # 1. Compilar y subir
    print("Compiling and uploading master test...")
    bytecode = tester.compile_st(st_file)
    tester.upload_bytecode(bytecode)

    # 2. Correr por 10 segundos (100 ciclos)
    # Sin verbose para no saturar el serial
    print("Running master test sequence for 10 seconds...")
    tester.start_and_wait(duration=10.0)

    # 3. Leer resultados de OPI
    # res_rs @ 0x1000, res_sr @ 0x1001, res_trig @ 0x1002, res_ctu @ 0x1003
    print("Peeking results from OPI...")
    # Debug: ver respuesta cruda del peek
    raw_resp = tester.send(f"zplc dbg peek 0x1000 4")
    print(f"DEBUG: Raw Peek Response: {raw_resp}")

    opi_data = tester.peek(0x1000, 4)

    if len(opi_data) < 4:
        print("ERROR: Failed to read OPI data")
        tester.close()
        return

    results = {
        "RS (Latch)": opi_data[0] == 1,
        "SR (Latch)": opi_data[1] == 1,
        "TRIGGERS": opi_data[2] == 1,
        "CTU (Counter)": opi_data[3] == 1,
    }

    print("\n--- TEST REPORT ---")
    all_ok = True
    for test, passed in results.items():
        status = "PASS ✅" if passed else "FAIL ❌"
        if not passed:
            all_ok = False
        print(f"{test:<20} : {status}")

    print("====================================================")
    if all_ok:
        print("RESULT: MASTER TEST PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: MASTER TEST FAILED! 💀")
        print(f"DEBUG: OPI Data: {opi_data}")

    tester.close()


if __name__ == "__main__":
    test_master()
