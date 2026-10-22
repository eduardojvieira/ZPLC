# Feature Specification: ZPLC 2.0 Remediation

**Implementation branch**: `zplc-2.0-candidate` until it merges to `master` (decision D-12)  
**Created**: 2026-10-08  
**Status**: Draft for owner review  
**Baseline**: commit `6b73a0c`, version `2.0.0-rc.3` (it was `b379d82` before the one-time history rewrite of 2026-10-22, DOC-027; the mirror made before the rewrite keeps `b379d82` and every older SHA resolvable)  
**Builds on**: `specs/010-zplc-2-0-foundation/spec.md` (approved RFC)  
**Companion**: `research.md` in this directory (decisions with evidence)

## Contents
1. [Purpose, audience, and how to read this document](#1-purpose-audience-and-how-to-read-this-document)
2. [Verdict and root cause](#2-verdict-and-root-cause)
3. [Principles](#3-principles)
4. [Scope decisions and open decisions](#4-scope-decisions-and-open-decisions)
5. [Workstreams](#5-workstreams): [VF](#vf-verification-foundation) verification, [CMP](#cmp-compiler-and-language-core) compiler, [LNG](#lng-the-five-iec-languages-in-the-ide) languages, [RT](#rt-runtime-core-and-safety-behaviour) runtime, [IO](#io-io-mapping-boards-portability) I/O and boards, [COM](#com-communications-function-blocks-cloud-blocks-control-plane) communications, [IDE](#ide-ide-core-reliability-and-workflow-completeness) IDE core, [UX](#ux-design-system-shell-accessibility-internationalisation) design, [LRN](#lrn-learning-mode) learning, [HIL](#hil-hardware-in-the-loop-and-hardware-evidence) hardware evidence, [REL](#rel-release-distribution-cicd-firmware-binaries) release, [DOC](#doc-documentation-identity-repository-hygiene) documentation
6. [IEC 61131-3 conformance matrix for 2.0](#6-iec-61131-3-conformance-matrix-for-20)
7. [Feature preservation inventory](#7-feature-preservation-inventory)
8. [Definition of done for 2.0.0 GA](#8-definition-of-done-for-200-ga)
9. [Traceability](#9-traceability)
10. [Glossary](#10-glossary)

## 1. Purpose, audience, and how to read this document
This specification defines what must be true before ZPLC 2.0.0 is released as generally available (GA). ZPLC is an IEC 61131-3 programmable logic controller (PLC) runtime (a C99 bytecode virtual machine on Zephyr, plus a POSIX host runtime), a TypeScript compiler, and a desktop development environment, ZPLC Studio. Release candidate 3 (rc.3) was reviewed in six areas on 2026-10-08, followed by two explorations (learning mode, zero-cost distribution). This document turns that evidence into requirements.

**Audience.** The owner, who takes the open decisions in section 4. Contributors, who implement and need to know what "done" means. Controls engineers, who want to know what 2.0 will and will not do.

**Reading path.**

| If you have | Read |
|---|---|
| Ten minutes | Sections 2, 3 and 4 |
| A workstream to implement | Its part of section 5, then the rows it owns in sections 6 and 7 |
| A question such as "is feature X kept?" | Section 7 |
| A question such as "does 2.0 support language element Y?" | Section 6 |
| A review finding to follow up | Section 9 |

**Conventions.**

- Requirements use MUST, MUST NOT and SHOULD. Each has a stable ID such as `CMP-012`. An ID is never reused.
- Evidence is cited as `path:line` at commit `b379d82`. Four path prefixes are shortened: `IDE/` is `packages/zplc-ide/`, `COMPILER/` is `packages/zplc-compiler/src/`, `CORE/` is `firmware/lib/zplc_core/`, `APP/` is `firmware/app/`. Within one workstream, a file cited once with its path is afterwards cited by file name, and `:line` alone continues the file named just before it. If decision D-05 rewrites history, the baseline gets a new SHA: the mirror made before the rewrite keeps `b379d82` resolvable, the header of this spec then records the new SHA, and every `path:line` citation stays valid, because no citation names a file the rewrite removes: the schematic and the build outputs deleted in an earlier clean-up are not in the baseline tree, and the only removed files it held are three CMake cache files under `firmware/app/build_tests/`. The rewrite was made on 2026-10-22: `b379d82` is now `6b73a0c`.
- Severity labels come from the review: **Blocker** (must be fixed before a release professionals can use), **Major** (serious, has a workaround), **Minor**.
- "Executed" means the reviewer compiled a program with the repository compiler and ran it on the real C virtual machine (VM). "Inferred" means reasoned from code and not observed; the first task under the matching requirement is to confirm it.
- **Design default** marks a choice made when this spec was written, not an owner decision. It stands until the owner revises it; section 4.6 lists them.
- Evidence levels follow the constitution (`.specify/memory/constitution.md:24-26`): host, QEMU, target build, hardware-in-the-loop (HIL), manual. A lower level never proves a higher one.
- The detailed review reports are local, untracked supporting material in `specs/011-zplc-2-0-remediation/review/`. This document does not depend on them.

**Limits of the evidence.** Nobody launched the application or touched hardware during the review. No Zephyr build, flash or packaging build was run. Two manual checks are still open and are the first tasks of IDE-003 and LNG-005: opening a real folder in a packaged build, and binding a breakpoint in the running application.

**Relationship to spec 010.** Spec 010 defines the 2.0 product outcome and gates. This spec defines the remediation needed to reach GA. Where the two differ, the table says which statement holds.

| Spec 010 statement | Position of this spec |
|---|---|
| `specs/010-zplc-2-0-foundation/spec.md:10-13` keeps "the compiler" as an asset | Superseded in part. Lexer, parser, assembler and container are kept; the semantic middle is rewritten (CMP). |
| `:27-36` gates G0 to G7: G6 "Learn/Language RC" (`:35`) covers Ladder, reliable FBD and SFC, and the course, but no gate covers compiler semantics or language conformance | Added: no Studio, Lab or Learn gate closes before the conformance suite (VF-001) passes for every row of section 6. |
| `:22-25` development stays on `master` | Not true today; work is on `zplc-2.0-candidate`. D-12 decides the merge; VF-016 makes continuous integration (CI) run there meanwhile. |
| `:83-84` GA has Structured Text and Ladder as primary paths, Function Block Diagram (FBD) and Sequential Function Chart (SFC) "reliable open, edit, save, copy, and undo", Instruction List absent | Superseded by owner decision S-1: all five languages compile, simulate, debug and are monitored online (LNG). |
| `:84-85` "ten offline ES/EN foundation lessons" | Extended by owner decision S-3: the ten lessons are repaired and become part of a full course (LRN). |
| `:85-87` exclusions (scene editing, 3D, public SDK, cloud collaboration, remote MCP, universal over-the-air update, PLCopen/OPC UA, external PLC control, safety certification) | Kept. Live two-dimensional plant views and the I/O faceplate (LRN) are not scene editing. |
| `:36`, `:98` "Signed release" | Reinterpreted by owner decisions S-2 and S-5: macOS ad-hoc signed and not notarized; Windows signed by the Microsoft Store and by SignPath Foundation; no paid certificate. |
| `:36`, `:98` G7 and the acceptance list ask for "clean reproducible release evidence" and reproducible artifacts | Narrowed: bytecode and debug map reproducibility is a blocking check (CMP-053); the check that the Linux x64 application payload builds identically twice is kept but no longer blocks a release run (REL-032), because it covers one of six targets and sits on the critical path of every release run. |
| `:33`, `:95` HIL evidence on Raspberry Pi Pico and ESP32-S3 | Kept (HIL-010). The execution model is D-08. |
| `:45-47` `.zplc` ABI 1.0; an ABI change requires artifact incompatibility | Kept. This spec expects one ABI revision before GA and applies that rule (CMP-052). Until the conformance matrix is closed, a draft counter changes with every contract change and firmware and Studio refuse a mismatch; the final version is then assigned and frozen, and each prerelease before that says that programs and firmware must be rebuilt together. |
| `:48-49` one compiler path; WebAssembly (WASM) is a declared degraded fallback | Kept and made true: WASM simulation is disabled today (IDE-025). |
| `:58-67` safety and agent boundary | Kept unchanged (principles P7 and P9). |

## 2. Verdict and root cause
**Verdict.** rc.3 is not yet a tool a controls engineer can rely on, and it does not need a ground-up rewrite.

- **Keep as they are:** the C VM and its loader/verifier, the `.zplc` container, the assembler, the native runtime supervisor, the Electron hardening and narrow preload, the debug-adapter abstraction, the single Tool API behind Studio, the command-line interface (CLI) and the Model Context Protocol (MCP) server, the temporal scenario test engine, the pure `*Presentation.ts` modules, the Structured Text language service, and the framework stack (Electron, React, Vite, Tailwind, zustand, Monaco, React Flow).
- **Rewrite:** the compiler's semantic middle; the IDE view layer and shell; the communication function-block layer and the deploy/debug control protocol; the documentation.
- **Repair in place:** everything else, including the parts the review suggested removing (section 4.2).

**What is wrong, in one paragraph.** The compiler has no semantic analysis and miscompiles ordinary programs without an error: about 55 of 120 executed probes gave a wrong result, a VM fault, a host crash or a dropped statement. The runtime has one sandbox escape, no working fail-safe for a crashed processor, retentive memory that is not retained, and communication blocks that do not work. The IDE cannot build a project without a hidden manual step and can lose unsaved work. The installers are blocked, flagged or uninstallable across the three operating systems. The first documentation page ends in the middle of a sentence.

**Root cause.** The project verifies itself by reading its own text instead of executing behaviour.

| Area | What the checks read | What they missed |
|---|---|---|
| Compiler | 234 `toContain` assertions on assembly text; no test starts a VM | Negative integers, mixed REAL and INT, structs, enums, strings; one test pins a miscompilation (`COMPILER/compiler/compiler.test.ts:1893`) |
| IDE | At least 591 of 3,906 `expect(` calls assert on source files read from disk (`IDE/src/components/Console.tabNavigation.test.ts`, 209 of them) | A shared editor buffer across files, undo flooding, a resize handle with dead styles |
| Release | A 537-line validator parses workflow text (`tools/hil/validate_release_evidence.py:66-452`) | An unsigned public release, an uninstallable `.deb`, a signing path that never ran |
| Docs | Link and file-parity checks | Seven pages that end mid-sentence (`docs/docs/getting-started/index.md:47`) |
| HIL | A runner whose compile and upload steps are comments (`packages/zplc-hil/src/runner.ts:101-102`); seven test files with no test | Everything: no board has a recorded hardware run |

The result is 1,013 passing IDE tests and 276 passing compiler tests beside a product that fails in the first ten minutes of use. A second cause follows from the first: effort went into fences, evidence records and release paperwork before the open, edit, build, simulate path worked. Every workstream below therefore begins with an executed check, and the Verification foundation (VF) goes first.

## 3. Principles
Every workstream obeys these. A requirement that conflicts with a principle is a defect in this spec.

| ID | Principle | Meaning in practice |
|---|---|---|
| P1 | No silent failure | A wrong program, a failed save, a rejected command or an unsupported element produces a located message. Nothing becomes a comment, a default value or "OK". |
| P2 | Verified by execution, not by text | A behaviour is proven by running it: compile and execute, render and click, install and launch. Tests do not assert on source text, assembly text or workflow text. |
| P3 | Simulator and target share semantics | One scheduler core, one memory model, one protocol contract. A difference is a declared capability gap, never an accident. |
| P4 | Nothing descoped | No feature, function block, IEC language or HIL asset is removed in 2.0. Broken means repair. |
| P5 | Zero recurring cost | No paid certificate, subscription or hosted service is needed to build, sign, distribute, verify or teach. |
| P6 | Claims match evidence | Public text states only what a recorded run at the stated evidence level supports. |
| P7 | Physical operations are human-initiated | Flash, deploy, force, RUN/STOP, raw serial and shell are started by a person. AI and MCP cannot start them (`AGENTS.md` rule 7; constitution rules 5 and 9). |
| P8 | A learner reaches a first working program without hardware | Install, press Learn, blink a simulated output, with no terminal and no board. |
| P9 | Outputs default safe and off | No reboot, fault, watchdog reset, communication loss or invalid artifact resumes physical control by itself (constitution rule 4). |
| P10 | One source of truth per fact | Opcodes, lesson IDs, the board table, the version, inter-process communication (IPC) channel names and the product name are each defined once and generated elsewhere. |
| P11 | Validate at trust boundaries | Bytecode, persistence, IPC, files, device links and network input are validated before any state changes (constitution rule 3). |
| P12 | No dependency without a written reason | New dependencies carry the justification `AGENTS.md` rule 5 requires; those needed by this spec are in `research.md`. |
| P13 | Proportionate process | A check tests an outcome a user would notice. No validator exists to validate another validator. |

## 4. Scope decisions and open decisions
### 4.1 Owner decisions (binding)
| ID | Decision |
|---|---|
| S-1 | Nothing is descoped. No feature, function block, IEC 61131-3 language or HIL asset is removed in 2.0. Instruction List stays. `packages/zplc-hil` and `tools/hil` stay. Cloud function blocks stay. |
| S-2 | Zero recurring cost. No Apple Developer Program fee and no other recurring fee for installers. Distribution is designed from free channels only. |
| S-3 | The learning mode is mandatory and first-class: a course for learning PLC programming, in simulation or on a microcontroller, entered through a dedicated Learn button reachable from the Welcome screen and the shell without opening a project. The learner boards are the ESP32-S3-DevKitC-1 (`esp32s3_devkitc/esp32s3/procpu`), which is the module the owner holds, and the Raspberry Pi Pico (`rpi_pico/rp2040`). |
| S-4 | The review reports stay untracked. This spec may be tracked later (decision D-09), so it stands on its own. |
| S-5 | Windows uses both free channels, in this order: first the Microsoft Store (an MSIX package built with the electron-builder `appx` target and re-signed by Microsoft), then SignPath Foundation signing for the NSIS and portable installers, followed by a winget manifest. The unsigned NSIS installer, with documented "More info, Run anyway" steps, remains only as the fallback until each channel is live. |

Note on S-5. S-5 fixes the Windows channels and their order and nothing else. The rule that no outside approval can delay GA (REL-007, REL-009, REL-038 and gate 8 of section 8) is a design default chosen when this spec was written, not an owner decision; the owner may revise it (section 4.6).

### 4.2 What S-1 changes
The review recommended removing several things. Under S-1 each is repaired instead.

| Review recommendation | Disposition in this spec | Requirements |
|---|---|---|
| Delete Instruction List | Keep and repair: terminating parser, correct jumps, typed accumulator | LNG-017 to LNG-020 |
| Delete `packages/zplc-hil` | Keep and repair: real compile, deploy and observe | HIL-001 to HIL-003 |
| Delete print-only and one-off scripts in `tools/hil` | Keep every script; each either fails properly or is documented as a bench utility | HIL-004 |
| Cut cloud function blocks and provisioning | Keep and repair; verify against local protocol doubles | COM-002 to COM-009 |
| Remove RETAIN from the language surface, or implement it | Implement | CMP-029, RT-025 to RT-027 |
| Delete the WASM fallback, or ship it | Build, verify and ship it | IDE-025 |
| Delete the Zephyr single-task ("legacy") mode | Keep as a one-task configuration of the shared scheduler core | RT-018 |
| Ship fewer installer formats | Keep all fourteen | REL-020 |
| Reject 64-bit types until the VM supports them | Make them work | CMP-015 |
| Defer the scheduler extraction and the I/O model to 2.1 | Do both in 2.0 | RT-008, IO-001, IO-002 |

### 4.3 What may still be removed
Removal is allowed only for things that are not functional: scratch files, tracked build outputs, template leftovers, placeholder and AI-generated images, duplicated dead source that a living module replaced (for example `IDE/src/components/WatchWindow.tsx`, replaced by `DebugWatchPanel`), tests that assert on source text, the workflow-text parsing inside release validators (the validators themselves stay and are rewritten to inspect artifacts, VF-021), and generic third-party agent skills. DOC-020 lists them. If removing an item would take away something a user can do today, it is not in this category.

### 4.4 Open decisions (owner only)
Each decision has a recommended default. Work that a decision blocks is named so that unblocked work can start. D-02 (the Windows channel) was taken by the owner on 2026-10-08 and is recorded as S-5; its number is not reused. D-13 is an owner decision whose recommended default was changed from B to A during review (section 4.6 lists the defaults that were set without an owner decision).

| ID | Decision | Options | Recommended default | Blocks |
|---|---|---|---|---|
| D-01 | Does the Homebrew cask remove the macOS quarantine flag after install? | (A) Yes, in `postflight`: the app opens with no dialog. (B) No: same "Open Anyway" steps as the DMG. | A, stated openly in the README and install page, with the pinned SHA-256 and attestation as the integrity story. It does for the user what Homebrew itself stopped offering, so the owner must accept that optic. | REL-004, DOC-005 wording |
| D-03 | One product name | "ZPLC Studio" or "ZPLC IDE" for the desktop application | "ZPLC Studio" for the application, "ZPLC Runtime" for the firmware, "ZPLC" for the project. Fix `appId` in the same decision: it is permanent after the first Store or signed release. | REL-020, REL-031, UX-016, DOC-017, cask and Store names |
| D-04 | IEC features that do not exist today: 2.0 or 2.x | See section 4.5 | As listed in section 4.5 | The "Decision D-04" rows of section 6 |
| D-05 | Rewrite git history to drop the 34 MB board schematic PDF and old build outputs | (A) Rewrite once and force-push all branches and tags. (B) Leave history. | A, once, before any HIL record or GA tag is bound to a commit SHA, with a mirror backup. The file is third-party material and the cost of rewriting grows with every SHA-bound record. The mirror keeps every old SHA resolvable, including the baseline `b379d82` that this spec cites; the spec header then records the baseline's new SHA (section 1, conventions). Destructive: needs explicit approval at the time. | DOC-027; ordering of HIL-009 and the GA tag |
| D-06 | A second, non-Zephyr port in 2.0 | (A) 2.0 (Pico SDK or FreeRTOS). (B) 2.x. | B. 2.0 delivers the portable scheduler core and port conformance suite, used by Zephyr, POSIX and WASM, and words the claim accordingly. | IO-016, DOC-012 wording |
| D-07 | A hosted web build of Studio in 2.0 | (A) 2.0, for Chrome and Edge. (B) 2.x, with 2.0 keeping it possible. | B. 2.0 keeps project files behind a service interface and ships a tested WASM runtime, so a web build is a later, cheap step. | REL-037, the shape of IDE-001 |
| D-08 | HIL execution model | (A) Self-hosted runner. (B) Manual protocol with recorded evidence. | B. A person at the bench runs one command per board; the tool writes the record. It fits P7, costs nothing, and avoids exposing a self-hosted runner to a public repository. | HIL-012, the wording of gate 6 in section 8 |
| D-09 | Track this spec publicly while it describes unpatched security defects | (A) Now. (B) After RT-001, RT-002, COM-001, COM-016 and COM-022 are merged. (C) A redacted copy now. | B. The spec gives no reproduction detail, but it names locations. Note what B implies: COM-022 needs the session rule of COM-020, which arrives only with the device side of the new control protocol, so under B this spec and its plan stay untracked until that protocol work is done, long after the early fixes. The owner may judge an earlier point sufficient, for example once RT-001, RT-002, COM-001 and COM-016 are merged and the raw-memory command is disabled as a stopgap, and decide then. | When contributors can read it |
| D-10 | Spanish register for the application, the course and the docs | Neutral Latin American Spanish, or Rioplatense voseo | Neutral, with impersonal or "usted" forms, as is usual in industrial manuals | UX-030, LRN-029, DOC-015 |
| D-11 | Live-service evidence for the cloud blocks | (A) Local protocol doubles only. (B) Doubles in CI plus a manual free-tier run. | A for GA, with the blocks labelled "verified against local protocol doubles". B is optional and never a gate, because it depends on third-party accounts. | COM-007, DOC-012 wording |
| D-12 | When `master`, the GitHub About text and the docs site switch to 2.0 | (A) Merge now, site labelled "2.0 preview". (B) Merge at GA. | A. It restores spec 010's delivery model and lets CI, the nightly workflow and the docs deployment run. | VF-016, REL-033, DOC-019 |
| D-13 | Start policy after any reset or power-up (an owner decision whose recommended default changed from B to A) | (A) Always STOP after any reset (power-on, brown-out, pin, software, watchdog or fault); RUN only by a person's command. (B) Conditional automatic RUN: only after a clean power-on reset cause, only on a device where a person enabled it beforehand, and never after a brown-out, pin, software, watchdog or fault reset. | A. Option B conflicts with constitution rule 4 (`.specify/memory/constitution.md:16-18`) and with principle P9, so choosing it would first need the owner to amend the constitution. | RT-022 |

### 4.5 Decision D-04 in detail
Elements a professional needs in order to trust the tool are assigned to 2.0 as requirements in section 6 and are not listed here. The elements below do not exist today and are the owner's choice.

| Element | Recommended | Reason |
|---|---|---|
| `LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR`, `WCHAR` | 2.x | Rare in controller code for small targets. In 2.0 they are rejected with a clear message (CMP-003). |
| Subrange types; enumerations with an explicit base type | 2.x | Uncommon; workarounds are simple. |
| Arrays of arrays | 2.x | Multi-dimensional arrays cover the need. |
| `POINTER TO`, `ADR` | 2.x | Vendor extensions; `REF_TO` is the standard form and is in 2.0. |
| `VAR_ACCESS`, `VAR_CONFIG`, `PERSISTENT` | 2.x | `RETAIN` covers persistence in 2.0. |
| Properties, namespaces, `ACTION` blocks in textual POUs | 2.x | Third-edition structure features; nothing in the examples or course needs them. |
| Textual `CONFIGURATION`, `RESOURCE`, `TASK` | 2.x | Tasks stay in `zplc.json`, which works. |
| Event-triggered tasks | 2.x | The scheduler rejects them today; cyclic tasks cover the course and the examples. |
| Positional (non-formal) function-block calls | 2.x | Named calls with `:=` and `=>` are in 2.0. |
| Function forms of operators (`ADD`, `MUL`, `GT`, `EQ`, `MOVE`) | 2.x | Operators exist; the function forms add no capability. |
| `EN`/`ENO` on blocks | 2.x | Needs a rule for every block; power flow in Ladder covers the common case. |
| Explicit feedback loops in FBD | 2.x | 2.0 detects a loop and reports it (LNG-023). |
| Jumps and labels in Ladder | 2.x | Rare in new programs. |
| SFC qualifiers `SD`, `DS`, `SL` | 2.x | `N`, `S`, `R`, `P`, `P0`, `P1`, `L`, `D` are in 2.0. |
| Statement-level step over, into and out | 2.x | 2.0 has breakpoints and cycle stepping in all five languages. |
| PLCopen XML import and export | 2.x | Spec 010 excludes it from GA; accepting ordinary pasted Structured Text comes first. |
| Online change (modify a running program) | 2.x | Needs a design of its own. |
| Versioned library packages | 2.x | 2.0 has libraries as folders of source files (CMP-046). |

### 4.6 Design defaults and one open question
**Design defaults.** The choices below were made when this spec was written. The owner has not decided them and may revise any of them. Each is marked "(design default)" where it appears in a requirement.

| Design default | Where | What it says |
|---|---|---|
| No outside approval can delay GA | Note under S-5, REL-007, REL-009, REL-038, gate 8 | A pending, refused or failed Microsoft Store listing or SignPath Foundation application never delays 2.0.0. The channel order of S-5 is unchanged. |
| Forces end with their session | COM-020 | The device releases forces set by a session when the session ends, times out or loses its link, and the outputs then follow the program. |
| Watchdog policy by state | RT-020 | Enabled only on boards that have a hardware record; defined while paused, at a breakpoint and in a latched fault. |
| Draft ABI counter | CMP-052 | Every contract change before the freeze increments a counter that firmware and Studio compare and refuse on mismatch; the final version is assigned at the freeze. |
| Prerelease tag names | REL-031 | Tags continue the `rc` sequence after `2.0.0-rc.3`. |

**Open owner question (no decision number).** Should the simulation track of curriculum module 10 (Modbus and MQTT) work offline against loopback endpoints that Studio starts itself? The recommended default is yes, and COM-009 and LRN-030 are written that way. If the owner declines, COM-009 returns to "work against a local endpoint or report a defined unavailable status", and module 10 becomes hardware-only or uses recorded replay. Added size: the endpoints are new product code, a Modbus TCP server and an MQTT broker inside the installed application derived from the doubles in `tools/connectivity/`, which adds size to the package that owns COM-009 and to the package that writes module 10; the amount is not estimated. The question is also question 11 in the open-questions table of `research.md`.

## 5. Workstreams
Each workstream has the same six parts: Intent, Current failures, Scope, Requirements, Verification, Risks and dependencies. The order below is also the recommended order of work: VF produces the failing tests that become the backlog of the others.

| ID | Workstream | Disposition | Depends on |
|---|---|---|---|
| VF | Verification foundation | New | none |
| CMP | Compiler and language core | Rewrite the semantic middle | VF; RT for CMP-029 |
| LNG | The five IEC languages in the IDE | Repair | VF, CMP; UX for LNG-012 |
| RT | Runtime core and safety behaviour | Repair; extract the scheduler core | VF |
| IO | I/O mapping, boards, portability | Repair; new data-driven model | RT |
| COM | Communications, function blocks, cloud blocks, control plane | Rewrite the function-block layer and the protocol | VF, RT |
| IDE | IDE core reliability and workflow completeness | Repair | VF; RT and IO for IDE-025 |
| UX | Design system, shell, accessibility, internationalisation | Rewrite the view layer | VF, IDE |
| LRN | Learning mode | Repair and extend | CMP, LNG, IO, UX, COM, REL, HIL |
| HIL | Hardware-in-the-loop and hardware evidence | Repair | VF, CMP, RT, IO, COM |
| REL | Release, distribution, CI/CD, firmware binaries | Repair; redesign signing | VF |
| DOC | Documentation, identity, repository hygiene | Rewrite | all |

The table lists dependencies between workstreams. The Risks and dependencies part of each workstream names the requirements involved, and those decide the order of work: CMP needs RT only for retentive variables (CMP-029 needs RT-025), and HIL needs CMP because its fixtures must compile (HIL-005).

### VF: Verification foundation
#### Intent
Replace verification by text with verification by execution in every area, and make those checks run on every change. This workstream goes first: its red tests are the task list for the others.

#### Current failures
- **Blocker.** No test checks what a compiled language construct does. The compiler package has 276 tests, 234 assertions are `toContain` on assembly text, and none starts a VM; `COMPILER/compiler/compiler.test.ts:1893` asserts the assembly of a known miscompilation.
- **Blocker.** The docs validators pass pages that end mid-sentence (`docs/docs/getting-started/index.md:47` and six IDE pages); the parity validator checks that files exist, not what they say.
- **Major.** The IDE has no component render test and no DOM test library. At least 591 of 3,906 `expect(` calls assert on source read from disk: `IDE/src/components/Console.tabNavigation.test.ts` (209), `IDE/src/components/WelcomeScreen.test.ts:8-25`, `IDE/electron/workspaceTestsIpc.test.ts:11-25`, `IDE/electron/main.native-sim.test.ts:594-600`.
- **Major.** The code that builds programs, runs tests and answers AI tools is outside the type-checker: `IDE/tsconfig.app.json:29` excludes `src/cli/**`, `src/mcp/**` and all tests; `IDE/tsconfig.electron.json:17` includes only `electron/main.ts`. Checking them gives 62 errors, at least 46 real. ESLint is not type-aware (`IDE/eslint.config.js:14`).
- **Major.** Opcodes are maintained by hand in four places: `CORE/include/zplc_isa.h`, `COMPILER/assembler/opcodes.ts`, `tools/zplc_asm.py` (15 opcodes behind) and `tools/hil/zplc_tester.py`. The "parity" test hard-codes about 20 values and never reads the header (`COMPILER/assembler/assembler.test.ts:54-84`).
- **Major.** CI does not run on the 2.0 branch: `.github/workflows/ci.yml:3-9` triggers on `main` and `master` only. The default branch has failed since 2026-05-06. The nightly workflow is not on the default branch, so it has never run.
- **Major.** Core test gaps: 24 of 78 opcodes are never executed by a host test (including CALL, RET, the shifts and the relative jumps); the loader fuzz target does not fix the CRC, so mutated inputs stop at `CORE/src/core/zplc_loader.c:283`; every Zephyr suite runs on `native_sim/native/64` only; about 72% of the lines in `APP/src` are in files no test compiles.
- **Major.** Release checks read text: about 380 lines of `tools/hil/validate_release_evidence.py:66-452` parse workflow YAML, and `scripts/release-artifacts.test.mjs:220-293` holds about 50 regular expressions. They detected none of the release blockers listed under REL.
- **Major.** There is no formatter configuration. `IDE/src/components/Console.tsx` has 46 lines over 300 characters (longest 3,420); 99 of the 390 lines of `IDE/src/mcp/server.ts` exceed 160 characters.
- **Minor.** `AGENTS.md` requires `clang-tidy`; there is no `.clang-tidy` and no CI step, and `-Werror` covers the application target only (`APP/CMakeLists.txt:68`).
- **Minor.** Tests that need the native runtime are skipped when the binary is absent (eight `it.skipIf(!existsSync(nativeRuntimeBinary))` lines in `IDE/src/cli/toolApi.test.ts`, `:733` to `:1116`, and `IDE/src/cli/blinkyVisualPosix.test.ts:58` and `:77`); `tools/hil/test_validate_release_evidence.py` and `scripts/release-version.test.ts` are run by no workflow; IDE unit tests never run on macOS or Windows.

#### Scope
- **In:** test harnesses, CI triggers and jobs, type-check configuration, generated contract tables, formatter and static analysis, docs validators, outcome checks for releases.
- **Out:** the product fixes themselves (other workstreams) and the hardware harness (HIL).

#### Requirements
- **VF-001** The repository MUST contain a host conformance suite in which each case compiles a source program with the repository compiler, loads the resulting `.zplc` file into the real C VM through the loader, runs a stated number of scan cycles on a controlled clock, and asserts values read from VM memory.
- **VF-002** Adding a conformance case MUST require only a source file and an expected-values file, with no change to test code.
- **VF-003** The suite MUST contain at least one passing case for every row of the conformance matrix whose 2.0 target is "works", and at least one negative case, asserting the diagnostic code and position, for every construct that 2.0 rejects. The matrix is section 6 of this spec, kept as a tracked machine-readable file, `conformance/matrix.json`, that CI checks for drift against section 6 while both are tracked; the suite, the language reference (DOC-006) and the progress counts read the file, not this spec.
- **VF-004** The suite MUST contain one case for every defect listed under the Current failures of CMP, LNG and RT that can be shown on a host.
- **VF-005** Every conformance case MUST give identical results on a 64-bit host build and a 32-bit host build of the runtime, and the cases tagged architecture-sensitive (division, shifts, float conversion, alignment, 64-bit arithmetic) MUST also give the same results under QEMU on `qemu_cortex_m3` and, for the alignment-sensitive cases, on a Cortex-M0 target (Zephyr board `qemu_cortex_m0`, which has 16 KB of RAM, so the core runs there with reduced memory sizes, RT-029), because the Cortex-M3 tolerates unaligned access and the Raspberry Pi Pico's Cortex-M0+ does not; a host run with the undefined-behaviour sanitizer's alignment check complements both.
- **VF-006** Tests MUST NOT prove behaviour by matching product source text, generated assembly text or workflow text; CI MUST fail when a test file reads a product source file to assert on its content. Assembly text may be asserted only in the assembler's own unit tests. A list of existing offenders MAY exist while tests are being replaced; it MUST be empty at GA.
- **VF-007** Every component of the UI kit (UX-001) and every workbench surface listed in section 7 MUST have render tests that drive it through user events in a browser document model (DOM) environment and assert roles, names, states and results.
- **VF-008** An end-to-end suite MUST drive the real Electron application, on a real temporary folder, through these journeys: create a project; open an existing folder; edit Structured Text; build with an error and reach it from Problems; build successfully; simulate; watch a value; hit a breakpoint; force and release an input; save; undo after switching tabs; close with unsaved changes; restore the session; start Learn with no project open and pass the first lesson. No picker is faked in the renderer: the native folder dialog is answered through a test hook in the main process that exists only in builds made for the suite, and CI MUST prove that no released installer contains it.
- **VF-009** The end-to-end suite MUST run on Linux for every pull request, and on macOS and Windows at least nightly and for every release.
- **VF-010** All TypeScript in the repository, including `IDE/src/cli`, `IDE/src/mcp`, `IDE/electron`, scripts and tests, MUST pass the type-checker with the strict flags in CI with zero errors.
- **VF-011** ESLint MUST run with type-aware rules so that an unhandled promise is a CI failure, and `noUncheckedIndexedAccess` SHOULD be enabled.
- **VF-012** Opcode numbers, operand sizes, stack effects, container format constants, type identifiers, memory-region bases, the STRING layout and the size of each communication function-block kind MUST be defined in one machine-readable file from which the C header, the TypeScript tables, the Python tables and the documentation table are generated; CI MUST fail when a generated file differs from a fresh generation.
- **VF-013** Every opcode in the generated table MUST be executed by at least one host VM test, including its fault paths, and CI MUST fail when opcode coverage computed from the table is below 100%.
- **VF-014** The loader fuzz target MUST repair the CRC so that mutations reach the verifier, and a second target MUST load and run accepted artifacts for a bounded number of cycles under the address and undefined-behaviour sanitizers; a short run MUST gate pull requests and a long run MUST run nightly.
- **VF-015** The core, loader and scheduler test suites MUST run in CI on a 32-bit target (`qemu_cortex_m3` and a 32-bit `native_sim`) as well as on the 64-bit host, and the alignment-sensitive subset of VF-005 MUST also run on the Cortex-M0 QEMU target named there.
- **VF-016** CI MUST run on every push and pull request for the 2.0 development branch and the default branch, the default branch MUST be green, and every scheduled workflow MUST have at least one recorded successful run before GA.
- **VF-017** A formatter MUST be configured for TypeScript, JSON, CSS, Markdown and C and enforced in CI, with a maximum line length that no hand-written source file exceeds.
- **VF-018** `clang-tidy`, with a configuration file in the repository, MUST run in CI on the core, the hardware abstraction layer (HAL) and the firmware application with warnings as errors, and `-Werror` MUST apply to every firmware target.
- **VF-019** The docs validators MUST fail on a page whose last non-empty line is not a complete sentence, table row, list item, code fence or admonition end; on a page missing from the sidebar; and on an English and Spanish pair whose heading structure or number of code blocks differs.
- **VF-020** Every code sample in the docs that is marked runnable MUST be compiled in CI, and executed when the page states an expected result.
- **VF-021** Release checks MUST test the produced artifacts (signature kind, installation, launch, checksum, software bill of materials content) and MUST NOT parse workflow or configuration text. The tests that match regular expressions against workflow files (`IDE/scripts/release-artifacts.test.mjs`) MUST be replaced; the validators under `tools/hil` that parse workflow text MUST be rewritten in place to inspect produced artifacts and run outcomes, so the files and their tests stay (S-1).
- **VF-022** Every test file in the repository MUST be executed by at least one CI job, and CI MUST fail when a test file matches no job.
- **VF-023** In CI, a test that needs the native runtime binary MUST fail, not skip, when the binary is missing.
- **VF-024** The IDE and compiler unit tests MUST run on macOS and Windows at least nightly.
- **VF-025** CI MUST publish a flash and RAM size report for every board and fail when a size exceeds the budget recorded for that board.
- **VF-026** CI SHOULD cache the Zephyr workspace, the Zephyr SDK and the package caches so that a pull-request run does not repeat their set-up in every job.
- **VF-027** Known failing cases MUST be recorded in one expected-failure list in which each entry names the requirement that will fix it, and the list MUST be empty at GA. Because this spec may be untracked, CI MUST read requirement IDs and progress counts from a tracked requirement index (identifier, workstream and title) generated from section 5, not from the spec itself.

#### Verification
- VF-001 is accepted when, on the baseline commit, the suite reports the compiler defects listed under CMP as failures (about 55 are expected). A suite that is green on the baseline is not measuring the right thing.
- Evidence is the CI run on the commit: host level for VF-001 to VF-004, QEMU level for VF-005 and VF-015. Nothing here supports a hardware claim.
- VF-006 and VF-022 are checked by CI scripts that list offending files.
- VF-008 is accepted when each journey fails on the baseline for the reason its finding describes (for example, undo after a tab switch) and passes after the fix.

#### Risks and dependencies
- CI will be red for weeks. VF-027 keeps that honest: an expected failure is listed with its owner requirement, an unexpected one blocks the merge.
- End-to-end tests on a virtual display can be flaky; they need retries limited to infrastructure errors and must never retry an assertion.
- The end-to-end runner and the DOM test environment are new development dependencies; their justification is in `research.md`.
- QEMU runs lengthen CI; the architecture-sensitive subset keeps pull-request time bounded and the full corpus runs nightly.

### CMP: Compiler and language core
#### Intent
A compiler that rejects every wrong program with a located message, and compiles every accepted program to bytecode whose behaviour matches IEC 61131-3, proven by execution.

#### Current failures
- **Blocker. Semantic errors become comments and the build succeeds.** An assignment to an undeclared variable is dropped (`COMPILER/compiler/codegen.ts:1154`); an unknown identifier becomes `PUSH32 0` (`:1855-1857`); an unknown function becomes `PUSH8 0` (`:2197-2198`). There are 36 such sites in `codegen.ts` and 42 in `COMPILER/compiler/stdlib/`. Unknown type names get size 0 (`COMPILER/compiler/ast.ts:154-157`, `symbol-table.ts:192-194`). Identifiers are case-sensitive (`symbol-table.ts:165-167`). There is no type checker (`codegen.ts:1998-2033`). `validate()` accepts such programs (`COMPILER/compiler/index.ts:412-419`).
- **Blocker. Numeric results are wrong outside positive DINT and positive REAL.** Signed 8- and 16-bit values are zero-extended (`CORE/src/core/zplc_core.c:1645`, `:1665`; the compiler never emits the sign-extension opcodes). Executed: `-8 / 2` gives 32764; `ABS(-5)` gives -5. Unary minus on REAL uses the integer opcode (`codegen.ts:1975-1977`): `r := -1.5` stores -3.0. Mixed REAL and integer operands are not converted (`:2139-2156`). REAL comparison compares bit patterns as integers (`:2160-2167`). `NOT` is masked to one bit (`:1969-1974`). 64-bit types are stored as 8 bytes and computed on a 32-bit stack; `l : LINT := 5` faults the VM.
- **Blocker. Aggregates are miscompiled.** Struct and function-block member reads are 8 bits wide (`symbol-table.ts:898`, `:905`, `:946`): a member holding 1000 reads as 232. Enum variables are 2 bytes but accessed as 4 (`:884-885`). Whole-struct assignment copies 4 bytes. Nested member access emits an error comment and then faults (`codegen.ts:1927-1930`). STRING variables are unusable (`codegen.ts:1828-1832`, `:2263-2264`).
- **Blocker. Initial values are ignored outside PROGRAM blocks** (`codegen.ts:981-1002`): globals, constants, function-block members and function locals start at 0, and a global constant can be assigned (`COMPILER/compiler/parser.ts:568`). An array initialiser faults the VM on the first scan (`codegen.ts:997`, `:1779-1780`).
- **Blocker. Function-block composition does not work.** An instance declared inside a user function block is not found (`codegen.ts:1633-1660`); a `FOR` loop inside a function block is dropped (`:1372-1376`); `VAR_IN_OUT` is passed by value; unknown parameter names on standard blocks are ignored (`COMPILER/compiler/stdlib/timers.ts:299-309`); `VAR_TEMP` and function locals keep their values between calls.
- **Blocker. 256 bytes of variables per program, no shared globals, no shared POUs** (`codegen.ts:76`; `index.ts:676-681`, `:707`). Each program file is compiled alone (`index.ts:666-710`), so a global is a separate copy per program, and a function block in another file is invisible (`IDE/src/compiler/index.ts:434-457`).
- **Blocker. The debug map points watches at wrong addresses** whenever a file has a type, function, function block or global: the map is built from a second symbol table (`index.ts:391`, `:745-746`; `symbol-table.ts:838-845`) that differs from the one used for code (`codegen.ts:267`).
- **Blocker. A failed build says where but never why.** The Tool API replaces every compiler message with "Compilation failed" (`IDE/src/cli/toolApi.ts:226-231`); for LD, FBD and SFC the position is zeroed too (`IDE/src/compiler/index.ts:478-480`).
- **Major. Control flow.** `FOR ... BY -1` never runs (`codegen.ts:1398-1401`); `RETURN` halts the whole scan (`:1626-1631`); `CASE` ranges cannot be parsed and labels must be non-negative literals (`parser.ts:1175`, `:1179-1184`; `COMPILER/compiler/lexer.ts:529-532`).
- **Major. One flat symbol table** (`symbol-table.ts:132`, `:808-828`): two functions cannot both have a parameter named `a`. Named arguments are bound by position (`codegen.ts:2177-2184`). A function call cannot be a statement (`parser.ts:935-938`).
- **Major. Everyday Structured Text is rejected:** `a, b : INT;`, `VAR CONSTANT`, `16#FF`, `T#1h30m`, `fb(IN := x, Q => y)`, `STRING[20]`, type aliases, `ARRAY[-5..5]`, `**`, `&`, `/* */`, `w.0`, initialisers for structs. The names of 22 library blocks are keywords (`lexer.ts:87-113`), so `Pulse : BOOL;` fails.
- **Major. Diagnostics.** One error per compile (`parser.ts:152-163`); many errors at position 0:0 (`symbol-table.ts:189`, `:278-285`; `ast.ts:521-526`; `index.ts:374`); no warnings, codes or ranges; an unterminated comment reports "Expected END_PROGRAM" (`lexer.ts:346-353`).
- **Major. Standard library conformance.** `TP` restarts while its input stays true (`stdlib/timers.ts:320-322`); `TON.ET` counts past `PT`; `REAL_TO_INT` truncates; only six conversion functions exist and an unknown one returns 0; string functions modify their first argument (`COMPILER/compiler/stdlib/strings.ts:63-81`, `:134-139`).
- **Major. Bytecode contract.** The code generator emits mnemonics that do not exist (`codegen.ts:1797`, `:2575`, `:1216`, `:2369`); the assembler truncates operands (`COMPILER/assembler/codegen.ts:155`, `:158`, `:209`); no stack depth is computed and every task declares 64 (`index.ts:820`).
- **Major. Debug information.** Each statement's range covers only its first instruction (`codegen.ts:404-410`; `COMPILER/compiler/debug-map.ts:402-442`), so looking up any other program counter fails (`:300-309`); `compilerVersion` is the literal `'1.2.0'` (`:184`); the map contains a timestamp (`:185`).
- **Major. No array bounds checking.** A variable index of 2 on `ARRAY[0..1]` overwrites the next variable.
- **Major. No interoperability inside a project.** No library mechanism; reusable blocks must be pasted into every program file.
- **Minor.** `TIME` is a signed 32-bit millisecond count with no diagnostic on overflow; a second compile pipeline has different limits (`IDE/src/compiler/index.ts:254`); project options `compiler.optimization`, `warnings`, `strictTypes` and `build.generateDebugInfo` have no consumer (`IDE/zplc.schema.json:67-96`, `:278`); access specifiers and `ABSTRACT` are parsed and not enforced; `.DB` is parsed and emits nothing (`COMPILER/assembler/parser.ts:306-313`).

#### Scope
- **In:** a new semantic pass between parser and code generation (scoped symbol table, type checker, typed intermediate representation, one memory layout used by code and debug map); grammar gaps in the existing lexer and parser; the diagnostics model; standard-library conformance; the assembler's range checks; whole-project compilation; and the new VM behaviour that CMP-015, CMP-023, CMP-024 and CMP-041 need (64-bit and double-precision operations, bounds and null-reference faults, indirect calls). That VM work belongs to this workstream: it is designed once, with the ABI revision of CMP-052, and delivered together with the compiler requirement that needs it.
- **Kept:** the hand-written lexer and parser, the abstract syntax tree with positions, the assembler, the `.zplc` container, the memory admission checks (`codegen.ts:478-573`, `index.ts:551-584`), deterministic output.
- **Out:** the graphical and Instruction List front ends (LNG); every other VM change (RT); elements listed under decision D-04.

#### Requirements
**Diagnostics and semantic checking**
- **CMP-001** Compiling a program that assigns to, reads or calls an undeclared identifier MUST fail with an error that names the identifier and its line and column.
- **CMP-002** A build MUST produce no artifact when any error diagnostic exists, and the code generator MUST NOT emit placeholder code in place of an error.
- **CMP-003** A declaration that uses an unknown type name, including the types deferred by decision D-04, MUST fail with an error that names the type and its position.
- **CMP-004** Identifiers, keywords, type names, parameter names and direct addresses such as `%ix0.0` MUST be matched without regard to letter case.
- **CMP-005** Every expression, assignment, call argument and return value MUST be type-checked: implicit conversion is allowed only where IEC 61131-3 defines a widening conversion, and any other mismatch MUST be an error that names both types.
- **CMP-006** Every diagnostic MUST carry a stable code, a severity, a source file reference, a start and end position, and a message; no diagnostic may be reported at line 0, column 0.
- **CMP-007** One compile MUST report every independent error in the project: a file with three unrelated errors yields three diagnostics.
- **CMP-008** The compiler MUST emit warnings for at least unused variables, unreachable statements and non-IEC spellings it accepts, and the `compiler.warnings` project option MUST select which are reported.
- **CMP-009** An unterminated comment MUST be reported at the position of its opening delimiter.
- **CMP-010** Studio Build, the CLI, the MCP tools and the live editor diagnostics MUST return the same diagnostics, including the message text, for the same project.

**Numeric behaviour**
- **CMP-011** Arithmetic, comparison and conversion on `SINT`, `INT` and `DINT` MUST give the mathematically correct result for every operand in range, including negative values.
- **CMP-012** `USINT`, `UINT` and `UDINT` MUST use unsigned comparison, division and shifts, and MUST accept literals over the full range of the type.
- **CMP-013** `REAL` negation, comparison and arithmetic, including with negative operands and with integer operands after implicit conversion, MUST give IEEE 754 single-precision results.
- **CMP-014** `NOT`, `AND`, `OR`, `XOR` and the shift functions on `BYTE`, `WORD` and `DWORD` MUST operate on the full declared width.
- **CMP-015** `LINT`, `ULINT`, `LWORD` and `LREAL` variables MUST be declared, initialised, computed, compared and converted with correct 64-bit results on the host and on every target.
- **CMP-016** Integer overflow, division by zero, the most negative value divided by -1, and conversion of an out-of-range or not-a-number REAL to an integer MUST each have one behaviour stated in the language reference and identical on every platform.
- **CMP-017** `TIME` MUST accept compound and fractional literals (`T#1h30m`, `T#1.5s`), compare and compute correctly over its documented range, and reject a literal outside that range; `DATE`, `TOD` and `DT` MUST support literals, assignment, comparison, and addition or subtraction of `TIME`.
- **CMP-018** A constant expression whose value does not fit the target type MUST be a compile error.

**Aggregates**
- **CMP-019** Structure members MUST be read and written at their declared width; nested member access, whole-structure assignment, structure initialisers, and structures as parameters MUST work.
- **CMP-020** Enumeration variables MUST be stored and accessed at one consistent width, MUST be usable in comparisons and as `CASE` labels, and MUST accept the qualified form `Type#Value`.
- **CMP-021** `STRING` and `WSTRING` variables, including `STRING[n]`, MUST hold assigned text, reject at compile time a literal longer than their capacity, and work with every standard string function; a string function MUST NOT modify its arguments.
- **CMP-022** Arrays MUST support one to three dimensions, negative and constant-expression bounds, elements of any declared type (including structures, function blocks, strings and, when CMP-015 is met, 64-bit types), and initialisers with value lists and repeat counts.
- **CMP-023** A constant array index outside the declared bounds MUST be a compile error, and a variable index outside the bounds at run time MUST raise a defined VM fault; the run-time check MUST be on by default.
- **CMP-024** `REF_TO`, `REF()` and `^` MUST be type-checked, and dereferencing a null reference MUST raise a defined VM fault.

**Declarations and initialisation**
- **CMP-025** Every variable in every POU and every global MUST hold its declared initial value, or the IEC default when none is declared, at the first scan.
- **CMP-026** `VAR CONSTANT` and `VAR_GLOBAL CONSTANT` MUST hold their declared value, and an assignment to a constant MUST be a compile error.
- **CMP-027** `VAR_TEMP` variables and function locals MUST be initialised on every call, so that a function holds no state between calls.
- **CMP-028** `VAR_IN_OUT` parameters MUST be passed by reference: a change made by the callee is visible to the caller on return.
- **CMP-029** `RETAIN` and `NON_RETAIN` MUST be accepted; `RETAIN` variables MUST be placed in the retentive region and keep their values as defined by RT-025.
- **CMP-030** These declaration forms MUST compile and work: several names in one declaration, `VAR_EXTERNAL`, type aliases, several types in one `TYPE` block, `VAR_TEMP` in a PROGRAM, and `VAR_OUTPUT` and `VAR_IN_OUT` in a FUNCTION.
- **CMP-031** Based literals (`2#`, `8#`, `16#`), digit separators and typed literals (`INT#5`) MUST be accepted; the non-IEC `0x` form MUST keep working and produce a warning.
- **CMP-032** The operators `**` and `&`, block comments written `/* */`, bit access such as `w.0`, and the empty statement MUST be accepted and work.
- **CMP-033** Names of library function blocks MUST NOT be reserved words: `Pulse : BOOL;` compiles.

**Program organisation units (POUs)**
- **CMP-034** Each POU MUST have its own scope: two functions may use the same parameter and local names.
- **CMP-035** In a function call, named arguments MUST bind by name in any order; a missing required argument, an unknown argument name and a recursive call MUST each be a compile error; a call used as a statement MUST be accepted.
- **CMP-036** `RETURN` MUST return to the caller of the function, function block or method, and the remainder of the scan MUST continue.
- **CMP-037** In a function-block call, an unknown parameter name MUST be a compile error, and the output binding form `=>` MUST work.
- **CMP-038** Function-block instances declared inside function blocks, arrays of instances, and instances passed as `VAR_IN_OUT` MUST work, each instance keeping its own state.
- **CMP-039** `FOR`, `WHILE` and `REPEAT` loops MUST work in every POU with any integer variable in scope as the counter; `FOR` with a negative `BY` MUST count down.
- **CMP-040** `CASE` MUST accept ranges, lists, negative values, constants and enumeration values as labels, and overlapping labels MUST be a compile error.
- **CMP-041** Methods, `THIS`, `EXTENDS`, `SUPER^`, `OVERRIDE`, `FINAL`, `ABSTRACT` and the access specifiers MUST be enforced or executed as IEC defines, and a variable of an interface type MUST call the method of the instance assigned to it.

**Project and memory**
- **CMP-042** All source files of a project MUST be compiled as one unit: a type, function, function block or global declared in any file is visible to every program, and a global has exactly one storage location shared by all programs and tasks.
- **CMP-043** The memory available to a program MUST be limited only by the target profile, and an allocation failure MUST state the bytes required, the bytes available and the largest consumers.
- **CMP-044** `%M` addresses MUST be project-wide, and an overlap between an `AT %M` variable and another variable MUST be a compile error.
- **CMP-045** Studio, the CLI, the MCP tools and the tests MUST use one compile entry point with one set of limits.
- **CMP-046** A project MUST be able to name folders of source files as libraries, whose POUs and types are compiled as part of the project.
- **CMP-047** Task configuration from `zplc.json` (several cyclic tasks, each with an interval, a priority and its programs) MUST keep working, and two programs that write the same physical output MUST still be rejected.

**Bytecode contract and debug information**
- **CMP-048** The code generator MUST be unable to emit a mnemonic that is not in the generated opcode table (VF-012).
- **CMP-049** The assembler MUST reject an operand or a relocated address that does not fit its field, and MUST NOT truncate it.
- **CMP-050** The compiler MUST compute the maximum evaluation-stack and call depth of every task, record them in the artifact, and fail the build when a depth exceeds the target limit.
- **CMP-051** No artifact produced by the compiler may be rejected by the loader; CI MUST check this for every conformance case.
- **CMP-052** The container and instruction-set version MUST be defined once, MUST change whenever an opcode or layout changes, and a version mismatch MUST be reported by the loader and by Studio with both version numbers. Until the freeze, every contract change MUST increment a draft counter that the compiler records in each artifact and each firmware image reports in its handshake, and the loader and Studio MUST refuse an artifact or image whose counter differs from their own and show both numbers (design default). The one final version integer planned for 2.0 MUST be assigned and frozen when the conformance matrix is closed (gate 1 of section 8); from then on a CI check MUST compare the generated contract (VF-012) with the frozen file and fail on any difference, and the version MUST NOT change again before GA. Every prerelease before the freeze MUST state that programs must be rebuilt and boards reflashed after an update.
- **CMP-053** Two builds of the same project MUST produce byte-identical bytecode and a byte-identical debug map, and the compiler version recorded in the map MUST be the real package version.
- **CMP-054** The debug map MUST be produced from the same symbol table and layout as the code and MUST list every addressable variable with its type, region and size; CI MUST compare each address with the address observed by executing a write.
- **CMP-055** Each statement in the debug map MUST have the full range of its instructions with line and column, so that any program counter inside a statement resolves to that statement.
- **CMP-056** A `.zplc` file MUST carry a build identity that its debug map records, so that a tool can detect a map that does not belong to the running program; the identity is a contract change counted by CMP-052.
- **CMP-057** `TP`, `TON` and `TOF` MUST follow the IEC timing diagrams (`TP` starts on a rising edge and cannot be retriggered; elapsed time stops at the preset); `REAL_TO_INT` MUST round as IEC defines and `TRUNC` MUST truncate; a conversion function MUST exist for every pair of supported elementary types (the pairs that involve 64-bit types or date and time types are covered when CMP-015 and CMP-017 are met).
- **CMP-058** Each of the 61 standard functions and the 22 non-communication function blocks listed in section 7 MUST have at least one executed test with expected values, including negative operands and boundary values; the 12 communication and cloud blocks are covered by COM-006.
- **CMP-059** The project options `compiler.optimization`, `compiler.debug`, `compiler.warnings`, `compiler.strictTypes` and `build.generateDebugInfo` MUST each have a documented effect covered by a test, and no optimisation level may change the results of a conformance case.
- **CMP-060** The textual assembly listing MUST remain available for inspection, and every directive the assembler accepts, including `.DB`, MUST have its documented effect on the output.
- **CMP-061** Non-test compiler sources SHOULD contain no `any` casts and no leftover conversational comments.

#### Verification
- The host conformance suite (VF-001 to VF-005) proves CMP-011 to CMP-047 and CMP-057 to CMP-059: host level on 64-bit and 32-bit builds, QEMU level for the architecture-sensitive subset.
- Negative cases prove CMP-001 to CMP-010, asserting the diagnostic code and range.
- CMP-051 and CMP-054 are checked for every conformance case by the suite itself.
- CMP-053 is proven by building twice in CI and comparing bytes.
- Evidence is the CI run; no compiler requirement is proven by reading generated assembly.

#### Risks and dependencies
- **64-bit and double-precision arithmetic (CMP-015)** need new opcodes or multi-word code sequences, an ABI revision, and extra flash on Cortex-M0+ targets. The cost is measured by VF-025. This is the most expensive consequence of S-1 in the compiler.
- **Contract-changing requirements.** These change the binary contract and so each increments the draft counter of CMP-052 when it lands: CMP-013 (float comparison, if it needs opcodes), CMP-015, CMP-023 and CMP-024 (new operations and faults), CMP-041 (indirect calls), CMP-050 (stack-depth metadata), CMP-056 (build identity), RT-002 and COM-001 (the block-size table and block layouts), COM-005 (the STRING layout) and IO-005 (configurable I/O image sizes).
- **Interface dispatch and instance-relative addressing (CMP-038, CMP-041)** change how function-block code is generated; today blocks are inlined with absolute addresses.
- **Programs that compiled by accident will now fail.** The 25 example projects and the HIL fixtures must be rebuilt and corrected (HIL-005, LRN-036), and the migration page must say so.
- The review estimated three to five weeks for the semantic middle alone, before the additions S-1 requires.
- Depends on VF-001 and VF-012, and on RT-025 for CMP-029. LNG, LRN, HIL-005 and DOC-006 depend on this workstream.

### LNG: The five IEC languages in the IDE
#### Intent
Structured Text (ST), Instruction List (IL), Ladder Diagram (LD), Function Block Diagram (FBD) and Sequential Function Chart (SFC) can each be written, compiled, simulated, debugged and monitored online, and none of them drops or reorders logic without saying so.

#### Current failures
- **Blocker. All text files share one editor model and one undo stack.** The editor is rendered without a per-file path or key (`IDE/src/components/CodeEditor.tsx:537-541`, `IDE/src/components/EditorArea.tsx:469-474`). Undo after switching from file A to file B can put A's text into B, and a save then overwrites B.
- **Major. Instruction List is not trustworthy.** An unknown mnemonic makes the parser loop forever (`IDE/src/compiler/il/parser.ts:369-379`, `:467-475`), and Build runs in the Electron main process. Programs with jumps run completely only on the first scan (`IDE/src/compiler/il/ilToST.ts:90`, `:152-156`). Parenthesised operands are ignored, unknown labels emit nothing, arithmetic is DINT only, and the error list is never filled (`ilToST.ts:60`, `:210`). No test executes an IL program.
- **Major. The graphical transpilers drop or reorder logic silently.** SFC transitions are sequential `IF` statements, so a chain of true conditions crosses several steps in one scan (`IDE/src/transpiler/sfcToST.ts:95-113`); only qualifier `N` compiles although the legend lists N, S, R and P (`:231`); there is no simultaneous divergence. A Ladder coil takes the AND of every contact in the rung regardless of position (`IDE/src/transpiler/ldToST.ts:504-612`, `:740`, `:814`); edge contacts are offered in the palette and rejected by the transpiler (`IDE/src/models/ld.ts:1058-1059`, `ldToST.ts:240`). In FBD an unwired input becomes 0, an unknown block becomes a comment, and REAL values pass through INT temporaries (`IDE/src/transpiler/fbdToST.ts:269-274`, `:543`, `:585-586`).
- **Major. Debugging does not reach the graphical languages.** There is no map from generated text back to rungs, blocks or steps (`IDE/src/cli/toolApi.ts:399-404`), yet the support table declares `debug: true` for all five languages (`IDE/src/compiler/index.ts:46-52`). The debug map records `src/main.st` while the editor matches on the bare file name (`IDE/src/components/codeEditorBreakpoints.ts:7-22`), so breakpoints may not bind at all (inferred; needs the manual check).
- **Major. Visual editors record every drag step as an edit.** A position change commits the whole document without checking whether the drag is still in progress (`IDE/src/editors/fbd/graphModel.ts:23-25`, `IDE/src/editors/sfc/graphModel.ts:21`); one drag of 300 pixels uses about 30 of the 50 undo slots (`IDE/src/editors/visualHistory.ts:41-43`).
- **Major. Ladder and FBD are mouse-first.** Palette items are draggable `<div>` elements with no keyboard access (`IDE/src/editors/ld/LDToolbox.tsx:52`, `IDE/src/editors/fbd/FBDToolbox.tsx:108`, `IDE/src/editors/sfc/SFCToolbox.tsx:104`); Ladder variables are typed into a free-text field with no symbol completion (`IDE/src/editors/ld/LDEditor.tsx:93-150`); rung controls appear on hover only (`:505`).
- **Major (part of a wider finding).** A malformed Ladder file is cast without validation and can blank the window (`IDE/src/models/ld.ts:1006-1021`).
- **Minor.** FBD accepts any-to-any connections (`IDE/src/editors/fbd/FBDEditor.tsx:362`); SFC live state guesses three naming conventions for step flags (`IDE/src/editors/sfc/SFCEditor.tsx:566-576`); user function blocks cannot be placed in LD or FBD (the catalogue is a static 78-line file, `IDE/src/catalog/blockCatalog.ts`); the ST language service reports only the first syntax error and sees one file (`IDE/src/components/stLanguageService.ts:57-78`).

#### Scope
- **In:** the five editors, the LD, FBD, SFC and IL transpilers, debug mapping from generated code to source elements, online monitoring, the ST language service, keyboard authoring.
- **Kept:** transpiling the graphical languages and IL to Structured Text; the editor engines (React Flow for FBD and SFC, the SVG rung grid for LD, Monaco for text); snapshot undo, copy and paste; the IEC symbols already drawn.
- **Out:** visual styling of nodes and wires (UX); language semantics of ST itself (CMP).

#### Requirements
**All languages**
- **LNG-001** For each of ST, IL, LD, FBD and SFC a user MUST be able to create a program, edit it, save it, build it, simulate it, deploy it by a human action, debug it and monitor it online; the per-language capability table shown to users MUST be produced from passing end-to-end tests and not written by hand.
- **LNG-002** A transpiler MUST report an error for any element or connection it cannot translate, and MUST NOT replace it with a comment, a default value or nothing.
- **LNG-003** Every diagnostic for an IL, LD, FBD or SFC source MUST identify the source element (IL line, rung and cell, block, step or transition), and activating the diagnostic in Studio MUST select that element.
- **LNG-004** The debug map MUST relate instruction ranges to source elements of the language the user edited, so that a breakpoint can be set on an IL line, a Ladder rung, an FBD block and an SFC step or transition, and execution stops there in simulation and on hardware.
- **LNG-005** After a build, a breakpoint set on any executable line of any ST file in the project MUST bind and stop execution; binding MUST use project-relative paths.
- **LNG-006** Online monitoring MUST show, from the debug map and without guessing names: inline values in ST and IL, power flow and element state in LD, pin values in FBD, and active steps and transition conditions in SFC.
- **LNG-007** A palette MUST offer only elements its transpiler supports, and every palette element MUST have an executed test.
- **LNG-008** Every standard, communication and cloud function block, and every user function and function block in the project or its libraries, MUST be usable from each of the five languages, from a catalogue generated from the compiler registry and the project symbols.
- **LNG-009** Each open text file MUST have its own content, undo history, cursor and scroll position; undo after switching tabs MUST NOT change another file.
- **LNG-010** In the visual editors one user gesture (a drag, a paste, a delete) MUST be one undo step, the selection MUST survive the edit, and the undo history MUST hold at least 100 gestures.
- **LNG-011** LD, FBD and SFC files MUST be validated against a schema when opened; an invalid file MUST show an error naming the file and the first violations, and MUST NOT blank the window.
- **LNG-012** Every editing action in LD, FBD and SFC MUST be possible from the keyboard: moving a cursor, inserting an element, binding a variable through a list of declared symbols, connecting, and deleting; palettes MUST be reachable by keyboard and searchable.
- **LNG-013** FBD MUST refuse a connection between incompatible pin types and state the reason.
- **LNG-014** Opening a visual file and saving it without changes MUST leave it byte-identical.

**Structured Text**
- **LNG-015** The ST language service MUST show every syntax and semantic error of the open project while typing, using the compiler's own front end, and MUST offer completion, hover, go to definition, find references and outline across all files of the project.
- **LNG-016** The ST editor SHOULD offer signature help, rename symbol and document formatting.

**Instruction List**
- **LNG-017** The IL parser MUST terminate on any input and report an unknown mnemonic as an error on its line.
- **LNG-018** IL jumps (`JMP`, `JMPC`, `JMPCN`) and labels MUST behave the same on every scan, and a jump to an unknown label MUST be an error.
- **LNG-019** IL MUST support an accumulator of every supported elementary type (64-bit types when CMP-015 is met), parenthesised operations, the `N` and `C` modifiers, calls of function blocks and functions with parameters, and `RET`.
- **LNG-020** Every IL operator MUST have an executed test in the conformance suite.

**Ladder Diagram**
- **LNG-021** The state of each Ladder element MUST follow the power flow reaching its position through series and parallel paths, including nested branches, and logic placed after a block MUST use that block's outputs.
- **LNG-022** Ladder MUST support normally open and normally closed contacts, rising- and falling-edge contacts, normal, negated, set, reset and edge coils, and function blocks and functions at any position in a rung.

**Function Block Diagram**
- **LNG-023** FBD MUST evaluate blocks in data-flow order and display that order; an unwired required input and a feedback loop MUST each be an error naming the block; numeric blocks MUST keep the type of their inputs; logic gates MUST accept more than two inputs.

**Sequential Function Chart**
- **LNG-024** SFC transitions MUST be evaluated against the step state at the start of the scan, so that each sequence crosses at most one transition per scan and every activated step runs its actions for at least one scan.
- **LNG-025** SFC MUST support one initial step, selection branches with a defined priority, simultaneous divergence and convergence, the action qualifiers `N`, `S`, `R`, `P`, `P0`, `P1`, `L` and `D`, the step flag `.X` and step time `.T`, and charts limited in size only by target memory.
- **LNG-026** An error in an SFC action body or transition condition MUST be reported against that action or transition.

**Debug control**
- **LNG-027** Pause, resume, cycle step and breakpoints MUST be available in all five languages, enabled or disabled from the capability profile the runtime reports.

#### Verification
- Host conformance cases per language (VF-001), reusing the fixtures in `tools/hil/il_tests`, `ld_tests`, `fbd_tests` and `sfc_tests` and the expected values in the matching `tools/hil/test_*_suite.py` scripts (HIL-005).
- Render tests for each editor (VF-007): keyboard insertion, one undo step per drag, schema errors.
- End-to-end journeys per language (VF-008): create, edit by keyboard, build, simulate, stop at a breakpoint on a source element, see online values.
- A fuzz test with a time limit for LNG-017.
- HIL level: the blink program in each of the five languages on both learner boards (HIL-010).

#### Risks and dependencies
- Mapping debug information through generated Structured Text needs the statement ranges of CMP-055 and an element reference carried by the transpilers.
- LNG-024 changes the behaviour of existing charts that relied on crossing several steps in one scan; the migration page must say so.
- Each SFC step costs a flag and a timer; large charts depend on CMP-043.
- Depends on CMP for semantics and on UX-001 for keyboard-accessible palettes.

### RT: Runtime core and safety behaviour
#### Intent
A runtime that keeps a program inside its sandbox, behaves the same on the host and on a target, reaches a safe state after any failure, and keeps retained data.

#### Current failures
- **Blocker. The communication function-block opcodes escape the VM sandbox.** They do not check the full extent of the block memory they operate on (`CORE/src/core/zplc_core.c:1905-1914`), and the loader validates only the block kind (`CORE/src/core/zplc_loader.c:237-243`). The reviewer confirmed it under the address sanitizer with artifacts the loader accepts. The consequence is that a downloaded program can corrupt runtime state outside PLC memory. Reproduction detail stays in the local review and is deliberately not given here.
- **Blocker. Fieldbus and MQTT threads are not synchronised with the scan.** The scan holds the scheduler's private mutex (`CORE/src/hal/zephyr/zplc_scheduler_zephyr.c:133`, `:903-1005`); Modbus and MQTT take a different one (`CORE/src/core/zplc_core.c:655-666`; `APP/src/zplc_modbus.c:227`, `:282`; `APP/src/zplc_modbus_client.c:550`; `APP/src/zplc_mqtt.c:685`, `:1251`, `:1394`). Remote writes land in the middle of a scan and a 32-bit value can be seen half-written (`APP/src/zplc_modbus.c:319-327`).
- **Blocker. No fail-safe for a hung or crashed processor.** The hardware watchdog defaults to off and no board enables it (`firmware/zephyr/Kconfig:91-93`; `zplc_scheduler_zephyr.c:409-413`); there is no fatal-error handler and no reset-cause reporting anywhere in `firmware/`. After a hard fault the outputs keep their last state (inferred from Zephyr's default handler).
- **Blocker. RETAIN memory is not retentive on the firmware.** The configuration help says it persists across power cycles (`firmware/zephyr/Kconfig:37-42`); the HAL marks the key "(future)" (`CORE/src/hal/zephyr/zplc_hal_zephyr.c:572`); the region is plain RAM zeroed at start (`zplc_core.c:54`, `:426`).
- **Major. The scan can be starved or blocked, and one late cycle stops the PLC.** The scan coordinator runs at preemptible priority 2 (`APP/prj.conf:86-88`) while MQTT and the Modbus TCP server run at cooperative priorities that outrank it (`APP/src/zplc_mqtt.c:2214`, `APP/src/zplc_modbus.c:650`). A single late activation latches a fault that needs a program reload (`zplc_scheduler_zephyr.c:722-727`, `:946-954`, `:1717`). Debug commands hold the scan lock while printing (`APP/src/shell_cmds.c:1108-1170`, `:1344-1421`).
- **Major. The process-image lock is held across hardware I/O**, including up to five blocking analog reads (`zplc_scheduler_zephyr.c:903-1005`, `:263-277`).
- **Major. Integer and float edge cases are undefined behaviour.** The most negative integer divided by -1 kills the host runtime with a floating-point exception (`zplc_core.c:1292-1294`, `:1307-1309`; executed). Negation and absolute value overflow (`:1316`, `:1324`); float-to-integer conversion of out-of-range values is undefined (`:1975`); status words are written through a cast pointer that may be unaligned (`CORE/src/core/zplc_comm_dispatch.c:52`, `:71`, `:83`).
- **Major. The scheduler is not portable and the simulator runs different semantics.** All multitask, deadline, safe-state and watchdog logic is one 2,149-line Zephyr file. The POSIX host re-implements dispatch with counted, not latched, deadline misses (`firmware/apps/posix_host/src/native_runtime_session.c:148-163`, `:233-243`, `:1951-2029`). Replacing a program resets variable memory on the host (`native_runtime_session.c:192-194`) but not on Zephyr (`zplc_scheduler_zephyr.c:1601-1693`), so a new program starts on the old program's variables.
- **Major. Limits and start-up contradict the configuration.** The whole artifact is capped at 4,096 bytes (`APP/src/program_store.h:11`) while 45,056 bytes are reserved for code and advertised to the IDE (`firmware/zephyr/Kconfig:44-46`). A failed MQTT initialisation returns from `main` before the runtime starts (`APP/src/main.c:439-443`), and the scheduler waits behind time synchronisation and provisioning (`:423-457`).
- **Major.** The loader does not verify stack effects, so it accepts code with a certain stack underflow.
- **Minor.** Pause, breakpoint and step zero the output image and clear forces (`zplc_scheduler_zephyr.c:962-964`, `:1011-1033`, `:1219-1230`); the tick opcode reads the clock on every call and one string opcode can loop for thousands of bytes inside the instruction budget (`zplc_core.c:866-870`, `:1034-1097`); configuration sizes have no ranges (`firmware/zephyr/Kconfig:31-48`); Zephyr headers leak into the core (`CORE/src/core/zplc_debug.c:18-19`); a failed mutex creation is ignored (`zplc_core.c:2117-2119`); two program stores and three CRC implementations exist.

#### Scope
- **In:** VM bounds and arithmetic semantics, loader verification, a portable scheduler core, process-image exchange, fail-safe behaviour, retentive memory, start-up order, limits.
- **Kept:** the loader/verifier, the VM memory model for ordinary instructions, the scheduler's fault latch and commit ordering with its 46 tests, the force table semantics, the A/B program store and boot restore.
- **Out:** board I/O mapping (IO); communication handlers and the control protocol (COM); the new VM operations required by CMP-015, CMP-023, CMP-024 and CMP-041, which CMP owns. The rules of this workstream still bind those operations: bounds (RT-001), stack effects (RT-003), defined results on every platform (RT-005) and a host test per opcode (VF-013).

#### Requirements
**Sandbox and VM semantics**
- **RT-001** Every memory access a program can cause, including through the communication function-block opcodes, MUST be checked against the PLC memory regions for the full extent accessed; a violation MUST raise a VM fault and MUST NOT read or write outside PLC memory.
- **RT-002** The core MUST know the size of each communication function-block kind from the generated table (VF-012) and pass handlers a pointer with a length; the loader MUST reject an artifact in which a statically known block does not fit its region.
- **RT-003** The loader MUST reject an artifact in which any path can underflow the evaluation stack or exceed the stack depth the task declares.
- **RT-004** All multi-byte values the runtime writes into PLC memory MUST be written byte-wise in little-endian order, with no alignment assumption.
- **RT-005** No artifact the loader accepts may crash the runtime process or cause undefined behaviour in C: division and modulo of the most negative integer by -1, negation and absolute value of that integer, shifts by the width or more, and float-to-integer conversion of out-of-range or not-a-number values MUST each have one defined result, identical on every platform.
- **RT-006** Time MUST be latched once per scan so that every instruction in a scan sees the same time, and the instruction budget MUST charge data-dependent opcodes by the amount of data they process.
- **RT-007** Any VM fault MUST drive the outputs to their safe state and latch the fault with its code, task and program counter until a person reloads or resets; the status MUST report it.

**Scheduling and the process image**
- **RT-008** Task admission, ordering, scan phases, deadline handling, the fault latch and the safe state MUST be implemented once, in portable C99, and used by the Zephyr runtime, the POSIX host runtime and the WASM runtime; the same scheduler test suite MUST pass on each.
- **RT-009** Inputs MUST be latched once before the tasks of a cycle run and outputs committed once after them; the input image a program sees MUST NOT change during a scan.
- **RT-010** Writes from Modbus, MQTT and the debug link MUST be queued and applied only at the input latch, and their reads MUST come from the snapshot published at the last commit, so that no multi-byte value is ever observed half-written.
- **RT-011** Every external write MUST go through the force-aware memory interface: a forced variable keeps its forced value whatever Modbus, MQTT or the debug link writes.
- **RT-012** The process-image lock MUST NOT be held during hardware I/O, printing or any blocking call.
- **RT-013** On every shipped board profile the scan coordinator MUST run at a higher priority than every communication, logging and shell thread.
- **RT-014** A deadline miss MUST set a warning flag and count; a configurable number of consecutive misses MUST latch the fault; the status MUST report the miss count, the last overrun duration and the fault reason.
- **RT-015** The task model (cyclic tasks, the meaning of priority, no preemption between tasks) MUST be documented and identical in simulation and on a target, including how a deadline miss is reported.
- **RT-016** Loading a new program MUST initialise variable memory in the same way on every runtime, and cold and warm start MUST be defined in the core.
- **RT-017** While execution is paused, at a breakpoint or stepping, the physical outputs MUST be in their safe state, the output image and the force table MUST be preserved, and resume MUST continue from the preserved state.
- **RT-018** The single-task mode MUST run on the shared scheduler core as a one-task configuration, with the same input latch and deadline check as multitask mode.

**Fail-safe behaviour**
- **RT-019** On a processor fault, stack overflow or kernel panic the firmware MUST drive the outputs to their safe state, record the reason so that it survives the reset, and reboot; after that reboot the runtime MUST stay in STOP and show the reason.
- **RT-020** The hardware watchdog MUST be enabled in every board profile that has a hardware record (HIL-010; the record is made on a build with the watchdog enabled, and the profile keeps it on once the record shows correct reset timing and safe outputs), and MUST stay off, with the board's documentation saying so, in every other profile, because the firmware rule is that it is enabled only after hardware has verified its reset timing and safe outputs (`firmware/zephyr/Kconfig:100-103`, `CORE/src/hal/zephyr/zplc_scheduler_zephyr.c:409-413`). Where enabled it MUST be fed only from the scan control path after a successful output commit, and each profile MUST define its behaviour in STOP, while paused or at a breakpoint (kept fed by the control path so that a long breakpoint does not reset the board, or another policy the profile states), and in a latched fault (it stays armed and resets the board into STOP with the cause recorded, so that the reset does not erase the fault) (design default).
- **RT-021** The reset cause MUST be read at boot, distinguished as power-on, brown-out, pin, software, watchdog or fault reset wherever the processor reports it, and reported in the status.
- **RT-022** After any reset or power-up, whatever its cause (power-on, brown-out, pin, software, watchdog or fault), the runtime MUST restore the stored program into STOP with the outputs at their safe values, and MUST NOT enter RUN until a person issues a RUN command (decision D-13, recommended default A). If the owner selects option B, this requirement is reworded so that automatic RUN is possible only after a clean power-on reset cause on a device where a person enabled it beforehand, and never after a brown-out, pin, software, watchdog or fault reset; option B also needs constitution rule 4 amended first.
- **RT-023** The safe state of every output MUST be off unless the project declares another safe value for that output, in which case the deploy confirmation MUST show it; the safe state MUST be applied on a commanded STOP, at boot before any program can run, and for the whole interval between the old program stopping and the new program starting during a deploy.
- **RT-024** The scheduler, the program store and the control link MUST start before any network or cloud service, and a failure of such a service MUST NOT prevent the runtime from starting or running.

**Retentive memory**
- **RT-025** `RETAIN` memory MUST survive a power cycle on every shipped board: it is saved on STOP and periodically, each record carries a checksum, a layout hash and the program identity, two records alternate, and a record is restored only when the program identity and layout match; otherwise the region is initialised and the status says why.
- **RT-026** The interval between periodic retain saves MUST respect a documented flash-endurance budget for each board.
- **RT-027** The POSIX host and WASM runtimes MUST apply the same retain rules as the firmware.

**Limits and robustness**
- **RT-028** The largest artifact the program store accepts MUST equal the code size configured for the board and the size advertised to the IDE; an artifact of that size MUST deploy and restore.
- **RT-029** Configuration values MUST have ranges and build-time assertions so that an invalid combination fails the build, and the core MUST compile without any Zephyr header.
- **RT-030** A failure to create or take a lock MUST be handled; no caller may ignore it.
- **RT-031** An interruption of power at any moment during a deploy MUST leave either the complete previous program or the complete new one, never a partial program, and the outputs safe.
- **RT-032** The CRC, the memory-access helpers and the program-store logic MUST each have one implementation shared by the host and the target.
- **RT-033** Test-only entry points SHOULD NOT appear in public headers.
- **RT-034** A call to `WATCHDOG_RESET`, a documented no-op today (`COMPILER/compiler/stdlib/system.ts:505-523`), MUST either have a documented effect that a test demonstrates or produce a compile warning that it has no effect; it MUST NOT feed the hardware watchdog from outside the scan control path.

#### Verification
- Host unit suites under the address and undefined-behaviour sanitizers, on 64-bit and 32-bit builds: RT-001 to RT-007, RT-016, RT-028 to RT-032.
- The scheduler suite compiled against each port (VF-015) proves RT-008 to RT-018; a concurrency test on `native_sim` with a busy communication thread proves RT-010, RT-012 and RT-013 at QEMU or native-simulator level only.
- The run fuzzer (VF-014) is the regression guard for RT-001, RT-003 and RT-005.
- Fault injection in the host program store proves RT-031 at host level.
- Host and `native_sim` tests with a recording output driver prove that outputs are at their safe values on a commanded STOP, at boot before RUN and across a deploy (RT-023), and that no reset cause other than a person's command leads to RUN (RT-022).
- HIL level, on both learner boards (HIL-010): watchdog reset time, outputs off after a forced fault, RETAIN across a power cycle, power interruption during deploy, scan jitter. Until those records exist, RT-019, RT-020, RT-025 and RT-031 are claimed at host or QEMU level only.

#### Risks and dependencies
- Extracting the scheduler core is the largest runtime change. The review proposed it for 2.1; S-1 and P3 put it in 2.0.
- The exchange queue and snapshot of RT-010 cost RAM; VF-025 measures it.
- Some watchdogs cannot be stopped once started; RT-020 needs a per-board policy for STOP, for pause and breakpoint, and for a latched fault. The policy is a design default until the owner confirms it.
- Retain saves wear flash; RT-026 must be set from the part's endurance, not guessed.
- RT-017 changes what happens to outputs at a breakpoint; the user guide and the status text must say so.

### IO: I/O mapping, boards, portability
#### Intent
A board is described by data. The same program reaches real pins on every listed board, and what the project says about portability matches what is built and tested.

#### Current failures
- **Major. I/O is a fixed demonstration mapping.** Four outputs come from the devicetree aliases `led0` to `led3`, four inputs from `sw0` to `sw3`, and five analog channels (`CORE/src/hal/zephyr/zplc_scheduler_zephyr.c:204-207`, `:221-277`; `CORE/src/hal/zephyr/zplc_hal_zephyr.c:45-60`, `:91-146`). The analog code is specific to the RP2040 (`zplc_hal_zephyr.c:390`, `:441-453`); analog output is a stub (`:554-560`). The loader rejects the I/O map segment the instruction set defines (`CORE/src/core/zplc_loader.c:329-330`). On the Arduino Opta the four "outputs" are status LEDs; relays and field inputs are not mapped (`APP/boards/arduino_opta_stm32h747xx_m7.overlay:5-15`).
- **Major (learner boards).** Raspberry Pi Pico: outputs GP0 to GP3, one input on GP15, and the on-board LED on GP25 is not mapped (`APP/boards/rpi_pico_rp2040.overlay:34-71`), while the example `pico_blinky_ton` and `docs/PHYSICAL_TESTING_GUIDE.md:137` describe GP25. ESP32-S3: the profile is tuned for a LilyGo T-Display S3, with 16 MB flash, 8 MB PSRAM and "LCD Power" as output 1 (`APP/boards/esp32s3_devkitc_esp32s3_procpu.overlay:2`, `:25-38`, `:56-58`), while the manifest calls it "ESP32-S3 DevKitC" and spec 010 names the DevKitC-1-N8R8; it has two outputs and one input (the BOOT button), and its on-board LED is an addressable RGB LED that would need the LED-strip driver (`APP/boards/esp32s3_devkitc_esp32s3_procpu.overlay:5-13`). This second point was found while writing this spec and is not in the review reports. The owner's board is an ESP32-S3-DevKitC-1, so the profile does not describe the learner board.
- **Major.** The example project `pico_blinky` targets `esp32s3_devkitc` (`IDE/projects/pico_blinky/zplc.json:9`).
- **Major. Portability claims exceed the evidence.** Public text says "virtually any microcontroller" (`docs/docs/integration/index.md:34`) and "guaranteed bounds" (`docs/docs/architecture/index.md:80`). Everything that makes the VM a PLC exists only for Zephyr; there is no other port; 8 KB of RAM is fixed for input and output images (`CORE/include/zplc_isa.h:57-66`) that carry 11 bytes of data.
- **Minor.** The HAL declares 23 functions (`CORE/include/zplc_hal.h:65-338`); the core uses four and six have no caller (the four socket functions, DNS resolution and analog output). The Zephyr HAL maps string keys to eight fixed storage identifiers, so some keys can never be stored (`zplc_hal_zephyr.c:607-625`; the stubs used when non-volatile storage is disabled are at `:803-835`). The Waveshare RP2040-Zero configuration uses an invalid `include` line and is in no manifest or CI job (`APP/boards/waveshare_rp2040_zero.conf:7`). The board manifest is still named `supported-boards.v1.5.0.json`. Analog channels are configured during the first scan (`zplc_hal_zephyr.c:411-474`).

#### Scope
- **In:** the board I/O description, table-driven firmware I/O, HAL contract, non-volatile storage interface, learner-board profiles, the port interface and its conformance suite, the board manifest.
- **Kept:** all six catalogued boards and the RP2040-Zero profile; the cross-build matrix; the honest evidence tiers in the manifest.
- **Out:** hardware evidence itself (HIL); firmware images in releases (REL).

#### Requirements
- **IO-001** Each board MUST have one machine-readable I/O description listing every PLC channel with its direction, kind (digital, analog), IEC address, physical pin or terminal name, electrical limits and safe value; the build MUST fail when the description and the devicetree disagree.
- **IO-002** Firmware I/O MUST be driven by that description: adding a channel to a board requires no change to C source.
- **IO-003** Studio MUST read the same description: the I/O mapping editor lists the selected board's channels with their pin names, and mapping a variable to a channel the board does not have MUST be a build error naming the board.
- **IO-004** Deploy admission MUST compare the I/O the program uses with the connected board's description and refuse a mismatch.
- **IO-005** The sizes of the input and output images MUST be configurable per board and default to what the board's channels need.
- **IO-006** Analog input MUST work on every board whose description lists analog channels, with documented scaling; an analog output channel MUST either work or be absent from the description.
- **IO-007** Every HAL function MUST have a caller and an implementation on every shipped port; an operation a board cannot perform MUST return a defined "not supported" result that reaches the user.
- **IO-008** Non-volatile storage MUST work for every key the runtime uses (program, retain, configuration, credentials) on every shipped board.
- **IO-009** The Raspberry Pi Pico profile MUST map the on-board LED, and the ESP32-S3 profile MUST describe the ESP32-S3-DevKitC-1, with flash and PSRAM sizes equal to the variant printed on the module, any T-Display-specific settings in a separate profile, and a simple output on a documented header pin for an external LED (it does not drive the on-board RGB LED, so no new driver is required); each learner board MUST expose at least four digital outputs, four digital inputs and one analog input on documented header pins.
- **IO-010** All six catalogued boards MUST keep building, each with an I/O description; the Arduino Opta description MUST map its relay outputs and field inputs.
- **IO-011** The Waveshare RP2040-Zero profile MUST be a valid configuration, listed in the board manifest and cross-built in CI.
- **IO-012** The board manifest MUST be one unversioned file that is the only source of the board table for Studio, the docs, CI and the MCP `boards_list` tool.
- **IO-013** The scheduler core, the I/O table and non-volatile storage MUST sit on a documented port interface, and a port conformance suite (per-opcode tests, loader negative tests, scheduler phase and fault tests, a timing self-test) MUST pass on every port.
- **IO-014** The flash and RAM footprint of every board MUST be published from the CI size reports of VF-025, together with the minimum memory the runtime needs.
- **IO-015** The support level shown for a board anywhere MUST be derived from the evidence records referenced in the manifest, MUST name the firmware version each record was made on, and MUST never be set by hand.
- **IO-016** If decision D-06 selects 2.0, one non-Zephyr port MUST build in CI and pass the port conformance suite.
- **IO-017** Every example project MUST target the board its name and text state, its I/O MUST exist in that board's description, and CI MUST build each example for its declared target.
- **IO-018** Peripherals MUST be initialised before the runtime can enter RUN, not during the first scan.

#### Verification
- A build-time check compares each I/O description with the devicetree (IO-001).
- Twister tests on `native_sim` with emulated GPIO and ADC drivers prove IO-002, IO-005 to IO-008 and IO-018 at native-simulator level.
- The cross-build of all seven board profiles proves IO-010 and IO-011 at target-build level only.
- A loopback bench on the two learner boards, each output wired to an input and a known voltage on the analog input, proves IO-009 at HIL level (HIL-010).
- The port conformance suite runs on Zephyr (`native_sim`, `qemu_cortex_m3`), POSIX and WASM (IO-013).

#### Risks and dependencies
- The Arduino Opta's relay and input pins are not established by the review; IO-010 needs the board documentation and, ideally, a board.
- The learner board is the ESP32-S3-DevKitC-1 the owner holds. The only open point for IO-009 is the flash and PSRAM variant printed on the module (spec 010 names N8R8), which sets the sizes in the profile.
- Making the I/O images configurable touches instruction-set constants and therefore the ABI revision of CMP-052.
- Depends on RT-008; LRN-014 and HIL-010 depend on IO-001 and IO-009.

### COM: Communications, function blocks, cloud blocks, control plane
#### Intent
Every communication function block behaves as an IEC function block and stays inside its own memory. The link between Studio and a device is a versioned protocol with integrity checks and a session lock. Defaults are safe for a plant network.

#### Current failures
- **Blocker. No communication function block works as designed.** The dispatcher calls a handler only while BUSY is clear (`CORE/src/core/zplc_comm_dispatch.c:62-65`, `:77-85`). Modbus blocks poll for completion inside a handler that is never re-entered (`APP/src/zplc_comm_modbus_handler.c:253-288`). `MQTT_PUBLISH` never publishes (`APP/src/zplc_comm_mqtt_handler.c:112`, `:127`). The cloud blocks fire on every scan (`APP/src/zplc_comm_cloud_handler.c:181-189`, `:205-209`, `:225-231`). A multi-register read overwrites the block's own HOST and PORT fields (`zplc_comm_modbus_handler.c:211-216`, `:264-268`). Handlers index far past the eight bytes that were checked (`:178-193`).
- **Blocker (same finding).** `AWS_FLEET_PROV` runs synchronously in the scan thread, with about 2.7 KB of local data on a 2,048-byte stack and a 30-second wait (`zplc_comm_cloud_handler.c:209`; `APP/src/zplc_aws_fleet.c:537-547`, `:606`). Two STRING layouts are in use (`zplc_comm_cloud_handler.c:41-44` against `CORE/include/zplc_isa.h:218-220`).
- **Major. The control plane is an unauthenticated text shell.** The IDE link is the Zephyr serial shell with 74 commands and no session, sequence number or frame check (`APP/prj.conf:53-54`). A raw-memory shell command is enabled by default. Program integrity is CRC32 only; the signature flag is defined and rejected (`zplc_isa.h:401`, `CORE/src/core/zplc_loader.c:279`). Two TLS-enabled boards select the test random generator (`APP/boards/nucleo_h743zi.conf:54`, `APP/boards/arduino_opta_stm32h747xx_m7.conf:59`). The default broker is a public server without TLS, a no-verify TLS mode exists, and secrets are stored in plain text (`APP/src/zplc_config.c:703-720`, `APP/src/zplc_mqtt.c:581-587`, `APP/src/zplc_aws_fleet.c:347`).
- **Major. `zplc config save` writes nothing and prints "OK: Config saved"** (`APP/src/zplc_config.c:675-679`, `:811-819`; `APP/src/shell_cmds.c:2897-2906`).
- **Major. Modbus defects.** Server and client writes bypass forces (`APP/src/zplc_modbus.c:183-215`, `:327`; `APP/src/zplc_modbus_client.c:61-100`). The RTU client passes milliseconds into a microsecond field, so every RTU request times out (`zplc_modbus_client.c:124`). The four Modbus areas share one address space, so "input" areas are writable (`zplc_modbus.c:97-126`). Addresses at 0x3000 and above lose their high offset (`:155-157`). A reset frees a request slot that may still be in use (`zplc_comm_modbus_handler.c:227-233`, `:342`).
- **Major. Serial writes from Studio are not atomic.** A multi-byte value is written one byte per command (`IDE/src/runtime/serialAdapter.ts:1064-1073`), so a setpoint can be seen half-written across a scan. Addresses and lengths are not validated (`:1016-1022`, `:1053-1061`); the WASM adapter skips non-writable addresses silently (`IDE/src/runtime/wasmAdapter.ts:608-624`). Three timers poll the device (`serialAdapter.ts:505-511`, `IDE/src/runtime/connectionManager.ts:376-417`, `IDE/src/hooks/useDebugController.ts:926-971`) and the terminal runs an unconditional animation-frame loop (`IDE/src/components/TerminalTab.tsx:95-108`).
- **Minor.** Two documented shell commands print "not yet implemented" (`shell_cmds.c:2239-2242`, `:2248-2251`). No communication or cloud block has an executed test.

#### Scope
- **In:** the function-block dispatcher and the Modbus, MQTT and cloud handlers; the Modbus server and client; MQTT configuration and security defaults; the deploy and debug protocol on the device and in Studio; configuration persistence.
- **Kept:** all twelve communication and cloud blocks; Modbus TCP framing and its tests; the MQTT inbound model that writes only to variables tagged for subscription; the human-readable shell for diagnostics; the hardware deploy admission and confirmation content; the protocol doubles in `tools/connectivity/`.
- **Out:** VM-side bounds (RT-001, RT-002); the layout of the deploy dialog (UX-019).

#### Requirements
**Function-block layer**
- **COM-001** A communication handler MUST NOT read or write outside the block memory it is given; counts and lengths read from PLC memory MUST be validated against that extent, and a result buffer MUST NOT overlap the block's own parameters.
- **COM-002** All twelve communication and cloud blocks MUST follow one documented handshake: the handler is called on every scan while the block is enabled, and `BUSY`, `DONE`, `ERROR` and `STATUS` follow one published timing diagram.
- **COM-003** A communication block MUST NOT block the scan: every handler call returns within a bounded time, and long operations run outside the scan thread through a bounded queue.
- **COM-004** One trigger MUST cause exactly one operation: `MQTT_PUBLISH` sends one message per request, and `AZURE_EG_PUB`, `AZURE_DPS_PROV`, `AWS_FLEET_PROV` and `SPB_REBIRTH` act once per request.
- **COM-005** The compiler, the instruction set and every handler MUST use one STRING layout taken from the generated table (VF-012).
- **COM-006** Each of `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL`, `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`, `AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` and `SPB_REBIRTH` MUST have executed tests against a local protocol double covering success, timeout, error and reset while busy.
- **COM-007** Verifying a cloud block MUST NOT require a paid subscription; documentation MUST state for each cloud block whether it was verified against a local double or against the live service (decision D-11).
- **COM-008** Resetting or disabling a block while a request is in flight MUST NOT release resources still in use, and a full request queue MUST be reported as `ERROR` with a status code.
- **COM-009** In simulation the Modbus and MQTT communication blocks MUST work against loopback endpoints that Studio starts itself and stops with the simulation, built from the local doubles of `tools/connectivity/` so that no installed broker, Python or network is needed (open owner question, section 4.6); the cloud blocks, and any block whose endpoint cannot start, MUST report a defined "unavailable in simulation" status that Studio shows; no block may report success without acting.

**Modbus and MQTT**
- **COM-010** Modbus server and client writes MUST go through the force-aware interface and the exchange point of RT-010.
- **COM-011** The Modbus server MUST keep coils, discrete inputs, input registers and holding registers as four separate areas, reject writes to the input areas with the Modbus exception, and take its mapping from the project.
- **COM-012** A Modbus RTU request to a responsive device MUST succeed within the configured timeout.
- **COM-013** Modbus mapping MUST cover the whole of every PLC memory range it advertises.
- **COM-014** MQTT MUST have no default broker; TLS certificate verification MUST be on by default, and turning it off MUST require an explicit setting and show a persistent warning in the status.
- **COM-015** Credentials and private keys MUST NOT be printed by any command or log, and MUST be kept in protected storage where the platform offers it; where it does not, the documentation MUST say so.
- **COM-016** A firmware build that enables TLS with a non-cryptographic random generator MUST fail at build time. The two boards that select the test generator today (`nucleo_h743zi`, `arduino_opta`; `APP/boards/nucleo_h743zi.conf:54`, `APP/boards/arduino_opta_stm32h747xx_m7.conf:59`) MUST use a hardware entropy source and have TLS on again before GA; until then TLS is off on them and the release notes say so.
- **COM-017** No message arriving from Modbus, MQTT or a cloud service may change RUN/STOP, set or clear a force, or download a program.
- **COM-018** On loss of a connection each affected block MUST report `ERROR` with a status code within a documented time, reconnection attempts MUST be bounded, and requests older than their timeout MUST be dropped, not replayed.

**Control plane**
- **COM-019** Studio and a device MUST communicate through a framed, versioned protocol with a length, a sequence number and a checksum per frame (and, on network transports, the authentication code of COM-021), capability negotiation and explicit error codes, usable over UART, USB serial and TCP, and sharing its message set with the native runtime protocol.
- **COM-020** Download, RUN/STOP, memory write, force, configuration change and credential upload MUST require an open session; only one session may be open at a time; an idle session MUST time out. Forces set by a session MUST be released by the device when that session ends, times out or loses its link, and the outputs then follow the program (design default); forces applied by a hardware scenario run belong to its session.
- **COM-021** A session over a network transport MUST be authenticated with a key provisioned over the local serial link; every frame in such a session MUST carry a message authentication code under that key that covers the sequence number, and a frame with a bad code or a replayed or out-of-order sequence MUST be dropped and counted; the trust model for local serial access MUST be written down.
- **COM-022** Commands that read or write memory outside the PLC regions MUST be disabled in release firmware; the diagnostic shell MUST remain available, its state-changing commands MUST obey the same session rule, and every documented command MUST be implemented.
- **COM-023** One protocol command MUST write a multi-byte value atomically with respect to the scan, and Studio MUST use it for every multi-byte write and force.
- **COM-024** The serial, native and WASM adapters MUST share one address and length check; a rejected access MUST report the requested address, the length and the allowed region.
- **COM-025** The device MUST push status changes, faults, breakpoint hits, force changes, log lines and watch batches as events; Studio MUST have one owner of the link, use polling only as a labelled fallback for firmware without events, and keep event queues bounded with dropped counts visible; telemetry MUST NOT delay the scan.
- **COM-026** The artifact signature flag SHOULD be implemented: a device holding a public key accepts only artifacts signed with the matching private key.
- **COM-027** `config save` MUST persist every setting it reports, proven by reading the settings back after a reboot, and no command may report success without having acted.
- **COM-028** Deploy MUST run as preflight (board identity, ABI version, I/O description, size), a human confirmation stating the effect, transfer with progress, read-back verification and a result; the program stays in STOP afterwards, the outputs stay at their safe values during the transfer and afterwards (RT-023), and RUN is a separate human action.
- **COM-029** The protocol reference MUST be generated from the message definitions, and Studio MUST recognise firmware that speaks an older protocol and say which firmware to install.
- **COM-030** No MCP tool and no AI path may open the device link; a test MUST enumerate the MCP tools and prove it, and the same test run MUST prove that the hardware scenario and bench commands of HIL-003 and HIL-012 exit with an error when started without an interactive terminal.

#### Verification
- Host tests of the dispatcher and handlers under the address sanitizer prove COM-001 to COM-005 and COM-008.
- Twister tests on `native_sim` against local doubles (a Modbus TCP server, an RTU loopback, a local MQTT broker with TLS, and the fake Azure and AWS endpoints in `tools/connectivity/`) prove COM-006 and COM-010 to COM-018 at native-simulator level.
- Codec tests in C and TypeScript run from one generated set of test frames (COM-019); a fuzz test covers the frame parser; authentication tests show that a modified, replayed and out-of-order frame in an authenticated network session is dropped and counted (COM-021); a session test shows that forces set by a session are released when it ends, times out or loses its link (COM-020).
- An end-to-end test connects Studio to firmware built for `native_sim` through a pseudo-terminal: session lock, atomic write, events, deploy (COM-020 to COM-028).
- HIL level on the learner boards (HIL-010): deploy, atomic write, event latency, Modbus RTU on the Pico, Modbus TCP and MQTT on the ESP32-S3.

#### Risks and dependencies
- Replacing the shell-based link breaks pairing between old firmware and new Studio; COM-029 makes that visible.
- The scripts in `tools/hil` speak the shell grammar today; they move to the protocol or keep using the diagnostic shell (HIL-004).
- Local doubles prove protocol behaviour, not acceptance by the real cloud service; COM-007 keeps that visible.
- Depends on RT-001, RT-002, RT-010 and VF-012.

### IDE: IDE core reliability and workflow completeness
#### Intent
The first ten minutes work: open, edit, build, simulate and save, with no hidden step and no lost work. The everyday workflows that are missing exist.

#### Current failures
- **Blocker. A project has two unrelated roots.** The renderer opens a folder through the browser File System Access interface (`IDE/src/utils/fileSystem.ts:41-58`); the main process compiles from a path it learns only when the user opens the Tests tab and picks `zplc.json` again (`IDE/src/components/Console.tsx:275-298`). Until then Build fails (`IDE/src/components/Toolbar.tsx:340-352`). The link is stored unchecked (`IDE/src/store/useIDEStore.ts:777-784`): a user can edit folder A, link folder B, and deploy B.
- **Blocker (inferred). Opening a real folder may not work in the packaged application.** The permission handler rejects every request except serial (`IDE/electron/main.ts:338-346`); an `AbortError`, which a rejected picker is expected to raise, is treated as a cancel and returns nothing, while every other error is rethrown (`fileSystem.ts:51-57`). The only desktop end-to-end test replaces the picker with a fake (`IDE/scripts/run-desktop-smoke.ts:107-120`) and the packaged smoke test stops at the Welcome screen (`IDE/scripts/run-packaged-desktop-smoke.ts:163-205`).
- **Blocker. Unsaved work is lost silently** on close, reload and quit: no `beforeunload` handler, the main process listens only to `closed` (`IDE/electron/main.ts:324-328`), the default Electron menu keeps the close and reload shortcuts, and only the theme is persisted (`useIDEStore.ts:366-391`).
- **Major. One store and whole-store subscriptions.** Six components subscribe to the entire store (`IDE/src/components/EditorArea.tsx:58-69`, `Toolbar.tsx:77-89`, `Console.tsx:99-126`); every keystroke and every poll creates new maps (`useIDEStore.ts:1155-1163`, `:1399-1408`), so the toolbar and the bottom panel re-render each time.
- **Major. Very large mixed modules.** `Console.tsx` is 107 KB in 1,329 lines and holds twelve tabs; `IDE/src/components/settings/ProjectSettings.tsx` is 2,219 lines; the store is 1,540 lines.
- **Major. Failures are invisible on the Welcome screen** (errors go to a console that is not rendered until a project is open, `useIDEStore.ts:499-531`, `IDE/src/App.tsx:48-54`), and there is no error boundary (`IDE/src/main.tsx:6-10`).
- **Major. Start-up carries all of Monaco:** a 4.9 MB entry chunk from `import * as monaco` (`CodeEditor.tsx:15`), no lazy loading, and source maps inside the installer (`IDE/electron-builder.yml:22-24`).
- **Major. Compile, safety check and tests run on the Electron main thread** (`IDE/electron/main.ts:549-560`, `:580-583`, `:598-602`).
- **Major. No session continuity:** no recent projects, no layout persistence, no restore; a new project is only a folder picker (`useIDEStore.ts:570-598`).
- **Workflow gaps (from the journey table of the review).** Missing: library and function-block management, import (export is one-way, `Toolbar.tsx:236-276`), application settings beyond the theme (`CodeEditor.tsx:544-553`), recent projects, crash recovery. Partial: file operations (new and delete only).
- **Minor.** The production content security policy is delivered as a header on a `file://` load and its effect is unproven (`IDE/electron/main.ts:348-357`); the native simulation input interface accepts only three motor signal names (`IDE/electron/security.ts:183-187`); WASM simulation is disabled and not shipped (`IDE/src/runtime/wasmAdapter.ts:32-34`); the serial port chooser is an operating-system message box with up to 16 buttons (`IDE/electron/serialPortSelection.ts:69-75`); the CLI build targets one platform (`IDE/package.json:39`); firmware build from Studio is disabled on Windows (`IDE/electron/firmwareBuildGateway.ts:71`); IPC channel names are duplicated (`IDE/electron/main.ts:40-76`, `IDE/electron/preload.ts:16-53`); Electron is several patch releases behind its supported line.

#### Scope
- **In:** project ownership and file operations, data safety, session state, settings, error containment, process model, performance, simulation inputs, the WASM runtime in Studio, distribution of the CLI and MCP server.
- **Kept:** the Electron security posture, the narrow preload, the native runtime supervisor, the adapter abstraction with capability negotiation, the Tool API, the scenario test engine, the review-only AI change flow, the operational status model.
- **Out:** layout and components (UX); editors (LNG); the device protocol (COM).

#### Requirements
- **IDE-001** The main process MUST be the single owner of the project root: the folder is chosen through a native dialog, the renderer reads and writes through typed project operations (list, read, write, create, delete, rename, move, watch), and Build, Test, Simulate, Lab, Learn, Changes and Agent all use that root with no linking step. Every path in those operations MUST resolve inside the project root after symlinks are resolved, `..` segments and absolute paths MUST be refused, and size limits MUST apply to reads and writes.
- **IDE-002** It MUST be impossible to build or deploy a project other than the one shown in the editor.
- **IDE-003** Opening and saving a real folder MUST work in the packaged application on Windows, macOS and Linux, and a failure MUST be shown on the screen where the action started, including the Welcome screen.
- **IDE-004** The project tree MUST support new file, new folder, rename, move, duplicate and delete; a change made outside Studio MUST reload an unmodified file and prompt for a modified one.
- **IDE-005** Closing a tab, the window or the application, or reloading, with modified files MUST ask to save, discard or cancel; reload shortcuts MUST be absent from packaged builds.
- **IDE-006** Modified content MUST be written to a recovery store within a few seconds, and after a crash the next start MUST offer to restore each file.
- **IDE-007** An autosave setting SHOULD exist.
- **IDE-008** Studio MUST remember recent projects, reopen the last project when the user chooses, and restore per project the panel sizes, open tabs, active tab and cursor positions.
- **IDE-009** Creating a project MUST ask for a name, a location, a target (a board from the manifest, or simulation) and the language of the first program, and MUST produce a project that builds.
- **IDE-010** Application settings MUST include editor font and size, tab size, theme, density, language, autosave and the update check, and MUST persist per user.
- **IDE-011** An exception inside an editor or panel MUST show an error with a retry action in that region only; the window MUST never be blank.
- **IDE-012** Compile, safety check and tests MUST run outside the main process, MUST be cancellable, and MUST NOT make the window unresponsive.
- **IDE-013** Typing in a 2,000-line file while 200 watched values update ten times per second MUST NOT re-render regions that show neither, and a lint rule MUST forbid subscribing a component to the whole store.
- **IDE-014** No hand-written module under `IDE/src` or `IDE/electron` may exceed the size limit set in the lint configuration, and each panel MUST live in its own module.
- **IDE-015** The Welcome screen MUST load without loading the code editor, the visual editors or the settings; only the Monaco features Studio uses are bundled; source maps are not in the installer.
- **IDE-016** The security properties MUST be proven by behaviour in the packaged application: an injected inline script is blocked, a permission other than serial is refused, navigation and new windows are refused, and a project operation given a path with `..`, an absolute path or a symlink that leaves the project root is refused (IDE-001).
- **IDE-017** IPC channel names and message schemas MUST be defined once and shared by the main process, the preload and the renderer; every handler MUST validate the sender and the message, and processes started for compile, test or firmware build MUST be spawned from fixed argument vectors drawn from an allow-list, without a shell and without command text supplied by the renderer.
- **IDE-018** Choosing a serial port MUST use an in-application dialog that lists each port with its name and USB identifiers, marks known boards, and can be refreshed.
- **IDE-019** The Watch table MUST support adding a variable by symbol completion, editing by keyboard, display formats (decimal, hexadecimal, binary, real, time), sorting, a prepared value with an explicit write, and release of all forces.
- **IDE-020** Activating a problem MUST open its exact location; the Problems view MUST list problems first; a message written while another view is visible MUST raise a visible indicator.
- **IDE-021** The result of a build, save, deploy or connection change MUST appear as a notification that links to its details, and long operations MUST show progress with a cancel action.
- **IDE-022** A project MUST be exportable to one archive and importable back into an equivalent project, and a version 1 project MUST migrate with a previewable difference.
- **IDE-023** The project tree MUST list the project's function blocks, functions and data types, and adding a library folder MUST make its POUs available to every editor.
- **IDE-024** In native simulation any declared input of the running program MUST be settable from Studio, not a fixed list of signal names.
- **IDE-025** The WASM runtime MUST be built in CI from the same core with the loader's verifier enabled, shipped, and used with a visible "degraded" label when the native runtime cannot start, with its capability profile reported as spec 009 defines.
- **IDE-026** The CLI and the MCP server MUST be usable on every desktop platform from a release, without a repository checkout or a separate JavaScript runtime.
- **IDE-027** Building firmware from Studio MUST work on Linux and macOS, SHOULD work on Windows, and where it cannot MUST say why and point to the prebuilt image; it MUST never flash.
- **IDE-028** At each release Electron MUST be on a supported major line at its latest patch.
- **IDE-029** The operational status wording, stale-build detection, force banner and deploy admission checks that exist today MUST be preserved.
- **IDE-030** The optional AI assistant and the Changes review MUST be preserved: a proposed change is a reviewable difference that only a person can save, and Studio works fully without AI.
- **IDE-031** Scenario tests with temporal assertions MUST give the same result from Studio, the CLI and the MCP tools.
- **IDE-032** The declared-interlock coverage check MUST be preserved in a view of its own.
- **IDE-033** The store SHOULD NOT import from components, the CLI SHOULD NOT import from `IDE/electron`, and import cycles SHOULD be a lint error.

#### Verification
- First, two manual checks on an rc.3 packaged build, with the result recorded: open a real folder (IDE-003) and set a breakpoint after a build (LNG-005).
- The end-to-end suite on a real folder (VF-008, VF-009) proves IDE-001 to IDE-012 and IDE-018 to IDE-024.
- The packaged-application test is extended beyond the Welcome screen: open, build, simulate, plus the security probes of IDE-016.
- A recovery test kills the application process and restarts it (IDE-006).
- A render-count test measures IDE-013.
- The WASM runtime runs the port conformance suite (IO-013) and a browser-engine test of the adapter (IDE-025).

#### Risks and dependencies
- IDE-001 touches most of the renderer and should be done before the shell rewrite (UX), which builds on it.
- A later hosted web build (decision D-07) needs a browser implementation of the same project operations, so IDE-001 must define an interface, not Electron-only calls.
- IDE-013 needs a measured baseline before a threshold is fixed.
- Depends on VF-008 and VF-010. IDE-025 also depends on the shared scheduler core (RT-008) and the port conformance suite (IO-013).

### UX: Design system, shell, accessibility, internationalisation
#### Intent
One owned component kit, one shell laid out the way PLC engineers navigate, accessibility at level AA of the Web Content Accessibility Guidelines (WCAG), and two languages. The "Wiring Ledger" direction in `IDE/DESIGN.md` stays; what changes is that it becomes enforceable.

#### Current failures
- **Blocker. The project tree is one of twelve tabs in the bottom panel**, exclusive with Problems, Output, Watch and Terminal (`IDE/src/App.tsx:57-90`; `IDE/src/components/Console.tsx:192-232`, `:681`); the default tab is Output, so a newly opened project shows no tree (`IDE/src/store/useIDEStore.ts:434`).
- **Blocker. There is no component layer.** 134 buttons, 121 inputs and 18 selects are styled one at a time; the only shared primitive is `Modal.tsx`. Overlays are built five ways (`IDE/src/editors/fbd/InstanceMonitor.tsx:153`, `IDE/src/editors/ld/LDEditor.tsx:70-77`, `IDE/src/components/Toolbar.tsx:539`, `:905`, `IDE/src/components/Sidebar.tsx:192`); tooltips are 91 `title` attributes; there are three focus-indicator systems.
- **Major. Tasks, I/O mapping and communication are sections of a settings page** (`IDE/src/components/settings/ProjectSettings.tsx:131-186`, `:1162-2040`), reached through a gear button.
- **Major. No desktop chrome:** no application menu, no window background colour or deferred show (`IDE/electron/main.ts:278-294`), and three product names (`:283`).
- **Major. The resize handle's styles target attributes the installed library does not emit** (`IDE/src/index.css:225-262`, `:477`; `App.tsx:76`).
- **Major. Tokens are not enforced:** no theme block, 165 stock-palette utilities in 19 files, six token names used and never defined (`ProjectSettings.tsx:1389-1512`).
- **Major. The colour contract is broken where it matters:** FALSE is red in the Watch table (`IDE/src/components/DebugWatchPanel.tsx:442`) and in inline values (`IDE/src/index.css:350-352`, `:414-416`); green marks a category of Ladder element (`IDE/src/editors/ld/LDToolbox.tsx:38`).
- **Major. Fonts are not shipped** (`IDE/src/index.css:32-33` names Microsoft fonts that cannot be redistributed); text goes down to 6 pixels in Ladder labels (`IDE/src/editors/ld/LDElement.tsx:242`, `:258`).
- **Major. The visual editors and the code editor wear a different skin:** stock colours by block family, shadows, glow and pulse (`IDE/src/editors/fbd/nodes/FunctionBlockNode.tsx:107-111`, `:149`; `IDE/src/editors/fbd/edges/DebugEdge.tsx:99`; `IDE/src/editors/sfc/nodes/SFCStepNode.tsx:106-109`); Monaco uses the default dark and light themes (`IDE/src/utils/monaco-themes.ts:46`, `:64`).
- **Major. The deploy confirmation is a native `window.confirm`** showing a raw 64-character hash (`Toolbar.tsx:539`).
- **Major. Errors and progress have no home:** no notification layer, loading is the text "Loading..." (`Sidebar.tsx:692`), Problems opens with interlock coverage above the problems (`Console.tsx:687-699`).
- **Major. Contrast fails the product's own AA commitment** (`IDE/PRODUCT.md:81`): white on the dark-theme accent blue is 2.61:1 and on accent red 2.94:1; stock colours on the light panel are 1.38:1 to 2.75:1.
- **Major. Invisible focus and unlabelled controls in settings:** ten controls remove the outline with no replacement (`ProjectSettings.tsx:1089`, `:2149`), and 45 labels are not associated with their control.
- **Major. Shortcuts cannot be discovered** (`Toolbar.tsx:706-783`): no menu, no command palette, no shortcut reference.
- **Minor.** No internationalisation except a Learn panel that defaults to Spanish with voseo (`IDE/src/components/LearnPanel.tsx:12`); over-hedged copy ("not hardware or HIL evidence" seven times); four design documents that describe four layouts (`IDE/index.html:16`, `IDE/DESIGN.md:103`, `IDE/PRODUCT.md:7`).

#### Scope
- **In:** the component kit and tokens, the shell layout and navigation, the application menu and command registry, dialogs and notifications, the visual styling of editors, accessibility, string externalisation, copy.
- **Kept:** the palette (Drawing Sheet and Commissioning Spine), the operational-truth model, the existing accessibility roles (ARIA) and keyboard structure, the four theme modes, the pure presentation modules, the Welcome screen's restraint, the Inspector row pattern.
- **Out:** editor behaviour (LNG); data safety and settings storage (IDE).

#### Requirements
**Component kit and tokens**
- **UX-001** Studio MUST have an owned component kit in `IDE/src/ui/`, built on one headless accessible primitive library, providing at least: button, icon button, toggle group, field, text field, number field, select, combo box, checkbox, switch, tabs, menu, context menu, dialog, alert dialog, popover, tooltip, toast, tree, data grid, toolbar, badge, status dot, empty state and property list.
- **UX-002** Outside `IDE/src/ui/`, raw `button`, `input`, `select` and `textarea` elements, `title` tooltips, native `confirm` and `alert`, stock-palette utilities and literal colour values MUST NOT appear; CI MUST enforce this by lint.
- **UX-003** Design tokens MUST be declared once in three tiers (colour ramps, semantic roles, component tokens); every token used MUST be defined; the Monaco and graph-editor themes MUST be generated from the semantic roles for the light, dark and high-contrast themes.
- **UX-004** A gallery page available in development builds MUST render every kit component in every theme and density.
- **UX-005** All interactive elements MUST share one focus indicator that is visible in every theme and is never removed without a replacement.
- **UX-006** The interface and code fonts MUST be open-licensed files bundled with the application, giving the same typeface on all three operating systems, with a fixed type scale whose smallest size is 11 pixels and tabular numerals for values, addresses and times.
- **UX-007** Corner radius, elevation and icon size MUST be tokens: surfaces are flat at rest and only transient overlays cast a shadow.
- **UX-008** A density setting (compact, comfortable) MUST apply to the whole application.

**Signal and state colour**
- **UX-009** One signal vocabulary (TRUE, FALSE, unknown, forced, fault) MUST be defined once and used by inline values, Watch, Ladder, FBD, SFC, Trace and the I/O faceplate: FALSE is neutral, green means confirmed TRUE or RUN only, amber means forced or warning, red means fault only, and every state has a cue other than colour.
- **UX-010** Category and direction in the visual editors MUST be shown by shape, position or label, not by hue; no element may glow, pulse or animate continuously.

**Shell**
- **UX-011** The shell MUST provide a native application menu, a command bar, an activity rail (Project, Search, Tests, Learn), a primary sidebar that stays visible together with the results panel, the editor area, an optional secondary sidebar (Inspector, Toolbox), a bottom results panel (Problems, Output, Watch, Trace, Terminal, test results) and a status bar; every surface listed in section 7 MUST remain reachable.
- **UX-012** The project navigator MUST be organised by PLC objects (programs, function blocks, functions, data types, global variables, tasks, I/O mapping, communication, device), offer a file view as a second mode, and be visible when a project opens.
- **UX-013** Tasks, I/O mapping, network, communication and target MUST each open as an editor from the navigator, preserving every setting available today.
- **UX-014** The application menu MUST contain File, Edit, View, Project, Build, Online, Debug and Help on every operating system, with no default Electron developer items in packaged builds.
- **UX-015** One command registry MUST feed the application menu, a command palette, tooltips with shortcut hints, and a shortcut reference; every command MUST be reachable from the keyboard.
- **UX-016** The window MUST take its background colour from the theme before first paint, appear only when ready, and show the product name of decision D-03 in its title.
- **UX-017** Panel separators MUST be visible, show hover, active and focus states, be movable by keyboard, and keep their positions between sessions.
- **UX-018** A connection to real hardware MUST be shown by a persistent indicator that differs from simulation in text, icon and colour; active forces MUST keep their amber banner and an unconfirmed force its alert.
- **UX-019** Deploy MUST be confirmed in a designed dialog that compares project and device (board, profile, firmware and ABI version, program identity, size, tasks), highlights mismatches, names the effect on its action button ("Stop PLC and deploy"), states that the outputs stay at their safe values during the transfer (RT-023), and puts initial focus on Cancel.
- **UX-020** Every destructive or physical action MUST be confirmed in an alert dialog whose action button names the action.
- **UX-021** Every panel MUST have a designed empty state with a next action, a loading indicator for operations longer than 300 ms, and an error state with a recovery action.
- **UX-022** The Welcome screen MUST offer Open, New, Learn, Examples grouped by level and topic, and Recent projects, and MUST show errors in place.
- **UX-023** The main path MUST be usable at 1366 by 768 pixels without clipped controls, and the window MUST remain usable at its 1024 by 768 minimum.

**Accessibility**
- **UX-024** Text and meaningful graphics MUST meet WCAG 2.2 AA contrast in the light, dark and high-contrast themes; CI MUST compute the ratios from the tokens and run an automated accessibility check on the gallery and the main screens.
- **UX-025** The path open, edit, build, simulate, watch, force, deploy dialog and one Learn lesson MUST be completable with the keyboard alone, with a logical focus order and no keyboard trap.
- **UX-026** Every form control MUST have a programmatically associated label, every icon-only button an accessible name, and status changes MUST be announced.
- **UX-027** The light, dark, high-contrast, forced-colours and reduced-motion modes MUST apply to every surface, including the visual editors and the code editor.
- **UX-028** Before GA the main path MUST be checked with a screen reader on Windows and on macOS and the result recorded.

**Language and copy**
- **UX-029** Every user-visible string MUST be externalised and complete in English and Spanish, selected by one application setting that defaults to the operating-system language; CI MUST fail on a missing key or a hard-coded string in a component.
- **UX-030** Spanish text MUST use the single register of decision D-10 throughout the application.
- **UX-031** Interface text MUST use sentence case, no exclamation marks, and no internal terms ("candidate", "link zplc.json"); the evidence boundary of a surface is stated once, as a labelled badge with its explanation in a tooltip.
- **UX-032** `IDE/DESIGN.md` and `IDE/PRODUCT.md` MUST describe the shipped interface, and no other document may describe a different layout.
- **UX-033** The visual editors SHOULD offer fit to view, a wider zoom range, alignment and distribution, context menus, and Ladder rungs that use the available width.
- **UX-034** The code editor's minimap SHOULD be off by default and its debug state SHOULD be shown in the status bar, not over the code.

#### Verification
- Render tests for every kit component: roles, names, keyboard behaviour, states (VF-007); an automated accessibility check on the gallery in each theme.
- Contrast ratios computed in CI from the token values for a declared list of foreground and background pairs (UX-024).
- Lint rules prove UX-002, UX-029 and the token rule of UX-003.
- A keyboard-only end-to-end run proves UX-025; screenshots of the gallery and main screens per theme are compared with stored baselines.
- UX-028 is manual evidence, recorded in the release checklist.

#### Risks and dependencies
- The primitive library and two font families are new dependencies; the comparison and justification are in `research.md`.
- During migration old and new components coexist; the lint rule starts with an allow-list that must be empty at GA.
- Tests that assert the current layout as text (for example that no activity rail exists) must be deleted with the layout they freeze (VF-006).
- String extraction is cheap while components move into the kit and expensive afterwards.
- Depends on IDE-001 (the navigator needs one project root) and VF-007.

### LRN: Learning mode
#### Intent
A person with no PLC experience and no hardware opens Studio, presses Learn, and works through a structured course that reaches all five languages. With an ESP32-S3 or a Raspberry Pi Pico, the same course continues on real inputs and outputs.

#### Current failures
Gap numbers G1 to G12 refer to the learning-mode inventory made on 2026-10-08; section 9 maps each to requirements.

- **G1. No course structure.** Ten lessons, all unlocked, in a flat list with no modules, levels or prerequisites; blinky is fifth and the scan cycle is eighth (`IDE/src/components/learnLesson.ts:8`).
- **No entry point.** Learn is a tab of the bottom panel (`IDE/src/components/Console.tsx:213`, `:847`), which renders only when a project is open (`IDE/src/App.tsx:49-55`); the Welcome screen has no Learn entry.
- **G2. No lesson has the learner edit LD, FBD, SFC or IL.** Lesson 5 cites `src/main.ld` (`IDE/src/components/learnContent.en.v1.ts:57-60`) but its starter contains only `IDE/projects/blinky_starter/src/Blinky.st`.
- **G3. Lesson text and graded scenario disagree.** The text describes the reference scenarios; eight of nine starters ship a different one-assertion scenario of 10 to 20 ms. Lesson 1 asks for predictions at 40, 90 and 140 ms against a 20 ms scenario.
- **G4. Only one starter keeps a plant** (`conveyor_01_starter`), so the Lab has nothing to draw for eight lessons.
- **G5 (on reading, not executed). Two starter scenarios contradict their instructions:** the edge counter asserts `CountReached` after one pulse against a counter preset of 3; the pedestrian crossing asserts at 10 ms against a checkpoint at 60 ms. The only test checks that each starter fails and each reference passes its own scenario (`IDE/src/cli/toolApi.test.ts:1356-1366`).
- **Grading can be bypassed.** `gradeRecordedScenarioLesson` passes when the latest test result matches the lesson's scenario id and path with all assertions passed; the scenario's content is not compared with a known hash (`learnLesson.ts:106-126`, `:117`), and the scenario sits in the learner's editable workspace.
- **G6. Stale text:** strings overridden at run time (`IDE/src/components/learnContent.v1.ts:47-48`), lesson 10 has no Edit stage, the tab's accessible name is "Learn, safe motor start-stop lesson" (`Console.tsx:213`).
- **G7. Lesson ids are written out in three files** (`learnLesson.ts:7-8`, `IDE/electron/learnProgressStore.ts:7`, `IDE/src/mcp/server.ts:12`). Lesson content is TypeScript source.
- **G8 and G9. No hardware path.** Every starter targets `posix`; no lesson or grade involves a board; no hardware example has a scenario; learner-board I/O is as described under IO.
- **No live plant and no I/O panel.** Four plant models are hard-coded in the scenario runner and bound to fixed program and variable names (`IDE/src/test-engine/index.ts:210-245`, `:330-378`); the Lab replays recorded samples only (`IDE/src/components/labPlayback.ts:35-49`); the only live buttons exist for a program named `Motor` (`IDE/src/runtime/nativeTrace.ts:127-130`).
- **G10. The docs site has no page** for Learn, Lab, the scenario format, the examples or any tutorial.
- **G11. Public text advertises a WASM fallback that is disabled** (`README.md:20`, `IDE/README.md:13`, `docs/docs/ide/features.md:31-32`).
- **G12. Nothing for educators.** Progress is one user's export and import.
- **Language.** The panel defaults to Spanish regardless of the system (`IDE/src/components/LearnPanel.tsx:12`), does not remember the choice, and uses voseo.
- **Examples.** 25 projects exist; the Welcome screen shows 16 as a flat row of names with no grouping (`IDE/src/components/WelcomeScreen.tsx:93-115`).

#### Scope
- **In:** the Learn entry point and home, the curriculum, lesson packages, the simulation and hardware tracks, the live plant and I/O faceplate, grading, progress, educator basics, course pages on the docs site, the example projects.
- **Kept:** the ten existing lessons, the staged lesson model (Objective, Predict, Edit, Run, Observe, Reflect), the four plant models, recorded replay, progress export and import, the read-only course resource for MCP, all 25 example projects.
- **Out:** scene editing, three-dimensional or general physics simulation, accounts, a server, certificates (spec 010 exclusions stand).

#### Curriculum
The module order is normative; lesson titles inside a module may change. Numbers in the last column are the positions of today's ten lessons.

The table fixes modules, not lesson counts, so it cannot size the course by itself. The first deliverable of this workstream is the course outline: for every module, the list of its lessons with language, tracks and plant, which gives the number of lessons per module and of wiring pages per board. It is written when the ten existing lessons are placed (LRN-007) and before any new lesson. The table and LRN-008 already imply a floor of 17 lessons: the ten existing ones, one new lesson in each of the six modules that have none (0, 4, 7, 9, 10 and 11), and one Sequential Function Chart lesson in module 5. The outline, not this floor, is the basis for sizing.

| Module | Title | Level | Requires | Languages | Tracks | Existing lessons placed here |
|---|---|---|---|---|---|---|
| 0 | Getting ready: a tour of Studio, simulation, and (hardware) verify my board | Foundation | none | none | Simulation, Hardware | new |
| 1 | How a PLC thinks: the scan cycle, then a first blink | Foundation | 0 | LD, ST | Simulation, Hardware | scan cycle and one-scan memory (8); ladder, timer and feedback (5) |
| 2 | Boolean logic and latching: contacts, coils, seal-in, set and reset, safe stop | Foundation | 1 | LD, ST | Simulation, Hardware | safe motor start-stop (1) |
| 3 | Timers, edges and counters | Foundation | 2 | LD, FBD, ST | Simulation, Hardware | edges and pulse counter (7) |
| 4 | Data: types, arithmetic, comparison, analog scaling | Intermediate | 3 | ST, FBD | Simulation, Hardware | new |
| 5 | State machines and sequences | Intermediate | 3 | ST, SFC | Simulation, Hardware | pedestrian crossing (2) |
| 6 | Feedback, faults and interlocks | Intermediate | 5 | ST, LD | Simulation, Hardware in part | command, feedback and speed (6); tank level, faults and reset (3) |
| 7 | Structuring programs: functions, function blocks, structures, arrays, tasks | Intermediate | 4 | ST, FBD | Simulation, Hardware | new |
| 8 | Testing and diagnosis: scenario tests, temporal assertions, trace, breakpoints | Advanced | 6 | ST | Simulation | conveyor classification and jam (4); temporal assertions (9); two parts, one decision (10) |
| 9 | Instruction List, and one logic in five languages | Advanced | 7 | IL, all | Simulation, Hardware | new |
| 10 | Communications: Modbus and MQTT basics | Advanced | 7 | ST, FBD | Simulation with loopback endpoints started by Studio (COM-009), Hardware | new |
| 11 | Capstone: a small machine from description to tested program | Advanced | 8 | learner's choice | Simulation, Hardware | new |

**Sequencing rationale.** The scan cycle comes first because seal-in, edges and timers cannot be understood without it. The first blink follows immediately so that the learner sees a result within minutes. Boolean logic is taught in Ladder beside Structured Text, because relay logic is how the subject is traditionally introduced and both views of the same logic reinforce each other. Function Block Diagram arrives with timers and counters, which are blocks. Sequential Function Chart arrives with sequences. Testing comes once the learner has programs worth testing. Instruction List comes late, as a way to read low-level and legacy code. Communications come last because they need everything before them.

#### Requirements
**Entry and home**
- **LRN-001** A Learn button on the Welcome screen, a Learn item in the activity rail and a Learn entry in the Help menu MUST open the Learn home with no project open and no network.
- **LRN-002** The Learn home MUST show the tracks, the modules in order with their level, prerequisites and estimated time, the state of each lesson (locked, available, in progress, passed), and a Continue action that resumes the last lesson.
- **LRN-003** Starting a lesson MUST create or reopen that lesson's workspace without a manual copy step, and resetting a lesson MUST restore its starter after confirmation.
- **LRN-004** A lesson MUST be shown in a surface of its own that stays visible beside the editor and the simulation, not in a tab of the results panel.

**Curriculum**
- **LRN-005** The course MUST be organised as modules of lessons with a level, prerequisites and learning objectives; a lesson MUST be locked until its prerequisites are passed, and an "unlock all" setting MUST exist.
- **LRN-006** The course MUST follow the module order and rationale of the curriculum table above, beginning with the scan cycle and a first blink, and the course outline MUST state that rationale to the learner.
- **LRN-007** The ten existing lessons MUST be kept, repaired and placed in the modules shown in the curriculum table, in a course outline that lists every planned lesson of every module with its language and tracks and is written before any new lesson.
- **LRN-008** For each of ST, LD, FBD, SFC and IL the course MUST contain at least one lesson that introduces the language and at least one graded exercise in which the learner edits a program in that language; the first blink MUST be offered in LD and in ST.
- **LRN-009** Every lesson MUST declare its id, version, module, level, prerequisites, objectives, languages, supported tracks, plant or faceplate, starter, reference solution, reference scenario with its content hash, and estimated time.
- **LRN-010** Every lesson MUST keep the stages Objective, Predict, Edit, Run, Observe and Reflect, offer at least two levels of hint, and offer the reference solution on request, recording in the progress that it was shown.
- **LRN-011** Every lesson MUST state which tracks it supports, and where a track is not supported MUST say why and what to do instead.

**Tracks**
- **LRN-012** Every Foundation and Intermediate lesson MUST be completable in simulation with no hardware, and a first-time user MUST reach a blinking simulated output within ten minutes of first launch by following only what Studio shows.
- **LRN-013** On the hardware track the learner MUST be able to choose the ESP32-S3 or the Raspberry Pi Pico, see that board's wiring for the lesson, and run and check the lesson's program on the board.
- **LRN-014** For each of the two learner boards Studio and the docs MUST provide a pin map generated from the board's I/O description, a wiring diagram for every hardware lesson, one bill of materials for the whole course, prebuilt firmware with its checksum, flashing steps the learner performs, and a "verify my board" lesson that checks identity, blinks an LED and reads a button: on the Raspberry Pi Pico the on-board LED, on the ESP32-S3-DevKitC-1 an external LED on the header pin shown on the wiring card (an RGB driver for its on-board LED may follow as an optional extra).
- **LRN-015** Every physical operation in the course (flash, connect, deploy, RUN, STOP, force) MUST be started by an explicit action of the learner; Learn MUST NOT start one by itself.
- **LRN-016** Hardware lessons MUST use only logic-level inputs and outputs and low-voltage parts, and every wiring page MUST state the voltage limit; the course contains no mains wiring.

**Live plant and I/O faceplate**
- **LRN-017** During any live simulation of any project, a faceplate MUST list the program's inputs and outputs from its I/O map, let the user operate inputs (switch, push button, slider), and show outputs live; input changes MUST be applied by the runtime at a scan boundary.
- **LRN-018** The motor, conveyor, tank and pedestrian-crossing plants MUST run live in closed loop with the simulated program, drawn as two-dimensional schematics with play, pause, step and the fault actions each plant defines, and bound to the program's I/O by an explicit mapping, not by fixed names.
- **LRN-019** A plant MUST be deterministic: the same program and input script produce the same trace on every platform.
- **LRN-020** Recorded replay of a scenario run MUST remain available and be labelled as a replay.
- **LRN-021** Every lesson that names a plant MUST ship that plant's mapping in its starter.

**Grading**
- **LRN-022** A lesson MUST pass only when the learner's program passes the lesson's reference scenario, taken from the lesson package and identified by the content hash in the lesson metadata; editing a scenario in the workspace MUST NOT produce a pass.
- **LRN-023** Grading in simulation MUST be deterministic, and each grade MUST record the lesson id and version, scenario hash, program hash, runtime version and time.
- **LRN-024** A hardware check MUST evaluate the same reference scenario on a trace recorded from the board, with the tolerances the lesson declares, and its result MUST be labelled a hardware run, distinct from a simulation pass.
- **LRN-025** CI MUST prove for every lesson and both languages that the starter fails the reference scenario, the reference solution passes it, every time and value quoted in the lesson text exists in the reference scenario, and every file the text cites exists in the starter.
- **LRN-026** A failed check MUST show which assertion failed, at what time, the expected and observed values, and a link to that point in the trace.

**Content, progress and reach**
- **LRN-027** A lesson MUST be a data package (a manifest validated by a schema, text per language, starter, solution, scenario, plant mapping, wiring assets); adding a lesson MUST require no change to application code.
- **LRN-028** Lesson ids MUST have one source, the lesson manifests; Studio, the progress store, the MCP course resource and the docs MUST read a generated index, and CI MUST fail on a hand-written id list.
- **LRN-029** Every lesson, hint, plant label and wiring page MUST exist in English and Spanish with the same structure, in the register of decision D-10, and Learn MUST follow the application's language setting.
- **LRN-030** The whole simulation track MUST work offline from the installed application, including curriculum module 10 against the loopback endpoints of COM-009.
- **LRN-031** Progress (passed lessons with their grade records, lessons in progress, the last lesson, hints and solutions used) MUST survive restart and upgrade, including migration of the existing progress file.
- **LRN-032** Progress MUST be exportable to a file and importable with validation and merge.
- **LRN-033** For educators the course MUST provide a printable outline with objectives per lesson, a command that verifies an exported progress file against the lesson hashes, a classroom setting that hides solutions, and an educator guide; none of this may need an account or a server.
- **LRN-034** The MCP course resource MUST stay read-only: no AI or MCP path can mark a lesson passed.
- **LRN-035** The docs site MUST have, in both languages, a page for every module and lesson generated from the lesson packages, and pages for Learn, plants, the faceplate, the scenario format and each learner board's kit.
- **LRN-036** All 25 example projects MUST be kept and build in CI; the Welcome screen MUST group them by level and topic and show each one's language and target; each hardware example MUST have a scenario or state why it has none.
- **LRN-037** Learn MUST be operable by keyboard and screen reader, and every plant animation MUST have a text equivalent of its state.
- **LRN-038** Lesson 5 MUST have the learner edit a Ladder program, lesson 10 MUST have an Edit stage, and no lesson string may be replaced at run time.

#### Verification
- Lesson CI at host level (LRN-025): starter fails, solution passes, text and scenario agree, both languages have the same structure.
- A hash test proves LRN-022: with the workspace scenario edited to always pass, the lesson still fails.
- The same lesson is graded on Linux, macOS and Windows runners and the trace hashes are compared (LRN-019, LRN-023).
- End-to-end: from a fresh profile with no project, press Learn on the Welcome screen and pass the first two lessons with the keyboard only (LRN-001, LRN-012, LRN-037).
- Hardware lessons are checked with the HIL protocol on both boards and recorded per lesson with board, firmware hash and result (LRN-013, LRN-024): HIL level.
- LRN-012's ten-minute target is manual evidence from at least three first-time users.

#### Risks and dependencies
- Writing a bilingual course across five languages is the largest content task in this spec, and its size is not known until the course outline of LRN-007 exists.
- Lessons cannot be trusted before the languages they teach are correct: depends on CMP, LNG, and on IO-009 for the boards.
- Hardware timing is not reproducible; LRN-024 separates a tolerance-based hardware run from a deterministic simulation pass and must not blur them.
- Depends on UX-011 and UX-022 for the entry points, on COM-019 and HIL-002 for hardware checks, and on REL-022 and REL-024 for firmware images and flashing.

### HIL: Hardware-in-the-loop and hardware evidence
#### Intent
Replace the mocked and decayed hardware tooling with a harness that really compiles, deploys and observes a board, and record the hardware evidence that spec 010 requires, at no cost.

#### Current failures
- **Blocker. No board has hardware evidence.** All six manifest entries are `cross-build` with empty `evidence_refs` (`APP/boards/supported-boards.v1.5.0.json:16-17`, `:52-53`); the hardware gate is pending (`specs/008-release-foundation/artifacts/release-evidence-matrix.md:17`).
- **Major. `packages/zplc-hil` is a mock.** Its runner's compile and upload steps are comments (`packages/zplc-hil/src/runner.ts:101-102`); its seven test files contain no test; CI only type-checks it.
- **Major. `tools/hil` has decayed.** It is the harness that once ran against boards. 27 of its 46 language fixtures no longer compile; about 30 of 49 scripts print PASS or FAIL without failing the run; 11 compiled `.bin` files are tracked; device paths are hard-coded for one macOS machine (`firmware/read_log.py:5`); CI runs only the validators kept in that directory (`.github/workflows/ci.yml:304-308`).
- **Major.** The opcode list in `tools/hil/zplc_tester.py` and the table in `tools/zplc_asm.py` are maintained by hand; `tools/test_crc32_cross.py` compares a library with itself.
- **Minor.** HIL tracing is compiled into the VM run loop on shipped profiles (`APP/boards/rpi_pico_rp2040.conf:43`; `CORE/src/core/zplc_core.c:2035-2056`). `docs/PHYSICAL_TESTING_GUIDE.md` is a 706-line proposed procedure with empty results (`:9`).

#### Scope
- **In:** `packages/zplc-hil`, everything in `tools/hil`, a hardware implementation of the scenario engine's runtime port, the evidence record format, the bench procedure for the two learner boards.
- **Kept:** every file in `packages/zplc-hil` and `tools/hil` (S-1); the serial driver (`zplc_tester.py`, `language_tester.py`); the target tests with real assertions (Modbus, communication security, task replacement); the board-matrix and docs validators.
- **Out:** host conformance (VF); firmware fixes found by the runs (RT, IO, COM).

#### Requirements
- **HIL-001** `packages/zplc-hil` MUST compile with the repository compiler, deploy through the control protocol and observe the device, with no mocked step; each of its test files MUST contain tests that run.
- **HIL-002** The scenario engine's runtime port (`IDE/src/test-engine/index.ts:12-19`) MUST have an implementation backed by a connected board, so that a scenario file used on the host can run on hardware, with time taken from device timestamps and assertions evaluated with a declared tolerance.
- **HIL-003** A hardware scenario run MUST be started only by a person, through a command or a Studio action; it MUST NOT be reachable from MCP or AI tools; forces it applies MUST be released by the tool at the end and on abort, and by the device if the link or the tool is lost (COM-020), leaving the board in STOP with outputs safe. The command MUST refuse to run without an interactive terminal and MUST require, for each physical step, that the person types the board identity the device reports; started without an interactive terminal it MUST exit with an error.
- **HIL-004** Every script in `tools/hil` MUST be kept and MUST either exit with a failure status when a check fails, or be listed in `tools/hil/README.md` as a bench utility with its purpose.
- **HIL-005** Every language fixture in `tools/hil` MUST compile with the 2.0 compiler, corrected where the fixture was wrong, and run in the host conformance suite with its expected values; the fixtures tagged for hardware MUST also run on a board. (Six fixtures in `tools/hil/st_tests` use methods or inheritance, so this requirement closes after CMP-041.)
- **HIL-006** Compiled fixtures MUST be produced at run time and MUST NOT be tracked.
- **HIL-007** The serial port and the board MUST be parameters or detected from USB identifiers; no device path may be hard-coded; the harness MUST run on Linux, macOS and Windows.
- **HIL-008** The Python tools MUST take opcode and format tables from the generated source of VF-012.
- **HIL-009** Every hardware run MUST write a machine-readable record with the commit that the firmware image under test reports (REL-023), that image's hash, board identity, tool versions, the list of tests with results, timing measurements, the operator, the date and the raw logs; a record is bound to the image it tested and is committed to the repository afterwards, never in the commit the image was built from; the board manifest's support level MUST be derived from these records.
- **HIL-010** Before GA, records MUST exist for the Raspberry Pi Pico and the ESP32-S3 covering: flash by a person, identity handshake, deploy, run; blink in each of the five languages; digital loopback; analog read; timer accuracy; scan jitter over at least ten minutes; outputs off after an overrun fault; outputs safe after a commanded STOP and after loss of the link with forces active; watchdog reset time; outputs off after a forced fatal fault; program restored to STOP and RETAIN restored after a power cycle; no partial program after at least 20 power interruptions during deploy; force set and release; atomic multi-byte write; and one fieldbus exchange per board (Modbus RTU on the Pico, Modbus TCP and MQTT on the ESP32-S3) against local endpoints.
- **HIL-011** The other boards MUST stay labelled cross-build, with their hardware watchdog off (RT-020), until a record exists; the harness MUST work with any board that has an I/O description; a report from a user MUST be recordable at a "community-reported" level through an issue template.
- **HIL-012** Under decision D-08's default, one command per board MUST run the whole chain, prompting the person for each physical step under the human-presence guard of HIL-003, in about 30 minutes.
- **HIL-013** HIL tracing MUST be absent from the VM loop of release firmware unless a build option enables it, and a firmware image MUST report its build options.
- **HIL-014** A bench guide in English and Spanish MUST describe the wiring, the parts and the procedure actually executed for the two learner boards.
- **HIL-015** The reference projects MUST run in native simulation and on hardware, and any difference MUST be recorded and reflected in the simulator's capability profile, as spec 009 requires.
- **HIL-016** Any published timing figure MUST cite a hardware record.
- **HIL-017** `tools/test_crc32_cross.py` MUST compare the C implementation with the TypeScript one.

#### Verification
- The harness is tested in CI against firmware built for `native_sim` through a pseudo-terminal. This proves the harness, at native-simulator level; it is not hardware evidence.
- A deliberately failing fixture proves that a failure gives a failing exit status (HIL-004).
- The records of HIL-010 are the hardware evidence; each is bound to a commit and a firmware hash.

#### Risks and dependencies
- Hardware runs need the owner's time and both boards on a bench; power-interruption and retain tests wear flash.
- A scenario on hardware forces inputs, which is a physical operation: HIL-003 keeps it human-started.
- If decision D-05 rewrites history, records made before the rewrite lose their commit binding; rewrite first.
- Depends on COM-019 (protocol), IO-001 (I/O description), RT-019 to RT-025 (the behaviours being measured), VF-001 and VF-012 (the host suite and the generated tables that HIL-005 and HIL-008 use), and CMP (the fixtures must compile).
- HIL-005 cannot close before CMP-041: six fixtures in `tools/hil/st_tests` use methods or inheritance (`full_language_test.st`, `named_params_test.st`, `oop_extends.st`, `oop_extends_simple.st`, `oop_test.st`, `vartemp_hil.st`).
- Gate 6 ordering: the records for GA are made on the draft release's images and committed after the tag (HIL-009), so the manifest inside the tagged commit refers to the records of the last prerelease.

### REL: Release, distribution, CI/CD, firmware binaries
#### Intent
Anyone can install ZPLC Studio and flash a learner board from published files, at no recurring cost to the owner, with integrity they can check, through pipelines that have actually run.

#### Current failures
- **Blocker. The published macOS installers are unsigned previews, and no ZPLC macOS build has ever been signed.** rc.3 was published by manual upload from a non-publishing run. That path disables signing (`IDE/scripts/package-mac-release.mjs:153-161`), which leaves an Apple-silicon bundle without a sealing signature; such bundles are reported as "damaged" and cannot be opened without a terminal (inferred, not reproduced).
- **Blocker. The signed macOS path has never run and requires paid credentials** (`IDE/scripts/package-mac-release.mjs:87`, `:136-152`; `.github/workflows/release.yml:220-225`). Under S-2 it will never be used.
- **Blocker. The Windows path cannot be satisfied and blocks everything.** It expects an exportable certificate file (`release.yml:347-357`, `:366-369`), which public authorities stopped issuing in 2023; publishing needs all three platforms (`release.yml:525`, `:605`), so a missing Windows certificate also blocks macOS and Linux.
- **Blocker. The `.deb` cannot be installed on current Debian or Ubuntu:** it declares `gconf2`, `gconf-service` and `libappindicator1` (`IDE/electron-builder.yml:114-120`), which those distributions no longer ship; CI never installs the package (`release.yml:486-509`).
- **Major. Public statements describe a pipeline; the release contains the opposite.** `README.md:38-42` speaks of signed and notarized artifacts; the evidence matrix marks release integrity "passed" on the strength of workflow structure tests (`specs/008-release-foundation/artifacts/release-evidence-matrix.md:15`); the macOS desktop check is "Pending human execution" (`specs/008-release-foundation/artifacts/evidence-desktop-macos.md:3`).
- **Major. A new user has no download or install path:** the README's quick start is a source build (`README.md:56-68`); the docs say "install the desktop candidate" with no link (`docs/docs/getting-started/index.md:17`); the public site was last deployed on 2026-03-26 because it deploys only from `master` (`.github/workflows/deploy-docs.yml:4-5`).
- **Major. No firmware binaries are published.** CI cross-builds all six boards and discards the results (`.github/workflows/ci.yml:281`); a user must install the Zephyr toolchain before an LED can blink.
- **Major. There is no update path** (`IDE/electron-builder.yml:43`, `publish: null`; no updater code).
- **Major (inferred). The software bill of materials lists installers, not components:** the scan target is the directory of installers (`release.yml:546-554`) and the published file is 17.5 KB for about 1,900 locked packages.
- **Major. The release-evidence machinery is aimed at the wrong thing** (see VF): it pins workflow text and caught none of the above.
- **Minor.** Entitlements are broader than needed (`IDE/build/entitlements.mac.plist:5-12`); Linux serial permissions and AppImage caveats are undocumented; artifact names mix conventions and contain a space (`IDE/electron-builder.yml:9`); `CHANGELOG.md:16` documents a version that has no tag; no third-party notices file is shipped; the packaging filter copies `*.st` files from a directory that has none (`IDE/electron-builder.yml:27-32`).

#### Scope
- **In:** packaging and signing configuration, the release workflow, distribution channels, firmware images, the update notice, integrity material, release notes, the releasing procedure.
- **Kept:** native runners per architecture, the bundled native runtime with its architecture check, the launch smoke test of each package, pinned actions, `SHA256SUMS`, build provenance attestation, the single version source, all fourteen installer files, honest release notes.
- **Out:** paid certificates of any kind (S-2); migration to another desktop framework (`research.md`).

#### Requirements
**macOS**
- **REL-001** Each macOS bundle (x64 and arm64) MUST be ad-hoc signed and sealed, including the nested native runtime, using these electron-builder settings: `mac.identity: "-"`; `mac.binaries` listing `Contents/Resources/native-runtime/zplc_runtime`; `mac.hardenedRuntime: true` with entitlements reduced to `com.apple.security.cs.allow-jit` and `com.apple.security.cs.disable-library-validation`; `mac.notarize: false`; `mac.gatekeeperAssess: false`; targets `dmg` and `zip`; `dmg.sign: false`.
- **REL-002** CI MUST prove the result on both architectures: `codesign --verify --deep --strict` succeeds, `codesign -dv` reports `Signature=adhoc`, the nested runtime is signed, and the application launches from the built bundle.
- **REL-003** The release pipeline MUST need no paid credential on any platform and MUST contain no notarization, stapling or Developer ID assertion.
- **REL-004** A personal Homebrew tap MUST provide a cask that installs the release `.zip` for the user's architecture with a pinned SHA-256, through one fully qualified `brew install --cask` command; the pipeline MUST update the cask's version and checksums after each release; quarantine handling follows decision D-01 and MUST be stated in the README and on the install page.
- **REL-005** The `.dmg` and the `.zip` MUST both be published for each architecture, and the install page MUST give the exact first-run steps for a downloaded DMG (Done, then System Settings, Privacy and Security, Open Anyway, confirm, password) and say plainly that the application is not notarized and why.
- **REL-006** A `curl | sh` installer MUST NOT be the recommended macOS channel; if one is offered it MUST verify the SHA-256 before unpacking.

**Windows** (owner decision S-5 fixes the channels and their order)
- **REL-007** The first Windows channel MUST be the Microsoft Store: an MSIX package for x64 and arm64, built with the electron-builder `appx` target under the identity issued for the Store listing, submitted for certification and re-signed by Microsoft; the project's obligation is the package, its test (REL-008) and its submission, and because certification is Microsoft's decision a pending, refused or failed listing MUST NOT delay GA (REL-038) (design default).
- **REL-008** Before the Store listing is called supported, a recorded test on Windows MUST show that inside the installed MSIX package Studio lists and opens a serial port through Web Serial, starts the native simulator as a child process, and opens and saves a project.
- **REL-009** The second Windows channel MUST be the NSIS installer and the portable executable on GitHub Releases, signed through SignPath Foundation; the repository and site MUST meet its conditions (a code-signing policy page with the required attribution, builds on hosted runners, the artifact uploaded before signing), the application MUST be submitted, and once it is accepted the signature check MUST expect the SignPath Foundation publisher; because acceptance is SignPath Foundation's decision a pending, refused or failed application MUST NOT delay GA (REL-038) (design default).
- **REL-010** Once the SignPath-signed installer is published, a winget manifest that points at it MUST be submitted and updated for each release.
- **REL-038** Until each Windows channel is live, in prereleases and at GA alike, the NSIS installer and the portable executable MUST be published with `unsigned` in their variant (REL-020); the README, the release notes and the install page MUST give the "More info, Run anyway" steps and say that Smart App Control blocks them (the README and the release notes from the first prerelease, the install page once DOC-005 exists); and the release notes MUST state each channel's state (live, submitted, refused or not yet submittable). Once a channel is live the install page MUST recommend that channel first. A pending, refused or failed listing or application never delays GA, and a refusal returns the channel question to the owner (design default). (Numbered out of sequence: added with owner decision S-5.)

**Linux**
- **REL-011** The `.deb` and `.rpm` MUST use electron-builder's default dependencies; CI MUST install the `.deb` in clean Debian 13 and Ubuntu 24.04 containers and the `.rpm` in current Fedora, and launch the application in each.
- **REL-012** The AppImage MUST stay published, with its prerequisites documented; the docs MUST recommend the `.deb` or `.rpm` first.
- **REL-013** The `.deb` and `.rpm` MUST install a udev rule that gives the logged-in user access to the supported boards' USB serial devices, and the docs MUST give the group-based fallback.
- **REL-014** An Arch User Repository (AUR) binary package MUST be maintained, with its version and checksums updated by the pipeline.

**All platforms**
- **REL-015** Each platform's build, signing and publication MUST be independent: a failure or missing approval on one platform MUST NOT prevent publishing the others, and the release MUST state the signing state of every asset.
- **REL-016** A release MUST be created only by the pipeline, as a draft, from the run of its own tag; assets MUST never be uploaded by hand; a person publishes the draft after recording a first-run check on a real Mac and a real Windows machine and, for the GA release, after the hardware records of gate 6 have been made on the draft's firmware images.
- **REL-017** `SHA256SUMS` and a build provenance attestation MUST cover every asset (installers, firmware images, CLI); the install page MUST give one command to verify each and MUST say that an attestation proves where a file was built, not that it is safe, and does not change operating-system warnings.
- **REL-018** The software bill of materials MUST be generated from the source tree and lockfiles, and CI MUST fail when it contains fewer packages than a recorded floor.
- **REL-019** Third-party licence notices, including the bundled fonts, MUST be generated at packaging time and shipped inside every installer.
- **REL-020** All fourteen installer files (DMG and ZIP, NSIS and portable, AppImage, DEB and RPM, each for two architectures) MUST keep being published under one naming scheme, `<product>-<version>-<os>-<arch>[-<variant>].<ext>`, in lower case with no spaces. The variant is `setup` for the NSIS installer and `portable` for the portable executable, and `unsigned` is appended to it while REL-038 applies (for example `...-setup-unsigned.exe`); the other formats take no variant and differ by extension, so the fourteen files have fourteen distinct names.
- **REL-021** Studio MUST check the latest release on start and on request, and show a dismissible notice that links to the release and to the update step of the user's channel; the check MUST be optional, silent when offline, and MUST NOT download or install anything.
- **REL-022** Every release MUST include prebuilt runtime firmware for every board in the manifest in that board's flashable format (UF2 for the Pico, a merged binary for the ESP32-S3, binary and ELF for the others), named `zplc-runtime-<version>-<board>.<ext>`, covered by the checksums and attestation, and labelled with the board's evidence level.
- **REL-023** Every firmware image MUST embed its version, the commit it was built from, board identity, ABI version and build options and report them in the connection handshake; Studio MUST warn when they do not match its own version.
- **REL-024** The docs site MUST offer a flashing page: a browser flasher over Web Serial for the ESP32-S3, and a download with boot-mode steps for the Pico; a person starts the flash; command-line alternatives MUST be documented for every board.
- **REL-025** For the selected board Studio MUST show the matching firmware image, its checksum and the flashing steps, with the two learner-board images available offline; Studio MUST NOT flash.
- **REL-026** The release MUST include the CLI and MCP server for every desktop platform and architecture (IDE-026).
- **REL-027** Release notes MUST be generated from what ran: for each asset the run that built it, its signing state, the tests executed and the evidence level; they MUST contain a user-facing list of changes and known issues, and no claim that a check in that run does not support.
- **REL-028** The README and the install page MUST open with a Download section with one line per operating system and its honest first-run note.
- **REL-029** One `RELEASING.md` checklist MUST describe the whole procedure: version bump, green CI, rehearsal, tag, draft, manual checks, publish, then the tap, AUR, Store and winget updates.
- **REL-030** The complete pipeline, including signing, MUST be runnable as a rehearsal that publishes nothing, and one rehearsal and one tag release produced entirely by the pipeline MUST be recorded before GA.
- **REL-031** The version MUST keep one source; the changelog MUST contain only tagged versions; the product name and `appId` MUST be fixed by decision D-03 before the first Store or signed release; prerelease tags after `2.0.0-rc.3` MUST continue the `rc` sequence (`2.0.0-rc.4` onward), because an alpha, beta or preview name would sort below `rc.3` under semantic versioning, and the release title MUST say how complete each prerelease is (design default).
- **REL-032** The reproducibility check MUST be kept and MUST NOT block a release run.
- **REL-033** The docs site MUST be deployed from the branch that holds 2.0 (decision D-12) and show the version of the latest release.
- **REL-034** The installed application MUST contain the example projects and the course content, proven by a packaged-application test that opens an example and a lesson.
- **REL-035** `RELEASING.md` MUST list every external service the release uses with its cost, all of which are zero; adding a paid service requires an owner decision.
- **REL-036** Every published installer format MUST be installed or mounted and launched by CI on its own operating system before the draft is created.
- **REL-037** If decision D-07 selects 2.0, a hosted web build MUST be deployed with the docs site and state which features it lacks.

#### Verification
- Outcome checks in the pipeline (VF-021): signature kind, package installation in clean containers, launch of every format, checksum and attestation verification of the draft's assets, bill-of-materials size.
- A macOS runner installs the cask from the tap and launches the application (REL-004).
- Manual evidence recorded in the release checklist: a browser download opened on a real Mac (Apple silicon, and Intel where available) following REL-005; the Windows installer on Windows 11 with Smart App Control on and off; and the MSIX test of REL-008, which the distribution research marks as untested for both Web Serial and the child process.
- REL-030's rehearsal run is the proof that the pipeline works before a tag depends on it.

#### Risks and dependencies
- Homebrew may add an audit that rejects casks which remove quarantine; option B of D-01 is the fallback and costs the user four clicks.
- A future macOS may tighten rules for ad-hoc signed applications; the web build of D-07 is the hedge.
- The Microsoft Store individual account is for work "not in relation to a business"; if ZPLC is tied to the owner's company the wording matters. SignPath Foundation may decline a single-maintainer project. Both are applications, not purchases, and may take weeks or be refused; REL-038 applies to prereleases and to GA until each is live, so neither outside decision can delay GA (a design default, section 4.6).
- If REL-008 fails for Web Serial or for the child process, the Store package cannot be the supported channel as it stands, and S-5 needs the owner's attention again; GA still proceeds on the fallback.
- Smart App Control blocks unsigned Windows applications with no per-application bypass.
- The behaviour of `identity: "-"` on the pinned electron-builder version must be verified first; an `afterPack` hook that runs `codesign --force --deep --sign -` is the fallback. The existing hook only clears extended attributes (`IDE/scripts/after-pack.mjs`).
- An ad-hoc signature has no stable identity, so macOS privacy permissions may be asked again after each update.

### DOC: Documentation, identity, repository hygiene
#### Intent
Documentation written for controls engineers that takes a newcomer from nothing to a blinking output, with reference pages generated from the source, and a repository whose public surface describes the product and not the process that built it.

#### Current failures
- **Blocker. Seven English pages and six Spanish pages end mid-sentence**, among them Getting Started (`docs/docs/getting-started/index.md:47`, `docs/docs/ide/index.md:39`, `docs/docs/ide/overview.md:28`, `docs/docs/ide/editors.md:25`, `docs/docs/ide/features.md:40`, `docs/docs/ide/compiler.md:35`, `docs/docs/ide/deployment.md:33`).
- **Blocker. The landing page shows AI-generated pictures of a different product** ("QUANTUM LOGIC | Control Studio", `docs/static/img/hero-ide-runtime.png` used at `docs/src/components/LandingPage/Hero.js:58`; `docs/static/img/architecture-diagram.png` at `docs/src/components/LandingPage/ArchitectureSection.js:18`). There is no real screenshot anywhere.
- **Blocker. There is no documented path from nothing to a blinking output.** No download link, no first-run steps, no "your first program", and the board path stops mid-sentence (`docs/docs/getting-started/index.md:17`, `:19`, `:35`, `:46`); the Zephyr set-up page has no command (`docs/docs/reference/zephyr-workspace-setup.md:16-19`); a source build needs a native runtime nobody is told to build (`IDE/electron/nativeSimulationSupervisor.ts:196`).
- **Major. Product language was replaced by compliance language** (`README.md:3`, `:5-7`, `:19`, `:36-47`; `docs/docusaurus.config.js:85`): the word "evidence" appears 110 times in about 18,200 words, and the README never says what a user can build or how ZPLC compares with OpenPLC, Beremiz, CODESYS or the Arduino PLC IDE. The test engine, the 25 examples, the CLI, Learn and Lab are effectively undocumented.
- **Major. Internal process output is published as documentation:** an architecture file signed by an AI tool that calls the project's own locking "a lie" (`ARCHITECTURE.md:194`, `:129`), release gates owned by "AI" (`specs/008-release-foundation/artifacts/release-evidence-matrix.md:11-15`), the internal docs tracker (`docs/docs/reference/v1-5-canonical-docs-manifest.md`), and instructions to the writer left inside pages (`docs/docs/languages/st.md:51-61`, `docs/docs/runtime/memory-model.md:92-97`, `docs/docs/runtime/isa.md:136-140`).
- **Major. The language and function-block reference cannot be used:** the Structured Text page is 76 lines with no types, operators or I/O addressing (`docs/docs/languages/st.md`); the page with function-block pin tables is not in the sidebar (`docs/docs/runtime/stdlib.md`); eight pages are missing from `docs/sidebars.js`; there is no troubleshooting page and no `zplc.json` reference.
- **Major. Published claims exceed behaviour:** "Full ST Support: Variables, arrays, structs, functions, function blocks" (`packages/zplc-compiler/README.md:7`); `docs/docs/languages/structured-text.md` lists `LINT`, `LREAL` and `DATE` as supported.
- **Major. Evidence vocabulary is repeated everywhere:** the board table is published three times (`docs/docs/reference/index.md:24-31`, `capabilities-evidence.md:33-40`, `boards.md:37-44`), with two different tier vocabularies, and the release notes list no change a user would notice.
- **Major. Spanish prose is not publishable:** three registers, machine output on live pages (`docs/i18n/es/docusaurus-plugin-content-docs/current/operations/shell.md:38-50`), and navigation labels that are not localised (`docs/docusaurus.config.js:102`, `docs/sidebars.js:10`).
- **Major. The public front door is inconsistent:** the default branch and site show version 1.5; the product has three names, three marks and three palettes (`docs/src/css/custom.css:23-25` against `IDE/DESIGN.md:5-12`); the site has no search although a comment says it does (`docs/docusaurus.config.js:51-52`).
- **Major. Wrong or stale instructions:** 19 of 32 checked claims, for example functions that do not exist (`docs/docs/integration/index.md:31-32`), a Kconfig symbol that does not exist (`docs/docs/runtime/native-c.md:34`), shell commands documented wrongly (`docs/docs/operations/shell.md:49`, `:50`, `:55`), a wrong port (`README.md:79`), a misspelt variable (`README.md:113`), and stale versions in `AGENTS.md:48`, `:50`.
- **Major. Repository hygiene:** tracked scratch files (`IDE/monaco_test.ts`, `IDE/test_mpeek_2.ts`, `IDE/output_fbd.txt`, `packages/zplc.json`), tracked build output (`APP/build_tests/`), a broken root `Makefile:3`, template posts in `docs/blog/`, sixteen generic agent skills in `.agents/skills/`, a 34 MB schematic in history, four task-runner entry points and none authoritative.
- **Major. Contributor experience:** `CONTRIBUTING.md` is 20 lines with no command and begins by sending the reader to the agent file (`CONTRIBUTING.md:3`); there is no code of conduct, issue template, pull-request template or roadmap.

#### Scope
- **In:** the docs site (structure, content, images, Spanish, theme), the README, generated references, product identity, repository clean-up, contributor documents.
- **Kept:** the precise limitation statements, the generated runtime and board references, broken-link failure in the build, the two well-shaped pages (`docs/docs/ide/ai-privacy.md`, `docs/docs/ide/migration-v1-to-v2.md`), `SECURITY.md`, `VERSIONING.md`, the constitution, the honesty discipline compressed to one page.
- **Out:** the course content itself (LRN); installer and flashing mechanics (REL).

#### Requirements
**Content and structure**
- **DOC-001** No published page may end mid-sentence or contain instructions addressed to its author; the seven truncated pages and their Spanish twins MUST be completed.
- **DOC-002** The docs MUST be organised by reader intent (Start here, How-to guides, Reference, Concepts, Learn, Project), with every page in the sidebar.
- **DOC-003** A tutorial "Blink without hardware" MUST take a reader from download to a toggling simulated output and a passing scenario test, with a real screenshot per step; an end-to-end test MUST perform the same steps so that the page cannot drift.
- **DOC-004** A "First board" tutorial MUST exist for the Raspberry Pi Pico and for the ESP32-S3 (get firmware, flash, connect, deploy, start, observe), and a "Build firmware from source" page MUST use the same script CI runs.
- **DOC-005** An install page MUST give, per operating system and channel, the download, the verification commands, the first-run warnings and steps, Linux serial permissions, and a troubleshooting section.
- **DOC-006** The language reference MUST be generated from the tracked conformance matrix (`conformance/matrix.json`, VF-003), with the status of each element taken from executed tests, one page per language with screenshots of its editor, I/O addressing, and an explicit list of what is not supported.
- **DOC-007** The function and function-block reference MUST be generated from the compiler registry: each of the 61 functions and 34 blocks has its signature or pin table, a description and an example proven by execution; CI MUST fail when a registered name has no entry.
- **DOC-008** These references MUST be generated from source: runtime C API, boards, Kconfig options, shell commands, protocol messages, the `zplc.json` schema, the scenario file format, CLI commands, and MCP tools and resources.
- **DOC-009** How-to pages MUST exist for Modbus RTU and TCP, MQTT and Sparkplug B, the cloud blocks, mapping I/O to pins, simulating and debugging, writing scenario tests, using the CLI, using AI and MCP safely, migrating a version 1 project, porting to a new board, and troubleshooting; each with a working configuration fragment.
- **DOC-010** Hardware support status (tier definitions and the generated board table) and safety and limitations (not a safety PLC; the hard limits) MUST each be one page that other pages link to, with one tier vocabulary.
- **DOC-011** The README MUST say on its first screen what ZPLC is, what a user can do today, what it runs on and how to try it, with a download link, one status line, the licence, and a dated, sourced comparison with OpenPLC, Beremiz, CODESYS and the Arduino PLC IDE.
- **DOC-012** No public text (README, docs, package READMEs, release notes, site metadata) may state a capability that section 6, the board manifest or the simulator capability profile marks as not working at the stated evidence level.
- **DOC-013** Every image of the product MUST be a real screenshot or recording captured by automation from the current version; no generated or mock image of the product may be published; the architecture picture MUST be a maintained diagram source.
- **DOC-014** CI MUST check that the function names, Kconfig symbols, shell commands and file paths the docs mention exist in the source; the 19 known wrong statements MUST be corrected.

**Spanish**
- **DOC-015** The Spanish pages MUST be rewritten from the final English text in the single register of decision D-10 and read by a fluent reviewer; navigation, footer and sidebar labels MUST be localised through the site's translation files.
- **DOC-016** A page MUST be published only when its English and Spanish versions are both complete (constitution rule 8).

**Identity and site**
- **DOC-017** One naming scheme (decision D-03), one vector mark (favicon, application icon, social card at 1200 by 630) and one palette (the Studio palette) MUST be used across the application, installers, site, README and GitHub description.
- **DOC-018** The site MUST have search, no version selector until a second version is published, admonitions in the site generator's own syntax, and correct image formats.
- **DOC-019** The default branch, the GitHub description, the release marked latest and the docs site MUST describe the same current version (decision D-12).

**Repository**
- **DOC-020** These non-functional items MUST be removed from the tree: `IDE/monaco_test.ts`, `IDE/test_mpeek_2.ts`, `IDE/output_fbd.txt`, `IDE/output_ld.txt`, `IDE/output_sfc.txt`, `packages/zplc.json`, `APP/build_tests/`, `IDE/src/components/WatchWindow.tsx`, `IDE/src/App.css`, the template images and posts under `docs/blog/` and `docs/static/img/`, the two generated landing images, the duplicate `docs/assets/banner.png`, the orphan `docs/i18n/es/docusaurus-plugin-content-docs/version-1.0.0/`, `.dockerignore`, `.eslintignore`, and the root `Makefile` unless it is repaired; `.gitignore` MUST cover build directories.
- **DOC-021** Internal process output MUST leave the public surface: `ARCHITECTURE.md` becomes a current overview, the docs tracker and source-of-truth pages move to contributor documentation, and release records name their real owners.
- **DOC-022** `AGENTS.md` and the project skill `.agents/skills/zplc-plc-programmer` MUST be kept and made current; generic third-party agent skills MUST NOT be tracked; `AGENTS.md` MUST point to `CONTRIBUTING.md`, not the reverse.
- **DOC-023** One task runner MUST be the documented entry point, with recipes for set-up, build, each test layer, simulation, docs and the release rehearsal.
- **DOC-024** `CONTRIBUTING.md` MUST contain copy-and-paste set-up, build and test commands for each layer, including building the native runtime, with expected durations; a code of conduct, issue templates (bug, board report), a pull-request template and a roadmap (done, next, later) MUST exist.
- **DOC-025** Spec 010 MUST gain a note that points to this spec as soon as this spec is tracked (decision D-09), and abandoned spec folders MUST be marked superseded.
- **DOC-026** The root `examples/` directory of VM assembly fixtures MUST be labelled or moved to the test fixtures, and the PLC example projects MUST be easy to find from the repository root.
- **DOC-027** If decision D-05 is approved, history MUST be rewritten once to remove the schematic PDF and old build outputs, a mirror of the old history MUST be kept so that earlier SHAs stay resolvable, and the header of this spec MUST record the new SHA of its baseline.
- **DOC-028** Stale remote branches SHOULD be deleted once merged or obsolete.
- **DOC-029** The engineering principles of the constitution MUST be readable from the contributor documentation.
- **DOC-030** The changelog and release notes MUST list, for each release, what changed for users, breaking changes and known issues.

#### Verification
- The site build with broken links as errors (kept), the validators of VF-019 and VF-020, and drift checks on every generated reference.
- DOC-003 is proven by the end-to-end test that follows the tutorial; screenshots come from the same run (DOC-013).
- DOC-014 is a CI script over the docs sources.
- Manual evidence: one person who does not know the project follows both tutorials and records the time and every obstacle; a fluent reviewer signs off the Spanish text.

#### Risks and dependencies
- The amount of writing, in two languages, is large; generated references reduce it only if the compiler registry and command tables carry descriptions.
- DOC-006 and DOC-007 depend on CMP; DOC-003 and DOC-013 on UX and VF-008; DOC-005 on REL.
- DOC-027 is destructive and irreversible for existing clones.

## 6. IEC 61131-3 conformance matrix for 2.0
**Rule.** Anything that works, is partial, or is parsed today must work in 2.0 and be covered by an executed test (VF-003). An element that does not exist today is either assigned to 2.0 here, because a professional needs it to trust the tool, or left to decision D-04 with a recommendation.

**State today:** *Works* (correct in executed probes), *Partial* (correct for a subset), *Broken* (accepted, wrong result or fault), *Ignored* (parsed, no effect), *Missing* (rejected or absent). States come from the review's execution of about 120 programs on the real VM, except where a row says "not executed".

### 6.1 Data types
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| `BOOL` | Works | Works | CMP-025 |
| `USINT`, `UINT` | Works | Works | CMP-012 |
| `SINT`, `INT` | Broken for negative values | Works | CMP-011 |
| `DINT` | Works; overflow undefined | Works | CMP-011, CMP-016 |
| `UDINT` | Partial: signed compare and divide; large literals fail | Works | CMP-012 |
| `LINT`, `ULINT`, `LWORD` | Broken: VM fault or assembler error | Works | CMP-015 |
| `REAL` | Partial: positive, same-typed operands only | Works | CMP-013 |
| `LREAL` | Broken: 32-bit arithmetic on 64-bit storage | Works | CMP-015 |
| `TIME` | Partial: one unit per literal; wraps at 24.8 days | Works | CMP-017 |
| `DATE`, `TOD`, `DT` | Ignored beyond storage | Works: literals, assignment, comparison, plus and minus `TIME` | CMP-017 |
| `LTIME`, `LDATE`, `LTOD`, `LDT` | Missing | Decision D-04 (2.x recommended); rejected with a message | CMP-003 |
| `CHAR`, `WCHAR` | Missing; `CHAR` accepted with size 0 | Decision D-04 (2.x recommended); rejected with a message | CMP-003 |
| `STRING`, `STRING[n]` | Broken for variables; `[n]` missing | Works | CMP-021 |
| `WSTRING` | Partial: literals and `LEN` | Works | CMP-021 |
| `BYTE`, `WORD`, `DWORD` | Partial: capitals only; `NOT` wrong | Works | CMP-004, CMP-014 |
| Arrays, one to three dimensions, of `BOOL`, `INT`, `DINT`, `REAL` | Works | Works | CMP-022 |
| Arrays with negative or constant bounds; arrays of structures, function blocks, strings, 64-bit types | Missing | Works | CMP-022 |
| Arrays of arrays | Missing | Decision D-04 (2.x recommended) | CMP-006 |
| Array initialisers | Broken: VM fault | Works | CMP-022, CMP-025 |
| Array bounds checking | Missing | Works | CMP-023 |
| `STRUCT` | Broken: 8-bit member reads, nesting, copy | Works | CMP-019 |
| Enumerations | Broken: width; not usable in `CASE` | Works, with `Type#Value` | CMP-020 |
| Enumerations with a base type; subranges | Missing | Decision D-04 (2.x recommended) | CMP-006 |
| Type aliases; several types in one `TYPE` block | Missing | Works | CMP-030 |
| `REF_TO`, `REF()`, `^` | Partial: untyped, no null check | Works | CMP-024 |
| `POINTER TO`, `ADR` | Missing | Decision D-04 (2.x recommended) | CMP-006 |

### 6.2 Literals
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| Decimal, real, exponent, `TRUE`, `FALSE` | Works | Works | CMP-011, CMP-013 |
| `T#`, `D#`, `TOD#`, `DT#`, string literals | Works | Works | CMP-017, CMP-021 |
| Compound and fractional time literals | Missing | Works | CMP-017 |
| Based literals `2#`, `8#`, `16#`; digit separators | Missing; `0x` accepted instead | Works; `0x` kept with a warning | CMP-031 |
| Typed literals such as `INT#5` | Missing | Works | CMP-031 |

### 6.3 Declarations
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| `VAR`, `VAR_INPUT`, `VAR_OUTPUT` | Works | Works | CMP-025 |
| `VAR_IN_OUT` | Broken: passed by value | Works | CMP-028 |
| `VAR_TEMP` | Broken: static; rejected in a PROGRAM | Works | CMP-027, CMP-030 |
| `VAR_GLOBAL` | Broken: initial values ignored; one copy per program | Works | CMP-025, CMP-042 |
| `VAR_GLOBAL CONSTANT` | Broken: value not set; writable | Works | CMP-026 |
| `VAR CONSTANT` | Missing | Works | CMP-026 |
| `VAR_EXTERNAL` | Missing | Works | CMP-030 |
| `VAR_ACCESS`, `VAR_CONFIG`, `PERSISTENT` | Missing | Decision D-04 (2.x recommended) | CMP-006 |
| `RETAIN`, `NON_RETAIN` | Missing: rejected by the parser | Works | CMP-029, RT-025 |
| `AT %I`, `AT %Q` (bit, byte, word, double word) | Works | Works | CMP-047, IO-003 |
| `AT %M` | Partial: per program; can collide | Works | CMP-044 |
| Several names in one declaration | Missing | Works | CMP-030 |
| Initial values | Broken outside PROGRAM blocks | Works | CMP-025 |

### 6.4 Program organisation units
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| `PROGRAM` (one per file) | Works | Works | CMP-042 |
| `FUNCTION` | Partial: static locals, arguments bound by position, arity unchecked | Works | CMP-027, CMP-035, CMP-036 |
| `FUNCTION_BLOCK` with state and several instances | Works | Works | CMP-038 |
| Function-block instances inside function blocks; arrays of instances | Broken or missing | Works | CMP-038 |
| Function-block call with named inputs | Partial: unknown names ignored | Works | CMP-037 |
| Function-block call with `=>` | Missing | Works | CMP-037 |
| Positional function-block call | Missing | Decision D-04 (2.x recommended) | CMP-006 |
| Methods, `THIS` | Partial: inlined statically | Works | CMP-041 |
| `EXTENDS`, `OVERRIDE`, `FINAL`, `SUPER^` | Partial: base body not run; `SUPER^` dropped | Works | CMP-041 |
| Interfaces, `IMPLEMENTS` | Ignored at run time | Works | CMP-041 |
| `PUBLIC`, `PRIVATE`, `PROTECTED`, `ABSTRACT` | Ignored | Works: enforced | CMP-041 |
| Properties, namespaces, `ACTION` blocks | Missing | Decision D-04 (2.x recommended) | CMP-006 |
| POUs and globals shared across files; libraries | Missing | Works | CMP-042, CMP-046 |

### 6.5 Statements and operators
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| `IF`, `WHILE`, `REPEAT`, `EXIT`, `CONTINUE` | Works | Works | CMP-039 |
| `FOR` | Partial: negative step never runs; counter must be a program variable | Works | CMP-039 |
| `CASE` | Partial: non-negative integer labels and lists only | Works | CMP-040 |
| `RETURN` | Broken: halts the scan | Works | CMP-036 |
| Function call as a statement; empty statement | Missing | Works | CMP-035, CMP-032 |
| `+ - * / MOD` and comparisons | Partial: `DINT` and positive `REAL` only | Works | CMP-011, CMP-012, CMP-013 |
| `AND`, `OR`, `XOR`, `NOT` | Partial: `NOT` masked to one bit | Works | CMP-014 |
| `**`, `&`, bit access `w.0` | Missing | Works | CMP-032 |
| Comments `(* *)` | Works; an unterminated comment is misreported | Works | CMP-009 |
| Comments `/* */` | Missing | Works | CMP-032 |

### 6.6 Conversions and standard functions
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| Implicit widening conversion | Missing: no conversion is inserted | Works | CMP-005 |
| `INT_TO_REAL`, `REAL_TO_INT`, `BOOL_TO_INT`, `INT_TO_BOOL`, `TRUNC`, `ROUND` | Partial: wrong for negative values; `REAL_TO_INT` truncates | Works | CMP-057 |
| All other `X_TO_Y` conversions | Missing: an unknown name returns 0 | Works | CMP-057 |
| `ABS`, `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`, `SQRT` | Partial: correct for positive operands | Works | CMP-011, CMP-058 |
| Trigonometric, logarithmic and exponential functions | Registered; not executed | Works | CMP-058 |
| `SHL`, `SHR`, `ROL`, `ROR` and the word logic functions | `SHL` and `ROL` work; the rest not executed | Works | CMP-014, CMP-058 |
| String functions (14) | Broken: modify arguments; unusable with variables | Works | CMP-021 |
| `UPTIME`, `CYCLE_TIME`, `WATCHDOG_RESET` | Registered, not executed; `WATCHDOG_RESET` is a documented no-op | Works; `WATCHDOG_RESET` as RT-034 defines | CMP-058, RT-034 |
| Function forms of operators (`ADD`, `MUL`, `GT`, `EQ`, `MOVE`) | Missing | Decision D-04 (2.x recommended) | CMP-006 |

### 6.7 Standard and library function blocks
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| `TON` | Partial: elapsed time passes the preset | Works | CMP-057 |
| `TOF` | Works | Works | CMP-057 |
| `TP` | Broken: restarts while the input stays true | Works | CMP-057 |
| `CTU`, `CTD`, `CTUD` | Works | Works | CMP-058 |
| `R_TRIG`, `F_TRIG`, `SR`, `RS` | Works | Works | CMP-058 |
| `BLINK`, `PWM`, `PULSE`, `HYSTERESIS`, `DEADBAND`, `LAG_FILTER`, `RAMP_REAL`, `INTEGRAL`, `DERIVATIVE`, `PID_Compact`, `FIFO`, `LIFO` (not in the standard) | Present; not executed | Works | CMP-058 |
| Communication and cloud blocks (12) | Broken: handshake and bounds | Works | COM-001 to COM-009 |

### 6.8 Sequential Function Chart
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| Steps, initial step, transitions | Partial: several transitions can fire in one scan | Works | LNG-024 |
| Step time `.T`; action qualifier `N` | Works | Works | LNG-025 |
| Step flag `.X` | Missing | Works | LNG-025 |
| Qualifiers `S`, `R`, `P` | Shown in the legend; do not compile | Works | LNG-025 |
| Qualifiers `P0`, `P1`, `L`, `D` | Missing | Works | LNG-025 |
| Qualifiers `SD`, `DS`, `SL` | Missing | Decision D-04 (2.x recommended) | LNG-002 |
| Selection branches | Partial: file order decides | Works, with a defined priority | LNG-025 |
| Simultaneous divergence and convergence | Missing | Works | LNG-025 |
| Charts of more than 14 steps | Broken: memory limit per program | Works | LNG-025, CMP-043 |

### 6.9 Instruction List
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| The 34 implemented operators on a `DINT` or `BOOL` accumulator, including function-block calls `CAL`, `CALC` and `CALCN` with named parameters and the returns `RET`, `RETC` and `RETCN` (`IDE/src/compiler/il/ilToST.ts:442-484`, `IDE/src/compiler/il/parser.ts:334`, `:399-416`) | Partial: translated, no test executes them | Works | LNG-019, LNG-020 |
| Unknown mnemonic | Broken: the parser does not terminate | Reported as an error | LNG-017 |
| `JMP`, `JMPC`, `JMPCN`, labels | Broken: correct on the first scan only | Works | LNG-018 |
| Parenthesised operations | Ignored | Works | LNG-019 |
| Typed accumulator; calls of functions (function-block calls exist, above); shifts | Missing | Works | LNG-019 |

### 6.10 Ladder Diagram and Function Block Diagram
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| LD: normally open and closed contacts; normal, negated, set and reset coils | Works | Works | LNG-022 |
| LD: parallel branches | Partial: flat only; a coil sees every contact of the rung | Works, including nested branches | LNG-021 |
| LD: edge contacts and edge coils | Offered in the palette; rejected by the transpiler | Works | LNG-022 |
| LD: blocks in a rung | Partial: only at the end; later logic is wrong | Works at any position | LNG-021, LNG-022 |
| LD: jumps and labels | Missing | Decision D-04 (2.x recommended) | LNG-002 |
| FBD: gates, comparison, arithmetic, selection, timers, counters, triggers, bistables | Works with two-input gates; `REAL` passes through `INT` | Works, with more than two inputs and correct types | LNG-023 |
| FBD: unwired inputs | Broken: become 0 | Reported as an error when required | LNG-023 |
| FBD: feedback loops | Missing | Detected and reported; support is Decision D-04 (2.x recommended) | LNG-023 |
| `EN`/`ENO` | Missing | Decision D-04 (2.x recommended) | LNG-002 |
| User function blocks and functions in LD and FBD | Missing | Works | LNG-008 |

### 6.11 Configuration
| Element | State today | 2.0 target | Requirement |
|---|---|---|---|
| Cyclic tasks in `zplc.json` (interval, priority, programs) | Works | Works | CMP-047, RT-015 |
| Output ownership check between programs; memory limit check | Works | Works | CMP-047, CMP-043 |
| Event-triggered tasks | Missing: rejected | Decision D-04 (2.x recommended) | RT-015 |
| Textual `CONFIGURATION`, `RESOURCE`, `TASK` | Missing | Decision D-04 (2.x recommended) | CMP-006 |

## 7. Feature preservation inventory
This appendix is the proof that nothing is dropped. It was derived from the code at `b379d82`: the compiler registry (`COMPILER/compiler/stdlib/index.ts`), the board manifest, the Studio sources, the MCP server and CLI entry points, and the directory listings of `packages/zplc-hil` and `tools/`. Disposition is always **keep** (works; protect it with a test) or **keep and repair**.

**State today:** *Works*, *Partial*, *Broken*, *Unverified* (present; no executed evidence), *Disabled*.

### 7.1 Standard functions (61)
Files are in `COMPILER/compiler/stdlib/`.

| Function | File | State today | Disposition | Requirement |
|---|---|---|---|---|
| `MAX` | `functions.ts` | Partial: wrong for negative operands | Keep and repair | CMP-011, CMP-058 |
| `MIN` | `functions.ts` | Partial: negative operands unverified | Keep and repair | CMP-011, CMP-058 |
| `LIMIT` | `functions.ts` | Partial: negative operands unverified | Keep and repair | CMP-011, CMP-058 |
| `SEL` | `functions.ts` | Works | Keep | CMP-058 |
| `MUX` | `functions.ts` | Works | Keep | CMP-058 |
| `NAND` | `functions.ts` | Unverified | Keep and repair | CMP-058 |
| `NOR` | `functions.ts` | Unverified | Keep and repair | CMP-058 |
| `ROL` | `bitwise.ts` | Works | Keep | CMP-058 |
| `ROR` | `bitwise.ts` | Unverified | Keep and repair | CMP-058 |
| `SHL` | `bitwise.ts` | Works | Keep | CMP-058 |
| `SHR` | `bitwise.ts` | Unverified | Keep and repair | CMP-058 |
| `AND_WORD` | `bitwise.ts` | Unverified | Keep and repair | CMP-014, CMP-058 |
| `OR_WORD` | `bitwise.ts` | Unverified | Keep and repair | CMP-014, CMP-058 |
| `XOR_WORD` | `bitwise.ts` | Unverified | Keep and repair | CMP-014, CMP-058 |
| `NOT_WORD` | `bitwise.ts` | Unverified | Keep and repair | CMP-014, CMP-058 |
| `AND_DWORD` | `bitwise.ts` | Unverified | Keep and repair | CMP-014, CMP-058 |
| `OR_DWORD` | `bitwise.ts` | Unverified | Keep and repair | CMP-014, CMP-058 |
| `XOR_DWORD` | `bitwise.ts` | Unverified | Keep and repair | CMP-014, CMP-058 |
| `NOT_DWORD` | `bitwise.ts` | Unverified | Keep and repair | CMP-014, CMP-058 |
| `ABS` | `math.ts` | Partial: `ABS(-5)` returns -5 | Keep and repair | CMP-011, CMP-058 |
| `ABSF` | `math.ts` | Unverified | Keep and repair | CMP-013, CMP-058 |
| `NEG` | `math.ts` | Unverified | Keep and repair | CMP-011, CMP-058 |
| `NEGF` | `math.ts` | Unverified | Keep and repair | CMP-013, CMP-058 |
| `MOD` | `math.ts` | Unverified | Keep and repair | CMP-016, CMP-058 |
| `SQRT` | `math.ts` | Works | Keep | CMP-058 |
| `EXPT` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `INT_TO_REAL` | `math.ts` | Broken for negative values | Keep and repair | CMP-057 |
| `REAL_TO_INT` | `math.ts` | Partial: truncates | Keep and repair | CMP-057 |
| `BOOL_TO_INT` | `math.ts` | Unverified | Keep and repair | CMP-057 |
| `INT_TO_BOOL` | `math.ts` | Unverified | Keep and repair | CMP-057 |
| `TRUNC` | `math.ts` | Unverified | Keep and repair | CMP-057 |
| `ROUND` | `math.ts` | Unverified | Keep and repair | CMP-057 |
| `SIN` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `COS` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `TAN` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `ASIN` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `ACOS` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `ATAN` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `ATAN2` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `LN` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `LOG` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `EXP` | `math.ts` | Unverified | Keep and repair | CMP-058 |
| `NORM_X` | `process.ts` | Unverified | Keep and repair | CMP-058 |
| `SCALE_X` | `process.ts` | Unverified | Keep and repair | CMP-058 |
| `UPTIME` | `system.ts` | Unverified | Keep and repair | CMP-058 |
| `CYCLE_TIME` | `system.ts` | Unverified | Keep and repair | CMP-058 |
| `WATCHDOG_RESET` | `system.ts` | Partial: a documented no-op that compiles without any notice | Keep and repair | RT-034 |
| `LEN` | `strings.ts` | Partial: correct on literals only | Keep and repair | CMP-021 |
| `CONCAT` | `strings.ts` | Broken: modifies its first argument | Keep and repair | CMP-021 |
| `COPY` | `strings.ts` | Broken: copies nothing into a declared string | Keep and repair | CMP-021 |
| `CLEAR` | `strings.ts` | Unverified | Keep and repair | CMP-021 |
| `LEFT` | `strings.ts` | Broken: VM fault | Keep and repair | CMP-021 |
| `RIGHT` | `strings.ts` | Broken with string variables | Keep and repair | CMP-021 |
| `MID` | `strings.ts` | Broken with string variables | Keep and repair | CMP-021 |
| `FIND` | `strings.ts` | Broken with string variables | Keep and repair | CMP-021 |
| `INSERT` | `strings.ts` | Broken with string variables | Keep and repair | CMP-021 |
| `DELETE` | `strings.ts` | Broken with string variables | Keep and repair | CMP-021 |
| `REPLACE` | `strings.ts` | Broken with string variables | Keep and repair | CMP-021 |
| `STRCMP` | `strings.ts` | Broken with string variables | Keep and repair | CMP-021 |
| `EQ_STRING` | `strings.ts` | Broken with string variables | Keep and repair | CMP-021 |
| `NE_STRING` | `strings.ts` | Broken with string variables | Keep and repair | CMP-021 |

### 7.2 Function blocks (34)
| Function block | File | State today | Disposition | Requirement |
|---|---|---|---|---|
| `TON` | `timers.ts` | Partial: elapsed time passes the preset | Keep and repair | CMP-057 |
| `TOF` | `timers.ts` | Works | Keep | CMP-057 |
| `TP` | `timers.ts` | Broken: retriggers on level | Keep and repair | CMP-057 |
| `R_TRIG` | `bistables.ts` | Works | Keep | CMP-058 |
| `F_TRIG` | `bistables.ts` | Works | Keep | CMP-058 |
| `RS` | `bistables.ts` | Works | Keep | CMP-058 |
| `SR` | `bistables.ts` | Works | Keep | CMP-058 |
| `CTU` | `counters.ts` | Works | Keep | CMP-058 |
| `CTD` | `counters.ts` | Works | Keep | CMP-058 |
| `CTUD` | `counters.ts` | Works | Keep | CMP-058 |
| `BLINK` | `generators.ts` | Unverified | Keep and repair | CMP-058 |
| `PWM` | `generators.ts` | Unverified | Keep and repair | CMP-058 |
| `PULSE` | `generators.ts` | Unverified | Keep and repair | CMP-058 |
| `HYSTERESIS` | `process.ts` | Unverified | Keep and repair | CMP-058 |
| `DEADBAND` | `process.ts` | Unverified | Keep and repair | CMP-058 |
| `LAG_FILTER` | `process.ts` | Unverified | Keep and repair | CMP-058 |
| `RAMP_REAL` | `process.ts` | Unverified | Keep and repair | CMP-058 |
| `INTEGRAL` | `process.ts` | Unverified | Keep and repair | CMP-058 |
| `DERIVATIVE` | `process.ts` | Unverified | Keep and repair | CMP-058 |
| `PID_Compact` | `process.ts` | Unverified | Keep and repair | CMP-058 |
| `FIFO` | `system.ts` | Unverified | Keep and repair | CMP-058 |
| `LIFO` | `system.ts` | Unverified | Keep and repair | CMP-058 |
| `MB_READ_HREG` | `communication.ts` | Broken: one request, then BUSY sticks | Keep and repair | COM-001, COM-002, COM-006 |
| `MB_WRITE_HREG` | `communication.ts` | Broken: handshake | Keep and repair | COM-001, COM-002, COM-006 |
| `MB_READ_COIL` | `communication.ts` | Broken: handshake | Keep and repair | COM-001, COM-002, COM-006 |
| `MB_WRITE_COIL` | `communication.ts` | Broken: handshake | Keep and repair | COM-001, COM-002, COM-006 |
| `MQTT_CONNECT` | `communication.ts` | Broken: handshake | Keep and repair | COM-002, COM-006 |
| `MQTT_PUBLISH` | `communication.ts` | Broken: never publishes | Keep and repair | COM-002, COM-004, COM-006 |
| `MQTT_SUBSCRIBE` | `communication.ts` | Broken: handshake | Keep and repair | COM-002, COM-006 |
| `AZURE_C2D_RECV` | `communication.ts` | Broken: handshake | Keep and repair | COM-002, COM-006, COM-007 |
| `AZURE_DPS_PROV` | `communication.ts` | Broken: handshake | Keep and repair | COM-002, COM-004, COM-006, COM-007 |
| `AZURE_EG_PUB` | `communication.ts` | Broken: fires on every scan | Keep and repair | COM-002, COM-004, COM-006, COM-007 |
| `AWS_FLEET_PROV` | `communication.ts` | Broken: fires on every scan and blocks it | Keep and repair | COM-003, COM-004, COM-006, COM-007 |
| `SPB_REBIRTH` | `communication.ts` | Broken: fires on every scan | Keep and repair | COM-002, COM-004, COM-006 |

### 7.3 Boards
All profiles are in `APP/boards/`; the first six are in `supported-boards.v1.5.0.json`.

| Board | Zephyr target | State today | Disposition | Requirement |
|---|---|---|---|---|
| Raspberry Pi Pico (learner board) | `rpi_pico/rp2040` | Cross-build only; on-board LED not mapped | Keep and repair | IO-009, HIL-010, REL-022 |
| ESP32-S3 DevKitC (learner board) | `esp32s3_devkitc/esp32s3/procpu` | Cross-build only; profile written for a T-Display S3, not for the DevKitC-1 | Keep and repair | IO-009, HIL-010, REL-022 |
| Arduino GIGA R1 | `arduino_giga_r1/stm32h747xx/m7` | Cross-build only | Keep and repair | IO-010, HIL-011, REL-022 |
| STM32F746G Discovery | `stm32f746g_disco/stm32f746xx` | Cross-build only | Keep and repair | IO-010, HIL-011, REL-022 |
| STM32 Nucleo-H743ZI | `nucleo_h743zi/stm32h743xx` | Cross-build only; test random generator with TLS | Keep and repair | IO-010, COM-016, HIL-011, REL-022 |
| Arduino Opta WiFi | `arduino_opta/stm32h747xx/m7` | Cross-build only; outputs are status LEDs | Keep and repair | IO-010, COM-016, HIL-011, REL-022 |
| Waveshare RP2040-Zero | profile only | Not in the manifest or CI; configuration invalid | Keep and repair | IO-011 |

### 7.4 Studio surfaces
Paths are under `IDE/src/` unless they start with `IDE/`.

| Surface | Where | State today | Disposition | Requirement |
|---|---|---|---|---|
| Welcome screen | `components/WelcomeScreen.tsx` | Works; no Learn entry, no error surface | Keep and repair | UX-022, LRN-001, IDE-003 |
| Command bar (build, deploy, run controls, mode) | `components/Toolbar.tsx` | Partial: Build needs a hidden link | Keep and repair | IDE-001, UX-011, UX-015 |
| Operational status bar and force banner | `components/OperationalStatusBar.tsx` | Works | Keep | IDE-029, UX-018 |
| Structured Text editor and language service | `components/CodeEditor.tsx`, `components/stLanguageService.ts` | Broken: one buffer shared by all files | Keep and repair | LNG-009, LNG-015 |
| Instruction List editor | `components/CodeEditor.tsx`, `compiler/il/` | Broken: parser can hang | Keep and repair | LNG-017 to LNG-020 |
| Ladder editor | `editors/ld/` | Partial: mouse-first; wrong rung semantics | Keep and repair | LNG-012, LNG-021, LNG-022 |
| FBD editor | `editors/fbd/` | Partial: undo flooding; no connection check | Keep and repair | LNG-010, LNG-013, LNG-023 |
| SFC editor | `editors/sfc/` | Partial: undo flooding; wrong transition semantics | Keep and repair | LNG-010, LNG-024, LNG-025 |
| Explorer (project tree) | `components/Sidebar.tsx` | Partial: bottom tab; new and delete only | Keep and repair | UX-012, IDE-004 |
| Inspector | `components/WorkbenchInspector.tsx` | Works | Keep | UX-011 |
| Output | `components/Console.tsx` | Works; messages can go unseen | Keep and repair | IDE-020 |
| Problems | `components/Console.tsx` | Partial: location without message | Keep and repair | IDE-020, CMP-010 |
| Tests (scenario runs) | `components/Console.tsx`, `test-engine/index.ts` | Works after the manual link | Keep and repair | IDE-031, IDE-001 |
| Lab (recorded plant replay) | `components/LabPanel.tsx` | Works as replay only | Keep and repair | LRN-018, LRN-020 |
| Learn | `components/LearnPanel.tsx` | Partial: see LRN | Keep and repair | LRN-001 to LRN-038 |
| Changes (candidate review) | `components/Console.tsx` | Unverified | Keep | IDE-030 |
| Agent (optional AI provider) | `components/Console.tsx`, `IDE/electron/aiProvider.ts` | Unverified | Keep | IDE-030 |
| Trace | `components/Console.tsx`, `runtime/nativeTrace.ts` | Works in native simulation | Keep | UX-011, UX-009 |
| Watch and force | `components/DebugWatchPanel.tsx` | Partial: wrong addresses from the debug map; FALSE shown red | Keep and repair | CMP-054, IDE-019, UX-009 |
| Terminal | `components/TerminalTab.tsx` | Works; polls on every frame | Keep and repair | COM-025 |
| Task configuration | `components/settings/ProjectSettings.tsx` | Works; buried in settings | Keep and repair | UX-013 |
| I/O mapping | `components/settings/ProjectSettings.tsx` | Works for the fixed demo channels | Keep and repair | UX-013, IO-003 |
| Network settings | `components/settings/ProjectSettings.tsx` | Unverified | Keep and repair | UX-013, COM-027 |
| Communication settings (Modbus, MQTT, cloud) | `components/settings/ProjectSettings.tsx` | Unverified | Keep and repair | UX-013, COM-011, COM-014 |
| Target selection | `components/settings/ProjectSettings.tsx` | Works | Keep and repair | UX-013, IO-012 |
| Controller view | `components/ControllerView.tsx` | Unverified | Keep and repair | UX-011, UX-018 |
| Function-block instance monitor | `editors/fbd/InstanceMonitor.tsx` | Works; not an accessible dialog | Keep and repair | UX-001, UX-025 |
| Generated code and assembly view | `components/GeneratedCodeDialog.tsx` | Works | Keep | CMP-060 |
| Hardware deploy admission and confirmation | `runtime/deviceHandshake.ts`, `components/hardwareDeployConfirmation.ts` | Works; shown in a native box | Keep and repair | COM-028, UX-019 |
| Serial port selection | `IDE/electron/serialPortSelection.ts` | Works as an OS message box | Keep and repair | IDE-018 |
| Project export | `components/Toolbar.tsx` | Partial: export only | Keep and repair | IDE-022 |
| Project migration from version 1 | `project/projectModel.ts` | Unverified | Keep | IDE-022 |
| Declared-interlock coverage check | `components/Console.tsx`, Tool API | Works | Keep | IDE-032 |
| Firmware build from Studio | `IDE/electron/firmwareBuildGateway.ts` | Partial: disabled on Windows | Keep and repair | IDE-027 |
| Themes: light, dark, high contrast, forced colours, reduced motion | `index.css` | Works on the shell; partial in editors | Keep and repair | UX-027 |
| Example projects (25) | `IDE/projects/` | Present; ungrouped; one wrong target | Keep and repair | LRN-036, IO-017 |

### 7.5 MCP tools and resources
All are registered in `IDE/src/mcp/server.ts:297-337`. The server and the Tool API are outside the type-checker today (VF-010).

| Tool or resource | State today | Disposition | Requirement |
|---|---|---|---|
| `project_inspect` | Unverified | Keep | VF-010, IDE-026 |
| `project_validate` | Unverified | Keep | VF-010, IDE-026 |
| `compiler_check` | Partial: accepts programs with semantic errors | Keep and repair | CMP-010 |
| `compiler_compile` | Partial: messages replaced by "Compilation failed" | Keep and repair | CMP-010 |
| `symbols_list` | Unverified | Keep and repair | CMP-054 |
| `safety_check` | Works | Keep | IDE-032 |
| `tests_run` | Works | Keep | IDE-031 |
| `scenario_run` | Works | Keep | IDE-031 |
| `simulation_start` | Works: recorded host scenario | Keep | IDE-031 |
| `simulation_step` | Works: recorded host sample | Keep | IDE-031 |
| `runtime_snapshot` | Works: recorded host snapshot | Keep | IDE-031 |
| `trace_get` | Works | Keep | IDE-031 |
| `boards_list` | Works | Keep and repair | IO-012 |
| `toolchain_inspect` | Unverified | Keep | IDE-027 |
| `firmware_build` | Partial: not on Windows; never flashes | Keep and repair | IDE-027, COM-030 |
| Resources `zplc://project/manifest`, `project/symbols`, `project/io-map`, `project/diagnostics`, `target/capabilities`, `runtime/trace`, `runtime/snapshot` | Unverified | Keep | VF-010, COM-030 |
| Resources `zplc://course/progress`, `docs/evidence`, `docs/safety`, `docs/testing` | Works: read-only | Keep and repair | LRN-028, LRN-034 |

### 7.6 CLI commands
All are implemented in `IDE/src/cli/index.ts` on the Tool API (`IDE/src/cli/toolApi.ts`).

| Command | State today | Disposition | Requirement |
|---|---|---|---|
| `inspect` | Unverified | Keep | VF-010, IDE-026 |
| `validate` | Unverified | Keep | VF-010, IDE-026 |
| `check` | Partial: accepts programs with semantic errors | Keep and repair | CMP-010 |
| `safety-check` | Works | Keep | IDE-032 |
| `symbols` | Unverified | Keep and repair | CMP-054 |
| `migrate-preview` | Unverified | Keep | IDE-022 |
| `migrate` | Unverified | Keep | IDE-022 |
| `test` | Works | Keep | IDE-031 |
| `scenario-run` | Works | Keep | IDE-031 |
| `compile` | Partial: prints only "Compilation failed" | Keep and repair | CMP-010 |
| `toolchain-inspect` | Unverified | Keep | IDE-027 |
| `firmware-build` | Partial: not on Windows | Keep and repair | IDE-027 |

### 7.7 Runtimes, simulators and firmware services
| Item | Where | State today | Disposition | Requirement |
|---|---|---|---|---|
| C99 VM and loader/verifier | `CORE/src/core/` | Works; one sandbox gap; undefined edge cases | Keep and repair | RT-001 to RT-007 |
| Native POSIX runtime and its session protocol | `firmware/apps/posix_host/` | Works; own scheduler semantics | Keep and repair | RT-008, RT-016 |
| Native runtime supervision in Studio | `IDE/electron/nativeSimulationSupervisor.ts` | Works | Keep | IDE-016 |
| WASM runtime | `CORE/src/hal/wasm/`, `IDE/src/runtime/wasmAdapter.ts` | Disabled; not built or shipped | Keep and repair | IDE-025 |
| Zephyr multitask scheduler | `CORE/src/hal/zephyr/zplc_scheduler_zephyr.c` | Works on `native_sim`; Zephyr-only | Keep and repair | RT-008 to RT-017 |
| Zephyr single-task mode | `APP/src/main.c:222-303` | Built into no shipped profile; no input latch | Keep and repair | RT-018 |
| Program store (A/B slots) and boot restore | `APP/src/program_store.c`, `APP/src/program_boot_restore.c` | Works in host tests; 4 KB cap | Keep and repair | RT-028, RT-031 |
| Force table, breakpoints, pause, step | `CORE/src/core/zplc_core.c` | Works; pause clears outputs and forces | Keep and repair | RT-011, RT-017 |
| Retentive memory | `CORE/src/core/zplc_core.c` | Broken on firmware; persisted on the POSIX host | Keep and repair | RT-025 to RT-027 |
| Modbus server and Modbus TCP framing | `APP/src/zplc_modbus.c`, `APP/src/zplc_modbus_tcp.c` | Partial: bypasses forces; areas shared | Keep and repair | COM-010, COM-011, COM-013 |
| Modbus client (TCP and RTU) | `APP/src/zplc_modbus_client.c` | Partial: RTU always times out | Keep and repair | COM-010, COM-012 |
| MQTT client with TLS, MQTT commands, Sparkplug B | `APP/src/zplc_mqtt.c`, `APP/src/zplc_mqtt_command.c` | Unverified; insecure defaults | Keep and repair | COM-014, COM-017, COM-018 |
| Azure (SAS, DPS, cloud-to-device, Event Grid) | `APP/src/zplc_azure_sas.c`, `APP/src/zplc_azure_dps.c` | Unverified | Keep and repair | COM-006, COM-007 |
| AWS fleet provisioning | `APP/src/zplc_aws_fleet.c` | Broken: certificate storage cannot succeed on target | Keep and repair | COM-003, IO-008 |
| TLS credential store; time synchronisation | `APP/src/zplc_tls_credentials.c`, `APP/src/zplc_time.c` | Unverified | Keep and repair | COM-015, RT-024 |
| Diagnostic shell (74 commands) | `APP/src/shell_cmds.c` | Works; unauthenticated; two stubs | Keep and repair | COM-022 |
| Device configuration and settings | `APP/src/zplc_config.c` | Broken: save persists nothing | Keep and repair | COM-027 |

### 7.8 HIL and tooling assets
| Asset | Where | State today | Disposition | Requirement |
|---|---|---|---|---|
| TypeScript HIL harness (assertions, device, protocol, reporter, runner) | `packages/zplc-hil/src/` | Broken: compile and upload mocked | Keep and repair | HIL-001 |
| HIL test files (opcodes, blocks, examples) | `packages/zplc-hil/tests/` | Broken: contain no test | Keep and repair | HIL-001 |
| Serial driver | `tools/hil/zplc_tester.py`, `tools/hil/language_tester.py` | Unverified; hand-kept opcode list | Keep and repair | HIL-007, HIL-008 |
| Runners | `tools/hil/run_all_hil_tests.py`, `run_all_languages.py`, `run_board_matrix.py`, `run_pico_blinky.py` | Unverified | Keep and repair | HIL-004, HIL-012 |
| Device test scripts (49 `test_*.py`) | `tools/hil/` | Partial: about 30 never fail the run | Keep and repair | HIL-004 |
| Language fixtures (28 ST: 25 in `st_tests`, 2 in `il_tests` and `tools/hil/blinky_ld_gen.st`; 9 IL, 4 LD, 3 FBD, 2 SFC) | `tools/hil/st_tests`, `il_tests`, `ld_tests`, `fbd_tests`, `sfc_tests` | Partial: 27 of 46 no longer compile | Keep and repair | HIL-005, HIL-006 |
| Bench utilities | `tools/hil/check_alive.py`, `check_hw.py`, `debug_peek.py`, `inspect_zplc.py`, `rescue.py`, `rescue_device.py`, `sniff.py`, `verify_compilation.py` | Unverified | Keep | HIL-004 |
| Validators and audits | `tools/hil/validate_*.py`, `tools/hil/audit_*.py` | Work; one parses workflow text and is rewritten to inspect produced artifacts, not deleted | Keep and repair | VF-019, VF-021 |
| Connectivity doubles and board set-up | `tools/connectivity/` (fake AWS and Azure endpoints, broker configuration, board configuration) | Unverified | Keep and repair | COM-006 |
| Reference generators | `tools/docs/` | Work | Keep | DOC-008 |
| Python assembler | `tools/zplc_asm.py` | Partial: 15 opcodes behind | Keep and repair | VF-012, HIL-008 |
| CRC cross-check | `tools/test_crc32_cross.py` | Broken: compares a library with itself | Keep and repair | HIL-017 |

## 8. Definition of done for 2.0.0 GA
2.0.0 is GA when every gate below is met on the commit that is tagged. A gate is met by a recorded run, not by a statement. Gate 6 differs in timing only: its records are made on the firmware images built from the tagged commit while the release is still a draft, and the record files are committed afterwards, because a record cannot be stored in the commit that the image it tests was built from.

| Gate | Exit condition | Evidence |
|---|---|---|
| 1. Language conformance | The host conformance suite passes on 64-bit, 32-bit and QEMU; every "Works" row of section 6 has a passing case; the expected-failure list (VF-027) is empty; the ABI is frozen and the freeze check of CMP-052 passes | CI run on the tag |
| 2. Findings closed | Every row of section 9 has all its requirements verified, and every requirement ID of section 5 has a recorded executed check or evidence record in a requirement coverage index kept with the release plan; the final audit checks all IDs against that index, not only the twelve gates | Traceability table and coverage index with links to the runs |
| 3. Journeys | The end-to-end suite passes on Linux, macOS and Windows against packaged builds made for the suite (identical to the release build except for the test hook of VF-008), including opening a real folder, a breakpoint hit and the first Learn lesson; the first-run check on the release installers (REL-016) opens a real folder through the real dialog | CI run and the first-run record |
| 4. Runtime safety | The scheduler suite passes on every port; the load-and-run fuzzer has seven consecutive nightly runs with no finding; the sandbox requirements RT-001 to RT-005 are verified | CI and nightly runs |
| 5. Five languages | A program in each of ST, IL, LD, FBD and SFC builds, simulates, stops at a breakpoint on a source element and shows online values | End-to-end and conformance runs |
| 6. Hardware | Evidence records per HIL-010 exist for the Raspberry Pi Pico and the ESP32-S3, made on the firmware images of the GA draft release before it is published; each record names the commit and the hash of the image it tested | Record files committed to the default branch in the first commit after the tag and referenced from the board manifest |
| 7. Learning | Learn opens from the Welcome screen with no project; every lesson passes LRN-025 in both languages; three first-time users reach a first blink within ten minutes | CI run and a manual record |
| 8. Release | One rehearsal and the GA tag are produced entirely by the pipeline; every installer format is installed and launched in CI; first-run checks on a real Mac and a real Windows machine are recorded; firmware for every board is attached; each Windows channel of S-5 is live, or the REL-038 fallback is in force for it and the release notes state its state (live, submitted, refused or not yet submittable), and a pending, refused or failed listing or application never delays GA (design default); no paid service is used | Pipeline runs and the release checklist |
| 9. Documentation | No validator fails; a newcomer has followed both tutorials; English and Spanish are complete; no public claim contradicts section 6 or the board manifest | CI run and a manual record |
| 10. Nothing dropped | Every row of section 7 is present and its requirement verified | Inventory with links to the runs |
| 11. Accessibility | Contrast and keyboard checks pass; the screen-reader check is recorded | CI run and a manual record |
| 12. Decisions | Every open decision of section 4.4 is recorded with the owner's answer | Section 4.4, updated |

## 9. Traceability
Every Blocker and Major finding of the six review areas, and every gap of the learning-mode inventory, maps to at least one requirement. Finding labels are those used in the review: letters and numbers per area.

### 9.1 Visual design, UX and design system
| Finding | Severity | Summary | Requirements |
|---|---|---|---|
| F-01 | Blocker | Project tree is one of twelve bottom tabs | UX-011, UX-012 |
| F-02 | Major | Tasks, I/O mapping and communication buried in settings | UX-012, UX-013 |
| F-03 | Major | No application menu, window background or single product name | UX-014, UX-016, IDE-005, DOC-017 |
| F-04 | Major | Resize handle styles target attributes that are not emitted | UX-017 |
| F-05 | Major | No session continuity | IDE-001, IDE-008, IDE-009 |
| F-06 | Blocker | No component layer | UX-001, UX-002, UX-005 |
| F-07 | Major | Tokens exist but are not enforced | UX-002, UX-003 |
| F-08 | Major | Semantic colour contract broken | UX-009, UX-010 |
| F-09 | Major | Fonts not shipped; text too small | UX-006 |
| F-11 | Major | Visual editors keep the old skin | UX-003, UX-007, UX-010 |
| F-12 | Major | Ladder and FBD are mouse-first | LNG-012 |
| F-14 | Major | Code editor is not themed | UX-003, UX-034 |
| F-15 | Major | Deploy confirmation is a native box | UX-019, UX-020 |
| F-16 | Major | Errors and progress have no home | IDE-019, IDE-020, IDE-021, UX-021 |
| F-17 | Major | Contrast fails AA | UX-024 |
| F-18 | Major | Invisible focus and unlabelled controls | UX-005, UX-026 |
| F-19 | Major | Shortcuts cannot be discovered | UX-014, UX-015 |
| F-22 | Major | UI tests assert on source text | VF-006, VF-007 |

### 9.2 Frontend and Electron architecture
| Finding | Severity | Summary | Requirements |
|---|---|---|---|
| B1 | Blocker | Two project roots and a hidden link before Build | IDE-001, IDE-002 |
| B2 | Blocker | Folder open and save unproven in the packaged application | IDE-003, VF-008 |
| B3 | Blocker | All text files share one editor model | LNG-009 |
| B4 | Blocker | Unsaved work lost on close, reload and quit | IDE-005, IDE-006, UX-014 |
| M1 | Major | Build, test and MCP code outside the type-checker | VF-010, VF-011 |
| M2 | Major | No behavioural UI tests | VF-006, VF-007, VF-008 |
| M3 | Major | One store, whole-store subscriptions | IDE-013 |
| M4 | Major | Very large modules and no formatter | IDE-014, VF-017 |
| M5 | Major | Visual editors commit on every drag step | LNG-010 |
| M6 | Major | Serial writes not atomic; unchecked addresses; three pollers | COM-023, COM-024, COM-025 |
| M7 | Major | Failures invisible on Welcome; a bad file blanks the window | IDE-003, IDE-011, LNG-011 |
| M8 | Major | Start-up carries all of Monaco | IDE-015 |
| M9 | Major | Compile and tests on the main thread | IDE-012 |
| M10 | Major | `.deb` declares packages that no longer exist | REL-011 |

### 9.3 Compiler, bytecode contract and language coverage
| Finding | Severity | Summary | Requirements |
|---|---|---|---|
| B1 | Blocker | Semantic errors become comments | CMP-001 to CMP-007 |
| B2 | Blocker | Numeric semantics wrong | CMP-011 to CMP-016 |
| B3 | Blocker | Aggregates miscompiled | CMP-019, CMP-020, CMP-021 |
| B4 | Blocker | Initial values ignored; array initialisers fault | CMP-022, CMP-025, CMP-026 |
| B5 | Blocker | Function-block composition does not work | CMP-027, CMP-028, CMP-037, CMP-038, CMP-039 |
| B6 | Blocker | 256 bytes per program; no shared globals or POUs | CMP-042 to CMP-046 |
| B7 | Blocker | No test executes compiled constructs | VF-001 to VF-005 |
| B8 | Blocker | Debug map addresses wrong | CMP-054, CMP-056 |
| B9 | Blocker | Build failure without a reason | CMP-010, LNG-003 |
| M1 | Major | `FOR`, `RETURN`, `CASE` defects | CMP-036, CMP-039, CMP-040 |
| M2 | Major | One flat symbol table | CMP-034, CMP-035 |
| M3 | Major | Everyday Structured Text rejected | CMP-030 to CMP-033, CMP-037 |
| M4 | Major | Diagnostics below editor grade | CMP-006 to CMP-009 |
| M5 | Major | Standard library conformance | CMP-021, CMP-057, CMP-058 |
| M6 | Major | Bytecode contract kept by hand | VF-012, CMP-048 to CMP-052, RT-003 |
| M7 | Major | A program can crash the host runtime | RT-005, CMP-016 |
| M8 | Major | Debug information line-granular and partly wrong | CMP-053, CMP-055, CMP-056 |
| M9 | Major | No array bounds checking | CMP-023 |
| M10 | Major | HIL tooling dead or decayed; no evidence | HIL-001, HIL-004 to HIL-010 |
| M11 | Major | No interoperability | CMP-042, CMP-046, IDE-023 |
| M12 | Major | Published claims exceed behaviour | DOC-006, DOC-012 |
| M13 | Major | The 2.0 plan treats the compiler as finished | VF-003, VF-027, DOC-025 |
| M14 | Major | Instruction List not trustworthy | LNG-017 to LNG-020 |
| M15 | Major | Graphical transpilers drop or reorder logic | LNG-002, LNG-007, LNG-021 to LNG-025 |
| M16 | Major | Debugging does not reach graphical languages | LNG-001, LNG-004, LNG-005 |

### 9.4 Runtime, HAL and firmware
| Finding | Severity | Summary | Requirements |
|---|---|---|---|
| F1 | Blocker | Communication opcodes escape the sandbox; the layer does not work | RT-001, RT-002, COM-001 to COM-006 |
| F2 | Blocker | Fieldbus threads not synchronised with the scan | RT-009, RT-010, RT-011 |
| F3 | Blocker | No fail-safe for a hung or crashed processor | RT-019, RT-020, RT-021 |
| F4 | Blocker | RETAIN not retentive | RT-025, RT-026, RT-027, CMP-029 |
| F5 | Blocker | No hardware evidence | HIL-009, HIL-010 |
| F6 | Major | Scan starved or blocked; one late cycle stops the PLC | RT-012, RT-013, RT-014, IO-018 |
| F7 | Major | Lock held across I/O | RT-012 |
| F8 | Major | Fixed demonstration I/O | IO-001, IO-002, IO-005, IO-006, IO-010 |
| F9 | Major | Undefined integer and float edge cases | RT-004, RT-005 |
| F10 | Major | Scheduler not portable; simulator differs | RT-008, RT-015, RT-016, RT-018 |
| F11 | Major | Control plane and security defaults | COM-014, COM-015, COM-016, COM-019 to COM-022, COM-026 |
| F12 | Major | Deploy and persistence limits | RT-022, RT-024, RT-028, COM-027 |
| F13 | Major | Modbus defects | COM-008, COM-010 to COM-013 |
| F14 | Major | Core test and evidence gaps | VF-013, VF-014, VF-015, VF-025 |

### 9.5 Release and distribution
| Finding | Severity | Summary | Requirements |
|---|---|---|---|
| F1 | Blocker | macOS artifacts unsigned | REL-001, REL-002, REL-005 |
| F2 | Blocker | Signed macOS path never ran and needs paid credentials | REL-003, REL-030 |
| F3 | Blocker | Windows path unsatisfiable and blocks all platforms | REL-007, REL-009, REL-015, REL-038 |
| F4 | Blocker | `.deb` uninstallable | REL-011 |
| F5 | Major | Public statements contradict the release | REL-016, REL-027, DOC-012 |
| F6 | Major | No download or install path | REL-028, REL-033, DOC-005 |
| F7 | Major | Default branch red; CI not on the 2.0 branch | VF-016 |
| F8 | Major | No firmware binaries | REL-022, REL-024, REL-025 |
| F9 | Major | No update path | REL-021 |
| F10 | Major | Bill of materials lists installers | REL-018 |
| F11 | Major | Evidence machinery aimed at the wrong thing | VF-021, REL-029, REL-032 |

### 9.6 Documentation and repository
| Finding | Severity | Summary | Requirements |
|---|---|---|---|
| F1 | Blocker | Pages end mid-sentence | DOC-001, VF-019 |
| F2 | Blocker | Generated images of a different product | DOC-013 |
| F3 | Blocker | No path from nothing to a blinking output | DOC-003, DOC-004, DOC-005 |
| F4 | Major | Compliance language instead of product language | DOC-009, DOC-011 |
| F5 | Major | Internal process output published | DOC-001, DOC-021, DOC-022 |
| F6 | Major | Language and function-block reference unusable | DOC-002, DOC-006, DOC-007, DOC-008 |
| F7 | Major | Evidence vocabulary repeated | DOC-010, DOC-030 |
| F8 | Major | Spanish not publishable | DOC-015, DOC-016, UX-030 |
| F9 | Major | Front door and identity inconsistent | DOC-017, DOC-018, DOC-019 |
| F10 | Major | Wrong or stale instructions | DOC-014 |
| F11 | Major | Repository hygiene | DOC-020, DOC-023, DOC-026, DOC-027 |
| F12 | Major | Contributor experience | DOC-024, REL-019 |

### 9.7 Learning-mode gaps
| Gap | Summary | Requirements |
|---|---|---|
| G1 | No course structure | LRN-005, LRN-006 |
| G2 | No lesson edits LD, FBD, SFC or IL | LRN-008, LRN-038 |
| G3 | Lesson text and graded scenario disagree | LRN-022, LRN-025 |
| G4 | Only one starter has a plant | LRN-018, LRN-021 |
| G5 | Starter scenarios contradict their instructions | LRN-025 |
| G6 | Stale lesson text | LRN-025, LRN-038 |
| G7 | Lesson ids in three files | LRN-027, LRN-028 |
| G8 | No hardware lesson or grade | LRN-013, LRN-024, HIL-002 |
| G9 | Learner-board I/O fixed and misdescribed | IO-009, IO-011, LRN-014 |
| G10 | No docs pages for Learn, Lab, scenarios or examples | LRN-035, DOC-002 |
| G11 | Public text advertises a disabled WASM fallback | IDE-025, DOC-012 |
| G12 | Nothing for educators | LRN-033 |

## 10. Glossary
| Term | Meaning here |
|---|---|
| ABI | The binary contract between compiler and runtime: the `.zplc` container format plus the instruction set. It has its own version, separate from the product version. |
| Ad-hoc signature | A macOS code signature made without a certificate. It seals the bundle so that Apple-silicon Macs will run it, but identifies no developer, so Gatekeeper still asks the user to approve a downloaded copy. |
| Attestation | A signed statement, produced by the build service, that a file was built from a given repository and workflow. It proves origin, not safety. |
| Cask, tap | Homebrew terms: a cask is an installer recipe for a macOS application; a tap is a repository of recipes. |
| Debug map | A file the compiler writes beside the bytecode, listing where each variable lives and which instructions belong to which source statement. |
| Devicetree, Kconfig | Zephyr's hardware description and build configuration systems. |
| Evidence level | Where a result was observed: host, QEMU, target build, HIL, or manual. A lower level never proves a higher one. |
| Faceplate | A panel of switches and lamps bound to a program's inputs and outputs during simulation. |
| Force | Holding an input or output at a chosen value from the engineering tool, overriding the program or the field, until it is released. |
| Gatekeeper, quarantine | macOS marks files downloaded by a browser as quarantined; Gatekeeper checks a quarantined application before its first launch. |
| Headless primitive library | A library of interface components that supplies behaviour and accessibility but no visual style. |
| HIL | Hardware-in-the-loop: a test in which the real board runs the program and a harness stimulates and observes it. |
| MCP | Model Context Protocol: the interface through which an AI assistant calls ZPLC tools. In ZPLC it is read-only with respect to hardware. |
| MSIX | The Windows package format used by the Microsoft Store, which signs the package itself. |
| `native_sim`, QEMU | Zephyr built as a host program, and a processor emulator. Both run firmware code without a board; neither is hardware evidence. |
| Plant | A small simulated machine (motor, conveyor, tank, crossing) that reacts to the program's outputs and feeds its inputs. |
| POU | Program organisation unit: a PROGRAM, FUNCTION or FUNCTION_BLOCK. |
| Process image | The copy of inputs and outputs a PLC program works on during one scan; inputs are read before the scan and outputs written after it. |
| Protocol double | A local stand-in for a remote service (a broker, a cloud endpoint) used to test a client without the real service. |
| RETAIN | Variables whose values survive a power cycle. |
| Scan cycle | One pass of a PLC: read inputs, run the program, write outputs. |
| Scenario | A test file that sets inputs over time and asserts outputs with temporal conditions such as "within 50 ms" or "never". |
| SmartScreen, Smart App Control | Windows protections. SmartScreen warns about unrecognised downloads and can be bypassed by the user; Smart App Control blocks unsigned applications with no per-application bypass. |
| Tool API | The single TypeScript interface through which Studio, the CLI and the MCP server compile, test and inspect a project. |
| Voseo | The Rioplatense Spanish verb forms ("compilá", "guardá"), informal to most other Spanish-speaking readers. |
