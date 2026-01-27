import sys
import os
import time

# Add tools/hil to path
sys.path.append(os.path.join(os.getcwd(), "tools", "hil"))

from language_tester import LanguageTester


def debug_il_test():
    print("DEBUG: Iniciando test simple de IL...")

    try:
        tester = LanguageTester()
        print("DEBUG: Tester inicializado, puerto abierto.")

        # Reset device first
        print("DEBUG: Reseteando dispositivo...")
        tester.reset_state()
        print("DEBUG: Dispositivo reseteado.")

        il_file = "tools/hil/il_tests/arithmetic.il"
        print(f"DEBUG: Compilando y corriendo {il_file}...")

        # Run manually to see steps
        bytecode = tester.compile_st(il_file)
        print(f"DEBUG: Compilado ({len(bytecode)} bytes). Subiendo...")

        tester.upload_bytecode(bytecode)
        print("DEBUG: Bytecode subido.")

        print("DEBUG: Iniciando ejecucion (0.5s)...")
        tester.start_and_wait(duration=0.5)
        print("DEBUG: Ejecucion finalizada.")

        # Check values
        print("DEBUG: Verificando memoria...")
        val_a = tester.expect_int16(0, 10, "a")
        val_res = tester.expect_int16(4, 15, "res_add")

        tester.close()
        print("DEBUG: Test finalizado.")

    except Exception as e:
        print(f"ERROR FATAL: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    debug_il_test()
