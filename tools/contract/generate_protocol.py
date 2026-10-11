#!/usr/bin/env python3
"""Generate the device link protocol files from tools/contract/protocol.json (COM-019, COM-029).

One file defines the frame, the limits, the enumerations, the error codes, the capabilities and every message
with the layout of its request, its response and its events. This script writes, from that file:

  C       firmware/lib/zplc_core/include/zplc_proto_defs.h            numbers, offsets and the message table
  TS      packages/zplc-ide/src/runtime/link/protocol.generated.ts    the same, as typed tables
  Frames  tools/contract/golden/protocol-vectors.json                 the test frames, for the TypeScript codec
          firmware/lib/zplc_core/tests/zplc_proto_vectors.h           the same frames, for the C codec

The reference page is written by tools/docs/generate_source_references.ts from the same file, in English and
in Spanish.

The test frames are computed here, by a third implementation of the encoder and of the decoder (Python's zlib
CRC-32 and hmac). The C codec and the TypeScript codec must produce exactly these bytes and must give exactly
these results on the streams.

Usage:
  python3 tools/contract/generate_protocol.py            write every generated file
  python3 tools/contract/generate_protocol.py --check    exit 1 when a generated file is stale
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import re
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ed25519_ref  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools/contract/protocol.json"
GENERATOR_REL = "tools/contract/generate_protocol.py"
SOURCE_REL = "tools/contract/protocol.json"

C_OUT = ROOT / "firmware/lib/zplc_core/include/zplc_proto_defs.h"
TS_OUT = ROOT / "packages/zplc-ide/src/runtime/link/protocol.generated.ts"
VECTORS_JSON = ROOT / "tools/contract/golden/protocol-vectors.json"
VECTORS_H = ROOT / "firmware/lib/zplc_core/tests/zplc_proto_vectors.h"

KEY = bytes(range(32))  # the key of the authenticated test frames: 00 01 02 ... 1f
SIGNING_SEED = bytes(range(0x80, 0xA0))  # the seed of the signing key of the signed-program tests (COM-026)


class ProtocolError(Exception):
    pass


# ---------------------------------------------------------------------------
# Loading and validation
# ---------------------------------------------------------------------------

FIXED = {"u8": 1, "u16": 2, "u32": 4}


def field_size(field_type: str) -> int | None:
    """Bytes of a field, or None for the tail (whatever is left of the payload)."""
    if field_type in FIXED:
        return FIXED[field_type]
    if field_type == "tail":
        return None
    match = re.fullmatch(r"(bytes|str):([1-9][0-9]*)", field_type)
    if match:
        return int(match.group(2))
    raise ProtocolError(f"unknown field type {field_type!r}")


def layout(fields: list[dict], base: int) -> tuple[list[dict], int, bool]:
    """Offsets of the fields, the bytes before the tail, and whether there is a tail."""
    out, offset, tail = [], base, False
    for index, field in enumerate(fields):
        size = field_size(field["type"])
        if size is None:
            if index != len(fields) - 1:
                raise ProtocolError(f"field {field['name']}: a tail has to be the last field")
            tail = True
            out.append({**field, "offset": offset, "size": None})
        else:
            out.append({**field, "offset": offset, "size": size})
            offset += size
    return out, offset, tail


def load() -> dict:
    protocol = json.loads(SOURCE.read_text(encoding="utf-8"))
    validate(protocol)
    return protocol


def unique(items, what: str) -> None:
    seen = set()
    for item in items:
        if item in seen:
            raise ProtocolError(f"duplicate {what}: {item!r}")
        seen.add(item)


def validate(p: dict) -> None:
    if p.get("schema") != 1:
        raise ProtocolError("protocol.json: schema must be 1")
    if not isinstance(p["version"], int) or not 1 <= p["version"] <= 255:
        raise ProtocolError("version must be an integer from 1 to 255")
    header = p["frame"]["header"]
    end = 0
    for part in header:
        if part["offset"] != end:
            raise ProtocolError(f"frame header field {part['name']} is at {part['offset']}, expected {end}")
        end += part["size"]
    if end != p["frame"]["headerBytes"]:
        raise ProtocolError(f"the header fields add up to {end} bytes, headerBytes says {p['frame']['headerBytes']}")
    names = [m["name"] for m in p["messages"]] + [e["name"] for e in p["events"]]
    unique(names, "message name")
    unique([m["id"] for m in p["messages"]] + [e["id"] for e in p["events"]], "message number")
    unique([e["name"] for e in p["errors"]], "error name")
    unique([e["value"] for e in p["errors"]], "error value")
    unique([c["name"] for c in p["capabilities"]], "capability name")
    unique([c["bit"] for c in p["capabilities"]], "capability bit")
    if any(not 0 <= c["bit"] < 32 for c in p["capabilities"]):
        raise ProtocolError("a capability bit is outside 0..31")
    unique([m["bit"] for m in p["eventMask"]], "event mask bit")
    access = {a["name"] for a in p["access"]}
    enums = {e["name"]: {m["name"] for m in e["members"]} for e in p["enums"]}
    for enum in p["enums"]:
        unique([m["name"] for m in enum["members"]], f"member of {enum['name']}")
        unique([m["value"] for m in enum["members"]], f"value of {enum['name']}")
    masks = {m["name"] for m in p["eventMask"]}
    for message in p["messages"]:
        if not 0 < message["id"] < 128:
            raise ProtocolError(f"message {message['name']}: requests and responses use numbers 1 to 127")
        if message["access"] not in access:
            raise ProtocolError(f"message {message['name']}: unknown access {message['access']!r}")
        for part in ("request", "response"):
            unique([f["name"] for f in message[part]], f"field of {message['name']} {part}")
            layout(message[part], 0)
            for field in message[part]:
                if field.get("enum") and field["enum"] not in enums:
                    raise ProtocolError(f"{message['name']}.{field['name']}: unknown enum {field['enum']!r}")
    for event in p["events"]:
        if not 128 <= event["id"] < 256:
            raise ProtocolError(f"event {event['name']}: events use numbers 128 to 255")
        if event["mask"] is not None and event["mask"] not in masks:
            raise ProtocolError(f"event {event['name']}: unknown mask {event['mask']!r}")
        layout(event["fields"], 0)
    limits = p["limits"]
    if not limits["payloadMaxMin"] <= limits["payloadMaxDefault"] <= limits["payloadMaxHard"] <= 0xFFFF:
        raise ProtocolError("limits: payloadMaxMin <= payloadMaxDefault <= payloadMaxHard <= 65535")
    for case in p.get("accessCases", []):
        if case["kind"] not in ("read", "write", "force") or case["region"] not in (None, "IPI", "OPI", "WORK", "RETAIN"):
            raise ProtocolError(f"access case {case['name']!r}: unknown kind or region")
    # the largest force a frame has to carry: address (2) + ZPLC_FORCE_MAX_BYTES
    if limits["payloadMaxDefault"] < limits["forceBytesMax"] + 2:
        raise ProtocolError("the default payload does not carry the largest force")


# ---------------------------------------------------------------------------
# The reference encoder and decoder
# ---------------------------------------------------------------------------

def encode_frame(p: dict, kind: int, message: int, sequence: int, payload: bytes, key: bytes | None = None,
                 version: int | None = None, flags_extra: int = 0) -> bytes:
    auth = key is not None
    flags = kind | (4 if auth else 0) | flags_extra
    head = bytes(p["frame"]["sync"]) + bytes([p["version"] if version is None else version, flags, message]) \
        + struct.pack("<IH", sequence, len(payload))
    body = head + payload
    if auth:
        body += hmac.new(key, body, hashlib.sha256).digest()
    return body + struct.pack("<I", zlib.crc32(body) & 0xFFFFFFFF)


class Decoder:
    """The decoder of the protocol, as the C and TypeScript codecs implement it (see frame.resync in protocol.json)."""

    def __init__(self, p: dict, payload_max: int):
        self.p, self.payload_max = p, payload_max
        self.buf = bytearray()
        self.frames: list[dict] = []
        self.counters = {"crc_errors": 0, "version_errors": 0, "malformed": 0, "oversize": 0, "resyncs": 0}

    def push(self, data: bytes) -> None:
        sync0, sync1 = self.p["frame"]["sync"]
        head_bytes = self.p["frame"]["headerBytes"]
        mac_bytes = self.p["frame"]["macBytes"]
        for byte in data:
            self.buf.append(byte)
            while True:
                if len(self.buf) >= 1 and self.buf[0] != sync0:
                    del self.buf[0]
                    continue
                if len(self.buf) >= 2 and self.buf[1] != sync1:
                    del self.buf[0]
                    continue
                if len(self.buf) < head_bytes:
                    break
                version, flags = self.buf[2], self.buf[3]
                length = struct.unpack_from("<H", self.buf, 9)[0]
                if version != self.p["version"]:
                    self.counters["version_errors"] += 1
                    self.counters["resyncs"] += 1
                    del self.buf[0]
                    continue
                if (flags & 0xF8) != 0 or (flags & 3) == 3:
                    self.counters["malformed"] += 1
                    self.counters["resyncs"] += 1
                    del self.buf[0]
                    continue
                if length > self.payload_max:
                    self.counters["oversize"] += 1
                    self.counters["resyncs"] += 1
                    del self.buf[0]
                    continue
                auth = (flags & 4) != 0
                total = head_bytes + length + (mac_bytes if auth else 0) + 4
                if len(self.buf) < total:
                    break
                if zlib.crc32(bytes(self.buf[: total - 4])) & 0xFFFFFFFF != struct.unpack_from("<I", self.buf, total - 4)[0]:
                    self.counters["crc_errors"] += 1
                    self.counters["resyncs"] += 1
                    del self.buf[0]
                    continue
                self.frames.append({
                    "kind": flags & 3, "message": self.buf[4], "sequence": struct.unpack_from("<I", self.buf, 5)[0],
                    "auth": auth, "payload": bytes(self.buf[head_bytes: head_bytes + length]),
                    "wire": bytes(self.buf[:total]),
                })
                del self.buf[:total]


# ---------------------------------------------------------------------------
# Names
# ---------------------------------------------------------------------------

def c_name(name: str) -> str:
    return name.upper()


def pretty_hex(data: bytes) -> str:
    return data.hex()


# ---------------------------------------------------------------------------
# C header
# ---------------------------------------------------------------------------

def render_c(p: dict) -> str:
    out: list[str] = []
    add = out.append
    f = p["frame"]
    limits = p["limits"]
    add("/**")
    add(" * @file zplc_proto_defs.h")
    add(f" * @brief The device link protocol: numbers, layouts and the message table, generated from {SOURCE_REL}.")
    add(" *")
    add(f" * GENERATED by {GENERATOR_REL}. Do not edit: change the definition and run the generator.")
    add(" *")
    add(" * SPDX-License-Identifier: MIT")
    add(" */")
    add("")
    add("#ifndef ZPLC_PROTO_DEFS_H")
    add("#define ZPLC_PROTO_DEFS_H")
    add("")
    add("/* Frame ------------------------------------------------------------------------------------------- */")
    add(f"#define ZPLC_PROTO_VERSION {p['version']}U")
    add(f"#define ZPLC_PROTO_SYNC0 0x{f['sync'][0]:02X}U")
    add(f"#define ZPLC_PROTO_SYNC1 0x{f['sync'][1]:02X}U")
    add(f"#define ZPLC_PROTO_HEADER_BYTES {f['headerBytes']}U")
    add(f"#define ZPLC_PROTO_MAC_BYTES {f['macBytes']}U")
    add(f"#define ZPLC_PROTO_CRC_BYTES {f['crcBytes']}U")
    for part in f["header"]:
        add(f"#define ZPLC_PROTO_OFFSET_{c_name(part['name'])} {part['offset']}U")
    for kind in f["kinds"]:
        add(f"#define ZPLC_PROTO_KIND_{c_name(kind['name'])} {kind['value']}U")
    add("#define ZPLC_PROTO_KIND_MASK 0x03U")
    for bit in f["flagBits"]:
        add(f"#define ZPLC_PROTO_FLAG_{c_name(bit['name'])} 0x{1 << bit['bit']:02X}U")
    reserved = 0xFF & ~(0x03 | sum(1 << b["bit"] for b in f["flagBits"]))
    add(f"#define ZPLC_PROTO_FLAGS_RESERVED 0x{reserved:02X}U")
    add("")
    add("/* Limits ------------------------------------------------------------------------------------------ */")
    for key, name in (
        ("payloadMaxDefault", "PAYLOAD_MAX_DEFAULT"), ("payloadMaxHard", "PAYLOAD_MAX_HARD"),
        ("payloadMaxMin", "PAYLOAD_MAX_MIN"), ("sessionIdleSecondsDefault", "SESSION_IDLE_S_DEFAULT"),
        ("challengeSeconds", "CHALLENGE_S"), ("eventQueueDefault", "EVENT_QUEUE_DEFAULT"),
        ("eventPayloadMax", "EVENT_PAYLOAD_MAX"), ("watchEntriesMax", "WATCH_ENTRIES_MAX"),
        ("forceBytesMax", "FORCE_BYTES_MAX"), ("sessionNameBytes", "SESSION_NAME_BYTES"),
        ("keyBytes", "KEY_BYTES"), ("nonceBytes", "NONCE_BYTES"),
    ):
        add(f"#define ZPLC_PROTO_{name} {limits[key]}U")
    add("")
    add("/* Enumerations ------------------------------------------------------------------------------------ */")
    for enum in p["enums"]:
        for member in enum["members"]:
            add(f"#define ZPLC_PROTO_{c_name(enum['name'])}_{c_name(member['name'])} {member['value']}U")
    add("")
    add("/* Error codes (the first byte of every response) -------------------------------------------------- */")
    for err in p["errors"]:
        add(f"#define ZPLC_PROTO_ERR_{c_name(err['name'])} {err['value']}U")
    add("")
    add("/* Capabilities (bit mask of the hello) ------------------------------------------------------------ */")
    for cap in p["capabilities"]:
        add(f"#define ZPLC_PROTO_CAP_{c_name(cap['name'])} 0x{1 << cap['bit']:08X}UL")
    add("")
    add("/* Event mask --------------------------------------------------------------------------------------- */")
    for mask in p["eventMask"]:
        add(f"#define ZPLC_PROTO_EVTMASK_{c_name(mask['name'])} 0x{1 << mask['bit']:08X}UL")
    add("")
    add("/* Details of an ERR_RANGE response ------------------------------------------------------------------ */")
    offset = 1
    for part in p["rangeDetail"]:
        add(f"#define ZPLC_PROTO_RANGE_{c_name(part['name'])}_OFF {offset}U")
        offset += FIXED[part["type"]]
    add(f"#define ZPLC_PROTO_RANGE_DETAIL_BYTES {offset - 1}U")
    add("")
    add("/* Access classes ----------------------------------------------------------------------------------- */")
    for index, acc in enumerate(p["access"]):
        add(f"#define ZPLC_PROTO_ACCESS_{c_name(acc['name'])} {index}U")
    add("")
    add("/* Messages and the layout of their payloads. A response payload starts with its status byte, so its")
    add("   fields start at offset 1; the fields of a request and of an event start at offset 0. _FIXED is the")
    add("   number of bytes before the tail; _TAIL is 1 when the last field takes the rest of the payload. ---- */")
    table: list[str] = []
    for message in p["messages"]:
        n = c_name(message["name"])
        add(f"#define ZPLC_PROTO_MSG_{n} 0x{message['id']:02X}U")
        for part, prefix, base in (("request", "REQ", 0), ("response", "RSP", 1)):
            fields, fixed, tail = layout(message[part], base)
            for field in fields:
                fn = c_name(field["name"])
                add(f"#define ZPLC_PROTO_{n}_{prefix}_{fn}_OFF {field['offset']}U")
                if field["size"] is not None:
                    add(f"#define ZPLC_PROTO_{n}_{prefix}_{fn}_SIZE {field['size']}U")
            add(f"#define ZPLC_PROTO_{n}_{prefix}_FIXED {fixed}U")
            add(f"#define ZPLC_PROTO_{n}_{prefix}_TAIL {1 if tail else 0}U")
        req_fixed = layout(message["request"], 0)[1]
        req_tail = 1 if layout(message["request"], 0)[2] else 0
        table.append(f"  X({n}, ZPLC_PROTO_MSG_{n}, ZPLC_PROTO_ACCESS_{c_name(message['access'])}, {req_fixed}U, {req_tail}U)")
    add("")
    add("/* Events */")
    for event in p["events"]:
        n = c_name(event["name"])
        add(f"#define ZPLC_PROTO_{n} 0x{event['id']:02X}U")
        fields, fixed, tail = layout(event["fields"], 0)
        for field in fields:
            fn = c_name(field["name"])
            add(f"#define ZPLC_PROTO_{n}_{fn}_OFF {field['offset']}U")
            if field["size"] is not None:
                add(f"#define ZPLC_PROTO_{n}_{fn}_SIZE {field['size']}U")
        add(f"#define ZPLC_PROTO_{n}_FIXED {fixed}U")
        mask = "0UL" if event["mask"] is None else f"ZPLC_PROTO_EVTMASK_{c_name(event['mask'])}"
        add(f"#define ZPLC_PROTO_{n}_MASK {mask}")
    add("")
    add("/* The request table: X(name, number, access, fixed bytes before the tail, has a tail). The engine checks the")
    add("   length of every request against it, so the layout is written once. */")
    add("#define ZPLC_PROTO_MESSAGE_TABLE(X) \\")
    add(" \\\n".join(table))
    add("")
    add("#endif /* ZPLC_PROTO_DEFS_H */")
    add("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# TypeScript tables
# ---------------------------------------------------------------------------

def ts_fields(fields: list[dict]) -> str:
    items = []
    for field in fields:
        extra = f", enum: '{field['enum']}'" if field.get("enum") else ""
        items.append(f"{{ name: '{field['name']}', type: '{field['type']}'{extra} }}")
    return "[" + ", ".join(items) + "]"


def render_ts(p: dict) -> str:
    out: list[str] = []
    add = out.append
    f = p["frame"]
    add(f"// GENERATED by {GENERATOR_REL} from {SOURCE_REL}. Do not edit: change the definition and run the generator.")
    add("//")
    add("// The device link protocol (COM-019): the numbers, the layouts and the message table the C codec of the")
    add("// firmware (zplc_proto_defs.h) is generated from as well.")
    add("")
    add(f"export const PROTOCOL_VERSION = {p['version']};")
    add("")
    add("export const FRAME = {")
    add(f"  sync: [{f['sync'][0]}, {f['sync'][1]}] as readonly [number, number],")
    add(f"  headerBytes: {f['headerBytes']},")
    add(f"  macBytes: {f['macBytes']},")
    add(f"  crcBytes: {f['crcBytes']},")
    add("  offset: {")
    for part in f["header"]:
        add(f"    {part['name']}: {part['offset']},")
    add("  },")
    add(f"  flagAuth: {1 << f['flagBits'][0]['bit']},")
    reserved = 0xFF & ~(0x03 | sum(1 << b["bit"] for b in f["flagBits"]))
    add(f"  flagsReserved: {reserved},")
    add("} as const;")
    add("")
    add("export const KIND = {")
    for kind in f["kinds"]:
        add(f"  {kind['name']}: {kind['value']},")
    add("} as const;")
    add("")
    add("export const LIMITS = {")
    for key, value in p["limits"].items():
        add(f"  {key}: {value},")
    add("} as const;")
    add("")
    add("export const ENUMS = {")
    for enum in p["enums"]:
        add(f"  {enum['name']}: {{ " + ", ".join(f"{m['name']}: {m['value']}" for m in enum["members"]) + " },")
    add("} as const;")
    add("")
    add("export const ERROR = {")
    for err in p["errors"]:
        add(f"  {err['name']}: {err['value']},")
    add("} as const;")
    add("")
    add("export const CAPABILITY = {")
    for cap in p["capabilities"]:
        add(f"  {cap['name']}: 0x{1 << cap['bit']:08X},")
    add("} as const;")
    add("")
    add("export const EVENT_MASK = {")
    for mask in p["eventMask"]:
        add(f"  {mask['name']}: 0x{1 << mask['bit']:08X},")
    add("} as const;")
    add("")
    add("/** The layout of the detail of an ERROR.RANGE response (after the status byte). */")
    add("export const RANGE_DETAIL = ['" + "', '".join(d["name"] for d in p["rangeDetail"]) + "'] as const;")
    add("")
    add("export type Access = " + " | ".join(f"'{a['name']}'" for a in p["access"]) + ";")
    add("")
    add("export interface FieldSpec { readonly name: string; readonly type: string; readonly enum?: string }")
    add("export interface MessageSpec {")
    add("  readonly id: number;")
    add("  readonly access: Access;")
    add("  readonly request: readonly FieldSpec[];")
    add("  readonly response: readonly FieldSpec[];")
    add("}")
    add("export interface EventSpec {")
    add("  readonly id: number;")
    add("  readonly mask: number;")
    add("  readonly fields: readonly FieldSpec[];")
    add("}")
    add("")
    add("export const MESSAGES = {")
    for m in p["messages"]:
        add(f"  {m['name']}: {{ id: {m['id']}, access: '{m['access']}', request: {ts_fields(m['request'])}, response: {ts_fields(m['response'])} }},")
    add("} as const satisfies Record<string, MessageSpec>;")
    add("")
    add("export const EVENTS = {")
    for e in p["events"]:
        mask = "0" if e["mask"] is None else f"EVENT_MASK.{e['mask']}"
        add(f"  {e['name']}: {{ id: {e['id']}, mask: {mask}, fields: {ts_fields(e['fields'])} }},")
    add("} as const satisfies Record<string, EventSpec>;")
    add("")
    add("export type MessageName = keyof typeof MESSAGES;")
    add("export type EventName = keyof typeof EVENTS;")
    add("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Test frames
# ---------------------------------------------------------------------------

def sample(field: dict, index: int) -> int | bytes | str:
    t = field["type"]
    if t == "u8":
        return (index * 7 + 3) & 0xFF
    if t == "u16":
        return (0x1234 + index * 0x101) & 0xFFFF
    if t == "u32":
        return (0xA0B0C0D0 + index * 0x01010101) & 0xFFFFFFFF
    if t == "tail":
        return bytes((0x40 + index + i) & 0xFF for i in range(5))
    kind, size = t.split(":")
    size = int(size)
    if kind == "bytes":
        return bytes((0x10 * (index + 1) + i) & 0xFF for i in range(size))
    text = (field["name"].replace("_", "-"))[:size]
    return text


def pack_fields(fields: list[dict], values: list) -> bytes:
    out = b""
    for field, value in zip(fields, values):
        t = field["type"]
        if t == "u8":
            out += bytes([value])
        elif t == "u16":
            out += struct.pack("<H", value)
        elif t == "u32":
            out += struct.pack("<I", value)
        elif t == "tail":
            out += value
        elif t.startswith("bytes:"):
            out += value
        else:
            size = int(t.split(":")[1])
            out += value.encode("ascii").ljust(size, b"\0")
    return out


def json_value(value):
    if isinstance(value, bytes):
        return value.hex()
    return value


def build_vectors(p: dict) -> dict:
    payload_max = p["limits"]["payloadMaxDefault"]
    frames: list[dict] = []

    def add(name, kind, message, sequence, fields, values, key=None, status=None, raw_payload=None):
        payload = raw_payload if raw_payload is not None else (
            (bytes([status]) if status is not None else b"") + pack_fields(fields, values))
        wire = encode_frame(p, kind, message, sequence, payload, key)
        frames.append({
            "name": name, "kind": kind, "message": message, "sequence": sequence,
            "auth": key is not None, "payload": payload.hex(), "wire": wire.hex(),
            "fields": {f["name"]: json_value(v) for f, v in zip(fields, values)},
        })

    sequence = 1
    for m in p["messages"]:
        values = [sample(f, i) for i, f in enumerate(m["request"])]
        add(f"{m['name'].lower()}_request", 0, m["id"], sequence, m["request"], values)
        sequence += 1
        values = [sample(f, i) for i, f in enumerate(m["response"])]
        add(f"{m['name'].lower()}_response", 1, m["id"], sequence, m["response"], values, status=0)
        sequence += 1
    for e in p["events"]:
        values = [sample(f, i) for i, f in enumerate(e["fields"])]
        add(f"{e['name'].lower()}_event", 2, e["id"], sequence, e["fields"], values)
        sequence += 1
    # an error response with the detail of ERR_RANGE: address, length, region start, region end
    range_error = [e for e in p["errors"] if e["name"] == "RANGE"][0]["value"]
    add("mem_write_range_error", 1, [m for m in p["messages"] if m["name"] == "MEM_WRITE"][0]["id"], sequence, [], [],
        raw_payload=bytes([range_error]) + struct.pack("<HHHH", 0x4FFE, 4, 0x4000, 0x5000))
    sequence += 1
    # authenticated frames: the sequence of a session starts at 1 and goes up by one
    session = {m["name"]: m for m in p["messages"]}
    for name, seq in (("MEM_WRITE", 1), ("RUN", 2)):
        m = session[name]
        values = [sample(f, i) for i, f in enumerate(m["request"])]
        add(f"{name.lower()}_request_authenticated", 0, m["id"], seq, m["request"], values, key=KEY)
    m = session["RUN"]
    add("run_response_authenticated", 1, m["id"], 2, m["response"], [1], key=KEY, status=0)

    by_name = {fr["name"]: fr for fr in frames}

    def wire(name: str) -> bytes:
        return bytes.fromhex(by_name[name]["wire"])

    hello, ident, status = wire("hello_request"), wire("identity_response"), wire("status_response")
    noise = bytes([0x00, 0x5A, 0x5A, 0xFF, 0xA5, 0x13, 0x5A])
    flipped = bytearray(hello)
    flipped[-1] ^= 0x01
    wrong_version = encode_frame(p, 0, 1, 1, b"\x01\x00\x02", version=2)
    reserved = encode_frame(p, 0, 1, 1, b"\x01\x00\x02", flags_extra=0x08)
    bad_kind = encode_frame(p, 0, 1, 1, b"\x01\x00\x02", flags_extra=0x03)
    oversize_head = bytes(p["frame"]["sync"]) + bytes([p["version"], 0, 1]) + struct.pack("<IH", 1, 0xFFFF)
    # a damaged frame that holds a whole valid frame in its payload
    inner = status
    hidden_payload = b"\xEE" * 3 + inner + b"\xEE" * 4
    hidden = bytearray(encode_frame(p, 1, 3, 9, hidden_payload))
    hidden[-1] ^= 0xFF

    streams_spec = [
        ("two_frames_back_to_back", hello + ident),
        ("noise_before_between_and_after", noise + hello + noise + ident + noise),
        ("bad_crc_then_good", bytes(flipped) + status),
        ("frame_hidden_inside_a_damaged_one", bytes(hidden) + hello),
        ("wrong_version_then_good", wrong_version + hello),
        ("reserved_flag_then_good", reserved + hello),
        ("kind_three_then_good", bad_kind + hello),
        ("oversize_length_then_good", oversize_head + hello),
        ("truncated_frame_then_good", hello[:-1] + status),
        ("authenticated_frames", wire("mem_write_request_authenticated") + wire("run_request_authenticated")),
        ("only_noise", noise * 3),
    ]
    streams = []
    for name, data in streams_spec:
        dec = Decoder(p, payload_max)
        dec.push(data)
        delivered = []
        for fr in dec.frames:
            hit = [f["name"] for f in frames if f["wire"] == fr["wire"].hex()]
            if not hit:
                # a frame built only for this stream: name it by its position
                hit = [f"stream:{name}"]
            delivered.append(hit[0])
        streams.append({"name": name, "hex": data.hex(), "delivered": delivered, "counters": dec.counters})
    return {
        "schema": 1,
        "protocolVersion": p["version"],
        "payloadMax": payload_max,
        "keyHex": KEY.hex(),
        "frames": frames,
        "streams": streams,
        "accessCases": access_cases(p),
        "signatures": signature_cases(),
        "signingSeedHex": SIGNING_SEED.hex(),
    }


REGIONS = {"IPI": (0x0000, 0x1000), "OPI": (0x1000, 0x2000), "WORK": (0x2000, 0x4000), "RETAIN": (0x4000, 0x5000)}


def access_cases(p: dict) -> list[dict]:
    """The memory access cases, with the region each one is in: what the adapters and the device have to agree on."""
    out = []
    for case in p["accessCases"]:
        start, end = REGIONS.get(case["region"], (0xFFFF, 0xFFFF))
        out.append({**case, "start": start, "end": end})
    return out


def signature_cases() -> list[dict]:
    """Ed25519 signatures that a device has to accept and ones it has to refuse (COM-026)."""
    cases: list[dict] = []

    def add(name: str, public: bytes, message: bytes, signature: bytes) -> None:
        cases.append({
            "name": name, "public": public.hex(), "message": message.hex(), "signature": signature.hex(),
            "valid": ed25519_ref.verify(public, message, signature),
        })

    seeds = [bytes([n] * 32) for n in (1, 2, 3)] + [SIGNING_SEED]
    lengths = [0, 1, 2, 3, 31, 32, 33, 63, 64, 65, 111, 112, 113, 127, 128, 129, 255, 300, 1000]
    for index, length in enumerate(lengths):
        seed = seeds[index % len(seeds)]
        message = bytes((index * 31 + i * 7 + 5) & 0xFF for i in range(length))
        public = ed25519_ref.public_key(seed)
        signature = ed25519_ref.sign(seed, message)
        add(f"valid, {length} bytes", public, message, signature)
    seed = SIGNING_SEED
    public = ed25519_ref.public_key(seed)
    message = bytes(range(200))
    good = ed25519_ref.sign(seed, message)
    for bit_index, label in ((0, "the first bit of R"), (255, "the last bit of R"), (256 + 3, "a bit of S"), (511 - 8, "a high bit of S")):
        damaged = bytearray(good)
        damaged[bit_index // 8] ^= 1 << (bit_index % 8)
        add(f"damaged signature: {label}", public, message, bytes(damaged))
    add("damaged message", public, message[:-1] + bytes([message[-1] ^ 1]), good)
    add("a message that is a prefix", public, message[:-1], good)
    add("another key", ed25519_ref.public_key(bytes([9] * 32)), message, good)
    order = ed25519_ref.Q
    s = int.from_bytes(good[32:], "little")
    malleable = good[:32] + int.to_bytes(s + order, 32, "little")
    add("S plus the order of the group", public, message, malleable)
    add("S equal to the order of the group", public, message, good[:32] + int.to_bytes(order, 32, "little"))
    # a public key that is not the encoding of a point: y = 2 has no x on the curve
    not_a_point = int.to_bytes(2, 32, "little")
    add("a public key that is not a point", not_a_point, message, good)
    add("an R that is not a point", public, message, not_a_point + good[32:])
    add("all zero signature", public, message, bytes(64))
    return cases


def render_vectors_json(vectors: dict) -> str:
    return json.dumps(vectors, indent=1, sort_keys=False) + "\n"


def c_bytes(data: bytes) -> str:
    return ", ".join(f"0x{b:02X}" for b in data) if data else "0"


def render_vectors_h(vectors: dict) -> str:
    out = []
    add = out.append
    add("/**")
    add(" * @file zplc_proto_vectors.h")
    add(" * @brief Test frames of the device link protocol, for the C codec.")
    add(" *")
    add(f" * GENERATED by {GENERATOR_REL} from {SOURCE_REL}. Do not edit. The same frames are in")
    add(" * tools/contract/golden/protocol-vectors.json, which the TypeScript codec runs.")
    add(" */")
    add("")
    add("#ifndef ZPLC_PROTO_VECTORS_H")
    add("#define ZPLC_PROTO_VECTORS_H")
    add("")
    add("#include <stddef.h>")
    add("#include <stdint.h>")
    add("")
    add(f"#define ZPLC_PROTO_VECTOR_PAYLOAD_MAX {vectors['payloadMax']}U")
    add(f"static const uint8_t zplc_proto_vector_key[32] = {{ {c_bytes(bytes.fromhex(vectors['keyHex']))} }};")
    add("")
    add("typedef struct {")
    add("  const char *name;")
    add("  uint8_t kind;")
    add("  uint8_t message;")
    add("  uint32_t sequence;")
    add("  uint8_t auth;")
    add("  const uint8_t *payload;")
    add("  size_t payload_len;")
    add("  const uint8_t *wire;")
    add("  size_t wire_len;")
    add("} zplc_proto_vector_frame_t;")
    add("")
    for i, fr in enumerate(vectors["frames"]):
        add(f"static const uint8_t zplc_pv_p{i}[] = {{ {c_bytes(bytes.fromhex(fr['payload']))} }};")
        add(f"static const uint8_t zplc_pv_w{i}[] = {{ {c_bytes(bytes.fromhex(fr['wire']))} }};")
    add("")
    add("static const zplc_proto_vector_frame_t zplc_proto_vector_frames[] = {")
    for i, fr in enumerate(vectors["frames"]):
        add(f"  {{ \"{fr['name']}\", {fr['kind']}U, {fr['message']}U, {fr['sequence']}UL, {1 if fr['auth'] else 0}U, "
            f"zplc_pv_p{i}, {len(fr['payload']) // 2}U, zplc_pv_w{i}, {len(fr['wire']) // 2}U }},")
    add("};")
    add(f"#define ZPLC_PROTO_VECTOR_FRAME_COUNT {len(vectors['frames'])}U")
    add("")
    add("typedef struct {")
    add("  const char *name;")
    add("  const uint8_t *bytes;")
    add("  size_t length;")
    add("  const char *delivered;  /* names of the frames that must come out, in order, separated by a space */")
    add("  uint32_t crc_errors;")
    add("  uint32_t version_errors;")
    add("  uint32_t malformed;")
    add("  uint32_t oversize;")
    add("  uint32_t resyncs;")
    add("} zplc_proto_vector_stream_t;")
    add("")
    for i, st in enumerate(vectors["streams"]):
        add(f"static const uint8_t zplc_pv_s{i}[] = {{ {c_bytes(bytes.fromhex(st['hex']))} }};")
    add("")
    add("static const zplc_proto_vector_stream_t zplc_proto_vector_streams[] = {")
    for i, st in enumerate(vectors["streams"]):
        c = st["counters"]
        add(f"  {{ \"{st['name']}\", zplc_pv_s{i}, {len(st['hex']) // 2}U, \"{' '.join(st['delivered'])}\", "
            f"{c['crc_errors']}U, {c['version_errors']}U, {c['malformed']}U, {c['oversize']}U, {c['resyncs']}U }},")
    add("};")
    add(f"#define ZPLC_PROTO_VECTOR_STREAM_COUNT {len(vectors['streams'])}U")
    add("")
    add("typedef struct {")
    add("  const char *name;")
    add("  uint16_t address;")
    add("  uint16_t length;")
    add("  uint8_t kind;   /* 0 read, 1 write, 2 force */")
    add("  uint8_t ok;")
    add("  uint16_t start; /* the region that holds the address, 0xFFFF when none does */")
    add("  uint16_t end;")
    add("} zplc_proto_access_case_t;")
    add("")
    add("static const zplc_proto_access_case_t zplc_proto_access_cases[] = {")
    kinds = {"read": 0, "write": 1, "force": 2}
    for case in vectors["accessCases"]:
        add(f"  {{ \"{case['name']}\", {case['address']}U, {case['length']}U, {kinds[case['kind']]}U, "
            f"{1 if case['ok'] else 0}U, {case['start']}U, {case['end']}U }},")
    add("};")
    add(f"#define ZPLC_PROTO_ACCESS_CASE_COUNT {len(vectors['accessCases'])}U")
    add("")
    add("typedef struct {")
    add("  const char *name;")
    add("  const uint8_t *public_key;")
    add("  const uint8_t *message;")
    add("  size_t message_length;")
    add("  const uint8_t *signature;")
    add("  uint8_t valid;")
    add("} zplc_proto_signature_case_t;")
    add("")
    for i, case in enumerate(vectors["signatures"]):
        add(f"static const uint8_t zplc_sg_k{i}[32] = {{ {c_bytes(bytes.fromhex(case['public']))} }};")
        add(f"static const uint8_t zplc_sg_m{i}[] = {{ {c_bytes(bytes.fromhex(case['message']))} }};")
        add(f"static const uint8_t zplc_sg_s{i}[64] = {{ {c_bytes(bytes.fromhex(case['signature']))} }};")
    add("")
    add("static const zplc_proto_signature_case_t zplc_proto_signature_cases[] = {")
    for i, case in enumerate(vectors["signatures"]):
        add(f"  {{ \"{case['name']}\", zplc_sg_k{i}, zplc_sg_m{i}, {len(case['message']) // 2}U, zplc_sg_s{i}, "
            f"{1 if case['valid'] else 0}U }},")
    add("};")
    add(f"#define ZPLC_PROTO_SIGNATURE_CASE_COUNT {len(vectors['signatures'])}U")
    add("")
    add("#endif /* ZPLC_PROTO_VECTORS_H */")
    add("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def outputs() -> dict[Path, str]:
    p = load()
    vectors = build_vectors(p)
    return {
        C_OUT: render_c(p),
        TS_OUT: render_ts(p),
        VECTORS_JSON: render_vectors_json(vectors),
        VECTORS_H: render_vectors_h(vectors),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="exit 1 when a generated file is stale")
    args = parser.parse_args()
    try:
        files = outputs()
    except ProtocolError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    stale = [path for path, text in files.items() if not path.exists() or path.read_text(encoding="utf-8") != text]
    if args.check:
        for path in stale:
            print(f"ERROR: stale generated file {path.relative_to(ROOT)}; run python3 {GENERATOR_REL}", file=sys.stderr)
        if stale:
            return 1
        print(f"{GENERATOR_REL}: {len(files)} generated files are fresh.")
        return 0
    for path, text in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print(f"Wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
