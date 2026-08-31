# Contributing to ZPLC

Contributions target `master`. Start by reading [AGENTS.md](AGENTS.md), the
[engineering constitution](.specify/memory/constitution.md),
[VERSIONING.md](VERSIONING.md), the [ZPLC 2.0 Foundation RFC](specs/010-zplc-2-0-foundation/spec.md),
and the closest active specification.

## Before opening a change

- Keep the change focused; do not add dependencies without justification.
- Add or strengthen focused tests for behavioral changes.
- Run the relevant C, TypeScript, docs, and target checks available locally.
- Update English and Spanish public documentation together.
- Describe the evidence level accurately: host, QEMU, target build, HIL, or
  manual verification.

Changes affecting outputs, persistence, runtime scheduling, Electron IPC, or
hardware operations must preserve safe/off defaults and document recovery
behavior. Do not publish a release, flash hardware, deploy a program, or
actuate equipment without explicit authorization.
