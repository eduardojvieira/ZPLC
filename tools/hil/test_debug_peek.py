import sys
import time
from zplc_tester import ZPLCTester


def run_test():
    t = ZPLCTester()
    print("Compiling debug_var.il...")
    bytecode = t.compile_st("tools/hil/il_tests/debug_var.il")
    print(f"Bytecode: {bytearray(bytecode).hex()}")

    print("Running...")
    t.upload_bytecode(bytecode)
    t.start_and_wait(0.2)

    print("Peeking %Q0.0 (val)...")
    # Peek 2 bytes at 0x1000
    val_bytes = t.peek(0x1000, 2)
    val = val_bytes[0] + (val_bytes[1] << 8) if len(val_bytes) >= 2 else -1
    print(f"Val at 0x1000: {val} (Expected 50)")

    print("Peeking %Q2.0 (res_gt)...")
    res_bytes = t.peek(0x1002, 1)
    res = res_bytes[0] & 1 if res_bytes else -1
    print(f"Res at 0x1002: {res} (Expected 1)")

    t.close()


if __name__ == "__main__":
    run_test()
