"""Bench utility: print the header, segment table and first task of a .zplc file.

It reads a file and touches no device. It is listed in tools/hil/non-gating.json (HIL-004). The header layout is
the generated contract (tools/contract/zplc_contract.py), not a copy (HIL-008). Exits 1 when the file is not a ZPLC container.
"""
import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "contract"))
from zplc_contract import HEADER_SIZE, HEADER_STRUCT, SEGMENT_ENTRY_SIZE, SEGMENT_ENTRY_STRUCT, SEGMENT_TYPE, ZPLC_MAGIC  # noqa: E402


def inspect(data: bytes) -> int:
    print(f"File size: {len(data)}")
    if len(data) < HEADER_SIZE:
        print("The file is shorter than a header")
        return 1
    fields = struct.unpack_from(HEADER_STRUCT, data, 0)
    magic = fields[0]
    print(f"Magic: {hex(magic)}")
    if magic != ZPLC_MAGIC:
        print("Not a ZPLC container (bad magic)")
        return 1
    # magic, version major and minor, flags, crc32, code size, data size, entry point, segment count, draft counter
    _, major, minor, flags, crc, code_size, data_size, entry, segment_count, draft = fields
    print(f"Version: {major}.{minor}, flags {flags:#x}, crc32 {crc:08x}")
    print(f"Contract draft: {draft if draft else 'none (built before the draft counter)'}")
    print(f"Code {code_size} bytes, data {data_size} bytes, entry point {entry}, {segment_count} segments")
    offset = HEADER_SIZE
    for index in range(segment_count):
        if offset + SEGMENT_ENTRY_SIZE > len(data):
            print("The segment table is cut short")
            return 1
        entry = struct.unpack_from(SEGMENT_ENTRY_STRUCT, data, offset)
        names = {value: name for name, value in SEGMENT_TYPE.items()}
        print(f"Segment {index}: {names.get(entry[0], entry[0])}, flags {entry[1]:#x}, {entry[2]} bytes")
        offset += SEGMENT_ENTRY_SIZE
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", help="a .zplc file, for example one made by `zplc-cli compile`")
    args = parser.parse_args(argv)
    return inspect(Path(args.file).read_bytes())


if __name__ == "__main__":
    sys.exit(main())
