import sys
import os
import time

# Add tools/hil to path
sys.path.append(os.path.join(os.getcwd(), "tools", "hil"))

from language_tester import LanguageTester


def debug_minimal_test():
    print("DEBUG: Iniciando test MINIMAL de IL...")

    try:
        tester = LanguageTester()
        print("DEBUG: Tester inicializado.")

        tester.reset_state()
        print("DEBUG: Reset OK.")

        il_file = "tools/hil/il_tests/minimal.il"
        print(f"DEBUG: Compilando {il_file}...")

        bytecode = tester.compile_st(il_file)
        print(f"DEBUG: Compilado ({len(bytecode)} bytes).")

        tester.upload_bytecode(bytecode)
        print("DEBUG: Bytecode subido. Ejecutando...")

        tester.start_and_wait(duration=1.0)
        print("DEBUG: Ejecucion finalizada.")

        # Check result
        print("DEBUG: Verificando resultado (esperado 123)...")
        val = tester.peek(0, 2)  # Read 2 bytes at offset 0
        if len(val) == 2:
            int_val = val[0] + (val[1] << 8)
            print(f"DEBUG: Leido: {int_val}")
            if int_val == 123:
                print("PASS: Test minimal paso!")
            else:
                print(f"FAIL: Valor incorrecto {int_val}")
        else:
            print(f"FAIL: Lectura incompleta {val}")

        tester.close()

    except Exception as e:
        print(f"ERROR FATAL: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    debug_minimal_test()
