# Implementation Plan: Communication Function Blocks — VM Spec

**Branch**: `003-comm-fb-vm` | **Date**: 2026-03-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/003-comm-fb-vm/spec.md`

---

## Summary

ZPLC currently has no VM-backed communication function blocks; all communication logic
lives in runtime service threads outside the VM scan cycle. This plan adds three layers:

1. **ISA layer** — 3 new opcodes (`OP_COMM_EXEC`, `OP_COMM_STATUS`, `OP_COMM_RESET`) in
   the reserved `0xD0–0xD2` range of the 32-bit operand family.
2. **Dispatch layer** — A new Core library module (`zplc_comm_dispatch.c/.h`) that bridges
   VM opcodes to app-registered protocol handlers without using `malloc`.
3. **Compiler + IDE layer** — New stdlib FB definitions in `communication.ts` and visual
   catalog replacements in the IDE transpilers.

Phase 1: Modbus FBs (4 FBs). Phase 2: MQTT FBs (3 FBs). Phase 3: Cloud wrappers (deferred).

Design decisions are documented in [research.md](research.md). Memory layouts are in
[data-model.md](data-model.md). Interfaces are in [contracts/comm-fb-api.md](contracts/comm-fb-api.md).

---

## Technical Context

**Language/Version**: ANSI C99 (`libzplc_core`), TypeScript 5.x (compiler + IDE), Bun runtime
**Primary Dependencies**: Zephyr RTOS (for app-layer handlers), `@zplc/compiler` stdlib registry
**Storage**: N/A (FB state is transient VM work memory)
**Testing**: `ctest` (C unit tests), `bun test` (TypeScript), west build CI (cross-compilation)
**Target Platform**: Embedded (5 Zephyr boards), POSIX, WASM, Electron desktop
**Project Type**: Embedded firmware library + TypeScript compiler plugin + IDE integration
**Performance Goals**: VM FB call adds ≤ 1 μs to scan time (dispatch table lookup is O(1)); no blocking I/O in scan path
**Constraints**: Zero `malloc`/`free` in Core; `-Werror` must pass; no `any` in TS
**Scale/Scope**: 7 FBs Phase 1+2, 5 Phase 3 (deferred), ~1000 LOC total across all layers

---

## Constitution Check

_GATE: Evaluated at plan completion. All gates: ✅ PASS_
_Reference: `.specify/memory/constitution.md` v1.1.0_

| Gate                                          | Principle                 | Status                                                         |
| --------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| Spec / plan exists before code                | I. Spec First             | ✅                                                             |
| No new `malloc`/`free` in C Core              | II. Static Memory Only    | ✅ (dispatch table is static array; FB mem is VM memory slice) |
| No direct hardware access in `src/core/`      | III. HAL Abstraction      | ✅ (dispatch calls registered app handlers, never hardware)    |
| New opcodes defined in `zplc_isa.h` first     | V. ISA as Source of Truth | ✅ (opcodes 0xD0–0xD2 defined before implementation)           |
| Tests written (failing) before implementation | IV. Test-First            | ✅ (test files created before source files per task order)     |
| CI cross-compiles for all 5 target boards     | IV. Test-First            | ✅ (quickstart.md §6 covers all 5 boards)                      |
| No `any` in TS / no unchecked `void*` in C    | IV. Industrial Quality    | ✅ (mem pointer typed as `uint8_t *`)                          |
| Builds pass with `-Werror` / `tsc --noEmit`   | IV. Industrial Quality    | ✅ (existing build flags, no exceptions)                       |

**Complexity Tracking**: No violations. No exceptions needed.

---

## Project Structure

### Documentation (this feature)

```text
specs/003-comm-fb-vm/
├── spec.md                    ✅ written
├── plan.md                    ✅ this file
├── research.md                ✅ written
├── data-model.md              ✅ written
├── quickstart.md              ✅ written
├── contracts/
│   └── comm-fb-api.md         ✅ written
└── tasks.md                   🔲 (next: /speckit.tasks)
```

### Source Code (repository root)

```text
firmware/
├── lib/zplc_core/
│   ├── include/
│   │   ├── zplc_isa.h                  [MODIFY] Add OP_COMM_EXEC (0xD0), OP_COMM_STATUS (0xD1), OP_COMM_RESET (0xD2)
│   │   └── zplc_comm_dispatch.h        [NEW]    Dispatch API: kind enum, status codes, register_handler, exec, reset
│   ├── src/core/
│   │   ├── zplc_core.c                 [MODIFY] Add VM handlers for 0xD0–0xD2 in the fetch-decode-execute loop
│   │   └── zplc_comm_dispatch.c        [NEW]    Static handler table + exec/reset logic
│   ├── CMakeLists.txt                  [MODIFY] Add zplc_comm_dispatch.c to sources
│   └── tests/
│       └── test_comm_dispatch.c        [NEW]    C unit tests for dispatch (stub handlers, FSM state)
│
└── app/src/
    ├── zplc_comm_modbus_handler.c      [NEW]    Bridges dispatch to zplc_modbus_client_*
    └── zplc_comm_mqtt_handler.c        [NEW]    Bridges dispatch to zplc_mqtt ring-buffer queue

packages/
├── zplc-compiler/src/compiler/stdlib/
│   ├── communication.ts                [NEW]    FunctionBlockDef for all Phase 1+2 FBs
│   ├── communication.test.ts           [NEW]    Bun tests: FB lookup, generateCall opcodes, offset correctness
│   └── index.ts                        [MODIFY] Import + register comm FBs in initRegistry()
│
└── zplc-ide/src/
    ├── editors/comm/
    │   └── commBlockCatalog.ts         [NEW]    CommBlockDef catalog for visual editors
    ├── transpiler/
    │   ├── fbdToST.ts                  [MODIFY] Replace COMM_* placeholder emission with real ST FB calls
    │   └── ldToST.ts                   [MODIFY] Same as fbdToST.ts
    └── compiler/il/ilToST.ts           [MODIFY] Handle CAL MB_READ_HREG / MQTT_PUBLISH (if not already generic)
```

**Structure Decision**: Multi-package monorepo with clear ownership per layer. Core library
changes are isolated from app-layer handlers. Compiler changes are isolated from IDE transpiler
changes. Each layer can be tested independently.

---

## Verification Plan

### Automated Tests — C (ctest)

```bash
# From: firmware/lib/zplc_core/build (run cmake .. first if new)
make -j && ctest --output-on-failure
```

New test file `test_comm_dispatch.c` MUST cover:

- Handler registration: `zplc_comm_register_handler(MB_READ_HREG, stub)` → `exec` calls `stub`
- No-handler case: `exec` without registration → `STATUS = ZPLC_COMM_NO_HANDLER`, `ERROR = 1`
- FSM state transitions: `IDLE → REQUESTED → PENDING → DONE` over 3 simulated scans
- Reset: `reset` clears BUSY/DONE/ERROR/STATUS to 0
- Kind boundary: kind `0x0000` and `0xFFFF` return `-EINVAL`

### Automated Tests — TypeScript (bun test)

```bash
# From: packages/zplc-compiler
bun test src/compiler/stdlib/communication.test.ts
# Also run full suite:
bun test
```

New file `communication.test.ts` MUST cover:

- `getFB('MB_READ_HREG')` returns FB with correct `size = 110`
- `getFB('MQTT_PUBLISH')` returns FB with correct `size = 190`
- `generateCall()` for `MB_READ_HREG` emits `OP_COMM_EXEC` with operand `0x00000001`
- `generateCall()` for `MQTT_PUBLISH` emits `OP_COMM_EXEC` with operand `0x0000000B`
- Member offset for `STATUS` is `4` on all Phase 1+2 FBs
- Member offset for `TOPIC` in `MQTT_PUBLISH` is `12`

### Automated Tests — Cross-compilation (Zephyr west)

```bash
# From: quickstart.md §6 — run for all 5 boards
source ~/zephyrproject/activate.sh
west build -b mps2/an385 $ZPLC_PATH/firmware/app --pristine
```

All 5 boards must compile without `-Werror` failures after ISA additions.

### Automated Tests — IDE transpiler (bun test)

```bash
# From: packages/zplc-ide
bun test
```

Existing transpiler tests must continue to pass. FB-specific tests must verify that
placing a `MB_READ_HREG` visual block in FBD/LD and transpiling produces:

```st
ReadTemp(EN := ..., PROTO := 1, SLAVE_ID := 1, ADDR := 40001, ...);
```

Not the placeholder `// COMM_CONNECT placeholder` format.

### Manual Verification (HIL gate)

1. Flash a QEMU or physical board with the new firmware.
2. Open IDE, create a new project, add an `MB_READ_HREG` block in FBD, wire `EN` to a boolean variable.
3. Start a Modbus TCP simulator (`diagslave -m tcp 502`) on the same machine.
4. Compile and load the `.zplc` to the target.
5. Set the boolean variable to `TRUE` via the Watch window.
6. Observe: `BUSY = TRUE` for 1 scan, then `DONE = TRUE` for 1 scan, `VALUE` holds the register content.
7. Disconnect the simulator. Observe: `ERROR = TRUE` for 1 scan, `STATUS ≠ 0`.
