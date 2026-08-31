# Development Roadmap

ZPLC 2.0 is the active, approved implementation RFC. It is gate-driven and
does not carry a public delivery date. This page is historical context, not a
release claim.

## Current direction

ZPLC 2.0 incrementally rewrites Studio and orchestration around the existing
C99 core/HAL, ISA, compiler, POSIX and Zephyr runtimes, native protocol, and
editors. The first public-quality path is: program → compile → test → simulate
→ evidence → human hardware workflow.

| Gate | Focus |
|---|---|
| G0 | Truth, governance, reproducibility, and accurate claims |
| G1 | Runtime verifier, scheduler semantics, safe state, and persistence |
| G2 | Project model, canonical compiler, Tool API, CLI, and Slice 0 |
| G3 | Studio Preview with an accessible engineering workbench |
| G4 | Human hardware workflow for two evidence-qualified boards |
| G5 | Isolated AI edits, local MCP, and deterministic Lab scenarios |
| G6 | Learning, language reliability, localization, and recovery |
| G7 | Signed, reproducible, evidence-backed GA release |

Read the complete [ZPLC 2.0 Foundation RFC](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md)
for acceptance criteria and exclusions.

## Historical note

Earlier roadmap entries described broad product ambitions such as cloud,
marketplace, general OTA, and an HMI designer. They are not 2.0 commitments.
The active RFC intentionally excludes them until the common trust and evidence
boundaries are proven.
