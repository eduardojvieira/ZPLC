#!/usr/bin/env python3
"""The compiler, the VM and the handlers read one STRING layout (COM-005, VF-012).

A communication block is called with STRING arguments (`TOPIC := 'plant/a'`). The compiler puts
them into the instance, the VM hands the instance to the handler of the block's kind, and the
handler reads each STRING member at the offset of the generated table, in the layout of the
generated string table (`[len u16][cap u16][data][terminator]`). The three agree when the text
the handler reads is the text the program passed, member by member.

This script compiles one Structured Text program that calls all twelve blocks with a different
text for each STRING input, loads the artifact into the C VM (zplc_core.c and the loader, compiled
here with the host compiler), registers for every kind a probe handler that reads each STRING
member through the accessors the product handlers use (firmware/app/src/zplc_comm_fb_access.h)
with offsets and sizes from the generated header, and compares what the handlers saw with what the
program passed. A text that is not the text, a member that runs into its neighbour, and a block
that the compiler lays out differently from the table are all a difference here.

Needs a C compiler (cc, gcc or clang) and bun on PATH.

Usage: python3 tools/contract/string_cross.py   (exit 0 when every member reads back)
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INCLUDE = ROOT / "firmware/lib/zplc_core/include"
CORE = ROOT / "firmware/lib/zplc_core/src"
ACCESS = ROOT / "firmware/app/src"

# Every STRING input of every block, with the text the program passes. The texts differ in length and
# content, so a member that is read from a neighbour or cut at the wrong place is a different text.
PROGRAM = """PROGRAM Strings
VAR
  MbRead : MB_READ_HREG;
  MbWrite : MB_WRITE_HREG;
  CoilRead : MB_READ_COIL;
  CoilWrite : MB_WRITE_COIL;
  Connect : MQTT_CONNECT;
  Pub : MQTT_PUBLISH;
  Sub : MQTT_SUBSCRIBE;
  C2d : AZURE_C2D_RECV;
  Dps : AZURE_DPS_PROV;
  Eg : AZURE_EG_PUB;
  Fleet : AWS_FLEET_PROV;
  Rebirth : SPB_REBIRTH;
  Held : STRING[80] := 'from-a-variable-that-is-as-long-as-the-member-can-hold-for-sure-eighty-chars!!';
END_VAR
  MbRead(EN := TRUE, PROTO := 1, SLAVE_ID := 2, ADDR := 3, COUNT := 1, HOST := '10.0.0.1', PORT := 502);
  MbWrite(EN := TRUE, PROTO := 1, SLAVE_ID := 2, ADDR := 3, COUNT := 1, VALUE := 7, HOST := 'write.local', PORT := 503);
  CoilRead(EN := TRUE, PROTO := 1, SLAVE_ID := 2, ADDR := 3, COUNT := 1, HOST := 'coil-r', PORT := 504);
  CoilWrite(EN := TRUE, PROTO := 1, SLAVE_ID := 2, ADDR := 3, COUNT := 1, VALUE := TRUE, HOST := Held, PORT := 505);
  Connect(EN := TRUE, PROFILE := 0);
  Pub(EN := TRUE, QOS := 1, RETAIN := FALSE, TOPIC := 'plant/a/b', PAYLOAD := '{"v":1}');
  Sub(EN := TRUE, QOS := 1, TOPIC := 'plant/cmd/#');
  C2d(EN := TRUE);
  Dps(EN := TRUE, DEVICE_ID := 'device-0042');
  Eg(EN := TRUE, TOPIC := 'events/line-1', EVENT_TYPE := 'com.zplc.alarm', PAYLOAD := '{"alarm":"high"}');
  Fleet(EN := TRUE, TEMPLATE_NAME := 'fleet-template');
  Rebirth(EN := TRUE);
END_PROGRAM
"""

EXPECTED = {
    "MB_READ_HREG": {"HOST": "10.0.0.1"},
    "MB_WRITE_HREG": {"HOST": "write.local"},
    "MB_READ_COIL": {"HOST": "coil-r"},
    "MB_WRITE_COIL": {"HOST": "from-a-variable-that-is-as-long-as-the-member-can-hold-for-sure-eighty-chars!!"},
    "MQTT_PUBLISH": {"TOPIC": "plant/a/b", "PAYLOAD": '{"v":1}'},
    "MQTT_SUBSCRIBE": {"TOPIC": "plant/cmd/#", "PAYLOAD": ""},
    "AZURE_C2D_RECV": {"PAYLOAD": ""},
    "AZURE_DPS_PROV": {"DEVICE_ID": "device-0042", "ASSIGNED_HUB": ""},
    "AZURE_EG_PUB": {"TOPIC": "events/line-1", "EVENT_TYPE": "com.zplc.alarm", "PAYLOAD": '{"alarm":"high"}'},
    "AWS_FLEET_PROV": {"TEMPLATE_NAME": "fleet-template", "THING_NAME": ""},
}

C_PROBE = r'''
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "zplc_comm_dispatch.h"
#include "zplc_core.h"
#include "zplc_isa.h"
#include "zplc_comm_fb_access.h"

#define STRING_BYTES (ZPLC_STRING_DATA_OFFSET + ZPLC_STRING_DEFAULT_SIZE + 1)

/* Every member of the generated member table; the STRING ones are those that reserve STRING_BYTES. */
struct member { int kind; const char *name; unsigned offset; unsigned bytes; };
static const struct member members[] = {
#define X(BLOCK, MEMBER, OFFSET, BYTES) { ZPLC_COMM_FB_##BLOCK, #MEMBER, OFFSET, BYTES },
  ZPLC_COMM_MEMBER_TABLE(X)
#undef X
};

static const char *block_name(int kind) {
  switch (kind) {
#define X(NAME, KIND, SIZE) case KIND: return #NAME;
  ZPLC_COMM_FB_TABLE(X)
#undef X
  default: return "?";
  }
}

/* The handler type is the one of the header this probe is built against. */
#ifdef ZPLC_COMM_HANDLER_DONE
typedef zplc_comm_call_t probe_call_t;
#define PROBE_RESULT ZPLC_COMM_HANDLER_DONE
#else
typedef bool probe_call_t;
#define PROBE_RESULT 0
#endif

static int probe(zplc_comm_fb_kind_t kind, uint8_t *fb, uint16_t len, probe_call_t call) {
  size_t i;
  (void)call;
  for (i = 0; i < sizeof members / sizeof members[0]; i++) {
    if (members[i].kind == (int)kind && members[i].bytes == STRING_BYTES) {
      char text[ZPLC_STRING_DEFAULT_SIZE + 8];
      (void)zplc_fb_string_copy(text, sizeof text, fb, len, (uint16_t)members[i].offset, STRING_BYTES);
      printf("%s %s %s\n", block_name((int)kind), members[i].name, text);
    }
  }
  return PROBE_RESULT;
}

int main(void) {
  static uint8_t program[1 << 16];
  static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  size_t n = 0, i;
  int c;
  static const zplc_comm_fb_kind_t kinds[] = {
#define X(NAME, KIND, SIZE) KIND,
    ZPLC_COMM_FB_TABLE(X)
#undef X
  };

  while ((c = getchar()) != EOF) {
    int hi = c, lo = getchar();
    if (hi == '\n' || lo == EOF) break;
    hi = hi <= '9' ? hi - '0' : (hi | 32) - 'a' + 10;
    lo = lo <= '9' ? lo - '0' : (lo | 32) - 'a' + 10;
    program[n++] = (uint8_t)((hi << 4) | lo);
  }
  if (zplc_core_init() != 0) { puts("init failed"); return 2; }
  for (i = 0; i < sizeof kinds / sizeof kinds[0]; i++) {
    if (zplc_comm_register_handler(kinds[i], probe) != 0) { puts("register failed"); return 2; }
  }
  if (zplc_core_load(program, n, workspace, sizeof workspace) != 0) { puts("load failed"); return 2; }
  if (zplc_core_run_cycle() < 0) { puts("run failed"); return 2; }
  return 0;
}
'''

COMPILE = r'''
import { compileMultiTaskProject } from %(compiler)s;

const config = { name: "Strings", version: "1.0.0", tasks: [{ name: "MainTask", trigger: "cyclic" as const, interval: 10, priority: 1, programs: ["main"] }] };
const result = compileMultiTaskProject(config, [{ name: "main", content: %(source)s, sourceRef: "src/main.st" }]);
console.log(Buffer.from(result.zplcFile).toString("hex"));
'''


def run() -> dict:
    cc = shutil.which("cc") or shutil.which("gcc") or shutil.which("clang")
    bun = shutil.which("bun")
    if cc is None or bun is None:
        raise SystemExit("string_cross.py needs a C compiler and bun on PATH")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "probe.c").write_text(C_PROBE)
        (tmp_path / "compile.ts").write_text(COMPILE % {
            "compiler": json.dumps(str(ROOT / "packages/zplc-compiler/src/compiler/index.ts")),
            "source": json.dumps(PROGRAM),
        })
        subprocess.run(
            [cc, "-std=c99", "-I", str(INCLUDE), "-I", str(ACCESS), "-D", "ZPLC_CORE_VERSION_STR=\"0\"",
             str(tmp_path / "probe.c"), str(CORE / "core/zplc_core.c"), str(CORE / "core/zplc_loader.c"),
             str(CORE / "core/zplc_comm_dispatch.c"), str(CORE / "hal/posix/zplc_hal_posix.c"),
             "-o", str(tmp_path / "probe"), "-lrt", "-lpthread"],
            check=True, capture_output=True, text=True)
        artifact = subprocess.run([bun, str(tmp_path / "compile.ts")], check=True, capture_output=True, text=True, cwd=ROOT).stdout.strip()
        ran = subprocess.run([str(tmp_path / "probe")], input=artifact + "\n", capture_output=True, text=True)

    seen: dict[str, dict[str, str]] = {}
    for line in ran.stdout.splitlines():
        parts = line.split(" ", 2)
        if len(parts) >= 2:
            seen.setdefault(parts[0], {})[parts[1]] = parts[2] if len(parts) == 3 else ""
    wrong: list[str] = []
    if ran.returncode != 0:
        wrong.append(f"the probe stopped with {ran.returncode}: {ran.stdout.strip() or ran.stderr.strip()}")
    for block, members in EXPECTED.items():
        for member, text in members.items():
            got = seen.get(block, {}).get(member)
            if got != text:
                wrong.append(f"{block}.{member}: the handler reads {got!r}, the program passed {text!r}")
    return {"blocks": len(seen), "wrong": wrong}


def main() -> int:
    result = run()
    print(json.dumps({"blocks": result["blocks"], "wrong": len(result["wrong"])}))
    for line in result["wrong"]:
        print(line, file=sys.stderr)
    return 1 if result["wrong"] else 0


if __name__ == "__main__":
    sys.exit(main())
