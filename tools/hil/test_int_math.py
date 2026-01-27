from zplc_tester import ZPLCTester


def test_int_math():
    tester = ZPLCTester()
    OP = tester.OP

    print("\n--- Running Integer Arithmetic Tests ---")

    # 1. ADD: 10 + 20 = 30
    print("Test ADD (10+20)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 20, OP["ADD"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 30:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 2. SUB: 50 - 20 = 30
    print("Test SUB (50-20)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 50, OP["PUSH8"], 20, OP["SUB"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 30:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 3. MUL: 6 * 5 = 30
    print("Test MUL (6*5)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 6, OP["PUSH8"], 5, OP["MUL"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 30:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 4. DIV: 100 / 3 = 33
    print("Test DIV (100/3)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 100, OP["PUSH8"], 3, OP["DIV"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 33:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 5. MOD: 10 % 3 = 1
    print("Test MOD (10%3)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 3, OP["MOD"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 1:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 6. NEG: 42 -> -42
    # PUSH8 stores signed values, but let's test the opcode
    print("Test NEG (42 -> -42)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 42, OP["NEG"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    tos = tester.get_last_tos(traces)
    # En Python los integers son de precisión arbitraria,
    # pero en el VM son de 32 bits signed (complemento a 2).
    # -42 en 32-bit hex es 0xFFFFFFD6 = 4294967254 unsigned
    if tos == 4294967254 or tos == -42:
        print("PASS")
    else:
        print(f"FAIL (tos={tos})")

    # 7. ABS: -10 -> 10
    print("Test ABS (-10 -> 10)...", end="", flush=True)
    # Para meter un negativo con PUSH8, usamos 0xF6 (-10)
    bytecode = [OP["PUSH8"], 0xF6, OP["ABS"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 10:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    tester.close()


if __name__ == "__main__":
    test_int_math()
