#!/usr/bin/env python3
"""REL-023: the firmware application reports which build it is, on a real shell.

Builds firmware/app for native_sim/native (the 32-bit variant: the application does not build as 64-bit), starts
zephyr.exe with its UART on stdin and stdout, types the commands a person types, and checks what comes back:

  zplc version          the first line tools match, then commit, board, ABI, draft and options; no build date
  zplc sys build        the same as text, and as JSON with --json
  zplc sys info --json  keeps exactly the keys that Studio's strict handshake parser accepts (no new key), and
                        reports the same ABI version and draft counter as zplc sys build

Usage:  ZPLC_FW_WS=<west workspace> python3 firmware/tests/app_shell_identity/test_app_shell_identity.py
The workspace is the one tools/firmware-test/setup.sh makes; its `zplc` entry must be this checkout. Host results are
not hardware evidence.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
WORKSPACE = Path(os.environ.get("ZPLC_FW_WS", Path.home() / "zplc-zephyr-ws"))
PROMPT = "zplc:~$"
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
# deviceHandshake.ts of Studio accepts exactly these root keys of `zplc sys info --json`
HANDSHAKE_KEYS = {
    "board", "board_profile", "zplc_version", "zephyr_version", "uptime_ms", "cpu_freq_mhz",
    "device_protocol_version", "bytecode_abi_major", "bytecode_abi_minor", "capabilities", "memory", "draft_counter",
}
IO_KEYS = {"schema", "board_id", "hash", "channels", "input_bytes", "output_bytes"}
IDENTITY_KEYS = {
    "version", "commit", "dirty", "board", "abi_major", "abi_minor", "draft_counter", "options_hash", "options",
}


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
    # the environment of tools/firmware-test/run.sh: PATH with west, ZEPHYR_BASE, the toolchain variant
    command = (
        f'. "{REPO}/tools/firmware-test/env.sh" && cd "{WORKSPACE}" && '
        f'west build -p always -b native_sim/native zplc/firmware/app -d "{directory}"'
    )
    log = directory.with_suffix(".log")
    with open(log, "w", encoding="utf-8") as out:
        result = subprocess.run(["bash", "-c", command], env={**os.environ, "ZPLC_FW_WS": str(WORKSPACE)}, stdout=out, stderr=subprocess.STDOUT)
    if result.returncode != 0:
        print(Path(log).read_text(encoding="utf-8")[-3000:])
        fail("west build of firmware/app for native_sim/native failed")
    return directory / "zephyr" / "zephyr.exe"


class Shell:
    """The shell of a running zephyr.exe: send a line, read until the next prompt."""

    def __init__(self, executable: Path) -> None:
        self.process = subprocess.Popen(
            [str(executable), "-uart_stdinout", "-flash_in_ram", "-rt", "-stop_at=120"],
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
            time.sleep(0.05)
        fail(f"no shell prompt within {timeout} s; got: {ANSI.sub('', self.buffer)[-400:]!r}")
        return ""

    def run(self, line: str) -> str:
        assert self.process.stdin is not None
        self.process.stdin.write((line + "\r").encode())
        self.process.stdin.flush()
        text = self._wait_for_prompt(15.0).replace("\r", "")
        lines = [part for part in text.split("\n") if part.strip() != ""]
        # the echo of the command is the first line, the prompt the last
        return "\n".join(part for part in lines if not part.strip().startswith(PROMPT) and part.strip() != line)

    def close(self) -> None:
        self.process.kill()
        self.process.wait()


def expected_values() -> dict[str, str]:
    """What the build must report: the version of package.json and the commit that git says HEAD is."""
    version = json.loads((REPO / "package.json").read_text(encoding="utf-8"))["version"]
    head = subprocess.run(["git", "-C", str(REPO), "rev-parse", "HEAD"], capture_output=True, text=True)
    commit = head.stdout.strip() if head.returncode == 0 else "unknown"
    return {"version": version, "commit": commit}


def main() -> int:
    expected = expected_values()
    work = Path(tempfile.mkdtemp(prefix="zplc-shell-identity-"))
    shell = None
    try:
        executable = build(work / "app")
        shell = Shell(executable)

        version = shell.run("zplc version").split("\n")
        check(version[0] == f"ZPLC Runtime v{expected['version']}", "zplc version starts with the line that the bench scripts match")
        text = "\n".join(version)
        check(re.search(r"^Commit:\s+" + re.escape(expected["commit"]) + r"$", text, re.M) is not None, "zplc version reports the commit the image was built from")
        check(re.search(r"^Board:\s+native_sim/native$", text, re.M) is not None, "zplc version reports the board")
        check(re.search(r"^Bytecode ABI:\s+\d+\.\d+$", text, re.M) is not None, "zplc version reports the bytecode ABI")
        check(re.search(r"^Contract draft:\s+\d+$", text, re.M) is not None, "zplc version reports the contract draft")
        check(re.search(r"^Options hash:\s+[0-9a-f]{8}$", text, re.M) is not None, "zplc version reports the options hash")
        check(re.search(r"^Options:\s+\S*SCHEDULER=y\S*$", text, re.M) is not None, "zplc version lists the build options")
        check(re.search(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) +\d+ +\d{4}\b", text) is None, "zplc version carries no build date, so one commit gives one image")

        build_text = shell.run("zplc sys build")
        check(build_text.split("\n")[0] == f"ZPLC Runtime v{expected['version']}" and "Commit:" in build_text, "zplc sys build prints the same identity")

        identity = json.loads(shell.run("zplc sys build --json"))
        check(set(identity) == IDENTITY_KEYS, "zplc sys build --json has the documented keys")
        check(identity["version"] == expected["version"] and identity["commit"] == expected["commit"], "the JSON carries the version and the commit")
        check(identity["board"] == "native_sim/native", "the JSON names the board")
        check(re.fullmatch(r"[0-9a-f]{8}", identity["options_hash"]) is not None and "SCHEDULER=y" in identity["options"], "the JSON carries the options and their hash")
        check(isinstance(identity["dirty"], bool), "the JSON says whether the tree was dirty")

        info = shell.run("zplc sys info")
        check(re.search(r"^\s*Commit:\s+" + re.escape(expected["commit"]), info, re.M) is not None, "zplc sys info names the commit")

        handshake = json.loads(shell.run("zplc sys info --json"))
        check(set(handshake) == HANDSHAKE_KEYS, "zplc sys info --json keeps exactly the keys Studio's handshake accepts")
        check(handshake["zplc_version"] == expected["version"], "the handshake reports the same version")
        # the two commands print numbers from the same macros of zplc_isa.h; they must agree
        check(
            (handshake["bytecode_abi_major"], handshake["bytecode_abi_minor"], handshake["draft_counter"])
            == (identity["abi_major"], identity["abi_minor"], identity["draft_counter"]),
            "the handshake and zplc sys build report the same ABI version and draft counter",
        )

        # The identity of the board I/O description is a command of its own (IO-004), not a key of the handshake.
        io = json.loads(shell.run("zplc sys io --json"))
        check(
            set(io) == IO_KEYS and io["schema"] == 1 and re.fullmatch(r"[0-9a-f]{8}", io["hash"]) is not None,
            "zplc sys io --json reports the identity of the I/O description",
        )
        check("io" not in handshake, "the handshake does not carry the I/O identity")
    finally:
        if shell is not None:
            shell.close()
        shutil.rmtree(work, ignore_errors=True)
    print("PASS: firmware application identity on native_sim (host evidence only)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
