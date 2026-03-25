---
id: native-c
title: Native C in the Runtime
sidebar_label: Native C
description: How to add Zephyr-native or board-specific C code without breaking the public ZPLC runtime contract.
tags: [runtime, zephyr, native-c]
---

# Native C in the Runtime

ZPLC keeps user-facing IEC logic in `.zplc` bytecode and executes it through the VM and scheduler.

If you need board-specific or low-level behavior, that code belongs in the **runtime firmware**, not in the IDE authoring model.

This page is grounded in:

- `firmware/app/README.md`
- `firmware/lib/zplc_core/include/zplc_scheduler.h`
- `firmware/lib/zplc_core/include/zplc_hal.h`

## What belongs here

This is the right layer for:

- Zephyr service threads
- board-specific drivers and protocol helpers
- vendor SDK integration
- deterministic support code that ships with firmware

## What this is not

This is **not** the same as an IEC task compiled from `ST`, `IL`, `LD`, `FBD`, or `SFC`.

The public scheduler API is bytecode-oriented today:

- `zplc_sched_load()` loads `.zplc` binaries
- `zplc_sched_register_task()` takes a `zplc_task_def_t`, a bytecode pointer, and bytecode size
- scheduler-managed tasks are modeled as VM-backed runtime tasks

That means there is **no stable public API today for registering an arbitrary C callback as a first-class ZPLC scheduler task**.

## Supported path today

If you need native code, the supported path is:

1. place it inside `firmware/app`
2. compile it into the firmware image
3. run it as a Zephyr thread, work item, or service
4. interact with ZPLC through public runtime and HAL APIs

## Recommended structure

The Zephyr runtime README recommends keeping project-specific code in a dedicated subtree:

```text
firmware/app/
├── include/
│   └── custom/
│       └── custom_task.h
└── src/
    └── custom/
        └── custom_task.c
```

That keeps the architectural split clear:

- `main.c` remains the runtime entry point
- runtime infrastructure stays separate from project hacks
- custom native behavior has an explicit home

## Build integration

Integrate native code through the runtime application's build system.

```cmake
target_sources(app PRIVATE
    src/main.c
    src/zplc_config.c
    src/zplc_modbus.c
    src/zplc_mqtt.c
    src/custom/custom_task.c
)
```

If the feature is optional, gate it with Kconfig instead of compiling it unconditionally.

```cmake
if(CONFIG_ZPLC_CUSTOM_TASKS)
  target_sources(app PRIVATE src/custom/custom_task.c)
endif()
```

## Safe interaction rules

When native code interacts with ZPLC:

- prefer `zplc_hal_*` for platform-facing operations
- do not bypass the HAL to poke hardware directly from shared runtime code
- if you access shared process-image memory outside task context, use `zplc_sched_lock()` and `zplc_sched_unlock()`
- keep execution bounded and deterministic
- avoid dynamic allocation unless there is a strong platform reason

## What not to do

- do not assume the scheduler accepts native callbacks as first-class ZPLC tasks
- do not hide board-specific hacks inside the portable core
- do not build a competing scheduler model if ZPLC timing semantics matter

## Practical rule of thumb

Use IEC `.zplc` tasks for:

- control logic
- user-editable automation behavior
- IDE-driven debugging and deployment workflows

Use native runtime C for:

- device drivers
- board services
- high-performance protocol glue
- trusted firmware-level support code

That split keeps the architecture honest and maintainable.

## Related pages

- [Runtime Overview](./index.md)
- [Scheduler](./scheduler.md)
- [Hardware Abstraction Layer](./hal-contract.md)
- [Zephyr Workspace Setup](/reference/zephyr-workspace-setup)
