#!/usr/bin/env python3
"""Judge plant I/O evidence files (LNK-011, LNK-014, LNK-016; principle P6).

    python3 tools/hil/validate_plant_io_evidence.py --level hil specs/012-zplc-2-1-plant-simulation/evidence/plant-io-*-usb-serial.json

Each file must fit plant-io.schema.json, say the `level` it was made at (`--level` requires exactly that one: a native
simulator file is never accepted as hardware), and hold: every frame answered, none rejected, refused or timed out, the
applied sequence never going backwards, every output the echo of the frame it latched, and the worst exchange gap within
the limit the file records (`--max-gap-ms` replaces it). `late` is information, not an error: it counts every board scan
that found no new frame. A `hil` file also holds the three physical sequences, each confirmed by a person, with the
device-side checks (outputs toggled, mirror flag, STOPPED with the output image reset). Exit 0 all hold, 1 a file does not.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import hil_record  # noqa: E402

SCHEMA = HERE.parents[1] / "specs/012-zplc-2-1-plant-simulation/evidence/plant-io.schema.json"
STEPS = ("mirror-off", "mirror-on", "link-loss")


def problems_of(record, level: str | None = None, max_gap_ms: float | None = None) -> list[str]:
    found = hil_record.validate(record, json.loads(SCHEMA.read_text()))
    if found:
        return found
    m, run = record["measurements"], record["run"]
    if level and record["level"] != level:
        found.append(f"level is {record['level']!r}, {level!r} was required: a file made elsewhere is not evidence of this level")
    if record["level"] == "hil" and not record["repository"]["commit"]:
        found.append("a hil file names the commit it ran from")
    if run.get("stopped_by"):
        found.append(f"the run stopped early: {run['stopped_by']}")
    if record.get("events"):
        found.append(f"the board ended plant mode by itself: {record['events']}")
    if m["frames_ok"] != run["frames"] or m["frames_sent"] != run["frames"]:
        found.append(f"{m['frames_ok']} of {run['frames']} frames were answered ({m['frames_sent']} sent)")
    for name in ("rejected", "timeouts", "refused", "echo_mismatches"):
        if m[name]:
            found.append(f"{name} is {m[name]}, expected 0")
    if m["applied_seq"]["regressions"]:
        found.append(f"the applied sequence went backwards {m['applied_seq']['regressions']} times")
    limit = record["limits"]["max_gap_ms"] if max_gap_ms is None else max_gap_ms
    if m["gap_ms"]["max"] > limit:
        found.append(f"the worst exchange gap is {m['gap_ms']['max']:g} ms, above the limit of {limit:g} ms")
    steps = {step["step"]: step for step in record["physical"]}
    if record["level"] == "hil":
        if len(record["physical"]) != len(steps) or set(steps) != set(STEPS):
            found.append(f"a hil file holds each of the three physical sequences once ({', '.join(STEPS)})")
        for name, step in steps.items():
            if step["confirmed"] is not True:
                found.append(f"{name}: the person did not confirm it")
        check = lambda name: steps.get(name, {}).get("device_check", {})  # noqa: E731
        if check("mirror-off") and not (check("mirror-off").get("outputs_toggled") and check("mirror-off").get("mirror_flag") == 0):
            found.append("mirror-off: the outputs did not toggle with the mirror flag off")
        if check("mirror-on") and not (check("mirror-on").get("outputs_toggled") and check("mirror-on").get("mirror_flag") == 1):
            found.append("mirror-on: the outputs did not toggle with the mirror flag on")
        loss = check("link-loss")
        if loss and not (loss.get("cable_gone_detected") and loss.get("state") == "idle" and set(loss.get("output_image_hex", "x")) == {"0"}):
            found.append("link-loss: the board is not STOPPED with the output image reset after the cable came back")
    elif record["physical"]:
        found.append("only a hil file holds physical sequences")
    return found


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--level", choices=["host", "native-sim", "qemu", "target-build", "hil"])
    parser.add_argument("--max-gap-ms", type=float)
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args(argv)
    bad = 0
    for path in args.files:
        try:
            found = problems_of(json.loads(path.read_text()), args.level, args.max_gap_ms)
        except (OSError, json.JSONDecodeError) as error:
            found = [f"cannot read it: {error}"]
        for problem in found:
            print(f"FAIL  {path}: {problem}")
        print(f"{'ok  ' if not found else 'FAIL'}  {path}")
        bad += bool(found)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
