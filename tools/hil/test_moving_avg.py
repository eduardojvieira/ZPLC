from zplc_tester import ZPLCTester
import time
import struct


def h2i(bytes_list):
    if len(bytes_list) < 2:
        return 0
    return struct.unpack("<h", bytearray(bytes_list))[0]


def test_moving_avg():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC MOVING AVERAGE TEST                  ")
    print("====================================================")

    st_file = "tools/hil/st_tests/moving_avg.st"

    # 1. Compilar y subir
    print("Compiling and uploading...")
    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"ERROR: Compilation failed: {e}")
        tester.close()
        return

    tester.upload_bytecode(bytecode)

    # 2. Correr y monitorear
    print("Running sequence (Sampling)...")
    tester.send("zplc hil mode off")
    tester.send("zplc start")

    # Muestrear cada 200ms durante 3 segundos
    print("Time(s) | Avg Output")
    print("--------|-----------")

    start_time = time.time()
    last_val = -1
    stable_count = 0
    increasing_count = 0

    while time.time() - start_time < 3.0:
        data = tester.peek(0x1000, 2)
        if len(data) >= 2:
            val = h2i(data)
            print(f"{(time.time() - start_time):.2f}    | {val}")

            if val > last_val and last_val != -1:
                increasing_count += 1
            if val > 0:
                stable_count += 1
            last_val = val
        time.sleep(0.2)

    tester.send("zplc stop")

    print("\n--- RESULTS ---")
    print(f"Samples > 0: {stable_count}")
    print(f"Increasing Trend: {increasing_count}")

    if stable_count > 5 and increasing_count > 3:
        print("RESULT: MOVING AVG PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: MOVING AVG FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_moving_avg()
