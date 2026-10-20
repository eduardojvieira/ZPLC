"""The bench a hardware chain runs on (the HIL contract; HIL-003, HIL-012, HIL-014).

A bench is what the chain cannot do over the device link: flash an image, wire the board, turn a potentiometer, cut
the power. Two benches implement it:

    HumanBench     a person at a real board. Every physical step is a prompt under the human-presence guard of
                   HIL-003: it needs an interactive terminal, and the person types the identity the board reports.
                   Its records are `hardware` evidence.
    EmulatorBench  an emulator (rp2040js for the Pico, Espressif QEMU for the ESP32-S3), written by the emulator bench
                   in tools/hil/emulator/bench_emulated.py and loaded from there when present. It needs no terminal and
                   its records are always `emulated`: they never raise a support level.

A bench that cannot do a step raises `Unsupported`: the chain records the step as not run (`not-emulable` on an
emulator, `skipped` elsewhere), never as passed. `StandInBench` is the bench of a dry run on a fake device or the host
runtime: it has no wiring and no power to cut, so every physical action is `Unsupported`.

An emulated bench also carries `emulator = {"name", "version", "patch_sha256"}` for the record, and may offer
`sleep(seconds)` when its clock is not the host's.
"""
from __future__ import annotations

import importlib.util
import os
import time
from pathlib import Path
from typing import Protocol

import hil_guard
from hil_ports import resolve_port

EMULATOR_DIR = Path(__file__).resolve().parent / "emulator"


class Unsupported(Exception):
    """This bench cannot do the step: it is recorded as not run, with this reason."""


class Bench(Protocol):
    level: str  # "hardware" | "emulated"

    def port(self) -> str: ...
    def flash(self, image: Path | None) -> None: ...
    def confirm_wiring(self, bench: str) -> None: ...
    def power_cycle(self) -> None: ...
    def cut_power_during_deploy(self, cut_index: int, of: int) -> None: ...
    def set_analog(self, channel: str, fraction: float) -> None: ...
    def now_ms(self) -> float: ...


# The bench wiring of the HIL contract, as the bench guide (docs/docs/development/hardware-in-the-loop.md) describes it.
WIRING = {
    "digital-loopback": (
        "Wire DO0 to DI0, DO1 to DI1, DO2 to DI2 and DO3 to DI3, each through a 1 kΩ resistor in series, with the USB "
        "cable unplugged. Nothing else on those pins. The pins of each channel are in the board's pin map (boards.json)."
    ),
    "analog": "A 10 kΩ linear potentiometer: one end to 3V3, the other end to GND, the wiper to AI0.",
    "modbus-rtu": (
        "UART1 of the Pico: GP4 (TX) to RX of a 3.3 V USB-serial adapter, GP5 (RX) to its TX, GND to GND. The adapter is "
        "plugged into this computer and named with --rtu-port."
    ),
    "network": (
        "The ESP32-S3 joins the same Wi-Fi network as this computer (stored credentials: `wifi connect`); this computer "
        "serves the local Modbus TCP server and MQTT broker on its LAN address."
    ),
}


class HumanBench:
    """A person at a real board. Every action is a prompt; the guard of HIL-003 confirms it."""

    level = "hardware"

    def __init__(self, io, board: dict, port: str | None = None, env=None, clock=time.monotonic):
        hil_guard.require_interactive(io, "the hardware bench")
        self.io, self.board, self.port_arg, self.env, self.clock = io, board, port, env if env is not None else os.environ, clock
        self.identity = ""  # what the device reported at the handshake; the chain sets it
        self.build_command = board.get("build_command", "")
        self.last_confirmation: dict | None = None

    def port(self) -> str:
        return resolve_port(self.port_arg, self.board["ide_id"], self.env)

    def _confirm(self, step_id: str, title: str, instruction: str) -> None:
        if not self.identity:
            raise hil_guard.IdentityMismatch("the device has not reported who it is, so a physical step cannot be confirmed")
        self.last_confirmation = hil_guard.confirm_physical(
            self.io, {"id": step_id, "title": title, "instruction": instruction}, self.identity, wait_first=True
        )

    def flash(self, image: Path | None) -> None:
        """Before the handshake the board has not said who it is: the person presses Enter, and confirms the identity next."""
        self.io.say(
            f"\nPhysical step: flash the firmware image for {self.board['display_name']}\n"
            f"  Build it with exactly this command, from the repository root:\n    {self.build_command}\n"
            f"  and flash {'it' if image is None else image} by the procedure of the bench guide "
            "(docs/docs/development/hardware-in-the-loop.md). Nothing here flashes a board."
        )
        self.io.ask("  Press Enter when the board has restarted: ")

    def confirm_wiring(self, bench: str) -> None:
        self._confirm(f"wiring-{bench}", f"Bench wiring: {bench}", WIRING[bench])

    def power_cycle(self) -> None:
        self._confirm("power-cycle", "Power cycle", "Unplug the USB cable of the board, count to three, and plug it back in.")

    def cut_power_during_deploy(self, cut_index: int, of: int) -> None:
        self._confirm(
            "deploy-cut", f"Power cut during a deploy ({cut_index} of {of})",
            "A program is being sent to the board now. Unplug its USB cable at once, count to three, and plug it back in.",
        )

    def set_analog(self, channel: str, fraction: float) -> None:
        where = {0.0: "fully to the GND end", 1.0: "fully to the 3V3 end"}.get(fraction, f"to {fraction:.0%} of its travel (the middle)")
        self._confirm(f"analog-{channel}-{fraction:.0%}", f"Set {channel} to {fraction:.0%}", f"Turn the potentiometer on {channel} {where}.")

    def now_ms(self) -> float:
        return self.clock() * 1000.0


class StandInBench:
    """The bench of a run on a fake device or the host runtime: no person, no wiring, no power to cut."""

    level = None

    def __init__(self, what: str, clock=time.monotonic):
        self.what, self.clock = what, clock
        self.identity = ""

    def port(self) -> str:
        raise Unsupported(f"{self.what} has no serial port")

    def flash(self, image: Path | None) -> None:
        return None

    def confirm_wiring(self, bench: str) -> None:
        raise Unsupported(f"{self.what} has no bench wiring ({bench})")

    def power_cycle(self) -> None:
        raise Unsupported(f"{self.what} has no power to cycle")

    def cut_power_during_deploy(self, cut_index: int, of: int) -> None:
        raise Unsupported(f"{self.what} has no power to cut")

    def set_analog(self, channel: str, fraction: float) -> None:
        raise Unsupported(f"{self.what} has no potentiometer on {channel}")

    def now_ms(self) -> float:
        return self.clock() * 1000.0


class BenchMissing(Exception):
    pass


def load_emulator_bench(board: dict, directory: Path = EMULATOR_DIR):
    """The EmulatorBench of tools/hil/emulator/bench_emulated.py for `board`; BenchMissing when it is not installed."""
    path = directory / "bench_emulated.py"
    if not path.is_file():
        raise BenchMissing(f"the emulated bench is not installed here ({path} is missing): see tools/hil/emulator")
    spec = importlib.util.spec_from_file_location("bench_emulated", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    bench = module.EmulatorBench(board)
    if getattr(bench, "level", None) != "emulated" or not isinstance(getattr(bench, "emulator", None), dict):
        raise BenchMissing(f"{path}: an emulated bench has level 'emulated' and names its emulator")
    return bench
