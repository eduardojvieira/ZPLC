#!/usr/bin/env python3
"""CRC32 cross-check between the C loader and the TypeScript assembler (HIL-017).

The container carries a CRC32 over the whole file except its own four bytes.
Three implementations have to agree on it: the C loader that verifies it
(firmware/lib/zplc_core/src/core/zplc_loader.c), the TypeScript assembler that
writes it (packages/zplc-compiler/src/assembler/codegen.ts) and zlib, which the
Python assembler uses. This script runs the first two on the same byte strings,
in separate processes, and compares them with zlib. A byte string at a time it
also asks the C loader to verify artifacts written by the TypeScript and Python
assemblers, the one the HIL Modbus script builds by hand and every committed
examples/*.zplc, and the verdicts of an artifact built for another draft of the
contract and of one built before the counter (CMP-052).

Needs a C compiler (cc, gcc or clang) and bun on PATH.

Usage: python3 tools/contract/crc_cross.py   (exit 0 when all agree)
"""
from __future__ import annotations

import importlib.util
import json
import shutil
import struct
import subprocess
import sys
import tempfile
import types
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOADER_C = ROOT / "firmware/lib/zplc_core/src/core/zplc_loader.c"
INCLUDE = ROOT / "firmware/lib/zplc_core/include"

C_PROBE = r'''
#include <stdio.h>
#include <stdlib.h>
#include "%(loader)s"

/* CRC of a hex string on each stdin line, then the verdict of the loader for each artifact line. */
static int hexval(int c) { return c <= '9' ? c - '0' : (c | 32) - 'a' + 10; }

int main(void) {
  static char line[1 << 17];
  static uint8_t bytes[1 << 16];
  static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  while (fgets(line, sizeof line, stdin) != NULL) {
    char mode = line[0];
    size_t n = 0, i = 2;
    while (line[i] != '\n' && line[i] != '\0') {
      bytes[n++] = (uint8_t)((hexval(line[i]) << 4) | hexval(line[i + 1]));
      i += 2;
    }
    if (mode == 'c') {
      printf("%%08x\n", (unsigned)(crc32_update(0xFFFFFFFFU, bytes, n) ^ 0xFFFFFFFFU));
    } else {
      zplc_program_view_t view;
      printf("%%d\n", zplc_loader_verify(bytes, n, workspace, sizeof workspace, &view));
    }
  }
  return 0;
}
'''

TS_PROBE = r'''
import { crc32, createZplcFile } from %(codegen)s;
const lines = (await Bun.stdin.text()).split("\n").filter((l) => l.length > 0);
const out: string[] = [];
for (const line of lines) {
  const hex = line.slice(2);
  const bytes = new Uint8Array(hex.length / 2).map((_, i) => parseInt(hex.slice(2 * i, 2 * i + 2), 16));
  if (line[0] === "c") out.push(crc32(bytes).toString(16).padStart(8, "0"));
}
// An artifact written by the TypeScript assembler: NOP, HALT.
const artifact = createZplcFile(new Uint8Array([0x00, 0x01]), 0);
out.push(Array.from(artifact, (b) => b.toString(16).padStart(2, "0")).join(""));
console.log(out.join("\n"));
'''


def vectors() -> list[bytes]:
    state, noise = 12345, bytearray()
    for _ in range(300):
        state = (state * 1103515245 + 12345) & 0x7FFFFFFF
        noise.append((state >> 16) & 0xFF)
    return [b"", b"\x00", b"123456789", bytes(range(256)), bytes(noise), b"\xff" * 64]


def python_artifact() -> bytes:
    sys.path.insert(0, str(ROOT / "tools"))
    try:
        from zplc_asm import ZPLCAssembler  # noqa: PLC0415
    finally:
        sys.path.pop(0)
    asm = ZPLCAssembler()
    return asm.create_zplc_file(asm.assemble("NOP\nHALT"))


def hil_artifact() -> bytes:
    """The artifact tools/hil/test_modbus_tcp.py builds by hand. The script imports pyserial, which is stubbed here."""
    stub = types.ModuleType("serial")
    stub.Serial = object
    saved = sys.modules.get("serial")
    sys.modules["serial"] = stub
    try:
        spec = importlib.util.spec_from_file_location("test_modbus_tcp_probe", ROOT / "tools/hil/test_modbus_tcp.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.build_zplc_binary()
    finally:
        if saved is None:
            sys.modules.pop("serial", None)
        else:
            sys.modules["serial"] = saved


def with_counter(artifact: bytes, counter: int) -> bytes:
    """The artifact with another draft counter (header word 28) and a CRC that still matches."""
    body = artifact[:28] + struct.pack("<I", counter) + artifact[32:]
    crc = zlib.crc32(body[:12] + body[16:]) & 0xFFFFFFFF
    return body[:12] + struct.pack("<I", crc) + body[16:]


def run() -> dict:
    cc = shutil.which("cc") or shutil.which("gcc") or shutil.which("clang")
    bun = shutil.which("bun")
    if cc is None or bun is None:
        raise SystemExit("crc_cross.py needs a C compiler and bun on PATH")
    cases = vectors()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "probe.c").write_text(C_PROBE % {"loader": str(LOADER_C)})
        subprocess.run([cc, "-std=c99", "-I", str(INCLUDE), str(tmp_path / "probe.c"), "-o", str(tmp_path / "probe")], check=True)
        (tmp_path / "probe.ts").write_text(TS_PROBE % {"codegen": json.dumps(str(ROOT / "packages/zplc-compiler/src/assembler/codegen.ts"))})
        crc_input = "".join(f"c {case.hex()}\n" for case in cases)
        c_crc = subprocess.run([str(tmp_path / "probe")], input=crc_input, check=True, capture_output=True, text=True).stdout.split()
        ts_out = subprocess.run([bun, str(tmp_path / "probe.ts")], input=crc_input, check=True, capture_output=True, text=True, cwd=ROOT).stdout.split()
        ts_crc, ts_artifact = ts_out[: len(cases)], bytes.fromhex(ts_out[len(cases)])
        py_artifact = python_artifact()
        tampered = bytearray(ts_artifact)
        tampered[-1] ^= 0x01
        artifacts = {
            "typescript_artifact": ts_artifact,
            "python_artifact": py_artifact,
            "tampered_artifact": bytes(tampered),
            "hil_modbus_artifact": hil_artifact(),
            "other_draft_artifact": with_counter(ts_artifact, struct.unpack_from("<I", ts_artifact, 28)[0] + 1),
            "no_counter_artifact": with_counter(ts_artifact, 0),
        }
        for example in sorted((ROOT / "examples").glob("*.zplc")):
            artifacts[f"examples/{example.name}"] = example.read_bytes()
        verify_input = "".join(f"v {a.hex()}\n" for a in artifacts.values())
        verdicts = [int(v) for v in subprocess.run([str(tmp_path / "probe")], input=verify_input, check=True, capture_output=True, text=True).stdout.split()]
    return {
        "vectors": [case.hex()[:16] for case in cases],
        "c": c_crc,
        "ts": ts_crc,
        "zlib": [f"{zlib.crc32(case) & 0xFFFFFFFF:08x}" for case in cases],
        "loader_verdicts": dict(zip(artifacts, verdicts)),
    }


def problems(result: dict) -> list[str]:
    """What disagrees in a result of run(); an empty list is agreement."""
    found = []
    for position, vector in enumerate(result["vectors"]):
        c, ts, zl = result["c"][position], result["ts"][position], result["zlib"][position]
        if not c == ts == zl:
            found.append(f"CRC32 of vector {position} ({vector}...): C {c}, TypeScript {ts}, zlib {zl}")
    if not result["vectors"]:
        found.append("no test vector was compared")
    verdicts = result["loader_verdicts"]
    rejected = ("tampered_artifact", "other_draft_artifact", "no_counter_artifact")
    for name, verdict in verdicts.items():
        if name in rejected and verdict == 0:
            found.append(f"the C loader accepted {name}, which it must refuse")
        if name not in rejected and verdict != 0:
            found.append(f"the C loader refused {name} (verdict {verdict}), which it must accept")
    for name in rejected:
        if name not in verdicts:
            found.append(f"no verdict for {name}")
    return found


def main() -> int:
    result = run()
    print(json.dumps(result, indent=2))
    issues = problems(result)
    for issue in issues:
        print(f"MISMATCH: {issue}", file=sys.stderr)
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
