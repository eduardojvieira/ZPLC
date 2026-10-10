---
slug: /ide/features
id: features
title: Studio Workbench
sidebar_label: Workbench
description: The ZPLC Studio 2.0 editor, bottom panel, simulation, and test workflow.
tags: [ide, user-guide]
---

# Studio Workbench

The workbench keeps editing central and puts Explorer, Inspector, Output,
Problems, Tests, Lab, Learn, Changes, Agent, Trace, Watch, and Terminal in one
bottom panel.

## Daily workflow

1. Work in a user-selected project folder.
2. Compile and resolve diagnostics.
3. Run a temporal test or native POSIX scenario and inspect its trace.
4. Review the evidence source before drawing a conclusion.

## Editors

ST is the primary language-service path. LD, FBD, and SFC open, edit, save,
copy, and undo their semantic models; their generated ST is an artifact, not a
round-trip source. IL remains a compatibility surface where its compiler path
accepts it.

## Simulation and hardware

Native POSIX simulation is the way to run a program on your computer. It needs
the desktop app, which includes the native runtime; a browser WebAssembly
simulator is not available in this release. Hardware actions are separate:
build runtime firmware, flash runtime firmware, deploy a compiled program, then
run/debug. A person starts each of them.

## Debugging boundary

Watches, traces, breakpoints, and forces show only what the connected adapter
can report. A host trace is not hardware/HIL evidence; a force or RUN/STOP
action on a physical system requires explicit human authority and a site safety
procedure. AI and MCP tools cannot force values or change RUN/STOP; see
[AI and privacy](./ai-privacy.md).

## Pause, resume, step and Stop

Pause, resume and step keep the logical state of the program where it is, and Stop discards it. The table holds for the native simulation and for the Zephyr scheduler of a connected board.

| Action | Output image | Forces | The scan |
|---|---|---|---|
| Pause | Kept | Kept | Pauses between scans. |
| Step | Kept, and shows the stepped scan | Kept | Runs one whole scan, or finishes the scan stopped at a breakpoint. |
| Resume | Kept | Kept | A scan stopped at a breakpoint continues from there. |
| Stop | Zeroed | Cleared | Every task is back at its entry point, and a scan that a breakpoint interrupted is discarded. |

A fault clears the image and the forces as Stop does. On a board, Pause, Step and Stop also drive the physical outputs to their safe state, off. [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop) has the full table and the Zephyr tests behind it, run on `native_sim` and QEMU with no board measured. For the native simulation the checks are in `firmware/lib/zplc_core/tests/test_native_runtime_session.c`, where Stop also zeroes the input image.
