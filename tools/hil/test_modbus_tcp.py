"""
HIL test for ZPLC Modbus TCP server (ESP32-S3 / T-Display S3).

Strategy
--------
1. Connect serial, wait for shell.
2. Connect Wi-Fi (same as test_comm_security.py).
3. Read board IP via `zplc net status`.
4. Upload a minimal .zplc binary that registers two Modbus tags:
     - Tag A: Modbus address 100 → WORK memory 0x2000 (UINT16)
     - Tag B: Modbus address 101 → WORK memory 0x2002 (UINT16)
5. Start the PLC (scheduler mode: it auto-starts; legacy mode: zplc start).
6. Inject known values with `zplc dbg poke`.
7. Open a raw TCP socket to <board_ip>:502 and test:
     Phase 1 – FC03 read holding registers (Modbus addr 100/101) → check value
     Phase 2 – FC06 write single register (Modbus addr 100)       → check echo + poke verify
     Phase 3 – FC03 on unmapped address 999                       → expect exception 0x02

Binary format reference (zplc_isa.h)
--------------------------------------
File header (32 bytes, little-endian):
  magic        u32  = 0x434C505A ("ZPLC")
  version_maj  u16  = 1
  version_min  u16  = 0
  flags        u32  = 0
  crc32        u32  = 0  (we skip CRC — firmware accepts 0 in non-strict builds)
  code_size    u32  = size of code segment payload
  data_size    u32  = 0
  entry_point  u16  = 0
  segment_count u16 = 2   (TASK seg + TAGS seg)
  reserved     u32  = 0

Segment table entry (8 bytes each):
  type  u16  = segment type
  flags u16  = 0
  size  u32  = payload size

Segments follow in order after the last segment table entry.

Segment types:
  ZPLC_SEG_CODE  = 0x01
  ZPLC_SEG_TASK  = 0x20
  ZPLC_SEG_TAGS  = 0x30

Task definition (16 bytes):
  id          u16  = 0
  type        u8   = 0 (CYCLIC)
  priority    u8   = 0
  interval_us u32  = 10_000 (10ms)
  entry_point u16  = 0
  stack_size  u16  = 16
  reserved    u32  = 0

Tag entry (8 bytes):
  var_addr u16  = ZPLC WORK memory address
  var_type u8   = data type (ZPLC_TYPE_UINT = 6)
  tag_id   u8   = ZPLC_TAG_MODBUS = 2
  value    u32  = Modbus register address

Modbus frame builder (raw TCP, no pymodbus):
  MBAP: TID(2) + PID(2=0) + LEN(2) + UID(1)
  PDU:  FC(1) + Data

v1.5 release additions
----------------------
- The supported-board list comes from `firmware/app/boards/supported-boards.v1.5.0.json`.
- Human HIL evidence must include one serial-focused board and one network-capable board.
- Multi-register validation should cover COUNT > 1 for holding-register operations.
"""

import argparse
import os
import re
import socket
import struct
import time

import serial


# ---------------------------------------------------------------------------
# Serial helpers (reused from test_comm_security.py)
# ---------------------------------------------------------------------------

ANSI_ESCAPE = re.compile(
    r"\x1b\[[0-9;]*[mJKH]|\[8D|\[J|\[1B|\x1b\[[\d;]*m|\x1b\[[\d;]*[A-Z]"
)


def clean(line: bytes) -> str:
    return ANSI_ESCAPE.sub("", line.decode("utf-8", errors="replace")).rstrip()


def send_cmd(
    ser: serial.Serial, cmd: str, wait: float = 0.8, max_read_s: float = 3.0
) -> list[str]:
    ser.write((cmd + "\r\n").encode())
    time.sleep(wait)
    lines: list[str] = []
    deadline = time.time() + max_read_s
    consecutive_empty = 0
    while time.time() < deadline:
        raw = ser.readline()
        if not raw:
            consecutive_empty += 1
            if consecutive_empty >= 4:
                break
            continue
        consecutive_empty = 0
        line = clean(raw)
        if line:
            lines.append(line)
    return lines


def wait_for_shell_ready(ser: serial.Serial, timeout_s: float = 25.0) -> None:
    start = time.time()
    seen: list[str] = []
    while time.time() - start < timeout_s:
        ser.write(b"\r\n")
        out = send_cmd(ser, "zplc version", wait=0.5, max_read_s=2.0)
        if any("ZPLC Runtime v" in line for line in out):
            return
        if out:
            seen.extend(out[-5:])
        time.sleep(0.5)
    tail = "\n".join(seen[-20:])
    raise AssertionError(
        "Timed out waiting for shell readiness. Last serial logs:\n" + tail
    )


def collect_logs(ser: serial.Serial, timeout_s: float) -> list[str]:
    start = time.time()
    lines: list[str] = []
    while time.time() - start < timeout_s:
        raw = ser.readline()
        if not raw:
            continue
        line = clean(raw)
        if line:
            lines.append(line)
    return lines


def wait_for_any_log(
    ser: serial.Serial, needles: tuple[str, ...], timeout_s: float
) -> list[str]:
    start = time.time()
    lines: list[str] = []
    while time.time() - start < timeout_s:
        raw = ser.readline()
        if not raw:
            continue
        line = clean(raw)
        if not line:
            continue
        lines.append(line)
        if any(needle in line for needle in needles):
            lines.extend(collect_logs(ser, 1.0))
            return lines
    expected = " | ".join(needles)
    tail = "\n".join(lines[-30:])
    raise AssertionError(f"Timeout waiting for log(s): {expected}\nLast logs:\n{tail}")


def shell_quote(arg: str) -> str:
    escaped = arg.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


# ---------------------------------------------------------------------------
# ZPLC bytecode builder
# ---------------------------------------------------------------------------

ZPLC_MAGIC = 0x434C505A
ZPLC_SEG_CODE = 0x01
ZPLC_SEG_TASK = 0x20
ZPLC_SEG_TAGS = 0x30

ZPLC_TASK_CYCLIC = 0
ZPLC_TYPE_UINT = 6  # ZPLC_TYPE_UINT (16-bit unsigned)
ZPLC_TAG_MODBUS = 2

# WORK memory base address (from zplc_isa.h: ZPLC_MEM_WORK_BASE = 0x2000)
WORK_BASE = 0x2000

# We place our two test variables at WORK+0 and WORK+2 (2 bytes each for UINT16)
TAG_A_VAR_ADDR = WORK_BASE + 0  # 0x2000
TAG_A_MODBUS_ADDR = 100
TAG_B_VAR_ADDR = WORK_BASE + 2  # 0x2002
TAG_B_MODBUS_ADDR = 101


def build_zplc_binary() -> bytes:
    """
    Build a minimal valid .zplc binary with:
      - One TASK segment: single cyclic task (10ms, HALT at offset 0)
      - One TAGS segment: two UINT16 Modbus tags (addr 100 → 0x2000, addr 101 → 0x2002)
      - One CODE segment: a single NOP + HALT (2 bytes)

    Segment order in file: CODE, TASK, TAGS
    """
    # CODE: NOP (0x00) + HALT (0x01)
    code_payload = bytes([0x00, 0x01])

    # TASK: one task definition (16 bytes)
    # struct: id(u16), type(u8), priority(u8), interval_us(u32), entry_point(u16),
    #         stack_size(u16), reserved(u32)
    task_payload = struct.pack(
        "<HBBIHHi",
        0,  # id = 0
        ZPLC_TASK_CYCLIC,  # type
        0,  # priority
        10_000,  # interval_us = 10ms
        0,  # entry_point = 0 (start of code)
        16,  # stack_size
        0,  # reserved
    )

    # TAGS: two tag entries (8 bytes each)
    # struct: var_addr(u16), var_type(u8), tag_id(u8), value(u32)
    tag_a = struct.pack(
        "<HBBi", TAG_A_VAR_ADDR, ZPLC_TYPE_UINT, ZPLC_TAG_MODBUS, TAG_A_MODBUS_ADDR
    )
    tag_b = struct.pack(
        "<HBBi", TAG_B_VAR_ADDR, ZPLC_TYPE_UINT, ZPLC_TAG_MODBUS, TAG_B_MODBUS_ADDR
    )
    tags_payload = tag_a + tag_b

    segment_count = 3  # CODE + TASK + TAGS

    # File header (32 bytes)
    # struct: magic(u32), ver_maj(u16), ver_min(u16), flags(u32), crc32(u32),
    #         code_size(u32), data_size(u32), entry_point(u16), segment_count(u16), reserved(u32)
    header = struct.pack(
        "<IHHIIII HH I",
        ZPLC_MAGIC,  # magic      u32
        1,  # version_major u16
        0,  # version_minor u16
        0,  # flags      u32
        0,  # crc32      u32
        len(code_payload),  # code_size  u32
        0,  # data_size  u32
        0,  # entry_point u16
        segment_count,  # segment_count u16
        0,  # reserved   u32
    )

    # Segment table entries (8 bytes each): type(u16), flags(u16), size(u32)
    seg_code_entry = struct.pack("<HHI", ZPLC_SEG_CODE, 0, len(code_payload))
    seg_task_entry = struct.pack("<HHI", ZPLC_SEG_TASK, 0, len(task_payload))
    seg_tags_entry = struct.pack("<HHI", ZPLC_SEG_TAGS, 0, len(tags_payload))

    return (
        header
        + seg_code_entry
        + seg_task_entry
        + seg_tags_entry
        + code_payload
        + task_payload
        + tags_payload
    )


def send_cmd_wait_for(
    ser: serial.Serial,
    cmd: str,
    success: str,
    error_needles: tuple[str, ...] = ("ERROR:",),
    timeout_s: float = 10.0,
) -> list[str]:
    """Send a shell command and wait until a specific success string appears.

    Unlike send_cmd() (which uses a fixed sleep + consecutive-empty heuristic),
    this function drains lines until `success` is found or `timeout_s` expires.
    This is robust against boot-log noise that would otherwise fill the read window.
    """
    ser.reset_input_buffer()
    ser.write((cmd + "\r\n").encode())
    lines: list[str] = []
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        raw = ser.readline()
        if not raw:
            continue
        line = clean(raw)
        if not line:
            continue
        lines.append(line)
        if success in line:
            return lines
        if any(needle in line for needle in error_needles):
            raise AssertionError(
                f"Command {cmd!r} returned error: {line!r}\nAll lines: {lines}"
            )
    raise AssertionError(
        f"Timeout waiting for {success!r} after command {cmd!r}\nLines seen:\n"
        + "\n".join(lines[-30:])
    )


def upload_bytecode(ser: serial.Serial, bytecode: bytes) -> None:
    """Upload bytecode using zplc sched load / zplc sched data shell protocol.

    NOTE: In CONFIG_ZPLC_SCHEDULER=y builds, zplc load/data/start/stop are NOT
    registered. The upload goes through zplc sched load / zplc sched data, which
    internally call zplc_sched_load() + zplc_sched_start().
    """
    # Announce size — wait for "OK:" confirmation (robust against boot-log noise)
    send_cmd_wait_for(
        ser,
        f"zplc sched load {len(bytecode)}",
        success="OK:",
        timeout_s=10.0,
    )

    # Send hex chunks (32 hex chars = 16 bytes per chunk — safe for Zephyr shell line buffer)
    hex_data = bytecode.hex()
    chunk_size = 32
    for i in range(0, len(hex_data), chunk_size):
        chunk = hex_data[i : i + chunk_size]
        send_cmd_wait_for(
            ser,
            f"zplc sched data {chunk}",
            success="OK:",
            timeout_s=5.0,
        )

    print(f"[HIL] Bytecode uploaded: {len(bytecode)} bytes")


# ---------------------------------------------------------------------------
# Modbus TCP frame helpers (raw socket, stdlib only)
# ---------------------------------------------------------------------------


def build_mbap(tid: int, pdu: bytes, uid: int = 1) -> bytes:
    """Build a Modbus TCP ADU: MBAP (7 bytes) + PDU."""
    # LEN field = remaining bytes after LEN field = UID (1) + PDU
    length = 1 + len(pdu)
    mbap = struct.pack(">HHHB", tid, 0, length, uid)
    return mbap + pdu


def fc03_read_holding(tid: int, start_addr: int, count: int, uid: int = 1) -> bytes:
    """FC03 – Read Holding Registers."""
    pdu = struct.pack(">BHH", 0x03, start_addr, count)
    return build_mbap(tid, pdu, uid)


def fc06_write_single(tid: int, addr: int, value: int, uid: int = 1) -> bytes:
    """FC06 – Write Single Register."""
    pdu = struct.pack(">BHH", 0x06, addr, value)
    return build_mbap(tid, pdu, uid)


def recv_response(sock: socket.socket, timeout_s: float = 5.0) -> bytes:
    """Receive a complete Modbus TCP response."""
    sock.settimeout(timeout_s)
    data = b""
    try:
        # Read at least 7 bytes (MBAP)
        while len(data) < 7:
            chunk = sock.recv(256)
            if not chunk:
                raise AssertionError("Connection closed by Modbus server")
            data += chunk
        # Parse LEN from MBAP to know total expected bytes
        total_expected = 6 + struct.unpack(">H", data[4:6])[0]
        while len(data) < total_expected:
            chunk = sock.recv(256)
            if not chunk:
                raise AssertionError("Truncated Modbus response")
            data += chunk
        return data[:total_expected]
    except TimeoutError as e:
        raise AssertionError(f"Modbus TCP recv timeout after {timeout_s}s") from e


# ---------------------------------------------------------------------------
# IP discovery
# ---------------------------------------------------------------------------


def get_board_ip(ser: serial.Serial, timeout_s: float = 30.0) -> str:
    """Read board IP using `zplc net status`, polling until assigned."""
    deadline = time.time() + timeout_s
    last_out: list[str] = []
    while time.time() < deadline:
        # Drain any pending noise before sending command
        ser.reset_input_buffer()
        out = send_cmd(ser, "zplc net status", wait=1.2, max_read_s=5.0)
        last_out = out
        for line in out:
            m = re.search(r"IP Address:\s*([\d.]+)", line)
            if m and m.group(1) not in ("0.0.0.0", "(not"):
                return m.group(1)
        print(
            f"[HIL]   IP not yet assigned, retrying... ({int(deadline - time.time())}s left)"
        )
        time.sleep(2.0)
    raise AssertionError(
        "Could not obtain board IP after polling. Last 'zplc net status' output:\n"
        + "\n".join(last_out)
    )


# ---------------------------------------------------------------------------
# Poke helpers — inject 16-bit little-endian value into ZPLC WORK memory
# ---------------------------------------------------------------------------


def poke_u16(ser: serial.Serial, addr: int, value: int) -> None:
    """Write a 16-bit LE value as two consecutive poke commands."""
    lo = value & 0xFF
    hi = (value >> 8) & 0xFF
    send_cmd_wait_for(
        ser, f"zplc dbg poke {hex(addr)} {lo}", success="OK:", timeout_s=5.0
    )
    send_cmd_wait_for(
        ser, f"zplc dbg poke {hex(addr + 1)} {hi}", success="OK:", timeout_s=5.0
    )


def peek_u16(ser: serial.Serial, addr: int) -> int:
    """Read a 16-bit LE value via zplc dbg peek, robust against ADC noise."""
    # The peek output is: "Memory at 0xXXXX (N bytes):\nXXXX: YY ZZ\nzplc:~$"
    # We send the command then read lines until we see the hex dump line "XXXX: YY YY".
    hex_dump_re = re.compile(
        r"([0-9A-Fa-f]{4})\s*:\s*([0-9A-Fa-f]{2})\s+([0-9A-Fa-f]{2})"
    )

    ser.reset_input_buffer()
    ser.write((f"zplc dbg peek {hex(addr)} 2\r\n").encode())

    deadline = time.time() + 8.0
    lines: list[str] = []
    while time.time() < deadline:
        raw = ser.readline()
        if not raw:
            continue
        line = clean(raw)
        if not line:
            continue
        lines.append(line)
        m = hex_dump_re.search(line)
        if m:
            lo = int(m.group(2), 16)
            hi = int(m.group(3), 16)
            return lo | (hi << 8)
    raise AssertionError(
        f"peek {hex(addr)}: hex dump line never appeared within 8s.\nLines:\n"
        + "\n".join(lines[-20:])
    )


# ---------------------------------------------------------------------------
# Main test
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="HIL test for ZPLC Modbus TCP server on hardware"
    )
    parser.add_argument(
        "--port", default=os.getenv("ZPLC_SERIAL_PORT", "/dev/cu.usbmodem101")
    )
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--wifi-ssid", default=os.getenv("ZPLC_WIFI_SSID", ""))
    parser.add_argument("--wifi-password", default=os.getenv("ZPLC_WIFI_PASSWORD", ""))
    parser.add_argument("--skip-wifi", action="store_true")
    parser.add_argument(
        "--modbus-port",
        type=int,
        default=502,
        help="Modbus TCP port on the board (default: 502)",
    )
    parser.add_argument(
        "--board-ip",
        default="",
        help="Override board IP (skip auto-discovery via 'zplc net status')",
    )
    args = parser.parse_args()

    ser = serial.Serial(
        args.port,
        args.baud,
        timeout=0.5,
        dsrdtr=False,
        rtscts=False,
        exclusive=True,
    )
    ser.dtr = False
    ser.rts = False
    time.sleep(0.5)
    ser.reset_input_buffer()

    try:
        # ----------------------------------------------------------------
        # Shell readiness
        # ----------------------------------------------------------------
        wait_for_shell_ready(ser)
        print("[HIL] Shell ready.")

        # ----------------------------------------------------------------
        # Wi-Fi
        # ----------------------------------------------------------------
        if not args.skip_wifi:
            if not args.wifi_ssid or not args.wifi_password:
                raise ValueError(
                    "Wi-Fi credentials missing. "
                    "Use --wifi-ssid/--wifi-password or env "
                    "ZPLC_WIFI_SSID/ZPLC_WIFI_PASSWORD."
                )
            print(f"[HIL] Connecting Wi-Fi to SSID: {args.wifi_ssid!r}")
            wifi_out = send_cmd(
                ser,
                f"wifi connect -s {shell_quote(args.wifi_ssid)} -k 1 -p {shell_quote(args.wifi_password)}",
                wait=5.0,
                max_read_s=12.0,
            )
            print(f"[HIL] Wi-Fi output ({len(wifi_out)} lines):")
            for ln in wifi_out[-10:]:
                print(f"      {ln}")

            if not any("Connected" in ln for ln in wifi_out):
                print("[HIL] Waiting for Wi-Fi association...")
                try:
                    assoc = wait_for_any_log(
                        ser,
                        ("Connected", "Address:", "WIFI_STATE_COMPLETED"),
                        timeout_s=20.0,
                    )
                    print(f"[HIL] Wi-Fi event: {assoc[-1]!r}")
                except AssertionError:
                    print("[HIL] WARNING: Wi-Fi association not confirmed — continuing")

        # ----------------------------------------------------------------
        # Quiesce MQTT thread — prevents it from flooding shell responses
        # NOTE: zplc config save may trigger a firmware reboot (NVS commit).
        #       We must re-wait for shell readiness and reconnect Wi-Fi after it.
        # ----------------------------------------------------------------
        print("[HIL] Quiescing MQTT thread...")
        send_cmd(ser, "zplc config set mqtt_enabled 0", wait=0.5, max_read_s=2.0)
        send_cmd(ser, "zplc config save", wait=1.2, max_read_s=3.0)
        # Drain any pending output and re-confirm shell is ready (handles post-save reboot)
        collect_logs(ser, 2.0)
        print("[HIL] Waiting for shell after config save (may reboot)...")
        wait_for_shell_ready(ser, timeout_s=30.0)
        print("[HIL] MQTT quiesced.")

        # ----------------------------------------------------------------
        # Reconnect Wi-Fi after potential reboot (config save may reset the board)
        # ----------------------------------------------------------------
        if not args.skip_wifi and not args.board_ip:
            print("[HIL] Re-connecting Wi-Fi post-reboot...")
            wifi_out = send_cmd(
                ser,
                f"wifi connect -s {shell_quote(args.wifi_ssid)} -k 1 -p {shell_quote(args.wifi_password)}",
                wait=5.0,
                max_read_s=12.0,
            )
            if not any("Connected" in ln for ln in wifi_out):
                try:
                    wait_for_any_log(
                        ser,
                        ("Connected", "Address:", "WIFI_STATE_COMPLETED"),
                        timeout_s=20.0,
                    )
                except AssertionError:
                    print(
                        "[HIL] WARNING: Wi-Fi re-association not confirmed — continuing"
                    )

        # ----------------------------------------------------------------
        # Build and upload the test bytecode
        # ----------------------------------------------------------------
        print("[HIL] Building minimal .zplc binary with 2 Modbus tags...")
        bytecode = build_zplc_binary()
        print(f"[HIL] Binary size: {len(bytecode)} bytes")
        upload_bytecode(ser, bytecode)

        # Give Modbus server a moment to spin up (it starts on boot, but just in case)
        time.sleep(1.0)

        # ----------------------------------------------------------------
        # Discover board IP
        # ----------------------------------------------------------------
        if args.board_ip:
            board_ip = args.board_ip
        else:
            print("[HIL] Discovering board IP...")
            board_ip = get_board_ip(ser)
        print(f"[HIL] Board IP: {board_ip}")

        # ----------------------------------------------------------------
        # Phase 1 — FC03: Read holding registers (verify poke → Modbus read)
        # ----------------------------------------------------------------
        print("[HIL] Phase 1: FC03 Read Holding Registers")
        EXPECTED_A = 0xABCD
        EXPECTED_B = 0x1234

        poke_u16(ser, TAG_A_VAR_ADDR, EXPECTED_A)
        poke_u16(ser, TAG_B_VAR_ADDR, EXPECTED_B)
        print(
            f"[HIL]   Poked {hex(TAG_A_VAR_ADDR)}={hex(EXPECTED_A)}, {hex(TAG_B_VAR_ADDR)}={hex(EXPECTED_B)}"
        )

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.connect((board_ip, args.modbus_port))
            print(f"[HIL]   Connected to {board_ip}:{args.modbus_port}")

            # Read 2 registers starting at Modbus address 100
            req = fc03_read_holding(tid=1, start_addr=TAG_A_MODBUS_ADDR, count=2)
            sock.sendall(req)
            resp = recv_response(sock)

        # Parse FC03 response: MBAP(7) + FC(1) + ByteCount(1) + Data(n)
        # resp[7] = FC = 0x03, resp[8] = byte count (4 for 2 regs), resp[9:13] = reg values
        assert resp[7] == 0x03, f"Expected FC=0x03 in response, got 0x{resp[7]:02X}"
        byte_count = resp[8]
        assert byte_count == 4, (
            f"Expected 4 data bytes for 2 registers, got {byte_count}"
        )

        # Modbus is big-endian
        reg_a = struct.unpack(">H", resp[9:11])[0]
        reg_b = struct.unpack(">H", resp[11:13])[0]

        assert reg_a == EXPECTED_A, (
            f"FC03 reg[100] mismatch: expected {hex(EXPECTED_A)}, got {hex(reg_a)}"
        )
        assert reg_b == EXPECTED_B, (
            f"FC03 reg[101] mismatch: expected {hex(EXPECTED_B)}, got {hex(reg_b)}"
        )
        print(f"[HIL]   FC03 reg[100]=0x{reg_a:04X}, reg[101]=0x{reg_b:04X} — MATCH")
        print("[HIL] Phase 1: PASS")

        # ----------------------------------------------------------------
        # Phase 2 — FC06: Write single register, verify echo + read-back
        # ----------------------------------------------------------------
        print("[HIL] Phase 2: FC06 Write Single Register")
        WRITE_VALUE = 0x5A5A

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.connect((board_ip, args.modbus_port))

            req = fc06_write_single(tid=2, addr=TAG_A_MODBUS_ADDR, value=WRITE_VALUE)
            sock.sendall(req)
            resp = recv_response(sock)

        # FC06 response: MBAP(7) + FC(1) + Addr(2) + Value(2)  [echo of request]
        assert resp[7] == 0x06, f"Expected FC=0x06 echo, got 0x{resp[7]:02X}"
        echo_addr = struct.unpack(">H", resp[8:10])[0]
        echo_val = struct.unpack(">H", resp[10:12])[0]
        assert echo_addr == TAG_A_MODBUS_ADDR, (
            f"FC06 echo addr mismatch: expected {TAG_A_MODBUS_ADDR}, got {echo_addr}"
        )
        assert echo_val == WRITE_VALUE, (
            f"FC06 echo value mismatch: expected {hex(WRITE_VALUE)}, got {hex(echo_val)}"
        )
        print(f"[HIL]   FC06 echo: addr={echo_addr}, val=0x{echo_val:04X} — OK")

        # Verify the value actually landed in ZPLC memory via peek
        readback = peek_u16(ser, TAG_A_VAR_ADDR)
        assert readback == WRITE_VALUE, (
            f"Memory read-back mismatch after FC06: "
            f"expected {hex(WRITE_VALUE)}, got {hex(readback)}"
        )
        print(f"[HIL]   Memory read-back: 0x{readback:04X} — MATCH")
        print("[HIL] Phase 2: PASS")

        # ----------------------------------------------------------------
        # Phase 3 — FC03 on unmapped address → exception 0x02 (Illegal Data Address)
        # ----------------------------------------------------------------
        print("[HIL] Phase 3: FC03 on unmapped address (expect exception 0x02)")
        UNMAPPED_ADDR = 999

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.connect((board_ip, args.modbus_port))

            req = fc03_read_holding(tid=3, start_addr=UNMAPPED_ADDR, count=1)
            sock.sendall(req)
            resp = recv_response(sock)

        # Exception response: FC | 0x80 (0x83 for FC03), exception code 0x02
        assert resp[7] == (0x03 | 0x80), (
            f"Expected exception FC=0x83, got 0x{resp[7]:02X}"
        )
        assert resp[8] == 0x02, (
            f"Expected exception code 0x02 (Illegal Data Address), got 0x{resp[8]:02X}"
        )
        print(f"[HIL]   Exception 0x{resp[7]:02X} / code 0x{resp[8]:02X} — CORRECT")
        print("[HIL] Phase 3: PASS")

    finally:
        try:
            ser.dtr = False
            ser.rts = False
            ser.close()
        except Exception:
            pass

    print("PASS: Modbus TCP HIL checks (FC03 read, FC06 write, unmapped exception)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
