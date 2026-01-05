import serial
import time
import sys
import os

PORT = '/dev/cu.usbmodem11401'
BAUD = 115200

def upload(hex_file, port):
    if not os.path.exists(hex_file):
        print(f"Error: {hex_file} not found")
        return

    with open(hex_file, 'r') as f:
        hex_data = f.read().strip()

    total_size = len(hex_data) // 2
    print(f"Uploading {hex_file} ({total_size} bytes) to {port}...")

    ser = serial.Serial(port, BAUD, timeout=1)
    time.sleep(1) # Wait for serial to stabilize
    
    # 0. Stop current execution if any
    print("Stopping ZPLC...")
    ser.write(b'zplc stop\r\n')
    time.sleep(0.5)
    
    # 1. Load command
    cmd = f'zplc load {total_size}\r\n'
    print(f"Sending: {cmd.strip()}")
    ser.write(cmd.encode())
    time.sleep(0.5)
    
    # 2. Send data in chunks
    chunk_size = 64
    for i in range(0, len(hex_data), chunk_size):
        chunk = hex_data[i:i+chunk_size]
        cmd = f'zplc data {chunk}\r\n'
        print(f"Uploading chunk {i//chunk_size + 1}: {chunk[:10]}...")
        ser.write(cmd.encode())
        time.sleep(0.1)
        
    # 3. Start command
    print("Starting ZPLC...")
    ser.write(b'zplc start\r\n')
    time.sleep(0.5)
    
    # Read response
    while ser.in_waiting:
        line = ser.readline().decode().strip()
        print(f"PICO: {line}")
        
    ser.close()
    print("Upload complete!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python upload.py <hex_file> [port]")
    else:
        hex_file = sys.argv[1]
        port = sys.argv[2] if len(sys.argv) > 2 else '/dev/cu.usbmodem11401'
        upload(hex_file, port)
