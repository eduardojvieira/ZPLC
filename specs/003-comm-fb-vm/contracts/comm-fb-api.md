# Contract: Communication Dispatch API

**Feature**: 003-comm-fb-vm
**Type**: C API contract (Core library) + TypeScript stdlib contract
**Date**: 2026-03-10

---

## C Runtime Dispatch Contract

### Header: `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`

This is the stable interface between the VM opcode handler and the runtime protocol services.
The Core library defines this header. The app layer provides the implementations.

```c
/**
 * @brief Communication function block kind identifiers.
 *
 * Encoded as the lower 16 bits of the OP_COMM_EXEC operand.
 * Ranges:
 *   0x0001–0x0009  Modbus (Phase 1)
 *   0x000A–0x0013  MQTT   (Phase 2)
 *   0x0014         COMM_STATUS (generic)
 *   0x0020–0x002F  Azure  (Phase 3)
 *   0x0030–0x003F  AWS    (Phase 3)
 *   0x0040–0x00FF  Future use
 */
typedef enum {
    ZPLC_COMM_FB_NONE           = 0x0000,
    ZPLC_COMM_FB_MB_READ_HREG   = 0x0001,
    ZPLC_COMM_FB_MB_WRITE_HREG  = 0x0002,
    ZPLC_COMM_FB_MB_READ_COIL   = 0x0003,
    ZPLC_COMM_FB_MB_WRITE_COIL  = 0x0004,
    ZPLC_COMM_FB_MQTT_CONNECT   = 0x000A,
    ZPLC_COMM_FB_MQTT_PUBLISH   = 0x000B,
    ZPLC_COMM_FB_MQTT_SUBSCRIBE = 0x000C,
    ZPLC_COMM_FB_COMM_STATUS    = 0x0014,
    ZPLC_COMM_FB_AZURE_C2D_RECV = 0x0020,
    ZPLC_COMM_FB_AZURE_DPS_PROV = 0x0021,
    ZPLC_COMM_FB_AZURE_EG_PUB   = 0x0022,
    ZPLC_COMM_FB_AWS_FLEET_PROV = 0x0030,
    ZPLC_COMM_FB_SPB_REBIRTH    = 0x0040,
} zplc_comm_fb_kind_t;

/**
 * @brief Communication status codes written to FB.STATUS.
 * All non-zero values indicate an error condition.
 */
typedef enum {
    ZPLC_COMM_OK              = 0,
    ZPLC_COMM_BUSY            = 1,
    ZPLC_COMM_TIMEOUT         = 2,
    ZPLC_COMM_NO_HANDLER      = 3,
    ZPLC_COMM_NOT_CONNECTED   = 4,
    ZPLC_COMM_QUEUE_FULL      = 5,
    ZPLC_COMM_INVALID_ADDR    = 6,
    ZPLC_COMM_STRING_OVERFLOW = 7,
    ZPLC_COMM_PROTO_ERROR     = 8,
    ZPLC_COMM_AUTH_FAILED     = 9,
    ZPLC_COMM_UNKNOWN         = 0xFF,
} zplc_comm_status_t;

/**
 * @brief Comm FB handler function type.
 *
 * Called by the VM on every OP_COMM_EXEC for the given kind.
 * The handler MUST NOT block. It MUST update handshake bytes in mem[fb_base..].
 * If reset=true, the handler MUST clear FSM state and set all outputs to 0.
 *
 * @param kind     FB kind being executed
 * @param fb_base  Base address in VM memory of the FB instance
 * @param mem      Pointer to the full VM memory region
 * @param reset    TRUE if this is an OP_COMM_RESET call
 * @return         0 on success, negative errno on fatal error
 */
typedef int (*zplc_comm_handler_t)(zplc_comm_fb_kind_t kind,
                                    uint16_t fb_base,
                                    uint8_t *mem,
                                    bool reset);

/**
 * @brief Register a handler for a communication FB kind.
 *
 * Must be called from app init code BEFORE the scheduler starts.
 * Registering the same kind twice overwrites the previous handler.
 *
 * @param kind  FB kind to handle
 * @param fn    Handler function (must not be NULL)
 * @return 0 on success, -EINVAL if kind is out of range or fn is NULL
 */
int zplc_comm_register_handler(zplc_comm_fb_kind_t kind,
                                zplc_comm_handler_t fn);

/**
 * @brief Execute a communication FB instance (called by VM from OP_COMM_EXEC).
 *
 * Reads inputs from VM memory at fb_base. Calls the registered handler.
 * If no handler: sets STATUS = ZPLC_COMM_NO_HANDLER, ERROR = 1.
 */
int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint16_t fb_base,
                      uint8_t *mem);

/**
 * @brief Reset a communication FB instance (called by VM from OP_COMM_RESET).
 */
int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint16_t fb_base,
                       uint8_t *mem);
```

---

## Handshake Contract (all Comm FBs)

Every handler MUST honor these rules:

| Condition            | EN    | BUSY result | DONE result | ERROR result | STATUS result |
| -------------------- | ----- | ----------- | ----------- | ------------ | ------------- |
| FB idle, EN=0        | FALSE | 0           | 0           | 0            | unchanged     |
| EN rising edge       | TRUE→ | 1           | 0           | 0            | 0             |
| Operation pending    | TRUE  | 1           | 0           | 0            | 0             |
| Operation success    | TRUE  | 0           | 1           | 0            | 0             |
| Operation failure    | TRUE  | 0           | 0           | 1            | error_code    |
| Next scan after DONE | any   | 0           | 0           | 0            | 0             |

DONE and ERROR are **pulse outputs** — the VM clears them on the scan following assertion.

---

## TypeScript FB Definition Contract

Each communication FB in `communication.ts` MUST export a `FunctionBlockDef` object that:

1. Has a stable `name` string matching the IEC 61131-3 identifier (e.g. `'MB_READ_HREG'`)
2. Has a `size` in bytes matching the data-model layout exactly
3. Has a `members` array matching `data-model.md` offsets
4. Has a `generateCall(ctx, params)` that:
   - Stores all input parameters to their correct offsets using `STORE8`/`STORE16`/`STORE32`
   - Emits `PUSH16 <fb_base_addr>` (the base address of the FB instance)
   - Emits `OP_COMM_EXEC <kind_hex>` (assembler mnemonic + 32-bit operand)
   - Does NOT read output fields — outputs are read by subsequent ST code via member access

---

## IDE Visual Block Catalog Contract

`packages/zplc-ide/src/editors/comm/commBlockCatalog.ts` MUST export:

```typescript
export interface CommBlockPort {
  name: string;
  direction: "IN" | "OUT";
  dataType: string; // IEC 61131-3 type name
  required: boolean;
}

export interface CommBlockDef {
  kind: number; // zplc_comm_fb_kind_t numeric value
  name: string; // e.g. 'MB_READ_HREG'
  label: string; // Display label
  category: "modbus" | "mqtt" | "azure" | "aws" | "generic";
  phase: 1 | 2 | 3;
  ports: CommBlockPort[];
}
```

This catalog is the **single source of truth** for which visual ports appear in LD/FBD editors.
It MUST stay in sync with `FunctionBlockDef.members` in `communication.ts`.
