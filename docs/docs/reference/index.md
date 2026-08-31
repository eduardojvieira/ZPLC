---
slug: /reference
id: index
title: Reference
sidebar_label: Reference
description: API references, supported boards, and configuration details.
tags: [reference]
---

# Reference

This section is the technical reference for ZPLC. Board entries below reproduce
the versioned board manifest; they are not HIL or production qualification.

## Start with the architecture

- [Getting Started](../getting-started/index.md) — install, first project, simulation paths, and supported hardware handoff
- [System Architecture](../architecture/index.md) — system boundaries, IDE/compiler/runtime relationships, and working principles
- [Runtime Overview](../runtime/index.md) — runtime responsibilities, execution model, and subsystem map

## ZPLC v1.5 reference

- [Runtime API](./runtime-api.md)
- [Supported Boards](./boards.md)
- [Zephyr Workspace Setup](./zephyr-workspace-setup.md)

## Supported Boards

| Board | IDE ID | Zephyr Target | Network | Validation |
|-------|--------|---------------|---------|------------|
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Serial-focused | cross-build |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Serial-focused | cross-build |
| ESP32-S3 DevKitC | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Network-capable (Wi-Fi) | cross-build |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | Network-capable (Ethernet) | cross-build |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | Network-capable (Ethernet) | cross-build |
| Arduino Opta WiFi (STM32H747 M7) | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | Network-capable (Wi-Fi) | cross-build |

The table mirrors `firmware/app/boards/supported-boards.v1.5.0.json`. Its
`cross-build` level records manifest validation only; it does not claim HIL
verification or production qualification.
