---
sidebar_position: 2
---

# Multitask Scheduler

ZPLC supports deterministic multitasking, allowing you to run different parts of your program at different intervals and priority levels. This is essential for complex industrial applications where fast control loops (e.g., motion control) must run alongside slower monitoring tasks (e.g., temperature logging).

## Overview

The scheduler uses a **priority-based preemptive** model.

*   **Priority**: Lower number = Higher priority. Task 0 (High) can interrupt Task 1 (Low).
*   **Interval**: Each task has a defined cycle time (e.g., 10ms, 100ms).
*   **Isolation**: Each task has its own isolated "Work Memory" (Stack + Heap) to prevent data corruption.
*   **Shared Memory**: All tasks share the Process Images (IPI/OPI) and Global/Retain variables for inter-task communication.

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

The scheduler runs on top of the underlying RTOS (Zephyr or POSIX).

1.  **Tick**: The system timer triggers the scheduler every 1ms (or configured tick rate).
2.  **Ready Queue**: The scheduler checks which tasks are due based on their interval.
3.  **Preemption**: If a higher-priority task becomes ready while a lower-priority task is running, the current task is paused, and the high-priority task runs immediately.
4.  **Completion**: When a task finishes (`RET` opcode), control returns to the scheduler or the interrupted task.

### Example Scenario

*   **Task A (Fast)**: 10ms interval, Priority 0. Handles encoder reading.
*   **Task B (Slow)**: 100ms interval, Priority 1. Handles UI updates.

**Timeline:**
```
0ms:   Task A starts -> Task A ends
       Task B starts
10ms:  Task A interrupts Task B -> Task A runs -> Task A ends -> Task B resumes
20ms:  Task A interrupts Task B -> ...
...
100ms: Task B finally finishes (if CPU load allows)
```

## Watchdog

To prevent system lockups, each task has a **Watchdog Timer**. If a task takes longer than its configured `Interval` (or a global limit) to complete, the runtime will trigger a system fault and enter a safe state.

*   **Common Causes**: Infinite loops (`WHILE TRUE DO`), extremely heavy computations.
*   **Recovery**: Requires a system reset or manual intervention via shell.

## Memory Isolation

While tasks share global variables, their **local** execution state is completely isolated:

*   **Evaluation Stack**: Private to the task.
*   **Call Stack**: Private to the task.
*   **Work Memory**: Private temporary storage.

This means you can call the same Function Block from different tasks without stack corruption, *provided* the Function Block instance itself (its state) is unique or thread-safe.

:::warning Concurrency
If two tasks write to the same Global Variable or Output, the "Last Write Wins". Thread-safe Process Image access is planned for Phase 1.4.1 (Networking Foundation) which will add mutex protection via `zplc_pi_lock()` / `zplc_pi_unlock()` API.
:::
