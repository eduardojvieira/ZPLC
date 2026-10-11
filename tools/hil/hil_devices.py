"""The devices the HIL tools talk to: a serial port, and two fakes (HIL-001, HIL-004, HIL-007).

Every device offers the small pyserial subset the testers use (write, read, read_all, readline, in_waiting,
reset_input_buffer, close) and a `kind` that goes into every run record, so that the result of a fake is
never taken for hardware evidence:

    serial        a real board behind a serial port (the only kind that is hardware evidence)
    host-runtime  the native POSIX runtime of this tree behind the firmware shell grammar
    null          a device that acknowledges everything and shows nothing; every check against it must fail

The shell grammar is the one firmware/app/src/shell_cmds.c speaks. The fakes answer the same commands with
the same reply shapes (`OK: ...`, a hex dump, JSON for --json) and refuse any other command as the shell does.
"""
from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

PROMPT = "zplc:~$ "
ROOT = Path(__file__).resolve().parents[2]


class DeviceError(Exception):
    pass


class _NotFound(DeviceError):
    def __init__(self, command: str):
        super().__init__(f"{command}: command not found")


class SerialTransport:
    """A real serial port. pyserial is imported here and nowhere else, so that importing the tools needs no port and no pyserial."""

    kind = "serial"

    def __init__(self, port: str, baud: int = 115200, timeout: float = 1.0):
        if os.environ.get("ZPLC_HIL_FORBID_SERIAL"):
            raise DeviceError("a serial port may not be opened here (ZPLC_HIL_FORBID_SERIAL is set: this is a test run)")
        try:
            import serial  # noqa: PLC0415
        except ImportError as error:
            raise DeviceError("pyserial is not installed: pip install pyserial") from error
        self.port = port
        self._serial = serial.Serial(port, baud, timeout=timeout)

    @property
    def in_waiting(self) -> int:
        return self._serial.in_waiting

    def __getattr__(self, name: str):
        return getattr(self._serial, name)


class ShellDevice:
    """The shared part of a fake: a line-oriented shell that echoes, answers and prints a prompt."""

    kind = "fake"

    def __init__(self) -> None:
        self._rx = bytearray()
        self._line = bytearray()
        self._previous = 0

    # pyserial subset -------------------------------------------------------------------------------
    @property
    def in_waiting(self) -> int:
        return len(self._rx)

    def write(self, data: bytes) -> int:
        for byte in data:
            if byte == 10 and self._previous == 13:
                pass  # the LF of a CR LF ends nothing: the shell took the CR as Enter
            elif byte in (10, 13):
                text = self._line.decode("utf-8", "replace").strip()
                self._line.clear()
                self._answer(text)  # an empty line is answered with a prompt, as the shell does
            else:
                self._line.append(byte)
            self._previous = byte
        return len(data)

    def read(self, size: int = 1) -> bytes:
        chunk = bytes(self._rx[:size])
        del self._rx[:size]
        return chunk

    def read_all(self) -> bytes:
        return self.read(len(self._rx))

    def readline(self) -> bytes:
        end = self._rx.find(b"\n")
        return self.read(len(self._rx) if end < 0 else end + 1)

    def reset_input_buffer(self) -> None:
        self._rx.clear()

    def close(self) -> None:
        pass

    # shell -------------------------------------------------------------------------------------------
    def _answer(self, line: str) -> None:
        reply = self.handle(line) if line else ""
        self._rx += f"{line}\r\n{reply}{PROMPT}".encode()

    def handle(self, line: str) -> str:  # pragma: no cover - overridden
        raise NotImplementedError

    @staticmethod
    def dump(data: bytes, address: int) -> str:
        """The hex dump of `zplc dbg peek`: a header, then 16 bytes a line."""
        lines = [f"Memory at 0x{address:04X} ({len(data)} bytes):"]
        for offset in range(0, len(data), 16):
            lines.append(f"{address + offset:04X}: " + "".join(f"{b:02X} " for b in data[offset : offset + 16]))
        return "\r\n".join(lines) + "\r\n"


class NullDevice(ShellDevice):
    """Acknowledges every command, keeps no program, has zero memory and prints no trace."""

    kind = "null"

    def handle(self, line: str) -> str:
        words = line.split()
        if words[:3] == ["zplc", "dbg", "peek"] and len(words) >= 3:
            length = int(words[4], 0) if len(words) > 4 else 1
            return self.dump(bytes(length), int(words[3], 0)) if len(words) > 3 else "ERROR: Usage\r\n"
        if "--json" in words and words[:3] == ["zplc", "sys", "info"]:
            return '{"board":"null","board_profile":"null","zplc_version":"0","zephyr_version":"0"}\r\n'
        return "OK: ignored\r\n"


class HostRuntimeDevice(ShellDevice):
    """The native POSIX runtime of this tree (zplc_runtime), driven over its newline-delimited JSON session."""

    kind = "host-runtime"
    TIMEOUT = 15.0
    CHUNK = 128

    def __init__(self, binary: str | os.PathLike | None = None) -> None:
        super().__init__()
        binary = binary or os.environ.get("ZPLC_NATIVE_SIM_BIN")
        if not binary or not Path(binary).is_file():
            raise DeviceError("the host runtime needs ZPLC_NATIVE_SIM_BIN to name a built zplc_runtime binary")
        self._persist = tempfile.mkdtemp(prefix="zplc-hil-persist-")
        self._process = subprocess.Popen(
            [str(binary)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            env={**os.environ, "ZPLC_PERSIST_ROOT": self._persist},
        )
        self._lines: queue.Queue = queue.Queue()
        threading.Thread(target=self._pump, daemon=True).start()
        self._count = 0
        self._expected = 0
        self._program = bytearray()
        self.hello = self._call("session.hello", {"client_name": "zplc-hil", "client_version": "0", "protocol_version": "1.0"})

    # session ----------------------------------------------------------------------------------------
    def _pump(self) -> None:
        for line in self._process.stdout:  # type: ignore[union-attr]
            self._lines.put(line)
        self._lines.put(None)

    def _call(self, method: str, params: dict | None = None):
        self._count += 1
        identity = f"hil-{self._count}"
        # the runtime's parser takes compact JSON only
        request = {"id": identity, "type": "request", "method": method, "params": params or {}}
        try:
            self._process.stdin.write(json.dumps(request, separators=(",", ":")) + "\n")  # type: ignore[union-attr]
            self._process.stdin.flush()  # type: ignore[union-attr]
        except OSError as error:
            raise DeviceError(f"the host runtime is gone: {error}") from error
        while True:
            try:
                line = self._lines.get(timeout=self.TIMEOUT)
            except queue.Empty as error:
                raise DeviceError(f"the host runtime did not answer {method}") from error
            if line is None:
                raise DeviceError("the host runtime exited")
            message = json.loads(line)
            if message.get("type") == "response" and message.get("id") == identity:
                if "error" in message:
                    raise DeviceError(f"{message['error'].get('code')}: {message['error'].get('message')}")
                return message.get("result", {})

    def close(self) -> None:
        if self._process.poll() is None:
            try:
                self._call("session.shutdown")
            except DeviceError:
                pass
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        for pipe in (self._process.stdin, self._process.stdout):
            try:
                pipe.close()
            except OSError:
                pass
        shutil.rmtree(self._persist, ignore_errors=True)

    # shell grammar ----------------------------------------------------------------------------------
    def handle(self, line: str) -> str:
        words = line.split()
        if not words:
            return ""
        if words[0] != "zplc":
            return f"{words[0]}: command not found\r\n"
        try:
            return self._zplc(words[1:]) + "\r\n"
        except _NotFound as error:
            return f"{error}\r\n"
        except DeviceError as error:
            return f"ERROR: {error}\r\n"

    def _zplc(self, words: list[str]) -> str:
        head, rest = (words[0], words[1:]) if words else ("", [])
        if head in ("stop", "start", "reset"):
            self._call({"stop": "execution.stop", "start": "execution.start", "reset": "execution.reset"}[head])
            return {"stop": "OK: Scheduler stopped", "start": "OK: Scheduler started", "reset": "OK: Scheduler reset"}[head]
        if head == "sched" and rest and rest[0] in ("load", "data"):
            head, rest = rest[0], rest[1:]
        if head == "load" and len(rest) == 1:
            self._expected, self._program = int(rest[0], 0), bytearray()
            return f"OK: Ready to receive {self._expected} bytes"
        if head == "data" and len(rest) == 1:
            self._program += bytes.fromhex(rest[0])
            if len(self._program) < self._expected:
                return f"OK: Received {len(rest[0]) // 2} bytes ({len(self._program)}/{self._expected})"
            self._call("program.load", {"bytecode_hex": bytes(self._program).hex()})
            return f"OK: Program loaded ({len(self._program)} bytes)"
        if head == "status":
            return self._status("--json" in rest)
        if head == "version" or (head == "sys" and rest[:1] == ["build"]):
            return self._identity(as_json="--json" in rest)
        if head == "sys" and rest[:1] == ["info"]:
            return self._sys_info()
        if head == "hil" and rest[:1] == ["mode"] and len(rest) == 2:
            return f"OK: HIL mode {rest[1]} (the host runtime emits no trace frames)"
        if head == "dbg":
            return self._dbg(rest)
        raise _NotFound(f"zplc {' '.join(words)}")

    def _dbg(self, words: list[str]) -> str:
        sub, rest = (words[0], words[1:]) if words else ("", [])
        if sub == "peek" and rest:
            address, length = int(rest[0], 0), int(rest[1], 0) if len(rest) > 1 else 16
            data = b"".join(
                bytes.fromhex(self._call("memory.read", {"address": address + at, "length": min(self.CHUNK, length - at)})["bytes_hex"])
                for at in range(0, length, self.CHUNK)
            )
            return self.dump(data, address).rstrip("\r\n")
        if sub == "poke" and len(rest) == 2:
            value = int(rest[1], 0)
            if not 0 <= value <= 255:
                raise DeviceError("Invalid value (0-255)")
            self._call("memory.write", {"address": int(rest[0], 0), "bytes_hex": f"{value:02x}"})
            return f"OK: Wrote 0x{value:02X} to 0x{int(rest[0], 0):04X}"
        if sub == "force" and rest:
            return self._force(rest)
        raise _NotFound(f"zplc dbg {' '.join(words)}")

    def _force(self, words: list[str]) -> str:
        action, rest = words[0], words[1:]
        if action == "set" and len(rest) == 2:
            self._call("force.set", {"address": int(rest[0], 0), "bytes_hex": rest[1]})
            return f"OK: Forced {len(rest[1]) // 2} byte(s) at 0x{int(rest[0], 0):04X}"
        if action == "clear" and len(rest) == 1:
            self._call("force.clear", {"address": int(rest[0], 0)})
            return f"OK: Cleared force at 0x{int(rest[0], 0):04X}"
        if action == "clear_all":
            self._call("force.clear_all")
            return "OK: Cleared all force entries"
        if action == "list":
            entries = self._call("force.list").get("force_entries", [])
            items = ",".join(f'{{"addr":{e["address"]},"size":{e["size"]},"bytes":"{e["bytes_hex"]}"}}' for e in entries)
            return f'{{"count":{len(entries)},"items":[{items}]}}'
        raise _NotFound(f"zplc dbg force {' '.join(words)}")

    def _status(self, as_json: bool) -> str:
        snapshot = self._call("status.get")
        stats, vm = snapshot.get("stats", {}), snapshot.get("focused_vm", {})
        opi = list(bytes.fromhex(self._call("memory.read", {"address": 0x1000, "length": 8})["bytes_hex"]))
        if as_json:
            body = {
                "state": snapshot.get("state", "idle"),
                "uptime_ms": snapshot.get("uptime_ms", 0),
                "stats": {"cycles": stats.get("cycles", 0), "overruns": stats.get("overruns", 0), "active_tasks": stats.get("active_tasks", 0), "program_size": stats.get("program_size", 0)},
                "vm": {"pc": vm.get("pc", 0), "sp": vm.get("sp", 0), "halted": bool(vm.get("halted", False)), "error": vm.get("error", 0)},
                "opi": opi,
            }
            return json.dumps(body, separators=(",", ":"))
        return f"ZPLC Status:\r\n  State:   {snapshot.get('state')}\r\n  Cycles:  {stats.get('cycles', 0)}\r\n  Program: {stats.get('program_size', 0)} bytes"

    def _identity(self, as_json: bool) -> str:
        """`zplc version` and `zplc sys build [--json]`: the identity the runtime reports in its session.hello, in the shell's shapes (REL-023)."""
        build = self.hello.get("build")
        if not isinstance(build, dict):
            raise _NotFound("zplc sys build")
        if as_json:
            return json.dumps(build, separators=(",", ":"))
        return (
            f"ZPLC Runtime v{build['version']}\r\nCommit:         {build['commit']}\r\nDirty:          {'yes' if build['dirty'] else 'no'}\r\n"
            f"Board:          {build['board']}\r\nBytecode ABI:   {build['abi_major']}.{build['abi_minor']}\r\n"
            f"Contract draft: {build['draft_counter']}\r\nOptions hash:   {build['options_hash']}\r\nOptions:        {build['options']}"
        )

    def _sys_info(self) -> str:
        from zplc_contract import ZPLC_DRAFT_COUNTER, ZPLC_VERSION_MAJOR, ZPLC_VERSION_MINOR  # noqa: PLC0415

        body = {
            "board": "native_posix",
            "board_profile": "host-runtime",
            "zplc_version": self.hello.get("runtime_version", ""),
            "zephyr_version": "none",
            "uptime_ms": self._call("status.get").get("uptime_ms", 0),
            "cpu_freq_mhz": 0,
            "device_protocol_version": 1,
            "bytecode_abi_major": ZPLC_VERSION_MAJOR,
            "bytecode_abi_minor": ZPLC_VERSION_MINOR,
            "draft_counter": self.hello.get("draft_counter", ZPLC_DRAFT_COUNTER),
            "capabilities": {"fpu": True, "mpu": False, "scheduler": True, "max_tasks": 1},
            "memory": {"work_size": 0x2000, "retain_size": 0x1000, "ipi_size": 0x1000, "opi_size": 0x1000},
        }
        return json.dumps(body, separators=(",", ":"))


def open_fake(name: str) -> ShellDevice:
    """The device a run asks for with ZPLC_HIL_DEVICE: `null` or `host`."""
    if name == "null":
        return NullDevice()
    if name == "host":
        return HostRuntimeDevice()
    raise DeviceError(f"ZPLC_HIL_DEVICE must be 'null' or 'host', not {name!r}")
