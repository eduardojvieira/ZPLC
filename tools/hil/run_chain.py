#!/usr/bin/env python3
"""One command per board runs the whole hardware chain, and prompts the person for each physical step (HIL-012).

    python3 tools/hil/run_chain.py rpi_pico [--port PORT] [--firmware-image build/zephyr/zephyr.uf2] [--out DIR]

The chain: preflight (host checks, every fixture compiles) -> flash (a person flashes) -> identity handshake ->
the person confirms what the device reports -> the person confirms the outputs are safe to drive -> deploy -> run ->
the language fixtures -> force set and release -> stop. A run record is written for it (HIL-009), and the steps of
HIL-010 that the tools cannot run yet are listed in the record as pending, with what each lacks, not left out.

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
from pathlib import Path

import hil_guard
import hil_record
from hil_devices import DeviceError, SerialTransport, open_fake
from hil_ports import PortError, resolve_port
from language_tester import LanguageTester, fixtures_of
from zplc_tester import CompileError, UploadError

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "firmware/app/boards/supported-boards.v1.5.0.json"
DEFAULT_OUT = ROOT / "build" / "hil-records"

# What HIL-010 asks for that the chain does not run yet, and what each needs. The record carries this list.
PENDING = [
    ("blink-il", "Blink in IL", "no IL blink fixture exists yet (LD, FBD, SFC and ST ones do)"),
    ("digital-loopback", "Digital loopback", "needs the board's I/O description (IO-001) and a wiring step: TO BE FILLED from the bench run"),
    ("analog-read", "Analog read", "needs the I/O description and a known voltage on the analog input: TO BE FILLED from the bench run"),
    ("timer-accuracy", "Timer accuracy", "needs a measurement fixture and a reference clock the person provides"),
    ("scan-jitter-10min", "Scan jitter over ten minutes", "needs device-side scan timing (RT-0xx) the shell does not report"),
    ("overrun-fault-outputs-off", "Outputs off after an overrun fault", "needs a fault-injection fixture and RT-019"),
    ("stop-and-link-loss-safe", "Outputs safe after STOP and after loss of the link with forces active", "needs the device session of COM-020 and an unplug step"),
    ("watchdog-reset-time", "Watchdog reset time", "needs a firmware image with the watchdog enabled (RT-020)"),
    ("fatal-fault-outputs-off", "Outputs off after a forced fatal fault", "needs a fault-injection fixture"),
    ("power-cycle-retain", "STOP and RETAIN restored after a power cycle", "needs a RETAIN fixture and a power-cycle step"),
    ("deploy-power-interruption-x20", "No partial program after 20 power interruptions during deploy", "needs a power-interruption step repeated 20 times"),
    ("atomic-write", "Atomic multi-byte write", "needs the atomic write of the framed protocol (COM-019) on the device"),
    ("fieldbus-exchange", "One fieldbus exchange per board", "test_modbus_rtu_serial.py and test_modbus_tcp.py exist; they need a local endpoint the person provides"),
]


def parse(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("board", help="ide_id or board_id of the board in firmware/app/boards/supported-boards.v1.5.0.json")
    parser.add_argument("--port", help="serial port; else ZPLC_SERIAL_PORT, else found from the USB identifiers of the board")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="directory for the run record (default: build/hil-records)")
    parser.add_argument("--operator", help="who is at the bench; asked for when not given")
    parser.add_argument("--firmware-image", help="the image that was flashed; its SHA-256 goes in the record")
    parser.add_argument("--only", help="comma-separated fixture ids to run instead of every hardware fixture")
    parser.add_argument("--dry-run", action="store_true", help="run on a fake device with nobody asked; the record says so")
    parser.add_argument(
        "--device", choices=("host", "null"),
        help="use a fake device instead of a serial port (host: the native runtime of this tree, null: shows nothing). "
        "With --dry-run nobody is asked; without it a person is, as a rehearsal. The record says it is not hardware.",
    )
    return parser.parse_args(argv)


def find_board(name: str) -> dict:
    boards = json.loads(MANIFEST.read_text())
    for board in boards:
        if name in (board["ide_id"], board["board_id"]):
            return board
    raise KeyError(f"{name}: not a board of the manifest ({', '.join(b['ide_id'] for b in boards)})")


class Chain:
    def __init__(self, args, io, board):
        self.args, self.io, self.board = args, io, board
        self.dry = args.dry_run
        self.record = hil_record.new_record("chain", "hardware", {"id": board["ide_id"], "zephyr_board": board.get("zephyr_board")}, args.operator or "unknown")
        self.tester: LanguageTester | None = None
        self.compiled: dict[str, list[int]] = {}
        self.stop = False

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
        except (hil_guard.IdentityMismatch, hil_guard.NotInteractive) as error:
            entry["result"], entry["detail"], self.stop = "fail", str(error), True
        except AssertionError as error:
            entry["result"], entry["detail"], self.stop = "fail", str(error), True
        except (DeviceError, PortError, CompileError, UploadError, OSError, RuntimeError) as error:
            entry["result"], entry["detail"], self.stop = "error", f"{type(error).__name__}: {error}", True
        entry["ended_at"] = hil_record.now()

    def physical(self, step_id, title, instruction, requirement=None, wait_first=False):
        def confirm():
            if self.dry:
                return "dry run: confirmation not asked of anyone"
            identity = self.tester.identity().get("board", "") if self.tester else ""
            if not identity:
                raise AssertionError("the device did not report who it is, so the step cannot be confirmed")
            confirmation = hil_guard.confirm_physical(self.io, {"id": step_id, "title": title, "instruction": instruction}, identity, wait_first=wait_first)
            self.record["steps"][-1].update(confirmation)
            return None

        self.step(step_id, title, "physical", confirm, requirement)

    # the chain -------------------------------------------------------------------------------------
    def fixtures(self):
        listed = fixtures_of(ids=self.args.only.split(",") if self.args.only else None, hardware=True if not self.args.only else None)
        if not listed:
            raise AssertionError("no fixture is selected")
        return listed

    def preflight(self):
        fixtures = self.fixtures()
        limit = self.board.get("memory", {}).get("code_size_max")
        probe = LanguageTester(transport=open_fake("null"))
        try:
            for fixture in fixtures:
                self.compiled[fixture["id"]] = probe.compile_st(str(Path(__file__).resolve().parent / fixture["source"]))
        finally:
            probe.close()
        too_big = [f["id"] for f in fixtures if limit and len(self.compiled[f["id"]]) > limit]
        return f"{len(fixtures)} fixtures compile; {len(too_big)} exceed the {limit} bytes of this board and are skipped: {', '.join(too_big) or 'none'}"

    def open_device(self):
        fake = self.args.device or ("host" if self.dry else None)
        if fake:
            transport = open_fake(fake)
        else:
            transport = SerialTransport(resolve_port(self.args.port, self.board["ide_id"], os.environ))
        self.tester = LanguageTester(transport=transport, board=self.board["ide_id"])
        if transport.kind == "serial":
            import time  # noqa: PLC0415

            time.sleep(1)  # the board resets when the port opens
        link = transport.kind if transport.kind in ("serial", "host-runtime") else "fake"
        self.record["evidence"] = "hardware" if link == "serial" else link
        self.record["device"]["link"] = link

    def handshake(self):
        info = self.tester.identity()
        if not info.get("board"):
            raise AssertionError("the device did not answer `zplc sys info --json` with a board")
        self.record["device"].update({k: info.get(k) for k in ("board_profile", "zplc_version", "zephyr_version")})
        self.record["device"]["reported_board"] = info["board"]
        self.record["firmware"] = {k: v for k, v in hil_record.firmware_identity(info).items() if v is not None}
        if self.args.firmware_image:
            self.record["firmware"]["image_sha256"] = hil_record.sha256_hex(Path(self.args.firmware_image).read_bytes())
        return f"the device reports {info['board']}"

    def deploy(self):
        first = self.fixtures()[0]["id"]
        self.tester.upload_bytecode(self.compiled[first])
        status = self.tester.send("zplc status --json")
        if '"program_size"' in status and '"program_size":0' in status.replace(" ", ""):
            raise AssertionError("the device reports an empty program after the upload")
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

    def run(self) -> int:
        self.step("preflight", "Host checks: the fixtures compile and the board is known", "automatic", self.preflight, "HIL-005")
        self.step("open", "Open the device link", "automatic", self.open_device, "HIL-007")
        # the flash is the person's: asked for before the device is asked who it is
        self.step("flash", "A person flashes the firmware image", "physical", self.flash_prompt, "HIL-010")
        self.step("handshake", "Identity handshake", "automatic", self.handshake, "HIL-010")
        self.physical("confirm-identity", "Confirm the board", "Check that this is the board you flashed and that it is connected to the port named above.", "HIL-003")
        self.physical("safe-to-drive", "Outputs are safe to drive", "Nothing connected to the outputs can hurt anyone or damage equipment when it is switched on and off.", "HIL-003")
        self.step("deploy", "Deploy a program", "automatic", self.deploy, "HIL-010")
        self.step("run", "Run it and watch the scan counter", "automatic", self.run_step, "HIL-010")
        self.step("fixtures", "Run the language fixtures", "automatic", self.fixture_step, "HIL-005")
        self.step("force", "Force set and release", "automatic", self.force_step, "HIL-010")
        self.step("stop", "Stop: not running, outputs off", "automatic", self.stop_step, "HIL-010")
        self.release()
        for item, title, reason in PENDING:
            self.record["steps"].append({"id": item, "title": title, "kind": "automatic", "result": "pending", "requirement": "HIL-010", "detail": reason})
        self.record["coverage"] = {
            "requirement": "HIL-010",
            "done": [s["id"] for s in self.record["steps"] if s["result"] == "pass"],
            "pending": [s["id"] for s in self.record["steps"] if s["result"] == "pending"],
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
            return "dry run: nobody flashes anything"
        self.io.say(
            f"\nPhysical step: flash the firmware image for {self.board['display_name']}\n"
            "  Flash it yourself, by the procedure of the bench guide (TO BE FILLED by the person who did the bench run, HIL-014).\n"
            "  Nothing here flashes a board."
        )
        self.io.ask("  Press Enter when the board has restarted: ")
        return None


def run(args, io, stdout=None) -> int:
    out = stdout or sys.stdout
    try:
        board = find_board(args.board)
    except KeyError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    if not args.dry_run:
        try:
            hil_guard.require_interactive(io, "the hardware chain")
        except hil_guard.NotInteractive as error:
            print(f"error: {error}", file=sys.stderr)
            return 2
        if not args.operator:
            args.operator = io.ask("Operator name for the record: ").strip() or "unknown"
    elif not args.operator:
        args.operator = os.environ.get("USER") or os.environ.get("USERNAME") or "dry-run"
    chain = Chain(args, io, board)
    code = chain.run()
    chain.record["operator"] = {"name": args.operator}
    try:
        path = hil_record.write_record(chain.record, args.out)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(f"{chain.record['result'].upper()}: {path}", file=out)
    return code


def main(argv=None, io=None, stdout=None) -> int:
    args = parse(argv)
    return run(args, io or hil_guard.TerminalIo(), stdout)


if __name__ == "__main__":
    sys.exit(main())
