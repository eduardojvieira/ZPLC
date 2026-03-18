---
slug: /languages
id: index
title: Languages & Programming Model
sidebar_label: Languages Overview
description: Overview of the IEC 61131-3 languages supported by ZPLC.
tags: [languages, iec61131-3]
---

# Languages & Programming Model

ZPLC v1.5 claims full author, compile, simulate, deploy, and debug workflow coverage for
five IEC 61131-3 language paths: `ST`, `IL`, `LD`, `FBD`, and `SFC`.

## IEC 61131-3 Alignment

The standard defines five languages:
1. Structured Text (ST)
2. Instruction List (IL)
3. Ladder Diagram (LD)
4. Function Block Diagram (FBD)
5. Sequential Function Chart (SFC)

ZPLC uses one canonical compile path. `ST` is the semantic baseline. `IL`, `LD`, `FBD`,
and `SFC` normalize into the same compiler/runtime contract before `.zplc` bytecode is
produced. That architecture is intentional and release-supported for v1.5.

## Workflow Contract for Claimed Languages

Every claimed language in v1.5 must satisfy the following workflow:

- authoring in the IDE
- successful compile to `.zplc`
- simulation support
- deployment support
- debugging support

The canonical release examples are captured in [v1.5 Language Suite](./examples/v1-5-language-suite.md).

## Bytecode Model

The `.zplc` format is a stack-based bytecode. It is designed to be compact and fast to execute on a microcontroller without an operating system, or within an RTOS task.

## Standard Library

ZPLC provides built-in implementations of common IEC 61131-3 functions and function
blocks, such as:

- Timers (`TON`, `TOF`, `TP`)
- Counters (`CTU`, `CTD`, `CTUD`)
- Math functions (`ADD`, `SUB`, `MUL`, `DIV`)
- Logical operators (`AND`, `OR`, `NOT`)
- Triggers (`R_TRIG`, `F_TRIG`)
