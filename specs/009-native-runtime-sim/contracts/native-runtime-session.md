# Contract: Native Runtime Session

**Feature**: 009-native-runtime-sim  
**Version**: 1.0-draft  
**Date**: 2026-03-19

## Overview

This contract defines the machine-readable session interface between the Electron main-process simulator supervisor and the native ZPLC simulator process. The renderer never talks to the simulator binary directly; it uses preload-exposed APIs that forward requests to Electron main.

The contract exists to give local simulation the same conceptual control surface as hardware sessions while allowing explicit capability negotiation and structured error reporting.

## Transport

- **Primary transport**: framed stdio
- **Message style**: request / response / event
- **Encoding**: UTF-8 JSON
- **Versioning**: every session begins with explicit handshake and protocol version exchange

## Message Envelope

Every message uses the same outer shape.

```json
{
  "id": "req-42",
  "type": "request",
  "method": "status.get",
  "params": {}
}
```

### Fields

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | request/response only | Correlates responses to requests |
| `type` | string | yes | `request`, `response`, or `event` |
| `method` | string | request/event | Operation or event name |
| `params` | object | request/event | Method-specific payload |
| `result` | object | response success | Successful response payload |
| `error` | object | response failure | Structured error payload |

## Handshake

### Request: `session.hello`

```json
{
  "id": "req-1",
  "type": "request",
  "method": "session.hello",
  "params": {
    "client_name": "zplc-ide",
    "client_version": "1.5.0",
    "protocol_version": "1.0"
  }
}
```

### Response

```json
{
  "id": "req-1",
  "type": "response",
  "result": {
    "protocol_version": "1.0",
    "runtime_kind": "native-posix",
    "runtime_version": "1.5.0",
    "capability_profile": {
      "profile_id": "cap-001",
      "features": [
        { "name": "breakpoints", "status": "supported" },
        { "name": "tasks", "status": "degraded", "reason": "POSIX scheduler parity not complete" }
      ]
    }
  }
}
```

### Rules

- Session establishment is incomplete until `session.hello` succeeds.
- If protocol versions are incompatible, the simulator MUST return a structured error and refuse the session.
- The capability profile returned here becomes the source of truth for IDE control availability.

## Core Commands

### Program Lifecycle

| Method | Purpose |
|--------|---------|
| `program.load` | Load a compiled `.zplc` artifact into the simulator |
| `execution.start` | Start or continue execution |
| `execution.stop` | Stop execution and keep session alive |
| `execution.pause` | Pause at the next valid runtime boundary |
| `execution.resume` | Resume a paused session |
| `execution.step` | Execute one debug step according to runtime semantics |
| `execution.reset` | Reset runtime state while preserving defined retentive behavior |
| `session.shutdown` | Gracefully terminate the simulator process |

### Inspection and Debugging

| Method | Purpose |
|--------|---------|
| `status.get` | Return a consolidated runtime snapshot |
| `task.list` | Return task snapshots when task model is supported |
| `memory.read` | Read bytes from runtime memory |
| `memory.write` | Write bytes without enabling force semantics |
| `force.set` | Create or update a runtime-owned force entry |
| `force.clear` | Remove one force entry |
| `force.clear_all` | Remove all active force entries |
| `force.list` | Return current force entries |
| `breakpoint.add` | Add a breakpoint |
| `breakpoint.remove` | Remove a breakpoint |
| `breakpoint.clear` | Clear all breakpoints |
| `breakpoint.list` | Return all active breakpoints |
| `watch.read` | Read typed watch values in one request |

## Status Response Contract

`status.get` MUST return one normalized snapshot shape regardless of runtime mode.

```json
{
  "state": "paused",
  "uptime_ms": 15234,
  "stats": {
    "cycles": 102,
    "active_tasks": 2,
    "overruns": 0,
    "program_size": 4096
  },
  "focused_vm": {
    "pc": 88,
    "sp": 3,
    "halted": true,
    "error": 0
  },
  "tasks": [],
  "opi": [0, 1, 0, 0],
  "force_entries": []
}
```

### Rules

- `state` is always required.
- `stats` is always required.
- `tasks` may be empty only if the capability profile marks `tasks` as `unavailable` or `degraded`.
- `opi` must be present whenever output inspection is supported.
- Missing fields are not allowed as implicit feature signaling; capability profile is the signaling mechanism.

## Events

The simulator may emit unsolicited events.

| Event | Purpose |
|------|---------|
| `session.ready` | Simulator finished bootstrapping and can accept commands |
| `status.changed` | Runtime state changed materially |
| `breakpoint.hit` | Execution stopped at a breakpoint |
| `step.completed` | A step request completed |
| `watch.changed` | Watched values changed |
| `capability.updated` | Capability profile changed during session |
| `runtime.error` | Non-fatal runtime error or warning |
| `session.exited` | Simulator process is exiting or died unexpectedly |
| `session.ready` | Simulator boot completed and preload/main can treat the child as ready |

## Errors

All failed responses use a structured error object.

```json
{
  "code": "CAPABILITY_UNAVAILABLE",
  "message": "Task inspection is not available in the current native runtime mode",
  "details": {
    "feature": "tasks",
    "recommended_action": "Use hardware session for authoritative task-level debugging"
  }
}
```

### Required Error Codes

- `PROTOCOL_MISMATCH`
- `INVALID_REQUEST`
- `INVALID_STATE`
- `PROGRAM_LOAD_FAILED`
- `RUNTIME_FAILURE`
- `CAPABILITY_UNAVAILABLE`
- `TIMEOUT`
- `SESSION_TERMINATED`

## Capability Profile Contract

Every capability entry uses this shape:

```json
{
  "name": "modbus",
  "status": "degraded",
  "reason": "Host network behavior does not yet match hardware timing guarantees",
  "recommended_action": "Validate final communication behavior on physical hardware"
}
```

Rules:

- `status` is one of `supported`, `degraded`, or `unavailable`.
- `reason` and `recommended_action` are mandatory when status is not `supported`.
- The IDE must use this profile to drive control availability and user messaging.
- Legacy renderer-owned WASM simulation is outside the native session contract and must be surfaced as a degraded fallback, not as parity-proof simulation support.
