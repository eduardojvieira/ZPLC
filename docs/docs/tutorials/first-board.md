---
slug: /tutorials/first-board
id: first-board
title: Your first board
sidebar_label: Your first board
description: "The steps to build the firmware, flash it, connect Studio, deploy a program and observe an output on a Raspberry Pi Pico or an ESP32-S3, not yet executed on a board."
tags: [tutorial, hardware, raspberry-pi-pico, esp32-s3]
---

# Your first board

This page lists the steps from firmware to a blinking LED on a Raspberry Pi Pico
or an ESP32-S3. It is written from the board manifest and the deploy flow of
Studio, and **nobody has executed it on a board**.

:::danger Not executed on a board
The firmware of both boards builds in continuous integration and fits its flash
and RAM budget. No one has flashed it, booted it, deployed a program to it or seen
an output change: the level of both boards is `cross-build`
([Hardware support](../reference/capabilities-evidence.md)). Nothing here says that
a step works. If you follow it, you are the first, and your result is a lead until
it is recorded with the firmware version, the commit and the hash of the image: use
the board report template of the repository's issues and do not put credentials or
device identifiers in it.
:::

First finish [Blink without hardware](./blink-without-hardware.md): every step below
assumes that you can build and run a program in the simulator, which has been
checked.

## What you need

| | Raspberry Pi Pico | ESP32-S3 DevKitC-1 |
| --- | --- | --- |
| Build target | `rpi_pico/rp2040` | `esp32s3_devkitc/esp32s3/procpu` |
| Studio board | `rpi_pico` | `esp32s3_devkitc` |
| Example project | `pico_blinky` | `esp32s3_blinky` |
| First digital output | `DO0`, `%QX0.0`, pin GP0 (header pin 1) | `DO0`, `%QX0.0`, pin GPIO38 (header J3) |
| What to wire | An LED and a resistor from the pin to ground | An LED and a resistor from the pin to ground |
| Interface to Studio | The USB cable of the board | The USB cable of the board |

The channels and the safe value of every output, the electrical notes and which
pins the board's devicetree proves are in [Supported boards](../reference/boards.md).
Read the notes of your board before you wire anything: the pins are 3.3 V logic and
are not 5 V tolerant. The `esp32s3_blinky` example says that the mapping of the
DevKitC-1 pin is pending; check the pin of the example against the description of
the board.

## 1. Get the firmware

The rc.3 release has no prebuilt firmware: it was uploaded by hand. The release
pipeline builds one image of the runtime for every board of the manifest for each
release it makes, named `zplc-runtime-<version>-<board>.<ext>`, with the checksum
in `SHA256SUMS` and the evidence level of the board in the release notes. Its
installers carry the images of the Raspberry Pi Pico and the ESP32-S3: in Studio,
open **Project settings**, **Target**, choose the board, and Studio shows the file,
its SHA-256, where it is and the steps to flash it. Studio only shows them: you
flash (step 2). The pipeline has not made a release yet, so today you build the
firmware from the source, with the same script that continuous integration runs.
Set up the Zephyr workspace once
(about 6 GB, see [Firmware testing](../development/firmware-testing.md#one-time-setup)),
then build the board:

```bash
tools/firmware-test/setup.sh
tools/firmware-test/run.sh size rpi-pico-rp2040
```

The script runs `west build` for the board of the manifest and checks its flash and
RAM against the recorded budget. The image is in `$ZPLC_FW_WS/out/size/rpi-pico-rp2040/zephyr/`
(`zephyr.elf` and, for the Pico, `zephyr.uf2`). For the ESP32-S3 the board
identifier is `esp32-s3-devkitc`. To build one board without the script, run the
command of its profile from the root of the Zephyr workspace:

```bash
west build -b rpi_pico/rp2040 firmware/app --pristine
```

A build that finishes proves only that the firmware builds for the board.

## 2. Flash it (a person does this)

Flashing writes the firmware to the device and is **never done by Studio's AI or MCP
features**. [Flash the firmware](../guides/flash-firmware.md) has the steps of every
board and the command line; in short, use the board's own Zephyr procedure:

- **Raspberry Pi Pico:** the RP2040 boot loader accepts a UF2 file. Hold the BOOTSEL
  button while you plug the USB cable in, and copy `zephyr.uf2` to the drive that
  appears.
- **ESP32-S3:** flash with `west flash` from the build directory, using the Zephyr
  runner of the board.

If a board does not come back, use the recovery procedure of its profile:
[Recovery boundaries](../operations/recovery.md).

## 3. Connect Studio

1. Open the project of the example, build it (**Build**, **Compile**) and choose
   **Hardware** in the toolbar instead of **Simulate**.
2. Press **Connect**. A dialog of Studio lists each serial port with its name and
   its USB identifiers and marks the boards it knows. If the board is not listed,
   plug it in and press **Refresh**. Choose its port and press **Use this port**:
   Studio uses only that port, and choosing it sends nothing to the board. On Linux
   your user needs the serial group: [Install ZPLC Studio](../getting-started/install.md#linux-serial-port-access).
3. Studio reads the identity of the runtime: board, profile and ABI. A project built
   for another board is refused.

## 4. Deploy and run (a person does this)

1. Press **Deploy**. Studio shows the program's SHA-256, its size, the number of
   tasks and the board of the device, and asks you to confirm. A deploy stops the
   current program and leaves the runtime **stopped**: it does not run it.
2. Check that the machine is in a state where an output may change.
3. Press **Run** (F5) yourself. The LED should switch every half second if the
   program is the example.

## 5. Observe

Open the **Watch** tab and add `LED_Output`: its value follows the LED. Press
**Stop** (Shift+F5): on a board a stop also drives the physical outputs to their
safe state, off ([Scheduler](../runtime/scheduler.md#pause-resume-step-and-stop)).

## What is verified

| Step | Evidence today | Status |
| --- | --- | --- |
| 1. Get the firmware | The build script runs in continuous integration and checks the flash and RAM budget | Builds in CI: `cross-build` |
| 2. Flash it | None | Not yet verified on hardware |
| 3. Connect Studio | The Blink tutorial exercises connecting in the simulator; no board has been connected | Not yet verified on hardware |
| 4. Deploy and run | The Blink tutorial exercises running in the simulator; no board has received a program | Not yet verified on hardware |
| 5. Observe | The Watch table is exercised in the simulator; no physical output has been seen to change | Not yet verified on hardware |

## What you can report

Whatever happens, the result is useful: report which step you reached, the board
and the firmware version (`zplc version` in the shell prints the commit, the board
and the build options), and what you saw. A record that names the commit and the
hash of the image is what moves a board from `cross-build` to `human-hil`.

## See also

- [Hardware support](../reference/capabilities-evidence.md): the levels and the level of every board today.
- [Supported boards](../reference/boards.md): the channels, pins and safe values.
- [Deployment and runtime sessions](../ide/deployment.md): the four separate operations.
- [Safety and limitations](../safety-and-limitations.md).
