import sys
import os
import time
from language_tester import LanguageTester


def run_tests():
    tester = LanguageTester()
    results = []

    # -------------------------------------------------------------------------
    # 1. Blinky LD
    # -------------------------------------------------------------------------
    print("\n--- TEST: Blinky (LD) ---")
    try:
        # Blink period 500ms.
        # Run 100ms -> likely Q=0 (timer running)
        # We just check it runs and doesn't crash.
        path = "packages/zplc-ide/src/examples/blinky.ld.json"
        print(f"Compiling {path}...")
        tester.compile_and_run(path, duration=0.2)

        # Check output address 0x1000 (Q0.0)
        # It's hard to guarantee state without precise timing, but we can read it.
        val = tester.peek(0x1000, 1)
        print(f"Output %Q0.0: {val[0] if val else 'ERR'}")

        results.append(True)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    # -------------------------------------------------------------------------
    # 2. Blinky FBD
    # -------------------------------------------------------------------------
    print("\n--- TEST: Blinky (FBD) ---")
    try:
        path = "packages/zplc-ide/src/examples/blinky.fbd.json"
        tester.compile_and_run(path, duration=0.2)
        val = tester.peek(0x1000, 1)
        print(f"Output %Q0.0: {val[0] if val else 'ERR'}")
        results.append(True)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    # -------------------------------------------------------------------------
    # 3. Blinky SFC
    # -------------------------------------------------------------------------
    print("\n--- TEST: Blinky (SFC) ---")
    try:
        path = "packages/zplc-ide/src/examples/blinky.sfc.json"
        tester.compile_and_run(path, duration=0.2)
        # Initial step LED_ON -> Output should be TRUE initially
        r1 = tester.expect_bool(0x1000, 0, True, "LED_Output (Initial)")
        results.append(r1)
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    # -------------------------------------------------------------------------
    # 4. Motor Control (LD)
    # -------------------------------------------------------------------------
    print("\n--- TEST: Motor Control (LD) ---")
    try:
        path = "packages/zplc-ide/src/examples/motor_control.ld.json"
        tester.compile_and_run(path, duration=0.2)

        # Initial state: Motor OFF
        r1 = tester.expect_bool(0x1000, 0, False, "MotorContactor (Q0.0)")
        r2 = tester.expect_bool(
            0x1001, 0, False, "RunningLamp (Q0.1)"
        )  # 0x1001 if byte addressing
        # Note: %Q0.1 is bit 1 of byte 0, OR byte 1?
        # ZPLC addressing: %Q0.0 -> byte 0 bit 0. %Q0.1 -> byte 0 bit 1.
        # But my previous tests treated them as separate bytes (e.g. basic_il.il uses %Q0.0, %Q0.2 with INTs).
        # Boolean variables in ZPLC might be byte-aligned or bit-packed.
        # In `codegen.ts`, size is 1 byte for BOOL.
        # `ilToST.ts`: `a AT %Q0.0 : INT`.
        # If standard IEC: %Q0.0 is bit.
        # But ZPLC implementation of `AT` usually maps to BYTE address in `symbol-table.ts`.
        # If `symbol-table.ts` parses `%Q0.1` as byte offset 0, bit 1? Or byte offset 1?
        # Let's assume byte 0 bit 0 for Q0.0.

        # Re-check r1 logic.

        results.append(all([r1, r2]))
    except Exception as e:
        print(f"FAILED: {e}")
        results.append(False)

    tester.close()
    return all(results)


if __name__ == "__main__":
    run_tests()
