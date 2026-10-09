---
slug: /getting-started
id: index
title: Getting Started
sidebar_label: Getting Started
description: Install ZPLC Studio, open a bundled example and run it in the simulator without any hardware.
tags: [quickstart]
---

# Getting Started

This page takes you from nothing to a program running in the simulator on your
own computer. You need no PLC and no development board.

:::warning Prerelease
ZPLC 2.0.0-rc.3 is an unsigned prerelease for evaluation. Do not use it to
control machinery. No board has been tested with a physical device yet.
:::

## Quick path

1. Download the installer for your system from [GitHub Releases](https://github.com/eduardojvieira/ZPLC/releases).
2. Open it. Windows and macOS warn about unsigned apps; the steps below show how to continue.
3. In Studio, copy the **Blinky** example into a folder.
4. Compile it, switch to **Simulate**, press **Connect**, then **Run**.

## Download

Open the [releases page](https://github.com/eduardojvieira/ZPLC/releases) and
choose the newest release whose name starts with `ZPLC Studio 2.0`. While 2.0 is
a prerelease, GitHub still labels the older 1.5.0 release as Latest; scroll down
to the 2.0 prerelease instead.

| Your system | File to download (version 2.0.0-rc.3) |
| --- | --- |
| Windows, Intel or AMD | `ZPLC.IDE-2.0.0-rc.3-win-x64-Setup.exe`, or `...-win-x64-Portable.exe` to run without installing |
| Windows on ARM | `ZPLC.IDE-2.0.0-rc.3-win-arm64-Setup.exe` |
| macOS, Apple silicon | `ZPLC.IDE-2.0.0-rc.3-mac-arm64.dmg` |
| macOS, Intel | `ZPLC.IDE-2.0.0-rc.3-mac-x64.dmg` |
| Linux, Fedora family | `ZPLC.IDE-2.0.0-rc.3-linux-x86_64.rpm` |
| Linux, other distributions | `ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage` |

The release also lists `SHA256SUMS`. To check a download, compute its SHA-256
hash and compare it with the line for your file:

```text
Linux:    sha256sum --ignore-missing -c SHA256SUMS
macOS:    shasum -a 256 <file>
Windows:  Get-FileHash .\<file> -Algorithm SHA256
```

## Open an unsigned installer

The rc.3 installers are not code-signed, so each system asks you to confirm
before it runs them. The maintainers have not yet run these steps on a clean
machine for rc.3; where a step comes from the vendor's documentation, the link is
given.

### Windows

1. Run the `Setup.exe` file, or the `Portable.exe` file if you chose that one.
2. SmartScreen shows **Windows protected your PC**. Select **More info**, then **Run anyway**. Because the files are unsigned, SmartScreen asks again for every new version. See [Microsoft's SmartScreen documentation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
3. If Windows blocks the file and offers no **Run anyway**, Smart App Control is turned on. It blocks every unsigned app and Microsoft documents no override for a single app. Turn it off in Windows Security, or [run Studio from source](#run-studio-from-source). See [Microsoft's Smart App Control page](https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003).

### macOS

1. Open the DMG and drag **ZPLC IDE** to Applications, then open it.
2. macOS says it could not verify the app. Choose **Done**, not **Move to Trash**.
3. Open **System Settings**, then **Privacy & Security**. In the **Security** section, choose **Open Anyway** next to the ZPLC IDE message, confirm, and enter your password. The button stays available for about an hour after the failed attempt. See [Apple's instructions](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).

An unsigned app for Apple silicon can fail differently: macOS may report the app
as damaged and offer only **Move to Trash**. That has not been tested with the
rc.3 DMG. If you see it, the quarantine flag that macOS put on the download is
the cause; removing it skips macOS's malware check for this app, so do it only
after the checksum matches:

```bash
xattr -dr com.apple.quarantine "/Applications/ZPLC IDE.app"
```

### Linux

```bash
# Fedora and RHEL family (RPM)
sudo dnf install ./ZPLC.IDE-2.0.0-rc.3-linux-x86_64.rpm

# Any distribution (AppImage)
chmod +x ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage
./ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage
```

The `.deb` package declares dependencies that current Debian and Ubuntu releases
no longer provide, so it installs only on Ubuntu 22.04. Use the AppImage on other
Debian-based systems. Other Electron AppImages are reported to need `libfuse2` on
Ubuntu 22.10 and later, and to need extra settings for the Chromium sandbox on
Ubuntu 24.04 and later; neither was tried with ZPLC.

## Open an example

1. Start Studio. The Welcome screen offers **Open project**, **New project** and **Copy example**.
2. Under **Copy example**, choose **Blinky**.
3. Choose an empty destination folder. Studio copies the example there and opens it. The copy stops if a file already exists in the folder.

The folder holds `zplc.json` (the project: target, tasks and sources), the
program files in `src` and a scenario test in `tests`. Blinky switches the
output `LED_Output` at `%Q0.0` on and off about every 500 ms.

## Compile and simulate

1. Choose **Build**, then **Compile** (Ctrl+B, or Cmd+B on macOS). Messages appear in the **Problems** and **Output** tabs of the bottom panel.
2. In the toolbar, select **Simulate** and press **Connect**. Studio starts the simulator that is bundled with the app.
3. Press **Run** (F5). Open the **Watch** tab, press **+** and enter `LED_Output`. Its value changes between true and false about every half second.
4. Press **Stop** (Shift+F5) when you are done.

The simulator is ZPLC's C runtime built for your computer. It runs your compiled
program on a timer. It does not model a board's electrical I/O or its real
timing.

## Run the scenario test

A scenario is a short script that sets inputs, lets the program run for a fixed
time and checks the outputs.

1. Open the **Tests** tab. If it asks for the project, choose **Choose zplc.json** and select the `zplc.json` in your project folder.
2. Press **Run host scenarios**. Studio runs `tests/blinky-visual.scenario.json` on the simulator and shows **Passed** or **Failed** for each scenario, with its checks.

## Hardware

Six boards have a build profile: Raspberry Pi Pico (RP2040), Arduino GIGA R1,
ESP32-S3 DevKitC, STM32F746G Discovery, STM32 Nucleo-H743ZI and Arduino Opta
WiFi. All six are cross-build only today. The firmware builds for each board in
continuous integration, but no one has flashed or run it on a physical board, and
there are no hardware-in-the-loop (HIL) test results. See [Boards](../reference/boards.md).

The rc.3 release has no prebuilt firmware. To build it yourself, follow
[Zephyr workspace setup](../reference/zephyr-workspace-setup.md). Building
firmware, flashing it, deploying a program and running it are separate actions
that a person starts in Studio. AI and MCP tools cannot start any of them.

## Run Studio from source

Use this on Linux or macOS if the installer does not start. You need Bun 1.3.14,
CMake and a C compiler. Studio's simulator is a separate program that you build
first and point Studio to:

```bash
cmake -S firmware/lib/zplc_core -B firmware/lib/zplc_core/build
cmake --build firmware/lib/zplc_core/build
bun install --frozen-lockfile
ZPLC_NATIVE_SIM_BIN="$PWD/firmware/lib/zplc_core/build/zplc_runtime" \
  bun run --cwd=packages/zplc-ide electron:dev
```

## Next steps

- [Studio](../ide/index.md): the editors, tests and tools in the workbench.
- [Compiler workflow](../ide/compiler.md): how source becomes a `.zplc` program.
- [Languages](../languages/index.md): Structured Text and the other languages.
- [Deployment](../ide/deployment.md): moving a program to a connected board.
