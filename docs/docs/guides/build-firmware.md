---
slug: /guides/build-firmware
id: build-firmware
title: Build the firmware from source
sidebar_label: Build the firmware
description: "How to build the ZPLC runtime image for a board from the source with the script that continuous integration uses, and what a finished build proves."
tags: [how-to, hardware, firmware]
---

# Build the firmware from source

Building produces a runtime image for one board. It is a separate step from
[flashing](./flash-firmware.md), deploying and running, and **you start each of those**: ZPLC's
assistant and the MCP server never flash, deploy, force, start or stop a device.

:::caution Authored, executed on a host only where stated
The commands are the ones of the repository's scripts. The Zephyr builds were not run
while writing this page (the Zephyr workspace is not installed on the machine that wrote it);
continuous integration builds every board of the manifest and checks its flash and RAM budget.
:::

## 1. Set up the workspace once

About 15 GB free and network access the first time. The script creates or verifies the
Zephyr workspace outside the repository, in `~/zplc-zephyr-ws` (override with `ZPLC_FW_WS`):

```bash
tools/firmware-test/setup.sh
```

The requirements and what the script prints are in
[Firmware testing](../development/firmware-testing.md#one-time-setup).

## 2. Build a board

```bash
tools/firmware-test/run.sh size rpi-pico-rp2040
tools/firmware-test/run.sh size esp32-s3-devkitc
```

The script runs `west build` for the board of the manifest and checks the flash and RAM
use against the recorded budget. The images are in `$ZPLC_FW_WS/out/size/<board>/zephyr/`:
`zephyr.elf` and, for the Pico, `zephyr.uf2`. The ESP32-S3 needs its HAL blobs once:
`west blobs fetch hal_espressif`.

The release pipeline builds with the same command, pristine and with no overlay:

```bash
west build -p always -b rpi_pico/rp2040 firmware/app
```

## 3. Next

[Flash the firmware](./flash-firmware.md), then follow [Your first board](../tutorials/first-board.md).

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| Every board's firmware builds and fits its budget | Continuous integration, with the commands above | Build |
| This page's steps on a clean machine | Not executed here | None |
| That the image runs on the board | Not tested | None |
