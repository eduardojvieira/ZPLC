from zplc_tester import ZPLCTester
import time
import struct


def h2f(bytes_list):
    """Convierte 4 bytes a float 32-bit."""
    if len(bytes_list) < 4:
        return 0.0
    return struct.unpack("<f", bytearray(bytes_list))[0]


def h2i(bytes_list):
    if len(bytes_list) < 2:
        return 0
    return struct.unpack("<h", bytearray(bytes_list))[0]


def test_math_real():
    tester = ZPLCTester()

    print("\n====================================================")
    print("          ZPLC REAL MATH & ARRAY TEST               ")
    print("====================================================")

    st_file = "tools/hil/st_tests/math_real.st"

    # 1. Compilar y subir
    print("Compiling and uploading...")
    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"ERROR: Compilation failed: {e}")
        tester.close()
        return

    tester.upload_bytecode(bytecode)

    # 2. Correr (Necesita tiempo para Taylor series)
    print("Running sequence (3s)...")
    tester.start_and_wait(duration=3.0)

    # 3. Leer OPI
    # res_ok @ 0x1000 (2b)
    # debug_val @ 0x1004 (4b)
    print("Peeking OPI memory...")
    opi_data = tester.peek(0x1000, 8)  # Need 8 bytes to cover up to 0x1007

    if len(opi_data) < 8:
        print(f"ERROR: Incomplete data ({len(opi_data)} bytes)")
        tester.close()
        return

    res_ok = h2i(opi_data[0:2])
    sin_val = h2f(opi_data[4:8])

    print("\n--- RESULTS ---")
    print(f"SIN(PI/2) Value : {sin_val:.6f} (Target: 1.0)")
    print(f"Validation Flag : {res_ok} (Expected: 1)")

    if res_ok == 1:
        print("RESULT: MATH REAL PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: MATH REAL FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_math_real()
