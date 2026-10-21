---
slug: /guides/simulate-and-debug
id: simulate-and-debug
title: Simulate and debug a program
sidebar_label: Simulate and debug
description: 'Run a program on the simulator, watch its variables, stop it on a breakpoint, step it and see what each control keeps.'
tags: [how-to, debugging, simulation, breakpoints]
---

# Simulate and debug a program

The simulator runs the compiled program on your computer, with the same virtual
machine and scheduler as a board. Use it to see what the logic does, to stop it at a
statement and to look at the values, before you take it anywhere else.

:::note A host result
The simulator shows what the logic does. It does not model a board's inputs or
outputs, its drivers or its real timing, so a program that behaves in the simulator
has not been shown to behave on a board.
:::

## 1. Build and run

1. Build the project (**Build**, **Compile**).
2. In the toolbar, check that **Simulate** is selected, and press **Connect**, then
   **Run** (F5). The status line shows **Running** and the cycle count rises.
3. Open the **Watch** tab, press **+** and enter a variable. Its value follows the
   program. Double-click a value to write it.

[Blink without hardware](../tutorials/blink-without-hardware.md) does this on a first
project.

## 2. Stop on a breakpoint

Any program will do. This one counts its scans, so a stop shows the value of the scan that
reached it:

```st runnable
PROGRAM Counter
VAR
    Count : DINT;
    Armed : BOOL := TRUE;
END_VAR

IF Armed THEN
    Count := Count + 1;
END_IF;
END_PROGRAM
```

1. Click in the gutter of the editor, next to `Count := Count + 1;`. A dot marks the line.
2. Press **Run**. The program stops when a scan reaches the statement: the toolbar
   offers **Resume** (F5), the editor marks the line, **Output** says `Breakpoint hit
at PC=..., line N`, and a row of the **Trace** tab says `paused`.
3. Look at the values in **Watch**. They are the values of the scan that stopped. Set
   an input, or force a value ([Force a value](./force-values.md)), and look again.
4. Press **Resume** (F5) to let the scan finish and run on to the next stop, or **Step
   one cycle** (F10) to run one scan and stop at the next cycle boundary or the next
   breakpoint.

A breakpoint can also be set on an Instruction List line, a Ladder rung, an FBD block
and an SFC step or transition. The debug map relates the instructions to the element
you edited.

## 3. What each control keeps

| Control              | Output image                     | Forces  | The scan                                                         |
| -------------------- | -------------------------------- | ------- | ---------------------------------------------------------------- |
| Pause (F6)           | Kept                             | Kept    | Stops between scans                                              |
| Step one cycle (F10) | Kept, and shows the stepped scan | Kept    | Runs one whole scan, or finishes the one stopped at a breakpoint |
| Resume (F5)          | Kept                             | Kept    | A scan stopped at a breakpoint continues from there              |
| Stop (Shift+F5)      | Zeroed                           | Cleared | Every task returns to its entry point                            |
| Reset (F8)           | A cold restart: initial values   | Cleared | Starts again from the first scan                                 |

The full table, with the tests behind it, is in
[Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop). On a
board, pause, step and stop also drive the physical outputs to their safe state.

## 4. Check it with a scenario

A manual run shows one path. A [scenario test](./scenario-tests.md) says what the
program must do and finds out when a change breaks it. Use the debugger to understand a
failing scenario: the failure gives the instant, and you can run to that scan.

## What is verified, and what is not

| Part                                                                            | Verified                                                            | Level                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| A breakpoint binds and stops the scan, and Resume finishes the interrupted scan | Journeys 7 and 16 in the real application, and the scheduler suites | Host and `native_sim` |
| A force set at a breakpoint is seen by the rest of the scan                     | Journey 18 in the real application                                  | Host                  |
| Pause, step and stop keep and clear what the table says                         | The Zephyr suites on `native_sim` and QEMU                          | Emulated target       |
| The same stops on a board                                                       | Not tested                                                          | None                  |

## See also

- [ZPLC workbench](../ide/features.md#debugging-boundary): what watches, traces and forces show.
- [The ZPLC shell](../operations/shell.md): the debugging commands of a device.
- [Safety and limitations](../safety-and-limitations.md).
