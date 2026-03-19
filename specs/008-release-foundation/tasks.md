# Tasks: ZPLC v1.5.0 Release Foundation

**Input**: Design documents from `/specs/008-release-foundation/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are REQUIRED for every changed behavior and release claim. Write or update
the failing checks first where practical, then make them pass. Human validation tasks are
mandatory for desktop and HIL gates and must produce evidence records.

**Organization**: Tasks are grouped by user story so each release slice can be validated
independently, even though some foundational governance and manifest work blocks all stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. `[US1]`, `[US2]`)
- Every task includes an exact file path

## Path Conventions

- **Core runtime**: `firmware/lib/zplc_core/include/`, `firmware/lib/zplc_core/src/core/`, `firmware/lib/zplc_core/tests/`
- **Zephyr app / HAL integration**: `firmware/app/`, `firmware/lib/zplc_core/src/hal/`, `tools/`
- **Compiler / IDE**: `packages/zplc-compiler/`, `packages/zplc-ide/`, shared packages under `packages/`
- **Documentation**: `docs/docs/` and `docs/i18n/es/`
- **Release governance**: `specs/008-release-foundation/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the release-governance scaffolding and establish executable validation entry points.

- [X] T001 Create the release evidence matrix skeleton in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`
- [X] T002 Create the evidence record template in `specs/008-release-foundation/artifacts/evidence-record-template.md`
- [X] T003 [P] Create the supported-board manifest seed in `firmware/app/boards/supported-boards.v1.5.0.json`
- [X] T004 [P] Create the canonical docs manifest seed in `docs/docs/reference/v1-5-canonical-docs-manifest.md`
- [X] T005 [P] Create the release claim inventory in `specs/008-release-foundation/artifacts/release-claims.md`
- [X] T006 [P] Add a release validation runner in `justfile`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish truth sources, automated checks, and release-wide enforcement before user-story work begins.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 Implement supported-board manifest validation in `tools/hil/validate_supported_boards.py`
- [X] T008 [P] Implement canonical docs parity validation in `tools/hil/validate_docs_parity.py`
- [X] T009 [P] Implement release evidence matrix validation in `tools/hil/validate_release_evidence.py`
- [X] T010 Wire supported-board manifest checking into `packages/zplc-ide/src/config/boardProfiles.ts`
- [X] T011 Wire supported-board manifest checking into `README.md`
- [X] T012 Wire canonical docs manifest publication into `docs/docs/reference/index.md`
- [X] T013 [P] Add automated release claim consistency test in `packages/zplc-ide/src/types/index.test.ts`
- [X] T014 [P] Add release validation entry to `.github/workflows/ci.yml`
- [X] T015 [P] Add docs parity/build validation entry to `.github/workflows/docs-deploy.yml`
- [X] T016 Document the validation command set in `specs/008-release-foundation/quickstart.md`

**Checkpoint**: Truth sources and release-wide validation gates exist and can block bad claims.

---

## Phase 3: User Story 1 - Release Engineer Trusts the Repository (Priority: P1)

**Goal**: Remove misleading tracked artifacts and stale release bookkeeping so the repository becomes a clean source of truth.

**Independent Test**: A clean checkout contains no tracked temporary artifacts, no tracked build-directory fallback, and no active placeholder specs in release scope.

### Tests for User Story 1

- [X] T017 [P] [US1] Add tracked-artifact audit script in `tools/hil/audit_repo_hygiene.py`
- [X] T018 [P] [US1] Add spec-scope audit script in `tools/hil/audit_specs_scope.py`

### Implementation for User Story 1

- [X] T019 [US1] Remove tracked temporary/debug artifacts referenced by `git status` from the repository root
- [X] T020 [US1] Remove tracked build-output fallback usage from `firmware/app/CMakeLists.txt`
- [X] T021 [US1] Clean stale placeholder status in `specs/007-v150-release-foundation/spec.md`
- [X] T022 [US1] Reconcile active spec bookkeeping in `specs/001-agents-infra/`, `specs/002-hil-testing/`, `specs/003-comm-fb-vm/`, and `specs/006-docs-overhaul/`
- [X] T023 [US1] Align release-truth notes in `specs/008-release-foundation/artifacts/release-claims.md`
- [X] T024 [US1] Run hygiene audits and record results in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

**Checkpoint**: The repository is clean, reproducible, and no longer depends on misleading tracked artifacts.

---

## Phase 4: User Story 2 - Controls Engineer Uses Any Supported IEC Language Without Hidden Gaps (Priority: P1)

**Goal**: Make every claimed IEC language satisfy the full IDE workflow and parity claim.

**Independent Test**: Canonical ST, IL, LD, FBD, and SFC programs author, compile, simulate, deploy, and debug successfully with equivalent supported behavior.

### Tests for User Story 2

- [X] T025 [P] [US2] Add canonical language workflow tests in `packages/zplc-ide/src/compiler/languageWorkflow.test.ts`
- [X] T026 [P] [US2] Add language parity sample verification in `tools/hil/language_tester.py`
- [X] T027 [P] [US2] Add compiler parity regression coverage in `packages/zplc-compiler/src/compiler/compiler.test.ts`

### Implementation for User Story 2

- [X] T028 [US2] Create canonical language sample set in `docs/docs/languages/examples/v1-5-language-suite.md`
- [X] T029 [US2] Align transpilation and compile-path documentation in `docs/docs/languages/index.md`
- [X] T030 [US2] Add canonical ST page decision and redirect plan in `docs/docs/languages/st.md`
- [X] T031 [US2] Ensure IL authoring-to-debug workflow support in `packages/zplc-ide/src/components/EditorArea.tsx`
- [X] T032 [US2] Ensure LD/FBD/SFC authoring-to-debug workflow support in `packages/zplc-ide/src/compiler/transpilers/index.ts`
- [X] T033 [US2] Preserve end-to-end debug metadata flow in `packages/zplc-ide/src/compiler/index.ts`
- [X] T034 [US2] Record language-path evidence in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

**Checkpoint**: Each claimed IEC language has a release-grade workflow and matching evidence.

---

## Phase 5: User Story 3 - Automation Engineer Uses Modbus TCP/RTU and MQTT as Real Product Features (Priority: P1)

**Goal**: Complete Modbus TCP/RTU and MQTT behavior across runtime, compiler, IDE, docs, and validation layers.

**Independent Test**: Protocol sample projects pass host tests, IDE flow checks, and required HIL runs without blocking scan-cycle behavior.

### Tests for User Story 3

- [X] T035 [P] [US3] Add Modbus COUNT and multi-value contract tests in `firmware/lib/zplc_core/tests/test_comm_dispatch.c`
- [X] T036 [P] [US3] Add MQTT handshake and subscribe support tests in `firmware/lib/zplc_core/tests/test_comm_dispatch.c`
- [X] T037 [P] [US3] Add compiler protocol block coverage in `packages/zplc-compiler/src/compiler/stdlib/communication.test.ts`
- [X] T038 [P] [US3] Add IDE protocol settings serialization tests in `packages/zplc-ide/src/types/index.test.ts`
- [X] T039 [P] [US3] Add protocol HIL orchestration update in `tools/hil/test_modbus_tcp.py`
- [X] T040 [P] [US3] Add MQTT HIL coverage update in `tools/hil/test_comm_security.py`

### Implementation for User Story 3

- [X] T041 [US3] Implement full Modbus COUNT semantics in `firmware/app/src/zplc_comm_modbus_handler.c`
- [X] T042 [US3] Implement MQTT subscribe completion semantics in `firmware/app/src/zplc_comm_mqtt_handler.c`
- [X] T043 [US3] Align protocol FB contracts in `packages/zplc-compiler/src/compiler/stdlib/communication.ts`
- [X] T044 [US3] Align IDE protocol configuration flows in `packages/zplc-ide/src/components/settings/ProjectSettings.tsx`
- [X] T045 [US3] Publish protocol behavior documentation in `docs/docs/runtime/communication-function-blocks.md`
- [X] T046 [US3] Publish protocol troubleshooting and examples in `docs/docs/integration/index.md`
- [X] T047 [US3] Publish Spanish protocol parity docs in `docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/communication-function-blocks.md`
- [X] T048 [US3] Record protocol evidence in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

**Checkpoint**: Modbus and MQTT are validated as real product features instead of partial plumbing.

---

## Phase 6: User Story 4 - IDE Desktop Builds and Debug Workflows Are Verified on Real Platforms (Priority: P1)

**Goal**: Produce desktop artifacts and human-recorded proof for macOS, Linux, and Windows IDE workflows.

**Independent Test**: Each desktop platform builds, launches, simulates, deploys, and debugs a sample project with a recorded evidence record.

### Tests for User Story 4

- [X] T049 [P] [US4] Add desktop packaging smoke automation in `packages/zplc-ide/scripts/smoke-desktop-builds.ts`
- [X] T050 [P] [US4] Add debug workflow regression coverage in `packages/zplc-ide/src/hooks/useDebugController.test.ts`
- [X] T051 [P] [US4] Add release smoke checklist template in `specs/008-release-foundation/artifacts/desktop-smoke-checklist.md`

### Implementation for User Story 4

- [X] T052 [US4] Wire macOS/Linux/Windows artifact generation in `.github/workflows/release.yml`
- [X] T053 [US4] Ensure compile/simulate/deploy/debug smoke flow script exists in `packages/zplc-ide/scripts/run-desktop-smoke.ts`
- [X] T054 [US4] Add standard desktop evidence record examples in `specs/008-release-foundation/artifacts/evidence-record-template.md`
- [ ] T055 [US4] Capture macOS smoke evidence in `specs/008-release-foundation/artifacts/evidence-desktop-macos.md`
- [ ] T056 [US4] Capture Linux smoke evidence in `specs/008-release-foundation/artifacts/evidence-desktop-linux.md`
- [ ] T057 [US4] Capture Windows smoke evidence in `specs/008-release-foundation/artifacts/evidence-desktop-windows.md`
- [X] T058 [US4] Record desktop validation gate results in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

**Checkpoint**: Desktop claims are backed by built artifacts and human-run evidence on all three operating systems.

---

## Phase 7: User Story 5 - Supported Board Claims Match Real Overlays, Builds, and Tests (Priority: P1)

**Goal**: Align firmware, IDE, docs, and release notes around one supported-board list with representative human HIL proof.

**Independent Test**: The supported-board list matches maintained firmware assets, every listed board cross-builds, and the human-validated subset covers one serial and one network board.

### Tests for User Story 5

- [X] T059 [P] [US5] Add board-manifest consistency test in `tools/hil/validate_supported_boards.py`
- [X] T060 [P] [US5] Add IDE board-profile manifest test in `packages/zplc-ide/src/config/boardProfiles.test.ts`
- [X] T061 [P] [US5] Add board cross-build matrix runner in `tools/hil/run_board_matrix.py`

### Implementation for User Story 5

- [X] T062 [US5] Populate the supported-board list in `firmware/app/boards/supported-boards.v1.5.0.json`
- [X] T063 [US5] Reconcile IDE board selectors to the supported-board list in `packages/zplc-ide/src/config/boardProfiles.ts`
- [X] T064 [US5] Reconcile board schema/options to the supported-board list in `packages/zplc-ide/zplc.schema.json`
- [X] T065 [US5] Replace README board claims with canonical links in `README.md`
- [X] T066 [US5] Publish supported-board reference page in `docs/docs/reference/index.md`
- [X] T067 [US5] Publish Spanish supported-board reference page in `docs/i18n/es/docusaurus-plugin-content-docs/current/reference/index.md`
- [ ] T068 [US5] Capture serial-focused HIL evidence in `specs/008-release-foundation/artifacts/evidence-board-serial.md`
- [ ] T069 [US5] Capture network-capable HIL evidence in `specs/008-release-foundation/artifacts/evidence-board-network.md`
- [X] T070 [US5] Record supported-board gate results in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

**Checkpoint**: Board support claims finally match maintained overlays, builds, docs, and evidence.

---

## Phase 8: User Story 6 - Documentation and GitHub Pages Become a Real Product Asset (Priority: P1)

**Goal**: Make the docs site the canonical bilingual product surface for v1.5.0.

**Independent Test**: A user can follow the canonical English or Spanish docs set from landing page to build, run, simulate, deploy, debug, and protocol usage.

### Tests for User Story 6

- [X] T071 [P] [US6] Add canonical docs manifest validation in `tools/hil/validate_docs_parity.py`
- [X] T072 [P] [US6] Add docs navigation/build regression check in `docs/package.json`
- [X] T073 [P] [US6] Add release-note claim consistency check in `tools/hil/validate_release_evidence.py`

### Implementation for User Story 6

- [X] T074 [US6] Populate the canonical docs manifest in `docs/docs/reference/v1-5-canonical-docs-manifest.md`
- [X] T075 [US6] Rewrite quickstart and platform overview pages in `docs/docs/getting-started/index.md` and `docs/docs/platform-overview/index.md`
- [X] T076 [US6] Rewrite runtime canonical pages in `docs/docs/runtime/index.md`, `docs/docs/runtime/hal-contract.md`, `docs/docs/runtime/memory-model.md`, `docs/docs/runtime/scheduler.md`, and `docs/docs/runtime/connectivity.md`
- [X] T077 [US6] Rewrite IDE/deployment canonical pages in `docs/docs/ide/index.md`, `docs/docs/ide/overview.md`, `docs/docs/ide/compiler.md`, and `docs/docs/ide/deployment.md`
- [X] T078 [US6] Rewrite architecture/operations/reference/release-note pages in `docs/docs/architecture/index.md`, `docs/docs/operations/index.md`, `docs/docs/reference/index.md`, and `docs/docs/release-notes/index.md`
- [X] T079 [US6] Create Spanish parity for the canonical page set in `docs/i18n/es/docusaurus-plugin-content-docs/current/`
- [X] T080 [US6] Remove or redirect duplicate/stale pages via `docs/sidebars.js`
- [X] T081 [US6] Align GitHub Pages config/versioning in `docs/docusaurus.config.js` and `docs/versions.json`
- [X] T082 [US6] Record docs parity gate results in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

**Checkpoint**: The docs site becomes the real bilingual source of truth for the release.

---

## Phase 9: User Story 7 - Maintainers Can Separate AI-Agent Work from Human Validation (Priority: P2)

**Goal**: Make ownership explicit so AI automation and human sign-off never get confused.

**Independent Test**: Every release gate is assigned to `AI`, `Human`, or `Shared`, and every environment-sensitive gate includes the required evidence record.

### Tests for User Story 7

- [X] T083 [P] [US7] Add owner-type validation in `tools/hil/validate_release_evidence.py`
- [X] T084 [P] [US7] Add release gate completeness check in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

### Implementation for User Story 7

- [X] T085 [US7] Populate owner assignments for every release gate in `specs/008-release-foundation/artifacts/release-evidence-matrix.md`
- [X] T086 [US7] Create initial human/shared evidence records in `specs/008-release-foundation/artifacts/`
- [X] T087 [US7] Document AI-vs-human execution rules in `specs/008-release-foundation/quickstart.md`
- [X] T088 [US7] Align release-note claim gating with owner evidence in `specs/008-release-foundation/artifacts/release-claims.md`

**Checkpoint**: Ownership boundaries are explicit, testable, and ready for release sign-off.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Finish repo-wide consistency, cleanup, and release packaging across all stories.

- [X] T089 [P] Finalize release note content in `docs/docs/release-notes/index.md`
- [X] T090 [P] Finalize Spanish release notes in `docs/i18n/es/docusaurus-plugin-content-docs/current/release-notes/index.md`
- [X] T091 Re-run full release validation and update `specs/008-release-foundation/artifacts/release-evidence-matrix.md`
- [X] T092 Reconcile final README messaging in `README.md`
- [X] T093 Remove any remaining stale claim surfaces in `packages/zplc-ide/`, `docs/`, and `specs/`
- [X] T094 Verify quickstart commands and release execution notes in `specs/008-release-foundation/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: starts immediately and creates release-governance scaffolding.
- **Foundational (Phase 2)**: depends on Setup and blocks every user story.
- **User Stories (Phases 3-9)**: all depend on Foundational completion.
- **Polish (Final Phase)**: depends on all desired stories being complete.

### User Story Dependencies

- **US1**: starts first after Foundational because repository cleanup removes hidden blockers.
- **US2**: depends on release governance and cleanup, but not on protocol completion.
- **US3**: depends on US2 language-path truth and Foundational validation assets.
- **US4**: depends on US2 and US3 for realistic compile/simulate/deploy/debug workflows.
- **US5**: depends on Foundational manifest work and may proceed in parallel with US2/US3 after truth sources exist.
- **US6**: depends on US1, US3, and US5 because docs must publish verified behavior and supported-board claims.
- **US7**: depends on all earlier stories producing gates/evidence that can be assigned and audited.

### Within Each User Story

- Test and validation tasks come before implementation tasks.
- Truth-source artifacts come before claim publication.
- Runtime/compiler changes come before docs/release-claim publication.
- Human evidence tasks are required before a story can be considered done.

### Parallel Opportunities

- Setup tasks `T003-T006` can run in parallel.
- Foundational validation scripts `T007-T015` can run in parallel by surface.
- Within each story, marked `[P]` test/validation tasks can run in parallel.
- US2 and US5 can partially proceed in parallel after Foundational completion.
- US6 docs rewrites can split across English/Spanish owners once the canonical manifest is fixed.

---

## Parallel Example: User Story 3

```text
Task: "Add Modbus COUNT and multi-value contract tests in firmware/lib/zplc_core/tests/test_comm_dispatch.c"
Task: "Add MQTT handshake and subscribe support tests in firmware/lib/zplc_core/tests/test_comm_dispatch.c"
Task: "Add IDE protocol settings serialization tests in packages/zplc-ide/src/types/index.test.ts"
Task: "Add MQTT HIL coverage update in tools/hil/test_comm_security.py"
```

## Parallel Example: User Story 6

```text
Task: "Add canonical docs manifest validation in tools/hil/validate_docs_parity.py"
Task: "Rewrite quickstart and platform overview pages in docs/docs/getting-started/index.md and docs/docs/platform-overview/index.md"
Task: "Create Spanish parity for the canonical page set in docs/i18n/es/docusaurus-plugin-content-docs/current/"
```

---

## Implementation Strategy

### MVP First (Recommended)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 repository hygiene
4. Complete Phase 7: US5 supported-board truth source
5. **STOP and VALIDATE**: confirm the repo is clean and the supported-board claim source is real

### Incremental Delivery

1. Ship repository truth fixes first (US1 + US5)
2. Add language workflow proof (US2)
3. Add protocol completion and validation (US3)
4. Add desktop evidence (US4)
5. Publish canonical bilingual docs (US6)
6. Finalize ownership matrix and sign-off flow (US7)

### Suggested MVP Scope

The smallest credible MVP for this feature is **US1 + US5**, because a truth-based release
cannot exist until the repository is clean and the supported-board claim source is honest.

---

## Notes

- All tasks use the required checklist format with IDs, optional `[P]`, story labels where required, and concrete file paths.
- Total story phases remain independently reviewable, but final release sign-off still depends on cross-story evidence.
- Human validation tasks are not optional for desktop and HIL claims.
