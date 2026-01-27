from zplc_tester import ZPLCTester
import struct


def test_load_store():
    tester = ZPLCTester()
    OP = tester.OP

    # Memoria WORK empieza en 0x2000
    WORK_ADDR = 0x2000
    OPI_ADDR = 0x1000

    print("\n--- Running Load/Store Tests ---")

    # 1. STORE8 / LOAD8
    print("Test STORE8/LOAD8...", end="", flush=True)
    bytecode = [
        OP["PUSH8"],
        42,
        OP["STORE8"],
        0x00,
        0x20,  # Store 42 at 0x2000
        OP["LOAD8"],
        0x00,
        0x20,  # Load from 0x2000
        OP["HALT"],
    ]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 42:
        print("PASS")
    else:
        print("FAIL")

    # 2. STORE32 / LOAD32
    print("Test STORE32/LOAD32...", end="", flush=True)
    val = 0x12345678
    bytecode = (
        [OP["PUSH32"]]
        + list(struct.pack("<I", val))
        + [
            OP["STORE32"],
            0x10,
            0x20,  # Store at 0x2010
            OP["LOAD32"],
            0x10,
            0x20,  # Load from 0x2010
            OP["HALT"],
        ]
    )
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == val:
        print("PASS")
    else:
        print("FAIL")

    # 3. STOREI32 / LOADI32 (Indirect)
    print("Test Indirect access...", end="", flush=True)
    # [addr val STOREI32]
    bytecode = [
        OP["PUSH16"],
        0x20,
        0x20,  # Addr 0x2020
        OP["PUSH8"],
        99,
        OP["STOREI32"],
        OP["PUSH16"],
        0x20,
        0x20,
        OP["LOADI32"],
        OP["HALT"],
    ]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 99:
        print("PASS")
    else:
        print("FAIL")

    # 4. OPI Write
    print("Test OPI Write...", end="", flush=True)
    # PUSH8 0xAA, STORE8 0x1000, LOAD8 0x1000, HALT
    bytecode = [
        OP["PUSH8"],
        0xAA,
        OP["STORE8"],
        0x00,
        0x10,
        OP["LOAD8"],
        0x00,
        0x10,
        OP["HALT"],
    ]
    if tester.get_last_tos(tester.run_bytecode(bytecode)) == 0xAA:
        print("PASS")
    else:
        print("FAIL")

    tester.close()


if __name__ == "__main__":
    test_load_store()
