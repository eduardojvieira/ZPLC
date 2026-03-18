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

- **Determinism**: Predictable execution time is non-negotiable. The runtime remains
  bounded, static-memory, and task-oriented.
- **Portability**: One execution core, multiple runtimes. The VM stays separated from the
  platform through a strict HAL contract.
- **Truthful scope**: v1.5 only claims what the repository, docs, CI, and human evidence
  can actually prove.
- **Modern engineering workflow**: IDE, compiler, CI, and docs are treated as one product
  surface instead of disconnected demos.

## Product Boundaries

ZPLC consists of several distinct subsystems:

1.  **Core VM (`firmware/lib/zplc_core`)**: The C99 bytecode interpreter. It handles scheduling, task management, and executing the compiled logic. It has zero dependencies on specific hardware.
2.  **Hardware Abstraction Layer (HAL)**: The contract that allows the Core VM to run on various targets (e.g., STM32, ESP32, POSIX).
3.  **Compiler (`packages/zplc-compiler`)**: Translates IEC language paths into `.zplc`
    bytecode.
4.  **IDE (`packages/zplc-ide`)**: Authoring, compiling, simulation, deployment, and
    debugging for the claimed language workflows.
5.  **Target Runtimes**: Specific firmware builds that combine the Core VM, a HAL implementation, and an RTOS (usually Zephyr).

## v1.5 Release Boundaries

The release foundation is considered real only when:

- supported boards come from one canonical manifest;
- claimed language workflows have matching automation and docs;
- protocol features have runtime, compiler, IDE, and docs evidence;
- desktop and HIL claims have human proof, not only code presence.

## Why ZPLC?

Traditional PLCs often lock users into proprietary ecosystems and outdated development tools. ZPLC provides an open, modern alternative that leverages standard microcontrollers while adhering to the established IEC 61131-3 standard for automation logic.
