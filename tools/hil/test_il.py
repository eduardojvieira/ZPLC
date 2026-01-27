from zplc_tester import ZPLCTester
import struct


def test_il():
    tester = ZPLCTester()
    print("\n====================================================")
    print("          ZPLC IL LANGUAGE HIL TEST                 ")
    print("====================================================")

    # 0x1000: a (INT) = 10
    # 0x1002: b (INT) = 20
    # 0x1004: res (INT) = 30
    # 0x1006: flag (BOOL) = 1

    il_file = "tools/hil/il_tests/basic_il.il"

    print("Compiling IL -> ST -> Bytecode...")
    try:
        bytecode = tester.compile_st(il_file)
    except Exception as e:
        print(f"Compilation Error: {e}")
        return

    tester.reset_state()
    tester.upload_bytecode(bytecode)

    print("Running...")
    tester.start_and_wait(duration=0.5)

    print("Peeking memory...")
    mem = tester.peek(0x1000, 7)

    if len(mem) < 7:
        print("FAIL: Incomplete read")
        return

    val_a = struct.unpack("<h", bytearray(mem[0:2]))[0]
    val_b = struct.unpack("<h", bytearray(mem[2:4]))[0]
    val_res = struct.unpack("<h", bytearray(mem[4:6]))[0]
    val_flag = mem[6]

    print(f"a: {val_a} (Exp: 10)")
    print(f"b: {val_b} (Exp: 20)")
    print(f"res: {val_res} (Exp: 30)")
    print(f"flag: {val_flag} (Exp: 1)")

    if val_res == 30 and val_flag == 1:
        print("RESULT: IL TEST PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: IL TEST FAILED! 💀")

    tester.close()


if __name__ == "__main__":
    test_il()
