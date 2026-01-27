import sys
import os
import time
import serial


def debug_memory():
    print("DEBUG: Iniciando test de memoria...")

    try:
        ser = serial.Serial("/dev/tty.usbmodem101", 115200, timeout=2)
        print("DEBUG: Puerto abierto.")

        # Reset input buffer
        ser.reset_input_buffer()
        ser.write(b"\r\n")
        time.sleep(0.5)

        # Test Poke
        print("DEBUG: Pokeando 0x12 en direccion 0 (IPI)...")
        ser.write(b"zplc dbg poke 0 18\r\n")  # 18 = 0x12
        time.sleep(0.5)
        resp = ser.read_all().decode("utf-8", errors="ignore")
        print(f"DEBUG: Poke resp: [{resp.strip()}]")

        # Test Peek
        print("DEBUG: Leyendo direccion 0...")
        ser.write(b"zplc dbg peek 0 1\r\n")
        time.sleep(0.5)
        resp = ser.read_all().decode("utf-8", errors="ignore")
        print(f"DEBUG: Peek resp:\n{resp}")

        if "12" in resp:
            print("PASS: Poke/Peek funciono correctamente")
        else:
            print("FAIL: No se leyo el valor esperado")

        ser.close()

    except Exception as e:
        print(f"ERROR: {e}")


if __name__ == "__main__":
    debug_memory()
