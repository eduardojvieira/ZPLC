#!/usr/bin/env python3
"""Generate the ZPLC binary contract tables from tools/contract/contract.json.

One file defines the opcodes (number, name, operand layout, stack effect, flags),
the container constants (magic, version, header, segment and task layouts),
the error and fault codes, the memory regions and the communication
function-block kinds with their sizes and member offsets (VF-012). This script
writes, from that file:

  C       marked regions inside firmware/lib/zplc_core/include/*.h and
          firmware/lib/zplc_core/src/core/zplc_debug.c
  TS      packages/zplc-compiler/src/contract.generated.ts
  Python  tools/contract/zplc_contract.py
  Docs    the "Binary contract tables" section of the runtime reference
          (written by tools/docs/generate_runtime_reference.py, which calls
          render_docs() below)

Usage:
  python3 tools/contract/generate.py            write every generated file
  python3 tools/contract/generate.py --check    exit 1 when a generated file is stale

Generated files are committed, so no build needs this script.
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools/contract/contract.json"
SOURCE_REL = "tools/contract/contract.json"
GENERATOR_REL = "tools/contract/generate.py"

TS_OUT = ROOT / "packages/zplc-compiler/src/contract.generated.ts"
PY_OUT = ROOT / "tools/contract/zplc_contract.py"
INCLUDE = ROOT / "firmware/lib/zplc_core/include"

# Region files: path -> region names the file must contain, in order.
# A region is the text between
#   /* >>> GENERATED (tools/contract/generate.py): <name>. Do not edit. >>> */
#   /* <<< END GENERATED: <name> <<< */
REGION_FILES: dict[Path, list[str]] = {}

BEGIN_RE = re.compile(r"^[ \t]*/\* >>> GENERATED \(tools/contract/generate\.py\): ([a-z-]+)\. Do not edit\. >>> \*/[ \t]*$", re.M)


def begin_marker(name: str) -> str:
    return f"/* >>> GENERATED ({GENERATOR_REL}): {name}. Do not edit. >>> */"


def end_marker(name: str) -> str:
    return f"/* <<< END GENERATED: {name} <<< */"


class ContractError(Exception):
    pass


def shown(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


# ---------------------------------------------------------------------------
# Loading and validation
# ---------------------------------------------------------------------------

def num(value) -> int:
    if isinstance(value, bool):
        raise ContractError(f"not a number: {value!r}")
    if isinstance(value, int):
        return value
    return int(str(value), 0)


def load() -> dict:
    contract = json.loads(SOURCE.read_text(encoding="utf-8"))
    validate(contract)
    return contract


def operand_for(contract: dict, code: int) -> int:
    """Operand size the encoding gives to a byte value (the C zplc_opcode_operand_size)."""
    by_name = {o["name"]: num(o["code"]) for o in contract["opcodes"]}
    for exc in contract["operandRanges"]["exceptions"]:
        if by_name[exc["from"]] <= code <= by_name[exc["to"]]:
            return exc["operand"]
    for rng in contract["operandRanges"]["ranges"]:
        if num(rng["from"]) <= code <= num(rng["to"]):
            return rng["operand"]
    raise ContractError(f"byte {code} is outside every operand range")


def unique(items, what: str) -> None:
    seen = set()
    for item in items:
        if item in seen:
            raise ContractError(f"duplicate {what}: {item!r}")
        seen.add(item)


CTYPE_SIZE = {"uint8_t": 1, "uint16_t": 2, "uint32_t": 4}


def struct_layout(struct: dict) -> list[tuple[dict, int, int]]:
    out, offset = [], 0
    for field in struct["fields"]:
        size = CTYPE_SIZE[field["type"]]
        out.append((field, offset, size))
        offset += size
    return out


def flatten_members(comm: dict, entries: list, seen: tuple = ()) -> list[dict]:
    members: list[dict] = []
    for entry in entries:
        if isinstance(entry, str):
            if not entry.startswith("@") or entry[1:] not in comm["memberGroups"]:
                raise ContractError(f"unknown member group {entry!r}")
            if entry in seen:
                raise ContractError(f"member group {entry!r} includes itself")
            members.extend(flatten_members(comm, comm["memberGroups"][entry[1:]], seen + (entry,)))
        else:
            members.append(entry)
    return members


def validate(c: dict) -> None:
    if c.get("schema") != 1:
        raise ContractError("contract.json: schema must be 1")
    ops = c["opcodes"]
    unique([o["name"] for o in ops], "opcode name")
    unique([num(o["code"]) for o in ops], "opcode number")
    groups = {g["id"] for g in c["groups"]}
    flags = set(c["flagDefs"])
    last = -1
    for o in ops:
        code = num(o["code"])
        if not 0 <= code <= 0xFF:
            raise ContractError(f"opcode {o['name']}: number {code} is not a byte")
        if code <= last:
            raise ContractError(f"opcode {o['name']}: opcodes must be listed in ascending number order")
        last = code
        if o["group"] not in groups:
            raise ContractError(f"opcode {o['name']}: unknown group {o['group']!r}")
        if not set(o["flags"]) <= flags:
            raise ContractError(f"opcode {o['name']}: unknown flag in {o['flags']!r}")
        if o["operand"] != operand_for(c, code):
            raise ContractError(
                f"opcode {o['name']}: operand {o['operand']} disagrees with the encoding rule ({operand_for(c, code)})")
        left, right = o["effect"].split("->")
        n_in = len([t for t in re.findall(r"[\w.]+", left) if t != ".."])
        n_out = len([t for t in re.findall(r"[\w.]+", right) if t != ".."])
        if n_out - n_in != o["pushes"] - o["pops"]:
            raise ContractError(f"opcode {o['name']}: effect {o['effect']!r} disagrees with pops/pushes")
        if o["minDepth"] < o["pops"]:
            raise ContractError(f"opcode {o['name']}: minDepth is below pops")
        if o["operand"] and "memory" in o and o["operand"] != 2:
            raise ContractError(f"opcode {o['name']}: memory opcodes carry a 16-bit address")
    for name in ("RET", "I2F", "ZEXT16"):
        if name not in {o["name"] for o in ops}:
            raise ContractError(f"operandRanges names opcode {name}, which is not defined")

    for s in c["container"]["structs"]:
        total = sum(size for _, _, size in struct_layout(s))
        if total != s["size"]:
            raise ContractError(f"{s['typedef']}: fields add up to {total} bytes, declared {s['size']}")
        if "enum" in s and s["enum"] not in {e["name"] for e in c["container"]["enums"]}:
            raise ContractError(f"{s['typedef']}: unknown enum {s['enum']!r}")

    regions = c["memory"]["regions"]
    end = 0
    for r in regions:
        base, size = num(r["base"]), num(r["size"])
        if base < end:
            raise ContractError(f"memory region {r['name']} overlaps the one before it")
        end = base + size
    if num(c["memory"]["systemRegisterOffset"]["value"]) + 16 != num(regions[0]["size"]):
        raise ContractError("the system registers must be the last 16 bytes of the input image")

    comm = c["comm"]
    kinds = comm["kinds"]["members"]
    unique([k["name"] for k in kinds], "communication kind name")
    unique([num(k["value"]) for k in kinds], "communication kind number")
    kind_max = num(comm["kindMax"]["value"])
    if any(num(k["value"]) >= kind_max for k in kinds):
        raise ContractError("a communication kind is at or above kindMax")
    kind_names = {k["name"] for k in kinds}
    unique([b["name"] for b in comm["blocks"]], "communication block name")
    unique([b["kind"] for b in comm["blocks"]], "communication block kind")
    for b in comm["blocks"]:
        if b["kind"] not in kind_names:
            raise ContractError(f"block {b['name']}: unknown kind {b['kind']!r}")
        members = flatten_members(comm, b["members"])
        unique([m["name"] for m in members], f"member of {b['name']}")
        for m in members:
            if m["type"] not in comm["memberSizes"]:
                raise ContractError(f"block {b['name']}.{m['name']}: unknown type {m['type']!r}")
            if m["dir"] not in ("in", "out"):
                raise ContractError(f"block {b['name']}.{m['name']}: direction must be in or out")
            if not 0 <= m["offset"] < b["size"]:
                raise ContractError(f"block {b['name']}.{m['name']}: offset {m['offset']} is outside the block")
        header = flatten_members(comm, ["@COMM_HEADER"])
        if members[: len(header)] != header:
            raise ContractError(f"block {b['name']}: must start with the common handshake")
        if b["size"] > 0xFFFF:
            raise ContractError(f"block {b['name']}: size does not fit 16 bits")

    for enum in enums(c):
        unique([m["name"] for m in enum["members"]], f"member of {enum['typedef']}")


def enums(c: dict) -> list[dict]:
    """Every C enum of the contract, in header order."""
    found = [dict(c["types"], name="dataTypes")]
    found += c["container"]["enums"]
    found += [dict(c["vm"]["errors"], name="vmErrors"), dict(c["vm"]["flags"], name="vmFlags")]
    found += [dict(c["comm"]["kinds"], name="commKinds"), dict(c["comm"]["statuses"], name="commStatus")]
    return found


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def hexw(value: int, width: int = 2) -> str:
    return f"0x{value:0{width}X}"


def c_doc_block(doc: str, indent: str = "") -> list[str]:
    lines = doc.split("\n")
    if len(lines) == 1:
        return [f"{indent}/** @brief {lines[0]} */"]
    out = [f"{indent}/**", f"{indent} * @brief {lines[0]}"]
    out += [f"{indent} *" if not line else f"{indent} * {line}" for line in lines[1:]]
    out.append(f"{indent} */")
    return out


def c_plain_block(doc: str, indent: str = "") -> list[str]:
    out = [f"{indent}/**"]
    out += [f"{indent} *" if not line else f"{indent} * {line}" for line in doc.split("\n")]
    out.append(f"{indent} */")
    return out


def c_enum(enum: dict, value_fmt) -> list[str]:
    lines = c_doc_block(enum["doc"])
    lines.append("typedef enum {")
    members = enum["members"]
    for i, m in enumerate(members):
        comma = "," if i < len(members) - 1 else ""
        doc = f" /**< {m['doc']} */" if m.get("doc") else ""
        lines.append(f"  {enum['prefix']}{m['name']} = {value_fmt(m)}{comma}{doc}")
    lines.append(f"}} {enum['typedef']};")
    return lines


def value_hex2(m: dict) -> str:
    return hexw(num(m["value"]))


def value_literal(m: dict) -> str:
    raw = m["value"]
    return str(raw) if isinstance(raw, int) else raw


def value_bit(m: dict) -> str:
    return f"(1U << {m['value']})"


# ---------------------------------------------------------------------------
# C regions
# ---------------------------------------------------------------------------

def region_version(c: dict) -> list[str]:
    magic = c["container"]["magic"]
    lines = c_doc_block(magic["doc"])
    lines.append(f"#define ZPLC_MAGIC {hexw(num(magic['value']), 8)}U")
    lines.append("")
    lines.append("/** @brief Current ISA major version */")
    lines.append(f"#define ZPLC_VERSION_MAJOR {c['abi']['versionMajor']}")
    lines.append("")
    lines.append("/** @brief Current ISA minor version */")
    lines.append(f"#define ZPLC_VERSION_MINOR {c['abi']['versionMinor']}")
    return lines


def region_memory(c: dict) -> list[str]:
    lines: list[str] = []
    for r in c["memory"]["regions"]:
        lines.append(f"/** @brief Base address of {r['doc']} */")
        lines.append(f"#define ZPLC_MEM_{r['name']}_BASE {hexw(num(r['base']), 4)}U")
        lines.append("")
        lines.append(f"/** @brief {r['sizeDoc']} */")
        size = f"{hexw(num(r['size']), 4)}U"
        if r.get("kconfig"):
            lines += [f"#ifdef {r['kconfig']}", f"#define ZPLC_MEM_{r['name']}_SIZE {r['kconfig']}",
                      "#else", f"#define ZPLC_MEM_{r['name']}_SIZE {size}", "#endif"]
        else:
            lines.append(f"#define ZPLC_MEM_{r['name']}_SIZE {size}")
        lines.append("")
    for i, lim in enumerate(c["memory"]["limits"]):
        lines.append(f"/** @brief {lim['doc']} */")
        if lim.get("guard") == "ifndef":
            lines += [f"#ifndef {lim['macro']}", f"#define {lim['macro']} {lim['value']}", "#endif"]
        else:
            lines += [f"#ifdef {lim['kconfig']}", f"#define {lim['macro']} {lim['kconfig']}",
                      "#else", f"#define {lim['macro']} {lim['value']}", "#endif"]
        if i < len(c["memory"]["limits"]) - 1:
            lines.append("")
    return lines


def region_system_registers(c: dict) -> list[str]:
    mem = c["memory"]
    lines = [f"/** @brief {mem['systemRegisterOffset']['doc']} */",
             f"#define ZPLC_SYS_REG_OFFSET {hexw(num(mem['systemRegisterOffset']['value']), 4)}U", ""]
    for reg in mem["systemRegisters"]:
        lines.append(f"/** @brief {reg['doc']} */")
        lines.append(f"#define {reg['macro']} (ZPLC_MEM_IPI_BASE + {hexw(num(reg['offset']), 4)}U)")
        lines.append("")
    lines.append("/* Bytes 0x0FFA-0x0FFF reserved for future use */")
    lines.append("")
    for flag in mem["systemFlags"]:
        lines.append(f"/** @brief {flag['doc']} */")
        lines.append(f"#define {flag['macro']} {hexw(num(flag['value']))}")
        lines.append("")
    return lines[:-1]


def region_data_types(c: dict) -> list[str]:
    t = c["types"]
    lines = c_enum(t, value_hex2)
    s = c["string"]
    lines.append("")
    lines += c_doc_block(s["doc"])
    lines += [
        f"#define ZPLC_STRING_LEN_OFFSET {s['lenOffset']}",
        f"#define ZPLC_STRING_CAP_OFFSET {s['capOffset']}",
        f"#define ZPLC_STRING_DATA_OFFSET {s['dataOffset']}",
        f"#define ZPLC_STRING_DEFAULT_SIZE {s['defaultSize']}",
        f"#define ZPLC_STRING_MAX_SIZE {s['maxSize']}",
    ]
    return lines


def opcode_cname(o: dict) -> str:
    return "OP_" + o["name"]


def region_opcodes(c: dict) -> list[str]:
    lines = ["/**", " * @brief VM instruction opcodes.", " */", "typedef enum {"]
    ops = c["opcodes"]
    titles = {g["id"]: g["title"] for g in c["groups"]}
    previous_group = None
    # Banner per group, with the number range the group really covers.
    spans: dict[str, tuple[int, int]] = {}
    for o in ops:
        code = num(o["code"])
        lo, hi = spans.get(o["group"], (code, code))
        spans[o["group"]] = (min(lo, code), max(hi, code))
    for i, o in enumerate(ops):
        if o["group"] != previous_group:
            if previous_group is not None:
                lines.append("")
            lo, hi = spans[o["group"]]
            rng = hexw(lo) if lo == hi else f"{hexw(lo)}-{hexw(hi)}"
            lines.append(f"  /* ===== {titles[o['group']]} ({rng}) ===== */")
            previous_group = o["group"]
        comma = "," if i < len(ops) - 1 else ""
        lines.append(f"  {opcode_cname(o)} = {hexw(num(o['code']))}{comma} /**< {o['doc']} */")
    lines.append("} zplc_opcode_t;")
    lines.append("")
    lines += [
        "/**",
        " * @brief Opcode table as an X-macro, for code that has to enumerate the",
        " *        instruction set (names, tests, tools) without a hand-kept copy.",
        " *",
        " * Each entry is X(NAME, number, operand_bytes, pops, pushes, min_depth).",
        " * pops and pushes count the 32-bit stack words the instruction removes",
        " * and adds; min_depth is the number of words that must be on the stack.",
        " */",
        "#define ZPLC_OPCODE_TABLE(X) \\",
    ]
    for i, o in enumerate(ops):
        tail = " \\" if i < len(ops) - 1 else ""
        lines.append(f"  X({o['name']}, {hexw(num(o['code']))}, {o['operand']}, {o['pops']}, {o['pushes']}, {o['minDepth']}){tail}")
    lines.append("")
    lines += [
        "/** @brief Number of defined opcodes. */",
        f"#define ZPLC_OPCODE_COUNT {len(ops)}",
    ]
    return lines


def region_container(c: dict) -> list[str]:
    cont = c["container"]
    enum_by_name = {e["name"]: e for e in cont["enums"]}
    lines: list[str] = []
    for s in cont["structs"]:
        lines += c_doc_block(s["doc"])
        lines.append("typedef struct ZPLC_PACKED {")
        for field, _, _ in struct_layout(s):
            lines.append(f"  {field['type']} {field['name']}; /**< {field['doc']} */")
        lines.append(f"}} {s['typedef']};")
        lines.append("")
        lines.append(f"/** @brief {s['sizeDoc']} */")
        lines.append(f"#define {s['sizeMacro']} {s['size']}")
        lines.append("")
        lines.append(f"/* Layout check generated from the contract: a negative array size breaks the build. */")
        checks = [f"typedef char zplc_layout_check_{s['name']}_size[(sizeof({s['typedef']}) == {s['size']}U) ? 1 : -1];"]
        for field, offset, _ in struct_layout(s):
            checks.append(
                f"typedef char zplc_layout_check_{s['name']}_{field['name']}"
                f"[(offsetof({s['typedef']}, {field['name']}) == {offset}U) ? 1 : -1];")
        lines += checks
        lines.append("")
        enum = enum_by_name.get(s.get("enum", ""))
        if enum:
            fmt = value_bit if enum.get("bits") else (value_hex2 if any(isinstance(m["value"], str) for m in enum["members"]) else value_literal)
            lines += c_enum(enum, fmt)
            lines.append("")
    return lines[:-1]


def region_vm_status(c: dict) -> list[str]:
    errors = dict(c["vm"]["errors"])
    lines = c_enum(errors, value_hex2)
    lines.append("")
    lines += c_enum(c["vm"]["flags"], value_bit)
    return lines


def region_opcode_helpers(c: dict) -> list[str]:
    by_name = {o["name"]: o for o in c["opcodes"]}
    ranges = c["operandRanges"]
    conds = []
    for exc in ranges["exceptions"]:
        if exc["from"] == exc["to"]:
            conds.append(f"opcode == OP_{exc['from']}")
        else:
            conds.append(f"(opcode >= OP_{exc['from']} && opcode <= OP_{exc['to']})")
    operands = {exc["operand"] for exc in ranges["exceptions"]}
    if len(operands) != 1:
        raise ContractError("operandRanges.exceptions must all give the same operand size")
    lines = [
        "/**",
        " * @brief Get the operand size for an opcode.",
        " *",
        " * @param opcode The opcode byte.",
        " * @return Operand size in bytes (0, 1, 2, or 4).",
        " */",
        "static inline uint8_t zplc_opcode_operand_size(uint8_t opcode) {",
        f"  if ({' || '.join(conds)}) {{",
        f"    return {operands.pop()};",
        "  }",
    ]
    rngs = ranges["ranges"]
    for i, r in enumerate(rngs):
        last = i == len(rngs) - 1
        if i == 0:
            lines.append(f"  if (opcode <= {hexw(num(r['to']))}) {{")
        elif last:
            lines.append("  } else {")
        else:
            lines.append(f"  }} else if (opcode <= {hexw(num(r['to']))}) {{")
        lines.append(f"    return {r['operand']}; /* {r.get('note', operand_note(r['operand']))} */")
    lines.append("  }")
    lines.append("}")
    lines.append("")
    lines += [
        "/**",
        " * @brief Get the total instruction size for an opcode.",
        " *",
        " * @param opcode The opcode byte.",
        " * @return Total instruction size in bytes (1, 2, 3, or 5).",
        " */",
        "static inline uint8_t zplc_opcode_instruction_size(uint8_t opcode) {",
        "  return 1 + zplc_opcode_operand_size(opcode);",
        "}",
        "",
        "/**",
        " * @brief Check if an opcode is valid.",
        " *",
        " * @param opcode The opcode byte.",
        " * @return 1 if valid, 0 if invalid.",
        " */",
        "static inline int zplc_opcode_is_valid(uint8_t opcode) {",
        "  switch (opcode) {",
    ]
    titles = {g["id"]: g["title"] for g in c["groups"]}
    previous = None
    for o in c["opcodes"]:
        if o["group"] != previous:
            lines.append(f"  /* {titles[o['group']]} */")
            previous = o["group"]
        lines.append(f"  case {opcode_cname(o)}:")
    lines += ["    return 1;", "  default:", "    return 0;", "  }", "}"]
    return lines


def operand_note(size: int) -> str:
    return {0: "No operand", 1: "8-bit operand", 2: "16-bit operand", 4: "32-bit operand"}[size]


def region_loader_errors(c: dict) -> list[str]:
    lines = ["/* Error Codes */"]
    for e in c["loader"]["errors"]:
        lines.append(f"/** @brief {e['doc']} */")
        lines.append(f"#define {e['macro']} {e['value']}")
    return lines


def region_loader_max_tasks(c: dict) -> list[str]:
    return [f"#define ZPLC_LOADER_MAX_TASKS {c['container']['maxTasks']['value']}U"]


def comm_blocks(c: dict) -> list[dict]:
    comm = c["comm"]
    kinds = {k["name"]: num(k["value"]) for k in comm["kinds"]["members"]}
    out = []
    for b in comm["blocks"]:
        members = []
        for m in flatten_members(comm, b["members"]):
            members.append({"name": m["name"], "type": m["type"], "offset": m["offset"],
                            "size": comm["memberSizes"][m["type"]], "dir": m["dir"]})
        out.append({"name": b["name"], "kind": kinds[b["kind"]], "kindName": b["kind"], "size": b["size"],
                    "doc": b["doc"], "members": members})
    return out


def region_comm_kinds(c: dict) -> list[str]:
    kinds = c["comm"]["kinds"]
    lines = c_doc_block(kinds["doc"])
    lines.append("typedef enum {")
    members = kinds["members"]
    for m in members:
        doc = f" /**< {m['doc']} */" if m.get("doc") else ""
        lines.append(f"  {kinds['prefix']}{m['name']} = {hexw(num(m['value']), 4)},{doc}")
    kmax = c["comm"]["kindMax"]
    lines += c_plain_block("Sentinel: must be last. All valid kinds are < KIND_MAX.\n"
                           "Values at or above this are rejected by zplc_comm_register_handler().", "  ")
    lines.append(f"  {kinds['prefix']}KIND_MAX = {hexw(num(kmax['value']), 4)},")
    lines.append(f"}} {kinds['typedef']};")
    return lines


def region_comm_status(c: dict) -> list[str]:
    status = c["comm"]["statuses"]
    lines = c_doc_block(status["doc"])
    lines.append("typedef enum {")
    members = status["members"]
    for i, m in enumerate(members):
        comma = "," if i < len(members) - 1 else ""
        raw = m["value"]
        value = str(raw) if isinstance(raw, int) else hexw(num(raw))
        lines.append(f"  {status['prefix']}{m['name']} = {value}{comma}")
    lines.append(f"}} {status['typedef']};")
    return lines


def region_comm_blocks(c: dict) -> list[str]:
    blocks = comm_blocks(c)
    comm = c["comm"]
    prefix = comm["kinds"]["prefix"]
    lines = [
        "/**",
        " * @brief Function-block kinds that have a layout, as an X-macro.",
        " *",
        " * Each entry is X(NAME, kind, instance_size_bytes). The core takes the size",
        " * of a block from this table (RT-002); handlers take member offsets from",
        " * the ZPLC_COMM_<BLOCK>_<MEMBER>_OFFSET constants below.",
        " */",
        "#define ZPLC_COMM_FB_TABLE(X) \\",
    ]
    for i, b in enumerate(blocks):
        tail = " \\" if i < len(blocks) - 1 else ""
        lines.append(f"  X({b['name']}, {hexw(b['kind'], 4)}, {b['size']}){tail}")
    lines.append("")
    lines += c_doc_block("Instance size in bytes of a function block of the given kind.\n\n"
                         "@param kind A zplc_comm_fb_kind_t value (any width, so that an operand read from\n"
                         "            the code segment can be passed unchecked).\n"
                         "@return The size from the generated table, or 0 for a kind with no layout.")
    lines += ["static inline uint16_t zplc_comm_fb_size(uint32_t kind) {", "  switch (kind) {"]
    for b in blocks:
        lines.append(f"  case {prefix}{b['kindName']}:")
        lines.append(f"    return {b['size']}U;")
    lines += ["  default:", "    return 0U;", "  }", "}", ""]
    lines += [
        "/* Instance sizes and member offsets of every function block, from the contract.",
        " * ZPLC_COMM_<BLOCK>_SIZE is the instance size; ZPLC_COMM_<BLOCK>_<MEMBER>_OFFSET",
        " * is the byte offset of a member from the instance base address. */",
        "enum {",
    ]
    entries = []
    for b in blocks:
        entries.append((f"ZPLC_COMM_{b['name']}_SIZE", b["size"]))
        for m in b["members"]:
            entries.append((f"ZPLC_COMM_{b['name']}_{m['name']}_OFFSET", m["offset"]))
    for i, (name, value) in enumerate(entries):
        comma = "," if i < len(entries) - 1 else ""
        lines.append(f"  {name} = {value}{comma}")
    lines.append("};")
    return lines


def region_opcode_names(c: dict) -> list[str]:
    lines = []
    for o in c["opcodes"]:
        lines.append(f"    case {opcode_cname(o)}:{' ' * max(1, 16 - len(opcode_cname(o)))}return \"{o['name']}\";")
    return lines


def region_error_names(c: dict) -> list[str]:
    lines = []
    for m in c["vm"]["errors"]["members"]:
        lines.append(f"    case {hexw(num(m['value']))}: return \"{m['name']}\";")
    return lines


REGION_BUILDERS = {
    "version": region_version, "memory": region_memory, "system-registers": region_system_registers,
    "data-types": region_data_types, "opcodes": region_opcodes, "container": region_container,
    "vm-status": region_vm_status, "opcode-helpers": region_opcode_helpers,
    "loader-errors": region_loader_errors, "loader-max-tasks": region_loader_max_tasks,
    "comm-kinds": region_comm_kinds, "comm-status": region_comm_status, "comm-blocks": region_comm_blocks,
    "opcode-names": region_opcode_names, "error-names": region_error_names,
}


def apply_regions(path: Path, text: str, contract: dict) -> str:
    wanted = REGION_FILES[path]
    names = BEGIN_RE.findall(text)
    if names != wanted:
        raise ContractError(f"{path.relative_to(ROOT)}: expected generated regions {wanted}, found {names}")
    for name in wanted:
        begin, end = begin_marker(name), end_marker(name)
        pattern = re.compile(r"^[ \t]*" + re.escape(begin) + r"[ \t]*\n.*?^[ \t]*" + re.escape(end) + r"[ \t]*$", re.M | re.S)
        body = "\n".join(REGION_BUILDERS[name](contract))
        text, count = pattern.subn(lambda _m: f"{begin}\n{body}\n{end}", text, count=1)
        if count != 1:
            raise ContractError(f"{path.relative_to(ROOT)}: region {name} has no end marker")
    return text


# ---------------------------------------------------------------------------
# TypeScript
# ---------------------------------------------------------------------------

def ts_str(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def ts_object(entries: list[tuple[str, int]], width: int = 0, pad: str = "  ") -> list[str]:
    return [f"{pad}{name}: {hexw(value, width) if width else value}," for name, value in entries]


def render_ts(c: dict) -> str:
    out: list[str] = [
        "/**",
        " * GENERATED FILE. Do not edit.",
        f" * Source: {SOURCE_REL}. Regenerate: python3 {GENERATOR_REL}",
        " *",
        " * The ZPLC binary contract as the compiler and the IDE consume it: opcodes,",
        " * container constants, memory regions, error codes, type identifiers and the",
        " * communication function-block layouts. `generate.py --check` fails when this",
        " * file differs from a fresh generation.",
        " */",
        "",
        "export const ABI_VERSION = { major: %d, minor: %d } as const;" % (c["abi"]["versionMajor"], c["abi"]["versionMinor"]),
        "",
    ]
    cont = c["container"]
    structs = {s["name"]: s for s in cont["structs"]}
    out += [
        "/** Container (.zplc file) constants. */",
        "export const CONTAINER = {",
        f"  magic: {hexw(num(cont['magic']['value']), 8)},",
        f"  headerSize: {structs['header']['size']},",
        f"  segmentEntrySize: {structs['segment']['size']},",
        f"  taskDefSize: {structs['task']['size']},",
        f"  iomapEntrySize: {structs['iomap']['size']},",
        f"  tagEntrySize: {structs['tag']['size']},",
        f"  maxTasks: {cont['maxTasks']['value']},",
        f"  crcOffset: {cont['crc']['offset']},",
        f"  crcSize: {cont['crc']['size']},",
        "} as const;",
        "",
        "/** Field layout of the packed container structures (little-endian). */",
        "export const CONTAINER_LAYOUT = {",
    ]
    for s in cont["structs"]:
        out.append(f"  {s['name']}: {{")
        for field, offset, size in struct_layout(s):
            out.append(f"    {field['name']}: {{ offset: {offset}, size: {size} }},")
        out.append("  },")
    out += ["} as const;", ""]

    def const_enum(name: str, enum: dict, doc: str, fmt=None, strip_prefix=False) -> None:
        out.append(f"/** {doc} */")
        out.append(f"export const {name} = {{")
        for m in enum["members"]:
            value = num(m["value"]) if not enum.get("bits") else 1 << num(m["value"])
            key = m["name"]
            out.append(f"  {key}: {fmt(value) if fmt else value},")
        out.append("} as const;")
        out.append("")

    const_enum("SEGMENT_TYPE", next(e for e in cont["enums"] if e["name"] == "segmentTypes"), "Segment type identifiers.", lambda v: hexw(v))
    const_enum("TASK_TYPE_ID", next(e for e in cont["enums"] if e["name"] == "taskTypes"), "Task trigger types.")
    const_enum("IO_DIRECTION", next(e for e in cont["enums"] if e["name"] == "ioDirections"), "I/O map directions.")
    const_enum("TAG_ID", next(e for e in cont["enums"] if e["name"] == "tagIds"), "Variable tag identifiers.")
    const_enum("FILE_FLAG", next(e for e in cont["enums"] if e["name"] == "fileFlags"), "Container header flag bits (as masks).", lambda v: hexw(v))

    out.append("/** Memory regions of the VM address space: base and default size in bytes. */")
    out.append("export const MEMORY_REGION = {")
    for r in c["memory"]["regions"]:
        out.append(f"  {r['name']}: {{ base: {hexw(num(r['base']), 4)}, size: {hexw(num(r['size']), 4)} }},")
    out += ["} as const;", ""]
    out.append("/** Default sizes of the runtime limits (a board may configure some of them through Kconfig). */")
    out.append("export const MEMORY_LIMIT = {")
    for lim in c["memory"]["limits"]:
        key = {"ZPLC_MAX_TAGS": "maxTags", "ZPLC_STACK_MAX_DEPTH": "stackMaxDepth",
               "ZPLC_CALL_STACK_MAX": "callStackMax", "ZPLC_MAX_BREAKPOINTS": "maxBreakpoints"}[lim["macro"]]
        out.append(f"  {key}: {lim['value']},")
    out += ["} as const;", ""]
    ipi = num(c["memory"]["regions"][0]["base"])
    out.append("/** System registers in the input image (address, type, size in bytes). */")
    out.append("export const SYSTEM_REGISTER = {")
    for reg in c["memory"]["systemRegisters"]:
        key = reg["macro"].removeprefix("ZPLC_SYS_")
        out.append(f"  {key}: {{ address: {hexw(ipi + num(reg['offset']), 4)}, type: {ts_str(reg['type'])}, size: {reg['size']} }},")
    out += ["} as const;", ""]
    out.append("/** System flag masks of the system flags register. */")
    out.append("export const SYSTEM_FLAG = {")
    for flag in c["memory"]["systemFlags"]:
        out.append(f"  {flag['macro'].removeprefix('ZPLC_SYS_FLAG_')}: {hexw(num(flag['value']))},")
    out += ["} as const;", ""]

    out.append("/** IEC 61131-3 data type identifiers used by the symbol table, the I/O map and the tags. */")
    out.append("export const DATA_TYPE_ID = {")
    for m in c["types"]["members"]:
        out.append(f"  {m['name']}: {hexw(num(m['value']))},")
    out += ["} as const;", ""]
    out.append("/** Size in bytes of each fixed-size data type (STRING has none). */")
    out.append("export const DATA_TYPE_SIZE = {")
    for m in c["types"]["members"]:
        if m["size"] is not None:
            out.append(f"  {m['name']}: {m['size']},")
    out += ["} as const;", ""]
    s = c["string"]
    out += [
        "/** STRING memory layout: [length:2][capacity:2][data:capacity+1]. */",
        "export const STRING_LAYOUT = {",
        f"  lenOffset: {s['lenOffset']},",
        f"  capOffset: {s['capOffset']},",
        f"  dataOffset: {s['dataOffset']},",
        f"  headerSize: {s['dataOffset']},",
        f"  defaultSize: {s['defaultSize']},",
        f"  maxSize: {s['maxSize']},",
        f"  /** Bytes of a default STRING: header + default capacity + terminator. */",
        f"  defaultTotalSize: {s['dataOffset'] + s['defaultSize'] + 1},",
        "} as const;",
        "",
    ]

    ops = c["opcodes"]
    out.append("/** VM opcodes (name to number). */")
    out.append("export const Opcode = {")
    for o in ops:
        out.append(f"  {o['name']}: {hexw(num(o['code']))}, // {o['doc']}")
    out += ["} as const;", ""]
    out += [
        "export interface OpcodeInfo {",
        "  readonly name: string;",
        "  readonly code: number;",
        "  /** Operand size in bytes: 0, 1, 2 or 4. */",
        "  readonly operand: number;",
        "  readonly group: string;",
        "  /** 32-bit stack words the instruction removes. */",
        "  readonly pops: number;",
        "  /** 32-bit stack words the instruction adds. */",
        "  readonly pushes: number;",
        "  /** Stack words that must be present before the instruction runs. */",
        "  readonly minDepth: number;",
        "  readonly effect: string;",
        "  readonly flags: readonly string[];",
        "  readonly memory?: { readonly access: 'read' | 'write'; readonly width: number };",
        "  readonly doc: string;",
        "}",
        "",
        "/** Every opcode with its operand layout, stack effect and flags, in number order. */",
        "export const OPCODE_TABLE: readonly OpcodeInfo[] = [",
    ]
    for o in ops:
        mem = f", memory: {{ access: {ts_str(o['memory']['access'])}, width: {o['memory']['width']} }}" if "memory" in o else ""
        out.append(
            f"  {{ name: {ts_str(o['name'])}, code: {hexw(num(o['code']))}, operand: {o['operand']}, group: {ts_str(o['group'])}, "
            f"pops: {o['pops']}, pushes: {o['pushes']}, minDepth: {o['minDepth']}, effect: {ts_str(o['effect'])}, "
            f"flags: {json.dumps(o['flags'])}{mem}, doc: {ts_str(o['doc'])} }},")
    out += ["];", ""]

    # Operand size, written as the C helper is: exceptions first, then the range of the byte.
    by_name = {o["name"]: o for o in ops}
    ranges = c["operandRanges"]
    out += [
        "/**",
        " * Operand size in bytes for an opcode value (the C zplc_opcode_operand_size).",
        " * Follows the encoding ranges; the exceptions carry no operand.",
        " */",
        "export function getOperandSize(opcode: number): number {",
    ]
    for exc in ranges["exceptions"]:
        lo, hi = hexw(num(by_name[exc["from"]]["code"])), hexw(num(by_name[exc["to"]]["code"]))
        cond = f"opcode === {lo}" if lo == hi else f"opcode >= {lo} && opcode <= {hi}"
        out.append(f"  if ({cond}) return {exc['operand']}; // {exc['from']}" + ("" if exc["from"] == exc["to"] else f"..{exc['to']}"))
    rngs = ranges["ranges"]
    for i, r in enumerate(rngs):
        if i < len(rngs) - 1:
            out.append(f"  if (opcode <= {hexw(num(r['to']))}) return {r['operand']};")
        else:
            out.append(f"  return {r['operand']};")
    out += ["}", ""]
    out += [
        "const OPCODE_FLAGS = new Map<number, readonly string[]>(OPCODE_TABLE.map((entry) => [entry.code, entry.flags]));",
        "",
        "/** True when the opcode has the flag in the opcode table. */",
        "export function opcodeHasFlag(opcode: number, flag: string): boolean {",
        "  return OPCODE_FLAGS.get(opcode)?.includes(flag) ?? false;",
        "}",
        "",
    ]

    def named_members(name: str, enum: dict, keep_prefix: bool, doc: str, fmt=hexw) -> None:
        out.append(f"/** {doc} */")
        out.append(f"export const {name} = [")
        for m in enum["members"]:
            cname = enum["prefix"] + m["name"] if keep_prefix else m["name"]
            out.append(f"  {{ name: {ts_str(cname)}, code: {fmt(num(m['value']))}, doc: {ts_str(m.get('doc', ''))} }},")
        out.append("] as const;")
        out.append("")

    named_members("VM_ERRORS", c["vm"]["errors"], True, "zplc_vm_error_t: faults and run states of the VM, in code order.")
    named_members("VM_FLAGS", dict(c["vm"]["flags"], members=[dict(m, value=1 << num(m["value"])) for m in c["vm"]["flags"]["members"]]), True,
                  "zplc_vm_flags_t: VM status flag masks.")
    out.append("/** Loader verification result codes (zero is success, negative is a refusal). */")
    out.append("export const LOADER_ERRORS = [")
    for e in c["loader"]["errors"]:
        out.append(f"  {{ name: {ts_str(e['macro'])}, code: {e['value']}, doc: {ts_str(e['doc'])} }},")
    out += ["] as const;", ""]

    comm = c["comm"]
    out.append("/** Every communication function-block kind identifier of the core (zplc_comm_fb_kind_t). */")
    out.append("export const COMM_KIND = {")
    for m in comm["kinds"]["members"]:
        out.append(f"  {m['name']}: {hexw(num(m['value']), 4)},")
    out += ["} as const;", ""]
    out.append(f"/** Kinds at or above this value are refused by the loader and by handler registration. */")
    out.append(f"export const COMM_KIND_MAX = {hexw(num(comm['kindMax']['value']), 4)};")
    out.append("")
    blocks = comm_blocks(c)
    out.append("/** The kinds that have a function-block layout. */")
    out.append("export const COMM_FB_KIND = {")
    for b in blocks:
        out.append(f"  {b['name']}: {hexw(b['kind'], 4)},")
    out += ["} as const;", ""]
    out.append("/** Communication status codes written to FB.STATUS. */")
    out.append("export const COMM_STATUS_CODE = {")
    for m in comm["statuses"]["members"]:
        out.append(f"  {m['name']}: {num(m['value'])},")
    out += ["} as const;", ""]
    out += [
        "export interface CommBlockMember {",
        "  readonly name: string;",
        "  /** IEC type name of the member (BOOL, USINT, UINT, DINT, STRING). */",
        "  readonly type: string;",
        "  /** Byte offset from the instance base address. */",
        "  readonly offset: number;",
        "  /** Bytes the compiler reserves for the member type. */",
        "  readonly size: number;",
        "  readonly direction: 'in' | 'out';",
        "}",
        "",
        "export interface CommBlockInfo {",
        "  readonly name: string;",
        "  readonly kind: number;",
        "  /** Instance size in bytes: what the core allocates and the loader checks. */",
        "  readonly size: number;",
        "  readonly doc: string;",
        "  readonly members: readonly CommBlockMember[];",
        "}",
        "",
        "/** Function-block layouts: kind, instance size and member offsets. */",
        "export const COMM_BLOCKS: readonly CommBlockInfo[] = [",
    ]
    for b in blocks:
        out.append(f"  {{ name: {ts_str(b['name'])}, kind: {hexw(b['kind'], 4)}, size: {b['size']}, doc: {ts_str(b['doc'])}, members: [")
        for m in b["members"]:
            out.append(f"    {{ name: {ts_str(m['name'])}, type: {ts_str(m['type'])}, offset: {m['offset']}, size: {m['size']}, direction: {ts_str(m['dir'])} }},")
        out.append("  ] },")
    out += ["];", ""]
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Python
# ---------------------------------------------------------------------------

def render_py(c: dict) -> str:
    ops = c["opcodes"]
    cont = c["container"]
    structs = {s["name"]: s for s in cont["structs"]}
    by_name = {o["name"]: o for o in ops}
    out: list[str] = [
        '"""GENERATED FILE. Do not edit.',
        "",
        f"Source: {SOURCE_REL}. Regenerate: python3 {GENERATOR_REL}",
        "",
        "The ZPLC binary contract for the Python tools: opcodes, container constants,",
        "memory regions, error codes and the communication function-block layouts.",
        "`generate.py --check` fails when this file differs from a fresh generation.",
        '"""',
        "from enum import IntEnum",
        "",
        f"ZPLC_MAGIC = {hexw(num(cont['magic']['value']), 8)}",
        f"ZPLC_VERSION_MAJOR = {c['abi']['versionMajor']}",
        f"ZPLC_VERSION_MINOR = {c['abi']['versionMinor']}",
        f"HEADER_SIZE = {structs['header']['size']}",
        f"SEGMENT_ENTRY_SIZE = {structs['segment']['size']}",
        f"TASK_DEF_SIZE = {structs['task']['size']}",
        f"IOMAP_ENTRY_SIZE = {structs['iomap']['size']}",
        f"TAG_ENTRY_SIZE = {structs['tag']['size']}",
        f"MAX_TASKS = {cont['maxTasks']['value']}",
        f"CRC_OFFSET = {cont['crc']['offset']}",
        f"CRC_SIZE = {cont['crc']['size']}",
        "",
        "# Header layout: struct format of the 32-byte file header and of a segment entry.",
        "HEADER_STRUCT = " + ts_str("<" + "".join({1: "B", 2: "H", 4: "I"}[size] for _, _, size in struct_layout(structs["header"]))),
        "SEGMENT_ENTRY_STRUCT = " + ts_str("<" + "".join({1: "B", 2: "H", 4: "I"}[size] for _, _, size in struct_layout(structs["segment"]))),
        "TASK_DEF_STRUCT = " + ts_str("<" + "".join({1: "B", 2: "H", 4: "I"}[size] for _, _, size in struct_layout(structs["task"]))),
        "TAG_ENTRY_STRUCT = " + ts_str("<" + "".join({1: "B", 2: "H", 4: "I"}[size] for _, _, size in struct_layout(structs["tag"]))),
        "",
    ]

    def dict_of(name: str, enum: dict, fmt=None) -> None:
        out.append(f"{name} = {{")
        for m in enum["members"]:
            value = (1 << num(m["value"])) if enum.get("bits") else num(m["value"])
            out.append(f"    {ts_str(m['name'])}: {fmt(value) if fmt else value},")
        out.append("}")
        out.append("")

    def get(name: str) -> dict:
        return next(e for e in cont["enums"] if e["name"] == name)

    dict_of("SEGMENT_TYPE", get("segmentTypes"), lambda v: hexw(v))
    dict_of("TASK_TYPE", get("taskTypes"))
    dict_of("IO_DIRECTION", get("ioDirections"))
    dict_of("TAG_ID", get("tagIds"))
    dict_of("FILE_FLAG", get("fileFlags"), lambda v: hexw(v))

    out.append("# Memory regions: base address and default size in bytes.")
    out.append("MEMORY_REGION = {")
    for r in c["memory"]["regions"]:
        out.append(f"    {ts_str(r['name'])}: {{\"base\": {hexw(num(r['base']), 4)}, \"size\": {hexw(num(r['size']), 4)}}},")
    out += ["}", ""]
    out.append("# System registers in the input image: address, type, size in bytes.")
    out.append("SYSTEM_REGISTER = {")
    ipi = num(c["memory"]["regions"][0]["base"])
    for reg in c["memory"]["systemRegisters"]:
        out.append(f"    {ts_str(reg['macro'].removeprefix('ZPLC_SYS_'))}: {{\"address\": {hexw(ipi + num(reg['offset']), 4)}, \"type\": {ts_str(reg['type'])}, \"size\": {reg['size']}}},")
    out += ["}", ""]
    out.append("# IEC 61131-3 data type identifiers (symbol table, I/O map, tags).")
    out.append("DATA_TYPE_ID = {")
    for m in c["types"]["members"]:
        out.append(f"    {ts_str(m['name'])}: {hexw(num(m['value']))},")
    out += ["}", ""]
    s = c["string"]
    out += [
        "# STRING layout: [length:2][capacity:2][data:capacity+1].",
        f"STRING_LEN_OFFSET = {s['lenOffset']}",
        f"STRING_CAP_OFFSET = {s['capOffset']}",
        f"STRING_DATA_OFFSET = {s['dataOffset']}",
        f"STRING_DEFAULT_SIZE = {s['defaultSize']}",
        f"STRING_MAX_SIZE = {s['maxSize']}",
        "",
        "",
        "class Opcode(IntEnum):",
        '    """ZPLC VM opcodes."""',
        "",
    ]
    for o in ops:
        out.append(f"    {o['name']} = {hexw(num(o['code']))}  # {o['doc']}")
    out += ["", ""]
    out.append("# Per opcode: operand bytes, stack words popped and pushed, minimum depth, flags.")
    out.append("OPCODE_INFO = {")
    for o in ops:
        out.append(
            f"    Opcode.{o['name']}: {{\"operand\": {o['operand']}, \"pops\": {o['pops']}, \"pushes\": {o['pushes']}, "
            f"\"min_depth\": {o['minDepth']}, \"flags\": {tuple(o['flags'])!r}, \"effect\": {ts_str(o['effect'])}}},")
    out += ["}", "", ""]
    out += [
        "def get_operand_size(opcode: int) -> int:",
        '    """Operand size in bytes for an opcode value (the C zplc_opcode_operand_size)."""',
    ]
    ranges = c["operandRanges"]
    for exc in ranges["exceptions"]:
        lo, hi = hexw(num(by_name[exc["from"]]["code"])), hexw(num(by_name[exc["to"]]["code"]))
        cond = f"opcode == {lo}" if lo == hi else f"{lo} <= opcode <= {hi}"
        out.append(f"    if {cond}:  # {exc['from']}" + ("" if exc["from"] == exc["to"] else f"..{exc['to']}"))
        out.append(f"        return {exc['operand']}")
    rngs = ranges["ranges"]
    for i, r in enumerate(rngs):
        if i < len(rngs) - 1:
            out.append(f"    if opcode <= {hexw(num(r['to']))}:")
            out.append(f"        return {r['operand']}")
        else:
            out.append(f"    return {r['operand']}")
    out += ["", ""]

    def int_enum(name: str, doc: str, items: list[tuple[str, int]]) -> None:
        out.append(f"class {name}(IntEnum):")
        out.append(f'    """{doc}"""')
        out.append("")
        for key, value in items:
            out.append(f"    {key} = {value}")
        out.extend(["", ""])

    int_enum("VmError", "zplc_vm_error_t: faults and run states of the VM.",
             [(m["name"], num(m["value"])) for m in c["vm"]["errors"]["members"]])
    int_enum("LoaderError", "Loader verification result codes (zero is success).",
             [(e["macro"].removeprefix("ZPLC_LOADER_"), e["value"]) for e in c["loader"]["errors"]])
    comm = c["comm"]
    int_enum("CommKind", "Communication function-block kind identifiers (zplc_comm_fb_kind_t).",
             [(m["name"], num(m["value"])) for m in comm["kinds"]["members"]])
    int_enum("CommStatus", "Communication status codes written to FB.STATUS.",
             [(m["name"], num(m["value"])) for m in comm["statuses"]["members"]])
    out.append(f"COMM_KIND_MAX = {hexw(num(comm['kindMax']['value']), 4)}")
    out += ["", "# Function-block layouts: kind, instance size and member offsets."]
    out.append("COMM_BLOCKS = {")
    for b in comm_blocks(c):
        out.append(f"    {ts_str(b['name'])}: {{")
        out.append(f"        \"kind\": {hexw(b['kind'], 4)},")
        out.append(f"        \"size\": {b['size']},")
        out.append("        \"members\": [")
        for m in b["members"]:
            out.append(f"            {{\"name\": {ts_str(m['name'])}, \"type\": {ts_str(m['type'])}, \"offset\": {m['offset']}, \"size\": {m['size']}, \"direction\": {ts_str(m['dir'])}}},")
        out.append("        ],")
        out.append("    },")
    out += ["}", ""]
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Documentation tables
# ---------------------------------------------------------------------------

DOC_TEXT = {
    "en": {
        "title": "Binary contract tables",
        "intro": "These tables are generated from `tools/contract/contract.json`, the single source of the opcodes, container constants, error codes, memory regions and communication function-block layouts. The C headers, the TypeScript compiler tables and the Python tools are generated from the same file, so they cannot drift.",
        "container": "Container constants",
        "constant": "Constant", "value": "Value", "notes": "Notes",
        "magic": "Magic number", "abi": "ISA version (major.minor)", "headerSize": "File header size (bytes)",
        "segmentSize": "Segment entry size (bytes)", "taskSize": "Task definition size (bytes)",
        "iomapSize": "I/O map entry size (bytes)", "tagSize": "Tag entry size (bytes)", "maxTasks": "Maximum tasks in an artifact",
        "crc": "CRC32", "crcNote": "IEEE 802.3 polynomial {poly}, over the whole file except the 4 bytes at offset {off}.",
        "layout": "Layout of {name}", "offset": "Offset", "field": "Field", "type": "Type", "bytes": "Bytes", "description": "Description",
        "segments": "Segment types", "taskTypes": "Task types", "flags": "File header flags", "ioDirections": "I/O directions", "tagIds": "Tag identifiers",
        "bit": "Mask", "name": "Name",
        "memory": "Memory regions", "region": "Region", "base": "Base", "size": "Default size", "kconfig": "Kconfig override",
        "limits": "Runtime limits", "limit": "Limit", "sysregs": "System registers (input image)", "address": "Address", "sysflags": "System flags",
        "types": "Data type identifiers", "id": "Identifier", "typeSize": "Bytes",
        "string": "STRING layout", "stringIntro": "A STRING is `[length:2][capacity:2][data:capacity+1]`, little-endian. The default capacity is {default} characters ({total} bytes) and the largest is {max}.",
        "opcodes": "Opcodes", "opcodesIntro": "The operand size follows the opcode range (0x00-0x3F none, 0x40-0x7F 8-bit, 0x80-0xBF 16-bit, 0xC0-0xFF 32-bit), except `RET` and the conversions `I2F` to `ZEXT16`, which carry no operand. Stack effects list the top of the stack on the right.",
        "hex": "Code", "mnemonic": "Mnemonic", "operand": "Operand", "effect": "Stack effect", "flagsCol": "Flags", "none": "none",
        "vmErrors": "VM error codes", "loaderErrors": "Loader error codes", "code": "Code",
        "comm": "Communication function blocks", "commIntro": "Each function-block instance is a byte block in work or retentive memory. Every block starts with the same 8-byte handshake. The core takes the size of a block from this table.",
        "kind": "Kind", "instanceSize": "Instance size (bytes)", "member": "Member", "direction": "Direction",
        "commStatus": "Communication status codes", "kindMax": "Kinds at or above {value} are refused by the loader and by handler registration.",
        "in": "input", "out": "output", "blockLayout": "Layout of {name}",
    },
    "es": {
        "title": "Tablas del contrato binario",
        "intro": "Estas tablas se generan desde `tools/contract/contract.json`, la fuente única de los opcodes, las constantes del contenedor, los códigos de error, las regiones de memoria y los layouts de los bloques de función de comunicación. Las cabeceras C, las tablas TypeScript del compilador y las herramientas Python se generan del mismo archivo, así que no pueden divergir.",
        "container": "Constantes del contenedor",
        "constant": "Constante", "value": "Valor", "notes": "Notas",
        "magic": "Número mágico", "abi": "Versión del ISA (mayor.menor)", "headerSize": "Tamaño de la cabecera del archivo (bytes)",
        "segmentSize": "Tamaño de la entrada de segmento (bytes)", "taskSize": "Tamaño de la definición de tarea (bytes)",
        "iomapSize": "Tamaño de la entrada del mapa de E/S (bytes)", "tagSize": "Tamaño de la entrada de etiqueta (bytes)", "maxTasks": "Máximo de tareas en un artefacto",
        "crc": "CRC32", "crcNote": "Polinomio IEEE 802.3 {poly}, sobre todo el archivo salvo los 4 bytes en el offset {off}.",
        "layout": "Layout de {name}", "offset": "Offset", "field": "Campo", "type": "Tipo", "bytes": "Bytes", "description": "Descripción",
        "segments": "Tipos de segmento", "taskTypes": "Tipos de tarea", "flags": "Flags de la cabecera", "ioDirections": "Direcciones de E/S", "tagIds": "Identificadores de etiqueta",
        "bit": "Máscara", "name": "Nombre",
        "memory": "Regiones de memoria", "region": "Región", "base": "Base", "size": "Tamaño por defecto", "kconfig": "Override por Kconfig",
        "limits": "Límites de ejecución", "limit": "Límite", "sysregs": "Registros del sistema (imagen de entrada)", "address": "Dirección", "sysflags": "Flags del sistema",
        "types": "Identificadores de tipo de dato", "id": "Identificador", "typeSize": "Bytes",
        "string": "Layout de STRING", "stringIntro": "Un STRING es `[longitud:2][capacidad:2][datos:capacidad+1]`, little-endian. La capacidad por defecto es de {default} caracteres ({total} bytes) y la máxima de {max}.",
        "opcodes": "Opcodes", "opcodesIntro": "El tamaño del operando sigue el rango del opcode (0x00-0x3F ninguno, 0x40-0x7F 8 bits, 0x80-0xBF 16 bits, 0xC0-0xFF 32 bits), salvo `RET` y las conversiones `I2F` a `ZEXT16`, que no llevan operando. Los efectos sobre la pila ponen el tope a la derecha.",
        "hex": "Código", "mnemonic": "Mnemónico", "operand": "Operando", "effect": "Efecto en la pila", "flagsCol": "Flags", "none": "ninguno",
        "vmErrors": "Códigos de error de la VM", "loaderErrors": "Códigos de error del loader", "code": "Código",
        "comm": "Bloques de función de comunicación", "commIntro": "Cada instancia de bloque de función es un bloque de bytes en memoria de trabajo o retentiva. Todos los bloques empiezan con el mismo handshake de 8 bytes. El core toma el tamaño de un bloque de esta tabla.",
        "kind": "Kind", "instanceSize": "Tamaño de la instancia (bytes)", "member": "Miembro", "direction": "Dirección",
        "commStatus": "Códigos de estado de comunicación", "kindMax": "El loader y el registro de handlers rechazan los kinds iguales o mayores que {value}.",
        "in": "entrada", "out": "salida", "blockLayout": "Layout de {name}",
    },
}


def md_cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def md_table(headers: list[str], rows: list[list[str]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(md_cell(cell) for cell in row) + " |")
    return lines


def render_docs(c: dict, lang: str) -> str:
    t = DOC_TEXT[lang]
    cont = c["container"]
    structs = {s["name"]: s for s in cont["structs"]}
    lines: list[str] = [f"## {t['title']}", "", t["intro"], "", f"### {t['container']}", ""]
    rows = [
        [t["magic"], f"`{hexw(num(cont['magic']['value']), 8)}`", "`5A 50 4C 43` = \"ZPLC\""],
        [t["abi"], f"`{c['abi']['versionMajor']}.{c['abi']['versionMinor']}`", ""],
        [t["headerSize"], f"`{structs['header']['size']}`", ""],
        [t["segmentSize"], f"`{structs['segment']['size']}`", ""],
        [t["taskSize"], f"`{structs['task']['size']}`", ""],
        [t["iomapSize"], f"`{structs['iomap']['size']}`", ""],
        [t["tagSize"], f"`{structs['tag']['size']}`", ""],
        [t["maxTasks"], f"`{cont['maxTasks']['value']}`", ""],
        [t["crc"], f"`{cont['crc']['polynomial']}`",
         t["crcNote"].format(poly=cont["crc"]["polynomial"], off=cont["crc"]["offset"])],
    ]
    lines += md_table([t["constant"], t["value"], t["notes"]], rows) + [""]
    for s in cont["structs"]:
        lines += [f"### {t['layout'].format(name='`' + s['typedef'] + '`')}", ""]
        rows = [[f"`{off}`", f"`{f['name']}`", f"`{f['type']}`", str(size), f["doc"]] for f, off, size in struct_layout(s)]
        lines += md_table([t["offset"], t["field"], t["type"], t["bytes"], t["description"]], rows) + [""]
    enum_titles = {"segmentTypes": "segments", "taskTypes": "taskTypes", "fileFlags": "flags", "ioDirections": "ioDirections", "tagIds": "tagIds"}
    for enum in cont["enums"]:
        lines += [f"### {t[enum_titles[enum['name']]]}", ""]
        if enum.get("bits"):
            rows = [[f"`{enum['prefix']}{m['name']}`", f"`{hexw(1 << num(m['value']))}`", m["doc"]] for m in enum["members"]]
            lines += md_table([t["name"], t["bit"], t["description"]], rows) + [""]
        else:
            rows = [[f"`{enum['prefix']}{m['name']}`", f"`{hexw(num(m['value']))}`", m["doc"]] for m in enum["members"]]
            lines += md_table([t["name"], t["value"], t["description"]], rows) + [""]
    lines += [f"### {t['memory']}", ""]
    rows = []
    for r in c["memory"]["regions"]:
        rows.append([f"`{r['name']}`", f"`{hexw(num(r['base']), 4)}`", f"`{hexw(num(r['size']), 4)}`", f"`{r['kconfig']}`" if r.get("kconfig") else "—", r["doc"]])
    lines += md_table([t["region"], t["base"], t["size"], t["kconfig"], t["description"]], rows) + [""]
    lines += [f"### {t['limits']}", ""]
    rows = [[f"`{l['macro']}`", f"`{l['value']}`", f"`{l['kconfig']}`" if l.get("kconfig") else "—", l["doc"]] for l in c["memory"]["limits"]]
    lines += md_table([t["limit"], t["value"], t["kconfig"], t["description"]], rows) + [""]
    lines += [f"### {t['sysregs']}", ""]
    ipi = num(c["memory"]["regions"][0]["base"])
    rows = [[f"`{r['macro']}`", f"`{hexw(ipi + num(r['offset']), 4)}`", f"`{r['type']}`", str(r["size"]), r["doc"]] for r in c["memory"]["systemRegisters"]]
    lines += md_table([t["name"], t["address"], t["type"], t["bytes"], t["description"]], rows) + [""]
    lines += [f"### {t['sysflags']}", ""]
    rows = [[f"`{f['macro']}`", f"`{hexw(num(f['value']))}`", f["doc"]] for f in c["memory"]["systemFlags"]]
    lines += md_table([t["name"], t["value"], t["description"]], rows) + [""]
    lines += [f"### {t['types']}", ""]
    rows = [[f"`{m['name']}`", f"`{hexw(num(m['value']))}`", "—" if m["size"] is None else str(m["size"]), m["doc"]] for m in c["types"]["members"]]
    lines += md_table([t["name"], t["id"], t["typeSize"], t["description"]], rows) + [""]
    s = c["string"]
    lines += [f"### {t['string']}", "",
              t["stringIntro"].format(default=s["defaultSize"], total=s["dataOffset"] + s["defaultSize"] + 1, max=s["maxSize"]), ""]
    titles = {g["id"]: g["title"] for g in c["groups"]}
    lines += [f"### {t['opcodes']}", "", t["opcodesIntro"], ""]
    rows = []
    for o in c["opcodes"]:
        flags = ", ".join(f"`{f}`" for f in o["flags"]) or "—"
        rows.append([f"`{hexw(num(o['code']))}`", f"`{o['name']}`", str(o["operand"]), f"`{o['effect']}`", flags, o["doc"]])
    lines += md_table([t["hex"], t["mnemonic"], t["operand"], t["effect"], t["flagsCol"], t["description"]], rows) + [""]
    lines += [f"### {t['vmErrors']}", ""]
    rows = [[f"`{c['vm']['errors']['prefix']}{m['name']}`", f"`{hexw(num(m['value']))}`", m["doc"]] for m in c["vm"]["errors"]["members"]]
    lines += md_table([t["name"], t["code"], t["description"]], rows) + [""]
    lines += [f"### {t['loaderErrors']}", ""]
    rows = [[f"`{e['macro']}`", f"`{e['value']}`", e["doc"]] for e in c["loader"]["errors"]]
    lines += md_table([t["name"], t["code"], t["description"]], rows) + [""]
    lines += [f"### {t['comm']}", "", t["commIntro"], ""]
    blocks = comm_blocks(c)
    rows = [[f"`{b['name']}`", f"`{hexw(b['kind'], 4)}`", str(b["size"]), b["doc"]] for b in blocks]
    lines += md_table([t["name"], t["kind"], t["instanceSize"], t["description"]], rows) + [""]
    lines += [t["kindMax"].format(value=f"`{hexw(num(c['comm']['kindMax']['value']), 4)}`"), ""]
    for b in blocks:
        lines += [f"#### {t['blockLayout'].format(name='`' + b['name'] + '`')}", ""]
        rows = [[str(m["offset"]), f"`{m['name']}`", f"`{m['type']}`", t[m["dir"]]] for m in b["members"]]
        lines += md_table([t["offset"], t["member"], t["type"], t["direction"]], rows) + [""]
    lines += [f"### {t['commStatus']}", ""]
    rows = [[f"`{c['comm']['statuses']['prefix']}{m['name']}`", f"`{num(m['value'])}`"] for m in c["comm"]["statuses"]["members"]]
    lines += md_table([t["name"], t["code"]], rows) + [""]
    return "\n".join(lines).rstrip() + "\n"


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def expected_outputs(contract: dict) -> dict[Path, str]:
    outputs: dict[Path, str] = {TS_OUT: render_ts(contract) + "\n", PY_OUT: render_py(contract)}
    for path in REGION_FILES:
        outputs[path] = apply_regions(path, path.read_text(encoding="utf-8"), contract)
    return outputs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="fail when a generated file is stale")
    args = parser.parse_args(argv)
    try:
        contract = load()
        outputs = expected_outputs(contract)
    except ContractError as error:
        print(f"contract: {error}", file=sys.stderr)
        return 2
    stale = []
    for path, text in outputs.items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current != text:
            stale.append(path)
            if not args.check:
                path.write_text(text, encoding="utf-8")
                print(f"wrote {shown(path)}")
            else:
                diff = difflib.unified_diff((current or "").splitlines(), text.splitlines(), "committed", "generated", lineterm="", n=1)
                print(f"stale: {shown(path)}", file=sys.stderr)
                for i, line in enumerate(diff):
                    if i >= 12:
                        print("  ...", file=sys.stderr)
                        break
                    print(f"  {line}", file=sys.stderr)
    if args.check and stale:
        print(f"contract: {len(stale)} generated file(s) differ from a fresh generation; run python3 {GENERATOR_REL}", file=sys.stderr)
        return 1
    if args.check:
        print(f"contract: {len(outputs)} generated files are up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
