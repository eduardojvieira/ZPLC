from zplc_tester import ZPLCTester
import time


def test_fb_ton():
    tester = ZPLCTester()

    print("\n--- Running Function Block Test: TON ---")

    st_file = "tools/hil/st_tests/test_ton.st"

    # 1. Compilar y subir el programa ST
    # Corremos por 5 segundos para estar sobrados
    traces = tester.run_st(st_file, reset=True, duration=5.0)

    last_et = 0
    q_activated = False

    print("Analyzing traces...")

    for t in traces:
        if t.get("t") == "opcode":
            op = t.get("op")
            tos = t.get("tos")
            pc = t.get("pc")

            if op == "STORE32" and tos is not None and 0 < tos < 10000:
                if tos > last_et:
                    last_et = tos

            # Detect Q activation
            # If op is LOAD32/STORE8, 'tos' might contain garbage in high bits.
            # We only care about the lowest byte for BOOLs.
            if (op.startswith("STORE") or op.startswith("LOAD")) and tos is not None:
                val = tos & 0xFF
                if val == 1:
                    # Only count as Q if we already saw some time pass
                    if last_et > 0:
                        q_activated = True

    print(f"Final Result -> Max ET: {last_et} ms, Q Activated: {q_activated}")

    if q_activated and last_et >= 200:
        print("PASS")
    else:
        if not q_activated:
            print("FAIL: Q never activated")
        if last_et < 200:
            print(f"FAIL: ET reached only {last_et} ms")
        print("\nDEBUG: Last 20 traces:")
        for t in traces[-20:]:
            print(f"  {t}")

    tester.close()


if __name__ == "__main__":
    test_fb_ton()
