#!/usr/bin/env python3
"""Where the flash and the RAM of a firmware/app build go (WS-42).

Reads the linker map of a `west build` tree (`zephyr/zephyr.map`) and prints, per board, the used bytes per
memory region, the budget headroom of tools/firmware-test/size-budget.json, the input sections by kind and by
library, and the largest input sections per region. With -ffunction-sections and -fdata-sections an input section
is one function or one object, so the list is a symbol list that also names the object file that owns it.

  python3 -B -I tools/firmware-test/footprint_report.py --logs $ZPLC_FW_WS/out/size [--board ID ...] [--top 25]
  python3 -B -I tools/firmware-test/footprint_report.py --map zephyr.map --flash FLASH --ram RAM

It reads files and prints; it builds nothing and changes nothing. A size from a host build is not hardware
evidence (docs/docs/development/firmware-testing.md).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_BUDGET = HERE / "size-budget.json"

REGION_ROW = re.compile(r"^(\S+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)(?:\s+\S+)?\s*$")
OUTPUT_FULL = re.compile(r"^(\S+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)(?:\s+load address 0x([0-9a-fA-F]+))?\s*$")
OUTPUT_NAME = re.compile(r"^([^\s*][^\s]*)\s*$")
CONTINUATION = re.compile(r"^\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)(?:\s+load address 0x([0-9a-fA-F]+))?\s*$")
INPUT_FULL = re.compile(r"^ (\S+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)(?:\s+(.*\S))?\s*$")
INPUT_NAME = re.compile(r"^ (\.\S+|COMMON)\s*$")
INPUT_REST = re.compile(r"^\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)\s+(.*\S)\s*$")
RELAXING = re.compile(r"^\s+0x([0-9a-fA-F]+)\s+\(size before relaxing\)\s*$")
MERGEABLE = re.compile(r"\.str\d*(\.\d+)?$|^\.rodata\.cst\d+")


class Section:
    """One input section: what the linker placed, where, and from which object."""

    __slots__ = ("name", "address", "size", "owner", "load", "merge", "before")

    def __init__(self, name: str, address: int, size: int, owner: str, load: int | None) -> None:
        self.name = name
        self.address = address
        self.size = size
        self.owner = owner
        self.load = load  # load address of the output section when it differs from its address (the .data image)
        # Mergeable string and constant sections: the linker keeps one copy of each string, so the sizes of the
        # inputs are not additive. "pool" is the input that carries the size of the whole merged block (the map
        # marks it with "size before relaxing"), "member" is any other mergeable input: it takes no room of its own.
        self.merge = "member" if MERGEABLE.search(name) else None
        self.before = size  # the size before merging


def parse_map(text: str) -> tuple[list[tuple[str, int, int]], list[Section]]:
    """The memory regions (name, origin, length) and the non-empty input sections of a GNU ld map."""
    regions: list[tuple[str, int, int]] = []
    sections: list[Section] = []
    lines = text.splitlines()
    state = "start"
    load: int | None = None
    pending_output = False
    pending_input: str | None = None
    for line in lines:
        relaxed = RELAXING.match(line)
        if relaxed is not None and sections and sections[-1].merge is not None:
            sections[-1].merge = "pool"
            sections[-1].before = int(relaxed.group(1), 16)
            continue
        if state == "start":
            if line.startswith("Memory Configuration"):
                state = "regions"
            continue
        if state == "regions":
            match = REGION_ROW.match(line)
            if match is not None and match.group(1) not in ("Name", "*default*"):
                regions.append((match.group(1), int(match.group(2), 16), int(match.group(3), 16)))
            elif line.startswith("Linker script and memory map"):
                state = "map"
            continue
        if pending_output:
            pending_output = False
            cont = CONTINUATION.match(line)
            if cont is not None:
                load = int(cont.group(3), 16) if cont.group(3) else None
                continue
        if pending_input is not None:
            name, pending_input = pending_input, None
            rest = INPUT_REST.match(line)
            if rest is not None:
                _add(sections, name, int(rest.group(1), 16), int(rest.group(2), 16), rest.group(3), load)
                continue
        full = INPUT_FULL.match(line)
        if full is not None and line.startswith(" ") and not line.startswith("  "):
            _add(sections, full.group(1), int(full.group(2), 16), int(full.group(3), 16), full.group(4) or "(padding)", load)
            continue
        named = INPUT_NAME.match(line)
        if named is not None:
            pending_input = named.group(1)
            continue
        out = OUTPUT_FULL.match(line)
        if out is not None and not line.startswith(" "):
            load = int(out.group(4), 16) if out.group(4) else None
            continue
        if OUTPUT_NAME.match(line) is not None and not line.startswith(" "):
            pending_output = True
            load = None
    return regions, sections


NOT_LOADED = (".debug", ".comment", ".stab", ".ARM.attributes", ".riscv.attributes", ".xtensa.info", ".xt.")
NO_IMAGE = ("noinit", ".bss", "COMMON")  # occupy RAM only: there is no initial image to keep in flash


def _add(sections: list[Section], name: str, address: int, size: int, owner: str, load: int | None) -> None:
    if size > 0 and not name.startswith(NOT_LOADED):
        sections.append(Section(name, address, size, owner, load))


def region_of(regions: list[tuple[str, int, int]], address: int) -> str | None:
    for name, origin, length in regions:
        if origin <= address < origin + length and length != 0xFFFFFFFF:
            return name
    return None


def kind_of(name: str) -> str:
    if name == "*fill*":
        return "(padding)"
    for kind in (".text", ".rodata", ".bss", ".data", ".noinit", ".ARM.", ".ramfunc"):
        if name.startswith(kind):
            return kind.rstrip(".")
    return name


def library_of(owner: str) -> str:
    if "(" in owner:
        archive = owner.split("(", 1)[0]
        return archive.rsplit("/", 1)[-1]
    return owner.rsplit("/", 1)[-1] if owner else "(none)"


def object_of(owner: str) -> str:
    return owner.split("(", 1)[1].rstrip(")") if "(" in owner else owner.rsplit("/", 1)[-1]


def account(regions: list[tuple[str, int, int]], sections: list[Section]) -> dict[str, list[Section]]:
    """The input sections that take space in each region: by address, plus the initial image of .data by load address."""
    placed: dict[str, list[Section]] = defaultdict(list)
    for item in sections:
        if item.merge == "member":
            continue
        home = region_of(regions, item.address)
        if home is not None:
            placed[home].append(item)
        if item.load is not None and item.load != item.address and not any(word in item.name for word in NO_IMAGE):
            image = region_of(regions, item.load)
            if image is not None and image != home:
                placed[image].append(Section(item.name + " (initial image)", item.load, item.size, item.owner, None))
    return placed


def strings_by_object(sections: list[Section]) -> dict[str, int]:
    """String and constant bytes of each object before the linker merges duplicates (an upper bound of its share)."""
    found: dict[str, int] = defaultdict(int)
    for item in sections:
        if item.merge is not None:
            found[object_of(item.owner)] += item.before
    return found


def region_total(placed: dict[str, list[Section]], names: list[str]) -> int:
    return sum(item.size for name in names for item in placed.get(name, []))


def top(items: list[Section], count: int) -> list[Section]:
    return sorted(items, key=lambda item: (-item.size, item.name))[:count]


def render_board(
    board: str,
    regions: list[tuple[str, int, int]],
    sections: list[Section],
    flash: list[str],
    ram: list[str],
    count: int,
    budget: dict | None,
    link_table: dict[str, int] | None,
) -> list[str]:
    placed = account(regions, sections)
    lines = [f"## {board}"]
    lines.append(f"{'region':<14}{'map B':>10}{'link table B':>14}")
    for name, _origin, _length in regions:
        used = region_total(placed, [name])
        if used == 0 and not (link_table or {}).get(name):
            continue
        table = (link_table or {}).get(name)
        lines.append(f"{name:<14}{used:>10}{table if table is not None else '-':>14}")
    flash_total = (link_table or {}).get("__flash__")
    ram_total = (link_table or {}).get("__ram__")
    if flash_total is None:
        flash_total = region_total(placed, flash)
    if ram_total is None:
        ram_total = region_total(placed, ram)
    if budget is not None:
        for label, used in (("flash", flash_total), ("ram", ram_total)):
            limit = budget[label]
            lines.append(
                f"{label}: {used} of {limit} B budget, headroom {limit - used} B ({100.0 * used / limit:.1f}% used)"
            )
    else:
        lines.append(f"flash: {flash_total} B, ram: {ram_total} B (no budget given)")
    for title, names in (("flash", flash), ("ram", ram)):
        pool = [item for name in names for item in placed.get(name, [])]
        kinds: dict[str, int] = defaultdict(int)
        libraries: dict[str, int] = defaultdict(int)
        for item in pool:
            kinds[kind_of(item.name.split(" ")[0])] += item.size
            libraries[library_of(item.owner)] += item.size
        lines.append("")
        lines.append(f"### {title}: by kind of section")
        lines.extend(f"{value:>9}  {key}" for key, value in sorted(kinds.items(), key=lambda kv: -kv[1])[:12])
        lines.append(f"### {title}: by library")
        lines.extend(f"{value:>9}  {key}" for key, value in sorted(libraries.items(), key=lambda kv: -kv[1])[:12])
        objects: dict[str, int] = defaultdict(int)
        for item in pool:
            objects[object_of(item.owner)] += item.size if item.merge != "pool" else item.before
        lines.append(f"### {title}: by object file (a merged string block counts as its first member)")
        lines.extend(f"{value:>9}  {key}" for key, value in sorted(objects.items(), key=lambda kv: -kv[1])[:count])
        lines.append(f"### {title}: largest {count} input sections")
        for item in top(pool, count):
            lines.append(f"{item.size:>9}  {item.name:<46} {library_of(item.owner)}:{object_of(item.owner)}")
    pools = [item for item in sections if item.merge == "pool"]
    lines.append(f"### strings: {sum(item.size for item in pools)} B in {len(pools)} merged block(s); bytes per object before merging")
    ranked = sorted(strings_by_object(sections).items(), key=lambda kv: -kv[1])[:count]
    lines.extend(f"{value:>9}  {key}" for key, value in ranked)
    lines.append("")
    return lines


def parse_link_table(text: str, flash: list[str], ram: list[str]) -> dict[str, int]:
    """Used bytes per region of the build log's memory usage table, plus the flash and RAM totals of the budget."""
    units = {"B": 1, "KB": 1024, "MB": 1024 * 1024}
    table: dict[str, int] = {}
    inside = False
    for line in text.splitlines():
        if line.startswith("Memory region"):
            inside = True
            continue
        if not inside:
            continue
        match = re.match(r"^\s*(\S+):\s+(\d+)\s+(B|KB|MB)\s+", line)
        if match is None:
            if line.strip():
                inside = False
            continue
        table[match.group(1)] = int(match.group(2)) * units[match.group(3)]
    if flash and all(name in table for name in flash):
        table["__flash__"] = sum(table[name] for name in flash)
    if ram and all(name in table for name in ram):
        table["__ram__"] = sum(table[name] for name in ram)
    return table


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--logs", type=Path, help="the output directory of `run.sh size` (one tree per board id)")
    parser.add_argument("--board", action="append", default=[], help="board ids to report (default: all found)")
    parser.add_argument("--budget", type=Path, default=DEFAULT_BUDGET)
    parser.add_argument("--map", type=Path, help="one linker map instead of --logs")
    parser.add_argument("--flash", action="append", default=[], help="flash region names for --map")
    parser.add_argument("--ram", action="append", default=[], help="RAM region names for --map")
    parser.add_argument("--top", type=int, default=25)
    args = parser.parse_args(argv)

    if args.map is not None:
        regions, sections = parse_map(args.map.read_text(errors="replace"))
        print("\n".join(render_board(args.map.name, regions, sections, args.flash, args.ram, args.top, None, None)))
        return 0
    if args.logs is None:
        parser.error("give --logs or --map")
    budget = json.loads(args.budget.read_text())
    selected = args.board or sorted(budget["boards"])
    status = 0
    for board in selected:
        entry = budget["boards"].get(board)
        tree = args.logs / board
        map_file = tree / "zephyr" / "zephyr.map"
        if entry is None or not map_file.is_file():
            print(f"## {board}\nno budget entry or no map at {map_file}\n")
            status = 1
            continue
        regions, sections = parse_map(map_file.read_text(errors="replace"))
        log = args.logs / f"{board}.log"
        flash, ram = entry["regions"]["flash"], entry["regions"]["ram"]
        table = parse_link_table(log.read_text(errors="replace"), flash, ram) if log.is_file() else None
        print("\n".join(render_board(f"{board} ({entry['zephyr_board']})", regions, sections, flash, ram, args.top, entry["budget"], table)))
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
