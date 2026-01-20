# Quickstart: AI Agents

## Prerequisites
- `agents.md` in root.
- `skills/` directory populated.

## Usage

### 1. Start a Session
Tell your AI assistant to read `agents.md` to adopt a persona.

> "Read agents.md. Act as FirmwareEngineer."

### 2. Use a Skill
Ask for a task covered by a skill.

**Build Firmware**:
> "Build the firmware for the S7 target using the zephyr-build skill."

**Analyze Code**:
> "Run static analysis on the core library using the code-analysis skill."

**Create Module**:
> "Scaffold a new PID function block using the zplc-module skill."

## Troubleshooting
- If the agent hallucinates commands, tell it to "Read the skill file at skills/[name]/skill.md first".
