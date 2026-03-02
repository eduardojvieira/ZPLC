import serial
import time
import sys

def send_cmd(ser, cmd):
    print(f"Sending: {cmd}")
    ser.write((cmd + "\r\n").encode())
    time.sleep(0.5)
    response = ser.read_all()
    if response:
        print(f"Response: {response.decode(errors='replace')}")

try:
    ser = serial.Serial('/dev/cu.usbmodem11403', 115200, timeout=1)
    print("Connected to ZPLC shell...")
    
    send_cmd(ser, "\n")
    send_cmd(ser, "zplc config set dhcp 0")
    send_cmd(ser, "zplc config set ip 192.168.1.10")
    send_cmd(ser, "zplc config set broker 192.168.1.100")
    send_cmd(ser, "zplc config save")
    send_cmd(ser, "kernel reboot cold")
    
    ser.close()
    print("Configuration sent successfully and rebooted.")
except Exception as e:
    print(f"Failed: {e}")
