#!/usr/bin/env python3
"""The depth the compiler declares is the one the C loader measures (CMP-050, CMP-051).

The compiler computes, for each task, the most values it holds on the evaluation stack and the
most call frames it has active, and records them in the TASK segment (`stack_size`, `call_depth`).
The loader proves the same two numbers by its own analysis and refuses a task that needs more than
it declares. So the declared number is the loader's measure exactly when

  * the loader accepts the artifact as the compiler wrote it, and
  * it refuses the artifact with the declared number lowered by one.

This script compiles every Structured Text case of `conformance/` that builds as one program, then
asks the C loader (zplc_loader.c, compiled here with the host compiler) both questions for every
task of every artifact. A declared depth above what the loader measures is a failure too: it would
let a target be sized for more than the program needs.

Needs a C compiler (cc, gcc or clang) and bun on PATH.

Usage: python3 tools/contract/depth_cross.py   (exit 0 when every artifact agrees)
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
ERR_STACK = -18

C_PROBE = r'''
#include <stdio.h>
#include <stdlib.h>
#include "%(loader)s"

static int hexval(int c) { return c <= '9' ? c - '0' : (c | 32) - 'a' + 10; }

/* one artifact as hex on each stdin line; the verdict of the loader on each */
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
      printf("%%d\n", zplc_loader_verify(bytes, n, workspace, sizeof workspace, &view));
    }
  }
  return 0;
}
'''

COMPILE = r'''
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { compileMultiTaskProject } from %(compiler)s;

const root = %(root)s;
const found: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".st")) found.push(path);
  }
};
walk(root);
const config = { name: "Depth", version: "1.0.0", tasks: [{ name: "MainTask", trigger: "cyclic" as const, interval: 10, priority: 1, programs: ["main"] }] };
const out: Array<{ name: string; hex: string }> = [];
for (const path of found) {
  try {
    const result = compileMultiTaskProject(config, [{ name: "main", content: readFileSync(path, "utf8"), sourceRef: "src/main.st" }]);
    out.push({ name: path.slice(root.length + 1), hex: Buffer.from(result.zplcFile).toString("hex") });
  } catch {
    // a case that is meant not to build, or one that needs more files than this
  }
}
console.log(JSON.stringify(out));
'''


def crc_fix(data: bytearray) -> bytes:
    struct.pack_into("<I", data, 12, zlib.crc32(bytes(data[:12]) + bytes(data[16:])) & 0xFFFFFFFF)
    return bytes(data)


def task_slots(artifact: bytes) -> list[int]:
    """The offset of each task definition of an artifact."""
    segments = struct.unpack_from("<H", artifact, 26)[0]
    offset = 32 + 8 * segments
    for index in range(segments):
        kind, _flags, size = struct.unpack_from("<HHI", artifact, 32 + 8 * index)
        if kind == 0x20:
            return [offset + at for at in range(0, size, 16)]
        offset += size
    return []


def run() -> dict:
    cc = shutil.which("cc") or shutil.which("gcc") or shutil.which("clang")
    bun = shutil.which("bun")
    if cc is None or bun is None:
        raise SystemExit("depth_cross.py needs a C compiler and bun on PATH")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "probe.c").write_text(C_PROBE % {"loader": str(LOADER_C)})
        subprocess.run([cc, "-std=c99", "-I", str(INCLUDE), str(tmp_path / "probe.c"), "-o", str(tmp_path / "probe")], check=True)
        (tmp_path / "compile.ts").write_text(COMPILE % {
            "compiler": json.dumps(str(ROOT / "packages/zplc-compiler/src/compiler/index.ts")),
            "root": json.dumps(str(ROOT / "conformance")),
        })
        built = json.loads(subprocess.run([bun, str(tmp_path / "compile.ts")], check=True, capture_output=True, text=True, cwd=ROOT).stdout)

        probes: list[tuple[str, str, bytes]] = []  # (artifact name, what, bytes)
        for entry in built:
            artifact = bytes.fromhex(entry["hex"])
            probes.append((entry["name"], "as written", artifact))
            for index, slot in enumerate(task_slots(artifact)):
                stack, calls = struct.unpack_from("<HH", artifact, slot + 10)
                if stack > 1:
                    lowered = bytearray(artifact)
                    struct.pack_into("<H", lowered, slot + 10, stack - 1)
                    probes.append((entry["name"], f"task {index} stack_size {stack} - 1", crc_fix(lowered)))
                if calls > 1:
                    lowered = bytearray(artifact)
                    struct.pack_into("<H", lowered, slot + 12, calls - 1)
                    probes.append((entry["name"], f"task {index} call_depth {calls} - 1", crc_fix(lowered)))
        feed = "".join(f"{probe[2].hex()}\n" for probe in probes)
        verdicts = [int(v) for v in subprocess.run([str(tmp_path / "probe")], input=feed, check=True, capture_output=True, text=True).stdout.split()]

    wrong: list[str] = []
    lowered_checked = 0
    for (name, what, _), verdict in zip(probes, verdicts):
        if what == "as written":
            if verdict != 0:
                wrong.append(f"{name}: the loader refused the artifact as written ({verdict})")
        else:
            lowered_checked += 1
            if verdict != ERR_STACK:
                wrong.append(f"{name}: the loader gave {verdict} with {what}, expected {ERR_STACK}: the declared depth is more than it measures")
    return {"artifacts": len(built), "lowered": lowered_checked, "wrong": wrong}


def main() -> int:
    result = run()
    print(json.dumps({"artifacts": result["artifacts"], "lowered": result["lowered"], "wrong": len(result["wrong"])}))
    for line in result["wrong"][:20]:
        print(line, file=sys.stderr)
    return 1 if result["wrong"] or result["artifacts"] < 300 or result["lowered"] < 300 else 0


if __name__ == "__main__":
    sys.exit(main())
