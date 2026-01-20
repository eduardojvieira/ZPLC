# Quickstart: AI Agents for ZPLC

This guide explains how to use the AI agents and skills defined in this repository.

## 1. Role Personas
We have defined three specific roles in `agents.md`:
- **FirmwareEngineer**: For C99 and Zephyr RTOS development.
- **QA_Industrial**: For testing and quality compliance.
- **ArchitectureKeeper**: For high-level design and ISA consistency.

**Usage**: At the start of your session, tell the agent:
> "Read agents.md and adopt the FirmwareEngineer role."

## 2. Skills
Skills are located in the `skills/` directory. Each skill provides specific instructions and command templates.

### Zephyr Build (`skills/zephyr-build/skill.md`)
Standardized way to build the firmware for various targets.
- **Target boards**: `mps2/an385` (QEMU), `rpi_pico`.
- **Command**: `west build -b <board> firmware/app --pristine`

### Code Analysis (`skills/code-analysis/skill.md`)
Static analysis using `cppcheck`.
- Enforces strict C99 and industrial safety rules.
- **Policy**: Zero warnings allowed.

### ZPLC Module Scaffolding (`skills/zplc-module/skill.md`)
Generates boilerplate for new PLC modules.
- Enforces NO dynamic memory allocation.
- Enforces HAL abstraction.

## 3. Workflow for Agents
1. **Load Persona**: Read `agents.md`.
2. **Consult Skills**: When performing a build or analysis, read the relevant `skill.md` file.
3. **Follow Constitution**: Always adhere to the core principles in `.specify/memory/constitution.md`.
