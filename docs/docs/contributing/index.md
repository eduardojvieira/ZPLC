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

Run every command from the repository root. The times were measured on
2026-10-10 on a Linux x86-64 desktop with warm caches while other jobs were
running, so read them as an order of magnitude.

| Layer | Command | Typical time | What a pass shows |
|---|---|---|---|
| Set-up | `bun run setup` | about 10 s | Dependencies installed, compiler built, native runtime built |
| C core and host runtime | `bun run test:core` | about 1 min, the first run included | The C suites pass under the address and undefined-behaviour sanitizers |
| Compiler | `bun run test:compiler:ci` | about 6 s | Compiler and assembler tests pass, and every failure is a listed one |
| Application, CLI, conformance | `bun run test:ide:ci` | about 1 min | The suites of the application and the conformance cases behave as listed |
| Lint and types | `bun run lint`, `bun run typecheck` and `bun run build:ide` | about 35 s, 20 to 40 s and 15 s | ESLint is clean, including the rules that reject an unhandled promise; every TypeScript program, tests and scripts included, type-checks; and the application builds |
| Application structure | `bun run lint:ide` (the rules run after ESLint), or `bun tools/ci/ide-structure.ts` | under 1 s | No store module imports a component, no command-line module imports from `electron/`, no static import cycle exists, and no hand-written module has more than 800 lines, except those on `tools/ci/module-size-offenders.json`; both that list and the one import it allows (`tools/ci/layering-exceptions.json`) can only shrink |
| C static analysis | `bun run lint:c` | about 15 s | `clang-tidy` with `.clang-tidy`, every finding an error, is clean on the core, the POSIX HAL and the host application; the Zephyr HAL and `firmware/app` are analysed too when a board build exists |
| Test sources | `bun run check:test-sources` | under 1 s | No test reads the text of product source or matches the assembly the compiler emitted, except the files listed for replacement in `tools/ci/pinned-source-offenders.json` |
| Binary contract | `bun run contract:check` | about 1 s | Generated files match `contract.json` |
| Simulation | `bun run simulate packages/zplc-ide/projects/motor_plant` | under 1 s | The project's scenario tests pass on the native runtime |
| Application journeys | `bun run test:journeys` | 70 to 90 s | The real application passes its end-to-end journeys (needs a display) |
| Firmware on Linux | `bun run setup:firmware`, then `bun run test:firmware` | about 6 min once, then about 4 min | Zephyr suites pass on `native_sim`, QEMU and the size budgets |
| Documentation | `bun run check:docs` | about 15 s warm, 1 min cold | References are fresh, every name a page mentions exists, no sentence claims a capability that nothing executed backs, pages are complete, English and Spanish pages match in structure, every sample and configuration fragment marked as such builds and gives the result its fence states, every image is a captured one, and the site builds |
| Release rehearsal | `bun run release:rehearsal` | about 5 s | The checks the release workflow runs before it builds anything |
| Brand assets | `bun tools/ci/brand/generate-icons.ts --check` | under 1 s | Every icon and the social card were generated from the one mark, `tools/brand/mark.svg`; regenerate them without `--check` (needs `rsvg-convert` and Python with Pillow) |
| Release output checks | `bun test ./tools/ci` | about 5 s | The installer names and containers, the launch records, the run outcome and the cask and AUR package renderers behave as their fixtures say; the workflow that runs them on produced files has not run in CI yet |

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
| Hardware tests | A person starts every command that drives a board, at an interactive terminal, and a record says which image it tested. See [Hardware in the Loop](../development/hardware-in-the-loop.md). |

Do not publish, flash hardware, deploy a PLC program, or actuate equipment
without explicit authorization.

## Adding a lesson

A lesson is a data package, so adding one needs no change to application code (LRN-027). Lesson ids
have one source, the manifests: the ZPLC application, the progress store and the MCP course resource read an index
generated from them, and CI fails on a hand-written list of ids (LRN-028).

1. Make the exercise as two example projects under `packages/zplc-ide/projects/`: a starter that
   builds and fails the scenario, and a solution that passes it.
2. Create `packages/zplc-ide/lessons/<id>/` with the files below.
3. Run the generator, then the lesson CI.

| File | What it holds |
|---|---|
| `lesson.json` | The manifest: id, version, module, level, prerequisites, languages, tracks, plant, estimated minutes, the starter and solution projects, and the reference scenario with its content hash. |
| `scenario.json` | The reference scenario the lesson is graded by. Keep a copy in the starter's `tests/` folder so that the learner can run it from Tests; CI fails when the copy differs. |
| `text.en.json`, `text.es.json` | The text: title, summary, scope, objectives, the six stages (`objective`, `predict`, `edit`, `run`, `observe`, `reflect`), two hint levels and the fault to fix. Both files must have the same structure. |
| `checks.json` | Optional: wrong programs that must stay red, and other correct programs that must pass. |

The text marks every time and value it quotes, so that CI can check it against the scenario. The
generator expands the markup once; no lesson string is replaced when the application runs (LRN-038).

| Markup | Shows | CI checks |
|---|---|---|
| `{{t:250}}` | `250` | The time is on the timeline of the scenario: a multiple of its tick and at most its duration. |
| `{{assertions}}` | The number of assertions | Nothing to check: the number comes from the scenario. |
| `{{v:Sig=true@30\|text}}` | `text` | The scenario asserts those values at 30 ms: an `AT` there, or a `FOR` or `ALWAYS` that covers it. |

```bash
bun tools/ci/generate-lesson-index.ts                  # writes packages/zplc-ide/src/generated/lessonIndex.ts
bun tools/ci/generate-lesson-index.ts --update-hashes  # after editing a scenario: pin its hash, raise the version
bun tools/ci/generate-lesson-index.ts --check          # what CI runs: the file is what the packages produce
bun run --cwd packages/zplc-ide test src/learn         # lesson CI; set ZPLC_NATIVE_SIM_BIN for the runtime proofs
```

The lesson CI runs every package in both languages: the starter fails the reference scenario because
an assertion fails, the solution passes it, each wrong program stays red, every time and value the
text quotes exists in the scenario, and every file it cites exists in the starter (LRN-025).

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

## Configuration fragments, scenarios and images

A page that shows a piece of `zplc.json`, a scenario or a picture of the application is
checked the same way, by what the fence says:

| Fence | What the check does |
|---|---|
| `json zplc-fragment` | The keys are merged into a minimal project for the host simulator, checked against `packages/zplc-ide/zplc.schema.json` (a key that the schema does not name is an error) and built. A fragment with `board=<ide id>` is merged into a project for that board, and every address of `io.inputs` and `io.outputs` must be a channel of the board unless it is listed under `io.virtual`. |
| `json zplc-scenario` | The scenario is written to the `tests` folder of a project whose program is the first `runnable` Structured Text sample of the same page, and every expectation must pass on the native runtime. |
| `json zplc-board` | The entry is checked by the validator of the board manifest (`firmware/zephyr/scripts/zplc_boards.py`) together with the manifest of this repository: a missing key, a wrong address, a channel that the rules refuse or a name that another board already has is an error. |
| `![alt](/img/...)` | The image must be listed in `docs/static/img/manifest.json`, which `bun run docs:screenshots` writes with the commit the application was built from: a page shows no picture that automation did not capture. |

The English page and its Spanish twin show the same fragments and scenarios. The checks
are `bun run check:docs-config` and `bun tools/docs/capture-screenshots.ts --check`.

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
| Native simulation | `program.load` fails with the sentence above and the loaded program keeps running. The ZPLC application says it before sending anything. The runtime reports its counter in `session.hello` (`draft_counter`). |
| Firmware upload | `zplc load` and `zplc sched load` answer `ERROR: Program was built for contract draft N, this runtime is draft M (-17)`. `zplc sys info --json` reports `draft_counter`. |
| Hardware deploy from the ZPLC application | The preflight compares the artifact with the `draft_counter` of the connected board and refuses before anything is sent. |
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
