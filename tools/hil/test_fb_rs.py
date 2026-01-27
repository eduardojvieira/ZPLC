from zplc_tester import ZPLCTester
import time


def test_fb_rs():
    tester = ZPLCTester()

    print("\n--- Running Function Block Test: RS (Bistable) ---")
    st_file = "tools/hil/st_tests/test_rs.st"

    # Memory addresses from assembly:
    # 0x2000: latch (RS)
    #   0x2000: .S
    #   0x2001: .R1
    #   0x2002: .Q1
    # 0x2004: s_in
    # 0x2005: r_in
    # 0x2006: q_out
    S_IN = 0x2004
    R_IN = 0x2005
    Q_OUT = 0x2006

    # Compile once
    bytecode = tester.compile_st(st_file)
    all_pass = True

    # 1. SET: S=1, R1=0 -> Q1=1
    print("Step 1: Set (S=1, R1=0)...", end="", flush=True)
    tester.reset_state()
    time.sleep(0.5)  # Wait for reset
    tester.upload_bytecode(bytecode)
    tester.send(f"zplc dbg poke {hex(S_IN)} 1")
    tester.send(f"zplc dbg poke {hex(R_IN)} 0")
    tester.start_and_wait(duration=0.5)  # Increased duration

    q1 = tester.peek(Q_OUT, 1)[0]
    if q1 == 1:
        print("PASS ✅")
    else:
        print(f"FAIL ❌ (Q1={q1})")
        all_pass = False

    # 2. MEMORY: S=0, R1=0 -> Q1 stays 1
    print("Step 2: Memory (S=0, R1=0)...", end="", flush=True)
    tester.send("zplc stop")
    tester.send(f"zplc dbg poke {hex(S_IN)} 0")
    tester.send(f"zplc dbg poke {hex(R_IN)} 0")
    tester.send("zplc start")
    time.sleep(0.1)
    tester.send("zplc stop")

    q1 = tester.peek(Q_OUT, 1)[0]
    if q1 == 1:
        print("PASS ✅")
    else:
        print(f"FAIL ❌ (Q1={q1})")
        all_pass = False

    # 3. RESET: S=0, R1=1 -> Q1=0
    print("Step 3: Reset (S=0, R1=1)...", end="", flush=True)
    tester.send(f"zplc dbg poke {hex(S_IN)} 0")
    tester.send(f"zplc dbg poke {hex(R_IN)} 1")
    tester.send("zplc start")
    time.sleep(0.1)
    tester.send("zplc stop")

    q1 = tester.peek(Q_OUT, 1)[0]
    if q1 == 0:
        print("PASS ✅")
    else:
        print(f"FAIL ❌ (Q1={q1})")
        all_pass = False

    # 4. DOMINANCE: S=1, R1=1 -> Q1=0 (Reset dominant)
    print("Step 4: Dominance (S=1, R1=1)...", end="", flush=True)
    tester.send(f"zplc dbg poke {hex(S_IN)} 1")
    tester.send(f"zplc dbg poke {hex(R_IN)} 1")
    tester.send("zplc start")
    time.sleep(0.1)
    tester.send("zplc stop")

    q1 = tester.peek(Q_OUT, 1)[0]
    if q1 == 0:
        print("PASS ✅")
    else:
        print(f"FAIL ❌ (Q1={q1}, expected 0 - R1 should be dominant)")
        all_pass = False

    tester.close()

    print()
    if all_pass:
        print("RESULT: RS BISTABLE PASSED! ⚽️🔥🏆")
    else:
        print("RESULT: RS BISTABLE FAILED! 💀")


if __name__ == "__main__":
    test_fb_rs()
