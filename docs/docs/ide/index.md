---
slug: /ide
id: index
title: IDE & Tooling
sidebar_label: IDE Overview
description: Release-aligned overview of the ZPLC IDE, project model, runtime adapters, and debugging workflows.
tags: [ide, tooling, debugging]
---

# IDE & Tooling

The IDE is the operator-facing proof that ZPLC v1.5.0 is more than a compiler demo.

It owns the engineering workflow that starts with IEC authoring and ends with simulation,
hardware deployment, and runtime debugging.

## What the IDE is responsible for

Grounded in `packages/zplc-ide`, the IDE currently owns five release-critical surfaces:

- **Project model** backed by `zplc.json`, source files, and task metadata
- **Language workflows** for `ST`, `IL`, `LD`, `FBD`, and `SFC`
- **Compilation** through the shared `@zplc/compiler` backend
- **Runtime adapters** for browser simulation, native desktop simulation, and serial hardware sessions
- **Debug operations** such as breakpoints, watch values, force values, and execution-state inspection

## End-to-end workflow

```mermaid
flowchart LR
  Author[Author IEC logic] --> Config[Configure project + target]
  Config --> Compile[Compile to .zplc]
  Compile --> Sim[Simulate in native or WASM runtime]
  Sim --> Deploy[Deploy to hardware]
  Deploy --> Debug[Debug runtime state]
```

Every claimed language path in v1.5 is expected to move through that same chain.

## Project model

The IDE project model is file-based and intentionally transparent.

- project metadata, target, network, I/O, communication, and task settings live in `zplc.json`
- program files remain plain text or model files under the project folder
- browser-capable environments can use the File System Access API
- unsupported browsers can still work with **virtual projects** stored in memory

That behavior is visible in `packages/zplc-ide/src/store/useIDEStore.ts` and the shared types
under `packages/zplc-ide/src/types/index.ts`.

## Runtime targets exposed by the IDE

The IDE does not talk to "the runtime" as a single thing. It selects an adapter based on the
execution context:

| Path | Backing adapter | Purpose | Release guidance |
|---|---|---|---|
| Browser simulation | `WASMAdapter` | fast local feedback in the browser | useful, but explicitly degraded for pause/resume/step/breakpoint parity |
| Native desktop simulation | `NativeAdapter` | Electron-backed host runtime session | preferred simulation path for release-facing parity work |
| Hardware runtime | `SerialAdapter` | Zephyr device over serial/WebSerial | authoritative path for board and HIL validation |

`createSimulationAdapter()` in `packages/zplc-ide/src/runtime/simulationAdapterFactory.ts`
chooses native simulation when the Electron bridge is available, and falls back to WASM otherwise.

## Debugging model

The debug workflow is capability-aware, not assumption-driven.

- native simulation exposes a capability profile through the Electron bridge
- hardware sessions derive state from runtime status and serial debug commands
- legacy WASM simulation remains available, but its control semantics are intentionally marked as degraded

That split matters because v1.5 release claims must distinguish **helpful simulation** from
**authoritative parity evidence**.

## Read next

- [IDE Architecture & Project Model](./overview.md)
- [Visual and Text Editors](./editors.md)
- [Compiler Workflow](./compiler.md)
- [Deployment & Runtime Sessions](./deployment.md)
- [Languages & Programming Model](../languages/index.md)

## Release boundary

The IDE package version currently aligned to this docs rewrite is `1.5.0` in
`packages/zplc-ide/package.json`.

That does **not** mean every workflow is automatically signed off. Final release credibility still
depends on the evidence gates tracked in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`.
