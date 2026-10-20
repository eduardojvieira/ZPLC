#!/usr/bin/env python3
"""HIL-010, HIL-012 and the HIL contract: the bench, and the measuring steps of the chain, against fake boards.

Each step runs against a fake board that behaves as the requirement says (the step passes) and against one with the
matching defect (the step fails, and says why). The steps that do not need a bench also run on the native runtime of
this tree. No serial port is opened: the RTU line is a pseudo-terminal, and the network endpoints are local.
"""
# ---- HIL-010 stopgap: the software leg; every measuring step passes on a sound fake board and fails on one with its defect ----
# ---- HIL-012: the chain says how long it takes, about 30 minutes on a person's bench ----
import io
import json
import os
import select
import socket
import struct
import tempfile
import termios
import unittest
from contextlib import redirect_stdout
from pathlib import Path

os.environ["ZPLC_HIL_FORBID_SERIAL"] = "1"

import bench as benches  # noqa: E402
import hil_devices  # noqa: E402
import hil_endpoints  # noqa: E402
import hil_guard  # noqa: E402
import hil_record  # noqa: E402
import hil_steps  # noqa: E402
import run_chain  # noqa: E402
from language_tester import LanguageTester  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUNTIME = os.environ.get("ZPLC_NATIVE_SIM_BIN", "")
needs_runtime = unittest.skipUnless(RUNTIME and Path(RUNTIME).is_file(), "ZPLC_NATIVE_SIM_BIN does not name the native runtime binary")
LOOPBACK = str(Path(RUNTIME).with_name("zplc_loopback")) if RUNTIME else ""
needs_loopback = unittest.skipUnless(LOOPBACK and Path(LOOPBACK).is_file(), "zplc_loopback is not built beside ZPLC_NATIVE_SIM_BIN")
BOARDS = {b["ide_id"]: b for b in json.loads((ROOT / "firmware/app/boards/boards.json").read_text())}
SYMBOLS = {"scans": 0x4004, "x": 0x2780, "torn": 0x2784, "got": 0x2780, "done": 0x2784, "err": 0x2788, "heard": 0x278C}
EMULATOR = {"name": "fake-emulator", "version": "0", "patch_sha256": None}


def fake_compile(name, board, values=None):
    """What the steps deploy, without the compiler: the fake board reads the program's name (and its values) from it."""
    return list(f"PROG:{name}:{json.dumps(values or {})}".encode()), dict(SYMBOLS)


class Clock:
    def __init__(self):
        self.ms = 1000.0


class FakeBoard(hil_devices.ShellDevice):
    """A board on its bench, in the shell grammar, with the wiring of the HIL contract and the defects asked for."""

    kind = "fake"
    PT = hil_steps.TIMER_PT_MS

    def __init__(self, clock, defects=(), rtu=None, line=None):
        super().__init__()
        self.clock, self.defects, self.rtu, self.line = clock, set(defects), rtu, line
        # the stored settings, those the shell set since, and the RTU client, which starts at boot when it is on
        self.config, self.saved_config, self.rtu_client = {}, {}, False
        self.budget = 100_000  # VM instructions in one scan (CONFIG_ZPLC_VM_CYCLE_INSTRUCTION_BUDGET)
        self.memory = bytearray(0x5000)
        self.forces: dict[int, bytes] = {}
        self.session_forces: set[int] = set()
        self.session, self.last_frame = False, 0.0
        self.program, self.values, self.staging, self.expected = None, {}, None, 0
        self.state, self.fault, self.cause = "idle", "none", "power_on"
        self.boot, self.started, self.analog, self.saved_retain = clock.ms, 0.0, 0.0, 0
        self.ticked = clock.ms

    # physics ---------------------------------------------------------------------------------------
    def now(self):
        """The board's own clock. On a slow emulator it runs behind the bench's (Espressif QEMU ran at about 0.16)."""
        return self.clock.ms * (0.15 if "slow-clock" in self.defects else 1.0)

    def power_cycle(self, cause="power_on"):
        if self.staging is not None and "partial-deploy" in self.defects:
            self.program = "garbage"
        self.staging, self.state, self.fault, self.cause, self.boot = None, "idle", "none", cause, self.now()
        self.forces.clear()
        self.session = False
        self.config = dict(self.saved_config)
        self.rtu_client = self.config.get("modbus_rtu_client_enabled") == "1"  # zplc_modbus_client_init, at boot only
        self.memory[0x4004:0x4008] = (0 if "retain-lost" in self.defects else self.saved_retain).to_bytes(4, "little", signed=True)

    def tick(self):
        now, elapsed = self.now(), self.now() - self.ticked
        self.ticked = now
        if self.session and now - self.last_frame >= 30_000 and "link-loss-keeps-forces" not in self.defects:
            for address in self.session_forces:
                self.forces.pop(address, None)
            self.session = False
        if self.state != "running":
            return
        running = now - self.started
        if self.program == "overrun" and running > (300 if "starved-shell" in self.defects else 5):
            # one scan of more than the VM's instruction budget is a VM watchdog fault (ZPLC_VM_WATCHDOG), not an overrun
            tripped = int(self.values.get("iterations", 8000)) * hil_steps.OVERRUN_ITERATION_COST > self.budget
            self.state, self.fault = "error", "vm_fault" if tripped else "deadline_miss"
        if self.program == "fault" and running > 200:
            self.state, self.fault = "error", "vm_fault"
        if self.program == "hang" and running >= 1000 + (900 if "watchdog-late" in self.defects else 0):
            self.power_cycle("watchdog")
            self.boot = self.started + 1000 + (900 if "watchdog-late" in self.defects else 0)
        if self.program == "retain":
            value = int.from_bytes(self.memory[0x4004:0x4008], "little", signed=True) + int(elapsed // 10)
            self.memory[0x4004:0x4008] = value.to_bytes(4, "little", signed=True)
        if self.program == "modbus-rtu" and self.rtu is not None and not self.values.get("asked"):
            self.values["asked"] = True
            if not self.rtu_client:  # the client is off by default: the block fails at once, no byte reaches the line
                self.memory[0x2788:0x278C] = struct.pack("<i", 10)  # ZPLC_COMM_UNAVAILABLE
                return
            speeds = {9600: termios.B9600, 19200: termios.B19200, 115200: termios.B115200}
            baud = int(self.config.get("modbus_rtu_baud", 19200))
            if self.line is not None and termios.tcgetattr(self.line)[4] != speeds.get(baud):
                self.memory[0x2788:0x278C] = struct.pack("<i", 2)  # at another speed the host hears noise: a timeout
                return
            unit = 2 if "fieldbus-fails" in self.defects else 1  # nobody answers unit 2
            os.write(self.rtu, hil_endpoints.rtu_frame(bytes([unit, 3, 0, 100, 0, 1])))
            reply = b""
            while select.select([self.rtu], [], [], 1.0)[0] and len(reply) < 7:
                reply += os.read(self.rtu, 64)
            got = struct.unpack(">H", reply[3:5])[0] if len(reply) >= 7 else 0
            self.memory[0x2780:0x2788] = struct.pack("<ii", got, 1)
        if self.program == "modbus-tcp-mqtt" and not self.values.get("asked"):
            self.values["asked"] = True
            self.memory[0x2780:0x2790] = struct.pack("<iiii", *network_exchange(self.values, "fieldbus-fails" in self.defects))

    def program_outputs(self):
        if self.state == "running":
            return {"timer": int(self.now() - self.started >= self.PT + (400 if "timer-slow" in self.defects else 0)),
                    "deploy-a": 0x05, "deploy-b": 0x0A, "overrun": 1, "fault": 1, "hang": 1}.get(self.program, 0)
        if self.state == "error" and {"overrun-keeps-outputs", "fault-keeps-outputs"} & self.defects:
            return 1
        return 0

    def outputs(self):
        value = self.program_outputs()
        if 0x1000 in self.forces and (self.state == "running" or "stop-keeps-forces" in self.defects):
            value = self.forces[0x1000][0]
        return value

    def inputs(self):
        bits = self.outputs() & 0x0F
        bits ^= 0x0F if "active-low" in self.defects else 0
        if "di2-stuck" in self.defects:
            bits &= ~0x04
        word = round(self.analog * 4095) + (800 if "analog-off" in self.defects else 0)
        return bytes([bits]) + bytes(7) + struct.pack("<H", min(word, 0xFFFF))

    def drop_line(self):
        """The host closed the port: DTR falls, and a device that reads it ends the session at once."""
        if {"no-line-state", "link-loss-keeps-forces"} & self.defects:
            return
        for address in self.session_forces:
            self.forces.pop(address, None)
        self.session = False

    def memory_read(self, address, length):
        if address < 0x1000:
            return (self.inputs() + bytes(0x1000))[address : address + length]
        if address < 0x2000:
            return bytes([self.outputs()]) + bytes(length - 1)
        return bytes(self.memory[address : address + length])

    # shell -----------------------------------------------------------------------------------------
    def handle(self, line):
        try:
            return self.answer(line)
        finally:
            self.clock.ms += 1  # every command takes the board a millisecond

    def answer(self, line):
        self.tick()
        words = line.split()
        if words[:2] == ["zplc", "link"]:
            return self.link(bytes.fromhex(words[2]))
        command = " ".join(words[:3])
        if words[:2] in (["zplc", "stop"], ["zplc", "reset"]):
            if self.state == "running":
                self.saved_retain = int.from_bytes(self.memory[0x4004:0x4008], "little", signed=True)
            self.state = "idle" if words[1] == "stop" or self.state != "error" else self.state
            return "OK: Scheduler stopped\r\n"
        if words[:2] == ["zplc", "start"]:
            if self.program and self.program != "garbage":
                self.state, self.fault, self.started = "running", "none", self.now()
            return "OK: Scheduler started\r\n"
        if words[:2] == ["zplc", "load"]:
            self.staging, self.expected = bytearray(), int(words[2])
            return f"OK: Ready to receive {self.expected} bytes\r\n"
        if words[:2] == ["zplc", "data"]:
            self.staging += bytes.fromhex(words[2])
            if len(self.staging) < self.expected:
                return "OK: Received\r\n"
            text = bytes(self.staging).decode("latin-1")
            _, name, values = text.split(":", 2) if text.startswith("PROG:") else ("", "fixture", "{}")
            self.program, self.values, self.staging, self.state = name, json.loads(values), None, "idle"
            return f"OK: Program loaded ({self.expected} bytes)\r\n"
        if "starved-shell" in self.defects and self.state == "running" and (words[:3] == ["zplc", "status", "--json"] or command == "zplc dbg peek"):
            return ""  # an overrunning scan at a higher priority than the shell (RT-013) leaves the shell no time to answer
        if words[:3] == ["zplc", "status", "--json"]:
            cycles = int((self.now() - self.started) // 10) if self.state == "running" else 0
            misses = cycles // 1000 if "jitter-misses" in self.defects else 0
            wide = 3000 if "jitter-wide" in self.defects else 0
            tasks = [{"id": 0, "interval_us": 10000, "cycles": cycles, "period_min_us": 9990 if cycles > 1 else 0,
                      "period_max_us": 10010 + wide if cycles > 1 else 0, "jitter_us": 20 + wide if cycles > 1 else 0}]
            return json.dumps({
                "state": self.state, "uptime_ms": int(self.now() - self.boot), "reset_cause": self.cause, "tasks": tasks,
                "deadline": {"misses": misses}, "fault": {"reason": self.fault, "task_id": None},
                "stats": {"cycles": cycles, "overruns": misses}, "vm": {"error": 3 if self.fault == "vm_fault" else 0},
            }) + "\r\n"
        if command == "zplc dbg peek":
            address, length = int(words[3], 0), int(words[4], 0)
            return self.dump(self.memory_read(address, length), address)
        if command == "zplc dbg force":
            if words[3] == "set":  # the console's force opens or joins the link's session (COM-020)
                self.forces[int(words[4], 0)] = bytes.fromhex(words[5])
                self.session, self.last_frame = True, self.now()
                self.session_forces.add(int(words[4], 0))
                return "OK: Forced\r\n"
            if words[3] == "clear_all":
                self.forces.clear()
                return "OK: Cleared all force entries\r\n"
            return json.dumps({"count": len(self.forces), "items": []}) + "\r\n"
        if words[:3] == ["zplc", "config", "set"]:
            self.config[words[3]] = words[4]
            return "OK: Config updated\r\n"
        if words[:3] == ["zplc", "config", "save"]:
            self.saved_config = dict(self.config)
            return "OK: Config saved\r\n"
        if words[:3] == ["zplc", "wifi", "connect"]:
            if "no-ssid" in self.defects:
                return "ERROR: No SSID configured (use zplc config set wifi_ssid)\r\n"
            return "OK: WiFi connect requested for the stored network\r\n"
        if words[:3] == ["zplc", "net", "status"]:
            self.net_polls = getattr(self, "net_polls", 0) + 1
            if "no-wifi" in self.defects or self.net_polls <= 3:  # DHCP takes a few seconds after the association
                return "IP Address: (not assigned yet)\r\nInterface: up\r\nWiFi link: connecting\r\n"
            return "IP Address: 192.168.1.50\r\nInterface: up\r\nWiFi link: connected\r\n"
        if words[:3] == ["zplc", "sys", "info"]:
            return json.dumps({"board": "rpi_pico", "board_profile": "rpi_pico"}) + "\r\n"
        return "OK: done\r\n"

    def link(self, frame):
        decoder = hil_steps.proto.Decoder(hil_steps.ShellLink.DEFINITION, 512)
        decoder.push(frame)
        (request,) = decoder.frames
        name = {v: k for k, v in hil_steps.ShellLink.MESSAGES.items()}[request["message"]]
        payload, self.last_frame = request["payload"], self.now()
        body = b"\x00"
        if name == "HELLO":
            body = b"\x00\x01\x00" + (512).to_bytes(2, "little") + bytes(6) + (30).to_bytes(2, "little") + b"\x00"
        elif name == "SESSION_OPEN":
            self.session = True
        elif name == "SESSION_CLOSE":
            self.session = False
        elif name == "FORCE_SET":
            address = int.from_bytes(payload[:2], "little")
            self.forces[address] = payload[2:]
            self.session_forces.add(address)
            body = b"\x00\x01"
        elif name == "MEM_WRITE":
            address = int.from_bytes(payload[:2], "little")
            if "torn-writes" in self.defects and self.state == "running":
                self.memory[0x2784:0x2788] = (int.from_bytes(self.memory[0x2784:0x2788], "little") + 1).to_bytes(4, "little")
            self.memory[address : address + len(payload) - 2] = payload[2:]
        answer = hil_steps.proto.encode_frame(hil_steps.ShellLink.DEFINITION, 1, request["message"], request["sequence"], body)
        return f"ZF:{answer.hex()}\r\nOK\r\n"


def network_exchange(values, broken):
    """What the ESP32-S3's program does in the fieldbus step: a Modbus TCP write and read back, and an MQTT round trip."""
    host, port = values["host"], int(values["modbus_port"])
    with socket.create_connection((host, port), timeout=3) as modbus:
        modbus.sendall(struct.pack(">HHHBBHH", 1, 0, 6, 1, 6, 100, hil_steps.RTU_VALUE if not broken else 1))
        modbus.recv(64)
        modbus.sendall(struct.pack(">HHHBBHH", 2, 0, 6, 1, 3, 100, 1))
        got = struct.unpack(">H", modbus.recv(64)[9:11])[0]
    heard = 0
    with socket.create_connection((host, int(values["mqtt_port"])), timeout=3) as mqtt:
        mqtt.sendall(bytes([0x10, 16]) + b"\x00\x04MQTT\x04\x02\x00\x3c" + b"\x00\x04hil1")
        mqtt.recv(4)
        mqtt.sendall(bytes([0x82, 13, 0, 1]) + b"\x00\x08zplc/hil" + b"\x00")
        mqtt.recv(5)
        mqtt.sendall(bytes([0x30, 13]) + b"\x00\x08zplc/hil" + b"hil")
        heard = int(b"hil" in mqtt.recv(64))
    return got, 1, 0, heard


class FakeBench:
    """The bench of the tests: virtual wiring, a fake clock and a fake power switch (the HIL contract)."""

    level = "emulated"
    emulator = EMULATOR

    def __init__(self, clock, board):
        self.clock, self.board, self.wired, self.identity = clock, board, [], ""

    def port(self):
        return "/dev/null-bench"

    def flash(self, image):
        pass

    def confirm_wiring(self, bench):
        self.wired.append(bench)

    def power_cycle(self):
        self.board.power_cycle()

    def cut_power_during_deploy(self, cut_index, of):
        self.board.power_cycle()

    def set_analog(self, channel, fraction):
        self.board.analog = fraction

    def now_ms(self):
        return self.clock.ms

    def sleep(self, seconds):
        self.clock.ms += seconds * 1000


class RealClockBench(FakeBench):
    """An emulated bench on the host clock, around the native runtime: it has no potentiometer."""

    def __init__(self):
        super().__init__(None, None)

    def now_ms(self):
        import time  # noqa: PLC0415

        return time.monotonic() * 1000

    def sleep(self, seconds):
        import time  # noqa: PLC0415

        time.sleep(seconds)

    def set_analog(self, channel, fraction):
        raise benches.Unsupported("this emulator has no ADC model")


class Quiet(unittest.TestCase):
    def run(self, result=None):
        with redirect_stdout(io.StringIO()):
            return super().run(result)


class StepTests(Quiet):
    def setUp(self):
        self.compile = hil_steps.compile_program
        hil_steps.compile_program = fake_compile

    def tearDown(self):
        hil_steps.compile_program = self.compile

    def step(self, step_id, defects=(), board="rpi_pico", extra=(), options=None, rtu=None, line=None):
        clock = Clock()
        device = FakeBoard(clock, defects, rtu, line)
        device.budget = int((options or {}).get("VM_CYCLE_INSTRUCTION_BUDGET", 100_000))
        bench = FakeBench(clock, device)
        args = run_chain.parse([board, "--dry-run", "--operator", "CI", *extra])
        chain = run_chain.Chain(args, hil_guard.PipedIo(), BOARDS[board], lambda name: device, bench)
        chain.tester = LanguageTester(transport=device, board=board)
        chain.record["firmware"]["build_options"] = options or {"HIL_IMAGE": "y", "HARDWARE_WATCHDOG": "y", "HARDWARE_WATCHDOG_TIMEOUT_MS": "1000", "RETAIN_PERSIST": "y"}
        _, title, method, requirement = next(s for s in chain.STEPS if s[0] == step_id)
        chain.step(step_id, title, "automatic", getattr(chain, method), requirement)
        entry = chain.record["steps"][-1]
        self.assertEqual(hil_record.validate({**chain.record, "result": "fail"}), [], "the record stays valid")
        return entry, bench

    def passes_and_fails(self, step_id, defect, **kw):
        good, _ = self.step(step_id, **kw)
        self.assertEqual(good["result"], "pass", good.get("detail"))
        self.assertTrue(good.get("measurements"), "the step writes its measurements")
        bad, _ = self.step(step_id, (defect,), **kw)
        self.assertEqual(bad["result"], "fail", bad.get("detail"))
        return good, bad

    def test_digital_loopback_each_output_moves_its_own_input(self):
        good, bad = self.passes_and_fails("digital-loopback", "di2-stuck")
        self.assertEqual(sorted(good["measurements"]["pairs"]), ["DO0", "DO1", "DO2", "DO3"])
        self.assertIn("DI2 does not follow DO2", bad["detail"])
        inverted, _ = self.step("digital-loopback", ("active-low",))
        self.assertEqual(inverted["result"], "pass", "an active-low input follows its output inverted")
        self.assertIn("inverted", inverted["measurements"]["pairs"]["DO0"]["polarity"])

    def test_analog_read_at_three_points(self):
        good, bad = self.passes_and_fails("analog-read", "analog-off")
        self.assertEqual([p["raw"] for p in good["measurements"]["points"]], [0, 2048, 4095])

    def test_timer_accuracy_against_the_bench_clock(self):
        good, bad = self.passes_and_fails("timer-accuracy", "timer-slow")
        self.assertLessEqual(abs(good["measurements"]["error_ms"]), 20)
        self.assertIn("outside", bad["detail"])

    def test_scan_jitter_runs_ten_minutes_from_the_runtimes_own_statistics(self):
        good, bad = self.passes_and_fails("scan-jitter-10min", "jitter-misses")
        self.assertGreaterEqual(good["measurements"]["duration_s"], 600)
        self.assertEqual(good["measurements"]["tasks"][0]["period_max_us"], 10010, "the runtime's own longest period")
        self.assertEqual(good["measurements"]["jitter_us"], 20, "and the gap between the shortest and the longest")
        self.assertIn("deadline misses", bad["detail"])
        wide, _ = self.step("scan-jitter-10min", ("jitter-wide",))
        self.assertEqual(wide["result"], "fail", "a period far from the interval fails the step")
        self.assertIn("13010", wide["detail"])

    def test_outputs_off_after_an_overrun_and_after_a_fatal_fault(self):
        good, _ = self.passes_and_fails("overrun-fault-outputs-off", "overrun-keeps-outputs")
        self.assertEqual(good["measurements"]["fault"], "deadline_miss")
        good, _ = self.passes_and_fails("fatal-fault-outputs-off", "fault-keeps-outputs")
        self.assertEqual((good["measurements"]["fault"], good["measurements"]["outputs_before"]), ("vm_fault", 1))

    def test_the_overrun_program_stays_inside_the_boards_instruction_budget(self):
        """A scan longer than the budget is a VM watchdog fault by design (CONFIG_ZPLC_VM_CYCLE_INSTRUCTION_BUDGET):
        the overrun program is sized from the budget the image reports, so what latches is the deadline miss."""
        for budget in ("100000", "40000"):
            entry, _ = self.step("overrun-fault-outputs-off", options={"VM_CYCLE_INSTRUCTION_BUDGET": budget})
            self.assertEqual(entry["result"], "pass", entry.get("detail"))
            self.assertEqual(entry["measurements"]["fault"], "deadline_miss")
            self.assertEqual(entry["measurements"]["instruction_budget"], int(budget))
            self.assertLessEqual(entry["measurements"]["iterations"] * hil_steps.OVERRUN_ITERATION_COST, int(budget) // 2)

    def test_a_board_whose_clock_runs_behind_the_bench_still_latches_its_fault(self):
        """On Espressif QEMU the board's clock ran at about a sixth of the host's: the step waits for the latch."""
        for step_id, fault in (("fatal-fault-outputs-off", "vm_fault"), ("overrun-fault-outputs-off", "deadline_miss")):
            entry, _ = self.step(step_id, ("slow-clock",))
            self.assertEqual(entry["result"], "pass", entry.get("detail"))
            self.assertEqual(entry["measurements"]["fault"], fault)
        self.assertGreater(self.step("fatal-fault-outputs-off", ("slow-clock",))[0]["measurements"]["latched_after_ms"], 1000,
                           "the fatal fault took longer than the old fixed wait of one second")

    def test_a_shell_starved_by_the_overrun_does_not_end_the_wait(self):
        """Seen on the emulated Pico: while the 1 ms task overran, `zplc status` had no answer until the fault latched."""
        entry, _ = self.step("overrun-fault-outputs-off", ("starved-shell",))
        self.assertEqual(entry["result"], "pass", entry.get("detail"))
        self.assertEqual(entry["measurements"]["state"], "error")

    def test_outputs_safe_after_stop_and_after_link_loss_with_forces_active(self):
        good, bad = self.passes_and_fails("stop-and-link-loss-safe", "link-loss-keeps-forces")
        self.assertEqual(good["measurements"]["session_idle_s"], 30)
        self.assertEqual(good["measurements"]["released_by"], "line", "the fall of DTR ends the session, not the silence")
        self.assertLess(good["measurements"]["released_within_ms"], 1000)
        self.assertIn("still on", bad["detail"])
        idle, _ = self.step("stop-and-link-loss-safe", ("no-line-state",))
        self.assertEqual((idle["result"], idle["measurements"]["released_by"]), ("pass", "idle time"),
                         "a console that reports no line is released by the idle time")
        stuck, _ = self.step("stop-and-link-loss-safe", ("stop-keeps-forces",))
        self.assertIn("after STOP", stuck["detail"])

    def test_watchdog_reset_time_needs_the_hil_build(self):
        good, bad = self.passes_and_fails("watchdog-reset-time", "watchdog-late")
        self.assertAlmostEqual(good["measurements"]["measured_ms"], 1000, delta=5)
        self.assertEqual(good["measurements"]["reset_cause"], "watchdog")
        plain, _ = self.step("watchdog-reset-time", options={"SCHEDULER": "y"})
        self.assertEqual(plain["result"], "fail")
        self.assertIn("CONFIG_ZPLC_HIL_IMAGE=y", plain["detail"])
        shipped, _ = self.step("watchdog-reset-time", options={"HARDWARE_WATCHDOG": "y", "HARDWARE_WATCHDOG_TIMEOUT_MS": "1000"})
        self.assertEqual(shipped["result"], "fail", "a record of RT-020 is made on the HIL image, never on another build")
        self.assertIn("not the HIL image", shipped["detail"])

    def test_power_cycle_keeps_stop_program_and_retain(self):
        good, _ = self.passes_and_fails("power-cycle-retain", "retain-lost")
        self.assertEqual(good["measurements"]["retain_after"], good["measurements"]["retain_before"])

    def test_power_cycle_retain_needs_an_image_built_with_retain_persistence(self):
        """RETAIN persistence is off in every shipped profile until a board has a hardware record (RT-025): an image
        without it cannot keep RETAIN, and the step says that instead of reporting a lost value."""
        plain, _ = self.step("power-cycle-retain", options={"SCHEDULER": "y", "HARDWARE_WATCHDOG": "y"})
        self.assertEqual(plain["result"], "fail")
        self.assertIn("CONFIG_ZPLC_RETAIN_PERSIST=y", plain["detail"])

    def test_a_power_step_whose_board_did_not_restart_fails(self):
        class NoPower(FakeBench):
            def power_cycle(self):
                pass

        clock = Clock()
        device = FakeBoard(clock)
        args = run_chain.parse(["rpi_pico", "--dry-run", "--operator", "CI"])
        chain = run_chain.Chain(args, hil_guard.PipedIo(), BOARDS["rpi_pico"], lambda name: device, NoPower(clock, device))
        chain.tester = LanguageTester(transport=device, board="rpi_pico")
        chain.record["firmware"]["build_options"] = {"RETAIN_PERSIST": "y"}
        chain.step("power-cycle-retain", "Power cycle", "automatic", chain.power_cycle_retain)
        self.assertEqual(chain.record["steps"][-1]["result"], "fail")
        self.assertIn("did not restart", chain.record["steps"][-1]["detail"])

    def test_twenty_power_cuts_during_deploys_leave_a_whole_program(self):
        good, bad = self.passes_and_fails("deploy-power-interruption-x20", "partial-deploy")
        self.assertEqual(len(good["measurements"]["cuts"]), 20)
        self.assertEqual({c["program"] for c in good["measurements"]["cuts"]}, {"A", "B"}, "early cuts keep A, the last one has B")
        self.assertTrue(all(c["restarted"] for c in good["measurements"]["cuts"]))

    def test_an_atomic_write_is_never_seen_half_written(self):
        good, bad = self.passes_and_fails("atomic-write", "torn-writes")
        self.assertEqual(good["measurements"]["torn_scans"], 0)

    def test_modbus_rtu_on_the_pico_against_a_host_server_on_a_pty(self):
        for defects in ((), ("fieldbus-fails",)):
            master, slave = os.openpty()
            try:
                entry, bench = self.step("fieldbus-exchange", defects, extra=("--rtu-port", os.ttyname(slave)), rtu=master, line=slave)
            finally:
                os.close(master)
                os.close(slave)
            self.assertEqual(bench.wired, ["modbus-rtu"])
            if defects:
                self.assertEqual(entry["result"], "fail", entry.get("detail"))
                continue
            self.assertEqual(entry["result"], "pass", entry.get("detail"))
            self.assertEqual(entry["measurements"]["got"], hil_steps.RTU_VALUE)
        missing, _ = self.step("fieldbus-exchange")
        self.assertIn("--rtu-port", missing["detail"])

    @needs_loopback
    def test_modbus_tcp_and_mqtt_on_the_esp32s3_against_the_loopback_endpoints(self):
        extra = ("--host-ip", "127.0.0.1", "--loopback-bin", LOOPBACK)
        good, _ = self.step("fieldbus-exchange", board="esp32s3_devkitc", extra=extra)
        self.assertEqual(good["result"], "pass", good.get("detail"))
        self.assertEqual((good["measurements"]["got"], good["measurements"]["heard"]), (hil_steps.RTU_VALUE, 1))
        bad, _ = self.step("fieldbus-exchange", ("fieldbus-fails",), board="esp32s3_devkitc", extra=extra)
        self.assertEqual(bad["result"], "fail")

    def chain_for(self, board, defects=()):
        clock = Clock()
        device = FakeBoard(clock, defects)
        args = run_chain.parse([board, "--dry-run", "--operator", "CI"])
        chain = run_chain.Chain(args, hil_guard.PipedIo(), BOARDS[board], lambda name: device, FakeBench(clock, device))
        chain.tester = LanguageTester(transport=device, board=board)
        chain.record["steps"].append({"id": "fieldbus-exchange"})
        return chain, device

    def test_the_network_step_waits_for_an_address_before_it_starts_anything(self):
        """HIL-010.32: the board joins the network by itself after a restart, DHCP takes a few seconds, and the step
        does not read an address that is not there yet."""
        chain, device = self.chain_for("esp32s3_devkitc")
        self.assertEqual(chain.wait_for_address(), "192.168.1.50")
        self.assertEqual(device.net_polls, 4)

    def test_the_network_step_says_why_when_the_board_never_gets_an_address(self):
        chain, _ = self.chain_for("esp32s3_devkitc", ("no-wifi",))
        with self.assertRaises(AssertionError) as caught:
            chain.wait_for_address()
        self.assertIn("no IP address", str(caught.exception))
        self.assertIn("WiFi link: connecting", str(caught.exception), "what the board says about its link")

    def test_the_network_step_says_when_the_board_has_no_credentials(self):
        chain, _ = self.chain_for("esp32s3_devkitc", ("no-ssid",))
        with self.assertRaises(AssertionError) as caught:
            chain.wait_for_address()
        self.assertIn("zplc config set wifi_ssid", str(caught.exception))

    @needs_loopback
    def test_a_board_without_an_address_never_gets_the_network_program(self):
        extra = ("--host-ip", "127.0.0.1", "--loopback-bin", LOOPBACK)
        entry, bench = self.step("fieldbus-exchange", ("no-wifi",), board="esp32s3_devkitc", extra=extra)
        self.assertEqual(entry["result"], "fail")
        self.assertIn("no IP address", entry["detail"])
        self.assertIsNone(bench.board.program, "the program was not deployed to a board that is offline")

    def test_a_bench_that_cannot_do_a_step_records_it_as_not_run_never_passed(self):
        clock = Clock()
        device = FakeBoard(clock)
        args = run_chain.parse(["rpi_pico", "--dry-run", "--operator", "CI"])
        chain = run_chain.Chain(args, hil_guard.PipedIo(), BOARDS["rpi_pico"], lambda name: device, benches.StandInBench("a fake"))
        chain.tester = LanguageTester(transport=device, board="rpi_pico")
        chain.record["firmware"]["build_options"] = {"RETAIN_PERSIST": "y"}
        chain.step("analog-read", "Analog read", "automatic", chain.analog_read)
        self.assertEqual(chain.record["steps"][-1]["result"], "skipped")
        chain.record["evidence_level"] = "emulated"
        chain.step("power-cycle-retain", "Power cycle", "automatic", chain.power_cycle_retain)
        self.assertEqual(chain.record["steps"][-1]["result"], "not-emulable")
        self.assertIn("no power to cycle", chain.record["steps"][-1]["detail"])


class BudgetTests(Quiet):
    def test_the_chain_says_how_long_it_takes_and_the_default_plan_is_about_thirty_minutes(self):
        args = run_chain.parse(["rpi_pico", "--operator", "CI"])
        chain = run_chain.Chain(args, hil_guard.PipedIo(), BOARDS["rpi_pico"], bench=FakeBench(Clock(), None))
        estimate = chain.estimate_seconds()
        self.assertGreaterEqual(estimate, hil_steps.JITTER_S + hil_steps.DEPLOY_CUTS * 20)
        self.assertLessEqual(abs(estimate - hil_steps.TARGET_SECONDS) / hil_steps.TARGET_SECONDS, 0.15, f"{estimate} s")
        args = run_chain.parse(["rpi_pico", "--operator", "CI", "--steps", "timer-accuracy"])
        self.assertLess(run_chain.Chain(args, hil_guard.PipedIo(), BOARDS["rpi_pico"], bench=FakeBench(Clock(), None)).estimate_seconds(), estimate - 900)


class BenchTests(Quiet):
    def test_the_human_bench_refuses_without_a_terminal_and_needs_the_identity_typed(self):
        with self.assertRaises(hil_guard.NotInteractive):
            benches.HumanBench(hil_guard.PipedIo(), BOARDS["rpi_pico"])

        class Person:
            interactive = True

            def __init__(self, *answers):
                self.answers = list(answers)

            def say(self, text):
                pass

            def ask(self, prompt):
                return self.answers.pop(0)

        human = benches.HumanBench(Person("", "rpi_pico"), BOARDS["rpi_pico"])
        with self.assertRaises(hil_guard.IdentityMismatch):
            human.power_cycle()  # the board has not said who it is yet
        human.identity = "rpi_pico"
        human.power_cycle()
        self.assertEqual(human.last_confirmation["confirmed_identity"], "rpi_pico")
        human = benches.HumanBench(Person("", "esp32", "", "esp32"), BOARDS["rpi_pico"])
        human.identity = "rpi_pico"
        with self.assertRaises(hil_guard.IdentityMismatch):
            human.set_analog("AI0", 0.5)

    def test_the_emulated_bench_is_loaded_from_tools_hil_emulator_and_its_record_is_emulated(self):
        with self.assertRaises(benches.BenchMissing):
            benches.load_emulator_bench(BOARDS["rpi_pico"], Path(tempfile.mkdtemp()))
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "bench_emulated.py").write_text(
                "class EmulatorBench:\n    level = 'emulated'\n    emulator = {'name': 'stub', 'version': '0', 'patch_sha256': None}\n"
                "    def __init__(self, board):\n        self.board = board\n"
            )
            loaded = benches.load_emulator_bench(BOARDS["rpi_pico"], Path(directory))
            self.assertEqual((loaded.level, loaded.board["ide_id"]), ("emulated", "rpi_pico"))
        if not (RUNTIME and Path(RUNTIME).is_file()):
            self.skipTest("ZPLC_NATIVE_SIM_BIN does not name the native runtime binary")
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        device = hil_devices.HostRuntimeDevice()
        device.kind = "serial"  # an emulator's port is a pty that the link opens like a serial port
        with tempfile.TemporaryDirectory() as out:
            run_chain.main(["rpi_pico", "--bench", "emulated", "--device", "null", "--out", out, "--operator", "CI", "--only", "il.minimal", "--steps", "timer-accuracy,analog-read"],
                           io=hil_guard.PipedIo(), stdout=io.StringIO(), opener=lambda name: device, bench=RealClockBench())
            record = json.loads(next(p for p in Path(out).glob("*.json") if not p.name.endswith(".evidence.json")).read_text())
        self.assertEqual((record["evidence"], record["evidence_level"], record["emulator"]), ("emulated", "emulated", EMULATOR))
        self.assertEqual(hil_record.validate(record), [])
        steps = {s["id"]: s for s in record["steps"]}
        self.assertEqual(steps["timer-accuracy"]["result"], "pass", steps["timer-accuracy"].get("detail"))
        self.assertEqual(steps["analog-read"]["result"], "not-emulable", "a bench without the model says so; it never passes")
        self.assertEqual(steps["confirm-identity"]["result"], "skipped", "an emulated bench has no person to confirm it")
        self.assertIn("duration", record["measurements"])


class PaceTests(Quiet):
    def test_an_emulator_whose_board_clock_runs_behind_gives_programs_more_host_time(self):
        """Espressif QEMU ran the ESP32-S3's clock at a tenth to a third of the host's, so a fixture's 100 scans of
        50 ms did not fit the tester's wait in host time; the bench's pace scales that wait (and nothing on a board)."""
        clock = Clock()

        class SlowEmulator(FakeBench):
            pace = 10.0

        for bench, expected in ((FakeBench(clock, None), 1.0), (SlowEmulator(clock, None), 10.0)):
            device = FakeBoard(clock)
            args = run_chain.parse(["esp32s3_devkitc", "--dry-run", "--operator", "CI", "--device", "null"])
            chain = run_chain.Chain(args, hil_guard.PipedIo(), BOARDS["esp32s3_devkitc"], lambda name: device, bench)
            chain.open_device()
            self.assertEqual(chain.tester.pace, expected)


class CompilePerBoardTests(Quiet):
    def test_every_step_program_compiles_for_both_learner_boards_with_the_boards_memory(self):
        values = {"host": "192.168.1.2", "modbus_port": 5020, "iterations": 3846}
        for board in ("rpi_pico", "esp32s3_devkitc"):
            for name in hil_steps.PROGRAMS:
                with self.subTest(board=board, program=name):
                    code, symbols = hil_steps.compile_program(name, board, values if "{" in hil_steps.PROGRAMS[name][1] else None)
                    self.assertTrue(code)
                    if name == "atomic":
                        self.assertEqual((symbols["x"], symbols["torn"]), (0x2780, 0x2784))
        for fixture in run_chain.fixtures_of(ids=None, hardware=True):
            for board in ("rpi_pico", "esp32s3_devkitc"):
                with self.subTest(board=board, fixture=fixture["id"]):
                    self.assertTrue(hil_steps.compile_file(HERE / fixture["source"], board), "the chain's fixtures compile for the board")
        hil_steps.PROGRAMS["too-big-for-2k"] = (10, "PROGRAM Main\nVAR a : ARRAY[0..999] OF DINT; END_VAR\na[0] := 1;\nEND_PROGRAM\n")
        try:
            self.assertTrue(hil_steps.compile_program("too-big-for-2k", "rpi_pico")[0], "8 KB of work memory holds it")
            with self.assertRaises(RuntimeError):
                hil_steps.compile_program("too-big-for-2k", "esp32s3_devkitc")  # the 2 KB of the ESP32-S3 do not
        finally:
            del hil_steps.PROGRAMS["too-big-for-2k"]


@needs_runtime
class NativeRuntimeStepTests(Quiet):
    """The steps that need no bench, on the native runtime of this tree: a stand-in, never evidence."""

    def test_timer_and_fatal_fault_on_the_native_runtime(self):
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        with tempfile.TemporaryDirectory() as out:
            code = run_chain.main(["rpi_pico", "--dry-run", "--device", "host", "--out", out, "--operator", "CI", "--only", "il.minimal",
                                   "--steps", "timer-accuracy,fatal-fault-outputs-off,analog-read"], stdout=io.StringIO())
            record = json.loads(next(Path(out).glob("*.json")).read_text())
        steps = {s["id"]: s for s in record["steps"]}
        self.assertEqual(steps["timer-accuracy"]["result"], "pass", steps["timer-accuracy"].get("detail"))
        self.assertEqual(steps["fatal-fault-outputs-off"]["result"], "pass", steps["fatal-fault-outputs-off"].get("detail"))
        self.assertEqual(steps["analog-read"]["result"], "skipped", "the host runtime has no potentiometer")
        self.assertEqual((record["evidence"], record["evidence_level"]), ("host-runtime", None))
        self.assertEqual(code, 0)

    def test_the_overrun_program_does_not_trip_the_instruction_budget_of_the_runtime(self):
        """The real compiler and VM: the overrun step's scan ends inside the budget, so it never latches the VM
        watchdog fault (vm error 8). Whether a host this fast misses a 1 ms deadline is not asserted."""
        os.environ["ZPLC_NATIVE_SIM_BIN"] = RUNTIME
        with tempfile.TemporaryDirectory() as out:
            run_chain.main(["rpi_pico", "--dry-run", "--device", "host", "--out", out, "--operator", "CI", "--only", "il.minimal",
                            "--steps", "overrun-fault-outputs-off"], stdout=io.StringIO())
            record = json.loads(next(Path(out).glob("*.json")).read_text())
        entry = next(s for s in record["steps"] if s["id"] == "overrun-fault-outputs-off")
        self.assertNotEqual(entry["measurements"]["vm_error"], 8, entry.get("detail"))
        self.assertNotEqual(entry["measurements"]["fault"], "vm_fault", entry.get("detail"))


if __name__ == "__main__":
    unittest.main()
