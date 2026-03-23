# Tasks: Native Runtime Simulation Parity

**Input**: Design documents from `/specs/009-native-runtime-sim/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for this feature because the constitution and plan mandate test-first verification for runtime, IDE adapter, desktop smoke, cross-build, and HIL parity behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Firmware host runtime: `firmware/apps/posix_host/`, `firmware/lib/zplc_core/`
- Electron desktop integration: `packages/zplc-ide/electron/`
- IDE runtime and hooks: `packages/zplc-ide/src/runtime/`, `packages/zplc-ide/src/hooks/`
- Feature docs: `specs/009-native-runtime-sim/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the repository for native-simulation implementation and test execution.

- [ ] T001 Update feature implementation map in `specs/009-native-runtime-sim/plan.md` and `specs/009-native-runtime-sim/quickstart.md` if any file ownership changed during task execution
- [X] T002 [P] Create native simulator test scaffolding in `firmware/lib/zplc_core/tests/test_native_runtime_session.c`
- [X] T003 [P] Create IDE native adapter test scaffolding in `packages/zplc-ide/src/runtime/nativeAdapter.test.ts`
- [X] T004 [P] Create Electron simulator supervisor test scaffolding in `packages/zplc-ide/electron/main.native-sim.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared contract and plumbing that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement native simulator protocol types and message codecs in `packages/zplc-ide/src/runtime/nativeProtocol.ts`
- [X] T006 [P] Extend adapter type definitions and capability state models in `packages/zplc-ide/src/runtime/debugAdapter.ts` and `packages/zplc-ide/src/runtime/debugCapabilities.ts`
- [X] T007 [P] Add protocol contract tests for handshake, status, errors, and capability payloads in `packages/zplc-ide/src/runtime/nativeAdapter.test.ts`
- [X] T008 Add Electron main-process simulator supervision shell with start/stop/request routing in `packages/zplc-ide/electron/main.ts`
- [X] T009 [P] Expose safe native simulation preload APIs in `packages/zplc-ide/electron/preload.ts`
- [X] T010 Add host runtime session entry structure and command dispatcher skeleton in `firmware/apps/posix_host/src/main.c`
- [X] T011 [P] Add host runtime session protocol tests for request parsing and response framing in `firmware/lib/zplc_core/tests/test_native_runtime_session.c`
- [X] T012 Update runtime exports for native simulation support in `packages/zplc-ide/src/runtime/index.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Run Local Simulation With Hardware-Like Behavior (Priority: P1) 🎯 MVP

**Goal**: Deliver a native local simulation session that loads the same artifact as hardware and exposes runtime-owned lifecycle and status behavior.

**Independent Test**: Load a representative project into local simulation and hardware, execute the same start/stop/reset flow, and confirm matching runtime state, task progression, and observable outputs for the supported scope.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T013 [P] [US1] Add host runtime lifecycle tests for load/start/stop/reset/status in `firmware/lib/zplc_core/tests/test_native_runtime_session.c`
- [X] T014 [P] [US1] Add native adapter status normalization tests in `packages/zplc-ide/src/runtime/nativeAdapter.test.ts`
- [X] T015 [P] [US1] Add debug controller local simulation session tests in `packages/zplc-ide/src/hooks/useDebugController.test.ts`

### Implementation for User Story 1

- [X] T016 [US1] Replace the phase-0 ticker with native session lifecycle handling in `firmware/apps/posix_host/src/main.c`
- [X] T017 [P] [US1] Update `firmware/apps/posix_host/CMakeLists.txt` to build the real native simulator entry instead of placeholder comments
- [X] T018 [P] [US1] Implement native runtime status snapshot assembly using core and scheduler APIs in `firmware/apps/posix_host/src/main.c`
- [X] T019 [P] [US1] Fill parity-critical POSIX HAL diagnostics and retentive session support in `firmware/lib/zplc_core/src/hal/posix/zplc_hal_posix.c`
- [X] T020 [US1] Implement the renderer-facing native adapter connect/load/start/stop/reset/status flow in `packages/zplc-ide/src/runtime/nativeAdapter.ts`
- [X] T021 [US1] Integrate native simulation session selection into `packages/zplc-ide/src/hooks/useDebugController.ts`
- [X] T022 [US1] Update `packages/zplc-ide/electron/main.ts` to supervise simulator process lifecycle and framed stdio request routing
- [X] T023 [US1] Update `packages/zplc-ide/electron/preload.ts` to expose local simulation commands and status subscriptions through context isolation

**Checkpoint**: User Story 1 is functional and independently testable as the MVP

---

## Phase 4: User Story 2 - Debug in Simulation Without Learning Different Semantics (Priority: P1)

**Goal**: Make native simulation debugging follow runtime-owned breakpoint, pause/resume/step, watch, and force semantics aligned with hardware workflows.

**Independent Test**: Run the same breakpoint and watch workflow against local simulation and hardware, then verify matching stop locations, continuation rules, watch values, and force persistence for the supported scope.

### Tests for User Story 2 ⚠️

- [X] T024 [P] [US2] Add host runtime debug semantics tests for breakpoints, pause/resume/step, and force tables in `firmware/lib/zplc_core/tests/test_native_runtime_session.c`
- [X] T025 [P] [US2] Add native adapter debug command tests for breakpoint, memory, watch, and force flows in `packages/zplc-ide/src/runtime/nativeAdapter.test.ts`
- [X] T026 [P] [US2] Add capability-aware debug controller tests for degraded/unavailable actions in `packages/zplc-ide/src/hooks/useDebugController.test.ts`

### Implementation for User Story 2

- [X] T027 [US2] Implement runtime-owned breakpoint, pause/resume/step, watch, and force command handling in `firmware/apps/posix_host/src/main.c`
- [X] T028 [P] [US2] Reuse and extend core debug helpers for native session behavior in `firmware/lib/zplc_core/tests/test_vm_core.c` and `firmware/lib/zplc_core/tests/test_native_runtime_session.c`
- [X] T029 [US2] Implement breakpoint, memory, watch, and force APIs in `packages/zplc-ide/src/runtime/nativeAdapter.ts`
- [X] T030 [P] [US2] Extend capability classification logic to cover debug features in `packages/zplc-ide/src/runtime/debugCapabilities.ts` and `packages/zplc-ide/src/runtime/debugCapabilities.test.ts`
- [X] T031 [US2] Update `packages/zplc-ide/src/hooks/useDebugController.ts` to use native runtime-owned debug events instead of renderer-side WASM semantics
- [X] T032 [US2] Reduce renderer-owned force/timing semantics and mark fallback behavior in `packages/zplc-ide/src/runtime/wasmAdapter.ts`

**Checkpoint**: User Story 2 debugging works independently with hardware-like semantics for the supported scope

---

## Phase 5: User Story 3 - Keep IDE Workflows Compatible Across Simulation and Hardware (Priority: P2)

**Goal**: Keep the IDE on one runtime-client workflow surface so compile, load, inspect, and debug work consistently across native simulation and hardware.

**Independent Test**: Run the standard IDE session workflow against native simulation and hardware and confirm that the same user-facing operations, status transitions, and diagnostics remain available without separate procedures.

### Tests for User Story 3 ⚠️

- [X] T033 [P] [US3] Add adapter parity tests comparing native and serial status/capability handling in `packages/zplc-ide/src/runtime/debugAdapter.test.ts`
- [X] T034 [P] [US3] Add debug controller workflow tests for backend switching and shared session controls in `packages/zplc-ide/src/hooks/useDebugController.test.ts`
- [X] T035 [P] [US3] Add Electron IPC/preload integration tests for native session APIs in `packages/zplc-ide/electron/main.native-sim.test.ts`

### Implementation for User Story 3

- [X] T036 [US3] Update `packages/zplc-ide/src/runtime/debugAdapter.ts` to support native session typing and shared task-aware status contracts
- [X] T037 [P] [US3] Refactor `packages/zplc-ide/src/runtime/connectionManager.ts` to separate hardware polling concerns from native local session orchestration
- [X] T038 [US3] Integrate native and hardware workflow selection in `packages/zplc-ide/src/hooks/useDebugController.ts` with capability-driven control availability
- [X] T039 [P] [US3] Normalize renderer-consumed runtime snapshots and task data in `packages/zplc-ide/src/runtime/nativeAdapter.ts` and `packages/zplc-ide/src/runtime/serialAdapter.ts`
- [X] T040 [US3] Update desktop runtime exports and imports for native simulation support in `packages/zplc-ide/src/runtime/index.ts` and dependent call sites under `packages/zplc-ide/src/`

**Checkpoint**: User Story 3 keeps native simulation and hardware on one independently testable IDE workflow surface

---

## Phase 6: User Story 4 - Release With a Clear Compatibility Boundary (Priority: P2)

**Goal**: Define and surface supported, degraded, and unavailable simulation capabilities with parity evidence and honest release guidance.

**Independent Test**: Review the compatibility matrix and parity evidence for representative projects, then confirm that every IDE-visible capability is either proven locally or clearly marked as requiring hardware.

### Tests for User Story 4 ⚠️

- [X] T041 [P] [US4] Add capability profile validation tests in `packages/zplc-ide/src/runtime/debugCapabilities.test.ts`
- [X] T042 [P] [US4] Add parity evidence serialization tests in `packages/zplc-ide/src/runtime/nativeAdapter.test.ts`

### Implementation for User Story 4

- [X] T043 [US4] Implement capability profile negotiation and update handling in `firmware/apps/posix_host/src/main.c`
- [X] T044 [US4] Surface supported/degraded/unavailable capability states in `packages/zplc-ide/src/runtime/nativeAdapter.ts` and `packages/zplc-ide/src/hooks/useDebugController.ts`
- [X] T045 [P] [US4] Document parity evidence workflow and capability boundary rules in `specs/009-native-runtime-sim/quickstart.md` and `specs/009-native-runtime-sim/contracts/native-runtime-session.md`
- [X] T046 [US4] Add a release-ready compatibility matrix and evidence template in `specs/009-native-runtime-sim/research.md` and `specs/009-native-runtime-sim/data-model.md`

**Checkpoint**: User Story 4 independently defines honest compatibility boundaries and evidence reporting

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final parity validation, cleanup, and cross-story hardening.

- [X] T047 [P] Update feature documentation and cross-links in `specs/009-native-runtime-sim/spec.md`, `specs/009-native-runtime-sim/plan.md`, and `AGENTS.md`
- [X] T048 Run host/runtime verification from `specs/009-native-runtime-sim/quickstart.md` and record outcomes in `specs/009-native-runtime-sim/quickstart.md`
- [X] T049 Run IDE runtime and desktop smoke validation from `specs/009-native-runtime-sim/quickstart.md` and record outcomes in `specs/009-native-runtime-sim/quickstart.md`
- [ ] T050 Run Zephyr cross-build and HIL parity validation from `specs/009-native-runtime-sim/quickstart.md` and record evidence in `specs/009-native-runtime-sim/quickstart.md`
- [X] T051 [P] Cleanup deprecated simulation assumptions and comments in `packages/zplc-ide/src/runtime/wasmAdapter.ts`, `packages/zplc-ide/src/runtime/debugAdapter.ts`, and `packages/zplc-ide/src/hooks/useDebugController.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational completion
- **Polish (Phase 7)**: Depends on all targeted user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational - establishes the MVP native session lifecycle
- **User Story 2 (P1)**: Starts after User Story 1 because debug semantics depend on the native runtime session backend
- **User Story 3 (P2)**: Starts after User Stories 1 and 2 because workflow parity depends on the native adapter and debug semantics
- **User Story 4 (P2)**: Starts after User Stories 1, 2, and 3 because capability boundaries depend on implemented session behavior and IDE integration

### Within Each User Story

- Tests MUST be written and fail before implementation
- Runtime/session contract work before Electron/adapter integration
- Adapter integration before hook/controller workflow updates
- Capability/reporting updates after underlying behavior exists

### Parallel Opportunities

- Setup scaffolding tasks marked **[P]** can run in parallel
- Foundational protocol/type/test tasks marked **[P]** can run in parallel after the initial protocol direction is agreed
- In each story, tests marked **[P]** can run in parallel
- Runtime-side and IDE-side tasks touching different files can run in parallel once their shared contracts are stable

---

## Parallel Example: User Story 1

```bash
# Launch User Story 1 failing tests together:
Task: "Add host runtime lifecycle tests in firmware/lib/zplc_core/tests/test_native_runtime_session.c"
Task: "Add native adapter status normalization tests in packages/zplc-ide/src/runtime/nativeAdapter.test.ts"
Task: "Add debug controller local simulation session tests in packages/zplc-ide/src/hooks/useDebugController.test.ts"

# Launch independent implementation tasks after lifecycle contract is stable:
Task: "Update firmware/apps/posix_host/CMakeLists.txt"
Task: "Fill parity-critical POSIX HAL behavior in firmware/lib/zplc_core/src/hal/posix/zplc_hal_posix.c"
```

---

## Parallel Example: User Story 2

```bash
# Launch User Story 2 failing tests together:
Task: "Add host runtime debug semantics tests in firmware/lib/zplc_core/tests/test_native_runtime_session.c"
Task: "Add native adapter debug command tests in packages/zplc-ide/src/runtime/nativeAdapter.test.ts"
Task: "Add capability-aware debug controller tests in packages/zplc-ide/src/hooks/useDebugController.test.ts"

# Launch independent implementation tasks after host debug contract exists:
Task: "Extend debug capability classification in packages/zplc-ide/src/runtime/debugCapabilities.ts"
Task: "Reduce renderer-owned semantics in packages/zplc-ide/src/runtime/wasmAdapter.ts"
```

---

## Parallel Example: User Story 3

```bash
# Launch User Story 3 failing tests together:
Task: "Add adapter parity tests in packages/zplc-ide/src/runtime/debugAdapter.test.ts"
Task: "Add backend switching tests in packages/zplc-ide/src/hooks/useDebugController.test.ts"
Task: "Add Electron IPC/preload integration tests in packages/zplc-ide/electron/main.native-sim.test.ts"

# Launch independent implementation tasks after adapter contract changes land:
Task: "Refactor packages/zplc-ide/src/runtime/connectionManager.ts"
Task: "Normalize runtime snapshots in packages/zplc-ide/src/runtime/nativeAdapter.ts and packages/zplc-ide/src/runtime/serialAdapter.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE** with the User Story 1 independent test
5. Demo the native local simulation lifecycle before touching deeper debugger parity

### Incremental Delivery

1. Setup + Foundational → protocol and supervision ready
2. Add User Story 1 → native lifecycle session works
3. Add User Story 2 → debugger semantics align with runtime ownership
4. Add User Story 3 → IDE workflow parity across simulation and hardware
5. Add User Story 4 → compatibility boundaries and release evidence become honest and explicit

### Parallel Team Strategy

With multiple developers:

1. One engineer owns host runtime backend (`firmware/apps/posix_host`, POSIX HAL, core tests)
2. One engineer owns Electron/main/preload supervision and IPC
3. One engineer owns IDE runtime adapter/hook integration and parity tests
4. Rejoin at each story checkpoint to validate parity before moving forward

---

## Notes

- All tasks follow the required checklist format with IDs, optional `[P]`, required `[US#]` labels for story phases, and explicit file paths
- TDD is mandatory here because the constitution and plan explicitly require test-first verification for runtime behavior changes
- Suggested MVP scope: **Phase 1 + Phase 2 + Phase 3 (User Story 1 only)**
