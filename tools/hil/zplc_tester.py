"""The device-side tester of the HIL scripts: shell grammar over a transport, plus checks that decide the exit status.

A script makes its judgements with `tester.check(...)` and ends with `sys.exit(tester.finish())`: a run that
checked nothing, or whose checks did not all hold, exits non-zero (HIL-004). The transport is a serial port
found from a parameter, ZPLC_SERIAL_PORT or the USB identifiers of the board (HIL-007), or a fake device
(ZPLC_HIL_DEVICE=null|host, see hil_devices.py). Programs are compiled at run time into a directory that is
removed on close; nothing compiled is kept in the tree (HIL-006). The opcode table is the generated contract
(HIL-008).
"""
from __future__ import annotations

import binascii
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "contract"))
from zplc_contract import Opcode  # noqa: E402

from hil_devices import DeviceError, SerialTransport, open_fake  # noqa: E402
from hil_ports import PortError, resolve_port  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "packages/zplc-ide/src/cli/index.ts"
EXIT_SKIPPED = 77
PROMPT = "zplc:~$"


class CompileError(Exception):
    pass


class UploadError(Exception):
    pass


def cli(main, *args) -> None:
    """The `if __name__ == "__main__"` of a device script: its status, or 2 with a plain message when there is no device to use."""
    try:
        code = main(*args)
    except (PortError, DeviceError, CompileError, UploadError) as error:
        print(f"error: {error}", file=sys.stderr)
        code = 2
    sys.exit(code if isinstance(code, int) else 0)


class Check(NamedTuple):
    name: str
    ok: bool
    detail: str


class ZPLCTester:
    # Opcode name -> number, from the generated contract (tools/contract/contract.json),
    # so this table cannot fall behind the VM (HIL-008).
    OP = {op.name: int(op) for op in Opcode}

    def __init__(self, port=None, baud=115200, transport=None, board=None):
        self.checks: list[Check] = []
        self.skip_reason: str | None = None
        self.log: list[tuple[str, str]] = []
        self.workdir: str | None = None
        self.board = board
        if transport is None:
            fake = os.environ.get("ZPLC_HIL_DEVICE")
            if fake:
                transport = open_fake(fake)
            else:
                transport = SerialTransport(resolve_port(port, board, os.environ), baud)
                time.sleep(1)  # the board resets when the port opens
        self.ser = transport
        self.kind = getattr(transport, "kind", "fake")
        # pace scales the time a program is given to run; settle scales the pauses the serial protocol needs between
        # commands, which a fake does not (the host runtime still needs its real time to run scans)
        self.pace = 0.0 if self.kind == "null" else 1.0
        self.settle_scale = 1.0 if self.kind == "serial" else 0.0

    # judgement -------------------------------------------------------------------------------------
    def sleep(self, seconds: float) -> None:
        """Let a program run for `seconds`."""
        if self.pace:
            time.sleep(seconds * self.pace)

    def settle(self, seconds: float) -> None:
        """Pause for the serial protocol between commands."""
        if self.settle_scale:
            time.sleep(seconds * self.settle_scale)

    def check(self, name: str, ok: bool, detail: str = "") -> bool:
        self.checks.append(Check(name, bool(ok), detail))
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail and not ok else ""))
        return bool(ok)

    def check_eq(self, name: str, got, want) -> bool:
        return self.check(name, got == want, f"got {got!r}, wanted {want!r}")

    def skip(self, reason: str) -> None:
        self.skip_reason = reason
        print(f"SKIP  {reason}")

    def finish(self) -> int:
        """0 when every check held, 77 when the run said it was skipped, 1 otherwise (including a run that checked nothing)."""
        failed = [c for c in self.checks if not c.ok]
        if self.skip_reason is not None and not self.checks:
            print(f"RESULT: SKIPPED ({self.skip_reason})")
            return EXIT_SKIPPED
        if not self.checks:
            print("RESULT: FAILED (the run made no check)")
            return 1
        print(f"RESULT: {'PASSED' if not failed else 'FAILED'} ({len(self.checks) - len(failed)} of {len(self.checks)} checks)")
        return 0 if not failed else 1

    # lifecycle ---------------------------------------------------------------------------------------
    def close(self):
        self.ser.close()
        if self.workdir:
            shutil.rmtree(self.workdir, ignore_errors=True)
            self.workdir = None

    # shell -------------------------------------------------------------------------------------------
    def send(self, cmd, wait_for=PROMPT, timeout=5.0):
        """Send a command and wait for the prompt or a given answer."""
        while self.ser.in_waiting:
            self.ser.read(self.ser.in_waiting)
        self.ser.write(f"{cmd}\r\n".encode())
        self.log.append(("tx", cmd))
        deadline = time.time() + timeout
        response = ""
        while time.time() < deadline:
            if self.ser.in_waiting > 0:
                response += self.ser.read(self.ser.in_waiting).decode("utf-8", errors="ignore")
                if wait_for in response:
                    break
            else:
                time.sleep(0.01)
        if wait_for != PROMPT and wait_for in response and PROMPT not in response:
            # the answer came before its prompt: take the prompt too, or it would be taken for the end of the next command's answer
            quiet = time.time() + 0.3
            while time.time() < quiet and PROMPT not in response:
                if self.ser.in_waiting > 0:
                    response += self.ser.read(self.ser.in_waiting).decode("utf-8", errors="ignore")
                else:
                    time.sleep(0.005)
        self.log.append(("rx", response))
        return response

    def identity(self) -> dict:
        """What the device says it is: the JSON of `zplc sys info --json` ({} when it answers nothing parseable)."""
        match = re.search(r"\{.*\}", self.send("zplc sys info --json"), re.DOTALL)
        try:
            return json.loads(match.group(0)) if match else {}
        except json.JSONDecodeError:
            return {}

    def reset_state(self):
        self.send("zplc stop")
        self.send("zplc reset")
        self.settle(0.5)

    def upload_bytecode(self, bytecode):
        self.send("zplc stop")
        self.send("zplc reset")

        response = ""
        for attempt in range(3):
            while self.ser.in_waiting:
                self.ser.read(self.ser.in_waiting)
            response = self.send(f"zplc load {len(bytecode)}", wait_for="OK:", timeout=5.0)
            if "OK:" in response:
                break
            print(f"WARN: zplc load retry {attempt + 1}")
            self.settle(0.5)
        else:
            raise UploadError(f"zplc load failed: {response.strip()}")

        hex_data = binascii.hexlify(bytearray(bytecode)).decode()
        chunk_size = 32  # 16 bytes a command, the size the shell line buffer takes
        for at in range(0, len(hex_data), chunk_size):
            chunk = hex_data[at : at + chunk_size]
            for attempt in range(3):
                while self.ser.in_waiting:
                    self.ser.read(self.ser.in_waiting)
                response = self.send(f"zplc data {chunk}", wait_for="OK:", timeout=5.0)
                if "OK:" in response:
                    break
                print(f"WARN: chunk {at} retry {attempt + 1}")
                self.settle(0.5)
            else:
                raise UploadError(f"zplc data failed at byte {at // 2}: {response.strip()}")
            self.settle(0.05)
        self.send("")

    # observation --------------------------------------------------------------------------------------
    def start_and_capture(self, duration=1.0):
        """Send `zplc start` in verbose HIL mode and collect the JSON trace frames for `duration` seconds."""
        self.send("zplc hil mode verbose")
        self.ser.reset_input_buffer()
        self.ser.write(b"zplc start\r\n")
        traces = []
        buffer = ""
        deadline = time.time() + duration * self.pace
        while time.time() < deadline:
            if self.ser.in_waiting > 0:
                buffer += self.ser.read(self.ser.in_waiting).decode("utf-8", errors="ignore")
                while "}" in buffer:
                    start_idx, end_idx = buffer.find("{"), buffer.find("}")
                    if start_idx == -1 or end_idx < start_idx:
                        buffer = buffer[end_idx + 1 :] if end_idx != -1 else buffer
                        break
                    try:
                        data = json.loads(buffer[start_idx : end_idx + 1])
                        if data.get("t") in ("opcode", "error", "task", "fb", "ack"):
                            traces.append(data)
                    except json.JSONDecodeError:
                        pass
                    buffer = buffer[end_idx + 1 :]
            else:
                time.sleep(0.01)
        return traces

    def start_and_wait(self, duration=1.0):
        """Send `zplc start` with tracing off, let it run, and stop it."""
        self.send("zplc hil mode off")
        self.ser.reset_input_buffer()
        self.send("zplc start")
        self.sleep(duration)
        self.send("zplc stop")

    def observe(self, duration, regions):
        """Start with tracing off, run for `duration` seconds, read each (address, length) while it is still running, then stop.

        The outputs are read before the stop on purpose: STOP puts the outputs in their safe state, so a read after it
        shows zeros whatever the program computed. Memory that is not an output survives the stop and can be read after.
        """
        self.send("zplc hil mode off")
        self.ser.reset_input_buffer()
        self.send("zplc start")
        self.sleep(duration)
        seen = [self.peek(address, length) for address, length in regions]
        self.send("zplc stop")
        return seen

    def peek(self, addr, length=1):
        """Read memory with `zplc dbg peek`, ignoring log lines and retrying an empty read. [] when it cannot be read."""
        command = f"zplc dbg peek {hex(addr)} {length}"
        for _ in range(3):
            self.ser.reset_input_buffer()
            response = self.send(command, wait_for=PROMPT)
            values = []
            for line in response.splitlines():
                line = line.strip()
                if line.startswith("[") or not line or ":" not in line:
                    continue
                values += [int(h, 16) for h in re.findall(r"\b([0-9A-Fa-f]{2})\b", line.split(":", 1)[1])]
            if len(values) >= length:
                return values[:length]
            self.settle(0.2)
        return []

    def poke(self, addr, data):
        """Write bytes one at a time: `zplc dbg poke` takes one value from 0 to 255 per command."""
        for at, value in enumerate(bytes(data)):
            self.send(f"zplc dbg poke {hex(addr + at)} {value}", wait_for="OK:")

    # compile ---------------------------------------------------------------------------------------------
    def compile_st(self, source):
        """Compile a source file with the repository compiler into this tester's own directory; return the artifact bytes."""
        bun = shutil.which("bun")
        if bun is None:
            raise CompileError("bun is not on PATH: the repository compiler runs on it")
        path = Path(source)
        path = path if path.is_absolute() else ROOT / path
        if self.workdir is None:
            self.workdir = tempfile.mkdtemp(prefix="zplc-hil-")
        out = Path(self.workdir) / (path.name.split(".")[0] + ".zplc")
        done = subprocess.run([bun, str(CLI), "compile", str(path), "-o", str(out)], capture_output=True, text=True, cwd=ROOT)
        if done.returncode != 0:
            raise CompileError(f"compilation of {path.name} failed: {(done.stderr or done.stdout).strip()}")
        return list(out.read_bytes())

    def compile_project(self, directory):
        """Compile a Studio workspace (a folder with zplc.json and src/) into this tester's directory; return the artifact bytes."""
        bun = shutil.which("bun")
        if bun is None:
            raise CompileError("bun is not on PATH: the repository compiler runs on it")
        path = Path(directory)
        path = path if path.is_absolute() else ROOT / path
        if self.workdir is None:
            self.workdir = tempfile.mkdtemp(prefix="zplc-hil-")
        out = Path(self.workdir) / (path.name + ".zplc")
        done = subprocess.run([bun, str(CLI), "compile", str(path), "-o", str(out)], capture_output=True, text=True, cwd=ROOT)
        if done.returncode != 0:
            raise CompileError(f"compilation of project {path.name} failed: {(done.stderr or done.stdout).strip()}")
        return list(out.read_bytes())

    def run_st(self, st_file, reset=True, duration=2.0):
        bytecode = self.compile_st(st_file)
        if reset:
            self.reset_state()
        self.upload_bytecode(bytecode)
        return self.start_and_capture(duration=duration)

    def run_bytecode(self, bytecode, reset=True, duration=0.5, before_start=None):
        """Upload raw bytecode (a list of bytes) and run it, capturing the traces of verbose mode.

        `before_start` runs after the upload, which resets the runtime, and before the start: memory a program needs
        poked in goes there, because a reset would take it away if it were written earlier.
        """
        if reset:
            self.reset_state()
        self.upload_bytecode(bytecode)
        if before_start is not None:
            before_start(self)
        return self.start_and_capture(duration=duration)

    @staticmethod
    def get_last_tos(traces):
        """The top of stack of the last opcode trace, or None when there is none."""
        for trace in reversed(traces):
            if trace.get("t") == "opcode" and "tos" in trace:
                return trace["tos"]
        return None

    @staticmethod
    def get_last_sp(traces):
        """The stack pointer of the last opcode trace, or None when there is none."""
        for trace in reversed(traces):
            if trace.get("t") == "opcode" and "sp" in trace:
                return trace["sp"]
        return None
