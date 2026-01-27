from zplc_tester import ZPLCTester
import struct


def test_push():
    tester = ZPLCTester()
    OP = tester.OP

    print("\n--- Running Push Variant Tests ---")

    # 1. PUSH8 (Signed 127)
    print("Test PUSH8 (127)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 127, OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 127:
        print("PASS")
    else:
        print("FAIL")

    # 2. PUSH8 (Signed -128)
    print("Test PUSH8 (-128)...", end="", flush=True)
    bytecode = [OP["PUSH8"], 0x80, OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if tos == 4294967168 or tos == -128:
        print("PASS")
    else:
        print(f"FAIL (tos={tos})")

    # 3. PUSH16 (Signed 32767)
    print("Test PUSH16 (32767)...", end="", flush=True)
    # Little-endian: 0xFF 0x7F
    bytecode = [OP["PUSH16"], 0xFF, 0x7F, OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 32767:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(tester.run_bytecode(bytecode))})")

    # 4. PUSH16 (Signed -32768)
    print("Test PUSH16 (-32768)...", end="", flush=True)
    # Little-endian: 0x00 0x80
    bytecode = [OP["PUSH16"], 0x00, 0x80, OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if tos == 4294934528 or tos == -32768:
        print("PASS")
    else:
        print(f"FAIL (tos={tos})")

    # 5. PUSH32 (Max Int)
    print("Test PUSH32 (0x7FFFFFFF)...", end="", flush=True)
    val = 0x7FFFFFFF
    bytecode = [OP["PUSH32"]] + list(struct.pack("<I", val)) + [OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == val:
        print("PASS")
    else:
        print(f"FAIL")

    # 6. PUSH32 (-1)
    print("Test PUSH32 (-1)...", end="", flush=True)
    val = 0xFFFFFFFF
    bytecode = [OP["PUSH32"]] + list(struct.pack("<I", val)) + [OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if tos == 0xFFFFFFFF or tos == -1:
        print("PASS")
    else:
        print(f"FAIL (tos={tos})")

    tester.close()


if __name__ == "__main__":
    test_push()
