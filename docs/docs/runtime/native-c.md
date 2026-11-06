---
id: native-c
title: Integrating Native C Code
sidebar_label: Native C Code
description: Add your own C code to the ZPLC firmware as a Zephyr thread, and decide when that is the right tool.
tags: [runtime, zephyr, native-c]
---

# Integrating Native C Code

Read this page when part of your machine needs code that IEC logic cannot express: a display driver, a vendor SDK, a proprietary motion algorithm or a legacy protocol. You add that code to the firmware in C, next to the runtime, and keep the control logic in `.zplc` bytecode.

## Choose the layer

| Put it in IEC logic (ST, LD, FBD, SFC)                    | Put it in native Zephyr C                                       |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| Sequences, interlocks, PID loops, machine states          | I2C or SPI drivers for a part Zephyr does not cover             |
| Anything an integrator must change without rebuilding     | A vendor SDK, a cryptographic service, a proprietary algorithm  |
| Logic you want to simulate and test on a computer         | A protocol the firmware does not implement                      |

:::note Native C is a side thread, not a block
A native C task is not a function block of your program. It runs as its own Zephyr thread next to the scheduler, so IEC logic cannot call it and the simulator does not run it. It also changes the firmware image, so it needs a build, a flash and a new evidence record for the board it runs on.
:::

## Add the code

You build the firmware from source to do this ([Build the firmware](../guides/build-firmware.md)).

1. Create a C file inside `firmware/app`. A new folder such as `src/custom/` keeps it apart from the runtime sources.
2. Write the logic as a Zephyr thread or service. When it must touch the PLC or the hardware, go through the `zplc_hal_*` functions of the [HAL contract](./hal-contract.md), never around them.
3. Add the file to the build in `firmware/app/CMakeLists.txt`:

```cmake
target_sources(app PRIVATE src/custom/custom_sensor_driver.c)
```

4. Build the board again and check its flash and RAM budget with `tools/firmware-test/run.sh size <board>`. Your code counts against the same budget as the runtime.

## Keep the boundary clean

Keep the PLC logic in the IEC languages and hardware-specific code in native files. A native thread that writes outputs or blocks for a long time can break the timing of the scan cycle, and nothing in the runtime checks that for you. Measure it on the board before you rely on it.
