# Research: Native Runtime Simulation Parity

**Feature**: 009-native-runtime-sim  
**Date**: 2026-03-19  
**Status**: Complete — all planning unknowns resolved

---

## 1. Native Simulation Starting Point

### Decision

Use a desktop-native simulator process built from the existing C core plus POSIX HAL as the first implementation target. Do **not** make Zephyr `native_sim` the first delivery.

### Rationale

- The repository already presents ZPLC as one execution core across runtimes, and the POSIX HAL already supplies host timing, logging, and persistence primitives.
- `firmware/apps/posix_host/src/main.c` is only a phase-0 ticker today, which means the shortest honest path is to grow that host runtime into a real simulator session instead of forcing Zephyr host-board complexity immediately.
- Zephyr `native_sim` is viable for future fidelity work, but it adds extra build, orchestration, and debugger integration overhead before the IDE even gets a stable native session contract.

### Alternatives Considered

- **Keep the renderer-side WASM simulation as the primary path**: rejected because `packages/zplc-ide/src/runtime/wasmAdapter.ts` still owns scan timing, force behavior, and debug continuation semantics in UI-land.
- **Adopt Zephyr `native_sim` first**: rejected for the first increment because it solves the wrong problem first; the product needs a stable runtime session contract before it needs RTOS-host-board fidelity.

---

## 2. Process Architecture for the Desktop App

### Decision

Use a brokered architecture: `renderer -> preload API -> Electron main -> simulator supervisor -> native simulator process`.

### Rationale

- Electron guidance favors request/response APIs exposed through `contextBridge` and `ipcRenderer.invoke`, with system-level work handled by `ipcMain.handle` in the main process.
- The renderer is the wrong place to own simulator lifecycle, restart policy, logging, or crash recovery.
- `packages/zplc-ide/electron/main.ts` and `packages/zplc-ide/electron/preload.ts` already exist and are the correct boundary for safe native integration.

### Alternatives Considered

- **Spawn and manage the native simulator directly from the renderer**: rejected for security, lifecycle, and stability reasons.
- **Let the preload script supervise the child process directly**: rejected because process ownership belongs in Electron main, not in an isolated bridge layer.

---

## 3. Transport Between Electron Main and Native Simulator

### Decision

Use framed stdio as the first native simulator transport, with versioned request/response/event messages.

### Rationale

- For a single IDE-managed simulator instance, stdio is simpler than sockets: no port negotiation, no stale socket cleanup, and child lifetime stays tied to the IDE session.
- Stdio is enough for parity-oriented control flows such as load, status, breakpoint management, watch reads, and structured event streaming.
- It avoids the shell-text parsing debt currently carried by the WebSerial hardware path.

### Alternatives Considered

- **Local socket / named pipe first**: rejected as unnecessary initial complexity; keep it as a second step if multi-client attach or reconnect becomes necessary.
- **Reuse Electron IPC as the simulator transport**: rejected because Electron IPC is for renderer-to-main communication, not for a native child binary.

---

## 4. Session Contract Shape

### Decision

Define one machine-readable native session contract with explicit handshake, capability negotiation, runtime status snapshots, and event streams. Make it task-aware from day one.

### Rationale

- The current IDE contract in `packages/zplc-ide/src/runtime/debugAdapter.ts` already abstracts runtime control, but the firmware side exposes inconsistent shapes across `zplc status --json`, `zplc dbg info --json`, breakpoint acknowledgments, and force tables.
- A native session contract is the chance to standardize what the IDE consumes: version, runtime state, tasks, focused VM snapshot, capabilities, breakpoints, force entries, and errors.
- Task awareness matters because scheduler-backed hardware behavior cannot be represented honestly forever with a single `pc/sp` snapshot.

### Alternatives Considered

- **Mirror Zephyr shell commands exactly**: rejected because the shell contract is human-oriented, partially inconsistent, and shaped by serial transport constraints.
- **Keep a single-VM-only contract**: rejected because it would hard-code a new parity gap into the native backend.

---

## 5. Ownership of Debug and Force Semantics

### Decision

Make breakpoint, pause/resume/step, watch reads, and force tables runtime-owned in the native simulator, matching hardware semantics instead of reproducing WASM adapter behavior.

### Rationale

- Hardware already treats force state and breakpoint state as runtime state.
- `WASMAdapter` currently re-injects forced values and controls scan timing locally, which is exactly the source of semantic drift.
- A runtime-owned model lets the IDE become a client of live state instead of a synthetic runtime coordinator.

### Alternatives Considered

- **Keep JS-managed force and timing semantics for the native adapter**: rejected because it preserves the root architectural problem under a different transport.

---

## 6. Capability Reporting and Compatibility Boundary

### Decision

Expose a capability profile for every native session with feature states `supported`, `degraded`, or `unavailable`, and use it as the only source of truth for simulation compatibility.

### Rationale

- The spec requires explicit release boundaries for hardware-dependent behavior.
- `packages/zplc-ide/src/runtime/debugCapabilities.ts` currently only distinguishes legacy vs scheduler mode and assumes pause/resume/step/breakpoints are always available. That is too crude for honest parity claims.
- Capability-driven UI prevents false success when host HAL behavior, communication stacks, or scheduler fidelity lag behind hardware.

### Alternatives Considered

- **Hardcode compatibility assumptions in the renderer**: rejected because it creates another hidden divergence layer.
- **Claim broad parity and document exceptions later**: rejected because that is how simulators turn into lies.

## 8. Release-Ready Compatibility Matrix

| Capability | Native POSIX | Hardware | Legacy WASM | Evidence / Note |
|-----------|--------------|----------|-------------|-----------------|
| Load / start / stop / reset | supported | supported | degraded | Native/serial flows validated; WASM remains browser-owned fallback |
| Pause / resume / step | supported | supported | degraded | Native runtime owns semantics; WASM still renderer-managed |
| Breakpoints | supported | supported | degraded | Native host + adapter tests pass; WASM not parity-authoritative |
| Watch / read / write / force | supported | supported | degraded | Native host protocol now implements memory/force commands |
| Retentive memory | supported | supported | degraded | POSIX HAL persistence tests pass; browser fallback not parity-proof |
| Task inspection | degraded | supported | unavailable | POSIX host exposes focused VM only today |
| Modbus / MQTT | unavailable | supported/degraded by board | unavailable | Requires hardware validation before any simulation claim |

## 9. Evidence Template

Use one record per reference project:

```json
{
  "evidence_id": "evidence-001",
  "reference_project_id": "motor-sequence",
  "capability_scope": ["logic", "breakpoints", "retain"],
  "native_result": "degraded",
  "hardware_result": "pass",
  "mismatches": [
    {
      "feature": "tasks",
      "native_observation": "single focused task snapshot only",
      "hardware_observation": "full scheduler task table available",
      "severity": "degrading",
      "resolution": "downgrade-claim"
    }
  ],
  "owner": "qa-industrial",
  "recorded_at": "2026-03-20T10:00:00Z"
}
```

---

## 7. Validation Matrix

### Decision

Validate the feature across five layers: core/host tests, native runtime integration, IDE adapter tests, Zephyr cross-build reference, and physical-board HIL parity evidence.

### Rationale

- The constitution requires test-first evidence, cross-builds, and HIL gating for runtime behavior changes.
- Parity claims are only credible if the same reference projects are exercised in local simulation and real hardware, with mismatches surfaced as blockers or downgraded capabilities.

### Alternatives Considered

- **Host-only validation**: rejected because it cannot justify hardware parity claims.
- **Hardware-only validation without native contract tests**: rejected because it would leave the desktop integration path under-specified and fragile.
