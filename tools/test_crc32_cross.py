#!/usr/bin/env python3
"""CRC32 cross-check of the container (HIL-017).

The CRC32 that closes every .zplc file is written by the TypeScript assembler, verified by the C loader that
runs on the device, and computed by zlib in the Python assembler. This script runs the C implementation
(firmware/lib/zplc_core/src/core/zplc_loader.c, compiled on the spot) and the TypeScript one
(packages/zplc-compiler/src/assembler/codegen.ts, run with bun) on the same byte strings in separate
processes and compares the two, and zlib, value by value. It also has the C loader verify artifacts that the
TypeScript and Python assemblers wrote, the one the HIL Modbus script builds by hand and every committed
examples/*.zplc, and it requires a tampered one and one built for another draft to be refused.

The comparison itself is tools/contract/crc_cross.py, which `bun run contract:check` also runs.
Needs a C compiler (cc, gcc or clang) and bun on PATH.

    python3 tools/test_crc32_cross.py       exit 0 when all agree, 1 on any disagreement
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "contract"))
import crc_cross  # noqa: E402


def main(runner=crc_cross.run) -> int:
    """`runner` returns the result of a comparison; a test passes one that disagrees."""
    result = runner()
    issues = crc_cross.problems(result)
    for position, vector in enumerate(result["vectors"]):
        print(f"{'[FAIL]' if not result['c'][position] == result['ts'][position] == result['zlib'][position] else '[PASS]'} "
              f"CRC32 of {vector or '(empty)'}: C {result['c'][position]}, TypeScript {result['ts'][position]}, zlib {result['zlib'][position]}")
    for name, verdict in result["loader_verdicts"].items():
        print(f"[INFO] C loader verdict for {name}: {verdict}")
    for issue in issues:
        print(f"[FAIL] {issue}", file=sys.stderr)
    print("All CRC32 implementations agree." if not issues else f"{len(issues)} disagreement(s).")
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
