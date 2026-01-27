from zplc_tester import ZPLCTester
import time


def test_blinky():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC BLINKY & MULTITASK TEST              ")
    print("====================================================")

    st_file = "tools/hil/st_tests/master_blinky.st"

    # 1. Compilar y subir
    print("Compiling and uploading blinky test...")
    bytecode = tester.compile_st(st_file)
    tester.upload_bytecode(bytecode)

    # 2. Correr y monitorear (no podemos hacer 'wait' porque queremos ver el cambio en vivo)
    # Pero como no tenemos monitor en tiempo real por ahora, capturamos snapshots con peek

    print("Running blinky test (sampling for 5s)...")
    tester.send("zplc hil mode off")
    tester.send("zplc start")

    samples = []
    start_time = time.time()

    # Muestrear cada 100ms
    while time.time() - start_time < 5.0:
        data = tester.peek(0x1000, 2)  # Read GP0 and GP1
        if len(data) >= 2:
            timestamp = time.time() - start_time
            samples.append((timestamp, data[0], data[1]))
        time.sleep(0.1)  # Sampling rate ~10Hz

    tester.send("zplc stop")

    # Analizar
    # GP0 (Slow): Should change every ~0.5s
    # GP1 (Fast): Should change every ~0.1s (might miss changes with 10Hz sampling)

    changes_slow = 0
    changes_fast = 0
    last_slow = samples[0][1]
    last_fast = samples[0][2]

    print("\n--- SAMPLE DATA ---")
    print("Time(s) | Slow (GP0) | Fast (GP1)")
    print("--------|------------|-----------")
    for t, slow, fast in samples:
        print(f"{t:.2f}    | {slow}          | {fast}")

        if slow != last_slow:
            changes_slow += 1
            last_slow = slow

        if fast != last_fast:
            changes_fast += 1
            last_fast = fast

    print("\n--- RESULTS ---")
    print(f"Slow Toggle Count: {changes_slow} (Expected ~5-10 for 5s)")
    print(f"Fast Toggle Count: {changes_fast} (Expected >10)")

    if changes_slow >= 4 and changes_fast >= 8:
        print("RESULT: BLINKY TEST PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: BLINKY TEST FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_blinky()
