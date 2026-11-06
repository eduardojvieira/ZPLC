---
slug: /languages
id: index
title: Languages and the programming model
sidebar_label: Languages overview
description: Choose among the five IEC 61131-3 languages in ZPLC and see what each can do today.
tags: [languages, iec61131-3]
---

# Languages and the programming model

ZPLC offers five IEC 61131-3 languages in one project: Structured Text, Instruction List, Ladder Diagram, Function Block Diagram and Sequential Function Chart. They all compile to the same `.zplc` bytecode, so you can pick the language that fits each program. This page helps you choose one and shows what each language can do today, with the proof behind it.

## Choose a language

| Language | Write it in | Use it for | Guide |
| --- | --- | --- | --- |
| Structured Text (ST) | A text editor | Calculations, data handling, loops, anything that is easier to read as code. The language every other one is translated to. | [Structured Text](./st.md) |
| Instruction List (IL) | A text editor | Existing IL logic, and low-level sequences on an accumulator. | [Instruction List](./il.md) |
| Ladder Diagram (LD) | A rung editor | Interlocks, relay-style logic, and conditions that an electrician reads at a glance. | [Ladder Diagram](./ld.md) |
| Function Block Diagram (FBD) | A diagram editor | Signal flow between timers, counters, comparisons and arithmetic. | [Function Block Diagram](./fbd.md) |
| Sequential Function Chart (SFC) | A chart editor | Machines that move through steps, such as a start, run and stop sequence. | [Sequential Function Chart](./sfc.md) |

Structured Text goes to the compiler directly. The other four are translated to Structured Text first, and that generated text is read-only output. The languages are not interchangeable: an editor, a debugger or a library block may support a construct in one language and not in another, and a program does not convert back from Structured Text to a diagram. The generated [language references](../reference/language-st.md) state what works in each.

## What each language can do today

Every row names a journey of the ZPLC application that shows the capability from start to finish, in a real window; continuous integration runs them all, and the table is generated from that list, not written by hand. A capability with no journey, or with only a unit test or a conformance case, is refused when the page is generated.

Build, simulate and deploy come from one chain per language: a program is created in a new project, an example is edited, saved, reopened and built, simulated with a pause and a single step, and watched. Then Deploy is clicked and confirmed against the native runtime behind the shell of an emulated board, and the same value is watched changing there. The board is emulated and nothing runs on a physical one: what was run on real boards is on the [hardware evidence page](../reference/capabilities-evidence.md). The capability profile that the runtime reports decides which of these the application enables.

{/* >>> GENERATED (tools/docs/generate_language_capabilities.ts): language-capabilities. Do not edit. >>> */}

| Language | Capability | Evidence | Check that shows it |
| --- | --- | --- | --- |
| Structured Text | Edit | ZPLC application journey in the native simulation | `3 Edit Structured Text, save, reopen` |
| Structured Text | Build | ZPLC application journey in the native simulation | `64a Structured Text from a new project to a deployed program that is watched` |
| Structured Text | Simulate | ZPLC application journey in the native simulation | `64a Structured Text from a new project to a deployed program that is watched` |
| Structured Text | Debug (breakpoint) | ZPLC application journey in the native simulation | `7 Breakpoint stops execution` |
| Structured Text | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53e Pause, step one cycle and resume a Structured Text program` |
| Structured Text | Watch online values | ZPLC application journey in the native simulation | `28e Inline values in Structured Text come from the debug map` |
| Structured Text | Force | ZPLC application journey in the native simulation | `8 Force an input and release it` |
| Structured Text | Deploy (click Deploy and confirm) | ZPLC application journey: Deploy clicked against an emulated board | `64a Structured Text from a new project to a deployed program that is watched` |
| Instruction List | Edit | ZPLC application journey in the native simulation | `54 Instruction List is edited, saved and reopened` |
| Instruction List | Build | ZPLC application journey in the native simulation | `64b Instruction List from a new project to a deployed program that is watched` |
| Instruction List | Simulate | ZPLC application journey in the native simulation | `64b Instruction List from a new project to a deployed program that is watched` |
| Instruction List | Debug (breakpoint) | ZPLC application journey in the native simulation | `28kc A breakpoint on an IL line stops execution` |
| Instruction List | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53d Pause, step one cycle and resume an Instruction List program` |
| Instruction List | Watch online values | ZPLC application journey in the native simulation | `54b Instruction List values are watched and a variable is forced and released` |
| Instruction List | Force | ZPLC application journey in the native simulation | `54b Instruction List values are watched and a variable is forced and released` |
| Instruction List | Deploy (click Deploy and confirm) | ZPLC application journey: Deploy clicked against an emulated board | `64b Instruction List from a new project to a deployed program that is watched` |
| Ladder Diagram | Edit | ZPLC application journey in the native simulation | `28f A rung is built from the keyboard` |
| Ladder Diagram | Build | ZPLC application journey in the native simulation | `64c Ladder Diagram from a new project to a deployed program that is watched` |
| Ladder Diagram | Simulate | ZPLC application journey in the native simulation | `64c Ladder Diagram from a new project to a deployed program that is watched` |
| Ladder Diagram | Debug (breakpoint) | ZPLC application journey in the native simulation | `28 A breakpoint on a rung stops execution` |
| Ladder Diagram | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53a Pause, step one cycle and resume a Ladder program` |
| Ladder Diagram | Watch online values | ZPLC application journey in the native simulation | `28b Online values of a rung come from the debug map` |
| Ladder Diagram | Force | ZPLC application journey in the native simulation | `51d A forced variable is shown as forced in the Ladder` |
| Ladder Diagram | Deploy (click Deploy and confirm) | ZPLC application journey: Deploy clicked against an emulated board | `64c Ladder Diagram from a new project to a deployed program that is watched` |
| Function Block Diagram | Edit | ZPLC application journey in the native simulation | `28g A function block diagram is edited from the keyboard` |
| Function Block Diagram | Build | ZPLC application journey in the native simulation | `64d Function Block Diagram from a new project to a deployed program that is watched` |
| Function Block Diagram | Simulate | ZPLC application journey in the native simulation | `64d Function Block Diagram from a new project to a deployed program that is watched` |
| Function Block Diagram | Debug (breakpoint) | ZPLC application journey in the native simulation | `28ka A breakpoint on an FBD block stops execution` |
| Function Block Diagram | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53b Pause, step one cycle and resume a function block diagram` |
| Function Block Diagram | Watch online values | ZPLC application journey in the native simulation | `28c Online values of an FBD come from the debug map` |
| Function Block Diagram | Force | ZPLC application journey in the native simulation | `51 A forced variable is shown as forced in the function block diagram` |
| Function Block Diagram | Deploy (click Deploy and confirm) | ZPLC application journey: Deploy clicked against an emulated board | `64d Function Block Diagram from a new project to a deployed program that is watched` |
| Sequential Function Chart | Edit | ZPLC application journey in the native simulation | `28h A sequential function chart is edited from the keyboard` |
| Sequential Function Chart | Build | ZPLC application journey in the native simulation | `64e Sequential Function Chart from a new project to a deployed program that is watched` |
| Sequential Function Chart | Simulate | ZPLC application journey in the native simulation | `64e Sequential Function Chart from a new project to a deployed program that is watched` |
| Sequential Function Chart | Debug (breakpoint) | ZPLC application journey in the native simulation | `28kb A breakpoint on an SFC step stops execution` |
| Sequential Function Chart | Pause, step one cycle, resume | ZPLC application journey in the native simulation | `53c Pause, step one cycle and resume a sequential function chart` |
| Sequential Function Chart | Watch online values | ZPLC application journey in the native simulation | `28d Online state of an SFC comes from the debug map` |
| Sequential Function Chart | Force | ZPLC application journey in the native simulation | `51b A forced variable is shown as forced in the sequential function chart` |
| Sequential Function Chart | Deploy (click Deploy and confirm) | ZPLC application journey: Deploy clicked against an emulated board | `64e Sequential Function Chart from a new project to a deployed program that is watched` |

{/* <<< END GENERATED: language-capabilities <<< */}

## One compilation model

Every language converges on the compiler path that produces `.zplc` bytecode. That common destination does not promise round trips between representations, identical editor features, complete standard-library coverage or identical performance on every runtime. Validate the source, the generated representation, the diagnostics and the target profile as one workflow ([Compiler workflow](../ide/compiler.md)).

## Debugging and evidence

The application exposes inspection, simulation and debugging according to the capability profile the runtime reports. In the native simulation on a Linux host, the journeys stop the program at a breakpoint on a Structured Text line, an Instruction List line, a Ladder rung, a function block diagram block and a sequential function chart step, and mark the element where it stopped. The same runs press Pause, Step one cycle and Resume in each language and read the cycle counter: it holds while paused, advances by exactly one on a step and runs again after Resume.

The native simulation is a host-side logical runtime. It is not proof of hardware timing or target behavior, and a breakpoint on a board needs a hardware-in-the-loop run on that board.

## Read next

- [Structured Text](./st.md), the language to learn first;
- [Standard library](../runtime/stdlib.md), the functions and function blocks every language can call;
- [Text and visual editors](../ide/editors.md), for the editing features of each language.
