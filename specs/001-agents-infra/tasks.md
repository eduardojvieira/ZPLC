# Tasks: AI Agents Infrastructure

**Input**: Design documents from `/specs/001-agents-infra/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Tests for this feature are manual (verification of agent behavior and skill correctness). No automated code tests required for markdown infrastructure.

**Organization**: Tasks are grouped by user story (and priority) to enable independent delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the directory structure for agents and skills.

- [X] T001 Create `skills/` directory structure at repository root
- [X] T002 [P] Create subdirectories for `zephyr-build`, `code-analysis`, and `zplc-module` in `skills/`

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core definitions that all agents rely on.

- [X] T003 [P] Create `agents.md` file in repository root with `FirmwareEngineer`, `QA_Industrial`, `ArchitectureKeeper` role definitions
- [X] T004 [P] Update `AGENTS.md` (existing) to reference the new `agents.md` file and explain how to use it

**Checkpoint**: Agents can now "read `agents.md`" to adopt a persona, even if they have no skills yet.

## Phase 3: User Story 1 - Agent Role Definitions (Priority: P1)

**Goal**: Define the specific personas that enforce industrial quality.

**Independent Test**: Read `agents.md` and verify all 3 roles have strict "Rules of Engagement".

### Implementation for User Story 1

- [X] T005 [P] [US1] Define `FirmwareEngineer` role in `agents.md` (Expertise: C99, Zephyr, Memory Safety)
- [X] T006 [P] [US1] Define `QA_Industrial` role in `agents.md` (Expertise: MISRA C, Unit Tests, coverage)
- [X] T007 [P] [US1] Define `ArchitectureKeeper` role in `agents.md` (Authority: Reject dynamic allocation, enforce HAL)

**Checkpoint**: `agents.md` is complete and robust.

## Phase 4: User Story 2 - Zephyr Build Skill (Priority: P1)

**Goal**: Enable agents to correctly build ZPLC firmware using `west`.

**Independent Test**: Agent successfully generates a `west build` command for a target board using the skill.

### Implementation for User Story 2

- [X] T008 [P] [US2] Create `skills/zephyr-build/skill.md` with "Context" and "Instructions" sections
- [X] T009 [P] [US2] Add `west build` command templates (with `-b` and `--pristine`) to `skills/zephyr-build/skill.md`
- [X] T010 [US2] Add validation steps (check `build/zephyr/zephyr.elf` existence) to `skills/zephyr-build/skill.md`

**Checkpoint**: Agents can now build firmware.

## Phase 5: User Story 3 - Code Analysis Skill (Priority: P1)

**Goal**: Enable agents to self-verify code quality using static analysis.

**Independent Test**: Agent successfully generates a `cppcheck` command that fails on bad code.

### Implementation for User Story 3

- [X] T011 [P] [US3] Create `skills/code-analysis/skill.md` with "Context" and "Instructions" sections
- [X] T012 [P] [US3] Add `cppcheck` command templates (with strict flags) to `skills/code-analysis/skill.md`
- [X] T013 [US3] Add strict "Zero Warnings" policy definition to `skills/code-analysis/skill.md`

**Checkpoint**: Agents can now audit code.

## Phase 6: User Story 4 - Module Scaffolding Skill (Priority: P2)

**Goal**: Enable agents to generate compliant boilerplate for new PLC blocks.

**Independent Test**: Agent generates a `.c` and `.h` file pair that compiles and follows strict memory rules.

### Implementation for User Story 4

- [X] T014 [P] [US4] Create `skills/zplc-module/skill.md` with "Context" and "Instructions" sections
- [X] T015 [P] [US4] Add file templates for header (`.h`) and source (`.c`) to `skills/zplc-module/skill.md` enforcing `zplc_result_t` and no `malloc`
- [X] T016 [US4] Add test template (`tests/test_module.c`) to `skills/zplc-module/skill.md`

**Checkpoint**: Agents can now create new features compliantly.

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and usability improvements.

- [X] T017 [P] Create `QUICKSTART_AGENTS.md` (or update docs) explaining how to use the new skills
- [X] T018 Validate all markdown files are formatted correctly (headers, code blocks)
- [X] T019 Final review of all personas in `agents.md` against the Constitution

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1 structure.
- **User Stories (Phase 3, 4, 5)**: Depend on Phase 2 (`agents.md` existence).
  - US1 (Roles) refines the file created in Phase 2.
  - US2, US3, US4 (Skills) can be created in parallel after Phase 1, but logically belong to the agents defined in US1.
- **Polish (Phase 7)**: Depends on all stories.

### Parallel Opportunities

- T005, T006, T007 (Defining different roles) can happen in parallel.
- T008, T011, T014 (Creating skill files) can happen in parallel.
- US2 (Build), US3 (Analysis), and US4 (Scaffold) are completely independent files and can be implemented in parallel.

## Implementation Strategy

### MVP First (Agents + Build + Analysis)

1. Complete Setup & Foundational (`agents.md`).
2. Implement US1 (Detailed Roles).
3. Implement US2 (Build Skill).
4. Implement US3 (Analysis Skill).
5. **STOP**: Validate agents can build and check code.

### Incremental Delivery

1. Add US4 (Scaffolding) for developers adding new features.
2. Polish documentation.
