from zplc_tester import ZPLCTester
import struct


def test_il_minimal():
    tester = ZPLCTester()
    il_file = "tools/hil/il_tests/minimal.il"

    print("Compiling Minimal IL...")
    bytecode = tester.compile_st(il_file)

    tester.reset_state()
    tester.upload_bytecode(bytecode)
    tester.start_and_wait(duration=0.5)

    mem = tester.peek(0x1000, 2)
    val = struct.unpack("<h", bytearray(mem))[0]

    print(f"res: {val} (Exp: 123)")

    if val == 123:
        print("PASS ✅")
    else:
        print("FAIL ❌")

    tester.close()


if __name__ == "__main__":
    test_il_minimal()
