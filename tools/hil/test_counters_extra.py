from zplc_tester import ZPLCTester
import struct
import os
import time


def test_counters():
    tester = ZPLCTester()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    st_file = os.path.join(script_dir, "st_tests", "counters_extra.st")

    print("\n====================================================")
    print("          ZPLC Counters Extra (CTD, CTUD) TEST      ")
    print("====================================================")

    try:
        bytecode = tester.compile_st(st_file)
    except Exception as e:
        print(f"Compilation failed: {e}")
        return False

    tester.upload_bytecode(bytecode)
    print("Running for 3.0 seconds...")
    tester.start_and_wait(duration=3.0)

    # Offsets based on manual calculation:
    # myCtd @ 0x2000
    # cv_ctd @ 0x200E
    # myCtud @ 0x2010
    # cv_ud @ 0x2024 (approx, assuming packed/aligned)

    # Read block from 0x2000
    mem = tester.peek(0x2000, 64)

    def get_int(offset):
        return struct.unpack("<h", bytearray(mem[offset : offset + 2]))[0]

    def get_bool(offset):
        return mem[offset] > 0

    # Verify CTD
    # Started at 5. 3 pulses down -> 2.
    val_cv_ctd = get_int(0x0E)  # 0x200E
    print(f"CTD CV: {val_cv_ctd} (Expected 2)")

    # Verify CTUD
    # Started at 0. Reset at start.
    # Logic in ST generates pulses based on cycles.
    # We can't predict exact number without simulation, but should be > 0
    val_cv_ud = get_int(0x24)  # 0x2024
    print(f"CTUD CV: {val_cv_ud}")

    if val_cv_ctd == 2:
        print("CTD Test: PASS ✅")
    else:
        print(f"CTD Test: FAIL ❌ (Expected 2, got {val_cv_ctd})")

    if val_cv_ud > 0:
        print("CTUD Test: PASS ✅ (CV > 0)")
    else:
        print(f"CTUD Test: WARN/FAIL (CV={val_cv_ud}, expected > 0 if pulses worked)")

    tester.close()


if __name__ == "__main__":
    test_counters()
