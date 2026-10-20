#!/usr/bin/env python3
"""One command per board runs the whole hardware chain, and prompts the person for each physical step (HIL-012).

    python3 tools/hil/run_chain.py rpi_pico [--bench human|emulated] [--port PORT] [--firmware-image zephyr.uf2] [--out DIR]

The chain: preflight (host checks, every fixture compiles) -> flash (the bench flashes: a person, or the emulator) ->
identity handshake -> the person confirms what the device reports -> the person confirms the outputs are safe to drive
-> deploy -> run -> the language fixtures -> force set and release -> stop -> the measuring steps of HIL-010 (digital
loopback, analog read, timer accuracy, ten minutes of scan jitter, outputs off after an overrun and after a fatal
fault, outputs safe after STOP and after link loss with forces active, watchdog reset time, a power cycle with RETAIN,
20 power cuts during deploys, an atomic write and one fieldbus exchange; tools/hil/hil_steps.py). Each writes its
measurements and verdict into the run record (HIL-009). The chain says how long it takes before it starts: about 31
minutes on a person's bench (HIL-012), most of it the ten minutes of jitter, which run alone, and the 20 power cuts.

The bench (tools/hil/bench.py, the HIL contract) is a person at a real board (`--bench human`, the default: every
physical step is a prompt under the guard of HIL-003, and the record is `hardware` evidence) or an emulator
(`--bench emulated`, from tools/hil/emulator/ when it is installed: no terminal needed, and the record is always
`emulated`, which never raises a support level). Programs are always compiled for the board (`target.board`).

The image under test is the HIL image: the manifest's build command with CONFIG_ZPLC_HIL_IMAGE=y, the variant that turns
the hardware watchdog on before its record exists and says so in `zplc version` and its build options, because RT-020
asks for the record to be made with the watchdog on (`--no-watchdog-build` prints the plain command, and then
the watchdog step fails and says why).

The board's I/O description comes from firmware/app/boards/boards.json, the one manifest: the handshake compares it
with what the image reports (`zplc sys io`, IO-004), and the pending loopback and analog items name its channels. A
run on real hardware that ends in pass or fail, of an image named by --firmware-image, also writes the flat evidence
record the manifest derives a support level from; adding it to `evidence_refs` stays a person's edit.

This is a command for a person: it exits with an error when it has no interactive terminal, and AI tools and MCP
do not start it (HIL-003). `--dry-run` is the one way to run it without a person, and it can only use a fake
device (`--device host` is the native runtime of this tree and the default, `--device null` shows nothing): it asks
nobody, touches no serial port and writes a record whose evidence is `host-runtime` or `fake`, never `hardware`.
`--device` without `--dry-run` rehearses the procedure with a person asked at each step.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import bench as benches
import hil_guard
import hil_record
import hil_steps
from hil_devices import DeviceError, SerialTransport, open_fake
from hil_ports import PortError
from language_tester import LanguageTester, fixtures_of
from zplc_tester import CompileError, UploadError

# the board manifest's library (description hash, image extent): one description of a board, not a copy of it here
sys.path.append(str(Path(__file__).resolve().parents[2] / "firmware" / "zephyr" / "scripts"))
import zplc_boards  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "firmware/app/boards/boards.json"
HIL_OVERLAY = Path(__file__).resolve().with_name("hil_debug.conf")
DEFAULT_OUT = ROOT / "build" / "hil-records"


def _channels(board: dict, kind: str, direction: str | None = None) -> str:
    found = [
        f"{c['id']} ({c['pin']})" if c.get("pin") else c["id"]
        for c in (board.get("io") or {}).get("channels", [])
        if c["kind"] == kind and (direction is None or c["direction"] == direction)
    ]
    return ", ".join(found) or "none"


def not_selected(board: dict, step_id: str) -> str:
    """Why a measuring step did not run in this run: a stand-in run runs them only when --steps names them."""
    reason = "not run: a dry run, or a run on a fake device or the host runtime, runs the bench steps only when --steps names them"
    if step_id == "digital-loopback":
        return f"{reason}; on the bench it switches digital outputs {_channels(board, 'digital', 'output')} and reads digital inputs {_channels(board, 'digital', 'input')}"
    if step_id == "analog-read":
        return f"{reason}; on the bench it reads analog inputs {_channels(board, 'analog')}"
    return reason


def parse(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("board", help="ide_id or board_id of the board in firmware/app/boards/boards.json")
    parser.add_argument("--port", help="serial port; else ZPLC_SERIAL_PORT, else found from the USB identifiers of the board")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="directory for the run record (default: build/hil-records)")
    parser.add_argument("--operator", help="who is at the bench; asked for when not given")
    parser.add_argument("--firmware-image", help="the image that was flashed; its SHA-256 goes in the record")
    parser.add_argument("--only", help="comma-separated fixture ids to run instead of the blink fixtures of the five languages")
    parser.add_argument("--all-fixtures", action="store_true", help="run every fixture tagged for hardware (HIL-005), about seven more minutes, instead of the five-language blinks")
    parser.add_argument("--hil-trace", action="store_true", help="the image under test is built with the HIL trace overlay (tools/hil/hil_debug.conf), for the opcode-level scripts; release firmware has no trace")
    parser.add_argument("--dry-run", action="store_true", help="run on a fake device with nobody asked; the record says so")
    parser.add_argument("--bench", choices=("human", "emulated"), default="human", help="a person at a real board (default) or the emulator of tools/hil/emulator")
    parser.add_argument("--steps", help=f"comma-separated HIL-010 measuring steps to run instead of all of them ({', '.join(s[0] for s in hil_steps.BenchSteps.STEPS)}); a run on a fake device runs none unless named")
    parser.add_argument("--no-watchdog-build", action="store_true", help="print the manifest's plain build command; the watchdog step then fails, saying the image has no watchdog")
    parser.add_argument("--rtu-port", help="the host side of the Modbus RTU line of the Pico: the USB-serial adapter wired to UART1")
    parser.add_argument("--host-ip", help="the address of this computer that the ESP32-S3 reaches over Wi-Fi (default: found from the default route)")
    parser.add_argument("--loopback-bin", help="the zplc_loopback binary of this tree (default: beside ZPLC_NATIVE_SIM_BIN)")
    parser.add_argument(
        "--device", choices=("host", "null"),
        help="use a fake device instead of a serial port (host: the native runtime of this tree, null: shows nothing). "
        "With --dry-run nobody is asked; without it a person is, as a rehearsal. The record says it is not hardware.",
    )
    return parser.parse_args(argv)


WATCHDOG_OPTION = "-DCONFIG_ZPLC_HIL_IMAGE=y"  # the HIL image variant: the watchdog on, never shipped (RT-020)
# HIL-010: blink in each of the five languages (two in ST: the master blinky and the generated Ladder blinky)
BLINK_FIXTURES = ["st.master_blinky", "st.blinky_ld_gen", "il.blinky", "ld.blinky", "fbd.blinky", "sfc.blinky"]


def build_command(board: dict, with_trace: bool, watchdog: bool = False) -> str:
    """The command that builds the image under test, from the repository root: the manifest's, with the HIL trace overlay
    when asked, and with the hardware watchdog on for the HIL build (RT-020)."""
    options = [f"-DEXTRA_CONF_FILE={HIL_OVERLAY}"] * with_trace + [WATCHDOG_OPTION] * watchdog
    return f"{board['build_command']} -- {' '.join(options)}" if options else board["build_command"]


def board_io(board: dict) -> dict | None:
    """What boards.json says the board has: the hash of its description, the channel counts and the image bytes (IO-004, IO-005)."""
    if not (board.get("io") or {}).get("channels"):
        return None
    channels = board["io"]["channels"]

    def count(kind: str, direction: str) -> int:
        return sum(1 for c in channels if c["kind"] == kind and c["direction"] == direction)

    input_bytes, output_bytes = zplc_boards.image_extent(board)
    return {
        "hash": zplc_boards.description_hash(board),
        "channels": len(channels),
        "digital_inputs": count("digital", "input"),
        "digital_outputs": count("digital", "output"),
        "analog_inputs": count("analog", "input"),
        "analog_outputs": count("analog", "output"),
        "input_bytes": input_bytes,
        "output_bytes": output_bytes,
    }


def find_board(name: str) -> dict:
    boards = json.loads(MANIFEST.read_text())
    for board in boards:
        if name in (board["ide_id"], board["board_id"]):
            return board
    raise KeyError(f"{name}: not a board of the manifest ({', '.join(b['ide_id'] for b in boards)})")


class Chain(hil_steps.BenchSteps):
    def __init__(self, args, io, board, opener=open_fake, bench=None):
        self.args, self.io, self.board, self.opener = args, io, board, opener
        self.build_command = build_command(board, args.hil_trace, watchdog=not args.no_watchdog_build)
        self.dry = args.dry_run
        self.bench = bench or benches.StandInBench("a dry run")
        self.description = board_io(board)
        emulated = getattr(self.bench, "level", None) == "emulated"
        self.record = hil_record.new_record(
            "chain", "emulated" if emulated else "hardware",
            {"id": board["ide_id"], "zephyr_board": board.get("zephyr_board"), "board_id": board.get("board_id"), "io": self.description},
            args.operator or "unknown", emulator=getattr(self.bench, "emulator", None) if emulated else None,
        )
        self.tester: LanguageTester | None = None
        self.compiled: dict[str, list[int]] = {}
        self.programs: dict[str, int] = {}
        self.stop = False
        self.port_wait_s, self.clock, self.sleep = 30.0, time.monotonic, time.sleep

    # steps -----------------------------------------------------------------------------------------
    def step(self, step_id, title, kind, function, requirement=None):
        entry = {"id": step_id, "title": title, "kind": kind, "result": "pass", "started_at": hil_record.now()}
        if requirement:
            entry["requirement"] = requirement
        self.record["steps"].append(entry)
        if self.stop:
            entry["result"], entry["detail"] = "skipped", "an earlier step failed"
            return
        try:
            detail = function()
            if detail:
                entry["detail"] = str(detail)
        except benches.Unsupported as error:
            entry["result"] = "not-emulable" if self.record["evidence_level"] == "emulated" else "skipped"
            entry["detail"] = f"not run: {error}"
        except (hil_guard.IdentityMismatch, hil_guard.NotInteractive) as error:
            entry["result"], entry["detail"], self.stop = "fail", str(error), True
        except AssertionError as error:
            entry["result"], entry["detail"], self.stop = "fail", str(error), True
        except (DeviceError, PortError, CompileError, UploadError, OSError, RuntimeError) as error:
            entry["result"], entry["detail"], self.stop = "error", f"{type(error).__name__}: {error}", True
        confirmation = getattr(self.bench, "last_confirmation", None)
        if confirmation:  # a person confirmed a bench action of this step by typing the board's identity
            entry.update(confirmation)
            self.bench.last_confirmation = None
        entry["ended_at"] = hil_record.now()

    def physical(self, step_id, title, instruction, requirement=None, wait_first=False):
        def confirm():
            if self.dry:
                return "dry run: confirmation not asked of anyone"
            if self.record["evidence_level"] == "emulated":
                self.record["steps"][-1]["result"] = "skipped"
                return "an emulated bench has no person to confirm it"
            identity = self.tester.identity().get("board", "") if self.tester else ""
            if not identity:
                raise AssertionError("the device did not report who it is, so the step cannot be confirmed")
            confirmation = hil_guard.confirm_physical(self.io, {"id": step_id, "title": title, "instruction": instruction}, identity, wait_first=wait_first)
            self.record["steps"][-1].update(confirmation)
            return None

        self.step(step_id, title, "physical", confirm, requirement)

    # the chain -------------------------------------------------------------------------------------
    def fixtures(self):
        ids = self.args.only.split(",") if self.args.only else None if self.args.all_fixtures else BLINK_FIXTURES
        listed = fixtures_of(ids=ids, hardware=True if not self.args.only else None)
        if not listed:
            raise AssertionError("no fixture is selected")
        return listed

    def preflight(self):
        fixtures = self.fixtures()
        limit = self.board.get("memory", {}).get("code_size_max")
        for fixture in fixtures:  # for the board's memory, as the step programs are: a single-file compile assumes 8 KB
            self.compiled[fixture["id"]] = hil_steps.compile_file(Path(__file__).resolve().parent / fixture["source"], self.board["ide_id"])
        too_big = [f["id"] for f in fixtures if limit and len(self.compiled[f["id"]]) > limit]
        return f"{len(fixtures)} fixtures compile; {len(too_big)} exceed the {limit} bytes of this board and are skipped: {', '.join(too_big) or 'none'}"

    def _open_serial(self):
        """The port of a board that was just flashed appears late and under a new name: look it up again until it is there."""
        deadline = self.clock() + self.port_wait_s
        while True:
            try:
                return SerialTransport(self.bench.port())
            except (PortError, DeviceError, OSError):
                if self.clock() >= deadline:
                    raise
                self.sleep(1)

    def open_device(self):
        fake = self.args.device or ("host" if self.dry else None)
        if fake:
            transport = self.opener(fake)
        else:
            transport = self._open_serial()
        self.tester = LanguageTester(transport=transport, board=self.board["ide_id"])
        # an emulator whose board clock runs behind the host's gives a program that much more host time to run
        self.tester.pace *= getattr(self.bench, "pace", 1.0)
        if transport.kind == "serial":
            import time  # noqa: PLC0415

            time.sleep(1)  # the board resets when the port opens
        link = transport.kind if transport.kind in ("serial", "host-runtime") else "fake"
        emulated = getattr(self.bench, "level", None) == "emulated"
        self.record["evidence"] = ("emulated" if emulated else "hardware") if link == "serial" else link
        self.record["evidence_level"] = self.record["evidence"] if link == "serial" else None
        if self.record["evidence_level"] != "emulated":
            self.record.pop("emulator", None)
        self.record["device"]["link"] = link

    def handshake(self):
        info = self.tester.identity()
        if not info.get("board"):
            raise AssertionError("the device did not answer `zplc sys info --json` with a board")
        self.record["device"].update({k: info.get(k) for k in ("board_profile", "zplc_version", "zephyr_version")})
        self.record["device"]["reported_board"] = info["board"]
        self.bench.identity = info["board"]
        build = self.tester.build_identity()
        self.record["firmware"] = {k: v for k, v in hil_record.firmware_identity(build).items() if v is not None}
        self.record["firmware"]["build_command"] = self.build_command
        if self.args.firmware_image:
            self.record["firmware"]["image_sha256"] = hil_record.sha256_hex(Path(self.args.firmware_image).read_bytes())
        if not build:
            return f"the device reports {info['board']}; it reports no build identity (zplc sys build), so the record has no commit"
        image = "the HIL image" if (self.record["firmware"].get("build_options") or {}).get("HIL_IMAGE") == "y" else "not the HIL image"
        return f"the device reports {info['board']}, built from {build['commit']}, options {build['options_hash']} ({image})"

    def io_step(self):
        """The image's I/O description is the one boards.json has for this board (IO-004); an image that reports none is skipped, not passed."""
        found = self.tester.io_identity()
        if not found:
            self.record["steps"][-1]["result"] = "skipped"
            return "the image reports no I/O description (`zplc sys io`): it predates IO-004, so its channels were not compared"
        self.record["device"]["io"] = found
        if self.description is None:
            self.record["steps"][-1]["result"] = "skipped"
            return f"the image reports {found['board_id']}, hash {found['hash']}; boards.json has no I/O description for this board to compare it with"
        differences = []
        if found["board_id"] != self.board["board_id"]:
            differences.append(f"the image reports board {found['board_id']}, this run is for {self.board['board_id']}")
        for key in ("hash", "channels", "input_bytes", "output_bytes"):
            if found[key] != self.description[key]:
                differences.append(f"{key}: the image reports {found[key]}, boards.json has {self.description[key]}")
        if differences:
            raise AssertionError("the image was not built from the I/O description of boards.json for this board: " + "; ".join(differences))
        return f"the image's I/O description is the one of boards.json: {found['channels']} channels, hash {found['hash']}"

    def trace_step(self):
        """Say whether the image has the HIL trace on, from its own options, and require it to be what this run asked for."""
        on = self.record["firmware"].get("hil_trace")
        asked = self.args.hil_trace
        if on is None:
            self.record["steps"][-1]["result"] = "skipped"
            return "the image's options do not say whether the HIL trace is on" + ("" if not asked else "; the opcode-level scripts will say it themselves")
        if on != asked:
            raise AssertionError(
                "the image has the HIL trace on and this run did not ask for it: release firmware carries none (HIL-013)" if on
                else "this run asked for the HIL trace, and the image was not built with the overlay"
            )
        return f"the image's HIL trace is {'on' if on else 'off'}, as asked"

    def deploy(self):
        first = self.fixtures()[0]["id"]
        self.tester.upload_bytecode(self.compiled[first])
        # `zplc status --json` has no program size to check: upload_bytecode fails on a refused upload, and the run step proves the scan advances
        return f"{first}: {len(self.compiled[first])} bytes"

    def run_step(self):
        self.tester.send("zplc start")
        before = self.tester.scan_count()
        self.tester.sleep(0.5)
        after = self.tester.scan_count()
        if before is None or after is None or after <= before:
            raise AssertionError(f"the scan counter does not advance (before {before}, after {after})")
        return f"{after - before} scans in half a second"

    def fixture_step(self):
        limit = self.board.get("memory", {}).get("code_size_max")
        failed = 0
        for fixture in self.fixtures():
            size = len(self.compiled.get(fixture["id"], []))
            if limit and size > limit:
                self.record["tests"].append({"id": fixture["id"], "title": fixture["title"], "result": "skipped", "detail": f"{size} bytes exceed the {limit} of this board"})
                continue
            try:
                problems = self.tester.run_fixture(fixture, bytecode=self.compiled.get(fixture["id"]))
            except (RuntimeError, DeviceError, UploadError, CompileError) as error:
                problems = [f"{type(error).__name__}: {error}"]
            failed += bool(problems)
            self.record["tests"].append({"id": fixture["id"], "title": fixture["title"], "result": "fail" if problems else "pass", "detail": "; ".join(problems)[:500]})
        if failed:
            raise AssertionError(f"{failed} fixtures failed")

    def force_step(self):
        self.tester.send("zplc dbg force clear_all")
        self.tester.send("zplc dbg force set 0x0 01", wait_for="OK:")
        listed = self.tester.send("zplc dbg force list --json")
        if '"count":1' not in listed.replace(" ", ""):
            raise AssertionError(f"a force that was set is not listed: {listed.strip()[-120:]}")
        self.tester.send("zplc dbg force clear_all", wait_for="OK:")
        after = self.tester.send("zplc dbg force list --json")
        if '"count":0' not in after.replace(" ", ""):
            raise AssertionError(f"a force that was released is still listed: {after.strip()[-120:]}")

    def stop_step(self):
        self.tester.send("zplc stop", wait_for="OK:")
        self.tester.settle(0.2)
        status = self.tester.send("zplc status --json").replace(" ", "")
        if '"state":"running"' in status:
            raise AssertionError("the device still reports running after STOP")
        outputs = self.tester.peek(0x1000, 8)
        if len(outputs) < 8 or any(outputs):
            raise AssertionError(f"the output image is not zero after STOP: {outputs}")

    def release(self):
        """Always, and last: no force of this run outlives it and the board is left stopped."""
        if self.tester is None:
            return
        for command in ("zplc dbg force clear_all", "zplc stop"):
            try:
                self.tester.send(command, wait_for="OK:", timeout=3.0)
            except Exception:  # the link may be gone; the device releases forces by itself then (COM-020)
                pass

    def selected_steps(self) -> set[str]:
        """Every measuring step on a bench; on a fake device or the host runtime only those --steps names."""
        if self.args.steps:
            return set(self.args.steps.split(","))
        return {s[0] for s in self.STEPS} if self.record["device"].get("link") == "serial" and not self.dry else set()

    def estimate_seconds(self) -> int:
        """How long the chain takes on this bench (HIL-012): the cost of each step, the ten minutes of jitter alone."""
        try:
            fixtures = len(self.fixtures())
        except AssertionError:  # no fixture selected: the preflight says so
            fixtures = 0
        steps = [s[0] for s in self.STEPS if not self.args.steps or s[0] in self.args.steps.split(",")]
        fixed = [k for k in hil_steps.STEP_SECONDS if k not in {s[0] for s in self.STEPS}]
        return sum(hil_steps.STEP_SECONDS[k] for k in fixed + steps) + fixtures * hil_steps.FIXTURE_SECONDS

    def run(self) -> int:
        self.started, self.estimate = time.monotonic(), self.estimate_seconds()
        if not self.dry:
            jitter = not self.args.steps or "scan-jitter-10min" in self.args.steps.split(",")
            self.io.say(
                f"The chain for {self.board['display_name']} takes about {round(self.estimate / 60)} minutes on this bench "
                f"(the target is about {hil_steps.TARGET_SECONDS // 60})"
                + ("; ten of them are the scan jitter step, which runs alone." if jitter else ".")
            )
        self.step("preflight", "Host checks: the fixtures compile and the board is known", "automatic", self.preflight, "HIL-005")
        # the flash is the person's, and comes first: a blank board has no port, and a flashed one re-enumerates
        self.step("flash", "A person flashes the firmware image", "physical", self.flash_prompt, "HIL-010")
        self.step("open", "Open the device link", "automatic", self.open_device, "HIL-007")
        self.step("handshake", "Identity handshake", "automatic", self.handshake, "HIL-010")
        self.step("io-description", "The image's I/O description is the one of boards.json", "automatic", self.io_step, "IO-004")
        self.step("trace-option", "The image's HIL trace option is what the run asked for", "automatic", self.trace_step, "HIL-013")
        self.physical("confirm-identity", "Confirm the board", "Check that this is the board you flashed and that it is connected to the port named above.", "HIL-003")
        self.physical("safe-to-drive", "Outputs are safe to drive", "Nothing connected to the outputs can hurt anyone or damage equipment when it is switched on and off.", "HIL-003")
        self.step("deploy", "Deploy a program", "automatic", self.deploy, "HIL-010")
        self.step("run", "Run it and watch the scan counter", "automatic", self.run_step, "HIL-010")
        self.step("fixtures", "Run the language fixtures", "automatic", self.fixture_step, "HIL-005")
        self.step("force", "Force set and release", "automatic", self.force_step, "HIL-010")
        self.step("stop", "Stop: not running, outputs off", "automatic", self.stop_step, "HIL-010")
        selected = self.selected_steps()
        for step_id, title, method, requirement in self.STEPS:
            if step_id in selected:
                self.step(step_id, title, "automatic", getattr(self, method), requirement)
            else:
                self.record["steps"].append({"id": step_id, "title": title, "kind": "automatic", "result": "skipped", "requirement": requirement, "detail": not_selected(self.board, step_id)})
        self.release()
        self.record["coverage"] = {
            "requirement": "HIL-010",
            "done": [s["id"] for s in self.record["steps"] if s["result"] == "pass"],
            "pending": [s["id"] for s in self.record["steps"] if s["result"] in ("pending", "skipped", "not-emulable")],
        }
        self.record.setdefault("measurements", {})["duration"] = {
            "target_s": hil_steps.TARGET_SECONDS, "estimated_s": self.estimate, "actual_s": round(time.monotonic() - self.started),
        }
        if self.tester is not None:
            text = "\n".join(f"{direction}> {line}" for direction, line in self.tester.log)
            self.record["logs"].append({"name": "shell", "text": text[-200_000:]})
            self.tester.close()
        self.record["ended_at"] = hil_record.now()
        self.record["result"] = hil_record.summarize(self.record)
        return 0 if self.record["result"] == "pass" else 1

    def flash_prompt(self):
        if self.dry:
            return f"dry run: nobody flashes anything; build command: {self.build_command}"
        self.bench.build_command = self.build_command
        image = Path(self.args.firmware_image) if self.args.firmware_image else None
        self.bench.flash(image)
        return f"{'emulated: the image is loaded into the emulator' if self.record['evidence_level'] == 'emulated' else 'flashed by a person'}; build command: {self.build_command}"


def evidence_hint(record: dict, board_id: str) -> str:
    """What a person may do with the evidence record: only a hardware record is ever added to evidence_refs (HIL-009)."""
    if record.get("evidence_level") == "hardware":
        return f"a person adds it to evidence_refs of {board_id} in boards.json after reading the run record"
    return f"{record.get('evidence_level') or record.get('evidence')} evidence: never added to evidence_refs, it never raises a support level"


def run(args, io, stdout=None, opener=open_fake, bench=None) -> int:
    out = stdout or sys.stdout
    try:
        board = find_board(args.board)
    except KeyError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    if bench is None and not args.dry_run:
        try:
            if args.bench == "emulated":
                bench = benches.load_emulator_bench(board)
            else:
                hil_guard.require_interactive(io, "the hardware chain")
                bench = benches.HumanBench(io, board, args.port)
        except (hil_guard.NotInteractive, benches.BenchMissing) as error:
            print(f"error: {error}", file=sys.stderr)
            return 2
    if not args.operator:
        if getattr(bench, "level", None) == "hardware":
            args.operator = io.ask("Operator name for the record: ").strip() or "unknown"
        else:
            args.operator = os.environ.get("USER") or os.environ.get("USERNAME") or "dry-run"
    chain = Chain(args, io, board, opener, bench)
    code = chain.run()
    chain.record["operator"] = {"name": args.operator}
    stem = hil_record.record_stem(chain.record)
    summary, reason = hil_record.evidence_summary(chain.record, f"{stem}.json")
    chain.record["logs"].append({"name": "evidence-record", "text": f"written: {stem}.evidence.json" if summary else f"not written: {reason}"})
    try:
        path = hil_record.write_record(chain.record, args.out)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(f"{chain.record['result'].upper()}: {path}", file=out)
    if summary:
        evidence_path = path.with_name(f"{stem}.evidence.json")
        evidence_path.write_text(json.dumps(summary, indent=2) + "\n")
        print(f"EVIDENCE: {evidence_path} ({evidence_hint(chain.record, board['board_id'])})", file=out)
    else:
        print(f"no evidence record: {reason}", file=out)
    return code


def main(argv=None, io=None, stdout=None, opener=open_fake, bench=None) -> int:
    args = parse(argv)
    return run(args, io or hil_guard.TerminalIo(), stdout, opener, bench)


if __name__ == "__main__":
    sys.exit(main())
