# Quickstart: AI agents for ZPLC

This page is the short version of [AGENTS.md](AGENTS.md), which has the rules.
People start from [CONTRIBUTING.md](CONTRIBUTING.md).

## 1. Pick a role

`AGENTS.md` defines four roles. At the start of a session, say which one you take:

- **FirmwareEngineer**: the C core, the HAL and the Zephyr application. Memory safety and determinism.
- **IDE_Craftsman**: Studio and the compiler in TypeScript. Strict types, the narrow IPC surface.
- **QA_Industrial**: tests, CI and hardware validation, with the evidence level stated exactly.
- **ArchitectureKeeper**: layer boundaries, the binary contract and structural review.

## 2. Load the project skill

The repository carries one skill, for work on PLC projects:

- **PLC programming**: `.agents/skills/zplc-plc-programmer/SKILL.md`, with its
  references under `.agents/skills/zplc-plc-programmer/references/`. Read it
  before you inspect, edit, compile or test a ZPLC project.

## 3. Work in this order

1. Read the constitution, `.specify/memory/constitution.md`, or its plain-language
   form in [Engineering principles](docs/docs/contributing/principles.md).
2. Read the page of `docs/docs/` closest to the area you change.
3. Write the test that fails for the right reason, then the change.
4. Run the command of each layer you touched; the table is in
   [CONTRIBUTING.md](CONTRIBUTING.md#test-layer-by-layer). Report the command and
   what it printed.
5. Update the English and Spanish documentation together, and run
   `bun run check:docs`.

## 4. What you never do

Build firmware, flash a board, deploy a program, force I/O, start or stop a
program, open a serial port or run a shell on a device. A person does those, and
a person makes every hardware record.
