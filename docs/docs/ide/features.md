---
slug: /ide/features
id: features
title: IDE Features & User Guide
sidebar_label: IDE Features
description: A complete guide to the ZPLC IDE user interface, project management, compiling, simulation, and debugging tools.
tags: [ide, user-guide]
---

# ZPLC IDE Features & User Guide

The ZPLC IDE is an industrial-grade Desktop application built to write, simulate, and deploy IEC 61131-3 logic to Zephyr-based microcontrollers.

Instead of needing a complicated multi-toolchain setup, the ZPLC Desktop IDE bundles the compiler and a native Desktop simulation runtime out of the box. You only need the Zephyr tooling when you are ready to flash physical hardware.

## Main Interface

The IDE workspace is divided into several panels:

- **Project Tree (Left Panel)**: Shows all the files in your `zplc.json` project. Use this panel to create, rename, and organize your `.st` (Structured Text), `.il` (Instruction List), `.sfc` (Sequential Function Chart), and other supported language files. 
- **Code Editor (Center Panel)**: A high-performance text and visual editor. Supports syntax highlighting and live error validation for ZPLC syntax.
- **Terminal & Logs (Bottom Panel)**: Displays compiler output, build errors, and runtime diagnostics.
- **Debugger Panels (Right Panel)**: The command center for Simulation and Hardware execution.

## Supported Languages

ZPLC v1.5.0 supports multiple IEC 61131-3 programming languages across text-based and visual models:

1. **Structured Text (ST)**: High-level, Pascal-like language. The central standard for ZPLC development.
2. **Instruction List (IL)**: Low-level, assembly-style language.
3. **Sequential Function Chart (SFC)**: Visual language for state machine design and sequence control.
4. **Ladder Diagram (LD)**: Relay-logic visual model.
5. **Function Block Diagram (FBD)**: Graphical signal flow modeling.

*Note: Visual languages (LD, FBD, SFC) are transpiled internally to ST before compilation, ensuring identical bytecode execution.*

## Compiling and Building

Once you author your logic, you must compile it into bytecode (`.zplc`) before it can run.

- Click the **Compile** button in the top toolbar to validate syntax and generate the runtime payload.
- The **Terminal** will report success, or present any syntax, type-checking, or resource allocation errors that must be resolved.

## Desktop Simulation (SoftPLC)

The IDE includes a native POSIX SoftPLC runtime out-of-the-box. This runs your bytecode exactly as it will run on the MCU, executing on your host machine's processor.

- Click **Start Simulation**.
- The IDE will spawn the native execution bridge and immediately begin executing your logic cyclically in the background.
- You can use the Debugging tools to interact with it.

*(Note: Prior versions used a WASM simulation; v1.5 relies purely on standard Native desktop architecture for robust emulation).*

## Hardware Execution (Connect & Upload)

To jump from Simulation to Hardware:

1. Ensure your Zephyr firmware is flashed on a supported board (e.g., ESP32-S3 or Raspberry Pi Pico).
2. Connect the board via USB.
3. In the IDE Toolbar, click **Connect**. A prompt will ask you to select the serial port for your board.
4. Once connected, click **Upload** to send the current `.zplc` bytecode.
5. Click **Run** to execute the hardware runtime. The IDE now acts as an online monitor.

## Debugging Tools

Whether you are in Native Simulation or connected to Hardware, the IDE provides identical debugging capabilities:

### Watch Tables
Add variable names to the **Watch Table** on the right panel to monitor live values. As the PLC scans (both in simulation or on hardware), the UI will stream and decode the primitive values in real-time.

### Breakpoints & Execution Control
You can click the gutter in the Text Editor to set **Breakpoints**.
When execution hits a breakpoint, the task pauses. You can:
- Step Over
- Step Into
- Resume execution

### Forced Values
When debugging edge cases, you might want to simulate a stuck sensor or manual button press:
1. In the **Force Table**, add an address or tag (e.g., `IX0.0`).
2. Type the desired forced value (e.g., `TRUE`).
3. Click **Apply Force**.
The runtime will maliciously override that memory region before every cycle, ensuring your logic reads the forced value instead of the real I/O. Use with caution on physical machines!
