# Feature Specification: ZPLC 2.0 Foundation

**Implementation branch**: `master` (short-lived work branches only)
**Created**: 2026-08-21
**Status**: Approved RFC
**Input**: Consolidated ZPLC Studio 2.0 master plan.

## Outcome

ZPLC 2.0 is an incremental rewrite of Studio and its orchestration layer. It
keeps the C99 core/HAL, ISA, compiler, POSIX and Zephyr runtimes, the 009
native protocol, and existing editors as assets; it does not preserve unsafe
or duplicate implementations merely because they exist.

The GA outcome is a controls engineer who can create or migrate a project,
program it in ST or LD, compile, test, simulate a deterministic plant, review
AI-backed evidence, and perform a human-controlled hardware workflow on two
Zephyr boards.

## Delivery model

Development stays on `master` with short-lived work branches and feature gates;
there is no long-lived `v2` branch. G0b will make one canonical product version
consumable. Until then, repository drift (`1.5.0`, `1.4.3`, `0.3.0`) is a fact,
not a release decision.

| Gate | Outcome | Exit evidence |
|---|---|---|
| G0 — Truth | Governance, reproducibility, accurate claims | Clean installation/checks and honest evidence map |
| G1 — Runtime trust | Verifier, safe state, scheduler, persistence | Invalid input cannot mutate state; recovery tests pass |
| G2 — Tool spine | Project v2, canonical compiler, CLI, test/evidence | Start/stop slice runs on controlled POSIX time |
| G3 — Studio Preview | New accessible workbench and ST path | Slice runs from Studio at 1366×768 |
| G4 — Hardware Alpha | Human build/flash/deploy flow | SHA-traceable HIL on Pico and ESP32-S3 |
| G5 — Agent/Lab Beta | Isolated AI edits, MCP, four Lab scenarios | Diff/evidence before apply; deterministic replay |
| G6 — Learn/Language RC | LD, reliable FBD/SFC, bilingual learning | Golden projects and offline course pass |
| G7 — GA | Signed release and recovery material | Clean reproducible release evidence |

The gates are dependency gates, not dates. A gate may not be skipped because a
later UI or content feature is ready.

## Architecture decisions

- Start with a typed Tool API and supervised local host. Do not create a
  permanent daemon or an explosion of packages.
- Keep product version, project schema 2, `.zplc` ABI 1.0, and native runtime
  protocol 1.x separate. ABI changes require an artifact incompatibility;
  protocol major changes require a breaking wire change.
- Use one compiler path. Treat POSIX as simulation evidence only within its
  declared capabilities. WASM remains a declared degraded fallback.
- Build firmware, flash firmware, deploy a PLC program, and run/debug are
  separate operations. Physical operations always require an explicit human
  action.
- Treat host, QEMU, target build, HIL, and manual verification as separate
  evidence levels. Claims must identify their level.

## Safety and agent boundary

Outputs default safe/off. No invalid program, reboot, watchdog failure, fault,
communication loss, or unsafe restart policy may auto-resume physical control.
The program store must validate inactive data before an atomic activation and
recover a complete prior or new program after power loss.

AI and MCP may inspect, validate, compile, test, simulate, and retrieve trace
evidence within a workspace. They must not expose shell, raw serial, secrets,
flash, deploy, force, RUN, STOP, or recovery operations. AI patches run in an
isolated changeset and require compile, test, simulation, evidence, diff, and
human acceptance.

## Planned baselines

These are RFC decisions, not current support claims:

| Area | Planned baseline |
|---|---|
| Zephyr | 4.4.2, `dccb09599635bdff17633fa7e9dab014b91dce90`, SDK 1.0.1 |
| JavaScript runtime | Bun 1.3.14 |
| Desktop host | Electron 43.4.1; 42.9.3 only as a documented compatibility fallback |
| HIL candidates | Raspberry Pi Pico RP2040 and ESP32-S3-DevKitC-1-N8R8 |
| License | MIT |

## GA boundary

GA includes ST and LD as primary authoring paths; FBD/SFC reliable open, edit,
save, copy, and undo; four deterministic Lab scenarios; and ten offline ES/EN
foundation lessons. It excludes scene editing, general physics/3D, public SDK
or marketplace, cloud collaboration, remote MCP, universal OTA, PLCopen/OPC
UA, external PLC control, and safety certification claims.

## Acceptance checklist

- [ ] A golden 1.x project migrates with a previewable diff and preserved behavior.
- [ ] Every artifact load routes through one verifier before mutation.
- [ ] Power interruption never starts a partial PLC program; outputs remain safe.
- [ ] Studio, CLI, AI, MCP, Lab, and Learn share compiler/runtime/test/evidence contracts.
- [ ] Six profiles cross-build; two exact profiles have SHA-traceable HIL evidence.
- [ ] AI and MCP cannot initiate a physical action.
- [ ] Four Lab scenarios and ten bilingual lessons run offline with deterministic grading.
- [ ] Release artifacts are reproducible, signed, documented, and evidence-backed.
