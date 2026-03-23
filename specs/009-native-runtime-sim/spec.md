# Feature Specification: Native Runtime Simulation Parity

**Feature Branch**: `009-native-runtime-sim`  
**Created**: 2026-03-19  
**Status**: Draft  
**Input**: User description: "Replace the limited IDE simulator with a full local runtime built from the same execution core used on hardware, and define a plan to match hardware features while preserving IDE compatibility."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run Local Simulation With Hardware-Like Behavior (Priority: P1)

A controls engineer wants to run a project locally in the IDE and trust that the observed execution behavior matches what the same project will do on a real controller for the supported feature set.

**Why this priority**: If local simulation does not reflect controller behavior, engineers cannot trust validation results, and simulation loses its main value.

**Independent Test**: Load a representative project into local simulation and hardware, perform the same execution actions, and confirm that both environments expose matching runtime state, task progression, and observable outputs for the declared supported scope.

**Acceptance Scenarios**:

1. **Given** a project that runs successfully on a supported controller, **When** the engineer runs the same compiled artifact in local simulation, **Then** the execution state, outputs, and reported runtime status SHALL match the controller behavior for all declared supported capabilities.
2. **Given** a project is stopped, started, reset, and rerun in both environments, **When** the engineer compares the observed lifecycle states, **Then** initialization, stop, and restart behavior SHALL be consistent across local simulation and hardware.

---

### User Story 2 - Debug in Simulation Without Learning Different Semantics (Priority: P1)

An engineer wants to use breakpoints, pause, resume, step, watch, and force operations in simulation exactly as they do on hardware so that debugging knowledge transfers directly between both environments.

**Why this priority**: Debugging parity is the core reason to move runtime control out of UI glue and into the runtime itself.

**Independent Test**: In a reference debugging session, perform the same breakpoint and watch workflow against local simulation and hardware, then verify that stop locations, continuation rules, variable values, and forced-state behavior align for the supported feature set.

**Acceptance Scenarios**:

1. **Given** an engineer sets breakpoints and starts execution, **When** execution reaches the same logical stop point in simulation and hardware, **Then** both sessions SHALL pause with matching reported location and runtime state.
2. **Given** a paused session with watched variables and forced values, **When** the engineer steps and resumes execution, **Then** both sessions SHALL present the same watch updates, force persistence, and continuation behavior for the supported scope.
3. **Given** a debug action is unavailable for a capability in local simulation, **When** the engineer invokes that action, **Then** the IDE SHALL report the limitation explicitly instead of returning misleading success.

---

### User Story 3 - Keep IDE Workflows Compatible Across Simulation and Hardware (Priority: P2)

An IDE maintainer wants the IDE to treat local simulation and hardware as compatible runtime targets so that existing compile, load, inspect, and debug workflows continue to work without special-case behavior scattered through the UI.

**Why this priority**: The IDE should act as a client of runtime sessions, not as a second implementation of controller behavior.

**Independent Test**: Run the IDE's standard session workflow against both local simulation and hardware and verify that the same user-facing operations, status transitions, and diagnostics remain available without separate manual procedures.

**Acceptance Scenarios**:

1. **Given** a user compiles a project in the IDE, **When** they choose either local simulation or hardware, **Then** the same core session workflow SHALL be available for loading, starting, stopping, inspecting, and debugging the project.
2. **Given** the runtime reports a capability as degraded or unavailable, **When** the IDE presents session controls, **Then** it SHALL use the runtime-provided capability status to guide the user instead of assuming support.

---

### User Story 4 - Release With a Clear Compatibility Boundary (Priority: P2)

A release engineer wants each feature to be clearly marked as supported, degraded, or unavailable in local simulation so release claims stay honest and engineers know when real hardware is still required.

**Why this priority**: A more powerful simulator only helps if its compatibility boundary is explicit and verifiable.

**Independent Test**: Review the published compatibility matrix and parity evidence for representative projects, then confirm that every IDE-visible runtime capability is either proven locally or clearly marked as requiring hardware.

**Acceptance Scenarios**:

1. **Given** a runtime capability can be exercised locally, **When** parity evidence is reviewed, **Then** the release record SHALL show that the capability behaves consistently in simulation and hardware for the supported scope.
2. **Given** a capability depends on physical hardware behavior that cannot be reproduced locally, **When** a release claim is prepared, **Then** that capability SHALL be marked as hardware-only or degraded with clear user guidance.

### Edge Cases

- What happens when a project uses a capability that exists on hardware but cannot be reproduced locally with sufficient fidelity?
- How does the system behave when local simulation and hardware produce different stop locations, watch values, or retentive-memory outcomes for the same reference project?
- What happens when a session is interrupted during load, pause, resume, or reset and the IDE must recover a trustworthy runtime state?
- How does the IDE present partially supported communication, scheduling, or device-interaction features without implying full parity?
- What happens when a new runtime capability is added for hardware but has not yet been verified for local simulation?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The IDE's local simulation mode MUST execute projects through the same core runtime behavior used for deployed controllers for every capability claimed as simulation-supported.
- **FR-002**: The system MUST allow users to load the same compiled project artifact into local simulation and hardware without requiring simulation-only project changes that alter execution semantics.
- **FR-003**: Users MUST be able to start, stop, pause, resume, step, and reset local simulation through the same user-facing workflow used for hardware sessions.
- **FR-004**: The system MUST expose a shared runtime control contract for local simulation and hardware covering program load, execution control, breakpoint management, state inspection, variable watch, value forcing, force release, and runtime diagnostics.
- **FR-005**: Local simulation MUST report runtime state transitions, execution location, and error conditions in a form the IDE can handle consistently with hardware sessions.
- **FR-006**: Breakpoint, pause, resume, and single-step behavior MUST be owned by the runtime session so that continuation semantics are not reimplemented separately in the IDE.
- **FR-007**: Watch, read, write, and force operations in local simulation MUST reflect live runtime-owned state rather than values inferred only by UI-side logic.
- **FR-008**: The system MUST preserve declared initialization, reset, and retentive-memory behavior consistently between local simulation and hardware for each supported session mode.
- **FR-009**: The system MUST provide a capability profile for each session that identifies which runtime, debugging, and device-interaction features are supported, degraded, or unavailable in local simulation.
- **FR-010**: When a user invokes an unsupported or degraded capability in local simulation, the system MUST provide an explicit explanation and recommended next action instead of silent fallback or false success.
- **FR-011**: The IDE MUST be able to use the capability profile to enable, disable, or annotate session controls and diagnostics without maintaining a separate hidden compatibility model.
- **FR-012**: The system MUST maintain parity evidence for representative projects that cover core logic execution, task behavior, breakpoints, stepping, watch tables, forcing, retentive state, and supported communication workflows.
- **FR-013**: Every runtime capability exposed in IDE hardware workflows MUST be evaluated for local simulation and classified as supported, degraded, or unavailable before it is claimed as compatible.
- **FR-014**: The system MUST detect and surface parity mismatches between local simulation and hardware during validation so they can block or reduce compatibility claims.
- **FR-015**: The system MUST define a clear release boundary for hardware-dependent behavior that cannot be reproduced locally, including when users must switch to physical hardware for authoritative validation.

### Key Entities *(include if feature involves data)*

- **Simulation Session**: A local runtime instance for one compiled project, including lifecycle state, execution state, reported location, diagnostics, and current compatibility profile.
- **Runtime Control Contract**: The shared set of commands, responses, and events that the IDE uses to operate and inspect both local simulation and hardware sessions.
- **Capability Profile**: A declared compatibility record that marks each user-visible runtime or debug feature as supported, degraded, or unavailable in local simulation.
- **Parity Evidence Record**: A verification record that captures the outcome of comparing local simulation and hardware behavior for a representative project and capability set.
- **Reference Project Suite**: A curated set of projects used to prove local simulation compatibility across logic execution, debugging workflows, retentive behavior, multitask behavior, and supported communications.

## Assumptions

- The first release of this feature focuses on behavior that users observe through the IDE runtime and debugger workflows; exact reproduction of every board-specific peripheral condition is not required unless it is explicitly claimed as supported.
- When local reproduction of a hardware-dependent capability is not trustworthy, the correct product behavior is to mark that capability as degraded or unavailable rather than simulate it inaccurately.
- Existing project artifacts, debugging workflows, and hardware session expectations remain the source of truth for IDE compatibility.
- Compatibility claims are made only for features that have parity evidence against representative hardware runs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of capabilities claimed as simulation-supported pass the defined parity suite against hardware for their declared scope before release.
- **SC-002**: 100% of reference projects in the compatibility suite can be loaded and executed in both local simulation and hardware without project-level modifications.
- **SC-003**: Engineers can start a local simulation session for each reference project and reach an interactive ready state within 10 seconds on supported desktop environments.
- **SC-004**: In usability validation, at least 90% of evaluated engineers complete the standard compile-load-debug workflow in local simulation on the first attempt without needing separate simulation-specific instructions.

## Implementation Status Notes

- Native POSIX simulation now owns lifecycle, breakpoint, memory, force, and retentive-host persistence behavior for the supported scope.
- Legacy WASM simulation remains available only as a degraded fallback and is no longer treated as parity-authoritative.
- **SC-005**: 100% of IDE-visible runtime controls either behave consistently between local simulation and hardware or are clearly labeled as degraded or unavailable before users invoke them.
