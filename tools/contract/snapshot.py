#!/usr/bin/env python3
"""Contract snapshot (WP-11, VF-012).

Reads the numbers of the binary contract from every place that holds them in the
repository and prints one JSON document:

  c         what the C headers say, obtained by compiling a probe against them
  compiler  what packages/zplc-compiler holds (snapshot_ts.ts)
  ide       what packages/zplc-ide/src/runtime holds (snapshot_ts.ts)
  asm       what tools/zplc_asm.py holds
  tester    what tools/hil/zplc_tester.py holds

`golden/contract.golden.json` is this output taken from the hand-written
definitions before they were generated. test_contract.py compares a fresh
snapshot with it, so a generated table that moves a number fails there.

Usage: python3 tools/contract/snapshot.py [--out FILE]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INCLUDE = ROOT / "firmware/lib/zplc_core/include"
HEADERS = ["zplc_isa.h", "zplc_loader.h", "zplc_comm_dispatch.h"]

# Macros that are part of the contract, by prefix. Other macros (header guards,
# the packing attribute, Kconfig fallbacks) are not numbers of the contract.
MACRO_PREFIXES = (
    "ZPLC_MAGIC", "ZPLC_VERSION_", "ZPLC_MEM_", "ZPLC_SYS_", "ZPLC_MAX_TAGS",
    "ZPLC_STACK_MAX_DEPTH", "ZPLC_CALL_STACK_MAX", "ZPLC_MAX_BREAKPOINTS",
    "ZPLC_STRING_", "ZPLC_FILE_HEADER_SIZE", "ZPLC_SEGMENT_ENTRY_SIZE",
    "ZPLC_TASK_DEF_SIZE", "ZPLC_IOMAP_ENTRY_SIZE", "ZPLC_TAG_ENTRY_SIZE",
    "ZPLC_LOADER_",
)
MACRO_SKIP = {"ZPLC_LOADER_H", "ZPLC_LOADER_VERIFY_WORKSPACE_SIZE"}
STRUCTS = ["zplc_file_header_t", "zplc_segment_entry_t", "zplc_task_def_t", "zplc_iomap_entry_t", "zplc_tag_entry_t"]


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def scan_headers() -> tuple[list[str], dict[str, list[str]], dict[str, list[str]]]:
    macros: list[str] = []
    enums: dict[str, list[str]] = {}
    structs: dict[str, list[str]] = {}
    for header in HEADERS:
        text = strip_comments((INCLUDE / header).read_text())
        for name in re.findall(r"^[ \t]*#define[ \t]+([A-Z][A-Z0-9_]*)[ \t]+\S", text, flags=re.M):
            if name.startswith(MACRO_PREFIXES) and name not in MACRO_SKIP and name not in macros:
                macros.append(name)
        for body, name in re.findall(r"typedef\s+enum\s*\{(.*?)\}\s*(\w+)\s*;", text, flags=re.S):
            enums[name] = [m for m in re.findall(r"([A-Za-z_]\w*)\s*(?:=[^,]*)?(?:,|$)", body.strip())]
        for body, name in re.findall(r"typedef\s+struct\s+ZPLC_PACKED\s*\{(.*?)\}\s*(\w+)\s*;", text, flags=re.S):
            fields = re.findall(r"^\s*(?:[\w ]+?)\s+(\w+)(?:\[[^\]]*\])?\s*;", body, flags=re.M)
            structs[name] = fields
    return macros, enums, structs


def c_view() -> dict:
    cc = shutil.which("cc") or shutil.which("gcc") or shutil.which("clang")
    if cc is None:
        raise SystemExit("snapshot.py: no C compiler (cc, gcc or clang) on PATH")
    macros, enums, structs = scan_headers()
    lines = [
        "#include <stdio.h>", "#include <stddef.h>",
        '#include "zplc_isa.h"', '#include "zplc_loader.h"', '#include "zplc_comm_dispatch.h"',
        "int main(void) {", "  unsigned i;",
    ]
    for name in macros:
        lines.append(f'  printf("M %s %lld\\n", "{name}", (long long)({name}));')
    for enum, members in enums.items():
        for member in members:
            lines.append(f'  printf("E %s %s %lld\\n", "{enum}", "{member}", (long long)({member}));')
    for struct, fields in structs.items():
        lines.append(f'  printf("S %s - %zu\\n", "{struct}", sizeof({struct}));')
        for field in fields:
            lines.append(f'  printf("F %s %s %zu\\n", "{struct}", "{field}", offsetof({struct}, {field}));')
    lines += [
        '  for (i = 0; i < 256; i++) printf("O %u %u %u %u\\n", i, (unsigned)zplc_opcode_operand_size((uint8_t)i), (unsigned)zplc_opcode_instruction_size((uint8_t)i), (unsigned)zplc_opcode_is_valid((uint8_t)i));',
        "  return 0;", "}",
    ]
    out: dict = {"macros": {}, "enums": {}, "structs": {}, "operand": {}}
    with tempfile.TemporaryDirectory() as tmp:
        source, binary = Path(tmp, "probe.c"), Path(tmp, "probe")
        source.write_text("\n".join(lines) + "\n")
        subprocess.run([cc, "-std=c99", "-Wall", "-Wno-unused-variable", "-I", str(INCLUDE), str(source), "-o", str(binary)], check=True)
        text = subprocess.run([str(binary)], check=True, capture_output=True, text=True).stdout
    for line in text.splitlines():
        parts = line.split()
        if parts[0] == "M":
            out["macros"][parts[1]] = int(parts[2])
        elif parts[0] == "E":
            out["enums"].setdefault(parts[1], {})[parts[2]] = int(parts[3])
        elif parts[0] == "S":
            out["structs"].setdefault(parts[1], {"size": int(parts[3]), "offsets": {}})["size"] = int(parts[3])
        elif parts[0] == "F":
            out["structs"][parts[1]]["offsets"][parts[2]] = int(parts[3])
        elif parts[0] == "O":
            out["operand"][parts[1]] = {"operand": int(parts[2]), "instruction": int(parts[3]), "valid": int(parts[4])}
    return out


def load(path: Path, name: str, stubs: tuple[str, ...] = ()):
    saved = {}
    for stub in stubs:
        saved[stub] = sys.modules.get(stub)
        sys.modules[stub] = types.ModuleType(stub)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.pop(0)
        for stub, previous in saved.items():
            if previous is None:
                sys.modules.pop(stub, None)
            else:
                sys.modules[stub] = previous
    return module


def py_views() -> dict:
    asm = load(ROOT / "tools/zplc_asm.py", "zplc_asm_snapshot")
    tester = load(ROOT / "tools/hil/zplc_tester.py", "zplc_tester_snapshot", stubs=("serial",))
    return {
        "asm": {
            "opcodes": {op.name: int(op.value) for op in asm.Opcode},
            "operandSizes": {str(i): asm.get_operand_size(i) for i in range(256)},
            "magic": asm.ZPLC_MAGIC,
            "versionMajor": asm.ZPLC_VERSION_MAJOR,
            "versionMinor": asm.ZPLC_VERSION_MINOR,
        },
        "tester": {"opcodes": {name: int(code) for name, code in tester.ZPLCTester.OP.items()}},
    }


def ts_view() -> dict:
    bun = shutil.which("bun")
    if bun is None:
        raise SystemExit("snapshot.py: bun is not on PATH")
    result = subprocess.run([bun, str(ROOT / "tools/contract/snapshot_ts.ts")], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def snapshot() -> dict:
    return {"schema": 1, "c": c_view(), **ts_view(), **py_views()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", type=Path, help="write the snapshot here instead of stdout")
    args = parser.parse_args()
    text = json.dumps(snapshot(), indent=2, sort_keys=True) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
