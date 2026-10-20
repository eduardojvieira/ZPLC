"""The board manifest and the board I/O description (IO-001, IO-005, IO-012, IO-015).

One file, firmware/app/boards/boards.json, lists every board profile. Each entry carries an `io` object: the channels
of the board with their direction, kind, IEC address, pin or terminal name, devicetree binding, electrical notes and
safe value. The firmware generator (gen_io_table.py), the manifest validator (tools/hil/validate_supported_boards.py)
and the board reference generator (tools/docs/generate_board_reference.py) read it through this module; Studio reads
the same JSON file through packages/zplc-ide/src/boards.

The module uses the standard library only.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Iterable, NamedTuple

SCHEMA_VERSION = 1
MAX_CHANNELS = 64
"""Channels of one board: the generated table and the sample buffers are sized with it (ZPLC_IO_MAX_CHANNELS)."""
IMAGE_SIZE = 0x1000
SYSTEM_REGISTER_OFFSET = 0x0FF0
"""The last 16 bytes of the input image are the system registers: no input channel may reach them."""

RECORD_SCHEMA = "zplc.hil-record/1"
HARDWARE_LEVEL = "hardware"
"""The only evidence level that raises a support level; `emulated` and `community-reported` never do (HIL contract)."""
COMMUNITY_SCHEMA = "zplc.community-report/1"
COMMUNITY_LEVEL = "community-reported"
"""A report from a user (HIL-011): listed beside the hardware records of a board, and never one of them."""

ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,15}$")
NODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
ADDRESS_PATTERN = re.compile(r"^%([IQ])([XW])(\d{1,4})(?:\.(\d))?$")
KINDS = ("digital", "analog")
DIRECTIONS = ("input", "output")
PIN_STATUSES = ("devicetree", "profile")
CHANNEL_REQUIRED = ("id", "direction", "kind", "address", "pin", "dt", "electrical", "pin_status", "source")
BOARD_REQUIRED = (
    "board_id", "display_name", "ide_id", "zephyr_board", "variant", "memory", "support_assets", "build_command",
    "network_class", "network_interface", "evidence_refs", "docs_ref", "io", "watchdog",
)
WATCHDOG_STATES = {"stop": ("disarm", "feed"), "pause": ("disarm", "feed"), "fault": ("disarm", "expire")}
"""What the hardware watchdog of a profile does in STOP, while paused or at a breakpoint, and in a latched fault (RT-020)."""
WATCHDOG_DEFAULT_POLICY = {"stop": "disarm", "pause": "feed", "fault": "expire"}
NETWORK_CLASSES = ("serial-focused", "network-capable", "other")
NETWORK_INTERFACES = ("none", "wifi", "ethernet")
ADC_ENUM = re.compile(r"^ADC_(GAIN|REF|ACQ_TIME)_[A-Z0-9_]+$")


class Address(NamedTuple):
    """A direct address in the process image: region I (input) or Q (output), byte offset, bit (digital) and width."""

    region: str
    byte: int
    bit: int | None
    width: int
    text: str


def parse_address(text: str) -> Address:
    """`%IX0.3` is bit 3 of input byte 0, `%IW4` is the word at input byte 8 (a word is two bytes)."""
    match = ADDRESS_PATTERN.match(text) if isinstance(text, str) else None
    if match is None:
        raise ValueError(f"{text!r} is not a direct address of the form %IXb.n, %QXb.n, %IWn or %QWn")
    region, size, number, bit = match.group(1), match.group(2), int(match.group(3)), match.group(4)
    if size == "X":
        if bit is None or int(bit) > 7:
            raise ValueError(f"{text!r}: a bit address needs a bit from 0 to 7")
        return Address(region, number, int(bit), 1, text)
    if bit is not None:
        raise ValueError(f"{text!r}: a word address has no bit")
    return Address(region, number * 2, None, 2, text)


def _is_text(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _source_exists(source: str, root: Path | None) -> bool:
    # A pin that comes from the board's own devicetree in the pinned Zephyr tree is named `zephyr:<path>`; the
    # firmware build proves it (the generated table asserts every alias, controller and pin), so it has no file here.
    if source.startswith("zephyr:"):
        return len(source) > len("zephyr:")
    return root is None or (root / source).is_file()


_PIN_NAMES = (
    # RP2040: GPn is pin n of gpio0.
    (re.compile(r"^GP(\d+)\b"), lambda n: ("gpio0", int(n))),
    # ESP32: GPIOn is pin n of gpio0 up to 31 and pin n - 32 of gpio1 from 32.
    (re.compile(r"^GPIO(\d+)\b"), lambda n: ("gpio0", int(n)) if int(n) < 32 else ("gpio1", int(n) - 32)),
    # STM32: Pxn is pin n of port x.
    (re.compile(r"^P([A-K])(\d{1,2})\b"), lambda port, n: (f"gpio{port.lower()}", int(n))),
)


def gpio_of_pin_name(pin: str) -> tuple[str, int] | None:
    """The GPIO controller label and pin that a printed pin name stands for, or None for a name of another form."""
    for pattern, gpio in _PIN_NAMES:
        match = pattern.match(pin)
        if match:
            return gpio(*match.groups())
    return None


def _validate_channel(channel: Any, label: str, root: Path | None) -> list[str]:
    errors: list[str] = []
    if not isinstance(channel, dict):
        return [f"{label} must be an object"]
    prefix = f"channel {channel.get('id', label)}"
    for key in CHANNEL_REQUIRED:
        if key not in channel:
            errors.append(f"{prefix} is missing {key}")
    if errors:
        return errors
    if not isinstance(channel["id"], str) or not ID_PATTERN.match(channel["id"]):
        errors.append(f"{prefix}: id must match {ID_PATTERN.pattern}")
    if channel["direction"] not in DIRECTIONS:
        errors.append(f"{prefix}: direction must be one of {', '.join(DIRECTIONS)}")
    if channel["kind"] not in KINDS:
        errors.append(f"{prefix}: kind must be one of {', '.join(KINDS)}")
    if not _is_text(channel["pin"]) or len(channel["pin"]) > 64:
        errors.append(f"{prefix}: pin must name the pin or terminal printed on the board")
    if not _is_text(channel["electrical"]):
        errors.append(f"{prefix}: electrical must carry the electrical notes")
    if channel["pin_status"] not in PIN_STATUSES:
        errors.append(f"{prefix}: pin_status must be one of {', '.join(PIN_STATUSES)}")
    if not _is_text(channel["source"]) or not _source_exists(channel["source"], root):
        errors.append(f"{prefix}: source {channel['source']!r} is not a file of the repository or a zephyr: reference")
    if "optional" in channel and not isinstance(channel["optional"], bool):
        errors.append(f"{prefix}: optional must be true or false")
    try:
        address = parse_address(channel["address"])
    except ValueError as error:
        errors.append(f"{prefix}: {error}")
        address = None
    if address is not None and channel["direction"] in DIRECTIONS:
        wanted = "I" if channel["direction"] == "input" else "Q"
        if address.region != wanted:
            errors.append(f"{prefix}: a {channel['direction']} cannot sit on the {address.text} address")
        if channel["kind"] == "digital" and address.bit is None:
            errors.append(f"{prefix}: a digital channel needs a bit address (%IXb.n or %QXb.n)")
        if channel["kind"] == "analog" and address.bit is not None:
            errors.append(f"{prefix}: an analog channel needs a word address (%IWn)")
        limit = SYSTEM_REGISTER_OFFSET if address.region == "I" else IMAGE_SIZE
        if address.byte + address.width > limit:
            where = "reaches the system registers of the input image" if address.region == "I" else "is past the output image"
            errors.append(f"{prefix}: {address.text} {where}")
    dt = channel["dt"]
    if not isinstance(dt, dict):
        errors.append(f"{prefix}: dt must be an object")
    elif channel["kind"] == "digital":
        if not (isinstance(dt.get("alias"), str) and NODE_PATTERN.match(dt["alias"])):
            errors.append(f"{prefix}: dt must name the devicetree alias of the pin (dt.alias)")
        # An optional channel (the default alias profile) is bound when its alias exists and is not checked against
        # a controller and a pin; every other channel names both so that the build can prove them (IO-001).
        if not channel.get("optional"):
            if not (isinstance(dt.get("controller"), str) and NODE_PATTERN.match(dt["controller"])):
                errors.append(f"{prefix}: dt must name the GPIO controller label (dt.controller)")
            if not (_is_int(dt.get("pin")) and 0 <= dt["pin"] < 256):
                errors.append(f"{prefix}: dt must carry the pin number on its controller (dt.pin)")
            named = gpio_of_pin_name(channel["pin"]) if isinstance(channel["pin"], str) else None
            if named is not None and named != (dt.get("controller"), dt.get("pin")):
                errors.append(
                    f"{prefix}: the pin name {channel['pin']} is {named[0]} {named[1]}, "
                    f"not the described {dt.get('controller')} {dt.get('pin')}"
                )
        if channel["direction"] == "output" and not (_is_int(channel.get("safe")) and channel["safe"] in (0, 1)):
            errors.append(f"{prefix}: an output needs its safe value, 0 or 1 (safe)")
    elif channel["kind"] == "analog":
        if channel["direction"] == "output":
            errors.append(f"{prefix}: an analog output is not supported by any port: leave it out of the description (IO-006)")
        if not (isinstance(dt.get("controller"), str) and NODE_PATTERN.match(dt["controller"])):
            errors.append(f"{prefix}: dt must name the ADC node label (dt.controller)")
        if not (_is_int(dt.get("channel")) and 0 <= dt["channel"] < 64):
            errors.append(f"{prefix}: dt must carry the converter channel (dt.channel)")
        for key in ("gain", "reference", "acquisition_time"):
            if key in dt and not (isinstance(dt[key], str) and ADC_ENUM.match(dt[key])):
                errors.append(f"{prefix}: dt.{key} must be a Zephyr ADC_* enumerator")
        if not (_is_int(channel.get("resolution_bits")) and 1 <= channel["resolution_bits"] <= 16):
            errors.append(f"{prefix}: an analog channel needs resolution_bits from 1 to 16")
        scale = channel.get("range")
        if not isinstance(scale, dict):
            errors.append(f"{prefix}: an analog channel needs its range with the scaling (range)")
        else:
            for key in ("raw_min", "raw_max", "eng_min", "eng_max"):
                if not isinstance(scale.get(key), (int, float)) or isinstance(scale.get(key), bool):
                    errors.append(f"{prefix}: range.{key} must be a number")
            if not _is_text(scale.get("unit")):
                errors.append(f"{prefix}: range.unit must name the engineering unit")
    return errors


def _occupancy(channels: Iterable[dict[str, Any]]) -> list[str]:
    """A bit or a word of the process image belongs to one channel."""
    errors: list[str] = []
    taken: dict[tuple[str, int], list[tuple[int, str]]] = {}
    for channel in channels:
        try:
            address = parse_address(channel["address"])
        except (ValueError, KeyError):
            continue
        if address.bit is not None:
            slots = [((address.region, address.byte), 1 << address.bit)]
        else:
            slots = [((address.region, address.byte + offset), 0xFF) for offset in range(address.width)]
        for key, mask in slots:
            for other_mask, owner in taken.get(key, []):
                if other_mask & mask and owner != channel.get("id"):
                    errors.append(
                        f"channel {channel.get('id')}: {address.text} overlaps channel {owner} on {key[0]} byte {key[1]}"
                    )
            taken.setdefault(key, []).append((mask, channel.get("id")))
    return errors


def validate_io_description(board: dict[str, Any], root: Path | None = None) -> list[str]:
    """Every rule of the description of one board; the board id is part of each message."""
    name = board.get("board_id", "?")
    io = board.get("io")
    if not isinstance(io, dict):
        return [f"{name}: io description is missing"]
    errors: list[str] = []
    if io.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"{name}: io.schema_version must be {SCHEMA_VERSION}")
    channels = io.get("channels")
    if not isinstance(channels, list) or not channels:
        return errors + [f"{name}: io.channels must list at least one channel"]
    if len(channels) > MAX_CHANNELS:
        errors.append(f"{name}: a board lists at most {MAX_CHANNELS} channels, this one lists {len(channels)}")
    ids: set[str] = set()
    for index, channel in enumerate(channels):
        errors.extend(f"{name}: {text}" for text in _validate_channel(channel, f"channels[{index}]", root))
        if isinstance(channel, dict) and isinstance(channel.get("id"), str):
            if channel["id"] in ids:
                errors.append(f"{name}: duplicate channel id {channel['id']}")
            ids.add(channel["id"])
    errors.extend(f"{name}: {text}" for text in _occupancy(c for c in channels if isinstance(c, dict)))
    unmapped = io.get("unmapped", [])
    if not isinstance(unmapped, list) or not all(
        isinstance(item, dict) and _is_text(item.get("terminal")) and _is_text(item.get("reason")) for item in unmapped
    ):
        errors.append(f"{name}: io.unmapped must list objects with a terminal and a reason")
    return errors


def validate_watchdog(board: dict[str, Any], root: Path | None = None) -> list[str]:
    """The hardware watchdog rule of a profile (RT-020).

    It is enabled in every profile that has a hardware record and off, with the reason, in every other: a
    watchdog enabled before its reset timing and safe outputs were recorded could reset a board in the field. The
    record is one the manifest lists in `evidence_refs` and whose result is a pass.
    """
    name = board.get("board_id", "?")
    watchdog = board.get("watchdog")
    if not isinstance(watchdog, dict):
        return [f"{name}: watchdog is missing: say whether the hardware watchdog is on in this profile (RT-020)"]
    errors: list[str] = []
    enabled = watchdog.get("enabled")
    if not isinstance(enabled, bool):
        errors.append(f"{name}: watchdog.enabled must be true or false")
    for key in ("timeout_ms", "max_timeout_ms"):
        value = watchdog.get(key)
        if not _is_int(value) or not 100 <= value <= 60000:
            errors.append(f"{name}: watchdog.{key} must be a whole number of milliseconds from 100 to 60000")
    if _is_int(watchdog.get("timeout_ms")) and _is_int(watchdog.get("max_timeout_ms")):
        if watchdog["timeout_ms"] > watchdog["max_timeout_ms"]:
            errors.append(f"{name}: watchdog.timeout_ms is longer than watchdog.max_timeout_ms")
    for state, choices in WATCHDOG_STATES.items():
        if watchdog.get(state) not in choices:
            errors.append(f"{name}: watchdog.{state} must be one of {', '.join(choices)}")
    has_record = False
    if root is not None:
        has_record = support_level(board, root)["level"] == "human-hil"
    else:
        has_record = bool(board.get("evidence_refs"))
    if enabled is True and not has_record:
        errors.append(f"{name}: the hardware watchdog is enabled but the profile has no passing hardware record (RT-020, HIL-010)")
    if enabled is False and has_record:
        errors.append(f"{name}: the profile has a hardware record, so its hardware watchdog must be enabled (RT-020)")
    if enabled is False and not _is_text(watchdog.get("reason")):
        errors.append(f"{name}: a profile with the hardware watchdog off says why in watchdog.reason (RT-020)")
    return errors


def validate_manifest(boards: Any, root: Path | None = None) -> list[str]:
    """The structural rules of the manifest; the CI matrix and the support assets are checked by the validator tool."""
    if not isinstance(boards, list) or not boards:
        return ["the board manifest must contain a non-empty list"]
    errors: list[str] = []
    for key in ("board_id", "ide_id", "zephyr_board"):
        values = [b.get(key) for b in boards if isinstance(b, dict)]
        errors.extend(f"duplicate {key}: {value}" for value in sorted({v for v in values if v is not None and values.count(v) > 1}))
    for index, entry in enumerate(boards):
        if not isinstance(entry, dict):
            errors.append(f"entry {index} must be an object")
            continue
        label = entry.get("board_id", f"entry {index}")
        missing = [key for key in BOARD_REQUIRED if key not in entry]
        if missing:
            errors.append(f"{label} is missing keys: {', '.join(missing)}")
            continue
        if "validation_level" in entry:
            errors.append(f"{label}: validation_level is derived from the evidence records and must not be set by hand (IO-015)")
        if entry["network_class"] not in NETWORK_CLASSES:
            errors.append(f"{label}: invalid network_class {entry['network_class']!r}")
        if entry["network_interface"] not in NETWORK_INTERFACES:
            errors.append(f"{label}: invalid network_interface {entry['network_interface']!r}")
        if not isinstance(entry["evidence_refs"], list) or not all(_is_text(ref) for ref in entry["evidence_refs"]):
            errors.append(f"{label}: evidence_refs must list the paths of record files")
        elif root is not None:
            errors.extend(
                f"{label}: evidence record {ref} does not exist" for ref in entry["evidence_refs"] if not (root / ref).is_file()
            )
        errors.extend(validate_io_description(entry, root))
        if root is not None:
            errors.extend(devicetree_mismatches(entry, root))
        errors.extend(validate_fieldbus(entry, root))
        errors.extend(validate_watchdog(entry, root))
    return errors


_COMMENT = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)
_LABELED_NODE = re.compile(r"\b([A-Za-z_]\w*)\s*:\s*[\w,.@-]+\s*\{([^{}]*)\}")
_GPIOS = re.compile(r"\bgpios\s*=\s*<\s*&(\w+)\s+(\d+)\s*([^>]*)>")
_ALIASES = re.compile(r"\baliases\s*\{([^{}]*)\}")
_ALIAS = re.compile(r"([\w-]+)\s*=\s*&(\w+)\s*;")
_OKAY_REFERENCE = re.compile(r"&(\w+)\s*\{[^{}]*\bstatus\s*=\s*\"okay\"")


def parse_overlay(text: str) -> dict[str, Any]:
    """The aliases, the GPIO of each labelled node and the nodes set to okay of a devicetree overlay.

    ponytail: a regular-expression reading of the plain overlays of this repository (leaf nodes, no #include or
    macros in a gpios cell); the Zephyr build stays the full check (the BUILD_ASSERTs of gen_io_table.py).
    """
    text = _COMMENT.sub("", text)
    gpios = {}
    for label, body in _LABELED_NODE.findall(text):
        match = _GPIOS.search(body)
        if match:
            gpios[label] = {"controller": match.group(1), "pin": int(match.group(2)), "flags": match.group(3).strip()}
    aliases = {name: target for block in _ALIASES.findall(text) for name, target in _ALIAS.findall(block)}
    return {"aliases": aliases, "gpios": gpios, "okay": set(_OKAY_REFERENCE.findall(text))}


_KCONFIG = re.compile(r"^(?:(CONFIG_\w+)=(.*)|# (CONFIG_\w+) is not set)$")


def _kconfig(paths: Iterable[Path]) -> dict[str, str]:
    values: dict[str, str] = {}
    for path in paths:
        for line in path.read_text().splitlines():
            match = _KCONFIG.match(line.strip())
            if match:
                values[match.group(1) or match.group(3)] = match.group(2) if match.group(1) else "n"
    return values


FIELDBUS_PROTOCOLS = {"modbus-rtu": "zephyr,modbus-serial"}
FIELDBUS_REQUIRED = ("id", "protocol", "uart", "tx", "rx", "location", "electrical", "source")
_REFERENCE = re.compile(r"&(\w+)\s*\{")
_NODE_WITH_LABEL = re.compile(r"\b([A-Za-z_]\w*)\s*:\s*[\w,.@-]+\s*\{")
_PINMUX = re.compile(r"\bpinmux\s*=\s*([^;]*);")
_PINMUX_PIN = re.compile(r"_(?:P|GPIO)(\d+)\b")


def _block(text: str, brace: int) -> str:
    """The text between the brace at `brace` and its partner."""
    depth = 0
    for index in range(brace, len(text)):
        depth += {"{": 1, "}": -1}.get(text[index], 0)
        if depth == 0:
            return text[brace + 1:index]
    return text[brace + 1:]


def _gpio_of_number(number: int) -> tuple[str, int]:
    return ("gpio0", number) if number < 32 else ("gpio1", number - 32)


def _overlay_texts(board: dict[str, Any], root: Path) -> dict[str, str]:
    """The overlays a board names (support assets, channel and port sources), without comments."""
    names = [*board.get("support_assets", []), *(c.get("source") for c in board.get("io", {}).get("channels", []))]
    names += [port.get("source") for port in board.get("fieldbus", []) if isinstance(port, dict)]
    return {
        name: _COMMENT.sub("", (root / name).read_text())
        for name in dict.fromkeys(names)
        if isinstance(name, str) and name.endswith(".overlay") and (root / name).is_file()
    }


def validate_fieldbus(board: dict[str, Any], root: Path | None = None) -> list[str]:
    """The serial ports of a board (IO-009, COM-012): no pin of a port, and no pin a pinctrl group of its overlays
    muxes, is the pin of an I/O channel; with a repository root, the overlay of a port enables its UART with the
    described TX and RX pins and the child node its protocol needs (zephyr,modbus-serial for Modbus RTU)."""
    name = board.get("board_id", "?")
    errors: list[str] = []
    taken: dict[tuple[str, int], str] = {}
    for channel in board.get("io", {}).get("channels", []):
        gpio = gpio_of_pin_name(channel.get("pin", "")) if isinstance(channel.get("pin"), str) else None
        if gpio is not None:
            taken[gpio] = channel.get("id", "?")
    ports = board.get("fieldbus", [])
    if not isinstance(ports, list):
        return [f"{name}: fieldbus must list the serial ports of the board"]
    for port in ports:
        if not isinstance(port, dict) or any(key not in port for key in FIELDBUS_REQUIRED):
            errors.append(f"{name}: a fieldbus port needs {', '.join(FIELDBUS_REQUIRED)}")
            continue
        where = f"{name}: fieldbus port {port['id']}"
        if port["protocol"] not in FIELDBUS_PROTOCOLS:
            errors.append(f"{where}: protocol must be one of {', '.join(FIELDBUS_PROTOCOLS)}")
            continue
        pins = {}
        for role in ("tx", "rx"):
            gpio = gpio_of_pin_name(port[role]) if isinstance(port[role], str) else None
            if gpio is None:
                errors.append(f"{where}: {role} {port[role]!r} is not a pin name")
                continue
            pins[role] = gpio
            if gpio in taken:
                errors.append(f"{where}: {role} {port[role]} is the pin of channel {taken[gpio]}")
        if root is None or not str(port["source"]).endswith(".overlay") or not (root / port["source"]).is_file():
            continue
        text = _COMMENT.sub("", (root / port["source"]).read_text())
        bodies = [_block(text, match.end() - 1) for match in _REFERENCE.finditer(text) if match.group(1) == port["uart"]]
        body = "\n".join(bodies)
        if not re.search(r'\bstatus\s*=\s*"okay"', body) or f'"{FIELDBUS_PROTOCOLS[port["protocol"]]}"' not in body:
            errors.append(
                f"{where}: {port['source']} does not enable {port['uart']} with a {FIELDBUS_PROTOCOLS[port['protocol']]} child"
            )
        group = re.search(r"pinctrl-0\s*=\s*<\s*&(\w+)", body)
        muxed = _pinctrl_groups(text).get(group.group(1), set()) if group else set()
        if muxed != set(pins.values()):
            errors.append(f"{where}: the pinctrl of {port['uart']} in {port['source']} is not on {port['tx']} and {port['rx']}")
    if root is not None:
        for source, text in _overlay_texts(board, root).items():
            for label, gpios in _pinctrl_groups(text).items():
                errors.extend(
                    f"{name}: pinctrl group {label} of {source} muxes {gpio[0]} {gpio[1]}, the pin of channel {taken[gpio]}"
                    for gpio in sorted(gpios) if gpio in taken
                )
    return errors


def _pinctrl_groups(text: str) -> dict[str, set[tuple[str, int]]]:
    """The GPIOs that each labelled pinctrl group of an overlay muxes (UART1_TX_P4, UART1_TX_GPIO17, ...)."""
    groups: dict[str, set[tuple[str, int]]] = {}
    for match in _NODE_WITH_LABEL.finditer(text):
        pins = {_gpio_of_number(int(number)) for mux in _PINMUX.findall(_block(text, match.end() - 1)) for number in _PINMUX_PIN.findall(mux)}
        if pins:
            groups[match.group(1)] = pins
    return groups


def storage_users(board: dict[str, Any], root: Path) -> dict[str, str]:
    """The flash partition each persistent store of a board's firmware takes (IO-008).

    `nvs` is the HAL's record store (program, RETAIN, settings keys): zplc_hal_zephyr.c opens zplc_nvs_partition when
    the devicetree defines one and storage_partition otherwise. `littlefs` is the settings file system that
    firmware/app/src/zplc_config.c mounts on storage_partition. The Kconfig is firmware/app/prj.conf and then the
    board's .conf files; the partition labels come from the board's overlays.
    """
    assets = [root / asset for asset in board.get("support_assets", [])]
    conf = _kconfig([root / "firmware/app/prj.conf"] + [path for path in assets if path.suffix == ".conf"])
    labels = {label for path in assets if path.suffix == ".overlay" for label, _ in _LABELED_NODE.findall(_COMMENT.sub("", path.read_text()))}
    users: dict[str, str] = {}
    if conf.get("CONFIG_NVS") == "y":
        users["nvs"] = "zplc_nvs_partition" if "zplc_nvs_partition" in labels else "storage_partition"
    if conf.get("CONFIG_FILE_SYSTEM_LITTLEFS") == "y":
        users["littlefs"] = "storage_partition"
    return users


def _overlay_of(channel: dict[str, Any], root: Path) -> dict[str, Any] | None:
    source = channel.get("source")
    if not isinstance(source, str) or not source.endswith(".overlay") or not (root / source).is_file():
        return None
    return parse_overlay((root / source).read_text())


def overlay_binding(channel: dict[str, Any], root: Path) -> dict[str, Any] | None:
    """The GPIO (controller, pin, flags) that the overlay a digital channel cites binds to its alias, or None."""
    overlay = _overlay_of(channel, root)
    alias = channel.get("dt", {}).get("alias")
    if overlay is None or alias not in overlay["aliases"]:
        return None
    return overlay["gpios"].get(overlay["aliases"][alias])


def devicetree_mismatches(board: dict[str, Any], root: Path) -> list[str]:
    """IO-001 without a Zephyr build: each channel whose source is an overlay of the repository is defined there.

    A digital channel's alias must be bound in that overlay to the described controller and pin; an analog channel's
    converter must be set to okay there. A `zephyr:` source is left to the build.
    """
    name = board.get("board_id", "?")
    errors: list[str] = []
    for channel in board.get("io", {}).get("channels", []):
        overlay = _overlay_of(channel, root)
        if overlay is None or not isinstance(channel.get("dt"), dict):
            continue
        dt, where = channel["dt"], f"{name}: channel {channel.get('id')} ({channel.get('pin')})"
        if channel.get("kind") == "analog":
            if dt.get("controller") not in overlay["okay"]:
                errors.append(f"{where}: {channel['source']} does not set the converter {dt.get('controller')} to okay")
            continue
        alias = dt.get("alias")
        if alias not in overlay["aliases"]:
            errors.append(f"{where}: {channel['source']} does not define the alias {alias}")
            continue
        bound = overlay["gpios"].get(overlay["aliases"][alias])
        if bound is None:
            errors.append(f"{where}: alias {alias} in {channel['source']} names a node without gpios")
        elif (bound["controller"], bound["pin"]) != (dt.get("controller"), dt.get("pin")):
            errors.append(
                f"{where}: {channel['source']} binds {alias} to {bound['controller']} {bound['pin']}, "
                f"the description says {dt.get('controller')} {dt.get('pin')}"
            )
    return errors


def _bytes_used(board: dict[str, Any], region: str) -> int:
    end = 0
    for channel in board["io"]["channels"]:
        address = parse_address(channel["address"])
        if address.region == region:
            end = max(end, address.byte + address.width)
    return end


def image_extent(board: dict[str, Any]) -> tuple[int, int]:
    """Bytes of the input and of the output image that the channels of the board need (IO-005)."""
    return _bytes_used(board, "I"), _bytes_used(board, "Q")


def _sort_key(channel: dict[str, Any]) -> tuple[int, int, int]:
    address = parse_address(channel["address"])
    return (0 if address.region == "Q" else 1, address.byte, address.bit or 0)


def sorted_channels(board: dict[str, Any]) -> list[dict[str, Any]]:
    """Outputs first, then inputs, each by image address: the order of the generated table."""
    return sorted(board["io"]["channels"], key=_sort_key)


def hal_numbering(board: dict[str, Any]) -> dict[str, int]:
    """The channel number a port passes to the HAL: digital outputs first, then digital inputs; analog inputs apart."""
    numbering: dict[str, int] = {}
    digital = 0
    analog = 0
    for channel in sorted_channels(board):
        if channel["kind"] == "digital":
            numbering[channel["id"]] = digital
            digital += 1
        else:
            numbering[channel["id"]] = analog
            analog += 1
    return numbering


def canonical_description(board: dict[str, Any]) -> str:
    """The identity text of a description: board id, then id, direction, kind and address of every channel."""
    lines = [board["board_id"]]
    lines.extend(
        f"{channel['id']}|{channel['direction']}|{channel['kind']}|{channel['address']}" for channel in sorted_channels(board)
    )
    return "\n".join(lines) + "\n"


def fnv1a32(text: str) -> int:
    value = 0x811C9DC5
    for byte in text.encode("utf-8"):
        value = ((value ^ byte) * 0x01000193) & 0xFFFFFFFF
    return value


def description_hash(board: dict[str, Any]) -> str:
    """FNV-1a 32 of the canonical text, eight hex digits; the firmware reports it and Studio compares it (IO-004)."""
    return f"{fnv1a32(canonical_description(board)):08x}"


def _evidence_level(record: dict[str, Any]) -> Any:
    """The record's `evidence_level`. A record written before the level existed says `evidence`, and only a hardware run
    wrote one; a record that says neither is read as one of those."""
    return record.get("evidence_level", record.get("evidence", HARDWARE_LEVEL))


def _record_applies(board_id: str, record: Any) -> bool:
    return (
        isinstance(record, dict)
        and record.get("schema") == RECORD_SCHEMA
        and _evidence_level(record) == HARDWARE_LEVEL  # an emulated or reported run never raises the level
        and record.get("board_id") == board_id
        and _is_text(record.get("firmware_version"))
        and isinstance(record.get("commit"), str)
        and re.fullmatch(r"[0-9a-f]{40}", record["commit"]) is not None
        and isinstance(record.get("image_sha256"), str)
        and re.fullmatch(r"[0-9a-f]{64}", record["image_sha256"]) is not None
        and record.get("result") in ("pass", "fail")
    )


def support_level_from_records(board_id: str, records: Iterable[tuple[str, Any]]) -> dict[str, Any]:
    """The support level of a board, derived from its evidence records (IO-015).

    A board with no record that names it, the firmware version, the commit and the image hash, and passes, stays at
    `cross-build`. Every applicable record is listed with the firmware version it was made on.
    """
    applicable = [
        {"ref": ref, "firmware_version": record["firmware_version"], "commit": record["commit"], "result": record["result"]}
        for ref, record in records
        if _record_applies(board_id, record)
    ]
    passed = any(item["result"] == "pass" for item in applicable)
    return {"level": "human-hil" if passed else "cross-build", "records": applicable}


def community_reports_from_records(board_id: str, records: Iterable[tuple[str, Any]]) -> list[dict[str, Any]]:
    """The reports from users that name this board, each at the `community-reported` level (HIL-011).

    A report is a lead, not a qualification: it names the firmware version, the commit and the hash of the image it is
    about and the issue it came from, and it never changes the level that `support_level_from_records` derives.
    """
    return [
        {
            "ref": ref, "level": COMMUNITY_LEVEL, "firmware_version": record["firmware_version"],
            "commit": record["commit"], "result": record["result"], "issue": record["issue"],
        }
        for ref, record in records
        if isinstance(record, dict)
        and record.get("schema") == COMMUNITY_SCHEMA
        and record.get("level") == COMMUNITY_LEVEL
        and record.get("board_id") == board_id
        and _is_text(record.get("firmware_version"))
        and isinstance(record.get("commit"), str)
        and re.fullmatch(r"[0-9a-f]{40}", record["commit"]) is not None
        and isinstance(record.get("image_sha256"), str)
        and re.fullmatch(r"[0-9a-f]{64}", record["image_sha256"]) is not None
        and record.get("result") in ("pass", "fail")
        and isinstance(record.get("issue"), str)
        and record["issue"].startswith("https://github.com/")
    ]


def _read_records(board: dict[str, Any], root: Path) -> list[tuple[str, Any]]:
    records: list[tuple[str, Any]] = []
    for ref in board.get("evidence_refs", []):
        try:
            records.append((ref, json.loads((root / ref).read_text())))
        except (OSError, ValueError):
            records.append((ref, None))
    return records


def support_level(board: dict[str, Any], root: Path) -> dict[str, Any]:
    return support_level_from_records(board["board_id"], _read_records(board, root))


def community_reports(board: dict[str, Any], root: Path) -> list[dict[str, Any]]:
    return community_reports_from_records(board["board_id"], _read_records(board, root))


def load_manifest(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text())
    if not isinstance(data, list):
        raise ValueError("the board manifest must contain a list")
    return data


def find_board(
    boards: list[dict[str, Any]], *, zephyr_board: str | None = None, board_id: str | None = None
) -> dict[str, Any] | None:
    # The firmware build joins BOARD and BOARD_QUALIFIERS, which Zephyr 4.4 sets without the leading slash
    # ("rpi_picorp2040" for rpi_pico/rp2040): a target matches with or without the slashes.
    wanted = zephyr_board.replace("/", "") if zephyr_board is not None else None
    for entry in boards:
        if wanted is not None and str(entry.get("zephyr_board", "")).replace("/", "") == wanted:
            return entry
        if board_id is not None and entry.get("board_id") == board_id:
            return entry
    return None
