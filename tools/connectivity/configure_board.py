#!/usr/bin/env python3
from __future__ import annotations

import argparse
import glob
import os
import socket
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


def detect_host_ip() -> str:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    finally:
        probe.close()


def clean(raw: bytes) -> str:
    return raw.decode("utf-8", errors="ignore").strip()


def send_cmd(
    ser: serial.Serial, cmd: str, wait: float = 0.4, read_s: float = 1.5
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
    while time.time() < deadline:
        out = send_cmd(ser, "zplc version", wait=0.3, read_s=1.0)
        if any("ZPLC Runtime v" in line for line in out):
            return
        time.sleep(0.2)
    raise RuntimeError("Timed out waiting for shell")


def shell_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def apply_commands(ser: serial.Serial, commands: list[str]) -> None:
    for cmd in commands:
        print(f"[board] {cmd}")
        out = send_cmd(ser, cmd, wait=0.35, read_s=1.5)
        for line in out:
            print(f"  {line}")


def build_event_grid_commands(host_ip: str) -> list[str]:
    return [
        "zplc config set mqtt_enabled 1",
        f"zplc config set mqtt_broker {shell_quote(host_ip)}",
        "zplc config set mqtt_port 1883",
        "zplc config set mqtt_profile 4",
        "zplc config set mqtt_protocol 1",
        "zplc config set mqtt_transport 0",
        f"zplc config set mqtt_topic_namespace {shell_quote('zplc/local')} ",
        f"zplc config set azure_event_grid_topic {shell_quote('zplc/local/telemetry')} ",
        f"zplc config set azure_event_grid_source {shell_quote('/zplc/board')} ",
        f"zplc config set azure_event_grid_event_type {shell_quote('com.zplc.telemetry')} ",
        "zplc config save",
    ]


def build_dps_commands(host_ip: str, registration_id: str) -> list[str]:
    return [
        "zplc config set azure_dps_enabled 1",
        f"zplc config set azure_dps_endpoint {shell_quote(host_ip)}",
        f"zplc config set azure_dps_id_scope {shell_quote('scope-local')} ",
        f"zplc config set azure_dps_registration_id {shell_quote(registration_id)}",
        f"zplc config set azure_sas_key {shell_quote('ZmFrZS1rZXk=')} ",
        "zplc config set azure_sas_expiry_s 3600",
        "zplc config save",
    ]


def build_fleet_commands(host_ip: str, template_name: str) -> list[str]:
    return [
        "zplc config set aws_fleet_enabled 1",
        f"zplc config set mqtt_broker {shell_quote(host_ip)}",
        "zplc config set mqtt_port 1883",
        f"zplc config set aws_fleet_template_name {shell_quote(template_name)}",
        f"zplc config set mqtt_ca_cert_path {shell_quote('/lfs/certs/ca.pem')}",
        f"zplc config set aws_claim_cert_path {shell_quote('/lfs/certs/claim.pem')}",
        f"zplc config set aws_claim_key_path {shell_quote('/lfs/certs/claim.key')}",
        "zplc config save",
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("profile", choices=["event-grid", "dps", "fleet"])
    parser.add_argument("--port", default=None)
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--host-ip", default=None)
    parser.add_argument("--registration-id", default="zplc-device")
    parser.add_argument("--template", default="zplc-template")
    args = parser.parse_args()

    host_ip = args.host_ip or detect_host_ip()
    port = args.port or autodetect_port()
    with serial.Serial(port, args.baud, timeout=0.25) as ser:
        time.sleep(1.0)
        wait_for_shell(ser)
        if args.profile == "event-grid":
            commands = build_event_grid_commands(host_ip)
        elif args.profile == "dps":
            commands = build_dps_commands(host_ip, args.registration_id)
        else:
            commands = build_fleet_commands(host_ip, args.template)
        apply_commands(ser, commands)


if __name__ == "__main__":
    main()
