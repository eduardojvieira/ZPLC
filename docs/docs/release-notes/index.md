---
slug: /release-notes
id: index
title: Release Notes
sidebar_label: Release Notes
description: Version history and new features added to the ZPLC platform.
tags: [releases, changelog]
---

# Release Notes 

Welcome to the ZPLC v1.5.0 milestone. This release marks the transition of ZPLC from a proof-of-concept prototype into a stable, deterministic, multi-architecture industrial platform.

## What's New in v1.5.0

This release completely re-architects the underlying execution foundation and vastly expands the visual engineering surface.

### 1. New C99 Deterministic Core VM
- The legacy experimental WASM execution engine has been officially replaced by a **strict, ANSI C99 interpreter** (`libzplc_core`). 
- Features a hard real-time scheduler built directly on top of Zephyr RTOS, minimizing execution jitter and completely eliminating garbage collection penalties.
- Includes isolated static memory boundaries for Process Images (IPI/OPI) and Retained values.

### 2. Full 5-Language IEC 61131-3 Support
The IDE now includes production-grade editor paths spanning the entire IEC standard. All languages are seamlessly transpiled to a unified `.zplc` bytecode:
- **Structured Text (ST)** and **Instruction List (IL)** for code purists.
- **Ladder Diagram (LD)** for classical relay logic mapping.
- **Function Block Diagram (FBD)** for data-flow processing.
- **Sequential Function Chart (SFC)** for state machine handling.

### 3. Native Desktop Simulation
- The IDE now features an embedded POSIX execution engine (Native Simulation). 
- Allows near-instant software-in-the-loop (SIL) testing on Windows, macOS, and Linux without deploying to physical Zephyr hardware.
- Fully supports Breakpoints, Visual Stepping, and Force Values.

### 4. Advanced Networking & Comms
- Direct support for **Modbus RTU (Serial)** and **Modbus TCP (Ethernet/Wi-Fi)**.
- First-class **MQTT** integration mapped organically as IEC Function Blocks (`MQTT_PUBLISH`, `MQTT_SUBSCRIBE`), bringing native IoT telemetry straight to your PLC logic.

## Breaking Changes from v1.4

- `.wasm` binary formats are no longer supported. The compiler strictly emits `.zplc` custom bytecode.
- IDE instances must be upgraded to v1.5.0 to sync with the new compiler transpilation engine.
- Older hardware definitions must pass through the new `zplc_hal.h` contract to function on Zephyr OS.

## Supported Boards
ZPLC v1.5.0 officially packages out-of-the-box binaries for major industrial profiles, covering STMicroelectronics (STM32H7, STM32F7), Espressif (ESP32-S3), and Raspberry Pi (RP2040) lines. Check the [Supported Boards](../reference/boards.md) page for exact MCU specifications.

## Stability Improvements

- The Zephyr Core VM drastically improves overall loop execution times by relying on a linear C interpreter rather than wrapping WASM.
- The IDE now consumes 40% less RAM during compilation sweeps.
- Real-time Watch Tables poll at 100ms intervals instead of the legacy 500ms, making troubleshooting snappier.
- Ladder Logic diagrams render faster using a custom HTML5 canvas backend.

## Internal Firmware Changes

- `zplc_hal.h` was reorganized to separate UART paths from standard GPIO.
- `libzplc_core` has passed extreme fuzz testing methodologies for IEC math operators.
- Internal RAM footprint for the base core was reduced to less than 64KB, freeing memory for complex `.zplc` programs.
