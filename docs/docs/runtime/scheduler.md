---
sidebar_position: 2
slug: /runtime/scheduler
id: scheduler
title: Multitask Scheduler
sidebar_label: Scheduler
description: Task execution, priority mechanics, and Zephyr integration within the ZPLC Runtime.
---

# Multitask Scheduler

ZPLC runs IEC 61131-3 automation logic using a real-time, priority-driven multitask scheduler.

## Execution Model Overview

The scheduler coordinates multiple user-defined tasks mapped inside your `.zplc` binary. Its lifecycle involves:
1. Loading task declarations from the binary header.
2. Allocating priority-oriented execution queues.
3. Managing state transitions (`READY`, `RUNNING`, `PAUSED`, `ERROR`).
4. Triaging synchronized memory locks when necessary.

## Task Configuration

Tasks dictate how and when programs execute. Tasks are authored in `zplc.json` and compiled directly into bytecode.

| Property | Description |
|---|---|
| **Type** | `CYCLIC` (time-interval driven) or `EVENT` (hardware trigger driver). |
| **Interval** | Deterministic cycle time in milliseconds (ms). |
| **Priority** | Ranging from 0 (Highest Priority) to 255 (Background execution). |
| **Entry Point** | Function or Program location. |

## Zephyr Integration & Determinism

When deployed on Zephyr RTOS, ZPLC directly translates its internal logic execution into Zephyr-native paradigms:
- Time-based hardware timers trigger task execution sequences on the dot.
- These triggers inject cyclic tasks into Zephyr's priority-oriented work queues.
- Execution happens strictly concurrently via dedicated queue threads, minimizing jitter.

```mermaid
flowchart LR
  Timer[Cycle Interval Trigger] --> Queue[Zephyr Priority Queue]
  Queue --> Thread[Worker Thread]
  Thread --> Cycle[Logic Execution (One Scan)]
  Cycle --> Stats[Stats Updated]
```

## Concurrency & Resource Safety

ZPLC tasks share physical global memory. Because of standard IEC 61131-3 behavior, a strict **Last Write Wins** concurrency rule applies when two separate tasks attempt to manipulate identical variables or outputs. 
Using distinct memory boundaries and data mapping mitigates task clashes during highly complex automation scripts.

## Diagnostics

The ZPLC IDE reads runtime statistics directly from the scheduler, giving you detailed analytics down to the millisecond over:
- Total execution cycles.
- Interval overrun events.
- Average/Maximum execution time latency metrics.
