---
slug: /development/hil-emulation
title: Emulated HIL Bench
sidebar_label: Emulated HIL Bench
description: Run the HIL chain of the learner boards on emulators on a Linux machine, what an emulated run proves and what it does not, and the licenses of the emulators.
---

# Emulated HIL bench

The hardware-in-the-loop chain (`tools/hil/run_chain.py`) normally runs with a
person at a real board. The emulated bench runs the same chain, on the same
firmware images, inside emulators on a Linux machine, with nobody at a bench and
no serial port. It is a rehearsal: it finds defects in the firmware, the device
protocol and the harness before a board is on the desk.

:::warning Emulated is not hardware
Every record an emulated run writes says `evidence_level: emulated` and names the
emulator, its version and the hash of its patch. An emulated record never raises
a board's support level, and no timing figure may cite it (HIL-016). An emulator
models the chip, not the board: it proves nothing about pins, voltages, real
clocks, flash wear or the drivers against silicon.
:::

## What is emulated

| Board | Emulator | Image | The bench does |
|---|---|---|---|
| Raspberry Pi Pico | [rp2040js](https://github.com/wokwi/rp2040js) 1.4.1 (commit `5fbd2050`) with five fixes | the shipped `rpi_pico/rp2040` image, unchanged | flash, power cycle and power cut on a flash file; USB CDC shell and UART1 (Modbus RTU) on host ptys; the DO0→DI0 … DO3→DI3 loopback; analog injection on ADC0 to ADC4; simulated time |
| ESP32-S3-DevKitC-1 | Espressif QEMU `esp_develop_9.2.2_20260417`, machine `esp32s3`, octal PSRAM | an **emulation-only** build: console on UART0, ADC off | flash and power cycle on an 8 MB flash file; UART0 shell on a host pty |
| `native_sim` with the Pico channel map | Zephyr `native_sim/native/64` | `run.sh app-native` (emulation only) | inputs, analog values and outputs through its `emu` shell command |

## What is not emulated

The steps that need these are recorded as **not emulable**, never as passed:

- **ESP32-S3:** QEMU has no GPIO input or output model, no SAR ADC, no Wi-Fi and
  no USB-Serial/JTAG. The digital loopback, the analog read and the Modbus TCP and
  MQTT exchange cannot run. The emulation image builds AI0 as optional with its
  converter off, so its I/O description hash differs from the shipped profile's,
  and the chain's I/O description step reports the difference.
- **Pico:** rp2040js has no network, and it does not model pin multiplexing or
  electrical levels: a wrong pin function on a real board is not found here (the
  bench reports the function select of each pin for inspection). Its flash is
  modelled at the pico-sdk API (`flash_range_erase`, `flash_range_program`,
  `flash_write_partial`), not as a SPI NOR chip, so erase and program take no time.
- **Both:** the hardware watchdog is off in both shipped profiles until a hardware
  record exists (RT-020), and the build refuses to turn it on, so the watchdog step
  cannot run on an emulator either.

## Set up

```bash
bash tools/hil/emulator/setup.sh
```

It installs, into `$ZPLC_EMU_DIR` (default `~/zplc-emu`), outside the repository:

- rp2040js at its pinned commit, with `tools/hil/emulator/rp2040js-zplc-emu.patch`
  applied and its dependencies installed by `npm ci --ignore-scripts` in that folder;
- the Espressif QEMU release, after checking its SHA-256.

A second run changes nothing. Nothing is added to the repository's `package.json`
or lockfile. The harness runs rp2040js with Node.js from that folder.

Build the images with the firmware workspace of
[Firmware Testing](./firmware-testing.md):

```bash
tools/hil/emulator/build.sh pico      # $ZPLC_FW_WS/out/emu-pico
tools/hil/emulator/build.sh esp32s3   # $ZPLC_FW_WS/out/emu-esp32s3 (emulation only)
```

Never flash the ESP32-S3 emulation image to a board: its console is on UART0 and
it has no analog input.

## Run the chain

```bash
python3 tools/hil/run_chain.py rpi_pico --bench emulated
python3 tools/hil/run_chain.py esp32s3_devkitc --bench emulated
```

Use the Python of the firmware workspace (it has `pyserial`). The emulated bench
needs no terminal and asks nobody: the steps that ask a person to confirm the
board are recorded as skipped. Records go to `build/hil-records/`.

To boot one board and use its ports by hand, for example from the ZPLC application:

```bash
python3 tools/hil/emulator/bench_emulated.py rpi_pico
```

It prints the pty of the shell (`port`) and, for the Pico, the pty of UART1
(`rtu_port`), where a host Modbus RTU endpoint can listen.

## How the Pico bench works

- **Flash:** the bench keeps one flash file per board under `build/hil-emu/`. A
  flash writes the UF2 blocks into it, as the UF2 bootloader does, and leaves the
  storage partition alone. Every erase or program reaches the file at once, so
  killing the emulator is a power cut, and starting it again on the same file is
  the next power-up.
- **Ports:** the bench owns the host ptys, so their paths stay the same across a
  flash and a power cycle. It hands the board over when the shell has printed its
  prompt and then been quiet for 300 ms, as a person waits for a restart.
- **Time:** `now_ms()` is the emulator's simulated time. The emulator never runs
  ahead of the wall clock, so host programs (the device link, a Modbus endpoint)
  see the same timeouts as on a board; when the emulator is slower than the chip,
  simulated time falls behind instead. The ESP32-S3 bench uses host time, but
  QEMU does not keep the board's clock in step with it: in the runs of 2026-10-20 the board
  counted between a sixth and a third of the host's time, depending on the load
  of the machine. A timing step on QEMU (a TON of 3 s took 8 s) measures QEMU,
  not the firmware, and the fault steps wait for the fault, not for a fixed time.

## native_sim with the Pico channel map

```bash
tools/firmware-test/run.sh app-native
```

builds `firmware/app` for `native_sim/native/64` with the Pico's I/O description
on `gpio_emul` and `adc_emul`, boots it, and drives it through its `emu` shell
command:

| Command | Effect |
|---|---|
| `emu pin <gpio> <0\|1>` | drive an input pin (inputs are active low: `0` is pressed) |
| `emu adc <ch> <0..4095>` | set a converter input to that fraction of 3.3 V |
| `emu out` | the output pin levels, as a bit mask of GPIO numbers |

The command lives in `firmware/tests/app_native_emulation/module`, a module that
only this mode adds to the build. The mode also configures `rpi_pico/rp2040` with
the command enabled and expects the build to stop: the command can never be
compiled into a shipped board.

## The rp2040js fixes

The patch fixes five places where rp2040js did not behave like the RP2040, each of
which stopped Zephyr or gave wrong readings. `tools/hil/emulator/README.md` lists
them. One of them explains an "ADC channel 0 returns channel 4" reading seen while
trying the emulator: rp2040js kept START_ONCE set, so each conversion read the input
selected before; the ZPLC HAL was correct.

## What the emulated runs found

The first emulated runs of the chain, on 2026-10-20, failed five steps. Each one
was traced to its cause, and the step was run again on the emulator after the fix.

| Step | What the record said | Cause | Fix |
|---|---|---|---|
| Power cycle and RETAIN (both boards) | RETAIN 102 before the power cycle, 0 after | The images had no RETAIN persistence: `CONFIG_ZPLC_RETAIN_PERSIST` was off in every shipped profile (it is on in all of them now, RT-025), and on the Pico it does not fit the 64 KB storage partition (the build stops). With the option on, the ESP32-S3 image kept the value (16 before and after), and so did a Pico image built for the test with a 128 KB storage partition (101 before and after) | The step checks the image's option and says why it cannot pass. The HIL image turns the option on, and the Pico and the RP2040-Zero keep a 128 KB storage partition: the Pico's HIL image kept the value (102 before and after) |
| Overrun (both boards) | `vm_fault` with VM error 8, not `deadline_miss`; outputs off | The step's loop ran 104,000 VM instructions in one scan, past the budget of 100,000 (`CONFIG_ZPLC_VM_CYCLE_INSTRUCTION_BUDGET`), so the runtime latched its VM watchdog fault, as designed | The step sizes the loop to half the budget the image reports; both boards then latch `deadline_miss` after three late scans, outputs off |
| Fieldbus exchange (Pico) | No request reached the host, error 10 | The device's Modbus RTU client is off by default and starts at boot only, so the block failed at once with `UNAVAILABLE`. The host side of the line was also opened at 115200 baud, while the device runs 19200 | The step turns the client on at 19200 baud, stores it and restarts the board; the emulated exchange read 0x5A17 |
| Deploy (ESP32-S3) | "Not in loading state" after a chunk was sent again | The loader refused the fixture with `ZPLC_LOADER_ERR_MEMORY` (-13): the chain compiles the fixtures for 8 KB of work memory, and the ESP32-S3 has 2 KB. The tester then sent the last chunk again, to a load that had ended. A board does the same | The chain compiles the fixtures for the board, and the tester raises the device's refusal instead of sending the chunk again. The ESP32-S3 bench also gives programs ten times the host time, for QEMU's slow clock: the deploy and the six blink fixtures then pass |
| Fatal fault (ESP32-S3) | Still running, no fault, after 1 s | The fault path works on Xtensa (division by zero, VM error 3, outputs off), but on QEMU's slow clock one second of the host was not enough for the 21 scans the program needs | The fault steps wait for the fault, up to 10 s; QEMU latched it after 1.4 s of host time and 21 scans |

Running the RETAIN step on the Pico's HIL image found one more defect: the image refused every START ("Scheduler
start failed (-3)"), because the scheduler armed only the devicetree's chosen `zephyr,watchdog`, which no board of
this repository sets. It now arms the board's `watchdog0` alias when nothing is chosen, and an image with the
hardware watchdog and neither node does not build.

On rp2040js the blink fixtures count output changes by reading the outputs over the shell, and from one run to the
next a different one sees too few changes: they are not evidence on this emulator either way.

## Licenses

| Software | License | In this repository |
|---|---|---|
| rp2040js, Uri Shaked and Wokwi | MIT | only `rp2040js-zplc-emu.patch`, a derivative under the same MIT license; the emulator is downloaded by `setup.sh` |
| Espressif QEMU | GPL-2.0 | nothing; `setup.sh` downloads the release, which runs as a separate program |

Offering the rp2040js fixes upstream is a decision for the project owner.
