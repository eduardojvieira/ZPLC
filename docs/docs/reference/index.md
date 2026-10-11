---
slug: /reference
id: index
title: Reference
sidebar_label: Reference
description: ZPLC 2.0 APIs, board profiles, evidence tiers, and Zephyr setup.
tags: [reference]
---

# Reference

Use this section to identify the current contract and the evidence behind a
claim. Profile presence is not HIL or production qualification.

## Start here

- [Capabilities and Evidence](./capabilities-evidence.md) — how to read host, POSIX, package, Twister/QEMU, cross-build, and HIL results.
- [Board profiles](./boards.md) — generated data from the historical manifest filename.
- [Runtime API](./runtime-api.md) — generated C header reference.
- [Zephyr workspace setup](./zephyr-workspace-setup.md) — reproducible build inputs.

## Supported Boards

| Board | IDE ID | Zephyr Target | Network | Validation |
|-------|--------|---------------|---------|------------|
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Serial-focused | cross-build |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Serial-focused | cross-build |
| ESP32-S3-DevKitC-1 (N8R8) | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Network-capable (Wi-Fi) | cross-build |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | Network-capable (Ethernet) | cross-build |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | Network-capable (Ethernet) | cross-build |
| Arduino Opta WiFi (STM32H747 M7) | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | Network-capable (Wi-Fi) | cross-build |
| Waveshare RP2040-Zero | `waveshare_rp2040_zero` | `rp2040_zero/rp2040` | Serial-focused | cross-build |

The table mirrors `firmware/app/boards/boards.json`, the one board manifest. The
validation level is derived from the evidence records the manifest references,
never set by hand, and every current row has none. The I/O channels of each board
are in [Supported Boards](./boards.md).
