import serial
import time

ser = serial.Serial("/dev/tty.usbmodem101", 115200, timeout=1)
time.sleep(1)


def send(cmd):
    print(f"SEND: {cmd}")
    ser.write(f"{cmd}\r\n".encode())
    time.sleep(0.5)
    resp = ser.read(ser.in_waiting).decode("utf-8", errors="ignore")
    print(f"RECV: {resp}")
    return resp


send("zplc stop")
send(
    "zplc dbg poke 0x1000 0xAA"
)  # Intentamos escribir en OPI (debería fallar o ser ignorado)
send("zplc dbg poke 0 0xBB")  # Intentamos escribir en IPI
send("zplc dbg peek 0 16")
send("zplc dbg peek 0x1000 16")

ser.close()
