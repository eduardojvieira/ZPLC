from zplc_tester import ZPLCTester
import struct


def test_control_flow():
    tester = ZPLCTester()
    OP = tester.OP

    print("\n--- Running Control Flow Tests ---")

    # 1. JMP (Absolute)
    # 0: PUSH8 10
    # 2: JMP 6
    # 5: PUSH8 20 (skipped)
    # 7: HALT
    print("Test JMP (Absolute)...", end="", flush=True)
    bytecode = [
        OP["PUSH8"],
        10,
        OP["JMP"],
        0x07,
        0x00,  # Jump to offset 7
        OP["PUSH8"],
        20,
        OP["HALT"],
    ]
    traces = tester.run_bytecode(bytecode)
    # Stack should only have 10
    if tester.get_last_tos(traces) == 10 and tester.get_last_sp(traces) == 1:
        print("PASS")
    else:
        print(
            f"FAIL (tos={tester.get_last_tos(traces)}, sp={tester.get_last_sp(traces)})"
        )

    # 2. JR (Relative)
    # 0: PUSH8 30
    # 2: JR 2 (Skip next instruction, which is 2 bytes long)
    # 4: PUSH8 40
    # 6: HALT
    print("Test JR (Relative)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 30, OP["JR"], 0x02, OP["PUSH8"], 40, OP["HALT"]]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 30 and tester.get_last_sp(traces) == 1:
        print("PASS")
    else:
        print(f"FAIL")

    # 3. JZ (Jump if Zero) - Taken
    print("Test JZ (Taken)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 0, OP["JZ"], 0x07, 0x00, OP["PUSH8"], 99, OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 0:
        print("PASS")
    else:
        print("FAIL")

    # 4. JZ (Jump if Zero) - Not Taken
    print("Test JZ (Not Taken)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 1, OP["JZ"], 0x07, 0x00, OP["PUSH8"], 99, OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 99:
        print("PASS")
    else:
        print("FAIL")

    # 5. CALL / RET
    # 0: CALL 5
    # 3: HALT
    # 4: NOP (padding)
    # 5: PUSH8 42
    # 7: RET
    print("Test CALL/RET...", end="", flush=True)
    bytecode = [
        OP["CALL"],
        0x05,
        0x00,
        OP["HALT"],
        OP["NOP"],
        OP["PUSH8"],
        42,
        OP["RET"],
    ]
    traces = tester.run_bytecode(bytecode)
    if tester.get_last_tos(traces) == 42:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    tester.close()


if __name__ == "__main__":
    test_control_flow()
