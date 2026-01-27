from zplc_tester import ZPLCTester


def test_comparison():
    tester = ZPLCTester()
    OP = tester.OP

    print("\n--- Running Comparison Tests ---")

    # 1. EQ
    print("Test EQ...", end="", flush=True)
    bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 10, OP["EQ"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
        bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 20, OP["EQ"], OP["HALT"]]
        if tester.get_last_tos(tester.run_bytecode(bytecode)) == 0:
            print("PASS")
        else:
            print("FAIL (10==20)")
    else:
        print("FAIL (10==10)")

    # 2. NE
    print("Test NE...", end="", flush=True)
    bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 20, OP["NE"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
        bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 10, OP["NE"], OP["HALT"]]
        if tester.get_last_tos(tester.run_bytecode(bytecode)) == 0:
            print("PASS")
        else:
            print("FAIL (10!=10)")
    else:
        print("FAIL (10!=20)")

    # 3. LT (Signed)
    print("Test LT...", end="", flush=True)
    bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 20, OP["LT"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
        bytecode = [OP["PUSH8"], 0xF6, OP["PUSH8"], 0, OP["LT"], OP["HALT"]]  # -10 < 0
        if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
            print("PASS")
        else:
            print("FAIL (-10 < 0)")
    else:
        print("FAIL (10 < 20)")

    # 4. LE
    print("Test LE...", end="", flush=True)
    bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 10, OP["LE"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
        print("PASS")
    else:
        print("FAIL")

    # 5. GT
    print("Test GT...", end="", flush=True)
    bytecode = [OP["PUSH8"], 20, OP["PUSH8"], 10, OP["GT"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
        print("PASS")
    else:
        print("FAIL")

    # 6. GE
    print("Test GE...", end="", flush=True)
    bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 10, OP["GE"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
        print("PASS")
    else:
        print("FAIL")

    # 7. LTU (Unsigned)
    print("Test LTU...", end="", flush=True)
    # 1 < 0xFFFFFFFF (unsigned) is TRUE (1)
    bytecode = [OP["PUSH8"], 1, OP["PUSH32"]] + [0xFF] * 4 + [OP["LTU"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(tester.run_bytecode(bytecode))})")

    # 8. GTU (Unsigned)
    print("Test GTU...", end="", flush=True)
    # 0xFFFFFFFF > 1 (unsigned) is TRUE (1)
    bytecode = [OP["PUSH32"]] + [0xFF] * 4 + [OP["PUSH8"], 1, OP["GTU"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
        print("PASS")
    else:
        print("FAIL")

    tester.close()


if __name__ == "__main__":
    test_comparison()
