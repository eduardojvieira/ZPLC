---
slug: /reference/runtime-api
id: runtime-api
title: API del Runtime
sidebar_label: API del Runtime
description: Referencia generada para los headers públicos del runtime ZPLC en ZPLC 2.0.
tags: [reference, runtime, generated]
---

# API del Runtime

> [!IMPORTANT]
> Esta página se genera a partir de los headers públicos en C bajo `firmware/lib/zplc_core/include/`. Editá los headers o volvé a ejecutar `python3 tools/docs/generate_runtime_reference.py` en lugar de editar este archivo manualmente.

> El texto envolvente está localizado al español, mientras que los nombres de API, las firmas y las descripciones derivadas del código se mantienen ancladas a los headers en inglés para evitar drift documental.

## Headers fuente

- `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`
- `firmware/lib/zplc_core/include/zplc_core.h`
- `firmware/lib/zplc_core/include/zplc_debug.h`
- `firmware/lib/zplc_core/include/zplc_hal.h`
- `firmware/lib/zplc_core/include/zplc_hal_posix.h`
- `firmware/lib/zplc_core/include/zplc_isa.h`
- `firmware/lib/zplc_core/include/zplc_loader.h`
- `firmware/lib/zplc_core/include/zplc_scheduler.h`

## `zplc_comm_dispatch.h`

zplc_comm_dispatch.h

Fuente: `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`

### Funciones

#### `zplc_comm_fb_size`

```c
static inline uint16_t zplc_comm_fb_size(uint32_t kind);
```

**Resumen fuente:** Instance size in bytes of a function block of the given kind.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `kind` | `uint32_t` | A zplc_comm_fb_kind_t value (any width, so that an operand read from the code segment can be passed unchecked). |

**Retorno fuente:** The size from the generated table, or 0 for a kind with no layout.

#### `zplc_comm_register_handler`

```c
int zplc_comm_register_handler(zplc_comm_fb_kind_t kind, zplc_comm_handler_t fn);
```

**Resumen fuente:** Register a handler for a communication FB kind.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | — |
| `fn` | `zplc_comm_handler_t` | — |

#### `zplc_comm_fb_exec`

```c
int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint8_t *fb_mem);
```

**Resumen fuente:** Execute a communication FB instance (called by VM from OP_COMM_EXEC).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | — |
| `fb_mem` | `uint8_t *` | — |

#### `zplc_comm_fb_reset`

```c
int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint8_t *fb_mem);
```

**Resumen fuente:** Reset a communication FB instance (called by VM from OP_COMM_RESET).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | — |
| `fb_mem` | `uint8_t *` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_comm_fb_kind_t` | Enumeración | Communication function block kind identifiers. |
| `zplc_comm_status_t` | Enumeración | Communication status codes written to FB.STATUS. |
| `zplc_comm_handler_t` | Typedef | Comm FB handler function type. |

### Constantes y macros

Ninguno.

## `zplc_core.h`

ZPLC Core Runtime Public API

This header declares the public interface for the ZPLC Virtual Machine. The API supports two usage patterns: 1. **Legacy Singleton API** (zplc_core_*): Uses a default VM instance. Simple to use for single-task applications. 2. **Instance-based API** (zplc_vm_*): Each task gets its own VM instance. Required for multi-task scheduling where each task has private state. Memory Model: - IPI/OPI: Shared across all VM instances (synchronized by scheduler) - Work/Retain: Shared (tasks coordinate via addresses) - Stack/CallStack/PC: Private per VM instance - Code: Shared (multiple VMs can reference same code with different entry points)

Fuente: `firmware/lib/zplc_core/include/zplc_core.h`

### Funciones

#### `zplc_mem_init`

```c
int zplc_mem_init(void);
```

**Resumen fuente:** Initialize shared memory regions.

Zeros IPI, OPI, Work, and Retain memory. Call once at system startup, before creating any VM instances.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success

#### `zplc_mem_get_region`

```c
uint8_t* zplc_mem_get_region(uint16_t base);
```

**Resumen fuente:** Get pointer to shared memory region.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `base` | `uint16_t` | Base address (ZPLC_MEM_IPI_BASE, etc.) |

**Retorno fuente:** Pointer to memory region, or NULL if invalid

#### `zplc_mem_get_code`

```c
const uint8_t* zplc_mem_get_code(uint16_t offset, size_t size);
```

**Resumen fuente:** Get pointer to code segment.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Offset within code segment |
| `size` | `size_t` | Size of code to access |

**Retorno fuente:** Pointer to code, or NULL if out of bounds

#### `zplc_mem_get_code_size`

```c
uint32_t zplc_mem_get_code_size(void);
```

**Resumen fuente:** Get current loaded code size.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Total bytes loaded in code segment

#### `zplc_vm_init`

```c
int zplc_vm_init(zplc_vm_t *vm);
```

**Resumen fuente:** Initialize a VM instance.

Resets all execution state. Does not allocate memory. The zplc_vm_t struct must already be allocated.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** 0 on success

#### `zplc_vm_set_entry`

```c
int zplc_vm_set_entry(zplc_vm_t *vm, uint16_t entry_point, uint32_t code_size);
```

**Resumen fuente:** Configure VM to execute code at specified entry point.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |
| `entry_point` | `uint16_t` | Offset within code segment |
| `code_size` | `uint32_t` | Size of code for this task |

**Retorno fuente:** 0 on success, negative on error

**Notas fuente:**
- This low-level API is for trusted embedders and does not verify bytecode. Product artifact-admission routes must use zplc_core_load or zplc_core_load_tasks; embedders must verify before supplying or modifying executable code.

#### `zplc_vm_step`

```c
int zplc_vm_step(zplc_vm_t *vm);
```

**Resumen fuente:** Execute a single instruction.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** ZPLC_VM_OK on success, error code otherwise

#### `zplc_vm_run`

```c
int zplc_vm_run(zplc_vm_t *vm, uint32_t max_instructions);
```

**Resumen fuente:** Run VM for a fixed number of instructions or until halted.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |
| `max_instructions` | `uint32_t` | Maximum instructions (0 = unlimited) |

**Retorno fuente:** Number of instructions executed, or negative error code

#### `zplc_vm_run_bounded`

```c
int zplc_vm_run_bounded(zplc_vm_t *vm, uint32_t max_instructions);
```

**Resumen fuente:** Run a VM with a mandatory logical instruction bound.

Unlike zplc_vm_run(), reaching the bound is a controlled VM watchdog fault. A NULL VM or zero bound is rejected without changing VM state.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | — |
| `max_instructions` | `uint32_t` | — |

**Retorno fuente:** Number of instructions executed, or negative VM error code.

#### `zplc_vm_run_cycle`

```c
int zplc_vm_run_cycle(zplc_vm_t *vm);
```

**Resumen fuente:** Run one complete PLC scan cycle.

Normally this starts a new scan: it resets PC to the entry point and executes with ZPLC_VM_CYCLE_INSTRUCTION_BUDGET. Exhausting that logical bound returns -ZPLC_VM_WATCHDOG; it is not a physical watchdog or a WCET guarantee. The exception is a scan that a breakpoint or OP_BREAK interrupted and that zplc_vm_resume() then resumed (scan_resumed is set, the VM is neither paused nor halted). That scan is continued, not restarted: PC, evaluation stack, call stack and locals stay as the pause left them, and the budget covers the whole scan, so the instructions spent before the pause still count. Breakpoints reached later in the remainder, or at the same PC in a later scan, pause again. If the VM is still paused (never resumed), the interrupted scan is abandoned and a new scan starts at the entry point. Process-image inputs are read live by the instructions, not latched per scan: whatever the caller writes to the input image while the scan is paused is seen by the rest of that scan.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** Number of instructions executed by this call (only the remainder when a scan is continued), or negative error code. A non-negative result with zplc_vm_is_paused() true means the scan was interrupted, not completed.

#### `zplc_vm_reset_cycle`

```c
void zplc_vm_reset_cycle(zplc_vm_t *vm);
```

**Resumen fuente:** Reset VM for a new cycle without full init.

Faster than zplc_vm_init() - only resets PC, SP, and status. It also abandons an interrupted scan: the continuation armed by zplc_vm_resume() is dropped, so the next zplc_vm_run_cycle() starts over. Breakpoints and the one-shot breakpoint skip are preserved.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

#### `zplc_vm_get_error`

```c
int zplc_vm_get_error(const zplc_vm_t *vm);
```

**Resumen fuente:** Get VM error code.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** Error code

#### `zplc_vm_is_halted`

```c
int zplc_vm_is_halted(const zplc_vm_t *vm);
```

**Resumen fuente:** Check if VM is halted.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** 1 if halted, 0 if running

#### `zplc_vm_get_stack`

```c
uint32_t zplc_vm_get_stack(const zplc_vm_t *vm, uint16_t index);
```

**Resumen fuente:** Get stack value.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |
| `index` | `uint16_t` | Stack index (0 = bottom) |

**Retorno fuente:** Stack value, or 0 if out of bounds

#### `zplc_vm_get_sp`

```c
uint16_t zplc_vm_get_sp(const zplc_vm_t *vm);
```

**Resumen fuente:** Get stack pointer.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** Stack pointer

#### `zplc_vm_get_pc`

```c
uint16_t zplc_vm_get_pc(const zplc_vm_t *vm);
```

**Resumen fuente:** Get program counter.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** Program counter

#### `zplc_vm_is_paused`

```c
int zplc_vm_is_paused(const zplc_vm_t *vm);
```

**Resumen fuente:** Check if VM is paused at a breakpoint.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** 1 if paused, 0 if running or halted

#### `zplc_vm_resume`

```c
int zplc_vm_resume(zplc_vm_t *vm);
```

**Resumen fuente:** Resume execution after a breakpoint pause.

Clears the paused flag so the next zplc_vm_step() continues execution, and arms a one-shot skip of the breakpoint at the current PC. If the VM was paused, the scan it interrupted is marked as resumed: the next zplc_vm_run_cycle() continues that scan from the preserved PC and stacks instead of restarting at the entry point (see zplc_vm_run_cycle()). Resuming a VM that is not paused arms only the breakpoint skip. The mark is dropped by zplc_vm_reset_cycle(), zplc_vm_set_entry(), zplc_vm_init() (and thus by a program load) and when the continued scan starts running.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** 0 on success, -1 if NULL

#### `zplc_vm_add_breakpoint`

```c
int zplc_vm_add_breakpoint(zplc_vm_t *vm, uint16_t pc);
```

**Resumen fuente:** Add a breakpoint at a program counter address.

When the VM's PC reaches this address, execution will pause.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |
| `pc` | `uint16_t` | Program counter address to break at |

**Retorno fuente:** 0 on success, -1 if NULL, -2 if breakpoint table full, -3 if already exists

#### `zplc_vm_remove_breakpoint`

```c
int zplc_vm_remove_breakpoint(zplc_vm_t *vm, uint16_t pc);
```

**Resumen fuente:** Remove a breakpoint at a program counter address.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |
| `pc` | `uint16_t` | Program counter address to remove |

**Retorno fuente:** 0 on success, -1 if NULL, -2 if not found

#### `zplc_vm_clear_breakpoints`

```c
int zplc_vm_clear_breakpoints(zplc_vm_t *vm);
```

**Resumen fuente:** Clear all breakpoints.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** 0 on success, -1 if NULL

#### `zplc_vm_get_breakpoint_count`

```c
uint8_t zplc_vm_get_breakpoint_count(const zplc_vm_t *vm);
```

**Resumen fuente:** Get the number of active breakpoints.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |

**Retorno fuente:** Number of breakpoints, or 0 if NULL

#### `zplc_vm_get_breakpoint`

```c
uint16_t zplc_vm_get_breakpoint(const zplc_vm_t *vm, uint8_t index);
```

**Resumen fuente:** Get a breakpoint address by index.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `const zplc_vm_t *` | Pointer to VM instance |
| `index` | `uint8_t` | Index in breakpoint array (0 to count-1) |

**Retorno fuente:** PC address of breakpoint, or 0xFFFF if invalid

#### `zplc_ipi_write32`

```c
int zplc_ipi_write32(uint16_t offset, uint32_t value);
```

**Resumen fuente:** Write a 32-bit value to IPI.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |
| `value` | `uint32_t` | Value to write |

**Retorno fuente:** 0 on success, -1 if out of bounds

#### `zplc_ipi_write16`

```c
int zplc_ipi_write16(uint16_t offset, uint16_t value);
```

**Resumen fuente:** Write a 16-bit value to IPI.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |
| `value` | `uint16_t` | Value to write |

**Retorno fuente:** 0 on success, -1 if out of bounds

#### `zplc_ipi_write8`

```c
int zplc_ipi_write8(uint16_t offset, uint8_t value);
```

**Resumen fuente:** Write an 8-bit value to IPI.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |
| `value` | `uint8_t` | Value to write |

**Retorno fuente:** 0 on success, -1 if out of bounds

#### `zplc_ipi_read32`

```c
uint32_t zplc_ipi_read32(uint16_t offset);
```

**Resumen fuente:** Read a 32-bit value from IPI.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |

**Retorno fuente:** Value at offset, or 0 if out of bounds

#### `zplc_ipi_read16`

```c
uint16_t zplc_ipi_read16(uint16_t offset);
```

**Resumen fuente:** Read a 16-bit value from IPI.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |

**Retorno fuente:** Value at offset, or 0 if out of bounds

#### `zplc_ipi_read8`

```c
uint8_t zplc_ipi_read8(uint16_t offset);
```

**Resumen fuente:** Read an 8-bit value from IPI.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within IPI |

**Retorno fuente:** Value at offset, or 0 if out of bounds

#### `zplc_opi_read32`

```c
uint32_t zplc_opi_read32(uint16_t offset);
```

**Resumen fuente:** Read a 32-bit value from OPI.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within OPI |

**Retorno fuente:** Value at offset, or 0 if out of bounds

#### `zplc_opi_read16`

```c
uint16_t zplc_opi_read16(uint16_t offset);
```

**Resumen fuente:** Read a 16-bit value from OPI.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within OPI |

**Retorno fuente:** Value at offset, or 0 if out of bounds

#### `zplc_opi_read8`

```c
uint8_t zplc_opi_read8(uint16_t offset);
```

**Resumen fuente:** Read an 8-bit value from OPI.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset within OPI |

**Retorno fuente:** Value at offset, or 0 if out of bounds

#### `zplc_force_set_bytes`

```c
int zplc_force_set_bytes(uint16_t addr, const uint8_t *bytes, uint16_t size);
```

**Resumen fuente:** Set a forced byte range and apply it immediately.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `addr` | `uint16_t` | Absolute logical address |
| `bytes` | `const uint8_t *` | Forced bytes buffer |
| `size` | `uint16_t` | Number of bytes in the buffer |

**Retorno fuente:** 0 on success, negative on error

#### `zplc_force_clear`

```c
int zplc_force_clear(uint16_t addr);
```

**Resumen fuente:** Clear the force entry that starts at the given address.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `addr` | `uint16_t` | Absolute logical address of the force entry |

**Retorno fuente:** 0 on success, negative on error

#### `zplc_force_clear_all`

```c
void zplc_force_clear_all(void);
```

**Resumen fuente:** Clear all active force entries.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_force_get_count`

```c
uint8_t zplc_force_get_count(void);
```

**Resumen fuente:** Get the number of active force entries.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Active entry count

#### `zplc_force_get`

```c
int zplc_force_get(uint8_t index, uint16_t *addr, uint16_t *size, uint8_t *bytes, size_t bytes_capacity);
```

**Resumen fuente:** Get a force entry by index.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `index` | `uint8_t` | Force table index |
| `addr` | `uint16_t *` | Output absolute address |
| `size` | `uint16_t *` | Output byte count |
| `bytes` | `uint8_t *` | Output buffer receiving the stored bytes, or NULL to query metadata only when @p bytes_capacity is zero |
| `bytes_capacity` | `size_t` | Capacity of @p bytes in bytes |

**Retorno fuente:** 0 on success, negative on error

#### `zplc_force_write_bytes`

```c
int zplc_force_write_bytes(uint16_t addr, const uint8_t *bytes, uint16_t size);
```

**Resumen fuente:** Write raw bytes then re-apply any overlapping force overrides.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `addr` | `uint16_t` | Absolute logical address |
| `bytes` | `const uint8_t *` | Source bytes |
| `size` | `uint16_t` | Number of bytes to write |

**Retorno fuente:** 0 on success, negative on error

#### `zplc_pi_lock`

```c
int zplc_pi_lock(void);
```

**Resumen fuente:** Lock the Process Image.

Acquires a mutex or spinlock to protect memory regions. Must be called before accessing IPI/OPI from external threads.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative on error or timeout

#### `zplc_pi_unlock`

```c
void zplc_pi_unlock(void);
```

**Resumen fuente:** Unlock the Process Image.

Releases the lock acquired by zplc_pi_lock.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_core_get_tag_count`

```c
uint16_t zplc_core_get_tag_count(void);
```

**Resumen fuente:** Get the number of variable tags loaded.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_core_get_tag`

```c
const zplc_tag_entry_t* zplc_core_get_tag(uint16_t index);
```

**Resumen fuente:** Get a variable tag by index.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `index` | `uint16_t` | Tag index (0 to count-1) |

**Retorno fuente:** Pointer to tag entry, or NULL if out of bounds.

#### `zplc_core_version`

```c
const char* zplc_core_version(void);
```

**Resumen fuente:** Get the ZPLC core version string.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Version string in format "major.minor.patch"

#### `zplc_core_init`

```c
int zplc_core_init(void);
```

**Resumen fuente:** Initialize the ZPLC core.

Initializes shared memory and default VM instance.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success

#### `zplc_core_shutdown`

```c
int zplc_core_shutdown(void);
```

**Resumen fuente:** Shutdown the ZPLC core.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success

#### `zplc_core_load`

```c
int zplc_core_load(const uint8_t *binary, size_t size, uint8_t *workspace, size_t workspace_size);
```

**Resumen fuente:** Load a .zplc binary program.

On success this replaces the loaded program and resets process/work/retain memory and forces to their safe initialized state before committing it. On rejection it leaves the current core state intact. The artifact must not overlap core-owned memory because the successful reset invalidates it.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `binary` | `const uint8_t *` | Pointer to .zplc file contents |
| `size` | `size_t` | Size of binary data |
| `workspace` | `uint8_t *` | Caller-owned verifier scratch |
| `workspace_size` | `size_t` | Size of @p workspace in bytes |

**Retorno fuente:** 0 on success, ZPLC_LOADER_* error otherwise

#### `zplc_core_step`

```c
int zplc_core_step(void);
```

**Resumen fuente:** Execute a single instruction.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** ZPLC_VM_OK on success, error code otherwise

#### `zplc_core_run`

```c
int zplc_core_run(uint32_t max_instructions);
```

**Resumen fuente:** Run VM for a fixed number of instructions.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `max_instructions` | `uint32_t` | Maximum instructions (0 = unlimited) |

**Retorno fuente:** Number of instructions executed, or negative error code

#### `zplc_core_run_cycle`

```c
int zplc_core_run_cycle(void);
```

**Resumen fuente:** Run one complete PLC scan cycle.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Number of instructions executed, or negative error code

#### `zplc_core_get_state`

```c
const zplc_vm_state_t* zplc_core_get_state(void);
```

**Resumen fuente:** Get a read-only pointer to the default VM state.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Pointer to VM state (legacy zplc_vm_state_t)

#### `zplc_core_get_sp`

```c
uint16_t zplc_core_get_sp(void);
```

**Resumen fuente:** Get the current stack pointer.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Stack pointer value

#### `zplc_core_get_pc`

```c
uint16_t zplc_core_get_pc(void);
```

**Resumen fuente:** Get the current program counter.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Program counter value

#### `zplc_core_get_stack`

```c
uint32_t zplc_core_get_stack(uint16_t index);
```

**Resumen fuente:** Get a value from the evaluation stack.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `index` | `uint16_t` | Stack index (0 = bottom) |

**Retorno fuente:** Stack value

#### `zplc_core_get_error`

```c
int zplc_core_get_error(void);
```

**Resumen fuente:** Get the last error code.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Error code

#### `zplc_core_is_halted`

```c
int zplc_core_is_halted(void);
```

**Resumen fuente:** Check if VM is halted.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 1 if halted, 0 if running

#### `zplc_core_set_ipi`

```c
int zplc_core_set_ipi(uint16_t offset, uint32_t value);
```

**Resumen fuente:** Write to IPI (legacy).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset |
| `value` | `uint32_t` | 32-bit value |

**Retorno fuente:** 0 on success

#### `zplc_core_set_ipi16`

```c
int zplc_core_set_ipi16(uint16_t offset, uint16_t value);
```

**Resumen fuente:** Write 16-bit to IPI (legacy).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset |
| `value` | `uint16_t` | 16-bit value |

**Retorno fuente:** 0 on success

#### `zplc_core_get_opi`

```c
uint32_t zplc_core_get_opi(uint16_t offset);
```

**Resumen fuente:** Read from OPI (legacy).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | Byte offset |

**Retorno fuente:** 32-bit value

#### `zplc_core_get_default_vm`

```c
zplc_vm_t* zplc_core_get_default_vm(void);
```

**Resumen fuente:** Get pointer to default VM instance.

Useful for transitioning code to instance-based API.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Pointer to default VM

#### `zplc_core_load_tasks`

```c
int zplc_core_load_tasks(const uint8_t *binary, size_t size, zplc_task_def_t *tasks, uint8_t max_tasks, uint8_t *workspace, size_t workspace_size);
```

**Resumen fuente:** Load tasks from a .zplc binary containing a TASK segment.

Parses the TASK segment and populates an array of task definitions. Also loads the code segment into shared memory.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `binary` | `const uint8_t *` | Pointer to .zplc file contents |
| `size` | `size_t` | Size of binary data |
| `tasks` | `zplc_task_def_t *` | Output array to fill with task definitions |
| `max_tasks` | `uint8_t` | Maximum number of tasks to load |
| `workspace` | `uint8_t *` | Caller-owned verifier scratch |
| `workspace_size` | `size_t` | Size of @p workspace in bytes |

**Retorno fuente:** Number of tasks loaded, or a ZPLC_LOADER_* error code

#### `zplc_task_get_entry`

```c
static inline uint16_t zplc_task_get_entry(const zplc_task_def_t *task);
```

**Resumen fuente:** Get entry point for a loaded task.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `task` | `const zplc_task_def_t *` | Pointer to task definition |

**Retorno fuente:** Entry point offset in code segment

#### `zplc_task_get_interval_us`

```c
static inline uint32_t zplc_task_get_interval_us(const zplc_task_def_t *task);
```

**Resumen fuente:** Get interval in microseconds for a task.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `task` | `const zplc_task_def_t *` | Pointer to task definition |

**Retorno fuente:** Interval in microseconds

#### `zplc_task_get_priority`

```c
static inline uint8_t zplc_task_get_priority(const zplc_task_def_t *task);
```

**Resumen fuente:** Get priority for a task.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `task` | `const zplc_task_def_t *` | Pointer to task definition |

**Retorno fuente:** Priority (0 = highest)

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `pc` | Estructura | VM instance structure. |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_VM_CYCLE_INSTRUCTION_BUDGET` | `CONFIG_ZPLC_VM_CYCLE_INSTRUCTION_BUDGET` | — |
| `ZPLC_VM_CYCLE_INSTRUCTION_BUDGET` | `100000U` | — |
| `ZPLC_FORCE_MAX_ENTRIES` | `8U` | Maximum number of independent forced ranges. |
| `ZPLC_FORCE_MAX_BYTES` | `260U` | Maximum byte length of one forced range. |

## `zplc_debug.h`

ZPLC Hardware-in-the-Loop Debug API

This header declares the debug output API for HIL (Hardware-in-the-Loop) testing. When enabled, the runtime outputs JSON-formatted trace information via the Zephyr shell for parsing by the HIL test framework. The debug output is runtime-controllable (not compile-time), allowing the same firmware to be used in production and testing modes. Protocol: Line-based JSON with CRLF terminators. See: specs/002-hil-testing/contracts/debug-protocol.md

Fuente: `firmware/lib/zplc_core/include/zplc_debug.h`

### Funciones

#### `hil_set_mode`

```c
void hil_set_mode(hil_mode_t mode);
```

**Resumen fuente:** Set the HIL debug output mode.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `mode` | `hil_mode_t` | The desired debug mode |

#### `hil_get_mode`

```c
hil_mode_t hil_get_mode(void);
```

**Resumen fuente:** Get the current HIL debug output mode.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Current debug mode

#### `hil_set_shell`

```c
void hil_set_shell(const struct shell *sh);
```

**Resumen fuente:** Set the shell instance for debug output.

Must be called before any trace functions. Typically called by the `zplc hil mode` shell command.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `sh` | `const struct shell *` | Pointer to shell instance |

#### `hil_trace_opcode`

```c
void hil_trace_opcode(uint8_t op, uint16_t pc, uint8_t sp, int32_t tos);
```

**Resumen fuente:** Trace an opcode execution.

Emits: \{"t":"opcode","op":"ADD","pc":18,"sp":2,"tos":7\} Only outputs in HIL_MODE_VERBOSE.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `op` | `uint8_t` | Opcode value (from zplc_opcode_t) |
| `pc` | `uint16_t` | Program counter BEFORE execution |
| `sp` | `uint8_t` | Stack pointer AFTER execution |
| `tos` | `int32_t` | Top of stack value AFTER execution (signed) |

#### `hil_trace_fb`

```c
void hil_trace_fb(const char *name, uint8_t id, bool q, int32_t et_or_cv);
```

**Resumen fuente:** Trace a function block execution.

Emits: \{"t":"fb","name":"TON","id":0,"q":true,"et":100\} Outputs in HIL_MODE_SUMMARY and HIL_MODE_VERBOSE.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `name` | `const char *` | Function block type name (e.g., "TON", "CTU") |
| `id` | `uint8_t` | Instance ID (0-255) |
| `q` | `bool` | Q output value |
| `et_or_cv` | `int32_t` | Elapsed time (timers) or current value (counters), -1 if N/A |

#### `hil_trace_task`

```c
void hil_trace_task(uint8_t id, uint32_t start_ms, uint32_t end_ms, uint32_t us, bool overrun);
```

**Resumen fuente:** Trace a task completion.

Emits: \{"t":"task","id":1,"start":1000,"end":1045,"us":45,"ovr":false\} Outputs in HIL_MODE_SUMMARY and HIL_MODE_VERBOSE.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
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

**Resumen fuente:** Trace a VM cycle completion.

Emits: \{"t":"cycle","n":100,"us":850,"tasks":3\} Outputs in HIL_MODE_SUMMARY and HIL_MODE_VERBOSE.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `n` | `uint32_t` | Cycle number (0-2^31) |
| `us` | `uint32_t` | Total cycle time in microseconds |
| `tasks` | `uint8_t` | Number of tasks executed this cycle |

#### `hil_trace_error`

```c
void hil_trace_error(uint8_t code, const char *msg, uint16_t pc);
```

**Resumen fuente:** Trace a VM error.

Emits: \{"t":"error","code":3,"msg":"DIV_BY_ZERO","pc":42\} Always outputs regardless of mode (errors are always important).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `code` | `uint8_t` | Error code (from zplc_vm_error_t) |
| `msg` | `const char *` | Human-readable error message |
| `pc` | `uint16_t` | Program counter where error occurred |

#### `hil_trace_break`

```c
void hil_trace_break(uint16_t pc);
```

**Resumen fuente:** Trace a breakpoint hit.

Emits: \{"t":"break","pc":42\} Always outputs regardless of mode (breakpoint events are critical).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pc` | `uint16_t` | Program counter where the breakpoint was hit |

#### `hil_trace_watch`

```c
void hil_trace_watch(uint16_t addr, const char *type, int32_t val);
```

**Resumen fuente:** Trace a watched variable change.

Emits: \{"t":"watch","addr":8192,"type":"i32","val":42\}

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `addr` | `uint16_t` | Variable address |
| `type` | `const char *` | Type string: "i8", "i16", "i32", "u8", "u16", "u32", "f32", "bool" |
| `val` | `int32_t` | Current value (as signed 32-bit, caller converts) |

#### `hil_send_ready`

```c
void hil_send_ready(const char *fw_version, const char *caps);
```

**Resumen fuente:** Send the ready signal on boot.

Emits: \{"t":"ready","fw":"1.5.0","caps":["sched","hil"]\} Should be called once after boot when shell is ready.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `fw_version` | `const char *` | Firmware version string (e.g., "1.5.0") |
| `caps` | `const char *` | Comma-separated capability list (e.g., "sched,hil,sfc") |

#### `hil_send_ack`

```c
void hil_send_ack(const char *cmd, const char *val, bool ok, const char *err);
```

**Resumen fuente:** Send a command acknowledgment.

Emits: \{"t":"ack","cmd":"mode","val":"verbose","ok":true\}

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `cmd` | `const char *` | Command name that was executed |
| `val` | `const char *` | Value that was set |
| `ok` | `bool` | True if command succeeded |
| `err` | `const char *` | Error message if ok is false, NULL otherwise |

#### `hil_opcode_name`

```c
const char *hil_opcode_name(uint8_t op);
```

**Resumen fuente:** Get the string name for an opcode.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `op` | `uint8_t` | Opcode value |

**Retorno fuente:** Opcode name string (e.g., "ADD", "PUSH32"), or "???" if unknown

#### `hil_error_name`

```c
const char *hil_error_name(uint8_t code);
```

**Resumen fuente:** Get the string name for a VM error code.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `code` | `uint8_t` | Error code (from zplc_vm_error_t) |

**Retorno fuente:** Error name string (e.g., "DIV_BY_ZERO"), or "UNKNOWN" if invalid

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `hil_mode_t` | Enumeración | HIL debug output modes. |

### Constantes y macros

Ninguno.

## `zplc_hal.h`

ZPLC Hardware Abstraction Layer Interface

This header defines the contract between the ZPLC Core and the underlying platform. The Core NEVER calls hardware directly - all access goes through these functions. Each target platform (POSIX, Zephyr, WASM, Windows) provides its own implementation of this interface.

Fuente: `firmware/lib/zplc_core/include/zplc_hal.h`

### Funciones

#### `zplc_hal_tick`

```c
uint32_t zplc_hal_tick(void);
```

**Resumen fuente:** Get the current system tick in milliseconds.

This is the primary timekeeping function for the runtime scheduler. Must be monotonically increasing (no rollover handling required for at least 49 days with uint32_t).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Current tick count in milliseconds since system start.

**Notas fuente:**
- Platform implementations: - POSIX: clock_gettime(CLOCK_MONOTONIC) - Zephyr: k_uptime_get() - WASM: performance.now()

#### `zplc_hal_sleep`

```c
void zplc_hal_sleep(uint32_t ms);
```

**Resumen fuente:** Sleep for the specified number of milliseconds.

Blocking sleep - use only for cycle timing, never in logic execution.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `ms` | `uint32_t` | Number of milliseconds to sleep. |

**Notas fuente:**
- Platform implementations: - POSIX: nanosleep() - Zephyr: k_msleep() - WASM: Atomics.wait() or async yield

#### `zplc_hal_gpio_read`

```c
zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value);
```

**Resumen fuente:** Read a digital input channel.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `channel` | `uint8_t` | Logical channel number (0-based). |
| `value` | `uint8_t *` | Pointer to store the read value (0 or 1). |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_gpio_write`

```c
zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value);
```

**Resumen fuente:** Write to a digital output channel.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `channel` | `uint8_t` | Logical channel number (0-based). |
| `value` | `uint8_t` | Value to write (0 or 1). |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_adc_read`

```c
zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value);
```

**Resumen fuente:** Read an analog input channel.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `channel` | `uint8_t` | Logical channel number (0-based). |
| `value` | `uint16_t *` | Pointer to store the read value (raw ADC counts or scaled). |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_dac_write`

```c
zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value);
```

**Resumen fuente:** Write to an analog output channel (DAC).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `channel` | `uint8_t` | Logical channel number (0-based). |
| `value` | `uint16_t` | Value to write (raw DAC counts or scaled). |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_persist_save`

```c
zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data, size_t len);
```

**Resumen fuente:** Save data to persistent storage.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `key` | `const char *` | Identifier string for the data block. |
| `data` | `const void *` | Pointer to data to save. |
| `len` | `size_t` | Length of data in bytes. |

**Retorno fuente:** ZPLC_HAL_OK on success, ZPLC_HAL_COMMIT_UNKNOWN when a visible mutation could not be confirmed durable, error code otherwise.

#### `zplc_hal_persist_load`

```c
zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data, size_t len);
```

**Resumen fuente:** Load data from persistent storage.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `key` | `const char *` | Identifier string for the data block. |
| `data` | `void *` | Buffer to load data into. |
| `len` | `size_t` | Maximum length to read. |

**Retorno fuente:** ZPLC_HAL_OK on success, ZPLC_HAL_NOT_IMPL if key not found, ZPLC_HAL_CORRUPT if an existing record is structurally invalid, error code otherwise.

#### `zplc_hal_persist_delete`

```c
zplc_hal_result_t zplc_hal_persist_delete(const char *key);
```

**Resumen fuente:** Delete data from persistent storage.

Removes the specified key from persistent storage.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `key` | `const char *` | Identifier string for the data block to delete. |

**Retorno fuente:** ZPLC_HAL_OK on success, ZPLC_HAL_NOT_IMPL if key not found, error code otherwise.

#### `zplc_hal_net_init`

```c
zplc_hal_result_t zplc_hal_net_init(void);
```

**Resumen fuente:** Initialize the networking stack.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_net_get_ip`

```c
zplc_hal_result_t zplc_hal_net_get_ip(char *buf, size_t len);
```

**Resumen fuente:** Get the current IP address of the device.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `buf` | `char *` | Buffer to store the IP address string (e.g., "192.168.1.100") |
| `len` | `size_t` | Maximum length of the buffer |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_dns_resolve`

```c
zplc_hal_result_t zplc_hal_dns_resolve(const char *hostname, char *ip_buf, size_t len);
```

**Resumen fuente:** Resolve a hostname to an IP address.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `hostname` | `const char *` | Hostname string to resolve |
| `ip_buf` | `char *` | Buffer to store the resolved IP address string |
| `len` | `size_t` | Maximum length of the IP buffer |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_mutex_create`

```c
zplc_hal_mutex_t zplc_hal_mutex_create(void);
```

**Resumen fuente:** Create a new mutex.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Mutex handle on success, NULL on failure.

#### `zplc_hal_mutex_lock`

```c
zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex);
```

**Resumen fuente:** Lock a mutex. Blocks until available.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `mutex` | `zplc_hal_mutex_t` | Mutex handle. |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_mutex_unlock`

```c
zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex);
```

**Resumen fuente:** Unlock a mutex.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `mutex` | `zplc_hal_mutex_t` | Mutex handle. |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_mutex_destroy`

```c
zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex);
```

**Resumen fuente:** Destroy a mutex and release its resources.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `mutex` | `zplc_hal_mutex_t` | Mutex handle. |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_socket_connect`

```c
zplc_hal_socket_t zplc_hal_socket_connect(const char *host, uint16_t port);
```

**Resumen fuente:** Create a TCP socket and connect to a remote host.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `host` | `const char *` | Hostname or IP address string. |
| `port` | `uint16_t` | Port number. |

**Retorno fuente:** Socket handle on success, NULL on failure.

#### `zplc_hal_socket_send`

```c
int32_t zplc_hal_socket_send(zplc_hal_socket_t sock, const void *data, size_t len);
```

**Resumen fuente:** Send data over a socket.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `sock` | `zplc_hal_socket_t` | Socket handle. |
| `data` | `const void *` | Data buffer to send. |
| `len` | `size_t` | Length of data. |

**Retorno fuente:** Number of bytes sent, or negative error code.

#### `zplc_hal_socket_recv`

```c
int32_t zplc_hal_socket_recv(zplc_hal_socket_t sock, void *buf, size_t len);
```

**Resumen fuente:** Receive data from a socket.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `sock` | `zplc_hal_socket_t` | Socket handle. |
| `buf` | `void *` | Buffer to receive into. |
| `len` | `size_t` | Maximum bytes to receive. |

**Retorno fuente:** Number of bytes received, or negative error code.

#### `zplc_hal_socket_close`

```c
zplc_hal_result_t zplc_hal_socket_close(zplc_hal_socket_t sock);
```

**Resumen fuente:** Close a socket.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `sock` | `zplc_hal_socket_t` | Socket handle to close. |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_log`

```c
void zplc_hal_log(const char *fmt, ...);
```

**Resumen fuente:** Log a formatted message.

Printf-style logging for runtime diagnostics.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `fmt` | `const char *` | Format string (printf-style). |
| `...` | `variadic` | Variable arguments. |

**Notas fuente:**
- Platform implementations: - POSIX: fprintf(stderr, ...) - Zephyr: printk() or LOG_INF() - WASM: console.log() via JS bridge

#### `zplc_hal_init`

```c
zplc_hal_result_t zplc_hal_init(void);
```

**Resumen fuente:** Initialize the HAL layer.

Must be called before any other HAL functions. Sets up hardware peripherals, timers, and communication channels.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

#### `zplc_hal_shutdown`

```c
zplc_hal_result_t zplc_hal_shutdown(void);
```

**Resumen fuente:** Shutdown the HAL layer.

Clean shutdown - close sockets, flush persistence, release resources.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** ZPLC_HAL_OK on success, error code otherwise.

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_hal_result_t` | Enumeración | HAL operation result codes |
| `zplc_hal_socket_t` | Typedef | Opaque socket handle |
| `zplc_hal_mutex_t` | Typedef | Opaque mutex handle |

### Constantes y macros

Ninguno.

## `zplc_hal_posix.h`

POSIX-only logical clock seam for deterministic host scenarios.

The override is process-global because the native POSIX simulator currently owns one VM/session on one thread. If concurrent sessions are introduced, move this clock into the VM/session context rather than adding locking here.

Fuente: `firmware/lib/zplc_core/include/zplc_hal_posix.h`

### Funciones

#### `zplc_hal_posix_set_tick_override`

```c
void zplc_hal_posix_set_tick_override(uint32_t tick_ms);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `tick_ms` | `uint32_t` | — |

#### `zplc_hal_posix_clear_tick_override`

```c
void zplc_hal_posix_clear_tick_override(void);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

### Tipos

Ninguno.

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_HAL_POSIX_H` | `—` | — |

## `zplc_isa.h`

ZPLC Virtual Machine Instruction Set Architecture Definitions

This header defines the binary format and instruction set for the ZPLC VM. It is the contract between the compiler (IDE) and runtime (VM). See docs/ISA.md for the complete specification.

Fuente: `firmware/lib/zplc_core/include/zplc_isa.h`

### Funciones

#### `zplc_opcode_operand_size`

```c
static inline uint8_t zplc_opcode_operand_size(uint8_t opcode);
```

**Resumen fuente:** Get the operand size for an opcode.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `opcode` | `uint8_t` | The opcode byte. |

**Retorno fuente:** Operand size in bytes (0, 1, 2, or 4).

#### `zplc_opcode_instruction_size`

```c
static inline uint8_t zplc_opcode_instruction_size(uint8_t opcode);
```

**Resumen fuente:** Get the total instruction size for an opcode.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `opcode` | `uint8_t` | The opcode byte. |

**Retorno fuente:** Total instruction size in bytes (1, 2, 3, or 5).

#### `zplc_opcode_is_valid`

```c
static inline int zplc_opcode_is_valid(uint8_t opcode);
```

**Resumen fuente:** Check if an opcode is valid.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `opcode` | `uint8_t` | The opcode byte. |

**Retorno fuente:** 1 if valid, 0 if invalid.

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_data_type_t` | Enumeración | IEC 61131-3 data type identifiers. |
| `zplc_opcode_t` | Enumeración | VM instruction opcodes. |
| `magic` | Estructura | .zplc file header (32 bytes). |
| `zplc_file_flags_t` | Enumeración | File header flags. |
| `type` | Estructura | Segment table entry (8 bytes). |
| `zplc_segment_type_t` | Enumeración | Segment types. |
| `id` | Estructura | Task definition (16 bytes). |
| `zplc_task_type_t` | Enumeración | Task types. |
| `var_addr` | Estructura | I/O map entry (8 bytes). |
| `zplc_io_direction_t` | Enumeración | I/O direction. |
| `var_addr` | Estructura | Variable tag entry (8 bytes). Used for mapping variables to communication protocols. |
| `zplc_tag_id_t` | Enumeración | Tag identifiers. |
| `zplc_vm_error_t` | Enumeración | VM error codes. |
| `zplc_vm_flags_t` | Enumeración | VM status flags. |
| `pc` | Estructura | VM execution state. |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
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
| `ZPLC_SYS_FLAG_WDG_WARN` | `0x02` | Reserved system flag; not produced by current runtimes. |
| `ZPLC_SYS_FLAG_RUNNING` | `0x04` | System flags: Scheduler is running |
| `ZPLC_STRING_LEN_OFFSET` | `0` | STRING memory layout. |
| `ZPLC_STRING_CAP_OFFSET` | `2` | — |
| `ZPLC_STRING_DATA_OFFSET` | `4` | — |
| `ZPLC_STRING_DEFAULT_SIZE` | `80` | — |
| `ZPLC_STRING_MAX_SIZE` | `255` | — |
| `ZPLC_OPCODE_COUNT` | `78` | Number of defined opcodes. |
| `ZPLC_FILE_HEADER_SIZE` | `32` | Expected size of file header |
| `ZPLC_SEGMENT_ENTRY_SIZE` | `8` | Expected size of segment entry |
| `ZPLC_TASK_DEF_SIZE` | `16` | Expected size of task definition |
| `ZPLC_IOMAP_ENTRY_SIZE` | `8` | Expected size of I/O map entry |
| `ZPLC_TAG_ENTRY_SIZE` | `8` | Expected size of tag entry |

## `zplc_loader.h`

ZPLC Binary File Loader

Verifies the structural and bytecode integrity of .zplc files without changing runtime state. The current v1 subset accepts flags=0 and CODE, TASK, and TAGS segments only. The returned view borrows the input buffer.

Fuente: `firmware/lib/zplc_core/include/zplc_loader.h`

### Funciones

#### `zplc_loader_verify`

```c
int zplc_loader_verify(const uint8_t *data, size_t len, uint8_t *workspace, size_t workspace_size, zplc_program_view_t *out);
```

**Resumen fuente:** Verify the supported structural and semantic v1 ZPLC subset.

This does not load or authorize a runtime. Product load paths remain a separate integration gate.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `data` | `const uint8_t *` | Pointer to the file data |
| `len` | `size_t` | Length of the data in bytes |
| `workspace` | `uint8_t *` | Caller-owned transient scratch of at least ZPLC_LOADER_VERIFY_WORKSPACE_SIZE bytes |
| `workspace_size` | `size_t` | Size of @p workspace in bytes |
| `out` | `zplc_program_view_t *` | Destination for the verified view; untouched on failure |

**Retorno fuente:** 0 on success, negative error code on failure. The view remains valid only while @p data remains valid.

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `type` | Estructura | — |
| `binary` | Estructura | — |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
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
| `ZPLC_LOADER_ERR_COMM` | `-16` | Communication function-block kind is NONE or at or above the kind limit |
| `ZPLC_LOADER_MAX_TASKS` | `16U` | — |

## `zplc_scheduler.h`

ZPLC Multitask Scheduler API

This header defines the API for the ZPLC multitask scheduler. The scheduler supports multiple PLC tasks with different intervals and priorities, following IEC 61131-3 task model. Architecture (Zephyr implementation): - Each task has a k_timer that fires at the configured interval - Timer callbacks admit due task releases without executing PLC code - One coordinator executes each ordered due-set as a batch - Each batch takes one IPI snapshot and performs at most one normal OPI commit - Shared memory (IPI/OPI) is protected by a mutex

Fuente: `firmware/lib/zplc_core/include/zplc_scheduler.h`

### Funciones

#### `zplc_sched_init`

```c
int zplc_sched_init(void);
```

**Resumen fuente:** Initialize the scheduler.

Must be called before any other scheduler functions. Creates work queues and initializes synchronization primitives.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_shutdown`

```c
int zplc_sched_shutdown(void);
```

**Resumen fuente:** Shutdown the scheduler.

Stops all tasks, releases resources.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_register_task`

```c
int zplc_sched_register_task(const zplc_task_def_t *def, const uint8_t *code, size_t code_size);
```

**Resumen fuente:** Register a task with the scheduler.

The scheduler accepts only a reference to code already loaded in the core. Raw code buffers are rejected.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `def` | `const zplc_task_def_t *` | Task definition (from .zplc file or manual config) |
| `code` | `const uint8_t *` | Must be NULL |
| `code_size` | `size_t` | Must be zero |

**Retorno fuente:** Task handle (0-based index) on success, negative error code on failure

#### `zplc_sched_validate_program`

```c
int zplc_sched_validate_program(const uint8_t *binary, size_t size);
```

**Resumen fuente:** Validate whether a .zplc program can be admitted by this scheduler.

This does not alter scheduler, core, process-image, timer, or persistence state. Only cyclic tasks aligned to the scheduler's millisecond timer are accepted.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `binary` | `const uint8_t *` | — |
| `size` | `size_t` | — |

**Retorno fuente:** ZPLC_LOADER_OK on success, otherwise a ZPLC_LOADER_* error code.

#### `zplc_sched_load`

```c
int zplc_sched_load(const uint8_t *binary, size_t size);
```

**Resumen fuente:** Load a multi-task .zplc binary and register all tasks.

This is the preferred way to load multi-task PLC programs. It parses the .zplc file, loads the shared code segment, and registers each task defined in the TASK segment. The function internally uses zplc_core_load_tasks() to parse the binary and then configures VMs with appropriate entry points.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `binary` | `const uint8_t *` | Pointer to .zplc file contents |
| `size` | `size_t` | Size of binary data |

**Retorno fuente:** Number of tasks loaded on success, negative error code on failure: -1: Scheduler not initialized -2: Invalid arguments -3: Program rejected by the verifier or scheduler policy -4: Scheduler is not empty or not idle

**Notas fuente:**
- The scheduler must be IDLE with no registered tasks.

#### `zplc_sched_unregister_task`

```c
int zplc_sched_unregister_task(int task_id);
```

**Resumen fuente:** Unregister a task.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `task_id` | `int` | Task handle returned by register_task |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_start`

```c
int zplc_sched_start(void);
```

**Resumen fuente:** Start the scheduler.

Begins executing all registered tasks according to their intervals.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_stop`

```c
int zplc_sched_stop(void);
```

**Resumen fuente:** Stop the scheduler.

Stops all tasks but keeps them registered.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_enter_safe_error`

```c
int zplc_sched_enter_safe_error(void);
```

**Resumen fuente:** Latch the scheduler in ERROR and de-energize its outputs.

For a control-plane failure whose durable outcome is ambiguous. This stops timers and pending work, clears forces and the OPI, and rejects start until a fully validated replacement is loaded into an empty scheduler.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 when safe outputs were applied, otherwise the first HAL error; the ERROR latch is retained in either case.

#### `zplc_sched_pause`

```c
int zplc_sched_pause(void);
```

**Resumen fuente:** Pause the scheduler (for debugging).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_resume`

```c
int zplc_sched_resume(void);
```

**Resumen fuente:** Resume the scheduler from pause.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_step`

```c
int zplc_sched_step(void);
```

**Resumen fuente:** Execute exactly one cycle for each paused/ready task.

Used by the debugger when the scheduler is paused. Tasks remain paused after the stepped cycle unless a task enters error state.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_get_state`

```c
zplc_sched_state_t zplc_sched_get_state(void);
```

**Resumen fuente:** Get scheduler state.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Current scheduler state

#### `zplc_sched_get_stats`

```c
int zplc_sched_get_stats(zplc_sched_stats_t *stats);
```

**Resumen fuente:** Get scheduler statistics.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `stats` | `zplc_sched_stats_t *` | Pointer to stats structure to fill |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_get_task`

```c
int zplc_sched_get_task(int task_id, zplc_task_t *task);
```

**Resumen fuente:** Get task information.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `task_id` | `int` | Task handle |
| `task` | `zplc_task_t *` | Pointer to task structure to fill |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_get_task_count`

```c
int zplc_sched_get_task_count(void);
```

**Resumen fuente:** Get task count.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** Number of registered tasks

#### `zplc_sched_debug_snapshot`

```c
int zplc_sched_debug_snapshot(int task_id, zplc_sched_vm_snapshot_t *snapshot);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `task_id` | `int` | — |
| `snapshot` | `zplc_sched_vm_snapshot_t *` | — |

**Retorno fuente:** 0 on success, -1 for invalid state/arguments, -2 for no task.

#### `zplc_sched_debug_add_breakpoint`

```c
int zplc_sched_debug_add_breakpoint(int task_id, uint16_t pc);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `task_id` | `int` | — |
| `pc` | `uint16_t` | — |

**Retorno fuente:** 0 on success, or the underlying breakpoint error.

#### `zplc_sched_debug_remove_breakpoint`

```c
int zplc_sched_debug_remove_breakpoint(int task_id, uint16_t pc);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `task_id` | `int` | — |
| `pc` | `uint16_t` | — |

**Retorno fuente:** 0 on success, or the underlying breakpoint error.

#### `zplc_sched_debug_clear_breakpoints`

```c
int zplc_sched_debug_clear_breakpoints(int task_id);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `task_id` | `int` | — |

**Retorno fuente:** 0 on success, -1 for invalid state/arguments, -2 for no task.

#### `zplc_sched_lock`

```c
int zplc_sched_lock(int timeout_ms);
```

**Resumen fuente:** Lock shared memory for exclusive access.

Call this before reading/writing IPI/OPI from outside task context. Must be paired with zplc_sched_unlock().

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `timeout_ms` | `int` | Maximum time to wait (-1 = forever, 0 = try) |

**Retorno fuente:** 0 on success, -ETIMEDOUT on timeout, other negative on error

#### `zplc_sched_unlock`

```c
int zplc_sched_unlock(void);
```

**Resumen fuente:** Unlock shared memory.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative error code on failure

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_task_state_t` | Enumeración | Task runtime state. |
| `cycle_count` | Estructura | Task runtime statistics. |
| `config` | Estructura | Task runtime instance. |
| `zplc_sched_state_t` | Enumeración | Scheduler runtime state. |
| `total_cycles` | Estructura | Scheduler statistics. |
| `task_id` | Estructura | Copy debugger-visible VM state for a registered task slot. |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_MAX_TASKS` | `CONFIG_ZPLC_MAX_TASKS` | — |
| `ZPLC_MAX_TASKS` | `8` | — |
| `ZPLC_MIN_INTERVAL_US` | `1000` | Minimum task interval in microseconds (1ms) |
| `ZPLC_MAX_INTERVAL_US` | `3600000000UL` | Maximum task interval in microseconds (1 hour) |

## Tablas del contrato binario

Estas tablas se generan desde `tools/contract/contract.json`, la fuente única de los opcodes, las constantes del contenedor, los códigos de error, las regiones de memoria y los layouts de los bloques de función de comunicación. Las cabeceras C, las tablas TypeScript del compilador y las herramientas Python se generan del mismo archivo, así que no pueden divergir.

### Constantes del contenedor

| Constante | Valor | Notas |
| --- | --- | --- |
| Número mágico | `0x434C505A` | `5A 50 4C 43` = "ZPLC" |
| Versión del ISA (mayor.menor) | `1.0` |  |
| Tamaño de la cabecera del archivo (bytes) | `32` |  |
| Tamaño de la entrada de segmento (bytes) | `8` |  |
| Tamaño de la definición de tarea (bytes) | `16` |  |
| Tamaño de la entrada del mapa de E/S (bytes) | `8` |  |
| Tamaño de la entrada de etiqueta (bytes) | `8` |  |
| Máximo de tareas en un artefacto | `16` |  |
| CRC32 | `0xEDB88320` | Polinomio IEEE 802.3 0xEDB88320, sobre todo el archivo salvo los 4 bytes en el offset 12. |

### Layout de `zplc_file_header_t`

| Offset | Campo | Tipo | Bytes | Descripción |
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
| `28` | `reserved` | `uint32_t` | 4 | Reserved (must be 0) |

### Layout de `zplc_segment_entry_t`

| Offset | Campo | Tipo | Bytes | Descripción |
| --- | --- | --- | --- | --- |
| `0` | `type` | `uint16_t` | 2 | Segment type |
| `2` | `flags` | `uint16_t` | 2 | Segment-specific flags |
| `4` | `size` | `uint32_t` | 4 | Segment size (bytes) |

### Layout de `zplc_task_def_t`

| Offset | Campo | Tipo | Bytes | Descripción |
| --- | --- | --- | --- | --- |
| `0` | `id` | `uint16_t` | 2 | Task ID |
| `2` | `type` | `uint8_t` | 1 | Task type (cyclic, event, init) |
| `3` | `priority` | `uint8_t` | 1 | Priority (0=highest) |
| `4` | `interval_us` | `uint32_t` | 4 | Cycle time in microseconds |
| `8` | `entry_point` | `uint16_t` | 2 | Code offset |
| `10` | `stack_size` | `uint16_t` | 2 | Required stack depth |
| `12` | `reserved` | `uint32_t` | 4 | Reserved (must be 0) |

### Layout de `zplc_iomap_entry_t`

| Offset | Campo | Tipo | Bytes | Descripción |
| --- | --- | --- | --- | --- |
| `0` | `var_addr` | `uint16_t` | 2 | Variable address in memory |
| `2` | `var_type` | `uint8_t` | 1 | Data type ID |
| `3` | `direction` | `uint8_t` | 1 | 0=Input, 1=Output |
| `4` | `channel` | `uint16_t` | 2 | Physical channel number |
| `6` | `flags` | `uint16_t` | 2 | Bit offset, invert, etc. |

### Layout de `zplc_tag_entry_t`

| Offset | Campo | Tipo | Bytes | Descripción |
| --- | --- | --- | --- | --- |
| `0` | `var_addr` | `uint16_t` | 2 | Memory address of the variable |
| `2` | `var_type` | `uint8_t` | 1 | Data type ID (zplc_data_type_t) |
| `3` | `tag_id` | `uint8_t` | 1 | Protocol/Tag identifier (1=Publish, 2=Modbus, etc.) |
| `4` | `value` | `uint32_t` | 4 | Parameter (Modbus address, or offset to string table) |

### Flags de la cabecera

| Nombre | Máscara | Descripción |
| --- | --- | --- |
| `ZPLC_FLAG_HAS_DEBUG` | `0x01` | Debug segment present |
| `ZPLC_FLAG_HAS_SYMBOLS` | `0x02` | Symbol table present |
| `ZPLC_FLAG_HAS_RETAIN` | `0x04` | Uses retentive memory |
| `ZPLC_FLAG_SIGNED` | `0x08` | Cryptographic signature |

### Tipos de segmento

| Nombre | Valor | Descripción |
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

### Tipos de tarea

| Nombre | Valor | Descripción |
| --- | --- | --- |
| `ZPLC_TASK_CYCLIC` | `0x00` | Periodic execution |
| `ZPLC_TASK_EVENT` | `0x01` | Event-triggered |
| `ZPLC_TASK_INIT` | `0x02` | Run once at startup |

### Direcciones de E/S

| Nombre | Valor | Descripción |
| --- | --- | --- |
| `ZPLC_IO_INPUT` | `0x00` | Input (HAL -> VM) |
| `ZPLC_IO_OUTPUT` | `0x01` | Output (VM -> HAL) |

### Identificadores de etiqueta

| Nombre | Valor | Descripción |
| --- | --- | --- |
| `ZPLC_TAG_NONE` | `0x00` |  |
| `ZPLC_TAG_PUBLISH` | `0x01` | \{publish\} |
| `ZPLC_TAG_MODBUS` | `0x02` | \{modbus:N\} |
| `ZPLC_TAG_SUBSCRIBE` | `0x03` | \{subscribe\} |

### Regiones de memoria

| Región | Base | Tamaño por defecto | Override por Kconfig | Descripción |
| --- | --- | --- | --- | --- |
| `IPI` | `0x0000` | `0x1000` | — | Input Process Image |
| `OPI` | `0x1000` | `0x1000` | — | Output Process Image |
| `WORK` | `0x2000` | `0x2000` | `CONFIG_ZPLC_WORK_MEMORY_SIZE` | Work Memory |
| `RETAIN` | `0x4000` | `0x1000` | `CONFIG_ZPLC_RETAIN_MEMORY_SIZE` | Retentive Memory |
| `CODE` | `0x5000` | `0xB000` | `CONFIG_ZPLC_CODE_SIZE_MAX` | Code Segment |

### Límites de ejecución

| Límite | Valor | Override por Kconfig | Descripción |
| --- | --- | --- | --- |
| `ZPLC_MAX_TAGS` | `64` | — | Maximum number of variable tags supported |
| `ZPLC_STACK_MAX_DEPTH` | `256` | `CONFIG_ZPLC_STACK_DEPTH` | Maximum evaluation stack depth (configurable via Kconfig) |
| `ZPLC_CALL_STACK_MAX` | `32` | `CONFIG_ZPLC_CALL_STACK_DEPTH` | Maximum call stack depth (configurable via Kconfig) |
| `ZPLC_MAX_BREAKPOINTS` | `16` | `CONFIG_ZPLC_MAX_BREAKPOINTS` | Maximum number of breakpoints (configurable via Kconfig) |

### Registros del sistema (imagen de entrada)

| Nombre | Dirección | Tipo | Bytes | Descripción |
| --- | --- | --- | --- | --- |
| `ZPLC_SYS_CYCLE_TIME` | `0x0FF0` | `DINT` | 4 | System register: Last cycle execution time in microseconds (DINT, 4 bytes) |
| `ZPLC_SYS_UPTIME` | `0x0FF4` | `UDINT` | 4 | System register: System uptime in milliseconds (UDINT, 4 bytes) |
| `ZPLC_SYS_TASK_ID` | `0x0FF8` | `BYTE` | 1 | System register: Current task ID (BYTE, 1 byte) |
| `ZPLC_SYS_FLAGS` | `0x0FF9` | `BYTE` | 1 | System register: System flags (BYTE, 1 byte) |

### Flags del sistema

| Nombre | Valor | Descripción |
| --- | --- | --- |
| `ZPLC_SYS_FLAG_FIRST_SCAN` | `0x01` | System flags: First scan bit (set on first cycle after start) |
| `ZPLC_SYS_FLAG_WDG_WARN` | `0x02` | Reserved system flag; not produced by current runtimes. |
| `ZPLC_SYS_FLAG_RUNNING` | `0x04` | System flags: Scheduler is running |

### Identificadores de tipo de dato

| Nombre | Identificador | Bytes | Descripción |
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
| `TIME` | `0x0C` | 4 | Time duration (ms as DINT) |
| `BYTE` | `0x10` | 1 | 8-bit bit string |
| `WORD` | `0x11` | 2 | 16-bit bit string |
| `DWORD` | `0x12` | 4 | 32-bit bit string |
| `LWORD` | `0x13` | 8 | 64-bit bit string |
| `STRING` | `0x20` | — | Variable-length string (IEC 61131-3) |

### Layout de STRING

Un STRING es `[longitud:2][capacidad:2][datos:capacidad+1]`, little-endian. La capacidad por defecto es de 80 caracteres (85 bytes) y la máxima de 255.

### Opcodes

El tamaño del operando sigue el rango del opcode (0x00-0x3F ninguno, 0x40-0x7F 8 bits, 0x80-0xBF 16 bits, 0xC0-0xFF 32 bits), salvo `RET` y las conversiones `I2F` a `ZEXT16`, que no llevan operando. Los efectos sobre la pila ponen el tope a la derecha.

| Código | Mnemónico | Operando | Efecto en la pila | Flags | Descripción |
| --- | --- | --- | --- | --- | --- |
| `0x00` | `NOP` | 0 | `[] -> []` | — | No operation |
| `0x01` | `HALT` | 0 | `[] -> []` | `terminates` | Stop execution |
| `0x02` | `BREAK` | 0 | `[] -> []` | — | Debugger breakpoint |
| `0x03` | `GET_TICKS` | 0 | `[] -> [ticks]` | — | Push system tick (ms) to stack |
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
| `0xC0` | `PUSH32` | 4 | `[] -> [imm]` | — | Push 32-bit immediate |
| `0xD0` | `COMM_EXEC` | 4 | `[base] -> []` | `comm` | Execute/update Comm FB; pop base addr from stack |
| `0xD1` | `COMM_STATUS` | 4 | `[base] -> [status]` | `comm` | Push status word for a kind to stack |
| `0xD2` | `COMM_RESET` | 4 | `[base] -> []` | `comm` | Reset FSM for Comm FB; pop base addr from stack |

### Códigos de error de la VM

| Nombre | Código | Descripción |
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

### Códigos de error del loader

| Nombre | Código | Descripción |
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
| `ZPLC_LOADER_ERR_COMM` | `-16` | Communication function-block kind is NONE or at or above the kind limit |

### Bloques de función de comunicación

Cada instancia de bloque de función es un bloque de bytes en memoria de trabajo o retentiva. Todos los bloques empiezan con el mismo handshake de 8 bytes. El core toma el tamaño de un bloque de esta tabla.

| Nombre | Kind | Tamaño de la instancia (bytes) | Descripción |
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

El loader y el registro de handlers rechazan los kinds iguales o mayores que `0x00FF`.

#### Layout de `MB_READ_HREG`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `PROTO` | `USINT` | entrada |
| 9 | `SLAVE_ID` | `UINT` | entrada |
| 11 | `ADDR` | `UINT` | entrada |
| 13 | `COUNT` | `UINT` | entrada |
| 15 | `VALUE` | `UINT` | salida |
| 18 | `HOST` | `STRING` | entrada |
| 103 | `PORT` | `UINT` | entrada |

#### Layout de `MB_WRITE_HREG`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `PROTO` | `USINT` | entrada |
| 9 | `SLAVE_ID` | `UINT` | entrada |
| 11 | `ADDR` | `UINT` | entrada |
| 13 | `COUNT` | `UINT` | entrada |
| 15 | `VALUE` | `UINT` | entrada |
| 18 | `HOST` | `STRING` | entrada |
| 103 | `PORT` | `UINT` | entrada |

#### Layout de `MB_READ_COIL`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `PROTO` | `USINT` | entrada |
| 9 | `SLAVE_ID` | `UINT` | entrada |
| 11 | `ADDR` | `UINT` | entrada |
| 13 | `COUNT` | `UINT` | entrada |
| 15 | `VALUE` | `BOOL` | salida |
| 18 | `HOST` | `STRING` | entrada |
| 103 | `PORT` | `UINT` | entrada |

#### Layout de `MB_WRITE_COIL`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `PROTO` | `USINT` | entrada |
| 9 | `SLAVE_ID` | `UINT` | entrada |
| 11 | `ADDR` | `UINT` | entrada |
| 13 | `COUNT` | `UINT` | entrada |
| 15 | `VALUE` | `BOOL` | entrada |
| 18 | `HOST` | `STRING` | entrada |
| 103 | `PORT` | `UINT` | entrada |

#### Layout de `MQTT_CONNECT`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `PROFILE` | `USINT` | entrada |
| 9 | `CONNECTED` | `BOOL` | salida |

#### Layout de `MQTT_PUBLISH`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `QOS` | `USINT` | entrada |
| 9 | `RETAIN` | `BOOL` | entrada |
| 12 | `TOPIC` | `STRING` | entrada |
| 97 | `PAYLOAD` | `STRING` | entrada |

#### Layout de `MQTT_SUBSCRIBE`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `QOS` | `USINT` | entrada |
| 9 | `VALID` | `BOOL` | salida |
| 12 | `TOPIC` | `STRING` | entrada |
| 97 | `PAYLOAD` | `STRING` | salida |

#### Layout de `AZURE_C2D_RECV`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `PAYLOAD` | `STRING` | salida |
| 93 | `VALID` | `BOOL` | salida |

#### Layout de `AZURE_DPS_PROV`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `DEVICE_ID` | `STRING` | entrada |
| 73 | `ASSIGNED_HUB` | `STRING` | salida |

#### Layout de `AZURE_EG_PUB`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `TOPIC` | `STRING` | entrada |
| 73 | `EVENT_TYPE` | `STRING` | entrada |
| 138 | `PAYLOAD` | `STRING` | entrada |

#### Layout de `AWS_FLEET_PROV`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `TEMPLATE_NAME` | `STRING` | entrada |
| 73 | `THING_NAME` | `STRING` | salida |

#### Layout de `SPB_REBIRTH`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |

### Códigos de estado de comunicación

| Nombre | Código |
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
