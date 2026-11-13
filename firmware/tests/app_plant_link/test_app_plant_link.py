#!/usr/bin/env python3
"""LNK-007, LNK-008 (session rule), LNK-010, LNK-011, LNK-012, LNK-017 (serial), LNK-018: the firmware application
serves plant I/O mode on the device link, on a real shell.

Builds firmware/app for native_sim/native (the 32-bit variant: the application does not build as 64-bit), starts
zephyr.exe with its UART on stdin and stdout and sends frames the way Studio does: one frame per line in hexadecimal
as `zplc link <hex>`, and reads the `ZF:<hex>` lines that come back. It checks on the real image, with its scheduler,
its exchange and its session rule:

  capability     the hello advertises PLANT; the five messages need a session
  entry          refused while the program is stopped; granted while it runs
  frames         ten frames are applied whole, the output image comes back from one scan, a damaged frame is
                 counted and does not refresh the timeout
  exit           the person's exit, the silence of the plant, the close of the session and the idle time of the
                 session all leave the program STOPPED with the outputs safe, and one EVT_PLANT_EXIT is pushed
  the shell      the text shell keeps working beside the plant link

A second build with CONFIG_ZPLC_PLANT_IO=n has no bit 12 in its hello and answers the five ids UNSUPPORTED (the
previous behaviour of the shared engine).

The pins are not observed here (this build has no pin emulation of its own): the pin side of the hold is proved by
the Twister test firmware/tests/plant_io (plant_io.hold_on_gpio_emul) and by `run.sh app-native`.

Usage:  ZPLC_FW_WS=<west workspace> python3 firmware/tests/app_plant_link/test_app_plant_link.py
Host and native-simulator results are not hardware evidence.
"""

import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time
import zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tools" / "contract"))
import generate_protocol as proto  # noqa: E402  (the definition and a reference encoder and decoder)

WORKSPACE = Path(os.environ.get("ZPLC_FW_WS", Path.home() / "zplc-zephyr-ws"))
PROMPT = "zplc:~$"
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
DEFINITION = proto.load()
MSG = {m["name"]: m["id"] for m in DEFINITION["messages"]}
EVT = {e["name"]: e["id"] for e in DEFINITION["events"]}
ERR = {e["name"]: e["value"] for e in DEFINITION["errors"]}
CAP = {c["name"]: 1 << c["bit"] for c in DEFINITION["capabilities"]}
MASK = {m["name"]: 1 << m["bit"] for m in DEFINITION["eventMask"]}
EXIT = {"CLOSED": 0, "TIMEOUT": 1, "SESSION_END": 2, "LINK_LOST": 3, "RUN_CONTROL": 4, "FAULT": 5, "PROTOCOL": 6}
IDLE_SECONDS = 5
TIMEOUT_MS = 300  # the granted staleness bound of the entries below (50 to 2000)


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def check(condition: bool, message: str) -> None:
    if not condition:
        fail(message)
    print(f"ok: {message}")


def build(directory: Path, extra: str = "") -> Path:
    if not (WORKSPACE / "zephyr" / "VERSION").exists():
        print(f"error: no Zephyr workspace at {WORKSPACE}; set ZPLC_FW_WS (tools/firmware-test/setup.sh)", file=sys.stderr)
        sys.exit(2)
    linked = WORKSPACE / "zplc"
    if not linked.exists() or not linked.samefile(REPO):
        print(f"error: {linked} is not this checkout ({REPO})", file=sys.stderr)
        sys.exit(2)
    command = (
        f'. "{REPO}/tools/firmware-test/env.sh" && cd "{WORKSPACE}" && '
        f'west build -p always -b native_sim/native zplc/firmware/app -d "{directory}" -- '
        f"-DCONFIG_ZPLC_CODE_SIZE_MAX=4096 -DCONFIG_ZPLC_PROTO_SESSION_IDLE_S={IDLE_SECONDS} {extra}"
    )
    log = directory.with_suffix(".log")
    with open(log, "w", encoding="utf-8") as out:
        result = subprocess.run(["bash", "-c", command], env={**os.environ, "ZPLC_FW_WS": str(WORKSPACE)}, stdout=out, stderr=subprocess.STDOUT)
    if result.returncode != 0:
        print(Path(log).read_text(encoding="utf-8")[-3000:])
        fail("west build of firmware/app for native_sim/native failed")
    return directory / "zephyr" / "zephyr.exe"


class Shell:
    def __init__(self, executable: Path) -> None:
        self.process = subprocess.Popen(
            [str(executable), "-uart_stdinout", "-flash_in_ram", "-rt", "-stop_at=180"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=executable.parent,
        )
        self.buffer = ""
        self.lock = threading.Lock()
        threading.Thread(target=self._pump, daemon=True).start()
        self._wait_for_prompt(30.0)

    def _pump(self) -> None:
        assert self.process.stdout is not None
        while True:
            chunk = self.process.stdout.read1(4096)  # type: ignore[attr-defined]
            if not chunk:
                return
            with self.lock:
                self.buffer += chunk.decode("utf-8", errors="replace")

    def _wait_for_prompt(self, timeout: float) -> str:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self.lock:
                text = ANSI.sub("", self.buffer)
                if text.rstrip().endswith(PROMPT):
                    self.buffer = ""
                    return text
            time.sleep(0.01)
        fail(f"no shell prompt within {timeout} s; got: {ANSI.sub('', self.buffer)[-400:]!r}")
        return ""

    def run_raw(self, line: str) -> str:
        assert self.process.stdin is not None
        self.process.stdin.write((line + "\r").encode())
        self.process.stdin.flush()
        return self._wait_for_prompt(15.0).replace("\r", "")

    def run(self, line: str) -> str:
        lines = [part for part in self.run_raw(line).split("\n") if part.strip() != ""]
        return "\n".join(part for part in lines if not part.strip().startswith(PROMPT) and part.strip() != line
                         and not part.strip().startswith("ZF:"))

    def take(self) -> str:
        """Whatever has been printed since the last prompt (events), without waiting for one."""
        with self.lock:
            text = ANSI.sub("", self.buffer).replace("\r", "")
            self.buffer = ""
        return text

    def close(self) -> None:
        self.process.kill()
        self.process.wait()


def frames_of(text: str) -> list[dict]:
    decoder = proto.Decoder(DEFINITION, DEFINITION["limits"]["payloadMaxDefault"])
    for match in re.finditer(r"ZF:((?:[0-9a-f]{2})+)", text):
        decoder.push(bytes.fromhex(match.group(1)))
    return decoder.frames


class Link:
    def __init__(self, shell: Shell) -> None:
        self.shell = shell
        self.sequence = 1
        self.events: list[dict] = []

    def request(self, name: str, payload: bytes = b"") -> dict | None:
        sequence = self.sequence
        self.sequence += 1
        frame = proto.encode_frame(DEFINITION, 0, MSG[name], sequence, payload)
        text = self.shell.run_raw("zplc link " + frame.hex())
        answer = None
        for received in frames_of(text):
            if received["kind"] == 1 and received["sequence"] == sequence and received["message"] == MSG[name]:
                answer = received
            elif received["kind"] == 2:
                self.events.append(received)
        return answer

    def status_of(self, answer: dict | None) -> int:
        return -1 if answer is None else answer["payload"][0]

    def pump(self, seconds: float) -> None:
        time.sleep(seconds)
        for received in frames_of(self.shell.take()):
            if received["kind"] == 2:
                self.events.append(received)

    def exits(self) -> list[tuple[int, int]]:
        """(reason, frames) of every EVT_PLANT_EXIT received so far."""
        return [(e["payload"][0], struct.unpack_from("<I", e["payload"], 1)[0]) for e in self.events if e["message"] == EVT["EVT_PLANT_EXIT"]]


def u16(value: int) -> bytes:
    return struct.pack("<H", value)


def u32(value: int) -> bytes:
    return struct.pack("<I", value)


def open_payload() -> bytes:
    return bytes([0]) + bytes(16) + bytes(16) + b"plant-link-test".ljust(16, b"\0")


def artifact() -> bytes:
    """One cyclic task of 10 ms: OPI[1] = IPI[0]; OPI[0] = 1. The scan of this program is what the plant sees."""
    code = bytes([
        0x80, 0x00, 0x00,  # LOAD8  IPI[0]
        0x84, 0x01, 0x10,  # STORE8 OPI[1]
        0x40, 0x01,        # PUSH8  1
        0x84, 0x00, 0x10,  # STORE8 OPI[0]
        0x01,              # HALT
    ])
    task = struct.pack("<HBBIHH", 1, 0, 1, 10000, 0, 64) + bytes(4)
    header = bytearray(48)
    header[0:4] = b"ZPLC"
    struct.pack_into("<HH", header, 4, 1, 0)
    struct.pack_into("<I", header, 16, len(code))
    struct.pack_into("<I", header, 20, len(task))
    struct.pack_into("<H", header, 26, 2)
    struct.pack_into("<I", header, 28, 6)  # ZPLC_DRAFT_COUNTER
    struct.pack_into("<HxxI", header, 32, 0x01, len(code))
    struct.pack_into("<HxxI", header, 40, 0x20, len(task))
    body = bytes(header) + code + task
    crc = zlib.crc32(body[16:], zlib.crc32(body[:12])) & 0xFFFFFFFF
    struct.pack_into("<I", header, 12, crc)
    return bytes(header) + code + task


def entry(timeout_ms: int = TIMEOUT_MS) -> bytes:
    """Inputs: one BOOL at IPI[0].0. Outputs: BOOL OPI[0].0 and BOOL OPI[1].0."""
    return u16(timeout_ms) + bytes([1, 2]) + u16(0) + bytes([0]) + u16(0) + bytes([0]) + u16(1) + bytes([0])


def frame(plant_id: int, seq: int, on: bool) -> bytes:
    return u16(plant_id) + u32(seq) + bytes([1 if on else 0])


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="zplc-plant-link-"))
    shell = None
    try:
        executable = build(work / "app")
        shell = Shell(executable)
        link = Link(shell)
        program = artifact()

        def state() -> str:
            shell.take()
            return json_state(shell.run("zplc sched status --json"))

        def image(address: int, length: int) -> bytes:
            shell.take()
            text = shell.run(f"zplc dbg peek 0x{address:04x} {length}")
            found = re.findall(r"\b[0-9a-fA-F]{2}\b", text)
            return bytes(int(b, 16) for b in found[-length:])

        def session() -> None:
            check(link.status_of(link.request("SESSION_OPEN", open_payload())) == 0, "a session opens")
            check(link.status_of(link.request("EVENTS_SET", u32(MASK["PLANT"] | MASK["STATUS"]))) == 0, "the plant events are asked for")

        def download() -> None:
            check(link.status_of(link.request("PROGRAM_BEGIN", u32(len(program)) + u32(zlib.crc32(program) & 0xFFFFFFFF))) == 0, "the program transfer starts")
            for at in range(0, len(program), 32):
                link.request("PROGRAM_CHUNK", u32(at) + program[at:at + 32])
            check(link.status_of(link.request("PROGRAM_COMMIT")) == 0, "the program is committed")

        def enter(timeout_ms: int = TIMEOUT_MS) -> int:
            answer = link.request("PLANT_ENTER", entry(timeout_ms))
            check(link.status_of(answer) == 0, "the plant entry is granted while the program runs")
            plant_id, in_bytes, out_bytes, max_slots, granted = struct.unpack_from("<HHHBH", answer["payload"], 1)
            check((in_bytes, out_bytes, granted) == (1, 1, timeout_ms) and max_slots >= 8, "with its byte counts, slots and the granted timeout")
            return plant_id

        # ---- the capability and the session rule ---------------------------------------------------------------
        hello = link.request("HELLO", bytes([1]) + u16(512))
        capabilities = struct.unpack_from("<I", hello["payload"], 5)[0]
        check(capabilities & CAP["PLANT"] != 0, "hello advertises PLANT")
        for name, payload in (("PLANT_ENTER", entry()), ("PLANT_FRAME", frame(1, 1, True)), ("PLANT_EXIT", b""), ("PLANT_MIRROR", b"\x01"), ("PLANT_STATUS", b"")):
            check(link.status_of(link.request(name, payload)) == ERR["NO_SESSION"], f"plant frames need a session: {name}")

        # ---- entry is refused while the program is stopped -----------------------------------------------------
        session()
        download()
        check(state() == "idle", "the program is loaded and stopped")
        check(link.status_of(link.request("PLANT_ENTER", entry())) == ERR["STATE"], "entry refused while stopped")

        # ---- entry, ten frames, exit: STOPPED and outputs safe --------------------------------------------------
        check(link.status_of(link.request("RUN")) == 0, "RUN")
        link.pump(0.2)
        plant_id = enter(2000)
        check(link.status_of(link.request("PLANT_ENTER", entry())) == ERR["STATE"], "a second entry is refused")
        for seq in range(1, 11):
            answer = link.request("PLANT_FRAME", frame(plant_id, seq, seq % 2 == 0))
            check(link.status_of(answer) == 0, f"frame {seq} is applied")
        time.sleep(0.1)
        answer = link.request("PLANT_FRAME", frame(plant_id, 11, True))
        applied, scans, flags, late, rejected = struct.unpack_from("<IIBHH", answer["payload"], 1)
        check(applied >= 10 and scans >= 1 and flags & 1 == 0 and rejected == 0, "applied sequence, scans, mirror off and no rejection")
        link.pump(0.1)
        answer = link.request("PLANT_FRAME", frame(plant_id, 12, True))
        check(answer["payload"][1 + 13] & 0b11 == 0b11, "output response carries the program's output while the pin is held (OPI[0].0 and the copy of the plant input)")
        status = link.request("PLANT_STATUS")
        active, status_id, mirror, frames = struct.unpack_from("<BHBI", status["payload"], 1)
        check((active, status_id, mirror, frames) == (1, plant_id, 0, 12), "PLANT_STATUS says active, the entry, mirror off and 12 frames")
        mirrored = link.request("PLANT_MIRROR", b"\x01")
        check(link.status_of(mirrored) == 0 and mirrored["payload"][1] == 1, "a person turns mirror on")
        check(link.status_of(link.request("PLANT_MIRROR", b"\x00")) == 0, "and off")
        check(shell.run("zplc sched status --json") != "", "the text shell keeps working beside the plant link")

        # a damaged frame is counted and does not refresh the timeout
        bad = link.request("PLANT_FRAME", frame(plant_id, 12, True))
        check(link.status_of(bad) == ERR["BAD_REQUEST"], "a replayed sequence is rejected")
        stats = link.request("PLANT_STATUS")["payload"]
        check(struct.unpack_from("<H", stats, 11)[0] == 1, "and counted")

        link.events.clear()
        closed = link.request("PLANT_EXIT")
        check(link.status_of(closed) == 0 and closed["payload"][1] == EXIT["CLOSED"], "PLANT_EXIT closes the mode")
        frames_done = struct.unpack_from("<I", closed["payload"], 2)[0]
        check(frames_done >= 12, "and reports the frames")
        link.pump(0.2)
        check(state() == "idle", "the program is STOPPED")
        check(image(0x1000, 2) == b"\x00\x00", "and the output image is reset")
        check(link.exits() == [(EXIT["CLOSED"], frames_done)], "one EVT_PLANT_EXIT with the reason CLOSED")
        check(link.status_of(link.request("PLANT_FRAME", frame(plant_id, 13, True))) == ERR["STATE"], "a frame after the exit is refused")
        check(struct.unpack_from("<B", link.request("PLANT_STATUS")["payload"], 1)[0] == 0, "PLANT_STATUS says inactive")

        # ---- silence for the timeout stops the program ----------------------------------------------------------
        link.events.clear()
        check(link.status_of(link.request("RUN")) == 0, "RUN again: a start is a person's act and begins on the pins")
        link.pump(0.2)
        plant_id = enter()
        check(link.status_of(link.request("PLANT_FRAME", frame(plant_id, 1, True))) == 0, "one frame")
        # a rejected frame does not refresh the timeout: replays for twice the timeout do not keep the mode alive
        for _ in range(int(2 * TIMEOUT_MS / 50)):
            link.request("PLANT_FRAME", frame(plant_id, 1, True))
            time.sleep(0.05)
        link.pump(0.2)
        check(state() == "idle", "silence for the timeout stops the program")
        check(image(0x1000, 2) == b"\x00\x00", "with the outputs safe")
        check(link.exits() == [(EXIT["TIMEOUT"], 1)], "one EVT_PLANT_EXIT with the reason TIMEOUT")
        check(link.status_of(link.request("PLANT_FRAME", frame(plant_id, 5, True))) == ERR["STATE"], "the mode did not come back")

        # ---- the end of the session stops the program -----------------------------------------------------------
        link.events.clear()
        check(link.status_of(link.request("RUN")) == 0, "RUN")
        link.pump(0.2)
        plant_id = enter(2000)
        check(link.status_of(link.request("PLANT_FRAME", frame(plant_id, 1, True))) == 0, "a frame")
        check(link.status_of(link.request("SESSION_CLOSE")) == 0, "the session is closed")
        link.pump(0.2)
        check(state() == "idle", "session close stops the program")
        check(image(0x1000, 2) == b"\x00\x00", "with the outputs safe")
        session()
        check(struct.unpack_from("<B", link.request("PLANT_STATUS")["payload"], 1)[0] == 0, "and the mode is not active")

        # ---- the idle time of the session -----------------------------------------------------------------------
        # The silence ends the mode first (the longest timeout is 2 s, the idle time here is 5 s): both ends leave
        # the program stopped and the pins safe; the order of the two is proved at host (proto_plant_session_end_exits).
        link.events.clear()
        check(link.status_of(link.request("RUN")) == 0, "RUN")
        link.pump(0.2)
        plant_id = enter(2000)
        check(link.status_of(link.request("PLANT_FRAME", frame(plant_id, 1, True))) == 0, "a frame, then silence")
        time.sleep(IDLE_SECONDS + 1.5)
        link.pump(0.3)
        check(state() == "idle", "session idle time stops the program")
        check(image(0x1000, 2) == b"\x00\x00", "with the outputs safe")
        check(len(link.exits()) == 1 and link.exits()[0][0] in (EXIT["TIMEOUT"], EXIT["SESSION_END"]), "one EVT_PLANT_EXIT")
        shell.take()
        check("OK" in shell.run("zplc start"), "the text shell starts the program")
        time.sleep(0.3)
        shell.take()
        check("OK" in shell.run("zplc stop"), "and stops it")

        # ---- a second build without the mode --------------------------------------------------------------------
        shell.close()
        shell = None
        executable = build(work / "app-off", "-DCONFIG_ZPLC_PLANT_IO=n")
        shell = Shell(executable)
        link = Link(shell)
        hello = link.request("HELLO", bytes([1]) + u16(512))
        capabilities = struct.unpack_from("<I", hello["payload"], 5)[0]
        check(capabilities & CAP["PLANT"] == 0, "a build without CONFIG_ZPLC_PLANT_IO has no PLANT bit in its hello")
        check(capabilities & CAP["EVENTS"] != 0, "and keeps the other capabilities")
        check(link.status_of(link.request("SESSION_OPEN", open_payload())) == 0, "a session opens")
        for name, payload in (("PLANT_ENTER", entry()), ("PLANT_FRAME", frame(1, 1, True)), ("PLANT_EXIT", b""), ("PLANT_MIRROR", b"\x01"), ("PLANT_STATUS", b"")):
            check(link.status_of(link.request(name, payload)) == ERR["UNSUPPORTED"], f"{name} answers UNSUPPORTED")
    finally:
        if shell is not None:
            shell.close()
        shutil.rmtree(work, ignore_errors=True)
    print("PASS: plant I/O mode on the device link of the firmware application, on native_sim (host evidence only)")
    return 0


def json_state(text: str) -> str:
    import json

    return json.loads(text)["state"].lower()


if __name__ == "__main__":
    sys.exit(main())
