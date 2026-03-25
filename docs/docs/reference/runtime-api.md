---
slug: /reference/runtime-api
id: runtime-api
title: Runtime API
sidebar_label: Runtime API
description: Generated reference for the public ZPLC runtime headers that ship with v1.5.0.
tags: [reference, runtime, generated]
---

# Runtime API

> [!IMPORTANT]
> This page is generated from the public C headers under `firmware/lib/zplc_core/include/`. Edit the headers or rerun `python3 tools/docs/generate_runtime_reference.py` instead of editing this file manually.

> The Spanish wrapper text is localized, while API names, signatures, and source-derived descriptions remain anchored to the English headers to avoid documentation drift.

## Source headers

- `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`
- `firmware/lib/zplc_core/include/zplc_core.h`
- `firmware/lib/zplc_core/include/zplc_debug.h`
- `firmware/lib/zplc_core/include/zplc_hal.h`
- `firmware/lib/zplc_core/include/zplc_isa.h`
- `firmware/lib/zplc_core/include/zplc_loader.h`
- `firmware/lib/zplc_core/include/zplc_scheduler.h`

## `zplc_comm_dispatch.h`

zplc_comm_dispatch.h

Source: `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`

### Functions

#### `zplc_comm_register_handler`

```c
int zplc_comm_register_handler(zplc_comm_fb_kind_t kind, zplc_comm_handler_t fn);
```

**Source summary:** Register a handler for a communication FB kind.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | — |
| `fn` | `zplc_comm_handler_t` | — |

#### `zplc_comm_fb_exec`

```c
int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint8_t *fb_mem);
```

**Source summary:** Execute a communication FB instance (called by VM from OP_COMM_EXEC).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | — |
| `fb_mem` | `uint8_t *` | — |

#### `zplc_comm_fb_reset`

```c
int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint8_t *fb_mem);
```

**Source summary:** Reset a communication FB instance (called by VM from OP_COMM_RESET).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | — |
| `fb_mem` | `uint8_t *` | — |

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `zplc_comm_fb_kind_t` | Enum | Communication function block kind identifiers. |
| `zplc_comm_status_t` | Enum | Communication status codes written to FB.STATUS. |
| `zplc_comm_handler_t` | Typedef | Comm FB handler function type. |

### Constants and macros

None.

## `zplc_core.h`

ZPLC Core Runtime Public API

This header declares the public interface for the ZPLC Virtual Machine. The API supports two usage patterns: 1. **Legacy Singleton API** (zplc_core_*): Uses a default VM instance. Simple to use for single-task applications. 2. **Instance-based API** (zplc_vm_*): Each task gets its own VM instance. Required for multi-task scheduling where each task has private state. Memory Model: - IPI/OPI: Shared across all VM instances (synchronized by scheduler) - Work/Retain: Shared (tasks coordinate via addresses) - Stack/CallStack/PC: Private per VM instance - Code: Shared (multiple VMs can reference same code with different entry points)

Source: `firmware/lib/zplc_core/include/zplc_core.h`

### Functions

#### `zplc_mem_init`

```c
int zplc_mem_init(void);
```

**Source summary:** Initialize shared memory regions.

Zeros IPI, OPI, Work, and Retain memory. Call once at system startup, before creating any VM instances.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success

#### `zplc_mem_get_region`

```c
uint8_t* zplc_mem_get_region(uint16_t base);
```

**Source summary:** Get pointer to shared memory region.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `base` | `uint16_t` | Base address (ZPLC_MEM_IPI_BASE, etc.) |

**Source return value:** Pointer to memory region, or NULL if invalid

#### `zplc_mem_load_code`

```c
int zplc_mem_load_code(const uint8_t *code, size_t size, uint16_t offset);
```

**Source summary:** Load code into the shared code segment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `code` | `const uint8_t *` | Bytecode to load |
| `size` | `size_t` | Size in bytes |
| `offset` | `uint16_t` | Offset within code segment (for multiple programs) |

**Source return value:** 0 on success, negative on error

#### `zplc_mem_get_code`

```c
const uint8_t* zplc_mem_get_code(uint16_t offset, size_t size);
```

**Source summary:** Get pointer to code segment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Offset within code segment |
| `size` | `size_t` | Size of code to access |

**Source return value:** Pointer to code, or NULL if out of bounds

#### `zplc_mem_get_code_size`

```c
uint32_t zplc_mem_get_code_size(void);
```

**Source summary:** Get current loaded code size.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Total bytes loaded in code segment

#### `zplc_vm_init`

```c
int zplc_vm_init(zplc_vm_t *vm);
```

**Source summary:** Initialize a VM instance.

Resets all execution state. Does not allocate memory. The zplc_vm_t struct must already be allocated.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Source return value:** 0 on success

#### `zplc_vm_set_entry`

```c
int zplc_vm_set_entry(zplc_vm_t *vm, uint16_t entry_point, uint32_t code_size);
```

**Source summary:** Configure VM to execute code at specified entry point.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |
| `entry_point` | `uint16_t` | Offset within code segment |
| `code_size` | `uint32_t` | Size of code for this task |

**Source return value:** 0 on success, negative on error

#### `zplc_vm_step`

```c
int zplc_vm_step(zplc_vm_t *vm);
```

**Source summary:** Execute a single instruction.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Source return value:** ZPLC_VM_OK on success, error code otherwise

#### `zplc_vm_run`

```c
int zplc_vm_run(zplc_vm_t *vm, uint32_t max_instructions);
```

**Source summary:** Run VM for a fixed number of instructions or until halted.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |
| `max_instructions` | `uint32_t` | Maximum instructions (0 = unlimited) |

**Source return value:** Number of instructions executed, or negative error code

#### `zplc_vm_run_cycle`

```c
int zplc_vm_run_cycle(zplc_vm_t *vm);
```

**Source summary:** Run one complete PLC scan cycle.

Resets PC to entry point, executes until HALT, returns.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Source return value:** Number of instructions executed, or negative error code

#### `zplc_vm_reset_cycle`

```c
void zplc_vm_reset_cycle(zplc_vm_t *vm);
```

**Source summary:** Reset VM for a new cycle without full init.

Faster than zplc_vm_init() - only resets PC, SP, and status.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

#### `zplc_vm_get_error`

```c
int zplc_vm_get_error(const zplc_vm_t *vm);
```

**Source summary:** Get VM error code.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Source return value:** Error code

#### `zplc_vm_is_halted`

```c
int zplc_vm_is_halted(const zplc_vm_t *vm);
```

**Source summary:** Check if VM is halted.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Source return value:** 1 if halted, 0 if running

#### `zplc_vm_get_stack`

```c
uint32_t zplc_vm_get_stack(const zplc_vm_t *vm, uint16_t index);
```

**Source summary:** Get stack value.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |
| `index` | `uint16_t` | Stack index (0 = bottom) |

**Source return value:** Stack value, or 0 if out of bounds

#### `zplc_vm_get_sp`

```c
uint16_t zplc_vm_get_sp(const zplc_vm_t *vm);
```

**Source summary:** Get stack pointer.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Source return value:** Stack pointer

#### `zplc_vm_get_pc`

```c
uint16_t zplc_vm_get_pc(const zplc_vm_t *vm);
```

**Source summary:** Get program counter.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Source return value:** Program counter

#### `zplc_vm_is_paused`

```c
int zplc_vm_is_paused(const zplc_vm_t *vm);
```

**Source summary:** Check if VM is paused at a breakpoint.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Source return value:** 1 if paused, 0 if running or halted

#### `zplc_vm_resume`

```c
int zplc_vm_resume(zplc_vm_t *vm);
```

**Source summary:** Resume execution after a breakpoint pause.

Clears the paused flag so the next zplc_vm_step() continues execution.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Source return value:** 0 on success, -1 if NULL

#### `zplc_vm_add_breakpoint`

```c
int zplc_vm_add_breakpoint(zplc_vm_t *vm, uint16_t pc);
```

**Source summary:** Add a breakpoint at a program counter address.

When the VM's PC reaches this address, execution will pause.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |
| `pc` | `uint16_t` | Program counter address to break at |

**Source return value:** 0 on success, -1 if NULL, -2 if breakpoint table full, -3 if already exists

#### `zplc_vm_remove_breakpoint`

```c
int zplc_vm_remove_breakpoint(zplc_vm_t *vm, uint16_t pc);
```

**Source summary:** Remove a breakpoint at a program counter address.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |
| `pc` | `uint16_t` | Program counter address to remove |

**Source return value:** 0 on success, -1 if NULL, -2 if not found

#### `zplc_vm_clear_breakpoints`

```c
int zplc_vm_clear_breakpoints(zplc_vm_t *vm);
```

**Source summary:** Clear all breakpoints.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Source return value:** 0 on success, -1 if NULL

#### `zplc_vm_get_breakpoint_count`

```c
uint8_t zplc_vm_get_breakpoint_count(const zplc_vm_t *vm);
```

**Source summary:** Get the number of active breakpoints.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Source return value:** Number of breakpoints, or 0 if NULL

#### `zplc_vm_get_breakpoint`

```c
uint16_t zplc_vm_get_breakpoint(const zplc_vm_t *vm, uint8_t index);
```

**Source summary:** Get a breakpoint address by index.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |
| `index` | `uint8_t` | Index in breakpoint array (0 to count-1) |

**Source return value:** PC address of breakpoint, or 0xFFFF if invalid

#### `zplc_ipi_write32`

```c
int zplc_ipi_write32(uint16_t offset, uint32_t value);
```

**Source summary:** Write a 32-bit value to IPI.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |
| `value` | `uint32_t` | Value to write |

**Source return value:** 0 on success, -1 if out of bounds

#### `zplc_ipi_write16`

```c
int zplc_ipi_write16(uint16_t offset, uint16_t value);
```

**Source summary:** Write a 16-bit value to IPI.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |
| `value` | `uint16_t` | Value to write |

**Source return value:** 0 on success, -1 if out of bounds

#### `zplc_ipi_write8`

```c
int zplc_ipi_write8(uint16_t offset, uint8_t value);
```

**Source summary:** Write an 8-bit value to IPI.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |
| `value` | `uint8_t` | Value to write |

**Source return value:** 0 on success, -1 if out of bounds

#### `zplc_ipi_read32`

```c
uint32_t zplc_ipi_read32(uint16_t offset);
```

**Source summary:** Read a 32-bit value from IPI.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |

**Source return value:** Value at offset, or 0 if out of bounds

#### `zplc_ipi_read16`

```c
uint16_t zplc_ipi_read16(uint16_t offset);
```

**Source summary:** Read a 16-bit value from IPI.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |

**Source return value:** Value at offset, or 0 if out of bounds

#### `zplc_ipi_read8`

```c
uint8_t zplc_ipi_read8(uint16_t offset);
```

**Source summary:** Read an 8-bit value from IPI.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |

**Source return value:** Value at offset, or 0 if out of bounds

#### `zplc_opi_read32`

```c
uint32_t zplc_opi_read32(uint16_t offset);
```

**Source summary:** Read a 32-bit value from OPI.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within OPI |

**Source return value:** Value at offset, or 0 if out of bounds

#### `zplc_opi_read16`

```c
uint16_t zplc_opi_read16(uint16_t offset);
```

**Source summary:** Read a 16-bit value from OPI.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within OPI |

**Source return value:** Value at offset, or 0 if out of bounds

#### `zplc_opi_read8`

```c
uint8_t zplc_opi_read8(uint16_t offset);
```

**Source summary:** Read an 8-bit value from OPI.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within OPI |

**Source return value:** Value at offset, or 0 if out of bounds

#### `zplc_force_set_bytes`

```c
int zplc_force_set_bytes(uint16_t addr, const uint8_t *bytes, uint16_t size);
```

**Source summary:** Set a forced byte range and apply it immediately.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `addr` | `uint16_t` | Absolute logical address |
| `bytes` | `const uint8_t *` | Forced bytes buffer |
| `size` | `uint16_t` | Number of bytes in the buffer |

**Source return value:** 0 on success, negative on error

#### `zplc_force_clear`

```c
int zplc_force_clear(uint16_t addr);
```

**Source summary:** Clear the force entry that starts at the given address.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `addr` | `uint16_t` | Absolute logical address of the force entry |

**Source return value:** 0 on success, negative on error

#### `zplc_force_clear_all`

```c
void zplc_force_clear_all(void);
```

**Source summary:** Clear all active force entries.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

#### `zplc_force_get_count`

```c
uint8_t zplc_force_get_count(void);
```

**Source summary:** Get the number of active force entries.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Active entry count

#### `zplc_force_get`

```c
int zplc_force_get(uint8_t index, uint16_t *addr, uint16_t *size, uint8_t *bytes);
```

**Source summary:** Get a force entry by index.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `index` | `uint8_t` | Force table index |
| `addr` | `uint16_t *` | Output absolute address |
| `size` | `uint16_t *` | Output byte count |
| `bytes` | `uint8_t *` | Output buffer receiving the stored bytes |

**Source return value:** 0 on success, negative on error

#### `zplc_force_write_bytes`

```c
int zplc_force_write_bytes(uint16_t addr, const uint8_t *bytes, uint16_t size);
```

**Source summary:** Write raw bytes then re-apply any overlapping force overrides.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `addr` | `uint16_t` | Absolute logical address |
| `bytes` | `const uint8_t *` | Source bytes |
| `size` | `uint16_t` | Number of bytes to write |

**Source return value:** 0 on success, negative on error

#### `zplc_pi_lock`

```c
int zplc_pi_lock(void);
```

**Source summary:** Lock the Process Image.

Acquires a mutex or spinlock to protect memory regions. Must be called before accessing IPI/OPI from external threads.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative on error or timeout

#### `zplc_pi_unlock`

```c
void zplc_pi_unlock(void);
```

**Source summary:** Unlock the Process Image.

Releases the lock acquired by zplc_pi_lock.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

#### `zplc_core_get_tag_count`

```c
uint16_t zplc_core_get_tag_count(void);
```

**Source summary:** Get the number of variable tags loaded.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

#### `zplc_core_get_tag`

```c
const zplc_tag_entry_t* zplc_core_get_tag(uint16_t index);
```

**Source summary:** Get a variable tag by index.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `index` | `uint16_t` | Tag index (0 to count-1) |

**Source return value:** Pointer to tag entry, or NULL if out of bounds.

#### `zplc_core_version`

```c
const char* zplc_core_version(void);
```

**Source summary:** Get the ZPLC core version string.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Version string in format "major.minor.patch"

#### `zplc_core_init`

```c
int zplc_core_init(void);
```

**Source summary:** Initialize the ZPLC core.

Initializes shared memory and default VM instance.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success

#### `zplc_core_shutdown`

```c
int zplc_core_shutdown(void);
```

**Source summary:** Shutdown the ZPLC core.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success

#### `zplc_core_load`

```c
int zplc_core_load(const uint8_t *binary, size_t size);
```

**Source summary:** Load a .zplc binary program.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `binary` | `const uint8_t *` | Pointer to .zplc file contents |
| `size` | `size_t` | Size of binary data |

**Source return value:** 0 on success, negative error code otherwise

#### `zplc_core_load_raw`

```c
int zplc_core_load_raw(const uint8_t *bytecode, size_t size);
```

**Source summary:** Load raw bytecode directly.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `bytecode` | `const uint8_t *` | Raw bytecode bytes |
| `size` | `size_t` | Size of bytecode |

**Source return value:** 0 on success

#### `zplc_core_step`

```c
int zplc_core_step(void);
```

**Source summary:** Execute a single instruction.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** ZPLC_VM_OK on success, error code otherwise

#### `zplc_core_run`

```c
int zplc_core_run(uint32_t max_instructions);
```

**Source summary:** Run VM for a fixed number of instructions.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `max_instructions` | `uint32_t` | Maximum instructions (0 = unlimited) |

**Source return value:** Number of instructions executed, or negative error code

#### `zplc_core_run_cycle`

```c
int zplc_core_run_cycle(void);
```

**Source summary:** Run one complete PLC scan cycle.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Number of instructions executed, or negative error code

#### `zplc_core_get_state`

```c
const zplc_vm_state_t* zplc_core_get_state(void);
```

**Source summary:** Get a read-only pointer to the default VM state.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Pointer to VM state (legacy zplc_vm_state_t)

#### `zplc_core_get_sp`

```c
uint16_t zplc_core_get_sp(void);
```

**Source summary:** Get the current stack pointer.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Stack pointer value

#### `zplc_core_get_pc`

```c
uint16_t zplc_core_get_pc(void);
```

**Source summary:** Get the current program counter.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Program counter value

#### `zplc_core_get_stack`

```c
uint32_t zplc_core_get_stack(uint16_t index);
```

**Source summary:** Get a value from the evaluation stack.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `index` | `uint16_t` | Stack index (0 = bottom) |

**Source return value:** Stack value

#### `zplc_core_get_error`

```c
int zplc_core_get_error(void);
```

**Source summary:** Get the last error code.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Error code

#### `zplc_core_is_halted`

```c
int zplc_core_is_halted(void);
```

**Source summary:** Check if VM is halted.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 1 if halted, 0 if running

#### `zplc_core_set_ipi`

```c
int zplc_core_set_ipi(uint16_t offset, uint32_t value);
```

**Source summary:** Write to IPI (legacy).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset |
| `value` | `uint32_t` | 32-bit value |

**Source return value:** 0 on success

#### `zplc_core_set_ipi16`

```c
int zplc_core_set_ipi16(uint16_t offset, uint16_t value);
```

**Source summary:** Write 16-bit to IPI (legacy).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset |
| `value` | `uint16_t` | 16-bit value |

**Source return value:** 0 on success

#### `zplc_core_get_opi`

```c
uint32_t zplc_core_get_opi(uint16_t offset);
```

**Source summary:** Read from OPI (legacy).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset |

**Source return value:** 32-bit value

#### `zplc_core_get_default_vm`

```c
zplc_vm_t* zplc_core_get_default_vm(void);
```

**Source summary:** Get pointer to default VM instance.

Useful for transitioning code to instance-based API.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Pointer to default VM

#### `zplc_core_load_tasks`

```c
int zplc_core_load_tasks(const uint8_t *binary, size_t size, zplc_task_def_t *tasks, uint8_t max_tasks);
```

**Source summary:** Load tasks from a .zplc binary containing a TASK segment.

Parses the TASK segment and populates an array of task definitions. Also loads the code segment into shared memory.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `binary` | `const uint8_t *` | Pointer to .zplc file contents |
| `size` | `size_t` | Size of binary data |
| `tasks` | `zplc_task_def_t *` | Output array to fill with task definitions |
| `max_tasks` | `uint8_t` | Maximum number of tasks to load |

**Source return value:** Number of tasks loaded, or negative error code

#### `zplc_task_get_entry`

```c
static inline uint16_t zplc_task_get_entry(const zplc_task_def_t *task);
```

**Source summary:** Get entry point for a loaded task.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task` | `const zplc_task_def_t *` | Pointer to task definition |

**Source return value:** Entry point offset in code segment

#### `zplc_task_get_interval_us`

```c
static inline uint32_t zplc_task_get_interval_us(const zplc_task_def_t *task);
```

**Source summary:** Get interval in microseconds for a task.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task` | `const zplc_task_def_t *` | Pointer to task definition |

**Source return value:** Interval in microseconds

#### `zplc_task_get_priority`

```c
static inline uint8_t zplc_task_get_priority(const zplc_task_def_t *task);
```

**Source summary:** Get priority for a task.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task` | `const zplc_task_def_t *` | Pointer to task definition |

**Source return value:** Priority (0 = highest)

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `pc` | Struct | VM instance structure. |

### Constants and macros

None.

## `zplc_debug.h`

ZPLC Hardware-in-the-Loop Debug API

This header declares the debug output API for HIL (Hardware-in-the-Loop) testing. When enabled, the runtime outputs JSON-formatted trace information via the Zephyr shell for parsing by the HIL test framework. The debug output is runtime-controllable (not compile-time), allowing the same firmware to be used in production and testing modes. Protocol: Line-based JSON with CRLF terminators. See: specs/002-hil-testing/contracts/debug-protocol.md

Source: `firmware/lib/zplc_core/include/zplc_debug.h`

### Functions

#### `hil_set_mode`

```c
void hil_set_mode(hil_mode_t mode);
```

**Source summary:** Set the HIL debug output mode.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `mode` | `hil_mode_t` | The desired debug mode |

#### `hil_get_mode`

```c
hil_mode_t hil_get_mode(void);
```

**Source summary:** Get the current HIL debug output mode.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Current debug mode

#### `hil_set_shell`

```c
void hil_set_shell(const struct shell *sh);
```

**Source summary:** Set the shell instance for debug output.

Must be called before any trace functions. Typically called by the `zplc hil mode` shell command.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `sh` | `const struct shell *` | Pointer to shell instance |

#### `hil_trace_opcode`

```c
void hil_trace_opcode(uint8_t op, uint16_t pc, uint8_t sp, int32_t tos);
```

**Source summary:** Trace an opcode execution.

Emits: \{"t":"opcode","op":"ADD","pc":18,"sp":2,"tos":7\} Only outputs in HIL_MODE_VERBOSE.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `op` | `uint8_t` | Opcode value (from zplc_opcode_t) |
| `pc` | `uint16_t` | Program counter BEFORE execution |
| `sp` | `uint8_t` | Stack pointer AFTER execution |
| `tos` | `int32_t` | Top of stack value AFTER execution (signed) |

#### `hil_trace_fb`

```c
void hil_trace_fb(const char *name, uint8_t id, bool q, int32_t et_or_cv);
```

**Source summary:** Trace a function block execution.

Emits: \{"t":"fb","name":"TON","id":0,"q":true,"et":100\} Outputs in HIL_MODE_SUMMARY and HIL_MODE_VERBOSE.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `name` | `const char *` | Function block type name (e.g., "TON", "CTU") |
| `id` | `uint8_t` | Instance ID (0-255) |
| `q` | `bool` | Q output value |
| `et_or_cv` | `int32_t` | Elapsed time (timers) or current value (counters), -1 if N/A |

#### `hil_trace_task`

```c
void hil_trace_task(uint8_t id, uint32_t start_ms, uint32_t end_ms, uint32_t us, bool overrun);
```

**Source summary:** Trace a task completion.

Emits: \{"t":"task","id":1,"start":1000,"end":1045,"us":45,"ovr":false\} Outputs in HIL_MODE_SUMMARY and HIL_MODE_VERBOSE.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `id` | `uint8_t` | Task ID (0-7) |
| `start_ms` | `uint32_t` | Task start time (ms since boot) |
| `end_ms` | `uint32_t` | Task end time (ms since boot) |
| `us` | `uint32_t` | Execution time in microseconds |
| `overrun` | `bool` | True if task overran its period |

#### `hil_trace_cycle`

```c
void hil_trace_cycle(uint32_t n, uint32_t us, uint8_t tasks);
```

**Source summary:** Trace a VM cycle completion.

Emits: \{"t":"cycle","n":100,"us":850,"tasks":3\} Outputs in HIL_MODE_SUMMARY and HIL_MODE_VERBOSE.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `n` | `uint32_t` | Cycle number (0-2^31) |
| `us` | `uint32_t` | Total cycle time in microseconds |
| `tasks` | `uint8_t` | Number of tasks executed this cycle |

#### `hil_trace_error`

```c
void hil_trace_error(uint8_t code, const char *msg, uint16_t pc);
```

**Source summary:** Trace a VM error.

Emits: \{"t":"error","code":3,"msg":"DIV_BY_ZERO","pc":42\} Always outputs regardless of mode (errors are always important).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `code` | `uint8_t` | Error code (from zplc_vm_error_t) |
| `msg` | `const char *` | Human-readable error message |
| `pc` | `uint16_t` | Program counter where error occurred |

#### `hil_trace_break`

```c
void hil_trace_break(uint16_t pc);
```

**Source summary:** Trace a breakpoint hit.

Emits: \{"t":"break","pc":42\} Always outputs regardless of mode (breakpoint events are critical).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `pc` | `uint16_t` | Program counter where the breakpoint was hit |

#### `hil_trace_watch`

```c
void hil_trace_watch(uint16_t addr, const char *type, int32_t val);
```

**Source summary:** Trace a watched variable change.

Emits: \{"t":"watch","addr":8192,"type":"i32","val":42\}

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `addr` | `uint16_t` | Variable address |
| `type` | `const char *` | Type string: "i8", "i16", "i32", "u8", "u16", "u32", "f32", "bool" |
| `val` | `int32_t` | Current value (as signed 32-bit, caller converts) |

#### `hil_send_ready`

```c
void hil_send_ready(const char *fw_version, const char *caps);
```

**Source summary:** Send the ready signal on boot.

Emits: \{"t":"ready","fw":"1.5.0","caps":["sched","hil"]\} Should be called once after boot when shell is ready.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `fw_version` | `const char *` | Firmware version string (e.g., "1.5.0") |
| `caps` | `const char *` | Comma-separated capability list (e.g., "sched,hil,sfc") |

#### `hil_send_ack`

```c
void hil_send_ack(const char *cmd, const char *val, bool ok, const char *err);
```

**Source summary:** Send a command acknowledgment.

Emits: \{"t":"ack","cmd":"mode","val":"verbose","ok":true\}

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `cmd` | `const char *` | Command name that was executed |
| `val` | `const char *` | Value that was set |
| `ok` | `bool` | True if command succeeded |
| `err` | `const char *` | Error message if ok is false, NULL otherwise |

#### `hil_opcode_name`

```c
const char *hil_opcode_name(uint8_t op);
```

**Source summary:** Get the string name for an opcode.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `op` | `uint8_t` | Opcode value |

**Source return value:** Opcode name string (e.g., "ADD", "PUSH32"), or "???" if unknown

#### `hil_error_name`

```c
const char *hil_error_name(uint8_t code);
```

**Source summary:** Get the string name for a VM error code.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `code` | `uint8_t` | Error code (from zplc_vm_error_t) |

**Source return value:** Error name string (e.g., "DIV_BY_ZERO"), or "UNKNOWN" if invalid

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `hil_mode_t` | Enum | HIL debug output modes. |

### Constants and macros

None.

## `zplc_hal.h`

ZPLC Hardware Abstraction Layer Interface

This header defines the contract between the ZPLC Core and the underlying platform. The Core NEVER calls hardware directly - all access goes through these functions. Each target platform (POSIX, Zephyr, WASM, Windows) provides its own implementation of this interface.

Source: `firmware/lib/zplc_core/include/zplc_hal.h`

### Functions

#### `zplc_hal_tick`

```c
uint32_t zplc_hal_tick(void);
```

**Source summary:** Get the current system tick in milliseconds.

This is the primary timekeeping function for the runtime scheduler. Must be monotonically increasing (no rollover handling required for at least 49 days with uint32_t).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Current tick count in milliseconds since system start.

**Source notes:**
- Platform implementations: - POSIX: clock_gettime(CLOCK_MONOTONIC) - Zephyr: k_uptime_get() - WASM: performance.now()

#### `zplc_hal_sleep`

```c
void zplc_hal_sleep(uint32_t ms);
```

**Source summary:** Sleep for the specified number of milliseconds.

Blocking sleep - use only for cycle timing, never in logic execution.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `ms` | `uint32_t` | Number of milliseconds to sleep. |

**Source notes:**
- Platform implementations: - POSIX: nanosleep() - Zephyr: k_msleep() - WASM: Atomics.wait() or async yield

#### `zplc_hal_gpio_read`

```c
zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value);
```

**Source summary:** Read a digital input channel.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `channel` | `uint8_t` | Logical channel number (0-based). |
| `value` | `uint8_t *` | Pointer to store the read value (0 or 1). |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_gpio_write`

```c
zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value);
```

**Source summary:** Write to a digital output channel.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `channel` | `uint8_t` | Logical channel number (0-based). |
| `value` | `uint8_t` | Value to write (0 or 1). |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_adc_read`

```c
zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value);
```

**Source summary:** Read an analog input channel.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `channel` | `uint8_t` | Logical channel number (0-based). |
| `value` | `uint16_t *` | Pointer to store the read value (raw ADC counts or scaled). |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_dac_write`

```c
zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value);
```

**Source summary:** Write to an analog output channel (DAC).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `channel` | `uint8_t` | Logical channel number (0-based). |
| `value` | `uint16_t` | Value to write (raw DAC counts or scaled). |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_persist_save`

```c
zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data, size_t len);
```

**Source summary:** Save data to persistent storage.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `key` | `const char *` | Identifier string for the data block. |
| `data` | `const void *` | Pointer to data to save. |
| `len` | `size_t` | Length of data in bytes. |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_persist_load`

```c
zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data, size_t len);
```

**Source summary:** Load data from persistent storage.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `key` | `const char *` | Identifier string for the data block. |
| `data` | `void *` | Buffer to load data into. |
| `len` | `size_t` | Maximum length to read. |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_persist_delete`

```c
zplc_hal_result_t zplc_hal_persist_delete(const char *key);
```

**Source summary:** Delete data from persistent storage.

Removes the specified key from persistent storage.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `key` | `const char *` | Identifier string for the data block to delete. |

**Source return value:** ZPLC_HAL_OK on success, ZPLC_HAL_NOT_IMPL if key not found, error code otherwise.

#### `zplc_hal_net_init`

```c
zplc_hal_result_t zplc_hal_net_init(void);
```

**Source summary:** Initialize the networking stack.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_net_get_ip`

```c
zplc_hal_result_t zplc_hal_net_get_ip(char *buf, size_t len);
```

**Source summary:** Get the current IP address of the device.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `buf` | `char *` | Buffer to store the IP address string (e.g., "192.168.1.100") |
| `len` | `size_t` | Maximum length of the buffer |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_dns_resolve`

```c
zplc_hal_result_t zplc_hal_dns_resolve(const char *hostname, char *ip_buf, size_t len);
```

**Source summary:** Resolve a hostname to an IP address.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `hostname` | `const char *` | Hostname string to resolve |
| `ip_buf` | `char *` | Buffer to store the resolved IP address string |
| `len` | `size_t` | Maximum length of the IP buffer |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_mutex_create`

```c
zplc_hal_mutex_t zplc_hal_mutex_create(void);
```

**Source summary:** Create a new mutex.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Mutex handle on success, NULL on failure.

#### `zplc_hal_mutex_lock`

```c
zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex);
```

**Source summary:** Lock a mutex. Blocks until available.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `mutex` | `zplc_hal_mutex_t` | Mutex handle. |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_mutex_unlock`

```c
zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex);
```

**Source summary:** Unlock a mutex.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `mutex` | `zplc_hal_mutex_t` | Mutex handle. |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_socket_connect`

```c
zplc_hal_socket_t zplc_hal_socket_connect(const char *host, uint16_t port);
```

**Source summary:** Create a TCP socket and connect to a remote host.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `host` | `const char *` | Hostname or IP address string. |
| `port` | `uint16_t` | Port number. |

**Source return value:** Socket handle on success, NULL on failure.

#### `zplc_hal_socket_send`

```c
int32_t zplc_hal_socket_send(zplc_hal_socket_t sock, const void *data, size_t len);
```

**Source summary:** Send data over a socket.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `sock` | `zplc_hal_socket_t` | Socket handle. |
| `data` | `const void *` | Data buffer to send. |
| `len` | `size_t` | Length of data. |

**Source return value:** Number of bytes sent, or negative error code.

#### `zplc_hal_socket_recv`

```c
int32_t zplc_hal_socket_recv(zplc_hal_socket_t sock, void *buf, size_t len);
```

**Source summary:** Receive data from a socket.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `sock` | `zplc_hal_socket_t` | Socket handle. |
| `buf` | `void *` | Buffer to receive into. |
| `len` | `size_t` | Maximum bytes to receive. |

**Source return value:** Number of bytes received, or negative error code.

#### `zplc_hal_socket_close`

```c
zplc_hal_result_t zplc_hal_socket_close(zplc_hal_socket_t sock);
```

**Source summary:** Close a socket.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `sock` | `zplc_hal_socket_t` | Socket handle to close. |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_log`

```c
void zplc_hal_log(const char *fmt, ...);
```

**Source summary:** Log a formatted message.

Printf-style logging for runtime diagnostics.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `fmt` | `const char *` | Format string (printf-style). |
| `...` | `variadic` | Variable arguments. |

**Source notes:**
- Platform implementations: - POSIX: fprintf(stderr, ...) - Zephyr: printk() or LOG_INF() - WASM: console.log() via JS bridge

#### `zplc_hal_init`

```c
zplc_hal_result_t zplc_hal_init(void);
```

**Source summary:** Initialize the HAL layer.

Must be called before any other HAL functions. Sets up hardware peripherals, timers, and communication channels.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_shutdown`

```c
zplc_hal_result_t zplc_hal_shutdown(void);
```

**Source summary:** Shutdown the HAL layer.

Clean shutdown - close sockets, flush persistence, release resources.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** ZPLC_HAL_OK on success, error code otherwise.

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `zplc_hal_result_t` | Enum | HAL operation result codes |
| `zplc_hal_socket_t` | Typedef | Opaque socket handle |
| `zplc_hal_mutex_t` | Typedef | Opaque mutex handle |

### Constants and macros

None.

## `zplc_isa.h`

ZPLC Virtual Machine Instruction Set Architecture Definitions

This header defines the binary format and instruction set for the ZPLC VM. It is the contract between the compiler (IDE) and runtime (VM). See docs/ISA.md for the complete specification.

Source: `firmware/lib/zplc_core/include/zplc_isa.h`

### Functions

#### `zplc_opcode_operand_size`

```c
static inline uint8_t zplc_opcode_operand_size(uint8_t opcode);
```

**Source summary:** Get the operand size for an opcode.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `opcode` | `uint8_t` | The opcode byte. |

**Source return value:** Operand size in bytes (0, 1, 2, or 4).

#### `zplc_opcode_instruction_size`

```c
static inline uint8_t zplc_opcode_instruction_size(uint8_t opcode);
```

**Source summary:** Get the total instruction size for an opcode.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `opcode` | `uint8_t` | The opcode byte. |

**Source return value:** Total instruction size in bytes (1, 2, 3, or 5).

#### `zplc_opcode_is_valid`

```c
static inline int zplc_opcode_is_valid(uint8_t opcode);
```

**Source summary:** Check if an opcode is valid.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `opcode` | `uint8_t` | The opcode byte. |

**Source return value:** 1 if valid, 0 if invalid.

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `zplc_data_type_t` | Enum | IEC 61131-3 data type identifiers. |
| `zplc_opcode_t` | Enum | VM instruction opcodes. |
| `magic` | Struct | .zplc file header (32 bytes). |
| `zplc_file_flags_t` | Enum | File header flags. |
| `type` | Struct | Segment table entry (8 bytes). |
| `zplc_segment_type_t` | Enum | Segment types. |
| `id` | Struct | Task definition (16 bytes). |
| `zplc_task_type_t` | Enum | Task types. |
| `var_addr` | Struct | I/O map entry (8 bytes). |
| `zplc_io_direction_t` | Enum | I/O direction. |
| `var_addr` | Struct | Variable tag entry (8 bytes). Used for mapping variables to communication protocols. |
| `zplc_tag_id_t` | Enum | Tag identifiers. |
| `zplc_vm_error_t` | Enum | VM error codes. |
| `zplc_vm_flags_t` | Enum | VM status flags. |
| `pc` | Struct | VM execution state. |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_MAGIC` | `0x434C505AU` | Magic number for .zplc files. |
| `ZPLC_VERSION_MAJOR` | `1` | Current ISA major version |
| `ZPLC_VERSION_MINOR` | `0` | Current ISA minor version |
| `ZPLC_MEM_IPI_BASE` | `0x0000U` | Base address of Input Process Image |
| `ZPLC_MEM_IPI_SIZE` | `0x1000U` | Size of Input Process Image (4 KB, fixed by spec) |
| `ZPLC_MEM_OPI_BASE` | `0x1000U` | Base address of Output Process Image |
| `ZPLC_MEM_OPI_SIZE` | `0x1000U` | Size of Output Process Image (4 KB, fixed by spec) |
| `ZPLC_MEM_WORK_BASE` | `0x2000U` | Base address of Work Memory |
| `ZPLC_MEM_WORK_SIZE` | `CONFIG_ZPLC_WORK_MEMORY_SIZE` | — |
| `ZPLC_MEM_WORK_SIZE` | `0x2000U` | — |
| `ZPLC_MEM_RETAIN_BASE` | `0x4000U` | Base address of Retentive Memory |
| `ZPLC_MEM_RETAIN_SIZE` | `CONFIG_ZPLC_RETAIN_MEMORY_SIZE` | — |
| `ZPLC_MEM_RETAIN_SIZE` | `0x1000U` | — |
| `ZPLC_MEM_CODE_BASE` | `0x5000U` | Base address of Code Segment |
| `ZPLC_MEM_CODE_SIZE` | `CONFIG_ZPLC_CODE_SIZE_MAX` | — |
| `ZPLC_MEM_CODE_SIZE` | `0xB000U` | — |
| `ZPLC_MAX_TAGS` | `64` | — |
| `ZPLC_STACK_MAX_DEPTH` | `CONFIG_ZPLC_STACK_DEPTH` | — |
| `ZPLC_STACK_MAX_DEPTH` | `256` | — |
| `ZPLC_CALL_STACK_MAX` | `CONFIG_ZPLC_CALL_STACK_DEPTH` | — |
| `ZPLC_CALL_STACK_MAX` | `32` | — |
| `ZPLC_MAX_BREAKPOINTS` | `CONFIG_ZPLC_MAX_BREAKPOINTS` | — |
| `ZPLC_MAX_BREAKPOINTS` | `16` | — |
| `ZPLC_SYS_REG_OFFSET` | `0x0FF0U` | Offset within IPI for system registers (last 16 bytes) |
| `ZPLC_SYS_FLAG_FIRST_SCAN` | `0x01` | System flags: First scan bit (set on first cycle after start) |
| `ZPLC_SYS_FLAG_WDG_WARN` | `0x02` | System flags: Watchdog warning (cycle time exceeded 80% of interval) |
| `ZPLC_SYS_FLAG_RUNNING` | `0x04` | System flags: Scheduler is running |
| `ZPLC_STRING_LEN_OFFSET` | `0` | STRING memory layout. |
| `ZPLC_STRING_CAP_OFFSET` | `2` | — |
| `ZPLC_STRING_DATA_OFFSET` | `4` | — |
| `ZPLC_STRING_DEFAULT_SIZE` | `80` | — |
| `ZPLC_STRING_MAX_SIZE` | `255` | — |
| `ZPLC_FILE_HEADER_SIZE` | `32` | Expected size of file header |
| `ZPLC_SEGMENT_ENTRY_SIZE` | `8` | Expected size of segment entry |
| `ZPLC_TASK_DEF_SIZE` | `16` | Expected size of task definition |
| `ZPLC_IOMAP_ENTRY_SIZE` | `8` | Expected size of I/O map entry |
| `ZPLC_TAG_ENTRY_SIZE` | `8` | Expected size of tag entry |

## `zplc_loader.h`

ZPLC Binary File Loader

Handles loading of .zplc files, parsing headers/segments, and registering tasks with the scheduler.

Source: `firmware/lib/zplc_core/include/zplc_loader.h`

### Functions

#### `zplc_loader_load`

```c
int zplc_loader_load(const uint8_t *data, size_t len);
```

**Source summary:** Load a ZPLC binary file from memory buffer.

This function parses the header, loads the code segment into VM memory, and registers any defined tasks with the scheduler.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `data` | `const uint8_t *` | Pointer to the file data |
| `len` | `size_t` | Length of the data in bytes |

**Source return value:** 0 on success, negative error code on failure

### Types

None.

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_FILE_MAGIC` | `0x5A504C43` | — |
| `ZPLC_SEGMENT_TYPE_CODE` | `1` | — |
| `ZPLC_SEGMENT_TYPE_TASK` | `2` | — |
| `ZPLC_LOADER_OK` | `0` | — |
| `ZPLC_LOADER_ERR_MAGIC` | `-1` | — |
| `ZPLC_LOADER_ERR_VERSION` | `-2` | — |
| `ZPLC_LOADER_ERR_SIZE` | `-3` | — |
| `ZPLC_LOADER_ERR_NO_CODE` | `-4` | — |
| `ZPLC_LOADER_ERR_MEMORY` | `-5` | — |

## `zplc_scheduler.h`

ZPLC Multitask Scheduler API

This header defines the API for the ZPLC multitask scheduler. The scheduler supports multiple PLC tasks with different intervals and priorities, following IEC 61131-3 task model. Architecture (Zephyr implementation): - Each task has a k_timer that fires at the configured interval - Timer callbacks submit work items to priority-based work queues - Work queue threads execute the actual PLC program cycles - Shared memory (IPI/OPI) is protected by a mutex

Source: `firmware/lib/zplc_core/include/zplc_scheduler.h`

### Functions

#### `zplc_sched_init`

```c
int zplc_sched_init(void);
```

**Source summary:** Initialize the scheduler.

Must be called before any other scheduler functions. Creates work queues and initializes synchronization primitives.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_shutdown`

```c
int zplc_sched_shutdown(void);
```

**Source summary:** Shutdown the scheduler.

Stops all tasks, releases resources.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_register_task`

```c
int zplc_sched_register_task(const zplc_task_def_t *def, const uint8_t *code, size_t code_size);
```

**Source summary:** Register a task with the scheduler.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `def` | `const zplc_task_def_t *` | Task definition (from .zplc file or manual config) |
| `code` | `const uint8_t *` | Pointer to bytecode for this task |
| `code_size` | `size_t` | Size of bytecode |

**Source return value:** Task handle (0-based index) on success, negative error code on failure

#### `zplc_sched_load`

```c
int zplc_sched_load(const uint8_t *binary, size_t size);
```

**Source summary:** Load a multi-task .zplc binary and register all tasks.

This is the preferred way to load multi-task PLC programs. It parses the .zplc file, loads the shared code segment, and registers each task defined in the TASK segment. The function internally uses zplc_core_load_tasks() to parse the binary and then configures VMs with appropriate entry points.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `binary` | `const uint8_t *` | Pointer to .zplc file contents |
| `size` | `size_t` | Size of binary data |

**Source return value:** Number of tasks loaded on success, negative error code on failure: -1: Scheduler not initialized -2: Invalid arguments -3: zplc_core_load_tasks() error (bad file format) -4: Task registration failed

#### `zplc_sched_unregister_task`

```c
int zplc_sched_unregister_task(int task_id);
```

**Source summary:** Unregister a task.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task_id` | `int` | Task handle returned by register_task |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_start`

```c
int zplc_sched_start(void);
```

**Source summary:** Start the scheduler.

Begins executing all registered tasks according to their intervals.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_stop`

```c
int zplc_sched_stop(void);
```

**Source summary:** Stop the scheduler.

Stops all tasks but keeps them registered.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_pause`

```c
int zplc_sched_pause(void);
```

**Source summary:** Pause the scheduler (for debugging).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_resume`

```c
int zplc_sched_resume(void);
```

**Source summary:** Resume the scheduler from pause.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_step`

```c
int zplc_sched_step(void);
```

**Source summary:** Execute exactly one cycle for each paused/ready task.

Used by the debugger when the scheduler is paused. Tasks remain paused after the stepped cycle unless a task enters error state.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_get_state`

```c
zplc_sched_state_t zplc_sched_get_state(void);
```

**Source summary:** Get scheduler state.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Current scheduler state

#### `zplc_sched_get_stats`

```c
int zplc_sched_get_stats(zplc_sched_stats_t *stats);
```

**Source summary:** Get scheduler statistics.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `stats` | `zplc_sched_stats_t *` | Pointer to stats structure to fill |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_get_task`

```c
int zplc_sched_get_task(int task_id, zplc_task_t *task);
```

**Source summary:** Get task information.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task_id` | `int` | Task handle |
| `task` | `zplc_task_t *` | Pointer to task structure to fill |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_get_task_count`

```c
int zplc_sched_get_task_count(void);
```

**Source summary:** Get task count.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** Number of registered tasks

#### `zplc_sched_get_vm_ptr`

```c
zplc_vm_t* zplc_sched_get_vm_ptr(int task_id);
```

**Source summary:** Get pointer to the VM instance for a task.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task_id` | `int` | Task handle |

**Source return value:** Pointer to VM instance, or NULL if task not found

#### `zplc_sched_lock`

```c
int zplc_sched_lock(int timeout_ms);
```

**Source summary:** Lock shared memory for exclusive access.

Call this before reading/writing IPI/OPI from outside task context. Must be paired with zplc_sched_unlock().

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `timeout_ms` | `int` | Maximum time to wait (-1 = forever, 0 = try) |

**Source return value:** 0 on success, -ETIMEDOUT on timeout, other negative on error

#### `zplc_sched_unlock`

```c
int zplc_sched_unlock(void);
```

**Source summary:** Unlock shared memory.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `zplc_task_state_t` | Enum | Task runtime state. |
| `cycle_count` | Struct | Task runtime statistics. |
| `config` | Struct | Task runtime instance. |
| `zplc_sched_state_t` | Enum | Scheduler runtime state. |
| `total_cycles` | Struct | Scheduler statistics. |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_MAX_TASKS` | `CONFIG_ZPLC_MAX_TASKS` | — |
| `ZPLC_MAX_TASKS` | `8` | — |
| `ZPLC_MIN_INTERVAL_US` | `100` | Minimum task interval in microseconds (100us) |
| `ZPLC_MAX_INTERVAL_US` | `3600000000UL` | Maximum task interval in microseconds (1 hour) |
