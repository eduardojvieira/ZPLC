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

## Compilation model

Supported language workflows converge on the compiler path that produces `.zplc` bytecode. This common destination does not promise arbitrary round trips between representations, identical editor features, complete standard-library coverage, or identical performance on every runtime.

Validate the source language, generated representation, diagnostics, and selected target profile as one workflow.

## Debugging and runtime evidence

The IDE exposes inspection, simulation, and debugging features according to the active runtime capability profile. Native POSIX is a host-side logical runtime, not proof of hardware timing or target behavior. Hardware breakpoints, forces, deploy, and run controls must be treated as capability-specific and separately evidenced.

## Standard library

The standard library is implemented through compiler and runtime paths. Check [Standard Library](./stdlib.md) and compile the selected language workflow to determine what is available today.

## Read next

- [Structured Text (ST)](./st.md)
- [Instruction List (IL)](./il.md)
- [Language Examples Suite](./examples/v1-5-language-suite.md)
