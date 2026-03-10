# Tasks: Communication Function Blocks — VM Spec

**Input**: Design documents from `/specs/003-comm-fb-vm/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/comm-fb-api.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Define `OP_COMM_EXEC` (0xD0), `OP_COMM_STATUS` (0xD1), `OP_COMM_RESET` (0xD2) in `firmware/lib/zplc_core/include/zplc_isa.h`
- [ ] T002 Define `zplc_comm_fb_kind_t` and `zplc_comm_status_t` in `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`
- [ ] T003 [P] Create `packages/zplc-compiler/src/compiler/stdlib/communication.ts` with basic imports and type definitions
- [ ] T004 [P] Create `packages/zplc-ide/src/editors/comm/commBlockCatalog.ts` with `CommBlockDef` interfaces

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented
**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Write C unit tests for dispatch table in `firmware/lib/zplc_core/tests/test_comm_dispatch.c`
- [ ] T006 Implement `zplc_comm_register_handler`, `zplc_comm_fb_exec`, `zplc_comm_fb_reset` in `firmware/lib/zplc_core/src/core/zplc_comm_dispatch.c`
- [ ] T007 Integrate opcodes 0xD0-0xD2 into the core fetch-decode-execute loop in `firmware/lib/zplc_core/src/core/zplc_core.c`
- [ ] T008 [P] Register `zplc_comm_dispatch.c` in `firmware/lib/zplc_core/CMakeLists.txt`
- [ ] T009 Run `ctest` to ensure foundational C tests pass

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Modbus Device Read (Priority: P1) 🎯 MVP

**Goal**: Enable reading/writing Modbus registers synchronously via the VM in ST/FBD/LD without blocking the scan cycle.

**Independent Test**: Instantiate `MB_READ_HREG` in ST. Validate that DONE pulses for exactly one scan and VALUE updates on success.

### Tests for User Story 1

- [ ] T010 [US1] Write TS tests for Modbus opcodes generation in `packages/zplc-compiler/src/compiler/stdlib/communication.test.ts`

### Implementation for User Story 1

- [ ] T011 [US1] Implement `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL` FBs in `packages/zplc-compiler/src/compiler/stdlib/communication.ts`
- [ ] T012 [P] [US1] Add Modbus catalog defs to `packages/zplc-ide/src/editors/comm/commBlockCatalog.ts`
- [ ] T013 [P] [US1] Register Modbus FBs in `packages/zplc-compiler/src/compiler/stdlib/index.ts`
- [ ] T014 [US1] Implement `firmware/app/src/zplc_comm_modbus_handler.c` linking dispatch to existing `zplc_modbus_client_*` calls
- [ ] T015 [US1] Wire Modbus initialization and handler registration into the app boot code (`main.c` / Modbus init routines)
- [ ] T016 [P] [US1] Update `packages/zplc-ide/src/transpiler/fbdToST.ts` to emit correct ST for Modbus blocks
- [ ] T017 [P] [US1] Update `packages/zplc-ide/src/transpiler/ldToST.ts` for Modbus blocks
- [ ] T018 [US1] Run posix simulation test per `quickstart.md` Step 5

**Checkpoint**: User Story 1 (Modbus) fully functional.

---

## Phase 4: User Story 2 - MQTT Publish/Subscribe (Priority: P2)

**Goal**: Expose MQTT connect, publish, and subscribe as VM function blocks that behave asynchronously.

**Independent Test**: Call `MQTT_CONNECT` followed by `MQTT_PUBLISH` in a cyclic task and verify delivery over a local broker.

### Tests for User Story 2

- [ ] T019 [US2] Write TS tests for MQTT FBs in `packages/zplc-compiler/src/compiler/stdlib/communication.test.ts`

### Implementation for User Story 2

- [ ] T020 [US2] Implement `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE` FBs in `packages/zplc-compiler/src/compiler/stdlib/communication.ts`
- [ ] T021 [P] [US2] Add MQTT catalog defs to `packages/zplc-ide/src/editors/comm/commBlockCatalog.ts`
- [ ] T022 [P] [US2] Register MQTT FBs in `packages/zplc-compiler/src/compiler/stdlib/index.ts`
- [ ] T023 [US2] Implement `firmware/app/src/zplc_comm_mqtt_handler.c` using the ring-buffer architecture for pub/sub queueing
- [ ] T024 [US2] Update existing `firmware/app/src/zplc_mqtt.c` to export connection state and drain the ring buffer queue iteratively
- [ ] T025 [P] [US2] Update `packages/zplc-ide/src/transpiler/fbdToST.ts` and `ldToST.ts` for MQTT blocks
- [ ] T026 [US2] Run local broker deployment (Mosquitto) and verify MQTT function blocks end-to-end

**Checkpoint**: User Story 2 (MQTT pub/sub) fully functional.

---

## Phase 5: User Story 3 - Cloud Wrappers (Priority: P3 - Deferred to MVP 2.0)

**Goal**: Dedicated blocks for Sparkplug B, Azure DPS/IoT, and AWS Fleet Provisioning wrapping MQTT.

- [ ] T027 [US3] Add cloud FBs to `communication.ts` and `commBlockCatalog.ts`
- [ ] T028 [US3] Extend `zplc_comm_mqtt_handler.c` to parse Azure/AWS/Sparkplug specific fields and map them to specialized mqtt outputs

**Checkpoint**: User Story 3 functionality complete.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T029 Execute cross-compilation pipeline for all 5 boards via Zephyr west (quickstart.md Step 6)
- [ ] T030 Perform HIL gate tests (Hardware-in-the-Loop) on physical boards
- [ ] T031 Refactor documentation in `docs/` to remove references to placeholder communication blocks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Modbus (US1) and MQTT (US2) can technically proceed in parallel since they touch isolated handler files.
- **Polish (Final Phase)**: Depends on US1/US2 completion.

### Parallel Opportunities

- Compiler/IDE work (T003, T004, T011, T012, T013, T016, T017) can be done entirely in parallel with Firmware/Zephyr work (T005, T006, T007, T014, T015).
- Modbus and MQTT TS test coverage can be implemented concurrently by separate streams.

### Implementation Strategy

1. Execute Phase 1 & 2 linearly. Validate C Core unit tests pass fully.
2. Form Team A (Firmware) and Team B (Compiler/IDE).
3. Team B implements all compiler features for US1 (Modbus opcodes/generation).
4. Team A implements `zplc_comm_modbus_handler` against the C API.
5. End-to-end MVP test: run Modbus READ cyclic task against `diagslave`.
6. Proceed to US2 (MQTT) following the same parallel pattern.
