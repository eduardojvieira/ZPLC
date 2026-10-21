---
slug: /languages
id: index
title: Languages & Programming Model
sidebar_label: Languages Overview
description: Overview of the IEC 61131-3 language workflows in ZPLC.
tags: [languages, iec61131-3]
---

# Languages & Programming Model

Structured Text (ST) is ZPLC's central language frontend. The repository also has LD, FBD, SFC, and IL workflows. Their editing, conversion, debugging, and target coverage vary, so select a workflow based on its current evidence rather than assuming full IEC coverage or parity.

## Available workflows

| Language | Current path |
|---|---|
| **Structured Text (ST)** | Central textual frontend for the compiler. |
| **Instruction List (IL)** | Parsed and transpiled to ST before compilation. |
| **Ladder Diagram (LD)** | Visual editor/transpiler workflow. |
| **Function Block Diagram (FBD)** | Visual editor/transpiler workflow. |
| **Sequential Function Chart (SFC)** | Visual editor/transpiler workflow. |

## What each language can do today

Every row names the check that shows the capability: a journey of the ZPLC application, a test on the native runtime or a conformance case, all of them run by continuous integration, none of them on a board. A row that says it is not tested end to end has no such check yet; it is not a promise that the capability works. Anything only a board can show says so. Breakpoints are in the debug rows, and pause, cycle step and resume in the pause rows; the capability profile that the runtime reports decides which of them the ZPLC application enables.

{/* >>> GENERATED (tools/docs/generate_language_capabilities.ts): language-capabilities. Do not edit. >>> */}

| Language | Capability | Evidence | Check that shows it |
| --- | --- | --- | --- |
| Structured Text | Edit | ZPLC application journey in the native simulation | `3 Edit Structured Text, save, reopen` |
| Structured Text | Build | ZPLC application journey in the native simulation | `5 Build successfully` |
| Structured Text | Simulate | ZPLC application journey in the native simulation | `6 Simulate: connect, run, watch a value change` |
| Structured Text | Debug (breakpoint) | ZPLC application journey in the native simulation | `7 Breakpoint stops execution` |
| Structured Text | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53e Pause, step one cycle and resume a Structured Text program` |
| Structured Text | Watch online values | ZPLC application journey in the native simulation | `28e Inline values in Structured Text come from the debug map` |
| Structured Text | Force | ZPLC application journey in the native simulation | `8 Force an input and release it` |
| Structured Text | Deploy to a board | Board only | A person deploys and runs it on a board; the hardware evidence page lists the records |
| Instruction List | Edit | ZPLC application journey in the native simulation | `54 Instruction List is edited, saved and reopened` |
| Instruction List | Build | Conformance case on the host runtime | `lng-018-il-jump-runs-every-scan` |
| Instruction List | Simulate | Conformance case on the host runtime | `lng-018-il-jump-runs-every-scan` |
| Instruction List | Debug (breakpoint) | ZPLC application journey in the native simulation | `28kc A breakpoint on an IL line stops execution` |
| Instruction List | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53d Pause, step one cycle and resume an Instruction List program` |
| Instruction List | Watch online values | ZPLC application journey in the native simulation | `54b Instruction List values are watched and a variable is forced and released` |
| Instruction List | Force | ZPLC application journey in the native simulation | `54b Instruction List values are watched and a variable is forced and released` |
| Instruction List | Deploy to a board | Board only | A person deploys and runs it on a board; the hardware evidence page lists the records |
| Ladder Diagram | Edit | ZPLC application journey in the native simulation | `28f A rung is built from the keyboard` |
| Ladder Diagram | Build | Test on the native runtime | `Blinky visual languages on native POSIX` |
| Ladder Diagram | Simulate | Test on the native runtime | `Blinky visual languages on native POSIX` |
| Ladder Diagram | Debug (breakpoint) | ZPLC application journey in the native simulation | `28 A breakpoint on a rung stops execution` |
| Ladder Diagram | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53a Pause, step one cycle and resume a Ladder program` |
| Ladder Diagram | Watch online values | ZPLC application journey in the native simulation | `28b Online values of a rung come from the debug map` |
| Ladder Diagram | Force | ZPLC application journey in the native simulation | `51d A forced variable is shown as forced in the Ladder` |
| Ladder Diagram | Deploy to a board | Board only | A person deploys and runs it on a board; the hardware evidence page lists the records |
| Function Block Diagram | Edit | ZPLC application journey in the native simulation | `28g A function block diagram is edited from the keyboard` |
| Function Block Diagram | Build | Test on the native runtime | `Blinky visual languages on native POSIX` |
| Function Block Diagram | Simulate | Test on the native runtime | `Blinky visual languages on native POSIX` |
| Function Block Diagram | Debug (breakpoint) | ZPLC application journey in the native simulation | `28ka A breakpoint on an FBD block stops execution` |
| Function Block Diagram | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53b Pause, step one cycle and resume a function block diagram` |
| Function Block Diagram | Watch online values | ZPLC application journey in the native simulation | `28c Online values of an FBD come from the debug map` |
| Function Block Diagram | Force | ZPLC application journey in the native simulation | `51 A forced variable is shown as forced in the function block diagram` |
| Function Block Diagram | Deploy to a board | Board only | A person deploys and runs it on a board; the hardware evidence page lists the records |
| Sequential Function Chart | Edit | ZPLC application journey in the native simulation | `28h A sequential function chart is edited from the keyboard` |
| Sequential Function Chart | Build | Test on the native runtime | `Blinky visual languages on native POSIX` |
| Sequential Function Chart | Simulate | Test on the native runtime | `Blinky visual languages on native POSIX` |
| Sequential Function Chart | Debug (breakpoint) | ZPLC application journey in the native simulation | `28kb A breakpoint on an SFC step stops execution` |
| Sequential Function Chart | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53c Pause, step one cycle and resume a sequential function chart` |
| Sequential Function Chart | Watch online values | ZPLC application journey in the native simulation | `28d Online state of an SFC comes from the debug map` |
| Sequential Function Chart | Force | ZPLC application journey in the native simulation | `51b A forced variable is shown as forced in the sequential function chart` |
| Sequential Function Chart | Deploy to a board | Board only | A person deploys and runs it on a board; the hardware evidence page lists the records |

{/* <<< END GENERATED: language-capabilities <<< */}

## Compilation model

Supported language workflows converge on the compiler path that produces `.zplc` bytecode. This common destination does not promise arbitrary round trips between representations, identical editor features, complete standard-library coverage, or identical performance on every runtime.

Validate the source language, generated representation, diagnostics, and selected target profile as one workflow.

## Debugging and runtime evidence

The ZPLC application exposes inspection, simulation, and debugging features according to the active runtime capability profile. Native POSIX is a host-side logical runtime, not proof of hardware timing or target behavior. Hardware breakpoints, forces, deploy, and run controls must be treated as capability-specific and separately evidenced.

In the native simulation on a Linux host, the ZPLC application journeys stop the program at a breakpoint on a Structured Text line, an Instruction List line, a Ladder rung, a function block diagram block and a sequential function chart step, and mark the element where it stopped. A breakpoint on a board is not evidenced by these runs: it needs a hardware-in-the-loop run on that board.

The same runs press Pause, Step one cycle and Resume in each of the five languages and read the cycle counter: it holds while the program is paused, advances by exactly one on a step and runs again after Resume.

## Standard library

The standard library is implemented through compiler and runtime paths. Check [Standard Library](./stdlib.md) and compile the selected language workflow to determine what is available today.

## Read next

- [Structured Text (ST)](./st.md)
- [Instruction List (IL)](./il.md)
- [Language Examples Suite](./examples/v1-5-language-suite.md)
