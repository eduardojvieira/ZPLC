import serial
import time

ser = serial.Serial("/dev/tty.usbmodem101", 115200, timeout=1)
time.sleep(1)


def send(cmd):
    print(f"SEND: {cmd}")
    ser.write(f"{cmd}\r\n".encode())
    time.sleep(0.1)


send("zplc stop")
send("zplc reset")
send("zplc hil mode verbose")
send("zplc load 4")
send("zplc data 00000001")  # NOP, NOP, NOP, HALT
send("zplc start")

print("READING (5s)...")
start = time.time()
while time.time() - start < 5:
    line = ser.readline().decode("utf-8", errors="ignore").strip()
    if line:
        print(f"RECV: {line}")

ser.close()
