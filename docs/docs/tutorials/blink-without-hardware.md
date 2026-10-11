---
slug: /tutorials/blink-without-hardware
id: blink-without-hardware
title: Blink without hardware
sidebar_label: Blink without hardware
description: "From a downloaded Studio to a toggling simulated output and a passing scenario test, with no board."
tags: [tutorial, simulation, structured-text]
---

# Blink without hardware

In this tutorial you copy a small Structured Text program, build it, run it in the
simulator and watch an output switch on and off every half second. Then you run
the scenario test that comes with it. You need no PLC and no board: everything
happens on your computer.

:::note Before you start
You need ZPLC Studio. If you have not installed it, follow
[Install ZPLC Studio](../getting-started/install.md) first. This tutorial was
written for the 2.0 prerelease.
:::

## What you will do

1. Start Studio and look at the Welcome screen.
2. Copy the example **Blinky (Structured Text)** into an empty folder.
3. Read the program.
4. Build it.
5. Connect to the simulator and run the program.
6. Watch the output `LED_Output` change.
7. Run the scenario test of the project.

## 1. Start Studio

Open ZPLC Studio. The Welcome screen offers **Open project**, **New project** and
**Learn**, and under **Examples** a list of example projects, grouped by what
they teach.

![The Welcome screen of ZPLC Studio, scrolled to the group Language tour, which holds Blinky (Structured Text)](/img/tutorials/blink-1-welcome.png)

## 2. Copy the example

1. Under **Examples**, in the group **Language tour**, choose **Blinky (Structured Text)**.
2. Choose an empty folder as the destination. Studio copies the example there and
   opens it. If a file with the same name is already in the folder, the copy stops
   and writes nothing.

The folder holds three things: `zplc.json`, the project (its target, its task and
its program), `src/main.st`, the program, and `tests/blinky-st.scenario.json`, the
scenario test.

## 3. Read the program

Open `src/main.st` from the project tree, in the **Explorer** tab of the bottom
panel. It opens in the editor:

![The program Blinky open in the editor of Studio](/img/tutorials/blink-2-program.png)

Without its comments, the program is this:

```st runnable expect="LED_Output=TRUE" scans=75 scan_ms=10
PROGRAM Blinky
VAR
    BlinkTimer : TON;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

BlinkTimer(IN := TRUE, PT := T#500ms);

IF BlinkTimer.Q THEN
    LedState := NOT LedState;
    BlinkTimer(IN := FALSE, PT := T#500ms);
END_IF;

LED_Output := LedState;
END_PROGRAM
```

A timer of type `TON` counts 500 ms while its input `IN` is TRUE. When it is done,
`BlinkTimer.Q` is TRUE for one scan: the program flips `LedState` and restarts the
timer. `LED_Output` is the variable placed at the output address `%Q0.0`, and it
follows `LedState`. The documentation check compiles this program and runs it on
the simulator's virtual clock: after 75 scans of 10 ms, 750 ms, `LED_Output` is TRUE.

## 4. Build it

1. Open the **Build** menu of the toolbar and choose **Compile** (Ctrl+B, or Cmd+B on macOS).
2. Open the **Output** tab. It says `Built saved workspace locally`, with the size
   of the program. The **Problems** tab says `0 errors`.

![The Output tab after the build, with the size of the program and the notification Build succeeded](/img/tutorials/blink-3-built.png)

If the build fails, **Problems** lists each error with its line and column.

## 5. Run it in the simulator

1. In the toolbar, check that **Simulate** is selected, and press **Connect**.
   Studio starts the simulator that is bundled with the application.
2. Press **Run** (F5).

The status line shows **Running** and the cycle count rises. The simulator is the
runtime of ZPLC built for your computer. It runs your program on a timer. It does
not model the electrical side of a board or its real timing.

## 6. Watch the output change

1. Open the **Watch** tab. If the table has no row, press **+** and enter `LED_Output`.
2. Look at the **Value** column. It changes between `TRUE` and `FALSE` about every
   half second.

![The Watch tab with LED_Output TRUE while the program runs](/img/tutorials/blink-4-output-true.png)

![The same table half a second later, with LED_Output FALSE](/img/tutorials/blink-5-output-false.png)

If the Watch table is cut off, drag the divider above the bottom panel upward.

Press **Stop** (Shift+F5) when you have seen it change.

## 7. Run the scenario test

A scenario is a short script that sets inputs, lets the program run for a fixed
time and checks the outputs. This one sets no input: it checks that the output is
off for the first 490 ms, on until 1000 ms, off again, and so on for 2.1 seconds of
simulated time. The [scenario file format](../reference/scenario-file.md) lists
every field, and its example is this project's scenario.

1. Open the **Tests** tab. Studio links the `zplc.json` of the open project by itself.
2. Press **Run host scenarios**.

The tab says **Host POSIX scenarios passed.** and `1 scenario passed.` This ran
your saved program on the simulator, headless and on a virtual clock, so it takes
a moment and does not wait 2.1 seconds.

![The Tests tab reporting Host POSIX scenarios passed](/img/tutorials/blink-6-scenario.png)

You can run the same test without Studio, from a terminal at the root of a
checkout of the repository once `bun run setup` has built the runtime:

```bash
bun run simulate packages/zplc-ide/projects/blinky_st
```

## Change the program, and see the test fail

Edit `src/main.st`: change both `T#500ms` to `T#250ms`, save, and build again. The
output now switches twice as often. This version is run by the documentation check
too: after 30 scans, 300 ms, the output is already TRUE.

```st runnable expect="LED_Output=TRUE" scans=30 scan_ms=10
PROGRAM Blinky
VAR
    BlinkTimer : TON;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

BlinkTimer(IN := TRUE, PT := T#250ms);

IF BlinkTimer.Q THEN
    LedState := NOT LedState;
    BlinkTimer(IN := FALSE, PT := T#250ms);
END_IF;

LED_Output := LedState;
END_PROGRAM
```

Run the scenario again. It now fails, with **One or more scenario assertions
failed.**, because the scenario still expects the output to be off at 250 ms. That
is what a scenario is for: it says what the program must do, and it tells you when
a change breaks it. Change the times back to `T#500ms`, or edit the scenario, and
it passes again.

## What this shows, and what it does not

- The program compiles, runs on the simulator and its output toggles: the
  documentation check proves it. The same seven steps are performed in the real
  application by an end-to-end journey, `Blink without hardware (the tutorial)` of
  `bun run test:journeys`, so this page cannot drift from the product.
- A pass here is a host result on the simulator's virtual clock. It says nothing
  about a board: see [Hardware support](../reference/capabilities-evidence.md).

## Next steps

- [Write and run scenario tests](../guides/scenario-tests.md): write a scenario of your own.
- [Studio workbench](../ide/features.md): the editors, the Watch table, forcing and breakpoints.
- [Structured Text reference](../reference/language-st.md): what the language supports today.
- [Learn](../learn/index.md): lessons that grade your program against a scenario.
- [Safety and limitations](../safety-and-limitations.md): before you rely on ZPLC for anything real.
