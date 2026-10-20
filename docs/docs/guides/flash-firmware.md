---
slug: /guides/flash-firmware
id: flash-firmware
title: Flash the firmware
sidebar_label: Flash the firmware
description: "How to write the ZPLC runtime image to a board: the boot-mode steps of the Raspberry Pi Pico and the ESP32-S3, and the command-line way for every board."
tags: [how-to, hardware, firmware]
---

# Flash the firmware

Flashing writes the ZPLC runtime to a board. **You start it.** ZPLC's assistant and
the MCP server never flash, deploy, force, start or stop a device, and nothing on
this page does it for you. Building the image, flashing it, deploying a program and
running it are four separate operations ([Deployment](../ide/deployment.md)).

:::caution Not executed on a board
The firmware of every board builds in continuous integration and fits its budget.
No one has recorded a flash of it on a board, so the steps below are written from the
tools of each board and are not a result: the level of every board is `cross-build`
([Hardware support](../reference/capabilities-evidence.md)). If you follow them, report
what you saw with the board report form of the repository's issues.
:::

## 1. Get the image and check it

A release of the pipeline carries one image of the runtime for every board of the
manifest, named `zplc-runtime-<version>-<board>.<ext>`, with the checksums in
`SHA256SUMS` and a manifest, `zplc-runtime-<version>.manifest.json`, that names for
each image the flash runner, the address it is written to and the evidence level of the
board. The installers of ZPLC carry the images of the two learner boards: **Project
settings**, **Target** shows the file, its SHA-256 and these steps. Until the first
release that has them, build the image yourself with the steps of
[Your first board](../tutorials/first-board.md#1-get-the-firmware).

Check the file before you write it:

```bash
sha256sum --check --ignore-missing SHA256SUMS
```

| Board | Manifest id | Image of the release | Written by |
| --- | --- | --- | --- |
| Raspberry Pi Pico | `rpi-pico-rp2040` | `zplc-runtime-<version>-rpi-pico-rp2040.uf2` | the boot ROM: you copy the file |
| Waveshare RP2040-Zero | `waveshare-rp2040-zero` | `zplc-runtime-<version>-waveshare-rp2040-zero.uf2` | the boot ROM: you copy the file |
| ESP32-S3-DevKitC-1 | `esp32-s3-devkitc` | `zplc-runtime-<version>-esp32-s3-devkitc.bin` | `esptool` or `west flash` |
| Arduino GIGA R1 (M7) | `arduino-giga-r1-m7` | `zplc-runtime-<version>-arduino-giga-r1-m7.bin` | `dfu-util` or `west flash` |
| Arduino Opta WiFi (M7) | `arduino-opta-wifi-m7` | `zplc-runtime-<version>-arduino-opta-wifi-m7.bin` | `dfu-util` or `west flash` |
| STM32 Nucleo-H743ZI | `nucleo-h743zi` | `zplc-runtime-<version>-nucleo-h743zi.bin` | `west flash` |
| STM32F746G Discovery | `stm32f746g-disco` | `zplc-runtime-<version>-stm32f746g-disco.bin` | `west flash` |

## 2. Raspberry Pi Pico and Waveshare RP2040-Zero: download and boot mode

The RP2040 boot ROM shows the board as a USB drive when it starts in boot mode, and
takes a UF2 file copied to it. You do every step: ZPLC never writes a board.

1. Unplug the board. Hold its BOOT button (BOOTSEL on the Pico) and, with the button
   held, plug in the USB cable. Release the button.
2. A drive named `RPI-RP2` appears. If it does not, unplug the board and start again;
   a board that was not started in boot mode shows no drive, and neither does a cable
   that only charges.
3. Copy the `.uf2` file of your board to the drive: the release image
   (`zplc-runtime-<version>-rpi-pico-rp2040.uf2` for the Pico), or `build/zephyr/zephyr.uf2`
   when you built the image yourself. The board writes it and restarts by itself, and the
   drive disappears.

The Pico image is for the Raspberry Pi Pico (RP2040). On a Pico W the on-board LED is not
on GP25, and a Pico 2 (RP2350) does not run this image.

## 3. ESP32-S3-DevKitC-1: download mode and esptool

The ROM boot loader of the ESP32-S3 takes an image over USB when the board starts in
download mode. The image is for the N8R8 board (8 MB flash, 8 MB octal PSRAM): it does
not start on the N8 or the N8R2 ([Board reference](../reference/boards.md)).

1. Plug the cable into the port marked **USB**, the ESP32-S3's own USB port, not the one
   marked UART: the ZPLC console and the connection of the ZPLC application use the **USB** port. On
   Linux it is `/dev/ttyACM<n>`, on macOS `/dev/cu.usbmodem<n>`, on Windows a `COM<n>`
   port.
2. Hold BOOT, press and release RST, and release BOOT. The board is in download mode.
3. Write the image at address `0x0`, the address that the manifest names for it
   (`images[].flash.address` of `zplc-runtime-<version>.manifest.json`). With esptool v5:

```bash
esptool --chip esp32s3 --port <serial port> write-flash 0x0 zplc-runtime-<version>-esp32-s3-devkitc.bin
```

   For an image you built yourself the file is `build/zephyr/zephyr.bin`. Version 4 of
   esptool spells the same command `esptool.py ... write_flash`.

4. Press RST to leave download mode and start the program that you wrote. If the console
   stays silent, the board is still in download mode: press RST again.

### The browser flasher

A flasher that runs in the browser over Web Serial is not offered yet: the ESP32-S3
needs a library that the site does not carry. Until then the command line above is the
way, and the page of the board does not change when the flasher arrives.

## 4. The command line for every board

From the build directory of the image, or from the root of the Zephyr workspace with
`--build-dir`, `west flash` writes the image with the runner of the board. The runners
that each board names in its Zephyr definition are the ones in this table; choose one
with `--runner <name>`.

| Board | Runners | A command |
| --- | --- | --- |
| Raspberry Pi Pico | `uf2`, `openocd`, `jlink`, `pyocd`, `blackmagicprobe` | `west flash --runner uf2` with the board in boot mode |
| Waveshare RP2040-Zero | `uf2` | `west flash --runner uf2` with the board in boot mode |
| ESP32-S3-DevKitC-1 | `esp32`, `openocd` | `west flash --runner esp32` with the board in download mode |
| Arduino GIGA R1 (M7) | `dfu-util`, `openocd`, `jlink`, `blackmagicprobe` | `west flash --runner dfu-util` with the board in its DFU boot mode |
| Arduino Opta WiFi (M7) | `dfu-util`, `stm32cubeprogrammer`, `openocd` | `west flash --runner dfu-util` with the board in its DFU boot mode |
| STM32 Nucleo-H743ZI | `stm32cubeprogrammer`, `openocd`, `jlink`, `pyocd` | `west flash --runner stm32cubeprogrammer` over the on-board ST-LINK |
| STM32F746G Discovery | `stm32cubeprogrammer`, `openocd`, `jlink` | `west flash --runner stm32cubeprogrammer` over the on-board ST-LINK |

A runner needs its own tool on your computer (`esptool`, `dfu-util`, OpenOCD, the STM32
programmer). If the tool or the board is not found, the message of `west flash` says
which. If a board does not come back after a flash, use the recovery procedure of its
profile: [Recovery boundaries](../operations/recovery.md).

## After the flash

Open the serial console of the board and run `zplc version`: it prints the version,
the commit, the board and the build options of the image. They must be the ones of the
file you wrote. Then [connect ZPLC](../tutorials/first-board.md#3-connect-zplc).

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| Every board's firmware builds and fits its budget | Continuous integration build | Build |
| The names, addresses and checksums of the release images | The release pipeline checks them | Host |
| The boot-mode steps and the flash runner commands | Written from the tools of each board, not executed | None |
| A flash on a real board | Not recorded by anyone | None |
