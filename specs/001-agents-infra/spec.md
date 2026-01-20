# Feature Specification: AI Agents Infrastructure

**Feature Branch**: `001-agents-infra`
**Created**: 2026-01-20
**Status**: Draft
**Input**: Infrastructure setup for AI agents (agents.md + skills)

## User Scenarios & Testing

### User Story 1 - Agent Role Definitions (Priority: P1)

As a Project Lead, I want an `agents.md` file that defines specific technical personas so that AI agents working on the codebase adopt the correct rigorous mindset (Industrial/Embedded) rather than a generic helpful assistant persona.

**Why this priority**: Without defined roles, agents generate generic, unsafe code unsuitable for industrial control systems.

**Independent Test**: Verify `agents.md` exists in root and contains definitions for `FirmwareEngineer`, `QA_Industrial`, and `ArchitectureKeeper`.

**Acceptance Scenarios**:
1. **Given** the repo root, **When** checking for `agents.md`, **Then** the file exists.
2. **Given** `agents.md`, **When** reading content, **Then** it explicitly defines the `FirmwareEngineer` role with C/Zephyr expertise requirements.
3. **Given** `agents.md`, **When** reading content, **Then** it defines `ArchitectureKeeper` with authority to reject non-real-time compliant code.

---

### User Story 2 - Zephyr Build Skill (Priority: P1)

As a Developer, I want a standardized `skills/zephyr-build/skill.md` so that agents can reliably build the firmware for specific targets without hallucinating build commands.

**Why this priority**: Building embedded firmware is complex (`west`, overlapping boards, artifacts). Agents fail without explicit instructions.

**Independent Test**: Review `skills/zephyr-build/skill.md` for correct `west build` commands and board selection logic.

**Acceptance Scenarios**:
1. **Given** an agent session, **When** asked to "build for S7 target", **Then** the agent uses the `zephyr-build` skill to execute `west build -b ...` correctly.
2. **Given** a dirty build environment, **When** invoking the skill, **Then** it includes instructions/options for pristine builds (`--pristine`).

---

### User Story 3 - Code Analysis Skill (Priority: P1)

As a QA Engineer, I want a `skills/code-analysis/skill.md` so that agents can autonomously run static analysis and verify compliance with MISRA/Industrial standards.

**Why this priority**: Manual review of generated code is tedious. Agents must self-verify quality before proposing code.

**Independent Test**: Review `skills/code-analysis/skill.md` for references to `cppcheck` (or similar) and strict warning policies.

**Acceptance Scenarios**:
1. **Given** new C code, **When** the agent runs the analysis skill, **Then** it detects and rejects code with potential memory leaks or undefined behavior.

---

### User Story 4 - Module Scaffolding Skill (Priority: P2)

As a Contributor, I want a `skills/zplc-module/skill.md` so that I can generate the boilerplate for new PLC function blocks that adheres strictly to the ZPLC memory model.

**Why this priority**: Enforces architecture consistency (static allocation, HAL abstraction) from the start of any new feature.

**Independent Test**: Review `skills/zplc-module/skill.md` for correct template structure (header, source, test).

**Acceptance Scenarios**:
1. **Given** a request for "PID Control Block", **When** using the skill, **Then** it generates files in `firmware/lib/zplc_core/src/` with correct headers and `zplc_result_t` return types.

### Edge Cases

- What happens when specific tools (e.g., `west`) are not in PATH? (Skill should check prerequisites).
- What happens if the user asks for a role not in `agents.md`? (System defaults to generic, but `agents.md` roles are preferred).

## Requirements

### Functional Requirements

- **FR-001**: System MUST have an `agents.md` file in the repository root.
- **FR-002**: `agents.md` MUST define strict, non-generic roles: `FirmwareEngineer`, `QA_Industrial`, `ArchitectureKeeper`.
- **FR-003**: System MUST have a `skills/` directory at the repository root.
- **FR-004**: `skills/zephyr-build/skill.md` MUST define `west build` workflows, including board selection (`-b`) and pristine builds.
- **FR-005**: `skills/code-analysis/skill.md` MUST define static analysis workflows (e.g., `cppcheck`, `clang-tidy` references) and demand strict compliance (Zero Warnings).
- **FR-006**: `skills/zplc-module/skill.md` MUST provide a scaffold for new ZPLC modules/function blocks, enforcing:
    - No dynamic memory allocation (`malloc`).
    - Use of `zplc_result_t` for error propagation.
    - Separation of interface (`.h`) and implementation (`.c`).

### Key Entities

- **Agent Persona**: A definition of behavior, expertise, and constraints (e.g., "Cynical Firmware Engineer").
- **Skill**: A structured markdown file containing prompts/instructions that an agent can "load" to perform a specific complex task.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Presence of 1 `agents.md` and 3 `skill.md` files in the specified structure.
- **SC-002**: `agents.md` contains at least 3 distinct role definitions.
- **SC-003**: Each `skill.md` contains clear "Context", "Instructions", and "Validation" sections (standard Skill format).

## Assumptions

- The project uses `west` for building (standard Zephyr).
- The project has or can install standard C analysis tools.
- The user (Architect) wants the tone of these files to be cynical/strict ("The Vibe" from Constitution).
