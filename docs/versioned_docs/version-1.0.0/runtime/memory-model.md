---
id: memory-model
title: Memory Model
sidebar_label: Memory Model
description: How ZPLC handles memory safely on constrained devices.
tags: [runtime, embedded, memory]
---

# Memory Model

Industrial runtimes cannot crash due to memory leaks or fragmentation. Therefore, the ZPLC VM enforces a strict, static memory model.

## No Dynamic Allocation

The core VM does not use `malloc`, `calloc`, `realloc`, or `free`. Once the runtime is initialized, the memory footprint is fixed and guaranteed.

## Memory Pools

Instead of dynamic allocation, ZPLC uses Kconfig-configurable memory pools.

*   **Bytecode Pool**: A dedicated block of memory for storing the uploaded `.zplc` executable.
*   **Variable State**: Global variables, inputs, and outputs are mapped to fixed memory locations at compile time.
*   **Task Stacks**: Each PLC task has a bounded, pre-allocated work memory stack.

## Exact-Width Types

To ensure portability across 32-bit and 64-bit architectures, the core uses exact-width integer types (`uint8_t`, `uint16_t`, `int32_t`, etc.) exclusively. Bare `int` or `long` are forbidden in the core logic.

## Configuration

When building the firmware (e.g., via Zephyr's `menuconfig` or `prj.conf`), the system integrator defines the limits:

```kconfig
CONFIG_ZPLC_MAX_TASKS=4
CONFIG_ZPLC_BYTECODE_MEM_SIZE=16384
CONFIG_ZPLC_STATE_MEM_SIZE=4096
```

If a downloaded program exceeds these static limits, the runtime rejects it during the load phase, preventing a crash during execution.