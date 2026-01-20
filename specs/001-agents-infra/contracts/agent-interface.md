# Contract: Agent Interaction

**Type**: Prompt Interface
**Status**: Draft

## User -> Agent Contract

### Invocation
User invokes an agent by explicitly referencing a role or asking a domain-specific question.

**Inputs**:
- `Role`: (Optional) "Act as FirmwareEngineer..."
- `Task`: The specific request.

**Outputs**:
- `Action`: Shell commands, File edits, or Analysis.
- `Tone`: Strict, professional, cynical (per Constitution).

### Skill Execution
Agent loads a skill when the task matches the `Context` defined in `skill.md`.

**Inputs**:
- `Skill Name`: e.g., "zephyr-build"
- `Parameters`: (Implicit) Board name, Build type.

**Outputs**:
- `Result`: Success/Failure of the underlying command.
- `Artifacts`: Build output, Analysis report, Source files.
