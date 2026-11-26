# Spec 014 — AIX Implementation Plan (AIX-001 to AIX-015)

**Status**: **OWNER STOP — DESIGN PLAN ONLY (NO PRODUCT CODE WRITTEN)**  
**Approval Gate**: Read by the external reviewer against the AI section of `bar.md` and approved by the owner before any implementation unit for `AIX-011`..`AIX-015` begins (`handoff.md` §4.1, §5, §6).  
**Date**: 2026-11-26  
**Branch**: `docs/s14-aix-plan` (branched from `feat/plant-simulation` at `1fd9c914`)  
**Spec Reference**: `specs/014-zplc-2-1-release-quality/spec.md` (S-18, S-20, D-29, D-31, D-32, D-35, AIX-001..015, JRN-001 #4/#5, JRN-007)  
**Clean-Room Rule (D-29)**: This plan is written strictly from repository sources (`spec.md`, `handoff.md`, `reviews/ai.md`, `journeys.md`, `AGENTS.md`, `packages/zplc-ide/`, and `docs/`). No other commercial PLC or factory-simulation product was studied or cited.

---

## 1. Status Baseline: Closed vs Remaining Open

### 1.1 Already Closed on `feat/plant-simulation` (as of `1fd9c914`)

| Finding / Decision | Commit(s) | What Landed |
|---|---|---|
| **AI-01, AI-02** (MCP failure preview & docs) | `a36e1d9e` | `tests_run` and `scenario_run` return `preview` with failed expectation `index`, `checks` (`signal`, `expected`, `observed`) and `atMs`; `docs/docs/reference/mcp.md` now matches implementation. |
| **AI-10** (MCP startup error messages) | `07647370`, `1842e22f` | `packages/zplc-ide/src/mcp/index.ts` distinguishes missing arguments, relative paths, missing folders, missing `zplc.json`, bad `--repository`/`--user-data`, `--help`, and `--version` with exit codes `0`, `1`, `2`. |
| **AI-14** (Assistant answer shapes) | `efcf9502` | `packages/zplc-ide/electron/aiProvider.ts` extracts structured JSON from raw JSON, markdown fenced blocks, prose+JSON, and content part arrays while rejecting forbidden tool-call keys and ambiguous multi-block payloads. |
| **AI-16** (Assistant HTTP error codes) | `07647370`, `1842e22f` | Maps HTTP 401/403 (`AI_PROVIDER_AUTH`), 404 (`AI_PROVIDER_MODEL`), 429 (`AI_PROVIDER_RATE_LIMIT` + `retryAfter`), 5xx (`AI_PROVIDER_SERVER`), network failures (`AI_PROVIDER_UNREACHABLE`). |
| **AI-22 / OSS-005** (Rule 8 citations) | `14dbc5fb` | All 12 files (including docs and MCP tests) cite `AGENTS.md` rule 8 consistently. |
| **D-35 / AI-04** (Dual MCP protocol eras) | `07647370`, `1842e22f` | `packages/zplc-ide/src/mcp/index.ts` passes `{ legacy: 'serve' }` to `serveStdio`, serving both 2025 handshake (`initialize`) and 2026-07-28 `_meta` clients. |

### 1.2 Remaining Open Findings Addressed by This Plan

| Severity | Open Findings | Requirements Closed |
|---|---|---|
| **Blocker** | `AI-03` (>512 KiB traces fail on 33/43 plant lessons), `AI-05` (no MCP write tools), `AI-06` (no LD/FBD/SFC format docs or accepted-value diagnostics; `project_validate` accepts broken visual files), `AI-07` (MCP cannot read scene, plant map, or scenario list/expectations), `AI-13` (assistant never run against a real model), `AI-15` (assistant debug receives no failed scenarios, plant facts, or diagnostic messages) | `AIX-001`, `AIX-002`, `AIX-009`, `AIX-011`, `AIX-013`, `AIX-014`, `AIX-015`, `JRN-007` |
| **Visible** | `AI-08` (traces omit inputs and internal variables), `AI-09` (terse tool/resource descriptions, no parameter docs, no server instructions or prompts), `AI-11` (docs lack named client steps and `<userData>/learn-workspaces/<lessonId>` guidance), `AI-17` (setup lacks examples, connection test, key-free loopback), `AI-18` (only one assistant entry point, no attached context from Problems/Tests/Guide/editors), `AI-19` (30 s / full-file edit latency and 64 KiB large-LD limit unmeasured), `AI-20` (mixed "Agent"/"Assistant" naming and untranslated mode buttons), `AI-21` (system policy lacks language/dialect/visual rules and lesson stance) | `AIX-003`..`AIX-008`, `AIX-012` |
| **Later** | `AI-12` (per-result envelope bloat and duplicated prose notes) | `AIX-008`, `AIX-015` |

### 1.3 Non-Goals (Out of Scope for 2.1.0 per Spec 014 §5.5 & D-31)

- No tool-using autonomous agent inside Studio (the in-app Assistant remains a single-request helper producing human-reviewed change sets and clickable proposals under `IDE-030`).
- No new IEC 61131-3 language constructs, no new plant catalogue parts, and no new board families.
- Zero hardware, serial, board, plant I/O mode, or live-Studio-session attachment over MCP or Assistant (`AGENTS.md` rule 8, `AIX-010`).

---

## 2. Exact Rule 8 / AIX-010 Boundary Specification

### 2.1 Verbatim `AGENTS.md` Rule 8

From `AGENTS.md` lines 44–49 (always cited by number **rule 8**, never rule 7):

> **8. Physical operations**: building firmware, flashing, deploying a program, forcing I/O, RUN/STOP, raw serial and shell access are separate operations that a person starts. An AI assistant or MCP never initiates them. A hardware record (a bench run bound to a firmware commit and image hash) is made by a person; never write one, and never raise a board above `cross-build` by hand: the level is derived from the records that `boards.json` references.

*(Note: `firmware_build` remains the single pre-existing local ephemeral cross-build tool in `zplc-mcp` when explicitly started with `--repository`, producing only a temporary host ELF hash with no flash or deploy path; no new firmware or hardware tool is added.)*

**Why rule 8 itself must change.** Rule 8 says an AI assistant or MCP never initiates "forcing I/O, RUN/STOP", with no limit to hardware, and `docs/docs/guides/force-values.md:17` says AI assistants and the MCP server "never force a value, on a simulator or on a device". `debug_set_inputs` and `debug_step` (§3.2 Group D) set inputs and step a program on a simulator. D-31 and AIX-014 put a simulator private to the agent inside the boundary, and AIX-010 asks that rule 8 and the pages that cite it say exactly where the line is. So the sentence of rule 8 and of that page changes, and that change is the owner's (§2.1a).

### 2.1a Rule 8 Sentence (APPROVED BY THE OWNER, 2026-11-26)

**Status: approved by the owner on 2026-11-26, as written (both the rule 8 sentence and the force-values sentence, in English and Spanish). AIX-U13 applies them to `AGENTS.md` and the pages in the same change as the group D tools.** Before that unit: No unit edits `AGENTS.md`, `docs/docs/guides/force-values.md`, `docs/i18n/es/docusaurus-plugin-content-docs/current/guides/force-values.md` or any other page, and the server instructions and refusals in `src/mcp` and the assistant policy do not carry the new boundary text, until the owner approves it. Until then they keep the wording of 2.0, and no tool of Group D (§3.2) ships.

Rule 8 of `AGENTS.md`, English (replaces its second sentence, "An AI assistant or MCP never initiates them."):

> An AI assistant or MCP never initiates them on hardware or on a session a person runs: it never forces I/O, changes RUN/STOP, flashes, deploys or opens a serial port there. It may set inputs and step a simulator that is private to it, one the MCP server starts for that agent alone (D-31, AIX-014).

Rule 8 of `AGENTS.md`, Spanish (for the Spanish pages that quote the rule):

> Un asistente de IA o un MCP nunca las inicia en un equipo físico ni en una sesión que maneja una persona: allí nunca fuerza E/S, nunca cambia RUN/STOP, nunca graba firmware, nunca despliega y nunca abre un puerto serie. Puede fijar entradas y avanzar paso a paso un simulador privado suyo, uno que el servidor MCP arranca solo para ese agente (D-31, AIX-014).

`docs/docs/guides/force-values.md:17`, English (replaces "AI assistants and the MCP server never force a value, on a simulator or on a device (AGENTS.md rule 8).", the rest of the paragraph stays):

> AI assistants and the MCP server never force a value, change RUN/STOP, flash, deploy or open a serial port on a device or on a session a person runs (AGENTS.md rule 8). An agent may set inputs and step a simulator that is private to it, one the MCP server starts for that agent alone; that is not a force, and it never reaches your simulator or your controller.

Same line in the Spanish twin:

> Los asistentes de IA y el servidor MCP nunca fuerzan un valor, nunca cambian RUN/STOP, nunca graban firmware, nunca despliegan y nunca abren un puerto serie en un equipo ni en una sesión que maneja una persona (regla 8 de AGENTS.md). Un agente puede fijar entradas y avanzar paso a paso un simulador privado suyo, uno que el servidor MCP arranca solo para ese agente; eso no es un forzado y nunca llega a tu simulador ni a tu controlador.

After approval, `AIX-U13` (§10.1) applies these sentences to `AGENTS.md` and both pages, and the surfaces of §2.2 adopt the same line in the same unit as the tools that need it.

### 2.2 Required Wording Across All Four Surfaces

Every surface states the exact same boundary in plain language and cites **`AGENTS.md` rule 8**. The line is the one of §2.1a, never a narrower one: an agent never forces I/O, changes RUN/STOP, flashes, deploys or opens a serial port **on hardware or on a session a person runs**, and it may set inputs and step only a simulator private to it. The texts below are the target wording; they ship only after the owner approves §2.1a.

1. **MCP Server Instructions** (`McpServer` constructor `instructions` field):
   > "Physical boundary (AGENTS.md rule 8): this server operates only inside the workspace folder and in private host simulations it starts for you alone. In those private simulations you may set inputs and step the program. No tool or resource forces I/O, changes RUN/STOP, flashes a board, deploys a program, opens a serial port or shell, or enters plant I/O mode on hardware or on a session a person runs, and no tool attaches to a user's running Studio session. If the user asks for any of these, refuse in plain words and tell them to perform that step themselves in ZPLC Studio."
2. **MCP Refusal Messages** (returned whenever an unsupported or out-of-boundary action is attempted, e.g. sensitive manifest fields, out-of-workspace paths, or forbidden arguments):
   - Always includes: `error` code, `cause` in plain English, `boundary: "AGENTS.md rule 8"` where applicable, and `nextStep` naming the safe manual action in Studio (e.g., *"Perform flashing, deployment, forcing, or RUN/STOP manually from ZPLC Studio's Hardware / Controller bar."*).
3. **Documentation** (`docs/docs/guides/ai-and-mcp.md`, `docs/docs/reference/mcp.md`, `docs/docs/ide/ai-privacy.md`, and their `docs/i18n/es/` twins):
   - Explicitly cites **`AGENTS.md` rule 8** (`regla 8 de AGENTS.md` in Spanish).
   - Updates the 2.0 "writes nothing" statement per Spec 014 §10.2 to state clearly: MCP may validate and write project files inside the confined workspace and run private host simulations/debugging, and may never touch a board, serial port, plant I/O mode, shell, or a user's running Studio session.
   - Matches every field sent by `electron/aiProvider.ts` to `docs/docs/ide/ai-privacy.md`.
4. **Assistant System Policy** (`SYSTEM_POLICY` in `packages/zplc-ide/electron/aiProvider.ts`):
   > "You are ZPLC Assistant. Respect AGENTS.md rule 8: never claim hardware action, never request tools, and never initiate or propose forcing I/O, RUN/STOP/reset, flashing, deploying, recovery, serial port access, plant I/O mode, or shell execution on hardware or on a session a person runs, and never attach to a running session. Direct the user to perform physical operations manually in ZPLC Studio."

### 2.3 Allowlist vs Forbidden Surface Matrix

| Surface | Explicitly Allowed | Explicitly Forbidden (Rule 8 / AIX-010 / IDE-030) |
|---|---|---|
| **Workspace Files (MCP)** | Read/validate/write confined to `src/*.{st,il,ld.json,fbd.json,sfc.json}`, `zplc.json` (no sensitive fields), `tests/*.scenario.json`, `scene.json`, `plant-map.json`. | Reading/writing outside workspace root, following symlinks, deleting files, writing credentials/sensitive fields in `zplc.json`, writing hardware bench records (`boards.json` / `specs/**/evidence/*`). |
| **Execution & Debugging (MCP)** | Private ephemeral `zplc_runtime` child process (+ optional private `plantCore` instance) spawned by `zplc-mcp` with isolated temp `ZPLC_PERSIST_ROOT` and virtual clock. | Attaching to a board, serial port, Web Serial, raw TCP/UDP socket, plant I/O mode (`plant-io`), or the user's running Studio simulation/hardware session. |
| **Repository Tools (MCP, `--repository`)** | Read-only `boards_list`, `toolchain_inspect`, and local ephemeral `firmware_build` cross-build only. | Flashing, uploading, deploying, erasing, provisioning, or modifying `boards.json` validation levels. |
| **Course & Lessons (MCP + Assistant)** | Read-only `zplc://course/progress` and `zplc://lesson/current` (goal, stage, hints). | Modifying progress, marking a lesson passed (only **Check** does), unlocking lessons, toggling `hideSolutions`, or reading/revealing reference solutions when `hideSolutions` is enabled. |
| **Studio Assistant Proposals** | Reviewed change set (<=4 files, human clicks **Save reviewed change**), clickable navigation/editor commands (`openFile`, `goToLine`, `selectElement`, `compile`, `generateSt`, `startSimulation` only when no board connected), and 5 display settings (`theme`, `language`, `density`, `editorFontSize`, `editorTabSize`). | Any physical command (`connect`, `disconnect`, `deploy`, `run`, `pause`, `stop`, `step`, `reset`, `force`, `plantIoMode`), download/flash, provider config/key, `autosaveSeconds`, `checkForUpdates`, `unlockAllLessons`, `hideSolutions`, or LLM `tool_calls`. |

### 2.4 Exact Regression Test Contract

No PR in the AIX workstream may weaken these automated gates; they are updated in lockstep with new tools and must stay green on every commit:

1. **`packages/zplc-ide/src/mcp/deviceLink.test.ts`**:
   - **Closed registration list**: Enumerates live `buildMcpServer()` calls; `tools` MUST exactly match `MCP_TOOL_NAMES` (26 tools) and `resources` MUST exactly match `MCP_RESOURCE_URIS` (22 fixed) + 4 templates.
   - **Forbidden verb regex**: Every tool name MUST NOT match `/flash|deploy|force|upload|connect|serial|shell|poke|erase|provision|board_|plant_io|mirror|attach|delete|remove|progress_write|unlock|solution/`.
   - **Annotation invariants**: Every tool has `openWorldHint: false`. `destructiveHint: true` is declared ONLY by `workspace_write`, which replaces existing files (a client reads the hint to decide whether to ask the person); the test pins the closed list `['workspace_write']` for `destructiveHint: true` and asserts `destructiveHint: false` on every other tool. `readOnlyHint: false` is permitted ONLY on the closed list: `['workspace_write', 'debug_session_start', 'debug_session_stop', 'debug_set_inputs', 'debug_breakpoints', 'debug_step', 'firmware_build']`.
   - **Strict input argument fence**: Every tool uses Zod `.strict()`. Every tool rejects all forbidden keys: `port`, `serialPort`, `device`, `baud`, `host`, `address`, `studioSession`, `deploy`, `flash`, `force`, `command`, `shell`, `boardRun`, `boardStop`, `plantIo`, `mirror`.
   - **Bundler module graph (`Bun.build` metafile)**: Bundle of `src/mcp/index.ts` MUST contain ZERO imports of `serialAdapter`, `serialConsole`, `connectionManager`, `deviceHandshake`, `uploadProtocol`, `uploadTrace`, `provisioningCommands`, `uploader/`, `electron/main`, `electron/preload`, `electron/serialPort`, `plant/board/`, or Node/network modules (`net`, `dgram`, `tls`, `http`, `https`, `http2`, `serialport`, `ws`, `usb`, `worker_threads`, `cluster`). Exact allowlist of `child_process` and `spawnAllowList` callers stays pinned.
   - **Runtime socket/serial trap**: Runs read, check, write, and private simulation tools with poisoned `net.connect`, `dgram.createSocket`, `tls.connect`, `Bun.connect`, `Bun.listen`, `navigator.serial` -> zero trap hits.
2. **`packages/zplc-ide/electron/aiDeviceLink.test.ts`**:
   - `isAllowedAiProviderRequest` strictly allowlists only documented request fields (Section 9.1) and rejects every physical/device/session key at top level and nested inside diagnostics/trace/context.
   - Bundler module graph of `electron/aiProvider.ts` contains zero serial/socket/child_process imports.
3. **`packages/zplc-ide/src/ai/proposals.test.ts`**:
   - Verifies against the live Studio command registry that no physical/hardware/board/plant-I/O command and no restricted setting (`hideSolutions`, `unlockAllLessons`, `autosaveSeconds`, `checkForUpdates`, `provider`, `apiKey`, `endpoint`) can ever be parsed as a valid `AiProposal`.
4. **`packages/zplc-ide/src/mcp/lessonPrivacy.test.ts` (NEW)**:
   - Verifies that when `hideSolutions: true` is persisted in `<userData>`, neither `zplc://lesson/current` nor the Assistant context builder returns solution source, solution paths, or solution diffs, and the Assistant system prompt includes the hard refusal directive.

---

## 3. Complete MCP Tool, Resource & Prompt Catalogue

### 3.1 Standardized Conventions (AIX-008, AIX-015)

#### Evidence Level Field (Stated Once per Result — AIX-008, AI-12)

Every successful tool result carries a single top-level `evidenceLevel` field instead of repeating verbose disclaimers across nested objects:

- `'host-static'` — Workspace inspection, validation, compilation, symbols, safety check, format/manifest checks, dry-run write check.
- `'host-simulation'` — Deterministic native POSIX runtime + optional private `plantCore` (`tests_run`, `scenario_run`, `trace_get`, `simulation_*`, `runtime_snapshot`, `debug_*`). Never hardware or HIL.
- `'local-cross-build'` — Ephemeral local Zephyr cross-build (`firmware_build`). Not flash, deploy, or HIL.
- `'repository-metadata'` — Declared board catalogue or local toolchain check (`boards_list`, `toolchain_inspect`, `server_self_check`).

To close **AI-12** while keeping MCP SDK compatibility:
- `structuredContent` holds the concise result payload (no duplicate `note` prose on every call). `execution` keeps its 2.0 shape through 2.1, so 2.0 clients keep working; the compact `audit: { jobId, permission, durationMs }` is added beside it (§8.3).
- `content` contains one concise text block (`JSON.stringify(structuredContent)`) sized strictly below `MAX_OUTPUT_BYTES` (512 KiB; target `< 64 KiB` on default calls).

#### Standardized Error Envelope (AIX-015)

Every tool error returns `isError: true` with:

```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "message": "Plain-language summary of what failed.",
  "cause": "Concrete reason (e.g., unknown scenarioId 'belt-1', or invalid LD element type 'contact').",
  "nextStep": "Actionable next step (e.g., 'Call scenarios_list or use one of validValues.').",
  "validValues": ["belt-to-sensor"],
  "diagnostics": []
}
```

(`validValues` and `diagnostics` are included whenever applicable.)

**Error Code Catalogue**:

| Error Code | Cause | Next Step Provided |
|---|---|---|
| `MCP_BUSY` | Another exclusive workspace mutation/test is in flight | Retry once the active call finishes. |
| `MCP_CANCELLED` | Request aborted by client or timeout | Re-run with smaller window or fewer cycles. |
| `MCP_INVALID_ARGUMENTS` | Input failed strict Zod validation or contained forbidden/unknown keys | Names the invalid field, expected type/range, and valid enum values. |
| `MCP_NOT_FOUND` | Requested source file, scenario, scene, plant map, or debug session does not exist | Lists `validValues` (available file names, scenario IDs, or active session IDs). |
| `MCP_WORKSPACE_CHANGED` | Workspace root inode/realpath changed or `traceSha256` is stale | Re-run `project_inspect` / `scenario_run` to refresh identity. |
| `MCP_WORKSPACE_UNREADABLE` | `zplc.json` or `src/` missing, symlinked, or exceeds size limits | Fix workspace structure or pass an absolute real project directory. |
| `MCP_PATH_FORBIDDEN` | Target write path escapes workspace, uses symlinks, or is outside allowed paths | Use a relative path inside `src/`, `tests/`, or root (`zplc.json`, `scene.json`, `plant-map.json`). |
| `MCP_SENSITIVE_FIELD` | `zplc.json` write attempted to set a credential/secret field (`IDE-030`) | Remove the sensitive field; configure secrets only in Studio / local environment. |
| `MCP_VALIDATION_FAILED` | Proposed file failed JSON/schema/visual/scenario/scene validation; disk untouched | Fix the reported `diagnostics` (each names `path` + `acceptedValues`) and re-check with `workspace_check_write`. |
| `MCP_CAPABILITY_UNAVAILABLE` | Tool requires `--repository` or `--user-data`, or `zplc_runtime` binary is missing | Restart `zplc-mcp` with the missing flag or verify `ZPLC_NATIVE_SIM_BIN` via `server_self_check`. |
| `MCP_OUTPUT_LIMIT` | Requested explicit window still exceeds 512 KiB | Narrow `fromMs`/`toMs`, reduce `limit`, filter `signals`, or use `mode: "changes"`. |
| `MCP_DEBUG_SESSION_LIMIT` | Already at maximum concurrent private debug sessions (2) | Call `debug_session_stop` on one of `validValues` (active session IDs). |
| `MCP_DEBUG_SESSION_NOT_FOUND` | Unknown or idle-expired `sessionId` | Start a new session with `debug_session_start`. |
| `MCP_DEBUG_INPUT_OWNED_BY_PLANT` | Attempted to directly set a PLC input driven by an attached scene sensor | Use `plantActions` (`operate`, `emit`, `fault`) in `debug_set_inputs` instead. |
| `MCP_BOUNDARY_REFUSED` | Action crosses `AGENTS.md` rule 8 (physical hardware/session boundary) | Perform hardware actions manually in ZPLC Studio. |
| `MCP_INTERNAL_ERROR` | Unexpected internal failure | Run `server_self_check` and report diagnostics. |

---

### 3.2 Complete MCP Tool Catalogue (26 Tools: 15 Existing + 11 New)

All tools have `openWorldHint: false`. Every tool has `destructiveHint: false` except `workspace_write`, which replaces existing files and declares `destructiveHint: true` (§2.4).

#### Group A: Project, Plant, Scenario & Server Inspection (9 Read-Only Tools)

| # | Tool Name | Status | `readOnlyHint` | Purpose (Plain Words) |
|---|---|---|---|---|
| 1 | `project_inspect` | Existing (improved) | `true` | Read the project manifest summary (`name`, `version`, `target`, `tasks`), source files in `src/`, and presence flags for `scene.json`, `plant-map.json`, scenarios, and active lesson metadata. Use first when opening a workspace. |
| 2 | `project_validate` | Existing (improved) | `true` | Check that `zplc.json`, task-to-program bindings, and every Ladder/FBD/SFC visual file in `src/` load cleanly. Returns located diagnostics naming accepted values on failure (fixes `AI-06`). |
| 3 | `compiler_check` | Existing (improved) | `true` | Compile all project programs in memory without emitting bytecode artifacts. Returns pass/fail, code size, warnings, and located diagnostics (`path`, `line`, `column`, `element`). Use after edits to verify syntax and types. |
| 4 | `compiler_compile` | Existing (improved) | `true` | Compile the project to `.zplc` bytecode and return the artifact SHA-256 digest, code size, task count, and warnings/diagnostics (no raw binary dump). |
| 5 | `symbols_list` | Existing (improved) | `true` | List all compiled variables and function block members across `IPI`, `OPI`, `WORK`, `RETAIN`, and `CODE` with type, address, bitOffset, size, `sourceRef`, and `declarationLine`. Use to discover exact signal names for scenarios, plant maps, and debugging. |
| 6 | `safety_check` | Existing (improved) | `true` | Check for unbounded loops in ST/LD/FBD/SFC and verify that every incompatible output pair declared in `zplc.json` is covered by a `NEVER` expectation in `tests/`. |
| 7 | `plant_inspect` | **NEW (`AIX-001`)** | `true` | Read the project's plant scene (`scene.json`), its parts and configs, all available scene command/sensor signals (with types and scaling ranges), `plant-map.json` bindings, binding errors against the compiled program, and valid `fact:*` names. |
| 8 | `scenarios_list` | **NEW (`AIX-001`)** | `true` | List every scenario in `tests/*.scenario.json` with its `id`, file `path`, `tickMs`, `durationMs`, bound `plant`/`scene`, event count, and expectation summaries (kinds, times, target signals/facts). |
| 9 | `server_self_check` | **NEW (`AIX-007`)** | `true` | Report the bound workspace folder (redacted-safe confirmation), optional `--repository`/`--user-data` status, native simulator binary readiness, protocol eras served (`2025-11-25` + `2026-07-28`), tool/resource counts, and the `AGENTS.md` rule 8 boundary. |

**Detailed Parameter & Return Contracts — Group A**:

1. **`project_inspect`**
   - Parameters: `{}` (none).
   - Returns: `{ ok, evidenceLevel: 'host-static', summary: { schemaVersion: 2, sourceSchemaVersion, migrated, name, version, taskCount, tasks: [{ name, trigger, interval_ms, priority, programs }], sources: [{ name, path, language, library? }], target?: { board }, hasScene: boolean, hasPlantMap: boolean, scenarioCount: number, lesson?: { id, title, solutionsHidden: boolean } }, evidence, audit }`.
   - Errors: `MCP_WORKSPACE_CHANGED`, `MCP_WORKSPACE_UNREADABLE`.

2. **`project_validate`**
   - Parameters: `{}` (none).
   - Returns: `{ ok, evidenceLevel: 'host-static', summary: { name, taskCount, validatedVisualFiles: number }, evidence: { diagnostics }, audit }`.
   - Errors: `MCP_WORKSPACE_CHANGED`, `MCP_WORKSPACE_UNREADABLE`, plus `ok: false` with located diagnostics (`path`, `element`, `message`, `acceptedValues?`).

3. **`compiler_check`**
   - Parameters: `{}` (none).
   - Returns: `{ ok, evidenceLevel: 'host-static', summary?: { name, version, taskCount, codeSize, draftCounter }, evidence: { diagnostics, artifacts: [{ kind: 'zplc', sha256, byteLength }] }, audit }`.
   - Errors: `ok: false` with compiler diagnostics (`code`, `phase`, `path`, `line`, `column`, `endLine`, `endColumn`, `element`, `message`).

4. **`compiler_compile`**
   - Parameters: `{}` (none).
   - Returns: Same shape as `compiler_check` with `operation: 'compile'` and `.zplc` artifact digest.
   - Errors: Same as `compiler_check`.

5. **`symbols_list`**
   - Parameters: `{ pou?: string (max 128), region?: 'IPI' | 'OPI' | 'WORK' | 'RETAIN' | 'CODE' }` (both optional filters to keep output agent-sized).
   - Returns: `{ ok, evidenceLevel: 'host-static', summary: { totalCount, symbols: [{ pou, name, type, region, address, size, bitOffset?, sourceRef?, declarationLine? }] }, evidence, audit }`.
   - Errors: `MCP_INVALID_ARGUMENTS` (with valid regions), compile failure diagnostics.

6. **`safety_check`**
   - Parameters: `{}` (none).
   - Returns: `{ ok, evidenceLevel: 'host-static', summary: { configured, declared, covered, uncovered }, evidence, audit }`.
   - Errors: `SAFETY_INTERLOCK_UNCOVERED`, `SAFETY_OUTPUT_INVALID`, unbounded loop diagnostics.

7. **`plant_inspect`**
   - Parameters: `{ sceneFile?: string (default 'scene.json', max 256), mapFile?: string (default 'plant-map.json', max 256) }`.
   - Returns: `{ ok, evidenceLevel: 'host-static', summary: { sceneFile, mapFile, hasScene, hasPlantMap, scene?: { name, schemaVersion, shortestPulseMs?, partCount, parts: [{ id, part, name, position, rotationYDeg, config }], signals: [{ name, direction: 'command'|'sensor', type: 'BOOL'|'INT'|'REAL' }], validFactPrefixes: string[] }, plantMap?: { schemaVersion, target, signals: [{ name, direction, type, point, range? }], bindingProblems: string[] } }, evidence, audit }`.
   - Errors: `MCP_NOT_FOUND` (if explicit `sceneFile`/`mapFile` missing; if omitted and workspace has no scene, returns `ok: true, hasScene: false, hasPlantMap: false`), `MCP_VALIDATION_FAILED` (with `SCENE_INVALID` / `SCENE_MAP_INVALID` diagnostics).

8. **`scenarios_list`**
   - Parameters: `{}` (none).
   - Returns: `{ ok, evidenceLevel: 'host-static', summary: { count, scenarios: [{ id, path, tickMs, durationMs, plantKind?, scene?: { file, map, scriptCount }, eventCount, expectations: [{ index, kind, atMs?, fromMs?, withinMs?, forMs?, condition, until? }] }] }, evidence, audit }`.
   - Errors: `MCP_WORKSPACE_CHANGED`, `TEST_SCENARIO_INVALID` diagnostics per broken scenario file.

9. **`server_self_check`**
   - Parameters: `{}` (none).
   - Returns: `{ ok: true, evidenceLevel: 'repository-metadata', summary: { serverVersion, workspaceName, workspaceValid: boolean, hasRepository: boolean, hasUserData: boolean, nativeSimulatorReady: boolean, protocolsServed: ['2026-07-28', '2025-11-25'], toolCount: 26, resourceCount: 26, boundary: 'AGENTS.md rule 8: workspace and private host simulation only; zero board, serial, flash, deploy, force, RUN/STOP, plant I/O mode, or Studio session access.' } }`.
   - Errors: `MCP_WORKSPACE_CHANGED`.

---

#### Group B: Workspace Write & Dry-Run Check (2 Tools — `AIX-011`)

| # | Tool Name | Status | `readOnlyHint` | Purpose (Plain Words) |
|---|---|---|---|---|
| 10 | `workspace_check_write` | **NEW (`AIX-011`)** | `true` | Dry-run validate 1 to 8 proposed file creations or replacements (`src/*`, `zplc.json`, `tests/*.scenario.json`, `scene.json`, `plant-map.json`) without modifying any file on disk. Returns loadability/schema violations with accepted values, canonicalized diff stats, and optional full compile check on an isolated copy. |
| 11 | `workspace_write` | **NEW (`AIX-011`)** | `false` (`destructiveHint: true`) | Validate, canonicalize (LD/FBD/SFC/manifest), and write 1 to 8 allowed workspace files, each atomically (§4.3). Refuses the entire batch and leaves existing files untouched if any file fails validation, escapes the workspace, follows a symlink, or sets a sensitive field. |

**Detailed Parameter & Return Contracts — Group B**:

Shared file item schema:
`fileItem = z.object({ path: logicalPathSchema, content: z.string().min(1).max(524_288) }).strict()`

10. **`workspace_check_write`**
    - Parameters:
      - `files`: `z.array(fileItem).min(1).max(8)` (required) — files to validate together against the current workspace.
      - `compileCheck`: `z.boolean().default(true)` (optional) — also compile the combined proposed workspace in memory and return compiler/binding diagnostics.
    - Returns:
      `{ ok, evidenceLevel: 'host-static', dryRun: true, loadable: boolean, compiled?: boolean, files: [{ path, action: 'create' | 'replace', language?, canonicalized: boolean, beforeSha256?, afterSha256, byteLength }], diagnostics: [{ code, path, place?, message, acceptedValues?: string[], line?, column?, element? }], audit }`
    - Errors: `MCP_PATH_FORBIDDEN`, `MCP_SENSITIVE_FIELD`, `MCP_VALIDATION_FAILED`, `MCP_WORKSPACE_CHANGED`.

11. **`workspace_write`**
    - Parameters:
      - `files`: `z.array(fileItem).min(1).max(8)` (required) — files to validate and atomically commit.
      - `requireCompile`: `z.boolean().default(false)` (optional) — if `true`, also refuse writing unless the resulting workspace compiles cleanly; if `false`, refuse only on loadability/schema/security/sensitive-field failures and still return `compileDiagnostics` as advisory output.
      - `expectedBaseSha256`: `z.record(logicalPathSchema, sha256Hex).optional()` — optional optimistic concurrency check against prior reads.
    - Returns:
      `{ ok, evidenceLevel: 'host-static', written: [{ path, action: 'create' | 'replace', language?, canonicalized: boolean, beforeSha256?, afterSha256, byteLength }], compiled: boolean, compileDiagnostics: [...], audit }`
    - Errors: `MCP_PATH_FORBIDDEN`, `MCP_SENSITIVE_FIELD`, `MCP_VALIDATION_FAILED` (disk untouched), `MCP_WORKSPACE_CHANGED` (stale `expectedBaseSha256` or inode changed), `MCP_BUSY`.

---

#### Group C: Deterministic Scenarios & Agent-Sized Traces (6 Read-Only Tools — `AIX-001`, `AIX-015`)

| # | Tool Name | Status | `readOnlyHint` | Purpose (Plain Words) |
|---|---|---|---|---|
| 12 | `tests_run` | Existing (improved) | `true` | Compile and run every scenario in `tests/` on a fresh private native POSIX simulator (with private `plantCore` for scene scenarios). Returns pass/fail per scenario, detailed failed expectations (`index`, `checks` with expected vs observed), and final plant facts. |
| 13 | `scenario_run` | Existing (improved) | `true` | Compile and run one named scenario by `scenarioId`. Returns pass/fail, detailed failed expectations (`index`, `checks`), final plant facts, and trace digest (`traceSha256`). On unknown `scenarioId`, returns `MCP_NOT_FOUND` with `validValues`. |
| 14 | `trace_get` | Existing (redesigned — `AIX-015`) | `true` | Read a recorded scenario trace in agent-sized form: `changes` (default: initial, transitions, failure points, final), `summary` (per-signal stats), or `window` (time/sample slice). Supports filtering `signals`, reading recorded inputs (`includeInputs: true`), and watching extra internal/FB variables (`watchSignals`). Works on all 43+ shipped plant scenarios without hitting 512 KiB errors. |
| 15 | `simulation_start` | Existing (fixed for >512 KiB) | `true` | Re-run one recorded scenario and return sample `cursor = 0` with `traceSha256` and `totalSamples` (stateless recorded replay; for interactive live debugging use `debug_session_start`). |
| 16 | `simulation_step` | Existing (fixed for >512 KiB) | `true` | Read sample `cursor + 1` of a recorded scenario trace pinned by `traceSha256`. |
| 17 | `runtime_snapshot` | Existing (fixed for >512 KiB) | `true` | Read sample `cursor` of a recorded scenario trace pinned by `traceSha256`. |

**Detailed Parameter & Return Contracts — Group C**:

12. **`tests_run`**
    - Parameters: `{}` (none).
    - Returns: `{ ok, evidenceLevel: 'host-simulation', summary?: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id, path, passed, traceSha256, traceByteLength }] }, preview: { traceEvidenceSha256, totalScenarioCount, scenarios: [{ id, path, passed, totalSamples, totalSignals, totalAssertions, truncated, assertions: [{ kind, passed, atMs?, index?, checks?: [{ signal, expected, observed? }] }], finalPlantFacts?: Record<string, boolean|number> }] }, savedTestInputIdentity, evidence, audit }`.
    - Errors: `SIMULATOR_UNAVAILABLE`, `TEST_TIMEOUT`, `TEST_SCENARIO_INVALID`, `SCENARIO_ASSERTION_FAILED` (with `preview` always populated).

13. **`scenario_run`**
    - Parameters: `{ scenarioId: identifier (1..128) }`.
    - Returns: Same shape as `tests_run` scoped to the one scenario.
    - Errors: `MCP_NOT_FOUND` (`TEST_SCENARIO_NOT_FOUND` with `validValues: string[]` of available scenario IDs), plus `tests_run` errors.

14. **`trace_get`**
    - Parameters:
      - `scenarioId`: `string` (required, 1..128) — scenario ID from `scenarios_list`.
      - `mode`: `'changes' | 'window' | 'summary'` (optional, default `'changes'`).
      - `signals`: `z.array(z.string().min(1).max(256)).max(64).optional()` — filter returned signal/fact keys (default: all scenario outputs, inputs when `includeInputs`, and plant facts).
      - `includeInputs`: `z.boolean().default(true)` — include recorded PLC/plant inputs (`AI-08`).
      - `watchSignals`: `z.array(z.string().min(1).max(256)).max(32).optional()` — extra internal variables (`WORK`/`RETAIN`) or FB members (`Program.T1.ET`) to sample from VM memory during the run (`AI-08`); canonical `traceSha256` stays untouched.
      - `fromMs`: `z.number().int().min(0).max(3_600_000).optional()` — start of time window (applies to `window` and `changes`).
      - `toMs`: `z.number().int().min(0).max(3_600_000).optional()` — end of time window.
      - `fromSample`: `z.number().int().min(0).max(100_000).optional()` — sample cursor start (for `window` pagination).
      - `limit`: `z.number().int().min(1).max(1000).default(200)` — max samples returned.
    - Returns:
      `{ ok, evidenceLevel: 'host-simulation', scenarioId, mode, traceSha256, totalSamples, returnedSamples, truncated: boolean, nextCursor?: { fromSample, fromMs }, availableSignals: { inputs: string[], outputs: string[], watched: string[], facts: string[] }, assertions: [...], samples?: [{ index, atMs, inputs?, outputs, watched?, facts?, changed?: string[] }], signalSummary?: Record<string, { first, last, transitions, min?, max?, firstTrueMs?, lastTrueMs? }>, evidence, audit }`.
    - Errors: `MCP_NOT_FOUND` (with valid `scenarioId`s or valid `watchSignals`/`signals` from `symbols_list`), `MCP_INVALID_ARGUMENTS`, `MCP_OUTPUT_LIMIT` (with next step to lower `limit` or filter `signals`).

15–17. **`simulation_start`**, **`simulation_step`**, **`runtime_snapshot`**
    - Parameters: Existing `SCENARIO_INPUT` (`scenarioId`) / `REPLAY_INPUT` (`scenarioId`, `cursor`, `traceSha256`).
    - Fix: Internal trace parser raises in-memory cap to 16 MiB while each single snapshot response stays `< 512 KiB`, eliminating `MCP_INTERNAL_ERROR` on large plant scenarios (`AI-03`).

---

#### Group D: Live Private Simulation Debugger (6 Tools — `AIX-014`)

All six tools operate exclusively on a **private `zplc_runtime` + optional private `plantCore`** owned by the MCP server. They NEVER attach to a board, serial port, or Studio session.

| # | Tool Name | Status | `readOnlyHint` | Purpose (Plain Words) |
|---|---|---|---|---|
| 18 | `debug_session_start` | **NEW (`AIX-014`)** | `false` | Compile the project and start a private host simulation session at `t = 0 ms`, optionally coupled to `scene.json` and `plant-map.json`. Returns a `sessionId` for stepping, setting inputs, breakpoints, and inspection. |
| 19 | `debug_session_stop` | **NEW (`AIX-014`)** | `false` | Stop and clean up a private simulation debug session (terminates simulator process, disposes plant core, removes temporary state). |
| 20 | `debug_set_inputs` | **NEW (`AIX-014`)** | `false` | Stage PLC inputs (`BOOL`, `INT`, `REAL` in `IPI`) or plant operator actions (`operate`, `emit`, `fault` when a scene is attached) in a private debug session before stepping. |
| 21 | `debug_breakpoints` | **NEW (`AIX-014`)** | `false` | Set, add, remove, clear, or list breakpoints in a private debug session by source location across all 5 languages (`line` for ST/IL; `rung`, `cell`, `block`, `step`, `transition`, `action` for LD/FBD/SFC). |
| 22 | `debug_step` | **NEW (`AIX-014`)** | `false` | Advance a private debug session by `cycles`, by `durationMs`, or `continue` until a breakpoint hits or `maxCycles` is reached. Optionally returns watched signals in the same response. |
| 23 | `debug_inspect` | **NEW (`AIX-014`)** | `true` | Read live state of a private debug session: named signals/internal variables, function block instance fields (`TON`, `CTU`, `PID`, etc.), SFC active steps and timers, and (with a scene) plant signals and plant facts. |

**Detailed Parameter & Return Contracts — Group D**:

18. **`debug_session_start`**
    - Parameters:
      - `withScene`: `'auto' | 'always' | 'never'` (optional, default `'auto'` — attaches `scene.json` + `plant-map.json` when both exist in workspace).
      - `sceneFile`: `logicalPathSchema.optional()` (default `'scene.json'`).
      - `mapFile`: `logicalPathSchema.optional()` (default `'plant-map.json'`).
    - Returns:
      `{ ok, evidenceLevel: 'host-simulation', sessionId, scanIntervalMs, atMs: 0, cycles: 0, state: 'idle', sceneAttached: boolean, boundSignals?: { commands: string[], sensors: string[] }, idleTimeoutSec: 300, evidence, audit }`.
    - Errors: `MCP_DEBUG_SESSION_LIMIT` (with active `validValues`), `SIMULATOR_UNAVAILABLE`, compile/scene/map diagnostics.

19. **`debug_session_stop`**
    - Parameters: `{ sessionId: z.string().uuid() }`.
    - Returns: `{ ok: true, evidenceLevel: 'host-simulation', sessionId, stopped: true, audit }`.
    - Errors: `MCP_DEBUG_SESSION_NOT_FOUND` (with active session IDs).

20. **`debug_set_inputs`**
    - Parameters:
      - `sessionId`: `z.string().uuid()` (required).
      - `inputs`: `z.record(signalName, z.union([z.boolean(), z.number().finite()])).optional()` (max 64 entries) — PLC `IPI` variables (`Program.Var` or global).
      - `plantActions`: `z.array(z.discriminatedUnion('kind', [ { kind: 'operate', part, action, value? }, { kind: 'emit', part, material?, size? }, { kind: 'fault', part, kind: string, active: boolean } ])).max(16).optional()` — only when `sceneAttached: true`.
    - Returns: `{ ok: true, evidenceLevel: 'host-simulation', sessionId, stagedInputs: string[], stagedPlantActions: number, audit }`.
    - Errors: `MCP_DEBUG_SESSION_NOT_FOUND`, `MCP_DEBUG_INPUT_OWNED_BY_PLANT` (names the plant sensor & `operate` action to use), `MCP_NOT_FOUND` (unknown signal/part with `validValues`).

21. **`debug_breakpoints`**
    - Parameters:
      - `sessionId`: `z.string().uuid()` (required).
      - `action`: `'list' | 'set' | 'add' | 'remove' | 'clear'` (required).
      - `locations`: `z.array(z.object({ file: logicalPathSchema, line: z.number().int().min(1).max(1_000_000).optional(), element: elementSchema.optional() }).strict()).max(32).optional()` (required for `set`/`add`/`remove`; each entry specifies `line` for ST/IL or `element` for LD/FBD/SFC/IL).
    - Returns: `{ ok: true, evidenceLevel: 'host-simulation', sessionId, breakpoints: [{ file, line?, element?, pc, active: boolean }], unresolved?: [{ file, line?, element?, reason, nearbyValid: Array<number | string> }], audit }`.
    - Errors: `MCP_DEBUG_SESSION_NOT_FOUND`, `MCP_NOT_FOUND` (unknown file with `validValues`), `MCP_INVALID_ARGUMENTS`.

22. **`debug_step`**
    - Parameters:
      - `sessionId`: `z.string().uuid()` (required).
      - `mode`: `'cycles' | 'ms' | 'continue' | 'instruction'` (optional, default `'cycles'`).
      - `cycles`: `z.number().int().min(1).max(1000).default(1)` (for `mode: 'cycles'`).
      - `durationMs`: `z.number().int().min(1).max(60_000).optional()` (for `mode: 'ms'`; must align to `scanIntervalMs`).
      - `maxCycles`: `z.number().int().min(1).max(5000).default(1000)` (safety cap for `mode: 'continue'`).
      - `watch`: `z.array(z.string().min(1).max(256)).max(32).optional()` — optional signals/FBs to read right after stopping.
      - `includeFacts`: `z.boolean().default(false)` — include plant facts after stepping when scene attached.
    - Returns:
      `{ ok: true, evidenceLevel: 'host-simulation', sessionId, stopReason: 'stepped' | 'breakpoint' | 'halted' | 'fault' | 'budget_reached', atMs, cycles, cyclesExecuted, state: 'idle' | 'paused' | 'error', location?: { pou, file, line?, element?, pc }, vmError?: number, values?: Record<string, unknown>, plantFacts?: Record<string, boolean|number>, audit }`.
    - Errors: `MCP_DEBUG_SESSION_NOT_FOUND`, `MCP_INVALID_ARGUMENTS`, `MCP_CANCELLED`.

23. **`debug_inspect`**
    - Parameters:
      - `sessionId`: `z.string().uuid()` (required).
      - `signals`: `z.array(z.string().min(1).max(256)).max(64).optional()` — specific variables (`IPI`, `OPI`, `WORK`, `RETAIN`) to read (default: all `IPI` + `OPI` signals).
      - `functionBlocks`: `z.array(z.string().min(1).max(128)).max(16).optional()` — named FB instances (e.g. `Main.DelayTimer`) to expand into all member fields (`IN`, `PT`, `Q`, `ET`, etc.).
      - `includeSfc`: `z.boolean().default(true)` — when project contains SFC POUs, include active steps, step elapsed times, and transition conditions/fired flags via `debugMap.pou[].monitor`.
      - `includePlant`: `z.boolean().default(true)` — when scene attached, include current plant signal states and `facts`.
    - Returns:
      `{ ok: true, evidenceLevel: 'host-simulation', sessionId, atMs, cycles, state, location?: { pou, file, line?, element?, pc }, signals: Record<string, { type, region, value }>, functionBlocks?: Record<string, Record<string, unknown>>, sfc?: [{ pou, file, activeSteps: [{ id, name, activeMs }], transitions: [{ id, conditionTrue, fired }] }], plant?: { signals: Record<string, boolean|number>, facts: Record<string, boolean|number> }, audit }`.
    - Errors: `MCP_DEBUG_SESSION_NOT_FOUND`, `MCP_NOT_FOUND` (unknown signal/FB with `validValues`).

---

#### Group E: Repository & Ephemeral Local Cross-Build (3 Existing Tools, Improved Descriptions)

| # | Tool Name | Status | `readOnlyHint` | Purpose (Plain Words) |
|---|---|---|---|---|
| 24 | `boards_list` | Existing (improved) | `true` | List declared board profiles from `firmware/app/boards/boards.json` and their evidence levels without probing hardware. Requires `--repository`. |
| 25 | `toolchain_inspect` | Existing (improved) | `true` | Check local Zephyr/CMake/SDK prerequisites for building firmware locally. Requires `--repository`. |
| 26 | `firmware_build` | Existing (improved) | `false` | Run an ephemeral local Zephyr cross-build for one declared `ideId` and return the ELF digest only. Never flashes, deploys, or touches a device (`AGENTS.md` rule 8). Requires `--repository`. |

- Parameters unchanged (`{}`, `{}`, `{ ideId }`); on unknown `ideId`, `firmware_build` returns `MCP_NOT_FOUND` with `validValues` from `boards_list`.

---

### 3.3 Complete MCP Resource Catalogue (26 Resources: 22 Fixed + 4 Templates)

Every resource has a plain-English `title` and `description` (closing `AI-09`).

#### Fixed Resources (22)

| # | URI | Status | Plain Description |
|---|---|---|---|
| 1 | `zplc://project/manifest` | Existing | Redacted `zplc.json` (credentials stripped via `manifestForAssistant`) with tasks, libraries, and target. |
| 2 | `zplc://project/programs` | Existing | List of all program files in `src/` with file name, path, and IEC 61131-3 language (`ST`, `IL`, `LD`, `FBD`, `SFC`). |
| 3 | `zplc://project/symbols` | Existing | Public compiled symbol table (`IPI`, `OPI`, `WORK`, `RETAIN`, `CODE`). |
| 4 | `zplc://project/io-map` | Existing | Compiled `IPI` (input) and `OPI` (output) bindings with addresses and bit offsets. |
| 5 | `zplc://project/diagnostics` | Existing | Current compiler diagnostics and warnings for the workspace. |
| 6 | `zplc://target/capabilities` | Existing | Declared target memory profile and catalogue evidence level (never live hardware state). |
| 7 | `zplc://runtime/trace` | Existing | Discovery metadata explaining `zplc://runtime/trace/{scenarioId}` and `trace_get`. |
| 8 | `zplc://runtime/snapshot` | Existing | Discovery metadata explaining `zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}`. |
| 9 | `zplc://course/progress` | Existing | Read-only list of passed lessons and completion count from `--user-data`. Never writes progress. |
| 10 | `zplc://docs/evidence` | Existing | Plain explanation of ZPLC evidence levels (`host-static`, `host-simulation`, `local-cross-build`, `human-hil`). |
| 11 | `zplc://docs/safety` | Existing (updated) | Verbatim `AGENTS.md` rule 8 physical boundary and `safety_check` guidance. |
| 12 | `zplc://docs/testing` | Existing (updated) | Guide to deterministic scenarios (`scenario_run`), agent-sized traces (`trace_get`), and private debugging (`debug_*`). |
| 13 | `zplc://project/scene` | **NEW (`AIX-001`)** | Parsed `scene.json` with parts, configs, offered command/sensor signals, cameras, and valid plant fact prefixes (`MCP_NOT_FOUND` if project has no scene). |
| 14 | `zplc://project/plant-map` | **NEW (`AIX-001`)** | Parsed `plant-map.json` (typed bindings) plus binding status against the program's compiled I/O map. |
| 15 | `zplc://project/scenarios` | **NEW (`AIX-001`)** | List of scenarios in `tests/*.scenario.json` with ids, timings, and expectation summaries. |
| 16 | `zplc://lesson/current` | **NEW (`AIX-002`)** | Current lesson goal, objectives, stage, language, and hints when the workspace is a lesson workspace. **Never includes the solution; when `hideSolutions` is active in `--user-data` (or when `--user-data` is absent and classroom policy is unknown -> safe default `solutionsHidden: true` unless explicitly false), strictly omits/refuses any solution reference.** |
| 17 | `zplc://formats/ld` | **NEW (`AIX-013`)** | Ladder Diagram (`.ld.json`) JSON Schema, accepted contact/coil/function/FB enums, grid/element rules, and one compiled worked example. |
| 18 | `zplc://formats/fbd` | **NEW (`AIX-013`)** | Function Block Diagram (`.fbd.json`) JSON Schema, accepted block/port/connection rules, and one compiled worked example. |
| 19 | `zplc://formats/sfc` | **NEW (`AIX-013`)** | Sequential Function Chart (`.sfc.json`) JSON Schema, accepted step/transition/action/qualifier values, and one compiled worked example. |
| 20 | `zplc://formats/scene` | **NEW (`AIX-013`)** | Plant Scene (`scene.json`) JSON Schema, catalogue part IDs/configs/signals, and one validated worked example. |
| 21 | `zplc://formats/plant-map` | **NEW (`AIX-013`)** | Plant Map (`plant-map.json`) Schema v2 specification, direction/type/range rules, and one validated worked example. |
| 22 | `zplc://formats/scenario` | **NEW (`AIX-013`)** | Scenario (`tests/*.scenario.json`) JSON Schema, all 9 expectation kinds, `plant`/`scene` blocks, numeric `fact:` grammar, and one validated worked example. |

#### Resource Templates (4)

| # | Name | URI Template | Status | Plain Description |
|---|---|---|---|---|
| 23 | `project-source` | `zplc://project/source/{name}` | Existing | Read the saved source text and language of one program in `src/` (URL-encoded file name). On miss, returns `MCP_NOT_FOUND` with `validValues`. |
| 24 | `project-scenario` | `zplc://project/scenario/{scenarioId}` | **NEW (`AIX-001`)** | Read the full JSON definition of one scenario in `tests/` by `scenarioId`. On miss, returns `MCP_NOT_FOUND` with `validValues`. |
| 25 | `runtime-trace` | `zplc://runtime/trace/{scenarioId}` | Existing (improved) | Read default agent-sized (`mode: 'changes'`) trace for `scenarioId`; works on all >512 KiB plant scenarios. |
| 26 | `runtime-snapshot` | `zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}` | Existing (fixed) | Read one pinned sample of a recorded scenario trace (works on >512 KiB traces). |

---

### 3.4 MCP Prompts & Server Instructions (AIX-008)

#### Server Instructions (passed to `new McpServer(..., { instructions })`)

```text
ZPLC Local MCP Server — IEC 61131-3 engineering and private simulation workspace.

Workflow:
1. Read first: call project_inspect, plant_inspect (if hasScene/hasPlantMap), scenarios_list, and read zplc://project/source/{name} or zplc://lesson/current.
2. Read formats before writing JSON files: read zplc://formats/{ld|fbd|sfc|scene|plant-map|scenario} before creating or editing graphical diagrams, scenes, plant maps, or scenarios.
3. Validate before writing: call workspace_check_write (read-only dry run) to verify schema, canonicalization, and compilation; then call workspace_write to commit atomically.
4. Verify in simulation: call compiler_check, safety_check, and scenario_run (or tests_run). Read preview.checks for failed expectations.
5. Debug in private simulation: use trace_get (default mode "changes", with watchSignals for internals) or start a live session with debug_session_start -> debug_breakpoints -> debug_set_inputs -> debug_step -> debug_inspect -> debug_session_stop.

Evidence:
- Every tool result declares evidenceLevel once (host-static, host-simulation, local-cross-build, or repository-metadata). Host simulation is never hardware or HIL proof.

Physical boundary (AGENTS.md rule 8):
- This server operates only inside the workspace folder and in private host simulations it starts for you alone; there you may set inputs and step the program.
- No tool forces I/O, changes RUN/STOP, flashes a board, deploys a program, opens a serial port or shell, or enters plant I/O mode on hardware or on a session a person runs, and no tool attaches to a user's running Studio session.
- Refuse any such request in plain words and tell the user to perform it themselves in ZPLC Studio.
```

The "Physical boundary" block above is the target text of §2.1a: it is proposed and needs the owner's approval. Until the owner approves it, `src/mcp` keeps the boundary text of 2.0 and does not ship Group D (§3.2).

#### Registered Prompts (4)

| # | Prompt Name | Arguments | Purpose |
|---|---|---|---|
| 1 | `implement_program` | `language` (`ST\|IL\|LD\|FBD\|SFC`), `goal` | Walks the agent through inspecting I/O + plant map, reading the format resource for visual languages, dry-run checking, writing, compiling, and verifying scenarios. |
| 2 | `debug_failing_scenario` | `scenarioId` | Walks the agent through `scenario_run`, reading `preview.checks`, inspecting `trace_get` (`mode: 'changes'`), and stepping with `debug_session_start` + breakpoints to isolate root cause. |
| 3 | `author_visual_program` | `language` (`LD\|FBD\|SFC`), `filePath` | Instructs the agent to load `zplc://formats/{language}` first, build canonical JSON, dry-run with `workspace_check_write`, and commit with `workspace_write`. |
| 4 | `explain_with_evidence` | `question` | Instructs the agent to back every claim with `compiler_check`, `safety_check`, or `scenario_run` evidence, cite exact file/line/element places, and state the evidence level. |

---

## 4. AIX-011: Workspace Write & Dry-Run Check Design

### 4.1 Allowed Write Surfaces & Limits

| Target Path Pattern | File Kind | Max Size | Validator | Canonicalizer |
|---|---|---|---|---|
| `src/<name>.st` | Structured Text | 256 KiB | UTF-8 text, no NUL, `isCandidateSourcePath` | Preserved verbatim (LF normalized if needed? Keep author bytes for ST/IL) |
| `src/<name>.il` | Instruction List | 256 KiB | UTF-8 text, no NUL, `isCandidateSourcePath` | Preserved verbatim |
| `src/<name>.ld.json` | Ladder Diagram | 256 KiB | `loadLDFile` (Zod schema + `parseLDModel`) | `serializeVisualDocument(model)` (2-space JSON, LF, trailing `\n`) |
| `src/<name>.fbd.json` | Function Block Diagram | 256 KiB | `loadFBDFile` (Zod schema + `parseFBDModel`) | `serializeVisualDocument(model)` |
| `src/<name>.sfc.json` | Sequential Function Chart | 256 KiB | `loadSFCFile` (Zod schema + `parseSFCModel`) | `serializeVisualDocument(model)` |
| `zplc.json` | Project Manifest | 128 KiB | JSON + `manifestSensitivePaths` + `parseAndMigrateProject` + task cardinality | `canonicalManifest` (schema v2, 2-space JSON) |
| `tests/<name>.scenario.json` | Test Scenario | 128 KiB | JSON + `validateScenarioShape` + `compileScenario` (against proposed `debugMap` + scene when compilable) | 2-space JSON + trailing `\n` |
| `scene.json` *(SHOULD)* | Plant Scene | 512 KiB | JSON + `parseScene` (structure + catalogue part/config validation) | 2-space JSON + trailing `\n` |
| `plant-map.json` *(SHOULD)* | Plant Map | 128 KiB | JSON + `validatePlantMap` (schema v2 for scenes) + `resolvePlantMap` (when compilable) | 2-space JSON + trailing `\n` |

**Explicitly refused**:
- Deleting or renaming files (out of scope for AIX-011; prevents destructive surprises). **Known limit, stated in the pages**: no tool deletes or renames a file. `AIX-U13` writes it in `docs/docs/reference/mcp.md` and `docs/docs/guides/ai-and-mcp.md` and their Spanish twins, and the description of `workspace_write` says it: an agent that needs a file gone or renamed asks the person to do it in Studio or on disk.
- Writing to any other path (`README.md`, `.git/*`, `boards.json`, `specs/*`, dotfiles, nested subdirectories outside `src/`/`tests/`).
- Case-insensitive or `.ld`/`.ld.json` name collisions (checked via `sourceNameKey` matching `packages/zplc-ide/src/cli/toolApi.ts:713`).

### 4.2 Security, Workspace Confinement & Sensitive-Field Refusal

Implemented in a dedicated module `packages/zplc-ide/src/mcp/workspaceWrite.ts` (reusing `src/ai/manifestPrivacy.ts`, `src/ai/changeSetPrepare.ts`, and `src/cli/firmwareBuildRunner.ts` `directoryIdentity`):

1. **Workspace identity check**: Verify `sameDirectoryIdentity(workspace.identity, await directoryIdentity(workspace.root))` before validation AND right before atomic rename.
2. **Path hygiene**: Reject absolute paths, Windows drive prefixes, `\`, `\0`, `.`, `..`, empty segments, or paths failing the allowlist regex.
3. **Symlink refusal**: `lstat` and `realpath` every traversed directory (`workspace.root`, `src`, `tests`) and any existing target file; refuse with `MCP_PATH_FORBIDDEN` if any segment is a symbolic link or resolves outside `workspace.identity.path`.
4. **Sensitive fields (`IDE-030`)**: When `zplc.json` is in the batch, parse JSON and run `manifestSensitivePaths(parsed)`. If non-empty, reject the entire batch with `MCP_SENSITIVE_FIELD` naming the offending JSON path(s) (never echoing values). Also ensure `zplc.json` cannot inject `network.wifi.password`, `communication.mqtt.*` secrets, or any credential-named key.
5. **Known secret scan warning/refusal**: Follow `aiProvider.ts` rules—never allow writing credentials into `zplc.json`.

### 4.3 Validate-Before-Write, Dry-Run & Atomic Commit Protocol

1. **Stage 1 — Per-file structural & semantic validation (in memory)**:
   - Parse and validate every file in `files` (1..8 items).
   - For LD/FBD/SFC, run `loadLDFile` / `loadFBDFile` / `loadSFCFile` (upgraded per Section 6.3 so every error names JSON `place` and `acceptedValues`).
   - Canonicalize LD/FBD/SFC via `serializeVisualDocument(loaded.model)` and `zplc.json` via `canonicalManifest`.
   - If ANY file fails Stage 1 -> return `MCP_VALIDATION_FAILED` with full diagnostics; **zero bytes touched on disk**.
2. **Stage 2 — Cross-file consistency & optional compile check (in memory / temp copy)**:
   - Merge proposed files over current workspace snapshot in memory (using `compileMultiTaskProject` directly on in-memory `WorkspaceProject`, without touching disk).
   - Validate task cardinality (`assertTaskProgramCardinality`) and program resolution (`unresolvedPrograms`) when `zplc.json` is modified.
   - If `tests/*.scenario.json` is written, validate scenario structure (`compileScenario` against the resulting `debugMap` and scene/map if compilable; if program doesn't compile yet and `requireCompile: false`, validate full JSON/schema/temporal/fact grammar via a standalone structural validator `validateScenarioDocument`).
   - If `requireCompile: true` (or `workspace_check_write` with `compileCheck: true`), fail cleanly with compiler diagnostics if compilation fails.
3. **Stage 3 — Atomic temp-write + rename (`workspace_write` only)**:
   - Ensure target subdirectory (`src` or `tests`) exists as a real non-symlink directory (`mkdir(..., { recursive: false })` if missing).
   - Capture existing file bytes in memory for rollback.
   - Capture the mode of every existing target (`lstat(target).mode & 0o7777`). A replaced file keeps that mode; a new file gets the mode a plain `writeFile` would give it (`0o666` minus the umask).
   - Write every target file to a sibling temporary file named `.<basename>.<12hex>.tmp` (matching `TEMPORARY` in `electron/projectWatcher.ts:16` so Studio's watcher ignores temporary files) with `{ flag: 'wx', mode: 0o600 }`, so no other user reads the file before it is complete, then `fchmod` the temporary file to the captured mode before the rename (the umask does not apply to `fchmod`). On Windows `fchmod` sets only the read-only bit; the test below asserts the file stays writable there.
   - Re-verify workspace identity and target `lstat` (no TOCTOU symlink swap).
   - `rename(tempPath, targetPath)` for each file. If any rename fails, unlink remaining temp files and restore already-renamed files from memory backups (best-effort rollback).

**What "atomic" covers.** Each file is atomic: a reader sees the old bytes or the new bytes of that file, never a mix, because the rename replaces it in one step. A batch of several files is not atomic as a set: the renames happen one after another, and if one fails the files already renamed are restored from the in-memory copies at best effort (a crash or a full disk during the restore can leave part of the batch written). The reply and the docs say this in those words, and a failed restore names the files it could not put back in `cause` (`MCP_INTERNAL_ERROR`, with `nextStep` to compare with `expectedBaseSha256` and re-run).

**Tests of Stage 3** (`packages/zplc-ide/src/mcp/workspaceWrite.test.ts`, unit `AIX-U6`):
- Replace keeps the mode: a target at `0o644` (and one at `0o640`) stays at that mode after `workspace_write` replaces it; a new file gets `0o666 & ~umask`. POSIX only; skipped on Windows, where the next test covers what the platform has.
- **Replace on Windows**: `workspace_write` replaces an existing `src/Main.st` and an existing `tests/belt.scenario.json` in one batch; both hold the new bytes, no `.*.tmp` file is left in the folder, and the files stay writable (not read-only). Replace-by-rename is the operation that failed in the C runtime on Windows (`zplc_hal_posix.c:493` in the failed run, fixed in 2.1 with `MoveFileExA`, now `zplc_hal_posix.c:359-381`); Node's `fs.rename` uses `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`, and this test proves it on the runner rather than assuming it. It runs on every platform, and on Windows in the nightly's **`desktop-ide-tests`** job, matrix entry **"Windows x64"** (`windows-2025`, `.github/workflows/nightly-quality.yml:197-208`), in whichever of its 8 shards `tools/ci/test-shards.ts` assigns `workspaceWrite.test.ts`; a second case holds the target open for reading during the rename and asserts either success or a clean `MCP_INTERNAL_ERROR` with the old bytes intact (`EBUSY`/`EPERM` on Windows).
- A forced failure of the second rename of a batch of three restores the first file's old bytes and mode and leaves the third untouched.

---

## 5. AIX-012: Studio Follows External Edits

### 5.1 Current Implementation Audit

Studio already has a foundation for external file watching (`IDE-004`):
- `packages/zplc-ide/electron/projectWatcher.ts` watches the open project root with `fs.watch({ recursive: true, persistent: false })`, debounces 150 ms, ignores `.git`/`node_modules`/`build`/`dist`/`.vscode` and `.<name>.<12hex>.tmp`, and emits `ProjectChange { rootId, paths, overflow }` over IPC.
- `packages/zplc-ide/src/store/externalChangeWatch.ts` listens to `onChanged`, calls `refreshFileTree()`, checks open files via `planExternalChanges`, silently reloads clean open files, closes deleted clean files, logs a console info line, and opens `ExternalChangePrompt.tsx` for dirty open files ("Keep my version" / "Load from disk").

### 5.2 Gaps Closed for AIX-012

| Gap in Current Code | Exact Extension Design |
|---|---|
| **1. No visible Studio toast/notice** (`externalChangeWatch.ts` only logs to Output console) | Add `kind: 'external'` (or `'save'`) notification via `useNotifications.getState().report(...)` naming the changed/created file(s) (e.g., `"Updated outside Studio: src/Main.ld.json"` or `"3 files updated outside Studio"` with detail listing names) and a one-click action button to open/focus the changed file. |
| **2. New files & `zplc.json` edits don't refresh project config / declarations** | When `paths` includes `zplc.json`, `src/*`, or `overflow: true`: reload `projectConfig` (`zplc.json`) cleanly into `useIDEStore` (when `zplc.json` has no unsaved Project Settings edits; otherwise prompt), refresh `fileTree`, trigger immediate `projectSources` re-indexing, and clear stale compiler markers for reloaded files so Build/Run works immediately without restart. |
| **3. 3D Plant view does not reload `scene.json` / `plant-map.json`** | Add a `sceneRevision: number` counter and `notifyExternalPlantChange(paths)` action on `usePlantDocument` (`src/store/usePlantDocument.ts`). When `externalChangeWatch` sees `scene.json` or `plant-map.json` (or `overflow`) change: (a) if the Scene Editor has unsaved dirty edits to `scene.json`, push a conflict into `useExternalConflicts` (never overwrite unsaved Scene Editor edits); (b) otherwise bump `sceneRevision`, causing `PlantDocument.tsx` to re-read `scene.json` + `plant-map.json` via `sceneFiles.ts`, rebuild the `PlantCore` + Three.js scene in place (preserving camera or re-framing cleanly), and report a toast `"Plant updated from disk: scene.json"`. |
| **4. Tests list doesn't refresh on external `tests/*.scenario.json` writes** | When `paths` touches `tests/` (or `overflow`), bump a `scenariosRevision` counter so `TestsView` re-reads scenarios automatically without restart. |
| **5. Conflict dialog lacks diff preview** | Extend `ExternalChangePrompt.tsx` with a third toggleable action **"Compare diff"** (reusing the line-diff renderer from `components/agent/`), showing unsaved editor text vs disk text side-by-side/unified before the user clicks **Keep my version** or **Load from disk**. |
| **6. Platform `fs.watch` fallback** | In `electron/projectWatcher.ts`, if `fs.watch(root, { recursive: true })` throws on an older Linux kernel/filesystem, fall back to watching `[root, join(root, 'src'), join(root, 'tests')]` non-recursively so external MCP/editor writes in `src/`, `tests/`, and root (`zplc.json`, `scene.json`, `plant-map.json`) are always observed. |
| **7. Self-write suppression** | Continue matching `.<name>.<12hex>.tmp` AND keep `diskContent` tracking in `externalChangeWatch.ts` so Studio's own saves (including Scene Editor saves) never trigger false "Updated outside Studio" notices. |

### 5.3 Electron Main -> Preload -> Renderer Flow

1. External agent (`workspace_write` or agent file tool) writes `src/Belt.ld.json` (via atomic `.Belt.ld.json.<12hex>.tmp` -> rename) or `scene.json`.
2. `electron/projectWatcher.ts` debounces 150 ms -> sends `ProjectChange { rootId, paths: ['src/Belt.ld.json'], overflow: false }` via existing `projectFiles:changed` IPC channel (no new privileged IPC surface needed).
3. `src/store/externalChangeWatch.ts` classifies `paths`:
   - `src/*` -> `refreshFileTree()`, `checkOpenFiles()` (reloads clean open LD/FBD/SFC/ST/IL editors; prompts on dirty), re-index `projectSources`, show `useNotifications` toast naming `src/Belt.ld.json`.
   - `zplc.json` -> reload `projectConfig` if clean, prompt if dirty, show toast.
   - `scene.json` / `plant-map.json` -> check Scene Editor dirty state; if clean, bump `usePlantDocument.sceneRevision` so 3D Plant view reloads live without restart, show toast.
   - `tests/*.scenario.json` -> refresh `fileTree` + `scenariosRevision`, show toast.

---

## 6. AIX-013: Formats — Documentation, MCP Resources & Diagnostics

### 6.1 Single Source of Truth (`packages/zplc-ide/src/formats/`)

To guarantee that documentation pages, MCP resources, and parser validators never drift apart:
- Create `packages/zplc-ide/src/formats/` with one module per format (`ld.ts`, `fbd.ts`, `sfc.ts`, `scene.ts`, `plantMap.ts`, `scenario.ts`, plus `index.ts`).
- Each module exports:
  - `id`: `'ld' | 'fbd' | 'sfc' | 'scene' | 'plant-map' | 'scenario'`
  - `title` & `summary` (plain English)
  - `schema`: standard JSON Schema (Draft 2020-12 object) derived from the live code constants (`LD_CONTACT_TYPES`, `LD_COIL_TYPES`, `LD_FUNCTIONS`, `catalogue`, `PLANT_KINDS`, scenario expectation kinds, etc.)
  - `acceptedValues`: explicit lookup tables (e.g., all LD element types, FBD standard block types & ports, SFC action qualifiers `N/S/R/L/D/P/P0/P1`, catalogue part IDs, scenario expectation kinds, plant fact prefixes)
  - `example`: one complete, realistic, **test-verified** worked example (unit test compiles LD/FBD/SFC examples with `compileMultiTaskProject` and validates scene/plant-map/scenario examples with `parseScene`/`validatePlantMap`/`compileScenario`!)
- **Consumers**:
  1. `zplc://formats/{id}` MCP resources serialize the module directly.
  2. `tools/docs/generate_source_references.ts` generates/updates the reference doc sections from these exact modules.
  3. `electron/aiProvider.ts` draws compact format summaries from these modules when needed.

### 6.2 Exact 6 Format Coverage Matrix

| # | Format | File Pattern | MCP Resource URI | EN Doc Page | ES Doc Page (`docs/i18n/es/...`) | Worked Example Verified By |
|---|---|---|---|---|---|---|
| 1 | **Ladder Diagram (LD)** | `src/*.ld.json` | `zplc://formats/ld` | `docs/docs/reference/format-ld.md` (linked from `language-ld.md`) | `reference/format-ld.md` | `loadLDFile` + `compileMultiTaskProject` (start/stop latch + TON timer rung) |
| 2 | **Function Block Diagram (FBD)** | `src/*.fbd.json` | `zplc://formats/fbd` | `docs/docs/reference/format-fbd.md` (linked from `language-fbd.md`) | `reference/format-fbd.md` | `loadFBDFile` + `compileMultiTaskProject` (AND + TON + output variable block) |
| 3 | **Sequential Function Chart (SFC)** | `src/*.sfc.json` | `zplc://formats/sfc` | `docs/docs/reference/format-sfc.md` (linked from `language-sfc.md`) | `reference/format-sfc.md` | `loadSFCFile` + `compileMultiTaskProject` (2-step Idle -> Run -> Idle with action + transition) |
| 4 | **Plant Scene** | `scene.json` | `zplc://formats/scene` | `docs/docs/plant/scene-format.md` (upgraded with JSON Schema + worked example) | `plant/scene-format.md` | `parseScene` (belt + emitter + diffuse sensor + push button + camera) |
| 5 | **Plant Map** | `plant-map.json` | `zplc://formats/plant-map` | `docs/docs/reference/plant-map-file.md` | `reference/plant-map-file.md` | `validatePlantMap` + `resolvePlantMap` (Schema v2 with BOOL + INT/REAL range) |
| 6 | **Test Scenario** | `tests/*.scenario.json` | `zplc://formats/scenario` | `docs/docs/reference/scenario-file.md` (upgraded generator with `scene`, numeric `fact:`, JSON Schema + worked examples) | `reference/scenario-file.md` | `compileScenario` (both plain I/O and scene-coupled scenario with `fact:` range) |

### 6.3 Parser & Validator Diagnostic Upgrades (Closing `AI-06`)

Concrete upgrades to eliminate opaque errors observed in `reviews/ai.md`:
1. **`packages/zplc-ide/src/models/visualFileLoad.ts`**:
   - Format Zod `invalid_value` / `invalid_type` issues to always print the exact JSON path AND accepted values (e.g., `rungs[0].grid[0][1].element.type: invalid value 'contact'; accepted values: left_rail, right_rail, contact_no, contact_nc, contact_p, contact_n, coil, coil_negated, coil_set, coil_reset, coil_p, coil_n, function_block, function`).
   - Return structured `VisualFileViolation { path: string; message: string; acceptedValues?: string[] }` alongside string `violations` (keeping existing UI callers compatible).
2. **`packages/zplc-ide/src/models/ld.ts`, `fbd.ts`, `sfc.ts`**:
   - Replace `"Rung undefined element id 'undefined' is not safe"` and similar unlocated throws with located diagnostics (`rungs[0].elements[0].id: missing non-empty string id`, `steps[0].actions[0].qualifier: invalid qualifier 'X'; accepted values: N, S, R, L, D, P, P0, P1`, `blocks[0].type: unknown block type 'FOO'; accepted values: ...`).
3. **`packages/zplc-ide/src/cli/toolApi.ts` (`projectValidate`)**:
   - Validate all `.ld.json`, `.fbd.json`, and `.sfc.json` files in `src/` with `loadLDFile`/`loadFBDFile`/`loadSFCFile` during `projectValidate`, returning structured `VISUAL_FILE_INVALID` diagnostics with `path` and `message` (fixing `AI-06` where `project_validate` answered `ok: true` for a broken LD file).
4. **`packages/zplc-ide/src/test-engine/index.ts`, `src/plant/core/sceneSchema.ts`, `src/plants/plantMap.ts`**:
   - Ensure every enum error (expectation `kind`, `plant` kind, `scene.script[].kind`, `plant-map` `direction`/`type`) explicitly lists accepted values in the diagnostic message.

---

## 7. AIX-014: Debug in Private Simulation Architecture

### 7.1 Session Isolation & Lifecycle (`packages/zplc-ide/src/mcp/debugSession.ts`)

`McpDebugSessionManager` is owned strictly by the `McpServer` instance:

```text
MCP Client (e.g., Claude Code)
   │  stdio JSON-RPC (2025 or 2026-07-28)
   ▼
zplc-mcp (packages/zplc-ide/src/mcp/server.ts)
   │
   ▼
McpDebugSessionManager (src/mcp/debugSession.ts)  [max 2 sessions, 300 s idle TTL]
   ├── Compiled artifact + DebugMap (with transpiler sourceMaps & monitor entries)
   ├── Private NativeSimulationSupervisor + NativeAdapter
   │      └── child process: zplc_runtime (ZPLC_PERSIST_ROOT = mkdtemp, virtual clock)
   └── Optional Private PlantCore + PlantMapV2 (from workspace scene.json + plant-map.json)
```

- **Zero shared state**: Never talks to Electron, Studio's `NativeSimulationSupervisor`, any serial port, or any hardware board.
- **Lifecycle**:
  1. `debug_session_start`: compiles workspace via `toolApi.compilerCompile` (obtaining `zplcFile` + `debugMap` + transpiler `sourceMap`s), spawns private `NativeSimulationSupervisor` + `NativeAdapter`, loads bytecode, resets VM, optionally creates private `createPlantCore(scene)` and resolves `PlantMapV2`.
  2. `debug_breakpoints`: maps source locations to VM PCs, arms them via `adapter.setBreakpoint(pc)`.
  3. `debug_set_inputs`: writes `IPI` bytes via `adapter.pokeN` (using `debugMap` addresses/types) or queues plant operator actions (`operate`/`emit`/`fault`) on the private `plantCore`.
  4. `debug_step`: runs virtual-clock ticks (`scanIntervalMs` per cycle), exchanging plant signals via `exchangeScan` before/after each VM scan, stopping immediately if a breakpoint hits, VM halts/faults, or `cycles`/`maxCycles` completes.
  5. `debug_inspect`: reads requested `IPI`/`OPI`/`WORK`/`RETAIN` variables, expands FB instance fields, reads SFC active steps/timers/transitions from `debugMap.pou[].monitor`, and reads `plantCore.signals` + `plantCore.facts()`.
  6. `debug_session_stop` (or idle TTL expiry at 300 s, or `SIGINT`/`SIGTERM`/stdio close): disconnects adapter, stops supervisor child process, calls `plantCore.dispose()`, removes temp `ZPLC_PERSIST_ROOT`.

### 7.2 Breakpoints Across All 5 Languages

| Language | Agent Breakpoint Specifier | Resolution Pipeline | Reverse Mapping (Paused PC -> Source) |
|---|---|---|---|
| **ST** | `{ file: "src/Main.st", line: 14 }` | `getBreakpointPCForLine(debugMap, file, 14)` | `debugMap.pou[pou].sourceMap` / `breakpoints` -> `{ file, line, pc }` |
| **IL** | `{ file: "src/Main.il", line: 8 }` or `{ file, element: "line:8" }` | IL transpiler `sourceMap` -> generated ST line(s) -> first valid PC in `debugMap` | PC -> generated ST line -> `elementAtLine(sourceMap, stLine)` -> `{ file, line: 8, element: "line:8", pc }` |
| **LD** | `{ file: "src/Belt.ld.json", element: "rung:r1" }` or `"rung:r1/cell:0,2"` | `linesOfElement(sourceMap, element)` -> first valid PC in `debugMap` | PC -> generated ST line -> `elementAtLine(sourceMap, stLine)` -> `{ file, element, pc }` |
| **FBD** | `{ file: "src/Logic.fbd.json", element: "block:ton_1" }` | `linesOfElement(sourceMap, element)` -> first valid PC in `debugMap` | PC -> generated ST line -> `elementAtLine(sourceMap, stLine)` -> `{ file, element, pc }` |
| **SFC** | `{ file: "src/Seq.sfc.json", element: "step:s1" \| "step:s1/enter" \| "transition:t1" \| "transition:t1/fire" \| "action:a1" }` | `linesOfElement(sourceMap, element)` -> first valid PC in `debugMap` | PC -> generated ST line -> `elementAtLine(sourceMap, stLine)` -> `{ file, element, pc }` |

**Prerequisite compiler plumbing (bounded, shared with Studio)**:
- `compileMultiTaskProject` already produces transpiler `sourceMap` (`SourceMapRange[]`) for IL/LD/FBD/SFC during transpilation (`src/compiler/`). Persist the compact `elementMap?: SourceMapRange[]` on `DebugPOUInfo` (or return alongside `debugMap` from `compilerCompile`) so both Studio and `McpDebugSessionManager` resolve element <-> PC deterministically without re-transpiling.
- **Check on `posix_host` (`firmware/apps/posix_host/`), answered 2026-11-26: the C runtime does not need to change.** Under the virtual clock, `scenario.step` honors an armed breakpoint and stops the scan mid-scan, at the breakpoint PC; the next `scenario.step` with the same `at_ms` runs the rest of that scan.
  - **By reading**: `handle_scenario_step` (`native_runtime_session.c:1859-1957`) runs the batch with the tick override; when the VM stopped at a breakpoint, `session_complete_scan` (`:552-570`) marks `scan_in_flight`, does not count the cycle and keeps the staged input pulses. The next step must repeat the held timestamp (`"scenario at_ms must repeat the held timestamp while a scan is held"`, `:1893-1899`), so a hold costs the program no virtual time. Studio's plant session already drives this: `plantSession.ts:96-108` counts held steps and repeats the held `at_ms`.
  - **By one host run** (throwaway script under `$TMPDIR`, never committed; `ZPLC_NATIVE_SIM_BIN=$HOME/.cache/zplc-tmp/runs/seam/sim-build/zplc_runtime`, `taskset -c 8-9 bun run probe.ts 100`): the program `x := x + 1; y := x * 2; z := z + 1;` (lines 3-5), compiled with `compileToBinary(src, { generateDebugMap: true })`, a breakpoint on line 4 (`pc 23`), then `simulation.clock.set {mode:"virtual"}`, `program.load`, `breakpoint.add {pc:23}` and `scenario.step` over the IDE's line-delimited JSON session (`NativeSimulationSupervisor.request`):

    ```text
    bp.add {"breakpoints":[23]}
    step at 0       {"state":"paused","cycles":0,"pc":23} x 1 y 0 z 0
    step at 0 again {"state":"paused","cycles":1,"pc":42} x 1 y 2 z 1
    step at iv      {"state":"paused","cycles":1,"pc":23} x 2 y 2 z 1
    step at iv again {"state":"paused","cycles":2,"pc":42} x 2 y 4 z 2
    ```

    The first step stops at `pc 23` with `x` written and `y`, `z` not yet, and the cycle not counted: a mid-scan stop, not a scan boundary. Repeating `at_ms` finishes the scan (`cycles: 1`). The next scan, at `iv` = 100 ms, stops at the same place again.
  - **Two facts the run showed that W4 must handle in TypeScript**:
    1. The virtual-clock interval of a single-file program with no task table is the session default, 100 ms (`native_runtime_session.c:2182`), while `status.get` reports the focused task at `interval_us: 10000`; a step at 10 ms is refused with `"scenario at_ms must advance by the task interval"`. `debug_session_start` takes `scanIntervalMs` from the `simulation.clock.set` answer after the load (or from the project's task), never from `status.get`'s task line.
    2. The runtime refuses every `breakpoint.*` request on a session with more than one task (`"breakpoint operation requires an unambiguous task"`, `native_runtime_session.c:2263-2265`). `debug_breakpoints` on a multi-task project returns `MCP_INVALID_ARGUMENTS` naming the limit, as Studio does today; `debug_step` and `debug_inspect` still work there. Lifting the limit is C work and is not part of 2.1.
  - **Consequence for W4**: W4 does not touch C. `AIX-U8` shrinks to the compiler element-to-PC map (`debug-map.ts`, `IDE/src/compiler/index.ts`) and its tests, **0.5–1.0 d** instead of 1.0–1.5 d, and drops `firmware/apps/posix_host/` from its surface. If a later finding does put C in W4 (for example per-task breakpoints), that C work is its own unit for a high-risk writer, with a C unit test in `firmware/apps/posix_host` and an independent verifier, never folded into a TypeScript unit.

### 7.3 Inspecting Variables, Function Blocks, SFC State & Plant Facts

1. **Variables (`signals`)**: Look up `Program.Var` or global in `debugMap.pou[pou].vars`; batch-read memory via `adapter.peek(addr, size)` and decode with `bytesToValue` (BOOL bitOffset, INT, DINT, UINT, UDINT, REAL, TIME, STRING, etc.).
2. **Function Blocks (`functionBlocks`)**: Given a block instance name (e.g., `Main.Delay1` or `Delay1`), match all `debugMap` variables sharing the prefix `<instance>.` (or struct/FB member layout in `debugMap.pou[pou].vars`) and return a structured object `{ IN: true, PT: 2000, Q: false, ET: 450 }`.
3. **SFC State (`includeSfc: true`)**: Read every `DebugMonitorEntry` in `debugMap.pou[pou].monitor` with `role: 'step' | 'time' | 'condition' | 'fired'` (`packages/zplc-compiler/src/compiler/debug-map.ts:158-167`), peek each referenced variable, and return active steps (with elapsed `activeMs`) and transition condition/fired flags—zero guesswork on generated variable names.
4. **Plant State (`includePlant: true`)**: Read current `plantCore` sensor/command values and `plantCore.facts()` snapshot directly from the private `plantCore`.

### 7.4 Bounds & Failure Safety

- **Concurrency**: Max 2 active private debug sessions per `zplc-mcp` process (`MCP_DEBUG_SESSION_LIMIT`).
- **Idle TTL**: 300 seconds sliding window (`unref()` timer) -> auto-disposes forgotten sessions.
- **Step budget**: `cycles <= 1000`, `durationMs <= 60_000`, `continue.maxCycles <= 5000`, per-call wall-clock deadline `15_000 ms` -> returns `stopReason: 'budget_reached'` cleanly rather than hanging.
- **Workspace drift**: If files on disk change while a debug session is open, `debug_step` / `debug_inspect` still inspect the loaded generation cleanly and set `staleWorkspace: true` to remind the agent to restart the session after edits.

---

## 8. AIX-015: Agent-Sized Answers & Traces

### 8.1 Fixing `AI-03` (33/43 Plant Lessons > 512 KiB)

**Root cause** (`packages/zplc-ide/src/mcp/server.ts:798`):
`replayFromScenario` rejected any `traceFile` whose raw JSON exceeded `MAX_OUTPUT_BYTES` (512 KiB), returning `undefined` -> `MCP_INTERNAL_ERROR`. On 33 of 43 shipped plant lessons, 2,001–3,001 samples exceed 512 KiB, making `trace_get`, `simulation_start`, `simulation_step`, and `runtime_snapshot` completely unusable.

**Fix**:
1. Decouple **internal trace decode limit** (`MAX_INTERNAL_TRACE_BYTES = 16 * 1024 * 1024`, bounded by scenario engine's `MAX_SAMPLES = 10_000`) from **MCP tool response limit** (`MAX_OUTPUT_BYTES = 512 * 1024`).
2. Add three response modes to `trace_get`:
   - **`mode: 'changes'` (default)**: Emits sample `0`, every sample where ANY selected signal/input/watched variable/plant fact changes value from the previous sample, every failed assertion `atMs`, and the final sample. Caps output at `limit` (default `200`, max `1000`) with `truncated: true` and `nextCursor: { fromSample, fromMs }`.
     - *Expected size*: A typical 2,501-sample plant lesson collapses from ~450–900 KiB down to **15–60 change events (~4–18 KiB)**.
   - **`mode: 'summary'`**: Emits per-signal summary (`first`, `last`, `transitions`, `firstTrueMs`, `lastTrueMs`, or `min`/`max` for numeric signals/facts) + failed assertions (< 4 KiB even for 10,000-sample runs).
   - **`mode: 'window'`**: Emits dense samples inside `[fromMs, toMs]` or `[fromSample, fromSample + limit)` for fine-grained inspection around a failure timestamp.
3. Cache the last scenario run's parsed trace in memory inside the MCP server keyed by `(savedTestInputIdentity.sha256, scenarioId, watchSignalsKey)` (LRU size 4) so consecutive `trace_get` pages / `simulation_step` / `runtime_snapshot` calls do NOT re-run a 10-second physics scenario on every page!

### 8.2 Fixing `AI-08` (Inputs & Internal Variables in Traces Without Breaking 2.0 Trace Hashes)

**Constraint** (`handoff.md` §7 Answer 6, `toolApi.ts:971`): The 2.0 scenario `traceFile` bytes and `traceSha256` MUST stay bit-for-bit identical across all 43 shipped plant lessons.

**Design**:
- Keep `ScenarioRunResult.trace` (and `aggregateTrace` / `traceSha256`) **unchanged**.
- Add an optional non-hashed sidecar `observed?: ScenarioObservedTrace` produced by `runScenario` when requested via `runScenario(..., { captureInputs: true, watchSignals?: ResolvedWatch[] })`:
  - `inputs`: all scenario-written & plant/scene-driven `IPI` inputs per tick (already tracked in `runScenario`!).
  - `watched`: any agent-requested `WORK`/`RETAIN`/FB-member variables resolved via `debugMap` and read via `peek` on each tick (up to 32 signals, bounded by wall-clock deadline).
  - `facts`: raw numeric/boolean plant facts for scene scenarios per tick.
- `trace_get` exposes `inputs`, `outputs`, `watched`, and `facts` seamlessly in `changes`/`window`/`summary` modes while still reporting the unchanged canonical `traceSha256`.

### 8.3 Trimming Envelope Noise (`AI-12`) & Actionable Errors (`AIX-015`)

- State `evidenceLevel` once at top level; drop repeated boilerplate `note` and `scope` strings from every reply.
- **Keep `execution` through 2.1.** Every reply that carried `execution` in 2.0 still carries it, with the 2.0 shape and values, so a 2.0 client that reads it does not break. New tools and every reply add the compact `audit: { jobId, permission, durationMs }` beside it. The ~300 bytes/call of `execution` stay in 2.1; trimming them is a 2.2 decision, announced as a deprecation in 2.1. A test asserts that the replies of `tests_run`, `scenario_run` and every other 2.0 tool still parse with the 2.0 `executionSchema` (`server.ts:231`), and that `audit` matches `execution` (same job, same permission).
- **Record the change.** `AIX-U5` adds to `CHANGELOG.md` under `## Unreleased`: "MCP replies add an `audit` field (`jobId`, `permission`, `durationMs`) beside `execution`. `execution` is unchanged in 2.1 and is deprecated; a later release may remove it." `AIX-U13` states the same in `docs/docs/reference/mcp.md` and its Spanish twin, field by field.
- Every wrong-name error (`scenarioId`, `source` file name, `ideId`, `signal`, `sessionId`) includes `validValues` sorted alphabetically (capped at 32 entries with `more` count).

---

## 9. Studio Assistant & Connection Polish (AIX-001..007, AIX-009, JRN-007)

### 9.1 Shared Project, Plant & Lesson Context Provider (`AIX-001`, `AIX-002`, `AI-15`, `AI-21`)

Create `packages/zplc-ide/src/ai/projectContext.ts` (pure host module, shared by `src/mcp/server.ts` and `electron/aiProvider.ts`):

1. **What it gathers** (strictly from saved project files on disk, obeying size caps and `manifestForAssistant` redaction):
   - **Plant context**: `scene.json` summary (scene name, parts with names/kinds, offered command/sensor signals), `plant-map.json` bindings + binding problems.
   - **Scenarios context**: scenario IDs, expectation summaries, and (when provided by the renderer from the latest run) failed expectation checks (`index`, `kind`, `atMs`, `checks: [{ signal, expected, observed }]`) and final plant facts (`fact:*`).
   - **Diagnostics context**: compiler/live diagnostics including **`message`**, `code`, `path`, `line`, `column`, and `element` (closing `AI-15`, where `message` was dropped!).
   - **Lesson context (`AIX-002`)**: detects whether the project is a lesson workspace (`<userData>/learn-workspaces/<lessonId>` or explicitly linked active lesson ID); loads from `LESSON_INDEX` + lesson package files ONLY: `lessonId`, `title`, `language`, `goal`/`objectives`, `stage` (current learner step), and `hints`.
2. **Authoritative `hideSolutions` enforcement (`AIX-002`, `AIX-005`, `D-32`)**:
   - Mirror `hideSolutions: boolean` from Studio settings into `<userData>/zplc-learn-policy.v1.json` (atomic temp+rename, identical to `electron/shellPreferences.ts`).
   - Both `electron/aiProvider.ts` and `zplc-mcp --user-data <dir>` read `hideSolutions` directly from `<userData>` (never trusting renderer-supplied booleans).
   - When `hideSolutions === true` (or unknown in standalone MCP without `--user-data`):
     - `zplc://lesson/current` sets `solutionsHidden: true` and omits any solution reference.
     - `electron/aiProvider.ts` sets `lesson.solutionsHidden = true` and injects a hard system rule: *"Solutions are hidden by the classroom setting. Give guidance and hints only; NEVER write a complete solution program."*
3. **Deterministic budget shedding** (`MAX_BODY = 128 KiB` in `electron/aiProvider.ts`, updating `docs/docs/ide/ai-privacy.md` in lockstep):
   - Always keep: prompt, mode, active file (if within limit), lesson goal/stage, failed scenario checks & plant facts, diagnostics with messages.
   - Shed in order if over `MAX_BODY`: full manifest -> passing scenarios -> raw scene part coordinates -> older trace samples -> tasks.
   - Update `isAllowedAiProviderRequest` (`electron/security.ts`) to allow the strictly validated structured fields: `failedScenarios` (capped at 4 scenarios × 8 assertions × 8 checks), `diagnostics` (adding bounded `message` max 256 chars and `element`), `selection` (`{ startLine, endLine, text }` or `{ element }`, scanned by `hasKnownSecretPattern`), `lessonContext` (`{ lessonId, stage }`), and `locale` (`'en' | 'es'`), while rejecting all forbidden device/port/session keys (`aiDeviceLink.test.ts`).

### 9.2 Four Assistant Entry Points With Attached Context (`AIX-003`, `AI-18`)

Create a small store `packages/zplc-ide/src/store/useAssistantEntry.ts` with `openAssistantWith(intent)` that reveals the Assistant secondary sidebar, selects the matching mode, attaches a removable context chip shown in the Context Preview, and focuses the prompt input:

| # | Entry Point | Mode Selected | Attached Context |
|---|---|---|---|
| 1 | **Problems panel** (`Console.tsx` / Problems rows) — "Explain with Assistant" button | `debug` | Selected diagnostic (`code`, `message`, `path`, `line`, `column`, `element`) + active file. |
| 2 | **Test / Scenario Results tab** (`TestResultsTab.tsx`) — "Explain failure" button on any failed scenario/assertion | `debug` | Failed scenario ID, failed assertion (`index`, `kind`, `atMs`, `checks`), and plant facts. |
| 3 | **Lesson Guide** (`LearnPanel.tsx` / `Guide.tsx`) — "Ask for a hint" button | `ask` | Current `lessonId`, goal, and learner stage (D-32 hint-first prompt prefill). |
| 4 | **All 5 Editors** (ST, IL, LD, FBD, SFC) — context menu / toolbar button "Ask Assistant about selection" | `ask` (user may switch to `edit`/`debug`) | Active file + selected line range (ST/IL) or selected element (`rung:<id>`, `block:<id>`, `step:<id>`, `transition:<id>`). |

**Multi-turn follow-up (`AI-18`)**: Keep a bounded in-session history (up to 3 prior user/assistant turns, reset on workspace switch or via a **"New conversation"** button, dropped first under `MAX_BODY` shedding) so a learner can ask for a hint and then follow up without re-explaining.

### 9.3 Unified Naming, Localization, Glossary, Clickable Places & Lesson Stance (`AIX-004`, `AIX-005`, `AI-20`, `AI-21`)

1. **One name everywhere (`AI-20`)**: Replace all user-facing `"Agent"` strings in `src/i18n/catalog/console.ts` (`en` and `es`), `AgentTab.tsx`, and `SYSTEM_POLICY` with **"Assistant"** (EN) / **"Asistente"** (ES).
2. **Localized mode buttons (`AI-20`)**: Replace raw `{mode}` in `AgentTab.tsx:118` with i18n keys (`assistant.mode.ask/plan/edit/debug` -> `Ask / Plan / Edit / Debug` in EN, `Preguntar / Planificar / Editar / Depurar` in ES) and short tooltips explaining when to use each mode.
3. **Upgraded `SYSTEM_POLICY` (`AI-21`, `AIX-004`, `AIX-005`)**:
   - Opens with `"You are ZPLC Assistant."`
   - Specifies reply language (`en` or `es` matching Studio's interface locale) and canonical ZPLC glossary terms (rung, coil, contact, function block, step, transition, scan, scenario, plant map, Check).
   - Summarizes ZPLC's Structured Text dialect, supported standard FBs, and concise LD/FBD/SFC rules so Edit proposals compile on the first try.
   - **D-32 Lesson Stance**: When inside a lesson, instructs the model to give a hint first (pointing at the concept/signal/element), give a solution ONLY when the user asks plainly AND `solutionsHidden` is `false`, NEVER give a solution when `solutionsHidden` is `true`, and NEVER claim to pass a lesson (only **Check** does).
4. **Clickable places in answers (`AIX-004`)**: Parse inline citations in assistant answers matching project paths (`src/Main.st`, `src/Main.st:14`, `tests/smoke.scenario.json`, `plant-map.json`, `scene.json`) and element IDs (`rung:<id>`, `block:<id>`, `step:<id>`, `transition:<id>`), verify they exist in the open project, and render them as keyboard-accessible links/buttons that navigate directly via Studio's existing `openFile` / `goToLine` / `selectElement` actions!

### 9.4 Setup UX & One-Action MCP Connection (`AIX-006`, `AIX-007`, `AI-11`, `AI-17`, `AI-19`)

#### Assistant Setup (`AssistantSettings.tsx` + `electron/aiProvider.ts`)

1. **Key-free loopback endpoints (`AIX-006`, `AI-17`)**:
   - When `endpoint` is loopback (`http://localhost`, `http://127.0.0.1`, `http://[::1]`), `configured` is `true` even with no stored API key; requests omit the `Authorization` header when no key is stored.
   - Non-loopback `https://` endpoints continue to require a stored OS-vault key.
2. **Test Connection button (`AIX-006`)**:
   - Add `aiProvider.testConnection()` IPC channel: sends a bounded 10 s probe (`POST <endpoint>/v1/chat/completions` with `max_tokens: 1`, prompt `"ping"`, no project data) and returns `{ ok: true, latencyMs }` or `{ ok: false, code, retryAfter? }` with localized plain cause + next step.
3. **Inline examples & docs (EN/ES)**:
   - Placeholders and helper text show hosted (`https://api.openai.com`) and local (`http://localhost:11434`, `http://localhost:1234`) examples directly in Preferences and in `docs/docs/ide/ai-privacy.md` (closing Journey 4 gaps 4–7).
4. **Large file / latency headroom (`AI-19`)**:
   - Measure real latency on the AIX-009 task set (including median 7.7 KiB and >16 KiB LD lessons). Raise `MAX_SOURCE` for active visual files from 64 KiB to 96 KiB (still inside `MAX_BODY = 128 KiB`), add elapsed-time progress text while waiting, and document the exact request timeout (30 s, or adjusted only if real-model evidence in AIX-009 justifies it and approved) and large-diagram limit in `Known limits` per P27.

#### Studio MCP Connection & Self-Check (`AIX-007`, `AI-11`)

1. **CLI `--self-check` flag** (`packages/zplc-ide/src/mcp/index.ts`):
   - `zplc-mcp --workspace <abs-path> [--repository <abs-path>] [--user-data <abs-path>] --self-check`
   - Validates workspace, optional repo/user-data, native simulator binary readiness, prints concise JSON/text report (folder, tools count, protocols served, Rule 8 boundary), exits `0` (ready) or `1` (actionable error).
2. **One-Action MCP Setup in Studio** (`Preferences -> MCP / External Agents` + Command Palette `ai.connectMcp`):
   - Resolves the open project's absolute directory in Electron main (including managed lesson workspaces `<userData>/learn-workspaces/<lessonId>`) — user never has to hunt for lesson folders!
   - Lets the user choose one of **3 named clients** and click one button (**Write config** or **Copy command**):
     1. **Claude Code**: writes project-scoped `.mcp.json` (with confirmation) OR copies `claude mcp add zplc -- <zplc-mcp-path> --workspace "<folder>" [--user-data "<userData>"]`.
     2. **Cursor**: writes `.cursor/mcp.json` (merging `mcpServers.zplc` safely) OR copies JSON snippet.
     3. **VS Code**: writes `.vscode/mcp.json` (merging `servers.zplc` safely) OR copies JSON snippet.
   - **"Run self-check"** button runs `zplc-mcp --self-check` on the open workspace via `spawnAllowList` and renders green/red diagnostics.
3. **EN/ES Documentation (`docs/docs/guides/ai-and-mcp.md`, `docs/i18n/es/...`)**:
   - Exact copy-paste steps for Claude Code, Cursor, and VS Code.
   - Explicit section on lesson workspaces: explains `<userData>/learn-workspaces/<lessonId>` paths on Linux (`~/.config/zplc/learn-workspaces/<lessonId>`), macOS (`~/Library/Application Support/zplc/learn-workspaces/<lessonId>`), and Windows (`%APPDATA%\zplc\learn-workspaces\<lessonId>`), and shows how Studio's **Connect AI Agent (MCP)** action fills both `--workspace` and `--user-data` automatically.

### 9.5 Fixed Task Set & Owner-Launched Real-Model Runs (`AIX-009`, `JRN-005`, `JRN-007`)

1. **Fixed 15-task evaluation suite in repo (`tools/ai-eval/tasks.json` + fixtures)**:
   - **5 languages (`ST`, `IL`, `LD`, `FBD`, `SFC`) × 3 task types**:
     - `write` (5 tasks, `must`): author a program from a specification + plant map/scenario until `compiler_check` and `scenario_run` pass.
     - `repair` (5 tasks, `must`): diagnose and fix a seeded failing program (including plant scene failures) until `scenario_run` passes.
     - `explain` (5 tasks, `must`): explain a failing build or failing plant scenario; rubric checks that the explanation names the failing signal/fact, the expected vs observed condition, and the relevant source place.
2. **Automated deterministic CI journeys (`JRN-005`)**:
   - Journey 4 (Assistant) automated with scripted local mock OpenAI-compatible HTTP server testing setup, Ask/Debug with failed plant scenario, Edit in ST + LD, review diff, and save.
   - Journey 5 (Agent over MCP) automated with scripted MCP client testing connect (2025 + 2026-07-28), read project/plant/lesson, read format resource, `workspace_check_write`, `workspace_write` in ST + LD, `scenario_run`, `trace_get`, live `debug_*` session with breakpoint, and Studio live reload (`AIX-012`).
3. **Owner-launched real runs (`JRN-007`, `AI-13`, `AI-19`)**:
   - `tools/ai-eval/run-claude-code-mcp.ts` — Owner runs manually with their own Claude Code CLI against `zplc-mcp` on a disposable copy of the task set (never called by CI, never reads credentials automatically).
   - `tools/ai-eval/run-assistant-eval.ts` — Owner runs manually with their chosen endpoint/model against `createAiProvider` on the Assistant tasks.
   - Both emit a versioned evidence JSON (`specs/014-zplc-2-1-release-quality/evidence/aix-real-run-<date>.json`) recording `model`, `client`, `date`, `evidenceLevel: 'manual-model-run'`, per-task pass/fail, latency, and response byte counts.

---

## 10. Delivery Waves, Bounded Writer Units, Estimates & Verification Plan

Each unit is sized to **1 behavior / ~3–6 files**, follows strict **TDD (RED commit + push -> GREEN commit + push)**, and ends with an **independent verifier** checkpoint.

### 10.1 Wave & Unit Schedule

| Wave | Unit ID | Scope & Deliverable | Primary File Surfaces | Depends On | Est. |
|---|---|---|---|---|---|
| **W1: Formats & Validation** | `AIX-U1` | Canonical 6 format modules + schema/worked-example self-validation tests (`AIX-013`) | `IDE/src/formats/{ld,fbd,sfc,scene,plantMap,scenario,index}.ts`, `IDE/src/formats/formats.test.ts` | Owner approval | 1.5 d |
| **W1** | `AIX-U2` | Visual/scenario/scene diagnostic upgrades naming place + accepted values + `projectValidate` checking visual files (`AI-06`, `AIX-013`) | `IDE/src/models/visualFileLoad.ts`, `ld.ts`, `fbd.ts`, `sfc.ts`, `IDE/src/cli/toolApi.ts`, tests | `AIX-U1` | 1.0 d |
| **W2: Read, Plant, Lesson & Trace** | `AIX-U3` | Shared `projectContext.ts` + authoritative `hideSolutions` persistence (`learnPolicy.ts`) (`AIX-001`, `AIX-002`, `AI-07`) | `IDE/src/ai/projectContext.ts`, `IDE/electron/learnPolicy.ts`, `IDE/src/store/useAppSettings.ts`, tests | None (parallel with W1) | 1.0 d |
| **W2** | `AIX-U4` | MCP read tools (`plant_inspect`, `scenarios_list`, `server_self_check`), `--self-check` CLI, new fixed/template resources (`scene`, `plant-map`, `scenarios`, `lesson/current`, `formats/*`, `scenario/{id}`), plain descriptions, prompts & server instructions (`AIX-001`, `AIX-002`, `AIX-007`, `AIX-008`, `AIX-013`) | `IDE/src/mcp/server.ts`, `IDE/src/mcp/index.ts`, `IDE/src/mcp/resources.ts`, `IDE/src/mcp/deviceLink.test.ts`, `lessonPrivacy.test.ts` | `AIX-U1`, `AIX-U3` | 1.5 d |
| **W2** | `AIX-U5` | Agent-sized `trace_get` (`changes`/`window`/`summary`), 16 MiB internal parse cap (`AI-03`), `includeInputs` + `watchSignals` sidecar preserving 2.0 `traceSha256` (`AI-08`), compact envelope (`AI-12`), actionable errors with `validValues` (`AIX-015`) | `IDE/src/test-engine/index.ts`, `IDE/src/cli/toolApi.ts`, `IDE/src/mcp/traceView.ts`, `IDE/src/mcp/server.ts`, tests (incl. 43-lesson sweep) | `AIX-U4` | 1.5 d |
| **W3: MCP Write & Studio Live Reload** | `AIX-U6` | `workspace_check_write` + `workspace_write` (5 languages, `zplc.json`, scenarios, scene, plant-map), symlink/confinement, sensitive-field refusal, atomic temp+rename (`AIX-011`) | `IDE/src/mcp/workspaceWrite.ts`, `IDE/src/mcp/server.ts`, `IDE/src/mcp/workspaceWrite.test.ts`, `deviceLink.test.ts` | `AIX-U2`, `AIX-U4` | 1.5 d |
| **W3** | `AIX-U7` | Studio follows external edits: visible toasts naming file, `zplc.json`/`src/`/`tests/` reload, live 3D Plant view reload (`sceneRevision`), `ExternalChangePrompt` diff view, watcher fallback (`AIX-012`); owner 2026-11-26 (bar criterion AI-4): the notice of a file replaced from outside offers "what changed" through the conflict prompt renderer and "restore" what Studio had, MUST for an open file without unsaved changes and SHOULD for a file that was not open, with its test | `IDE/electron/projectWatcher.ts`, `IDE/src/store/externalChangeWatch.ts`, `IDE/src/store/usePlantDocument.ts`, `IDE/src/shell/PlantDocument.tsx`, `IDE/src/components/ExternalChangePrompt.tsx`, tests | None (parallel with `AIX-U6`) | 1.5 d |
| **W4: Private Simulation Debugger** | `AIX-U8` | Compiler element-to-PC source map export (`AIX-014` prereq). No C: `scenario.step` already stops mid-scan at a breakpoint under the virtual clock (§7.2) | `packages/zplc-compiler/src/compiler/debug-map.ts`, `IDE/src/compiler/index.ts`, tests | None (can start early) | 0.5–1.0 d |
| **W4** | `AIX-U9` | `McpDebugSessionManager` + 6 `debug_*` tools (all 5 languages breakpoints, stepping, inputs/plantActions, FB & SFC monitor inspection, max 2 sessions, 300 s TTL, isolation tests) (`AIX-014`) | `IDE/src/mcp/debugSession.ts`, `IDE/src/mcp/server.ts`, `IDE/src/mcp/debugSession.test.ts`, `deviceLink.test.ts` | `AIX-U4`, `AIX-U8` | 2.0 d |
| **W5: Studio Assistant & Setup Polish** | `AIX-U10` | Assistant rich context (`projectContext`, failed scenarios/plant facts, diagnostic messages, lesson goal/D-32 stance), key-free loopback, `testConnection`, upgraded `SYSTEM_POLICY` & `isAllowedAiProviderRequest` (`AIX-001`, `AIX-002`, `AIX-005`, `AIX-006`, `AI-15`, `AI-17`, `AI-21`) | `IDE/electron/aiProvider.ts`, `IDE/electron/security.ts`, `IDE/electron/ipcContract.ts`, `IDE/electron/ipcHandlers.ts`, `IDE/electron/preload.ts`, `aiDeviceLink.test.ts`, `aiProvider.test.ts` | `AIX-U3` | 1.5 d |
| **W5** | `AIX-U11` | Assistant UI polish: unified "Assistant"/"Asistente" naming, localized mode buttons, clickable file/line/element links, 4 entry points with attached context, bounded follow-up turns, Settings connection test + examples (`AIX-003`, `AIX-004`, `AIX-006`, `AI-18`, `AI-20`) | `IDE/src/store/useAssistantEntry.ts`, `IDE/src/components/AssistantView.tsx`, `AgentTab.tsx`, `AssistantSettings.tsx`, `Problems`/`TestResultsTab`/`LearnPanel`/editor actions, `i18n/{en,es}` | `AIX-U10` | 1.5 d |
| **W5** | `AIX-U12` | One-action Studio MCP connection panel (Claude Code, Cursor, VS Code) + self-check runner (`AIX-007`, `AI-11`) | `IDE/src/mcp/clientConfig.ts`, `IDE/electron/mcpConfigIpc.ts`, `IDE/src/components/settings/McpConnectionSettings.tsx`, `i18n/{en,es}`, tests | `AIX-U4` | 1.0 d |
| **W6: Docs, Task Set & Journeys** | `AIX-U13` | Generated & authored EN+ES documentation updates: 6 format refs, regenerated `reference/mcp.md`, updated `guides/ai-and-mcp.md` (3 clients + `learn-workspaces`) and `ide/ai-privacy.md` (`AIX-006`, `AIX-007`, `AIX-010`, `AIX-013`) | `tools/docs/generate_source_references.ts`, `docs/docs/**`, `docs/i18n/es/**`, `docs/capability-claims.json` | `AIX-U4`..`AIX-U12` | 1.5 d |
| **W6** | `AIX-U14` | Fixed 15-task repo eval set + automated scripted Journeys 4 & 5 (`JRN-005`) + owner-launched Claude Code & Assistant scripts (`AIX-009`, `JRN-007`) | `tools/ai-eval/{tasks.json,run-claude-code-mcp.ts,run-assistant-eval.ts}`, `IDE/scripts/journeys/` (JRN-4/JRN-5 scripted), `specs/014-zplc-2-1-release-quality/scope.md` | `AIX-U13` | 1.5 d |

**Total Estimate**: **14 bounded writer units**, **~18.0–18.5 engineer-days** sequential (~10–12 calendar days with parallel Wave 1/2/3/4/5 tracks), plus **1 owner-launched real-run stop** (`JRN-007` with Claude Code and a real model) and **1 external reviewer pass** (`REV-001` / `BAR-007`).

### 10.2 Independent Verifier Checkpoints & Required Commands

1. **Checkpoint 1 (after W1 + W2)**: Verifies `AIX-001`, `AIX-002`, `AIX-013` (format modules + diagnostics), `AIX-015` (all 43/43 plant lessons pass `trace_get` with 0 `MCP_INTERNAL_ERROR` and unchanged 2.0 `traceSha256`).
2. **Checkpoint 2 (after W3 + W4)**: Verifies `AIX-011` (all 5 languages + manifest + scenario + scene/map write & dry-run + symlink/sensitive refusal), `AIX-012` (Studio live reload + 3D plant reload + dirty diff conflict), `AIX-014` (live private debug + breakpoints across all 5 languages + FB/SFC/plant inspection + Rule 8 isolation).
3. **Checkpoint 3 (after W5 + W6)**: Verifies Assistant context/entry points/localization/loopback/connection test, 3-client MCP setup + `--self-check`, EN/ES docs parity (`bun run check:docs`), scripted Journeys 4 & 5 (`JRN-005`), and prepares the **Owner Stop** for the real Claude Code + Assistant model run (`JRN-007`).

**Standard verification suite run per unit**:

```bash
ZPLC_NATIVE_SIM_BIN=/home/eduardo/Documents/Repositorios/ZPLC-worktrees/plant-sim/firmware/lib/zplc_core/build/zplc_runtime \
  bun test ./packages/zplc-ide/src/mcp ./packages/zplc-ide/src/ai ./packages/zplc-ide/electron/aiProvider.test.ts \
           ./packages/zplc-ide/electron/aiDeviceLink.test.ts
bun test ./tools/ci ./tools/docs
bun run lint:ide
bun run typecheck
bun run check:docs
CLANG_FORMAT=/home/eduardo/zplc-zephyr-ws/.venv/bin/clang-format bun tools/ci/format.ts --check
```

---

## 11. Owner Approval Checklist (STOP)

Before authorizing implementation of `AIX-U1`..`AIX-U14`, reviewer and owner confirm:

1. **Rule 8 boundary** (§2): Private host simulation + confined workspace writes satisfy `AGENTS.md` rule 8 and `D-31`, with zero hardware/serial/plant-I/O/Studio-session paths and strict automated traps.
2. **Tool & resource surface** (§3): 26 tools (15 existing + 11 new), 26 resources (22 fixed + 4 templates), 4 prompts, and server instructions cover every requirement of `AIX-001`..`AIX-015` without bloating context.
3. **Write & reload contract** (§4–§5): Validate-before-write, canonical LD/FBD/SFC serialization, atomic temp+rename, and live Studio/3D-plant reload with conflict diff prompt meet `AIX-011` and `AIX-012`.
4. **Private debugger & trace sizing** (§7–§8): 2-session cap, 300 s TTL, 5-language element/line breakpoints, and default `'changes'` trace mode preserve 2.0 trace hashes while unblocking all 43/43 plant lessons.
5. **Delivery plan** (§10): 14 bounded units across 6 waves with 3 verifier checkpoints and an owner-launched `JRN-007` real-model run.
6. **Proposed rule 8 sentence** (§2.1a): the owner approves, changes or refuses the new sentence of rule 8 of `AGENTS.md` and of `docs/docs/guides/force-values.md`, in English and Spanish. Until then nothing in `AGENTS.md`, the pages or `src/mcp` carries it, and Group D does not ship.

---

## 12. Review of 2026-11-26

The external review of 2026-11-26 (section "The AIX plan") found six points. Each is answered here:

| # | Point of the review | Where the plan answers it |
|---|---|---|
| 1 | `workspace_write` replaces files and was declared `destructiveHint: false`. | §2.4 (invariant: `destructiveHint: true` only on the closed list `['workspace_write']`, false on every other tool), §3.2 (catalogue note and Group B row). |
| 2 | The rule 8 sentence: rule 8 and `force-values.md:17` forbid forcing on a simulator too, and §2.2 narrowed it to "on hardware". | §2 intro and §2.1a (proposed sentence for rule 8 and for `force-values.md`, EN and ES, needs the owner's approval; no page or `src/mcp` text changes before), §2.2 and §3.4 (the line is "on hardware or on a session a person runs", with private simulators inside), §11 item 6. |
| 3 | Does the C runtime have to change so a breakpoint stops a scan under the virtual clock? | §7.2: no. Read in `native_runtime_session.c` and shown by one host run: `scenario.step` stops mid-scan at the breakpoint and repeats the held `at_ms` to finish the scan. W4 does not touch C; `AIX-U8` is 0.5–1.0 d (§10.1). Any later C work is its own high-risk unit. |
| 4 | A test of `workspace_write` replacing an existing file on the Windows runner. | §4.3 "Tests of Stage 3": replace on Windows, in the nightly's `desktop-ide-tests` job, "Windows x64" (`windows-2025`). |
| 5 | The temporary file is 0600 and its rename changes the mode of a replaced file; what "atomic" covers with several files. | §4.3: the captured mode is set on the temporary file before the rename, with a test; "What atomic covers": each file is atomic, the set is restored at best effort. §4.1: known limit, no tool deletes or renames a file, stated in the pages. |
| 6 | Renaming `execution` to `audit` breaks a 2.0 client. | §8.3 and §3.1: `execution` stays unchanged through 2.1, `audit` is added beside it, a test pins the 2.0 shape, and the change goes into `CHANGELOG.md` and `docs/docs/reference/mcp.md`. |
