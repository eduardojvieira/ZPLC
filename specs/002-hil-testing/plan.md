# Implementation Plan: Hardware-in-the-Loop Testing System

**Branch**: `002-hil-testing` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-hil-testing/spec.md`

## Summary

This feature implements a comprehensive Hardware-in-the-Loop (HIL) testing system to validate the ZPLC runtime on physical Raspberry Pi Pico hardware. The system consists of three main components:

1. **Runtime Debug Infrastructure**: Extensions to the Zephyr firmware that output machine-parseable debug information via serial
2. **IDE/Compiler Extensions**: CLI interface for headless compilation and upload
3. **Test Framework**: A TypeScript test runner that orchestrates compile → upload → verify cycles

## Technical Context

**Language/Version**: 
- Runtime: ANSI C99 (Zephyr RTOS 4.0)
- Test Framework: TypeScript 5.9 (Bun runtime)
- IDE: TypeScript/React (Electron)

**Primary Dependencies**:
- Runtime: Zephyr Shell, existing `zplc_core`, `zplc_scheduler`, `zplc_hal`
- Test Framework: `serialport` (Node.js serial library), `bun:test`
- IDE: Existing `zplc-compiler`, `zplc-ide` packages

**Storage**: N/A (tests are stateless)

**Testing**: 
- Unit tests: `bun test` (TypeScript)
- HIL tests: Custom framework with JUnit XML output
- C tests: `ztest` (existing)

**Target Platform**: 
- Runtime: Raspberry Pi Pico (RP2040, Zephyr)
- Test Framework: macOS/Linux (CI runner)

**Project Type**: Monorepo extension (firmware + packages)

**Performance Goals**:
- Single test cycle: < 30 seconds (compile + upload + verify)
- Serial output latency: < 50ms for debug responses
- Full opcode test suite: < 30 minutes

**Constraints**:
- Single USB port for all communication (upload + debug)
- 115200 baud serial throughput
- No dynamic memory allocation in C runtime
- Debug must be runtime-controllable (not compile-time)

**Scale/Scope**:
- 75 opcode tests
- 22 function block tests
- 4 language coverage tests (ST, LD, FBD, SFC)
- ~120 total test cases

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| **Spec First** | ✅ PASS | spec.md complete with clarifications |
| **No Malloc** | ✅ PASS | Debug output uses static buffers, shell_print |
| **HAL Abstraction** | ✅ PASS | Debug output via shell (Zephyr HAL), not direct UART |
| **Strict Types** | ✅ PASS | TypeScript strict, C99 with explicit types |
| **Warnings = Errors** | ✅ PASS | Existing `-Werror` policy maintained |
| **Test First** | ✅ PASS | This IS the testing infrastructure |

## Project Structure

### Documentation (this feature)

```text
specs/002-hil-testing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (debug protocol)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# Runtime Debug Extensions (C)
firmware/
├── app/
│   ├── src/
│   │   ├── shell_cmds.c          # EXTEND: Add HIL debug commands
│   │   └── hil_debug.c           # NEW: Debug output infrastructure
│   └── boards/
│       └── rpi_pico_rp2040.conf  # EXTEND: Enable HIL features
├── lib/zplc_core/
│   ├── include/
│   │   └── zplc_debug.h          # NEW: Debug API header
│   └── src/core/
│       └── zplc_debug.c          # NEW: Debug output implementation

# Test Framework (TypeScript)
packages/
├── zplc-hil/                     # NEW: HIL test framework package
│   ├── src/
│   │   ├── index.ts              # Main exports
│   │   ├── device.ts             # Serial device connection
│   │   ├── protocol.ts           # Debug protocol parser
│   │   ├── runner.ts             # Test orchestrator
│   │   ├── assertions.ts         # Timing/pattern assertions
│   │   └── reporter.ts           # JUnit XML output
│   ├── tests/                    # Test definitions
│   │   ├── opcodes/              # 75 opcode tests
│   │   ├── blocks/               # 22 FB tests
│   │   ├── scheduler/            # Multi-task tests
│   │   └── languages/            # ST/LD/FBD/SFC tests
│   └── package.json
│
├── zplc-ide/
│   ├── src/
│   │   └── cli/                  # NEW: CLI interface for headless ops
│   │       ├── index.ts
│   │       ├── compile.ts
│   │       └── upload.ts
│   └── electron/
│       └── main.ts               # EXTEND: IPC for CLI operations

# CI Configuration
.github/
└── workflows/
    └── hil-tests.yml             # NEW: Self-hosted runner workflow
```

**Structure Decision**: Extends existing monorepo structure. New `zplc-hil` package for test framework, runtime debug code in existing firmware structure.

## Complexity Tracking

No violations to justify - design follows all Constitution principles.

---

## Phase 0: Research

See [research.md](./research.md) for detailed findings.

### Research Topics

1. **Serial Port Library Selection** - Best library for cross-platform serial in Bun/Node
2. **Debug Protocol Design** - Format for machine-parseable debug output
3. **Zephyr Shell Extension Patterns** - How to add structured output to existing commands
4. **JUnit XML Format** - Standard format for CI integration
5. **Timing Assertion Patterns** - How to handle RTOS timing variance

## Phase 1: Design

See the following artifacts:
- [data-model.md](./data-model.md) - Entity definitions
- [contracts/debug-protocol.md](./contracts/debug-protocol.md) - Serial protocol spec
- [contracts/cli-api.md](./contracts/cli-api.md) - IDE CLI interface
- [quickstart.md](./quickstart.md) - Developer setup guide
