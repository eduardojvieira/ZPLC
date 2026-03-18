# Feature Specification: ZPLC v1.5.0 Release Foundation

**Feature Branch**: `007-v150-release-foundation`
**Created**: 2026-03-12
**Status**: Superseded
**Input**: User request to prepare a serious v1.5.0 that improves repository health, completes the intended IEC language and communication scope, verifies the IDE on desktop platforms, validates simulation/debugging, aligns supported boards with reality, and rewrites the documentation and GitHub Pages site in English and Spanish.

## Superseded Notice

This branch number was replaced by `008-release-foundation` when the feature creation
script auto-selected the next globally available sequence. Treat this file as historical
input only.

- Active v1.5 release foundation spec: `specs/008-release-foundation/spec.md`
- Active v1.5 plan/tasks: `specs/008-release-foundation/plan.md` and `specs/008-release-foundation/tasks.md`

## Clarifications

### Session 2026-03-12

- Q: What kind of release is v1.5.0? -> A: A truth-based stabilization and completion release, not a marketing umbrella for unfinished work.
- Q: Can non-ST languages remain implemented through transpilation to ST? -> A: Yes, if the architecture is explicitly documented and behavioral parity is proven by tests and examples.
- Q: Can AI agents perform all validation work? -> A: No. AI agents can do code, docs, cleanup, CI, and automated verification, but human-operated validation is required for cross-platform desktop behavior, visual debugging workflows, and physical hardware acceptance.
- Q: What happens to claims that are not fully verified by release time? -> A: They must be removed from the v1.5.0 claim set or marked experimental, not silently carried into release notes.

## Release Positioning

This specification defines what a serious `v1.5.0` means for ZPLC.

The release is not considered done when code merely exists. The release is done when:

1. The repository is clean, deterministic, and trustworthy.
2. Claimed product capabilities match verified evidence.
3. IEC language support is behaviorally complete and documented.
4. Modbus TCP/RTU and MQTT are complete across runtime, compiler, IDE, and documentation.
5. The IDE is built and validated on macOS, Linux, and Windows.
6. Simulation, debugging, and supported board claims are verified, not assumed.
7. English and Spanish documentation become a real source of truth.

## Current State Snapshot

- The repository currently contains tracked generated build output and temporary artifacts that should not be part of a release baseline.
- Spec bookkeeping is stale: some completed work is still unchecked, while abandoned placeholder specs still exist.
- ST is the strongest language path; LD, FBD, SFC, and IL primarily depend on transpilation to ST.
- Communication VM plumbing exists, but MQTT and Modbus FB behavior is not fully complete or fully verified.
- IDE board profiles currently claim more boards than the firmware overlays and verification matrix support.
- Documentation structure improved, but navigation, duplication, stale content, and English/Spanish parity are not release-grade.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Release Engineer Trusts the Repository (Priority: P1)

A maintainer needs to cut `v1.5.0` from a repository that is clean, deterministic, and free of misleading artifacts.

**Why this priority**: No serious release can be trusted if generated build output, duplicate files, placeholder specs, and stale claims remain in the source tree.

**Independent Test**: A clean checkout of the release branch contains no tracked temporary artifacts, no tracked build directories used as hidden dependencies, and no active placeholder specs pretending to be real work.

**Acceptance Scenarios**:

1. **Given** a clean checkout of the release branch, **When** a maintainer inspects tracked files, **Then** generated build output, temporary debug artifacts, duplicate source files, and stale scratch outputs SHALL be absent from the tracked source of truth.
2. **Given** the firmware app is configured from source, **When** the build generates required protobuf or derived assets, **Then** it SHALL do so from canonical source inputs, not from a checked-in build directory fallback.
3. **Given** the `specs/` tree is part of the release review, **When** a maintainer checks active specifications, **Then** placeholder specs SHALL be archived, removed from active scope, or completed, and the remaining specs SHALL accurately reflect release status.

---

### User Story 2 - Controls Engineer Uses Any Supported IEC Language Without Hidden Gaps (Priority: P1)

A PLC engineer wants to write logic in ST, IL, LD, FBD, or SFC and receive consistent compile, runtime, debugging, and documentation behavior.

**Why this priority**: The user goal for v1.5.0 explicitly requires full IEC language coverage in both runtime and IDE, without loose ends.

**Independent Test**: A canonical language suite compiles and runs equivalent programs in ST, IL, LD, FBD, and SFC, including timers, math, boolean logic, tasks, and communication FB usage where supported.

**Acceptance Scenarios**:

1. **Given** a canonical sample program exists in each supported language, **When** it is compiled for the same runtime target, **Then** the resulting behavior SHALL be equivalent at the bytecode/runtime level.
2. **Given** LD, FBD, SFC, or IL are implemented through transpilation to ST, **When** the release documentation describes language architecture, **Then** the transpilation path SHALL be explicitly documented as supported architecture rather than implied away.
3. **Given** a user edits a program in any supported language, **When** they compile, simulate, and debug it in the IDE, **Then** the workflow SHALL either work end-to-end or be explicitly documented as out of scope for that language in v1.5.0.
4. **Given** a language has a real limitation in v1.5.0, **When** release scope is finalized, **Then** the limitation SHALL be documented and the marketing claim SHALL be reduced accordingly.

---

### User Story 3 - Automation Engineer Uses Modbus TCP/RTU and MQTT as Real Product Features (Priority: P1)

An automation engineer needs Modbus TCP, Modbus RTU, and MQTT to behave as complete product features across runtime, compiler, IDE configuration, and IEC programming languages.

**Why this priority**: This is core user intent for v1.5.0 and one of the biggest gaps between current claims and verified reality.

**Independent Test**: Protocol sample projects compile from each supported language path, execute without blocking the scan cycle, and pass protocol-specific host tests plus hardware-backed verification where required.

**Acceptance Scenarios**:

1. **Given** a user configures Modbus RTU or TCP in the IDE, **When** they deploy the project, **Then** the generated runtime configuration SHALL match the selected board/network/serial capabilities.
2. **Given** a `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, or `MB_WRITE_COIL` FB is used, **When** `COUNT` is greater than one or a protocol parameter is set, **Then** the runtime SHALL honor the full contract or the feature SHALL not ship as complete in v1.5.0.
3. **Given** a user calls `MQTT_CONNECT`, `MQTT_PUBLISH`, or `MQTT_SUBSCRIBE`, **When** broker operations succeed or fail, **Then** the FB handshake (`BUSY`, `DONE`, `ERROR`, `STATUS`) SHALL remain deterministic and non-blocking.
4. **Given** a protocol block is available in ST, **When** the same block is used in IL, LD, FBD, or SFC-derived ST, **Then** the compiler and IDE SHALL expose an equivalent supported contract.
5. **Given** protocol features are documented, **When** a user reads the docs, **Then** they SHALL find configuration steps, examples, limits, status semantics, and troubleshooting guidance in both English and Spanish.

---

### User Story 4 - IDE Desktop Builds and Debug Workflows Are Verified on Real Platforms (Priority: P1)

A maintainer needs to build and validate the IDE on macOS, Linux, and Windows, and confirm that simulation and debugging features work in practice.

**Why this priority**: Cross-platform desktop support and debugging credibility are explicit release goals, and they cannot be truthfully claimed from source inspection alone.

**Independent Test**: The IDE is built for all three desktop platforms, and a human operator runs a common smoke checklist covering compile, open project, simulate, deploy, debug, breakpoints, watch table, visual inspection, and force value flow.

**Acceptance Scenarios**:

1. **Given** the release workflow builds desktop artifacts for macOS, Linux, and Windows, **When** artifacts are produced, **Then** they SHALL be installable and launch successfully on each platform.
2. **Given** a sample project is opened in the IDE on each platform, **When** the operator compiles and runs it in simulation, **Then** the expected runtime state SHALL be visible through the UI.
3. **Given** a hardware-connected debug session is available, **When** the operator sets breakpoints, steps execution, forces values, and uses the watch table, **Then** those workflows SHALL behave correctly or the issue SHALL block release sign-off.
4. **Given** a validation step is environment-sensitive, **When** AI automation cannot prove it end-to-end, **Then** a human-owned evidence record SHALL be required before marking the release gate complete.

---

### User Story 5 - Supported Board Claims Match Real Overlays, Builds, and Tests (Priority: P1)

A firmware engineer needs confidence that every board claimed as supported is actually represented by maintained overlays/configs and verified builds.

**Why this priority**: Board support drift creates wasted engineering time and destroys trust in release notes and IDE configuration.

**Independent Test**: The supported-board matrix in firmware, IDE, README, and docs resolves to the same list, and each listed board either compiles successfully or is explicitly classified as experimental.

**Acceptance Scenarios**:

1. **Given** a board is shown in the IDE, README, or docs as supported, **When** release review occurs, **Then** a corresponding maintained firmware configuration/overlay and build path SHALL exist.
2. **Given** a board lacks an overlay, build proof, or runtime validation, **When** the v1.5.0 support matrix is finalized, **Then** the board SHALL be removed from the supported list or downgraded to experimental.
3. **Given** the runtime release includes multiple boards, **When** CI and release validation run, **Then** the documented support matrix SHALL equal the actual verified matrix.

---

### User Story 6 - Documentation and GitHub Pages Become a Real Product Asset (Priority: P1)

A user evaluating, building, integrating, or operating ZPLC needs complete, current, bilingual documentation instead of scattered or contradictory repository content.

**Why this priority**: The user explicitly wants the documentation and GitHub Pages site redone as a serious foundation for the project.

**Independent Test**: A new user can go from landing page to build, run, simulate, deploy, debug, and protocol usage using only the docs site in either English or Spanish.

**Acceptance Scenarios**:

1. **Given** a first-time user visits the docs site, **When** they follow quickstart guidance, **Then** they SHALL find a coherent path for setup, build, run, and first program execution.
2. **Given** a user wants protocol guidance, **When** they navigate runtime, IDE, or language docs, **Then** they SHALL find protocol setup, examples, FB reference, status semantics, and supported-language mappings.
3. **Given** the docs site ships with English and Spanish content, **When** release review occurs, **Then** canonical pages SHALL exist in both languages with equivalent scope.
4. **Given** a page is stale, duplicated, or orphaned from navigation, **When** docs cleanup is finalized, **Then** it SHALL be removed, redirected, or merged into the canonical page set.

---

### User Story 7 - Maintainers Can Separate AI-Agent Work from Human Validation (Priority: P2)

A project lead needs a release plan that explicitly distinguishes what AI agents can do from what must be validated by a human on real machines and hardware.

**Why this priority**: The user explicitly asked for a spec that accounts for both AI-agent work and owner-only validation work.

**Independent Test**: The release acceptance matrix assigns each gate to `AI`, `Human`, or `Shared`, and no environment-sensitive gate is marked complete without the required owner evidence.

**Acceptance Scenarios**:

1. **Given** a task is code, documentation, cleanup, or automated verification, **When** implementation planning is created, **Then** it MAY be assigned to an AI agent.
2. **Given** a task requires desktop UX observation, physical device interaction, OS-specific install behavior, or board lab access, **When** release ownership is assigned, **Then** it SHALL include a human owner.
3. **Given** AI-generated code is used to fix a platform or hardware issue, **When** the fix is merged, **Then** the originating human-owned validation step SHALL be rerun before sign-off.

---

### Edge Cases

- **Tracked generated assets accidentally become part of the build contract**: The release must remove hidden dependencies on checked-in build directories.
- **Language parity exists only on paper**: If non-ST languages rely on ST transpilation, parity must be proven, not assumed.
- **A board appears in the IDE but lacks firmware support**: The board must be downgraded or completed before release.
- **A feature exists in code but lacks operational proof**: It cannot be claimed as complete in release notes.
- **Documentation says one thing and code does another**: Documentation must be corrected before release; code comments and stale docs cannot coexist as competing truths.
- **Simulation passes but hardware debugging fails**: The release gate remains open until the supported-scope statement is narrowed or the bug is fixed and revalidated.
- **English content is complete but Spanish lags**: v1.5.0 docs are not done until parity is reached for canonical pages.

---

## Requirements _(mandatory)_

### Functional Requirements

#### Repository Hygiene and Truthfulness

- **FR-001**: The repository MUST remove tracked generated build output, temporary artifacts, duplicate scratch files, and stale debug outputs from the release branch.
- **FR-002**: The firmware build MUST generate derived assets from canonical source inputs or a clearly maintained canonical generated-source location; it MUST NOT depend on a checked-in build directory fallback.
- **FR-003**: Active release specs MUST reflect reality. Placeholder or abandoned specs in active release scope MUST be completed, archived, or explicitly marked inactive before v1.5.0 sign-off.
- **FR-004**: README, IDE configuration, docs, specs, and release notes MUST describe only features and boards that are actually verified for v1.5.0.
- **FR-005**: The release branch MUST be reproducible from a clean checkout using documented commands and documented prerequisites.

#### IEC 61131-3 Language Coverage

- **FR-006**: v1.5.0 MUST define and document the canonical language pipeline for ST, IL, LD, FBD, and SFC from authoring to bytecode/runtime execution.
- **FR-007**: Language support for v1.5.0 MUST be measured by behavioral equivalence and user workflow completeness, not by whether each language has a separate backend implementation.
- **FR-008**: If IL, LD, FBD, or SFC are compiled through ST transpilation, that architecture MUST be documented as an intentional and supported design for v1.5.0.
- **FR-009**: Each supported language MUST have release-grade examples, compile coverage, and documentation, including communication usage where applicable.
- **FR-010**: The IDE MUST provide a supported authoring and compile path for each claimed language. Text-based support is acceptable when visual editing is not part of the product promise for that language.
- **FR-011**: Any language limitation that remains in v1.5.0 MUST be explicitly documented and reflected in release claims.

#### Modbus TCP/RTU and MQTT Completion

- **FR-012**: Modbus RTU and Modbus TCP client support MUST be complete across runtime, compiler, IDE configuration, and documentation for the v1.5.0 supported scope.
- **FR-013**: Modbus FB implementations MUST honor their documented inputs and outputs, including address, protocol mode, host/port behavior, and multi-value or `COUNT` semantics where claimed.
- **FR-014**: MQTT support MUST include complete and deterministic behavior for `MQTT_CONNECT`, `MQTT_PUBLISH`, and `MQTT_SUBSCRIBE`, including non-blocking scan behavior and meaningful status/error handling.
- **FR-015**: Protocol FBs MUST be available through the supported language paths for ST, IL, LD, FBD, and SFC-derived ST.
- **FR-016**: The IDE MUST expose user-facing configuration flows for Modbus RTU, Modbus TCP, and MQTT that correspond to real runtime capabilities.
- **FR-017**: Protocol documentation MUST include setup, examples, status semantics, limits, error handling, troubleshooting, and per-language usage guidance in English and Spanish.
- **FR-018**: Cloud-specific wrappers beyond generic MQTT MAY ship only if they are separately verified to the same release standard; otherwise they SHALL be excluded from the v1.5.0 complete-feature claim set.

#### IDE Desktop Build, Simulation, and Debugging

- **FR-019**: The release process MUST build IDE artifacts for macOS, Linux, and Windows.
- **FR-020**: A human-operated smoke test MUST be executed on each target desktop platform, covering install/launch, project open, compile, simulation, deployment, and debugging.
- **FR-021**: Simulation and debugging validation for v1.5.0 MUST cover breakpoints, step/continue, visual inspection, value forcing, watch table behavior, and status/error feedback.
- **FR-022**: AI agents MAY implement automation, tests, CI, fixes, and documentation for IDE workflows, but they MUST NOT claim cross-platform validation without human-run evidence.
- **FR-023**: Any known security limitation in deployment or debugging flows MUST be documented clearly, and unsupported production-security claims MUST NOT appear in release materials.

#### Supported Boards and Runtime Verification

- **FR-024**: The supported board matrix in firmware, IDE, README, docs, and release notes MUST resolve to one consistent source of truth for v1.5.0.
- **FR-025**: Every board claimed as supported MUST have maintained firmware configuration or overlay files and a documented build path.
- **FR-026**: Every supported board MUST successfully cross-compile under the release validation process, or it SHALL be removed from the supported list.
- **FR-027**: The release MUST include human HIL validation on representative hardware covering at least one serial-focused board and one network-capable board, unless the final supported matrix is narrower.
- **FR-028**: Boards present in IDE selectors without matching firmware support MUST be completed, reclassified as experimental, or removed before release.

#### Documentation and GitHub Pages

- **FR-029**: The documentation site MUST become the canonical source of truth for user-facing product guidance.
- **FR-030**: The docs MUST include quickstart, build, run, deployment, debugging, examples, supported boards, architecture, runtime, IDE, protocol configuration, and function block reference coverage.
- **FR-031**: Every supported communication block and relevant standard/library block included in v1.5.0 MUST be documented with language mapping and example usage.
- **FR-032**: English and Spanish docs MUST ship with parity for all canonical pages required for v1.5.0.
- **FR-033**: Sidebars/navigation MUST expose all canonical pages; orphan pages and duplicate topic variants MUST be removed, redirected, or merged.
- **FR-034**: README.md MUST remain the concise repository entry point for humans, while AGENTS.md remains the AI/contributor entry point.
- **FR-035**: GitHub Pages deployment MUST remain reproducible and aligned with the final docs structure and versioning approach.

#### Release Governance and Ownership

- **FR-036**: v1.5.0 MUST maintain a release acceptance matrix that assigns each gate to `AI`, `Human`, or `Shared` ownership.
- **FR-037**: A gate marked `Human` MUST include explicit owner evidence before release sign-off.
- **FR-038**: A gate marked `Shared` MUST identify which portion is automated or AI-assisted and which portion is human validation.
- **FR-039**: v1.5.0 MUST prefer reducing unsupported claims over shipping ambiguous or partially verified scope.

### Key Entities

- **Release Evidence Matrix**: The table of release gates, ownership, validation method, and status used to decide whether v1.5.0 is real.
- **Supported Language Path**: The full authoring-to-runtime route for a language, including editor model, transpilation or compilation path, bytecode generation, debugging, and documentation.
- **Supported Board Matrix**: The canonical list of boards that have overlays/configs, compile proof, and documented support classification.
- **Protocol Feature Contract**: The combined runtime/compiler/IDE/documentation definition of Modbus RTU, Modbus TCP, and MQTT behavior.
- **Canonical Docs Set**: The English and Spanish page set that forms the single source of truth for product documentation.

---

## Execution Model and Ownership

### AI-Agent Eligible Work

- Repository cleanup planning and implementation.
- Code fixes in runtime, compiler, IDE, CI, and documentation.
- Automated tests, smoke scripts, protocol fixtures, and build pipeline updates.
- Acceptance-matrix drafting, release checklist drafting, and spec maintenance.
- Documentation authoring and translation scaffolding.

### Human-Required Work

- Desktop smoke validation on real macOS, Linux, and Windows environments.
- Manual UI validation of simulation and debugging flows.
- Physical board flashing, HIL execution, and hardware/network troubleshooting.
- Final approval of the supported-board matrix and release claim set.
- Final release sign-off based on observed evidence.

### Shared Work

- Human captures platform or hardware failure evidence.
- AI analyzes logs, proposes fixes, and updates code/tests/docs.
- Human reruns the environment-sensitive validation to close the gate.

---

## Out of Scope for v1.5.0 Unless Separately Re-Scoped

- New protocol families beyond Modbus TCP, Modbus RTU, and generic MQTT.
- Security/authentication hardening beyond honest documentation of current debug/deployment limitations, unless explicitly added to scope.
- Broadening board claims without matching overlays, builds, and validation.
- Shipping cloud-wrapper functionality as complete merely because partial code exists.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A clean release checkout contains no tracked generated build directory, no temporary debug artifacts, and no duplicate scratch source files.
- **SC-002**: Canonical sample programs for ST, IL, LD, FBD, and SFC compile successfully and demonstrate equivalent expected behavior for the v1.5.0 supported scope.
- **SC-003**: Modbus RTU, Modbus TCP, and MQTT pass release-grade automated tests and no protocol FB listed as complete returns `not supported` at runtime.
- **SC-004**: IDE artifacts are built for macOS, Linux, and Windows, and each platform has human-recorded smoke validation for install, launch, compile, simulate, and debug.
- **SC-005**: The supported-board matrix published in docs and the IDE exactly matches the boards with maintained overlays/configs and successful release validation.
- **SC-006**: English and Spanish docs cover all canonical v1.5.0 pages with no orphan navigation, no duplicate conflicting pages, and no stale architecture claims.
- **SC-007**: Release notes and product-facing claims describe only verified capabilities and explicitly separate supported scope from experimental or future scope.
- **SC-008**: The v1.5.0 release plan can be executed without guesswork because every major gate has an owner, a validation method, and evidence requirements.

### Assumptions

- The ZPLC runtime remains a bytecode VM with a language-agnostic execution model.
- Non-ST languages may remain implemented through documented, validated transpilation paths in v1.5.0.
- Some desktop and hardware validation cannot be fully proven by AI-only execution in the current environment.
- The release should prioritize credibility and completeness over maximizing the claim set.
