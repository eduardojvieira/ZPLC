from zplc_tester import ZPLCTester
import struct
import time


def h2f(bytes_list):
    """Convierte 4 bytes (list) a float 32-bit (IEEE754)."""
    if len(bytes_list) < 4:
        return 0.0
    return struct.unpack("<f", bytearray(bytes_list))[0]


def h2i(bytes_list):
    """Convierte 2 bytes (list) a int 16-bit signed."""
    if len(bytes_list) < 2:
        return 0
    return struct.unpack("<h", bytearray(bytes_list))[0]


def test_math_control():
    tester = ZPLCTester()

    print("\n====================================================")
    print("      ZPLC ADVANCED MATH & CONTROL TEST             ")
    print("====================================================")

    st_file = "tools/hil/st_tests/master_math_control.st"

    # 1. Subir y correr
    print("Compiling and uploading test...")
    bytecode = tester.compile_st(st_file)
    tester.upload_bytecode(bytecode)

    # Damos tiempo para que los cálculos (especialmente Taylor) terminen
    print("Running sequence (2s)...")
    tester.start_and_wait(duration=2.0)

    # 2. Leer resultados
    # res_sqrt @ 0x1004 (4 bytes)
    # res_ln   @ 0x1008 (4 bytes)
    # res_sin  @ 0x100C (4 bytes)
    # res_expt @ 0x1010 (2 bytes)
    # res_for  @ 0x1012 (2 bytes)
    # res_case @ 0x1014 (2 bytes)

    print("Peeking OPI memory...")
    data = tester.peek(0x1004, 18)  # Leemos un bloque desde 0x1004

    if len(data) < 18:
        print("ERROR: Incomplete data read")
        tester.close()
        return

    # Extraer valores
    sqrt_val = h2f(data[0:4])
    ln_val = h2f(data[4:8])
    sin_val = h2f(data[8:12])
    expt_val = h2i(data[12:14])
    for_val = h2i(data[14:16])
    case_val = h2i(data[16:18])

    print("\n--- MATH RESULTS ---")
    print(
        f"SQRT(2.0)   : {sqrt_val:.4f} (Expected: 1.4142) {'✅' if 1.41 <= sqrt_val <= 1.42 else '❌'}"
    )
    print(
        f"LN(2.718)   : {ln_val:.4f} (Expected: 1.0000) {'✅' if 0.99 <= ln_val <= 1.01 else '❌'}"
    )
    print(
        f"SIN(PI/2)   : {sin_val:.4f} (Expected: 1.0000) {'✅' if 0.99 <= sin_val <= 1.01 else '❌'}"
    )
    print(
        f"EXPT(2, 8)  : {expt_val} (Expected: 256) {'✅' if expt_val == 256 else '❌'}"
    )

    print("\n--- CONTROL RESULTS ---")
    print(f"FOR 1..10   : {for_val} (Expected: 55) {'✅' if for_val == 55 else '❌'}")
    print(f"CASE (2)    : {case_val} (Expected: 20) {'✅' if case_val == 20 else '❌'}")

    print("====================================================")

    tester.close()


if __name__ == "__main__":
    test_math_control()
