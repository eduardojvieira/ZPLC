# ZPLC 2.1.0 plan: the compiler known issues of the 2.0.1 notes (T20 / S5, revision 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Owner decision of 2026-11-13: "que entren en 2.1.0 documentalo para que el otro agente no se olvide". CMP-003, CMP-004, CMP-005, CMP-006, CMP-012, CMP-018, CMP-034, CMP-035, CMP-037, CMP-053 and CMP-055 must stop being listed as known issues, and the four that "build silently wrong" (CMP-003, CMP-004, CMP-005, CMP-018) must be proven fixed first.

**Triage verdict (read this first).** **All eleven are already fixed in the code of `feat/plant-simulation` (7d498e46), and were fixed in 2.0.0 and 2.0.1 themselves.** What the 2.0.1 notes list is a stale dictionary, not a set of open defects (Findings 1 and 2). So 2.1.0 owes no compiler or VM change for these ids. It owes (a) a fix of the release script that lists them, (b) a handful of regression cases for forms the cases do not yet pin, (c) the 2.1.0 version bump rule of CMP-053, and (d) an independent probe so the owner's wish "fixed" is backed by evidence rather than by my reading. The risk section answers items 3 of the brief: nothing shipped depends on the buggy behaviour, and nothing needs re-pinning, because the integration branch already compiles every lesson and scene with the fixed compiler.

**Path shorthand:** `COMPILER/` is `packages/zplc-compiler/src/`; `IDE/` is `packages/zplc-ide/`. Branch and tree: `docs/t20-cmp-plan`, based on 7d498e46 (`feat/plant-simulation`). Written 2026-11-13 by a planning agent. "Unconfirmed" marks what was not run.

## Roles
| Role | Does |
|---|---|
| Executor | One task each. Tests first, runs the verification commands, commits with a Conventional Commit and no attribution line. Never edits outside the task's "Allowed edit surfaces". `git add` new files before `format`. |
| Parent | Owns git across tasks, runs the seam check (the three suites in "Verification commands") once after the last task, launches the independent verifier of K3, and asks the owner the open questions. |
| Verifier (independent, fresh) | K3 only: runs the probes of the whole list against a scratch copy, never edits. |
| Owner | Answers the questions at the end, decides whether the published 2.0.1 release notes are edited (a remote operation: not authorized by this plan). |

## Start rule
1. Base is `feat/plant-simulation` at 7d498e46 or later. `git merge-base --is-ancestor 2263aeaf HEAD` and `git merge-base --is-ancestor 637d7477 HEAD` both succeed. If not, stop: the integration branch lost the compiler fixes.
2. `export TMPDIR=$HOME/.cache/zplc-tmp`; `mkdir -p $TMPDIR`; `bun install`; `bun run build:compiler`; `bun run build:runtime` (the conformance suite needs the native runtime).
3. Order: K1 (proof) first, then K2, K3, K4. K5 waits for the 2.1.0 cut.

## Requirement mapping
| Id | Requirement (spec.md line) | State at 7d498e46 | Task |
|---|---|---|---|
| CMP-003 | unknown type name, including D-04 types, MUST fail with an error naming the type and position (`spec.md:307`) | Fixed: `semantic.ts:120-121` says `The type 'CHAR' is not supported in this release (it is planned for 2.x)` or `Unknown type 'FOOBAR' in the declaration of 'a'`, at 2:9 | K1, K2 |
| CMP-004 | names, keywords, types, parameters and `%ix0.0` matched without regard to case (`:308`) | Fixed (fffa9bd5): `t(in := TRUE, pt := T#1s); q := t.q;` builds; a timer cases passes in the VM (`conformance/cmp/cmp-004-std-block-parameter-case-insensitive`) | K1 |
| CMP-005 | every expression, assignment, argument and return value type-checked (`:309`) | Fixed (2263aeaf): `i := r` (REAL to INT) and `b := i` (INT to BOOL) are errors `Type mismatch: a value of type REAL cannot be used where INT is expected` (`codegen.ts:4340`); also as argument and as return | K1 |
| CMP-006 | stable code, severity, file, range, never 0:0 (`:310`) | Fixed (1eeadf0e, 08dd2d39); `PERSISTENT` is rejected at its own token (2:5), by decision D-04 as `'PERSISTENT' is not supported in this release: declare the variables RETAIN` | K1 |
| CMP-012 | unsigned compare, divide, shifts; full-range literals (`:318`) | Fixed (aeeec818 and feb3dc88): `d := F(4294967295)` to a DWORD parameter builds | K1 |
| CMP-018 | a constant that does not fit the target MUST be a compile error (`:324`) | Fixed: `The constant 300 does not fit SINT (-128 to 127)`, also in an array initializer, a function argument and `USINT := 256` | K1, K2 |
| CMP-034 | each POU its own scope (`:346`) | Fixed (2263aeaf): two functions with parameter `a` and a program variable `a` build | K1 |
| CMP-035 | named arguments by name, missing and unknown argument and recursion are errors, call as statement accepted (`:347`) | Fixed: `Sub(b := 1, a := 10)` and `Sub(1,2);` build; `Sub(a := 10)` is `Function 'Sub' is called without its parameter 'b'` (`codegen.ts:4881`); `R := R(a)` is `calls itself` (`codegen.ts:470`) | K1 |
| CMP-037 | unknown FB parameter an error, `=>` works (`:349`) | Fixed: `BOGUS := 5` is `'BOGUS' is not a parameter of TON (instance 't')` (`codegen.ts:2979`); `Q => q` builds | K1 |
| CMP-053 | byte-identical bytecode and debug map, real compiler version (`:369`) | Fixed (637d7477): `COMPILER_VERSION` at `COMPILER/compiler/debug-map.ts:257` is guarded by a test against the package version | K1, K5 |
| CMP-055 | full instruction range per statement in the debug map (`:371`) | Fixed (637d7477), conformance test `CMP-055 every instruction of a statement resolves to that statement in the debug map` | K1 |

## Findings
1. **Proof of the fixed state.** At 7d498e46 (this worktree, built clean): `bun test` in `packages/zplc-compiler`: 1226 pass, 0 fail. `bun test src/conformance/conformance.test.ts` in `IDE/`: 664 pass, 0 fail (26 s), and `tools/ci/expected-failures.json` is `[]`. The 100 `conformance/cmp/cmp-0{03,04,05,06,12,18,34,35,37}-*.expect.json` cases state the correct values and pass; they were written red and went green with the fixes. I also ran 20 probes by hand with `compileToBinary` (the ones in "Reproduction" below); every one behaves as the requirement says.
2. **Why the notes list them.** `scripts/release/run-results.ts:146` builds `limits` from **every** key of `docs/known-limits.json` and `:162` copies them into `knownIssues`. The docs generator (`tools/docs/generate_known_limits.py`) is the opposite: it renders a row only while a case of that requirement is in `expected-failures.json`, so `docs/docs/languages/st.md:254-256` says "No conformance case of this area is on the expected-failures list: no limit is recorded". The two readers of one file disagree. `v2.0.1:tools/ci/expected-failures.json` is also `[]`, and `v2.0.1` already contains 2263aeaf, fffa9bd5, 637d7477 and cdc834cb (checked with `merge-base --is-ancestor`). The file `docs/known-limits.json` was last edited 2026-10-10 (0f8cb795), before the fixes landed, and nobody emptied it.
3. **Wrong premise about branch wp-04.** The brief says wp-04-compiler-vm-stopgaps holds 55 commits not on master and not in `feat/plant-simulation`. Measured: `git rev-list --count feat/plant-simulation..wp-04-compiler-vm-stopgaps` is **2**; 17 of the 19 compiler, VM and conformance commits (cdc834cb, 4b7f0e16, 55219031, 9bb3e330, 18bf2504, 9b82f83e, 6cf325ea, 1629bdaf, 04972f04, d9ae5794, the conformance commits a45ee351 to 00595371, bc349d3c, 006c91c4) are ancestors of the integration branch (merge-base 006c91c4). They are not on `master` (master stops at 845f5337, 2026-06-18) because 2.0.x was cut from another line. The two that are not in: 011072c3 (`test(core): make the native session test portable to macOS`, touches `firmware/lib/zplc_core/tests/test_native_runtime_session.c`) and e206e3f4 (`test(ide): read the guard message from stderr`, touches `IDE/src/cli/nativeRuntimeGuard.test.ts`). Both are test-only, address no CMP id, and **both conflict** when cherry-picked onto 7d498e46 (tried in a scratch worktree, removed). They are macOS and CI portability work of the Linux sweep: leave them to their owner (question 3).
4. **Release-note defect is the real deliverable.** Because the list is rendered unfiltered, every future release repeats it. Fixing the reader fixes 2.1.0 and later notes.
5. **CMP-053 needs a rule at the cut.** `COMPILER_VERSION` is `'2.0.0'` at 7d498e46 while `v2.0.1` has `'2.0.1'` (the only compiler source difference between them): a test compares it with the package version, so the 2.1.0 version bump must change both `packages/zplc-compiler/package.json` and `debug-map.ts:257` in one commit or CI fails.

## Reproduction (item 1 of the brief; "now" is 7d498e46, "was" is the text of `docs/known-limits.json`)
| Id | ST snippet | Was (known-limits) | Now |
|---|---|---|---|
| CMP-003 | `VAR a : CHAR; b : INT; END_VAR` | size 0, `a` aliases `b` | error at 2:9 naming `CHAR`; `FOOBAR`: `Unknown type 'FOOBAR'` |
| CMP-004 | `t(in := i, pt := T#1s); q := t.Q;` | ignored, timer never starts | builds, runs (case `cmp-004-std-block-parameter-case-insensitive`); `cnt := 1` for `Cnt` builds |
| CMP-005 | `i := r;` (REAL to INT); `b := i;` | bit pattern stored; INT not reduced | error naming both types; `REAL_TO_INT(r)` is the explicit form |
| CMP-006 | `VAR PERSISTENT` | diagnostic a line late | error at the token, 2:5 |
| CMP-012 | `d := F(4294967295)`, `F` takes a `DWORD` | `does not fit a signed 32-bit integer` | builds |
| CMP-018 | `s : SINT := 300` | stored as 44 | `The constant 300 does not fit SINT (-128 to 127)` |
| CMP-034 | two functions, parameter `a`, program variable `a` | `Symbol 'a' already defined` | builds (Unconfirmed edge: a parameter named like its own function, `FUNCTION A` with `a`, is still `Symbol 'A.A' already defined`; IEC forbids it too, since the function name is the result variable) |
| CMP-035 | `Sub(b := 1, a := 10); Sub(1,2);` | bound by position; statement call rejected | binds by name; statement accepted; missing argument and recursion rejected |
| CMP-037 | `t(IN := TRUE, PT := T#1s, BOGUS := 5, Q => q)` | `=>` rejected, unknown ignored | `BOGUS` rejected naming `TON` and `t` |
| CMP-053, CMP-055 | build twice, read the map | version `1.2.0`, a timestamp, a one-instruction range | covered by `conformance.test.ts` (names above) |

## Triage decision per id
| Id | Decision | Where | Risk |
|---|---|---|---|
| CMP-003, 004, 005, 006, 012, 018, 034, 035, 037, 053, 055 | **No cherry-pick, no re-implementation, no new compiler work.** Already in 7d498e46 through the ws-* merges (2263aeaf, fffa9bd5, 1eeadf0e, 08dd2d39, 637d7477, aeeec818, feb3dc88) and in v2.0.0 and v2.0.1. Proof task K1, regression cases K2, notes fix K3. | `COMPILER/compiler/semantic.ts:120`, `codegen.ts:470,2979,4340,4881`, `symbol-table.ts:333`, `debug-map.ts:257` | None for code (no product code changes). K3 touches the release evidence script: contract others consume, item 3 of the high-risk list |
| 011072c3, e206e3f4 (wp-04, not integrated) | Not CMP. Do not take here. | n/a | n/a |

## What depends on the buggy behaviour (item 3 of the brief)
- **Nothing to re-pin.** The fixes are on the base this plan starts from, so every pinned artefact already moved when they landed: the scene hashes (`IDE/src/plant/ci/sceneHashes.json`, `IDE/src/plant/core/hashes.json`), the lesson index and the conformance goldens are the post-fix values. A task that would "re-pin" would only hide a drift. K1 proves it by running the suites below against the base with no edit.
- **Lower-case `in :=` and `pt :=`:** `rg --case-sensitive "\b(in|pt|pv|clk|cu|cd|set|reset|q|et) ?:="` over `IDE/plant-scenes`, `IDE/src/learn` and `docs/docs` finds no hit. No lesson solution and no scene reference relies on a lower-case parameter name.
- **Constants that do not fit (`SINT := 300`):** `rg "SINT *:= *[0-9]{3}"` over the scenes finds none; every `reference.st` and starter compiles in `sceneCheck.test.ts` and `sceneCatalogue.test.ts` at the base.
- **2.0 lessons still grade the same (PLT-013, CRS-010):** `IDE/src/learn/lessonCi.test.ts` compiles and grades every shipped lesson solution; its result on the base is the evidence (**Unconfirmed when written**: the run of `lessonCi.test.ts`, `sceneCheck.test.ts` and `sceneCatalogue.test.ts` had not finished after several minutes; K1 records it). It is the proof for K1, and the frozen id list is `tools/ci/two-zero-lesson-ids.json` (PLT-013). Both run in K1, K4 and at the seam.
- A **2.1.0 user program** written for 2.0.0 and rejected by the type checker (a REAL assigned to an INT) already fails in 2.0.0 and 2.0.1; the release notes say so ("A text no longer converts...", `docs/docs/release-notes/index.md:~134`). No new migration note.

## Verification commands (shared by the tasks)
```
cd packages/zplc-compiler && bun test                                   # expect 1226+ pass, 0 fail
cd packages/zplc-ide && bun test src/conformance/conformance.test.ts    # 664+ pass, 0 fail
cd packages/zplc-ide && bun test src/learn/lessonCi.test.ts src/plant/ci/sceneCheck.test.ts src/plant/ci/sceneCatalogue.test.ts
bun test scripts/release/run-results.test.ts scripts/release/release-notes.test.ts   # at the root
python3 tools/docs/generate_known_limits.py --check
CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --check
```
No C change in this plan, so the host C tests are not run (a task that edits `firmware/lib/zplc_core` must add `cmake` host ctest and the sanitizer job, and is out of scope).

## Tasks
Order: K1, K2, K3, K4, then K5 at the 2.1.0 cut. All are inline (no Writer reason: they are small and sequential); K3 is the only high-risk one.

### K1 - Prove the eleven ids on the base (read-only, no commit)
- [ ] Run the three suites of "Verification commands" on 7d498e46 plus the 20 probes of "Reproduction". Record the counts in the K2 commit body. If any case fails, stop and report: the premise of this plan is wrong and a real fix task per failing id is needed (silent four first: CMP-003, 004, 005, 018).
- Allowed edit surfaces: none.

### K2 - Pin the silent four where the cases leave a gap
Failing test first is not possible (the fixes exist): write each case, **run it on the base and observe green**, and note in the commit that it is a regression pin. Then mutate by hand (revert the check in a scratch copy) to see it go red once, in the scratch copy only.
- [ ] `conformance/cmp/cmp-018-array-initializer-does-not-fit.st` + `.expect.json`: `ARRAY[0..1] OF SINT := [1, 300]` fails (`"build": "fails"`, line, `messageIncludes`).
- [ ] `conformance/cmp/cmp-018-argument-does-not-fit.st` + `.expect.json`: `F(300)` with a `SINT` parameter fails.
- [ ] `conformance/cmp/cmp-004-lowercase-output-member.st` + `.expect.json`: `t(in := TRUE, pt := T#1s); q := t.q;` drives `%QX0.0` true after 1 s on the virtual clock.
- [ ] `conformance/cmp/cmp-003-unknown-type-in-a-function-parameter.st` + `.expect.json`: an unknown type in `VAR_INPUT` fails (Unconfirmed that no case covers it: `fd cmp-003` lists seven, all in programs).
- [ ] Regenerate `conformance/defect-map.md` and `matrix-gaps.json` through the generator the README names, and run `format --check`.
- Allowed edit surfaces: `conformance/cmp/cmp-018-array-initializer-does-not-fit.*`, `conformance/cmp/cmp-018-argument-does-not-fit.*`, `conformance/cmp/cmp-004-lowercase-output-member.*`, `conformance/cmp/cmp-003-unknown-type-in-a-function-parameter.*`, `conformance/defect-map.md`, `conformance/defects.json`.
- Verify: conformance suite 668+ pass, 0 fail; `expected-failures.json` stays `[]`.

### K3 - Make the release notes list only open limits (high risk)
- [ ] Failing test first, in `scripts/release/run-results.test.ts`: with `knownLimits` of two ids and `expectedFailures` naming only one, `results.knownIssues` contains the one open id and not the other. Observe red on the base (it lists both).
- [ ] Fix `scripts/release/run-results.ts:146`: keep a `limits` entry only when its id is a `requirement` of an `expectedFailures` entry (the same rule as `tools/docs/generate_known_limits.py`). With an empty list the notes carry no `CMP-` line. Keep the existing test at `run-results.test.ts:158` green.
- [ ] Read `scripts/release/release-notes.ts:209` ("### Known issues") and confirm an empty `limits` still renders the other issues, not an empty heading.
- Allowed edit surfaces: `scripts/release/run-results.ts`, `scripts/release/run-results.test.ts`.
- Verify: `bun test scripts/release/run-results.test.ts scripts/release/release-notes.test.ts`; `python3 tools/docs/generate_known_limits.py --check`.
- **Independent verification (required, high risk: item 3, a contract the release workflow consumes):** a fresh verifier reads this whole plan, runs `scripts/release/run-results.ts` on the base twice (real `expected-failures.json`, and a copy with one entry) and checks that `knownIssues` matches, then checks the 2.0.1 behaviour is reproduced on the old script to confirm the cause. It leaves no file in the workspace.

### K4 - The seam
- [ ] Parent runs all commands of "Verification commands" once. `bun run lint` and `bunx tsc -b` at the root are green. Nothing in the outputs changed by K2 and K3 other than the case count and the notes.

### K5 - At the 2.1.0 cut (not before)
- [ ] The version bump commit changes `packages/zplc-compiler/package.json` and `COMPILER/compiler/debug-map.ts:257` together (Finding 5); the CMP-053 test names the mismatch if one is missed.
- [ ] Decide the eleven entries of `docs/known-limits.json`: once K3 lands they are inert (a mapping entry with no failing case renders nowhere). Default: leave them until the cut and delete the eleven then, in the cut commit, since the fixes have shipped (the owner's rule: remove an entry only when its fix ships; it shipped in 2.0.0). Keep the file and its generator.
- Allowed edit surfaces: `packages/zplc-compiler/package.json`, `packages/zplc-compiler/src/compiler/debug-map.ts`, `docs/known-limits.json`, plus whatever the cut already edits.

## Open questions for the owner (defaults in bold)
1. The published 2.0.1 release body lists these eleven as known issues although they are fixed. Edit the GitHub release text (a remote operation, not authorized by this plan)? **Default: no; 2.1.0 notes carry the correct list, and the 2.1.0 changelog says that the eleven were fixed in 2.0.0 and listed by mistake in 2.0.1.**
2. Is "fixed in 2.1.0" satisfied by "already fixed since 2.0.0, now proven and no longer listed"? **Default: yes.** If the owner meant something the 100 cases do not cover (a form of CMP-005, for example, such as an implicit REAL-to-LREAL widening or a literal that should convert), name it and K1 gets a real fix task.
3. The two unintegrated commits of wp-04 (011072c3, e206e3f4) are macOS test portability and conflict on the base. **Default: leave them to the Linux-sweep branch owner; not part of this plan.**
4. `PERSISTENT` and the other D-04 constructs stay rejected with a located message in 2.1.0 (spec decision D-04, "2.x"). **Default: yes, rejection is the requirement (CMP-006), not a gap.**

## Done when
- K1 shows the three suites green on the base with the counts written down; K2, K3 are committed with their tests; K3 has an independent verifier's report; K4 is green.
- The 2.1.0 release notes, generated from the new script, carry no `CMP-` known issue while `expected-failures.json` is empty.
- No product source of the compiler or the VM was edited by this plan (a diff of `COMPILER/` and `firmware/lib/zplc_core/` is empty), and the pinned scene hashes and lesson ids are unchanged.
- Risk line of the plan's code: K3 is `Risk: item 3 (the release evidence script feeds the release workflow)`; K2 is `Risk: none` (new cases only).
