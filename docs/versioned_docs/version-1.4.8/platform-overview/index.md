---
slug: /platform-overview
id: index
title: Platform Overview
sidebar_label: Platform Overview
description: Learn about ZPLC, a deterministic IEC 61131-3 compatible runtime for modern industrial automation.
tags: [evaluator, architecture]
---

# Platform Overview

ZPLC (Zephyr PLC) is a next-generation, deterministic IEC 61131-3 compatible runtime designed for modern industrial automation. It bridges the gap between traditional industrial controllers and modern software engineering practices.

## Core Concepts

*   **Determinism**: Predictable execution times are non-negotiable. ZPLC is built on Zephyr RTOS, ensuring real-time behavior.
*   **Portability**: "One Execution Core, Any Runtime." The C-based core VM is decoupled from the hardware via a strict Hardware Abstraction Layer (HAL).
*   **Security**: Built from the ground up with secure principles, targeting robust deployment in industrial environments.
*   **Modern Developer Experience**: A web-based IDE (using React, TypeScript, and Monaco) brings standard software development workflows (Git, CI/CD) to PLC programming.

## Product Boundaries

ZPLC consists of several distinct subsystems:

1.  **Core VM (`firmware/lib/zplc_core`)**: The C99 bytecode interpreter. It handles scheduling, task management, and executing the compiled logic. It has zero dependencies on specific hardware.
2.  **Hardware Abstraction Layer (HAL)**: The contract that allows the Core VM to run on various targets (e.g., STM32, ESP32, POSIX).
3.  **Compiler (`packages/compiler`)**: Translates IEC 61131-3 languages (like Structured Text) into the `.zplc` bytecode format.
4.  **Web IDE (`packages/ide`)**: The browser-based development environment for authoring, compiling, and deploying PLC logic.
5.  **Target Runtimes**: Specific firmware builds that combine the Core VM, a HAL implementation, and an RTOS (usually Zephyr).

## Why ZPLC?

Traditional PLCs often lock users into proprietary ecosystems and outdated development tools. ZPLC provides an open, modern alternative that leverages standard microcontrollers while adhering to the established IEC 61131-3 standard for automation logic.