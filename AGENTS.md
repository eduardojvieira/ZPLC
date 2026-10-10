# AI assistant entry point

This file is for AI assistants, agents and automated tools that work in the ZPLC
repository. People should start with [CONTRIBUTING.md](CONTRIBUTING.md): it has
the set-up and test commands, the pull-request rules and the roadmap. This file
adds only what an automated contributor must also respect.

## Purpose

ZPLC (Zephyr PLC) is a portable IEC 61131-3 runtime and development environment
for industrial automation. Timing, determinism, board support and safety claims
are evidence-gated; source presence alone is not a product qualification.

## Guidelines

1. **Read first**: [CONTRIBUTING.md](CONTRIBUTING.md) for commands and process,
   [ARCHITECTURE.md](ARCHITECTURE.md) for the map of the repository, and the
   closest page under `docs/docs/` for the area you change.
2. **Follow the constitution**: `.specify/memory/constitution.md` is normative.
   The same rules in plain language are in
   [docs/docs/contributing/principles.md](docs/docs/contributing/principles.md).
3. **Respect the layers**: the core VM (`firmware/lib/zplc_core/src/core/`) calls
   only the HAL (`zplc_hal.h`); never reach hardware around it. The `.zplc`
   contract is defined in `tools/contract/contract.json` and generated from
   there; do not edit generated regions by hand.
4. **Test first, at the cheapest level that proves the behaviour**. A test
   asserts behaviour (a compiled program, a loaded VM, a rendered screen), not
   source text. Run the layer's command from CONTRIBUTING.md before you report a
   result, and report the command and what it printed.
5. **Documentation in two languages**: a user-visible change updates
   `docs/docs/` and `docs/i18n/es/` together, and says which evidence level
   backs each claim (host, QEMU, target build, bench or manual).
6. **No new dependency** (npm or bun packages, Zephyr modules) without a
   concrete need and a recorded decision.
7. **Style**: follow the surrounding code. C is ANSI C99 and builds with
   `-Wall -Wextra -Werror -pedantic`; TypeScript passes `bun run lint:ide` (with
   the type-aware promise rules) and `bun run typecheck` (strict `tsc` over every
   program: sources, tests, scripts and CI tooling). A warning is a failure.
8. **Physical operations**: building firmware, flashing, deploying a program,
   forcing I/O, RUN/STOP, raw serial and shell access are separate operations
   that a person starts. An AI assistant or MCP never initiates them.

## Layout

| Path | Contents |
|---|---|
| `firmware/lib/zplc_core/` | The VM, loader and HAL implementations (C99) |
| `firmware/app/` | The Zephyr application and board overlays |
| `firmware/apps/posix_host/` | The native runtime that Studio uses as its simulator |
| `packages/zplc-compiler/` | Structured Text compiler and assembler |
| `packages/zplc-ide/` | ZPLC Studio (Electron), the CLI, the MCP server and the example projects in `projects/` |
| `packages/zplc-hil/`, `tools/hil/` | Hardware-in-the-loop tools; they need a bench |
| `tools/contract/` | The generated binary contract |
| `tools/firmware-test/` | The firmware test method on Linux |
| `conformance/` | Language conformance programs with expected results |
| `examples/` | VM assembly fixtures used by the C tests; the PLC example projects are in `packages/zplc-ide/projects/` |
| `docs/` | The documentation site, English and Spanish |
| `specs/` | Specifications, release records and approved RFCs |
| `.specify/` | The engineering constitution |

## Roles

Pick the role that matches the task and keep to its concerns.

- **FirmwareEngineer**: the C core, the HAL and the Zephyr application. Memory
  safety and determinism first.
- **IDE_Craftsman**: Studio and the compiler in TypeScript. Strict types, the
  narrow IPC surface, and what a user sees.
- **QA_Industrial**: tests, CI and hardware validation. Evidence levels stated
  exactly.
- **ArchitectureKeeper**: layer boundaries, the binary contract and review of
  structural decisions.

## Project skills

- **PLC programming**: read `.agents/skills/zplc-plc-programmer/SKILL.md`
  before you inspect, edit, compile or test a ZPLC PLC project.

## Current stack

ANSI C99 core; TypeScript 5.9, React 19 and Electron 43 for Studio; Bun 1.3 as
package manager and test runner; Zephyr 4.4 pinned by `west.yml` with SDK 1.0.1;
Docusaurus 3 for the site. `CHANGELOG.md` records what changed and when.
