"""The local fieldbus endpoints of the bench (HIL-010, COM-009, COM-012): what the board talks to in the fieldbus step.

    RtuServer     a Modbus RTU server (function codes 3 and 6) on the host side of a serial line: the USB-serial adapter
                  wired to the Pico's UART1, or one end of a pseudo-terminal in a test
    Loopback      the COM-009 loopback endpoints of this tree (zplc_loopback: a Modbus TCP server and an MQTT broker),
                  started for the step and stopped after it
    Forwarder     makes a loopback endpoint, which listens on 127.0.0.1, reachable from the board on the LAN address

Nothing here opens a port by itself: the chain gives them the port a person named.
"""
from __future__ import annotations

import json
import os
import select
import socket
import struct
import subprocess
import threading
from pathlib import Path


def crc16(data: bytes) -> int:
    """The CRC of a Modbus RTU frame (polynomial 0xA001, initial 0xFFFF), sent low byte first."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def rtu_frame(body: bytes) -> bytes:
    return body + struct.pack("<H", crc16(body))


class RtuServer:
    """Answers FC03 (read holding registers) and FC06 (write one) for `unit` on a file descriptor, until stopped."""

    def __init__(self, fd: int, unit: int = 1, registers: dict[int, int] | None = None):
        self.fd, self.unit, self.registers = fd, unit, dict(registers or {})
        self.requests: list[bytes] = []
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._serve, daemon=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *_):
        self._stop.set()
        self._thread.join(timeout=2)

    def answer(self, frame: bytes) -> bytes | None:
        if len(frame) < 8 or crc16(frame[:-2]) != struct.unpack("<H", frame[-2:])[0] or frame[0] != self.unit:
            return None  # a wrong CRC or another unit gets silence, as on a bus
        function, address, value = frame[1], *struct.unpack(">HH", frame[2:6])
        if function == 3:
            words = [self.registers.get(address + i, 0) for i in range(value)]
            return rtu_frame(bytes([self.unit, 3, 2 * value]) + b"".join(struct.pack(">H", w) for w in words))
        if function == 6:
            self.registers[address] = value
            return rtu_frame(frame[:6])
        return rtu_frame(bytes([self.unit, function | 0x80, 1]))

    def _serve(self) -> None:
        buffer = b""
        while not self._stop.is_set():
            ready, _, _ = select.select([self.fd], [], [], 0.05)
            if not ready:
                if len(buffer) >= 8:  # a silence ends a frame
                    self.requests.append(buffer)
                    reply = self.answer(buffer)
                    if reply:
                        os.write(self.fd, reply)
                buffer = b""
                continue
            buffer += os.read(self.fd, 256)


class Loopback:
    """zplc_loopback of this tree: started with free ports, stopped when its standard input closes."""

    def __init__(self, binary: str | os.PathLike):
        if not Path(binary).is_file():
            raise FileNotFoundError(f"the COM-009 loopback endpoints are not built: {binary}")
        self.process = subprocess.Popen([str(binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        line = self.process.stdout.readline()  # type: ignore[union-attr]
        self.ports = json.loads(line)

    def close(self) -> None:
        if self.process.stdin:
            self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()


class Forwarder:
    """Accepts on (host, port) and relays each connection to 127.0.0.1:target, both ways, until closed."""

    def __init__(self, target: int, host: str = "0.0.0.0", port: int = 0):
        self.target = target
        self.server = socket.create_server((host, port))
        self.port = self.server.getsockname()[1]
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self) -> None:
        while True:
            try:
                client, _ = self.server.accept()
            except OSError:
                return
            upstream = socket.create_connection(("127.0.0.1", self.target))
            for source, sink in ((client, upstream), (upstream, client)):
                threading.Thread(target=self._pipe, args=(source, sink), daemon=True).start()

    @staticmethod
    def _pipe(source: socket.socket, sink: socket.socket) -> None:
        try:
            while data := source.recv(4096):
                sink.sendall(data)
        except OSError:
            pass
        finally:
            for end in (source, sink):
                try:
                    end.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass

    def close(self) -> None:
        self.server.close()


def lan_address() -> str:
    """The address of this computer on the network its default route uses (no packet is sent)."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("192.0.2.1", 9))  # TEST-NET-1: never routed anywhere, only used to pick an interface
            return probe.getsockname()[0]
        except OSError:
            return "127.0.0.1"
