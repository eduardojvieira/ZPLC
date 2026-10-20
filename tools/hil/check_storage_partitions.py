#!/usr/bin/env python3
"""IO-008: every storage user of a firmware/app build has a flash partition of its own.

    check_storage_partitions.py <build dir> [<build dir> ...]

Reads what a Zephyr build of firmware/app produced, `zephyr/zephyr.dts` and `zephyr/.config` of each build
directory (`run.sh size` keeps one per board under $ZPLC_FW_WS/out/size/<board id>), never the overlay text.
The storage users are the ones the firmware mounts:

  - the key-value store of firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c (program, RETAIN, settings and
    credentials): NVS, or ZMS when the build enables it, on `storage_partition`;
  - the LittleFS file system of firmware/app/src/zplc_config.c (the settings file and the certificate files) on
    `lfs_partition`, or on `storage_partition` when the board has no `lfs_partition`.

Three checks per user:

  (a) its partition is its own: no other user shares or overlaps it, and it overlaps no other partition;
  (b) it is whole erase blocks of its flash, at least two of them, and the erase block is one the user can mount
      (NVS refuses a sector above 64 KB);
  (c) it does not overlap the image slot, the flash range the linker may fill with the image
      (CONFIG_FLASH_LOAD_OFFSET and CONFIG_FLASH_LOAD_SIZE on the `zephyr,flash` device; a size of 0 runs to the end).

A board whose failure is known and owned elsewhere is listed in storage-partitions-open.json with the checks that
fail. The list only shrinks: a listed check that passes fails the run until its entry is removed.

This is build-level evidence. It says nothing about the flash of a board, which needs the bench of HIL-010.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARDS_JSON = HERE.parents[1] / "firmware/app/boards/boards.json"
OPEN_JSON = HERE / "storage-partitions-open.json"

#: NVS_MAX_SECTOR_SIZE of subsys/kvss/nvs/nvs_priv.h: NVS refuses a sector above it, and a sector is whole erase blocks.
NVS_MAX_SECTOR = 64 * 1024

#: A serial NOR flash states no erase block in the devicetree; its driver reads the erase sizes from the part (SFDP).
#: 64 KB, the largest block erase of these parts and the largest sector NVS accepts, is assumed: a partition that
#: holds two of those holds two of whatever the part reports.
NOR_COMPATIBLES = {"st,stm32-qspi-nor", "jedec,spi-nor", "st,stm32-ospi-nor", "st,stm32-xspi-nor", "nordic,qspi-nor"}
NOR_ASSUMED_ERASE = 64 * 1024

# A property name may hold commas (zephyr,flash); a comma alone separates two values.
TOKEN = re.compile(r'"(?:\\.|[^"\\])*"|<[^>]*>|\[[^\]]*\]|[{};=]|[^\s{};=<>"\[\]]+')


class Node:
    def __init__(self, name: str, labels: list[str], parent: "Node | None") -> None:
        self.name, self.labels, self.parent = name, labels, parent
        self.props: dict[str, list[str]] = {}
        self.children: list[Node] = []

    def cells(self, prop: str) -> list[int]:
        return [int(cell, 0) for token in self.props.get(prop, []) if token.startswith("<")
                for cell in token[1:-1].split() if not cell.startswith("&")]

    def strings(self, prop: str) -> list[str]:
        return [token[1:-1] for token in self.props.get(prop, []) if token.startswith('"')]

    def walk(self):
        yield self
        for child in self.children:
            yield from child.walk()


def parse_dts(text: str) -> Node:
    """The tree of a devicetree source as Zephyr writes zephyr.dts: merged, with no references to resolve."""
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"//[^\n]*", " ", text)
    root = Node("/", [], None)
    stack, words, value = [root], [], None
    for token in TOKEN.findall(text):
        if token == "{":
            name = words[-1] if words else ""
            labels = [word[:-1] for word in words[:-1] if word.endswith(":")]
            if name == "/" and len(stack) == 1:
                stack.append(root)
            else:
                node = Node(name, labels, stack[-1])
                stack[-1].children.append(node)
                stack.append(node)
            words = []
        elif token == "}":
            stack.pop()
        elif token == "=":
            value = []
        elif token == ";":
            if words and len(stack) > 1:
                stack[-1].props[words[-1]] = value or []
            words, value = [], None
        elif value is not None:
            if token != ",":
                value.append(token)
        else:
            words.append(token)
    return root


def read_config(text: str) -> dict[str, str]:
    return dict(re.findall(r'^(CONFIG_\w+)=(.*)$', text, flags=re.M))


class Partition:
    def __init__(self, node: Node) -> None:
        container = node.parent
        assert container is not None and container.parent is not None
        address_cells = (container.cells("#address-cells") or [1])[0]
        reg = node.cells("reg")
        self.label = node.labels[0] if node.labels else node.name
        self.node, self.device = node, container.parent
        self.offset = sum(cell << (32 * index) for index, cell in enumerate(reversed(reg[:address_cells])))
        self.size = sum(cell << (32 * index) for index, cell in enumerate(reversed(reg[address_cells:])))

    @property
    def end(self) -> int:
        return self.offset + self.size

    def overlaps(self, device: Node, start: int, end: int) -> bool:
        return self.device is device and self.offset < end and start < self.end


def kib(size: int) -> str:
    return f"{size // 1024} KB" if size % 1024 == 0 else f"{size} B"


def device_name(device: Node) -> str:
    return device.labels[0] if device.labels else device.name


def erase_block(device: Node) -> tuple[int | None, str]:
    if "erase-block-size" in device.props:
        return device.cells("erase-block-size")[0], ""
    if NOR_COMPATIBLES & set(device.strings("compatible")):
        return NOR_ASSUMED_ERASE, " assumed"
    return None, ""


def flash_size(device: Node) -> int:
    parent = device.parent
    address_cells = (parent.cells("#address-cells") if parent else []) or [1]
    reg = device.cells("reg")
    return sum(cell << (32 * index) for index, cell in enumerate(reversed(reg[address_cells[0]:])))


def check_build(dts_text: str, config_text: str) -> tuple[list[str], dict[str, list[str]]]:
    """The storage users of one build, each with its partition, and the failures per check (a, b, c)."""
    tree, config = parse_dts(dts_text), read_config(config_text)
    by_label = {label: node for node in tree.walk() for label in node.labels}
    partitions = [Partition(node) for node in tree.walk()
                  if node.parent is not None and "fixed-partitions" in node.parent.strings("compatible")
                  and node.cells("reg")]
    failures: dict[str, list[str]] = {"a": [], "b": [], "c": []}

    users: list[tuple[str, str, int | None]] = []  # user, partition label, largest erase block it can mount
    if config.get("CONFIG_ZMS") == "y":
        users.append(("ZMS store", "storage_partition", None))
    elif config.get("CONFIG_NVS") == "y":
        users.append(("NVS store", "storage_partition", NVS_MAX_SECTOR))
    if config.get("CONFIG_FILE_SYSTEM_LITTLEFS") == "y":
        users.append(("LittleFS", "lfs_partition" if "lfs_partition" in by_label else "storage_partition", None))

    chosen = next((node for node in tree.children if node.name == "chosen"), Node("chosen", [], None))
    flash = by_label.get(chosen.props.get("zephyr,flash", [""])[0].lstrip("&"))
    code = by_label.get(chosen.props.get("zephyr,code-partition", [""])[0].lstrip("&"))
    slot_start = int(config.get("CONFIG_FLASH_LOAD_OFFSET", "0"), 0)
    slot_size = int(config.get("CONFIG_FLASH_LOAD_SIZE", "0"), 0)
    slot_end = slot_start + slot_size if slot_size else (flash_size(flash) if flash else 0)

    lines, placed = [], []
    for user, label, largest_erase in users:
        node = by_label.get(label)
        if node is None or node not in [partition.node for partition in partitions]:
            failures["a"].append(f"{user}: no partition labelled {label}")
            continue
        partition = next(partition for partition in partitions if partition.node is node)
        for other_user, other in placed:
            if other.overlaps(partition.device, partition.offset, partition.end):
                failures["a"].append(f"{user} and {other_user} share {other.label}" if other is partition
                                     else f"{user} ({label}) overlaps {other_user} ({other.label})")
        for other in partitions:
            # The code partition is the image slot, which (c) checks.
            if other is not partition and other.node is not code \
                    and other.overlaps(partition.device, partition.offset, partition.end) \
                    and not any(other is used for _, used in placed):
                failures["a"].append(f"{user} ({label}) overlaps partition {other.label}")
        placed.append((user, partition))

        erase, assumed = erase_block(partition.device)
        if erase is None:
            failures["b"].append(f"{user} ({label}): the erase block of {device_name(partition.device)} is not known")
        else:
            if partition.offset % erase or partition.size % erase:
                failures["b"].append(f"{user} ({label}) is not whole erase blocks of {kib(erase)}")
            if partition.size < 2 * erase:
                failures["b"].append(f"{user} ({label}) holds {partition.size // erase} erase block of "
                                     f"{kib(erase)}{assumed}, it needs at least 2")
            if largest_erase is not None and erase > largest_erase:
                failures["b"].append(f"{user} ({label}): the erase block of {kib(erase)} is above the "
                                     f"{kib(largest_erase)} it can mount")

        if flash is not None and partition.overlaps(flash, slot_start, slot_end):
            failures["c"].append(f"{user} ({label}) overlaps the image slot "
                                 f"0x{slot_start:x}-0x{slot_end:x} of {device_name(flash)}")
        blocks = f", {partition.size // erase} x {kib(erase)}{assumed}" if erase else ""
        lines.append(f"{user} {label} {kib(partition.size)} at 0x{partition.offset:x} "
                     f"of {device_name(partition.device)}{blocks}")
    if not users:
        failures["a"].append("the build enables no storage user (CONFIG_NVS, CONFIG_ZMS, CONFIG_FILE_SYSTEM_LITTLEFS)")
    if flash is not None:
        lines.append(f"image slot 0x{slot_start:x}-0x{slot_end:x} of {device_name(flash)}")
    return lines, failures


def board_id(config_text: str, boards: list[dict]) -> str | None:
    target = read_config(config_text).get("CONFIG_BOARD_TARGET", "").strip('"')
    return next((board["board_id"] for board in boards if board["zephyr_board"] == target), None)


def report(build_dirs: list[Path], boards: list[dict], known_open: dict[str, dict]) -> tuple[list[str], int]:
    out, status = [], 0
    for build in build_dirs:
        dts, config = build / "zephyr/zephyr.dts", build / "zephyr/.config"
        if not dts.is_file() or not config.is_file():
            out.append(f"FAIL io-008 {build.name}: no zephyr/zephyr.dts and zephyr/.config in {build}")
            status = 1
            continue
        config_text = config.read_text()
        board = board_id(config_text, boards) or build.name
        lines, failures = check_build(dts.read_text(), config_text)
        listed = set(known_open.get(board, {}).get("checks", []))
        failing = {check for check, found in failures.items() if found}
        unlisted = failing - listed
        fixed = listed - failing
        summary = "; ".join(lines)
        if unlisted or fixed:
            status = 1
            details = [f"({check}) {text}" for check in sorted(unlisted) for text in failures[check]]
            details += [f"({check}) passes but is listed as open in {OPEN_JSON.name}: remove it" for check in sorted(fixed)]
            out.append(f"FAIL io-008 {board}: " + "; ".join(details) + f" [{summary}]")
        elif failing:
            details = [f"({check}) {text}" for check in sorted(failing) for text in failures[check]]
            out.append(f"OPEN io-008 {board}: " + "; ".join(details)
                       + f" (listed: {known_open[board]['reason']}) [{summary}]")
        else:
            out.append(f"PASS io-008 {board}: {summary}")
    return out, status


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0 if argv else 2
    boards = json.loads(BOARDS_JSON.read_text())
    known_open = json.loads(OPEN_JSON.read_text())
    lines, status = report([Path(arg) for arg in argv], boards, known_open)
    print("\n".join(lines))
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
