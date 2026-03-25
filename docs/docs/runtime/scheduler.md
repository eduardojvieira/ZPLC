---
sidebar_position: 2
---

# Multitask Scheduler

The public scheduler contract is defined in `firmware/lib/zplc_core/include/zplc_scheduler.h`.

## Overview

The scheduler exists to load, register, and execute PLC tasks with explicit interval and priority metadata.

Public task and scheduler states include:

- task states such as `IDLE`, `READY`, `RUNNING`, `PAUSED`, `ERROR`
- scheduler states such as `UNINIT`, `IDLE`, `RUNNING`, `PAUSED`, `ERROR`

:::note Native C code
The scheduler documentation on this page describes **ZPLC VM tasks** loaded from `.zplc` binaries.
If you need custom Zephyr-native C code, keep it in the runtime application as a built-in service/thread instead of treating it like an IDE-managed PLC program. See `runtime/native-c`.
:::

## Public lifecycle API

The scheduler header exposes these core operations:

- `zplc_sched_init()` / `zplc_sched_shutdown()`
- `zplc_sched_register_task()`
- `zplc_sched_load()` for multi-task `.zplc` binaries
- `zplc_sched_start()` / `stop()` / `pause()` / `resume()` / `step()`
- `zplc_sched_get_state()` / `get_stats()` / `get_task()` / `get_task_count()`
- `zplc_sched_lock()` / `unlock()` for shared-memory access outside task context

## Task Configuration

Tasks are defined in the project configuration (`zplc.json`) and compiled into the `.zplc` binary header.

### Properties

| Property | Description |
|---|---|
| **ID** | Unique identifier (0-255). |
| **Type** | `CYCLIC` (periodic execution) or `EVENT` (triggered by interrupt - *future*). |
| **Interval** | Cycle time in milliseconds (ms). |
| **Priority** | 0 (Highest) to 255 (Lowest). |
| **Entry Point** | Bytecode address where the task begins. |
| **Stack Size** | Memory allocated for the evaluation stack (default: 1024 bytes). |

## Execution Model

The current public header documents a Zephyr-oriented implementation model:

1. timers fire at task intervals
2. callbacks submit work items to priority-oriented work queues
3. work queue threads execute PLC cycles
4. shared memory is protected with synchronization primitives

```mermaid
flowchart LR
  Timer[Timer interval fires] --> Queue[Work item queued]
  Queue --> Worker[Priority work queue thread]
  Worker --> Cycle[PLC task cycle executes]
  Cycle --> Stats[Task stats updated]
```

## Statistics and inspection

The public scheduler statistics include values such as:

- cycle counts
- overrun counts
- last/max/average execution time
- active task count
- scheduler uptime

That is why scheduler-aware debug surfaces can report more than just VM PC/SP values.

## Shared-memory access from outside tasks

The explicit `zplc_sched_lock()` / `zplc_sched_unlock()` API is part of the public contract for safe shared-memory access outside normal PLC task execution.

That matters for:

- debug tools
- runtime services
- native support code
- protocol services that need synchronized access to shared memory

## Release-facing guidance

The scheduler docs are solid ground for claiming:

- explicit task metadata
- pause/resume/step scheduler control
- scheduler statistics
- shared-memory locking APIs
- a Zephyr work-queue-oriented execution model

They are **not** permission to invent extra scheduler semantics that are not visible in the public header or verified elsewhere.

:::warning Concurrency
If two tasks write to the same Global Variable or Output, the "Last Write Wins" rule still
applies unless the runtime path explicitly serializes access. Do not assume future planned
locking behavior as part of the v1.5 release claim unless it is backed by evidence.
:::
