import struct
import sys


def inspect(filename):
    with open(filename, "rb") as f:
        data = f.read()

    print(f"File size: {len(data)}")

    # Header
    magic, vmaj, vmin, flags, crc, code_sz, data_sz, ep, seg_cnt, res = struct.unpack(
        "<IHHIIIIHHI", data[:32]
    )
    print(f"Magic: {hex(magic)}")
    print(f"Entry Point (Legacy): {ep}")
    print(f"Segment Count: {seg_cnt}")

    offset = 32
    # Segment Table
    for i in range(seg_cnt):
        stype, sflags, ssize = struct.unpack("<HHI", data[offset : offset + 8])
        print(f"Segment {i}: Type={stype}, Size={ssize}")

        if stype == 2:  # TASK
            task_offset = 32 + (seg_cnt * 8) + code_sz  # Assuming Code is first
            # But we should calculate properly based on previous segments

            # Find offset for this segment data
            # Header(32) + Table(seg_cnt*8) + ... data ...
            data_start = 32 + (seg_cnt * 8)
            # We assume Code is seg 0 and Task is seg 1
            if i == 1:
                task_data = data[data_start + code_sz : data_start + code_sz + ssize]
                tid, ttype, tprio, tint, tep, tstack, tres = struct.unpack(
                    "<HBBIHHI", task_data
                )
                print(f"  Task ID: {tid}")
                print(f"  Task Entry Point: {tep}")

        offset += 8


inspect("tools/hil/st_tests/user_function.zplc")
