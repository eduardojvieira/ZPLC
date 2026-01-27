from zplc_tester import ZPLCTester
import struct


def test_conversion():
    tester = ZPLCTester()
    OP = tester.OP

    print("\n--- Running Type Conversion Tests ---")

    # 1. I2F: 42 -> 42.0 (0x42280000)
    print("Test I2F...", end="", flush=True)
    bytecode = [OP["PUSH8"], 42, OP["I2F"], OP["HALT"]]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    # 42.0 in IEEE754 hex is 0x42280000
    if tos == 0x42280000:
        print("PASS")
    else:
        print(f"FAIL (tos={hex(tos) if tos else None})")

    # 2. F2I: 42.0 -> 42
    print("Test F2I...", end="", flush=True)
    bytecode = [OP["PUSH32"], 0x00, 0x00, 0x28, 0x42, OP["F2I"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 42:
        print("PASS")
    else:
        print("FAIL")

    # 3. I2B: 42 -> 1, 0 -> 0
    print("Test I2B...", end="", flush=True)
    bytecode = [OP["PUSH8"], 42, OP["I2B"], OP["HALT"]]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 1:
        bytecode = [OP["PUSH8"], 0, OP["I2B"], OP["HALT"]]
        if tester.get_last_tos(tester.run_bytecode(bytecode)) == 0:
            print("PASS")
        else:
            print("FAIL (0->1)")
    else:
        print("FAIL (42->0)")

    # 4. EXT8: 0x80 -> 0xFFFFFFAA? No, let's use 0x80 (-128)
    print("Test EXT8...", end="", flush=True)
    # PUSH8 already sign-extends to 32 bits, so we need to put a byte in memory
    # then LOAD8 it (which zero-extends) then EXT8 it.
    bytecode = [
        OP["PUSH8"],
        0x80,
        OP["STORE8"],
        0x00,
        0x20,  # Store 0x80 at 0x2000
        OP["LOAD8"],
        0x00,
        0x20,  # Load 0x80 (becomes 0x00000080 in stack)
        OP["EXT8"],  # EXT8 (becomes 0xFFFFFF80)
        OP["HALT"],
    ]
    tos = tester.get_last_tos(tester.run_bytecode(bytecode))
    if tos == 0xFFFFFF80 or tos == -128:
        print("PASS")
    else:
        print(f"FAIL (tos={hex(tos) if tos else None})")

    # 5. ZEXT8: 0x80 -> 0x00000080
    print("Test ZEXT8...", end="", flush=True)
    bytecode = [
        OP["PUSH8"],
        0x80,  # This is already problematic as PUSH8 sign-extends
        # Let's use bitwise to clear it
        OP["PUSH32"],
        0xFF,
        0x00,
        0x00,
        0x00,
        OP["AND"],  # Now we have 0x00000080
        OP["ZEXT8"],
        OP["HALT"],
    ]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 0x80:
        print("PASS")
    else:
        print("FAIL")

    tester.close()


if __name__ == "__main__":
    test_conversion()
