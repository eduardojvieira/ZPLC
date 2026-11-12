---
slug: /getting-started
id: index
title: Getting Started
sidebar_label: Getting Started
description: 'What ZPLC is, who it is for, and the two ways to start with it: build a controller, or learn PLC programming. No hardware needed.'
tags: [quickstart]
---

# Getting Started

ZPLC is a free, open-source way to write, test and run PLC programs. This page says what it is, helps you pick a
starting path, and gets a program running on your computer in about ten minutes. You need no PLC and no board.

## What ZPLC is

ZPLC has three parts, in the order you meet them:

1. **The ZPLC application**, a desktop program for Windows, macOS and Linux. You write programs in it, compile them,
   test them and run them in a simulator. It is the only part you need to start.
2. **The runtime**, a small C99 program that executes the compiled bytecode. In the application it runs on your
   computer as a simulator. On a microcontroller board it runs as a Zephyr RTOS module.
3. **The boards**: seven Zephyr boards have a build profile. All of them are at the cross-build level: the firmware
   builds in continuous integration, and no one has flashed or run it on a physical board
   ([Hardware support](../reference/capabilities-evidence.md)).

You can write in five IEC 61131-3 languages: Structured Text, Instruction List, Ladder diagram, Function Block Diagram
and Sequential Function Chart. All five compile to one bytecode format. [Platform overview](../platform-overview/index.md)
shows how the parts fit together.

## Pick a path

| You want to...                                 | Start with                                                                                                                                                | What you do                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Build a controller**, and you know PLCs      | [Install ZPLC](./install.md), then [Blink without hardware](../tutorials/blink-without-hardware.md), then [Your first board](../tutorials/first-board.md) | Copy an example, build it, run it in the simulator, test it with a scenario, then follow the steps for a board |
| **Learn PLC programming**, from nothing at all | [Install ZPLC](./install.md), then **Learn** on the Welcome screen: [Learn](../learn/index.md)                                                            | Take the course in the application: 68 lessons in English and Spanish, with a Ladder path that starts at zero  |

Both paths use the same application and the same simulator, and you can switch at any time: a lesson workspace is an
ordinary project you can open like any other, and an example project can be used as a practice exercise.

## Run your first program

This is the short version of [Blink without hardware](../tutorials/blink-without-hardware.md), which explains every
step and ends with a scenario test.

1. Download the installer for your system from [GitHub Releases](https://github.com/eduardojvieira/ZPLC/releases),
   check it and open it: [Install ZPLC](./install.md). Windows and macOS warn about an unsigned app, and the install
   page shows how to continue.
2. On the Welcome screen, under **Examples**, in the group **Language tour**, choose **Blinky (structured text)**, then
   choose an empty folder. ZPLC copies the example there and opens it.
3. Choose **Build**, then **Compile** (Ctrl+B, or Cmd+B on macOS).
4. In the toolbar select **Simulate**, press **Connect**, then press **Run** (F5).
5. Open the **Watch** tab, press **+** and enter `LED_Output`. Its value changes between true and false about every
   half second.

The simulator is the ZPLC runtime built for your computer. It runs your program on a timer and does not model the
electrical side of a board or its real timing, so a result in it is a host result.

## Take the course instead

On the Welcome screen choose **Learn**. The course needs no folder, no network and no board. Each lesson of the Ladder
path opens a reading page over the workbench that explains one idea and lets you try it in a small simulation inside the
page; you then practise in the editor, and **Check** grades your program against a scenario. [Learn](../learn/index.md)
describes the course, and [the release notes](../release-notes/index.md#learn-reading-mode-and-the-ladder-path) say
what is new in 2.0.

## Going on to hardware

Hardware support, board by board, is on [Hardware support](../reference/capabilities-evidence.md), and the pins and
channels are on [Supported boards](../reference/boards.md). A board at the `cross-build` level has firmware that builds
in continuous integration, and nothing more.

Building firmware, flashing it, deploying a program and running it are four separate actions, and a person starts each
one. AI assistants and MCP tools cannot start any of them. [Your first board](../tutorials/first-board.md) lists the
steps for a Raspberry Pi Pico or an ESP32-S3, and says plainly that nobody has executed them on a board yet.

## Run ZPLC from source

Use this on Linux or macOS if the installer does not start. You need Bun 1.3.14, CMake and a C compiler. The simulator
is a separate program that you build first and point the application to:

```bash
cmake -S firmware/lib/zplc_core -B firmware/lib/zplc_core/build
cmake --build firmware/lib/zplc_core/build
bun install --frozen-lockfile
ZPLC_NATIVE_SIM_BIN="$PWD/firmware/lib/zplc_core/build/zplc_runtime" \
  bun run --cwd=packages/zplc-ide electron:dev
```

## Next steps

- [Install ZPLC](./install.md): download, verification, first launch, update and removal.
- [Blink without hardware](../tutorials/blink-without-hardware.md): the full tutorial, with a screenshot for each step.
- [The ZPLC application](../ide/index.md): the editors, tests and tools of the workbench.
- [Languages](../languages/index.md): Structured Text and the other four languages.
- [Release notes](../release-notes/index.md): what is new in 2.0, what breaks and what is not verified.
- [Safety and limitations](../safety-and-limitations.md): what ZPLC does not do, and what to test before it runs a machine.
