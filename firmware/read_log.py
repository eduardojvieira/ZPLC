import serial
import time
import sys

try:
    ser = serial.Serial('/dev/cu.usbmodem11403', 115200, timeout=0.1)
    
    # Send reboot to capture boot logs
    ser.write(b"\r\n")
    time.sleep(0.1)
    ser.write(b"kernel reboot cold\r\n")
    
    print("Reading ZPLC boot logs for 15 seconds...")
    start = time.time()
    while time.time() - start < 15:
        line = ser.readline()
        if line:
            print(line.decode(errors='replace').strip())
    ser.close()
except Exception as e:
    print(f"Failed: {e}")
