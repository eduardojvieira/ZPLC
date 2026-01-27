import serial
import time
import glob


def rescue():
    ports = glob.glob("/dev/tty.usbmodem*")
    if not ports:
        print("No ports found")
        return

    port = ports[0]
    print(f"Attemping rescue on {port}...")

    try:
        ser = serial.Serial(port, 115200, timeout=0.5)

        # Spam Ctrl+C and Enter
        for _ in range(5):
            ser.write(b"\x03\r\n")
            time.sleep(0.1)

        # Try stop command
        ser.write(b"zplc stop\r\n")
        time.sleep(0.5)

        resp = ser.read_all().decode(errors="ignore")
        print(f"Rescue Response: {repr(resp)}")

        if "zplc" in resp or "OK" in resp:
            print("ALIVE! Device responded.")
        else:
            print("DEAD. Device is unresponsive.")

        ser.close()
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    rescue()
