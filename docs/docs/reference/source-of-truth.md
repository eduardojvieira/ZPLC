---
title: Source of Truth
sidebar_label: Source of Truth
description: Honest authority map for ZPLC repository facts, compatibility, and release evidence.
---

# Source of Truth

This map identifies authority without claiming that every consumer reads files
dynamically. When sources disagree, current code, tests, contracts, and
recorded evidence outrank prose.

## Quick path

1. Find the implementation contract for the behavior you are changing.
2. Find the evidence required before making a public claim.
3. Update English and Spanish documentation together.

## Authority map

| Question | Authority | Notes |
|---|---|---|
| C runtime and HAL behavior | Public headers and implementation under `firmware/lib/zplc_core/` | Tests define currently demonstrated behavior. |
| Bytecode/ISA compatibility | `zplc_isa.h`, compiler output, and compatibility tests | Product version is not the ABI version. |
| Native desktop session contract | `packages/zplc-ide/src/runtime/` and spec 009 | Capabilities define supported versus degraded behavior. |
| Current project schema and migration | `packages/zplc-ide/zplc.schema.json` and its current migrator | Current format authority; do not infer automatic consumer updates. |
| Board profile data | `firmware/app/boards/supported-boards.v1.5.0.json` | Entry presence is not HIL qualification. |
| Board/release qualification | `specs/008-release-foundation/artifacts/` | Evidence level controls the public claim. |
| Versioning policy | `VERSIONING.md` | Product, schema, ABI, and protocol are separate axes. |
| Public documentation parity | `docs/docs/` and `docs/i18n/es/` | Both sources must be updated together. |
| ZPLC 2.0 execution | `specs/010-zplc-2-0-foundation/spec.md` | Approved RFC, not a release claim. |

## Evidence levels

| Level | What it demonstrates | What it does not demonstrate |
|---|---|---|
| Host | Local code and runtime behavior | Physical timing or electrical behavior |
| QEMU | Configured emulated target behavior | Board peripherals or wiring |
| Target build | A named profile builds | A device boots or controls equipment |
| HIL | Recorded behavior on identified hardware | Certification or every operating condition |
| Manual | Human-observed procedure | Reproducible automation unless artifacts are retained |

## Update rule

Change the authoritative implementation or record first, then update the
documentation that describes it. Do not claim automatic IDE, compiler, or docs
consumption unless a test or implementation proves that relationship.
