---
title: Source of Truth
sidebar_label: Source of Truth
description: Which file or record is the authority for each kind of ZPLC fact, and the order to change them in.
---

# Source of Truth

Use this page to find the one place a fact is decided before you change it or write about it. When two sources disagree, current code, tests, contracts and recorded evidence outrank prose. The map does not claim that every consumer reads its authority automatically: a page says a tool consumes a source only when a test or the implementation proves it.

## Authority map

| Question                                      | Authority                                                                                      | Notes                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| C runtime and HAL behaviour                   | Public headers and implementation under `firmware/lib/zplc_core/`                              | Tests define the behaviour shown so far.                                             |
| Bytecode format, opcodes and error codes      | `tools/contract/contract.json`                                                                 | The C headers, TypeScript tables and reference tables are generated from it.         |
| Bytecode compatibility                        | `zplc_isa.h`, the compiler output and the compatibility tests                                   | The product version is not the ABI version.                                          |
| Native simulation session                     | `packages/zplc-ide/src/runtime/` and `specs/009-native-runtime-sim/`                            | Capabilities say what is supported and what is degraded.                             |
| Project file schema and migration             | `packages/zplc-ide/zplc.schema.json` and its migrator                                           | The current format; consumers do not update themselves.                              |
| Standard functions and function blocks        | The compiler registry in `packages/zplc-compiler/src/compiler/stdlib/`                         | [Functions](./functions.md) and [function blocks](./function-blocks.md) are generated from it. |
| What each language element does               | The conformance cases and `tools/docs/language-capabilities.json`                              | A cell says "works" only for a journey or case that ran.                             |
| Board profiles                                | `firmware/app/boards/boards.json`                                                              | Being in the manifest is not hardware qualification.                                 |
| Board support level                           | The evidence records the manifest references, under `specs/008-release-foundation/artifacts/` | The level is derived, never set by hand; see [Hardware support](./capabilities-evidence.md). |
| Lessons and the course                        | `packages/zplc-ide/lessons/*/lesson.json` and `course.json`                                     | The lesson index is generated from them; CI refuses a hand-written list of ids.      |
| What a page may claim                         | `docs/capability-claims.json` and the checks in `tools/docs/`                                  | A false count, name or capability fails `bun run check:docs`.                        |
| Versioning policy                             | `VERSIONING.md`                                                                                | Product, schema, ABI and protocol are separate axes.                                 |
| Engineering rules                             | `.specify/memory/constitution.md` and `AGENTS.md`                                              | See the [engineering principles](../contributing/principles.md).                     |
| What ZPLC 2.0 must satisfy                    | `specs/011-zplc-2-0-remediation/spec.md`                                                       | The requirements the release gates read.                                             |
| Documentation parity                          | `docs/docs/` and `docs/i18n/es/`                                                               | Both languages change in the same pull request.                                      |

## Evidence levels

A claim of support names the strongest evidence recorded for it: host, native simulation, emulated target, `cross-build`, `community-reported` or `human-hil`. The levels, what each one establishes and what it does not are defined once, in [Hardware support](./capabilities-evidence.md#the-levels).

## Order of change

The authoritative implementation or record changes first. The documentation that describes it follows, in English and Spanish together, and a generated page is regenerated, never edited.
