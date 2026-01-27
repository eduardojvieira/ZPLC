import serial
import time
import glob
import sys


def check_alive():
    ports = glob.glob("/dev/tty.usbmodem*")
    if not ports:
        print("No ports found")
        return

    port = ports[0]
    print(f"Opening {port}...")

    try:
        ser = serial.Serial(port, 115200, timeout=1)

        # Flush junk
        ser.reset_input_buffer()

        # Send simple Enter to wake up REPL
        print("Sending CR...")
        ser.write(b"\r\n")
        time.sleep(0.5)
        resp = ser.read_all().decode(errors="ignore")
        print(f"Response 1: {repr(resp)}")

        # Send specific command
        print("Sending 'help'...")
        ser.write(b"help\r\n")
        time.sleep(0.5)
        resp = ser.read_all().decode(errors="ignore")
        print(f"Response 2: {repr(resp)}")

        ser.close()
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    check_alive()
