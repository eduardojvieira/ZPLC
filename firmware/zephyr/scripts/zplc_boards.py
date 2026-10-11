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
        errors.extend(validate_watchdog(entry, root))
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


def _record_applies(board_id: str, record: Any) -> bool:
    return (
        isinstance(record, dict)
        and record.get("schema") == RECORD_SCHEMA
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
    for entry in boards:
        if zephyr_board is not None and entry.get("zephyr_board") == zephyr_board:
            return entry
        if board_id is not None and entry.get("board_id") == board_id:
            return entry
    return None
