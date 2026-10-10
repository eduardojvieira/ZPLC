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
than they found it. The repository guide, with copy-and-paste commands for every
layer, is [CONTRIBUTING.md](https://github.com/eduardojvieira/ZPLC/blob/master/CONTRIBUTING.md).
This page is its short form for readers of the site.

## Quick path

1. Read the [engineering principles](./principles.md) and
   [VERSIONING.md](https://github.com/eduardojvieira/ZPLC/blob/master/VERSIONING.md).
2. Run `bun run setup` once, then the check of the layer you change (next
   section).
3. Add or strengthen a focused test for a behaviour change, and run the checks of
   the layer before you open the pull request.
4. Update the English and Spanish public docs together when a user-visible claim,
   workflow or limitation changes.
5. Open the pull request with its template: the checks you ran and the evidence
   level that backs each claim.

## Checks by layer

Run every command from the repository root. The times were measured on a
12-thread Linux x86-64 desktop with warm caches.

| Layer | Command | Typical time | What a pass shows |
|---|---|---|---|
| Set-up | `bun run setup` | about 10 s | Dependencies installed, compiler built, native runtime built |
| C core and host runtime | `bun run test:core` | about 5 s | The C suites pass under the address and undefined-behaviour sanitizers |
| Compiler | `bun run test:compiler:ci` | about 2 s | Compiler and assembler tests pass, and every failure is a listed one |
| Studio, CLI, conformance | `bun run test:ide:ci` | 30 to 60 s | The Studio suites and the conformance cases behave as listed |
| Lint and types | `bun run lint`, `bun run typecheck` and `bun run build:ide` | about 10 s, 20 s and 40 s | ESLint is clean, including the rules that reject an unhandled promise; every TypeScript program, tests and scripts included, type-checks; and the Studio builds |
| Studio structure | `bun run lint:ide` (the rules run after ESLint), or `bun tools/ci/ide-structure.ts` | under 1 s | No store module imports a component, no command-line module imports from `electron/`, no static import cycle exists, and no hand-written module has more than 800 lines, except those on `tools/ci/module-size-offenders.json`, which can only shrink |
| C static analysis | `bun run lint:c` | about 15 s | `clang-tidy` with `.clang-tidy`, every finding an error, is clean on the core, the POSIX HAL and the host application; the Zephyr HAL and `firmware/app` are analysed too when a board build exists |
| Test sources | `bun run check:test-sources` | under 1 s | No test reads the text of product source or matches the assembly the compiler emitted, except the files listed for replacement in `tools/ci/pinned-source-offenders.json` |
| Binary contract | `bun run contract:check` | about 1 s | Generated files match `contract.json` |
| Simulation | `bun run simulate packages/zplc-ide/projects/motor_plant` | under 1 s | The project's scenario tests pass on the native runtime |
| Studio journeys | `bun run test:journeys` | 70 to 90 s | The real application passes its end-to-end journeys (needs a display) |
| Firmware on Linux | `bun run setup:firmware`, then `bun run test:firmware` | about 6 min once, then about 4 min | Zephyr suites pass on `native_sim`, QEMU and the size budgets |
| Documentation | `bun run check:docs` | about 50 s | References are fresh, pages are complete, English and Spanish pages match in structure, every sample marked runnable compiles and gives the result its fence states, and the site builds |
| Release rehearsal | `bun run release:rehearsal` | about 10 s | The checks the release workflow runs before it builds anything |

A pass at one level never proves a higher one: a host test says nothing about a
board. [Firmware testing](../development/firmware-testing.md) explains what each
firmware mode shows and what it does not.

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
without explicit authorization.

## Runnable documentation samples

A code sample in the docs is checked in CI when its fence says so. The first word of the
fence names the language; the words after it say what to check:

````text
```st runnable
PROGRAM Counting
VAR
    Count : INT;
END_VAR
Count := Count + 1;
END_PROGRAM
```

```st runnable expect="Count=3" scans=3 scan_ms=10
PROGRAM Counting
VAR
    Count : INT;
END_VAR
Count := Count + 1;
END_PROGRAM
```
````

| Word | Meaning |
|---|---|
| `runnable` | The sample is compiled with the repository compiler. A sample that does not compile fails `bun run check:docs`: fix the sample, or remove the word. |
| `expect="Name=Value ..."` | The sample is also run on the native runtime, and every named value is compared after the last scan. `Name` is a variable of the program or a direct address such as `%QX0.0` or `%QW0` (`Name:TYPE` sets the type of an address); `Value` is `TRUE`, `FALSE` or a number. The page must say the result in words next to the sample. |
| `scans=N`, `scan_ms=N` | How many scans to run (default 1) and the period of each in milliseconds (default 10). Only with `expect`. |
| `fragment` | The block is a bare body (variables and statements): it is wrapped in `PROGRAM DocSample ... END_PROGRAM` before it is compiled. |
| `language=il` | The sample is Instruction List, written in an `iecst` fence. |

The English page and its Spanish twin mark the same samples the same way, with the same
result. The sample is written in code and so it is the same in both languages. The check
is `bun run check:docs-samples`; it needs `bun run build:compiler` and, for a sample with
`expect`, `bun run build:runtime`, and it fails rather than skips when the runtime is
missing.

## Project documents

- [Roadmap](./roadmap.md): what is done, what is next and what comes later.
- [Engineering principles](./principles.md): the constitution in plain language.
- [Source of truth](../reference/source-of-truth.md): which file is the authority
  for each kind of fact.
- [Documentation manifest](../reference/v1-5-canonical-docs-manifest.md): the
  pages that must exist in English and Spanish.
- [Code of conduct](https://github.com/eduardojvieira/ZPLC/blob/master/CODE_OF_CONDUCT.md)
  and [security policy](https://github.com/eduardojvieira/ZPLC/blob/master/SECURITY.md).

## Changing the binary contract

The opcodes, the container layout, the sizes, the error codes and the
identifiers of the `.zplc` format are defined once, in
`tools/contract/contract.json`. The C headers, the TypeScript tables, the Python
tools and the [reference tables](../reference/runtime-api.md) are generated from it,
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
