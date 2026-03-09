#!/usr/bin/env python3
"""Hardware smoke + stress test for Modbus RTU over serial.

Intended for a real Modbus RTU-capable UART path, typically a board UART behind
an RS-485 transceiver or USB-to-serial/USB-to-RS485 adapter.
"""

from __future__ import annotations

import argparse
import struct
import sys
import time

import serial


UNIT_ID = 1
REG_BASE = 100
COIL_BASE = 10


def crc16_modbus(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x0001:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def add_crc(frame: bytes) -> bytes:
    crc = crc16_modbus(frame)
    return frame + bytes((crc & 0xFF, (crc >> 8) & 0xFF))


def expect_crc(frame: bytes) -> None:
    if len(frame) < 4:
        raise AssertionError(f"Frame too short: {frame.hex()}")
    got = frame[-2] | (frame[-1] << 8)
    calc = crc16_modbus(frame[:-2])
    if got != calc:
        raise AssertionError(
            f"CRC mismatch: got=0x{got:04X}, calc=0x{calc:04X}, frame={frame.hex()}"
        )


def open_port(port: str, baud: int) -> serial.Serial:
    ser = serial.Serial(port=port, baudrate=baud, timeout=0.25, exclusive=True)
    ser.dtr = False
    ser.rts = False
    time.sleep(0.2)
    ser.reset_input_buffer()
    ser.reset_output_buffer()
    return ser


def transact(
    ser: serial.Serial, payload: bytes, timeout_s: float = 1.0
) -> bytes | None:
    ser.reset_input_buffer()
    ser.write(payload)
    ser.flush()

    deadline = time.time() + timeout_s
    chunks = bytearray()
    last_rx = None

    while time.time() < deadline:
        chunk = ser.read(256)
        if chunk:
            chunks.extend(chunk)
            last_rx = time.time()
            continue
        if last_rx is not None and (time.time() - last_rx) > 0.05:
            break

    return bytes(chunks) if chunks else None


def parse_bits(data: bytes, count: int) -> list[int]:
    bits: list[int] = []
    for idx in range(count):
        byte_idx = idx // 8
        bit_idx = idx % 8
        bits.append(1 if (data[byte_idx] & (1 << bit_idx)) else 0)
    return bits


def fc_read_words(ser: serial.Serial, fc: int, addr: int, count: int) -> list[int]:
    req = add_crc(struct.pack(">BBHH", UNIT_ID, fc, addr, count))
    resp = transact(ser, req)
    if resp is None:
        raise AssertionError(f"FC{fc:02X} no response")
    expect_crc(resp)
    if resp[1] & 0x80:
        raise AssertionError(f"FC{fc:02X} exception: {resp.hex()}")
    if resp[1] != fc:
        raise AssertionError(f"FC mismatch: expected 0x{fc:02X}, got {resp.hex()}")
    byte_count = resp[2]
    if byte_count != count * 2:
        raise AssertionError(f"Unexpected byte count: {resp.hex()}")
    words = []
    for i in range(count):
        base = 3 + i * 2
        words.append((resp[base] << 8) | resp[base + 1])
    return words


def fc_read_bits(ser: serial.Serial, fc: int, addr: int, count: int) -> list[int]:
    req = add_crc(struct.pack(">BBHH", UNIT_ID, fc, addr, count))
    resp = transact(ser, req)
    if resp is None:
        raise AssertionError(f"FC{fc:02X} no response")
    expect_crc(resp)
    if resp[1] & 0x80:
        raise AssertionError(f"FC{fc:02X} exception: {resp.hex()}")
    if resp[1] != fc:
        raise AssertionError(f"FC mismatch: expected 0x{fc:02X}, got {resp.hex()}")
    return parse_bits(resp[3 : 3 + resp[2]], count)


def fc_write_single_reg(ser: serial.Serial, addr: int, value: int) -> None:
    req = add_crc(struct.pack(">BBHH", UNIT_ID, 0x06, addr, value))
    resp = transact(ser, req)
    if resp is None:
        raise AssertionError("FC06 no response")
    expect_crc(resp)
    if resp != req:
        raise AssertionError(f"FC06 echo mismatch: {resp.hex()} != {req.hex()}")


def fc_write_multi_regs(ser: serial.Serial, addr: int, values: list[int]) -> None:
    payload = b"".join(struct.pack(">H", v) for v in values)
    req = add_crc(
        struct.pack(">BBHHB", UNIT_ID, 0x10, addr, len(values), len(payload)) + payload
    )
    resp = transact(ser, req)
    if resp is None:
        raise AssertionError("FC10 no response")
    expect_crc(resp)
    expected = add_crc(struct.pack(">BBHH", UNIT_ID, 0x10, addr, len(values)))
    if resp != expected:
        raise AssertionError(
            f"FC10 response mismatch: {resp.hex()} != {expected.hex()}"
        )


def fc_write_single_coil(ser: serial.Serial, addr: int, on: bool) -> None:
    value = 0xFF00 if on else 0x0000
    req = add_crc(struct.pack(">BBHH", UNIT_ID, 0x05, addr, value))
    resp = transact(ser, req)
    if resp is None:
        raise AssertionError("FC05 no response")
    expect_crc(resp)
    if resp != req:
        raise AssertionError(f"FC05 echo mismatch: {resp.hex()} != {req.hex()}")


def fc_write_multi_coils(ser: serial.Serial, addr: int, bits: list[int]) -> None:
    packed = 0
    for idx, bit in enumerate(bits):
        if bit:
            packed |= 1 << idx
    payload = bytes((packed,))
    req = add_crc(
        struct.pack(">BBHHB", UNIT_ID, 0x0F, addr, len(bits), len(payload)) + payload
    )
    resp = transact(ser, req)
    if resp is None:
        raise AssertionError("FC0F no response")
    expect_crc(resp)
    expected = add_crc(struct.pack(">BBHH", UNIT_ID, 0x0F, addr, len(bits)))
    if resp != expected:
        raise AssertionError(
            f"FC0F response mismatch: {resp.hex()} != {expected.hex()}"
        )


def assert_exception(
    ser: serial.Serial, fc: int, addr: int, count: int, code: int
) -> None:
    req = add_crc(struct.pack(">BBHH", UNIT_ID, fc, addr, count))
    resp = transact(ser, req)
    if resp is None:
        raise AssertionError(f"FC{fc:02X} expected exception, got no response")
    expect_crc(resp)
    if len(resp) < 5 or resp[1] != (fc | 0x80) or resp[2] != code:
        raise AssertionError(f"Expected exception 0x{code:02X}, got {resp.hex()}")


def assert_no_response(ser: serial.Serial, frame: bytes, label: str) -> None:
    resp = transact(ser, frame, timeout_s=0.5)
    if resp is not None:
        raise AssertionError(f"{label}: expected no response, got {resp.hex()}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Modbus RTU serial HIL test")
    parser.add_argument("--port", required=True)
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--unit-id", type=int, default=UNIT_ID)
    args = parser.parse_args()

    global UNIT_ID
    UNIT_ID = args.unit_id

    print(f"[RTU] Opening {args.port} @ {args.baud} baud")
    with open_port(args.port, args.baud) as ser:
        time.sleep(0.3)

        print("[RTU] Phase 1 - Read default holding/input registers")
        regs = fc_read_words(ser, 0x03, REG_BASE, 2)
        assert regs == [0xABCD, 0x1234], regs
        in_regs = fc_read_words(ser, 0x04, REG_BASE, 2)
        assert in_regs == [0xABCD, 0x1234], in_regs

        print("[RTU] Phase 2 - Read default coils/discrete inputs")
        coils = fc_read_bits(ser, 0x01, COIL_BASE, 2)
        assert coils == [1, 0], coils
        discretes = fc_read_bits(ser, 0x02, COIL_BASE, 2)
        assert discretes == [1, 0], discretes

        print("[RTU] Phase 3 - Single register write/readback")
        fc_write_single_reg(ser, REG_BASE, 0x5A5A)
        regs = fc_read_words(ser, 0x03, REG_BASE, 2)
        assert regs == [0x5A5A, 0x1234], regs

        print("[RTU] Phase 4 - Multi-register write/readback")
        fc_write_multi_regs(ser, REG_BASE, [0x1111, 0x2222])
        regs = fc_read_words(ser, 0x03, REG_BASE, 2)
        assert regs == [0x1111, 0x2222], regs

        print("[RTU] Phase 5 - Single coil write/readback")
        fc_write_single_coil(ser, COIL_BASE, False)
        coils = fc_read_bits(ser, 0x01, COIL_BASE, 2)
        assert coils == [0, 0], coils

        print("[RTU] Phase 6 - Multi-coil write/readback")
        fc_write_multi_coils(ser, COIL_BASE, [1, 1])
        coils = fc_read_bits(ser, 0x01, COIL_BASE, 2)
        assert coils == [1, 1], coils

        print("[RTU] Phase 7 - Exception handling")
        assert_exception(ser, 0x03, 999, 1, 0x02)

        print("[RTU] Phase 8 - Wrong unit id ignored")
        wrong_uid = add_crc(struct.pack(">BBHH", 2, 0x03, REG_BASE, 1))
        assert_no_response(ser, wrong_uid, "wrong unit id")

        print("[RTU] Phase 9 - Bad CRC ignored")
        bad_crc = struct.pack(">BBHHBB", UNIT_ID, 0x03, REG_BASE, 1, 0x00, 0x00)
        assert_no_response(ser, bad_crc, "bad crc")

        print("[RTU] Phase 10 - Stress loop")
        for idx in range(50):
            value = (0x2000 + idx) & 0xFFFF
            fc_write_single_reg(ser, REG_BASE, value)
            regs = fc_read_words(ser, 0x03, REG_BASE, 1)
            if regs != [value]:
                raise AssertionError(f"stress register mismatch at {idx}: {regs}")

            bit = idx & 0x01
            fc_write_single_coil(ser, COIL_BASE, bool(bit))
            coils = fc_read_bits(ser, 0x01, COIL_BASE, 1)
            if coils != [bit]:
                raise AssertionError(f"stress coil mismatch at {idx}: {coils}")

    print("PASS: Modbus RTU serial smoke + stress test")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
