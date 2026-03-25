---
slug: /reference
id: index
title: Reference
sidebar_label: Reference
description: API references, command lists, and configuration details.
tags: [reference]
---

# Reference

This section holds the release-facing reference material for ZPLC.

## Start here for the core rewrite surfaces

- [Getting Started](../getting-started/index.md) — install, first project, simulation paths, and supported hardware handoff
- [System Architecture](../architecture/index.md) — system boundaries, IDE/compiler/runtime relationships, and working principles
- [Runtime Overview](../runtime/index.md) — runtime responsibilities, execution model, and subsystem map

## v1.5 Release References

- [Canonical Docs Manifest](./v1-5-canonical-docs-manifest.md)
- [Source of Truth](./source-of-truth.md)
- [Runtime API](./runtime-api.md)
- [Supported Boards](./boards.md)
- [Zephyr Workspace Setup](./zephyr-workspace-setup.md)
- Supported boards are sourced from `firmware/app/boards/supported-boards.v1.5.0.json`
- Release validation is tracked in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

## Supported Boards

| Board | IDE ID | Zephyr Target | Network | Validation |
|-------|--------|---------------|---------|------------|
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Serial-focused | cross-build |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Serial-focused | cross-build |
| ESP32-S3 DevKitC | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Network-capable (Wi-Fi) | cross-build |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco` | Network-capable (Ethernet) | cross-build |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi` | Network-capable (Ethernet) | cross-build |

The human-validated subset for v1.5.0 must include at least one serial-focused board and
one network-capable board before release sign-off.
