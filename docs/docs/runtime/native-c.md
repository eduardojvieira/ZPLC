---
id: native-c
title: Integrating Native C Code
sidebar_label: Native C Code
description: Extending ZPLC behavior by compiling custom C language tasks into the firmware logic.
tags: [runtime, zephyr, native-c]
---

# Integrating Native C Code

ZPLC separates user-editable IEC logic (`.zplc` bytecode) from the low-level firmware operations underneath. However, developers working on complex OEM integrations often need to write high-performance drivers, utilize proprietary vendor SDKs, or define intricate hardware features that do not map directly to standard logic.

For those cases, ZPLC allows you to extend the core embedded system natively in C using Zephyr RTOS.

## The Architectural Separation

It is vital to maintain separation of concerns:
- **Use standard ZPLC Logic (ST, SFC, LD)**: For factory automation, general operations, sequence logic, PID handling, and business logic mapping.
- **Use Native Zephyr C**: For highly rigid operations such as writing display I2C drivers, proprietary motion control algorithms, hardware cryptographic services, and legacy protocols.

*Native C tasks are not directly bound into the programmable ZPLC logic flow in the IDE.* They run as independent, side-by-side threads in the Zephyr ecosystem.

## Standard Workflow

If you require native integration, you must build the ZPLC firmware from its source base:

1. Create a C source file inside `firmware/app`. (It is recommended to use `src/custom/`).
2. Implement your specific logic as a native Zephyr service or standalone thread.
3. Integrate it via CMake in the `CMakeLists.txt` file of the `firmware/app` workspace.
4. Interact with the ZPLC runtime via `zplc_hal_*` functions inside your C logic if necessary.

**Example `CMakeLists.txt` extension:**
```cmake
if(CONFIG_ZPLC_CUSTOM_TASKS)
  target_sources(app PRIVATE src/custom/custom_sensor_driver.c)
endif()
```

By confining standard application loops inside standard languages and pushing hardware specific abstractions out to native Zephyr files, the ZPLC platform remains robust, deterministically safe, and completely maintainable.
