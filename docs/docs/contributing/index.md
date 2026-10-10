---
slug: /contributing
id: index
title: Contributing
sidebar_label: Contributing
description: How to contribute to ZPLC with clear safety and evidence boundaries.
tags: [contributing, open-source]
---

# Contributing

Contributions target `master` and must leave the repository more trustworthy
than they found it.

## Quick path

1. Read [AGENTS.md](https://github.com/eduardojvieira/ZPLC/blob/master/AGENTS.md), the [engineering constitution](https://github.com/eduardojvieira/ZPLC/blob/master/.specify/memory/constitution.md), [VERSIONING.md](https://github.com/eduardojvieira/ZPLC/blob/master/VERSIONING.md), and the [ZPLC 2.0 Foundation RFC](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md).
2. Find the closest active spec and keep the work unit focused.
3. Add or strengthen focused tests for behavioral changes, then run the checks
   appropriate to the changed layer.
4. Update English and Spanish public docs together when a user-visible claim,
   workflow, or limitation changes.

## Contribution rules

| Area | Required practice |
|---|---|
| Runtime and hardware | Preserve C99/HAL boundaries, safe/off failure behavior, and recovery semantics. |
| Trust boundaries | Validate bytecode, IPC, paths, and external input before mutation. |
| Electron | Keep the renderer unprivileged and IPC narrow and validated. |
| Evidence | Label host, QEMU, target build, HIL, and manual results accurately. |
| Dependencies | Add one only with a concrete need and architectural justification. |
| Physical operations | Keep build, flash, deploy, and run/debug separate; do not automate physical control through AI or MCP. |

Do not publish, flash hardware, deploy a PLC program, or actuate equipment
without explicit authorization. See [CONTRIBUTING.md](https://github.com/eduardojvieira/ZPLC/blob/master/CONTRIBUTING.md)
for the repository-level checklist.

## Changing the binary contract

The opcodes, the container layout, the sizes, the error codes and the
identifiers of the `.zplc` format are defined once, in
`tools/contract/contract.json`. The C headers, the TypeScript tables, the Python
tools and the [reference tables](/reference/runtime-api) are generated from it,
and CI fails when a generated file is stale.

### Draft contract counter

Until the contract is frozen, every change to it increments a **draft counter**
(`abi.draftCounter`). The compiler and the assembler write it in header word 28
of every artifact (the field that used to be reserved), under the CRC, and each
runtime and firmware image reports its own. A different number is refused, and
the refusal shows both:

> Program was built for contract draft 2, this runtime is draft 3

| Where | What happens on a mismatch |
|---|---|
| Loader (`zplc_loader_verify`) | Returns `ZPLC_LOADER_ERR_DRAFT` (`-17`). The counter is read before the version, the flags and the CRC, because another draft may lay the rest out differently. `zplc_loader_artifact_draft_counter` reads it without trusting anything else. |
| Native simulation | `program.load` fails with the sentence above and the loaded program keeps running. Studio says it before sending anything. The runtime reports its counter in `session.hello` (`draft_counter`). |
| Firmware upload | `zplc load` and `zplc sched load` answer `ERROR: Program was built for contract draft N, this runtime is draft M (-17)`. `zplc sys info --json` reports `draft_counter`. |
| Studio hardware deploy | The preflight compares the artifact with the `draft_counter` of the connected board and refuses before anything is sent. |
| CLI | `zplc-cli compile` states the counter of what it built. |

An artifact built before the counter carries 0, and a firmware image that does
not report one has none: both are refused, and the sentence says `none`. After
an update that changes the counter, rebuild the programs and reflash the boards.
A program that a board saved under another draft is rejected at boot and the
runtime stays latched safe until a verified replacement is uploaded.
The counter is not the product version: the one final version integer is
assigned and frozen when the conformance matrix is closed.

### To change the contract

1. Edit `tools/contract/contract.json` and increase `abi.draftCounter` by one.
2. Run `python3 tools/contract/generate.py --record-draft "why it changed"`.
   It writes every generated file and appends the counter, the fingerprint of
   the contract and the reason to `tools/contract/golden/draft-ledger.json`.
3. Move the changed numbers in `tools/contract/golden/contract.golden.json`
   (`python3 tools/contract/test_contract.py` names each one), rebuild the
   artifacts committed to the repository (`examples/*.zplc`, the `.hex`
   fixtures) and fix any test that builds a header by hand.
4. Run `bun run contract:check` and state the reason in the commit message.

`generate.py --check` fails when the contract no longer matches the fingerprint
recorded for its own counter, so a change cannot be committed under the old
number. Prose (`doc` strings, group titles) is not part of the fingerprint. Never
edit or remove a ledger entry that was committed.
