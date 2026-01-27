from zplc_tester import ZPLCTester
import struct
import os


def test_process():
    tester = ZPLCTester()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    st_file = os.path.join(script_dir, "st_tests", "process_test.st")

    print("\n====================================================")
    print("          ZPLC Process Control HIL TEST             ")
    print("====================================================")

    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"Compilation failed: {e}")
        return False

    tester.upload_bytecode(bytecode)
    print("Running for 2.0 seconds...")
    tester.start_and_wait(duration=2.0)

    # Read block from 0x2000
    mem = tester.peek(0x2000, 256)

    def get_bool(offset):
        return mem[offset] > 0

    def get_real(offset):
        return struct.unpack("<f", bytearray(mem[offset : offset + 4]))[0]

    def get_int(offset):
        return struct.unpack("<h", bytearray(mem[offset : offset + 2]))[0]

    hyst_q = get_bool(0x14)
    db_out = get_real(0x2C)
    lag_out = get_real(0x44)
    ramp_out = get_real(0x5C)
    pid_out = get_real(0x98)
    cycle = get_int(0x9C)

    print(f"Cycles executed: {cycle}")
    print(f"HYSTERESIS Q: {hyst_q}")
    print(f"DEADBAND OUT: {db_out:.4f}")
    print(f"LAG OUT: {lag_out:.4f}")
    print(f"RAMP OUT: {ramp_out:.4f}")
    print(f"PID OUT: {pid_out:.4f}")

    all_pass = True

    # PID Check: Error=10, KP=2 -> 20.0
    if abs(pid_out - 20.0) < 0.1:
        print("PID Test: PASS ✅")
    else:
        print(f"PID Test: FAIL ❌ (Expected 20.0, got {pid_out})")
        all_pass = False

    # LAG Check: Converges to 100
    if lag_out > 90.0:
        print("LAG Test: PASS ✅")
    else:
        print(f"LAG Test: FAIL ❌ (Expected >90, got {lag_out})")
        all_pass = False

    tester.close()
    return all_pass


if __name__ == "__main__":
    test_process()
