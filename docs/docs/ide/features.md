---
slug: /ide/features
id: features
title: Studio Workbench
sidebar_label: Workbench
description: The ZPLC Studio 2.0 editor, lower tool ledger, simulation, and evidence workflow.
tags: [ide, user-guide]
---

# Studio Workbench

The workbench keeps editing central and places Explorer, Inspector, Output,
Problems, Tests, Trace, Watch, and Terminal in one lower tool ledger.

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

Native POSIX simulation is the preferred host validation path. WASM is a
declared degraded fallback. Hardware actions are separate: build runtime
firmware, flash runtime firmware, deploy a compiled program, then run/debug.
Each remains human controlled and board evidence tiers are visible in Studio.

## Debugging boundary

Watches, traces, breakpoints, and forces show only what the connected adapter
can report. A host trace is not hardware/HIL evidence; a force or RUN/STOP
action on a physical system requires explicit human authority and site safety
