#!/usr/bin/env python3
from __future__ import annotations

import argparse
import glob
import os
import time

import serial


def autodetect_port() -> str:
    ports = sorted(glob.glob("/dev/tty.usbmodem*"))
    if not ports:
        ports = sorted(glob.glob("/dev/cu.usbmodem*"))
    if not ports:
        raise RuntimeError("No USB modem serial port found")
    ports.sort(key=os.path.getmtime, reverse=True)
    return ports[0]


def clean(raw: bytes) -> str:
    return raw.decode("utf-8", errors="ignore").strip()


def send_cmd(
    ser: serial.Serial, cmd: str, wait: float = 0.5, read_s: float = 2.0
) -> list[str]:
    ser.write((cmd + "\r\n").encode())
    time.sleep(wait)
    deadline = time.time() + read_s
    lines: list[str] = []
    while time.time() < deadline:
        raw = ser.readline()
        if not raw:
            continue
        line = clean(raw)
        if line:
            lines.append(line)
    return lines


def wait_for_shell(ser: serial.Serial, timeout_s: float = 20.0) -> None:
    deadline = time.time() + timeout_s
    seen: list[str] = []
    while time.time() < deadline:
        out = send_cmd(ser, "zplc version", wait=0.4, read_s=1.2)
        if any("ZPLC Runtime v" in line for line in out):
            return
        seen.extend(out[-5:])
        time.sleep(0.3)
    raise RuntimeError("Timed out waiting for shell: " + " | ".join(seen[-10:]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs="+")
    parser.add_argument("--port", default=None)
    parser.add_argument("--baud", type=int, default=115200)
    args = parser.parse_args()

    port = args.port or autodetect_port()
    with serial.Serial(port, args.baud, timeout=0.25) as ser:
        time.sleep(1.0)
        wait_for_shell(ser)
        cmd = " ".join(args.command)
        lines = send_cmd(ser, cmd, wait=0.4, read_s=2.5)
        for line in lines:
            print(line)


if __name__ == "__main__":
    main()
