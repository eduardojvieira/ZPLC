---
slug: /getting-started
id: index
title: Getting Started
sidebar_label: Getting Started
description: Install ZPLC, open a bundled example and run it in the simulator without any hardware.
tags: [quickstart]
---

# Getting Started

This page takes you from nothing to a program running in the simulator on your
own computer. You need no PLC and no development board. The tutorial
[Blink without hardware](../tutorials/blink-without-hardware.md) is the slower
version of this page, with the program explained and a scenario test.

:::warning Prerelease
ZPLC 2.0.0-rc.3 is an unsigned prerelease for evaluation. Do not use it to
control machinery: read [Safety and limitations](../safety-and-limitations.md).
Which boards have been tested with a physical device is on
[Hardware support](../reference/capabilities-evidence.md).
:::

## Quick path

1. Download the installer for your system from [GitHub Releases](https://github.com/eduardojvieira/ZPLC/releases) and check it: [Install ZPLC](./install.md).
2. Open it. Windows and macOS warn about unsigned apps; the install page shows how to continue.
3. In ZPLC, copy the **Blinky** example into a folder.
4. Compile it, switch to **Simulate**, press **Connect**, then **Run**.

## Open an example

1. Start ZPLC. The Welcome screen offers **Open project**, **New project** and **Learn**, and a list of **Examples**.
2. Under **Examples**, in the group **First steps**, choose **Blinky**.
3. Choose an empty destination folder. ZPLC copies the example there and opens it. The copy stops if a file already exists in the folder.

The folder holds `zplc.json` (the project: target, tasks and sources), the
program files in `src` and a scenario test in `tests`. Blinky switches the
output `LED_Output` at `%Q0.0` on and off about every 500 ms.

## Compile and simulate

1. Choose **Build**, then **Compile** (Ctrl+B, or Cmd+B on macOS). Messages appear in the **Problems** and **Output** tabs of the bottom panel.
2. In the toolbar, select **Simulate** and press **Connect**. ZPLC starts the simulator that is bundled with the app.
3. Press **Run** (F5). Open the **Watch** tab, press **+** and enter `LED_Output`. Its value changes between true and false about every half second.
4. Press **Stop** (Shift+F5) when you are done.

The simulator is ZPLC's C runtime built for your computer. It runs your compiled
program on a timer. It does not model a board's electrical I/O or its real
timing.

## Run the scenario test

A scenario is a short script that sets inputs, lets the program run for a fixed
time and checks the outputs.

1. Open the **Tests** tab. If it asks for the project, choose **Choose zplc.json** and select the `zplc.json` in your project folder.
2. Press **Run host scenarios**. ZPLC runs `tests/blinky-visual.scenario.json` on the simulator and shows **Passed** or **Failed** for each scenario, with its checks.

## Hardware

The boards that have a build profile, and how far each has been shown to work,
are on [Hardware support](../reference/capabilities-evidence.md); the pins and
channels of each are in [Supported boards](../reference/boards.md). A board whose
level is `cross-build` has firmware that builds in continuous integration, and
nothing more: no one has shown it to flash, boot or run a program.

The rc.3 release has no prebuilt firmware. The release pipeline builds one image
per board for each release it makes, and ZPLC shows the image of the selected
board, with its checksum and the flashing steps, in **Project settings**,
**Target**; it does not flash. To build the firmware yourself, follow
[Zephyr workspace setup](../reference/zephyr-workspace-setup.md). Building
firmware, flashing it, deploying a program and running it are separate actions
that a person starts in ZPLC. AI and MCP tools cannot start any of them.

## Run ZPLC from source

Use this on Linux or macOS if the installer does not start. You need Bun 1.3.14,
CMake and a C compiler. The simulator of the ZPLC application is a separate program
that you build first and point the application to:

```bash
cmake -S firmware/lib/zplc_core -B firmware/lib/zplc_core/build
cmake --build firmware/lib/zplc_core/build
bun install --frozen-lockfile
ZPLC_NATIVE_SIM_BIN="$PWD/firmware/lib/zplc_core/build/zplc_runtime" \
  bun run --cwd=packages/zplc-ide electron:dev
```

## Next steps

- [Install ZPLC](./install.md): download, verification, first launch, update and removal.
- [The ZPLC application](../ide/index.md): the editors, tests and tools in the workbench.
- [Compiler workflow](../ide/compiler.md): how source becomes a `.zplc` program.
- [Languages](../languages/index.md): Structured Text and the other languages.
- [Deployment](../ide/deployment.md): moving a program to a connected board.
