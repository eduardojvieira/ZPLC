---
slug: /guides/simulate-and-debug
id: simulate-and-debug
title: Simulate and debug a program
sidebar_label: Simulate and debug
description: 'Run a program on the simulator, watch its variables, stop it on a breakpoint, step it by cycle and read the trace.'
tags: [how-to, debugging, simulation, breakpoints]
---

# Simulate and debug a program

Run a program on your computer, watch its variables change, stop it on a line and step it one cycle at a time. The simulator runs the same virtual machine and the same scheduler as a board, so what you learn here is what the logic does.

:::note A host result
The simulator shows what the logic does. It does not model a board's pins, drivers or real timing. A program that behaves in the simulator has not been shown to behave on a board.
:::

## Which simulator runs

ZPLC picks the simulator for you.

| Simulator      | When                                                                                       | What it is                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native runtime | The default, whenever it can start                                                         | A separate program that the desktop app supervises. The scan cycle, the retained memory and the communication blocks follow the firmware's rules    |
| WASM fallback  | Only when the native runtime cannot start (its binary is missing, or its handshake failed) | The same session code built to WebAssembly. It is degraded, and the status bar says **Runtime: WASM fallback · degraded** and lists what is missing |

The fallback keeps pause, resume, step and breakpoints, but it has no network blocks, no serial and no pins, and its timing follows the app window. Details and evidence: [Software runtime](../runtime/browser-runtime.md). A copy of ZPLC built from source needs the native runtime built once with `bun run build:runtime`.

## 1. Build and run

1. Build the project (**Build**, then **Compile**).
2. In the toolbar, check that **Simulate** is selected. Press **Connect**, then **Run** (F5). The status line says **Running** and the cycle count rises.
3. Open the **Watch** tab, press **+** and type a variable name. Its value follows the program. Double-click a value to write it.

![The Watch tab of ZPLC showing a variable of the running program](/img/screens/guide-watch.png)

[Blink without hardware](../tutorials/blink-without-hardware.md) does this on a first project.

## 2. Stop on a breakpoint

Any program will do. This one counts its cycles, so a stop shows the value of the cycle that reached it.

![The editor stopped at a breakpoint, with the Trace row showing paused](/img/screens/guide-breakpoint.png)

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

1. Click in the gutter of the editor next to `Count := Count + 1;`. A dot marks the line.
2. Press **Run**. The cycle stops when it reaches the statement. The toolbar offers **Resume** (F5), the editor marks the line, **Output** says `Breakpoint hit at PC=0x..., line N`, and the **Trace** tab shows a row that says `paused`.
3. Read **Watch**. The values are those of the cycle that stopped. Set an input, or [force a value](./force-values.md), and read again.
4. Press **Resume** (F5) to finish the cycle and run to the next stop, or **Step one cycle** (F10) to run one cycle and stop at the next cycle boundary or the next breakpoint.

A breakpoint can also sit on an Instruction List line, a Ladder rung, an FBD block, and an SFC step or transition. The debug map relates the machine instructions to the element you edited.

## 3. What each control keeps

| Control              | Output image                      | Forces  | The cycle                                                         |
| -------------------- | --------------------------------- | ------- | ----------------------------------------------------------------- |
| Pause (F6)           | Kept                              | Kept    | Stops between cycles                                              |
| Step one cycle (F10) | Kept, and shows the stepped cycle | Kept    | Runs one whole cycle, or finishes the one stopped at a breakpoint |
| Resume (F5)          | Kept                              | Kept    | A cycle stopped at a breakpoint continues from there              |
| Stop (Shift+F5)      | Zeroed                            | Cleared | Every task returns to its entry point                             |
| Reset (F8)           | A cold restart: initial values    | Cleared | Starts again from the first cycle                                 |

The full table and the tests behind it are in [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop). On a board, pause, step and stop also drive the physical outputs to their safe state.

## 4. Find out why a test failed

A manual run shows one path. A [scenario test](./scenario-tests.md) says what the program must do and tells you when a change breaks it. When a scenario fails, the failure gives the instant. Run to that cycle with a breakpoint and read the Watch tab there.

## What is verified, and what is not

| Part                                                                              | Verified                                                        | Level                 |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------- |
| A breakpoint binds and stops the cycle, and Resume finishes the interrupted cycle | Scripted runs of the real application, and the scheduler suites | Host and `native_sim` |
| A force set at a breakpoint is seen by the rest of the cycle                      | A scripted run of the real application                          | Host                  |
| Pause, step and stop keep and clear what the table says                           | The Zephyr suites on `native_sim` and QEMU                      | Emulated target       |
| The same stops on a board                                                         | Not tested                                                      | None                  |

## See also

- [ZPLC workbench](../ide/features.md#debugging-boundary): what watches, traces and forces show.
- [The ZPLC shell](../operations/shell.md): the debugging commands of a device.
- [Safety and limitations](../safety-and-limitations.md).
