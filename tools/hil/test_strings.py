from zplc_tester import ZPLCTester
import struct


def test_strings():
    tester = ZPLCTester()
    OP = tester.OP

    # WORK memory for strings
    STR1 = 0x2100
    STR2 = 0x2200

    print("\n--- Running String Operations Tests ---")

    # 1. STRLEN
    # Header for "Hello": len=5, cap=10
    print("Test STRLEN...", end="", flush=True)
    header = struct.pack("<HH", 5, 10)
    data = b"Hello\0"
    bytecode = [
        OP["PUSH16"],
        STR1 & 0xFF,
        (STR1 >> 8) & 0xFF,
        OP["PUSH8"],
        42,  # Trash
        OP["DROP"],
        OP["STRLEN"],
        OP["HALT"],
    ]
    # Necesitamos inicializar la memoria con el string
    tester.reset_state()
    # Poke memory for string header and data
    tester.send(f"zplc dbg poke {STR1} {header[0]}")
    tester.send(f"zplc dbg poke {STR1 + 1} {header[1]}")
    tester.send(f"zplc dbg poke {STR1 + 2} {header[2]}")
    tester.send(f"zplc dbg poke {STR1 + 3} {header[3]}")
    for i, b in enumerate(data):
        tester.send(f"zplc dbg poke {STR1 + 4 + i} {b}")

    traces = tester.run_bytecode(bytecode, reset=False)
    if tester.get_last_tos(traces) == 5:
        print("PASS")
    else:
        print(f"FAIL (tos={tester.get_last_tos(traces)})")

    # 2. STRCPY
    print("Test STRCPY...", end="", flush=True)
    # STR1: "ZPLC" (len 4, cap 10)
    # STR2: empty (len 0, cap 10)
    tester.reset_state()
    # Init STR1
    header1 = struct.pack("<HH", 4, 10)
    for i in range(4):
        tester.send(f"zplc dbg poke {STR1 + i} {header1[i]}")
    for i, b in enumerate(b"ZPLC\0"):
        tester.send(f"zplc dbg poke {STR1 + 4 + i} {b}")
    # Init STR2
    header2 = struct.pack("<HH", 0, 10)
    for i in range(4):
        tester.send(f"zplc dbg poke {STR2 + i} {header2[i]}")

    bytecode = [
        OP["PUSH16"],
        STR1 & 0xFF,
        (STR1 >> 8) & 0xFF,  # src
        OP["PUSH16"],
        STR2 & 0xFF,
        (STR2 >> 8) & 0xFF,  # dst
        OP["STRCPY"],
        OP["PUSH16"],
        STR2 & 0xFF,
        (STR2 >> 8) & 0xFF,
        OP["STRLEN"],
        OP["HALT"],
    ]
    if tester.get_last_tos(tester.run_bytecode(bytecode, reset=False)) == 4:
        print("PASS")
    else:
        print("FAIL")

    # 3. STRCMP
    print("Test STRCMP...", end="", flush=True)
    # AAA vs BBB
    bytecode = [
        OP["PUSH16"],
        STR1 & 0xFF,
        (STR1 >> 8) & 0xFF,
        OP["PUSH16"],
        STR2 & 0xFF,
        (STR2 >> 8) & 0xFF,
        OP["STRCMP"],
        OP["HALT"],
    ]
    # Init strings
    tester.reset_state()
    h = struct.pack("<HH", 3, 10)
    for i in range(4):
        tester.send(f"zplc dbg poke {STR1 + i} {h[i]}")
        tester.send(f"zplc dbg poke {STR2 + i} {h[i]}")
    for i, b in enumerate(b"AAA\0"):
        tester.send(f"zplc dbg poke {STR1 + 4 + i} {b}")
    for i, b in enumerate(b"BBB\0"):
        tester.send(f"zplc dbg poke {STR2 + 4 + i} {b}")

    tos = tester.get_last_tos(tester.run_bytecode(bytecode, reset=False))

    # "AAA" < "BBB" -> -1 (0xFFFFFFFF)
    if tos == 4294967295 or tos == -1:
        print("PASS")
    else:
        print(f"FAIL (tos={tos})")

    tester.close()


if __name__ == "__main__":
    test_strings()
