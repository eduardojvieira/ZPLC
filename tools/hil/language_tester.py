"""Fixture runs on a device: the phases and expected values of tools/hil/fixtures.json (HIL-005).

The host test (packages/zplc-ide/src/cli/hilFixtures.test.ts) runs the same phases on the native runtime with a
virtual clock; this runs them on whatever device the tester has, waiting for the device's own scan counter. Inputs
are forced for the phase and every force is released at the end, and values are read while the program runs because
STOP puts the outputs in their safe state.
"""
from __future__ import annotations

import json
import re
import struct
from pathlib import Path

from zplc_tester import ROOT, ZPLCTester  # noqa: F401  (ROOT is re-exported for the scripts)

HIL = Path(__file__).resolve().parent
MANIFEST = HIL / "fixtures.json"
BASES = {"I": 0x0000, "Q": 0x1000, "M": 0x2000}
WIDTH = {"X": 1, "B": 1, "W": 2, "D": 4}
FORMAT = {"SINT": "<b", "USINT": "<B", "BYTE": "<B", "INT": "<h", "UINT": "<H", "WORD": "<H", "DINT": "<i", "UDINT": "<I", "DWORD": "<I", "REAL": "<f"}
ADDRESS = re.compile(r"^%([IQM])([XBWD])(\d+)(?:\.(\d+))?$")


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text())


def fixtures_of(*, language: str | None = None, ids: list[str] | None = None, hardware: bool | None = None) -> list[dict]:
    found = load_manifest()["fixtures"]
    if language is not None:
        found = [f for f in found if f["language"] == language]
    if ids is not None:
        found = [f for f in found if f["id"] in ids]
    if hardware is not None:
        found = [f for f in found if f["hardware"] == hardware]
    return found


def locate(at: str, kind: str) -> tuple[int, int, int | None]:
    """(address, size, bit) of an IEC direct address, with the rules of the host conformance cases."""
    match = ADDRESS.match(at)
    if not match:
        raise ValueError(f"{at!r} is not a direct address")
    region, letter, index, bit = match.groups()
    size = 1 if kind == "BOOL" else struct.calcsize(FORMAT[kind])
    return BASES[region] + int(index) * WIDTH[letter], size, int(bit) if bit is not None else None


def judge(cell: dict, seen, changes: int) -> str | None:
    """None when the cell holds, else why not."""
    op, wanted = cell.get("op", "eq"), cell.get("value")
    if op == "toggles":
        return None if changes >= cell.get("min", 1) else f"{cell['at']} changed {changes} times, expected at least {cell.get('min', 1)}"
    if op == "eq":
        return None if seen == wanted else f"{cell['at']} ({cell['type']}) is {seen!r}, expected {wanted!r}"
    if op == "ge":
        return None if seen >= wanted else f"{cell['at']} ({cell['type']}) is {seen!r}, expected at least {wanted!r}"
    if op == "approx":
        return None if abs(seen - wanted) <= cell.get("tolerance", 0) else f"{cell['at']} ({cell['type']}) is {seen!r}, expected {wanted!r} within {cell.get('tolerance')}"
    low, high = cell.get("min", float("-inf")), cell.get("max", float("inf"))
    return None if low <= seen <= high else f"{cell['at']} ({cell['type']}) is {seen!r}, expected between {low} and {high}"


class LanguageTester(ZPLCTester):
    """The tester with the fixture runner."""

    def scan_count(self) -> int | None:
        match = re.search(r'"cycles"\s*:\s*(\d+)', self.send("zplc status --json"))
        return int(match.group(1)) if match else None

    def wait_scans(self, scans: int, scan_ms: int = 50, watch: list[dict] | None = None) -> dict[str, int]:
        """Wait until the device has run `scans` more scans; count the changes of the watched cells while waiting.

        The count is of the scans the device itself reports, so a slow or fast board does not change what is asked of it.
        A device that reports no scan counter fails the wait.
        """
        import time  # noqa: PLC0415

        start = self.scan_count()
        if start is None:
            raise RuntimeError("the device reports no scan counter (zplc status --json)")
        changes: dict[str, int] = {}
        last: dict[str, object] = {}
        deadline = time.time() + max(5.0, scans * scan_ms / 1000 * 4) * (self.pace or 0.0 or 1.0)
        while time.time() < deadline:
            for cell in watch or []:
                seen = self.read_cell(cell)
                if cell["at"] in last and last[cell["at"]] != seen:
                    changes[cell["at"]] = changes.get(cell["at"], 0) + 1
                last[cell["at"]] = seen
            now = self.scan_count()
            if now is not None and now - start >= scans:
                return changes
            time.sleep(min(0.02, scan_ms / 2000))
        raise RuntimeError(f"the device did not run {scans} scans in time")

    def read_cell(self, cell: dict):
        address, size, bit = locate(cell["at"], cell["type"])
        data = self.peek(address, size)
        if len(data) < size:
            return None
        if cell["type"] == "BOOL":
            return bool(data[0] & (1 << (bit or 0)))
        return struct.unpack(FORMAT[cell["type"]], bytes(data))[0]

    def force_input(self, shadow: dict[int, int], cell: dict) -> None:
        address, _, bit = locate(cell["at"], cell["type"])
        if cell["type"] == "BOOL":
            byte = shadow.get(address, 0)
            byte = byte | (1 << bit) if cell["value"] else byte & ~(1 << bit)
        else:
            raise ValueError("only BOOL inputs are forced by the fixtures")
        shadow[address] = byte
        self.send(f"zplc dbg force set {hex(address)} {byte:02x}", wait_for="OK:")

    def run_fixture(self, fixture: dict, scan_ms: int | None = None) -> list[str]:
        """Compile the fixture, run its phases and return what differed from the expected values (empty is a pass)."""
        scan_ms = scan_ms or load_manifest()["scanMs"]
        problems: list[str] = []
        source = HIL / fixture["source"]
        self.upload_bytecode(self.compile_project(source) if source.is_dir() else self.compile_st(str(source)))
        self.send("zplc hil mode off")
        self.send("zplc start")
        shadow: dict[int, int] = {}
        try:
            total = 0
            for number, phase in enumerate(fixture["phases"], start=1):
                for cell in phase.get("inputs", []):
                    self.force_input(shadow, cell)
                watch = [c for c in phase["expect"] if c.get("op") == "toggles"]
                changes = self.wait_scans(phase["scans"], scan_ms, watch)
                total += phase["scans"]
                for cell in phase["expect"]:
                    seen = self.read_cell(cell) if cell.get("op") != "toggles" else None
                    why = "the cell could not be read" if seen is None and cell.get("op") != "toggles" else judge(cell, seen, changes.get(cell["at"], 0))
                    if why:
                        problems.append(f"phase {number} after {total} scans: {why}")
        finally:
            self.send("zplc dbg force clear_all")
            self.send("zplc stop")
        return problems

    def run_fixtures(self, fixtures: list[dict]) -> int:
        """Run each fixture as one check and return the exit status."""
        for fixture in fixtures:
            try:
                problems = self.run_fixture(fixture)
            except Exception as error:  # a compile or a device error is a failed check, with its message
                problems = [f"{type(error).__name__}: {error}"]
            self.check(f"{fixture['id']}: {fixture['title']}", not problems, "; ".join(problems))
        self.close()
        return self.finish()
