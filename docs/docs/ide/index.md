---
slug: /ide
id: index
title: The ZPLC application
sidebar_label: ZPLC application
description: Folder-backed PLC authoring, validation, simulation, evidence, and human-controlled hardware workflows.
tags: [ide, tooling]
---

# The ZPLC application

ZPLC is the desktop workbench for creating, compiling, testing, simulating,
and reviewing PLC projects in a folder selected by the user.

## Quick path

1. Create or copy an example into a folder.
2. Edit ST, LD, FBD, or SFC and compile through the canonical compiler path.
3. Run temporal tests and native POSIX simulation; inspect the results in the bottom panel.
4. For hardware, use the separate human build, flash, deploy, and RUN/STOP flows.

## What the workbench owns

| Surface    | Current role                                                                     |
| ---------- | -------------------------------------------------------------------------------- |
| Project    | Folder-backed files, schema v2 export, migration diff.                           |
| Editors    | ST is the primary text path; LD/FBD/SFC preserve their semantic visual models.   |
| Validation | Compiler diagnostics, temporal tests, safety rules, trace, and POSIX simulation. |
| Evidence   | Records tool results and their scope; it does not promote host results to HIL.   |
| Hardware   | Connect and deploy remain explicit human actions after compatibility checks.     |

## Important boundaries

Native POSIX simulation validates host behavior. It is not a claim of exact
target timing, electrical I/O, HIL, or production qualification. Board profiles
currently carry cross-build evidence only; see [hardware support](../reference/capabilities-evidence.md).

AI may prepare an isolated candidate change, but only a person can save it or
initiate a physical operation. Read [AI and privacy](./ai-privacy.md) before you
opt in to an AI provider.
