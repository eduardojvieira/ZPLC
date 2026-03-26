---
slug: /ide
id: index
title: IDE & Tooling
sidebar_label: IDE Overview
description: Overview of the ZPLC IDE, project model, simulation, and debugging workflows.
tags: [ide, tooling, debugging]
---

# IDE & Tooling

The ZPLC Integrated Development Environment (IDE) provides a complete engineering workflow for creating, simulating, and deploying IEC 61131-3 automation logic.

## Core Capabilities

The IDE serves as the central orchestration layer for your automation projects. Its main responsibilities include:

- **Project Management**: Editing `zplc.json` configurations, organizing source files, and managing tasks.
- **Language Workflows**: Seamless authoring in Structured Text (ST), Instruction List (IL), Ladder Diagram (LD), Function Block Diagram (FBD), and Sequential Function Chart (SFC).
- **Compilation**: Transpiling visual models to ST and compiling them to compact `.zplc` bytecode.
- **Simulation**: Testing logic natively on your PC without needing physical hardware.
- **Deployment & Debugging**: Flashing bytecode to targets via Serial, managing breakpoints, forcing variables, and inspecting runtime state.

## End-to-End Workflow

```mermaid
flowchart LR
  Author[Author IEC logic] --> Config[Configure project + target]
  Config --> Compile[Compile to .zplc]
  Compile --> Sim[Simulate in native POSIX runtime]
  Sim --> Deploy[Deploy to hardware]
  Deploy --> Debug[Monitor & Debug online]
```

## Project Model

The ZPLC project model is file-based and transparent. All your project configurations—including target CPU, networking, I/O mapping, Modbus/MQTT communications, and task execution rates—are cleanly stored in a transparent `zplc.json` manifest.

This makes ZPLC projects inherently source-control friendly (Git), portable, and easily scriptable.

## Runtime Environments

When you start a debugging session, the IDE automatically routes your logic to the correct execution runtime:

| Execution Path | Purpose | Behavior |
|---|---|---|
| **Native Desktop Simulation** | Preferred simulation path | Runs logic on a host POSIX SoftPLC natively. Full support for breakpoints and pause/resume. |
| **Hardware Execution** | Real-world deployment | Runs on Zephyr RTOS over a physical Serial connection. The IDE acts as an online monitor. |

## Advanced Debugging

The IDE includes a comprehensive debugging suite for both simulation and live hardware workflows:
- **Watch Tables**: Monitor variable state in real-time.
- **Breakpoints**: Pause logic execution precisely at a line of code.
- **Step Execution**: Step over and step into operations.
- **Forced Values**: Override live sensor data or internal states directly from the IDE to simulate edge cases.
