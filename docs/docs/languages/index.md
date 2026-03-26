---
slug: /languages
id: index
title: Languages & Programming Model
sidebar_label: Languages Overview
description: Overview of the IEC 61131-3 languages supported in ZPLC.
tags: [languages, iec61131-3]
---

# Languages & Programming Model

ZPLC provides first-class support for all five programming languages defined in the IEC 61131-3 standard. This allows engineers from different automation backgrounds to author control logic in the paradigm they are most comfortable with.

The supported languages are:

1. **Structured Text (ST)** - High-level, textual language resembling PASCAL or C.
2. **Instruction List (IL)** - Low-level, textual language resembling assembly.
3. **Ladder Diagram (LD)** - Visual language based on electromagnetic relay logic.
4. **Function Block Diagram (FBD)** - Visual language mapping signal flows between processing blocks.
5. **Sequential Function Chart (SFC)** - Visual state machine for complex, multi-step processes.

## The ZPLC Compilation Model

Unlike legacy PLCs that use different execution runtimes depending on the language chosen, ZPLC uses **one unified compiler path**.

Structured Text (ST) serves as the semantic foundation of the ZPLC platform. All other languages—whether visual (LD, FBD, SFC) or textual (IL)—are automatically transpiled into ST under the hood before being compiled into executable `.zplc` bytecode.

### Why This Matters

Because every language converges to the same exact backend:
- You are guaranteed 100% behavioral parity regardless of the language you choose.
- Variables and tags defined in an FBD model can be seamlessly mapped into an ST program.
- The entire Standard Library is uniformly available across all languages.
- You can mix different languages inside the same project without runtime penalties.

## Execution and Debugging Parity

Because all languages share the same compiler engine, they share the exact same execution capabilities. This means you can:
- Author logic visually or textually.
- Compile your project safely.
- Simulate locally natively on your PC.
- Deploy to ZPLC Zephyr hardware over Serial.
- Debug via Watch tables, forces, and breakpoints.

## Standard Library (Stdlib)

ZPLC intrinsically provides the standard automation blocks mandated by IEC. These are natively accelerated by the underlying Zephyr RTOS runtime for maximum performance:

- **Timers**: `TON`, `TOF`, `TP`
- **Counters**: `CTU`, `CTD`, `CTUD`
- **Edge Detectors**: `R_TRIG`, `F_TRIG`, `RS`, `SR`
- **String Handling**: `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`, `FIND`, `INSERT`
- **Math/Scaling**: Arithmetic, Trigonometry, Logic operations.
- **Communication**: Blocks for Modbus (`MB_READ_HREG`, etc.) and MQTT (`MQTT_PUBLISH`).

See [Standard Library](./stdlib.md) for deeper details on available blocks.

## Read Next

Explore specific language examples:
- [Structured Text (ST)](./st.md)
- [Instruction List (IL)](./il.md)
- [Language Examples Suite](./examples/v1-5-language-suite.md)
