# Feature Specification: Communication Function Blocks — VM Spec

**Feature Branch**: `003-comm-fb-vm`
**Created**: 2026-03-10
**Status**: Draft

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Modbus Device Read in Any Language (Priority: P1)

A controls engineer writes a PLC program to periodically read temperature from a Modbus
TCP register bank at a remote device. They want to use their preferred IEC 61131-3 language
— Structured Text, Function Block Diagram, Ladder Diagram, or Instruction List — and get
consistent, deterministic behavior each scan cycle.

**Why this priority**: Modbus is the most common industrial protocol on the shop floor.
Enabling it as a real VM-executable function block unblocks all downstream cloud and
connectivity work and proves the ISA/dispatch model.

**Independent Test**: Instantiate `MB_READ_HREG` in ST targeting a test Modbus TCP server.
Verify that `DONE` pulses true for exactly one scan after a successful read, `VALUE`
reflects the server register, and `BUSY` transitions correctly over multiple cycles.

**Acceptance Scenarios**:

1. **Given** a Modbus TCP server is reachable and a `MB_READ_HREG` FB is instantiated with
   valid connection parameters, **When** `EN` transitions from FALSE to TRUE, **Then**
   `BUSY` becomes TRUE within one scan and the FB does not block the scan loop.
2. **Given** the Modbus request completes, **When** the runtime service resolves it,
   **Then** `DONE` is TRUE for exactly one scan, `ERROR` remains FALSE, and `VALUE` holds
   the register content.
3. **Given** the target host is unreachable, **When** the request times out, **Then**
   `DONE` is FALSE, `ERROR` is TRUE for one scan, and `STATUS` holds the error code.
4. **Given** a LD or FBD visual program uses a `MB_READ_HREG` visual block with ports
   wired, **When** compiled and loaded, **Then** it exhibits the same runtime behavior as
   the ST version above.

---

### User Story 2 — MQTT Publish from PLC Logic (Priority: P2)

A controls engineer publishes a process variable (e.g., tank level) to an MQTT broker
each time a new value is read. They want a function block that manages the connection
lifecycle and publish handshake without blocking the cyclic scan.

**Why this priority**: MQTT is the gateway to cloud connectivity (Sparkplug B, AWS, Azure).
A working generic `MQTT_PUBLISH` block proves the communication service dispatch model
scales beyond serial protocols to network-based async operations.

**Independent Test**: Call `MQTT_CONNECT` then `MQTT_PUBLISH` in a ST task connected to a
local broker. Verify message delivery via broker inspection. Verify that neither FB ever
blocks a full scan cycle, and that `ERROR` reports correctly when the broker is offline.

**Acceptance Scenarios**:

1. **Given** `MQTT_CONNECT` is called with a valid broker profile, **When** the broker
   accepts the connection, **Then** `CONNECTED` becomes TRUE and `DONE` pulses once.
2. **Given** a connection is established and `MQTT_PUBLISH` is called with a topic and
   payload, **When** the broker acknowledges (QoS 0 immediately, QoS 1 on PUBACK),
   **Then** `DONE` pulses TRUE for one scan.
3. **Given** the broker drops the connection mid-cycle, **When** the next `MQTT_PUBLISH`
   call occurs, **Then** `ERROR` is TRUE, `STATUS` carries a reconnection error code, and
   the scan cycle continues without hanging.

---

### User Story 3 — Cloud Wrapper Blocks (Sparkplug B / Azure / AWS) (Priority: P3)

A system integrator needs device telemetry to flow to Azure IoT Hub and AWS IoT Core using
standardized on-ramp patterns (DPS provisioning, Fleet Provisioning, Sparkplug B birth
certificates). They want PLC-level function blocks that handle these workflows without
exposing low-level MQTT details to the user program.

**Why this priority**: Depends on generic MQTT working first. These are higher-level wrappers
that provide industrial IIoT interoperability but can be deferred until the foundation is solid.

**Independent Test**: Call `AZURE_DPS_PROVISION` with valid credentials. Verify the device
appears as registered in Azure IoT Hub portal. Verify `DONE` pulses once on success and
`ERROR` is set with a meaningful status code on auth failure.

**Acceptance Scenarios**:

1. **Given** valid DPS credentials are configured in device settings, **When**
   `AZURE_DPS_PROVISION` is called with `EN := TRUE`, **Then** device registration completes
   asynchronously without blocking the PLC scan, and `DONE` pulses when provisioning
   succeeds.
2. **Given** a Sparkplug B session is active via `SPB_REBIRTH`, **When** a metric update
   is published, **Then** the payload is correctly Protobuf-encoded and received by a
   Sparkplug-compatible broker.
3. **Given** AWS Fleet Provisioning is configured, **When** `AWS_FLEET_PROVISION` is called,
   **Then** the device receives a permanent certificate and endpoint from AWS IoT Core.

---

### Edge Cases

- **Retrigger while BUSY**: What happens when `EN` goes HIGH again before `DONE`/`ERROR`
  clears? FB must silently ignore the retrigger (unless a specific FB supports cancel).
- **FB instance reuse across tasks**: If two tasks share the same FB instance address, the
  results are undefined. This is a programming error and the spec must state it clearly.
- **STRING overflow in TOPIC/PAYLOAD**: MQTT topic and payload inputs exceed the IEC
  STRING size limit. The FB must clamp and set a specific STATUS code.
- **Serial port unavailable for Modbus RTU**: No available port at program load time — FB
  must report `ERROR` on first call, not crash the runtime.
- **Network stack not initialized**: Communication FBs called before the networking HAL is
  ready must return `ERROR` with a well-defined `STATUS` code, not hang.
- **Simultaneous FB instances**: Multiple FB instances of the same kind must be independently
  operable; no shared mutable static state between instances.

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The runtime MUST support a communication opcode family (`OP_COMM_EXEC`,
  `OP_COMM_STATUS`, `OP_COMM_RESET`) in the VM ISA that dispatches to runtime communication
  services without blocking the scan cycle.
- **FR-002**: Every communication function block call MUST complete its contribution to the
  current scan in bounded time; no blocking waits on network or serial I/O are permitted
  inside the VM execution path.
- **FR-003**: Each FB instance MUST represent an independent state machine with its own
  `EN`, `BUSY`, `DONE`, `ERROR`, and `STATUS` outputs managed per-instance in work memory.
- **FR-004**: The runtime MUST provide a stable C API (`zplc_comm_fb_exec`, `zplc_comm_fb_reset`)
  as a dispatch layer between VM opcodes and protocol-specific runtime modules.
- **FR-005**: The ST compiler MUST recognize and generate correct communication opcodes for
  all Phase 1 Modbus FBs (`MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL`).
- **FR-006**: The ST compiler MUST recognize and generate correct communication opcodes for
  all Phase 2 MQTT FBs (`MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`).
- **FR-007**: The visual IDE (FBD and LD editors) MUST represent Phase 1 and Phase 2 FBs as
  real executable blocks with correctly named ports, not as placeholder assignments.
- **FR-008**: IL programs MUST be able to invoke communication FBs via `CAL`/`CALC`
  instructions with the same contracts as ST.
- **FR-009**: SFC action bodies MUST be able to use communication FBs naturally, since SFC
  transpiles to ST before compilation.
- **FR-010**: A rising edge on `EN` MUST start a new operation only when the FB is idle
  (neither BUSY nor awaiting status reset). Retriggers while BUSY are silently ignored.
- **FR-011**: On successful completion, `DONE` MUST be TRUE for exactly one scan cycle, then
  automatically clear. `ERROR` MUST behave identically on failure.
- **FR-012**: All communication FB memory layout MUST use only static allocation (zero
  `malloc`/`free`); instance size MUST be a fixed, compile-time constant per FB kind.
- **FR-013**: New opcodes MUST be defined in `zplc_isa.h` before any implementation and
  assigned to a reserved communication opcode range.
- **FR-014**: The existing runtime communication modules (`zplc_modbus.c`, `zplc_mqtt.c`,
  etc.) MUST be reused as the transport layer; the communication dispatch API bridges to
  them without duplicating protocol logic.
- **FR-015**: Phase 3 cloud-wrapper FBs (`AZURE_C2D_RECV`, `AZURE_DPS_PROVISION`,
  `AWS_FLEET_PROVISION`, `SPB_REBIRTH`, `AZURE_EVENTGRID_PUBLISH`) MUST be implemented
  only after generic MQTT FBs are fully operational.
- **FR-016**: Existing compile-time server-binding helpers (`MODBUS_COIL(...)`, `{modbus:N}`)
  MUST NOT be removed; cloud-wrapper blocks are additive, not replacements.

### Key Entities

- **Communication Function Block (Comm FB)**: An IEC 61131-3 function block instance
  with a fixed memory layout in VM work memory representing an async communication
  operation. Attributes: kind ID, EN/BUSY/DONE/ERROR/STATUS handshake bits,
  protocol-specific input parameters, protocol-specific output data.
- **FB Kind ID (`zplc_comm_fb_kind_t`)**: An enum value uniquely identifying a Comm FB
  type (e.g., MB_READ_HREG = 1, MQTT_PUBLISH = 11). Used by `OP_COMM_EXEC` as an operand.
- **Runtime Communication Service**: An existing runtime module (e.g., `zplc_modbus.c`)
  that owns protocol transport. Receives requests from the dispatch API and writes results
  back to FB instance memory.
- **Communication Dispatch API**: The stable C interface (`zplc_comm_fb_exec`,
  `zplc_comm_fb_reset`) bridging VM opcodes to runtime services.
- **Scan Handshake Contract**: The per-scan state machine rule: rising EN → BUSY; on
  completion → DONE=1 for one scan (or ERROR=1 for one scan) → idle.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A PLC engineer can read from a Modbus TCP device using any of the five IEC
  61131-3 languages (ST, IL, LD, FBD, SFC) without behavior differences across languages.
- **SC-002**: Introducing a `MB_READ_HREG` or `MQTT_PUBLISH` block into an existing cyclic
  task does not increase the maximum scan cycle time beyond the configured task interval.
- **SC-003**: All Phase 1 Modbus FBs and Phase 2 MQTT FBs pass the full CI test suite
  (unit tests on POSIX, cross-compilation for 5 target boards) before being considered done.
- **SC-004**: A communication FB that encounters a network error returns a non-zero `STATUS`
  code within one scan cycle — no scan hangs or timeouts occur in the CI test environment.
- **SC-005**: Visual LD/FBD programs using Phase 1 or Phase 2 communication blocks produce
  compiled `.zplc` binaries that load and execute on at least one physical board (HIL gate).
- **SC-006**: The `BUSY/DONE/ERROR` handshake is deterministic: observable state transitions
  occur within a bounded number of scan cycles (no polling uncertainty at the user-program
  level).
- **SC-007**: Engineers migrating from tag-based compile-time Modbus bindings to runtime
  Comm FBs can do so without modifying or removing existing tag-based programs — both
  approaches coexist.

### Assumptions

- The communication dispatch layer will bridge to existing runtime modules; this spec does
  not redesign `zplc_modbus.c`, `zplc_mqtt.c`, or cloud modules.
- STRING-typed inputs (HOST, TOPIC, PAYLOAD) use the IEC 61131-3 compliant STRING type
  already implemented in the ZPLC VM with bounds-checked operations.
- The five target boards listed in `TECHNICAL_SPEC.md` (Arduino GIGA R1, ESP32-S3 DevKit-C,
  STM32 Nucleo-H743ZI, Raspberry Pi Pico, QEMU mps2/an385) are the CI cross-compilation
  targets for this feature.
- Phase 3 cloud wrappers are a separate deliverable and are not required for Phase 1 or
  Phase 2 acceptance.
