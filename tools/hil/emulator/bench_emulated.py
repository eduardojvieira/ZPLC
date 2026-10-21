#!/usr/bin/env python3
"""The emulated bench of the HIL chain: `EmulatorBench(board)` implements the Bench of tools/hil/bench.py.

    Raspberry Pi Pico   rp2040js with the patch of this folder (pico/pico-bench.mts, run by tsx from $ZPLC_EMU_DIR)
    ESP32-S3            Espressif QEMU, machine esp32s3, an emulation-only image (build.sh esp32s3)

Every record made on it is `emulated` evidence: it never raises a board's support level. The bench needs no person
and no terminal, and it never opens a real serial port: the device link opens a host pty that the emulator serves.

    python3 tools/hil/emulator/bench_emulated.py rpi_pico [--image zephyr.uf2]     boot one and print its ports

What it does for each bench action:
    flash(image)          writes the image into the bench's flash file and boots it (the storage partition stays,
                          as with the UF2 bootloader or esptool); no image: the build of build.sh
    confirm_wiring(name)  digital-loopback: connects DO0->DI0 ... DO3->DI3 inside the emulator (Pico);
                          analog: nothing to wire, set_analog injects; modbus-rtu: UART1 is already on `rtu_port`.
                          What the emulator cannot model raises Unsupported, recorded as not emulable.
    power_cycle()         kills the emulator and boots it again on the same flash file
    cut_power_during_deploy(i, of)  the same, at the simulated time the chain reached
    set_analog(ch, f)     sets the ADC input of that channel to f * 4095
    now_ms()              simulated time (Pico); host time on QEMU, whose clock follows the host's
"""
from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import select
import socket
import struct
import subprocess
import sys
import tempfile
import termios
import threading
import time
import tty
from collections import deque
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MANIFEST = ROOT / "firmware/app/boards/boards.json"
PATCH = HERE / "rp2040js-zplc-emu.patch"
sys.path.append(str(HERE.parent))  # tools/hil: the chain's bench module, when it is there

try:
    from bench import Unsupported  # noqa: E402  (tools/hil/bench.py, the HIL contract)
except ImportError:  # the chain's bench module is not in this tree yet

    class Unsupported(Exception):  # type: ignore[no-redef]
        """This bench cannot do the step: it is recorded as not run, with this reason."""


RP2040JS_VERSION = "1.4.1+5fbd2050"
QEMU_VERSION = "esp_develop_9.2.2_20260417"
ESP_FLASH_SIZE = 8 * 1024 * 1024  # ESP32-S3-WROOM-1-N8R8
FLASH_HOOKS = ("flash_range_erase", "flash_range_program", "flash_write_partial")


def die_with_parent() -> None:
    """preexec_fn of an emulator process: the kernel kills it when the chain that started it dies, so a chain stopped by
    SIGKILL or a timeout, which cannot run its cleanup, leaves no emulator behind (Linux; elsewhere it does nothing)."""
    if sys.platform.startswith("linux"):
        import ctypes  # noqa: PLC0415

        ctypes.CDLL(None).prctl(1, 9)  # PR_SET_PDEATHSIG, SIGKILL


def emu_dir() -> Path:
    return Path(os.environ.get("ZPLC_EMU_DIR") or Path.home() / "zplc-emu")


def fw_out() -> Path:
    return Path(os.environ.get("ZPLC_FW_WS") or Path.home() / "zplc-zephyr-ws") / "out"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def find_board(name: str) -> dict:
    for board in json.loads(MANIFEST.read_text()):
        if name in (board["ide_id"], board["board_id"]):
            return board
    raise KeyError(f"{name}: not a board of {MANIFEST.name}")


def gpio_of(pin: str) -> int | None:
    """GP15 -> 15, GPIO5 -> 5, 'GPIO0 (BOOT button)' -> 0."""
    match = re.match(r"GP(?:IO)?(\d+)", pin)
    return int(match.group(1)) if match else None


def adc_of(pin: str) -> int | None:
    """The converter input of an analog pin: 'GP26 (ADC0)' -> 0, 'Temperature sensor (ADC4)' -> 4."""
    match = re.search(r"\bADC(\d)\)", pin)
    return int(match.group(1)) if match else None


def channels(board: dict, kind: str, direction: str) -> list[dict]:
    return [c for c in board["io"]["channels"] if c["kind"] == kind and c["direction"] == direction]


def loopback_pairs(board: dict) -> list[tuple[int, int]]:
    """The bench wiring of the HIL contract as GPIO numbers: DO0->DI0 ... DO3->DI3."""
    inputs = {c["id"]: gpio_of(c["pin"]) for c in channels(board, "digital", "input")}
    pairs = []
    for output in channels(board, "digital", "output"):
        if output["id"] in ("DO0", "DO1", "DO2", "DO3") and inputs.get("DI" + output["id"][2:]) is not None:
            pairs.append((gpio_of(output["pin"]), inputs["DI" + output["id"][2:]]))
    return pairs


def elf_symbols(path: Path, names: tuple[str, ...]) -> dict[str, int]:
    """Addresses of `names` in a 32-bit little-endian ELF (the Thumb bit cleared)."""
    data = path.read_bytes()
    if data[:6] != b"\x7fELF\x01\x01":
        raise ValueError(f"{path}: not a 32-bit little-endian ELF")
    shoff = struct.unpack_from("<I", data, 0x20)[0]
    shentsize, shnum = struct.unpack_from("<HH", data, 0x2E)
    sections = [struct.unpack_from("<10I", data, shoff + i * shentsize) for i in range(shnum)]
    found: dict[str, int] = {}
    for _, kind, _, _, offset, size, link, _, _, _ in sections:
        if kind != 2:  # SHT_SYMTAB
            continue
        strings = sections[link][4]
        for at in range(offset, offset + size, 16):
            name_at, value = struct.unpack_from("<II", data, at)
            start = strings + name_at
            name = data[start : data.index(b"\0", start)].decode(errors="replace")
            if name in names:
                found[name] = value & ~1
    missing = [n for n in names if n not in found]
    if missing:
        raise ValueError(f"{path}: no symbol {', '.join(missing)}")
    return found


def compose_esp_flash(flash: Path, image: bytes, size: int = ESP_FLASH_SIZE) -> None:
    """Write `image` at offset 0 of the flash file, sector by sector, as esptool does: the rest of the flash stays."""
    content = bytearray(flash.read_bytes()) if flash.exists() else bytearray(b"\xff" * size)
    end = -(-len(image) // 4096) * 4096
    content[0:end] = image + b"\xff" * (end - len(image))
    flash.write_bytes(bytes(content))


def open_pty() -> tuple[int, int, str]:
    """(master, slave, slave path) of a raw host pty; the bench keeps the slave open so the path outlives a client."""
    master, slave = os.openpty()
    tty.setraw(slave)
    return master, slave, os.ttyname(slave)


class PicoBench:
    """rp2040js, through pico/pico-bench.mts."""

    emulator_name = "rp2040js"
    # The emulator is too slow for the shell sampling that blink-count fixtures need: the chain reports them as not emulable.
    blink_sampling = False

    def __init__(self, board: dict, workdir: Path):
        self.board, self.workdir = board, workdir
        self.emulator = {"name": "rp2040js", "version": RP2040JS_VERSION, "patch_sha256": sha256_file(PATCH)}
        self.flash_file = workdir / "flash.bin"
        self.log_file = workdir / "pico.log"
        self.cdc = open_pty()
        self.rtu = open_pty()
        self.rtu_port = self.rtu[2]  # the host end of UART1 (GP4 TX, GP5 RX): the chain's Modbus RTU line
        self.image: Path | None = None
        self.wired: list[tuple[int, int]] = []
        self.process: subprocess.Popen | None = None
        self.replies: dict[int, queue.Queue] = {}
        self.events: deque = deque(maxlen=100_000)
        self.ready = threading.Event()
        self.next_id = 0
        self.boots = 0

    # the process ---------------------------------------------------------------------------------------------
    def start(self, write_image: bool) -> None:
        if self.image is None:  # the port is opened before a flash: the board runs the build of build.sh
            self.image, write_image = self.default_image(None), True
        tsx = emu_dir() / "rp2040js/node_modules/tsx/dist/loader.mjs"
        if not tsx.exists():
            raise RuntimeError(f"rp2040js is not installed in {emu_dir()}: run tools/hil/emulator/setup.sh")
        for master, _, _ in (self.cdc, self.rtu):
            termios.tcflush(master, termios.TCIOFLUSH)  # nothing sent while the power was off reaches the new boot
        config = {
            "emu": str(emu_dir()), "flash": str(self.flash_file), "uf2": str(self.image) if write_image else None,
            "hooks": elf_symbols(self.image.with_name("zephyr.elf"), FLASH_HOOKS),
            "wiring": self.wired, "pullups": [gpio_of(c["pin"]) for c in channels(self.board, "digital", "input")],
            "cdcFd": self.cdc[0], "rtuFd": self.rtu[0], "log": str(self.log_file), "realtime": True,
        }
        self.ready.clear()
        self.boots += 1
        with self.log_file.open("a") as log:
            log.write(f"\n[bench] boot {self.boots}{' with ' + str(self.image) if write_image else ''}\n")
        # node itself, with tsx as its loader: the tsx command would run the script in a child that has no pty fds
        self.process = subprocess.Popen(
            ["node", "--import", tsx.as_uri(), str(HERE / "pico/pico-bench.mts"), json.dumps(config)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log_file.open("a"), text=True, bufsize=1,
            pass_fds=(self.cdc[0], self.rtu[0]), preexec_fn=die_with_parent, env={**os.environ, "TSX_TSCONFIG_PATH": str(emu_dir() / "rp2040js/tsconfig.json")},
        )
        threading.Thread(target=self._read, args=(self.process,), daemon=True).start()
        if not self.ready.wait(120):
            raise RuntimeError(f"the emulated Pico did not finish booting its shell on USB within 120 s (see {self.log_file})")

    def _read(self, process: subprocess.Popen) -> None:
        for line in process.stdout:
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            if "id" in message:
                self.replies.pop(message["id"], queue.Queue()).put(message)
            elif message.get("event") == "settled":
                self.ready.set()
            elif message.get("event"):
                self.events.append(message)

    def alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def request(self, cmd: str, timeout: float = 30.0, **args) -> dict:
        if not self.alive():
            self.start(write_image=False)  # it reset (a watchdog) or died: boot it again, as a chip would
        self.next_id += 1
        waiting = self.replies[self.next_id] = queue.Queue()
        self.process.stdin.write(json.dumps({"id": self.next_id, "cmd": cmd, **args}) + "\n")
        self.process.stdin.flush()
        try:
            reply = waiting.get(timeout=timeout)
        except queue.Empty as error:
            raise RuntimeError(f"the emulated Pico did not answer {cmd} within {timeout:.0f} s") from error
        if "error" in reply:
            raise RuntimeError(reply["error"])
        return reply

    def kill(self) -> None:
        if self.process is not None:
            self.process.kill()
            self.process.wait()
            self.process = None

    # the bench -----------------------------------------------------------------------------------------------
    def port(self) -> str:
        if not self.alive():
            self.start(write_image=False)
        return self.cdc[2]

    @staticmethod
    def default_image(image: Path | None) -> Path:
        path = Path(image) if image else Path(os.environ.get("ZPLC_EMU_IMAGE") or fw_out() / "emu-pico/zephyr/zephyr.uf2")
        return path if path.suffix == ".uf2" else path.with_name("zephyr.uf2")

    def flash(self, image: Path | None) -> None:
        self.kill()
        self.image = self.default_image(image)
        self.start(write_image=True)

    def confirm_wiring(self, bench: str) -> None:
        if bench == "digital-loopback":
            self.wired = loopback_pairs(self.board)
            self.request("wire", pairs=self.wired)
        elif bench not in ("analog", "modbus-rtu"):
            raise Unsupported(f"the emulated Pico has no {bench} (rp2040js models no network)")

    def power_cycle(self) -> None:
        self.kill()
        self.start(write_image=False)

    def cut_power_during_deploy(self, cut_index: int, of: int) -> None:
        if self.alive():
            self.process.stdin.write(json.dumps({"id": 0, "cmd": "cut"}) + "\n")
            self.process.stdin.flush()
            try:
                self.process.wait(30)
            except subprocess.TimeoutExpired:
                self.kill()
        self.start(write_image=False)

    def set_analog(self, channel: str, fraction: float) -> None:
        found = next((c for c in channels(self.board, "analog", "input") if c["id"] == channel), None)
        if found is None or adc_of(found["pin"]) is None:
            raise Unsupported(f"{channel} is not an ADC input of {self.board['board_id']}")
        self.request("adc", ch=adc_of(found["pin"]), raw=round(max(0.0, min(1.0, fraction)) * 4095))

    def now_ms(self) -> float:
        return self.request("now")["now_ms"]

    def sleep(self, seconds: float) -> None:
        self.request("sleep", timeout=max(60.0, seconds * 20), ms=seconds * 1000)

    def drive(self, channel: str, active: bool) -> None:
        """Press (active) or release a button on a digital input: an active-low switch to GND."""
        found = next(c for c in channels(self.board, "digital", "input") if c["id"] == channel)
        self.request("pin", gpio=gpio_of(found["pin"]), value=0 if active else 1)

    def pins(self) -> dict:
        return self.request("pins")

    def close(self) -> None:
        self.kill()
        for master, slave, _ in (self.cdc, self.rtu):
            os.close(master)
            os.close(slave)


class Esp32s3Bench:
    """Espressif QEMU, machine esp32s3, with the emulation-only image of build.sh esp32s3."""

    # QEMU ran the board's clock at a tenth to a third of the host's, depending on the load of the machine: the tester
    # gives a program ten times the host time it would on a board. Timing steps measure QEMU here, not the firmware.
    pace = 10.0

    NOT_EMULABLE = {
        "digital-loopback": "Espressif QEMU has no GPIO input/output model for the ESP32-S3",
        "analog": "Espressif QEMU has no SAR ADC model (the emulation image builds with adc0 off)",
        "network": "Espressif QEMU has no Wi-Fi model",
        "modbus-rtu": "the ESP32-S3 profile has no Modbus RTU port",
    }

    def __init__(self, board: dict, workdir: Path):
        self.board, self.workdir = board, workdir
        self.emulator = {"name": "espressif-qemu", "version": QEMU_VERSION, "patch_sha256": None}
        self.flash_file = workdir / "flash.bin"
        self.log_file = workdir / "qemu.log"
        self.process: subprocess.Popen | None = None
        self.uart = open_pty()  # the device link's port: it outlives a power cycle, as the Pico's does
        # a socket path has at most 107 bytes: a short directory of its own, not the bench's
        self.socket_path = Path(tempfile.mkdtemp(prefix="zplc-qemu-")) / "uart0.sock"

    def alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    @staticmethod
    def default_image(image: Path | None) -> Path:
        path = Path(image) if image else Path(os.environ.get("ZPLC_EMU_IMAGE") or fw_out() / "emu-esp32s3/zephyr/zephyr.bin")
        return path if path.suffix == ".bin" else path.with_name("zephyr.bin")

    def start(self) -> None:
        if not self.flash_file.exists():  # the port is opened before a flash: the board runs the build of build.sh
            compose_esp_flash(self.flash_file, self.default_image(None).read_bytes())
        qemu = emu_dir() / "qemu-esp/qemu/bin/qemu-system-xtensa"
        if not qemu.exists():
            raise RuntimeError(f"Espressif QEMU is not installed in {emu_dir()}: run tools/hil/emulator/setup.sh")
        termios.tcflush(self.uart[0], termios.TCIOFLUSH)  # nothing sent while the power was off reaches the new boot
        self.socket_path.unlink(missing_ok=True)
        # -no-reboot: a reset of the chip ends QEMU, and the next port() boots it again on the same flash file
        self.process = subprocess.Popen(
            [str(qemu), "-nographic", "-machine", "esp32s3", "-m", "8M", "-global", "ssi_psram.is_octal=true",
             "-drive", f"file={self.flash_file},if=mtd,format=raw", "-serial", f"unix:{self.socket_path},server=on,wait=on",
             "-monitor", "none", "-no-reboot"],
            stdin=subprocess.DEVNULL, stdout=self.log_file.open("a"), stderr=subprocess.STDOUT, preexec_fn=die_with_parent,
        )
        link = socket.socket(socket.AF_UNIX)
        deadline = time.monotonic() + 30
        while True:
            try:
                link.connect(str(self.socket_path))
                break
            except OSError:
                if time.monotonic() > deadline or not self.alive():
                    raise RuntimeError(f"QEMU did not open its UART0 socket (see {self.log_file})") from None
                time.sleep(0.05)
        self.tail, self.last_output = "", time.monotonic()
        threading.Thread(target=self._bridge, args=(link,), daemon=True).start()
        # the boot is over when the shell has printed its prompt and then been quiet for 300 ms: the boot messages it
        # prints would otherwise interleave with the first answers, which a person waiting for a restart never sees
        deadline = time.monotonic() + 60
        while "zplc:~$" not in self.tail or time.monotonic() - self.last_output < 0.3:
            if time.monotonic() > deadline or not self.alive():
                raise RuntimeError(f"the emulated ESP32-S3 did not finish booting its shell within 60 s (see {self.log_file})")
            time.sleep(0.05)

    def _bridge(self, link: socket.socket) -> None:
        """Copy bytes between the bench's pty and QEMU's UART0 until QEMU goes away."""
        master = self.uart[0]
        with link:
            while True:
                ready, _, _ = select.select([master, link], [], [], 0.5)
                try:
                    if link in ready:
                        data = link.recv(4096)
                        if not data:
                            return
                        os.write(master, data)
                        self.tail, self.last_output = (self.tail + data.decode("latin-1"))[-64:], time.monotonic()
                    if master in ready:
                        link.sendall(os.read(master, 4096))
                except OSError:
                    return

    def kill(self) -> None:
        if self.process is not None:
            self.process.kill()
            self.process.wait()
            self.process = None

    def port(self) -> str:
        if not self.alive():
            self.start()
        return self.uart[2]

    def flash(self, image: Path | None) -> None:
        self.kill()
        compose_esp_flash(self.flash_file, self.default_image(image).read_bytes())
        self.start()

    def confirm_wiring(self, bench: str) -> None:
        raise Unsupported(self.NOT_EMULABLE.get(bench, f"the emulated ESP32-S3 has no {bench}"))

    def power_cycle(self) -> None:
        self.kill()
        self.start()

    def cut_power_during_deploy(self, cut_index: int, of: int) -> None:
        self.power_cycle()

    def set_analog(self, channel: str, fraction: float) -> None:
        raise Unsupported(self.NOT_EMULABLE["analog"])

    def now_ms(self) -> float:
        return time.monotonic() * 1000.0

    def close(self) -> None:
        self.kill()
        os.close(self.uart[0])
        os.close(self.uart[1])


BACKENDS = {"rpi-pico-rp2040": PicoBench, "esp32-s3-devkitc": Esp32s3Bench}


class EmulatorBench:
    """The Bench of the HIL contract on an emulator. `level` is always "emulated"."""

    level = "emulated"

    def __init__(self, board: dict | str, workdir: Path | None = None):
        self.board = find_board(board) if isinstance(board, str) else board
        backend = BACKENDS.get(self.board["board_id"])
        if backend is None:
            raise Unsupported(f"no emulator for {self.board['board_id']} (emulated: {', '.join(BACKENDS)})")
        workdir = Path(workdir or os.environ.get("ZPLC_EMU_BENCH_DIR") or ROOT / "build/hil-emu" / self.board["board_id"])
        workdir.mkdir(parents=True, exist_ok=True)
        if not os.environ.get("ZPLC_EMU_KEEP_FLASH"):
            (workdir / "flash.bin").unlink(missing_ok=True)  # a bench run starts from erased flash
        self.backend = backend(self.board, workdir)
        self.emulator = self.backend.emulator
        self.identity = ""  # what the device reported at the handshake; the chain sets it
        self.build_command = self.board.get("build_command", "")
        self.last_confirmation = None
        self.actions: list[dict] = []  # what the bench did, for the record

    def __getattr__(self, name: str):
        if name == "backend":
            raise AttributeError(name)
        return getattr(self.backend, name)  # rtu_port, drive, pins, events, close, ...

    def _did(self, action: str, **detail) -> None:
        self.actions.append({"action": action, **detail})

    def port(self) -> str:
        return self.backend.port()

    def flash(self, image: Path | None) -> None:
        self.backend.flash(image)
        self._did("flash", image=str(image) if image else "default")

    def confirm_wiring(self, bench: str) -> None:
        self.backend.confirm_wiring(bench)
        self._did("wiring", bench=bench)

    def power_cycle(self) -> None:
        self.backend.power_cycle()
        self._did("power-cycle")

    def cut_power_during_deploy(self, cut_index: int, of: int) -> None:
        self.backend.cut_power_during_deploy(cut_index, of)
        self._did("power-cut", cut=cut_index, of=of)

    def set_analog(self, channel: str, fraction: float) -> None:
        self.backend.set_analog(channel, fraction)
        self._did("analog", channel=channel, fraction=fraction)

    def now_ms(self) -> float:
        return self.backend.now_ms()

    def sleep(self, seconds: float) -> None:
        getattr(self.backend, "sleep", time.sleep)(seconds)


def main(argv: list[str] | None = None) -> int:
    import argparse  # noqa: PLC0415

    parser = argparse.ArgumentParser(description="Boot a board on its emulator and print the ports to open.")
    parser.add_argument("board", help="ide_id or board_id (rpi_pico, esp32s3_devkitc)")
    parser.add_argument("--image", help="the image to flash (default: the build of build.sh)")
    args = parser.parse_args(argv)
    bench = EmulatorBench(args.board)
    bench.flash(Path(args.image) if args.image else None)
    print(json.dumps({"port": bench.port(), "rtu_port": getattr(bench.backend, "rtu_port", None), "emulator": bench.emulator}))
    print("emulated, not hardware. Ctrl-C stops it.", flush=True)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        bench.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
