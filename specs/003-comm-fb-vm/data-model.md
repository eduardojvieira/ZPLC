# Data Model: Communication Function Blocks — VM Spec

**Feature**: 003-comm-fb-vm
**Date**: 2026-03-10

---

## 1. Core Entities

### CommFbKind (enum — ISA + Runtime)

Uniquely identifies a communication FB type. Values are encoded as the 32-bit operand
of `OP_COMM_EXEC`.

| Value  | Constant Name                   | Description               |
| ------ | ------------------------------- | ------------------------- |
| 0x0001 | `ZPLC_COMM_FB_MB_READ_HREG`     | Modbus Read Holding Reg   |
| 0x0002 | `ZPLC_COMM_FB_MB_WRITE_HREG`    | Modbus Write Holding Reg  |
| 0x0003 | `ZPLC_COMM_FB_MB_READ_COIL`     | Modbus Read Coil          |
| 0x0004 | `ZPLC_COMM_FB_MB_WRITE_COIL`    | Modbus Write Coil         |
| 0x000A | `ZPLC_COMM_FB_MQTT_CONNECT`     | MQTT Connect              |
| 0x000B | `ZPLC_COMM_FB_MQTT_PUBLISH`     | MQTT Publish              |
| 0x000C | `ZPLC_COMM_FB_MQTT_SUBSCRIBE`   | MQTT Subscribe            |
| 0x0014 | `ZPLC_COMM_FB_COMM_STATUS`      | Query comm runtime status |
| 0x0020 | `ZPLC_COMM_FB_AZURE_C2D_RECV`   | Azure C2D receive (P3)    |
| 0x0021 | `ZPLC_COMM_FB_AZURE_DPS_PROV`   | Azure DPS provision (P3)  |
| 0x0022 | `ZPLC_COMM_FB_AZURE_EG_PUBLISH` | Azure Event Grid (P3)     |
| 0x0030 | `ZPLC_COMM_FB_AWS_FLEET_PROV`   | AWS Fleet Provision (P3)  |
| 0x0040 | `ZPLC_COMM_FB_SPB_REBIRTH`      | Sparkplug B Rebirth (P3)  |

**Reserved ranges**: 0x0005–0x0009 (Modbus expansion), 0x000D–0x0013 (MQTT expansion),
0x0015–0x001F (generic), 0x0023–0x002F (Azure expansion), 0x0031–0x003F (AWS expansion),
0x0041–0x00FF (future protocols).

---

### CommFbHandshake (shared memory header — all Comm FBs)

Offset within any Comm FB instance memory block.

| Offset | Field  | Type | Size | Description                          |
| ------ | ------ | ---- | ---- | ------------------------------------ |
| +0     | EN     | BOOL | 1    | Rising-edge trigger input            |
| +1     | BUSY   | BOOL | 1    | TRUE while operation in progress     |
| +2     | DONE   | BOOL | 1    | TRUE for exactly one scan on success |
| +3     | ERROR  | BOOL | 1    | TRUE for exactly one scan on failure |
| +4     | STATUS | DINT | 4    | Error/status code (0 = OK)           |

Total handshake header: **8 bytes**.

---

### CommFbState (internal FSM — stored in `_state` byte)

| Value | Name                   | Description                           |
| ----- | ---------------------- | ------------------------------------- |
| 0x00  | `COMM_STATE_IDLE`      | No pending operation                  |
| 0x01  | `COMM_STATE_REQUESTED` | VM issued the request this scan       |
| 0x02  | `COMM_STATE_PENDING`   | Runtime has accepted, awaiting result |
| 0x03  | `COMM_STATE_DONE`      | Result available, DONE will pulse     |
| 0x04  | `COMM_STATE_ERROR`     | Error occurred, ERROR will pulse      |

**FSM transitions (per scan)**:

- `IDLE + EN rising edge` → `REQUESTED` (handler called, BUSY=1)
- `REQUESTED` → `PENDING` (handler accepted request asynchronously)
- `PENDING` → `DONE` or `ERROR` (result written by runtime callback)
- `DONE/ERROR` → `IDLE` (VM clears DONE/ERROR after one scan cycle)

---

### MB_READ_HREG (Comm FB — Phase 1)

| Offset | Field    | Type       | Size | Direction | Description         |
| ------ | -------- | ---------- | ---- | --------- | ------------------- |
| +0     | EN       | BOOL       | 1    | IN        | Handshake input     |
| +1     | BUSY     | BOOL       | 1    | OUT       | Handshake output    |
| +2     | DONE     | BOOL       | 1    | OUT       | Handshake output    |
| +3     | ERROR    | BOOL       | 1    | OUT       | Handshake output    |
| +4     | STATUS   | DINT       | 4    | OUT       | Error code          |
| +8     | PROTO    | USINT      | 1    | IN        | 0=RTU, 1=TCP        |
| +9     | SLAVE_ID | UINT       | 2    | IN        | Modbus unit ID      |
| +11    | ADDR     | UINT       | 2    | IN        | Register start addr |
| +13    | COUNT    | UINT       | 2    | IN        | Register count      |
| +15    | VALUE    | UINT       | 2    | OUT       | First value read    |
| +17    | \_pad    | —          | 1    | INT       | Alignment           |
| +18    | HOST     | STRING[80] | 85   | IN        | TCP hostname/IP     |
| +103   | PORT     | UINT       | 2    | IN        | TCP port (def.502)  |
| +105   | \_state  | USINT      | 1    | INT       | FSM state           |
| +106   | \_pad    | —          | 4    | INT       | Alignment to 2      |

**Total size: 110 bytes**

---

### MB_WRITE_HREG (Comm FB — Phase 1)

Same as `MB_READ_HREG` but `VALUE` (UINT, +15) is an **input**, no `COUNT` (removed).
Total size: **110 bytes** (same layout, `COUNT` set to 1 internally).

---

### MB_READ_COIL / MB_WRITE_COIL (Comm FB — Phase 1)

Same layout as `MB_READ_HREG`/`MB_WRITE_HREG` except `VALUE` type is **BOOL (1 byte)**.
Total size: **109 bytes**, padded to **110 bytes**.

---

### MQTT_CONNECT (Comm FB — Phase 2)

| Offset | Field     | Type  | Size | Direction | Description          |
| ------ | --------- | ----- | ---- | --------- | -------------------- |
| +0     | EN        | BOOL  | 1    | IN        | Handshake            |
| +1     | BUSY      | BOOL  | 1    | OUT       | Handshake            |
| +2     | DONE      | BOOL  | 1    | OUT       | Handshake            |
| +3     | ERROR     | BOOL  | 1    | OUT       | Handshake            |
| +4     | STATUS    | DINT  | 4    | OUT       | Error code           |
| +8     | PROFILE   | USINT | 1    | IN        | Broker profile index |
| +9     | CONNECTED | BOOL  | 1    | OUT       | Current conn state   |
| +10    | \_state   | USINT | 1    | INT       | FSM state            |
| +11    | \_pad     | —     | 1    | INT       | Alignment            |

**Total size: 12 bytes**

---

### MQTT_PUBLISH (Comm FB — Phase 2)

| Offset | Field   | Type       | Size | Direction | Description     |
| ------ | ------- | ---------- | ---- | --------- | --------------- |
| +0     | EN      | BOOL       | 1    | IN        | Handshake       |
| +1     | BUSY    | BOOL       | 1    | OUT       | Handshake       |
| +2     | DONE    | BOOL       | 1    | OUT       | Handshake       |
| +3     | ERROR   | BOOL       | 1    | OUT       | Handshake       |
| +4     | STATUS  | DINT       | 4    | OUT       | Error code      |
| +8     | QOS     | USINT      | 1    | IN        | 0/1/2           |
| +9     | RETAIN  | BOOL       | 1    | IN        | Retain flag     |
| +10    | \_pad   | —          | 2    | INT       | Alignment       |
| +12    | TOPIC   | STRING[80] | 85   | IN        | MQTT topic      |
| +97    | PAYLOAD | STRING[80] | 85   | IN        | Message payload |
| +182   | \_state | USINT      | 1    | INT       | FSM state       |
| +183   | \_pad   | —          | 7    | INT       | Padding to 190  |

**Total size: 190 bytes**

---

### MQTT_SUBSCRIBE (Comm FB — Phase 2)

| Offset | Field   | Type       | Size | Direction | Description               |
| ------ | ------- | ---------- | ---- | --------- | ------------------------- |
| +0     | EN      | BOOL       | 1    | IN        | Handshake                 |
| +1     | BUSY    | BOOL       | 1    | OUT       | Handshake                 |
| +2     | DONE    | BOOL       | 1    | OUT       | Handshake                 |
| +3     | ERROR   | BOOL       | 1    | OUT       | Handshake                 |
| +4     | STATUS  | DINT       | 4    | OUT       | Error code                |
| +8     | QOS     | USINT      | 1    | IN        | 0/1/2                     |
| +9     | VALID   | BOOL       | 1    | OUT       | TRUE when new msg arrived |
| +10    | \_pad   | —          | 2    | INT       | Alignment                 |
| +12    | TOPIC   | STRING[80] | 85   | IN        | MQTT topic pattern        |
| +97    | PAYLOAD | STRING[80] | 85   | OUT       | Last received payload     |
| +182   | \_state | USINT      | 1    | INT       | FSM state                 |
| +183   | \_pad   | —          | 7    | INT       | Padding                   |

**Total size: 190 bytes**

---

## 2. ISA — New Opcodes

| Opcode           | Hex  | Family | Operand Size | Description                                      |
| ---------------- | ---- | ------ | ------------ | ------------------------------------------------ |
| `OP_COMM_EXEC`   | 0xD0 | 32-bit | 4 bytes      | Execute/update Comm FB; pop base addr from stack |
| `OP_COMM_STATUS` | 0xD1 | 32-bit | 4 bytes      | Push status word for a kind to stack             |
| `OP_COMM_RESET`  | 0xD2 | 32-bit | 4 bytes      | Reset FSM for Comm FB; pop base addr from stack  |

Operand for `OP_COMM_EXEC` / `OP_COMM_RESET`:

- bits [15:0] = `zplc_comm_fb_kind_t` value
- bits [31:16] = reserved (must be 0)

---

## 3. Runtime Dispatch API

```c
// Declared in: firmware/lib/zplc_core/include/zplc_comm_dispatch.h

typedef enum {
  ZPLC_COMM_FB_MB_READ_HREG   = 0x0001,
  ZPLC_COMM_FB_MB_WRITE_HREG  = 0x0002,
  ZPLC_COMM_FB_MB_READ_COIL   = 0x0003,
  ZPLC_COMM_FB_MB_WRITE_COIL  = 0x0004,
  ZPLC_COMM_FB_MQTT_CONNECT   = 0x000A,
  ZPLC_COMM_FB_MQTT_PUBLISH   = 0x000B,
  ZPLC_COMM_FB_MQTT_SUBSCRIBE = 0x000C,
} zplc_comm_fb_kind_t;

typedef int (*zplc_comm_handler_t)(zplc_comm_fb_kind_t kind,
                                    uint16_t fb_base, uint8_t *mem,
                                    bool reset);

int zplc_comm_register_handler(zplc_comm_fb_kind_t kind,
                                zplc_comm_handler_t fn);

int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint16_t fb_base,
                      uint8_t *mem);

int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint16_t fb_base,
                       uint8_t *mem);
```

---

## 4. Status Codes

Non-zero `STATUS` field values for Comm FB error reporting:

| Code | Constant                    | Description                        |
| ---- | --------------------------- | ---------------------------------- |
| 0    | `ZPLC_COMM_OK`              | Success                            |
| 1    | `ZPLC_COMM_BUSY`            | Previous operation still pending   |
| 2    | `ZPLC_COMM_TIMEOUT`         | No response within timeout         |
| 3    | `ZPLC_COMM_NO_HANDLER`      | No handler registered for kind     |
| 4    | `ZPLC_COMM_NOT_CONNECTED`   | Transport not connected            |
| 5    | `ZPLC_COMM_QUEUE_FULL`      | Command queue full                 |
| 6    | `ZPLC_COMM_INVALID_ADDR`    | Modbus address not mapped          |
| 7    | `ZPLC_COMM_STRING_OVERFLOW` | STRING input truncated             |
| 8    | `ZPLC_COMM_PROTO_ERROR`     | Protocol-level error (Modbus exc.) |
| 9    | `ZPLC_COMM_AUTH_FAILED`     | Authentication failure             |
| 0xFF | `ZPLC_COMM_UNKNOWN`         | Unclassified error                 |
