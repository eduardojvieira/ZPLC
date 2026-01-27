from zplc_tester import ZPLCTester


def test_logic():
    tester = ZPLCTester()
    OP = tester.OP

    print("\n--- Running Logical/Bitwise Tests ---")

    # 1. AND: 0x0F & 0x55 = 0x05
    print("Test AND...", end="", flush=True)
    bytecode = [OP["PUSH8"], 0x0F, OP["PUSH8"], 0x55, OP["AND"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 0x05:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 2. OR: 0x0F | 0x50 = 0x5F
    print("Test OR...", end="", flush=True)
    bytecode = [OP["PUSH8"], 0x0F, OP["PUSH8"], 0x50, OP["OR"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 0x5F:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 3. XOR: 0x55 ^ 0xFF = 0xAA (interpreted as -86 signed, or 0xFFFFFFAA)
    # 0xAA in 32-bit is 170. But if PUSH8 0xFF is -1, then 0x55 ^ -1 = ~0x55 = 0xFFAA...
    # Let's use simpler values to avoid sign-extension confusion
    print("Test XOR...", end="", flush=True)
    bytecode = [OP["PUSH8"], 0x55, OP["PUSH8"], 0x33, OP["XOR"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    # 0x55 (01010101) ^ 0x33 (00110011) = 0x66 (01100110) = 102
    if tester.get_last_tos(traces) == 0x66:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 4. NOT: ~0 = 0xFFFFFFFF
    print("Test NOT...", end="", flush=True)
    bytecode = [OP["PUSH8"], 0, OP["NOT"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    tos = tester.get_last_tos(traces)
    if tos == 4294967295 or tos == -1:
        print("PASS")
    else:
        print(f"FAIL (tos={tos})")

    # 5. SHL: 1 << 4 = 16
    print("Test SHL...", end="", flush=True)
    bytecode = [OP["PUSH8"], 1, OP["PUSH8"], 4, OP["SHL"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 16:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 6. SHR: 32 >> 3 = 4
    print("Test SHR...", end="", flush=True)
    bytecode = [OP["PUSH8"], 32, OP["PUSH8"], 3, OP["SHR"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 4:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 7. SAR: -16 >> 2 = -4
    print("Test SAR...", end="", flush=True)
    bytecode = [
        OP["PUSH8"],
        0xF0,  # -16
        OP["PUSH8"],
        2,
        OP["SAR"],
        OP["HALT"],
    ]
    traces = tester.run_bytecode(bytecode)
    tos = tester.get_last_tos(traces)
    # -4 is 0xFFFFFFFC = 4294967292
    if tos == 4294967292 or tos == -4:
        print("PASS")
    else:
        print(f"FAIL (tos={tos})")

    tester.close()


if __name__ == "__main__":
    test_logic()
