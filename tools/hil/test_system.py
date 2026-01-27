from zplc_tester import ZPLCTester


def test_system():
    tester = ZPLCTester()
    OP = tester.OP

    print("\n--- Running System Operations Tests ---")

    # 1. NOP
    print("Test NOP...", end="", flush=True)
    bytecode = [OP["NOP"], OP["NOP"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    # PC should advance, no errors
    if any(t.get("op") == "NOP" for t in traces):
        print("PASS")
    else:
        print("FAIL")

    # 2. GET_TICKS
    print("Test GET_TICKS...", end="", flush=True)
    bytecode = [OP["GET_TICKS"], OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if tos is not None and tos > 0:
        print(f"PASS ({tos} ms)")
    else:
        print("FAIL")

    tester.close()


if __name__ == "__main__":
    test_system()
