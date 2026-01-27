from zplc_tester import ZPLCTester
import struct


def f2h(f):
    """Float to hex (IEEE754 32-bit)"""
    return struct.unpack("<I", struct.pack("<f", f))[0] & 0xFFFFFFFF


def h2f(h):
    """Hex to float (IEEE754 32-bit)"""
    if h is None:
        return 0.0
    return struct.unpack("<f", struct.pack("<I", h & 0xFFFFFFFF))[0]


def test_float_math():
    tester = ZPLCTester()
    OP = tester.OP

    print("\n--- Running Float Arithmetic Tests ---")

    # 1. ADDF: 1.5 + 2.5 = 4.0
    print("Test ADDF (1.5 + 2.5)...", end="", flush=True)
    b1 = list(struct.pack("<f", 1.5))
    b2 = list(struct.pack("<f", 2.5))
    bytecode = [OP["PUSH32"]] + b1 + [OP["PUSH32"]] + b2 + [OP["ADDF"], OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if tos == f2h(4.0):
        print("PASS")
    else:
        print(f"FAIL (tos={h2f(tos) if tos else None})")

    # 2. SUBF: 5.0 - 2.5 = 2.5
    print("Test SUBF (5.0 - 2.5)...", end="", flush=True)
    b1 = list(struct.pack("<f", 5.0))
    b2 = list(struct.pack("<f", 2.5))
    bytecode = [OP["PUSH32"]] + b1 + [OP["PUSH32"]] + b2 + [OP["SUBF"], OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if tos == f2h(2.5):
        print("PASS")
    else:
        print(f"FAIL")

    # 3. MULF: 2.0 * 3.5 = 7.0
    print("Test MULF (2.0 * 3.5)...", end="", flush=True)
    b1 = list(struct.pack("<f", 2.0))
    b2 = list(struct.pack("<f", 3.5))
    bytecode = [OP["PUSH32"]] + b1 + [OP["PUSH32"]] + b2 + [OP["MULF"], OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if tos == f2h(7.0):
        print("PASS")
    else:
        print(f"FAIL")

    # 4. DIVF: 10.0 / 4.0 = 2.5
    print("Test DIVF (10.0 / 4.0)...", end="", flush=True)
    b1 = list(struct.pack("<f", 10.0))
    b2 = list(struct.pack("<f", 4.0))
    bytecode = [OP["PUSH32"]] + b1 + [OP["PUSH32"]] + b2 + [OP["DIVF"], OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if tos == f2h(2.5):
        print("PASS")
    else:
        print(f"FAIL")

    # 5. NEGF: 1.23 -> -1.23
    print("Test NEGF (1.23 -> -1.23)...", end="", flush=True)
    val = 1.23
    bytecode = [OP["PUSH32"]] + list(struct.pack("<f", val)) + [OP["NEGF"], OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    # Usamos round para evitar problemas de precisión float
    if round(h2f(tos), 5) == round(-val, 5):
        print("PASS")
    else:
        print(f"FAIL (tos={h2f(tos)})")

    # 6. ABSF: -1.23 -> 1.23
    print("Test ABSF (-1.23 -> 1.23)...", end="", flush=True)
    val = -1.23
    bytecode = [OP["PUSH32"]] + list(struct.pack("<f", val)) + [OP["ABSF"], OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if round(h2f(tos), 5) == round(abs(val), 5):
        print("PASS")
    else:
        print(f"FAIL")

    tester.close()


if __name__ == "__main__":
    test_float_math()
