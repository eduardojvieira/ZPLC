from zplc_tester import ZPLCTester


def test_errors():
    tester = ZPLCTester()
    OP = tester.OP

    ERR = {
        "OK": 0,
        "STACK_OVERFLOW": 1,
        "STACK_UNDERFLOW": 2,
        "DIV_BY_ZERO": 3,
        "INVALID_OPCODE": 4,
    }

    print("\n--- Running Error Condition Tests ---")

    # 1. DIV BY ZERO (Int)
    print("Test DIV by Zero (Int)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 10, OP["PUSH8"], 0, OP["DIV"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    err = next((t for t in traces if t.get("t") == "error"), {})
    if err.get("code") == ERR["DIV_BY_ZERO"]:
        print("PASS")
    else:
        print(f"FAIL (err={err.get('code')})")

    # 2. STACK UNDERFLOW
    print("Test Stack Underflow...", end="", flush=True)
    bytecode = [OP["DROP"], OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    err = next((t for t in traces if t.get("t") == "error"), {})
    if err.get("code") == ERR["STACK_UNDERFLOW"]:
        print("PASS")
    else:
        print(f"FAIL (err={err.get('code')})")
        print(f"DEBUG: Traces: {traces}")

    # 3. STACK OVERFLOW
    print("Test Stack Overflow...", end="", flush=True)
    bytecode = [OP["PUSH8"], 1] * 260 + [OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    err = next((t for t in traces if t.get("t") == "error"), {})
    if err.get("code") == ERR["STACK_OVERFLOW"]:
        print("PASS")
    else:
        print(f"FAIL (err={err.get('code')})")

    # 4. INVALID OPCODE
    print("Test Invalid Opcode...", end="", flush=True)
    bytecode = [0xFE, OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    err = next((t for t in traces if t.get("t") == "error"), {})
    if err.get("code") == ERR["INVALID_OPCODE"]:
        print("PASS")
    else:
        print(f"FAIL (err={err.get('code')})")
        print(f"DEBUG: Traces: {traces}")

    tester.close()


if __name__ == "__main__":
    test_errors()
