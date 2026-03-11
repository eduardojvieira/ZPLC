# Communication Function Blocks — VM Spec

**Status:** Draft  
**Scope:** Real VM-backed communication function blocks for all in-scope protocols and all supported PLC languages (`ST`, `IL`, `LD`, `FBD`, `SFC`).

---

## 1. Goal

Define how ZPLC will support **real communication function blocks executed by the VM**, instead of the current mix of:

- runtime-side communication threads (`Modbus`, `MQTT`, `Azure`, `AWS`)
- compile-time tag helpers (`{modbus:N}`, `MODBUS_COIL(...)`)
- visual communication blocks that currently transpile to placeholder assignments

This spec covers the architecture, opcode model, function block contracts, compiler work, IDE work, and rollout plan required to make communication blocks first-class runtime features.

---

## 2. Current State

### What exists today

- The VM has **no communication opcodes**.
- Communication logic lives outside the VM in runtime services:
  - `firmware/app/src/zplc_modbus.c`
  - `firmware/app/src/zplc_modbus_client.c`
  - `firmware/app/src/zplc_mqtt.c`
  - `firmware/app/src/zplc_azure_dps.c`
  - `firmware/app/src/zplc_aws_fleet.c`
- The IDE already exposes visual communication blocks (`COMM_CONNECT`, `COMM_PUBLISH`, `COMM_SUBSCRIBE`, `COMM_MODBUS`), but they are **not real runtime FBs**.
- Cross-language Modbus server bindings currently work through **compile-time helper expansion**, not VM execution.

### What is missing

- ISA support for communication services
- VM execution semantics for async communication operations
- Real stdlib FBs/functions in `@zplc/compiler`
- Real compiler codegen for communication operations
- Consistent language support across `ST`, `IL`, `LD`, `FBD`, and `SFC`
- Deterministic status/error behavior across scan cycles

---

## 3. In-Scope Protocols

After scope cleanup, the only communication protocols that need VM-backed FB support are:

1. Modbus RTU
2. Modbus TCP
3. Generic MQTT
4. Sparkplug B (via MQTT wrappers)
5. Azure IoT Hub / C2D / DPS / Event Grid (via MQTT wrappers)
6. AWS IoT Core / Fleet Provisioning (via MQTT wrappers)

Out of scope:

- OPC UA
- EtherNet/IP
- PROFINET

---

## 4. Design Principles

1. **No malloc** inside VM execution paths.
2. **Deterministic scan behavior**: FB execution per scan must be bounded and explicit.
3. **Async by contract**: communication FBs are state machines, not blocking calls.
4. **Runtime services own transport**: VM does not open sockets directly.
5. **FB instance memory is authoritative** for per-block inputs, outputs, status, and handshake bits.
6. **Language parity**: all supported languages must converge to the same FB contracts.
7. **Protocol-specific wrappers come after generic primitives**.

---

## 5. Architectural Model

Communication FB support will be split into three layers.

### Layer A — VM/ISA

Add a small communication opcode family to the ISA. These opcodes do **not** implement protocol stacks themselves; they dispatch requests to runtime communication services.

### Layer B — Runtime Communication Service Table

Add a runtime-side command dispatcher that:

- receives VM-issued communication operations
- resolves the target protocol/service
- schedules or executes protocol-specific work
- writes status/results back to FB instance memory or runtime result buffers

### Layer C — Compiler / IEC stdlib

Add real stdlib communication FBs/functions to the compiler so:

- ST can call them directly
- IL can `CAL` them
- LD/FBD can render them as real blocks
- SFC action code can use them naturally

---

## 6. Execution Semantics

Communication FBs are **non-blocking state machines**.

Each FB follows this handshake model:

- `EN`: request execution
- `BUSY`: runtime operation in progress
- `DONE`: operation completed successfully for one scan
- `ERROR`: operation failed for one scan
- `STATUS`: numeric error/status code

Rules:

1. Rising edge on `EN` starts a new operation if the FB is idle.
2. While in progress, `BUSY = TRUE`.
3. On successful completion, `DONE = TRUE` for one scan.
4. On failure, `ERROR = TRUE` for one scan and `STATUS != 0`.
5. Retrigger while busy is ignored unless a protocol-specific FB explicitly supports cancel/restart.

This avoids blocking a task scan on network/serial latency.

---

## 7. Required ISA Additions

### New opcodes

Reserve a new opcode family for communication service dispatch.

Proposed minimum set:

- `OP_COMM_EXEC`
  - Execute/update a communication FB instance
- `OP_COMM_STATUS`
  - Query runtime communication status by FB instance
- `OP_COMM_RESET`
  - Reset FB/runtime handshake state

### Operand model

`OP_COMM_EXEC` takes:

- FB kind ID
- base address of the FB instance in work memory

The runtime reads inputs directly from FB memory and writes outputs directly back to FB memory.

### Required VM/runtime changes

- `firmware/lib/zplc_core/include/zplc_isa.h`
- `firmware/lib/zplc_core/src/core/zplc_core.c`
- `firmware/lib/zplc_core/src/core/zplc_debug.c`
- opcode tests in `firmware/lib/zplc_core/tests/`

---

## 8. Required Runtime Service API

Add a runtime communication dispatch layer with a stable API such as:

```c
typedef enum {
  ZPLC_COMM_FB_MB_READ_HREG = 1,
  ZPLC_COMM_FB_MB_WRITE_HREG = 2,
  ZPLC_COMM_FB_MB_READ_COIL = 3,
  ZPLC_COMM_FB_MB_WRITE_COIL = 4,
  ZPLC_COMM_FB_MQTT_CONNECT = 10,
  ZPLC_COMM_FB_MQTT_PUBLISH = 11,
  ZPLC_COMM_FB_MQTT_SUBSCRIBE = 12,
  ZPLC_COMM_FB_COMM_STATUS = 20,
} zplc_comm_fb_kind_t;

int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint16_t fb_base_addr);
int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint16_t fb_base_addr);
```

This layer will bridge to existing runtime modules instead of duplicating protocol logic.

---

## 9. First-Class FB Set

## Phase 1 — Modbus

These are the first required real VM FBs.

### `MB_READ_HREG`

Inputs:

- `EN : BOOL`
- `PROTO : USINT` (`0=RTU`, `1=TCP`)
- `SLAVE_ID : UINT`
- `ADDR : UINT`
- `COUNT : UINT`
- `HOST : STRING` (TCP only)
- `PORT : UINT` (TCP only)

Outputs:

- `BUSY : BOOL`
- `DONE : BOOL`
- `ERROR : BOOL`
- `STATUS : DINT`
- `VALUE : UINT`

### `MB_WRITE_HREG`

Inputs:

- `EN : BOOL`
- `PROTO : USINT`
- `SLAVE_ID : UINT`
- `ADDR : UINT`
- `VALUE : UINT`
- `HOST : STRING`
- `PORT : UINT`

Outputs:

- `BUSY : BOOL`
- `DONE : BOOL`
- `ERROR : BOOL`
- `STATUS : DINT`

### `MB_READ_COIL`

Inputs/outputs follow the same pattern with `VALUE : BOOL`.

### `MB_WRITE_COIL`

Inputs/outputs follow the same pattern with `VALUE : BOOL`.

## Phase 2 — Generic MQTT

### `MQTT_CONNECT`

Inputs:

- `EN : BOOL`
- `PROFILE : USINT`

Outputs:

- `BUSY : BOOL`
- `DONE : BOOL`
- `ERROR : BOOL`
- `STATUS : DINT`
- `CONNECTED : BOOL`

### `MQTT_PUBLISH`

Inputs:

- `EN : BOOL`
- `TOPIC : STRING`
- `PAYLOAD : STRING`
- `QOS : USINT`
- `RETAIN : BOOL`

Outputs:

- `BUSY : BOOL`
- `DONE : BOOL`
- `ERROR : BOOL`
- `STATUS : DINT`

### `MQTT_SUBSCRIBE`

Inputs:

- `EN : BOOL`
- `TOPIC : STRING`
- `QOS : USINT`

Outputs:

- `BUSY : BOOL`
- `DONE : BOOL`
- `ERROR : BOOL`
- `STATUS : DINT`
- `VALID : BOOL`
- `PAYLOAD : STRING`

## Phase 3 — Cloud Wrappers

Only after generic MQTT works:

- `AZURE_C2D_RECV`
- `AZURE_DPS_PROVISION`
- `AZURE_EVENTGRID_PUBLISH`
- `AWS_FLEET_PROVISION`
- `SPB_REBIRTH`

These wrappers may compile to generic MQTT FBs or use direct runtime service kinds if required.

---

## 10. Language Mapping

### ST

Direct FB/function calls.

```st
VAR
    ReadTemp : MB_READ_HREG;
END_VAR

ReadTemp(
    EN := StartRead,
    PROTO := 1,
    SLAVE_ID := 1,
    ADDR := 40001,
    COUNT := 1,
    HOST := '192.168.1.20',
    PORT := 502
);
```

### IL

Use `CAL` / `CALC` with the same FB contracts.

### LD

Expose real communication blocks with the same ports (`EN`, `BUSY`, `DONE`, `ERROR`, `STATUS`, protocol-specific fields).

### FBD

Use the same block set and port schema as LD.

### SFC

Use these FBs naturally in action bodies after SFC transpiles to ST.

---

## 11. Compiler Work Required

### `@zplc/compiler`

Add real stdlib communication FBs in:

- `packages/zplc-compiler/src/compiler/stdlib/communication.ts`

Register them in:

- `packages/zplc-compiler/src/compiler/stdlib/index.ts`

Required work:

- define FB memory layouts
- implement codegen that emits `OP_COMM_EXEC` / related opcodes
- add tests for stdlib lookup and codegen

### IDE transpilers

Replace current placeholder communication block generation with real ST FB calls.

Required files:

- `packages/zplc-ide/src/transpiler/fbdToST.ts`
- `packages/zplc-ide/src/transpiler/ldToST.ts`
- `packages/zplc-ide/src/compiler/il/ilToST.ts`
- visual block schemas/catalogs/editors

---

## 12. IDE Work Required

1. Replace placeholder communication blocks with real FB definitions.
2. Expose protocol-specific parameter editors in FBD/LD.
3. Keep server-binding helpers (`MODBUS_COIL`, etc.) as a separate feature; they are still useful and should not be removed.
4. Add inspector/debug UI for communication FB runtime status.

---

## 13. Rollout Plan

### Step 1

Implement ISA + VM dispatch for communication FBs.

### Step 2

Implement real Modbus FBs:

- `MB_READ_HREG`
- `MB_WRITE_HREG`
- `MB_READ_COIL`
- `MB_WRITE_COIL`

### Step 3

Implement generic MQTT FBs:

- `MQTT_CONNECT`
- `MQTT_PUBLISH`
- `MQTT_SUBSCRIBE`
- `COMM_STATUS`

### Step 4

Implement cloud-specific wrappers using the generic MQTT layer.

---

## 14. Explicit Non-Goals

- No blocking network or serial operations directly inside scan execution loops without bounded async/state-machine behavior.
- No fake visual blocks that only assign local variables.
- No protocol-specific VM opcodes before the generic communication dispatch model exists.
- No reintroduction of OPC UA, EtherNet/IP, or PROFINET.

---

## 15. Decision Summary

The current repo does **not** have true VM-backed communication FBs.

To implement them properly, ZPLC must add:

1. ISA support
2. VM dispatch support
3. runtime communication service dispatch
4. real compiler stdlib FBs
5. real IDE visual block mappings

The correct first implementation target is **Modbus**, followed by **generic MQTT**, followed by **cloud wrappers**.
