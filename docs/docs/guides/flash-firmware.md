---
slug: /guides/flash-firmware
id: flash-firmware
title: Flash the firmware
sidebar_label: Flash the firmware
description: 'Write the ZPLC runtime image to a board: the boot-mode steps for the Raspberry Pi Pico and the ESP32-S3, and the command line for every board.'
tags: [how-to, hardware, firmware]
---

# Flash the firmware

Flashing writes the ZPLC runtime to a board. **You start it.** The ZPLC assistant and the MCP server never flash, deploy, force, start or stop a device, and nothing on this page does it for you. Building the image, flashing it, deploying a program and running it are four separate operations ([Deployment](../ide/deployment.md)).

:::caution No flash is recorded on a board
The firmware of every board builds in continuous integration and fits its budget. Nobody has recorded a flash of it on a board, so the steps below are read from each board's tools and are not a result. Every board is at the `cross-build` level ([Hardware support](../reference/capabilities-evidence.md)). If you follow them, report what you saw with the board report form of the repository issues.
:::

## 1. Get the image and check it

A release carries one image per board of the manifest, named `zplc-runtime-<version>-<board>.<ext>`. `SHA256SUMS` holds the checksums. The manifest `zplc-runtime-<version>.manifest.json` names, for each image, the flash runner, the address it is written to and the evidence level of the board. The ZPLC installers carry the images of the two learner boards: **Project settings**, **Target** shows the file, its SHA-256 and these steps. Until the first release that has them, build the image yourself with [Your first board](../tutorials/first-board.md#1-get-the-firmware).

Check the file before you write it:

```bash
sha256sum --check --ignore-missing SHA256SUMS
```

| Board                  | Manifest id             | Image of the release                               | Written by                      |
| ---------------------- | ----------------------- | -------------------------------------------------- | ------------------------------- |
| Raspberry Pi Pico      | `rpi-pico-rp2040`       | `zplc-runtime-<version>-rpi-pico-rp2040.uf2`       | the boot ROM: you copy the file |
| Waveshare RP2040-Zero  | `waveshare-rp2040-zero` | `zplc-runtime-<version>-waveshare-rp2040-zero.uf2` | the boot ROM: you copy the file |
| ESP32-S3-DevKitC-1     | `esp32-s3-devkitc`      | `zplc-runtime-<version>-esp32-s3-devkitc.bin`      | `esptool` or `west flash`       |
| Arduino GIGA R1 (M7)   | `arduino-giga-r1-m7`    | `zplc-runtime-<version>-arduino-giga-r1-m7.bin`    | `dfu-util` or `west flash`      |
| Arduino Opta WiFi (M7) | `arduino-opta-wifi-m7`  | `zplc-runtime-<version>-arduino-opta-wifi-m7.bin`  | `dfu-util` or `west flash`      |
| STM32 Nucleo-H743ZI    | `nucleo-h743zi`         | `zplc-runtime-<version>-nucleo-h743zi.bin`         | `west flash`                    |
| STM32F746G Discovery   | `stm32f746g-disco`      | `zplc-runtime-<version>-stm32f746g-disco.bin`      | `west flash`                    |

## 2. Raspberry Pi Pico and Waveshare RP2040-Zero: boot mode

In boot mode the RP2040 boot ROM shows the board as a USB drive and takes a UF2 file copied to it.

1. Unplug the board. Hold its BOOT button (BOOTSEL on the Pico), plug in the USB cable with the button held, then release it.
2. A drive named `RPI-RP2` appears. If it does not, unplug the board and start again. A board that did not start in boot mode shows no drive, and neither does a cable that only charges.
3. Copy the `.uf2` of your board to the drive: the release image (`zplc-runtime-<version>-rpi-pico-rp2040.uf2` for the Pico) or `build/zephyr/zephyr.uf2` for an image you built. The board writes it and restarts by itself, and the drive disappears.

The Pico image is for the Raspberry Pi Pico (RP2040). On a Pico W the on-board LED is not on GP25, and a Pico 2 (RP2350) does not take this image.

## 3. ESP32-S3-DevKitC-1: download mode and esptool

The ROM boot loader of the ESP32-S3 takes an image over USB when the board starts in download mode. The image is for the N8R8 board (8 MB flash, 8 MB octal PSRAM). It does not start on the N8 or the N8R2 ([Boards](../reference/boards.md)).

1. Plug the cable into the port marked **USB**, the chip's own USB port, not the one marked UART. The ZPLC console and the connection of the ZPLC application use the **USB** port. It is `/dev/ttyACM<n>` on Linux, `/dev/cu.usbmodem<n>` on macOS and a `COM<n>` port on Windows.
2. Hold BOOT, press and release RST, then release BOOT. The board is in download mode.
3. Write the image at address `0x0`, the address the manifest names for it (`images[].flash.address` of `zplc-runtime-<version>.manifest.json`). With esptool v5:

```bash
esptool --chip esp32s3 --port <serial port> write-flash 0x0 zplc-runtime-<version>-esp32-s3-devkitc.bin
```

For an image you built, the file is `build/zephyr/zephyr.bin`. Version 4 of esptool spells the command `esptool.py ... write_flash`.

4. Press RST to leave download mode and start the program you deployed. If the console stays silent, the board is still in download mode: press RST again.

### The browser flasher

In Chrome or Edge on a computer, the flasher below writes the ESP32-S3 image over Web Serial with [ESP Web Tools](https://esphome.github.io/esp-web-tools/). Firefox and Safari have no Web Serial, and the page then shows the command line above. You do every step:

1. Download `zplc-runtime-<version>-esp32-s3-devkitc.bin` and `SHA256SUMS` from the release. The site cannot download them for you, because GitHub release files carry no cross-origin headers.
2. Put the board in download mode and choose the file.
3. Compare the SHA-256 the page shows with `SHA256SUMS`, then press **Install**.
4. Choose the serial port in the browser dialog. The flasher writes the image at address `0x0`, and it does not erase the flash unless you tick the box of the dialog.

import FirmwareFlasher from '@site/src/components/FirmwareFlasher';

<FirmwareFlasher lang="en" />

:::caution The flasher has not written a board
Nobody has recorded a flash of the ESP32-S3 with this flasher on a board. The page and its manifest are tested in the repository (host). The write over Web Serial is not.
:::

## 4. The command line for every board

`west flash` writes the image with the runner of the board, from the build directory or from the workspace root with `--build-dir`. The table lists the runners each board names in its Zephyr definition. Choose one with `--runner <name>`.

| Board                  | Runners                                               | A command                                                           |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Raspberry Pi Pico      | `uf2`, `openocd`, `jlink`, `pyocd`, `blackmagicprobe` | `west flash --runner uf2` with the board in boot mode               |
| Waveshare RP2040-Zero  | `uf2`                                                 | `west flash --runner uf2` with the board in boot mode               |
| ESP32-S3-DevKitC-1     | `esp32`, `openocd`                                    | `west flash --runner esp32` with the board in download mode         |
| Arduino GIGA R1 (M7)   | `dfu-util`, `openocd`, `jlink`, `blackmagicprobe`     | `west flash --runner dfu-util` with the board in its DFU boot mode  |
| Arduino Opta WiFi (M7) | `dfu-util`, `stm32cubeprogrammer`, `openocd`          | `west flash --runner dfu-util` with the board in its DFU boot mode  |
| STM32 Nucleo-H743ZI    | `stm32cubeprogrammer`, `openocd`, `jlink`, `pyocd`    | `west flash --runner stm32cubeprogrammer` over the on-board ST-LINK |
| STM32F746G Discovery   | `stm32cubeprogrammer`, `openocd`, `jlink`             | `west flash --runner stm32cubeprogrammer` over the on-board ST-LINK |

A runner needs its own tool on your computer: `esptool`, `dfu-util`, OpenOCD or the STM32 programmer. If the tool or the board is not found, the message of `west flash` says which. If a board does not come back after a flash, follow its recovery procedure: [Recovery boundaries](../operations/recovery.md).

## After the flash

Open the serial console of the board and run `zplc version`. It prints the version, the commit, the board and the build options of the image, which must match the file you wrote. Then [connect ZPLC](../tutorials/first-board.md#3-connect-zplc).

## What is verified, and what is not

| Part                                                     | Verified                                           | Level        |
| -------------------------------------------------------- | -------------------------------------------------- | ------------ |
| Every board's firmware builds and fits its budget        | Continuous integration build                       | Target build |
| The names, addresses and checksums of the release images | The release pipeline checks them                   | Host         |
| The boot-mode steps and the flash runner commands        | Read from the tools of each board, not executed    | None         |
| A flash on a real board                                  | Not recorded by anyone                             | None         |
