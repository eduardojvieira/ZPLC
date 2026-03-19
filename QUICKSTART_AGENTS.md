# Quickstart: AI Agents for ZPLC

This guide explains how to use the AI agents and skills defined in this repository.

## 1. Role Personas
We have defined four primary personas in `AGENTS.md`:
- **FirmwareEngineer**: C99, HAL discipline, Zephyr RTOS, memory safety, determinism.
- **IDE_Craftsman**: TypeScript/React/Electron work with strict typing and UI performance.
- **QA_Industrial**: Verification, CI/CD, coverage, HIL readiness.
- **ArchitectureKeeper**: Cross-cutting review authority for HAL, ISA, and constitutional compliance.

**Usage**: At the start of your session, tell the agent:
> "Read `AGENTS.md` and adopt the `FirmwareEngineer` role."

## 2. Skills
Repository-specific skills live under `.agents/skills/`. Each skill provides focused
instructions for a domain or workflow.

Useful examples in this repo:

- **Embedded work**: `.agents/skills/embedded-systems/SKILL.md`
- **ARM Cortex specifics**: `.agents/skills/arm-cortex-expert/SKILL.md`
- **Electron app work**: `.agents/skills/electron-pro/SKILL.md`
- **React Flow editors**: `.agents/skills/react-flow/SKILL.md`
- **JavaScript/TypeScript testing**: `.agents/skills/javascript-testing-patterns/SKILL.md`

Always pair skill guidance with the constitution and the current spec/plan.

## 3. Workflow for Agents
1. **Load Persona**: Read `AGENTS.md` and adopt the role that matches the task.
2. **Read the Constitution**: Enforce `.specify/memory/constitution.md` before touching code.
3. **Open the Active Spec/Plan**: For non-trivial work, use the active files under `.specify/` or `specs/`.
4. **Consult Skills**: Read the relevant `.agents/skills/*/SKILL.md` file before specialized work.
5. **Verify Rigorously**: Use test-first workflow, warnings-as-errors, cross-builds, and HIL when the change touches firmware/runtime behavior.
