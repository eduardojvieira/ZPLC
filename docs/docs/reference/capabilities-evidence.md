---
slug: /reference/capabilities-evidence
id: capabilities-evidence
title: Capabilities and Evidence Tiers
sidebar_label: Capabilities and Evidence
description: Read ZPLC capability claims by the evidence that supports them.
tags: [reference, evidence, boards]
---

# Capabilities and Evidence Tiers

ZPLC labels a capability by the strongest evidence actually recorded. A source
file, host run, package build, or catalog entry is not a hardware qualification.

## Read the label first

| Tier | What it establishes | What it does not establish |
| --- | --- | --- |
| Host / unit | A host-level function or unit test passed. | Device timing, I/O, or power behavior. |
| Native POSIX | The native host runtime executed the scenario. | Zephyr target equivalence or HIL. |
| Packaged host | A packaged desktop artifact passed the recorded host smoke. | Installer signing, notarization, or hardware behavior. |
| Twister / QEMU | Zephyr test or emulated target coverage passed. | The exact board, probe, wiring, or electrical output. |
| Cross-build | The profile builds for the declared Zephyr target. | Flash, boot, deploy, persistence, or HIL behavior. |
| HIL | A recorded SHA, exact board/profile, flash/deploy, scenario, and observed result passed. | Production qualification beyond the recorded procedure. |
| Production-qualified | A separately governed production evidence package exists. | Safety certification unless explicitly stated. |

## Current board truth

The historical manifest filename remains the source for the current six
profiles. Every entry is `cross-build` with **zero HIL evidence references**.
No entry is currently HIL-verified or production-qualified.

| Board | IDE ID | Zephyr target | Tier | HIL refs |
| --- | --- | --- | --- | --- |
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | cross-build | 0 |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | cross-build | 0 |
| ESP32-S3 DevKitC | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | cross-build | 0 |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | cross-build | 0 |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | cross-build | 0 |
| Arduino Opta WiFi (STM32H747 M7) | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | cross-build | 0 |

The data comes from `firmware/app/boards/supported-boards.v1.5.0.json`; its
filename is historical compatibility, not a claim that ZPLC 2.0 is v1.5.

## Use the right conclusion

Use native POSIX and Lab results to improve logic before hardware. Use
cross-build results to catch profile integration regressions. Require a
recorded HIL run on the exact hardware before stating that a physical workflow,
timing budget, output, persistence behavior, or recovery procedure works.
