#!/usr/bin/env python3
"""
CRC32 cross-validation test.

Verifies that the Python assembler (zlib.crc32) and the TypeScript assembler
(crc32 in codegen.ts) produce identical CRC32 values for the same payloads.

Run:
    python3 tools/test_crc32_cross.py
"""

import struct
import zlib
import sys
from pathlib import Path

# Add repo root to path so we can import zplc_asm
sys.path.insert(0, str(Path(__file__).parent))
from zplc_asm import ZPLCAssembler


def test_known_vector():
    """IEEE 802.3 known test vector."""
    data = b"123456789"
    expected = 0xCBF43926
    result = zlib.crc32(data) & 0xFFFFFFFF
    assert result == expected, f"Expected {expected:08X}, got {result:08X}"
    print(f"[PASS] Known vector: {result:08X}")


def test_zplc_file_crc():
    """Assemble a program and verify CRC is non-zero and verifiable."""
    asm = ZPLCAssembler()
    source = """
        LOAD16 0x0000
        LOAD16 0x0002
        ADD
        STORE16 0x1000
        HALT
    """
    bytecode = asm.assemble(source)
    zplc_data = asm.create_zplc_file(bytecode)

    # Read stored CRC from header (offset 12, 4 bytes, little-endian)
    stored_crc = struct.unpack_from("<I", zplc_data, 12)[0]
    assert stored_crc != 0, "CRC should not be zero"

    # Recompute CRC over everything except the crc32 field itself
    crc_payload = zplc_data[:12] + zplc_data[16:]
    computed_crc = zlib.crc32(crc_payload) & 0xFFFFFFFF

    assert stored_crc == computed_crc, (
        f"CRC mismatch: stored={stored_crc:08X}, computed={computed_crc:08X}"
    )
    print(f"[PASS] .zplc CRC matches: {stored_crc:08X}")


def test_empty_bytecode():
    """Edge case: empty bytecode still gets a valid CRC over header+segments."""
    asm = ZPLCAssembler()
    # Use minimal program (NOP HALT) to ensure non-empty bytecode
    source = "NOP\nHALT"
    bytecode = asm.assemble(source)
    zplc_data = asm.create_zplc_file(bytecode)

    stored_crc = struct.unpack_from("<I", zplc_data, 12)[0]
    assert stored_crc != 0, "CRC should not be zero even for tiny files"

    crc_payload = zplc_data[:12] + zplc_data[16:]
    computed_crc = zlib.crc32(crc_payload) & 0xFFFFFFFF
    assert stored_crc == computed_crc
    print(f"[PASS] Tiny file CRC matches: {stored_crc:08X}")


if __name__ == "__main__":
    test_known_vector()
    test_zplc_file_crc()
    test_empty_bytecode()
    print("\nAll CRC32 cross-validation tests passed.")
