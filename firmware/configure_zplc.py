import argparse
import os
import re
import serial
import time
from pathlib import Path


ANSI_ESCAPE = re.compile(
    r"\x1b\[[0-9;]*[mJKH]|\[8D|\[J|\[1B|\x1b\[[\d;]*m|\x1b\[[\d;]*[A-Z]"
)


def clean(line: bytes) -> str:
    return ANSI_ESCAPE.sub("", line.decode("utf-8", errors="replace")).rstrip()


def send_cmd(
    ser: serial.Serial, cmd: str, wait: float = 0.6, display_cmd: str | None = None
) -> None:
    shown = display_cmd if display_cmd is not None else cmd
    print(f"$ {shown}")
    ser.write((cmd + "\r\n").encode())
    time.sleep(wait)
    while True:
        raw = ser.readline()
        if not raw:
            break
        line = clean(raw)
        if line:
            print(line)


def shell_quote(arg: str) -> str:
    escaped = arg.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def upload_cert(
    ser: serial.Serial, kind: str, path: Path, chunk_size: int = 16
) -> None:
    data = path.read_bytes()
    send_cmd(ser, f"zplc cert begin {kind} {len(data)}", 0.8)

    offset = 0
    while offset < len(data):
        chunk = data[offset : offset + chunk_size]
        send_cmd(ser, f"zplc cert chunk {chunk.hex()}", 0.2)
        offset += len(chunk)

    send_cmd(ser, "zplc cert commit", 0.8)


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure ZPLC MQTT + certificates")
    parser.add_argument(
        "--port", default=os.getenv("ZPLC_SERIAL_PORT", "/dev/cu.usbmodem11403")
    )
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--broker", default="test.mosquitto.org")
    parser.add_argument("--mqtt-port", type=int, default=1883)
    parser.add_argument(
        "--security",
        type=int,
        default=0,
        help="0=none,1=tls-no-verify,2=tls-server-verify,3=tls-mutual",
    )
    parser.add_argument("--username", default="")
    parser.add_argument("--password", default="")
    parser.add_argument("--ca", type=Path)
    parser.add_argument("--client", type=Path)
    parser.add_argument("--key", type=Path)
    parser.add_argument("--wifi-ssid", default=os.getenv("ZPLC_WIFI_SSID", ""))
    parser.add_argument("--wifi-password", default=os.getenv("ZPLC_WIFI_PASSWORD", ""))
    parser.add_argument("--reboot", action="store_true")
    args = parser.parse_args()

    with serial.Serial(args.port, args.baud, timeout=0.5) as ser:
        print("Connected to ZPLC shell")
        time.sleep(0.5)
        ser.reset_input_buffer()

        send_cmd(ser, "")
        if args.wifi_ssid and args.wifi_password:
            send_cmd(
                ser,
                f"wifi connect -s {shell_quote(args.wifi_ssid)} -k 2 -p {shell_quote(args.wifi_password)}",
                4.0,
                display_cmd=f"wifi connect -s {shell_quote(args.wifi_ssid)} -k 2 -p <hidden>",
            )
        send_cmd(ser, f"zplc config set mqtt_broker {args.broker}")
        send_cmd(ser, f"zplc config set mqtt_port {args.mqtt_port}")
        send_cmd(ser, f"zplc config set mqtt_security {args.security}")
        send_cmd(ser, "zplc config set mqtt_enabled 1")

        if args.username:
            send_cmd(ser, f"zplc config set mqtt_username {args.username}")
        if args.password:
            send_cmd(
                ser,
                f"zplc config set mqtt_password {args.password}",
                display_cmd="zplc config set mqtt_password <hidden>",
            )

        if args.ca:
            upload_cert(ser, "ca", args.ca)
        if args.client:
            upload_cert(ser, "client", args.client)
        if args.key:
            upload_cert(ser, "key", args.key)

        send_cmd(ser, "zplc cert status")
        send_cmd(ser, "zplc config save")

        if args.reboot:
            send_cmd(ser, "kernel reboot cold")

    print("Configuration completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
