# Debug Protocol Specification

**Feature**: 002-hil-testing  
**Version**: 1.0  
**Date**: 2026-01-22

## Overview

This document defines the serial communication protocol between the HIL test runner (host) and the ZPLC runtime (device). The protocol is line-based JSON, using CRLF (`\r\n`) as line terminators.

## Transport Layer

| Parameter | Value |
|-----------|-------|
| Baud Rate | 115200 |
| Data Bits | 8 |
| Stop Bits | 1 |
| Parity | None |
| Flow Control | None |
| Line Terminator | `\r\n` |
| Max Line Length | 256 bytes |
| Encoding | ASCII (7-bit) |

## Message Framing

Each message is a single JSON object on its own line. Messages MUST NOT span multiple lines.

```
{"t":"opcode","op":"ADD","pc":18,"sp":2,"tos":7}\r\n
{"t":"fb","name":"TON","id":0,"q":true,"et":100}\r\n
```

## Device → Host Messages

### 1. Opcode Trace (`opcode`)

Emitted after each opcode execution in **verbose** mode.

```json
{"t":"opcode","op":"ADD","pc":18,"sp":2,"tos":7}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | Always `"opcode"` |
| `op` | string | Opcode mnemonic (e.g., `"ADD"`, `"LD_I16"`, `"JMP"`) |
| `pc` | number | Program counter BEFORE execution (0-65535) |
| `sp` | number | Stack pointer AFTER execution (0-31) |
| `tos` | number | Top of stack value AFTER execution (signed 32-bit) |

### 2. Function Block Trace (`fb`)

Emitted after each function block execution.

```json
{"t":"fb","name":"TON","id":0,"q":true,"et":100}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | Always `"fb"` |
| `name` | string | Block type: `"TON"`, `"TOF"`, `"TP"`, `"CTU"`, `"CTD"`, `"R_TRIG"`, `"F_TRIG"`, etc. |
| `id` | number | Instance ID (0-255) |
| `q` | boolean | Q output value |
| `et` | number? | Elapsed time in ms (timers only) |
| `cv` | number? | Current value (counters only) |

### 3. Task Execution (`task`)

Emitted after each task completes a scan cycle in **summary** or **verbose** mode.

```json
{"t":"task","id":1,"start":1000,"end":1045,"us":45,"ovr":false}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | Always `"task"` |
| `id` | number | Task ID (0-7) |
| `start` | number | Task start time (ms since boot) |
| `end` | number | Task end time (ms since boot) |
| `us` | number | Execution time in microseconds |
| `ovr` | boolean | True if task overran its period |

### 4. Cycle Summary (`cycle`)

Emitted at the end of each VM cycle in **summary** mode.

```json
{"t":"cycle","n":100,"us":850,"tasks":3}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | Always `"cycle"` |
| `n` | number | Cycle number (0-2^31) |
| `us` | number | Total cycle time in microseconds |
| `tasks` | number | Number of tasks executed this cycle |

### 5. Error Report (`error`)

Emitted when a VM error occurs.

```json
{"t":"error","code":3,"msg":"DIV_BY_ZERO","pc":42}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | Always `"error"` |
| `code` | number | Error code (see Error Codes table) |
| `msg` | string | Human-readable error message |
| `pc` | number? | Program counter where error occurred |

#### Error Codes

| Code | Name | Description |
|------|------|-------------|
| 0 | `OK` | No error |
| 1 | `STACK_OVERFLOW` | Stack exceeded max depth |
| 2 | `STACK_UNDERFLOW` | Pop from empty stack |
| 3 | `DIV_BY_ZERO` | Division by zero |
| 4 | `INVALID_OPCODE` | Unknown opcode |
| 5 | `INVALID_ADDRESS` | Memory access out of bounds |
| 6 | `INVALID_FB` | Unknown function block type |
| 7 | `TASK_OVERRUN` | Task exceeded deadline |
| 8 | `WATCHDOG` | Watchdog timeout |

### 6. Command Acknowledgment (`ack`)

Emitted in response to a host command.

```json
{"t":"ack","cmd":"mode","val":"verbose","ok":true}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | Always `"ack"` |
| `cmd` | string | Command that was executed |
| `val` | string | Value that was set |
| `ok` | boolean | True if command succeeded |
| `err` | string? | Error message if `ok` is false |

### 7. Variable Watch (`watch`)

Emitted when a watched variable changes (or periodically if configured).

```json
{"t":"watch","addr":8192,"type":"i32","val":42}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | Always `"watch"` |
| `addr` | number | Variable address (0-65535) |
| `type` | string | Type: `"i8"`, `"i16"`, `"i32"`, `"u8"`, `"u16"`, `"u32"`, `"f32"`, `"bool"` |
| `val` | number\|boolean | Current value |

### 8. Ready Signal (`ready`)

Emitted when the device completes boot and is ready for commands.

```json
{"t":"ready","fw":"1.4.0","caps":["sched","hil","sfc"]}
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | string | Always `"ready"` |
| `fw` | string | Firmware version (semver) |
| `caps` | string[] | Enabled capabilities |

#### Capabilities

| Capability | Description |
|------------|-------------|
| `sched` | Multi-task scheduler enabled |
| `hil` | HIL debug output enabled |
| `sfc` | SFC (Sequential Function Chart) enabled |
| `ld` | Ladder Diagram enabled |
| `fbd` | Function Block Diagram enabled |

---

## Host → Device Commands

Commands are plain text, not JSON. Format: `DBG:<COMMAND>:<ARGS>`

### 1. Set Debug Mode

```
DBG:MODE:OFF
DBG:MODE:SUMMARY
DBG:MODE:VERBOSE
```

| Mode | Description |
|------|-------------|
| `OFF` | No debug output (production mode) |
| `SUMMARY` | Per-cycle summaries only |
| `VERBOSE` | Per-opcode trace (high bandwidth) |

**Response**: `{"t":"ack","cmd":"mode","val":"verbose","ok":true}`

### 2. Watch Variable

```
DBG:WATCH:ADD:<addr>:<type>
DBG:WATCH:DEL:<addr>
DBG:WATCH:CLR
```

| Command | Description |
|---------|-------------|
| `ADD` | Add variable to watch list |
| `DEL` | Remove variable from watch list |
| `CLR` | Clear all watches |

**Examples**:
```
DBG:WATCH:ADD:8192:i32
DBG:WATCH:DEL:8192
DBG:WATCH:CLR
```

**Response**: `{"t":"ack","cmd":"watch","val":"add:8192:i32","ok":true}`

### 3. Set Breakpoint

```
DBG:BREAK:SET:<pc>
DBG:BREAK:DEL:<pc>
DBG:BREAK:CLR
```

When a breakpoint is hit, the VM pauses and emits:
```json
{"t":"break","pc":42}
```

### 4. Execution Control

```
DBG:STEP
DBG:RESUME
DBG:HALT
DBG:RESET
```

| Command | Description |
|---------|-------------|
| `STEP` | Execute one opcode, then pause |
| `RESUME` | Continue execution from breakpoint |
| `HALT` | Pause execution immediately |
| `RESET` | Reset VM state (clear variables, restart program) |

### 5. Query State

```
DBG:QUERY:STATUS
DBG:QUERY:REGS
DBG:QUERY:MEM:<start>:<len>
```

**Status Response**:
```json
{"t":"status","state":"running","pc":42,"sp":3,"cycle":1000}
```

**Registers Response**:
```json
{"t":"regs","pc":42,"sp":3,"fp":0,"acc":7}
```

**Memory Response**:
```json
{"t":"mem","addr":8192,"len":16,"hex":"0102030405060708090A0B0C0D0E0F10"}
```

---

## Protocol Timing

| Event | Max Latency |
|-------|-------------|
| Command → Ack | 50ms |
| Opcode → Trace (verbose mode) | 10ms |
| Task complete → Task message | 5ms |
| Device boot → Ready message | 2000ms |

---

## Bandwidth Considerations

At 115200 baud, theoretical max is ~11.5 KB/s.

| Mode | Typical Bandwidth | Notes |
|------|-------------------|-------|
| OFF | 0 | No debug output |
| SUMMARY | 100-500 B/s | 1-5 messages per second |
| VERBOSE | 5-10 KB/s | Near line rate during execution |

**Important**: In VERBOSE mode, the device may drop messages if the serial buffer overflows. The test runner should detect gaps via non-sequential `pc` values.

---

## Implementation Notes

### Device Side (C)

```c
// Static buffer for JSON output (no malloc)
static char hil_buf[256];

void hil_trace_opcode(uint8_t op, uint16_t pc, uint8_t sp, int32_t tos) {
    if (hil_mode != HIL_MODE_VERBOSE) return;
    
    snprintf(hil_buf, sizeof(hil_buf),
        "{\"t\":\"opcode\",\"op\":\"%s\",\"pc\":%u,\"sp\":%u,\"tos\":%d}\r\n",
        opcode_names[op], pc, sp, tos);
    
    shell_print(shell_ptr, "%s", hil_buf);
}
```

### Host Side (TypeScript)

```typescript
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

function createDebugConnection(port: string): DebugConnection {
    const serial = new SerialPort({ path: port, baudRate: 115200 });
    const parser = serial.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    return {
        send: (cmd: string) => {
            serial.write(cmd + '\r\n');
        },
        onFrame: (handler: (frame: DebugFrame) => void) => {
            parser.on('data', (line: string) => {
                try {
                    const frame = JSON.parse(line) as DebugFrame;
                    handler(frame);
                } catch (e) {
                    // Not JSON, ignore (shell prompt, etc.)
                }
            });
        }
    };
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-22 | Initial specification |
