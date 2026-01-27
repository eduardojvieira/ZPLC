import serial
import time
import glob


def rescue():
    ports = glob.glob("/dev/tty.usbmodem*")
    if not ports:
        print("No ports found")
        return

    port = ports[0]
    print(f"Opening {port}")

    try:
        ser = serial.Serial(port, 115200, timeout=0.1)

        print("Sending break...")
        ser.send_break(duration=0.25)

        print("Sending stops...")
        for _ in range(10):
            ser.write(b"zplc stop\r\n")
            time.sleep(0.1)
            resp = ser.read_all()
            if resp:
                print(f"Response: {resp}")

        print("Sending reset...")
        ser.write(b"zplc reset\r\n")
        time.sleep(0.5)
        print(ser.read_all())

        ser.close()
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    rescue()
