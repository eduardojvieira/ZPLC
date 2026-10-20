#!/usr/bin/env python3
"""The HAL contract is complete on every shipped port (IO-007).

Every function that firmware/lib/zplc_core/include/zplc_hal.h declares must

* be defined by each port: POSIX, Zephyr, WASM and FreeRTOS (the Zephyr I/O table is defined by the file that
  firmware/zephyr/scripts/gen_io_table.py generates, so the generator's text counts for the Zephyr port);
* have a caller somewhere in the firmware outside the port sources, the tests and the header, unless
  tools/ci/hal-contract.json lists it under `no_caller` with the reason. The ledger keeps a gap visible: an entry for a
  function that is called, or that is no longer declared, fails the check so that the ledger shrinks.

A function the board cannot perform returns ZPLC_HAL_NOT_IMPL; that is the defined "not supported" result.
Usage: check_hal_contract.py            prints findings and exits 1 when there are any
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORE = Path("firmware/lib/zplc_core")
HEADER = CORE / "include/zplc_hal.h"
LEDGER = Path("tools/ci/hal-contract.json")
PORTS = {
    "posix": [CORE / "src/hal/posix/zplc_hal_posix.c"],
    "zephyr": [
        CORE / "src/hal/zephyr/zplc_hal_zephyr.c",
        CORE / "src/hal/zephyr/zplc_scheduler_zephyr.c",
        Path("firmware/zephyr/scripts/gen_io_table.py"),
    ],
    "wasm": [CORE / "src/hal/wasm/zplc_hal_wasm.c"],
    # The FreeRTOS port keeps its storage in a file of its own (a board port replaces it with its flash driver).
    "freertos": [CORE / "src/hal/freertos/zplc_hal_freertos.c", CORE / "src/hal/freertos/zplc_persist_freertos.c"],
}
SOURCE_SUFFIXES = {".c", ".h", ".inc"}
SKIP_PARTS = {"tests", "build", "node_modules"}


def strip_comments(text: str) -> str:
    return re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", text, flags=re.S))


def declared_functions(header_text: str) -> list[str]:
    """The functions of the HAL header, in declaration order: `zplc_hal_*` and `zplc_io_*` prototypes."""
    names: list[str] = []
    for match in re.finditer(r"\b(zplc_(?:hal|io)_[a-z0-9_]+)\s*\([^;{}]*\)\s*;", strip_comments(header_text)):
        if match.group(1) not in names:
            names.append(match.group(1))
    return names


def is_defined(text: str, name: str) -> bool:
    """A function body (`name(...) {`) or, in the generator, the text of the definition it emits."""
    code = strip_comments(text)
    if re.search(rf"\b{name}\s*\([^;{{}}]*\)\s*\{{", code):
        return True
    return re.search(rf"{name}\s*\(void\)\s*\{{", text) is not None


def port_text(root: Path, relative: Path) -> str:
    """A port source and the `.inc` files it includes (the accessors every port shares live in one)."""
    path = root / relative
    text = path.read_text()
    for include in re.findall(r'#include\s+"([^"]+\.inc)"', text):
        shared = (path.parent / include).resolve()
        if shared.is_file():
            text += "\n" + shared.read_text()
    return text


def source_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in (root / "firmware").rglob("*"):
        if path.suffix in SOURCE_SUFFIXES and path.is_file() and not (SKIP_PARTS & set(path.relative_to(root).parts)):
            files.append(path)
    return files


def has_caller(root: Path, name: str, header: Path) -> bool:
    """A call site: the name followed by `(`, not in a comment and not the definition or declaration itself."""
    call = re.compile(rf"\b{name}\s*\(")
    for path in source_files(root):
        if path == header:
            continue
        code = strip_comments(path.read_text(errors="replace"))
        for match in call.finditer(code):
            line_start = code.rfind("\n", 0, match.start()) + 1
            prefix = code[line_start:match.start()]
            # `type name(` at the start of a statement is a definition or declaration, not a call
            if re.match(r"^\s*(?:static\s+|const\s+|extern\s+)*[A-Za-z_][\w\s\*]*[\s\*]$", prefix) and not re.search(r"\b(return|=|\()", prefix):
                continue
            return True
    return False


def check(root: Path) -> list[str]:
    findings: list[str] = []
    header_text = (root / HEADER).read_text()
    functions = declared_functions(header_text)
    ledger = json.loads((root / LEDGER).read_text()).get("no_caller", {})

    for port, files in PORTS.items():
        text = "\n".join(port_text(root, f) for f in files if (root / f).is_file())
        for name in functions:
            if not is_defined(text, name):
                findings.append(f"{name} has no implementation on the {port} port")

    for name in functions:
        called = has_caller(root, name, root / HEADER)
        if not called and name not in ledger:
            findings.append(f"{name} has no caller and is not in the ledger of tools/ci/hal-contract.json")
        if called and name in ledger:
            findings.append(f"{name} is in the ledger as having no caller but is called: remove the entry")
    for name in ledger:
        if name not in functions:
            findings.append(f"{name} is in the ledger but zplc_hal.h does not declare it: remove the entry")
    return findings


def main() -> int:
    findings = check(ROOT)
    for finding in findings:
        print(f"ERROR: {finding}")
    if findings:
        return 1
    print("The HAL contract is complete on the posix, zephyr, wasm and freertos ports.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
