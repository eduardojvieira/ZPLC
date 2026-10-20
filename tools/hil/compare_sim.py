#!/usr/bin/env python3
"""Run the reference projects in native simulation and on a bench, and compare their I/O traces (HIL-015).

    python3 tools/hil/compare_sim.py rpi_pico [--bench human|emulated] [--port PORT] [--seconds 3] [--out DIR]

Each reference project of Studio (the LD, FBD and SFC blinkies and the LD motor control) is compiled for the board
(`target.board`), run on the native runtime of this tree and on the bench, with the same input stimulus at the same
times; the output image is sampled on both sides and each trace is reduced to its changes. Any difference (another
sequence of output values, or a change more than --tolerance-ms away from its twin) is written to a comparison record in
build/hil-records, and printed for the simulator capability profile (spec 009 FR-009, docs/docs/runtime/intro.md),
where a difference found on hardware has to be reflected.

The bench is a person at a real board (`--bench human`: an interactive terminal, and the person types the board's
identity before anything is driven, HIL-003) or the emulator of tools/hil/emulator (`--bench emulated`). `--device
host|null` replaces the bench with a stand-in for tests; such a run is never evidence. Exit status: 0 when the traces
agree, 1 when a difference was recorded, 2 when the comparison could not run.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import bench as benches
import hil_guard
import hil_record
from hil_devices import DeviceError, HostRuntimeDevice, SerialTransport, open_fake
from language_tester import LanguageTester
from run_chain import DEFAULT_OUT, find_board

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "packages/zplc-ide/src/cli/index.ts"
PROJECTS = ROOT / "packages/zplc-ide/projects"
SCHEMA = "zplc.hil.sim-comparison/1"
SAMPLE_S = 0.02
# project: the input stimulus, (time in ms from RUN, input byte 0); the same on both sides
REFERENCE = {
    "blinky": [],
    "blinky_fbd": [],
    "blinky_sfc": [],
    "motor_control": [(0, 0x00), (500, 0x01), (1000, 0x00), (1500, 0x04)],  # start pressed, released, overload
}


def compile_for(project: Path, board: str) -> list[int]:
    """The project compiled for `board`: a copy whose zplc.json names the board as its target."""
    bun = shutil.which("bun")
    if bun is None:
        raise RuntimeError("bun is not on PATH: the repository compiler runs on it")
    with tempfile.TemporaryDirectory(prefix="zplc-compare-") as directory:
        copy = Path(directory) / project.name
        shutil.copytree(project, copy, ignore=shutil.ignore_patterns("build", "tests"))
        manifest = json.loads((copy / "zplc.json").read_text())
        manifest["target"] = {**manifest.get("target", {}), "board": board}
        (copy / "zplc.json").write_text(json.dumps(manifest))
        out = Path(directory) / "out.zplc"
        done = subprocess.run([bun, str(CLI), "compile", str(copy), "-o", str(out)], capture_output=True, text=True, cwd=ROOT)
        if done.returncode != 0:
            raise RuntimeError(f"{project.name} does not compile for {board}: {(done.stderr or done.stdout).strip()[-300:]}")
        return list(out.read_bytes())


def trace(tester: LanguageTester, program: list[int], stimulus: list[tuple[int, int]], seconds: float) -> list[list[int]]:
    """[time in ms, output byte 0] at RUN and at each change, with the stimulus forced onto input byte 0 on time."""
    tester.upload_bytecode(program)
    pending = list(stimulus)
    if pending and pending[0][0] == 0:
        tester.send(f"zplc dbg force set 0x0000 {pending.pop(0)[1]:02x}")
    changes: list[list[int]] = []
    started = time.monotonic()
    tester.send("zplc start")
    try:
        while (now := (time.monotonic() - started) * 1000) < seconds * 1000:
            while pending and pending[0][0] <= now:
                tester.send(f"zplc dbg force set 0x0000 {pending.pop(0)[1]:02x}")
            found = tester.peek(0x1000, 1)
            value = found[0] if found else -1
            if not changes or changes[-1][1] != value:
                changes.append([round(now), value])
            time.sleep(SAMPLE_S)
    finally:
        tester.send("zplc dbg force clear_all")
        tester.send("zplc stop")
    return changes


def first_difference(simulated: list[list[int]], bench: list[list[int]]) -> str:
    """The first sample that differs, with its index (from 0), its time and the value on each side."""
    describe = lambda trace, index, side: f"nothing {side}" if index >= len(trace) else f"0x{trace[index][1]:02x} at {trace[index][0]} ms {side}"  # noqa: E731
    for index in range(max(len(simulated), len(bench))):
        if index >= len(simulated) or index >= len(bench) or simulated[index][1] != bench[index][1]:
            return f"the first differing sample is #{index}: {describe(simulated, index, 'in simulation')}, {describe(bench, index, 'on the bench')}"
    return "no sample differs in value"


def differences(simulated: list[list[int]], bench: list[list[int]], tolerance_ms: float) -> list[str]:
    """How two traces differ: the sequence of output values, then the time of each change (the last may fall off the end)."""
    found = []
    values_a, values_b = [v for _, v in simulated], [v for _, v in bench]
    common = min(len(values_a), len(values_b))
    if values_a[:common] != values_b[:common] or abs(len(values_a) - len(values_b)) > 1:
        found.append(f"the outputs change through {values_a} in simulation and {values_b} on the bench")
        found.append(first_difference(simulated, bench))
    for (at_a, value), (at_b, _) in list(zip(simulated, bench))[1:common]:
        if abs(at_a - at_b) > tolerance_ms:
            found.append(f"the change to 0x{value:02x} comes at {at_a} ms in simulation and {at_b} ms on the bench")
    return found


def parse(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("board", help="ide_id or board_id of the board in firmware/app/boards/boards.json")
    parser.add_argument("--bench", choices=("human", "emulated"), default="human")
    parser.add_argument("--port", help="serial port of a human bench; else ZPLC_SERIAL_PORT or the USB identifiers")
    parser.add_argument("--device", choices=("host", "null"), help="a stand-in instead of the bench, for tests: never evidence")
    parser.add_argument("--projects", help=f"comma-separated reference projects ({', '.join(REFERENCE)}); default all")
    parser.add_argument("--seconds", type=float, default=3.0, help="how long each project runs on each side")
    parser.add_argument("--tolerance-ms", type=float, default=100.0, help="how far apart a change may come on the two sides")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    return parser.parse_args(argv)


def run(args, io, stdout=None, opener=open_fake, bench=None) -> int:
    out = stdout or sys.stdout
    try:
        board = find_board(args.board)
        if args.device:
            bench, transport, level = benches.StandInBench("a stand-in"), opener(args.device), None
        else:
            if bench is None and args.bench == "emulated":
                bench = benches.load_emulator_bench(board)
            elif bench is None:
                hil_guard.require_interactive(io, "the comparison on a bench")
                bench = benches.HumanBench(io, board, args.port)
            transport, level = SerialTransport(bench.port()), bench.level
        simulated = LanguageTester(transport=HostRuntimeDevice(), board=board["ide_id"])
        device = LanguageTester(transport=transport, board=board["ide_id"])
    except (hil_guard.NotInteractive, benches.BenchMissing, benches.Unsupported, DeviceError, KeyError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    record = {
        "schema": SCHEMA, "board": board["ide_id"], "board_id": board["board_id"], "started_at": hil_record.now(),
        "bench": "stand-in" if args.device else args.bench, "evidence_level": level,
        **({"emulator": bench.emulator} if level == "emulated" else {}),
        "tolerance_ms": args.tolerance_ms, "seconds": args.seconds, "repository": hil_record.repository_state(), "projects": [],
    }
    try:
        if level == "hardware":
            identity = device.identity().get("board", "")
            bench.identity = identity
            record["confirmation"] = hil_guard.confirm_physical(io, {"id": "compare", "title": "Compare simulation and this board", "instruction": "The reference projects drive the outputs of this board."}, identity)
        for name in (args.projects.split(",") if args.projects else REFERENCE):
            program = compile_for(PROJECTS / name, board["ide_id"])
            sim = trace(simulated, program, REFERENCE[name], args.seconds)
            real = trace(device, program, REFERENCE[name], args.seconds)
            found = differences(sim, real, args.tolerance_ms)
            record["projects"].append({"id": name, "simulation": sim, "bench": real, "differences": found})
            print(f"{name}: {'same' if not found else 'DIFFERENT: ' + '; '.join(found)}", file=out)
    except (RuntimeError, DeviceError, hil_guard.IdentityMismatch, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    finally:
        simulated.close()
        device.close()
    record["ended_at"] = hil_record.now()
    record["result"] = "different" if any(p["differences"] for p in record["projects"]) else "same"
    folder = Path(args.out)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{board['ide_id']}-{record['started_at'][:10]}-compare-{os.getpid()}.json"
    path.write_text(json.dumps(record, indent=2) + "\n")
    print(f"{record['result'].upper()}: {path}", file=out)
    if record["result"] == "different" and level == "hardware":
        print("a difference on hardware belongs in the simulator capability profile (spec 009 FR-009): docs/docs/runtime/intro.md", file=out)
    return 0 if record["result"] == "same" else 1


def main(argv=None, io=None, stdout=None, opener=open_fake, bench=None) -> int:
    return run(parse(argv), io or hil_guard.TerminalIo(), stdout, opener, bench)


if __name__ == "__main__":
    sys.exit(main())
