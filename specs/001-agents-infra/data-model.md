# Data Model: Agents & Skills

## File Structures

### 1. `agents.md` (Root)

**Purpose**: Defines the "System Prompt" context for different roles.

**Structure**:
```markdown
# Agent Roles

## Role: [Name]
**Description**: [One-line summary]
**Expertise**: [List of skills/domains]
**Rules**:
- [Rule 1]
- [Rule 2]
```

### 2. `skills/[name]/skill.md`

**Purpose**: Modular capability definition.

**Structure**:
```markdown
# Skill: [Name]

## Context
[When to use this skill]

## Instructions
[Step-by-step logic for the agent]

## Commands
[Specific CLI commands to execute]

## Validation
[How to verify success]
```
