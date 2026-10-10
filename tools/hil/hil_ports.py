"""Serial port selection for the HIL tools (HIL-007).

A port is a parameter (`--port`), the environment (`ZPLC_SERIAL_PORT`), or found by the USB
identifiers of the board (tools/hil/usb-ids.json). Nothing here opens a port: `list_serial_ports`
only asks pyserial what is plugged in, and it is a parameter so tests give a fake list.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Iterable, Mapping

USB_IDS = Path(__file__).with_name("usb-ids.json")
ENV_PORT = "ZPLC_SERIAL_PORT"
LEGACY_ENV_PORT = "ZPLC_PORT"  # what zplc_tester.py read before HIL-007
# (device, vid, pid, description); vid and pid are None for a port that is not USB.
PortInfo = tuple


class PortError(Exception):
    """No port could be chosen; the message says what was seen and what to pass."""


def list_serial_ports() -> list[PortInfo]:
    try:
        from serial.tools import list_ports  # noqa: PLC0415
    except ImportError as error:
        raise PortError(f"pyserial is not installed, so ports cannot be listed: pass --port or set {ENV_PORT}") from error
    return [(p.device, p.vid, p.pid, p.description or "") for p in list_ports.comports()]


def board_usb_ids(board: str | None) -> list[tuple[int, int]]:
    boards = json.loads(USB_IDS.read_text())["boards"]
    wanted = boards.values() if board is None else [boards.get(board, {})]
    return [(int(entry["vid"], 16), int(entry["pid"], 16)) for item in wanted for entry in item.get("ids", [])]


def _same_device(device: str) -> str:
    """macOS lists one device as /dev/tty.X and /dev/cu.X; the cu one is the one to open."""
    return device.replace("/dev/tty.", "/dev/cu.", 1) if device.startswith("/dev/tty.") else device


def _describe(ports: Iterable[PortInfo]) -> str:
    seen = [f"{device} ({vid:04X}:{pid:04X})" if vid is not None else device for device, vid, pid, _ in ports]
    return ", ".join(seen) if seen else "no serial port at all"


def resolve_port(
    port: str | None = None,
    board: str | None = None,
    env: Mapping[str, str] | None = None,
    lister: Callable[[], list[PortInfo]] = list_serial_ports,
) -> str:
    if port:
        return port
    environment = {} if env is None else env
    named = environment.get(ENV_PORT) or environment.get(LEGACY_ENV_PORT)
    if named:
        return named
    ids = board_usb_ids(board)
    if not ids:
        raise PortError(f"no USB identifiers are known for board {board!r}: pass --port or set {ENV_PORT}")
    ports = lister()
    found: dict[str, str] = {}
    for device, vid, pid, _ in ports:
        if (vid, pid) in ids:
            found.setdefault(_same_device(device), device)
    if len(found) == 1:
        return next(iter(found))
    if not found:
        raise PortError(f"no port matches board {board!r}; seen: {_describe(ports)}. Pass --port or set {ENV_PORT}")
    raise PortError(f"more than one port matches board {board!r}: {', '.join(sorted(found))}. Pass --port to say which")
