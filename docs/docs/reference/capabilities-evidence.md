---
slug: /reference/capabilities-evidence
id: capabilities-evidence
title: Hardware support
sidebar_label: Hardware support
description: "The levels of evidence ZPLC uses, and the level of every board today, derived from the evidence records."
tags: [reference, evidence, boards]
---

# Hardware support

This is the one page that says how far each board has been shown to work. Every
other page that mentions a board or a level links here.

ZPLC labels a capability by the strongest evidence that is recorded for it. A
source file, a host run, a package build or a catalogue entry is not a hardware
qualification.

## The levels

One vocabulary is used everywhere, in the documentation, in Studio, in commit
messages and in pull requests. A higher level is never implied by a lower one.

| Level | What it establishes | What it does not establish | Where you see it |
| --- | --- | --- | --- |
| Host | A unit, conformance or C test passed on the development computer. | Device timing, I/O or power behaviour. | Evidence lines of the documentation |
| Native simulation | The native host runtime executed the scenario on a virtual clock. | Equivalence with the Zephyr target, or with a board. | Studio's **Simulate** mode |
| Packaged host | A packaged desktop installer was launched on its own system in the release run. | Installer signing, notarization, or hardware behaviour. | The notes of each release |
| Emulated target | A Zephyr suite passed on `native_sim` or on a QEMU Cortex-M target. | The exact board, its probe, wiring or electrical output. | The firmware testing page |
| `cross-build` | The firmware builds for the board and fits its flash and RAM budget. | Flash, boot, deploy, persistence or any output. | **Support level** of a board, below |
| `community-reported` | A user reported what happened on their own board, with the exact image it ran, through the board report form. | That the project reproduced it, that a procedure was followed, or any support level: a report never changes the level of a board. | The evidence column of a board, below |
| `human-hil` | A person ran a recorded procedure on the exact board, with the firmware image named by its commit and hash, and it passed. | Production qualification beyond the recorded procedure. | **Support level** of a board, below |
| Production-qualified | A separately governed production evidence package exists. | Safety certification, unless it says so. | No board has it |

A result that a person observed on a bench is a lead, not a qualification: a
board reaches `human-hil` only through a record that names the firmware version,
the commit and the hash of the image it tested.

## Boards

The table is generated from `firmware/app/boards/boards.json`, the one board
manifest. The **Support level** is derived from the evidence records that the
manifest references; it is never set by hand, and a board with no passing record
stays at `cross-build`.

{/* >>> GENERATED (tools/docs/generate_board_reference.py): hardware-support-boards. Do not edit. >>> */}

| Board | IDE ID | Zephyr target | Network | Support level | Evidence records |
| --- | --- | --- | --- | --- | --- |
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Serial-focused | `cross-build` | none |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Serial-focused | `cross-build` | none |
| ESP32-S3-DevKitC-1 (N8R8) | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Network-capable (Wi-Fi) | `cross-build` | none |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | Network-capable (Ethernet) | `cross-build` | none |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | Network-capable (Ethernet) | `cross-build` | none |
| Arduino Opta WiFi (STM32H747 M7) | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | Network-capable (Wi-Fi) | `cross-build` | none |
| Waveshare RP2040-Zero | `waveshare_rp2040_zero` | `rp2040_zero/rp2040` | Serial-focused | `cross-build` | none |

No board has a hardware record: each row says that the firmware builds for that board, and nothing more.

{/* <<< END GENERATED: hardware-support-boards <<< */}

The I/O channels of every board, with their pins and their safe values, are in
[Supported boards](./boards.md).

## What follows from a level

- **`cross-build`:** use the simulator to improve your logic, and the build to
  catch an integration problem. Do not state that a workflow, an output, a timing
  budget, persistence or recovery works on the board.
- **`community-reported`:** someone else saw that image do that on their board. It is
  a lead for the same image on the same board. The board stays at `cross-build`, and
  its hardware watchdog stays off, until a person runs the recorded procedure.
- **`human-hil`:** the procedure of the record worked on that firmware version of
  that board. A different image, board or procedure needs its own record.
- **Anything about safety:** read [Safety and limitations](../safety-and-limitations.md).

Hardware records are made by a person, never by an AI assistant or the MCP server.
Building firmware, flashing it, deploying a program and running it stay separate
operations: [Firmware testing](../development/firmware-testing.md) explains what
the automated suites show and what they do not.
