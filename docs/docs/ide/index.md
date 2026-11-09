---
slug: /ide
id: index
title: The ZPLC application
sidebar_label: ZPLC application
description: What the ZPLC desktop application does, how it is built, and where its boundaries are.
tags: [ide, tooling]
---

# The ZPLC application

ZPLC is the desktop application for writing, building, testing, simulating and reviewing PLC projects. A project is a folder you choose, and the application reads and writes the files in it. This page gives the overview and explains how the application is built; the other pages of this section cover the [workbench](./features.md), the [editors](./editors.md), the [compiler](./compiler.md) and [migration from version 1](./migration-v1-to-v2.md).

## Quick path

1. Open a project folder, or create one with **New project**. You can also copy a bundled example into a folder.
2. Edit a Structured Text, Instruction List, Ladder, Function Block Diagram or Sequential Function Chart file, and build the project.
3. Run the scenario tests and the native simulation, and read the result in the panel under the editor.
4. For a board, build the firmware, flash it, deploy the program and run it. A person starts each of these steps; see [Deploy a program](./deployment.md).

## What the application owns

| Area       | What it does                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Project    | Reads and writes the files of the folder, `zplc.json` included, and exports a reviewed version 2 project. |
| Editors    | A text editor for Structured Text and Instruction List, and a model editor for each graphical language.   |
| Validation | Compiler diagnostics, scenario tests, safety checks, traces and the native simulation.                    |
| Evidence   | Records each result with its scope, and never presents a host result as a hardware result.                |
| Hardware   | Connecting and deploying are explicit actions of a person, after a compatibility check.                   |

## Boundaries

The native simulation validates behavior on the host computer. It does not show the timing of a target, electrical I/O, hardware-in-the-loop behavior or production qualification. Board profiles carry cross-build evidence only; see the [hardware evidence](../reference/capabilities-evidence.md).

An AI assistant may prepare an isolated candidate change, but only a person can save it or start a physical operation. Read [AI and privacy](./ai-privacy.md) before you opt in to an AI provider.

## How the application is built

The application keeps privileged access out of the window. The editors and panels see a folder-backed project through a narrow interface, and the operating-system work happens elsewhere.

| Layer                    | Responsibility                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Renderer                 | The workbench, the visual models, the diagnostics and the evidence views. It has no filesystem, shell or device access of its own. |
| Preload and main process | Validated, narrow filesystem and supervised runtime operations.                                                                    |
| Compiler                 | Compiles source and visual models to `.zplc`.                                                                                      |
| Runtime adapters         | The native simulation, or a connected compatible runtime.                                                                          |

### How the layers talk

The renderer reaches the main process only through the preload, and only through the channels that `packages/zplc-ide/electron/ipcContract.ts` names. That module is the one definition: the main process, the preload and the renderer all take their channel names from it.

- **One handler per channel.** The main process refuses to start if a channel has no handler or a handler has no channel.
- **Sender and message first.** Every call is checked before its handler runs: the sender must be the trusted ZPLC document of the window, and the arguments must fit the schema of the channel. Anything else is denied with one fixed message.
- **A narrow preload.** It exposes one method per operation and nothing generic: no `send`, no raw channel access and no path of the machine.
- **Fixed processes.** The processes started for compile, test and firmware build come from a closed list of fixed argument vectors, start without a shell and never take a command or an argument from the renderer.

Evidence level: host. `packages/zplc-ide/electron/ipcRegistry.test.ts` runs the real handler table against stand-ins for Electron and the stores, `packages/zplc-ide/electron/preload.test.ts` runs the real preload and compares what it invokes with the contract, and `packages/zplc-ide/shared/spawnAllowList.test.ts` shows the argument vectors. It is not packaged-application evidence.

### Work that does not block the window

Compile, safety check, scenario tests and the candidate review each run in a process of their own, started for the request from a fixed list and stopped when the request ends, so a long compile or run cannot freeze the window. **Cancel scenarios** in the Tests panel asks the worker to stop; a worker that is busy and does not answer is killed after a short grace period, and a deadline kills a worker that never finishes. Killing the worker also ends the native runtime that it started. A cancelled run is shown and recorded as cancelled, and nothing of it is kept as a build.

Evidence level: host. `packages/zplc-ide/electron/toolWorkerHost.test.ts` runs real child processes: a worker stuck in a busy loop is killed while the caller keeps running, and the real worker compiles a project and cancels a run of scenarios on the native runtime. Journey 35 of `bun run test:journeys` cancels a long run in the real application.

### One project of record

Build, Test, Simulate and the candidate review all act on the folder that the window shows, and on nothing else. The main process owns that folder: the native folder dialog gives the window one folder and one opaque id for it. A build, a safety check or a test run names the workspace and that id, and the main process refuses the call when the id is not the window's folder now, or when the workspace belongs to another folder. Opening another folder therefore makes every earlier workspace unusable, with no linking step in between.

Evidence level: host. `packages/zplc-ide/electron/workspaceTestGateway.test.ts` covers the rule, and a scripted run of the real application sends crafted messages through the bridge of the real application after another folder was opened and sees each of them refused.

### Security properties

The renderer is unprivileged. These are what the running application does, not what its source says:

- an inline script or inline event handler that a page injects is blocked by the content security policy (`script-src 'self'` in a packaged build), and a request to another origin is refused by `connect-src`;
- a permission other than serial (notifications, location, camera, microphone, clipboard read, MIDI) is refused, while serial stays available to the ZPLC document;
- `window.open`, a link that opens a new window and navigation to another origin are refused, and the window keeps its document, its folder and its IPC afterwards;
- a project operation given a path with `..`, an absolute path or a drive path, a link that leaves the project, an over-size write, or the folder id of another window is refused, and nothing outside the project changes.

Evidence level: host. A scripted run of the real application makes these probes on the development host. That host serves its own scripts inline for hot reload, so the inline-script probe is not made there, and the probes cover Linux only: the packaged application on macOS and Windows is not probed. Contributors can run the probes against a packaged Linux build; see [Probe a packaged build](../development/ide-internals.md#probe-a-packaged-build).

### Project configuration

`zplc.json` names the project metadata, the target, the tasks and the sources. A board choice is checked against the catalogued profile during an operation; it does not import a capability model or certify a wiring configuration. Examples are copied to a folder you choose, and there is no virtual or memory-only project. To bring a version 1 project into a folder, see [Migrate a v1 project to v2](./migration-v1-to-v2.md).
