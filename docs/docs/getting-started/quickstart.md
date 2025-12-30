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
  <TabItem value="ide" label="I want to program PLCs" default>

## For PLC Programmers (Web IDE)

The fastest way to start is using the **ZPLC Web IDE** - no installation required!

### Step 1: Open the IDE

Visit the online IDE at: **[ide.zplc.dev](https://ide.zplc.dev)** *(coming soon)*

Or run locally:
```bash
git clone https://github.com/eduardojvieira/ZPLC.git
cd ZPLC/ide
bun install
bun run dev
```

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

1. Click the **▶ Simulate** button in the toolbar
2. Watch the `LED` variable toggle every 500ms in the Watch window
3. Use **Pause/Step** to debug cycle by cycle

### Step 4: Deploy to Hardware (Optional)

1. Connect your Zephyr-compatible board via USB
2. Click **Connect** → Select your serial port
3. Click **Upload** to flash the program
4. Your PLC is now running autonomously!

:::tip No Hardware? No Problem!
The WASM simulator runs the exact same bytecode that runs on hardware. If it works in simulation, it works on the device.
:::

  </TabItem>
  <TabItem value="dev" label="I want to embed the runtime">

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

### Step 3: Run the Demo

```bash
./zplc_runtime
```

This loads a sample bytecode program and executes it in a loop.

### Step 4: Integrate into Your Project

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
  <TabItem value="zephyr" label="I want to build firmware">

## For Firmware Engineers (Zephyr Build)

Build the complete ZPLC firmware for your target board.

### Step 1: Set Up Zephyr Environment

Follow the [official Zephyr Getting Started Guide](https://docs.zephyrproject.org/latest/develop/getting_started/index.html) to install:

- Zephyr SDK
- West build tool
- CMake & Ninja

### Step 2: Clone & Configure

```bash
# Create workspace
mkdir ~/zephyrproject && cd ~/zephyrproject
west init
west update

# Add ZPLC as external module
git clone https://github.com/eduardojvieira/ZPLC.git modules/lib/zplc
```

### Step 3: Build for Your Board

```bash
# Raspberry Pi Pico
west build -b rpi_pico modules/lib/zplc/apps/zephyr_app --pristine

# STM32 Nucleo H743ZI
west build -b nucleo_h743zi modules/lib/zplc/apps/zephyr_app --pristine

# ESP32-S3
west build -b esp32s3_devkitc modules/lib/zplc/apps/zephyr_app --pristine

# QEMU Simulation
west build -b mps2/an385 modules/lib/zplc/apps/zephyr_app --pristine
west build -t run
```

### Step 4: Flash & Test

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
| [Hardware Setup](/docs/hardware/pinouts) | Wire your I/O correctly |
| [Standard Library](/docs/runtime/stdlib) | Timers, counters, and math functions |
| [Debugging](/docs/advanced/debugging) | Breakpoints, watch windows, and step execution |
| [Multitasking](/docs/advanced/multitask) | Run multiple tasks at different intervals |

---

## System Requirements

### Web IDE
- **Browser**: Chrome 89+, Edge 89+, Safari 15+ (WebSerial support)
- **RAM**: 2GB minimum
- **Network**: Internet not required after initial load

### Development (POSIX Build)
- **OS**: macOS, Linux, Windows (WSL2)
- **Compiler**: GCC 9+ or Clang 10+
- **CMake**: 3.20+

### Zephyr Build
- **Zephyr SDK**: 0.16.0+
- **Python**: 3.10+
- **Disk Space**: 10GB+ for SDK and toolchains

---

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/eduardojvieira/ZPLC/issues)
- **Discussions**: [GitHub Discussions](https://github.com/eduardojvieira/ZPLC/discussions)
- **Source Code**: [GitHub Repository](https://github.com/eduardojvieira/ZPLC)
