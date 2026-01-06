---
sidebar_position: 1
title: Quick Start
description: Get started with ZPLC in 5 minutes
---

# Quick Start

Get ZPLC running in under 5 minutes. Choose your path based on what you want to do:

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
  <TabItem value="desktop" label="Desktop App (Recommended)" default>

## For PLC Programmers (Desktop IDE)

The easiest way to start is using the **ZPLC Desktop IDE** for macOS, Windows, and Linux.

### Step 1: Install the IDE

1.  **Download**: Go to the [Releases Page](https://github.com/eduardojvieira/ZPLC/releases) and download the latest installer:
    *   **macOS**: `.dmg` (Apple Silicon or Intel)
    *   **Windows**: `.exe` (Coming soon)
    *   **Linux**: `.AppImage` or `.deb` (Coming soon)
2.  **Install**: Run the installer and verify the application.
3.  **Launch**: Open **ZPLC IDE** from your applications menu.

### Step 2: Create Your First Program

1. Click **New Project** in the sidebar
2. Select **Structured Text** as your language
3. Enter this simple blink program:

```st
PROGRAM Main
VAR
    LED : BOOL := FALSE;
    blink_timer : TON;
END_VAR

blink_timer(IN := NOT blink_timer.Q, PT := T#500ms);

IF blink_timer.Q THEN
    LED := NOT LED;
END_IF;
END_PROGRAM
```

### Step 3: Simulate

1. Click the **▶ Simulate** button in the toolbar.
2. The bundled Simulator will start automatically.
3. Watch the `LED` variable toggle every 500ms in the Watch window.

### Step 4: Deploy to Hardware

1. Connect your supported board (e.g., Raspberry Pi Pico) via USB.
2. Click **Connect** → Select your serial port from the native dropdown.
3. Click **Upload** to flash the program.

  </TabItem>
  <TabItem value="web" label="Web IDE">

## For PLC Programmers (Web IDE)

Run ZPLC directly in your browser without installation.

### Step 1: Open the IDE

Visit the online IDE at: **[ide.zplc.dev](https://ide.zplc.dev)** *(coming soon)*

Or run locally:
```bash
git clone https://github.com/eduardojvieira/ZPLC.git
cd ZPLC/ide
bun install
bun run dev
```

### Step 2: Create & Simulate

The process is identical to the Desktop App, but hardware connection requires a browser with **WebSerial API** support (Chrome, Edge).

  </TabItem>
  <TabItem value="dev" label="Embed Runtime (C/C++)">

## For Embedded Developers (C Runtime)

Integrate the ZPLC runtime into your Zephyr or POSIX application.

### Step 1: Clone & Build

```bash
git clone https://github.com/eduardojvieira/ZPLC.git
cd ZPLC

# Build for your development machine (POSIX)
mkdir build_posix && cd build_posix
cmake .. -DZEPHYR_BUILD=OFF
make
```

### Step 2: Run Tests

```bash
ctest --output-on-failure
# Expected: 100% pass rate (105+ assertions)
```

### Step 3: Integrate into Your Project

Add ZPLC as a Zephyr module:

```cmake
# In your west.yml or CMakeLists.txt
set(ZEPHYR_EXTRA_MODULES /path/to/ZPLC)
```

Or include directly:

```c
#include "zplc_core.h"
#include "zplc_hal.h"

int main(void) {
    zplc_vm_t vm;
    
    // Initialize
    zplc_hal_init();
    zplc_vm_init(&vm);
    
    // Load your bytecode
    zplc_vm_load(&vm, program_bytecode, program_size);
    
    // Execute
    while (zplc_vm_running(&vm)) {
        zplc_hal_read_inputs(vm.memory + ZPLC_IPI_BASE);
        zplc_vm_cycle(&vm);
        zplc_hal_write_outputs(vm.memory + ZPLC_OPI_BASE);
        zplc_hal_sleep(10); // 10ms cycle
    }
    
    return 0;
}
```

  </TabItem>
  <TabItem value="zephyr" label="Build Firmware">

## For Firmware Engineers (Zephyr Build)

Build the complete ZPLC firmware for your target board.

### Step 1: Set Up Zephyr Environment

Follow the [official Zephyr Getting Started Guide](https://docs.zephyrproject.org/latest/develop/getting_started/index.html).

### Step 2: Build for Your Board

```bash
# Raspberry Pi Pico
west build -b rpi_pico modules/lib/zplc/apps/zephyr_app --pristine

# STM32 Nucleo H743ZI
west build -b nucleo_h743zi modules/lib/zplc/apps/zephyr_app --pristine

# ESP32-S3
west build -b esp32s3_devkitc modules/lib/zplc/apps/zephyr_app --pristine
```

### Step 3: Flash & Test

```bash
# Flash to hardware
west flash

# Connect via serial (115200 baud)
screen /dev/ttyACM0 115200

# Test shell commands
zplc status
zplc persist info
```

  </TabItem>
</Tabs>

---

## What's Next?

Now that you have ZPLC running, explore these topics:

| Topic | Description |
|-------|-------------|
| [IDE Editors](/docs/ide/editors) | Master Ladder, FBD, and ST editors |
| [Language Reference](/docs/languages/st) | Learn Structured Text and Instruction List |
| [Standard Library](/docs/languages/stdlib) | Timers, counters, and math functions |
| [Runtime Architecture](/docs/runtime/intro) | Understand how the VM works |
