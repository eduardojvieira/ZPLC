---
slug: /reference/runtime-api
id: runtime-api
title: API del Runtime
sidebar_label: API del Runtime
description: Referencia generada para los headers públicos del runtime ZPLC en ZPLC 2.0.
tags: [reference, runtime, generated]
---

# API del Runtime

:::note
Esta página se genera a partir de los headers públicos en C bajo `firmware/lib/zplc_core/include/`. Edite los headers o vuelva a ejecutar `python3 tools/docs/generate_runtime_reference.py` en lugar de editar este archivo manualmente.
:::

El texto envolvente está localizado al español, mientras que los nombres de API, las firmas y las descripciones derivadas del código se mantienen ancladas a los headers en inglés para evitar drift documental.

## Headers fuente

- `firmware/lib/zplc_core/include/zplc_bytes.h`
- `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`
- `firmware/lib/zplc_core/include/zplc_comm_req.h`
- `firmware/lib/zplc_core/include/zplc_core.h`
- `firmware/lib/zplc_core/include/zplc_crc32.h`
- `firmware/lib/zplc_core/include/zplc_debug.h`
- `firmware/lib/zplc_core/include/zplc_ed25519.h`
- `firmware/lib/zplc_core/include/zplc_exchange.h`
- `firmware/lib/zplc_core/include/zplc_failsafe.h`
- `firmware/lib/zplc_core/include/zplc_hal.h`
- `firmware/lib/zplc_core/include/zplc_hal_posix.h`
- `firmware/lib/zplc_core/include/zplc_isa.h`
- `firmware/lib/zplc_core/include/zplc_loader.h`
- `firmware/lib/zplc_core/include/zplc_program_store.h`
- `firmware/lib/zplc_core/include/zplc_proto.h`
- `firmware/lib/zplc_core/include/zplc_proto_dev.h`
- `firmware/lib/zplc_core/include/zplc_retain.h`
- `firmware/lib/zplc_core/include/zplc_sched_core.h`
- `firmware/lib/zplc_core/include/zplc_scheduler.h`
- `firmware/lib/zplc_core/include/zplc_sha256.h`
- `firmware/lib/zplc_core/include/zplc_sha512.h`
- `firmware/lib/zplc_core/include/zplc_single_task.h`
- `firmware/lib/zplc_core/include/zplc_verify_scratch.h`

## `zplc_bytes.h`

Little-endian reads and writes of bytes, with no alignment assumption (RT-004, RT-032).

Every module of the runtime that reads or writes a multi-byte field of an artifact, a record or PLC memory uses these functions: they work at any address, on any byte order and on a core that traps on unaligned access. The host and the target share this one implementation.

Fuente: `firmware/lib/zplc_core/include/zplc_bytes.h`

### Funciones

#### `zplc_get_u16_le`

```c
static inline uint16_t zplc_get_u16_le(const uint8_t *p);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `p` | `const uint8_t *` | — |

#### `zplc_get_u32_le`

```c
static inline uint32_t zplc_get_u32_le(const uint8_t *p);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `p` | `const uint8_t *` | — |

#### `zplc_put_u16_le`

```c
static inline void zplc_put_u16_le(uint8_t *p, uint16_t value);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `p` | `uint8_t *` | — |
| `value` | `uint16_t` | — |

#### `zplc_put_u32_le`

```c
static inline void zplc_put_u32_le(uint8_t *p, uint32_t value);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `p` | `uint8_t *` | — |
| `value` | `uint32_t` | — |

### Tipos

Ninguno.

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_BYTES_H` | `—` | — |

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

#### `zplc_comm_fb_is_service`

```c
int zplc_comm_fb_is_service(zplc_comm_fb_kind_t kind);
```

**Resumen fuente:** True for the blocks that report a state that can change on any scan: MQTT_CONNECT, MQTT_SUBSCRIBE and AZURE_C2D_RECV. Their handler is called on every scan while EN is TRUE; the others make one request for each rising EN.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | — |

#### `zplc_comm_fb_exec`

```c
int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len);
```

**Resumen fuente:** Execute a communication FB instance (called by VM from OP_COMM_EXEC).

The one handshake of the twelve blocks (COM-002, COM-004). The block is the only writer of BUSY, DONE, ERROR and STATUS; a handler returns its result and the dispatcher publishes it. A request block (the Modbus blocks, MQTT_PUBLISH, AZURE_DPS_PROV, AZURE_EG_PUB, AWS_FLEET_PROV, SPB_REBIRTH): EN        0 0 1 1 1 1 1 1 1 1 0 0 1 1 1 1 BUSY      0 0 0 1 1 1 0 0 0 0 0 0 0 1 1 0       one operation, begun by the rising edge DONE      0 0 0 0 0 0 1 1 1 1 0 0 0 0 0 1       the result, held while EN stays TRUE ERROR     0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0       (a failed operation holds ERROR instead of DONE) handler       . . S P P R . . . . . . S P R         S START, P POLL, R the result - EN is FALSE and the block idle: all three outputs are 0 and the handler is not called. - EN rises on an idle block (BUSY, DONE and ERROR all 0): START. A handler that finishes at once gives DONE or ERROR in the same scan; one that returns PENDING gives BUSY, STATUS = ZPLC_COMM_BUSY. - BUSY: the handler is called on every scan, whatever EN does, until it returns a result. A trigger that is a one-scan pulse still completes, and a rising EN while BUSY starts nothing. - The result is DONE (STATUS 0) or ERROR (STATUS a zplc_comm_status_t code). It is held while EN stays TRUE, and the handler is not called: one rising edge causes exactly one operation. It is shown for one scan when EN had already fallen. - EN FALSE with DONE or ERROR set: both are cleared. STATUS keeps the code of the last operation until the next START or a COMM_RESET. - COMM_RESET (zplc_comm_fb_reset): EN, BUSY, DONE, ERROR and STATUS are 0 and the handler is called with RESET to release what it holds; an operation still in flight completes unseen. A service block reports a state: the handler is called with POLL on every scan while EN is TRUE and its result is published as it is: PENDING is BUSY (it has not reached its state yet), DONE is DONE while the state holds, a failure is ERROR. When EN falls on a block that reports a state, the handler is called once with RESET and the outputs are cleared. A kind with no handler gives ERROR with STATUS ZPLC_COMM_NO_HANDLER (3).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | The function-block kind |
| `fb_mem` | `uint8_t *` | The block; the caller has placed all of it in PLC memory |
| `fb_len` | `uint16_t` | Length of the block; refused (-1) when it is shorter than the handshake or than the size of the kind in the table |

**Retorno fuente:** 0, or -1 when the block is refused

#### `zplc_comm_fb_reset`

```c
int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len);
```

**Resumen fuente:** Reset a communication FB instance (called by VM from OP_COMM_RESET).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `kind` | `zplc_comm_fb_kind_t` | The function-block kind |
| `fb_mem` | `uint8_t *` | The block; the caller has placed all of it in PLC memory |
| `fb_len` | `uint16_t` | Length of the block; refused (-1) as for zplc_comm_fb_exec() |

**Retorno fuente:** 0, or -1 when the block is refused

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_comm_fb_kind_t` | Enumeración | Communication function block kind identifiers. |
| `zplc_comm_status_t` | Enumeración | Communication status codes written to FB.STATUS. |
| `zplc_comm_call_t` | Enumeración | Why a handler is called (COM-002). |
| `zplc_comm_handler_t` | Typedef | Comm FB handler function type. |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_COMM_FB_HANDSHAKE_SIZE` | `8U` | Size in bytes of the handshake every communication block starts with (EN, BUSY, DONE, ERROR, STATUS). |
| `ZPLC_COMM_HANDLER_DONE` | `0` | The operation finished successfully: BUSY 0, DONE 1, STATUS 0. |
| `ZPLC_COMM_HANDLER_PENDING` | `1` | The operation is in flight: BUSY 1, STATUS ZPLC_COMM_BUSY; the handler is called again on the next scan. |
| `ZPLC_COMM_FB_TAIL_BYTES` | `1U` | Bytes at the end of every block that has a layout. They belong to the dispatcher, which keeps there the value EN had on the previous call to tell a rising edge from an EN that stays TRUE (COM-004). No member covers them and a program does not name them; a kind without a layout has none. |

## `zplc_comm_req.h`

Request slots between the scan and a worker (COM-003, COM-004, COM-008, COM-018).

A communication block never waits for a peer. When it begins an operation it takes a slot, fills in what the worker needs and queues the slot; the worker (a thread, the MQTT client, a transport callback) runs it and writes the result into the slot; the scan reads the result on a later call. The slot is the only thing the two sides share, and it is only ever changed under the lock of its pool: FREE --claim--> CLAIMED --submit--> QUEUED --begin--> RUNNING --finish--> DONE --release--> FREE |                 | +--- abandon -----+--> ABANDONED --(worker is through)--> FREE A block that is reset, a request that outlives its timeout, or a program that is replaced abandons its slot. An abandoned slot is not released: the worker may be reading its payload, so it stays taken until the worker has finished with it (COM-008). The result of an abandoned request belongs to nobody and is dropped, never delivered to the next block that uses the slot (COM-018). The header has no state of its own and no dependency on an operating system: a pool is an array of structures whose first member is a zplc_comm_req_t, and a pair of lock functions. The host tests drive it with a pthread mutex or none; the firmware uses a spinlock.

Fuente: `firmware/lib/zplc_core/include/zplc_comm_req.h`

### Funciones

#### `zplc_comm_req_at`

```c
static inline zplc_comm_req_t *zplc_comm_req_at(const zplc_comm_req_pool_t *pool, size_t index);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |
| `index` | `size_t` | — |

#### `zplc_comm_req_lock`

```c
static inline void zplc_comm_req_lock(const zplc_comm_req_pool_t *pool);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |

#### `zplc_comm_req_unlock`

```c
static inline void zplc_comm_req_unlock(const zplc_comm_req_pool_t *pool);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |

#### `zplc_comm_status_from_errno`

```c
static inline int zplc_comm_status_from_errno(int error);
```

**Resumen fuente:** The status code a failure of the platform maps to (the documented codes of the blocks).

The status code a failure of the platform maps to (the documented codes of the blocks).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `error` | `int` | — |

#### `zplc_comm_fail_from_errno`

```c
static inline int zplc_comm_fail_from_errno(int error);
```

**Resumen fuente:** A handler result for a failure of the platform, as a -errno or a zplc_comm_status_t.

A handler result for a failure of the platform, as a -errno or a zplc_comm_status_t.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `error` | `int` | — |

#### `zplc_comm_req_claim`

```c
static inline zplc_comm_req_t *zplc_comm_req_claim(const zplc_comm_req_pool_t *pool, const void *owner, uint32_t now_ms);
```

**Resumen fuente:** Take a free slot for a request of the block `owner` (scan side).

A slot that this block still holds is let go first: a request in flight is abandoned, a finished one is freed. A request therefore never sees the result of an earlier one. Returns NULL when every slot is taken: the block reports ZPLC_COMM_QUEUE_FULL (COM-008).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |
| `owner` | `const void *` | — |
| `now_ms` | `uint32_t` | — |

#### `zplc_comm_req_submit`

```c
static inline void zplc_comm_req_submit(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot);
```

**Resumen fuente:** The slot is filled in: hand it to the worker (scan side).

The slot is filled in: hand it to the worker (scan side).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |
| `slot` | `zplc_comm_req_t *` | — |

#### `zplc_comm_req_cancel`

```c
static inline void zplc_comm_req_cancel(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot);
```

**Resumen fuente:** The request could not be queued after all: give the slot back (scan side).

The request could not be queued after all: give the slot back (scan side).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |
| `slot` | `zplc_comm_req_t *` | — |

#### `zplc_comm_req_begin`

```c
static inline int zplc_comm_req_begin(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot);
```

**Resumen fuente:** The worker takes the request (worker side).

Returns 1 when the request is to be run. Returns 0 when its block let go of it while it waited: the slot is free again and nothing is sent.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |
| `slot` | `zplc_comm_req_t *` | — |

#### `zplc_comm_req_finish`

```c
static inline void zplc_comm_req_finish(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot, int result);
```

**Resumen fuente:** The worker is through (worker side).

The result is kept for the block, or dropped, and the slot freed, when the block let go of the request while it ran.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |
| `slot` | `zplc_comm_req_t *` | — |
| `result` | `int` | — |

#### `zplc_comm_req_peek`

```c
static inline int zplc_comm_req_peek(const zplc_comm_req_pool_t *pool, const void *owner, uint32_t now_ms, uint32_t timeout_ms, zplc_comm_req_t **slot);
```

**Resumen fuente:** Where the request of a block stands (scan side).

Returns ZPLC_COMM_HANDLER_PENDING while the request is queued or running and younger than `timeout_ms`; ZPLC_COMM_HANDLER_DONE with *slot set when it finished (the caller reads the outputs from the slot and then calls zplc_comm_req_release); ZPLC_COMM_HANDLER_FAIL(...) when it failed (the slot is freed here). A request older than the timeout is abandoned and reported as ZPLC_COMM_TIMEOUT: its late result is dropped, not replayed (COM-018). A block that has no request, which is the case of a block that was BUSY across a program reload, is reported as ZPLC_COMM_UNKNOWN.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |
| `owner` | `const void *` | — |
| `now_ms` | `uint32_t` | — |
| `timeout_ms` | `uint32_t` | — |
| `slot` | `zplc_comm_req_t **` | — |

#### `zplc_comm_req_release`

```c
static inline void zplc_comm_req_release(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot);
```

**Resumen fuente:** The block has read the result: free the slot (scan side).

The block has read the result: free the slot (scan side).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |
| `slot` | `zplc_comm_req_t *` | — |

#### `zplc_comm_req_abort`

```c
static inline void zplc_comm_req_abort(const zplc_comm_req_pool_t *pool, const void *owner);
```

**Resumen fuente:** The block is reset, or its program is going away (scan side).

A request in flight is abandoned, a finished one freed. Nothing the worker is using is released before the worker is through with it (COM-008).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `pool` | `const zplc_comm_req_pool_t *` | — |
| `owner` | `const void *` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_comm_req_state_t` | Enumeración | — |
| `state` | Estructura | The head of every slot of a pool. |
| `slots` | Estructura | — |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_COMM_REQ_H` | `—` | — |

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

#### `zplc_vm_set_scan_time`

```c
void zplc_vm_set_scan_time(zplc_vm_t *vm, uint32_t ms);
```

**Resumen fuente:** Give the time (milliseconds) the scan that starts next latches, in place of the HAL tick.

Time is latched once per scan (RT-006): every GET_TICKS of a scan pushes the same value. A scheduler that has read its clock for the batch gives that reading, so that the system registers and the program agree. It applies to the next scan zplc_vm_run_cycle() starts and not to one it continues, and only once.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `vm` | `zplc_vm_t *` | — |
| `ms` | `uint32_t` | — |

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

Initializes shared memory and default VM instance, and creates the process-image lock.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, -1 when the process-image lock could not be created. In that case the memory and the VM are initialised but the runtime must not start: external threads cannot be synchronised with the scan. A later call tries again.

#### `zplc_core_cold_start`

```c
void zplc_core_cold_start(void);
```

**Resumen fuente:** Cold start: every variable of the program is initialised (RT-016).

IPI, OPI, WORK and RETAIN are set to zero and the force table is emptied. The CODE region and the tags are the program and are not touched. A program load is a cold start: zplc_core_load() and zplc_core_load_tasks() call this before they publish the new program, so a new program never starts on the variables of the one it replaced, on any runtime. A runtime that has a stored RETAIN record restores it after the load.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_core_warm_start`

```c
void zplc_core_warm_start(void);
```

**Resumen fuente:** Warm start: the retentive variables are kept and the rest is initialised (RT-016).

IPI, OPI and WORK are set to zero and the force table is emptied; RETAIN keeps its bytes. For a runtime that restarts the program it already holds, after a reset, with its retained values valid.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

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

#### `zplc_core_declared_safe`

```c
int zplc_core_declared_safe(uint16_t offset, uint8_t bit, uint8_t *value);
```

**Resumen fuente:** The safe value the loaded program declares for one digital output (RT-023).

The declaration is part of the artifact (its SAFE segment): it is in force from the load that committed the program until the program is replaced or the memory is initialised, whether the program is running, stopped, paused or latched in a fault. An output the program declares nothing for is off in the safe state, unless the board description says otherwise; the choice between the two is made in zplc_io_drive_safe() and nowhere else.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `offset` | `uint16_t` | byte offset of the output in the output image |
| `bit` | `uint8_t` | bit in that byte, 0 to 7 |
| `value` | `uint8_t *` | receives 0 or 1 when the program declares one; may be NULL |

**Retorno fuente:** 1 when the program declares a value for this output, 0 when it does not

#### `zplc_core_declared_safe_count`

```c
uint32_t zplc_core_declared_safe_count(void);
```

**Resumen fuente:** How many outputs the loaded program declares a safe value for; 0 when it declares none.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

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
| `ZPLC_VM_BYTES_PER_BUDGET_UNIT` | `4U` | Bytes a string opcode (STRCPY, STRCAT, STRCMP) processes for one unit of the instruction budget (RT-006). |
| `ZPLC_FORCE_MAX_ENTRIES` | `8U` | Maximum number of independent forced ranges. |
| `ZPLC_FORCE_MAX_BYTES` | `260U` | Maximum byte length of one forced range. |

## `zplc_crc32.h`

The one CRC-32 of the runtime (RT-032).

CRC-32/ISO-HDLC: reflected polynomial 0xEDB88320, initial value 0xFFFFFFFF, final exclusive-or 0xFFFFFFFF. It is the CRC of the artifact container (zplc_loader.c), of the RETAIN records (zplc_retain.c) and of the records of the program store on the host and on the target. It is a bitwise loop with no table: a few bytes of code and no RAM, which is what a 16 KB core can afford, and the artifact it checks is small and read once per load.

Fuente: `firmware/lib/zplc_core/include/zplc_crc32.h`

### Funciones

#### `zplc_crc32_update`

```c
static inline uint32_t zplc_crc32_update(uint32_t crc, const uint8_t *data, size_t length);
```

**Resumen fuente:** Add bytes to a running CRC state.

Start from 0xFFFFFFFF and exclusive-or the result with 0xFFFFFFFF when the last byte is in. The state is the register itself, so one value can be carried across several calls.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `crc` | `uint32_t` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_crc32`

```c
static inline uint32_t zplc_crc32(const uint8_t *data, size_t length);
```

**Resumen fuente:** CRC-32 of a buffer in one call.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

### Tipos

Ninguno.

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_CRC32_H` | `—` | — |

## `zplc_debug.h`

ZPLC Hardware-in-the-Loop Debug API

This header declares the debug output API for HIL (Hardware-in-the-Loop) testing. When enabled, the runtime outputs JSON-formatted trace information via the Zephyr shell for parsing by the HIL test framework. The debug output is runtime-controllable (not compile-time), allowing the same firmware to be used in production and testing modes. Protocol: Line-based JSON with CRLF terminators. See: specs/002-hil-testing/contracts/debug-protocol.md

Fuente: `firmware/lib/zplc_core/include/zplc_debug.h`

### Funciones

#### `hil_set_sink`

```c
void hil_set_sink(hil_sink_fn sink, void *context);
```

**Resumen fuente:** Set where the debug lines go; a NULL sink silences the output.

The portable core only formats lines. A target registers the sink that writes them (the Zephyr shell binding is hil_set_shell).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `sink` | `hil_sink_fn` | — |
| `context` | `void *` | — |

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

**Resumen fuente:** Set the shell instance for debug output (Zephyr targets only).

Registers a sink that prints each line with shell_print. Must be called before any trace functions. Typically called by the `zplc hil mode` shell command. Defined in src/hal/zephyr/zplc_hil_debug_zephyr.c.

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
| `hil_sink_fn` | Typedef | Receives one finished JSON line, without a line terminator. |

### Constantes y macros

Ninguno.

## `zplc_ed25519.h`

Ed25519 signature verification (RFC 8032), for the signed artifact of COM-026.

A device that holds a public key accepts a program only when its signature verifies under that key. This is verification only: it holds no secret, so it is neither constant-time nor does it need to be. It is the field arithmetic of TweetNaCl (16 limbs of 16 bits) with the checks of RFC 8032 (the point must decode, and the scalar of the signature must be below the order of the group), about 2 KB of stack and no table. Time: a verification is two scalar multiplications; on a Cortex-M0+ at 125 MHz it takes seconds, which a deploy can afford and a scan cannot: it runs in the command that commits a program, never in the scan.

Fuente: `firmware/lib/zplc_core/include/zplc_ed25519.h`

### Funciones

#### `zplc_ed25519_verify`

```c
int zplc_ed25519_verify(const uint8_t signature[ZPLC_ED25519_SIGNATURE_BYTES], const uint8_t public_key[ZPLC_ED25519_PUBLIC_BYTES], const uint8_t *message, size_t length);
```

**Resumen fuente:** Verify the signature of a message.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `const uint8_t signature[ZPLC_ED25519_SIGNATURE_BYTES]` | `—` | — |
| `const uint8_t public_key[ZPLC_ED25519_PUBLIC_BYTES]` | `—` | — |
| `message` | `const uint8_t *` | — |
| `length` | `size_t` | — |

**Retorno fuente:** 0 when it is valid under the key, a negative number when it is not (or the key is not a point)

### Tipos

Ninguno.

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_ED25519_H` | `—` | — |
| `ZPLC_ED25519_PUBLIC_BYTES` | `32U` | — |
| `ZPLC_ED25519_SIGNATURE_BYTES` | `64U` | — |

## `zplc_exchange.h`

The exchange between the scan and everything outside it: a write queue and a published snapshot (RT-010, RT-011, RT-012).

Fieldbus servers, MQTT and the debug link run on their own threads. They must never see a value the scan is in the middle of writing, never change one in the middle of a scan, and never make the scan wait for them. The exchange gives them two things, and nothing else touches the live regions from outside the scan: - a READ comes from the snapshot: a copy of IPI, OPI, WORK and RETAIN that the scan publishes once per scan, at the output commit, and after every control-plane change of the memory (stop, load, force). A multi-byte value in the snapshot is whole: it was copied between scans, and the copy and every read are made under one short lock; - a WRITE is queued, whole, and applied by the scan at the input latch of its next scan, through the force-aware interface of the core (zplc_force_write_bytes): a forced variable keeps its forced value. While no scan is running (STOP, pause, fault) there is no latch to wait for, and the write is applied at once, under the lock of the image, and published. The lock of the exchange is held for a bounded copy and for nothing else: not across hardware I/O, not across a log line, not across the execution of a task. Lock order, everywhere: image lock (the scheduler's), then exchange lock. The exchange never takes the image lock while it holds its own.

Fuente: `firmware/lib/zplc_core/include/zplc_exchange.h`

### Funciones

#### `zplc_exchange_init`

```c
int zplc_exchange_init(const zplc_exchange_hooks_t *hooks);
```

**Resumen fuente:** Create the lock and empty the queue and the snapshot. Safe to call again: it resets.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `hooks` | `const zplc_exchange_hooks_t *` | — |

**Retorno fuente:** 0, or ZPLC_EXCHANGE_ERR_LOCK when the lock could not be created.

#### `zplc_exchange_write`

```c
int zplc_exchange_write(uint16_t addr, const uint8_t *bytes, uint16_t size);
```

**Resumen fuente:** Write PLC memory from outside the scan.

Queued for the next input latch while scans run; applied at once otherwise. The extent has to lie inside one region (see zplc_mem_extent.h); a write that does not is refused here and not later. A write is whole: it is queued with all its bytes or not at all.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `addr` | `uint16_t` | — |
| `bytes` | `const uint8_t *` | — |
| `size` | `uint16_t` | — |

**Retorno fuente:** 0, ZPLC_EXCHANGE_ERR_RANGE, ZPLC_EXCHANGE_ERR_FULL or ZPLC_EXCHANGE_ERR_LOCK

#### `zplc_exchange_write_begin`

```c
int zplc_exchange_write_begin(size_t records, size_t bytes);
```

**Resumen fuente:** Several writes that succeed or fail together (a Modbus write of several registers).

zplc_exchange_write_begin() reserves room for @p records writes of @p bytes bytes in all and takes the lock; zplc_exchange_write_add() queues one of them; zplc_exchange_write_end() releases the lock. A reservation that does not fit is refused with nothing queued, so the adds that follow cannot fail for lack of room. While no scan is running the adds apply at once (under the image lock the begin took).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `records` | `size_t` | — |
| `bytes` | `size_t` | — |

**Retorno fuente:** begin: 0, ZPLC_EXCHANGE_ERR_FULL or ZPLC_EXCHANGE_ERR_LOCK; add: 0 or ZPLC_EXCHANGE_ERR_RANGE

#### `zplc_exchange_write_add`

```c
int zplc_exchange_write_add(uint16_t addr, const uint8_t *bytes, uint16_t size);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `addr` | `uint16_t` | — |
| `bytes` | `const uint8_t *` | — |
| `size` | `uint16_t` | — |

#### `zplc_exchange_write_end`

```c
void zplc_exchange_write_end(void);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_exchange_read`

```c
int zplc_exchange_read(uint16_t addr, uint8_t *out, uint16_t size);
```

**Resumen fuente:** Read PLC memory from the snapshot published at the last commit.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `addr` | `uint16_t` | — |
| `out` | `uint8_t *` | — |
| `size` | `uint16_t` | — |

**Retorno fuente:** 0, ZPLC_EXCHANGE_ERR_RANGE or ZPLC_EXCHANGE_ERR_LOCK

#### `zplc_exchange_read_lock`

```c
int zplc_exchange_read_lock(void);
```

**Resumen fuente:** Several reads of one publication (a Modbus read of several tags, an MQTT payload).

Between lock and unlock no scan publishes, so every read is of the same scan. Do not call zplc_exchange_read() or a write inside the pair.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_exchange_read_locked`

```c
int zplc_exchange_read_locked(uint16_t addr, uint8_t *out, uint16_t size);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `addr` | `uint16_t` | — |
| `out` | `uint8_t *` | — |
| `size` | `uint16_t` | — |

#### `zplc_exchange_read_unlock`

```c
void zplc_exchange_read_unlock(void);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_exchange_latch`

```c
size_t zplc_exchange_latch(void);
```

**Resumen fuente:** The scan's input latch: apply every queued write, in order, through the force-aware interface.

Called by the scan with the image lock held, before the inputs of the cycle are written.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** number of writes applied

#### `zplc_exchange_publish`

```c
void zplc_exchange_publish(void);
```

**Resumen fuente:** Publish the live regions as the snapshot. Called with the image lock held, at the output commit and after a control-plane change of the memory.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_exchange_get_stats`

```c
void zplc_exchange_get_stats(zplc_exchange_stats_t *stats);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `stats` | `zplc_exchange_stats_t *` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `lock_image` | Estructura | What the scheduler lends the exchange. All three are optional. |
| `latched` | Estructura | Writes applied at a latch, writes applied at once, and writes refused for lack of room, since init. |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_EXCHANGE_H` | `—` | — |

## `zplc_failsafe.h`

Fail-safe decisions that do not depend on a platform: the reset cause, the record of a fault that survives a reset, the watchdog policy of a profile and the timeout the task set needs (RT-019, RT-020, RT-021, RT-022).

What the platform does (reading the reset-cause register, keeping a record in RAM that a reset does not clear, rebooting, driving the pins and feeding the hardware watchdog) lives in the adapter: for the firmware, src/hal/zephyr/zplc_failsafe_zephyr.c. What it means lives here, so that a host test can state it: - a reset has one cause out of seven, and when a processor reports several bits the order in which they are read is fixed (a pin reset flag is set by almost every reset, so it comes last); - a fault the firmware handled leaves a record, with a checksum, that the next boot finds, reports and consumes; a record that is not whole, or is not ours, is nothing; - the runtime never enters RUN because of a reset, whatever its cause (decision D-13, option A); - a profile says what its hardware watchdog does in STOP, while paused and in a latched fault.

Fuente: `firmware/lib/zplc_core/include/zplc_failsafe.h`

### Funciones

#### `zplc_reset_cause_name`

```c
const char *zplc_reset_cause_name(zplc_reset_cause_t cause);
```

**Resumen fuente:** The name the status reports: power_on, brown_out, pin, software, watchdog, fault or unknown.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `cause` | `zplc_reset_cause_t` | — |

#### `zplc_fault_record_make`

```c
void zplc_fault_record_make(zplc_fault_record_t *record, zplc_fault_kind_t kind, uint8_t reason, uint16_t task_id, uint32_t pc, uint32_t sequence);
```

**Resumen fuente:** Fill a record. The checksum is computed; nothing else is touched.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `record` | `zplc_fault_record_t *` | — |
| `kind` | `zplc_fault_kind_t` | — |
| `reason` | `uint8_t` | — |
| `task_id` | `uint16_t` | — |
| `pc` | `uint32_t` | — |
| `sequence` | `uint32_t` | — |

#### `zplc_fault_record_valid`

```c
int zplc_fault_record_valid(const zplc_fault_record_t *record);
```

**Resumen fuente:** 1 when the record is whole, is ours and names a kind; 0 for RAM that holds anything else.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `record` | `const zplc_fault_record_t *` | — |

#### `zplc_fault_record_reason_text`

```c
void zplc_fault_record_reason_text(const zplc_fault_record_t *record, char *out, size_t size);
```

**Resumen fuente:** The name of the reason of a record: a scheduler reason by name, a kernel reason by number.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `record` | `const zplc_fault_record_t *` | — |
| `out` | `char *` | — |
| `size` | `size_t` | — |

#### `zplc_reset_cause_decide`

```c
zplc_reset_cause_t zplc_reset_cause_decide(uint32_t bits, const zplc_fault_record_t *record);
```

**Resumen fuente:** The cause of a reset, from what the processor reported and the record the previous run left.

A valid processor-fault record is a fault reset: the firmware rebooted the part itself. Otherwise the neutral bits are read in this order: power-on, brown-out, watchdog, lockup (a fault), software, pin. Power-on comes first because it sets most of the others as well; the pin comes last because a software or watchdog reset drives the reset line and sets it. A scheduler-fault record does not change the cause: the part was reset by its watchdog, and the record is reported next to it.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `bits` | `uint32_t` | — |
| `record` | `const zplc_fault_record_t *` | — |

#### `zplc_reset_may_run`

```c
int zplc_reset_may_run(zplc_reset_cause_t cause);
```

**Resumen fuente:** Whether the runtime may enter RUN on its own after a reset of this cause.

Never: whatever the cause, the stored program is restored into STOP with the outputs at their safe values and RUN waits for a person's command. This is a function so that the rule has one place, a test that runs it over every cause, and the point where option B (a clean power-on of a device a person enabled beforehand) would be written if the owner chooses it.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `cause` | `zplc_reset_cause_t` | — |

#### `zplc_wdt_policy_default`

```c
zplc_wdt_policy_t zplc_wdt_policy_default(void);
```

**Resumen fuente:** The design default of RT-020: disarm in STOP, keep a pause or a breakpoint fed so that a long one does not reset the board, and in a latched fault stay armed and unfed so that the board resets into STOP with the cause recorded. A profile states another policy when its hardware needs one (a watchdog that cannot be stopped feeds in STOP).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_wdt_action`

```c
zplc_wdt_action_t zplc_wdt_action(const zplc_wdt_policy_t *policy, zplc_wdt_state_t state);
```

**Resumen fuente:** What to do with the watchdog in @p state under @p policy. Out-of-range values are the safe choice.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `policy` | `const zplc_wdt_policy_t *` | — |
| `state` | `zplc_wdt_state_t` | — |

#### `zplc_wdt_timeout_for`

```c
uint32_t zplc_wdt_timeout_for(uint32_t profile_ms, uint32_t hardware_max_ms, uint32_t longest_interval_us);
```

**Resumen fuente:** The timeout the hardware watchdog is armed with for a task set.

It has to be longer than two intervals of the slowest task (a scan that is one interval late is not yet a reset), and is never shorter than the profile's timeout, the one its reset timing was recorded at.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `profile_ms` | `uint32_t` | the profile's timeout |
| `hardware_max_ms` | `uint32_t` | the longest timeout the part can be given |
| `longest_interval_us` | `uint32_t` | the interval of the slowest task |

**Retorno fuente:** the timeout in milliseconds, or 0 when the task set does not fit the hardware: the program is refused

#### `zplc_failsafe_boot`

```c
void zplc_failsafe_boot(void);
```

**Resumen fuente:** Read the reset cause and find the record of the previous run's fault. Once per boot, before the scheduler starts. The record is consumed: a second boot does not see it again.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_failsafe_report`

```c
const zplc_reset_report_t *zplc_failsafe_report(void);
```

**Resumen fuente:** What zplc_failsafe_boot() found; all zero (cause unknown) before it ran.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_failsafe_note_scheduler_fault`

```c
void zplc_failsafe_note_scheduler_fault(uint8_t reason, uint16_t task_id);
```

**Resumen fuente:** The scheduler latched a fault: keep it in the RAM a reset does not clear, so that a watchdog reset that follows does not erase it (RT-020).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `reason` | `uint8_t` | — |
| `task_id` | `uint16_t` | — |

#### `zplc_failsafe_fatal`

```c
void zplc_failsafe_fatal(unsigned int reason, uint32_t pc);
```

**Resumen fuente:** The body of the fatal-error handler (RT-019): drive the outputs to their safe state, keep the reason so that it survives the reset, and reboot. The handler of the kernel calls it; a test calls it with a reboot it intercepts.

It takes no lock and allocates nothing: it runs in a fault.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `reason` | `unsigned int` | — |
| `pc` | `uint32_t` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_reset_cause_t` | Enumeración | Why the processor was reset. |
| `zplc_fault_kind_t` | Enumeración | What kind of fault a record holds. |
| `magic` | Estructura | The record that survives a reset: in RAM the reset does not clear. 24 bytes. |
| `zplc_wdt_action_t` | Enumeración | What the profile's watchdog does while the runtime is in a state. |
| `zplc_wdt_state_t` | Enumeración | The runtime states a policy covers. |
| `stop` | Estructura | — |
| `cause` | Estructura | What the previous run and the reset left, read once at boot. |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_FAILSAFE_H` | `—` | — |
| `ZPLC_FAULT_RECORD_MAGIC` | `0x5A504C46UL` | — |
| `ZPLC_FAULT_RECORD_VERSION` | `1U` | — |

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

#### `zplc_io_table`

```c
const zplc_io_table_t *zplc_io_table(void);
```

**Resumen fuente:** The board's I/O table (never NULL; it may list no channel).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Notas fuente:**
- Platform implementations: - Zephyr: generated at build time from the board description - POSIX, WASM: an empty table; the host runtime exchanges the image with Studio, not with pins

#### `zplc_io_channel_count`

```c
size_t zplc_io_channel_count(void);
```

**Resumen fuente:** Number of channels of the board.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_io_channel_at`

```c
const zplc_io_channel_t *zplc_io_channel_at(size_t index);
```

**Resumen fuente:** Channel `index` of the table, or NULL past the end.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `index` | `size_t` | — |

#### `zplc_io_read_channel`

```c
zplc_hal_result_t zplc_io_read_channel(const zplc_io_channel_t *channel, uint16_t *value);
```

**Resumen fuente:** Read one physical input channel through the HAL.

A digital channel reads 0 or 1, an analog one the raw converter value.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `channel` | `const zplc_io_channel_t *` | — |
| `value` | `uint16_t *` | — |

**Retorno fuente:** ZPLC_HAL_OK, ZPLC_HAL_NOT_IMPL when the channel is not available on this build (an optional channel without its devicetree node), or an error.

#### `zplc_io_write_channel`

```c
zplc_hal_result_t zplc_io_write_channel(const zplc_io_channel_t *channel, uint16_t value);
```

**Resumen fuente:** Write one physical digital output channel through the HAL.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `channel` | `const zplc_io_channel_t *` | — |
| `value` | `uint16_t` | — |

#### `zplc_io_image_get`

```c
uint16_t zplc_io_image_get(const uint8_t *image, size_t size, const zplc_io_channel_t *channel);
```

**Resumen fuente:** The value of a channel in an image buffer (a digital channel is 0 or 1).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `image` | `const uint8_t *` | — |
| `size` | `size_t` | — |
| `channel` | `const zplc_io_channel_t *` | — |

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
| `zplc_hal_mutex_t` | Typedef | Opaque mutex handle |
| `zplc_io_kind_t` | Enumeración | Kind of an I/O channel. |
| `zplc_io_dir_t` | Enumeración | Direction of an I/O channel, seen from the program. |
| `id` | Estructura | One channel of the board description. |
| `board_id` | Estructura | The whole description of a board, as built. |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_IO_MAX_CHANNELS` | `64U` | The most channels a board description may list. |

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
| `build_id` | Estructura | Build identity, the payload of the BUILD segment (4 bytes). |
| `offset` | Estructura | Declared safe value of one digital output, an entry of the SAFE segment (4 bytes) (RT-023). |
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
| `ZPLC_DRAFT_COUNTER` | `6U` | Draft contract counter (CMP-052). |
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
| `ZPLC_SAFE_ENTRY_SIZE` | `4` | Expected size of a safe-state entry |
| `ZPLC_IOMAP_ENTRY_SIZE` | `8` | Expected size of I/O map entry |
| `ZPLC_TAG_ENTRY_SIZE` | `8` | Expected size of tag entry |

## `zplc_loader.h`

ZPLC Binary File Loader

Verifies the structural and bytecode integrity of .zplc files without changing runtime state. The current v1 subset accepts flags=0 and CODE, TASK, TAGS, BUILD and SAFE segments only. The returned view borrows the input buffer.

Fuente: `firmware/lib/zplc_core/include/zplc_loader.h`

### Funciones

#### `zplc_loader_verify`

```c
int zplc_loader_verify(const uint8_t *data, size_t len, uint8_t *workspace, size_t workspace_size, zplc_program_view_t *out);
```

**Resumen fuente:** Verify the supported structural and semantic v1 ZPLC subset.

Besides the structure of the file, the code is verified statically: every jump lands on an instruction, every direct memory access and every block of a communication opcode at a statically known address lies inside the regions of PLC memory (ZPLC_LOADER_ERR_MEMORY, ZPLC_LOADER_ERR_COMM), and no path from an entry point (the header's, and each task's) can underflow the evaluation stack or exceed the depth the task declares (ZPLC_LOADER_ERR_STACK). The stack check follows every path, joins the depths where paths meet, and treats a call by the effect of the callee on the stack; it refuses what it cannot prove, among it recursion, and what takes more work to prove than its bound (see ZPLC_VERIFY_STEPS_PER_BYTE). Calls nested deeper than the call stack of the VM (ZPLC_CALL_STACK_MAX, 32 by default) are refused with ZPLC_LOADER_ERR_STACK as well: the run would end in the VM fault CALL_OVERFLOW. This does not load or authorize a runtime. Product load paths remain a separate integration gate.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `data` | `const uint8_t *` | Pointer to the file data |
| `len` | `size_t` | Length of the data in bytes |
| `workspace` | `uint8_t *` | Caller-owned transient scratch of at least ZPLC_LOADER_VERIFY_WORKSPACE_SIZE bytes |
| `workspace_size` | `size_t` | Size of @p workspace in bytes |
| `out` | `zplc_program_view_t *` | Destination for the verified view; untouched on failure |

**Retorno fuente:** 0 on success, negative error code on failure. The view remains valid only while @p data remains valid.

#### `zplc_loader_artifact_draft_counter`

```c
uint32_t zplc_loader_artifact_draft_counter(const uint8_t *data, size_t len);
```

**Resumen fuente:** Draft contract counter recorded in an artifact header (CMP-052).

Reads header word 28 and nothing else. The magic, the CRC and the rest of the artifact are not checked, so a caller can show the number of an artifact that zplc_loader_verify() refused with ZPLC_LOADER_ERR_DRAFT ("built for draft N, this runtime is draft ZPLC_DRAFT_COUNTER").

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `data` | `const uint8_t *` | Pointer to the file data, may be NULL |
| `len` | `size_t` | Length of the data in bytes |

**Retorno fuente:** The counter, or 0 when @p data is NULL or shorter than a header. 0 is also what an artifact built before the counter carries.

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
| `ZPLC_LOADER_ERR_COMM` | `-16` | Communication function-block kind is NONE or at or above the kind limit, or a block at a statically known address does not fit one memory region |
| `ZPLC_LOADER_ERR_DRAFT` | `-17` | Draft contract counter of the artifact differs from the loader's, or the artifact has none |
| `ZPLC_LOADER_ERR_STACK` | `-18` | The evaluation stack can underflow, or exceed the depth the task declares, on some path, or the verifier cannot prove that it cannot |
| `ZPLC_LOADER_ERR_SAFE` | `-19` | A declared safe value is invalid: the segment is not whole entries, an entry names no bit of the output image or a value other than 0 or 1, an output is declared twice, or there are too many |
| `ZPLC_LOADER_MAX_TASKS` | `16U` | — |
| `ZPLC_LOADER_MAX_SAFE` | `64U` | Most outputs one artifact may declare a safe value for, in the SAFE segment (loader). |
| `ZPLC_VERIFY_MAX_DEPTH` | `127` | — |
| `ZPLC_VERIFY_FRAME_BYTES` | `7U` | — |
| `ZPLC_VERIFY_STEPS_PER_BYTE` | `64U` | — |
| `ZPLC_LOADER_VERIFY_WORKSPACE_SIZE` | `\\ (((ZPLC_MEM_CODE_SIZE + 7U) / 8U) + \\ 2U * ((ZPLC_MEM_CODE_SIZE + 127U) / 128U) + \\ 2U * ZPLC_VERIFY_MAX_LEADERS + (ZPLC_VERIFY_MAX_LEADERS + 7U) / 8U + \\ ZPLC_VERIFY_MAX_FRAMES * ZPLC_VERIFY_FRAME_BYTES)` | — |

## `zplc_program_store.h`

The durable store of the admitted program: two slots, one active pointer (RT-028, RT-031, RT-032).

One implementation (zplc_pstore_commit, zplc_pstore_restore), used by the firmware (firmware/app/src/program_store.c) and by the host runtime (firmware/apps/posix_host/src/native_program_store.c). It sits on the HAL persistence calls, so it runs on NVS on a board and on files on the host, and it holds no state of its own: the caller supplies the buffers and serialises the calls. What is stored -------------- Two slots, A and B. A slot is a payload (the artifact, then an 8 byte footer "ZPE1" + length) and a 32 byte metadata record. A 16 byte active record names the slot that holds the program to run and its generation. All records carry a CRC-32 and the format version of the runtime. key                              content program_v1_slot_a_payload        payload of slot A, chunk 0 program_v1_slot_a_payload_N      chunk N (1, 2, ...) of the payload of slot A, when it is longer than one chunk program_v1_slot_a_meta           "ZPS1", slot, state (1 prepared, 2 committed), generation, length, header CRC (the same three for slot B) program_v1_active                "ZPA1", slot, generation code_len, code                   the single-key program of the first firmware, read and migrated, never written A payload is cut into chunks of ZPLC_PROGRAM_STORE_CHUNK_SIZE bytes, each stored under its own key, because a flash key-value store keeps an entry inside one erase sector (RT-028: an artifact as large as the code region, 45056 bytes by default, does not fit one 4 KB sector). A payload of at most one chunk is one key, which is exactly the layout of the first version of the store: a store written by it is read as it is. The commit ---------- The new program is written to the slot that is not active, read back and verified; its metadata is written as PREPARED and read back; then the active record is written, which is the single point at which the new program becomes the one to restore; last the metadata is rewritten as COMMITTED (best effort). A power cut at any step leaves the previous program restorable or the new one complete: - before the active record: restore finds the previous program through the active record, or, if that record is damaged, through the newest COMMITTED slot; - a half-written slot (some chunks new, some old) is never accepted: its metadata still describes the old program, the header CRC and the footer of the payload then disagree with it, and the artifact fails its own CRC-32 and the admission check; - a PREPARED slot that the active record does not name is not a program; - an active record that names a PREPARED slot is a deploy whose last metadata write was lost: the slot is complete (it was read back) and is restored. The first commit of a store that has never held a program can be interrupted too: nothing was published, and restore reports ZPLC_PROGRAM_STORE_EMPTY. Records that exist and verify as nothing are never mistaken for an empty store: restore reports ZPLC_PROGRAM_STORE_UNVERIFIABLE and commit refuses to write over them.

Fuente: `firmware/lib/zplc_core/include/zplc_program_store.h`

### Funciones

#### `zplc_pstore_commit`

```c
int zplc_pstore_commit(const zplc_pstore_config_t *config, uint8_t *workspace, size_t program_size, size_t workspace_capacity);
```

**Resumen fuente:** Make an admitted artifact the program to restore.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `config` | `const zplc_pstore_config_t *` | — |
| `workspace` | `uint8_t *` | the artifact in its first @p program_size bytes, with at least ZPLC_PROGRAM_STORE_FOOTER_SIZE bytes after it; the store writes the footer and uses the buffer to read the payload back, so its content is not preserved |
| `program_size` | `size_t` | 1 .. ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE |
| `workspace_capacity` | `size_t` | bytes the buffer holds |

**Retorno fuente:** ZPLC_PROGRAM_STORE_COMMIT_OK, _ERROR (nothing was published), or _UNKNOWN

#### `zplc_pstore_probe`

```c
int zplc_pstore_probe(const zplc_pstore_config_t *config, uint8_t *buffer, size_t capacity, zplc_pstore_rollback_t *rollback);
```

**Resumen fuente:** Find the rollback of the next commit, using @p buffer as the working buffer (the one of zplc_pstore_config_t::scratch, which this call does not need and ignores).

Reads and admits the program that a commit would fall back to, exactly as zplc_pstore_commit() does before it writes. @p buffer is overwritten.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `config` | `const zplc_pstore_config_t *` | — |
| `buffer` | `uint8_t *` | — |
| `capacity` | `size_t` | at least ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE |
| `rollback` | `zplc_pstore_rollback_t *` | — |

**Retorno fuente:** 0 and the rollback, or ZPLC_PROGRAM_STORE_COMMIT_ERROR with @p rollback left as "nothing found": the backend failed, or records exist and none verifies (a commit then refuses to write over them)

#### `zplc_pstore_commit_probed`

```c
int zplc_pstore_commit_probed(const zplc_pstore_config_t *config, const zplc_pstore_rollback_t *rollback, uint8_t *workspace, size_t program_size, size_t workspace_capacity);
```

**Resumen fuente:** zplc_pstore_commit() with the rollback of zplc_pstore_probe(), which has to be the answer for the store as it is now: when a record changed in between, nothing is written.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `config` | `const zplc_pstore_config_t *` | — |
| `rollback` | `const zplc_pstore_rollback_t *` | — |
| `workspace` | `uint8_t *` | — |
| `program_size` | `size_t` | — |
| `workspace_capacity` | `size_t` | — |

#### `zplc_pstore_restore`

```c
zplc_program_store_restore_t zplc_pstore_restore( const zplc_pstore_config_t *config, uint8_t *workspace, size_t workspace_capacity, size_t *program_size);
```

**Resumen fuente:** Find the program to run after a reset.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `config` | `const zplc_pstore_config_t *` | — |
| `workspace` | `uint8_t *` | receives the artifact; needs room for the footer after it |
| `workspace_capacity` | `size_t` | bytes the buffer holds (an artifact of the largest size needs ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE) |
| `program_size` | `size_t *` | receives the artifact length when the result is OK or LEGACY, otherwise 0 |

#### `zplc_pstore_restore_probed`

```c
zplc_program_store_restore_t zplc_pstore_restore_probed(const zplc_pstore_config_t *config, uint8_t *workspace, size_t workspace_capacity, size_t *program_size, zplc_pstore_rollback_t *rollback);
```

**Resumen fuente:** zplc_pstore_restore() that also leaves the rollback of the commit that follows a LEGACY result.

The program of the first firmware was read and admitted into @p workspace by the call, so it is the rollback of the commit that migrates it. For any other result @p rollback is "nothing found": the commit of an upload finds its rollback with zplc_pstore_probe() when the upload starts.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `config` | `const zplc_pstore_config_t *` | — |
| `workspace` | `uint8_t *` | — |
| `workspace_capacity` | `size_t` | — |
| `program_size` | `size_t *` | — |
| `rollback` | `zplc_pstore_rollback_t *` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_program_store_restore_t` | Enumeración | — |
| `zplc_program_store_commit_result_t` | Enumeración | — |
| `zplc_pstore_admit_fn` | Typedef | Decides whether an artifact may be run: the loader's verification and the policy of the runtime. |
| `admit` | Estructura | What the store needs from the runtime that uses it. |
| `digest` | Estructura | The rollback a commit relies on, found before the upload and checked again when it is committed. |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_CORE_PROGRAM_STORE_H` | `—` | — |
| `ZPLC_PROGRAM_STORE_FOOTER_SIZE` | `8U` | Bytes after the artifact in a payload: "ZPE1" and the artifact length. |
| `ZPLC_PROGRAM_STORE_MAX_CHUNKS` | `\\ ((ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE + \\ ZPLC_PROGRAM_STORE_CHUNK_SIZE - 1U) / \\ ZPLC_PROGRAM_STORE_CHUNK_SIZE)` | Keys a payload of the largest artifact is stored under, per slot. |
| `ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD` | `64U` | Backend bytes one stored entry takes beyond its data: the entry header and the padding to the write block. An engineering estimate used by the build-time capacity rule of the Zephyr HAL. |
| `ZPLC_PROGRAM_STORE_WORST_CASE_BYTES` | `\\ (2U * ((size_t)ZPLC_PROGRAM_STORE_MAX_CHUNKS * \\ (ZPLC_PROGRAM_STORE_CHUNK_SIZE + ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD)) +\\ 3U * (32U + ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD))` | Storage, in bytes, the two slots of the largest artifact and their records take, worst case. |
| `ZPLC_PROGRAM_STORE_KEY_MAX` | `40U` | The longest key the store uses, with its terminator. |
| `ZPLC_PSTORE_ROLLBACK_NONE` | `0U` | What the rollback of a commit is: a value of zplc_pstore_rollback_t.kind. 0 is "nothing found". |
| `ZPLC_PSTORE_ROLLBACK_SLOT` | `1U` | — |
| `ZPLC_PSTORE_ROLLBACK_EMPTY` | `2U` | — |
| `ZPLC_PSTORE_ROLLBACK_LEGACY` | `3U` | — |

## `zplc_proto.h`

The codec of the device link protocol: frames, and a decoder that finds them in a byte stream (COM-019).

A frame is a header (sync, version, flags, message, sequence, length), a payload, an optional 32-byte message authentication code and a CRC-32. The numbers and layouts are in zplc_proto_defs.h, generated from tools/contract/protocol.json; the rules (what a decoder discards and counts) are written there too, and the TypeScript codec of Studio follows the same rules. Both run the same generated frames (zplc_proto_vectors.h). Portable C99: no Zephyr header, no allocation, no clock. A decoder owns one buffer of ZPLC_PROTO_FRAME_MAX bytes.

Fuente: `firmware/lib/zplc_core/include/zplc_proto.h`

### Funciones

#### `zplc_proto_frame_size`

```c
static inline size_t zplc_proto_frame_size(size_t length, int authenticated);
```

**Resumen fuente:** Bytes of a frame with a payload of @p length bytes.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `length` | `size_t` | — |
| `authenticated` | `int` | — |

#### `zplc_proto_write_header`

```c
size_t zplc_proto_write_header(uint8_t *out, uint8_t kind, uint8_t message, uint32_t sequence, uint16_t length, int authenticated);
```

**Resumen fuente:** Write the header of a frame whose payload is already at out + ZPLC_PROTO_HEADER_BYTES.

For a sender that builds the payload in place. Returns the number of header bytes.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
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

**Resumen fuente:** Write the header and the payload of a frame.

The caller computes the code over the returned bytes and hands it to zplc_proto_finish().

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `out` | `uint8_t *` | — |
| `capacity` | `size_t` | — |
| `kind` | `uint8_t` | — |
| `message` | `uint8_t` | — |
| `sequence` | `uint32_t` | — |
| `payload` | `const uint8_t *` | — |
| `length` | `uint16_t` | — |
| `authenticated` | `int` | — |

**Retorno fuente:** bytes used (the header and the payload), or 0 when @p capacity cannot hold the whole frame (with the code, when @p authenticated) or @p length is above ZPLC_PROTO_PAYLOAD_MAX_HARD.

#### `zplc_proto_finish`

```c
size_t zplc_proto_finish(uint8_t *out, size_t used, const uint8_t *mac);
```

**Resumen fuente:** Append the code (when the frame was begun authenticated) and the checksum.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `out` | `uint8_t *` | — |
| `used` | `size_t` | bytes zplc_proto_begin() returned |
| `mac` | `const uint8_t *` | ZPLC_PROTO_MAC_BYTES bytes for an authenticated frame, NULL otherwise |

**Retorno fuente:** the size of the whole frame

#### `zplc_proto_encode`

```c
size_t zplc_proto_encode(uint8_t *out, size_t capacity, uint8_t kind, uint8_t message, uint32_t sequence, const uint8_t *payload, uint16_t length);
```

**Resumen fuente:** A frame without a code in one call; returns its size, or 0 when it does not fit.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
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

**Resumen fuente:** Check and open one whole frame (a transport that frames its own lines).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |
| `payload_max` | `size_t` | — |
| `frame` | `zplc_proto_frame_t *` | — |

**Retorno fuente:** 0 and @p frame filled, or a ZPLC_PROTO_PARSE_* code

#### `zplc_proto_decoder_init`

```c
void zplc_proto_decoder_init(zplc_proto_decoder_t *decoder, size_t payload_max);
```

**Resumen fuente:** Start a decoder. @p payload_max is the limit of this link (at most ZPLC_PROTO_PAYLOAD_MAX).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `decoder` | `zplc_proto_decoder_t *` | — |
| `payload_max` | `size_t` | — |

#### `zplc_proto_decoder_reset`

```c
void zplc_proto_decoder_reset(zplc_proto_decoder_t *decoder);
```

**Resumen fuente:** Forget the bytes of a frame that is being assembled (a link that was reopened). Counters stay.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `decoder` | `zplc_proto_decoder_t *` | — |

#### `zplc_proto_decoder_feed`

```c
void zplc_proto_decoder_feed(zplc_proto_decoder_t *decoder, const uint8_t *data, size_t length, zplc_proto_frame_fn on_frame, void *context);
```

**Resumen fuente:** Take bytes from the stream.

Discards noise, assembles candidates and calls @p on_frame for each frame whose header and checksum are valid, in order. A candidate that is not valid costs its first byte and the decoder looks for the next sync pair among the bytes it holds, so a frame inside a damaged one is delivered and a damaged frame costs nothing after itself. The work per input byte is bounded by ZPLC_PROTO_FRAME_MAX.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `decoder` | `zplc_proto_decoder_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |
| `on_frame` | `zplc_proto_frame_fn` | — |
| `context` | `void *` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `kind` | Estructura | A frame that passed the checks of the codec. The pointers point into the buffer that was parsed. |
| `frames` | Estructura | What a decoder discarded, and why. Counted since init. |
| `ZPLC_PROTO_FRAME_MAX` | Estructura | — |
| `zplc_proto_frame_fn` | Typedef | Called once for each valid frame. The frame is valid until the callback returns. |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_PROTO_H` | `—` | — |
| `ZPLC_PROTO_PAYLOAD_MAX_CONFIGURED` | `CONFIG_ZPLC_PROTO_PAYLOAD_MAX` | — |
| `ZPLC_PROTO_PAYLOAD_MAX_CONFIGURED` | `ZPLC_PROTO_PAYLOAD_MAX_DEFAULT` | — |
| `ZPLC_PROTO_FRAME_MAX` | `\\ (ZPLC_PROTO_HEADER_BYTES + ZPLC_PROTO_PAYLOAD_MAX + ZPLC_PROTO_MAC_BYTES + ZPLC_PROTO_CRC_BYTES)` | Bytes of the largest frame: header, payload, code and checksum. |

## `zplc_proto_dev.h`

The device side of the device link protocol: sessions, authenticated frames, atomic writes, events (COM-020, COM-021, COM-023, COM-025, COM-028).

The engine takes frames from one or more links (a UART, a USB serial port, a TCP connection), answers them, and turns them into calls of the port it was given (zplc_proto_ops_t). It knows nothing of Zephyr, of the scheduler or of the host runtime: a port fills the table, so the same engine runs on a board, on the host runtime and in the tests, and the rules below are proved once. The rules: - Everything that changes the device (download, RUN/STOP, memory write, force, configuration, credentials, the key) needs a session that is open on the link it arrives on. One session is open at a time. A session ends when its client closes it, when nothing arrives for the idle time, when the link is lost, when a person at the serial link takes it over, and when the key is changed. The forces the session set end with it and the outputs follow the program again. - A link is SERIAL (whoever holds the cable holds the device) or NETWORK. On a network link every message except HELLO, IDENTITY, CHALLENGE and LINK_STATS needs a session that was opened with a code under the key that was provisioned over the serial link, and every frame of that session carries a code (HMAC-SHA-256) that covers its header, its payload and so its sequence number. A frame with a wrong or missing code, a repeated sequence number or one that is not the next, is dropped, counted and not answered. - A write of a multi-byte value goes through ops->mem_write, which a port binds to the write queue of the exchange: it is applied at the input latch of the next scan, whole. - The engine is called from one thread at a time (the port serialises it); zplc_proto_log() and zplc_proto_event_post() may be called from any thread when the port gives the event try-lock. - Nothing the engine does is on the scan: it has no hook in the scheduler. Telemetry is read by the engine's own service call, from a low priority context, and a queue that is full drops and counts. Portable C99: no Zephyr header, no allocation.

Fuente: `firmware/lib/zplc_core/include/zplc_proto_dev.h`

### Funciones

#### `zplc_proto_dev_init`

```c
int zplc_proto_dev_init(zplc_proto_dev_t *dev, const zplc_proto_ops_t *ops, uint16_t idle_timeout_s);
```

**Resumen fuente:** Start the engine over a port.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `ops` | `const zplc_proto_ops_t *` | — |
| `idle_timeout_s` | `uint16_t` | — |

**Retorno fuente:** 0, or -1 when the port has no clock

#### `zplc_proto_link_init`

```c
void zplc_proto_link_init(zplc_proto_link_t *link, zplc_proto_dev_t *dev, uint8_t transport, zplc_proto_write_fn write, void *write_context);
```

**Resumen fuente:** Attach a link. `write` is called once per frame.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
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

**Resumen fuente:** Bytes that arrived on a stream link.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `link` | `zplc_proto_link_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_proto_link_feed_frame`

```c
int zplc_proto_link_feed_frame(zplc_proto_link_t *link, uint8_t *frame, size_t length);
```

**Resumen fuente:** One whole frame that arrived on a link that frames its own lines.

The payload of a KEY_SET frame is overwritten once it has been used: the caller's buffer does not keep a key.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `link` | `zplc_proto_link_t *` | — |
| `frame` | `uint8_t *` | — |
| `length` | `size_t` | — |

**Retorno fuente:** 0 when the frame was valid and handled (a refusal is a valid frame), or a ZPLC_PROTO_PARSE_* code

#### `zplc_proto_link_lost`

```c
void zplc_proto_link_lost(zplc_proto_link_t *link);
```

**Resumen fuente:** The link is gone: its session ends, its forces are released.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `link` | `zplc_proto_link_t *` | — |

#### `zplc_proto_dev_service`

```c
void zplc_proto_dev_service(zplc_proto_dev_t *dev, zplc_proto_link_t *const *links, size_t link_count);
```

**Resumen fuente:** Time passes: idle timeouts, telemetry produced from the runtime's status, watch batches, and the events in the queue sent to the links that asked for them.

Call it about every 20 ms from a context that is not the scan. @p links is an array of @p link_count links.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `links` | `zplc_proto_link_t *const *` | — |
| `link_count` | `size_t` | — |

#### `zplc_proto_event_post`

```c
int zplc_proto_event_post(zplc_proto_dev_t *dev, uint8_t id, const uint8_t *data, size_t length);
```

**Resumen fuente:** Queue an event. Returns 0, or -1 when it was dropped (and counted). Callable from any thread.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `id` | `uint8_t` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_proto_log`

```c
void zplc_proto_log(zplc_proto_dev_t *dev, uint8_t level, const char *text);
```

**Resumen fuente:** Queue a log line (cut to fit). Callable from any thread.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `level` | `uint8_t` | — |
| `text` | `const char *` | — |

#### `zplc_proto_session_is_open`

```c
int zplc_proto_session_is_open(const zplc_proto_dev_t *dev);
```

**Resumen fuente:** Whether a session is open (a port uses it to apply the same rule to its own commands).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `dev` | `const zplc_proto_dev_t *` | — |

#### `zplc_proto_session_end`

```c
void zplc_proto_session_end(zplc_proto_dev_t *dev, uint8_t reason);
```

**Resumen fuente:** End the session now (a port that must, for example before a reboot).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `dev` | `zplc_proto_dev_t *` | — |
| `reason` | `uint8_t` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `state` | Estructura | What the port tells about the runtime. The engine compares successive values to produce events. |
| `abi_major` | Estructura | — |
| `loaded` | Estructura | — |
| `address` | Estructura | One extent of a batched read. |
| `context` | Estructura | What a port gives the engine. Every call returns 0, or a ZPLC_PROTO_ERR_* number that the engine sends as the status of the response. A member that is NULL means the capability is not there: the engine clears its bit in the hello and answers ERR_UNSUPPORTED. |
| `zplc_proto_dev_t` | Estructura | — |
| `zplc_proto_link_t` | Estructura | — |
| `zplc_proto_write_fn` | Typedef | Send one whole frame; returns 0 when it was handed to the transport. |
| `frames_in` | Estructura | The counters of one link (the LINK_STATS message). |
| `id` | Estructura | — |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_PROTO_DEV_H` | `—` | — |
| `ZPLC_PROTO_OWNED_FORCES` | `8U` | Forces one session can own (the force table of the core has this many entries). |

## `zplc_retain.h`

Persistence of the RETAIN region across power cycles (RT-025, RT-026, RT-027).

Portable C99: no operating-system header. The module reads and writes the RETAIN region through the pointer the caller gives to zplc_retain_init() and stores records only through the HAL persistence API (zplc_hal_persist_*), so the POSIX host, the WASM runtime and the Zephyr firmware apply the same rules. ## Record A record is one little-endian byte string. It is stored under two alternating slots, "a" and "b", and every slot is cut into fixed-size chunks so that a backend with a small maximum entry (Zephyr NVS on a 4 KB sector) can hold it: key = "retain_" + ('a' | 'b') + chunk number ('0'..'7'), for example "retain_a0" offset  size  field 0     4  magic "ZRTN" (bytes 5A 52 54 4E) 4     2  format version (ZPLC_RETAIN_FORMAT_VERSION) 6     2  reserved, zero 8     4  sequence number, monotonic, never 0 12     4  program identity: CRC32 word of the artifact header (byte 12) 16     4  program identity: code size word of the artifact header (byte 16) 20     4  layout hash (see below) 24     4  payload length in bytes (the size of the RETAIN region) 28     n  payload: the RETAIN region bytes 28+n     4  CRC-32 (IEEE 802.3, as in the artifact header) of bytes 0 .. 28+n-1 ## Layout hash CRC-32 over these 24 bytes, little-endian: 0  u32  RETAIN region size in bytes (the runtime value, not the maximum) 4  u32  ZPLC_MEM_RETAIN_BASE 8  u16  ZPLC_VERSION_MAJOR 10  u16  ZPLC_VERSION_MINOR 12  u32  ZPLC_DRAFT_COUNTER 16  u32  program identity, CRC32 word 20  u32  program identity, code size word The region size and the address of the region decide where a retained value lives; the version and the draft counter decide what the program image means; the program identity decides which program wrote the values. Any change of one of them makes a stored record unusable. ## Rules - save writes the OLDER slot with sequence = newest + 1, so a power cut during a save never destroys the last good record; - restore picks the valid record with the highest sequence whose identity and layout match, and otherwise initialises (zeroes) the region and keeps the reason; - a periodic save is skipped when the region did not change since the last record and when the minimum interval has not passed (flash wear, RT-026); - a slot the backend cannot read counts as a damaged record, and the next save rewrites it; when the backend fails on both slots nothing can be decided: the reason is io_error and saves are refused until a restore reads the backend again. The module is not re-entrant. The caller serialises its calls, and gives lock hooks that make the copy of the region coherent with the scan; the hooks are never held across a HAL call (RT-012).

Fuente: `firmware/lib/zplc_core/include/zplc_retain.h`

### Funciones

#### `zplc_retain_init`

```c
int zplc_retain_init(const zplc_retain_config_t *config);
```

**Resumen fuente:** Reset the module and set its region, hooks and minimum interval.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `config` | `const zplc_retain_config_t *` | — |

**Retorno fuente:** 0 on success, -1 on a NULL region, a size of 0 or above the capacity.

#### `zplc_retain_identity_from_artifact`

```c
int zplc_retain_identity_from_artifact(const uint8_t *artifact, size_t size, zplc_retain_identity_t *out);
```

**Resumen fuente:** Read the program identity from a .zplc artifact header.

Reads the magic, the CRC word and the code size word; the loader verified the rest. @return 0 on success, -1 when the buffer is too short or has no magic.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `artifact` | `const uint8_t *` | — |
| `size` | `size_t` | — |
| `out` | `zplc_retain_identity_t *` | — |

#### `zplc_retain_restore`

```c
zplc_retain_reason_t zplc_retain_restore(const zplc_retain_identity_t *identity, uint32_t now_ms);
```

**Resumen fuente:** Restore the region from the stored records, or initialise it.

Call after the program is loaded and before the first scan. The region is zeroed whenever the result is not ZPLC_RETAIN_RESTORED.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `identity` | `const zplc_retain_identity_t *` | — |
| `now_ms` | `uint32_t` | the caller's monotonic millisecond clock |

#### `zplc_retain_save`

```c
zplc_retain_save_result_t zplc_retain_save(const zplc_retain_identity_t *identity, uint32_t now_ms, zplc_retain_save_mode_t mode);
```

**Resumen fuente:** Store the region as the next record when it changed.

Reads the region under the lock hook, then writes with no lock held.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `identity` | `const zplc_retain_identity_t *` | — |
| `now_ms` | `uint32_t` | — |
| `mode` | `zplc_retain_save_mode_t` | — |

#### `zplc_retain_cold_reset`

```c
zplc_retain_save_result_t zplc_retain_cold_reset(const zplc_retain_identity_t *identity, uint32_t now_ms);
```

**Resumen fuente:** Cold reset: zero the region and store it, so a restart does not bring the old values back. The reason becomes ZPLC_RETAIN_RESET.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `identity` | `const zplc_retain_identity_t *` | — |
| `now_ms` | `uint32_t` | — |

#### `zplc_retain_last_status`

```c
void zplc_retain_last_status(zplc_retain_status_t *out);
```

**Resumen fuente:** Copy the status.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `out` | `zplc_retain_status_t *` | — |

#### `zplc_retain_reason_string`

```c
const char *zplc_retain_reason_string(zplc_retain_reason_t reason);
```

**Resumen fuente:** Stable token for a reason: restored, none, identity_mismatch, ...

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `reason` | `zplc_retain_reason_t` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_retain_reason_t` | Enumeración | Outcome of the last restore (or of a cold reset). |
| `zplc_retain_save_mode_t` | Enumeración | Whether a save is bound by the minimum interval. |
| `zplc_retain_save_result_t` | Enumeración | Result of zplc_retain_save(). |
| `crc32` | Estructura | Identity of the program that owns the retained values. |
| `region` | Estructura | Module configuration; the module keeps its own copy. |
| `reason` | Estructura | What the status of the runtime reports (RT-025: "the status says why"). |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_RETAIN_H` | `—` | — |
| `ZPLC_RETAIN_FORMAT_VERSION` | `1U` | Record format version written and accepted. |
| `ZPLC_RETAIN_HEADER_SIZE` | `28U` | Bytes before the payload. |
| `ZPLC_RETAIN_TRAILER_SIZE` | `4U` | Bytes after the payload (the CRC-32). |
| `ZPLC_RETAIN_CHUNK_SIZE` | `CONFIG_ZPLC_RETAIN_CHUNK_SIZE` | — |
| `ZPLC_RETAIN_CHUNK_SIZE` | `1024U` | — |
| `ZPLC_RETAIN_MAX_CHUNKS` | `8U` | Chunks per slot; the keys use the digits '0'..'7'. |

## `zplc_sched_core.h`

The portable scheduler core: task admission, ordering, the phases of a scan, deadline handling, the fault latch and the safe state, written once (RT-008, RT-018).

Three runtimes run PLC tasks: the Zephyr firmware, the POSIX host runtime and the single-task configuration of the firmware. They differ in the mechanism that releases a task (a kernel timer, a polled host clock, a sleep), in how they lock and in what hardware they touch. They do not differ in what a release, an order, a deadline miss or a fault means. That meaning is this file and zplc_sched_core.c, which compile without any Zephyr or POSIX header; each runtime is an adapter that supplies a zplc_sched_port_t. What the core owns: - admission:      one pending release per task; a release that arrives while the task is pending coalesces; - ordering:       a batch runs the task released earlier first, then the lower priority number, then the lower task id; - scan phases:    inputs are sampled with no lock, latched under the image lock together with the queued external writes, every task of the batch runs, the output image is captured and the snapshot published under the image lock, and the physical outputs are written after it is released, under the output lock (RT-009, RT-010, RT-012); - deadlines:      a task misses its deadline when it ends more than its interval after its reference instant; a miss raises the warning, is counted and its overrun recorded; the configured number of consecutive misses latches the fault (RT-014); - fault latch:    the first fault is the reason that is kept until a program is loaded; - safe state:     what happens to the image, the pins and the hardware watchdog when a fault latches, a task stops or the runtime pauses (RT-007, RT-017). What an adapter owns: its clock, its locks, the physical I/O, the timers or the poll loop that call zplc_sched_core_admit(), the logging, the persistence and the control plane (load, start, stop, pause). Synchronization: the core has none of its own. Every function documented "critical" must be called with the adapter's state lock held (a spin lock on a target, nothing on a single thread). zplc_sched_core_scan() takes that lock itself through the port, and never holds it across a callback that can block.

Fuente: `firmware/lib/zplc_core/include/zplc_sched_core.h`

### Funciones

#### `zplc_sched_fault_reason_name`

```c
const char *zplc_sched_fault_reason_name(zplc_sched_fault_reason_t reason);
```

**Resumen fuente:** The name the status reports for a fault reason ("none", "deadline_miss", "vm_fault", ...).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `reason` | `zplc_sched_fault_reason_t` | — |

#### `zplc_sched_core_init`

```c
void zplc_sched_core_init(zplc_sched_core_t *core, zplc_sched_slot_t *slots, uint8_t capacity, uint32_t miss_limit);
```

**Resumen fuente:** Prepare a core over the adapter's slot array. Every slot is cleared; the state is IDLE.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `slots` | `zplc_sched_slot_t *` | — |
| `capacity` | `uint8_t` | — |
| `miss_limit` | `uint32_t` | consecutive misses that latch the fault; 0 selects ZPLC_SCHED_DEFAULT_MISS_LIMIT. |

#### `zplc_sched_core_set_trace`

```c
void zplc_sched_core_set_trace(zplc_sched_core_t *core, zplc_sched_trace_fn trace, void *ctx);
```

**Resumen fuente:** Install or remove the trace sink.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `trace` | `zplc_sched_trace_fn` | — |
| `ctx` | `void *` | — |

#### `zplc_sched_core_add_task`

```c
int zplc_sched_core_add_task(zplc_sched_core_t *core, const zplc_task_def_t *def, zplc_vm_t *vm);
```

**Resumen fuente:** Register a task in the first free slot. The slot is cleared first; its state is READY.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `def` | `const zplc_task_def_t *` | — |
| `vm` | `zplc_vm_t *` | — |

**Retorno fuente:** the slot index, or -1 when every slot is taken

#### `zplc_sched_core_free_slot`

```c
int zplc_sched_core_free_slot(const zplc_sched_core_t *core);
```

**Resumen fuente:** The first free slot, or -1 when every slot is taken.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `const zplc_sched_core_t *` | — |

#### `zplc_sched_core_remove_task`

```c
int zplc_sched_core_remove_task(zplc_sched_core_t *core, int slot);
```

**Resumen fuente:** Free a slot. @return 0, or -1 when the slot is not registered

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `slot` | `int` | — |

#### `zplc_sched_core_admit`

```c
int zplc_sched_core_admit(zplc_sched_core_t *core, int slot, uint64_t release_us, uint64_t deadline_ref_us);
```

**Resumen fuente:** Admit a release of a task.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `slot` | `int` | — |
| `release_us` | `uint64_t` | the instant the release happened; tasks of one batch are ordered by it |
| `deadline_ref_us` | `uint64_t` | the instant the deadline of this scan is counted from. A target stamps the release in the timer callback and passes it twice; the host passes ZPLC_SCHED_REF_BATCH_START, the instant it dispatches the batch. |

**Retorno fuente:** 1 when the release was admitted, 0 when it was refused (a fault is latched, the task is not running) or merged into the release that is already pending

#### `zplc_sched_core_collect`

```c
uint8_t zplc_sched_core_collect(const zplc_sched_core_t *core, uint8_t *order, uint8_t capacity);
```

**Resumen fuente:** The pending tasks of a running core, in the order they run.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `const zplc_sched_core_t *` | — |
| `order` | `uint8_t *` | — |
| `capacity` | `uint8_t` | — |

**Retorno fuente:** the number of slots written to @p order

#### `zplc_sched_core_before`

```c
int zplc_sched_core_before(const zplc_sched_slot_t *a, const zplc_sched_slot_t *b);
```

**Resumen fuente:** True when task @p a runs before task @p b: released earlier, then lower priority number, then lower id.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `a` | `const zplc_sched_slot_t *` | — |
| `b` | `const zplc_sched_slot_t *` | — |

#### `zplc_sched_core_sort`

```c
void zplc_sched_core_sort(const zplc_sched_core_t *core, uint8_t *order, uint8_t count);
```

**Resumen fuente:** Sort @p order (slot indices) by zplc_sched_core_before(). A stable insertion sort.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `const zplc_sched_core_t *` | — |
| `order` | `uint8_t *` | — |
| `count` | `uint8_t` | — |

#### `zplc_sched_core_scan`

```c
int zplc_sched_core_scan(zplc_sched_core_t *core, const zplc_sched_port_t *port, const uint8_t *order, uint8_t count, int step_mode, zplc_sched_scan_report_t *report);
```

**Resumen fuente:** Run one batch: the phases of a scan in the order that RT-009, RT-010 and RT-012 fix.

Does nothing (returns 0) when the core is not RUNNING or has latched a fault. A single-step scan (@p step_mode) does no deadline accounting and ends paused (RT-017). On a fault the image is reset under the lock, the pins are driven safe after it is released, the watchdog is handled by the profile's policy and the fault is latched; the port's stop_releases() is called.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `port` | `const zplc_sched_port_t *` | — |
| `order` | `const uint8_t *` | — |
| `count` | `uint8_t` | — |
| `step_mode` | `int` | — |
| `report` | `zplc_sched_scan_report_t *` | — |

**Retorno fuente:** 0, or the first failure: ZPLC_SCHED_ERR_DEADLINE, the VM error of a task (negative), the failure the port returned for an input or an output, ZPLC_SCHED_ERR_IO for a watchdog that could not be fed, or ZPLC_SCHED_ERR_LOCK when a lock could not be taken

#### `zplc_sched_core_latch_fault_image`

```c
int zplc_sched_core_latch_fault_image(zplc_sched_core_t *core, const zplc_sched_port_t *port, zplc_sched_fault_reason_t reason, uint16_t task_id);
```

**Resumen fuente:** Latch the fault and reset the output image. The image lock is held by the caller (a scan in progress).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `port` | `const zplc_sched_port_t *` | — |
| `reason` | `zplc_sched_fault_reason_t` | — |
| `task_id` | `uint16_t` | — |

**Retorno fuente:** the failure of the image reset, or 0. The pins are the caller's next step: zplc_sched_core_settle().

#### `zplc_sched_core_settle`

```c
zplc_sched_safe_result_t zplc_sched_core_settle(const zplc_sched_core_t *core, const zplc_sched_port_t *port, int image_result);
```

**Resumen fuente:** The pins and the watchdog after the image was reset. No lock held.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `const zplc_sched_core_t *` | — |
| `port` | `const zplc_sched_port_t *` | — |
| `image_result` | `int` | what zplc_sched_core_latch_fault_image() or the image reset returned |

#### `zplc_sched_core_fault`

```c
int zplc_sched_core_fault(zplc_sched_core_t *core, const zplc_sched_port_t *port, zplc_sched_fault_reason_t reason, uint16_t task_id);
```

**Resumen fuente:** Latch the fault from the control plane: take the image lock, latch, reset the image, release it, then settle the pins and the watchdog.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `port` | `const zplc_sched_port_t *` | — |
| `reason` | `zplc_sched_fault_reason_t` | — |
| `task_id` | `uint16_t` | — |

**Retorno fuente:** the first failure of the safe state, or ZPLC_SCHED_ERR_LOCK when the lock failed (the pins were still driven safe)

#### `zplc_sched_core_lock_failure`

```c
int zplc_sched_core_lock_failure(zplc_sched_core_t *core, const zplc_sched_port_t *port);
```

**Resumen fuente:** The image lock could not be taken, so the image cannot be touched coherently: latch the fault, stop the releases and put the pins in their safe state without it.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `port` | `const zplc_sched_port_t *` | — |

**Retorno fuente:** ZPLC_SCHED_ERR_LOCK

#### `zplc_sched_core_apply_safe_outputs`

```c
int zplc_sched_core_apply_safe_outputs(zplc_sched_core_t *core, const zplc_sched_port_t *port);
```

**Resumen fuente:** The safe state of a STOP or of the removal of the last task: reset the image under the lock, drive the pins after it is released, and latch the fault when that failed.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `port` | `const zplc_sched_port_t *` | — |

**Retorno fuente:** 0 only when the outputs are safe

#### `zplc_sched_core_drive_safe_outputs`

```c
int zplc_sched_core_drive_safe_outputs(zplc_sched_core_t *core, const zplc_sched_port_t *port);
```

**Resumen fuente:** The safe state of a pause: the pins only; the image and the forces stay (RT-017). Latches the fault when the pins could not be driven.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `port` | `const zplc_sched_port_t *` | — |

**Retorno fuente:** 0 only when the outputs are safe

#### `zplc_sched_core_is_running`

```c
int zplc_sched_core_is_running(const zplc_sched_core_t *core);
```

**Resumen fuente:** True while a scan may run: the state is RUNNING and no fault is latched.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `const zplc_sched_core_t *` | — |

#### `zplc_sched_core_set_running`

```c
uint8_t zplc_sched_core_set_running(zplc_sched_core_t *core);
```

**Resumen fuente:** Start or resume: every READY or PAUSED task runs, with no release pending, and the state is RUNNING.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |

**Retorno fuente:** the number of tasks moved

#### `zplc_sched_core_set_paused`

```c
void zplc_sched_core_set_paused(zplc_sched_core_t *core);
```

**Resumen fuente:** Pause: running tasks are PAUSED, releases are dropped, the state is PAUSED. Image and forces stay.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |

#### `zplc_sched_core_set_stopped`

```c
void zplc_sched_core_set_stopped(zplc_sched_core_t *core);
```

**Resumen fuente:** Stop: tasks are READY again with no release pending, the state is IDLE. A latched fault stays latched, with its tasks in ERROR, so that what it reports stays readable until a program is loaded.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |

#### `zplc_sched_core_begin_step`

```c
uint8_t zplc_sched_core_begin_step(zplc_sched_core_t *core, uint64_t release_us, uint8_t *order, uint8_t capacity);
```

**Resumen fuente:** A manual step: every READY or PAUSED task is released now, in one batch, and the state is RUNNING.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |
| `release_us` | `uint64_t` | — |
| `order` | `uint8_t *` | — |
| `capacity` | `uint8_t` | — |

**Retorno fuente:** the number of tasks written to @p order, in the order they run; 0 when none is ready or a fault is latched

#### `zplc_sched_core_total_misses`

```c
uint32_t zplc_sched_core_total_misses(const zplc_sched_core_t *core);
```

**Resumen fuente:** Misses of every registered task, saturating.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `const zplc_sched_core_t *` | — |

#### `zplc_sched_core_consecutive_misses`

```c
uint32_t zplc_sched_core_consecutive_misses(const zplc_sched_core_t *core);
```

**Resumen fuente:** The longest run of consecutive misses that is still going on.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `const zplc_sched_core_t *` | — |

#### `zplc_sched_core_reset_counters`

```c
void zplc_sched_core_reset_counters(zplc_sched_core_t *core);
```

**Resumen fuente:** Forget the misses, the run of misses, the last overrun and the fault: a program is (re)loaded. A task the fault had put in ERROR is READY again.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |

#### `zplc_sched_core_restart_schedule`

```c
void zplc_sched_core_restart_schedule(zplc_sched_core_t *core);
```

**Resumen fuente:** A resume begins a new run of the schedule: a run of misses does not carry over.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |

#### `zplc_sched_core_begin_run`

```c
void zplc_sched_core_begin_run(zplc_sched_core_t *core);
```

**Resumen fuente:** A start begins a run: the next scan of every task is its first, and a run of misses does not carry over. The miss count and the statistics are the adapter's to keep or to clear.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `core` | `zplc_sched_core_t *` | — |

#### `zplc_sched_core_overrun_us`

```c
uint64_t zplc_sched_core_overrun_us(uint64_t ref_us, uint64_t end_us, uint32_t interval_us);
```

**Resumen fuente:** How far past its deadline a scan ended: 0 when it ended in time. The deadline is the interval after the reference instant, and ending exactly on it is in time.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `ref_us` | `uint64_t` | — |
| `end_us` | `uint64_t` | — |
| `interval_us` | `uint32_t` | — |

#### `zplc_io_sample`

```c
zplc_hal_result_t zplc_io_sample(zplc_io_samples_t *samples, const zplc_io_ops_t *ops);
```

**Resumen fuente:** Phase 1: read every input channel. Hardware I/O: no lock is held. A channel that is not available on this build (ZPLC_HAL_NOT_IMPL) is skipped; any other failure ends the sampling and is returned.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `samples` | `zplc_io_samples_t *` | — |
| `ops` | `const zplc_io_ops_t *` | — |

#### `zplc_io_unsupported_get`

```c
void zplc_io_unsupported_get(zplc_io_unsupported_t *out);
```

**Resumen fuente:** The channels counted so far. Each channel is counted once, however many scans it fails in.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `out` | `zplc_io_unsupported_t *` | — |

#### `zplc_io_unsupported_reset`

```c
void zplc_io_unsupported_reset(void);
```

**Resumen fuente:** Forget the counts (a test; a board's table does not change while it runs).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

#### `zplc_io_apply_samples`

```c
void zplc_io_apply_samples(const zplc_io_samples_t *samples);
```

**Resumen fuente:** Phase 2, image lock held: write the channels that answered into the input image.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `samples` | `const zplc_io_samples_t *` | — |

#### `zplc_io_capture_outputs`

```c
void zplc_io_capture_outputs(zplc_io_outputs_t *outputs);
```

**Resumen fuente:** Phase 2, image lock held: the output image as it is at the end of the scan, for every output channel.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `outputs` | `zplc_io_outputs_t *` | — |

#### `zplc_io_write_outputs`

```c
zplc_hal_result_t zplc_io_write_outputs(const zplc_io_outputs_t *outputs, const zplc_io_ops_t *ops);
```

**Resumen fuente:** Phase 3, image lock released, output lock held: write the captured values to the pins.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `outputs` | `const zplc_io_outputs_t *` | — |
| `ops` | `const zplc_io_ops_t *` | — |

**Retorno fuente:** the first failure; ZPLC_HAL_NOT_IMPL channels are skipped

#### `zplc_io_drive_safe`

```c
zplc_hal_result_t zplc_io_drive_safe(const zplc_io_ops_t *ops);
```

**Resumen fuente:** The safe state of the pins: every digital output at its safe level. The output image and the force table are the logical state of the program and are not touched (RT-017).

The level of an output is the one the loaded program declares for it (zplc_core_declared_safe(), RT-023), or the board description's `safe` for an output the program declares nothing for: off, unless the board says another level. This is the one place the level is chosen.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `ops` | `const zplc_io_ops_t *` | — |

**Retorno fuente:** the first failure; every channel is attempted

#### `zplc_io_declared_safe_fits_board`

```c
int zplc_io_declared_safe_fits_board(const uint8_t *safe, uint32_t count);
```

**Resumen fuente:** Whether every safe value a program declares is for an output this board has (RT-023).

An entry has to name a digital output channel of the board's I/O table by its image offset and bit. A declaration for an output the board does not have is a project for another board, or a typing mistake: the program is refused instead of being run with a safe state that does not exist. A runtime with no I/O table (the host simulator, which has no pins) accepts every entry the loader accepted.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `safe` | `const uint8_t *` | the entries of the SAFE segment, ZPLC_SAFE_ENTRY_SIZE bytes each; may be NULL when @p count is 0 |
| `count` | `uint32_t` | number of entries |

**Retorno fuente:** ZPLC_LOADER_OK, or ZPLC_LOADER_ERR_SAFE

#### `zplc_io_reset_image`

```c
int zplc_io_reset_image(void);
```

**Resumen fuente:** The safe state of the image: forces cleared and the output image zeroed. Image lock held by the caller.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0, or -1 when the output image does not exist

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `zplc_sched_fault_reason_t` | Enumeración | Why the runtime latched its fault. The first reason is the one that is kept. |
| `zplc_sched_trace_kind_t` | Enumeración | What the core decided, in the order it decided it. |
| `zplc_sched_trace_fn` | Typedef | — |
| `zplc_sched_probe_t` | Enumeración | Points at which a test may look at, or steer, a scan. A product adapter leaves the probe NULL. |
| `ctx` | Estructura | The services of the platform. Every member is optional except now_us; an absent callback is a step the platform does not have (the host runtime has no pins, a single thread has no locks). |
| `task` | Estructura | One task as the core sees it. The VM belongs to the adapter; the core runs it. |
| `slot` | Estructura | — |
| `error_task` | Estructura | What a scan has to say: kept while the image lock is held and printed after it is released. |
| `safe_result` | Estructura | The outcome of putting the outputs in their safe state. |
| `ZPLC_IO_MAX_CHANNELS` | Estructura | The physical inputs of one scan, kept by table index until they are latched into the image. |
| `ZPLC_IO_MAX_CHANNELS` | Estructura | The values the physical outputs are given at the end of one scan, by table index. |
| `read` | Estructura | Replaces the HAL access of the helpers below: a test makes a channel fail. NULL members, and a NULL table, are the HAL (zplc_io_read_channel, zplc_io_write_channel). |
| `inputs` | Estructura | How many channels of the board's I/O table the build could not serve (IO-007): an operation the board cannot perform answers ZPLC_HAL_NOT_IMPL, the scan goes on, and the channel is counted here instead of being forgotten. The ports report the numbers to the user (device status, the `zplc status` command, and a log event of the device link that Studio shows). |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_SCHED_CORE_H` | `—` | — |
| `ZPLC_SCHED_CORE_MAX_SLOTS` | `16U` | The most task slots a core can drive (the loader admits at most this many tasks). |
| `ZPLC_SCHED_DEFAULT_MISS_LIMIT` | `3U` | Consecutive deadline misses of one task that latch the fault, unless the profile says otherwise. |
| `ZPLC_SCHED_REF_BATCH_START` | `UINT64_MAX` | A deadline reference that means "the instant the batch started", for a runtime that has no timer of its own: the host dispatches a batch when it polls, and counts each scan's interval from that dispatch. |

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

Stops all tasks but keeps them registered. Unlike a pause, a stop ends the run: the physical outputs go to their safe state, the output process image is zeroed, the force table is cleared, every task is back at its entry point and a scan interrupted by a breakpoint is discarded (RT-017).

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

Pauses between scans: a batch in flight finishes first. The physical outputs are driven to their safe state before the call returns; the output process image and the force table are kept, so a later resume or step continues the program from where it stopped (RT-017).

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

Does not drive the pins itself. A scan stopped at a breakpoint continues from its program counter at the next release; a pause between scans starts a new scan. The first normal commit copies the output image, with the force table applied, to the pins.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** 0 on success, negative error code on failure

#### `zplc_sched_step`

```c
int zplc_sched_step(void);
```

**Resumen fuente:** Execute exactly one scan for each paused/ready task.

Used by the debugger when the scheduler is paused. A scan stopped at a breakpoint is finished; otherwise one whole scan runs. The scan is committed to the pins once and the pins are then driven safe again. The output image and the force table are kept. Tasks remain paused after the stepped cycle unless a task enters error state.

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
| `ZPLC_SCAN_COORDINATOR_PRIORITY` | `CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY` | — |
| `ZPLC_SCAN_COORDINATOR_PRIORITY` | `CONFIG_ZPLC_SCHED_WORKQ_PRIORITY` | — |
| `ZPLC_MIN_INTERVAL_US` | `1000` | Minimum task interval in microseconds (1ms) |
| `ZPLC_MAX_INTERVAL_US` | `3600000000UL` | Maximum task interval in microseconds (1 hour) |

## `zplc_sha256.h`

SHA-256 and HMAC-SHA-256 (FIPS 180-4, RFC 2104), and the two helpers that key material needs (COM-021).

The authentication code of a frame in a network session is HMAC-SHA-256 under a key that was provisioned over the local serial link. This is a small portable implementation, no table but the 64 round constants and no allocation, that the core and every port share; the test of it runs the vectors of FIPS 180-4 and RFC 4231. Two helpers belong to it because of what they protect: zplc_ct_equal() compares two codes in time that does not depend on where they differ, and zplc_secure_zero() clears key material in a way the compiler may not remove.

Fuente: `firmware/lib/zplc_core/include/zplc_sha256.h`

### Funciones

#### `zplc_sha256_init`

```c
void zplc_sha256_init(zplc_sha256_t *context);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `context` | `zplc_sha256_t *` | — |

#### `zplc_sha256_update`

```c
void zplc_sha256_update(zplc_sha256_t *context, const uint8_t *data, size_t length);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `context` | `zplc_sha256_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_sha256_final`

```c
void zplc_sha256_final(zplc_sha256_t *context, uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]);
```

**Resumen fuente:** Write the digest and clear the context.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `context` | `zplc_sha256_t *` | — |
| `uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]` | `—` | — |

#### `zplc_sha256`

```c
void zplc_sha256(const uint8_t *data, size_t length, uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |
| `uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]` | `—` | — |

#### `zplc_hmac_sha256_init`

```c
void zplc_hmac_sha256_init(zplc_hmac_sha256_t *context, const uint8_t *key, size_t key_length);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `context` | `zplc_hmac_sha256_t *` | — |
| `key` | `const uint8_t *` | — |
| `key_length` | `size_t` | — |

#### `zplc_hmac_sha256_update`

```c
void zplc_hmac_sha256_update(zplc_hmac_sha256_t *context, const uint8_t *data, size_t length);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `context` | `zplc_hmac_sha256_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_hmac_sha256_final`

```c
void zplc_hmac_sha256_final(zplc_hmac_sha256_t *context, uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]);
```

**Resumen fuente:** Write the code and clear the context (the key pads included).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `context` | `zplc_hmac_sha256_t *` | — |
| `uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]` | `—` | — |

#### `zplc_hmac_sha256`

```c
void zplc_hmac_sha256(const uint8_t *key, size_t key_length, const uint8_t *data, size_t length, uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
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

**Resumen fuente:** 1 when the two buffers are equal; the time taken depends on @p length only.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `a` | `const uint8_t *` | — |
| `b` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_secure_zero`

```c
void zplc_secure_zero(void *buffer, size_t length);
```

**Resumen fuente:** Clear @p length bytes in a way the compiler does not optimise away.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `buffer` | `void *` | — |
| `length` | `size_t` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `state` | Estructura | — |
| `inner` | Estructura | — |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_SHA256_H` | `—` | — |
| `ZPLC_SHA256_DIGEST_BYTES` | `32U` | — |
| `ZPLC_SHA256_BLOCK_BYTES` | `64U` | — |

## `zplc_sha512.h`

SHA-512 (FIPS 180-4), the hash of Ed25519 (COM-026).

Fuente: `firmware/lib/zplc_core/include/zplc_sha512.h`

### Funciones

#### `zplc_sha512_init`

```c
void zplc_sha512_init(zplc_sha512_t *context);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `context` | `zplc_sha512_t *` | — |

#### `zplc_sha512_update`

```c
void zplc_sha512_update(zplc_sha512_t *context, const uint8_t *data, size_t length);
```

**Resumen fuente:** No se encontró un resumen en el comentario del header.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `context` | `zplc_sha512_t *` | — |
| `data` | `const uint8_t *` | — |
| `length` | `size_t` | — |

#### `zplc_sha512_final`

```c
void zplc_sha512_final(zplc_sha512_t *context, uint8_t digest[ZPLC_SHA512_DIGEST_BYTES]);
```

**Resumen fuente:** Write the digest and clear the context.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `context` | `zplc_sha512_t *` | — |
| `uint8_t digest[ZPLC_SHA512_DIGEST_BYTES]` | `—` | — |

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `state` | Estructura | — |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_SHA512_H` | `—` | — |
| `ZPLC_SHA512_DIGEST_BYTES` | `64U` | — |
| `ZPLC_SHA512_BLOCK_BYTES` | `128U` | — |

## `zplc_single_task.h`

The single-task configuration of the scheduler core (RT-018).

A firmware built without the multitask scheduler runs one program on the default VM of the core, from a loop that releases it once per interval. That loop used to have a scan of its own: no input latch, no deadline check, and the outputs written from the middle of the loop. It now runs on the same core as the multitask scheduler, as a core with one task: the same phases, the same input latch, the same deadline accounting and the same fault latch and safe state. What the caller keeps: the release of the task (its own sleep until the next interval), the lock around a scan (the single-task runtime holds its runtime lock for the whole scan, so the image lock of the core is not needed here) and its own run states.

Fuente: `firmware/lib/zplc_core/include/zplc_single_task.h`

### Funciones

#### `zplc_single_task_init`

```c
void zplc_single_task_init(zplc_single_task_t *single, uint32_t interval_ms, uint32_t miss_limit);
```

**Resumen fuente:** Prepare the one-task configuration over the default VM of the core.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `single` | `zplc_single_task_t *` | — |
| `interval_ms` | `uint32_t` | the task's interval, in whole milliseconds, at least 1 |
| `miss_limit` | `uint32_t` | consecutive deadline misses that latch the fault; 0 selects ZPLC_SCHED_DEFAULT_MISS_LIMIT |

#### `zplc_single_task_set_interval`

```c
void zplc_single_task_set_interval(zplc_single_task_t *single, uint32_t interval_ms);
```

**Resumen fuente:** The interval of the task changed (a program with another scan interval was loaded).

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `single` | `zplc_single_task_t *` | — |
| `interval_ms` | `uint32_t` | — |

#### `zplc_single_task_begin`

```c
void zplc_single_task_begin(zplc_single_task_t *single);
```

**Resumen fuente:** A start: the next scan is the first one, and a run of misses does not carry over.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `single` | `zplc_single_task_t *` | — |

#### `zplc_single_task_clear`

```c
void zplc_single_task_clear(zplc_single_task_t *single);
```

**Resumen fuente:** A load or a reset: the misses, the run of them and a latched fault are forgotten.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `single` | `zplc_single_task_t *` | — |

#### `zplc_single_task_scan`

```c
int zplc_single_task_scan(zplc_single_task_t *single, int step_mode, zplc_sched_scan_report_t *report);
```

**Resumen fuente:** One scan of the task: the inputs are sampled and latched, the program runs, the outputs are captured and written (RT-009). A step (@p step_mode) has no deadline and ends paused, with the pins safe (RT-017).

The caller holds its runtime lock. On a VM fault, a failed input or output, or the miss limit, the image is reset and the pins are driven safe before this returns, and the result is negative.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| `single` | `zplc_single_task_t *` | — |
| `step_mode` | `int` | — |
| `report` | `zplc_sched_scan_report_t *` | what happened (breakpoint, committed, warning); may be NULL |

**Retorno fuente:** 0, or the first failure

### Tipos

| Nombre | Tipo | Resumen fuente |
| --- | --- | --- |
| `slot` | Estructura | — |

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_SINGLE_TASK_H` | `—` | — |

## `zplc_verify_scratch.h`

The one verifier workspace of a Zephyr image, and the lock that owns it.

zplc_loader_verify() needs ZPLC_LOADER_VERIFY_WORKSPACE_SIZE bytes of caller-owned scratch while it runs and keeps nothing in it afterwards: the view it returns points into the artifact, not into the workspace. The image has two callers that can run in different threads, the admission of a program by the scheduler (validation and load) and the admission check of the program store, and a workspace each cost the same RAM twice (about 15 KB on a board with the default code size). They share this one. The rule: a caller takes the scratch, makes one verification (or one zplc_core_load_tasks(), which verifies and then uses the same buffer to stage the task table), and gives it back before it does anything that can wait. The lock is a leaf: nothing else is acquired while it is held, so it adds no edge to the lock order of the image (control, memory and program-store locks all come before it, and none comes after). Verification is bounded by ZPLC_VERIFY_STEPS_PER_BYTE, so another caller waits a bounded time, and only in thread context: the scan never touches it.

Fuente: `firmware/lib/zplc_core/include/zplc_verify_scratch.h`

### Funciones

#### `zplc_verify_scratch_take`

```c
uint8_t *zplc_verify_scratch_take(void);
```

**Resumen fuente:** Take the verifier workspace, waiting for its current owner.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

**Retorno fuente:** ZPLC_LOADER_VERIFY_WORKSPACE_SIZE bytes owned by the caller until zplc_verify_scratch_give(), or NULL when the lock cannot be taken (the mutex object is not valid, which is a defect). The contents are whatever the last owner left; the verifier clears what it reads.

#### `zplc_verify_scratch_give`

```c
void zplc_verify_scratch_give(void);
```

**Resumen fuente:** Give the workspace back. Only the owner calls it, once per successful take.

**Parámetros**

| Nombre | Tipo | Descripción fuente |
| --- | --- | --- |
| — | — | Ninguno. |

### Tipos

Ninguno.

### Constantes y macros

| Nombre | Valor | Resumen fuente |
| --- | --- | --- |
| `ZPLC_VERIFY_SCRATCH_H` | `—` | — |

## Tablas del contrato binario

Estas tablas se generan desde `tools/contract/contract.json`, la fuente única de los opcodes, las constantes del contenedor, los códigos de error, las regiones de memoria y los layouts de los bloques de función de comunicación. Las cabeceras C, las tablas TypeScript del compilador y las herramientas Python se generan del mismo archivo, así que no pueden divergir.

### Constantes del contenedor

| Constante | Valor | Notas |
| --- | --- | --- |
| Número mágico | `0x434C505A` | `5A 50 4C 43` = "ZPLC" |
| Versión del ISA (mayor.menor) | `1.0` |  |
| Contador de borrador del contrato | `6` | Se escribe en la palabra 28 de la cabecera de cada artefacto. El loader y Studio rechazan un artefacto, o una imagen de dispositivo, cuyo contador difiere del propio y muestran ambos números; 0 significa un artefacto construido antes del contador. Aumenta con cada cambio del contrato hasta el congelamiento. |
| Tamaño de la cabecera del archivo (bytes) | `32` |  |
| Tamaño de la entrada de segmento (bytes) | `8` |  |
| Tamaño de la definición de tarea (bytes) | `16` |  |
| Tamaño de la entrada del mapa de E/S (bytes) | `8` |  |
| Tamaño de la entrada de etiqueta (bytes) | `8` |  |
| Máximo de tareas en un artefacto | `16` |  |
| Tamaño de la identidad de compilación (bytes) | `4` |  |
| Tamaño de la entrada de estado seguro (bytes) | `4` |  |
| Máximo de salidas para las que un artefacto puede declarar un valor seguro | `64` |  |
| Pila de evaluación más profunda que el loader demuestra | `127` | Una tarea que necesita más es rechazada, aunque la pila del destino lo permita; el compilador falla la compilación por encima. |
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
| `28` | `draft_counter` | `uint32_t` | 4 | Draft contract counter: must equal ZPLC_DRAFT_COUNTER (0 = built before the counter) |

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
| `12` | `call_depth` | `uint16_t` | 2 | Call frames active at once, the task body included (1 for a task that calls nothing); 0 = not declared (CMP-050) |
| `14` | `reserved` | `uint16_t` | 2 | Reserved (must be 0) |

### Layout de `zplc_build_info_t`

| Offset | Campo | Tipo | Bytes | Descripción |
| --- | --- | --- | --- | --- |
| `0` | `build_id` | `uint32_t` | 4 | CRC-32 of CODE then TASK; never 0 (0 = not identified) |

### Layout de `zplc_safe_entry_t`

| Offset | Campo | Tipo | Bytes | Descripción |
| --- | --- | --- | --- | --- |
| `0` | `offset` | `uint16_t` | 2 | Byte offset of the output in the output image |
| `2` | `bit` | `uint8_t` | 1 | Bit of the byte, 0 to 7 |
| `3` | `value` | `uint8_t` | 1 | The output's value in the safe state: 0 or 1 |

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
| `ZPLC_SEG_BUILD` | `0x40` | Build identity of the artifact (CMP-056) |
| `ZPLC_SEG_SAFE` | `0x41` | Declared safe values of digital outputs (RT-023) |

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
| `TIME` | `0x0C` | 4 | Time duration (unsigned 32-bit milliseconds) |
| `BYTE` | `0x10` | 1 | 8-bit bit string |
| `WORD` | `0x11` | 2 | 16-bit bit string |
| `DWORD` | `0x12` | 4 | 32-bit bit string |
| `LWORD` | `0x13` | 8 | 64-bit bit string |
| `STRING` | `0x20` | — | Variable-length string (IEC 61131-3) |

### Layout de STRING

Un STRING es `[longitud:2][capacidad:2][datos:capacidad+1]`, little-endian. La capacidad por defecto es de 80 caracteres (85 bytes) y la máxima de 255.

### Opcodes

El tamaño del operando sigue el rango del opcode (0x00-0x3F ninguno, 0x40-0x7F 8 bits, 0x80-0xBF 16 bits, 0xC0-0xFF 32 bits), salvo `RET` y los opcodes de `I2F` a `GED` (conversiones, aritmética y comparación de doble precisión), que no llevan operando. Los efectos sobre la pila ponen el tope a la derecha.

| Código | Mnemónico | Operando | Efecto en la pila | Flags | Descripción |
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
| `ZPLC_LOADER_ERR_COMM` | `-16` | Communication function-block kind is NONE or at or above the kind limit, or a block at a statically known address does not fit one memory region |
| `ZPLC_LOADER_ERR_DRAFT` | `-17` | Draft contract counter of the artifact differs from the loader's, or the artifact has none |
| `ZPLC_LOADER_ERR_STACK` | `-18` | The evaluation stack can underflow, or exceed the depth the task declares, on some path, or the verifier cannot prove that it cannot |
| `ZPLC_LOADER_ERR_SAFE` | `-19` | A declared safe value is invalid: the segment is not whole entries, an entry names no bit of the output image or a value other than 0 or 1, an output is declared twice, or there are too many |

### Bloques de función de comunicación

Cada instancia de bloque de función es un bloque de bytes en memoria de trabajo o retentiva. Todos los bloques empiezan con el mismo handshake de 8 bytes y terminan con un byte que pertenece al despachador (guarda ahí el EN anterior); ningún miembro lo cubre. El core toma el tamaño de un bloque de esta tabla.

| Nombre | Kind | Tamaño de la instancia (bytes) | Descripción |
| --- | --- | --- | --- |
| `MB_READ_HREG` | `0x0001` | 110 | Modbus read holding registers; COUNT registers requested, VALUE is the first register slot |
| `MB_WRITE_HREG` | `0x0002` | 110 | Modbus write holding registers; VALUE is the first write slot |
| `MB_READ_COIL` | `0x0003` | 110 | Modbus read coils |
| `MB_WRITE_COIL` | `0x0004` | 110 | Modbus write coils |
| `MQTT_CONNECT` | `0x000A` | 12 | MQTT connect |
| `MQTT_PUBLISH` | `0x000B` | 190 | MQTT publish |
| `MQTT_SUBSCRIBE` | `0x000C` | 190 | MQTT subscribe; PAYLOAD is an output |
| `AZURE_C2D_RECV` | `0x0020` | 95 | Azure cloud-to-device receive |
| `AZURE_DPS_PROV` | `0x0021` | 179 | Azure DPS provisioning |
| `AZURE_EG_PUB` | `0x0022` | 264 | Azure Event Grid publish |
| `AWS_FLEET_PROV` | `0x0030` | 179 | AWS fleet provisioning |
| `SPB_REBIRTH` | `0x0040` | 9 | Sparkplug B rebirth; a rising EN triggers REBIRTH |

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
| 93 | `ASSIGNED_HUB` | `STRING` | salida |

#### Layout de `AZURE_EG_PUB`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `TOPIC` | `STRING` | entrada |
| 93 | `EVENT_TYPE` | `STRING` | entrada |
| 178 | `PAYLOAD` | `STRING` | entrada |

#### Layout de `AWS_FLEET_PROV`

| Offset | Miembro | Tipo | Dirección |
| --- | --- | --- | --- |
| 0 | `EN` | `BOOL` | entrada |
| 1 | `BUSY` | `BOOL` | salida |
| 2 | `DONE` | `BOOL` | salida |
| 3 | `ERROR` | `BOOL` | salida |
| 4 | `STATUS` | `DINT` | salida |
| 8 | `TEMPLATE_NAME` | `STRING` | entrada |
| 93 | `THING_NAME` | `STRING` | salida |

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
| `ZPLC_COMM_UNAVAILABLE` | `10` |
| `ZPLC_COMM_UNKNOWN` | `255` |
