#!/usr/bin/env python3
"""The safe values the compiler declares are the ones the C loader reads (RT-023).

A project declares the value an output takes in the safe state; the compiler writes it to the SAFE
segment of the artifact (`zplc_safe_entry_t`: offset u16, bit u8, value u8) and the loader hands the
entries to the runtime. Two sides wrote this layout independently, so this script compiles artifacts
that declare 0, 1, a few and the most entries, and asks the C loader (zplc_loader.c, compiled here
with the host compiler) what it reads:

  * it accepts each artifact as the compiler wrote it, and reports as many entries as were declared;
  * it refuses, with ZPLC_LOADER_ERR_SAFE, the same artifact with an entry the loader must not take:
    an offset past the output image, a bit above 7, a value other than 0 or 1, an output twice, a
    segment that is not whole entries, one entry more than the most.

Needs a C compiler (cc, gcc or clang) and bun on PATH.

Usage: python3 tools/contract/safe_cross.py   (exit 0 when the compiler and the loader agree)
"""
from __future__ import annotations

import json
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOADER_C = ROOT / "firmware/lib/zplc_core/src/core/zplc_loader.c"
INCLUDE = ROOT / "firmware/lib/zplc_core/include"
ERR_SAFE = -19
SEG_SAFE = 0x41
ENTRY = 4
MAX_ENTRIES = 64

C_PROBE = r'''
#include <stdio.h>
#include <stdlib.h>
#include "%(loader)s"

static int hexval(int c) { return c <= '9' ? c - '0' : (c | 32) - 'a' + 10; }

/* one artifact as hex on each stdin line; the verdict of the loader, and how many safe entries it read */
int main(void) {
  static char line[1 << 17];
  static uint8_t bytes[1 << 16];
  static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  while (fgets(line, sizeof line, stdin) != NULL) {
    size_t n = 0, i = 0;
    while (line[i] != '\n' && line[i] != '\0') {
      bytes[n++] = (uint8_t)((hexval(line[i]) << 4) | hexval(line[i + 1]));
      i += 2;
    }
    {
      zplc_program_view_t view;
      int verdict = zplc_loader_verify(bytes, n, workspace, sizeof workspace, &view);
      printf("%%d %%u\n", verdict, verdict == 0 ? (unsigned)view.safe_count : 0U);
    }
  }
  return 0;
}
'''

COMPILE = r'''
import { compileMultiTaskProject } from %(compiler)s;

const config = { name: "Safe", version: "1.0.0", tasks: [{ name: "MainTask", trigger: "cyclic" as const, interval: 10, priority: 1, programs: ["main"] }] };
const source = "PROGRAM Main\nVAR led AT %%QX0.0 : BOOL; END_VAR\n    led := TRUE;\nEND_PROGRAM";
const sets: Array<Array<{ offset: number; bit: number; value: 0 | 1 }>> = [
  [],
  [{ offset: 0, bit: 0, value: 1 }],
  [{ offset: 0, bit: 0, value: 1 }, { offset: 0, bit: 7, value: 0 }, { offset: 4095, bit: 7, value: 1 }],
  Array.from({ length: %(max)d }, (_, index) => ({ offset: Math.floor(index / 8), bit: index %% 8, value: ((index * 5) %% 2) as 0 | 1 })),
];
const out = sets.map((safeOutputs) => {
  const result = compileMultiTaskProject(config, [{ name: "main", content: source, sourceRef: "src/main.st" }], { safeOutputs });
  return { declared: safeOutputs.length, hex: Buffer.from(result.zplcFile).toString("hex") };
});
console.log(JSON.stringify(out));
'''


def crc_fix(data: bytearray) -> bytes:
    struct.pack_into("<I", data, 12, zlib.crc32(bytes(data[:12]) + bytes(data[16:])) & 0xFFFFFFFF)
    return bytes(data)


def safe_segment(artifact: bytes) -> tuple[int, int] | None:
    """(offset, size) of the SAFE segment of an artifact, or None."""
    segments = struct.unpack_from("<H", artifact, 26)[0]
    offset = 32 + 8 * segments
    for index in range(segments):
        kind, _flags, size = struct.unpack_from("<HHI", artifact, 32 + 8 * index)
        if kind == SEG_SAFE:
            return offset, size
        offset += size
    return None


def with_entries(artifact: bytes, entries: bytes) -> bytes:
    """The artifact with the payload of its SAFE segment replaced (the segment is resized)."""
    found = safe_segment(artifact)
    assert found is not None, "the artifact has no SAFE segment to replace"
    offset, size = found
    data = bytearray(artifact[:offset]) + entries + bytearray(artifact[offset + size:])
    segments = struct.unpack_from("<H", data, 26)[0]
    for index in range(segments):
        at = 32 + 8 * index
        kind = struct.unpack_from("<H", data, at)[0]
        if kind == SEG_SAFE:
            struct.pack_into("<I", data, at + 4, len(entries))
    data_size = struct.unpack_from("<I", data, 20)[0]
    struct.pack_into("<I", data, 20, data_size - size + len(entries))
    return crc_fix(data)


def run() -> dict:
    cc = shutil.which("cc") or shutil.which("gcc") or shutil.which("clang")
    bun = shutil.which("bun")
    if cc is None or bun is None:
        raise SystemExit("safe_cross.py needs a C compiler and bun on PATH")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "probe.c").write_text(C_PROBE % {"loader": str(LOADER_C)})
        subprocess.run([cc, "-std=c99", "-I", str(INCLUDE), str(tmp_path / "probe.c"), "-o", str(tmp_path / "probe")], check=True)
        (tmp_path / "compile.ts").write_text(COMPILE % {
            "compiler": json.dumps(str(ROOT / "packages/zplc-compiler/src/compiler/index.ts")),
            "max": MAX_ENTRIES,
        })
        built = json.loads(subprocess.run([bun, str(tmp_path / "compile.ts")], check=True, capture_output=True, text=True, cwd=ROOT).stdout)

        probes: list[tuple[str, int | None, bytes]] = []  # (what, expected verdict, bytes)
        for entry in built:
            artifact = bytes.fromhex(entry["hex"])
            probes.append((f"{entry['declared']} declared, as written", 0, artifact))
        sample = bytes.fromhex(built[2]["hex"])  # three entries
        good = struct.pack("<HBB", 0, 0, 1)
        mutations = {
            "an offset past the output image": struct.pack("<HBB", 0x1000, 0, 1),
            "a bit above 7": struct.pack("<HBB", 0, 8, 1),
            "a value other than 0 or 1": struct.pack("<HBB", 0, 0, 2),
            "an output declared twice": good + struct.pack("<HBB", 0, 0, 0),
            "a segment that is not whole entries": good + b"\x00",
            "one entry more than the most": b"".join(struct.pack("<HBB", i // 8, i % 8, 1) for i in range(MAX_ENTRIES + 1)),
        }
        for what, payload in mutations.items():
            probes.append((what, ERR_SAFE, with_entries(sample, payload)))

        feed = "".join(f"{probe[2].hex()}\n" for probe in probes)
        verdicts = [line.split() for line in subprocess.run([str(tmp_path / "probe")], input=feed, check=True, capture_output=True, text=True).stdout.splitlines()]

    wrong: list[str] = []
    for (what, expected, _), (verdict, count) in zip(probes, verdicts):
        if int(verdict) != expected:
            wrong.append(f"{what}: the loader gave {verdict}, expected {expected}")
    for entry, (verdict, count) in zip(built, verdicts):
        if int(verdict) == 0 and int(count) != entry["declared"]:
            wrong.append(f"{entry['declared']} declared: the loader read {count} entries")
    return {"checked": len(probes), "wrong": wrong}


def main() -> int:
    result = run()
    print(json.dumps({"checked": result["checked"], "wrong": len(result["wrong"])}))
    for line in result["wrong"][:20]:
        print(line, file=sys.stderr)
    return 1 if result["wrong"] or result["checked"] < 10 else 0


if __name__ == "__main__":
    sys.exit(main())
