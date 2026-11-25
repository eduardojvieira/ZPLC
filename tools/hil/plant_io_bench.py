#!/usr/bin/env python3
"""Plant I/O mode on a board: latency, continuity and the three physical checks (LNK-011, LNK-014, LNK-016).

A PERSON runs this at the bench. It refuses to start unless stdin is a terminal and the person types the board id
(G7); no agent, no MCP tool and no CI job runs it (AGENTS.md rule 8). It never flashes and never deploys: the person
deploys the echo program first (tools/hil/README.md) and passes the compiled file as --program, whose CRC-32 must be
the one the board reports.

    python3 tools/hil/plant_io_bench.py --board esp32s3_devkitc --transport usb-serial --program echo.zplc \\
        --frames 5000 --frame-ms 20 --out specs/012-zplc-2-1-plant-simulation/evidence/plant-io-esp32s3-usb-serial.json

What it does, after the typed board id: opens the framed link as Studio does (`zplc link <hex>` lines), opens a session,
sends RUN if the program is stopped, enters plant mode with a fixed synthetic map (inputs: 4 BOOL at IPI 0.0 to 0.3, an
INT at IPI 2, a REAL at IPI 4; outputs: 2 BOOL at OPI 0.0 and 0.1), streams `--frames` frames with a deterministic
pattern and records the round trip (`rtt_ms`: request written to response read) and the exchange gap (`gap_ms`: time
between two consecutive responses) per frame. Then three physical sequences, each announced and confirmed at the
keyboard: mirror off (the LED stays off while the outputs toggle), mirror on (the LED follows), link loss (with mirroring
still on, the cable is pulled for ten seconds: the LED goes off as the board leaves the mode, and the board must be STOPPED
with the output image reset). The device's uptime (`zplc sys info --json`) is read before the mode starts and after the
cable is back, so a board that restarted because the pull cut its power is not taken for one that left the mode.

The evidence file says its `level`: `hil` only for a real serial port. `--level native-sim` is the rehearsal against the
native simulator (a /dev/pts port, no person, no physical sequence); it says nothing about hardware. Exit status: 0 the
run holds every check of validate_plant_io_evidence.py, 1 it does not, 2 it did not start.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import struct
import sys
import time
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "tools" / "contract"))
import generate_protocol as proto  # noqa: E402

import hil_record  # noqa: E402
from validate_plant_io_evidence import problems_of  # noqa: E402

DEFINITION = proto.load()
MSG = {m["name"]: m["id"] for m in DEFINITION["messages"]}
EVT = {e["name"]: e["id"] for e in DEFINITION["events"]}
ERR = {e["value"]: e["name"] for e in DEFINITION["errors"]}
CAP_PLANT = 1 << next(c["bit"] for c in DEFINITION["capabilities"] if c["name"] == "PLANT")
MASK_PLANT = 1 << next(m["bit"] for m in DEFINITION["eventMask"] if m["name"] == "PLANT")
EXIT_REASONS = {e["value"]: e["name"] for e in next(x for x in DEFINITION["enums"] if x["name"] == "PLANT_EXIT_REASON")["members"]}
MAX_PAYLOAD = 512  # what this client offers in HELLO; the answer to a frame is 15 bytes here
OPI_BASE = 0x1000  # ZPLC_MEM_OPI_BASE
BOOL, INT, REAL = 0, 1, 2
# (offset, type, bit): the synthetic map. The echo program copies IPI 0.0 to OPI 0.0 and IPI 0.1 to OPI 0.1.
INPUTS = [(0, BOOL, 0), (0, BOOL, 1), (0, BOOL, 2), (0, BOOL, 3), (2, INT, 0), (4, REAL, 0)]
OUTPUTS = [(0, BOOL, 0), (0, BOOL, 1)]
STEPS = ("mirror-off", "mirror-on", "link-loss")
LOSS_WAIT_S = 10


class BenchError(Exception):
    """A run that cannot go on: the evidence says what happened up to here."""


def descriptor(offset: int, kind: int, bit: int) -> bytes:
    return struct.pack("<HB", offset, kind | bit << 2)


def encode_enter(inputs, outputs, timeout_ms: int) -> bytes:
    return struct.pack("<HBB", timeout_ms, len(inputs), len(outputs)) + b"".join(descriptor(*d) for d in (*inputs, *outputs))


def pattern(seq: int):
    """The deterministic inputs of frame `seq`: four BOOL, an INT and a REAL."""
    return [bool(seq >> k & 1) for k in range(4)], (seq * 7) % 20000 - 10000, seq / 8.0


def encode_values(bools, integer: int, real: float) -> bytes:
    bitmap = bytearray((len(bools) + 7) // 8)
    for index, value in enumerate(bools):
        if value:
            bitmap[index // 8] |= 1 << index % 8
    return bytes(bitmap) + struct.pack("<hf", integer, real)


def expected_outputs(seq: int) -> int:
    """The output bitmap of the echo program after it latched frame `seq`."""
    return (seq & 1) | (seq >> 1 & 1) << 1


def percentiles(values: list[float]) -> dict:
    """Nearest-rank percentiles; an empty list gives zeros and count 0."""
    ordered = sorted(values)
    rank = lambda p: ordered[max(1, math.ceil(p / 100 * len(ordered))) - 1] if ordered else 0  # noqa: E731
    return {"count": len(ordered), "p50": rank(50), "p95": rank(95), "p99": rank(99), "max": ordered[-1] if ordered else 0}


class Link:
    """The framed device link over the shell, with the timing of every request."""

    def __init__(self, tester, response_timeout_s: float, clock, sleep):
        self.tester, self.timeout, self.clock, self.sleep = tester, response_timeout_s, clock, sleep
        self.sequence = 1
        self.events: list[dict] = []

    def request(self, name: str, payload: bytes = b""):
        """(answer frame or None on silence, rtt in ms). A write to a port that is gone raises OSError."""
        sequence, self.sequence = self.sequence, self.sequence + 1
        line = "zplc link " + proto.encode_frame(DEFINITION, 0, MSG[name], sequence, payload).hex() + "\r\n"
        ser = self.tester.ser
        while ser.in_waiting:  # the prompt and what came after the last answer
            ser.read(ser.in_waiting)
        sent = self.clock()
        ser.write(line.encode())
        text, answer = "", None
        while answer is None and self.clock() - sent < self.timeout:
            if ser.in_waiting:
                text += ser.read(ser.in_waiting).decode("utf-8", errors="ignore")
                decoder = proto.Decoder(DEFINITION, DEFINITION["limits"]["payloadMaxDefault"])
                for match in re.finditer(r"ZF:((?:[0-9a-f]{2})+)\s", text):
                    decoder.push(bytes.fromhex(match.group(1)))
                for frame in decoder.frames:
                    if frame["kind"] == 2 and frame not in self.events:
                        self.events.append(frame)
                    elif frame["kind"] == 1 and frame["sequence"] == sequence and frame["message"] == MSG[name]:
                        answer = frame
            else:
                self.sleep(0.0005)
        return answer, (self.clock() - sent) * 1000

    def call(self, name: str, payload: bytes = b"") -> bytes:
        """The payload after the status byte; any status but OK, or silence, ends the run."""
        answer, _ = self.request(name, payload)
        if answer is None:
            raise BenchError(f"the board did not answer {name} within {self.timeout:g} s")
        if answer["payload"][0] != 0:
            status = answer["payload"][0]
            raise BenchError(f"the board refused {name}: {ERR.get(status, status)}")
        return answer["payload"][1:]

    def exit_events(self) -> list[dict]:
        return [{"reason": EXIT_REASONS.get(e["payload"][0], e["payload"][0]), "frames": struct.unpack_from("<I", e["payload"], 1)[0]}
                for e in self.events if e["message"] == EVT["EVT_PLANT_EXIT"]]


class Bench:
    def __init__(self, args, open_tester, ask, clock=time.monotonic, sleep=time.sleep, say=print):
        self.args, self.open_tester, self.ask, self.clock, self.sleep, self.say = args, open_tester, ask, clock, sleep, say
        self.seq = 0
        self.stats = {"rtt": [], "gap": [], "sent": 0, "ok": 0, "timeouts": 0, "refused": 0, "echo_mismatches": 0, "regressions": 0, "max_lag": 0}
        self.last_applied = 0
        self.last_end = None
        self.late = self.rejected = 0
        self.mirror_flag = 0

    # one exchange ----------------------------------------------------------------------------------
    def exchange(self, link: Link, plant_id: int, measure: bool):
        self.seq += 1
        seq = self.seq
        answer, rtt = link.request("PLANT_FRAME", struct.pack("<HI", plant_id, seq) + encode_values(*pattern(seq)))
        end = self.clock()
        if measure:
            self.stats["sent"] += 1
        if answer is None:
            if measure:
                self.stats["timeouts"] += 1
            raise BenchError(f"no response to frame {seq} within {link.timeout:g} s: the mode ends after its timeout")
        status = answer["payload"][0]
        if status != 0:
            if measure:
                self.stats["refused"] += 1
            # STATE: the mode is over, or this is not the session that entered it
            raise BenchError(f"frame {seq} refused: {ERR.get(status, status)}" + (" (the mode ended, or another session owns it)" if status == 11 else ""))
        applied, _scans, flags, self.late, self.rejected = struct.unpack_from("<IIBHH", answer["payload"], 1)
        out = answer["payload"][14] if len(answer["payload"]) > 14 else -1
        self.mirror_flag = flags & 1
        if measure:
            self.stats["ok"] += 1
            self.stats["rtt"].append(rtt)
            if self.last_end is not None:
                self.stats["gap"].append((end - self.last_end) * 1000)
            self.last_end = end
            if applied < self.last_applied:
                self.stats["regressions"] += 1
            self.stats["max_lag"] = max(self.stats["max_lag"], seq - applied)
            self.last_applied = max(self.last_applied, applied)
            if applied > seq or out != expected_outputs(applied):
                self.stats["echo_mismatches"] += 1
        return out

    def stream(self, link, plant_id, count: int, measure=False) -> list[int]:
        """`count` frames on the wall clock, one every frame_ms; the output bitmaps seen. A late frame goes at once."""
        period, due, seen = self.args.frame_ms / 1000, self.clock(), []
        for _ in range(count):
            while self.clock() < due:
                self.sleep(0.0005)
            seen.append(self.exchange(link, plant_id, measure))
            due = max(due + period, self.clock())
        return seen

    # the run ---------------------------------------------------------------------------------------
    def shell_state(self, tester) -> str:
        found = re.search(r'"state"\s*:\s*"(\w+)"', tester.send("zplc sched status --json"))
        return found.group(1) if found else "unknown"

    def output_image(self, tester, length: int) -> str:
        text = tester.send(f"zplc dbg peek 0x{OPI_BASE:04x} {length}")
        return "".join(re.findall(r"\b[0-9a-fA-F]{2}\b", text)[-length:]).lower()

    def uptime(self, tester) -> tuple:
        """(the device's `uptime_ms`, or None when it reports none; when the read was sent, by the bench clock; its round trip in ms)."""
        sent = self.clock()
        found = re.search(r'"uptime_ms"\s*:\s*(\d+)', tester.send("zplc sys info --json"))
        return (int(found.group(1)) if found else None), sent, (self.clock() - sent) * 1000

    def confirm(self, text: str) -> bool:
        return self.ask(f"{text}\nType yes to confirm, anything else says no: ").strip().lower() == "yes"

    def run(self, evidence: dict) -> None:
        args, say = self.args, self.say
        tester = self.open_tester()
        evidence["device"] = {"kind": getattr(tester, "kind", "fake")}
        if args.level == "hil" and getattr(tester, "kind", "") != "serial":
            raise BenchError("hil evidence needs a serial port to a board; this device is a fake")
        link = Link(tester, args.response_timeout_ms / 1000, self.clock, self.sleep)
        evidence["firmware"] = {**{k: v for k, v in hil_record.firmware_identity(tester.build_identity()).items() if k in ("commit", "version", "dirty", "board_target")},
                                "version_output": tester.send("zplc version").strip()}
        hello = link.call("HELLO", bytes([1]) + struct.pack("<H", MAX_PAYLOAD))
        _version, _transport, max_payload, capabilities = struct.unpack_from("<BBHI", hello, 0)
        if not capabilities & CAP_PLANT:
            raise BenchError("this firmware does not advertise plant I/O mode (capability PLANT)")
        evidence["run"]["negotiated_payload"] = min(max_payload, MAX_PAYLOAD)
        link.call("SESSION_OPEN", bytes([0]) + bytes(32) + b"plant-io-bench".ljust(16, b"\0"))
        link.call("EVENTS_SET", struct.pack("<I", MASK_PLANT))
        info = link.call("PROGRAM_INFO")
        loaded, size, crc = struct.unpack_from("<BII", info, 0)
        evidence["program"] = {"size": size, "crc32": f"{crc:08x}"}
        if not loaded or crc != zlib.crc32(Path(args.program).read_bytes()) & 0xFFFFFFFF:
            raise BenchError(f"the board holds a different program than {args.program} (board CRC-32 {crc:08x}): deploy the echo program first")
        if self.shell_state(tester) != "running":
            say("The program is stopped: sending RUN (plant mode needs a running program; the outputs stay safe in it).")
            link.call("RUN")
            self.sleep(0.3)
        self.marker = self.uptime(tester)  # the start of the window the link-loss check spans (sequence 3)
        plant_id, in_bytes, out_bytes, max_slots, granted = struct.unpack("<HHHBH", link.call("PLANT_ENTER", encode_enter(INPUTS, OUTPUTS, args.timeout_ms)))
        evidence["run"].update(plant_id=plant_id, in_bytes=in_bytes, out_bytes=out_bytes, max_slots=max_slots, timeout_ms_granted=granted)
        say(f"Plant mode entered (entry {plant_id}, timeout {granted} ms); streaming {args.frames} frames every {args.frame_ms} ms.")
        try:
            self.stream(link, plant_id, args.frames, measure=True)
        except BenchError as error:
            evidence["run"]["stopped_by"] = str(error)
        evidence["events"] = link.exit_events()
        if evidence["run"].get("stopped_by") or evidence["events"]:
            return
        phase = max(1, round(args.phase_s * 1000 / args.frame_ms))
        if args.level == "hil":
            evidence["physical"] = []
            self.physical_mirror(link, plant_id, phase, evidence)
            if all(step["confirmed"] for step in evidence["physical"]) and self.physical_loss(tester, link, plant_id, evidence):
                return
        else:
            self.stream(link, plant_id, 2)  # the rehearsal: nobody to confirm anything
        self.exit_mode(link, evidence)

    def exit_mode(self, link, evidence) -> None:
        """The person's exit: the program stops and the outputs go safe."""
        closed = dict(zip(("reason", "frames", "late", "rejected"), struct.unpack("<BIHH", link.call("PLANT_EXIT"))))
        closed["reason"] = EXIT_REASONS.get(closed["reason"])
        evidence["closed"] = closed

    def physical_mirror(self, link, plant_id, phase, evidence) -> None:
        link.call("PLANT_MIRROR", b"\x00")
        self.say("\n1. MIRROR OFF. For about %g s the program's outputs toggle; the board's LED must stay OFF." % self.args.phase_s)
        seen = self.stream(link, plant_id, phase)
        step = {"step": "mirror-off", "device_check": {"outputs_toggled": len(set(seen)) > 1, "mirror_flag": self.mirror_flag}}
        step["confirmed"], step["confirmed_by"] = self.confirm("Did the LED stay off?"), "person"
        evidence["physical"].append(step)
        link.call("PLANT_MIRROR", b"\x01")
        self.say("\n2. MIRROR ON. The LED must now follow the outputs. Mirroring stays on into the cable pull of sequence 3.")
        seen = self.stream(link, plant_id, phase)
        step = {"step": "mirror-on", "device_check": {"outputs_toggled": len(set(seen)) > 1, "mirror_flag": self.mirror_flag}}
        step["confirmed"], step["confirmed_by"] = self.confirm("Did the LED follow the outputs?"), "person"
        evidence["physical"].append(step)

    def physical_loss(self, tester, link, plant_id, evidence) -> bool:
        """True when the cable was pulled, so the mode ended by itself; False when the person declined."""
        self.say("\n3. LINK LOSS. Mirroring is still on, so the LED keeps following the outputs while the script streams. UNPLUG THE\n"
                 "USB CABLE now: the LED must go off as the board leaves the mode. The script notices, waits %d s, then asks you to\n"
                 "plug it back." % LOSS_WAIT_S)
        if not self.confirm("Ready to pull the cable?"):
            evidence["physical"].append({"step": "link-loss", "device_check": {}, "confirmed": False, "confirmed_by": "person"})
            return False
        gone = False
        for _ in range(int(60 / (self.args.frame_ms / 1000)) + 1):  # at most about a minute
            try:
                self.exchange(link, plant_id, False)
            except (BenchError, OSError):
                gone = True
                break
            self.sleep(self.args.frame_ms / 1000)
        # the mirror flag of the last answered frame: the LED was following the outputs when the cable went out
        check = {"cable_gone_detected": gone, "waited_s": LOSS_WAIT_S, "mirror_flag": self.mirror_flag}
        step = {"step": "link-loss", "device_check": check}
        if gone:
            self.sleep(LOSS_WAIT_S)
            self.ask("Plug the cable back, then press Enter: ")
            try:
                tester.close()
            except OSError:
                pass
            tester = self.open_tester()
            check["state"] = self.shell_state(tester)
            check["output_image_hex"] = self.output_image(tester, 2)
            before, before_at, before_rtt = self.marker
            after, after_at, after_rtt = self.uptime(tester)
            # the board samples its uptime somewhere inside each read: without a restart the uptime grows by the bench
            # time between the two reads, less at most the first read's round trip (plus 50 ms for whole milliseconds)
            # ponytail: a 32-bit uptime wraps after 49.7 days of running; a board on the bench never runs that long
            check.update(uptime_before_ms=before, uptime_after_ms=after, host_elapsed_ms=round((after_at - before_at) * 1000),
                         read_slack_ms=round(before_rtt + after_rtt + 50))
            step["confirmed"], step["confirmed_by"] = self.confirm("Did the LED go off when the cable came out, and is it off now?"), "person"
        else:
            step["confirmed"], step["confirmed_by"] = False, "person"
        evidence["physical"].append(step)
        return True


def main(argv=None, *, is_tty=None, ask=input, open_tester=None, clock=time.monotonic, sleep=time.sleep, say=print) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--board", required=True, help="the IDE board id, for example esp32s3_devkitc or rpi_pico")
    parser.add_argument("--transport", required=True, choices=["usb-serial"])
    parser.add_argument("--program", required=True, help="the compiled echo program the board holds (its CRC-32 is checked)")
    parser.add_argument("--frames", type=int, default=5000)
    parser.add_argument("--frame-ms", type=int, default=20)
    parser.add_argument("--timeout-ms", type=int, default=500, help="the staleness bound asked of the board (50 to 2000)")
    parser.add_argument("--response-timeout-ms", type=int, default=1000)
    parser.add_argument("--phase-s", type=float, default=5.0, help="seconds each physical sequence streams")
    parser.add_argument("--max-gap-ms", type=int, default=250, help="the worst exchange gap this run accepts; it goes into the evidence")
    parser.add_argument("--level", choices=["hil", "native-sim"], default="hil")
    parser.add_argument("--port", help="the serial port; else ZPLC_SERIAL_PORT, else found from the USB identifiers of the board")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)
    fail = lambda message: (print(f"error: {message}", file=sys.stderr), 2)[1]  # noqa: E731
    if args.frames < 1 or args.frame_ms < 1:
        return fail("--frames and --frame-ms must be positive")
    if args.out.exists():
        return fail(f"{args.out} exists: a run never overwrites evidence")
    if not Path(args.program).is_file():
        return fail(f"--program {args.program} is not a file")
    if args.level == "hil":
        if not (sys.stdin.isatty() if is_tty is None else is_tty):
            return fail("this script is run by a person at the bench: stdin is not a terminal")
        say(f"This run enters plant mode on the board '{args.board}' (and sends RUN if its program is stopped), keeps its outputs safe,\n"
            "turns mirroring on and off, and asks you to pull the USB cable. It never flashes or deploys.")
        if ask(f"Type the board id ({args.board}) to start: ").strip() != args.board:
            return fail("the typed board id differs: nothing was started")
    elif not (args.port or "").startswith("/dev/pts/") and not os.environ.get("ZPLC_HIL_DEVICE"):
        return fail("--level native-sim runs against a native_sim pseudo-terminal (--port /dev/pts/N) or a fake device only")
    if open_tester is None:
        from zplc_tester import ZPLCTester  # noqa: PLC0415

        open_tester = lambda: ZPLCTester(port=args.port, board=args.board)  # noqa: E731
    evidence = {"schema": 1, "level": args.level, "board": args.board, "transport": args.transport, "date": hil_record.now(),
                "repository": hil_record.repository_state(), "tools": {**hil_record.tool_versions(), "bench": "1"},
                "run": {"frames": args.frames, "frame_ms": args.frame_ms, "timeout_ms": args.timeout_ms, "phase_s": args.phase_s}}
    bench = Bench(args, open_tester, ask, clock, sleep, say)
    try:
        bench.run(evidence)
    except BenchError as error:
        evidence["run"]["stopped_by"] = str(error)
    except OSError as error:
        evidence["run"]["stopped_by"] = f"the port failed: {error}"
    s = bench.stats
    evidence["measurements"] = {"rtt_ms": percentiles(s["rtt"]), "gap_ms": percentiles(s["gap"]), "frames_sent": s["sent"], "frames_ok": s["ok"],
                                "late": bench.late, "rejected": bench.rejected, "timeouts": s["timeouts"], "refused": s["refused"],
                                "applied_seq": {"regressions": s["regressions"], "max_lag": s["max_lag"]}, "echo_mismatches": s["echo_mismatches"]}
    evidence["limits"] = {"max_gap_ms": args.max_gap_ms}
    evidence.setdefault("physical", [])
    args.out.write_text(json.dumps(evidence, indent=2) + "\n")
    problems = problems_of(evidence)
    for problem in problems:
        say(f"FAIL  {problem}")
    say(f"{'PASSED' if not problems else 'FAILED'}: {args.out}  (late counts every board scan that found no new frame; it is information, not an error)")
    return 1 if problems else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # a port that would not open, no port chosen
        print(f"error: {error}", file=sys.stderr)
        sys.exit(2)
