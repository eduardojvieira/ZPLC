---
slug: /development/hardware-in-the-loop
title: Hardware in the Loop
sidebar_label: Hardware in the Loop
description: How a person runs the ZPLC hardware tests at the bench, what each tool checks and writes, which tests also run on the host without a board, and what is still missing before a board has hardware evidence.
---

# Hardware in the Loop

This page is for the person at the bench. A board is a physical thing, so a
person starts every command that touches one: AI tools and MCP do not flash,
deploy, force, start or stop a board, or open its serial shell, and no flag lets
a script do it for them.

Nothing here is hardware evidence until a record exists for a board and a
firmware image (see [Run records](#run-records)). Everything the continuous
integration runs is host evidence: it proves the tools, not a board.

## What runs where

| Level | What it shows | Where |
|-------|---------------|-------|
| Host | Every language fixture compiles with the repository compiler and holds its expected values on the native runtime; the device scripts exit non-zero when a check fails; the scenario engine runs on the hardware port against the native runtime. | CI, and any machine with the repository |
| Board | The same fixtures and scenarios on a flashed board, and the physical steps. | A person, at the bench |

The host level does not show that a pin drives, that a timer keeps its period
on real silicon, or that a watchdog resets in time. Those need the board level.

## The tools

| Tool | Use |
|------|-----|
| `python3 tools/hil/run_chain.py <board> [--bench human\|emulated]` | One command per board. Prompts for each physical step, measures the HIL-010 steps and writes a run record. |
| `python3 tools/hil/compare_sim.py <board> [--bench human\|emulated]` | Runs the reference projects in native simulation and on the bench and records every difference (HIL-015). |
| `bun packages/zplc-hil/src/cli.ts run --board <id> --workspace <dir> --scenario <file>` | Runs a scenario file of a project on a board. The scenario is the file Studio runs on the host. |
| `python3 tools/hil/run_all_languages.py` | The IL, LD, FBD, SFC and ST fixtures and the reference projects, on the device. |
| `python3 tools/hil/run_all_hil_tests.py` | The opcode-level scripts. They need a firmware image that prints the HIL trace. |
| `python3 tools/hil/verify_compilation.py` | Compiles every fixture and reference project. No device. |

`<board>` is the `ide_id` of the board in
`firmware/app/boards/boards.json`, for example `rpi_pico`.

### The serial port

The port is, in this order: `--port`, the `ZPLC_SERIAL_PORT` environment
variable, then found from the USB identifiers of the board in
`tools/hil/usb-ids.json`. When more than one device matches, or none does, the
tool stops and lists what it saw; it never guesses. No port path is written in
a script, and the tools run on Linux, macOS and Windows.

### Without a board

`ZPLC_HIL_DEVICE=host` (with `ZPLC_NATIVE_SIM_BIN` naming the `zplc_runtime`
binary) and `ZPLC_HIL_DEVICE=null` stand in for a board. A record made on a
stand-in says `host-runtime` or `fake` as its evidence, never `hardware`.

Every record also says its evidence level: `hardware` for a person's bench,
`emulated` for the emulated bench (with the emulator, its version and the hash
of its patch), `community-reported` for a user's report, and none for a
stand-in. Only `hardware` raises a board's support level; an emulated record
never does.

## Exit status

| Status | Meaning |
|--------|---------|
| 0 | Every check held. |
| 1 | A check failed, or the script made no check. |
| 2 | No device could be used: no port was chosen, the port would not open, or a program would not compile. |
| 77 | Skipped: the firmware image has no HIL trace. This is not a pass. |

Scripts that only look at a board and judge nothing (`check_alive.py`,
`check_hw.py`, `debug_peek.py`, `inspect_zplc.py`, `rescue.py`,
`rescue_device.py`, `sniff.py`) are listed with their reason in
`tools/hil/non-gating.json`.

## The chain

`run_chain.py` does this, in order, and stops at the first step that fails:

1. **Preflight.** The board is in the manifest and the fixtures of the run
   compile with the repository compiler, for the board.
2. **Flash.** You flash the image. The tool does not.
3. **Identity handshake.** The tool asks the device who it is
   (`zplc sys info --json`) and which image it is (`zplc sys build --json`:
   version, commit, whether the tree was dirty, board, ABI, draft, and the build
   options with their hash), and records both. The build command the tool told
   you to run is in the record too.
4. **I/O description.** The device says which board I/O description its
   image was built from (`zplc sys io --json`: board id, hash, channel count and
   image bytes). The tool compares it with `boards.json` for the board and
   fails the run when they differ. An image that reports none is recorded as
   skipped, not passed.
5. **Trace option.** The image's options say whether the HIL trace is on.
   The run fails when that is not what it asked for: release firmware carries
   no trace, and `--hil-trace` asks for the image with it.
6. **Confirm the board.** You type the identity the device reported. Enter
   alone does not confirm.
7. **Outputs are safe to drive.** You type the identity again, saying that
   nothing connected to the outputs can hurt anyone.
8. **Deploy, run.** A program is uploaded and the scan counter must advance.
9. **Fixtures.** The blink of each of the five languages runs (every fixture
   tagged for hardware with `--all-fixtures`), with inputs forced and released.
10. **Force set and release.** A force is set, listed, cleared, and no force
    remains.
11. **Stop.** The device is not running and the output image is zero.

12. **The measuring steps of HIL-010.** Digital loopback, analog read, timer
    accuracy, ten minutes of scan jitter, outputs off after an overrun and after
    a fatal fault, outputs safe after STOP and after link loss with forces
    active, watchdog reset time, a power cycle with RETAIN, twenty power cuts
    during deploys, an atomic write and one fieldbus exchange. Each writes its
    measurements and its verdict into the record; the
    [bench guide](#bench-guide) lists them with their wiring and pass rules.

The chain writes a record whether it passes or fails, and says before it
starts how long it takes (about 31 minutes on a person's bench). A step that
the bench cannot do is recorded as `skipped` (or `not-emulable` on an
emulator), never as passed. A dry run or a run on a stand-in runs the measuring
steps only when `--steps` names them.

### The evidence record

A run on real hardware that ends in pass or fail, of a firmware image named
with `--firmware-image` whose device reports a 40-digit commit from a tree
without uncommitted changes, also writes `<run>.evidence.json` next to the run
record. It is the flat record `firmware/zephyr/scripts/zplc_boards.py` derives
a board's support level from: schema `zplc.hil-record/1`, `board_id`, firmware
version, commit, the SHA-256 of the image, and the result, with the list of what
the run did not cover. When one of those is missing the run record says why no
evidence record was written (log `evidence-record`). Adding the file to
`evidence_refs` of the board in `boards.json` is your edit, after you have read
the run record; a run on a stand-in never writes one.

### A report from a user

Someone else's result on their board enters the same list at a lower level. The
"Board report" form asks for the board, the firmware version, the commit and the
SHA-256 of the image, and the result. A maintainer who has read the issue runs
`python3 tools/hil/community_report.py` with those values and the address of the
issue, which writes a `zplc.community-report/1` record, and adds the file to
`evidence_refs` of the board. The generated board table lists it as
`community-reported`. It is a lead: it never raises the support level, and it
never turns the hardware watchdog of the profile on.

When a tool is started without an interactive terminal it exits with status 2
and says why, before it opens a port.

## Fixtures

`tools/hil/il_tests`, `ld_tests`, `fbd_tests`, `sfc_tests`, `st_tests` and
`blinky_ld_gen.st` hold the language fixtures, and `tools/hil/fixtures.json`
holds the expected value of every phase of every one. A phase sets inputs,
lets the program run a number of scans and checks outputs. Compiled files are
made when a run needs them, in a temporary directory that is removed, and are
not kept in the repository.

Values are read while the program runs. STOP puts the outputs in their safe
state, so an output reads zero after it whatever the program computed.

The opcode-level scripts read HIL trace frames, which only a firmware image
built with `CONFIG_ZPLC_HIL_DEBUG=y` prints. Release firmware does not carry
the trace in its VM loop, and no board profile turns it on; on a release image
those scripts exit 77. A HIL image is the profile plus `tools/hil/hil_debug.conf`:

```bash
west build -b rpi_pico/rp2040 firmware/app --pristine -- -DEXTRA_CONF_FILE=$PWD/tools/hil/hil_debug.conf
```

`run_chain.py <board> --hil-trace` prints the command for the board and
records it. Do not publish an image built with the overlay: its options hash
differs from the release's, and the record says the trace is on.

## Scenarios on a board

A scenario file that runs on the host with `zplc-cli scenario-run` runs on a
board through the hardware runtime port of the scenario engine:

- time is the device's clock: a tick is sampled once the device has reached it
  and has completed a scan since the inputs were forced;
- inputs are forced, not written, because the board rewrites its input image on
  every scan; the forced byte replaces all eight bits of it for the run;
- a sample taken later than the declared tolerance, `--tolerance-ms` (50 ms by
  default), voids the run, and the tolerance is written in the record;
- every force the tool set is cleared at the end and on abort, and the board is
  left stopped. If the link is lost the device releases the forces itself.

## Run records

Every hardware run writes a JSON record, described by
`tools/hil/run-record.schema.json`, to `build/hil-records/` or the directory of
`--out`. It holds the board and what the device reported, the firmware commit,
version and ABI as the image reports them, the hash of every program and of the
image you say you flashed, each step with its result and the time you confirmed
it, the tests, the tool versions, the operator and the raw shell log.

Fields that the firmware image cannot report yet are `null`: the record says it
does not know, and it does not guess. A record is bound to the image it tested.
Commit it afterwards, never in the commit the image was built from: the HIL
Python tests that CI runs check that the image commit of every record the
manifest references is a strict ancestor of the commit that added the record.

## Bench guide

This is the bench that `run_chain.py` asks for, step by step, on the two
learner boards. The emulated bench (`--bench emulated`)
applies the same wiring virtually; its records say `emulated`.

**No step of this guide has been run on a physical board yet.** The
"Hardware" column below says so for every step, and it changes only when a
person runs the chain and commits its record.

### Parts

The course kit (`packages/zplc-ide/lessons/kit.json`: the board, a data USB
cable, a breadboard, LEDs with 330 Ω resistors, buttons, a 10 kΩ linear
potentiometer, a 100 nF capacitor and jumper wires), and for the bench:

- four 1 kΩ resistors, one in series in each loopback wire;
- Raspberry Pi Pico only: a USB-serial adapter with 3.3 V logic (for example
  CP2102, CH340 or FT232 set to 3.3 V) for the Modbus RTU exchange;
- ESP32-S3 only: a Wi-Fi network that this computer is on too;
- a multimeter is useful for the 50 % point of the analog step, not required.

### Voltage limits

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above
  3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about
  4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you
  plug it in.

### Wiring

Each output is wired to the input of the same number through a 1 kΩ resistor.
Nothing else is connected to those pins during the run. The pin map of the
board in Studio (from `firmware/app/boards/boards.json`) is the reference when
it differs from this table.

| Wire | Raspberry Pi Pico | ESP32-S3-DevKitC-1 |
|------|-------------------|--------------------|
| DO0 → 1 kΩ → DI0 | GP0 (pin 1) → GP15 (pin 20) | GPIO15 (J1-8) → GPIO5 (J1-5) |
| DO1 → 1 kΩ → DI1 | GP1 (pin 2) → GP14 (pin 19) | GPIO16 (J1-9) → GPIO6 (J1-6) |
| DO2 → 1 kΩ → DI2 | GP2 (pin 4) → GP13 (pin 17) | GPIO17 (J1-10) → GPIO7 (J1-7) |
| DO3 → 1 kΩ → DI3 | GP3 (pin 5) → GP12 (pin 16) | GPIO18 (J1-11) → GPIO8 (J1-12) |
| Potentiometer ends | 3V3(OUT) (pin 36) and AGND (pin 33) | 3V3 (J1-1) and GND (J1-22) |
| Potentiometer wiper → AI0 | GP26/ADC0 (pin 31) | GPIO4/ADC1_CH3 (J1-4) |
| Modbus RTU | GP4 (pin 6, TX) → adapter RX, GP5 (pin 7, RX) ← adapter TX, GND (pin 8) → adapter GND | (none) |
| Network | (none) | Wi-Fi, credentials stored with `wifi connect` |

The inputs use their internal pull-up and are active-low in the firmware, so
through the loopback an input reads the inverse of its output. The chain
accepts either polarity, as long as each input follows its own output and no
other input moves.

### Procedure

The procedure is the chain, one command per board:

```bash
python3 tools/hil/run_chain.py rpi_pico --firmware-image <zephyr.uf2> --rtu-port <USB-serial adapter>
python3 tools/hil/run_chain.py esp32s3_devkitc --firmware-image <zephyr.bin> [--host-ip <this computer on the Wi-Fi>]
```

Before it starts, the chain says how long it takes on this bench: about
31 minutes, of which ten are the scan jitter step and about eight the twenty
power cuts. The jitter step runs alone, because every other step stops,
deploys or cuts the power. It runs the blink of the five languages by
default; `--all-fixtures` adds every fixture tagged for hardware (HIL-005),
about seven minutes more.

The image under test is the HIL build: the board's build command with
`-DCONFIG_ZPLC_HARDWARE_WATCHDOG=y`, which the chain prints, because RT-020
asks for the record to be made with the watchdog on. Today
`firmware/app/CMakeLists.txt` refuses that option while `boards.json` keeps the
watchdog off; until the HIL build is allowed, `--no-watchdog-build` prints the
plain command, and the watchdog step then fails and says why.

The RETAIN step needs an image built with `-DCONFIG_ZPLC_RETAIN_PERSIST=y`.
RETAIN persistence is off in every shipped profile until a board has a hardware
record, and the printed command does not add the option yet, so on such an
image the step fails and says that the image cannot keep RETAIN. On the Pico
the option does not build at all with the profile's 64 KB storage partition and
24 KB code size: the storage check of the build (RT-029) stops it, because two
program slots, the two RETAIN records and a spare sector do not fit.

Flashing is yours. The Pico: hold BOOTSEL while you plug in the USB cable and
copy `zephyr.uf2` to the RPI-RP2 drive. The ESP32-S3: `esptool --chip esp32s3
--port <port> write-flash 0x0 zephyr.bin` on the port labelled USB, then press
RST if the board stays in download mode.

| # | Step | What the chain does | Passes when | Hardware | Emulated |
|---|------|---------------------|-------------|----------|----------|
| 1 | Preflight | Compiles the fixtures for the board | Every fixture compiles | Not run yet | Filled in from the emulated records |
| 2 | Flash | You flash the HIL build | The board restarts | Not run yet | Filled in from the emulated records |
| 3 | Identity handshake | Reads `zplc sys info` and `zplc sys build` | The device answers with a board | Not run yet | Filled in from the emulated records |
| 4 | I/O description | Compares `zplc sys io` with `boards.json` | They agree | Not run yet | Filled in from the emulated records |
| 5 | Trace option | Reads the image's options | The HIL trace is what the run asked for | Not run yet | Filled in from the emulated records |
| 6 | Confirm the board | You type the identity the device reports | It matches | Not run yet | No person on an emulator |
| 7 | Outputs are safe to drive | You type the identity again | It matches | Not run yet | No person on an emulator |
| 8 | Deploy, run | Uploads a program and starts it | The scan counter advances | Not run yet | Filled in from the emulated records |
| 9 | Blink in five languages | Runs the ST, IL, LD, FBD and SFC blinks | Each output toggles as its fixture expects | Not run yet | Filled in from the emulated records |
| 10 | Force set and release | Sets, lists and clears a force | No force remains | Not run yet | Filled in from the emulated records |
| 11 | Stop | Stops the board | Not running, output image zero | Not run yet | Filled in from the emulated records |
| 12 | Digital loopback | Forces each output on and off alone and reads the inputs | Each input follows its own output, no other moves | Not run yet | Filled in from the emulated records |
| 13 | Analog read | Asks you to turn the potentiometer to 0 %, 50 % and 100 % and reads AI0 | Within 5 % of full scale at the ends, 10 % in the middle | Not run yet | Filled in from the emulated records |
| 14 | Timer accuracy | Runs a TON of 3 s and times its output from RUN with the bench clock | Between 3000 ms minus one scan and 3000 ms plus one scan, 100 ms and two read round trips | Not run yet | Filled in from the emulated records |
| 15 | Scan jitter, ten minutes | Runs a 10 ms task for ten minutes and reads the runtime's statistics every 30 s | No overrun, no deadline miss, each window's mean period within 1 % | Not run yet | Filled in from the emulated records |
| 16 | Overrun | Runs a 1 ms task that drives DO0 and loops for half of the image's VM instruction budget (a scan past the budget latches the VM watchdog fault instead) | The `deadline_miss` fault latches within 10 s and the outputs are off | Not run yet | Filled in from the emulated records |
| 17 | STOP and link loss with forces | Forces the outputs on and stops; then forces them in a device-link session and falls silent for the session's idle time (30 s by default) | Outputs off after STOP, and the session's forces released after the silence | Not run yet | Filled in from the emulated records |
| 18 | Watchdog reset time | Runs a scan that never ends | Reset cause `watchdog`, the reset between 90 % of the timeout and the timeout plus 500 ms, back in STOP with outputs off | Not run yet | Filled in from the emulated records |
| 19 | Fatal fault | Divides by zero after 20 scans of a program that drives DO0 | The `vm_fault` fault latches within 10 s and the outputs are off | Not run yet | Filled in from the emulated records |
| 20 | Power cycle and RETAIN | Checks that the image was built with RETAIN persistence, counts in a RETAIN variable, stops (which saves it) and asks you to unplug and plug the board | STOP after power-up, the RETAIN value kept, the program still there | Not run yet | Filled in from the emulated records |
| 21 | 20 power cuts during deploy | Loads program A, sends a part of program B (from one twentieth to all of it) and asks you to unplug at once | After every cut the board is in STOP and runs A or B whole | Not run yet | Filled in from the emulated records |
| 22 | Atomic write | Writes a four-byte value 100 times over the device link while the program counts torn values | No scan saw a half-written value | Not run yet | Filled in from the emulated records |
| 23 | Fieldbus exchange | Pico: turns on the device's Modbus RTU client at 19200 baud, stores it and restarts the board (the client starts at boot only), then reads holding register 100 from a Modbus RTU server on this computer, on a line opened at 19200 baud. ESP32-S3: writes and reads back a register on the Modbus TCP server and hears an MQTT publish back through the broker of `zplc_loopback`, reached on this computer's LAN address | The value read is 0x5A17, with no error | Not run yet | Filled in from the emulated records |

A person cannot cut the power at the exact moment the program is written to
flash, so on a board step 21 tests the cuts at the points a hand can reach; the
emulated bench cuts at scripted points.

## Simulation and hardware (HIL-015)

`python3 tools/hil/compare_sim.py <board>` compiles each reference project of
Studio (the LD, FBD and SFC blinkies and the LD motor control) for the board,
runs it on the native runtime and on the bench with the same inputs at the
same times, and compares the output traces. Every difference, another sequence
of output values or a change more than `--tolerance-ms` (100 ms) away from its
twin, goes into a comparison record in `build/hil-records/`. A difference found
on hardware belongs in the simulator's capability profile
([native session contract](../runtime/intro.md)).

| Board | Differences on hardware | Differences emulated |
|-------|-------------------------|----------------------|
| Raspberry Pi Pico | Not run yet | Filled in from the emulated records |
| ESP32-S3-DevKitC-1 | Not run yet | Filled in from the emulated records |
