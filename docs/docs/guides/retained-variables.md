---
slug: /guides/retained-variables
id: retained-variables
title: Keep values across restarts
sidebar_label: Retained variables
description: 'Declare variables that keep their value when the program stops or the runtime restarts, and see what is saved, when, and what discards it.'
tags: [how-to, retain, persistence]
---

# Keep values across restarts

A retained variable keeps its value when the program stops and when the runtime is
started again with the same program. Use it for a counter or a setpoint that must
not go back to its declared value after a restart.

:::warning Status of this page
Verified on the host, on the simulator and by build-time checks. On a board
retention is off by default, and no board has been through a power cut under test.
Do not rely on retained values for recovery-critical state until the hardware
record of the exact board exists
([Persistence and retained memory](../runtime/persistence.md#limits)).
:::

## 1. Declare the variable

Declare it in a `VAR RETAIN` block, or in `VAR_GLOBAL RETAIN` for a global:

```st runnable expect="Count=3" scans=3 scan_ms=10
PROGRAM Counter
VAR RETAIN
    Count : INT;
END_VAR

Count := Count + 1;
END_PROGRAM
```

The compiler places the variable in the retentive region of the process memory (4 KB
by default) and applies its declared initial value only when the region holds no
saved state. The documentation check runs this program from a clean state: after
three scans, `Count` is 3.

## 2. See it keep its value in the simulator

The native runtime of the simulator saves the region and restores it when the
same program is loaded again:

1. Build the project and run it in the simulator, as in
   [Blink without hardware](../tutorials/blink-without-hardware.md).
2. Press **Stop**. The region is stored with the values of the last complete scan.
3. Press **Run** again, or close and reopen ZPLC and run the same program. The
   counter continues from the value it had.

The simulator keeps its store in the `.zplc` folder of your home directory, unless
`ZPLC_PERSIST_ROOT` names another place. While the program runs the region is stored
at most once per interval, 30 seconds by default, and only when it changed. The interval is set by the environment variable
`ZPLC_RETAIN_SAVE_INTERVAL_MS` of the process that starts the runtime: `0` turns
periodic saves off, and a stop and a shutdown still store.

## 3. What discards the values

| Event                                                   | Retained values                                           |
| ------------------------------------------------------- | --------------------------------------------------------- |
| Stop and run again, or a restart, of the same program   | Restored                                                  |
| A rebuild of the program, even one that only moves code | Discarded: the program has another identity               |
| A reset command                                         | Discarded: it is a cold restart                           |
| Another program loaded                                  | Discarded: the stored record belongs to the other program |
| A fault                                                 | A stop of a faulted runtime stores nothing                |

The status of the native runtime says which of these happened, with a `reason` such
as `restored`, `none`, `identity_mismatch` or `layout_mismatch`: the field `retain`
of the session status, and `zplc sched status` on a board.

## 4. On a board

The profile of every shipped board sets `CONFIG_ZPLC_RETAIN_PERSIST=y`, so the retentive
region is restored after a power cycle. The write path has been tested on `native_sim`
and no board has been measured: a flash write can stall instruction fetch on a part
that runs code from the same flash, and the number of erases per day is bounded by the
flash budget of the board. A build without the option initialises the region at every
start.

```ini
# firmware/app/boards/<board>.conf (set in every shipped board)
CONFIG_ZPLC_RETAIN_PERSIST=y
```

[Persistence and retained memory](../runtime/persistence.md#flash-wear-budget-per-board)
has the wear budget of each board. The Nucleo-H743ZI keeps its records in ZMS, which
only `native_sim` has run; if the backend fails on a board, the region is initialised at
every start and the status says `io_error`.

## What is verified, and what is not

| Part                                                          | Verified                                   | Level                 |
| ------------------------------------------------------------- | ------------------------------------------ | --------------------- |
| The record format, the alternating slots, restore and reasons | Tests with failures injected at every step | Host and `native_sim` |
| Values survive a stop and a start of the native runtime       | Test of the native session                 | Host                  |
| A power cut on a board                                        | Not tested                                 | None                  |
| How long a flash write delays a scan                          | Not measured                               | None                  |

## See also

- [Persistence and retained memory](../runtime/persistence.md): the record, the reasons and the wear budget.
- [Safety and limitations](../safety-and-limitations.md).
