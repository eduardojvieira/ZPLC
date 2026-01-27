from zplc_tester import ZPLCTester
import time


def test_fb_ctu():
    tester = ZPLCTester()

    print("\n--- Running Function Block Test: CTU ---")

    st_file = "tools/hil/st_tests/test_ctu.st"

    # El programa cambia 'pulse' cada ciclo de 100ms.
    # El CTU cuenta flancos ascendentes de pulse.
    # Ciclo 1: pulse=T, CU detecta flanco (CV: 0->1)
    # Ciclo 2: pulse=F, CU no detecta
    # Ciclo 3: pulse=T, CU detecta flanco (CV: 1->2)
    # Necesitamos al menos 10 ciclos (1 segundo) para llegar a CV=5.

    traces = tester.run_st(st_file, reset=True, duration=3.0)

    last_cv = 0
    q_activated = False

    print("Analyzing traces...")

    for t in traces:
        if t.get("t") == "opcode":
            op = t.get("op")
            tos = t.get("tos")

            # Use LOAD16 to see what's being read from CV
            # pc 77 in previous trace was LOAD16 0x2006 (CV)
            if op == "LOAD16" and tos is not None:
                if tos > last_cv and tos < 100:
                    last_cv = tos

            # Detect Q activation (STORE8 0x2003 or similar)
            if (op.startswith("STORE") or op.startswith("LOAD")) and tos is not None:
                val = tos & 0xFF
                if val == 1 and last_cv >= 5:
                    q_activated = True

    print(f"Final Result -> Max CV: {last_cv}, Q Activated: {q_activated}")

    if q_activated and last_cv >= 5:
        print("PASS")
    else:
        if not q_activated:
            print("FAIL: Q never activated")
        if last_cv < 5:
            print(f"FAIL: CV reached only {last_cv}")
        print("\nDEBUG: Last 20 traces:")
        for t in traces[-20:]:
            print(f"  {t}")

    tester.close()


if __name__ == "__main__":
    test_fb_ctu()
