# Data Model: Native Runtime Simulation Parity

**Feature**: 009-native-runtime-sim  
**Date**: 2026-03-19

---

## 1. Core Entities

### SimulationSession

Represents one local runtime session for a compiled project.

| Field | Type | Description | Validation |
|------|------|-------------|------------|
| `session_id` | string | Stable identifier for the active native runtime session | Must be unique within the IDE process |
| `project_id` | string | IDE project associated with the session | Required |
| `artifact_id` | string | Identifier or digest for the loaded compiled artifact | Required after load |
| `state` | enum | `disconnected`, `connecting`, `idle`, `running`, `paused`, `error`, `stopping` | Must reflect runtime-owned state only |
| `mode` | enum | `native-sim`, `hardware` | Required |
| `selected_task_id` | integer/null | Task currently focused in the debugger | Null allowed when task model is unavailable |
| `capability_profile_id` | string | Capability profile applied to this session | Required after handshake |
| `last_error` | object/null | Last structured session error | Null when healthy |
| `started_at` | timestamp/null | Time the session became active | Null before connect |

**Relationships**:

- One `SimulationSession` owns one `CapabilityProfile`.
- One `SimulationSession` references many `TaskSnapshot` records over time.
- One `SimulationSession` may accumulate many `ParityEvidenceRecord` comparisons across reference projects.

---

### TaskSnapshot

Represents the task-aware runtime state visible to the IDE.

| Field | Type | Description | Validation |
|------|------|-------------|------------|
| `task_id` | integer | Runtime task identifier | Non-negative |
| `name` | string | Human-readable task label | Optional but stable when present |
| `state` | enum | `idle`, `ready`, `running`, `paused`, `error` | Must align with runtime scheduler state |
| `priority` | integer | Relative execution priority | Required when task model is supported |
| `interval_us` | integer | Task interval in microseconds | Must be >= configured minimum |
| `cycles` | integer | Total cycles executed | Monotonic non-negative |
| `overruns` | integer | Total deadline misses | Monotonic non-negative |
| `pc` | integer | Current program counter for this task | Required when task exposes VM state |
| `sp` | integer | Current stack pointer for this task | Required when task exposes VM state |
| `halted` | boolean | Whether the task VM is paused/halted | Required |
| `error_code` | integer | Current runtime error code | `0` means OK |

**State transitions**:

- `idle -> ready -> running`
- `running -> paused -> running`
- `running|paused -> error`
- `running|paused -> ready` on stop/reset

---

### CapabilityProfile

Declares what the active session can honestly support.

| Field | Type | Description | Validation |
|------|------|-------------|------------|
| `profile_id` | string | Unique profile identifier | Required |
| `runtime_kind` | enum | `native-posix`, `zephyr-hardware`, `legacy-wasm` | Required |
| `protocol_version` | string | Session contract version | Required |
| `features` | array of `CapabilityEntry` | User-visible runtime/debug features | Must include every exposed IDE control |
| `reported_at` | timestamp | Time of handshake/update | Required |

#### CapabilityEntry

| Field | Type | Description | Validation |
|------|------|-------------|------------|
| `name` | string | Feature identifier (e.g. `breakpoints`, `watch`, `force`, `tasks`, `retain-memory`, `modbus`, `mqtt`) | Required |
| `status` | enum | `supported`, `degraded`, `unavailable` | Required |
| `reason` | string/null | Human-readable explanation for degraded/unavailable states | Required when not `supported` |
| `recommended_action` | string/null | Suggested next step for the user | Required when not `supported` |

**Validation rule**: No feature visible in the IDE may be omitted from the capability profile.

---

### RuntimeSnapshot

Represents the consolidated status response consumed by the IDE.

| Field | Type | Description | Validation |
|------|------|-------------|------------|
| `state` | enum | Session execution state | Required |
| `uptime_ms` | integer | Runtime uptime in milliseconds | Non-negative |
| `stats` | object | Aggregate counters such as `cycles`, `active_tasks`, `overruns`, `program_size` | Required |
| `focused_vm` | object/null | Current focused VM view (`pc`, `sp`, `halted`, `error`) | Null allowed if only task view exists |
| `tasks` | array of `TaskSnapshot` | Task list for scheduler-aware sessions | Empty allowed only when unsupported |
| `opi` | byte array | Observable output/process-image bytes surfaced to IDE | Required when output inspection is supported |
| `force_entries` | array of `ForceEntry` | Runtime-owned forced values | Required when force is supported |

---

### ForceEntry

Represents one active runtime-owned force.

| Field | Type | Description | Validation |
|------|------|-------------|------------|
| `address` | integer | Starting memory address | Non-negative |
| `size` | integer | Number of bytes forced | Must be > 0 |
| `bytes_hex` | string | Forced value bytes in hexadecimal | Length must match `size` |
| `state` | enum | `pending`, `forced`, `clearing` | Required |
| `source` | enum | `user`, `session-restore`, `test` | Required |

---

### ParityEvidenceRecord

Captures whether local simulation matches hardware for a reference project and feature set.

| Field | Type | Description | Validation |
|------|------|-------------|------------|
| `evidence_id` | string | Unique record identifier | Required |
| `reference_project_id` | string | Project used for comparison | Required |
| `capability_scope` | array of strings | Features covered by this evidence | At least one feature |
| `native_result` | enum | `pass`, `fail`, `degraded` | Required |
| `hardware_result` | enum | `pass`, `fail` | Required |
| `mismatches` | array of `ParityMismatch` | Detailed differences | Empty only when results align |
| `owner` | string | Human or automated owner of the record | Required |
| `recorded_at` | timestamp | Evidence timestamp | Required |

#### ParityMismatch

| Field | Type | Description |
|------|------|-------------|
| `feature` | string | Capability where mismatch appeared |
| `native_observation` | string | What local simulation did |
| `hardware_observation` | string | What hardware did |
| `severity` | enum | `blocking`, `degrading`, `informational` |
| `resolution` | enum | `fix`, `downgrade-claim`, `accepted-difference` |

---

### ReferenceProject

Defines the curated projects used to validate parity.

| Field | Type | Description | Validation |
|------|------|-------------|------------|
| `reference_project_id` | string | Unique identifier | Required |
| `name` | string | Project name | Required |
| `coverage` | array of strings | Covered behaviors such as `logic`, `breakpoints`, `retain`, `tasks`, `modbus`, `mqtt` | Must not be empty |
| `requires_hardware` | boolean | Whether authoritative validation still requires a board | Required |
| `expected_capabilities` | array of strings | Capabilities that must pass or be explicitly degraded | Must align with capability profile taxonomy |

## 2. Session State Machine

```text
disconnected
  -> connecting
  -> idle
  -> running
  -> paused
  -> running
  -> stopping
  -> disconnected

Any active state -> error
error -> disconnected | idle (after explicit recovery)
```

Rules:

- Only the runtime process may authoritatively move a session into `running`, `paused`, or `error`.
- The renderer may request transitions, but it may not infer success without a runtime response.
- Capability changes during a session must trigger a fresh `CapabilityProfile` update.

## 3. Compatibility Boundary Notes

- `runtime_kind = legacy-wasm` is an explicit degraded fallback classification, not a parity-equivalent execution mode.
- Task-aware parity remains degraded in `native-posix` until task snapshots move beyond the focused VM placeholder.
- Communication capabilities (`modbus`, `mqtt`) remain unavailable in local simulation until dedicated parity evidence exists.
