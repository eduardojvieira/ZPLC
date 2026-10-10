#!/usr/bin/env python3
"""Restamp the artifacts the repository commits after a draft-counter bump (CMP-052).

Every .zplc artifact records the draft counter of the contract it was built for in
header word 28, and the loader refuses a different value. Each contract change before
the freeze increases abi.draftCounter in tools/contract/contract.json, so every committed
artifact that embeds the counter has to follow. This tool finds them and rewrites exactly
two header fields:

  bytes 28..31   the draft counter, set to the current abi.draftCounter
  bytes 12..15   the CRC-32 over the whole file except those four bytes

What it finds:

  *.zplc         a binary artifact (examples, fuzz findings)
  hex text       a run of hex digits that starts with the magic 5A504C43: a *.hex fixture,
                 or a string in JSON (the fuzz seed corpus), Python or C source
  byte arrays    {0x5a, 0x50, 0x4c, 0x43, ...} in C, C++ or TypeScript source, with comments
                 allowed between the bytes (the shared test fixtures of firmware/)

A candidate is an artifact only when its header says the length it has (32 + 8 per segment
+ the segment sizes), so a truncated example in a README is left alone. It is restamped only
when its CRC is valid and its counter is a recorded draft below the current one
(tools/contract/golden/draft-ledger.json): an artifact with counter 0 (built before the
counter), a counter that was never a draft, or a damaged CRC is a deliberate negative test
and is reported, never changed.

Restamping is right only when the contract change keeps the meaning of the code already
written (new opcodes, a new error code). A change that renumbers or redefines an opcode needs
the artifacts rebuilt from their source, not restamped.

Usage:
  python3 tools/contract/restamp_artifacts.py           rewrite the stale artifacts
  python3 tools/contract/restamp_artifacts.py --check   exit 1 when one is stale (CI, contract:check)
  python3 tools/contract/restamp_artifacts.py --root D  scan another tree (the unit tests)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import struct
import subprocess
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAGIC = b"ZPLC"
HEADER_SIZE = 32
SEGMENT_ENTRY_SIZE = 8
CRC_OFFSET = 12
COUNTER_OFFSET = 28

SKIP_DIRS = {".git", "node_modules", "build", "dist", "coverage", ".codegraph", ".atl", "__pycache__", "target"}
# Prose and lock files hold truncated examples and package hashes, never an artifact a test loads.
SKIP_SUFFIXES = {".md", ".mdx", ".lock", ".lockb", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2",
                 ".pdf", ".zip", ".gz", ".xz", ".so", ".a", ".o", ".exe", ".dll", ".wasm", ".node", ".icns"}
MAX_TEXT_BYTES = 8 * 1024 * 1024

COMMENT = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)
BYTE_TOKEN = r"0[xX][0-9A-Fa-f]{1,2}[uU]?"
GAP = r"[\s,]+"
ARRAY = re.compile(
    rf"0[xX]5[aA][uU]?{GAP}0[xX]50[uU]?{GAP}0[xX]4[cC][uU]?{GAP}0[xX]43[uU]?(?:{GAP}{BYTE_TOKEN})*"
)
BYTE = re.compile(BYTE_TOKEN)
HEX_RUN = re.compile(r"(?<![0-9A-Fa-f])5[aA]504[cC]43(?:[0-9A-Fa-f]{2})*(?![0-9A-Fa-f])")


@dataclass
class Artifact:
    path: str            # repository-relative path
    kind: str            # "binary", "hex" or "array"
    where: str           # "file", "line N"
    counter: int
    status: str          # "current", "stale", "other" (left alone on purpose), "crc" (damaged, left alone)
    note: str = ""


def crc_of(data: bytes) -> int:
    return zlib.crc32(data[:CRC_OFFSET] + data[CRC_OFFSET + 4:]) & 0xFFFFFFFF


def container_length(data: bytes) -> int | None:
    """The length the header of `data` declares, or None when it is not a ZPLC header."""
    if len(data) < HEADER_SIZE or data[:4] != MAGIC:
        return None
    segments = struct.unpack_from("<H", data, 26)[0]
    table_end = HEADER_SIZE + segments * SEGMENT_ENTRY_SIZE
    if table_end > len(data):
        return None
    total = table_end
    for index in range(segments):
        total += struct.unpack_from("<I", data, HEADER_SIZE + index * SEGMENT_ENTRY_SIZE + 4)[0]
    return total


def current_counter(root: Path) -> int:
    return int(json.loads((root / "tools/contract/contract.json").read_text(encoding="utf-8"))["abi"]["draftCounter"])


def ledger_counters(root: Path) -> set[int]:
    ledger = json.loads((root / "tools/contract/golden/draft-ledger.json").read_text(encoding="utf-8"))
    return {int(entry["counter"]) for entry in ledger["entries"]}


def restamp_bytes(data: bytes, counter: int) -> bytes:
    out = bytearray(data)
    struct.pack_into("<I", out, COUNTER_OFFSET, counter)
    struct.pack_into("<I", out, CRC_OFFSET, crc_of(bytes(out)))
    return bytes(out)


def judge(data: bytes, current: int, recorded: set[int]) -> tuple[str, int]:
    """(status, counter) of one candidate artifact."""
    counter = struct.unpack_from("<I", data, COUNTER_OFFSET)[0]
    if struct.unpack_from("<I", data, CRC_OFFSET)[0] != crc_of(data):
        return "crc", counter
    if counter == current:
        return "current", counter
    if counter in recorded and counter < current:
        return "stale", counter
    return "other", counter


def tracked_files(root: Path) -> list[Path]:
    if (root / ".git").exists():
        result = subprocess.run(["git", "-C", str(root), "ls-files", "-z"], capture_output=True)
        if result.returncode == 0:
            names = [name for name in result.stdout.decode("utf-8", "replace").split("\0") if name]
            return [root / name for name in names if (root / name).is_file()]
    found: list[Path] = []
    for directory, subdirs, files in os.walk(root):
        subdirs[:] = [name for name in subdirs if name not in SKIP_DIRS]
        found.extend(Path(directory) / name for name in files)
    return found


def wanted(path: Path, root: Path) -> bool:
    relative = path.relative_to(root)
    if any(part in SKIP_DIRS for part in relative.parts):
        return False
    return path.suffix.lower() not in SKIP_SUFFIXES


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def scan_text(text: str, relative: str, current: int, recorded: set[int]) -> tuple[list[Artifact], str]:
    """Artifacts written as text in `text`, and the text with the stale ones restamped."""
    found: list[Artifact] = []
    edits: list[tuple[int, int, str]] = []   # (start, end, replacement)

    masked = COMMENT.sub(lambda match: " " * len(match.group()), text)
    for run in ARRAY.finditer(masked):
        tokens = list(BYTE.finditer(masked, run.start(), run.end()))
        data = bytes(int(token.group().rstrip("uU"), 16) for token in tokens)
        if container_length(data) != len(data):
            continue
        status, counter = judge(data, current, recorded)
        found.append(Artifact(relative, "array", f"line {line_of(text, run.start())}", counter, status))
        if status != "stale":
            continue
        fresh = restamp_bytes(data, current)
        for index in (*range(CRC_OFFSET, CRC_OFFSET + 4), *range(COUNTER_OFFSET, COUNTER_OFFSET + 4)):
            token = tokens[index]
            digits = token.group()[2:].rstrip("uU")
            suffix = token.group()[2 + len(digits):]
            prefix = token.group()[:2]
            hexed = f"{fresh[index]:0{len(digits)}x}"
            if digits.upper() == digits and digits.lower() != digits:
                hexed = hexed.upper()
            edits.append((token.start(), token.end(), prefix + hexed + suffix))

    for run in HEX_RUN.finditer(masked):
        data = bytes.fromhex(run.group())
        if container_length(data) != len(data):
            continue
        status, counter = judge(data, current, recorded)
        found.append(Artifact(relative, "hex", f"line {line_of(text, run.start())}", counter, status))
        if status != "stale":
            continue
        fresh = restamp_bytes(data, current)
        upper = run.group().upper() == run.group() and run.group().lower() != run.group()
        for index in (*range(CRC_OFFSET, CRC_OFFSET + 4), *range(COUNTER_OFFSET, COUNTER_OFFSET + 4)):
            hexed = f"{fresh[index]:02x}"
            start = run.start() + 2 * index
            edits.append((start, start + 2, hexed.upper() if upper else hexed))

    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    return found, text


def process(root: Path, write: bool) -> list[Artifact]:
    current = current_counter(root)
    recorded = ledger_counters(root)
    artifacts: list[Artifact] = []
    for path in sorted(tracked_files(root)):
        if not wanted(path, root):
            continue
        relative = path.relative_to(root).as_posix()
        raw = path.read_bytes()
        if path.suffix.lower() == ".zplc":
            if container_length(raw) != len(raw):
                artifacts.append(Artifact(relative, "binary", "file", 0, "other", "not a container of its own length"))
                continue
            status, counter = judge(raw, current, recorded)
            artifacts.append(Artifact(relative, "binary", "file", counter, status))
            if status == "stale" and write:
                path.write_bytes(restamp_bytes(raw, current))
            continue
        if len(raw) > MAX_TEXT_BYTES or b"\0" in raw[:4096]:
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if "5a504c43" not in text.lower() and not re.search(r"0[xX]5[aA]", text):
            continue
        found, rewritten = scan_text(text, relative, current, recorded)
        artifacts.extend(found)
        if write and rewritten != text:
            path.write_bytes(rewritten.encode("utf-8"))
    return artifacts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="change nothing; exit 1 when an artifact is stale")
    parser.add_argument("--root", type=Path, default=ROOT, help="tree to scan (default: this repository)")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    current = current_counter(root)
    artifacts = process(root, write=not args.check)
    stale = [a for a in artifacts if a.status == "stale"]

    if args.check:
        for artifact in stale:
            print(f"stale: {artifact.path} ({artifact.kind}, {artifact.where}) carries draft counter "
                  f"{artifact.counter}, the contract is at {current}", file=sys.stderr)
        if stale:
            print(f"restamp_artifacts: {len(stale)} stale artifact(s); run "
                  f"python3 tools/contract/restamp_artifacts.py", file=sys.stderr)
            return 1
        print(f"restamp_artifacts: {len(artifacts)} artifact(s) found, none stale (draft counter {current})")
        return 0

    for artifact in stale:
        print(f"restamped {artifact.path} ({artifact.kind}, {artifact.where}): counter {artifact.counter} -> {current}")
    left: dict[tuple[str, str, str], int] = {}
    for artifact in artifacts:
        if artifact.status in {"other", "crc"}:
            reason = "damaged CRC" if artifact.status == "crc" else f"counter {artifact.counter} is not a recorded draft below {current}"
            key = (artifact.path, artifact.kind, reason)
            left[key] = left.get(key, 0) + 1
    for (path, kind, reason), count in left.items():
        print(f"left alone {path} ({kind}, {count} artifact(s)): {reason}")
    print(f"restamp_artifacts: {len(artifacts)} artifact(s) found, {len(stale)} restamped (draft counter {current})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
