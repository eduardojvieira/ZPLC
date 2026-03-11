---
sidebar_position: 3
---

# Native Zephyr C in the Runtime

ZPLC keeps user-facing IEC logic in `.zplc` bytecode and runs it through the VM/scheduler.
If you need board-specific or low-level behavior, keep that code in the **runtime**, not in the IDE.

This is the right place for:

- Zephyr service threads
- board-specific drivers or protocol helpers
- integration with vendor SDKs
- deterministic support code that should ship with firmware

This is **not** the same thing as an IEC task compiled from ST/LD/FBD/SFC.

## Current Reality

Today, the public scheduler API is bytecode-oriented:

- `.zplc` tasks are loaded with `zplc_sched_load()`
- manual registration uses `zplc_sched_register_task()`
- each registered scheduler task initializes a `zplc_vm_t`

In other words: there is **no first-class public API today for registering a raw C callback as a scheduler-owned ZPLC task**.

So the supported path for native code is:

1. keep the C file in the Zephyr runtime application
2. build it into firmware
3. run it as a Zephyr thread/work item/service
4. interact with ZPLC through stable runtime APIs, not by bypassing internals

## Recommended Structure

Put custom runtime code in a dedicated subtree instead of mixing it randomly into core files.

```text
firmware/app/
├── include/
│   └── custom/
│       └── custom_task.h
└── src/
    └── custom/
        └── custom_task.c
```

That keeps the intent clear:

- `src/main.c` remains the runtime entry point
- `src/zplc_*.c` remains platform/runtime infrastructure
- `src/custom/*.c` is project-specific native behavior

## Build Integration

Add the source file to `firmware/app/CMakeLists.txt`.

```cmake
target_sources(app PRIVATE
    src/main.c
    src/zplc_config.c
    src/zplc_modbus.c
    src/zplc_mqtt.c
    src/custom/custom_task.c
)
```

If the code is optional, gate it with Kconfig instead of always compiling it.

```cmake
if(CONFIG_ZPLC_CUSTOM_TASKS)
  target_sources(app PRIVATE src/custom/custom_task.c)
endif()
```

## Kconfig Switch

Add an app-local Kconfig option if the feature is board- or project-specific.

```kconfig
config ZPLC_CUSTOM_TASKS
	bool "Enable custom runtime C tasks"
	help
	  Builds project-specific Zephyr-native runtime tasks.
```

Then enable it in the appropriate board `.conf` file.

```ini
CONFIG_ZPLC_CUSTOM_TASKS=y
```

## Minimal Native Task Pattern

Use a normal Zephyr thread or work item. Keep memory static.

```c
#include <zephyr/kernel.h>
#include <zplc_hal.h>

#define CUSTOM_STACK_SIZE 1024
#define CUSTOM_PRIORITY 7

K_THREAD_STACK_DEFINE(custom_stack, CUSTOM_STACK_SIZE);
static struct k_thread custom_thread;

static void custom_task_entry(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    while (1) {
        zplc_hal_log("[CUSTOM] periodic native task\n");
        k_msleep(100);
    }
}

int zplc_custom_runtime_init(void)
{
    k_thread_create(&custom_thread,
                    custom_stack,
                    K_THREAD_STACK_SIZEOF(custom_stack),
                    custom_task_entry,
                    NULL, NULL, NULL,
                    CUSTOM_PRIORITY,
                    0,
                    K_NO_WAIT);
    k_thread_name_set(&custom_thread, "zplc_custom");
    return 0;
}
```

Call that init function from `firmware/app/src/main.c` after the runtime services you depend on are initialized.

## How Native Code Should Interact with ZPLC

Use the runtime like a gentleman, not like a maniac.

- Prefer `zplc_hal_*` for hardware-facing operations
- Prefer stable config/runtime APIs over touching private globals
- If reading or writing shared VM/process-image state from outside task context, use scheduler locking APIs where appropriate
- Keep execution bounded and deterministic
- Avoid dynamic allocation

## What Not To Do

- Do not touch MCU registers directly; use HAL/Zephyr drivers
- Do not fork your own competing scheduler model if IDE/ZPLC task timing matters
- Do not assume `zplc_sched_register_task()` accepts native C callbacks; it is currently VM/bytecode-oriented
- Do not hide board-specific hacks inside core runtime files without a feature flag

## If You Need "Native Tasks" with IDE-Level Semantics

That requires extra runtime architecture that does **not** exist as a stable public API today.

You would need, at minimum:

- a first-class native task backend in the scheduler
- a registry of allowed native task entry points
- task metadata binding between config and compiled symbols
- a build/flash flow for firmware changes

Until that exists, keep native C as **runtime extension code**, and keep IEC logic as `.zplc` VM tasks.

## Practical Rule of Thumb

Use IEC `.zplc` tasks for:

- control logic
- user-editable automation behavior
- IDE debugging and online changes

Use native Zephyr C for:

- device drivers
- board services
- high-performance protocol glue
- trusted, firmware-level support code

That split keeps the architecture clean and saves you from a spectacular maintenance mess later.
