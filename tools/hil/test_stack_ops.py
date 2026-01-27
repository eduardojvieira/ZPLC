from zplc_tester import ZPLCTester


def test_stack_ops():
    tester = ZPLCTester()
    OP = tester.OP

    print("\n--- Running Stack Operations Tests ---")

    # 1. DUP
    print("Test DUP (v42)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 42, OP["DUP"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_sp(traces) == 2 and tester.get_last_tos(traces) == 42:
        print("PASS")
    else:
        print(
            f"FAIL (sp={tester.get_last_sp(traces)}, tos={tester.get_last_tos(traces)})"
        )

    # 2. DROP
    print("Test DROP (v43)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 43, OP["PUSH8"], 10, OP["DROP"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_sp(traces) == 1 and tester.get_last_tos(traces) == 43:
        print("PASS")
    else:
        print(
            f"FAIL (sp={tester.get_last_sp(traces)}, tos={tester.get_last_tos(traces)})"
        )

    # 3. SWAP
    print("Test SWAP (v44)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 44, OP["PUSH8"], 10, OP["SWAP"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_sp(traces) == 2 and tester.get_last_tos(traces) == 44:
        print("PASS")
    else:
        print(
            f"FAIL (sp={tester.get_last_sp(traces)}, tos={tester.get_last_tos(traces)})"
        )

    # 4. OVER
    print("Test OVER (v45)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 45, OP["PUSH8"], 10, OP["OVER"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_sp(traces) == 3 and tester.get_last_tos(traces) == 45:
        print("PASS")
    else:
        print(
            f"FAIL (sp={tester.get_last_sp(traces)}, tos={tester.get_last_tos(traces)})"
        )

    # 5. ROT
    print("Test ROT...", end="", flush=True)
    bytecode = [
        OP["PUSH8"],
        100,
        OP["PUSH8"],
        101,
        OP["PUSH8"],
        102,
        OP["ROT"],
        OP["HALT"],
    ]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_sp(traces) == 3 and tester.get_last_tos(traces) == 100:
        print("PASS")
    else:
        print(
            f"FAIL (sp={tester.get_last_sp(traces)}, tos={tester.get_last_tos(traces)})"
        )

    # 6. PICK
    print("Test PICK...", end="", flush=True)
    bytecode = [
        OP["PUSH8"],
        110,
        OP["PUSH8"],
        111,
        OP["PUSH8"],
        112,
        OP["PICK"],
        2,
        OP["HALT"],
    ]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_sp(traces) == 4 and tester.get_last_tos(traces) == 110:
        print("PASS")
    else:
        print(
            f"FAIL (sp={tester.get_last_sp(traces)}, tos={tester.get_last_tos(traces)})"
        )

    tester.close()


if __name__ == "__main__":
    test_stack_ops()
