---
slug: /reference/runtime-api
id: runtime-api
title: Runtime API
sidebar_label: Runtime API
description: Generated reference for the public ZPLC runtime headers in ZPLC 2.0.
tags: [reference, runtime, generated]
---

# Runtime API

> [!IMPORTANT]
> This page is generated from the public C headers under `firmware/lib/zplc_core/include/`. Edit the headers or rerun `python3 tools/docs/generate_runtime_reference.py` instead of editing this file manually.

> The Spanish wrapper text is localized, while API names, signatures, and source-derived descriptions remain anchored to the English headers to avoid documentation drift.

## Source headers

- `firmware/lib/zplc_core/include/zplc_bytes.h`
- `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`
- `firmware/lib/zplc_core/include/zplc_core.h`
- `firmware/lib/zplc_core/include/zplc_crc32.h`
- `firmware/lib/zplc_core/include/zplc_debug.h`
- `firmware/lib/zplc_core/include/zplc_ed25519.h`
- `firmware/lib/zplc_core/include/zplc_exchange.h`
- `firmware/lib/zplc_core/include/zplc_hal.h`
- `firmware/lib/zplc_core/include/zplc_hal_posix.h`
- `firmware/lib/zplc_core/include/zplc_isa.h`
- `firmware/lib/zplc_core/include/zplc_loader.h`
- `firmware/lib/zplc_core/include/zplc_program_store.h`
- `firmware/lib/zplc_core/include/zplc_proto.h`
- `firmware/lib/zplc_core/include/zplc_proto_dev.h`
- `firmware/lib/zplc_core/include/zplc_retain.h`
- `firmware/lib/zplc_core/include/zplc_scheduler.h`
- `firmware/lib/zplc_core/include/zplc_sha256.h`
- `firmware/lib/zplc_core/include/zplc_sha512.h`

## `zplc_bytes.h`

Little-endian reads and writes of bytes, with no alignment assumption (RT-004, RT-032).

Every module of the runtime that reads or writes a multi-byte field of an artifact, a record or PLC memory uses these functions: they work at any address, on any byte order and on a core that traps on unaligned access. The host and the target share this one implementation.

Source: `firmware/lib/zplc_core/include/zplc_bytes.h`

### Functions

#### `zplc_get_u16_le`

```c
static inline uint16_t zplc_get_u16_le(const uint8_t *p);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `p` | `const uint8_t *` | — |

#### `zplc_get_u32_le`

```c
static inline uint32_t zplc_get_u32_le(const uint8_t *p);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `p` | `const uint8_t *` | — |

#### `zplc_put_u16_le`

```c
static inline void zplc_put_u16_le(uint8_t *p, uint16_t value);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `p` | `uint8_t *` | — |
| `value` | `uint16_t` | — |

#### `zplc_put_u32_le`

```c
static inline void zplc_put_u32_le(uint8_t *p, uint32_t value);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `p` | `uint8_t *` | — |
| `value` | `uint32_t` | — |

### Types

None.

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_BYTES_H` | `—` | — |

## `zplc_comm_dispatch.h`

zplc_comm_dispatch.h

Source: `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`

### Functions

#### `zplc_comm_fb_size`

```c
static inline uint16_t zplc_comm_fb_size(uint32_t kind);
```

**Source summary:** Instance size in bytes of a function block of the given kind.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `kind` | `uint32_t` | A zplc_comm_fb_kind_t value (any width, so that an operand read from the code segment can be passed unchecked). |

**Source return value:** The size from the generated table, or 0 for a kind with no layout.

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
int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len);
```

**Source summary:** Execute a communication FB instance (called by VM from OP_COMM_EXEC).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | The function-block kind |
| `fb_mem` | `uint8_t *` | The block; the caller has placed all of it in PLC memory |
| `fb_len` | `uint16_t` | Length of the block; refused (-1) when it is shorter than the handshake or than the size of the kind in the table |

**Source return value:** 0, or -1 when the block is refused

#### `zplc_comm_fb_reset`

```c
int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len);
```

**Source summary:** Reset a communication FB instance (called by VM from OP_COMM_RESET).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | The function-block kind |
| `fb_mem` | `uint8_t *` | The block; the caller has placed all of it in PLC memory |
| `fb_len` | `uint16_t` | Length of the block; refused (-1) as for zplc_comm_fb_exec() |

**Source return value:** 0, or -1 when the block is refused

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `zplc_comm_fb_kind_t` | Enum | Communication function block kind identifiers. |
| `zplc_comm_status_t` | Enum | Communication status codes written to FB.STATUS. |
| `zplc_comm_handler_t` | Typedef | Comm FB handler function type. |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_COMM_FB_HANDSHAKE_SIZE` | `8U` | Size in bytes of the handshake every communication block starts with (EN, BUSY, DONE, ERROR, STATUS). |

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

**Source notes:**
- This low-level API is for trusted embedders and does not verify bytecode. Product artifact-admission routes must use zplc_core_load or zplc_core_load_tasks; embedders must verify before supplying or modifying executable code.

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

#### `zplc_vm_run_bounded`

```c
int zplc_vm_run_bounded(zplc_vm_t *vm, uint32_t max_instructions);
```

**Source summary:** Run a VM with a mandatory logical instruction bound.

Unlike zplc_vm_run(), reaching the bound is a controlled VM watchdog fault. A NULL VM or zero bound is rejected without changing VM state.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | — |
| `max_instructions` | `uint32_t` | — |

**Source return value:** Number of instructions executed, or negative VM error code.

#### `zplc_vm_run_cycle`

```c
int zplc_vm_run_cycle(zplc_vm_t *vm);
```

**Source summary:** Run one complete PLC scan cycle.

Normally this starts a new scan: it resets PC to the entry point and executes with ZPLC_VM_CYCLE_INSTRUCTION_BUDGET. Exhausting that logical bound returns -ZPLC_VM_WATCHDOG; it is not a physical watchdog or a WCET guarantee. The exception is a scan that a breakpoint or OP_BREAK interrupted and that zplc_vm_resume() then resumed (scan_resumed is set, the VM is neither paused nor halted). That scan is continued, not restarted: PC, evaluation stack, call stack and locals stay as the pause left them, and the budget covers the whole scan, so the instructions spent before the pause still count. Breakpoints reached later in the remainder, or at the same PC in a later scan, pause again. If the VM is still paused (never resumed), the interrupted scan is abandoned and a new scan starts at the entry point. Process-image inputs are read live by the instructions, not latched per scan: whatever the caller writes to the input image while the scan is paused is seen by the rest of that scan.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Source return value:** Number of instructions executed by this call (only the remainder when a scan is continued), or negative error code. A non-negative result with zplc_vm_is_paused() true means the scan was interrupted, not completed.

#### `zplc_vm_reset_cycle`

```c
void zplc_vm_reset_cycle(zplc_vm_t *vm);
```

**Source summary:** Reset VM for a new cycle without full init.

Faster than zplc_vm_init() - only resets PC, SP, and status. It also abandons an interrupted scan: the continuation armed by zplc_vm_resume() is dropped, so the next zplc_vm_run_cycle() starts over. Breakpoints and the one-shot breakpoint skip are preserved.

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

Clears the paused flag so the next zplc_vm_step() continues execution, and arms a one-shot skip of the breakpoint at the current PC. If the VM was paused, the scan it interrupted is marked as resumed: the next zplc_vm_run_cycle() continues that scan from the preserved PC and stacks instead of restarting at the entry point (see zplc_vm_run_cycle()). Resuming a VM that is not paused arms only the breakpoint skip. The mark is dropped by zplc_vm_reset_cycle(), zplc_vm_set_entry(), zplc_vm_init() (and thus by a program load) and when the continued scan starts running.

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
int zplc_force_get(uint8_t index, uint16_t *addr, uint16_t *size, uint8_t *bytes, size_t bytes_capacity);
```

**Source summary:** Get a force entry by index.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `index` | `uint8_t` | Force table index |
| `addr` | `uint16_t *` | Output absolute address |
| `size` | `uint16_t *` | Output byte count |
| `bytes` | `uint8_t *` | Output buffer receiving the stored bytes, or NULL to query metadata only when @p bytes_capacity is zero |
| `bytes_capacity` | `size_t` | Capacity of @p bytes in bytes |

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

Initializes shared memory and default VM instance, and creates the process-image lock.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, -1 when the process-image lock could not be created. In that case the memory and the VM are initialised but the runtime must not start: external threads cannot be synchronised with the scan. A later call tries again.

#### `zplc_core_cold_start`

```c
void zplc_core_cold_start(void);
```

**Source summary:** Cold start: every variable of the program is initialised (RT-016).

IPI, OPI, WORK and RETAIN are set to zero and the force table is emptied. The CODE region and the tags are the program and are not touched. A program load is a cold start: zplc_core_load() and zplc_core_load_tasks() call this before they publish the new program, so a new program never starts on the variables of the one it replaced, on any runtime. A runtime that has a stored RETAIN record restores it after the load.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

#### `zplc_core_warm_start`

```c
void zplc_core_warm_start(void);
```

**Source summary:** Warm start: the retentive variables are kept and the rest is initialised (RT-016).

IPI, OPI and WORK are set to zero and the force table is emptied; RETAIN keeps its bytes. For a runtime that restarts the program it already holds, after a reset, with its retained values valid.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

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
int zplc_core_load(const uint8_t *binary, size_t size, uint8_t *workspace, size_t workspace_size);
```

**Source summary:** Load a .zplc binary program.

On success this replaces the loaded program and resets process/work/retain memory and forces to their safe initialized state before committing it. On rejection it leaves the current core state intact. The artifact must not overlap core-owned memory because the successful reset invalidates it.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `binary` | `const uint8_t *` | Pointer to .zplc file contents |
| `size` | `size_t` | Size of binary data |
| `workspace` | `uint8_t *` | Caller-owned verifier scratch |
| `workspace_size` | `size_t` | Size of @p workspace in bytes |

**Source return value:** 0 on success, ZPLC_LOADER_* error otherwise

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
int zplc_core_load_tasks(const uint8_t *binary, size_t size, zplc_task_def_t *tasks, uint8_t max_tasks, uint8_t *workspace, size_t workspace_size);
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
| `workspace` | `uint8_t *` | Caller-owned verifier scratch |
| `workspace_size` | `size_t` | Size of @p workspace in bytes |

**Source return value:** Number of tasks loaded, or a ZPLC_LOADER_* error code

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

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_VM_CYCLE_INSTRUCTION_BUDGET` | `CONFIG_ZPLC_VM_CYCLE_INSTRUCTION_BUDGET` | — |
| `ZPLC_VM_CYCLE_INSTRUCTION_BUDGET` | `100000U` | — |
| `ZPLC_FORCE_MAX_ENTRIES` | `8U` | Maximum number of independent forced ranges. |
| `ZPLC_FORCE_MAX_BYTES` | `260U` | Maximum byte length of one forced range. |

## `zplc_crc32.h`

The one CRC-32 of the runtime (RT-032).

CRC-32/ISO-HDLC: reflected polynomial 0xEDB88320, initial value 0xFFFFFFFF, final exclusive-or 0xFFFFFFFF. It is the CRC of the artifact container (zplc_loader.c), of the RETAIN records (zplc_retain.c) and of the records of the program store on the host and on the target. It is a bitwise loop with no table: a few bytes of code and no RAM, which is what a 16 KB core can afford, and the artifact it checks is small and read once per load.

Source: `firmware/lib/zplc_core/include/zplc_crc32.h`

### Functions

#### `zplc_crc32_update`

```c
static inline uint32_t zplc_crc32_update(uint32_t crc, const uint8_t *data, size_t length);
```

**Source summary:** Add bytes to a running CRC state.

Start from 0xFFFFFFFF and exclusive-or the result with 0xFFFFFFFF when the last byte is in. The state is the register itself, so one value can be carried across several calls.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `crc` | `uint32_t` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_crc32`

```c
static inline uint32_t zplc_crc32(const uint8_t *data, size_t length);
```

**Source summary:** CRC-32 of a buffer in one call.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

### Types

None.

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_CRC32_H` | `—` | — |

## `zplc_debug.h`

ZPLC Hardware-in-the-Loop Debug API

This header declares the debug output API for HIL (Hardware-in-the-Loop) testing. When enabled, the runtime outputs JSON-formatted trace information via the Zephyr shell for parsing by the HIL test framework. The debug output is runtime-controllable (not compile-time), allowing the same firmware to be used in production and testing modes. Protocol: Line-based JSON with CRLF terminators. See: specs/002-hil-testing/contracts/debug-protocol.md

Source: `firmware/lib/zplc_core/include/zplc_debug.h`

### Functions

#### `hil_set_sink`

```c
void hil_set_sink(hil_sink_fn sink, void *context);
```

**Source summary:** Set where the debug lines go; a NULL sink silences the output.

The portable core only formats lines. A target registers the sink that writes them (the Zephyr shell binding is hil_set_shell).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `sink` | `hil_sink_fn` | — |
| `context` | `void *` | — |

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

**Source summary:** Set the shell instance for debug output (Zephyr targets only).

Registers a sink that prints each line with shell_print. Must be called before any trace functions. Typically called by the `zplc hil mode` shell command. Defined in src/hal/zephyr/zplc_hil_debug_zephyr.c.

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
| `hil_sink_fn` | Typedef | Receives one finished JSON line, without a line terminator. |

### Constants and macros

None.

## `zplc_ed25519.h`

Ed25519 signature verification (RFC 8032), for the signed artifact of COM-026.

A device that holds a public key accepts a program only when its signature verifies under that key. This is verification only: it holds no secret, so it is neither constant-time nor does it need to be. It is the field arithmetic of TweetNaCl (16 limbs of 16 bits) with the checks of RFC 8032 (the point must decode, and the scalar of the signature must be below the order of the group), about 2 KB of stack and no table. Time: a verification is two scalar multiplications; on a Cortex-M0+ at 125 MHz it takes seconds, which a deploy can afford and a scan cannot: it runs in the command that commits a program, never in the scan.

Source: `firmware/lib/zplc_core/include/zplc_ed25519.h`

### Functions

#### `zplc_ed25519_verify`

```c
int zplc_ed25519_verify(const uint8_t signature[ZPLC_ED25519_SIGNATURE_BYTES], const uint8_t public_key[ZPLC_ED25519_PUBLIC_BYTES], const uint8_t *message, size_t length);
```

**Source summary:** Verify the signature of a message.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `const uint8_t signature[ZPLC_ED25519_SIGNATURE_BYTES]` | `—` | — |
| `const uint8_t public_key[ZPLC_ED25519_PUBLIC_BYTES]` | `—` | — |
| `message` | `const uint8_t *` | — |
| `length` | `size_t` | — |

**Source return value:** 0 when it is valid under the key, a negative number when it is not (or the key is not a point)

### Types

None.

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_ED25519_H` | `—` | — |
| `ZPLC_ED25519_PUBLIC_BYTES` | `32U` | — |
| `ZPLC_ED25519_SIGNATURE_BYTES` | `64U` | — |

## `zplc_exchange.h`

The exchange between the scan and everything outside it: a write queue and a published snapshot (RT-010, RT-011, RT-012).

Fieldbus servers, MQTT and the debug link run on their own threads. They must never see a value the scan is in the middle of writing, never change one in the middle of a scan, and never make the scan wait for them. The exchange gives them two things, and nothing else touches the live regions from outside the scan: - a READ comes from the snapshot: a copy of IPI, OPI, WORK and RETAIN that the scan publishes once per scan, at the output commit, and after every control-plane change of the memory (stop, load, force). A multi-byte value in the snapshot is whole: it was copied between scans, and the copy and every read are made under one short lock; - a WRITE is queued, whole, and applied by the scan at the input latch of its next scan, through the force-aware interface of the core (zplc_force_write_bytes): a forced variable keeps its forced value. While no scan is running (STOP, pause, fault) there is no latch to wait for, and the write is applied at once, under the lock of the image, and published. The lock of the exchange is held for a bounded copy and for nothing else: not across hardware I/O, not across a log line, not across the execution of a task. Lock order, everywhere: image lock (the scheduler's), then exchange lock. The exchange never takes the image lock while it holds its own.

Source: `firmware/lib/zplc_core/include/zplc_exchange.h`

### Functions

#### `zplc_exchange_init`

```c
int zplc_exchange_init(const zplc_exchange_hooks_t *hooks);
```

**Source summary:** Create the lock and empty the queue and the snapshot. Safe to call again: it resets.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `hooks` | `const zplc_exchange_hooks_t *` | — |

**Source return value:** 0, or ZPLC_EXCHANGE_ERR_LOCK when the lock could not be created.

#### `zplc_exchange_write`

```c
int zplc_exchange_write(uint16_t addr, const uint8_t *bytes, uint16_t size);
```

**Source summary:** Write PLC memory from outside the scan.

Queued for the next input latch while scans run; applied at once otherwise. The extent has to lie inside one region (see zplc_mem_extent.h); a write that does not is refused here and not later. A write is whole: it is queued with all its bytes or not at all.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `addr` | `uint16_t` | — |
| `bytes` | `const uint8_t *` | — |
| `size` | `uint16_t` | — |

**Source return value:** 0, ZPLC_EXCHANGE_ERR_RANGE, ZPLC_EXCHANGE_ERR_FULL or ZPLC_EXCHANGE_ERR_LOCK

#### `zplc_exchange_write_begin`

```c
int zplc_exchange_write_begin(size_t records, size_t bytes);
```

**Source summary:** Several writes that succeed or fail together (a Modbus write of several registers).

zplc_exchange_write_begin() reserves room for @p records writes of @p bytes bytes in all and takes the lock; zplc_exchange_write_add() queues one of them; zplc_exchange_write_end() releases the lock. A reservation that does not fit is refused with nothing queued, so the adds that follow cannot fail for lack of room. While no scan is running the adds apply at once (under the image lock the begin took).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `records` | `size_t` | — |
| `bytes` | `size_t` | — |

**Source return value:** begin: 0, ZPLC_EXCHANGE_ERR_FULL or ZPLC_EXCHANGE_ERR_LOCK; add: 0 or ZPLC_EXCHANGE_ERR_RANGE

#### `zplc_exchange_write_add`

```c
int zplc_exchange_write_add(uint16_t addr, const uint8_t *bytes, uint16_t size);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `addr` | `uint16_t` | — |
| `bytes` | `const uint8_t *` | — |
| `size` | `uint16_t` | — |

#### `zplc_exchange_write_end`

```c
void zplc_exchange_write_end(void);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

#### `zplc_exchange_read`

```c
int zplc_exchange_read(uint16_t addr, uint8_t *out, uint16_t size);
```

**Source summary:** Read PLC memory from the snapshot published at the last commit.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `addr` | `uint16_t` | — |
| `out` | `uint8_t *` | — |
| `size` | `uint16_t` | — |

**Source return value:** 0, ZPLC_EXCHANGE_ERR_RANGE or ZPLC_EXCHANGE_ERR_LOCK

#### `zplc_exchange_read_lock`

```c
int zplc_exchange_read_lock(void);
```

**Source summary:** Several reads of one publication (a Modbus read of several tags, an MQTT payload).

Between lock and unlock no scan publishes, so every read is of the same scan. Do not call zplc_exchange_read() or a write inside the pair.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

#### `zplc_exchange_read_locked`

```c
int zplc_exchange_read_locked(uint16_t addr, uint8_t *out, uint16_t size);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `addr` | `uint16_t` | — |
| `out` | `uint8_t *` | — |
| `size` | `uint16_t` | — |

#### `zplc_exchange_read_unlock`

```c
void zplc_exchange_read_unlock(void);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

#### `zplc_exchange_latch`

```c
size_t zplc_exchange_latch(void);
```

**Source summary:** The scan's input latch: apply every queued write, in order, through the force-aware interface.

Called by the scan with the image lock held, before the inputs of the cycle are written.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** number of writes applied

#### `zplc_exchange_publish`

```c
void zplc_exchange_publish(void);
```

**Source summary:** Publish the live regions as the snapshot. Called with the image lock held, at the output commit and after a control-plane change of the memory.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

#### `zplc_exchange_get_stats`

```c
void zplc_exchange_get_stats(zplc_exchange_stats_t *stats);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `stats` | `zplc_exchange_stats_t *` | — |

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `lock_image` | Struct | What the scheduler lends the exchange. All three are optional. |
| `latched` | Struct | Writes applied at a latch, writes applied at once, and writes refused for lack of room, since init. |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_EXCHANGE_H` | `—` | — |

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

**Source return value:** ZPLC_HAL_OK on success, ZPLC_HAL_COMMIT_UNKNOWN when a visible mutation could not be confirmed durable, error code otherwise.

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

**Source return value:** ZPLC_HAL_OK on success, ZPLC_HAL_NOT_IMPL if key not found, ZPLC_HAL_CORRUPT if an existing record is structurally invalid, error code otherwise.

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

#### `zplc_hal_mutex_destroy`

```c
zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex);
```

**Source summary:** Destroy a mutex and release its resources.

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

#### `zplc_io_table`

```c
const zplc_io_table_t *zplc_io_table(void);
```

**Source summary:** The board's I/O table (never NULL; it may list no channel).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source notes:**
- Platform implementations: - Zephyr: generated at build time from the board description - POSIX, WASM: an empty table; the host runtime exchanges the image with Studio, not with pins

#### `zplc_io_channel_count`

```c
size_t zplc_io_channel_count(void);
```

**Source summary:** Number of channels of the board.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

#### `zplc_io_channel_at`

```c
const zplc_io_channel_t *zplc_io_channel_at(size_t index);
```

**Source summary:** Channel `index` of the table, or NULL past the end.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `index` | `size_t` | — |

#### `zplc_io_read_channel`

```c
zplc_hal_result_t zplc_io_read_channel(const zplc_io_channel_t *channel, uint16_t *value);
```

**Source summary:** Read one physical input channel through the HAL.

A digital channel reads 0 or 1, an analog one the raw converter value.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `channel` | `const zplc_io_channel_t *` | — |
| `value` | `uint16_t *` | — |

**Source return value:** ZPLC_HAL_OK, ZPLC_HAL_NOT_IMPL when the channel is not available on this build (an optional channel without its devicetree node), or an error.

#### `zplc_io_write_channel`

```c
zplc_hal_result_t zplc_io_write_channel(const zplc_io_channel_t *channel, uint16_t value);
```

**Source summary:** Write one physical digital output channel through the HAL.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `channel` | `const zplc_io_channel_t *` | — |
| `value` | `uint16_t` | — |

#### `zplc_io_image_get`

```c
uint16_t zplc_io_image_get(const uint8_t *image, size_t size, const zplc_io_channel_t *channel);
```

**Source summary:** The value of a channel in an image buffer (a digital channel is 0 or 1).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `image` | `const uint8_t *` | — |
| `size` | `size_t` | — |
| `channel` | `const zplc_io_channel_t *` | — |

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
| `zplc_io_kind_t` | Enum | Kind of an I/O channel. |
| `zplc_io_dir_t` | Enum | Direction of an I/O channel, seen from the program. |
| `id` | Struct | One channel of the board description. |
| `board_id` | Struct | The whole description of a board, as built. |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_IO_MAX_CHANNELS` | `64U` | The most channels a board description may list. |

## `zplc_hal_posix.h`

POSIX-only logical clock seam for deterministic host scenarios.

The override is process-global because the native POSIX simulator currently owns one VM/session on one thread. If concurrent sessions are introduced, move this clock into the VM/session context rather than adding locking here.

Source: `firmware/lib/zplc_core/include/zplc_hal_posix.h`

### Functions

#### `zplc_hal_posix_set_tick_override`

```c
void zplc_hal_posix_set_tick_override(uint32_t tick_ms);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `tick_ms` | `uint32_t` | — |

#### `zplc_hal_posix_clear_tick_override`

```c
void zplc_hal_posix_clear_tick_override(void);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

### Types

None.

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_HAL_POSIX_H` | `—` | — |

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
| `build_id` | Struct | Build identity, the payload of the BUILD segment (4 bytes). |
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
| `ZPLC_DRAFT_COUNTER` | `4U` | Draft contract counter (CMP-052). |
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
| `ZPLC_SYS_FLAG_WDG_WARN` | `0x02` | Reserved system flag; not produced by current runtimes. |
| `ZPLC_SYS_FLAG_RUNNING` | `0x04` | System flags: Scheduler is running |
| `ZPLC_STRING_LEN_OFFSET` | `0` | STRING memory layout. |
| `ZPLC_STRING_CAP_OFFSET` | `2` | — |
| `ZPLC_STRING_DATA_OFFSET` | `4` | — |
| `ZPLC_STRING_DEFAULT_SIZE` | `80` | — |
| `ZPLC_STRING_MAX_SIZE` | `255` | — |
| `ZPLC_OPCODE_COUNT` | `112` | Number of defined opcodes. |
| `ZPLC_FILE_HEADER_SIZE` | `32` | Expected size of file header |
| `ZPLC_SEGMENT_ENTRY_SIZE` | `8` | Expected size of segment entry |
| `ZPLC_TASK_DEF_SIZE` | `16` | Expected size of task definition |
| `ZPLC_BUILD_ENTRY_SIZE` | `4` | Expected size of the build identity |
| `ZPLC_IOMAP_ENTRY_SIZE` | `8` | Expected size of I/O map entry |
| `ZPLC_TAG_ENTRY_SIZE` | `8` | Expected size of tag entry |

## `zplc_loader.h`

ZPLC Binary File Loader

Verifies the structural and bytecode integrity of .zplc files without changing runtime state. The current v1 subset accepts flags=0 and CODE, TASK, TAGS and BUILD segments only. The returned view borrows the input buffer.

Source: `firmware/lib/zplc_core/include/zplc_loader.h`

### Functions

#### `zplc_loader_verify`

```c
int zplc_loader_verify(const uint8_t *data, size_t len, uint8_t *workspace, size_t workspace_size, zplc_program_view_t *out);
```

**Source summary:** Verify the supported structural and semantic v1 ZPLC subset.

Besides the structure of the file, the code is verified statically: every jump lands on an instruction, every direct memory access and every block of a communication opcode at a statically known address lies inside the regions of PLC memory (ZPLC_LOADER_ERR_MEMORY, ZPLC_LOADER_ERR_COMM), and no path from an entry point (the header's, and each task's) can underflow the evaluation stack or exceed the depth the task declares (ZPLC_LOADER_ERR_STACK). The stack check follows every path, joins the depths where paths meet, and treats a call by the effect of the callee on the stack; it refuses what it cannot prove, among it recursion, and what takes more work to prove than its bound (see ZPLC_VERIFY_STEPS_PER_BYTE). Calls nested deeper than the call stack of the VM (ZPLC_CALL_STACK_MAX, 32 by default) are refused with ZPLC_LOADER_ERR_STACK as well: the run would end in the VM fault CALL_OVERFLOW. This does not load or authorize a runtime. Product load paths remain a separate integration gate.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `data` | `const uint8_t *` | Pointer to the file data |
| `len` | `size_t` | Length of the data in bytes |
| `workspace` | `uint8_t *` | Caller-owned transient scratch of at least ZPLC_LOADER_VERIFY_WORKSPACE_SIZE bytes |
| `workspace_size` | `size_t` | Size of @p workspace in bytes |
| `out` | `zplc_program_view_t *` | Destination for the verified view; untouched on failure |

**Source return value:** 0 on success, negative error code on failure. The view remains valid only while @p data remains valid.

#### `zplc_loader_artifact_draft_counter`

```c
uint32_t zplc_loader_artifact_draft_counter(const uint8_t *data, size_t len);
```

**Source summary:** Draft contract counter recorded in an artifact header (CMP-052).

Reads header word 28 and nothing else. The magic, the CRC and the rest of the artifact are not checked, so a caller can show the number of an artifact that zplc_loader_verify() refused with ZPLC_LOADER_ERR_DRAFT ("built for draft N, this runtime is draft ZPLC_DRAFT_COUNTER").

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `data` | `const uint8_t *` | Pointer to the file data, may be NULL |
| `len` | `size_t` | Length of the data in bytes |

**Source return value:** The counter, or 0 when @p data is NULL or shorter than a header. 0 is also what an artifact built before the counter carries.

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `type` | Struct | — |
| `binary` | Struct | — |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_LOADER_OK` | `0` | Verified |
| `ZPLC_LOADER_ERR_MAGIC` | `-1` | Wrong magic number |
| `ZPLC_LOADER_ERR_VERSION` | `-2` | ISA version differs from the loader version |
| `ZPLC_LOADER_ERR_SIZE` | `-3` | A size or count field is inconsistent with the file, or a reserved word is not zero |
| `ZPLC_LOADER_ERR_NO_CODE` | `-4` | No CODE segment |
| `ZPLC_LOADER_ERR_CRC32` | `-6` | CRC32 mismatch |
| `ZPLC_LOADER_ERR_FLAGS` | `-7` | Header flags are not supported |
| `ZPLC_LOADER_ERR_SEGMENT` | `-8` | Segment table entry is invalid, repeated or of an unsupported type |
| `ZPLC_LOADER_ERR_ENTRY_POINT` | `-9` | Entry point is not an instruction boundary |
| `ZPLC_LOADER_ERR_WORKSPACE` | `-10` | Verifier workspace is missing or too small |
| `ZPLC_LOADER_ERR_OPCODE` | `-11` | Unknown opcode or truncated instruction |
| `ZPLC_LOADER_ERR_CONTROL_FLOW` | `-12` | Jump target is not an instruction boundary, or the code falls through its end |
| `ZPLC_LOADER_ERR_MEMORY` | `-13` | Static memory access outside the writable regions |
| `ZPLC_LOADER_ERR_TASK` | `-14` | Task definition is invalid or there are too many tasks |
| `ZPLC_LOADER_ERR_TAGS` | `-15` | Tag entry is invalid |
| `ZPLC_LOADER_ERR_COMM` | `-16` | Communication function-block kind is NONE or at or above the kind limit, or a block at a statically known address does not fit one memory region |
| `ZPLC_LOADER_ERR_DRAFT` | `-17` | Draft contract counter of the artifact differs from the loader's, or the artifact has none |
| `ZPLC_LOADER_ERR_STACK` | `-18` | The evaluation stack can underflow, or exceed the depth the task declares, on some path, or the verifier cannot prove that it cannot |
| `ZPLC_LOADER_MAX_TASKS` | `16U` | — |
| `ZPLC_VERIFY_MAX_DEPTH` | `127` | — |
| `ZPLC_VERIFY_FRAME_BYTES` | `7U` | — |
| `ZPLC_VERIFY_STEPS_PER_BYTE` | `64U` | — |
| `ZPLC_LOADER_VERIFY_WORKSPACE_SIZE` | `\\ (((ZPLC_MEM_CODE_SIZE + 7U) / 8U) + \\ 2U * ((ZPLC_MEM_CODE_SIZE + 127U) / 128U) + \\ 2U * ZPLC_VERIFY_MAX_LEADERS + (ZPLC_VERIFY_MAX_LEADERS + 7U) / 8U + \\ ZPLC_VERIFY_MAX_FRAMES * ZPLC_VERIFY_FRAME_BYTES)` | — |

## `zplc_program_store.h`

The durable store of the admitted program: two slots, one active pointer (RT-028, RT-031, RT-032).

One implementation (zplc_pstore_commit, zplc_pstore_restore), used by the firmware (firmware/app/src/program_store.c) and by the host runtime (firmware/apps/posix_host/src/native_program_store.c). It sits on the HAL persistence calls, so it runs on NVS on a board and on files on the host, and it holds no state of its own: the caller supplies the buffers and serialises the calls. What is stored -------------- Two slots, A and B. A slot is a payload (the artifact, then an 8 byte footer "ZPE1" + length) and a 32 byte metadata record. A 16 byte active record names the slot that holds the program to run and its generation. All records carry a CRC-32 and the format version of the runtime. key                              content program_v1_slot_a_payload        payload of slot A, chunk 0 program_v1_slot_a_payload_N      chunk N (1, 2, ...) of the payload of slot A, when it is longer than one chunk program_v1_slot_a_meta           "ZPS1", slot, state (1 prepared, 2 committed), generation, length, header CRC (the same three for slot B) program_v1_active                "ZPA1", slot, generation code_len, code                   the single-key program of the first firmware, read and migrated, never written A payload is cut into chunks of ZPLC_PROGRAM_STORE_CHUNK_SIZE bytes, each stored under its own key, because a flash key-value store keeps an entry inside one erase sector (RT-028: an artifact as large as the code region, 45056 bytes by default, does not fit one 4 KB sector). A payload of at most one chunk is one key, which is exactly the layout of the first version of the store: a store written by it is read as it is. The commit ---------- The new program is written to the slot that is not active, read back and verified; its metadata is written as PREPARED and read back; then the active record is written, which is the single point at which the new program becomes the one to restore; last the metadata is rewritten as COMMITTED (best effort). A power cut at any step leaves the previous program restorable or the new one complete: - before the active record: restore finds the previous program through the active record, or, if that record is damaged, through the newest COMMITTED slot; - a half-written slot (some chunks new, some old) is never accepted: its metadata still describes the old program, the header CRC and the footer of the payload then disagree with it, and the artifact fails its own CRC-32 and the admission check; - a PREPARED slot that the active record does not name is not a program; - an active record that names a PREPARED slot is a deploy whose last metadata write was lost: the slot is complete (it was read back) and is restored. The first commit of a store that has never held a program can be interrupted too: nothing was published, and restore reports ZPLC_PROGRAM_STORE_EMPTY. Records that exist and verify as nothing are never mistaken for an empty store: restore reports ZPLC_PROGRAM_STORE_UNVERIFIABLE and commit refuses to write over them.

Source: `firmware/lib/zplc_core/include/zplc_program_store.h`

### Functions

#### `zplc_pstore_commit`

```c
int zplc_pstore_commit(const zplc_pstore_config_t *config, uint8_t *workspace, size_t program_size, size_t workspace_capacity);
```

**Source summary:** Make an admitted artifact the program to restore.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `config` | `const zplc_pstore_config_t *` | — |
| `workspace` | `uint8_t *` | the artifact in its first @p program_size bytes, with at least ZPLC_PROGRAM_STORE_FOOTER_SIZE bytes after it; the store writes the footer and uses the buffer to read the payload back, so its content is not preserved |
| `program_size` | `size_t` | 1 .. ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE |
| `workspace_capacity` | `size_t` | bytes the buffer holds |

**Source return value:** ZPLC_PROGRAM_STORE_COMMIT_OK, _ERROR (nothing was published), or _UNKNOWN

#### `zplc_pstore_restore`

```c
zplc_program_store_restore_t zplc_pstore_restore( const zplc_pstore_config_t *config, uint8_t *workspace, size_t workspace_capacity, size_t *program_size);
```

**Source summary:** Find the program to run after a reset.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `config` | `const zplc_pstore_config_t *` | — |
| `workspace` | `uint8_t *` | receives the artifact; needs room for the footer after it |
| `workspace_capacity` | `size_t` | bytes the buffer holds (an artifact of the largest size needs ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE) |
| `program_size` | `size_t *` | receives the artifact length when the result is OK or LEGACY, otherwise 0 |

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `zplc_program_store_restore_t` | Enum | — |
| `zplc_program_store_commit_result_t` | Enum | — |
| `zplc_pstore_admit_fn` | Typedef | Decides whether an artifact may be run: the loader's verification and the policy of the runtime. |
| `admit` | Struct | What the store needs from the runtime that uses it. |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_CORE_PROGRAM_STORE_H` | `—` | — |
| `ZPLC_PROGRAM_STORE_FOOTER_SIZE` | `8U` | Bytes after the artifact in a payload: "ZPE1" and the artifact length. |
| `ZPLC_PROGRAM_STORE_MAX_CHUNKS` | `\\ ((ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE + \\ ZPLC_PROGRAM_STORE_CHUNK_SIZE - 1U) / \\ ZPLC_PROGRAM_STORE_CHUNK_SIZE)` | Keys a payload of the largest artifact is stored under, per slot. |
| `ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD` | `64U` | Backend bytes one stored entry takes beyond its data: the entry header and the padding to the write block. An engineering estimate used by the build-time capacity rule of the Zephyr HAL. |
| `ZPLC_PROGRAM_STORE_WORST_CASE_BYTES` | `\\ (2U * ((size_t)ZPLC_PROGRAM_STORE_MAX_CHUNKS * \\ (ZPLC_PROGRAM_STORE_CHUNK_SIZE + ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD)) +\\ 3U * (32U + ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD))` | Storage, in bytes, the two slots of the largest artifact and their records take, worst case. |
| `ZPLC_PROGRAM_STORE_KEY_MAX` | `40U` | The longest key the store uses, with its terminator. |

## `zplc_proto.h`

The codec of the device link protocol: frames, and a decoder that finds them in a byte stream (COM-019).

A frame is a header (sync, version, flags, message, sequence, length), a payload, an optional 32-byte message authentication code and a CRC-32. The numbers and layouts are in zplc_proto_defs.h, generated from tools/contract/protocol.json; the rules (what a decoder discards and counts) are written there too, and the TypeScript codec of Studio follows the same rules. Both run the same generated frames (zplc_proto_vectors.h). Portable C99: no Zephyr header, no allocation, no clock. A decoder owns one buffer of ZPLC_PROTO_FRAME_MAX bytes.

Source: `firmware/lib/zplc_core/include/zplc_proto.h`

### Functions

#### `zplc_proto_frame_size`

```c
static inline size_t zplc_proto_frame_size(size_t length, int authenticated);
```

**Source summary:** Bytes of a frame with a payload of @p length bytes.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `length` | `size_t` | — |
| `authenticated` | `int` | — |

#### `zplc_proto_write_header`

```c
size_t zplc_proto_write_header(uint8_t *out, uint8_t kind, uint8_t message, uint32_t sequence, uint16_t length, int authenticated);
```

**Source summary:** Write the header of a frame whose payload is already at out + ZPLC_PROTO_HEADER_BYTES.

For a sender that builds the payload in place. Returns the number of header bytes.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `out` | `uint8_t *` | — |
| `kind` | `uint8_t` | — |
| `message` | `uint8_t` | — |
| `sequence` | `uint32_t` | — |
| `length` | `uint16_t` | — |
| `authenticated` | `int` | — |

#### `zplc_proto_begin`

```c
size_t zplc_proto_begin(uint8_t *out, size_t capacity, uint8_t kind, uint8_t message, uint32_t sequence, const uint8_t *payload, uint16_t length, int authenticated);
```

**Source summary:** Write the header and the payload of a frame.

The caller computes the code over the returned bytes and hands it to zplc_proto_finish().

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `out` | `uint8_t *` | — |
| `capacity` | `size_t` | — |
| `kind` | `uint8_t` | — |
| `message` | `uint8_t` | — |
| `sequence` | `uint32_t` | — |
| `payload` | `const uint8_t *` | — |
| `length` | `uint16_t` | — |
| `authenticated` | `int` | — |

**Source return value:** bytes used (the header and the payload), or 0 when @p capacity cannot hold the whole frame (with the code, when @p authenticated) or @p length is above ZPLC_PROTO_PAYLOAD_MAX_HARD.

#### `zplc_proto_finish`

```c
size_t zplc_proto_finish(uint8_t *out, size_t used, const uint8_t *mac);
```

**Source summary:** Append the code (when the frame was begun authenticated) and the checksum.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `out` | `uint8_t *` | — |
| `used` | `size_t` | bytes zplc_proto_begin() returned |
| `mac` | `const uint8_t *` | ZPLC_PROTO_MAC_BYTES bytes for an authenticated frame, NULL otherwise |

**Source return value:** the size of the whole frame

#### `zplc_proto_encode`

```c
size_t zplc_proto_encode(uint8_t *out, size_t capacity, uint8_t kind, uint8_t message, uint32_t sequence, const uint8_t *payload, uint16_t length);
```

**Source summary:** A frame without a code in one call; returns its size, or 0 when it does not fit.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `out` | `uint8_t *` | — |
| `capacity` | `size_t` | — |
| `kind` | `uint8_t` | — |
| `message` | `uint8_t` | — |
| `sequence` | `uint32_t` | — |
| `payload` | `const uint8_t *` | — |
| `length` | `uint16_t` | — |

#### `zplc_proto_parse`

```c
int zplc_proto_parse(const uint8_t *data, size_t length, size_t payload_max, zplc_proto_frame_t *frame);
```

**Source summary:** Check and open one whole frame (a transport that frames its own lines).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |
| `payload_max` | `size_t` | — |
| `frame` | `zplc_proto_frame_t *` | — |

**Source return value:** 0 and @p frame filled, or a ZPLC_PROTO_PARSE_* code

#### `zplc_proto_decoder_init`

```c
void zplc_proto_decoder_init(zplc_proto_decoder_t *decoder, size_t payload_max);
```

**Source summary:** Start a decoder. @p payload_max is the limit of this link (at most ZPLC_PROTO_PAYLOAD_MAX).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `decoder` | `zplc_proto_decoder_t *` | — |
| `payload_max` | `size_t` | — |

#### `zplc_proto_decoder_reset`

```c
void zplc_proto_decoder_reset(zplc_proto_decoder_t *decoder);
```

**Source summary:** Forget the bytes of a frame that is being assembled (a link that was reopened). Counters stay.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `decoder` | `zplc_proto_decoder_t *` | — |

#### `zplc_proto_decoder_feed`

```c
void zplc_proto_decoder_feed(zplc_proto_decoder_t *decoder, const uint8_t *data, size_t length, zplc_proto_frame_fn on_frame, void *context);
```

**Source summary:** Take bytes from the stream.

Discards noise, assembles candidates and calls @p on_frame for each frame whose header and checksum are valid, in order. A candidate that is not valid costs its first byte and the decoder looks for the next sync pair among the bytes it holds, so a frame inside a damaged one is delivered and a damaged frame costs nothing after itself. The work per input byte is bounded by ZPLC_PROTO_FRAME_MAX.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `decoder` | `zplc_proto_decoder_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |
| `on_frame` | `zplc_proto_frame_fn` | — |
| `context` | `void *` | — |

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `kind` | Struct | A frame that passed the checks of the codec. The pointers point into the buffer that was parsed. |
| `frames` | Struct | What a decoder discarded, and why. Counted since init. |
| `ZPLC_PROTO_FRAME_MAX` | Struct | — |
| `zplc_proto_frame_fn` | Typedef | Called once for each valid frame. The frame is valid until the callback returns. |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_PROTO_H` | `—` | — |
| `ZPLC_PROTO_PAYLOAD_MAX_CONFIGURED` | `CONFIG_ZPLC_PROTO_PAYLOAD_MAX` | — |
| `ZPLC_PROTO_PAYLOAD_MAX_CONFIGURED` | `ZPLC_PROTO_PAYLOAD_MAX_DEFAULT` | — |
| `ZPLC_PROTO_FRAME_MAX` | `\\ (ZPLC_PROTO_HEADER_BYTES + ZPLC_PROTO_PAYLOAD_MAX + ZPLC_PROTO_MAC_BYTES + ZPLC_PROTO_CRC_BYTES)` | Bytes of the largest frame: header, payload, code and checksum. |

## `zplc_proto_dev.h`

The device side of the device link protocol: sessions, authenticated frames, atomic writes, events (COM-020, COM-021, COM-023, COM-025, COM-028).

The engine takes frames from one or more links (a UART, a USB serial port, a TCP connection), answers them, and turns them into calls of the port it was given (zplc_proto_ops_t). It knows nothing of Zephyr, of the scheduler or of the host runtime: a port fills the table, so the same engine runs on a board, on the host runtime and in the tests, and the rules below are proved once. The rules: - Everything that changes the device (download, RUN/STOP, memory write, force, configuration, credentials, the key) needs a session that is open on the link it arrives on. One session is open at a time. A session ends when its client closes it, when nothing arrives for the idle time, when the link is lost, when a person at the serial link takes it over, and when the key is changed. The forces the session set end with it and the outputs follow the program again. - A link is SERIAL (whoever holds the cable holds the device) or NETWORK. On a network link every message except HELLO, IDENTITY, CHALLENGE and LINK_STATS needs a session that was opened with a code under the key that was provisioned over the serial link, and every frame of that session carries a code (HMAC-SHA-256) that covers its header, its payload and so its sequence number. A frame with a wrong or missing code, a repeated sequence number or one that is not the next, is dropped, counted and not answered. - A write of a multi-byte value goes through ops->mem_write, which a port binds to the write queue of the exchange: it is applied at the input latch of the next scan, whole. - The engine is called from one thread at a time (the port serialises it); zplc_proto_log() and zplc_proto_event_post() may be called from any thread when the port gives the event try-lock. - Nothing the engine does is on the scan: it has no hook in the scheduler. Telemetry is read by the engine's own service call, from a low priority context, and a queue that is full drops and counts. Portable C99: no Zephyr header, no allocation.

Source: `firmware/lib/zplc_core/include/zplc_proto_dev.h`

### Functions

#### `zplc_proto_dev_init`

```c
int zplc_proto_dev_init(zplc_proto_dev_t *dev, const zplc_proto_ops_t *ops, uint16_t idle_timeout_s);
```

**Source summary:** Start the engine over a port.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `ops` | `const zplc_proto_ops_t *` | — |
| `idle_timeout_s` | `uint16_t` | — |

**Source return value:** 0, or -1 when the port has no clock

#### `zplc_proto_link_init`

```c
void zplc_proto_link_init(zplc_proto_link_t *link, zplc_proto_dev_t *dev, uint8_t transport, zplc_proto_write_fn write, void *write_context);
```

**Source summary:** Attach a link. `write` is called once per frame.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `link` | `zplc_proto_link_t *` | — |
| `dev` | `zplc_proto_dev_t *` | — |
| `transport` | `uint8_t` | — |
| `write` | `zplc_proto_write_fn` | — |
| `write_context` | `void *` | — |

#### `zplc_proto_link_feed`

```c
void zplc_proto_link_feed(zplc_proto_link_t *link, const uint8_t *data, size_t length);
```

**Source summary:** Bytes that arrived on a stream link.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `link` | `zplc_proto_link_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_proto_link_feed_frame`

```c
int zplc_proto_link_feed_frame(zplc_proto_link_t *link, uint8_t *frame, size_t length);
```

**Source summary:** One whole frame that arrived on a link that frames its own lines.

The payload of a KEY_SET frame is overwritten once it has been used: the caller's buffer does not keep a key.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `link` | `zplc_proto_link_t *` | — |
| `frame` | `uint8_t *` | — |
| `length` | `size_t` | — |

**Source return value:** 0 when the frame was valid and handled (a refusal is a valid frame), or a ZPLC_PROTO_PARSE_* code

#### `zplc_proto_link_lost`

```c
void zplc_proto_link_lost(zplc_proto_link_t *link);
```

**Source summary:** The link is gone: its session ends, its forces are released.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `link` | `zplc_proto_link_t *` | — |

#### `zplc_proto_dev_service`

```c
void zplc_proto_dev_service(zplc_proto_dev_t *dev, zplc_proto_link_t *const *links, size_t link_count);
```

**Source summary:** Time passes: idle timeouts, telemetry produced from the runtime's status, watch batches, and the events in the queue sent to the links that asked for them.

Call it about every 20 ms from a context that is not the scan. @p links is an array of @p link_count links.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `links` | `zplc_proto_link_t *const *` | — |
| `link_count` | `size_t` | — |

#### `zplc_proto_event_post`

```c
int zplc_proto_event_post(zplc_proto_dev_t *dev, uint8_t id, const uint8_t *data, size_t length);
```

**Source summary:** Queue an event. Returns 0, or -1 when it was dropped (and counted). Callable from any thread.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `id` | `uint8_t` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_proto_log`

```c
void zplc_proto_log(zplc_proto_dev_t *dev, uint8_t level, const char *text);
```

**Source summary:** Queue a log line (cut to fit). Callable from any thread.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `level` | `uint8_t` | — |
| `text` | `const char *` | — |

#### `zplc_proto_session_is_open`

```c
int zplc_proto_session_is_open(const zplc_proto_dev_t *dev);
```

**Source summary:** Whether a session is open (a port uses it to apply the same rule to its own commands).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `dev` | `const zplc_proto_dev_t *` | — |

#### `zplc_proto_session_end`

```c
void zplc_proto_session_end(zplc_proto_dev_t *dev, uint8_t reason);
```

**Source summary:** End the session now (a port that must, for example before a reboot).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `reason` | `uint8_t` | — |

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `state` | Struct | What the port tells about the runtime. The engine compares successive values to produce events. |
| `abi_major` | Struct | — |
| `loaded` | Struct | — |
| `address` | Struct | One extent of a batched read. |
| `context` | Struct | What a port gives the engine. Every call returns 0, or a ZPLC_PROTO_ERR_* number that the engine sends as the status of the response. A member that is NULL means the capability is not there: the engine clears its bit in the hello and answers ERR_UNSUPPORTED. |
| `zplc_proto_dev_t` | Struct | — |
| `zplc_proto_link_t` | Struct | — |
| `zplc_proto_write_fn` | Typedef | Send one whole frame; returns 0 when it was handed to the transport. |
| `frames_in` | Struct | The counters of one link (the LINK_STATS message). |
| `id` | Struct | — |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_PROTO_DEV_H` | `—` | — |
| `ZPLC_PROTO_OWNED_FORCES` | `8U` | Forces one session can own (the force table of the core has this many entries). |

## `zplc_retain.h`

Persistence of the RETAIN region across power cycles (RT-025, RT-026, RT-027).

Portable C99: no operating-system header. The module reads and writes the RETAIN region through the pointer the caller gives to zplc_retain_init() and stores records only through the HAL persistence API (zplc_hal_persist_*), so the POSIX host, the WASM runtime and the Zephyr firmware apply the same rules. ## Record A record is one little-endian byte string. It is stored under two alternating slots, "a" and "b", and every slot is cut into fixed-size chunks so that a backend with a small maximum entry (Zephyr NVS on a 4 KB sector) can hold it: key = "retain_" + ('a' | 'b') + chunk number ('0'..'7'), for example "retain_a0" offset  size  field 0     4  magic "ZRTN" (bytes 5A 52 54 4E) 4     2  format version (ZPLC_RETAIN_FORMAT_VERSION) 6     2  reserved, zero 8     4  sequence number, monotonic, never 0 12     4  program identity: CRC32 word of the artifact header (byte 12) 16     4  program identity: code size word of the artifact header (byte 16) 20     4  layout hash (see below) 24     4  payload length in bytes (the size of the RETAIN region) 28     n  payload: the RETAIN region bytes 28+n     4  CRC-32 (IEEE 802.3, as in the artifact header) of bytes 0 .. 28+n-1 ## Layout hash CRC-32 over these 24 bytes, little-endian: 0  u32  RETAIN region size in bytes (the runtime value, not the maximum) 4  u32  ZPLC_MEM_RETAIN_BASE 8  u16  ZPLC_VERSION_MAJOR 10  u16  ZPLC_VERSION_MINOR 12  u32  ZPLC_DRAFT_COUNTER 16  u32  program identity, CRC32 word 20  u32  program identity, code size word The region size and the address of the region decide where a retained value lives; the version and the draft counter decide what the program image means; the program identity decides which program wrote the values. Any change of one of them makes a stored record unusable. ## Rules - save writes the OLDER slot with sequence = newest + 1, so a power cut during a save never destroys the last good record; - restore picks the valid record with the highest sequence whose identity and layout match, and otherwise initialises (zeroes) the region and keeps the reason; - a periodic save is skipped when the region did not change since the last record and when the minimum interval has not passed (flash wear, RT-026); - a slot the backend cannot read counts as a damaged record, and the next save rewrites it; when the backend fails on both slots nothing can be decided: the reason is io_error and saves are refused until a restore reads the backend again. The module is not re-entrant. The caller serialises its calls, and gives lock hooks that make the copy of the region coherent with the scan; the hooks are never held across a HAL call (RT-012).

Source: `firmware/lib/zplc_core/include/zplc_retain.h`

### Functions

#### `zplc_retain_init`

```c
int zplc_retain_init(const zplc_retain_config_t *config);
```

**Source summary:** Reset the module and set its region, hooks and minimum interval.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `config` | `const zplc_retain_config_t *` | — |

**Source return value:** 0 on success, -1 on a NULL region, a size of 0 or above the capacity.

#### `zplc_retain_identity_from_artifact`

```c
int zplc_retain_identity_from_artifact(const uint8_t *artifact, size_t size, zplc_retain_identity_t *out);
```

**Source summary:** Read the program identity from a .zplc artifact header.

Reads the magic, the CRC word and the code size word; the loader verified the rest. @return 0 on success, -1 when the buffer is too short or has no magic.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `artifact` | `const uint8_t *` | — |
| `size` | `size_t` | — |
| `out` | `zplc_retain_identity_t *` | — |

#### `zplc_retain_restore`

```c
zplc_retain_reason_t zplc_retain_restore(const zplc_retain_identity_t *identity, uint32_t now_ms);
```

**Source summary:** Restore the region from the stored records, or initialise it.

Call after the program is loaded and before the first scan. The region is zeroed whenever the result is not ZPLC_RETAIN_RESTORED.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `identity` | `const zplc_retain_identity_t *` | — |
| `now_ms` | `uint32_t` | the caller's monotonic millisecond clock |

#### `zplc_retain_save`

```c
zplc_retain_save_result_t zplc_retain_save(const zplc_retain_identity_t *identity, uint32_t now_ms, zplc_retain_save_mode_t mode);
```

**Source summary:** Store the region as the next record when it changed.

Reads the region under the lock hook, then writes with no lock held.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `identity` | `const zplc_retain_identity_t *` | — |
| `now_ms` | `uint32_t` | — |
| `mode` | `zplc_retain_save_mode_t` | — |

#### `zplc_retain_cold_reset`

```c
zplc_retain_save_result_t zplc_retain_cold_reset(const zplc_retain_identity_t *identity, uint32_t now_ms);
```

**Source summary:** Cold reset: zero the region and store it, so a restart does not bring the old values back. The reason becomes ZPLC_RETAIN_RESET.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `identity` | `const zplc_retain_identity_t *` | — |
| `now_ms` | `uint32_t` | — |

#### `zplc_retain_last_status`

```c
void zplc_retain_last_status(zplc_retain_status_t *out);
```

**Source summary:** Copy the status.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `out` | `zplc_retain_status_t *` | — |

#### `zplc_retain_reason_string`

```c
const char *zplc_retain_reason_string(zplc_retain_reason_t reason);
```

**Source summary:** Stable token for a reason: restored, none, identity_mismatch, ...

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `reason` | `zplc_retain_reason_t` | — |

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `zplc_retain_reason_t` | Enum | Outcome of the last restore (or of a cold reset). |
| `zplc_retain_save_mode_t` | Enum | Whether a save is bound by the minimum interval. |
| `zplc_retain_save_result_t` | Enum | Result of zplc_retain_save(). |
| `crc32` | Struct | Identity of the program that owns the retained values. |
| `region` | Struct | Module configuration; the module keeps its own copy. |
| `reason` | Struct | What the status of the runtime reports (RT-025: "the status says why"). |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_RETAIN_H` | `—` | — |
| `ZPLC_RETAIN_FORMAT_VERSION` | `1U` | Record format version written and accepted. |
| `ZPLC_RETAIN_HEADER_SIZE` | `28U` | Bytes before the payload. |
| `ZPLC_RETAIN_TRAILER_SIZE` | `4U` | Bytes after the payload (the CRC-32). |
| `ZPLC_RETAIN_CHUNK_SIZE` | `CONFIG_ZPLC_RETAIN_CHUNK_SIZE` | — |
| `ZPLC_RETAIN_CHUNK_SIZE` | `1024U` | — |
| `ZPLC_RETAIN_MAX_CHUNKS` | `8U` | Chunks per slot; the keys use the digits '0'..'7'. |

## `zplc_scheduler.h`

ZPLC Multitask Scheduler API

This header defines the API for the ZPLC multitask scheduler. The scheduler supports multiple PLC tasks with different intervals and priorities, following IEC 61131-3 task model. Architecture (Zephyr implementation): - Each task has a k_timer that fires at the configured interval - Timer callbacks admit due task releases without executing PLC code - One coordinator executes each ordered due-set as a batch - Each batch takes one IPI snapshot and performs at most one normal OPI commit - Shared memory (IPI/OPI) is protected by a mutex

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

The scheduler accepts only a reference to code already loaded in the core. Raw code buffers are rejected.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `def` | `const zplc_task_def_t *` | Task definition (from .zplc file or manual config) |
| `code` | `const uint8_t *` | Must be NULL |
| `code_size` | `size_t` | Must be zero |

**Source return value:** Task handle (0-based index) on success, negative error code on failure

#### `zplc_sched_validate_program`

```c
int zplc_sched_validate_program(const uint8_t *binary, size_t size);
```

**Source summary:** Validate whether a .zplc program can be admitted by this scheduler.

This does not alter scheduler, core, process-image, timer, or persistence state. Only cyclic tasks aligned to the scheduler's millisecond timer are accepted.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `binary` | `const uint8_t *` | — |
| `size` | `size_t` | — |

**Source return value:** ZPLC_LOADER_OK on success, otherwise a ZPLC_LOADER_* error code.

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

**Source return value:** Number of tasks loaded on success, negative error code on failure: -1: Scheduler not initialized -2: Invalid arguments -3: Program rejected by the verifier or scheduler policy -4: Scheduler is not empty or not idle

**Source notes:**
- The scheduler must be IDLE with no registered tasks.

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

Stops all tasks but keeps them registered. Unlike a pause, a stop ends the run: the physical outputs go to their safe state, the output process image is zeroed, the force table is cleared, every task is back at its entry point and a scan interrupted by a breakpoint is discarded (RT-017).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_enter_safe_error`

```c
int zplc_sched_enter_safe_error(void);
```

**Source summary:** Latch the scheduler in ERROR and de-energize its outputs.

For a control-plane failure whose durable outcome is ambiguous. This stops timers and pending work, clears forces and the OPI, and rejects start until a fully validated replacement is loaded into an empty scheduler.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 when safe outputs were applied, otherwise the first HAL error; the ERROR latch is retained in either case.

#### `zplc_sched_pause`

```c
int zplc_sched_pause(void);
```

**Source summary:** Pause the scheduler (for debugging).

Pauses between scans: a batch in flight finishes first. The physical outputs are driven to their safe state before the call returns; the output process image and the force table are kept, so a later resume or step continues the program from where it stopped (RT-017).

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

Does not drive the pins itself. A scan stopped at a breakpoint continues from its program counter at the next release; a pause between scans starts a new scan. The first normal commit copies the output image, with the force table applied, to the pins.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| — | — | None. |

**Source return value:** 0 on success, negative error code on failure

#### `zplc_sched_step`

```c
int zplc_sched_step(void);
```

**Source summary:** Execute exactly one scan for each paused/ready task.

Used by the debugger when the scheduler is paused. A scan stopped at a breakpoint is finished; otherwise one whole scan runs. The scan is committed to the pins once and the pins are then driven safe again. The output image and the force table are kept. Tasks remain paused after the stepped cycle unless a task enters error state.

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

#### `zplc_sched_debug_snapshot`

```c
int zplc_sched_debug_snapshot(int task_id, zplc_sched_vm_snapshot_t *snapshot);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task_id` | `int` | — |
| `snapshot` | `zplc_sched_vm_snapshot_t *` | — |

**Source return value:** 0 on success, -1 for invalid state/arguments, -2 for no task.

#### `zplc_sched_debug_add_breakpoint`

```c
int zplc_sched_debug_add_breakpoint(int task_id, uint16_t pc);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task_id` | `int` | — |
| `pc` | `uint16_t` | — |

**Source return value:** 0 on success, or the underlying breakpoint error.

#### `zplc_sched_debug_remove_breakpoint`

```c
int zplc_sched_debug_remove_breakpoint(int task_id, uint16_t pc);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task_id` | `int` | — |
| `pc` | `uint16_t` | — |

**Source return value:** 0 on success, or the underlying breakpoint error.

#### `zplc_sched_debug_clear_breakpoints`

```c
int zplc_sched_debug_clear_breakpoints(int task_id);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `task_id` | `int` | — |

**Source return value:** 0 on success, -1 for invalid state/arguments, -2 for no task.

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
| `task_id` | Struct | Copy debugger-visible VM state for a registered task slot. |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_MAX_TASKS` | `CONFIG_ZPLC_MAX_TASKS` | — |
| `ZPLC_MAX_TASKS` | `8` | — |
| `ZPLC_SCAN_COORDINATOR_PRIORITY` | `CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY` | — |
| `ZPLC_SCAN_COORDINATOR_PRIORITY` | `CONFIG_ZPLC_SCHED_WORKQ_PRIORITY` | — |
| `ZPLC_MIN_INTERVAL_US` | `1000` | Minimum task interval in microseconds (1ms) |
| `ZPLC_MAX_INTERVAL_US` | `3600000000UL` | Maximum task interval in microseconds (1 hour) |

## `zplc_sha256.h`

SHA-256 and HMAC-SHA-256 (FIPS 180-4, RFC 2104), and the two helpers that key material needs (COM-021).

The authentication code of a frame in a network session is HMAC-SHA-256 under a key that was provisioned over the local serial link. This is a small portable implementation, no table but the 64 round constants and no allocation, that the core and every port share; the test of it runs the vectors of FIPS 180-4 and RFC 4231. Two helpers belong to it because of what they protect: zplc_ct_equal() compares two codes in time that does not depend on where they differ, and zplc_secure_zero() clears key material in a way the compiler may not remove.

Source: `firmware/lib/zplc_core/include/zplc_sha256.h`

### Functions

#### `zplc_sha256_init`

```c
void zplc_sha256_init(zplc_sha256_t *context);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `context` | `zplc_sha256_t *` | — |

#### `zplc_sha256_update`

```c
void zplc_sha256_update(zplc_sha256_t *context, const uint8_t *data, size_t length);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `context` | `zplc_sha256_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_sha256_final`

```c
void zplc_sha256_final(zplc_sha256_t *context, uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]);
```

**Source summary:** Write the digest and clear the context.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `context` | `zplc_sha256_t *` | — |
| `uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]` | `—` | — |

#### `zplc_sha256`

```c
void zplc_sha256(const uint8_t *data, size_t length, uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |
| `uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]` | `—` | — |

#### `zplc_hmac_sha256_init`

```c
void zplc_hmac_sha256_init(zplc_hmac_sha256_t *context, const uint8_t *key, size_t key_length);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `context` | `zplc_hmac_sha256_t *` | — |
| `key` | `const uint8_t *` | — |
| `key_length` | `size_t` | — |

#### `zplc_hmac_sha256_update`

```c
void zplc_hmac_sha256_update(zplc_hmac_sha256_t *context, const uint8_t *data, size_t length);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `context` | `zplc_hmac_sha256_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_hmac_sha256_final`

```c
void zplc_hmac_sha256_final(zplc_hmac_sha256_t *context, uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]);
```

**Source summary:** Write the code and clear the context (the key pads included).

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `context` | `zplc_hmac_sha256_t *` | — |
| `uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]` | `—` | — |

#### `zplc_hmac_sha256`

```c
void zplc_hmac_sha256(const uint8_t *key, size_t key_length, const uint8_t *data, size_t length, uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `key` | `const uint8_t *` | — |
| `key_length` | `size_t` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |
| `uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]` | `—` | — |

#### `zplc_ct_equal`

```c
int zplc_ct_equal(const uint8_t *a, const uint8_t *b, size_t length);
```

**Source summary:** 1 when the two buffers are equal; the time taken depends on @p length only.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `a` | `const uint8_t *` | — |
| `b` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_secure_zero`

```c
void zplc_secure_zero(void *buffer, size_t length);
```

**Source summary:** Clear @p length bytes in a way the compiler does not optimise away.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `buffer` | `void *` | — |
| `length` | `size_t` | — |

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `state` | Struct | — |
| `inner` | Struct | — |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_SHA256_H` | `—` | — |
| `ZPLC_SHA256_DIGEST_BYTES` | `32U` | — |
| `ZPLC_SHA256_BLOCK_BYTES` | `64U` | — |

## `zplc_sha512.h`

SHA-512 (FIPS 180-4), the hash of Ed25519 (COM-026).

Source: `firmware/lib/zplc_core/include/zplc_sha512.h`

### Functions

#### `zplc_sha512_init`

```c
void zplc_sha512_init(zplc_sha512_t *context);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `context` | `zplc_sha512_t *` | — |

#### `zplc_sha512_update`

```c
void zplc_sha512_update(zplc_sha512_t *context, const uint8_t *data, size_t length);
```

**Source summary:** No summary found in the header comment.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `context` | `zplc_sha512_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_sha512_final`

```c
void zplc_sha512_final(zplc_sha512_t *context, uint8_t digest[ZPLC_SHA512_DIGEST_BYTES]);
```

**Source summary:** Write the digest and clear the context.

**Parameters**

| Name | Type | Source description |
| --- | --- | --- |
| `context` | `zplc_sha512_t *` | — |
| `uint8_t digest[ZPLC_SHA512_DIGEST_BYTES]` | `—` | — |

### Types

| Name | Kind | Source summary |
| --- | --- | --- |
| `state` | Struct | — |

### Constants and macros

| Name | Value | Source summary |
| --- | --- | --- |
| `ZPLC_SHA512_H` | `—` | — |
| `ZPLC_SHA512_DIGEST_BYTES` | `64U` | — |
| `ZPLC_SHA512_BLOCK_BYTES` | `128U` | — |

## Binary contract tables

These tables are generated from `tools/contract/contract.json`, the single source of the opcodes, container constants, error codes, memory regions and communication function-block layouts. The C headers, the TypeScript compiler tables and the Python tools are generated from the same file, so they cannot drift.

### Container constants

| Constant | Value | Notes |
| --- | --- | --- |
| Magic number | `0x434C505A` | `5A 50 4C 43` = "ZPLC" |
| ISA version (major.minor) | `1.0` |  |
| Draft contract counter | `4` | Written in header word 28 of every artifact. The loader and Studio refuse an artifact, or a device image, whose counter differs from their own and show both numbers; 0 means an artifact built before the counter. It increases with every contract change until the freeze. |
| File header size (bytes) | `32` |  |
| Segment entry size (bytes) | `8` |  |
| Task definition size (bytes) | `16` |  |
| I/O map entry size (bytes) | `8` |  |
| Tag entry size (bytes) | `8` |  |
| Maximum tasks in an artifact | `16` |  |
| Build identity size (bytes) | `4` |  |
| Deepest evaluation stack the loader proves | `127` | A task that needs more is refused, whatever the target stack allows; the compiler fails the build above it. |
| CRC32 | `0xEDB88320` | IEEE 802.3 polynomial 0xEDB88320, over the whole file except the 4 bytes at offset 12. |

### Layout of `zplc_file_header_t`

| Offset | Field | Type | Bytes | Description |
| --- | --- | --- | --- | --- |
| `0` | `magic` | `uint32_t` | 4 | Magic number: ZPLC_MAGIC |
| `4` | `version_major` | `uint16_t` | 2 | Major version |
| `6` | `version_minor` | `uint16_t` | 2 | Minor version |
| `8` | `flags` | `uint32_t` | 4 | Feature flags |
| `12` | `crc32` | `uint32_t` | 4 | CRC32 of file (excluding this field) |
| `16` | `code_size` | `uint32_t` | 4 | Size of code segment (bytes) |
| `20` | `data_size` | `uint32_t` | 4 | Size of data segment (bytes) |
| `24` | `entry_point` | `uint16_t` | 2 | Code offset of main entry |
| `26` | `segment_count` | `uint16_t` | 2 | Number of segments |
| `28` | `draft_counter` | `uint32_t` | 4 | Draft contract counter: must equal ZPLC_DRAFT_COUNTER (0 = built before the counter) |

### Layout of `zplc_segment_entry_t`

| Offset | Field | Type | Bytes | Description |
| --- | --- | --- | --- | --- |
| `0` | `type` | `uint16_t` | 2 | Segment type |
| `2` | `flags` | `uint16_t` | 2 | Segment-specific flags |
| `4` | `size` | `uint32_t` | 4 | Segment size (bytes) |

### Layout of `zplc_task_def_t`

| Offset | Field | Type | Bytes | Description |
| --- | --- | --- | --- | --- |
| `0` | `id` | `uint16_t` | 2 | Task ID |
| `2` | `type` | `uint8_t` | 1 | Task type (cyclic, event, init) |
| `3` | `priority` | `uint8_t` | 1 | Priority (0=highest) |
| `4` | `interval_us` | `uint32_t` | 4 | Cycle time in microseconds |
| `8` | `entry_point` | `uint16_t` | 2 | Code offset |
| `10` | `stack_size` | `uint16_t` | 2 | Required stack depth |
| `12` | `call_depth` | `uint16_t` | 2 | Call frames active at once, the task body included (1 for a task that calls nothing); 0 = not declared (CMP-050) |
| `14` | `reserved` | `uint16_t` | 2 | Reserved (must be 0) |

### Layout of `zplc_build_info_t`

| Offset | Field | Type | Bytes | Description |
| --- | --- | --- | --- | --- |
| `0` | `build_id` | `uint32_t` | 4 | CRC-32 of CODE then TASK; never 0 (0 = not identified) |

### Layout of `zplc_iomap_entry_t`

| Offset | Field | Type | Bytes | Description |
| --- | --- | --- | --- | --- |
| `0` | `var_addr` | `uint16_t` | 2 | Variable address in memory |
| `2` | `var_type` | `uint8_t` | 1 | Data type ID |
| `3` | `direction` | `uint8_t` | 1 | 0=Input, 1=Output |
| `4` | `channel` | `uint16_t` | 2 | Physical channel number |
| `6` | `flags` | `uint16_t` | 2 | Bit offset, invert, etc. |

### Layout of `zplc_tag_entry_t`

| Offset | Field | Type | Bytes | Description |
| --- | --- | --- | --- | --- |
| `0` | `var_addr` | `uint16_t` | 2 | Memory address of the variable |
| `2` | `var_type` | `uint8_t` | 1 | Data type ID (zplc_data_type_t) |
| `3` | `tag_id` | `uint8_t` | 1 | Protocol/Tag identifier (1=Publish, 2=Modbus, etc.) |
| `4` | `value` | `uint32_t` | 4 | Parameter (Modbus address, or offset to string table) |

### File header flags

| Name | Mask | Description |
| --- | --- | --- |
| `ZPLC_FLAG_HAS_DEBUG` | `0x01` | Debug segment present |
| `ZPLC_FLAG_HAS_SYMBOLS` | `0x02` | Symbol table present |
| `ZPLC_FLAG_HAS_RETAIN` | `0x04` | Uses retentive memory |
| `ZPLC_FLAG_SIGNED` | `0x08` | Cryptographic signature |

### Segment types

| Name | Value | Description |
| --- | --- | --- |
| `ZPLC_SEG_CODE` | `0x01` | Executable bytecode |
| `ZPLC_SEG_DATA` | `0x02` | Initialized data |
| `ZPLC_SEG_BSS` | `0x03` | Uninitialized data |
| `ZPLC_SEG_RETAIN` | `0x04` | Retentive variables |
| `ZPLC_SEG_IOMAP` | `0x05` | I/O mapping table |
| `ZPLC_SEG_SYMTAB` | `0x10` | Symbol table |
| `ZPLC_SEG_DEBUG` | `0x11` | Debug information |
| `ZPLC_SEG_TASK` | `0x20` | Task definitions |
| `ZPLC_SEG_TAGS` | `0x30` | Variable tags (networking metadata) |
| `ZPLC_SEG_BUILD` | `0x40` | Build identity of the artifact (CMP-056) |

### Task types

| Name | Value | Description |
| --- | --- | --- |
| `ZPLC_TASK_CYCLIC` | `0x00` | Periodic execution |
| `ZPLC_TASK_EVENT` | `0x01` | Event-triggered |
| `ZPLC_TASK_INIT` | `0x02` | Run once at startup |

### I/O directions

| Name | Value | Description |
| --- | --- | --- |
| `ZPLC_IO_INPUT` | `0x00` | Input (HAL -> VM) |
| `ZPLC_IO_OUTPUT` | `0x01` | Output (VM -> HAL) |

### Tag identifiers

| Name | Value | Description |
| --- | --- | --- |
| `ZPLC_TAG_NONE` | `0x00` |  |
| `ZPLC_TAG_PUBLISH` | `0x01` | \{publish\} |
| `ZPLC_TAG_MODBUS` | `0x02` | \{modbus:N\} |
| `ZPLC_TAG_SUBSCRIBE` | `0x03` | \{subscribe\} |

### Memory regions

| Region | Base | Default size | Kconfig override | Description |
| --- | --- | --- | --- | --- |
| `IPI` | `0x0000` | `0x1000` | — | Input Process Image |
| `OPI` | `0x1000` | `0x1000` | — | Output Process Image |
| `WORK` | `0x2000` | `0x2000` | `CONFIG_ZPLC_WORK_MEMORY_SIZE` | Work Memory |
| `RETAIN` | `0x4000` | `0x1000` | `CONFIG_ZPLC_RETAIN_MEMORY_SIZE` | Retentive Memory |
| `CODE` | `0x5000` | `0xB000` | `CONFIG_ZPLC_CODE_SIZE_MAX` | Code Segment |

### Runtime limits

| Limit | Value | Kconfig override | Description |
| --- | --- | --- | --- |
| `ZPLC_MAX_TAGS` | `64` | — | Maximum number of variable tags supported |
| `ZPLC_STACK_MAX_DEPTH` | `256` | `CONFIG_ZPLC_STACK_DEPTH` | Maximum evaluation stack depth (configurable via Kconfig) |
| `ZPLC_CALL_STACK_MAX` | `32` | `CONFIG_ZPLC_CALL_STACK_DEPTH` | Maximum call stack depth (configurable via Kconfig) |
| `ZPLC_MAX_BREAKPOINTS` | `16` | `CONFIG_ZPLC_MAX_BREAKPOINTS` | Maximum number of breakpoints (configurable via Kconfig) |

### System registers (input image)

| Name | Address | Type | Bytes | Description |
| --- | --- | --- | --- | --- |
| `ZPLC_SYS_CYCLE_TIME` | `0x0FF0` | `DINT` | 4 | System register: Last cycle execution time in microseconds (DINT, 4 bytes) |
| `ZPLC_SYS_UPTIME` | `0x0FF4` | `UDINT` | 4 | System register: System uptime in milliseconds (UDINT, 4 bytes) |
| `ZPLC_SYS_TASK_ID` | `0x0FF8` | `BYTE` | 1 | System register: Current task ID (BYTE, 1 byte) |
| `ZPLC_SYS_FLAGS` | `0x0FF9` | `BYTE` | 1 | System register: System flags (BYTE, 1 byte) |

### System flags

| Name | Value | Description |
| --- | --- | --- |
| `ZPLC_SYS_FLAG_FIRST_SCAN` | `0x01` | System flags: First scan bit (set on first cycle after start) |
| `ZPLC_SYS_FLAG_WDG_WARN` | `0x02` | Reserved system flag; not produced by current runtimes. |
| `ZPLC_SYS_FLAG_RUNNING` | `0x04` | System flags: Scheduler is running |

### Data type identifiers

| Name | Identifier | Bytes | Description |
| --- | --- | --- | --- |
| `NONE` | `0x00` | 0 | Invalid/unspecified |
| `BOOL` | `0x01` | 1 | Boolean (1 byte) |
| `SINT` | `0x02` | 1 | Signed 8-bit integer |
| `INT` | `0x04` | 2 | Signed 16-bit integer |
| `DINT` | `0x06` | 4 | Signed 32-bit integer |
| `LINT` | `0x08` | 8 | Signed 64-bit integer |
| `USINT` | `0x03` | 1 | Unsigned 8-bit integer |
| `UINT` | `0x05` | 2 | Unsigned 16-bit integer |
| `UDINT` | `0x07` | 4 | Unsigned 32-bit integer |
| `ULINT` | `0x09` | 8 | Unsigned 64-bit integer |
| `REAL` | `0x0A` | 4 | 32-bit IEEE 754 float |
| `LREAL` | `0x0B` | 8 | 64-bit IEEE 754 double |
| `TIME` | `0x0C` | 4 | Time duration (unsigned 32-bit milliseconds) |
| `BYTE` | `0x10` | 1 | 8-bit bit string |
| `WORD` | `0x11` | 2 | 16-bit bit string |
| `DWORD` | `0x12` | 4 | 32-bit bit string |
| `LWORD` | `0x13` | 8 | 64-bit bit string |
| `STRING` | `0x20` | — | Variable-length string (IEC 61131-3) |

### STRING layout

A STRING is `[length:2][capacity:2][data:capacity+1]`, little-endian. The default capacity is 80 characters (85 bytes) and the largest is 255.

### Opcodes

The operand size follows the opcode range (0x00-0x3F none, 0x40-0x7F 8-bit, 0x80-0xBF 16-bit, 0xC0-0xFF 32-bit), except `RET` and the opcodes `I2F` to `GED` (conversions and double-precision arithmetic and comparison), which carry no operand. Stack effects list the top of the stack on the right.

| Code | Mnemonic | Operand | Stack effect | Flags | Description |
| --- | --- | --- | --- | --- | --- |
| `0x00` | `NOP` | 0 | `[] -> []` | — | No operation |
| `0x01` | `HALT` | 0 | `[] -> []` | `terminates` | Stop execution |
| `0x02` | `BREAK` | 0 | `[] -> []` | — | Debugger breakpoint |
| `0x03` | `GET_TICKS` | 0 | `[] -> [ticks]` | — | Push system tick (ms) to stack |
| `0x04` | `MUL64` | 0 | `[alo ahi blo bhi] -> [lo hi]` | — | 64-bit integer multiplication (low 64 bits of the product, wraps) |
| `0x05` | `DIVS64` | 0 | `[alo ahi blo bhi] -> [lo hi]` | — | 64-bit signed division; zero divisor faults, INT64_MIN / -1 is INT64_MIN |
| `0x06` | `DIVU64` | 0 | `[alo ahi blo bhi] -> [lo hi]` | — | 64-bit unsigned division; zero divisor faults |
| `0x07` | `MODS64` | 0 | `[alo ahi blo bhi] -> [lo hi]` | — | 64-bit signed modulo, sign of the dividend; zero divisor faults, b = -1 gives 0 |
| `0x08` | `MODU64` | 0 | `[alo ahi blo bhi] -> [lo hi]` | — | 64-bit unsigned modulo; zero divisor faults |
| `0x09` | `NEG64` | 0 | `[lo hi] -> [lo hi]` | — | 64-bit integer negation (INT64_MIN stays INT64_MIN) |
| `0x0A` | `ABS64` | 0 | `[lo hi] -> [lo hi]` | — | 64-bit signed absolute value (INT64_MIN stays INT64_MIN) |
| `0x0B` | `SHL64` | 0 | `[lo hi n] -> [lo hi]` | — | 64-bit shift left by a 32-bit unsigned count; 64 or more gives 0 |
| `0x0C` | `SHR64` | 0 | `[lo hi n] -> [lo hi]` | — | 64-bit logical shift right; a count of 64 or more gives 0 |
| `0x0D` | `SAR64` | 0 | `[lo hi n] -> [lo hi]` | — | 64-bit arithmetic shift right; a count of 64 or more gives 0 or -1 by the sign |
| `0x10` | `DUP` | 0 | `[a] -> [a a]` | — | Duplicate top of stack |
| `0x11` | `DROP` | 0 | `[a] -> []` | — | Discard top of stack |
| `0x12` | `SWAP` | 0 | `[a b] -> [b a]` | — | Swap top two elements |
| `0x13` | `OVER` | 0 | `[a b] -> [a b a]` | — | Copy second element to top |
| `0x14` | `ROT` | 0 | `[a b c] -> [b c a]` | — | Rotate top three elements |
| `0x15` | `LOADI8` | 0 | `[addr] -> [value]` | — | Load 8-bit from address on stack |
| `0x16` | `LOADI32` | 0 | `[addr] -> [value]` | — | Load 32-bit from address on stack |
| `0x17` | `STOREI8` | 0 | `[addr value] -> []` | — | Store 8-bit to address on stack: [addr val] -> [] |
| `0x18` | `STOREI32` | 0 | `[addr value] -> []` | — | Store 32-bit to address on stack: [addr val] -> [] |
| `0x19` | `LOADI16` | 0 | `[addr] -> [value]` | — | Load 16-bit from address on stack |
| `0x1A` | `STOREI16` | 0 | `[addr value] -> []` | — | Store 16-bit to address on stack: [addr val] -> [] |
| `0x1B` | `STRLEN` | 0 | `[str] -> [len]` | — | Get string length: [str_addr] -> [length] |
| `0x1C` | `STRCPY` | 0 | `[src dst] -> []` | — | Copy string: [src_addr dst_addr] -> [] (safe, bounds-checked) |
| `0x1D` | `STRCAT` | 0 | `[src dst] -> []` | — | Concatenate: [src_addr dst_addr] -> [] (safe, bounds-checked) |
| `0x1E` | `STRCMP` | 0 | `[a b] -> [cmp]` | — | Compare strings: [addr1 addr2] -> [result] (-1, 0, 1) |
| `0x1F` | `STRCLR` | 0 | `[str] -> []` | — | Clear string: [str_addr] -> [] |
| `0x20` | `ADD` | 0 | `[a b] -> [r]` | — | Integer addition |
| `0x21` | `SUB` | 0 | `[a b] -> [r]` | — | Integer subtraction |
| `0x22` | `MUL` | 0 | `[a b] -> [r]` | — | Integer multiplication |
| `0x23` | `DIV` | 0 | `[a b] -> [r]` | — | Integer division |
| `0x24` | `MOD` | 0 | `[a b] -> [r]` | — | Integer modulo |
| `0x25` | `NEG` | 0 | `[a] -> [r]` | — | Integer negation |
| `0x26` | `ABS` | 0 | `[a] -> [r]` | — | Absolute value |
| `0x28` | `ADDF` | 0 | `[a b] -> [r]` | — | Float addition |
| `0x29` | `SUBF` | 0 | `[a b] -> [r]` | — | Float subtraction |
| `0x2A` | `MULF` | 0 | `[a b] -> [r]` | — | Float multiplication |
| `0x2B` | `DIVF` | 0 | `[a b] -> [r]` | — | Float division |
| `0x2C` | `NEGF` | 0 | `[a] -> [r]` | — | Float negation |
| `0x2D` | `ABSF` | 0 | `[a] -> [r]` | — | Float absolute value |
| `0x30` | `AND` | 0 | `[a b] -> [r]` | — | Bitwise AND |
| `0x31` | `OR` | 0 | `[a b] -> [r]` | — | Bitwise OR |
| `0x32` | `XOR` | 0 | `[a b] -> [r]` | — | Bitwise XOR |
| `0x33` | `NOT` | 0 | `[a] -> [r]` | — | Bitwise NOT |
| `0x34` | `SHL` | 0 | `[a b] -> [r]` | — | Shift left |
| `0x35` | `SHR` | 0 | `[a b] -> [r]` | — | Shift right (logical) |
| `0x36` | `SAR` | 0 | `[a b] -> [r]` | — | Shift right (arithmetic) |
| `0x38` | `EQ` | 0 | `[a b] -> [flag]` | — | Equal |
| `0x39` | `NE` | 0 | `[a b] -> [flag]` | — | Not equal |
| `0x3A` | `LT` | 0 | `[a b] -> [flag]` | — | Less than (signed) |
| `0x3B` | `LE` | 0 | `[a b] -> [flag]` | — | Less or equal (signed) |
| `0x3C` | `GT` | 0 | `[a b] -> [flag]` | — | Greater than (signed) |
| `0x3D` | `GE` | 0 | `[a b] -> [flag]` | — | Greater or equal (signed) |
| `0x3E` | `LTU` | 0 | `[a b] -> [flag]` | — | Less than (unsigned) |
| `0x3F` | `GTU` | 0 | `[a b] -> [flag]` | — | Greater than (unsigned) |
| `0x40` | `PUSH8` | 1 | `[] -> [imm]` | — | Push 8-bit immediate (sign-extended) |
| `0x41` | `PICK` | 1 | `[x_n .. x_0] -> [x_n .. x_0 x_n]` | — | Copy nth stack element to top: PICK n copies stack[sp-1-n] |
| `0x50` | `JR` | 1 | `[] -> []` | `relative`, `terminates` | Relative jump (signed 8-bit offset) |
| `0x51` | `JRZ` | 1 | `[cond] -> []` | `relative` | Relative jump if zero |
| `0x52` | `JRNZ` | 1 | `[cond] -> []` | `relative` | Relative jump if not zero |
| `0x80` | `LOAD8` | 2 | `[] -> [value]` | — | Load 8-bit from address |
| `0x81` | `LOAD16` | 2 | `[] -> [value]` | — | Load 16-bit from address |
| `0x82` | `LOAD32` | 2 | `[] -> [value]` | — | Load 32-bit from address |
| `0x83` | `LOAD64` | 2 | `[] -> [low high]` | — | Load 64-bit from address |
| `0x84` | `STORE8` | 2 | `[value] -> []` | — | Store 8-bit to address |
| `0x85` | `STORE16` | 2 | `[value] -> []` | — | Store 16-bit to address |
| `0x86` | `STORE32` | 2 | `[value] -> []` | — | Store 32-bit to address |
| `0x87` | `STORE64` | 2 | `[low high] -> []` | — | Store 64-bit to address |
| `0x88` | `PUSH16` | 2 | `[] -> [imm]` | — | Push 16-bit immediate (sign-extended) |
| `0x90` | `JMP` | 2 | `[] -> []` | `absolute`, `terminates` | Unconditional jump |
| `0x91` | `JZ` | 2 | `[cond] -> []` | `absolute` | Jump if zero (false) |
| `0x92` | `JNZ` | 2 | `[cond] -> []` | `absolute` | Jump if not zero (true) |
| `0x93` | `CALL` | 2 | `[] -> []` | `absolute`, `call` | Call subroutine |
| `0x94` | `RET` | 0 | `[] -> []` | `terminates` | Return from subroutine |
| `0xA0` | `I2F` | 0 | `[a] -> [r]` | — | Integer to float |
| `0xA1` | `F2I` | 0 | `[a] -> [r]` | — | Float to integer |
| `0xA2` | `I2B` | 0 | `[a] -> [r]` | — | Integer to boolean |
| `0xA3` | `EXT8` | 0 | `[a] -> [r]` | — | Sign-extend 8-bit to 32-bit |
| `0xA4` | `EXT16` | 0 | `[a] -> [r]` | — | Sign-extend 16-bit to 32-bit |
| `0xA5` | `ZEXT8` | 0 | `[a] -> [r]` | — | Zero-extend 8-bit to 32-bit |
| `0xA6` | `ZEXT16` | 0 | `[a] -> [r]` | — | Zero-extend 16-bit to 32-bit |
| `0xA7` | `F2D` | 0 | `[f] -> [lo hi]` | — | REAL to LREAL (exact; every NaN becomes the quiet NaN) |
| `0xA8` | `D2F` | 0 | `[lo hi] -> [f]` | — | LREAL to REAL, round to nearest even (overflow gives infinity) |
| `0xA9` | `I2D` | 0 | `[a] -> [lo hi]` | — | Signed 32-bit integer to LREAL (exact) |
| `0xAA` | `D2I` | 0 | `[lo hi] -> [a]` | — | LREAL to signed 32-bit integer: truncates toward zero, saturates, NaN gives 0 |
| `0xAB` | `L2D` | 0 | `[lo hi] -> [lo hi]` | — | Signed 64-bit integer to LREAL, round to nearest even |
| `0xAC` | `D2L` | 0 | `[lo hi] -> [lo hi]` | — | LREAL to signed 64-bit integer: truncates toward zero, saturates, NaN gives 0 |
| `0xAD` | `U2D` | 0 | `[lo hi] -> [lo hi]` | — | Unsigned 64-bit integer to LREAL, round to nearest even |
| `0xAE` | `D2U` | 0 | `[lo hi] -> [lo hi]` | — | LREAL to unsigned 64-bit integer: truncates toward zero, below 1.0 and NaN give 0, saturates |
| `0xAF` | `L2F` | 0 | `[lo hi] -> [f]` | — | Signed 64-bit integer to REAL, one rounding to nearest even |
| `0xB0` | `U2F` | 0 | `[lo hi] -> [f]` | — | Unsigned 64-bit integer to REAL, one rounding to nearest even |
| `0xB1` | `ADDD` | 0 | `[alo ahi blo bhi] -> [lo hi]` | — | LREAL addition (IEEE 754 binary64, round to nearest even) |
| `0xB2` | `SUBD` | 0 | `[alo ahi blo bhi] -> [lo hi]` | — | LREAL subtraction |
| `0xB3` | `MULD` | 0 | `[alo ahi blo bhi] -> [lo hi]` | — | LREAL multiplication |
| `0xB4` | `DIVD` | 0 | `[alo ahi blo bhi] -> [lo hi]` | — | LREAL division; a divisor of 0.0 or -0.0 faults |
| `0xB5` | `NEGD` | 0 | `[lo hi] -> [lo hi]` | — | LREAL negation (flips the sign bit) |
| `0xB6` | `ABSD` | 0 | `[lo hi] -> [lo hi]` | — | LREAL absolute value (clears the sign bit) |
| `0xB7` | `SQRTD` | 0 | `[lo hi] -> [lo hi]` | — | LREAL square root, correctly rounded; 0.0 for an argument at or below 0.0 |
| `0xB8` | `RNDD` | 0 | `[lo hi] -> [lo hi]` | — | LREAL rounded to the nearest integral value, a tie to the even one |
| `0xB9` | `EQD` | 0 | `[alo ahi blo bhi] -> [flag]` | — | LREAL equal (false when either operand is a NaN) |
| `0xBA` | `NED` | 0 | `[alo ahi blo bhi] -> [flag]` | — | LREAL not equal (true when either operand is a NaN) |
| `0xBB` | `LTD` | 0 | `[alo ahi blo bhi] -> [flag]` | — | LREAL less than (false with a NaN) |
| `0xBC` | `LED` | 0 | `[alo ahi blo bhi] -> [flag]` | — | LREAL less or equal (false with a NaN) |
| `0xBD` | `GTD` | 0 | `[alo ahi blo bhi] -> [flag]` | — | LREAL greater than (false with a NaN) |
| `0xBE` | `GED` | 0 | `[alo ahi blo bhi] -> [flag]` | — | LREAL greater or equal (false with a NaN) |
| `0xC0` | `PUSH32` | 4 | `[] -> [imm]` | — | Push 32-bit immediate |
| `0xD0` | `COMM_EXEC` | 4 | `[base] -> []` | `comm` | Execute/update Comm FB; pop base addr from stack |
| `0xD1` | `COMM_STATUS` | 4 | `[base] -> [status]` | `comm` | Push status word for a kind to stack |
| `0xD2` | `COMM_RESET` | 4 | `[base] -> []` | `comm` | Reset FSM for Comm FB; pop base addr from stack |

### VM error codes

| Name | Code | Description |
| --- | --- | --- |
| `ZPLC_VM_OK` | `0x00` | No error |
| `ZPLC_VM_STACK_OVERFLOW` | `0x01` | Evaluation stack full |
| `ZPLC_VM_STACK_UNDERFLOW` | `0x02` | Pop from empty stack |
| `ZPLC_VM_DIV_BY_ZERO` | `0x03` | Division by zero |
| `ZPLC_VM_INVALID_OPCODE` | `0x04` | Unknown instruction |
| `ZPLC_VM_OUT_OF_BOUNDS` | `0x05` | Memory access violation |
| `ZPLC_VM_CALL_OVERFLOW` | `0x06` | Call stack full |
| `ZPLC_VM_INVALID_JUMP` | `0x07` | Jump to invalid address |
| `ZPLC_VM_WATCHDOG` | `0x08` | Execution time exceeded |
| `ZPLC_VM_HALTED` | `0x09` | Execution stopped normally |
| `ZPLC_VM_PAUSED` | `0x0A` | Paused at breakpoint (debugger) |

### Loader error codes

| Name | Code | Description |
| --- | --- | --- |
| `ZPLC_LOADER_OK` | `0` | Verified |
| `ZPLC_LOADER_ERR_MAGIC` | `-1` | Wrong magic number |
| `ZPLC_LOADER_ERR_VERSION` | `-2` | ISA version differs from the loader version |
| `ZPLC_LOADER_ERR_SIZE` | `-3` | A size or count field is inconsistent with the file, or a reserved word is not zero |
| `ZPLC_LOADER_ERR_NO_CODE` | `-4` | No CODE segment |
| `ZPLC_LOADER_ERR_CRC32` | `-6` | CRC32 mismatch |
| `ZPLC_LOADER_ERR_FLAGS` | `-7` | Header flags are not supported |
| `ZPLC_LOADER_ERR_SEGMENT` | `-8` | Segment table entry is invalid, repeated or of an unsupported type |
| `ZPLC_LOADER_ERR_ENTRY_POINT` | `-9` | Entry point is not an instruction boundary |
| `ZPLC_LOADER_ERR_WORKSPACE` | `-10` | Verifier workspace is missing or too small |
| `ZPLC_LOADER_ERR_OPCODE` | `-11` | Unknown opcode or truncated instruction |
| `ZPLC_LOADER_ERR_CONTROL_FLOW` | `-12` | Jump target is not an instruction boundary, or the code falls through its end |
| `ZPLC_LOADER_ERR_MEMORY` | `-13` | Static memory access outside the writable regions |
| `ZPLC_LOADER_ERR_TASK` | `-14` | Task definition is invalid or there are too many tasks |
| `ZPLC_LOADER_ERR_TAGS` | `-15` | Tag entry is invalid |
| `ZPLC_LOADER_ERR_COMM` | `-16` | Communication function-block kind is NONE or at or above the kind limit, or a block at a statically known address does not fit one memory region |
| `ZPLC_LOADER_ERR_DRAFT` | `-17` | Draft contract counter of the artifact differs from the loader's, or the artifact has none |
| `ZPLC_LOADER_ERR_STACK` | `-18` | The evaluation stack can underflow, or exceed the depth the task declares, on some path, or the verifier cannot prove that it cannot |

### Communication function blocks

Each function-block instance is a byte block in work or retentive memory. Every block starts with the same 8-byte handshake. The core takes the size of a block from this table.

| Name | Kind | Instance size (bytes) | Description |
| --- | --- | --- | --- |
| `MB_READ_HREG` | `0x0001` | 110 | Modbus read holding registers; COUNT registers requested, VALUE is the first register slot |
| `MB_WRITE_HREG` | `0x0002` | 110 | Modbus write holding registers; VALUE is the first write slot |
| `MB_READ_COIL` | `0x0003` | 110 | Modbus read coils |
| `MB_WRITE_COIL` | `0x0004` | 110 | Modbus write coils |
| `MQTT_CONNECT` | `0x000A` | 12 | MQTT connect |
| `MQTT_PUBLISH` | `0x000B` | 190 | MQTT publish |
| `MQTT_SUBSCRIBE` | `0x000C` | 190 | MQTT subscribe; PAYLOAD is an output |
| `AZURE_C2D_RECV` | `0x0020` | 94 | Azure cloud-to-device receive |
| `AZURE_DPS_PROV` | `0x0021` | 201 | Azure DPS provisioning |
| `AZURE_EG_PUB` | `0x0022` | 266 | Azure Event Grid publish |
| `AWS_FLEET_PROV` | `0x0030` | 137 | AWS fleet provisioning |
| `SPB_REBIRTH` | `0x0040` | 8 | Sparkplug B rebirth; a rising EN triggers REBIRTH |

Kinds at or above `0x00FF` are refused by the loader and by handler registration.

#### Layout of `MB_READ_HREG`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `PROTO` | `USINT` | input |
| 9 | `SLAVE_ID` | `UINT` | input |
| 11 | `ADDR` | `UINT` | input |
| 13 | `COUNT` | `UINT` | input |
| 15 | `VALUE` | `UINT` | output |
| 18 | `HOST` | `STRING` | input |
| 103 | `PORT` | `UINT` | input |

#### Layout of `MB_WRITE_HREG`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `PROTO` | `USINT` | input |
| 9 | `SLAVE_ID` | `UINT` | input |
| 11 | `ADDR` | `UINT` | input |
| 13 | `COUNT` | `UINT` | input |
| 15 | `VALUE` | `UINT` | input |
| 18 | `HOST` | `STRING` | input |
| 103 | `PORT` | `UINT` | input |

#### Layout of `MB_READ_COIL`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `PROTO` | `USINT` | input |
| 9 | `SLAVE_ID` | `UINT` | input |
| 11 | `ADDR` | `UINT` | input |
| 13 | `COUNT` | `UINT` | input |
| 15 | `VALUE` | `BOOL` | output |
| 18 | `HOST` | `STRING` | input |
| 103 | `PORT` | `UINT` | input |

#### Layout of `MB_WRITE_COIL`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `PROTO` | `USINT` | input |
| 9 | `SLAVE_ID` | `UINT` | input |
| 11 | `ADDR` | `UINT` | input |
| 13 | `COUNT` | `UINT` | input |
| 15 | `VALUE` | `BOOL` | input |
| 18 | `HOST` | `STRING` | input |
| 103 | `PORT` | `UINT` | input |

#### Layout of `MQTT_CONNECT`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `PROFILE` | `USINT` | input |
| 9 | `CONNECTED` | `BOOL` | output |

#### Layout of `MQTT_PUBLISH`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `QOS` | `USINT` | input |
| 9 | `RETAIN` | `BOOL` | input |
| 12 | `TOPIC` | `STRING` | input |
| 97 | `PAYLOAD` | `STRING` | input |

#### Layout of `MQTT_SUBSCRIBE`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `QOS` | `USINT` | input |
| 9 | `VALID` | `BOOL` | output |
| 12 | `TOPIC` | `STRING` | input |
| 97 | `PAYLOAD` | `STRING` | output |

#### Layout of `AZURE_C2D_RECV`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `PAYLOAD` | `STRING` | output |
| 93 | `VALID` | `BOOL` | output |

#### Layout of `AZURE_DPS_PROV`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `DEVICE_ID` | `STRING` | input |
| 73 | `ASSIGNED_HUB` | `STRING` | output |

#### Layout of `AZURE_EG_PUB`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `TOPIC` | `STRING` | input |
| 73 | `EVENT_TYPE` | `STRING` | input |
| 138 | `PAYLOAD` | `STRING` | input |

#### Layout of `AWS_FLEET_PROV`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |
| 8 | `TEMPLATE_NAME` | `STRING` | input |
| 73 | `THING_NAME` | `STRING` | output |

#### Layout of `SPB_REBIRTH`

| Offset | Member | Type | Direction |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | input |
| 1 | `BUSY` | `BOOL` | output |
| 2 | `DONE` | `BOOL` | output |
| 3 | `ERROR` | `BOOL` | output |
| 4 | `STATUS` | `DINT` | output |

### Communication status codes

| Name | Code |
| --- | --- |
| `ZPLC_COMM_OK` | `0` |
| `ZPLC_COMM_BUSY` | `1` |
| `ZPLC_COMM_TIMEOUT` | `2` |
| `ZPLC_COMM_NO_HANDLER` | `3` |
| `ZPLC_COMM_NOT_CONNECTED` | `4` |
| `ZPLC_COMM_QUEUE_FULL` | `5` |
| `ZPLC_COMM_INVALID_ADDR` | `6` |
| `ZPLC_COMM_STRING_OVERFLOW` | `7` |
| `ZPLC_COMM_PROTO_ERROR` | `8` |
| `ZPLC_COMM_AUTH_FAILED` | `9` |
| `ZPLC_COMM_UNKNOWN` | `255` |
