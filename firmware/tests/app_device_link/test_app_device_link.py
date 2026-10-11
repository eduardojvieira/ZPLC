#!/usr/bin/env python3
"""COM-019, COM-020, COM-023, COM-024, COM-025, COM-028: the firmware application speaks the framed device link, on
a real shell.

Builds firmware/app for native_sim/native (the 32-bit variant: the application does not build as 64-bit), starts
zephyr.exe with its UART on stdin and stdout, and sends frames the way Studio does: one frame per line, in
hexadecimal, as `zplc link <hex>`, and reads the `ZF:<hex>` lines that come back. It checks on the real image, with
its scheduler, its exchange, its force table and its program store:

  recognition      the hello and the identity agree with `zplc sys info --json` and `zplc sys io --json`, whose
                   keys do not change; the text shell keeps working beside the link
  the session rule nothing that changes the device works without a session, and nothing of it reaches the shell's
                   view of the device (state, forces, program); a second request is refused while one is open
  atomic write     a multi-byte write goes through the exchange; a range that is refused names the region
  forces           a force set in a session is released when the session is closed and when it times out
  download         begin, ordered chunks, commit with the CRC-32 read back, then STOP; RUN is a request of its own
  events           a status change and the end of a session arrive as lines without being asked for
  dropped frames   a frame with a bad checksum is counted, not answered

  signed programs  a device that holds a public key activates only a program with a valid Ed25519 signature, and the
                   text shell refuses an upload meanwhile (COM-026)

The image is built with a five second idle time (CONFIG_ZPLC_PROTO_SESSION_IDLE_S) so that the timeout can be waited
for, and with CONFIG_ZPLC_PROTO_SIGNATURE. Authenticated sessions need a cryptographic generator that native_sim does not have here: they are proved on
the host (test_proto_session.c and the native runtime tests).

Usage:  ZPLC_FW_WS=<west workspace> python3 firmware/tests/app_device_link/test_app_device_link.py
Host results are not hardware evidence.
"""

import json
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
import ed25519_ref  # noqa: E402  (RFC 8032 in Python integers: the signatures the image has to accept)
import generate_protocol as proto  # noqa: E402  (the definition and a reference encoder and decoder)

WORKSPACE = Path(os.environ.get("ZPLC_FW_WS", Path.home() / "zplc-zephyr-ws"))
PROMPT = "zplc:~$"
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
HANDSHAKE_KEYS = {
    "board", "board_profile", "zplc_version", "zephyr_version", "uptime_ms", "cpu_freq_mhz",
    "device_protocol_version", "bytecode_abi_major", "bytecode_abi_minor", "capabilities", "memory", "draft_counter",
}
DEFINITION = proto.load()
MSG = {m["name"]: m["id"] for m in DEFINITION["messages"]}
EVT = {e["name"]: e["id"] for e in DEFINITION["events"]}
ERR = {e["name"]: e["value"] for e in DEFINITION["errors"]}
CAP = {c["name"]: 1 << c["bit"] for c in DEFINITION["capabilities"]}
MASK = {m["name"]: 1 << m["bit"] for m in DEFINITION["eventMask"]}
IDLE_SECONDS = 5


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def check(condition: bool, message: str) -> None:
    if not condition:
        fail(message)
    print(f"ok: {message}")


def build(directory: Path) -> Path:
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
        f"-DCONFIG_ZPLC_CODE_SIZE_MAX=4096 -DCONFIG_ZPLC_PROTO_SESSION_IDLE_S={IDLE_SECONDS} -DCONFIG_ZPLC_PROTO_SIGNATURE=y"
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
            time.sleep(0.02)
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
    """The frames in the ZF: lines of a text, in order."""
    decoder = proto.Decoder(DEFINITION, DEFINITION["limits"]["payloadMaxDefault"])
    # an event is printed by the shell behind the prompt that it redraws: the line does not start at its beginning
    for match in re.finditer(r"ZF:((?:[0-9a-f]{2})+)", text):
        decoder.push(bytes.fromhex(match.group(1)))
    return decoder.frames


class Link:
    def __init__(self, shell: Shell) -> None:
        self.shell = shell
        self.sequence = 1
        self.events: list[dict] = []

    def request(self, name: str, payload: bytes = b"", *, damage: bool = False) -> dict | None:
        sequence = self.sequence
        self.sequence += 1
        frame = proto.encode_frame(DEFINITION, 0, MSG[name], sequence, payload)
        if damage:
            frame = frame[:-1] + bytes([frame[-1] ^ 0x01])
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


def capabilities_now(link: "Link", field: str = "capabilities") -> int:
    """A field of a fresh hello."""
    body = link.request("HELLO", bytes([1]) + struct.pack("<H", 512))["payload"]
    capabilities, _state, _key, _idle, required = struct.unpack_from("<IBBHB", body, 5)
    return capabilities if field == "capabilities" else required


def u16(value: int) -> bytes:
    return struct.pack("<H", value)


def u32(value: int) -> bytes:
    return struct.pack("<I", value)


def open_payload(flags: int = 0) -> bytes:
    return bytes([flags]) + bytes(16) + bytes(16) + b"device-link-test".ljust(16, b"\0")


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="zplc-device-link-"))
    shell = None
    try:
        executable = build(work / "app")
        shell = Shell(executable)
        link = Link(shell)

        # ---- recognition ------------------------------------------------------------------------------------
        hello = link.request("HELLO", bytes([1]) + u16(512))
        check(hello is not None and hello["payload"][0] == 0, "a framed hello is answered through the shell")
        body = hello["payload"]
        version, transport, max_payload = body[1], body[2], struct.unpack_from("<H", body, 3)[0]
        capabilities, session_state, key_provisioned, idle = struct.unpack_from("<IBBH", body, 5)
        check((version, transport, max_payload) == (1, 0, 512), "version 1, a serial link, a payload of 512 bytes")
        for capability in ("SESSION", "MEMORY", "FORCE", "RUN_CONTROL", "BREAKPOINTS", "PROGRAM", "EVENTS", "WATCH"):
            check(capabilities & CAP[capability] != 0, f"the device offers {capability}")
        check(capabilities & (CAP["CONFIG"] | CAP["CREDENTIALS"]) == 0, "and does not offer what it has not bound")
        check(session_state == 0 and key_provisioned == 0 and idle == IDLE_SECONDS, "no session, no key, the configured idle time")

        identity = link.request("IDENTITY")
        check(identity is not None and identity["payload"][0] == 0, "the identity is answered")
        ident = identity["payload"][1:]
        abi_major, abi_minor, draft, io_hash = struct.unpack_from("<HHII", ident, 0)
        board_profile = ident[8 + 4 + 2 + 2 + 2 + 4 * 5 + 24 + 32:][:40].rstrip(b"\0").decode()
        handshake = json.loads(shell.run("zplc sys info --json"))
        check(set(handshake) == HANDSHAKE_KEYS, "zplc sys info --json keeps exactly the keys Studio's handshake accepts")
        check((abi_major, abi_minor, draft) == (handshake["bytecode_abi_major"], handshake["bytecode_abi_minor"], handshake["draft_counter"]),
              "the identity of the link is the identity of the shell: ABI and draft counter")
        io = json.loads(shell.run("zplc sys io --json"))
        check(f"{io_hash:08x}" == io["hash"], "and the hash of the I/O description")
        check(board_profile == handshake["board_profile"], "and the board profile")

        # ---- the session rule -------------------------------------------------------------------------------
        for name, payload in (
            ("MEM_WRITE", u16(0x2010) + b"\x01\x02\x03\x04"),
            ("FORCE_SET", u16(0x2020) + b"\xaa"),
            ("FORCE_CLEAR_ALL", b""),
            ("RUN", b""),
            ("STOP", b""),
            ("PAUSE", b""),
            ("BP_ADD", u16(2)),
            ("PROGRAM_BEGIN", u32(81) + u32(0)),
            ("KEY_SET", bytes(32)),
        ):
            answer = link.request(name, payload)
            check(link.status_of(answer) == ERR["NO_SESSION"], f"{name} without a session is refused")
        status = json.loads(shell.run("zplc sched status --json"))
        check(status["state"].lower() == "idle", "the scheduler is as it was")
        check(json.loads(shell.run("zplc dbg force list --json"))["count"] == 0, "no force was set")
        peek = shell.run("zplc dbg peek 0x2010 4")
        check("00 00 00 00" in peek, "the memory is as it was")

        # ---- a session, an atomic write, a refused range, a force ------------------------------------------
        opened = link.request("SESSION_OPEN", open_payload())
        check(link.status_of(opened) == 0, "a session opens")
        refused = link.request("SESSION_OPEN", open_payload())
        check(link.status_of(refused) == 0, "the same link opening again replaces its session")
        write = link.request("MEM_WRITE", u16(0x2010) + b"\x78\x56\x34\x12")
        check(link.status_of(write) == 0, "a four byte write is one request")
        read = link.request("MEM_READ", u16(0x2010) + u16(4))
        check(read is not None and read["payload"][1:] == b"\x78\x56\x34\x12", "and is whole when it is read back")
        check("78 56 34 12" in shell.run("zplc dbg peek 0x2010 4"), "and is what the shell sees")
        outside = link.request("MEM_WRITE", u16(0x3FFE) + bytes(4))
        check(link.status_of(outside) == ERR["RANGE"] and outside["payload"][1:] == struct.pack("<HHHH", 0x3FFE, 4, 0x2000, 0x4000),
              "a write across the end of WORK is refused with its address, length and region")
        output = link.request("MEM_WRITE", u16(0x1000) + b"\x01")
        check(link.status_of(output) == ERR["RANGE"], "a write to an output is refused: the scan owns it")

        force = link.request("FORCE_SET", u16(0x2020) + b"\xaa\xbb")
        check(link.status_of(force) == 0 and force["payload"][1] == 1, "a force is set")
        check(json.loads(shell.run("zplc dbg force list --json"))["count"] == 1, "and the shell sees it")
        closed = link.request("SESSION_CLOSE")
        check(link.status_of(closed) == 0 and closed["payload"][1] == 1, "the session is closed and says one force went with it")
        check(json.loads(shell.run("zplc dbg force list --json"))["count"] == 0, "the force is released: the outputs follow the program")
        after = link.request("MEM_WRITE", u16(0x2010) + b"\x01")
        check(link.status_of(after) == ERR["NO_SESSION"], "a write after the close is refused")

        # ---- a download, read back, and RUN as its own request --------------------------------------------
        # the artifact of the loader fixture: one cyclic task of 10 ms, accepted by the scheduler of the image
        artifact = bytes.fromhex((REPO / "firmware/lib/zplc_core/tests/fixtures/zplc-v1-code-task-tags.hex").read_text().strip())
        crc = zlib.crc32(artifact) & 0xFFFFFFFF
        check(link.status_of(link.request("SESSION_OPEN", open_payload())) == 0, "a session for the download")
        check(link.status_of(link.request("EVENTS_SET", u32(MASK["STATUS"] | MASK["FORCE"]))) == 0, "events are asked for")
        begun = link.request("PROGRAM_BEGIN", u32(len(artifact)) + u32(crc))
        check(link.status_of(begun) == 0, "the transfer starts")
        sent = 0
        steps = 0
        while sent < len(artifact):
            part = artifact[sent:sent + 32]
            answer = link.request("PROGRAM_CHUNK", u32(sent) + part)
            check(link.status_of(answer) == 0, f"chunk at {sent}")
            sent += len(part)
            steps += 1
        check(steps >= 2, "in more than one chunk, with progress")
        commit = link.request("PROGRAM_COMMIT")
        check(link.status_of(commit) == 0, f"the commit is accepted: validated, stored and activated (status {link.status_of(commit)})")
        size, read_crc, generation = struct.unpack_from("<III", commit["payload"], 1)
        check((size, read_crc) == (len(artifact), crc) and generation >= 1, "with the size and CRC-32 that the device holds")
        info = link.request("PROGRAM_INFO")
        check(info["payload"][1] == 1 and struct.unpack_from("<II", info["payload"], 2) == (len(artifact), crc), "and PROGRAM_INFO says the same")
        status = link.request("STATUS")
        check(status["payload"][1] == 0 and status["payload"][3] == 1, "the runtime is stopped after the download, with a program loaded")
        check(json.loads(shell.run("zplc sched status --json"))["state"].lower() == "idle", "which is what the shell says")

        run = link.request("RUN")
        check(link.status_of(run) == 0 and run["payload"][1] == 1, "RUN is a request of its own")
        link.pump(0.3)
        check(json.loads(shell.run("zplc sched status --json"))["state"].lower() == "running", "the shell sees the scheduler running")
        check(any(e["message"] == EVT["EVT_STATUS"] and e["payload"][0] == 1 for e in link.events), "and the change of state arrived as an event")
        mid = link.request("PROGRAM_BEGIN", u32(len(artifact)) + u32(crc))
        check(link.status_of(mid) == ERR["STATE"], "a download is not accepted while the program runs")
        check(link.status_of(link.request("STOP")) == 0, "STOP")

        # ---- a force that the session leaves behind, ended by the idle time -------------------------------
        check(link.status_of(link.request("FORCE_SET", u16(0x2030) + b"\x01")) == 0, "a force is set again")
        link.events.clear()
        time.sleep(IDLE_SECONDS + 1.5)
        link.pump(0.3)
        check(any(e["message"] == EVT["EVT_SESSION_END"] and e["payload"][0] == 1 for e in link.events),
              "the end of the session by idle time arrives as an event")
        check(json.loads(shell.run("zplc dbg force list --json"))["count"] == 0, "and the force is released")
        check(link.status_of(link.request("STOP")) == ERR["NO_SESSION"], "the session is gone")

        # ---- a device that holds a public key accepts only signed programs ---------------------------------
        check(link.status_of(link.request("SESSION_OPEN", open_payload())) == 0, "a session for the key")
        check(capabilities_now(link) & CAP["SIGNATURE"] != 0, "the image offers signed programs")
        seed = bytes(range(0x40, 0x60))
        check(link.status_of(link.request("SIGNING_KEY_SET", ed25519_ref.public_key(seed))) == 0, "the public key is given")
        check(capabilities_now(link, field="signature_required") == 1, "and the hello says programs have to be signed")

        def download(signature: bytes | None, content: bytes = artifact) -> dict | None:
            started = link.request("PROGRAM_BEGIN", u32(len(content)) + u32(zlib.crc32(content) & 0xFFFFFFFF))
            if link.status_of(started) != 0:
                return started
            for at in range(0, len(content), 32):
                link.request("PROGRAM_CHUNK", u32(at) + content[at:at + 32])
            if signature is not None:
                link.request("PROGRAM_SIGN", signature)
            return link.request("PROGRAM_COMMIT")

        unsigned = download(None)
        check(link.status_of(unsigned) == ERR["SIGNATURE_REQUIRED"], "an unsigned program is refused")
        signature = ed25519_ref.sign(seed, artifact)
        check(link.status_of(link.request("PROGRAM_SIGN", signature)) == 0, "the signature can follow the chunks")
        check(link.status_of(link.request("PROGRAM_COMMIT")) == 0, "and the commit then activates the program")
        stranger = ed25519_ref.sign(bytes(range(0x50, 0x70)), artifact)
        check(link.status_of(download(stranger)) == ERR["SIGNATURE_INVALID"], "a signature of another key is refused")
        altered = bytearray(artifact)
        altered[-1] ^= 0x01
        check(link.status_of(download(signature, bytes(altered))) == ERR["SIGNATURE_INVALID"], "a program changed after it was signed is refused")
        shell.run(f"zplc load {len(artifact)}")
        refused_by_shell = shell.run("zplc data " + artifact.hex())
        check("accepts only signed programs" in refused_by_shell, "the text shell refuses an upload while the device holds a key")
        check(link.status_of(link.request("SIGNING_KEY_CLEAR")) == 0, "the key is erased")
        check(link.status_of(download(None)) == 0, "and an unsigned program is accepted again")
        check(link.status_of(link.request("SESSION_CLOSE")) == 0, "the session is closed")

        # ---- a damaged frame is counted, not answered ---------------------------------------------------------
        before = link.request("LINK_STATS")["payload"]
        crc_errors_before = struct.unpack_from("<I", before, 1 + 4 * 2)[0]
        check(link.request("STATUS", damage=True) is None, "a frame with a bad checksum is not answered")
        after_stats = link.request("LINK_STATS")["payload"]
        check(struct.unpack_from("<I", after_stats, 1 + 4 * 2)[0] == crc_errors_before + 1, "and is counted")
    finally:
        if shell is not None:
            shell.close()
        shutil.rmtree(work, ignore_errors=True)
    print("PASS: framed device link on the firmware application, on native_sim (host evidence only)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
