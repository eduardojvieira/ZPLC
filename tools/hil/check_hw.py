import serial
import time
import sys


def check_connection():
    try:
        ser = serial.Serial("/dev/tty.usbmodem1101", 115200, timeout=1)
        print("Port opened. Waiting 2s...")
        time.sleep(2)

        print("Sending wakeup CRs...")
        ser.write(b"\r\n\r\n")
        time.sleep(0.5)
        ser.reset_input_buffer()

        print("Sending help...")
        ser.write(b"help\r\n")
        time.sleep(1.0)

        resp = ser.read_all().decode("utf-8", errors="ignore")
        print(f"Response len: {len(resp)}")
        print(f"Response: {resp[:100]}...")

        ser.close()
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    check_connection()
