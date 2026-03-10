# Research: Communication Function Blocks — VM Spec

**Feature**: 003-comm-fb-vm
**Date**: 2026-03-10
**Status**: Complete — all NEEDS CLARIFICATION resolved

---

## 1. ISA Analysis & Opcode Allocation

### Decision

Reserve the **0xD0–0xDF** range for communication opcodes (32-bit operand family).
Add 3 opcodes:

- `OP_COMM_EXEC = 0xD0` — execute/update a Comm FB instance; 32-bit operand encodes `kind (16-bit) + flags (16-bit)`, FB base address follows from the top of the eval stack
- `OP_COMM_STATUS = 0xD1` — push runtime status word for a given kind to stack
- `OP_COMM_RESET = 0xD2` — reset handshake state for an FB instance at base address on stack

### Rationale

The existing ISA has a documented encoding scheme:

- `0x00–0x3F`: no operand
- `0x40–0x7F`: 8-bit operand
- `0x80–0xBF`: 16-bit operand
- `0xC0–0xFF`: 32-bit operand

`0xC0` is `OP_PUSH32` (the only used slot in this family). `0xD0–0xDF` is entirely unoccupied and within the correct encoding tier. Using 32-bit operands allows encoding both `kind` (16 bits) and a flags byte (16 bits) in a single instruction word, keeping the opcode compact.

The `OP_COMM_EXEC` design: the compiler pushes the FB base address onto the stack before emitting `OP_COMM_EXEC <kind>`. The VM pops the base address from the stack and calls the dispatch function.

### Alternatives Considered

- **New opcode family beyond 0xFF**: rejected — the ISA spec reserves exactly one byte per opcode; multi-byte opcodes would require VM fetch-decode changes.
- **Overloading `OP_CALL` with a magic address**: rejected — violates ISA principle that the call target must be a code segment address.
- **16-bit operand range (0x95–0x9F)**: not enough bits in the operand to encode both kind and flags.

---

## 2. FB Memory Layout Pattern

### Decision

Follow the **timer FB layout pattern** exactly:

- Fixed, compile-time size (`MemberDef[]` with explicit offsets)
- Only `MemberSize = 1 | 2 | 4` (no 64-bit in comm FBs except STATUS which is DINT/4 bytes)
- STRING members use the ZPLC STRING layout: `2-byte length + 2-byte capacity + data[capacity+1]`
- Layouts are documented in `communication.ts`

The handshake block is **shared across all Comm FB types**:

```
+0:  EN     (BOOL, 1)   — rising-edge trigger
+1:  BUSY   (BOOL, 1)   — operation in progress
+2:  DONE   (BOOL, 1)   — completed (pulses 1 scan)
+3:  ERROR  (BOOL, 1)   — failed (pulses 1 scan)
+4:  STATUS (DINT, 4)   — error code (0 = OK)
= 8 bytes shared header, then protocol-specific fields follow
```

### Rationale

All existing FBs (TON, CTU, etc.) use this pattern. The `FunctionBlockDef.size` is fully
static. The `generateCall` method emits input STORE instructions, then `PUSH16 <fb_base>`
followed by `OP_COMM_EXEC <kind>`, and reads outputs from fixed offsets. This requires
zero changes to the existing `CodeGenContext` interface.

### MB_READ_HREG Memory Layout (total: 110 bytes)

```
+0:   EN         (BOOL,  1)
+1:   BUSY       (BOOL,  1)
+2:   DONE       (BOOL,  1)
+3:   ERROR      (BOOL,  1)
+4:   STATUS     (DINT,  4)
+8:   PROTO      (USINT, 1)   — 0=RTU, 1=TCP
+9:   SLAVE_ID   (UINT,  2)
+11:  ADDR       (UINT,  2)
+13:  COUNT      (UINT,  2)
+15:  VALUE      (UINT,  2)   — output: read value
+17:  _pad       (1 byte)
+18:  HOST       (STRING[80]) — 85 bytes: 2+2+80+1
+103: PORT       (UINT,  2)
+105: _state     (USINT, 1)   — internal FSM state
+106: _pad       (4 bytes)
= 110 bytes total (aligned to 2)
```

### MQTT_PUBLISH Memory Layout (total: 190 bytes)

```
+0:   EN         (BOOL,  1)
+1:   BUSY       (BOOL,  1)
+2:   DONE       (BOOL,  1)
+3:   ERROR      (BOOL,  1)
+4:   STATUS     (DINT,  4)
+8:   QOS        (USINT, 1)
+9:   RETAIN     (BOOL,  1)
+10:  _pad       (2 bytes)
+12:  TOPIC      (STRING[80]) — 85 bytes
+97:  PAYLOAD    (STRING[80]) — 85 bytes
+182: _state     (USINT, 1)
+183: _pad       (7 bytes)
= 190 bytes total
```

---

## 3. Runtime Dispatch Architecture

### Decision

Add a new **`firmware/lib/zplc_core/src/core/zplc_comm_dispatch.c`** (and matching header
`firmware/lib/zplc_core/include/zplc_comm_dispatch.h`) that belongs to the Core library.

The dispatch module:

- Defines `zplc_comm_fb_kind_t` enum
- Exports `zplc_comm_fb_exec(kind, fb_base_addr, mem)` and `zplc_comm_fb_reset(kind, fb_base_addr, mem)`
- **Does not implement any protocol** — calls HAL-level comm service hooks
- Protocol hooks registered by the runtime (app layer) via `zplc_comm_register_handler(kind, handler_fn)`
- On POSIX/WASM targets: stub handlers return `ZPLC_STATUS_NOT_SUPPORTED`

This keeps the Core library free of Zephyr/POSIX API dependencies (HAL rule compliance).

### Handler Registration Pattern

```c
typedef int (*zplc_comm_handler_t)(uint16_t fb_base, uint8_t *mem, bool reset);
int zplc_comm_register_handler(zplc_comm_fb_kind_t kind, zplc_comm_handler_t fn);
```

Handlers are registered in `firmware/app/src/main.c` during boot, before the scheduler starts.
The handler table is a static array of `ZPLC_COMM_MAX_HANDLERS` entries (Kconfig, default 16).

### Rationale

- The Core VM cannot call `zplc_modbus_client.c` directly (HAL rule).
- A registration function called from app layer is the canonical pattern in Zephyr modules.
- POSIX/WASM stubs allow unit tests on host without protocol stacks.

### Alternatives Considered

- **Weak symbols for protocol handlers**: more idiomatic in C bare-metal but less testable and Zephyr-hostile (linker script complexity).
- **Direct dispatch table in `zplc_core.c`**: violates HAL abstraction — Core would import app-level symbols.

---

## 4. Compiler Codegen Pattern for Comm FBs

### Decision

Use the **same `generateCall` pattern** as timer FBs, with the addition of `OP_COMM_EXEC`:

```typescript
// Pseudocode for MB_READ_HREG.generateCall()
ctx.emit(`    ; MB_READ_HREG: write inputs`);
for (const param of params) {
  if (param.name === "EN") {
    ctx.emitExpression(param.value);
    ctx.emit(`    STORE8 ${enAddr}`);
  }
  if (param.name === "PROTO") {
    ctx.emitExpression(param.value);
    ctx.emit(`    STORE8 ${protoAddr}`);
  }
  // ... other inputs ...
}
ctx.emit(`    ; MB_READ_HREG: dispatch`);
ctx.emit(`    PUSH16 ${formatAddr(base)}`); // push FB base address
ctx.emit(`    OP_COMM_EXEC 0x0001`); // kind = ZPLC_COMM_FB_MB_READ_HREG
```

The VM pops `base`, reads all inputs from `mem[base..base+size]`, calls `zplc_comm_fb_exec()`,
which calls the registered Modbus client handler, which schedules the async request and
updates BUSY/DONE/ERROR/STATUS in VM memory via `zplc_mem_write8/16/32()`.

### Rationale

- Zero changes to `CodeGenContext` interface required.
- Consistent with how all other FBs work — no new compiler infrastructure.
- The TS assembler simply treats `OP_COMM_EXEC` as any other opcode with a 32-bit operand.

---

## 5. Modbus Client Integration

### Decision

The existing `firmware/app/src/zplc_modbus_client.c` is used as the transport backend.
A new `zplc_comm_modbus_handler()` in the app layer registers with the dispatch table and
calls `zplc_modbus_client_*` functions. Results are stored in FB memory via the registered
memory accessor, which the handler receives as a `uint8_t *mem` pointer.

**Important**: The existing `zplc_modbus.c` is a **server** (it exposes ZPLC variables over
Modbus TCP/RTU). The FB client feature is the companion: it **initiates** Modbus requests
to remote devices. Both coexist independently.

---

## 6. MQTT Integration

### Decision

The existing `zplc_mqtt.c` thread manages connection state. A new wrapper
`zplc_comm_mqtt_handler()` checks the `s_connected` state via a new exported accessor
`zplc_mqtt_is_connected()` and enqueues publish/subscribe requests into a static ring buffer
that the MQTT thread drains on each poll cycle. This avoids invoking `mqtt_publish()` from
the VM scan thread (which would be a race condition).

The ring buffer is a static `ZPLC_MQTT_CMD_QUEUE_SIZE` entry array (Kconfig, default 8).
Overflow returns `ZPLC_STATUS_QUEUE_FULL` mapped to a non-zero `STATUS` code.

### Rationale

The scan cycle and the MQTT thread run concurrently. Direct `mqtt_publish()` from the VM
would require the MQTT socket lock — unacceptable latency in a scan context. The ring
buffer is the standard Zephyr pattern for inter-thread communication without malloc.

---

## 7. IDE Visual Block Replacement

### Decision

Replace the current placeholder code in:

- `packages/zplc-ide/src/transpiler/fbdToST.ts`
- `packages/zplc-ide/src/transpiler/ldToST.ts`

The placeholders currently emit `// COMM_CONNECT placeholder` style assignments. They will
be replaced with proper ST FB call syntax:

```
ReadTemp(EN := ..., PROTO := 1, ...);
```

This is generated by looking up the FB port schema from a new `commBlockCatalog.ts` that mirrors
the `FunctionBlockDef` shapes defined in `communication.ts`.

---

## 8. Testing Approach

### Firmware Unit Tests (C, ctest)

- New test file: `firmware/lib/zplc_core/tests/test_comm_dispatch.c`
- Tests: stub handler registration, exec->handler call, reset, BUSY/DONE/ERROR state machine
- Run: `cd firmware/lib/zplc_core/build && cmake .. && make && ctest --output-on-failure`

### Compiler Unit Tests (TypeScript, bun test)

- New test file: `packages/zplc-compiler/src/compiler/stdlib/communication.test.ts`
- Tests: FB lookup by name, `generateCall` emits correct opcodes for each FB kind, opcode offset correctness
- Run: `cd packages/zplc-compiler && bun test communication.test.ts`

### Cross-compilation Gate

- `west build` for all 5 CI boards must succeed after ISA additions
- The new opcodes must appear in `zplc_opcode_is_valid()` switch
