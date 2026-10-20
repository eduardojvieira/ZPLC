"""The HIL-010 steps that measure a board on its bench (HIL-010, HIL-012; RT-019 to RT-023, COM-012, COM-019, COM-020).

Each step deploys a small program compiled FOR THE BOARD (its workspace names `target.board`, so the work memory is the
board's: a single-file compile assumes 8 KB and the ESP32-S3 has 2 KB), drives it over the device link, asks the bench
for what only a bench can do, and writes its measurements and its verdict into the record. A step the bench cannot do
raises bench.Unsupported and is recorded as not run, never as passed.

`BenchSteps` is mixed into run_chain.Chain, which provides `tester`, `bench`, `board`, `record` and `step`.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import hil_endpoints
from bench import Unsupported

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "packages/zplc-ide/src/cli/index.ts"
sys.path.insert(0, str(ROOT / "tools" / "contract"))
import generate_protocol as proto  # noqa: E402  (the reference encoder and decoder of the device link)

sys.path.append(str(ROOT / "firmware" / "zephyr" / "scripts"))
import zplc_boards  # noqa: E402

IPI, OPI = 0x0000, 0x1000
RESULT = 0x2780  # %MD480: where the step programs put what the chain reads (inside the 2 KB work memory of the ESP32-S3)
TIMER_PT_MS = 3000
TIMER_TOLERANCE_MS = 100  # beyond the scan interval and twice the round trip of one read
JITTER_S = 600  # HIL-010: at least ten minutes
JITTER_SAMPLE_S = 30
JITTER_PERIOD_TOLERANCE = 0.2  # every scan period, shortest and longest, as a fraction of the interval (the bench's bound)
ANALOG_POINTS = ((0.0, 0.05), (0.5, 0.10), (1.0, 0.05))  # (fraction of travel, tolerance as a fraction of full scale)
DEPLOY_CUTS = 20
ATOMIC_WRITES = 100
RTU_VALUE = 0x5A17
FIELDBUS_WAIT_S = 20

# What each step costs on a person's bench, in seconds: the chain adds them up to say how long it takes (HIL-012).
STEP_SECONDS = {
    "preflight": 60, "open": 5, "flash": 180, "handshake": 5, "io-description": 2, "trace-option": 1,
    "confirm-identity": 20, "safe-to-drive": 15, "deploy": 10, "run": 5, "force": 5, "stop": 5,
    "digital-loopback": 60, "analog-read": 90, "timer-accuracy": 10, "scan-jitter-10min": JITTER_S + 10,
    "overrun-fault-outputs-off": 10, "stop-and-link-loss-safe": 50, "watchdog-reset-time": 20,
    "fatal-fault-outputs-off": 10, "power-cycle-retain": 45, "deploy-power-interruption-x20": DEPLOY_CUTS * 25,
    "atomic-write": 20, "fieldbus-exchange": 90,
}
FIXTURE_SECONDS = 8
TARGET_SECONDS = 30 * 60

PROGRAMS = {
    # name: (interval in ms, Structured Text)
    "idle": (10, """
PROGRAM Main
VAR alive AT %MD480 : DINT; END_VAR
alive := alive + 1;
END_PROGRAM
"""),
    # the outputs the forces of the link-loss step drive, held low by the program: after a release they follow it
    "hold": (10, """
PROGRAM Main
VAR q0 AT %QX0.0 : BOOL; q1 AT %QX0.1 : BOOL; q2 AT %QX0.2 : BOOL; q3 AT %QX0.3 : BOOL; END_VAR
q0 := FALSE; q1 := FALSE; q2 := FALSE; q3 := FALSE;
END_PROGRAM
"""),
    "timer": (10, f"""
PROGRAM Main
VAR t : TON; q AT %QX0.0 : BOOL; END_VAR
t(IN := TRUE, PT := T#{TIMER_PT_MS}ms);
q := t.Q;
END_PROGRAM
"""),
    "overrun": (1, """
PROGRAM Main
VAR i : DINT; acc : DINT; q AT %QX0.0 : BOOL; END_VAR
q := TRUE;
FOR i := 1 TO 8000 DO acc := acc + i; END_FOR;
END_PROGRAM
"""),
    "fault": (10, """
PROGRAM Main
VAR n : INT; zero : INT; r : INT; q AT %QX0.0 : BOOL; END_VAR
q := TRUE;
n := n + 1;
IF n > 20 THEN r := n / zero; END_IF;
END_PROGRAM
"""),
    "hang": (10, """
PROGRAM Main
VAR spin : BOOL := TRUE; q AT %QX0.0 : BOOL; END_VAR
q := TRUE;
WHILE spin DO q := TRUE; END_WHILE;
END_PROGRAM
"""),
    "retain": (10, """
PROGRAM Main
VAR RETAIN scans : DINT; END_VAR
scans := scans + 1;
END_PROGRAM
"""),
    "deploy-a": (10, """
PROGRAM Main
VAR q0 AT %QX0.0 : BOOL; q2 AT %QX0.2 : BOOL; END_VAR
q0 := TRUE; q2 := TRUE;
END_PROGRAM
"""),
    "deploy-b": (10, """
PROGRAM Main
VAR q1 AT %QX0.1 : BOOL; q3 AT %QX0.3 : BOOL; pad : ARRAY[0..31] OF DINT; i : INT; END_VAR
q1 := TRUE; q3 := TRUE;
FOR i := 0 TO 31 DO pad[i] := pad[i] + i; END_FOR;
END_PROGRAM
"""),
    "atomic": (10, """
PROGRAM Main
VAR x AT %MD480 : DINT; torn AT %MD481 : DINT; END_VAR
IF NOT (x = 0 OR x = -1) THEN torn := torn + 1; END_IF;
END_PROGRAM
"""),
    "modbus-rtu": (10, f"""
PROGRAM Main
VAR rd : MB_READ_HREG; got AT %MD480 : DINT; done AT %MD481 : DINT; err AT %MD482 : DINT; END_VAR
rd(EN := TRUE, PROTO := 0, SLAVE_ID := 1, ADDR := 100, COUNT := 1);
IF rd.DONE THEN got := rd.VALUE; done := done + 1; END_IF;
IF rd.ERROR THEN err := rd.STATUS; END_IF;
END_PROGRAM
"""),
    "modbus-tcp-mqtt": (10, f"""
PROGRAM Main
VAR
  wr : MB_WRITE_HREG; rd : MB_READ_HREG; written : BOOL;
  con : MQTT_CONNECT; pub : MQTT_PUBLISH; sub : MQTT_SUBSCRIBE;
  got AT %MD480 : DINT; done AT %MD481 : DINT; err AT %MD482 : DINT; heard AT %MD483 : DINT;
END_VAR
wr(EN := NOT written, PROTO := 1, SLAVE_ID := 1, ADDR := 100, COUNT := 1, HOST := '{{host}}', PORT := {{modbus_port}}, VALUE := {RTU_VALUE});
IF wr.DONE THEN written := TRUE; END_IF;
rd(EN := written, PROTO := 1, SLAVE_ID := 1, ADDR := 100, COUNT := 1, HOST := '{{host}}', PORT := {{modbus_port}});
IF rd.DONE THEN got := rd.VALUE; done := done + 1; END_IF;
IF wr.ERROR THEN err := wr.STATUS; END_IF;
IF rd.ERROR THEN err := rd.STATUS; END_IF;
con(EN := TRUE, PROFILE := 0);
sub(EN := con.DONE, QOS := 0, TOPIC := 'zplc/hil');
pub(EN := con.DONE, QOS := 0, RETAIN := FALSE, TOPIC := 'zplc/hil', PAYLOAD := 'hil');
IF sub.DONE THEN heard := heard + 1; END_IF;
END_PROGRAM
"""),
}

_SYMBOL = re.compile(r"^; 0x([0-9a-fA-F]+): (\w+) \(")


def compile_program(name: str, board: str, values: dict | None = None) -> tuple[list[int], dict[str, int]]:
    """A step program compiled for `board` (its IDE id) as a workspace, and the address of each of its symbols."""
    interval, source = PROGRAMS[name]
    bun = shutil.which("bun")
    if bun is None:
        raise RuntimeError("bun is not on PATH: the repository compiler runs on it")
    with tempfile.TemporaryDirectory(prefix="zplc-hil-step-") as directory:
        project = Path(directory)
        (project / "src").mkdir()
        (project / "src" / "main.st").write_text(source.format(**(values or {})) if values else source.replace("{{", "{").replace("}}", "}"))
        manifest = {
            "schemaVersion": 2, "name": f"hil-{name}", "version": "1.0.0", "target": {"board": board},
            "tasks": [{"name": "MainTask", "trigger": "cyclic", "interval_ms": interval, "priority": 1, "programs": ["main.st"]}],
        }
        (project / "zplc.json").write_text(json.dumps(manifest))
        out = project / "out.zplc"
        built = subprocess.run([bun, str(CLI), "compile", str(project), "-o", str(out)], capture_output=True, text=True, cwd=ROOT)
        if built.returncode != 0:
            raise RuntimeError(f"the {name} program does not compile for {board}: {(built.stderr or built.stdout).strip()[-400:]}")
        listing = subprocess.run([bun, str(CLI), "compile", str(project), "--emit", "asm"], capture_output=True, text=True, cwd=ROOT)
        symbols = {m.group(2): int(m.group(1), 16) for m in map(_SYMBOL.match, listing.stdout.splitlines()) if m}
        return list(out.read_bytes()), symbols


def _signed32(values: list[int]) -> int:
    return int.from_bytes(bytes(values), "little", signed=True)


class ShellLink:
    """The framed device link (COM-019) carried by the shell as `zplc link <hex>` lines, the way Studio sends it."""

    DEFINITION = proto.load()
    MESSAGES = {m["name"]: m["id"] for m in DEFINITION["messages"]}

    def __init__(self, tester):
        self.tester, self.sequence = tester, 1

    def request(self, name: str, payload: bytes = b"") -> dict:
        sequence, self.sequence = self.sequence, self.sequence + 1
        frame = proto.encode_frame(self.DEFINITION, 0, self.MESSAGES[name], sequence, payload)
        text = self.tester.send("zplc link " + frame.hex())
        if "command not found" in text or "Unknown" in text:
            raise Unsupported("the device does not carry the device link over its shell (`zplc link`)")
        decoder = proto.Decoder(self.DEFINITION, self.DEFINITION["limits"]["payloadMaxDefault"])
        for match in re.finditer(r"ZF:((?:[0-9a-f]{2})+)", text):
            decoder.push(bytes.fromhex(match.group(1)))
        for frame in decoder.frames:
            if frame["kind"] == 1 and frame["sequence"] == sequence:
                if frame["payload"][:1] != b"\x00":
                    raise AssertionError(f"the device refused {name}: status {frame['payload'][:1].hex()}")
                return frame
        raise AssertionError(f"the device did not answer {name} over the device link")

    def idle_seconds(self) -> int:
        """The idle time after which the device ends a silent session and releases its forces (COM-020)."""
        body = self.request("HELLO", bytes([1]) + (512).to_bytes(2, "little"))["payload"]
        return int.from_bytes(body[11:13], "little")

    def open_session(self) -> None:
        self.request("SESSION_OPEN", bytes(33) + b"zplc-hil-chain".ljust(16, b"\0"))


class BenchSteps:
    """The twelve HIL-010 steps the chain used to list as pending."""

    jitter_seconds = JITTER_S

    # helpers -------------------------------------------------------------------------------------------
    def now(self) -> float:
        return self.bench.now_ms()

    def wait(self, seconds: float) -> None:
        getattr(self.bench, "sleep", time.sleep)(seconds)

    def measure(self, **values) -> None:
        self.record["steps"][-1].setdefault("measurements", {}).update(values)

    def deploy_program(self, name: str, **values) -> dict[str, int]:
        bytecode, symbols = compile_program(name, self.board["ide_id"], values or None)
        self.tester.upload_bytecode(bytecode)
        self.programs.setdefault(name, len(bytecode))
        return symbols

    def status(self) -> dict:
        match = re.search(r"\{.*\}", self.tester.send("zplc status --json"), re.DOTALL)
        try:
            return json.loads(match.group(0)) if match else {}
        except json.JSONDecodeError:
            return {}

    def outputs(self) -> int:
        found = self.tester.peek(OPI, 1)
        if not found:
            raise AssertionError("the output image cannot be read")
        return found[0]

    def dint(self, address: int) -> int:
        found = self.tester.peek(address, 4)
        if len(found) < 4:
            raise AssertionError(f"0x{address:04X} cannot be read")
        return _signed32(found)

    def stop_and_clear(self) -> None:
        self.tester.send("zplc dbg force clear_all")
        self.tester.send("zplc stop", wait_for="OK:")

    def reconnect(self, seconds: float = 30.0) -> None:
        """After a reset the USB port of a board goes away and comes back: open it again and wait for the shell."""
        if getattr(self.tester.ser, "kind", "") != "serial":
            return
        from hil_devices import DeviceError, SerialTransport  # noqa: PLC0415

        try:
            self.tester.ser.close()
        except Exception:  # the port is already gone
            pass
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            try:
                self.tester.ser = SerialTransport(self.bench.port())
                time.sleep(1)
                if self.status():
                    return
            except (DeviceError, OSError):
                time.sleep(1)
        raise AssertionError(f"the board did not come back on its port within {seconds:.0f} s")

    def digital_pairs(self) -> list[tuple[dict, dict]]:
        outputs = [c for c in self.board["io"]["channels"] if c["kind"] == "digital" and c["direction"] == "output"]
        inputs = {c["id"]: c for c in self.board["io"]["channels"] if c["kind"] == "digital" and c["direction"] == "input"}
        return [(o, inputs[f"DI{o['id'][2:]}"]) for o in outputs if o["id"].startswith("DO") and f"DI{o['id'][2:]}" in inputs][:4]

    def input_bits(self) -> int:
        found = self.tester.peek(IPI, 1)
        if not found:
            raise AssertionError("the input image cannot be read")
        return found[0]

    # the steps -------------------------------------------------------------------------------------------
    def digital_loopback(self):
        """Each output, switched alone, moves its own input and no other (DO0→DI0 … DO3→DI3 through 1 kΩ)."""
        pairs = self.digital_pairs()
        if not pairs:
            raise AssertionError("the board's I/O description has no DOn/DIn pair to wire")
        self.bench.confirm_wiring("digital-loopback")
        self.deploy_program("idle")
        self.tester.send("zplc start")
        results, problems = {}, []
        try:
            for output, wired in pairs:
                seen = {}
                for level in (0, 1):
                    out_bit = zplc_boards.parse_address(output["address"]).bit
                    self.tester.send(f"zplc dbg force set 0x{OPI:04x} {(level << out_bit):02x}", wait_for="OK:")
                    self.wait(0.1)
                    seen[level] = self.input_bits()
                in_bit = zplc_boards.parse_address(wired["address"]).bit
                follows = (seen[0] >> in_bit & 1) != (seen[1] >> in_bit & 1)
                others = (seen[0] ^ seen[1]) & ~(1 << in_bit) & 0x0F
                polarity = "inverted (active-low input)" if follows and seen[1] >> in_bit & 1 == 0 else "direct"
                results[output["id"]] = {"input": wired["id"], "inputs_off": seen[0], "inputs_on": seen[1], "follows": follows, "polarity": polarity}
                if not follows:
                    problems.append(f"{wired['id']} does not follow {output['id']}")
                if others:
                    problems.append(f"switching {output['id']} also moved input bits 0x{others:02x}")
        finally:
            self.stop_and_clear()
        self.measure(pairs=results)
        if problems:
            raise AssertionError("; ".join(problems))
        return f"{len(pairs)} outputs each move their own input and no other"

    def analog_read(self):
        """AI0 at 0 %, 50 % and 100 % of the potentiometer, within the tolerance of each point."""
        channel = next((c for c in self.board["io"]["channels"] if c["kind"] == "analog" and c["direction"] == "input"), None)
        if channel is None:
            raise AssertionError("the board's I/O description has no analog input")
        full = (channel.get("range") or {}).get("raw_max", 4095)
        address = zplc_boards.parse_address(channel["address"]).byte
        self.bench.confirm_wiring("analog")
        self.deploy_program("idle")
        self.tester.send("zplc start")
        points, problems = [], []
        try:
            for fraction, tolerance in ANALOG_POINTS:
                self.bench.set_analog(channel["id"], fraction)
                self.wait(0.3)
                raw = self.tester.peek(IPI + address, 2)
                value = raw[0] | raw[1] << 8 if len(raw) == 2 else None
                ok = value is not None and abs(value / full - fraction) <= tolerance
                points.append({"fraction": fraction, "raw": value, "full_scale": full, "tolerance": tolerance, "ok": ok})
                if not ok:
                    problems.append(f"{channel['id']} at {fraction:.0%} reads {value} of {full}")
        finally:
            self.stop_and_clear()
        self.measure(channel=channel["id"], points=points)
        if problems:
            raise AssertionError("; ".join(problems))
        return f"{channel['id']} reads {', '.join(str(p['raw']) for p in points)} of {full} at 0/50/100 %"

    def timer_accuracy(self):
        """A TON of 3 s, timed by the bench clock from RUN to the output it drives."""
        self.deploy_program("timer")
        interval = PROGRAMS["timer"][0]
        before = self.now()
        self.outputs()
        rtt = self.now() - before
        started = self.now()
        self.tester.send("zplc start")
        try:
            deadline = started + TIMER_PT_MS + 5000
            while self.now() < deadline and not self.outputs() & 1:
                self.wait(0.01)
            seen = self.now()
        finally:
            self.stop_and_clear()
        measured = seen - started
        lower, upper = TIMER_PT_MS - interval, TIMER_PT_MS + interval + TIMER_TOLERANCE_MS + 2 * rtt
        self.measure(expected_ms=TIMER_PT_MS, measured_ms=round(measured, 1), error_ms=round(measured - TIMER_PT_MS, 1), read_round_trip_ms=round(rtt, 1), lower_ms=lower, upper_ms=round(upper, 1))
        if not lower <= measured <= upper:
            raise AssertionError(f"TON T#{TIMER_PT_MS}ms took {measured:.0f} ms, outside {lower} to {upper:.0f} ms")
        return f"TON T#{TIMER_PT_MS}ms measured {measured:.0f} ms (error {measured - TIMER_PT_MS:+.0f} ms)"

    def scan_jitter(self):
        """The runtime's own measure of every scan over the run: each task's shortest and longest period, from the start
        of one scan to the start of the next (`zplc status --json`, tasks[]), and no deadline miss."""
        interval = PROGRAMS["idle"][0]
        self.deploy_program("idle")
        self.tester.send("zplc start")
        try:
            first = self.status()
            started = self.now()
            while self.now() - started < self.jitter_seconds * 1000:
                self.wait(min(JITTER_SAMPLE_S, self.jitter_seconds))
            last = self.status()
        finally:
            self.stop_and_clear()
        overruns = last.get("stats", {}).get("overruns", 0) - first.get("stats", {}).get("overruns", 0)
        misses = last.get("deadline", {}).get("misses", 0) - first.get("deadline", {}).get("misses", 0)
        tasks = [t for t in last.get("tasks", []) if t.get("cycles", 0) > 1]
        worst = max((abs(p - t["interval_us"]) / t["interval_us"] for t in tasks for p in (t["period_min_us"], t["period_max_us"])), default=None)
        self.measure(
            duration_s=self.jitter_seconds, interval_ms=interval, tasks=tasks, overruns=overruns, deadline_misses=misses,
            jitter_us=max((t["jitter_us"] for t in tasks), default=None),
            worst_period_deviation=None if worst is None else round(worst, 5), tolerance=JITTER_PERIOD_TOLERANCE,
            last_overrun_us=last.get("deadline", {}).get("last_overrun_us"),
            source="zplc status --json: tasks[].period_min_us, period_max_us, jitter_us (every scan since RUN), stats.overruns, deadline.misses",
        )
        problems = []
        if not tasks:
            problems.append("the image reports no scan periods (`zplc status --json` has no tasks[]): it predates the HIL-010 statistics")
        if overruns or misses:
            problems.append(f"{overruns} overruns and {misses} deadline misses")
        for t in tasks:
            if worst is not None and max(abs(t["period_min_us"] - t["interval_us"]), abs(t["period_max_us"] - t["interval_us"])) > JITTER_PERIOD_TOLERANCE * t["interval_us"]:
                problems.append(f"task {t['id']}: periods from {t['period_min_us']} to {t['period_max_us']} us, outside {JITTER_PERIOD_TOLERANCE:.0%} of {t['interval_us']} us")
        if problems:
            raise AssertionError("; ".join(problems))
        jitter = max(t["jitter_us"] for t in tasks)
        return f"{self.jitter_seconds} s: no overrun, no deadline miss, every scan period within {worst:.2%} of {interval} ms (jitter {jitter} us)"

    def _fault_leaves_outputs_off(self, program: str, reason: str, wait_s: float):
        self.deploy_program(program)
        self.tester.send("zplc start")
        try:
            self.wait(0.05)
            driven = self.outputs()
            self.wait(wait_s)
            status, after = self.status(), self.outputs()
        finally:
            self.stop_and_clear()
        fault = status.get("fault", {}).get("reason")
        self.measure(outputs_before=driven, outputs_after=after, state=status.get("state"), fault=fault, vm_error=status.get("vm", {}).get("error"))
        if fault != reason:
            raise AssertionError(f"the fault latched is {fault!r}, not {reason!r} (state {status.get('state')!r})")
        if after:
            raise AssertionError(f"the outputs are 0x{after:02x} after the {reason} fault, not off")
        return f"{reason} latched, outputs off (0x{after:02x})"

    def overrun_fault(self):
        return self._fault_leaves_outputs_off("overrun", "deadline_miss", 1.0)

    def fatal_fault(self):
        return self._fault_leaves_outputs_off("fault", "vm_fault", 1.0)

    def drop_link(self) -> None:
        """Lose the link as a person does: close the port and open it again. On a USB CDC ACM console (the Pico) DTR
        falls when the host closes the port, and the device ends the session at once (COM-020)."""
        transport = self.tester.ser
        if hasattr(transport, "drop_line"):  # a fake board of the tests
            transport.drop_line()
            return
        if getattr(transport, "kind", "") != "serial":
            raise Unsupported("this device has no port to close")
        self.reconnect()

    def forces_on(self) -> bool:
        return '"count":0' not in self.tester.send("zplc dbg force list --json").replace(" ", "")

    def stop_and_link_loss(self):
        """Outputs safe after a commanded STOP with forces active, and after the link is lost with forces active: the
        console's force belongs to a session (COM-020), which ends when the line falls or, on a console that reports no
        line, after the idle time; the outputs then follow the program, which holds them low."""
        self.deploy_program("hold")
        self.tester.send("zplc start")
        self.tester.send(f"zplc dbg force set 0x{OPI:04x} 0f", wait_for="OK:")
        self.wait(0.1)
        forced = self.outputs()
        self.tester.send("zplc stop", wait_for="OK:")
        self.wait(0.2)
        after_stop = self.outputs()
        self.tester.send("zplc dbg force clear_all")
        problems = [] if not after_stop else [f"outputs 0x{after_stop:02x} after STOP with forces active"]
        idle = ShellLink(self.tester).idle_seconds()
        self.tester.send("zplc start")
        self.tester.send(f"zplc dbg force set 0x{OPI:04x} 0f", wait_for="OK:")  # a lease of the link's session
        self.wait(0.1)
        forced_link = self.outputs()
        uptime_before = self.status().get("uptime_ms", 0)
        lost_at = self.now()
        self.drop_link()
        released_by, forces_left = "line", self.forces_on()
        if forces_left:  # a console that reports no line (the ESP32-S3 USB-Serial/JTAG): the idle time is the backstop
            self.wait(idle + 3)
            released_by, forces_left = "idle time", self.forces_on()
        released_ms = round(self.now() - lost_at)
        after_loss = self.outputs()
        uptime_after = self.status().get("uptime_ms", uptime_before)
        if uptime_after < uptime_before:
            released_by = "reset"  # the board restarted when its port was closed: STOP after a reset (RT-022)
        self.stop_and_clear()
        self.measure(
            forced_outputs=forced, outputs_after_stop=after_stop, session_idle_s=idle, forced_by_session=forced_link,
            released_by=released_by, released_within_ms=released_ms, outputs_after_link_loss=after_loss,
            forces_left=forces_left, uptime_before_ms=uptime_before, uptime_after_ms=uptime_after,
            link_loss="the port was closed and opened again; the device ends the session when DTR falls, else after the idle time",
        )
        if forced != 0x0F or forced_link != 0x0F:
            problems.append(f"the forces did not reach the outputs (0x{forced:02x}, 0x{forced_link:02x})")
        if forces_left or after_loss:
            problems.append(f"after the link was lost and {idle} s of silence the session's forces are still on (outputs 0x{after_loss:02x})")
        if problems:
            raise AssertionError("; ".join(problems))
        return f"outputs off after STOP and after the link was lost with forces active: released by the {released_by} within {released_ms} ms"

    def watchdog_reset_time(self):
        """A program that never ends its scan: the hardware watchdog resets the board into STOP, outputs off (RT-020)."""
        options = self.record["firmware"].get("build_options") or {}
        if options.get("HIL_IMAGE") != "y":
            watchdog = "with the hardware watchdog on" if options.get("HARDWARE_WATCHDOG") == "y" else "with the hardware watchdog off"
            raise AssertionError(f"the image under test is not the HIL image ({watchdog}): the record of RT-020 is made on the HIL image variant (CONFIG_ZPLC_HIL_IMAGE=y)")
        timeout = int(options.get("HARDWARE_WATCHDOG_TIMEOUT_MS") or self.board["watchdog"]["timeout_ms"])
        self.deploy_program("hang")
        started = self.now()
        self.tester.send("zplc start")
        self.wait(timeout / 1000 + 2)
        self.reconnect()
        status, reached = self.status(), self.now()
        reset_at = reached - status.get("uptime_ms", 0)
        measured = reset_at - started
        after = self.outputs()
        self.measure(timeout_ms=timeout, measured_ms=round(measured), reset_cause=status.get("reset_cause"), state=status.get("state"), outputs_after=after)
        problems = []
        if status.get("reset_cause") != "watchdog":
            problems.append(f"the reset cause is {status.get('reset_cause')!r}, not watchdog")
        if not timeout * 0.9 <= measured <= timeout + 500:
            problems.append(f"the reset came {measured:.0f} ms after RUN; the watchdog timeout is {timeout} ms")
        if status.get("state") == "running" or after:
            problems.append(f"after the reset the board is {status.get('state')!r} with outputs 0x{after:02x}")
        if problems:
            raise AssertionError("; ".join(problems))
        return f"reset by the watchdog {measured:.0f} ms after RUN (timeout {timeout} ms), back in STOP with outputs off"

    def power_cycle_retain(self):
        """After a power cycle the program is there, in STOP, and a RETAIN variable keeps its value (RT-022, RT-025)."""
        symbols = self.deploy_program("retain")
        address = symbols.get("scans")
        if address is None:
            raise AssertionError("the RETAIN program has no address for its variable")
        self.tester.send("zplc start")
        self.wait(1.0)
        self.tester.send("zplc stop", wait_for="OK:")  # STOP saves the retained values
        kept = self.dint(address)
        before = self.status().get("uptime_ms", 0)
        self.bench.power_cycle()
        self.reconnect()
        status = self.status()
        restored = self.dint(address)
        self.tester.send("zplc start")
        self.wait(0.5)
        runs = self.dint(address)
        self.stop_and_clear()
        self.measure(retain_before=kept, retain_after=restored, retain_after_run=runs, state=status.get("state"), reset_cause=status.get("reset_cause"), uptime_before_ms=before, uptime_after_ms=status.get("uptime_ms"))
        problems = []
        if status.get("uptime_ms", before) >= before:
            problems.append(f"the device did not restart: its uptime went on from {before} ms to {status.get('uptime_ms')} ms")
        if status.get("state") == "running":
            problems.append("the board came back running: RUN needs a person's command (RT-022)")
        if kept <= 0 or restored != kept:
            problems.append(f"RETAIN was {kept} before the power cycle and {restored} after")
        if runs <= restored:
            problems.append("the program did not run after the power cycle: it was not restored")
        if problems:
            raise AssertionError("; ".join(problems))
        return f"STOP after the power cycle, program restored, RETAIN kept ({kept})"

    def _upload_part(self, bytecode: list[int], fraction: float) -> int:
        """Send `fraction` of a program's chunks; return how many bytes went."""
        if "OK:" not in self.tester.send(f"zplc load {len(bytecode)}", wait_for="OK:"):
            raise AssertionError("the board did not accept `zplc load`")
        data = bytes(bytecode)
        chunks = [data[at : at + 16] for at in range(0, len(data), 16)]
        count = round(len(chunks) * fraction)
        for chunk in chunks[:count]:
            self.tester.send(f"zplc data {chunk.hex()}", wait_for="OK:")
        return sum(len(c) for c in chunks[:count])

    def deploy_interruptions(self):
        """20 power cuts during deploys, at points spread over the transfer: the program is always A or B whole."""
        program_a, _ = compile_program("deploy-a", self.board["ide_id"])
        program_b, _ = compile_program("deploy-b", self.board["ide_id"])
        whole = {0x05: "A", 0x0A: "B"}
        outcomes, problems = [], []
        for cut in range(1, DEPLOY_CUTS + 1):
            self.tester.upload_bytecode(program_a)
            sent = self._upload_part(program_b, cut / DEPLOY_CUTS)
            before = self.status().get("uptime_ms", 0)
            self.bench.cut_power_during_deploy(cut, DEPLOY_CUTS)
            self.reconnect()
            status = self.status()
            state, restarted = status.get("state"), status.get("uptime_ms", before) < before
            self.tester.send("zplc start")
            self.wait(0.3)
            outputs = self.outputs() & 0x0F
            self.stop_and_clear()
            found = whole.get(outputs)
            outcomes.append({"cut": cut, "bytes_sent": sent, "of": len(program_b), "restarted": restarted, "state_after": state, "outputs": outputs, "program": found})
            if found is None or state == "running":
                problems.append(f"cut {cut}: state {state!r}, outputs 0x{outputs:02x}: neither program A nor program B whole")
            if not restarted:
                problems.append(f"cut {cut}: the device did not restart, so the power was not cut")
        self.measure(cuts=outcomes, program_a_bytes=len(program_a), program_b_bytes=len(program_b))
        if problems:
            raise AssertionError("; ".join(problems[:5]))
        return f"{DEPLOY_CUTS} cuts: {sum(o['program'] == 'A' for o in outcomes)} kept A, {sum(o['program'] == 'B' for o in outcomes)} have B, none partial"

    def atomic_write(self):
        """A four-byte value written in one request is never seen half-written by the program (COM-019)."""
        symbols = self.deploy_program("atomic")
        x, torn = symbols.get("x", RESULT), symbols.get("torn", RESULT + 4)
        self.tester.send("zplc start")
        link = ShellLink(self.tester)
        try:
            link.open_session()
            for at in range(ATOMIC_WRITES):
                value = b"\xff\xff\xff\xff" if at % 2 == 0 else b"\x00\x00\x00\x00"
                link.request("MEM_WRITE", x.to_bytes(2, "little") + value)
            self.wait(0.1)
            last, seen = self.dint(x), self.dint(torn)
            link.request("SESSION_CLOSE")
        finally:
            self.stop_and_clear()
        self.measure(writes=ATOMIC_WRITES, torn_scans=seen, last_value=last)
        if seen:
            raise AssertionError(f"the program saw a half-written value in {seen} scans")
        if last != (0 if ATOMIC_WRITES % 2 == 0 else -1):
            raise AssertionError(f"the last write did not land: the value is {last}")
        return f"{ATOMIC_WRITES} four-byte writes, no scan saw a half-written value"

    def fieldbus_exchange(self):
        """Modbus RTU on the Pico; Modbus TCP and MQTT on the ESP32-S3; against local endpoints (COM-009, COM-012)."""
        if self.board.get("network_class") == "network-capable":
            return self._fieldbus_network()
        return self._fieldbus_rtu()

    def _read_results(self, symbols: dict[str, int], names: tuple[str, ...]) -> dict[str, int]:
        started = self.now()
        while True:
            found = {name: self.dint(symbols[name]) for name in names}
            if found.get("done", 0) > 0 and (len(names) < 4 or found.get("heard", 0) > 0) or self.now() - started > FIELDBUS_WAIT_S * 1000:
                return found
            self.wait(0.5)

    def _fieldbus_rtu(self):
        self.bench.confirm_wiring("modbus-rtu")
        port = getattr(self.args, "rtu_port", None) or getattr(self.bench, "rtu_port", None)
        if not port:
            raise AssertionError("the Modbus RTU exchange needs the host side of the line: --rtu-port names the USB-serial adapter")
        descriptor = _open_line(port)
        try:
            with hil_endpoints.RtuServer(descriptor, registers={100: RTU_VALUE}) as server:
                symbols = self.deploy_program("modbus-rtu")
                self.tester.send("zplc start")
                found = self._read_results(symbols, ("got", "done", "err"))
                self.stop_and_clear()
        finally:
            os.close(descriptor)
        self.measure(protocol="modbus-rtu", requests_seen=len(server.requests), **found)
        if found["got"] != RTU_VALUE or found["err"]:
            raise AssertionError(f"Modbus RTU read {found['got']} (error {found['err']}), the server holds {RTU_VALUE}")
        return f"Modbus RTU: holding register 100 read as 0x{RTU_VALUE:04X} from the host server"

    def _fieldbus_network(self):
        self.bench.confirm_wiring("network")
        binary = getattr(self.args, "loopback_bin", None) or str(Path(os.environ.get("ZPLC_NATIVE_SIM_BIN", "zplc_runtime")).with_name("zplc_loopback"))
        endpoints = hil_endpoints.Loopback(binary)
        modbus = hil_endpoints.Forwarder(endpoints.ports["modbus"])
        mqtt = hil_endpoints.Forwarder(endpoints.ports["mqtt"])
        host = getattr(self.args, "host_ip", None) or hil_endpoints.lan_address()
        try:
            for line in (f"zplc config set mqtt_broker {host}", f"zplc config set mqtt_port {mqtt.port}", "zplc config set mqtt_enabled 1", "zplc config save"):
                self.tester.send(line)
            self.reconnect()
            symbols = self.deploy_program("modbus-tcp-mqtt", host=host, modbus_port=modbus.port, mqtt_port=mqtt.port)
            self.tester.send("zplc start")
            found = self._read_results(symbols, ("got", "done", "err", "heard"))
            self.stop_and_clear()
        finally:
            modbus.close()
            mqtt.close()
            endpoints.close()
        self.measure(protocol="modbus-tcp+mqtt", host=host, modbus_port=modbus.port, mqtt_port=mqtt.port, **found)
        if found["got"] != RTU_VALUE or found["err"] or found["heard"] <= 0:
            raise AssertionError(f"Modbus TCP read {found['got']} (error {found['err']}); MQTT messages heard back: {found['heard']}")
        return f"Modbus TCP write and read back 0x{RTU_VALUE:04X}; MQTT publish heard back {found['heard']} times"

    STEPS = [
        ("digital-loopback", "Digital loopback", "digital_loopback", "IO-009"),
        ("analog-read", "Analog read at 0, 50 and 100 %", "analog_read", "IO-009"),
        ("timer-accuracy", "Timer accuracy", "timer_accuracy", "HIL-010"),
        ("scan-jitter-10min", "Scan jitter over ten minutes", "scan_jitter", "HIL-010"),
        ("overrun-fault-outputs-off", "Outputs off after an overrun fault", "overrun_fault", "RT-019"),
        ("stop-and-link-loss-safe", "Outputs safe after STOP and after loss of the link with forces active", "stop_and_link_loss", "COM-020"),
        ("watchdog-reset-time", "Watchdog reset time", "watchdog_reset_time", "RT-020"),
        ("fatal-fault-outputs-off", "Outputs off after a forced fatal fault", "fatal_fault", "RT-019"),
        ("power-cycle-retain", "STOP, program and RETAIN restored after a power cycle", "power_cycle_retain", "RT-022"),
        ("deploy-power-interruption-x20", "No partial program after 20 power interruptions during deploy", "deploy_interruptions", "RT-023"),
        ("atomic-write", "Atomic multi-byte write", "atomic_write", "COM-019"),
        ("fieldbus-exchange", "One fieldbus exchange per board", "fieldbus_exchange", "COM-012"),
    ]


def _open_line(port: str) -> int:
    """The host side of the RTU line as a raw descriptor: a pty in a test, the USB-serial adapter on the bench."""
    import termios  # noqa: PLC0415

    descriptor = os.open(port, os.O_RDWR | os.O_NOCTTY)
    attributes = termios.tcgetattr(descriptor)
    attributes[0] = attributes[1] = attributes[3] = 0  # raw: no input, output or local processing
    attributes[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
    attributes[4] = attributes[5] = termios.B115200
    termios.tcsetattr(descriptor, termios.TCSANOW, attributes)
    return descriptor
