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

The IDE is a web-based application built with React, TypeScript, and Vite. It provides the user interface for writing PLC programs, managing projects, and interacting with the target hardware.

*   **Editor**: Utilizes Monaco Editor for a rich text editing experience (syntax highlighting, autocomplete) for Structured Text.
*   **State Management**: Uses Zustand for managing application state.
*   **Deployment**: Handles communicating with the target hardware via serial or network protocols to deploy compiled bytecode.

### 2. The Compiler

The compiler takes source code written in IEC 61131-3 languages (currently focusing on Structured Text) and translates it into a binary format that the ZPLC runtime can execute.

*   **Frontend**: Parses the source code into an Abstract Syntax Tree (AST).
*   **Intermediate Representation (IR)**: All supported languages are converted into a common IR.
*   **Backend**: Emits the `.zplc` bytecode.

### 3. The Runtime (Core VM)

The runtime is the heart of ZPLC. It is a C99 interpreter designed to run on resource-constrained embedded systems.

*   **Core (`libzplc_core`)**: The bytecode interpreter, scheduler, and memory manager. It is completely hardware-agnostic.
*   **Hardware Abstraction Layer (HAL)**: A set of defined C interfaces (`zplc_hal_*`) that the Core uses to interact with the outside world (timers, GPIO, networking).
*   **Target Implementations**: Specific implementations of the HAL for different platforms (e.g., Zephyr RTOS on STM32, POSIX on Linux).

## Data Flow

1.  **Authoring**: The user writes a Structured Text program in the IDE.
2.  **Compilation**: The IDE invokes the compiler (often running as WebAssembly in the browser, or as a backend service). The output is a `.zplc` binary file.
3.  **Deployment**: The IDE sends the `.zplc` file to the target device.
4.  **Execution**: The ZPLC Runtime on the device loads the bytecode, schedules tasks based on their configured cycle times, and executes the instructions, interacting with physical I/O via the HAL.