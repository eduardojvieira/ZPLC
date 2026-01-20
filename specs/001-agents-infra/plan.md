# Implementation Plan: AI Agents Infrastructure

**Branch**: `001-agents-infra` | **Date**: 2026-01-20 | **Spec**: [specs/001-agents-infra/spec.md](spec.md)
**Input**: Feature specification from `/specs/001-agents-infra/spec.md`

## Summary

Implement `agents.md` and a modular `skills/` architecture to standardize AI agent behavior in the ZPLC repository. This ensures all agents act with an "Industrial/Embedded" mindset, use approved build commands (`west build`), and enforce code quality (`cppcheck`) without human micromanagement.

## Technical Context

**Language/Version**: Markdown (Prompt Engineering), Bash (Skills)
**Primary Dependencies**: `west` (Zephyr Build System), `cppcheck` (Analysis), `git`
**Storage**: File-based (`agents.md`, `skills/*.md`)
**Testing**: Manual verification of agent behavior, independent execution of skill commands
**Target Platform**: Development Environment (Linux/macOS/Windows via WSL)
**Project Type**: Infrastructure / Documentation
**Performance Goals**: N/A (Agent latency depends on LLM)
**Constraints**: Must work with existing Zephyr project structure without modifying firmware source code directly (except via scaffolding skill).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Spec First**: Spec `001-agents-infra` created and validated.
- [x] **Context Hygiene**: Skills explicitly define what files/context to load.
- [x] **Essentialism**: Only adding 3 critical skills (`zephyr-build`, `code-analysis`, `zplc-module`), no fluff.
- [x] **Industrial Quality**: Skills enforce `--pristine` builds and strict static analysis.
- [x] **Direct Communication**: `agents.md` explicitly demands "Cynical/Competent" persona.

## Project Structure

### Documentation (this feature)

```text
specs/001-agents-infra/
├── plan.md              # This file
├── research.md          # Research on Zephyr build flags & Analysis tools
├── data-model.md        # Structure of agents.md and skill.md files
├── quickstart.md        # Guide for using the new agents
├── contracts/
│   └── agent-interface.md # Definition of User<->Agent interactions
└── tasks.md             # Implementation tasks
```

### Source Code (repository root)

```text
ZPLC/
├── agents.md                 # NEW: Role definitions
└── skills/                   # NEW: Skills directory
    ├── zephyr-build/
    │   └── skill.md
    ├── code-analysis/
    │   └── skill.md
    └── zplc-module/
        └── skill.md
```

**Structure Decision**: A flat `skills/` directory at the root allows easy discovery by agents (via `ls -R skills` or similar globbing). `agents.md` in root is the standard convention for current agentic tools.

## Complexity Tracking

No constitution violations. This infrastructure *enforces* the constitution.
