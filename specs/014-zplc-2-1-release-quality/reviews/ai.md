# Review: AI (baseline)

**Area**: AI (spec 014, section 7)  
**Date**: 2026-11-24  
**Source reviewed**: `feat/plant-simulation` at `25142fb7`  
**Reviewer**: outside the run (REV-001)  
**Evidence level**: host. Nothing here is evidence of a board, of the packaged application, or of a model.

`IDE/` stands for `packages/zplc-ide/`.

## 1. Answer

**Does an agent over MCP reach a pass?** Yes, on the easy case, and only because it brought its own file tools. Acting as the agent, the reviewer solved the first plant lesson in Structured Text in one attempt: write the file, `compiler_check` (0.3 s), `scenario_run` (0.5 s), pass. All 43 plant lesson solutions pass through `scenario_run`.

**Can it do what S-20 asks (write in any language, debug, everything)?** No. Three things stop it:

1. **It cannot write.** No tool writes, and the Ladder, FBD and SFC documents are described nowhere, so an agent with file tools has to guess them.
2. **It cannot debug.** A failed run answers "Test execution failed" and nothing else, and the trace of 33 of 43 plant lessons is refused.
3. **Many agents cannot connect.** The server refuses the handshake that, by reports of October 2026, several common clients still use.

**Is the assistant inside Studio useful?** Unknown, and that is the finding: it was never run against a model. With a replaced `fetch`, four of six common answer shapes give the person no reviewable change.

## 2. Method

| Step | What was done |
|---|---|
| Source | `git archive 25142fb7` of `packages`, `docs/docs/{reference,guides,ide}`, `firmware/lib/zplc_core`, `firmware/apps/posix_host`, `firmware/app/{src,include,boards}`, `scripts/release`, `tools/{ci,hil,contract}` |
| Runtime | `zplc_runtime` built from that source with `cmake` (the root `build:runtime` command) |
| Server | `bun run src/mcp/index.ts --workspace <folder>`, the documented command, with `ZPLC_NATIVE_SIM_BIN` set |
| Client | A script that writes JSON-RPC lines to standard input, with the `_meta` envelope of revision 2026-07-28, as `docs/docs/guides/ai-and-mcp.md` shows |
| Agent walk | The reviewer read what the server returns, wrote the program file by hand, and ran the tools again |
| Sweep | For each of the 43 lessons with a scene: copy the solution project, `scenario_run`, `trace_get` |
| Assistant | `createAiProvider` from `IDE/electron/aiProvider.ts` with `fetch` and the vault replaced; no network, no model |
| Reading | `IDE/src/mcp`, `IDE/electron/aiProvider.ts`, `IDE/src/components/{AssistantView,console/AgentTab,settings/AssistantSettings}.tsx`, the three documentation pages on AI |

Scripts and raw results: `.cache/claude-ux-review/ai-check/` (section 6).

## 3. What was not checked

- **A real model.** No provider was called. Whether a model's answers are useful is not measured here.
- **A real MCP client product.** No Claude Code, Cursor or other client was connected. Finding AI-04 rests on the server's measured answers and on third-party reports.
- **The packaged application and the standalone `zplc-mcp` executable.** Everything ran from source.
- **Windows and macOS.** Linux x64 only.
- **The assistant's window.** The review document, the buttons and the settings screen were read in code, not used.
- **The exact dependencies of the tip.** The run used `@modelcontextprotocol/server` 2.0.0 and `zod` 4.2.0 from the main checkout; the tip pins 2.4.0 and 4.6.7. The findings below come from the repository's own code, not from the SDK, except AI-04, which the repository's own guide also states.
- **The boundary tests.** `deviceLink.test.ts` and `aiDeviceLink.test.ts` were read, not run.

## 4. Findings

Severity as REV-004: **blocker** (a gap or a stumble on a golden journey, a false statement, a risk to data or hardware), **visible**, **later**.

### 4.1 Agent over MCP (journey 5)

| Id | Sev. | Finding | Measure | Place |
|---|---|---|---|---|
| AI-01 | blocker | A failed run tells an agent only that it failed. `tests_run` and `scenario_run` return `SCENARIO_ASSERTION_FAILED`, the message "Test execution failed" and the path of the scenario. The Tool API produces the detail (`preview`: position, signals, expected, observed) and the MCP layer drops it. | 3 of 3 failing starters; keys returned: `ok, evidence, savedTestInputIdentity, execution`. The Tool API on the same folder returns `preview` with `index` and `checks` | `IDE/src/mcp/server.ts:629-637` (`preview` accepted, never copied); pinned as known at `IDE/src/cli/toolApi.failureDetail.test.ts:146-147` |
| AI-02 | blocker | The reference says the opposite of AI-01: "With `--json` (and in the MCP tools `tests_run` and `scenario_run`) the result has a `preview`". A false statement on a generated page. | 1 sentence | `docs/docs/reference/mcp.md:68`; its text lives in `tools/docs/generate_source_references.ts` |
| AI-03 | blocker | The trace of most plant lessons cannot be read. A scenario whose trace file is over 512 KiB makes `trace_get` answer `MCP_INTERNAL_ERROR`, with no cause and no way to ask for less. The same function feeds `simulation_start`, `simulation_step`, `runtime_snapshot` and the trace resources (read, not run). | `trace_get` fails on 33 of 43 plant lesson solutions; the 10 that work return 102 to 426 KB per call for 801 to 2,501 samples | `IDE/src/mcp/server.ts:755`, `:876` |
| AI-04 | blocker | The server refuses the 2025 handshake. An `initialize` of 2025-11-25, 2025-06-18 or 2024-11-05 gets error `-32022`. The SDK serves both eras by default; the entry point turns that off, and the guide says the repository records no reason. Reports of October 2026 say Claude Code speaks 2026-07-28 and that VS Code, Cursor and Gemini CLI still open with the 2025 handshake (section 7). No client product was ever run for the guide. | 3 of 3 older revisions refused (measured); client status is third-party, not run here | `IDE/src/mcp/index.ts:60`; `docs/docs/guides/ai-and-mcp.md:66`, `:136` |
| AI-05 | blocker | No tool writes. An agent without file tools can only read, and one with file tools writes Ladder, FBD and SFC documents with no check before the file is on disk. | 0 of 15 tools write a project file | `IDE/src/mcp/server.ts:61-77` |
| AI-06 | blocker | The Ladder, FBD and SFC documents are described nowhere. The Ladder starter of the first plant lesson has `"rungs": []`, so the file gives no example either. A first guess at a rung returned diagnostics such as "Unsupported LD element type 'contact'" and "Rung undefined element id 'undefined' is not safe", none naming an accepted value. `project_validate` answered `ok` for that project. | 0 lines in `docs/docs` name `gridConfig` or `contact_no`; 55 of 111 lessons are in these three languages; the 4-rung solution is 6,223 bytes against 1,125 for the starter | `docs/docs/reference/language-ld.md` (no file format); `IDE/src/models/visualFileLoad.ts` |
| AI-07 | blocker | What 2.1 added cannot be read over MCP: no scene, no plant map, no list of scenarios, no expectations. `zplc://project/source/scene.json` answers `MCP_NOT_FOUND`. No tool lists scenario names, and a wrong name answers `TEST_SCENARIO_NOT_FOUND`, "Test execution failed", with no list. | 0 of 15 tools and 0 of 15 resources name a scene or a plant map | `IDE/src/mcp/server.ts:61-91` |
| AI-08 | visible | A trace holds only the signals the expectations name. On the first plant lesson: `Emit`, `Run`, `fact:count:EyeFar`, `fact:itemsDropped`. The button and the sensor are not there, nor any internal variable. | 4 signals: 2 outputs and 2 facts; 0 of 2 inputs; 0 of 1 internal variables | `trace_get` on `plant-belt-to-sensor` |
| AI-09 | visible | The descriptions are written for the people who built the server. Examples: "Inspect the fixed ZPLC workspace.", "Compile the fixed workspace and return evidence only.", "Return one deterministic recorded host sample with an explicit trace identity." | 15 tools, 4 to 11 words each; 0 of 10 parameters described; 0 result schemas; 15 resources whose title is their URI, 0 described; no server instructions; no prompts | `IDE/src/mcp/server.ts:935-1070`, `:1076`, `:1131` |
| AI-10 | visible | Every wrong start says the same line: "ZPLC MCP workspace is unavailable", exit 1. | 5 of 5: a relative path, a folder that is not a project, a missing folder, `--version`, no arguments | `IDE/src/mcp/index.ts:47` |
| AI-11 | visible | The documentation does not get a person to a working agent. No page names a client. No page says where a lesson's folder is (`<userData>/learn-workspaces/<lessonId>`), so journey 5 on a lesson has an undocumented step. `--user-data` is described without a path. | 0 of 6 client names found in `docs/docs`; 0 lines for `learn-workspaces` | `docs/docs/guides/ai-and-mcp.md:30-62` |
| AI-12 | later | Every result carries about 300 bytes of envelope (`jobId`, `actor`, `permission`, two timestamps) and a second copy of itself as text. | A passing `scenario_run` is about 1,000 bytes, of which the answer is `ok: true` | `scenario_run` result |

### 4.2 Assistant inside Studio (journey 4)

| Id | Sev. | Finding | Measure | Place |
|---|---|---|---|---|
| AI-13 | blocker | The assistant was never run against a model. The documentation says so: "Not verified: the tests use a fake provider, and no provider was run for this page". | 0 recorded runs | `docs/docs/ide/ai-privacy.md:121` |
| AI-14 | blocker | Only one answer shape gives a change to review. The same change inside a fenced block, or after one sentence, is shown as raw text with no change set. One extra key, or content given as a list of parts, is "Provider response could not be trusted". Empty content shows an empty answer. The request sets no response format. | 1 of 6 shapes gives a change set (table in section 5) | `IDE/electron/aiProvider.ts:466-478` (request), `:552-573` (parsing) |
| AI-15 | blocker | Debug cannot explain a failed test or a plant scenario, because it never receives one. It sends the live Structured Text diagnostics of the open file as code, line and column without the message, and a "trace" whose only signal is the cycle counter. The request names no scene, plant map, scenario or expectation, also in a plant lesson. | Trace signals sent: 1 (`runtime.cycles`); project summary keys: `programs, tasks, manifest` | `IDE/src/components/AssistantView.tsx:106-112`; `IDE/electron/aiProvider.ts:466-478` |
| AI-16 | visible | A wrong key, an unknown model and a rate limit show the same line: "Provider request failed: AI_PROVIDER_UNAVAILABLE." No cause, no next step. | 3 of 3 HTTP errors (401, 404, 429) give one code | `IDE/electron/aiProvider.ts:506`; `IDE/src/i18n/catalog/console.ts` (`console.providerRequestFailed`) |
| AI-17 | visible | Setup is four fields with no example and no test of the connection, and no page gives the steps. The endpoint must answer at `<endpoint>/v1/chat/completions`, and a key is required also for a local endpoint. | 0 lines in `docs/docs` with an endpoint example | `IDE/src/components/settings/AssistantSettings.tsx`; `IDE/electron/aiProvider.ts:456`, `:499` |
| AI-18 | visible | There is one way in: the command `view.agent`. Nothing in Problems, in the test results, in the lesson guide or on a selection opens the assistant with that context. Each request is alone: two messages, no earlier turn. | 1 entry point; 2 messages per request | `IDE/src/commands/bind/assistant.ts`; `IDE/electron/aiProvider.ts:470-478` |
| AI-19 | visible | A change must come back as the whole text of each file, in one answer, within 30 seconds, without streaming. Ladder solutions of the course: median 7,699 bytes, 17 of 34 over 8 KB, 11 over 16 KiB, 1 over the 64 KiB limit of the open program. Whether a model finishes in time was not measured. | 30 s; `stream: false` | `IDE/electron/aiProvider.ts:469`, `:495`, `:58` |
| AI-20 | visible | Two names for one thing. The view and the preferences say Assistant; inside the view the heading, the mode label and four messages say Agent, and the system text opens "You are ZPLC Agent". The four mode buttons print the identifiers `ask`, `plan`, `edit`, `debug` in both languages. | 6 English strings with "Agent" in `console.*`; 4 untranslated buttons | `IDE/src/i18n/catalog/console.ts`; `IDE/src/components/console/AgentTab.tsx:117`; `IDE/electron/aiProvider.ts:74` |
| AI-21 | visible | The system text does not say which language to answer in, which dialect of Structured Text ZPLC accepts, which blocks exist, or what a Ladder, FBD or SFC document looks like ("the JSON documents of their editors"). In a lesson it does not know there is a lesson (AIX-005 has nothing to stand on). | 1,267 characters | `IDE/electron/aiProvider.ts:74-91` |

### 4.3 Both

| Id | Sev. | Finding | Measure | Place |
|---|---|---|---|---|
| AI-22 | visible | The boundary is cited by the wrong number. Pages and code say "AGENTS.md rule 7"; rule 7 is Style and the boundary is rule 8. It is in the danger box of the MCP guide. | 12 files cite rule 7, 0 cite rule 8 | `docs/docs/guides/ai-and-mcp.md:15`, `docs/docs/ide/ai-privacy.md:94`, `docs/docs/guides/force-values.md:17`, and 9 more (OSS-005 covers one of them) |

The twelve files of AI-22, at `25142fb7`: `docs/docs/guides/ai-and-mcp.md`, `docs/docs/guides/force-values.md`, `docs/docs/ide/ai-privacy.md`, `docs/docs/development/hardware-software-review.md` and its Spanish page under `docs/i18n/es/`, `IDE/electron/firmwareImagesProtocol.ts`, `IDE/src/boards/firmwareImage.ts`, `IDE/src/components/deployFlow.ts`, `IDE/src/components/settings/FirmwareImageCard.tsx`, `IDE/src/mcp/deviceLink.test.ts`, `IDE/src/mcp/server.test.ts`, `specs/011-zplc-2-0-remediation/spec.md`. The search was for "rule 7"; the Spanish pages that say "regla 7" were not counted.

## 5. What works

- **The loop is fast and holds.** 43 of 43 plant lesson solutions pass through `scenario_run` over MCP (FBD 1, IL 1, LD 14, SFC 4, ST 23). Median 6.2 s, longest 18.4 s.
- **An agent with file tools passes the first plant lesson** in Structured Text in one attempt, reading `plant-map.json` and the scenario from the folder.
- **The server refuses bad input cleanly.** Wrong arguments name the wrong field; an unknown tool and an unknown resource are refused.
- **The detail an agent needs already exists** one layer down: the Tool API returns `index` and `checks` with `expected` and `observed` for each failed expectation.
- **The assistant's reviewed change works with a well-formed answer**: one file, checked on a copy, offered for review.

Assistant answer shapes, with `fetch` replaced:

| Answer of the endpoint | What the person gets |
|---|---|
| The JSON the system text asks for | A change set of 1 file |
| The same JSON inside a fenced block | Raw text, no change set |
| One sentence, then the JSON | Raw text, no change set |
| The JSON with one extra key | "Provider response could not be trusted." |
| Content as a list of parts | "Provider response could not be trusted." |
| Empty content | An empty answer |

## 6. Reproduce

Folder: `.cache/claude-ux-review/ai-check/harness/`. Set `ZPLC_IDE` to `packages/zplc-ide` of a worktree at the source above and `ZPLC_NATIVE_SIM_BIN` to a built `zplc_runtime`. The scripts hold the scratch path `/home/claude/aicheck`; replace it once with `sed -i "s|/home/claude/aicheck|$PWD|g" *.mjs *.ts`.

| Script | Measures |
|---|---|
| `mcp.mjs` | The client used by the others |
| `probe1.mjs <folder>` | AI-09: tools, parameters, resources, prompts |
| `walk1.mjs`, `walk2.mjs <folder> <scenario>` | AI-01, AI-07, AI-08, AI-12: every tool and resource on a starter |
| `walk3.mjs <folder> <scenario>` | The agent walk: check, run, trace |
| `legacy.mjs <folder>` | AI-04: older handshakes |
| `sweep.mjs solution` | AI-03 and section 5: 43 lessons, result in `sweep-solution.jsonl` |
| `failing.mjs` | AI-01, AI-03 on three starters |
| `ldtry.mjs <folder>` | AI-06: a guessed Ladder document |
| `preview.ts` | AI-01: what the Tool API returns for the same folder |
| `assistant.ts` | AI-14, AI-15, AI-16: answer shapes, request body, HTTP errors |

## 7. Sources for AI-04, read on 2026-11-24, not run here

- MCP TypeScript SDK, "Legacy clients": `serveStdio` serves both eras unless told otherwise. https://ts.sdk.modelcontextprotocol.io/v2/documents/Documents.Serving.Legacy_clients.html
- A survey of clients dated October 2026: Claude Code tries the new revision first; Cursor, VS Code and Gemini CLI are on 2025 revisions. https://www.trailhq.com/blog/what-is-an-mcp-server
- An issue of October 2026 that records the revision each host sends: Claude Code 2.1.302 on 2026-07-28 (observed); VS Code and the Cursor CLI on 2025-11-25 (from source and bundle). https://github.com/allisonmahmood/patchy-cloud/issues/732

These are reports by others. JRN-007 asks for the project's own run with real clients.

## 8. Order of repair proposed

1. **Defects that need no design** (red test first): AI-01 and AI-02 together, AI-03 as an honest limit until AIX-015 lands, AI-10, AI-14, AI-16, AI-22.
2. **Connect**: AI-04 as D-35 decides, then one recorded run with Claude Code.
3. **The tools of S-20**: AIX-001 (AI-07), AIX-011 (AI-05), AIX-013 (AI-06), AIX-014 and AIX-015 (AI-03, AI-08), then AIX-008 over the whole surface (AI-09).
4. **The assistant**: AIX-003 (AI-18), AIX-006 (AI-17), AIX-004 (AI-20, AI-21), with AI-15 closed by the context of AIX-001.
5. **The task set** of AIX-009, run with a real model: it turns AI-13 and AI-19 from unknown into numbers.
