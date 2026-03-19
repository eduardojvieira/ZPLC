# Feature Specification: ZPLC v1.5.0 Release Foundation

**Feature Branch**: `008-release-foundation`  
**Created**: 2026-03-13  
**Status**: Draft  
**Input**: User request to prepare a serious v1.5.0 that improves repository health,
completes the intended IEC language and communication scope, verifies the IDE on
desktop platforms, validates simulation and debugging, aligns supported boards with
reality, and rewrites the documentation and GitHub Pages site in English and Spanish.

## Release Positioning

This specification defines what a serious `v1.5.0` means for ZPLC.

The release is not done when code merely exists. The release is done when:

1. The repository is clean, deterministic, and trustworthy.
2. Claimed product capabilities match verified evidence.
3. IEC language support is behaviorally complete and documented.
4. Modbus TCP, Modbus RTU, and MQTT are complete across runtime, authoring, and docs.
5. The IDE is built and validated on macOS, Linux, and Windows.
6. Simulation, debugging, and supported board claims are verified rather than assumed.
7. English and Spanish documentation become a real source of truth.

## Clarifications

### Session 2026-03-12

- v1.5.0 is a truth-based stabilization and completion release, not a marketing umbrella
  for unfinished work.
- Non-ST languages may remain implemented through transpilation to ST if that
  architecture is documented explicitly and behavioral parity is proven.
- AI agents may perform code, cleanup, docs, CI, and automated verification work, but
  human-operated validation is required for cross-platform desktop behavior, visual
  debugging workflows, and physical hardware acceptance.
- Any claim not fully verified by release time must be removed from the v1.5.0 claim set
  or marked experimental.

### Session 2026-03-13

- Q: What level of end-to-end IDE workflow must every claimed IEC language support in
  v1.5.0? → A: Every claimed language must support full end-to-end IDE workflow:
  authoring, compile, simulation, deployment, and debugging.
- Q: How should board status be represented in the v1.5.0 support source of truth? → A:
  Use a single list of supported boards only; anything else is absent from release
  claims.
- Q: What evidence format must human-owned release gates use? → A: Every human-owned
  gate must use a standard evidence record with owner, date, environment, steps run,
  result, and artifacts.
- Q: What minimum human hardware validation is required for the supported board claim set?
  → A: At least one serial-focused board and one network-capable board require human
  hardware-in-the-loop validation; other supported boards may rely on cross-build
  evidence unless they are separately promoted into the human-validated claim set.

## Current State Snapshot

- The repository contains tracked generated output and temporary artifacts that should
  not be part of a release baseline.
- Spec bookkeeping is stale: some completed work remains unchecked while placeholder
  specs still exist.
- Structured Text is the strongest language path; IL, LD, FBD, and SFC depend primarily
  on documented translation into the canonical language pipeline.
- Communication plumbing exists, but MQTT and Modbus behavior is not yet complete or
  fully verified.
- IDE board profiles currently claim more boards than the maintained support matrix can
  justify.
- Documentation structure improved, but navigation, duplication, stale content, and
  English/Spanish parity are not release-grade.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Release Engineer Trusts the Repository (Priority: P1)

A maintainer needs to cut `v1.5.0` from a repository that is clean, deterministic, and
free of misleading artifacts.

**Why this priority**: No serious release can be trusted if generated output, duplicate
files, placeholder specs, and stale claims remain in the source tree.

**Independent Test**: A clean checkout of the release branch contains no tracked
temporary artifacts, no tracked build directories used as hidden dependencies, and no
active placeholder specs pretending to be real work.

**Acceptance Scenarios**:

1. **Given** a clean checkout of the release branch, **When** a maintainer inspects
   tracked files, **Then** generated build output, temporary debug artifacts, duplicate
   source files, and stale scratch outputs SHALL be absent from the tracked source of
   truth.
2. **Given** the firmware app is configured from source, **When** the build generates
   required derived assets, **Then** it SHALL do so from canonical source inputs rather
   than from a checked-in build directory fallback.
3. **Given** the `specs/` tree is part of release review, **When** a maintainer checks
   active specifications, **Then** placeholder specs SHALL be archived, removed from
   active scope, or completed, and the remaining specs SHALL reflect release status
   accurately.

---

### User Story 2 - Controls Engineer Uses Any Supported IEC Language Without Hidden Gaps (Priority: P1)

A PLC engineer wants to write logic in ST, IL, LD, FBD, or SFC and receive consistent
compile, runtime, debugging, and documentation behavior.

**Why this priority**: v1.5.0 is only credible if claimed IEC language support behaves
consistently across the product experience.

**Independent Test**: A canonical language suite compiles and runs equivalent programs in
ST, IL, LD, FBD, and SFC, including timers, math, boolean logic, tasks, and supported
communication usage.

**Acceptance Scenarios**:

1. **Given** a canonical sample program exists in each supported language, **When** it is
   compiled for the same target runtime, **Then** the resulting behavior SHALL be
   equivalent for the supported scope.
2. **Given** LD, FBD, SFC, or IL are implemented through transpilation to ST, **When**
   the release documentation describes language architecture, **Then** the transpilation
   path SHALL be documented explicitly as supported architecture.
3. **Given** a user edits a program in any supported language, **When** they compile,
   simulate, deploy, and debug it in the IDE, **Then** the workflow SHALL work end to
   end for that language in v1.5.0.
4. **Given** a language has a real limitation in v1.5.0, **When** release scope is
   finalized, **Then** the limitation SHALL be documented and the release claim SHALL be
   reduced accordingly.

---

### User Story 3 - Automation Engineer Uses Modbus TCP/RTU and MQTT as Real Product Features (Priority: P1)

An automation engineer needs Modbus TCP, Modbus RTU, and MQTT to behave as complete
product features across runtime, compiler, IDE configuration, and IEC programming
languages.

**Why this priority**: Communication support is core user value for v1.5.0 and one of the
largest current gaps between claims and verified reality.

**Independent Test**: Protocol sample projects compile from each supported language path,
execute without blocking the scan cycle, and pass protocol-specific automated checks plus
hardware-backed verification where required.

**Acceptance Scenarios**:

1. **Given** a user configures Modbus RTU or TCP in the IDE, **When** they deploy the
   project, **Then** the generated runtime configuration SHALL match the selected
   board, network, and serial capabilities.
2. **Given** a `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, or `MB_WRITE_COIL`
   function block is used, **When** `COUNT` is greater than one or a protocol parameter is
   set, **Then** the runtime SHALL honor the documented contract or the feature SHALL not
   ship as complete in v1.5.0.
3. **Given** a user calls `MQTT_CONNECT`, `MQTT_PUBLISH`, or `MQTT_SUBSCRIBE`, **When**
   broker operations succeed or fail, **Then** the function block handshake (`BUSY`,
   `DONE`, `ERROR`, `STATUS`) SHALL remain deterministic and non-blocking.
4. **Given** a protocol block is available in ST, **When** the same block is used in IL,
   LD, FBD, or SFC-derived ST, **Then** the compiler and IDE SHALL expose an equivalent
   supported contract.
5. **Given** protocol features are documented, **When** a user reads the docs, **Then**
   they SHALL find configuration steps, examples, limits, status semantics, and
   troubleshooting guidance in both English and Spanish.

---

### User Story 4 - IDE Desktop Builds and Debug Workflows Are Verified on Real Platforms (Priority: P1)

A maintainer needs to build and validate the IDE on macOS, Linux, and Windows, and
confirm that simulation and debugging features work in practice.

**Why this priority**: Cross-platform desktop support and debugging credibility are
explicit release goals, and they cannot be claimed honestly from source inspection alone.

**Independent Test**: The IDE is built for all three desktop platforms, and a human
operator runs a common smoke checklist covering compile, open project, simulate, deploy,
debug, breakpoints, watch table, visual inspection, and value forcing.

**Acceptance Scenarios**:

1. **Given** the release workflow builds desktop artifacts for macOS, Linux, and
   Windows, **When** artifacts are produced, **Then** they SHALL be installable and
   launch successfully on each platform.
2. **Given** a sample project is opened in the IDE on each platform, **When** the
   operator compiles and runs it in simulation, **Then** the expected runtime state SHALL
   be visible through the UI.
3. **Given** a hardware-connected debug session is available, **When** the operator sets
   breakpoints, steps execution, forces values, and uses the watch table, **Then** those
   workflows SHALL behave correctly or the issue SHALL block release sign-off.
4. **Given** a validation step is environment-sensitive, **When** automation cannot prove
   it end to end, **Then** a human-owned evidence record SHALL be required before the gate
   is marked complete.

---

### User Story 5 - Supported Board Claims Match Real Overlays, Builds, and Tests (Priority: P1)

A firmware engineer needs confidence that every board claimed as supported is actually
represented by maintained overlays or configs and verified builds.

**Why this priority**: Board support drift wastes engineering time and destroys trust in
release notes and IDE configuration.

**Independent Test**: The supported-board list in firmware, IDE, README, and docs
resolves to the same list, and each listed board compiles successfully. The release also
includes human hardware validation for at least one serial-focused board and one
network-capable board.

**Acceptance Scenarios**:

1. **Given** a board is shown in the IDE, README, or docs as supported, **When** release
   review occurs, **Then** a corresponding maintained firmware configuration or overlay
   and build path SHALL exist.
2. **Given** a board lacks an overlay, build proof, or runtime validation, **When** the
   v1.5.0 support list is finalized, **Then** the board SHALL be removed from release
   claims.
3. **Given** the runtime release includes multiple boards, **When** CI and release
   validation run, **Then** the documented support list SHALL equal the verified support
   list, and the human-validated subset SHALL include at least one serial-focused board
   and one network-capable board.

---

### User Story 6 - Documentation and GitHub Pages Become a Real Product Asset (Priority: P1)

A user evaluating, building, integrating, or operating ZPLC needs complete, current,
bilingual documentation instead of scattered or contradictory repository content.

**Why this priority**: The release foundation is not credible unless the documentation and
site become a coherent product surface.

**Independent Test**: A new user can go from landing page to build, run, simulate,
deploy, debug, and protocol usage using only the docs site in either English or Spanish.

**Acceptance Scenarios**:

1. **Given** a first-time user visits the docs site, **When** they follow quickstart
   guidance, **Then** they SHALL find a coherent path for setup, build, run, and first
   program execution.
2. **Given** a user wants protocol guidance, **When** they navigate runtime, IDE, or
   language docs, **Then** they SHALL find setup steps, examples, function block
   reference material, status semantics, and supported-language mappings.
3. **Given** the docs site ships with English and Spanish content, **When** release
   review occurs, **Then** canonical pages SHALL exist in both languages with equivalent
   scope.
4. **Given** a page is stale, duplicated, or orphaned from navigation, **When** docs
   cleanup is finalized, **Then** it SHALL be removed, redirected, or merged into the
   canonical page set.

---

### User Story 7 - Maintainers Can Separate AI-Agent Work from Human Validation (Priority: P2)

A project lead needs a release plan that explicitly distinguishes what AI agents can do
from what must be validated by a human on real machines and hardware.

**Why this priority**: The release cannot be managed credibly if environment-sensitive
validation is mixed with automated work and nobody owns the final proof.

**Independent Test**: The release acceptance matrix assigns each gate to `AI`, `Human`,
or `Shared`, and no environment-sensitive gate is marked complete without the required
owner evidence.

**Acceptance Scenarios**:

1. **Given** a task is code, documentation, cleanup, or automated verification, **When**
   implementation planning is created, **Then** it MAY be assigned to an AI agent.
2. **Given** a task requires desktop UX observation, physical device interaction,
   OS-specific install behavior, or board lab access, **When** release ownership is
   assigned, **Then** it SHALL include a human owner.
3. **Given** AI-assisted code is used to fix a platform or hardware issue, **When** the
   fix is merged, **Then** the originating human-owned validation step SHALL be rerun
   before sign-off.

### Edge Cases

- Tracked generated assets accidentally become part of the build contract.
- Language parity exists only on paper and is not proven by equivalent behavior.
- A board appears in the IDE but lacks maintained firmware support.
- A feature exists in code but lacks operational proof.
- Documentation says one thing and the product does another.
- Simulation passes but hardware debugging fails.
- English content is complete while Spanish lags behind canonical scope.

## Requirements *(mandatory)*

### Functional Requirements

#### Repository Hygiene and Truthfulness

- **FR-001**: The repository MUST remove tracked generated build output, temporary
  artifacts, duplicate scratch files, and stale debug outputs from the release branch.
- **FR-002**: The build process MUST generate derived assets from canonical source inputs
  or a clearly maintained canonical generated-source location and MUST NOT depend on a
  checked-in build directory fallback.
- **FR-003**: Active release specs MUST reflect reality. Placeholder or abandoned specs
  in active release scope MUST be completed, archived, or marked inactive before v1.5.0
  sign-off.
- **FR-004**: README, IDE configuration, docs, specs, and release notes MUST describe only
  features and boards that are verified for v1.5.0.
- **FR-005**: The release branch MUST be reproducible from a clean checkout using
  documented commands and prerequisites.

#### IEC 61131-3 Language Coverage

- **FR-006**: v1.5.0 MUST define and document the canonical language pipeline for ST, IL,
  LD, FBD, and SFC from authoring to runtime execution.
- **FR-007**: Language support for v1.5.0 MUST be measured by behavioral equivalence and
  workflow completeness rather than by separate backend ownership.
- **FR-008**: If IL, LD, FBD, or SFC are compiled through ST transpilation, that
  architecture MUST be documented as an intentional and supported design for v1.5.0.
- **FR-009**: Each supported language MUST have release-grade examples, compile coverage,
  and documentation, including communication usage where applicable.
- **FR-010**: The IDE MUST provide a supported end-to-end workflow for each claimed
  language, covering authoring, compile, simulation, deployment, and debugging.
- **FR-011**: Any language limitation that remains in v1.5.0 MUST be documented
  explicitly and reflected in release claims.

#### Modbus TCP/RTU and MQTT Completion

- **FR-012**: Modbus RTU and Modbus TCP client support MUST be complete across runtime,
  compiler, IDE configuration, and documentation for the v1.5.0 supported scope.
- **FR-013**: Modbus function blocks MUST honor their documented inputs and outputs,
  including address, protocol mode, host and port behavior, and multi-value or `COUNT`
  semantics where claimed.
- **FR-014**: MQTT support MUST include complete and deterministic behavior for
  `MQTT_CONNECT`, `MQTT_PUBLISH`, and `MQTT_SUBSCRIBE`, including non-blocking scan
  behavior and meaningful status and error handling.
- **FR-015**: Protocol function blocks MUST be available through the supported language
  paths for ST, IL, LD, FBD, and SFC-derived ST.
- **FR-016**: The IDE MUST expose user-facing configuration flows for Modbus RTU, Modbus
  TCP, and MQTT that correspond to real runtime capabilities.
- **FR-017**: Protocol documentation MUST include setup, examples, status semantics,
  limits, error handling, troubleshooting, and per-language usage guidance in English and
  Spanish.
- **FR-018**: Cloud-specific wrappers beyond generic MQTT MAY ship only if they are
  verified to the same release standard; otherwise they SHALL be excluded from the
  v1.5.0 complete-feature claim set.

#### IDE Desktop Build, Simulation, and Debugging

- **FR-019**: The release process MUST build IDE artifacts for macOS, Linux, and
  Windows.
- **FR-020**: A human-operated smoke test MUST be executed on each target desktop
  platform, covering install or launch, project open, compile, simulation, deployment,
  and debugging.
- **FR-021**: Simulation and debugging validation for v1.5.0 MUST cover breakpoints,
  step and continue, visual inspection, value forcing, watch table behavior, and status
  or error feedback.
- **FR-022**: AI agents MAY implement automation, tests, CI, fixes, and documentation for
  IDE workflows, but they MUST NOT claim cross-platform validation without human-run
  evidence.
- **FR-023**: Any known security limitation in deployment or debugging flows MUST be
  documented clearly, and unsupported production-security claims MUST NOT appear in
  release materials.

#### Supported Boards and Runtime Verification

- **FR-024**: The supported board list in firmware, IDE, README, docs, and release notes
  MUST resolve to one consistent source of truth for v1.5.0.
- **FR-025**: Every board claimed as supported MUST have maintained firmware
  configuration or overlay files and a documented build path.
- **FR-026**: Every supported board MUST successfully cross-compile under the release
  validation process, or it SHALL be removed from the supported list.
- **FR-027**: The release MUST include human hardware-in-the-loop validation on
  representative hardware covering at least one serial-focused board and one
  network-capable board. Other supported boards MAY rely on cross-build evidence unless
  they are separately claimed as human-validated.
- **FR-028**: Boards present in IDE selectors without matching firmware support MUST be
  completed or removed before release.

#### Documentation and GitHub Pages

- **FR-029**: The documentation site MUST become the canonical source of truth for
  user-facing product guidance.
- **FR-030**: The docs MUST include quickstart, build, run, deployment, debugging,
  examples, supported boards, architecture, runtime, IDE, protocol configuration, and
  function block reference coverage.
- **FR-031**: Every supported communication block and relevant standard or library block
  included in v1.5.0 MUST be documented with language mapping and example usage.
- **FR-032**: English and Spanish docs MUST ship with parity for all canonical pages
  required for v1.5.0.
- **FR-033**: Sidebars and navigation MUST expose all canonical pages; orphan pages and
  duplicate topic variants MUST be removed, redirected, or merged.
- **FR-034**: `README.md` MUST remain the concise repository entry point for humans while
  `AGENTS.md` remains the AI and contributor entry point.
- **FR-035**: GitHub Pages deployment MUST remain reproducible and aligned with the final
  docs structure and versioning approach.

#### Release Governance and Ownership

- **FR-036**: v1.5.0 MUST maintain a release acceptance matrix that assigns each gate to
  `AI`, `Human`, or `Shared` ownership.
- **FR-037**: A gate marked `Human` MUST include explicit owner evidence before release
  sign-off.
- **FR-037a**: Every human-owned release gate MUST use a standard evidence record that
  captures owner, date, environment, steps run, result, and supporting artifacts.
- **FR-038**: A gate marked `Shared` MUST identify which portion is automated or
  AI-assisted and which portion is human validation.
- **FR-039**: v1.5.0 MUST prefer reducing unsupported claims over shipping ambiguous or
  partially verified scope.

### Key Entities

- **Release Evidence Matrix**: The table of release gates, ownership, validation method,
  evidence, and status used to decide whether v1.5.0 is real.
- **Evidence Record**: The standard record attached to a human-owned gate containing the
  owner, date, environment, steps run, result, and supporting artifacts.
- **Supported Language Path**: The full authoring-to-runtime route for a language,
  including editor model, transformation path, execution behavior, debugging, and
  documentation.
- **Supported Board Matrix**: The canonical list of boards that have maintained support,
  compile proof, and appear in the v1.5.0 supported board list.
- **Protocol Feature Contract**: The combined runtime, compiler, IDE, and documentation
  definition of Modbus RTU, Modbus TCP, and MQTT behavior.
- **Canonical Docs Set**: The English and Spanish page set that forms the single source
  of truth for product documentation.

### Non-Functional Requirements *(mandatory when behavior or architecture changes)*

- **NFR-001**: Verification MUST identify the automated checks, manual validation, and
  evidence required for each release gate.
- **NFR-002**: Errors, unsupported scope, and experimental features MUST be explicit and
  observable; silent gaps are forbidden.
- **NFR-003**: Release claims MUST remain traceable to documented evidence rather than to
  code presence alone.
- **NFR-004**: English and Spanish documentation parity MUST be maintained for the
  canonical page set before release sign-off.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A clean release checkout contains no tracked generated build directory, no
  temporary debug artifacts, and no duplicate scratch source files.
- **SC-002**: Canonical sample programs for ST, IL, LD, FBD, and SFC compile
  successfully and complete authoring, simulation, deployment, and debugging workflows
  with equivalent expected behavior for the v1.5.0 supported scope.
- **SC-003**: Modbus RTU, Modbus TCP, and MQTT pass release-grade automated tests, and no
  protocol function block listed as complete returns `not supported` at runtime.
- **SC-004**: IDE artifacts are built for macOS, Linux, and Windows, and each platform
  has human-recorded smoke validation for install or launch, compile, simulate, and
  debug.
- **SC-005**: The supported-board list published in docs and the IDE exactly matches the
  boards with maintained support files and successful release validation.
- **SC-005a**: The human-validated subset of the supported-board list includes at least
  one serial-focused board and one network-capable board.
- **SC-006**: English and Spanish docs cover all canonical v1.5.0 pages with no orphan
  navigation, no duplicate conflicting pages, and no stale architecture claims.
- **SC-007**: Release notes and product-facing claims describe only verified
  capabilities and explicitly separate supported scope from experimental or future scope.
- **SC-008**: The v1.5.0 release plan can be executed without guesswork because every
  major gate has an owner, a validation method, and evidence requirements.
- **SC-009**: Every human-owned release gate includes a completed standard evidence
  record with owner, date, environment, executed steps, result, and linked artifacts.

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
- Physical board flashing, hardware-in-the-loop execution, and hardware or network
  troubleshooting.
- Final approval of the supported-board matrix and release claim set.
- Final release sign-off based on observed evidence.

### Shared Work

- Human captures platform or hardware failure evidence.
- AI analyzes logs, proposes fixes, and updates code, tests, or docs.
- Human reruns the environment-sensitive validation to close the gate.

## Out of Scope

- New protocol families beyond Modbus TCP, Modbus RTU, and generic MQTT.
- Security hardening beyond honest documentation of current deployment and debugging
  limitations unless explicitly re-scoped.
- Broader board claims without matching support files, builds, and validation.
- Shipping cloud-wrapper functionality as complete merely because partial code exists.

## Assumptions

- The ZPLC runtime remains a bytecode VM with a language-agnostic execution model.
- Non-ST languages may remain implemented through documented, validated transpilation
  paths in v1.5.0.
- Some desktop and hardware validation cannot be fully proven by AI-only execution in the
  current environment.
- The release should prioritize credibility and completeness over maximizing the claim
  set.
