---
slug: /architecture
id: index
title: System Architecture
sidebar_label: Architecture
description: High-level system architecture and data flows of the ZPLC platform.
tags: [architecture, evaluator, contributor]
---

# System Architecture

ZPLC is designed around a strict separation of concerns, ensuring that the runtime remains deterministic and portable, while the development tools leverage modern web technologies.

## High-Level Architecture

The system can be broadly divided into three main components:

1.  **The IDE (Development Environment)**
2.  **The Compiler**
3.  **The Runtime (VM)**

### 1. The IDE

The IDE is the engineering surface for authoring, compiling, simulating, deploying, and
debugging the claimed language paths.

- **Text editing**: Monaco-based workflows for `ST` and `IL`
- **Visual editing**: model-driven paths for `LD`, `FBD`, and `SFC`
- **Deployment/debugging**: shared workflow across simulation, desktop, and hardware paths

### 2. The Compiler

The compiler normalizes all claimed IEC language paths into the same bytecode/runtime
contract.

- **Frontend**: parses text or transpiled source into the compiler pipeline
- **Normalization path**: `IL`, `LD`, `FBD`, and `SFC` converge to the canonical ST-like path
- **Backend**: emits `.zplc` bytecode and related debug data

### 3. The Runtime (Core VM)

The runtime is the heart of ZPLC. It is a C99 interpreter designed to run on resource-constrained embedded systems.

*   **Core (`libzplc_core`)**: The bytecode interpreter, scheduler, and memory manager. It is completely hardware-agnostic.
*   **Hardware Abstraction Layer (HAL)**: A set of defined C interfaces (`zplc_hal_*`) that the Core uses to interact with the outside world (timers, GPIO, networking).
*   **Target Implementations**: Specific implementations of the HAL for different platforms (e.g., Zephyr RTOS on STM32, POSIX on Linux).

## Data Flow

1. **Authoring**: The user works in text or visual language paths.
2. **Compilation**: The IDE invokes the compiler and emits `.zplc`.
3. **Simulation / Deployment**: The result is executed in WASM, POSIX, or embedded targets.
4. **Debugging**: Watch, breakpoint, and force-value flows use the same execution contract.
