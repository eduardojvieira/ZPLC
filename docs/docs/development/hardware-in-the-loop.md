---
slug: /development/hardware-in-the-loop
title: Hardware in the Loop
unlisted: true
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
| `python3 tools/hil/run_chain.py <board>` | One command per board. Prompts for each physical step and writes a run record. |
| `bun packages/zplc-hil/src/cli.ts run --board <id> --workspace <dir> --scenario <file>` | Runs a scenario file of a project on a board. The scenario is the file Studio runs on the host. |
| `python3 tools/hil/run_all_languages.py` | The IL, LD, FBD, SFC and ST fixtures and the reference projects, on the device. |
| `python3 tools/hil/run_all_hil_tests.py` | The opcode-level scripts. They need a firmware image that prints the HIL trace. |
| `python3 tools/hil/verify_compilation.py` | Compiles every fixture and reference project. No device. |

`<board>` is the `ide_id` of the board in
`firmware/app/boards/supported-boards.v1.5.0.json`, for example `rpi_pico`.

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

1. **Preflight.** The board is in the manifest and every hardware fixture
   compiles with the repository compiler.
2. **Flash.** You flash the image. The tool does not.
3. **Identity handshake.** The tool asks the device who it is
   (`zplc sys info --json`) and records the board, the versions and, when the
   image reports it, the build.
4. **Confirm the board.** You type the identity the device reported. Enter
   alone does not confirm.
5. **Outputs are safe to drive.** You type the identity again, saying that
   nothing connected to the outputs can hurt anyone.
6. **Deploy, run.** A program is uploaded and the scan counter must advance.
7. **Fixtures.** The fixtures tagged for hardware run, one after another, with
   their inputs forced and released.
8. **Force set and release.** A force is set, listed, cleared, and no force
   remains.
9. **Stop.** The device is not running and the output image is zero.

The chain writes a record whether it passes or fails. The steps of the
hardware tests the chain does not run yet are in the record as `pending`, each
with what it lacks:

- digital loopback, analog read, timer accuracy and scan jitter over ten
  minutes, which need the board's I/O description and a wiring step;
- the fault and watchdog behaviours, which need fault-injection fixtures and
  the runtime behaviours they measure;
- STOP and RETAIN after a power cycle, and no partial program after twenty
  power interruptions during deploy, which need a person to cut the power;
- the atomic multi-byte write, which needs the framed protocol on the device;
- one fieldbus exchange per board, which the Modbus scripts do against a local
  endpoint that you provide.

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
built with `CONFIG_ZPLC_HIL_DEBUG=y` prints. Release firmware must not carry
the trace in its VM loop, and on such an image those scripts exit 77. The
Pico and ESP32-S3 board profiles set the option today.

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
Commit it afterwards, never in the commit the image was built from.

## Bench guide

The wiring, the parts and the procedure that was executed for the two learner
boards are written by the person who does the bench run. Until then every
detail below is a placeholder, and none of it has been done.

### Raspberry Pi Pico (`rpi_pico`)

| Item | Value |
|------|-------|
| Firmware image and how it was flashed | TO BE FILLED by the person who did the bench run |
| USB cable and port seen by the host | TO BE FILLED |
| Digital loopback: which output is wired to which input | TO BE FILLED |
| Analog input: the source and its known voltage | TO BE FILLED |
| Modbus RTU adapter and wiring | TO BE FILLED |
| Date, operator and record file | TO BE FILLED |

### ESP32-S3 DevKitC (`esp32s3_devkitc`)

| Item | Value |
|------|-------|
| Firmware image and how it was flashed | TO BE FILLED by the person who did the bench run |
| USB cable, UART bridge and port seen by the host (its USB identifiers go in `tools/hil/usb-ids.json`) | TO BE FILLED |
| Digital loopback: which output is wired to which input | TO BE FILLED |
| Analog input: the source and its known voltage | TO BE FILLED |
| Wi-Fi network and the local Modbus TCP and MQTT endpoints | TO BE FILLED |
| Date, operator and record file | TO BE FILLED |
