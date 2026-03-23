# Implementation Plan: Native Runtime Simulation Parity

**Branch**: `009-native-runtime-sim` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-native-runtime-sim/spec.md`

## Summary

Replace the renderer-owned WASM simulation path with a native runtime session model that the IDE consumes the same way it consumes hardware sessions: as a runtime client, not as a second PLC implementation. The first delivery uses the existing C core plus POSIX HAL in a desktop-native simulator process supervised by Electron main, exposes a versioned machine-readable session contract over framed stdio, and adds capability reporting so unsupported hardware-dependent features stay explicit instead of being faked. Zephyr `native_sim` remains a later option for higher-fidelity RTOS behavior, not the first implementation target.

Design decisions and rationale are captured in [research.md](research.md). Data entities are in [data-model.md](data-model.md). The external session interface is in [contracts/native-runtime-session.md](contracts/native-runtime-session.md).

## Technical Context

**Language/Version**: ANSI C99 (`firmware/lib/zplc_core`, host runtime), TypeScript 5.9 (IDE + Electron), React 19, Electron 39, Bun runtime  
**Primary Dependencies**: ZPLC core + POSIX HAL, existing Zephyr scheduler/runtime behavior as reference, Electron main/preload IPC boundary, IDE runtime adapter layer  
**Storage**: Local files for projects and evidence; host persistence through existing POSIX HAL-backed retentive storage  
**Testing**: `ctest` for core/host runtime, `bun test` for IDE/runtime adapter tests, Electron smoke scripts, Zephyr cross-builds, physical-board HIL parity validation  
**Target Platform**: Electron desktop on macOS/Linux/Windows for simulation clients; POSIX host runtime for native simulator backend; Zephyr hardware remains parity reference  
**Project Type**: Embedded runtime + desktop application + machine-readable session contract  
**Performance Goals**: Local simulation reaches interactive ready state in under 10 seconds; session status/watch updates are available to the IDE within 250 ms under normal debugging load; no renderer-visible UI regressions below 60 fps  
**Constraints**: No direct platform APIs in core VM; no `malloc`/`free` in C core; no renderer-owned scan scheduling or breakpoint semantics; `.zplc` format remains unchanged unless separately versioned; unsupported capabilities must be surfaced explicitly; parity claims require host tests, Zephyr cross-builds, and HIL evidence  
**Scale/Scope**: Replace the current primary simulation path in `packages/zplc-ide`, turn `firmware/apps/posix_host` into a real session backend, add a native adapter and contract tests, define compatibility evidence for logic, debugging, retentive state, tasks, and supported communication workflows

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

_Pre-design evaluation: ✅ PASS_  
_Post-design evaluation: ✅ PASS_  
_Reference: `.specify/memory/constitution.md` v1.1.1_

| Gate | Principle | Pre-Design | Post-Design | Notes |
|------|-----------|------------|-------------|-------|
| Spec and plan exist before implementation | I. Spec First | ✅ | ✅ | Feature has approved spec and this plan before code work starts. |
| Core keeps HAL separation | Critical Rules — HAL Abstraction | ✅ | ✅ | Native process management stays in `firmware/apps/posix_host` and Electron main, not in `src/core/`. |
| Core preserves static memory rules | Critical Rules — Memory Management | ✅ | ✅ | Plan adds host/session layers without introducing dynamic allocation into core VM logic. |
| `.zplc` remains canonical contract | I. Spec First / ISA as Single Source of Truth | ✅ | ✅ | Plan reuses existing compiled artifacts and avoids simulator-only bytecode semantics. |
| Test-first evidence is required | IV. Industrial Quality | ✅ | ✅ | Verification plan includes host unit/integration, IDE tests, cross-builds, and HIL parity checks before claims. |
| Errors are explicit and capability-driven | IV. Industrial Quality | ✅ | ✅ | Native session contract carries structured errors and explicit supported/degraded/unavailable capability states. |
| No renderer-side runtime orchestration | III. Essentialism & YAGNI / Code Quality | ✅ | ✅ | Renderer stays UI-only; lifecycle supervision moves to Electron main plus native runtime process. |
| Docs and parity evidence stay part of delivery | Compliance Review | ✅ | ✅ | Contract, quickstart, and parity evidence model are included in planning artifacts. |

**Result**: No constitutional violations require exception handling.

## Phase Overview

### Phase 0 — Research and Contract Decisions

1. Confirm the current adapter/runtime split and parity gaps across `WASMAdapter`, `SerialAdapter`, Zephyr shell commands, POSIX HAL, and host runtime stub.
2. Choose the first implementation target: desktop-native runtime process built from the existing core + POSIX HAL, not Zephyr `native_sim`.
3. Choose the supervision model: `renderer -> preload -> Electron main -> native simulator`, with Electron main owning child lifecycle.
4. Choose the transport: framed stdio with versioned request/response/event messages and capability negotiation.
5. Define the parity model: runtime-owned execution state, breakpoint state, force table, task snapshots, and explicit capability degradation.

### Phase 1 — Design and Contracts

1. Turn `firmware/apps/posix_host` from a ticker into a real session backend that can load `.zplc`, expose runtime control, and surface parity-oriented status.
2. Add a native adapter to the IDE runtime layer and update Electron preload/main to broker simulator sessions securely.
3. Define the native session contract, data entities, and quickstart/verification flow.
4. Update agent context with the new runtime/session planning vocabulary.

### Phase 2 — Task Planning Boundary

This planning command stops before task decomposition. `/speckit.tasks` will break the work into implementation slices such as contract tests, host runtime backend, Electron supervision, native adapter integration, capability-driven UI changes, and parity validation.

## Project Structure

### Documentation (this feature)

```text
specs/009-native-runtime-sim/
├── plan.md                         # This file
├── research.md                     # Phase 0 research decisions
├── data-model.md                   # Phase 1 data entities and transitions
├── quickstart.md                   # Phase 1 validation workflow
├── contracts/
│   └── native-runtime-session.md   # Native simulator session contract
└── tasks.md                        # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
firmware/
├── apps/posix_host/
│   ├── src/main.c                           [MODIFY] Replace phase-0 ticker with native simulator session host
│   └── CMakeLists.txt                       [MODIFY] Promote host runtime app from placeholder to real build entry
│
└── lib/zplc_core/
    ├── include/
    │   ├── zplc_core.h                      [VERIFY] Reuse load/run/debug APIs for host simulator
    │   └── zplc_scheduler.h                 [VERIFY] Reference scheduler/task contract for parity model
    ├── src/hal/posix/
    │   └── zplc_hal_posix.c                 [MODIFY] Fill parity-critical host HAL behavior and diagnostics as needed
    └── tests/
        ├── ... existing core tests          [VERIFY] Extend host/runtime parity coverage
        └── [NEW host runtime tests]         [ADD] Contract and behavior tests for native simulator backend

packages/
└── zplc-ide/
    ├── electron/
    │   ├── main.ts                          [MODIFY] Supervise native simulator child process and expose IPC handlers
    │   └── preload.ts                       [MODIFY] Expose safe simulation session API to renderer
    ├── src/runtime/
    │   ├── debugAdapter.ts                  [MODIFY] Extend adapter typing and capability model for native sessions
    │   ├── nativeAdapter.ts                 [NEW] IDE adapter for native simulator session contract
    │   ├── connectionManager.ts             [MODIFY] Separate hardware polling concerns from local simulator session orchestration
    │   ├── debugCapabilities.ts             [MODIFY] Support supported/degraded/unavailable capability states
    │   ├── serialAdapter.ts                 [VERIFY] Preserve hardware contract baseline for parity comparison
    │   └── wasmAdapter.ts                   [MODIFY/DEPRECATE] Reduce to fallback/legacy role once native simulation is primary
    ├── src/hooks/
    │   └── useDebugController.ts            [MODIFY] Select native vs hardware backends without renderer-owned runtime semantics
    ├── src/runtime/*.test.ts                [ADD/MODIFY] Contract, capability, and adapter parity tests
    └── package.json                         [VERIFY] Existing Electron scripts remain the desktop entry path
```

**Structure Decision**: Keep runtime execution in C/POSIX and process supervision in Electron main. The renderer remains a client through preload-exposed APIs. Hardware and native simulation both conform to the same conceptual runtime session contract, while capability negotiation prevents unsupported features from being implied.

## Verification Plan

### Automated Tests — Core / Host Runtime

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/firmware/lib/zplc_core
mkdir -p build && cd build
cmake ..
ctest --output-on-failure
```

Must cover:

- `.zplc` load/reset/start/stop behavior for host runtime
- breakpoint add/remove/list and pause/resume/step semantics
- runtime-owned force table behavior
- retentive-memory restoration via POSIX HAL persistence
- structured session protocol serialization and error handling

### Automated Tests — IDE Runtime Layer

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/packages/zplc-ide
bun test
```

Must cover:

- native adapter request/response handling
- capability negotiation and degraded-feature reporting
- `useDebugController` backend switching without special-case renderer semantics
- parity-oriented status normalization across native and serial adapters

### Desktop Smoke Validation

```bash
cd /Users/eduardo/Documents/Repos/ZPLC/packages/zplc-ide
bun run smoke:desktop
```

Must cover:

- Electron main can start and stop simulator sessions
- preload-exposed simulation API functions under context isolation
- compile → load → pause/resume/step → watch/force flows for local simulation

### Firmware Cross-Build Reference

```bash
source ~/zephyrproject/activate.sh
cd ~/zephyrproject
for BOARD in arduino_giga_r1/stm32h747xx/m7 esp32s3_devkitc nucleo_h743zi rpi_pico mps2/an385; do
  west build -b "$BOARD" $ZPLC_PATH/firmware/app --pristine
done
```

This remains required because local simulation parity claims are only credible against maintained hardware builds.

### HIL Parity Gate

Run representative projects on at least one serial-focused board and one network-capable board. Compare against native simulation for:

- lifecycle state transitions
- breakpoint and step stop locations
- watch and force behavior
- retentive-memory recovery
- declared supported communication workflows

Any mismatch either blocks the feature or downgrades the corresponding capability claim.

## Complexity Tracking

No constitutional violations or complexity exceptions are required at planning time.
