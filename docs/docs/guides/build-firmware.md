---
slug: /guides/build-firmware
id: build-firmware
title: Build the firmware from source
sidebar_label: Build the firmware
description: 'Build the ZPLC runtime image for a board with the repository script, check its size budget, and learn what a finished build proves.'
tags: [how-to, hardware, firmware]
---

# Build the firmware from source

Follow this page to produce the runtime image for one board. Building is separate from [flashing](./flash-firmware.md), deploying and running. You start each of those yourself: the ZPLC assistant and the MCP server never flash, deploy, force, start or stop a device.

:::note Evidence level: target build
Continuous integration builds every board of the manifest with `west build -p always` and checks its flash and RAM budget with `fwtest.py size`, the checker that `run.sh size` calls. This page was written without running a Zephyr build on the author's machine, so the steps are read from the scripts, not from a clean-machine run.
:::

## 1. Create the workspace once

Plan for about 15 GB free and network access the first time: the workspace is about 6.6 GB, the Zephyr SDK about 7 GB installed whole, and the build outputs take the rest. The script creates or verifies the Zephyr workspace outside the repository, in `~/zplc-zephyr-ws`. Set `ZPLC_FW_WS` to use another folder.

```bash
tools/firmware-test/setup.sh
```

The requirements and the output of the script are in [Firmware testing](../development/firmware-testing.md#one-time-setup).

## 2. Build a board

Name the `board_id` of the manifest ([Boards](../reference/boards.md)):

```bash
tools/firmware-test/run.sh size rpi-pico-rp2040
tools/firmware-test/run.sh size esp32-s3-devkitc
```

The script runs `west build` for that board and compares the flash and RAM use with the recorded budget. The images are in `$ZPLC_FW_WS/out/size/<board>/zephyr/`: `zephyr.elf` for every board and `zephyr.uf2` for the Pico. The ESP32-S3 needs its HAL blobs once: `west blobs fetch hal_espressif`.

The CI jobs and the release pipeline do not call the script. They run `west build` directly, pristine and with no overlay:

```bash
west build -p always -b rpi_pico/rp2040 firmware/app
```

## 3. Next

[Flash the firmware](./flash-firmware.md), then follow [Your first board](../tutorials/first-board.md).

## What is verified, and what is not

| Part                                              | Verified                                        | Level        |
| ------------------------------------------------- | ----------------------------------------------- | ------------ |
| Every board's firmware builds and fits its budget | Continuous integration, with the commands above | Target build |
| The steps of this page on a clean machine         | Not executed                                    | None         |
| That the image runs on the board                  | Not tested                                      | None         |
