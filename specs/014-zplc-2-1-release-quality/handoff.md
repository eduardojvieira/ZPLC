# Spec 014: handoff to the run

**Date**: 2026-11-25  
**For**: the orchestrating agent and its writers  
**Written by**: the reviewer, outside the run

This file is the brief for spec 014. It replaces the chat messages in which the spec was written: nothing the run needs is only in a message.

The owner said on 2026-11-25: "documenta todo, el agente va a seguir trabajando en lo que tenia que hacer antes". So nothing here stops an open thread. The work below starts when the owner says so, beside the threads that are already open.

`IDE/` stands for `packages/zplc-ide/`.

## 1. What this folder holds

| File | What it is | Who writes it |
|---|---|---|
| `spec.md` | The specification: 71 requirements, statements S-14 to S-23, decisions D-28 to D-37 | The reviewer and the owner |
| `reviews/ai.md` | The AI baseline of 2026-11-24: findings AI-01 to AI-22 | The reviewer |
| `handoff.md` | This brief | The reviewer |
| `bar.md` | The commercial bar (BAR-001), written by the reviewer and committed as is on 2026-11-26 | The reviewer |
| `journeys.md` | The five golden journeys, step by step (JRN-001). Not written yet | The run |
| `screens.md` | Every surface a person sees, with its states (UXV-001); written 2026-11-26 | The run |
| `reviews/<area>.md` | One record per review of section 7 | The reviewer |

Outside the repository, in `.cache/claude-ux-review/ai-check/`: the scripts and raw results behind `reviews/ai.md`. When the task set of AIX-009 is built, the scripts worth keeping move into the repository with it.

`spec.md` is the only current text of the specification. A file named `spec-1.md` in this folder is an older copy and is not part of it.

## 2. What changes for the run

| Rule | Where it comes from |
|---|---|
| Nothing that was in scope on 2026-11-24 moves to 2.1.x without a statement of the owner | D-28, FRZ-002 |
| Nothing new enters the scope after 2026-11-25 | S-21, FRZ-002 |
| The run does not study other products and gives nothing of theirs to a generator. It works from `bar.md` | D-29, BAR-003 |
| Each review has two fix waves. A blocker is fixed however many it takes | D-33 |
| In simulation an agent does what a person does in Studio. On a board, a serial port, plant I/O mode, or a session a person is running, it does nothing | D-31, AIX-010 |
| Rule 8 of `AGENTS.md` is never loosened. It is worded exactly and cited by its number | AIX-010, AI-22 |
| The MCP server serves clients of both protocol eras | D-35 |
| The run does not change a statement or a decision of `spec.md`. It records closes: the index, the coverage, the scope list | Section 1 of the spec |

Everything else stays as the run already works: a red test first, an independent verifier on each change, the evidence level named, a push after each writer and each merge.

## 3. First, once

1. Commit `spec.md`, `reviews/ai.md` and `handoff.md` to `feat/plant-simulation`. Create the requirement index of spec 014 (69) and add the spec to the coverage check.
2. **FRZ-001**: the single scope list of 2.1.0 inside the repository, versioned. It starts from the Tasks table of the run log (L306) and replaces it.
3. **JRN-001**: `journeys.md` with the five journeys step by step against the documentation as it is. Mark every step the documentation does not give.
4. **AI-22 and OSS-005**: the boundary is rule 8 of `AGENTS.md`. Twelve files cite it as rule 7 (list in `reviews/ai.md`, AI-22, and `specs/011-zplc-2-0-remediation/spec.md:98`).

None of the four touches product behaviour.

## 4. The threads

They run beside each other and beside the open threads, where they share no file. A stop holds only its own thread.

### 4.1 AIX: AI

The baseline and the order of repair are in `reviews/ai.md`, section 8.

1. **Defects that need no design**, red test first: AI-01 and AI-02 together (the detail of a failed expectation in `tests_run` and `scenario_run`), AI-10, AI-14, AI-16, AI-22.
2. **D-35**: serve both protocol eras (remove `legacy: 'reject'` at `IDE/src/mcp/index.ts:60`), with a test in which a client that opens with `initialize` of 2025-11-25 lists the tools. If a reason to refuse the older handshake exists, stop and report it.
3. **Plan of AIX-011 to AIX-015** before any code: writing in the five languages, `zplc.json` and scenarios; debugging in a simulator private to the agent; the formats of Ladder, FBD and SFC with a schema and a worked example; answers sized for an agent. The plan lists every tool with its name, its parameters and what it returns, and says how rule 8 is worded.
4. **A script for one real run with Claude Code** against the server (JRN-007). The owner launches it; the run does not use the owner's accounts on its own.

**Stop of the owner**: the plan of step 3. The reviewer reads it against the AI part of `bar.md`.

### 4.2 UXV: final visual verification

1. **UXV-001**: `screens.md`, the inventory of surfaces and their states, checked against the registries of commands and views.
2. **UXV-003 and UXV-004**: the capture tool and the measured defects, built on `IDE/scripts/capture-editor-shots.ts`, `IDE/scripts/interfaceBudget.ts`, `IDE/scripts/textFit.ts` and the journeys. One red test per detector.
3. **A first run** on `feat/plant-simulation` in the conditions of D-36. Leave the sheets per area in `.cache/claude-ux-review/uxv/` with the summary of measured defects.
4. Correct the measured defects. Everything else waits for the reviewer's look (UXV-005).

**Stop of the owner**: the sheets of the first run.

The whole verification runs again, last, on the installers of the candidate (UXV-009).

### 4.3 PUB: documentation and site

Measured at `77dfb9af`: the site is published by `.github/workflows/deploy-docs.yml` on a push to `master` that touches the documentation or the product; it keeps one version, labelled 2.0 by hand at `docs/docusaurus.config.js:106`; its footer names the latest published release; the release notes page is the one of 2.0.0; the home page names neither the plant, nor AI, nor 2.1.

1. **PUB-005**: propose how the site turns to 2.1 with the release and not with the merge that comes before it, and whether the pages of 2.0 are kept.
2. **PUB-001**: each item of the scope list names its pages in English and in Spanish, with the check that fails when one is missing.
3. **PUB-002 to PUB-004** close with the candidate: the page of what is new, the generated pages and the captures made again, and the site presenting 2.1.

### 4.4 BAR and the polish tool

`bar.md` comes from the reviewer in two passes (BAR-001). Until a part exists, the area is built against the requirements of specs 012 and 013.

A tool of the study, build, check and refine kind (Craft Anything was the one looked at) is used only as BAR-005 and BAR-006 say: against targets the project owns, tried first on a disposable copy, never on the integration worktree, and its changes enter through writers, checks and verifier.

## 5. Stops of the owner

The stops of specs 012 and 013 stay as they are. Spec 014 adds:

| Stop | What the owner sees |
|---|---|
| Plan of AIX-011 to AIX-015 | The list of tools an agent will have |
| First sheets of UXV | Every surface in the conditions of D-36, with the measured defects |
| One real run with Claude Code | The agent writing and debugging a lesson; the owner launches it |
| The bench | Journey 2 on two board families, with a person (JRN-006) |
| The signature | The five journeys on the installers, on Linux and on Windows, one walk in each language, with the sheets of the final pass (D-34, UXV-009). The first-run check on a real Mac and a real Windows machine and the hardware records of REL-016 stay as spec 011 asks |

## 6. What the reviewer delivers

| What | When |
|---|---|
| `bar.md`, first pass: AI, plant view, teaching, programming environment | Before the thread that builds each reaches its last stop. The AI part before the AIX plan is approved |
| The reading of the AIX plan | At its stop |
| The look at the UXV sheets (UXV-005) | At each run of the sheets |
| The reviews of section 7 | As each area closes |
| `bar.md`, second pass: first use, documentation, installers, free project | At the freeze |
| The check of each area against the bar (BAR-007) | After the freeze |
| The look at the sheets of the candidate | Before the signature |

## 7. Answers of 2026-11-25 to the run's ten questions

Given by the reviewer under S-19, for the most complete release. The owner overturns any of them with a statement.

| # | Question | Answer |
|---|---|---|
| 1 | Who answers at the bench | The owner types, with `tmux attach -t bench`. The run prepares the session; it types no answer and starts no flash. A hardware record is made by a person (rule 8) |
| 2 | An image per language in a reading | Approved. The two files always come as a pair, with the same size, and each page has its own alternative text |
| 3 | The shortcut of `view.focusCommandBar` (U3-G5) | `Mod+Alt+C`. Not `Alt+F6`: GNOME takes it to switch between the windows of one application, and `F6` alone is `debug.pause` (`IDE/src/commands/registry.ts:153`). Also check `Mod+Alt+T`: on Ubuntu `Ctrl+Alt+T` opens the system terminal |
| 4 | The three first-use sessions (U3-G7) | Still a step of the owner, with no people and no date yet. It holds nothing: the protocol and the record sheet are made ready |
| 5 | N10, numeric ranges in scenes 7, 10, 11 and 16 | In 2.1.0 (D-28). First the grade stores numeric failures, then N10 |
| 6 | The 30 s limit of a scene run (`IDE/src/cli/toolApi.ts:135`) | Batch the exchange with the runtime. Do not shorten the scenario and do not raise the limit. The trace hashes and the grades of the 43 lessons with a scene stay identical, measured before and after, and the time of each is recorded |
| 7 | The checks of a failed test over MCP | Fixed in 2.1.0: AI-01 and AI-02 of `reviews/ai.md` |
| 8 | Four weak scenarios of the course | All four are strengthened in 2.1.0. Each still passes the reference solution and rejects a named wrong program, which joins the wrong set. For the PID the response is graded (settling time, overshoot), not the gains; it depends on N10 |
| 9 | HIL-009 for the release | No exception for 2.1.0. Two things are due: the bench of `tools/hil/BENCH-2.1.md` on both boards before the first candidate (RCN-003), and the records of gate 6 on the images of the draft before publishing (REL-016) |
| 10 | Scene hashes and frame rates on macOS and Windows | Run the nightly on the hosted runners now, for the scene hashes. A frame rate from a hosted runner is recorded as such and claims nothing about a real GPU. The real machines are a step of the owner |

Every subagent (writer, verifier, explorer) runs on Claude Opus 5.5 at medium effort, as the owner asked on 2026-11-26. The brief of each is closed: the branch, the files, the red test, the commands and the end condition; and each commits and pushes after the red test and after each green one, so a cut loses nothing.

## 8. What is not known

- No model and no MCP client product has been run against ZPLC by anyone (`reviews/ai.md`, section 3).
- Which clients speak which protocol revision comes from reports by others, of October 2026.
- No estimate exists for AIX-011 to AIX-015, UXV and PUB. Each plan gives its own.
- The estimate made before those three entered was three to four weeks for everything then in scope. It is an estimate by the reviewer, not a measure.
