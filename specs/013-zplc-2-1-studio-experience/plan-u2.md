# ZPLC 2.1 Studio Experience, Milestone U2 Implementation Plan: tests, find and words (PROVISIONAL, revision 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Provisional.** U2 builds on U0 and U1 of spec 013 **as merged** on `feat/plant-simulation` at commit `bebc223b` (`Merge branch 'test/m2-c1-coverage' into feat/plant-simulation`, read with `git log --oneline -1` on 2026-11-13). Spec 013 is **Draft**: the owner took decisions D-20 to D-26 on their recommended defaults on 2026-11-12, and approval of the document as a whole is not recorded. U2 is not on the path of 2.1.0 (decision D-24, option B: "U2 and U3 as they fit, the rest in 2.1.x"; spec section 9: "U2 and U3 change nothing that spec 012 builds on, so each can ship in a 2.1.x release without rework"). Every task below can therefore be merged on its own and shipped in 2.1.x if the run ends early. Nothing here is verified on a running application on macOS or Windows; the measures of spec section 8.1 are checked on Linux by `IDE/scripts/interfaceBudget.ts`.

**Goal:** Deliver milestone U2 of spec 013 (section 9: "The Tests activity and results; the rest of the panel's moves; the palette, search and references; the vocabulary and the guard; settings and creation from the navigator"; requirements TST-001 to TST-010, FND-001 to FND-007, MSG-001 to MSG-006, SHL-003 to SHL-005 (the Plant activity gets its content in U3), SHL-008, SHL-009, SHL-011 to SHL-013, SHL-015, SHL-016): a Tests activity that lists the project's tests and runs them, a Test results tab that states the verdict in a sentence and keeps the evidence record behind a disclosure, a results panel of five tabs, one palette that finds commands, files, PLC objects, I/O points, configuration editors, lessons, preferences and scenes, project search and references that cross the five languages, one vocabulary enforced per surface by the i18n guard, Preferences and Project settings as two documents, and creation from the navigator.

**Architecture:** U2 adds no framework and no dependency. Seven seams carry it. (1) **Console split first** (Task X0a): `IDE/src/components/Console.tsx` is 1524 lines against a 1600-line limit and owns the test runner, the interlock check, the Changes review and the Agent as inline blocks; they become files of their own with no change in behaviour, and every later task edits its own file. (2) **A reference index** (`IDE/src/refs/`, Tasks R1 and R2): a pure module that reads the five languages, the I/O configuration, the watch table and the scenarios as *occurrences* of names and addresses, resolves a name by the same scope rules as the Structured Text `ProjectIndex`, and answers "definition" and "all references"; search (FND-003) reads the same text of a diagram. (3) **A test model** (`IDE/src/projectTests/`, Tasks T1 and T2): the scenarios of `tests/*.scenario.json` listed from the project tree, and a store that holds the last result of each, so the activity, the results tab and the commands share one state. (4) **A palette of providers** (`IDE/src/commands/paletteSources/`, Task P2): the filter of `palette.ts` stays; what it filters becomes several ranked groups. (5) **A command inventory test** (Task P1): the registry stays the single list; a render test fails on a control of the command bar, a menu or a tree menu that has no command. (6) **One vocabulary** (`IDE/src/i18n/vocabulary.ts`, Task V1): defined once, read by the catalogs' check in `tools/ci/i18n-guard.ts` per surface. (7) **Moves with a home first**: no surface leaves the results panel until its new home exists (Changes, Agent, Interlocks), so no task leaves a surface unreachable.

**Tech Stack:** TypeScript 5.9 (`erasableSyntaxOnly`: no parameter properties), React 19 with the React Compiler lint, Zustand stores, Bun 1.3.14 (`bun test`), the Studio UI kit (`IDE/src/ui`), Monaco for Structured Text and Instruction List, `@xyflow/react` for the diagram editors, the existing compiler package (`@zplc/compiler`: `parseWithDiagnostics`, `tokenizeWithErrors`, `transpileToST`). **No new dependency.**

**Spec:** `specs/013-zplc-2-1-studio-experience/spec.md` sections 4.2 (decisions D-20 to D-26), 4.3, 5, 6 (workstreams SHL, TST, FND, MSG), 7, 8 and 9; `specs/012-zplc-2-1-plant-simulation/plan-m1.md` revision 2 (lane W, which planned U0 and U1); `specs/012-zplc-2-1-plant-simulation/plan-m2.md` (the structure of this document); the run logbook `odd/tasks/zplc-2-1-0-run.md` (entries L1 to L83) in the main checkout; `specs/013-zplc-2-1-studio-experience/baseline/interface-budget-2.1-m1.json`. Read the spec sections of your task before you start.

**Created:** 2026-11-13 by a planning agent. Anything marked **Unconfirmed** was not verified while writing; the executor confirms it first and records the answer in the commit body. "Plan choice" marks a design decision of this plan that the spec does not state.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`; `COMPILER/` is `packages/zplc-compiler/src/`. `bun test`, `bun run lint` and `bunx tsc -b` run with `IDE/` as the working directory unless the step says "at the root". The pinned formatter is `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` (or `--check`), at the root. Task IDs are local to this plan; cite them as `U2-R1` from another document.

## Roles
| Role | Does |
|---|---|
| Executor | One task each, in its lane. Writes tests first, runs the commands, commits. Never edits a file outside the task's "Allowed edit surfaces". `git add` every new file **before** running the formatter (it only sees tracked files). |
| Parent | Owns git across lanes, merges lanes in dependency order, runs the seam check (the full IDE suite once) at each wave merge, owns the shared files named in "Shared files and who edits them", runs `format --write` after each merge batch, and launches the independent verifiers named in "Done when". |
| Owner | Answers the open questions at the end, runs the macOS and Windows checks (the interface budget and the screen-reader capture are measured on Linux only), and holds the three people of GDE-013 (U3). |

## Start rule
1. **Precondition A, U0 and U1 as merged.** `feat/plant-simulation` at `bebc223b` or later. Confirm: `rg -n "export const SURFACES" IDE/src/shell/surfaces.ts`, `fd -t f . IDE/src/shell` lists `PlantDocument.tsx`, `reveal.ts`, `projectSearch.ts`, `Sidebars.tsx`, and `rg -n "file.saveAll" IDE/src/commands/registry.ts` finds a match. If not, stop: the parent merges first.
2. **Precondition B, the owner's answers.** Not blocking: the plan proceeds on the recommended default of every question in "Open questions for the owner", except question 2, which gates Task T1, and question 3, which gates the `physical` change of Task P1 (the rest of P1 does not wait).
3. **Fresh worktree.** `bun install`, `bun run build:compiler` and `bun run build:runtime`; then, for the journeys and the screen-reader capture, `node install.js` in `packages/zplc-ide/node_modules/electron` and `bun run electron:compile` in `IDE/` (see Global Constraints).
4. **Order.** Wave 1 first (X0a, X0b, R1, R1b, V1, T1); the parent merges X0a and X0b before any wave 2 task starts, because every wave 2 task edits a file that X0a split or a registry that X0b extended.

## Requirement mapping
"Plan choice" marks a design decision of this plan that the spec does not state. Requirements that U2 does not deliver are listed in the last table so nothing is silently dropped.

| Requirement | Task(s) | Note |
|---|---|---|
| TST-001 "The Tests activity MUST list the scenarios of the open project, grouped by file, each with its last result (not run, passed, failed, older than the sources), and a Run action per scenario, per file and for all. It MUST be operable by keyboard." | T2 (T4 for its commands) | Plan choice: a scenario file holds exactly one scenario (`IDE/src/cli/workspace.ts:58` `SCENARIO_FILE`, one `id` per file, for example `IDE/projects/first_blink/tests/first-blink.scenario.json`), so "grouped by file" is a file row whose children are its expectations (kind and time), and "per file" and "per scenario" are the same Run action. The list is read from the project tree, not from a run. |
| TST-002 "The Tests surface MUST NOT offer a chooser for the project manifest." | T2 | The chooser (`Console.tsx:307` `registerWorkspaceManifest`, button at `:964-972`) goes with the Tests tab body; the link is made by `IDE/src/utils/workspaceTestLink.ts:12-27` (`registerProjectRoot`). When no link can be made the activity says the tests need the desktop application (the existing `desktop-unavailable` state); it never shows a file input. |
| TST-003, TST-004, TST-005, TST-008 | T1 (data), T3 (view) | The 2.0 evidence has no expected or observed value: see Finding 1. T1 adds them as optional fields of the Tool API preview (question 2); T3 shows them. |
| TST-006, TST-007, TST-009, TST-010 | T4 | Interlock view in the Tests activity (the `interlocks` tab is cut by H6 after T4 merges), "Replay" into the plant document, "New test", and the commands. |
| FND-001 "One palette MUST find, in ranked groups: commands, files, PLC objects (programs, function blocks, functions, data types, global variables, tasks), I/O points, configuration editors, lessons, preferences by name and, in 2.1, scenes and parts." | P2 | Plan choice: scenes yes (listed from the tree); parts wait for U3, where the Plant activity lists the catalogue (PLS-005), because the catalogue lives in the plant chunk (`IDE/src/plant/`, about 4.35 MB, loaded lazily) and the palette must not import it. Eight kinds ship (measure 10 of spec 8.1 asks at least 7). |
| FND-002 | X0b (ids), P1 (inventory test, bindings) | See question 4 for the scope of "context menu". |
| FND-003 "Project search MUST cover the five languages ... A match in a diagram MUST open it with the element selected, as Problems do today." | R1b (text of a diagram), R3 (search and open) | Opens through `requestElementSelection` (`IDE/src/editors/elementSelectionRequests.ts:23`), the path `Console.tsx:253` uses. |
| FND-004 "'Go to definition' and 'Find all references' MUST work for a variable, a function block instance and an I/O address from every editor, and MUST list uses in all five languages and in the I/O mapping." | R1, R1b, R2, R4 | The design is Task R1's first section and the contracts below. |
| FND-005, FND-006, FND-007 (all SHOULD) | R2 and R4 (FND-005: watch table, scenarios), P3 (FND-006, FND-007) | The plant map is a reference source only where it is a project file; it is delivered with PLS-006 in U3 (see "Not delivered by U2"). |
| MSG-001, MSG-002, MSG-003 | V1 (mechanism), V2 and V3 (text), T3 (badge on the result) | MSG-003's "A check MUST fail when a surface states it twice" is a CI check of V1 plus a journey count of Q1. |
| MSG-004, MSG-005, MSG-006 | V3 (V1 for the formatters) | Plan choice for MSG-005 in question 5. |
| SHL-003 "The results panel MUST show Problems, Output, Test results, Watch and Trace by default, and Terminal while the target is a board or after the user opens it. Every tab MUST show its name, not only an icon, at 1366 by 768 pixels in English and Spanish at both densities." | H6 | Changes, Agent and Interlocks leave after their homes (H1, H3, T4) exist. Measured by `IDE/scripts/interfaceBudget.ts`; its target file moves from 9 to 5 (6 with a board). |
| SHL-004 | H1 (Changes), H3 (Agent), T4 (Interlocks), H6 (old tab ids route) | The parts about Lab and the plant were delivered by U0. |
| SHL-005 | T2 (the Tests sidebar has working content) | "An activity whose sidebar only points elsewhere MUST NOT exist": `TestsView.tsx:10-30` is today exactly that. The Plant activity is not added (U3, as the milestone row says). |
| SHL-008, SHL-009 | H3 (views and Inspector) | Inspector and Assistant; the Guide is U3 (GDE-001). |
| SHL-011, SHL-012 | H2 | Preferences and Project settings as two documents; one theme control. |
| SHL-013 | H4 | "New" in each group, the skeletons, close project in the File menu. |
| SHL-015, SHL-016 | H5 | "Reset layout" and the version rule; the 1366 by 768 clipping check. |

**Not delivered by U2** (later milestones, or not owned by this milestone): SHL-001, SHL-002, SHL-006, SHL-007 (U0, merged), SHL-010 and SHL-014 (U1, merged); the Plant activity of SHL-005 and the Guide view of SHL-008 (U3); the "selected plant part" and "connected board" rows of SHL-009 (the plant part is PLS-005, U3; the board row exists today in `IDE/src/components/WorkbenchInspector.tsx:80-84`); FND-001's "parts" (U3) and FND-005's plant map (U3, PLS-006); the Plant group of the navigator (PLS-011, U3); the Guide's use of the shared result component (GDE-004 and GDE-005, U3; U2 delivers the component, TST-008); `IDE/DESIGN.md` and `IDE/PRODUCT.md` rewrite and the regenerated screenshots (section 8.2 item 6, U3: U2 updates only the documentation pages of the behaviour it changes, in both languages, and lists the stale screenshots); the first-use sessions (GDE-013); PLS-001 to PLS-013 (U0, U1, U3); rename across files (spec 4.5 out of scope for FND).

## Contract extensions (types and rules; lanes code against these, never against each other)
Task X0b writes the declarations of C-X (ids and catalogs) and creates the empty module files of C-R, C-T, C-P and C-V with only their exported types, so that every wave 2 task compiles against them. Changing one after X0b needs the parent: other lanes depend on it.

**C-X. New command ids (24)** (appended to `COMMANDS` in `IDE/src/commands/registry.ts` after the existing ones (about 56 at `bebc223b`, **Unconfirmed**: count them in `commands.test.ts`), never before: `IDE/src/commands/commands.test.ts:389` pins the first 38 in order; their titles go to `IDE/src/i18n/catalog/u2Commands.ts`). All have `enabled: open` unless stated. None is `physical` (question 3).

| Id | Category | Default shortcut | Bound by |
|---|---|---|---|
| `view.testResults` | view | none | T3 |
| `view.resetLayout` | view | none | H5 |
| `view.showInspector` | view | none | H3 |
| `file.closeProject` | file | none | H4 |
| `file.preferences` | file | `Mod+Comma` (enabled with no project open) | H2 |
| `build.runAllTests` | build | `Mod+Alt+T` | T4 |
| `build.runFailedTests` | build | none | T4 |
| `build.runTestAtCursor` | build | none | T4 |
| `build.newTest` | build | none | T4 |
| `build.checkInterlocks` | build | none | T4 |
| `edit.goToDefinition` | edit | `F12` | R4 |
| `edit.findAllReferences` | edit | `Shift+F12` | R4 |
| `edit.goBack` | edit | `Alt+Left` | P3 |
| `edit.goForward` | edit | `Alt+Right` | P3 |
| `project.newProgram`, `project.newFunctionBlock`, `project.newFunction`, `project.newDataType`, `project.newGlobals`, `project.newTask` | project | none | H4 |
| `project.rename`, `project.moveFile`, `project.duplicate`, `project.delete` (the project tree's item menu, IDE-004, so that FND-002 holds for it) | project | none | H4 |

`view.tests` keeps its id and now means "show the Tests activity" (T2 changes its handler; today it also shows the tab, `IDE/src/commands/useCommandHost.ts:102`). `view.agent` keeps its id and shows the Assistant view (H3). `view.changes` keeps its id and opens the review document (H1). `view.interlocks` keeps its id and shows the interlock view of the Tests activity (T4). The existing ids `view.themeLight`, `view.themeDark`, `view.themeHighContrast`, `view.themeSystem` stay (SHL-012 "plus their commands"). The registry's `edit` category exists (`registry.ts:15`) and holds no command today, so whether the application menu shows an Edit menu with only these items, and how `IDE/electron/appMenu.ts` builds it, is **Unconfirmed**: X0b reads `appMenu.ts` and `commands.test.ts:134-183` first and adjusts the menu test only where it froze the empty Edit menu (VF-006, listed in the commit body).

Shortcut rationale (Plan choice, the spec leaves them to the plan): `F12` and `Shift+F12` are the keys Monaco uses for definition and references, so the command and the editor agree; `Alt+Left` and `Alt+Right` are the usual back and forward. Inside a text field the registry's keys do not run (`useCommandHost.ts:22-24` lets only the palette and the shortcut reference through), and Monaco's input is a text area, so in a Structured Text editor Monaco's own `F12` and `Shift+F12` act and the commands reach it through its actions (Task R4, Unconfirmed: whether a Monaco action registered with the same keybinding replaces the built-in one).

**C-R. Reference index** (`IDE/src/refs/contracts.ts`):
```ts
/** Where a name or an address is written. A diagram has no text position: its places are elements (LNG-003). */
export type Place =
  | { kind: 'text'; file: string; line: number; column: number; length: number }
  | { kind: 'element'; file: string; element: SourceElementId; field: string }   // element id of models/sourceElements.ts
  | { kind: 'table'; file: string; section: 'local' | 'inputs' | 'outputs'; name: string }   // a row of a diagram's variable table
  | { kind: 'config'; editor: ConfigEditorKind; row: string }                      // e.g. io.inputs[3]
  | { kind: 'watch'; path: string }                                               // a row of the watch table
  | { kind: 'scenario'; file: string; pointer: string };                          // JSON pointer into tests/*.scenario.json
export type OccurrenceRole = 'declaration' | 'write' | 'use' | 'binding';   // ST has no read/write split in the index: 'use'
export type Language = 'ST' | 'IL' | 'LD' | 'FBD' | 'SFC' | 'IO' | 'WATCH' | 'SCENARIO';
export interface Occurrence { language: Language; place: Place; role: OccurrenceRole; text: string }
/** What is looked up: a symbol of the project, or a point of the process image. */
export type RefTarget =
  | { kind: 'symbol'; scope: string; name: string }          // scope: the file path of the declaring program, diagram or block, or '' for a global
  | { kind: 'address'; address: NormalizedAddress };
export interface NormalizedAddress { area: 'I' | 'Q' | 'M'; byte: number; bit?: number; width: 1 | 8 | 16 | 32 | 64 }  // %IX0.0 and %I0.0 are one point; %IB0 is another (the byte that contains it)
export interface References { target: RefTarget; definition?: Occurrence; uses: Occurrence[]; truncated: boolean; broken: string[] }
export const REFERENCE_LIMITS = { occurrences: 500, perFile: 100 } as const;   // the same caps as SEARCH_LIMITS (projectSearch.ts:31)
```
**C-T. Project tests** (`IDE/src/projectTests/contracts.ts`):
```ts
export type TestStatus = 'notRun' | 'passed' | 'failed' | 'older';          // TST-001; 'older' is TST-005
export interface ProjectTest { path: string; id: string; expectations: Array<{ index: number; kind: string; atMs?: number }>; valid: boolean }
export interface TestRecord { path: string; status: TestStatus; presentation?: WorkspaceTestPresentation; compilerRunId: number; projectSession: number; at: number }
export interface TestFailure { path: string; index: number; kind: string; atMs?: number; checks: Array<{ signal: string; expected: boolean; observed?: boolean }> }  // from T1
```
**C-P. Palette providers** (`IDE/src/commands/paletteSources/contracts.ts`):
```ts
export interface PaletteItem { key: string; group: PaletteGroup; title: string; detail?: string; run: () => void }
export type PaletteGroup = 'commands' | 'files' | 'objects' | 'io' | 'editors' | 'lessons' | 'preferences' | 'scenes';
export interface PaletteProvider { group: PaletteGroup; titleKey: MessageKey; items: () => readonly PaletteItem[] }   // pure over a snapshot; no store import in a provider's own module
```
**C-V. Vocabulary** (`IDE/src/i18n/vocabulary.ts`): `VOCABULARY: Record<ConceptId, { en: string; es: string; replaces: readonly string[] }>` with the ten rows of MSG-001 (below), `IMPLEMENTATION_TERMS: readonly string[]` (MSG-002's list), `MAIN_PATH_PREFIXES: readonly string[]` (the catalog key prefixes that are main-path surfaces), `formatHash`, `formatSize`, `formatTime` (MSG-006).

**C-S. Selection store** (`IDE/src/shell/useSelection.ts`, created by X0b): `useSelection` with `element: { file: string; element: SourceElementId; names: readonly string[] } | null` (published by the Ladder, FBD and SFC editors, Task H3), `test: string | null` (published by the Tests activity, Task T2), `setElement`, `setTest`, `clear`. Read by the Inspector (H3), the reference commands (R4) and the Tests commands (T4).

**C-E. Additive engine fields (Task T1 only; gated by question 2).** `ScenarioAssertionResult` (`IDE/src/test-engine/index.ts:133-138`) gains optional `index: number` (position in `expectations`) and `checks?: Array<{ signal: string; expected: boolean; observed?: boolean }>`; `TestRunPreview.scenarios[].assertions[]` (`IDE/src/cli/toolApi.ts:106`) and `WorkspaceTestPreview` (`IDE/src/components/workspaceTestPresentation.ts:33`) carry them. Every existing key, order and value stays; the presentation's `onlyKeys` validators accept the new keys and still reject any other.

## Lanes and dependency graph
**KEEP** = survives a change of spec 013's draft status. Every U2 task is KEEP: none depends on a spec 012 gate.

| Lane | Task | Title | Depends on | Lane-owned surface (summary) |
|---|---|---|---|---|
| X | X0a | Console split, no behaviour change | A | `IDE/src/components/Console.tsx`, `IDE/src/components/console/*` |
| X | X0b | Contracts: ids, catalogs, empty modules, journey files | A | `IDE/src/commands/registry.ts`, catalogs `u2*`, `IDE/src/commands/bind/*`, `IDE/scripts/journeys013*` |
| R | R1 | FND-004 design; addresses, IL text, JSON places | A | `IDE/src/refs/{diagramText,ilText,addresses}.ts` |
| R | R1b | Text of Ladder, FBD and SFC documents | A | `IDE/src/refs/diagramText.ts` |
| R | R2 | Reference index: assembly, scopes, debug-map oracle | R1, R1b | `IDE/src/refs/{referenceIndex,sources}.ts` |
| R | R3 | Search across five languages (FND-003) | R1b, X0b | `IDE/src/shell/projectSearch.ts`, `SearchView.tsx` |
| R | R4 | Go to definition, find all references, their UI | R2, R3, X0b, H3 | `IDE/src/refs/ReferencesPanel.tsx`, `IDE/src/commands/bind/find.ts`, `SearchView.tsx` (second owner, later wave) |
| P | P1 | Command inventory and the `physical` flag (FND-002) | X0b, H1, H4 | `IDE/src/commands/*` (not `registry.ts`' new block), `Toolbar.tsx`, `useCommandHost.ts` |
| P | P2 | Palette finds eight kinds (FND-001) | X0b | `IDE/src/commands/CommandPalette.tsx`, `paletteSources/*` |
| P | P3 | Back and Forward; the place bar (FND-006, FND-007) | H2 | `IDE/src/store/useNavigationHistory.ts`, `IDE/src/components/PlaceBar.tsx` |
| T | T1 | Failure details in the test result (TST-003 data) | A (question 2) | `IDE/src/test-engine/index.ts`, `IDE/src/cli/toolApi.ts`, `workspaceTestPresentation.ts`, `learnLesson.ts` |
| T | T2 | Test list, results store, runner out of Console (TST-001, 002, 005) | X0a, X0b | `IDE/src/projectTests/*`, `IDE/src/shell/TestsView.tsx` |
| T | T3 | Test results tab: verdict, failures, Details, boundary badge (TST-003, 004, 008) | T1, T2, V1, R1 | `IDE/src/components/{TestResultsTab,TestVerdict,BoundaryBadge}.tsx` |
| T | T4 | Interlocks view, Replay, New test, test commands (TST-006, 007, 009, 010) | T2, T3, X0b | `IDE/src/shell/InterlocksView.tsx`, `IDE/src/commands/bind/tests.ts`, `IDE/src/projectTests/newTest.ts` |
| H | H1 | Changes become a review document (SHL-004) | X0a, X0b | `IDE/src/components/ReviewDocument.tsx`, `EditorGroup.tsx`, `EditorArea.tsx` |
| H | H2 | Preferences and Project settings documents (SHL-011, SHL-012) | X0b, H1, H3, P2 | `IDE/src/components/settings/*`, `EditorGroup.tsx` (second owner) |
| H | H3 | Assistant view and the Inspector (SHL-008, SHL-009) | X0a, X0b | `IDE/src/shell/Sidebars.tsx`, `WorkbenchInspector.tsx`, `components/AssistantView.tsx` |
| H | H4 | Creation from the navigator (SHL-013) | X0b | `IDE/src/navigator/*`, `IDE/src/project/newObject.ts`, `Sidebar.tsx` |
| H | H5 | Reset layout, version, 1366 clipping (SHL-015, SHL-016) | X0b | `IDE/src/store/useShellLayout.ts`, `WorkbenchShell.tsx`, `IDE/scripts/journeys013/u2-h5.ts` |
| H | H6 | The results panel cut to five tabs; old tab ids route (SHL-003, SHL-004) | H1, H3, T3, T4 | `IDE/src/components/Console.tsx`, `console/*`, `shell/surfaces.ts`, `shellRouting.ts`, `interfaceBudget.targets.json` |
| V | V1 | Vocabulary, per-surface guard, formatters (MSG-001, 002, 003, 006) | A | `IDE/src/i18n/vocabulary.ts`, `tools/ci/i18n-guard*.ts` |
| V | V2 | Words of the main path: toolbar, status, notices (MSG-001, 002) | V1 | `IDE/src/i18n/catalog/{toolbarMsg,statusText,notices,studio*}.ts` |
| V | V3 | Failure messages, two levels of Output, boundary sweep (MSG-003, 004, 005) | V1, V2, T3 | `IDE/src/i18n/catalog/{console,lab,learn}.ts`, `store/consoleEntries.ts`, `components/console/OutputTab.tsx` |
| D | D1 | Documentation in English and Spanish | all code tasks | `docs/docs/*`, `docs/i18n/es/*` pages of the behaviour changed |
| Q | Q1 | Budget targets, requirement coverage, journey and capture check | all | `IDE/scripts/interfaceBudget*`, `tools/ci/requirement-*`, `IDE/scripts/journeys013/u2-*.ts` |

**Graph.**
```
X0a -+-> T2 -+-> T3 -> T4 --+
X0b -+       |     ^        +-> H6 -> D1 -> Q1
     +-> H1 -> H2 -> P3     |
     +-> H3 -> R4 --------->+
     +-> H4 -> P1, H5, P2   |
R1, R1b -> R2 -> R4          |
R1b -> R3 -> R4              |
T1 ----------> T3            |
V1 --+-> V2 -> V3 (also T3)  |
```
**Parallel waves** (tasks of a wave have disjoint file surfaces and may run together; the parent merges at the end of each wave and runs the seam check):
1. **X0a, X0b, R1, R1b, V1, T1.**
2. **R2, R3, P2, T2, H1, H3, H4, H5, V2.** (Nine writers is the most the file surfaces allow; the parent may stagger them: none of the nine needs another's output.)
3. **R4, T3, H2, V3, P1.**
4. **T4, P3.**
5. **H6, D1.**
6. **Q1.**

**Shared files and who edits them** (a file with two owners is edited by the earlier wave first, and the later owner starts from the merged result):
- `IDE/src/commands/registry.ts`: only X0b (the 24 ids above) and P1 (an id the inventory proves missing, and the two `physical` flags, listed in P1's commit body); no other task edits it. A task that needs a command that is not declared asks the parent.
- `IDE/src/i18n/en.ts`, `es.ts`: only X0b (it imports the empty catalogs once). Each task adds keys only to the catalog file it owns: `u2Commands.ts` (X0b), `u2Tests.ts` (T2, then T3, then T4), `u2Find.ts` (P2, then P3), `u2Search.ts` (R3, then R4), `u2Review.ts` (H1), `u2Assistant.ts` (H3), `u2Navigator.ts` (H4), `u2Layout.ts` (H5), `u2Preferences.ts` (H2), `u2Panel.ts` (H6). `toolbarMsg.ts`, `statusText.ts`, `notices.ts`, `studio*.ts`, `workbench.ts`, `moduleText.ts`, `learnHome.ts` only V2; `console.ts`, `lab.ts`, `learn.ts`, `u2Words.ts` only V3 (T3 and T4 leave the old test keys in place and use `u2Tests`; V3 removes the keys nobody uses).
- `IDE/src/commands/bind/*.ts`: X0b creates the seven files; a task binds only in its own: `tests.ts` (T2, then T3, then T4), `find.ts` (R4, then P3), `review.ts` (H1), `assistant.ts` (H3, then H2 for the no-provider rule), `navigator.ts` (H4), `layout.ts` (H5), `preferences.ts` (H2). `useCommandHost.ts`: only X0b (mount) and P1.
- `IDE/src/components/Console.tsx`: X0a (split), V3 (the Output block), then H6 (the tab list); T2, T3, T4, H1, H3 never edit it, they own the files X0a creates.
- `IDE/src/components/EditorGroup.tsx` and `EditorArea.tsx`: H1 (wave 2), then H2 (wave 3), then P3 (wave 4), each starting from the merged result.
- `IDE/src/shell/SearchView.tsx`: R3 (wave 2), then R4 (wave 3).
- `IDE/src/shell/surfaces.ts`: only H6, which also rewrites `surfaces.test.ts`; the other tasks name their surfaces in their commit body for H6.
- `IDE/scripts/journeys013.ts` (the registration list): only X0b, which creates the empty files `scripts/journeys013/u2-<task>.ts` for every task that has a journey, so tasks never edit the list.
- `IDE/scripts/screen-reader-capture.ts`, `run-desktop-smoke.ts`, `smoke-studio-vertical.ts`: several tasks migrate them (Global Constraints); each edits only the step or helper it changes, and the parent resolves a textual conflict at the wave merge.
- `tools/ci/requirement-evidence.json`, `requirements-index.json`: only Q1.

## Global Constraints
The first block is the list of `plan-m2.md` (section "Global Constraints") **copied unchanged**. Read the note after it for what does not apply to U2.

- **Integration lessons of M1 (run logbook L9 to L46), now rules.**
  - **`git add` new files before the formatter.** `tools/ci/format.ts` sees only git-tracked files (L9): a writer that skips this ships an unformatted file that the CI then rejects. Run `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` then `--check` at the root, after `git add`.
  - **Text through `t()`.** No literal user-facing string in a component or a part. English is the catalogue in `as const`; Spanish uses the **neutral usted register** and the standard terms (`falla` for fault, `ciclo` for scan cycle, `tarima` for pallet); the product is named **"ZPLC"**, never "Studio" in a Spanish or English sentence that is not about the application shell (`tools/ci` has a product-name test that failed on "Studio" in M1, L11); new interface text says "Plant", never "Lab" (decision D-25 of spec 013). Part names and docs for parts live in the part definition (`names`, `doc`, `equations`), both languages, PRT-002.
  - **Lines at most 140 columns**; the `tools/ci` line-length test failed on M1 code (L11).
  - **Tests that import `useIDEStore`** call `stubProjectLoader()` first and then use dynamic imports (the `import.meta.glob` project loader and the store's initialisation order made `src/shell` tests fail when run alone, L26 and L27). Tests that touch the native runtime use **`itNative`** (rule VF-023: a new native-runtime test that does not use the guard failed the seam check, L28).
  - **`erasableSyntaxOnly`**: no parameter properties, no enums, no namespaces.
  - **React Compiler lint**: no mutation of props or state in render, no ref reads during render, components select the store fields they show (`bun run lint` in `IDE/` fails with warnings as errors).
  - **A fresh worktree needs** `bun install`, `bun run build:compiler`, `bun run build:runtime` before the native-runtime tests and the journeys.
  - **Journeys** need `ZPLC_NATIVE_SIM_BIN` exported **in the same command**, pointing at the worktree's own runtime binary (`<worktree>/firmware/lib/zplc_core/build/zplc_runtime`, the path the lesson tests probe; **Unconfirmed**, confirm with `ls`): a journey that finds the main checkout's stale binary fails with "Request denied" (L16, L24). `bun run smoke:journeys` in `IDE/`.
  - A finding is a finding: **do not change a threshold or a test to make a check pass**; report it.
- **Verification commands (per task, in this order).** In `IDE/`: `bun test <the task's test paths>`, `bunx tsc -b`, `bun run lint`. At the root, once at the end of the task: `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --check`, `bun test ./tools/ci` (the ci tooling suite, including the line-length and product-name tests), `bun tools/ci/requirement-coverage.ts --check`. A task that touches docs also runs `bun test tools/docs` (needs the runtime built). The parent runs the full IDE suite (`bun test` in `IDE/`) at each wave merge.
- **Determinism.** No `Date`, `Math.random`, `performance.now`, unordered iteration, or `Math` beyond `abs`, `min`, `max`, `round`, `floor`, `fround` in `IDE/src/plant/core/**` and `scaling.ts`; process models use `+ - * /` and `detSqrt` only. A seeded generator only where randomness is a feature (M2 has none).
- **Security posture and dependencies.** Unchanged: sandboxed renderer, content security policy as is, no remote asset, **no new dependency** (`AGENTS.md` guideline 6). M2 touches no file under `IDE/electron/` and no C.
- **No physical operations.** Nothing here flashes, deploys, opens a serial port, forces I/O on a board or starts plant I/O mode. The only "force" in M2 is the simulated runtime's force-aware memory write, exercised headless in N9 (LNK-009, constitution rule 9).
- **Tests through public interfaces**, with the requirement ID first in the test name (`it('PLT-009 a filling tank follows the documented equation', ...)`). Each test asserts every observable effect of its rule. When a task changes an existing helper or option, add one test that its previous behaviour still holds.
- **Structural rules.** Modules at most 1600 lines (`tools/ci/ide-structure.ts`), no import cycle, no store import from a component's non-component module, no whole-store subscription; UI uses the Studio kit (`IDE/src/ui`, UX-002) and `RangeField` for a slider.
- **Docs.** Every new part, option, message and page ships in English (`docs/docs/`) and Spanish (`docs/i18n/es/docusaurus-plugin-content-docs/current/`) in the same commit series, and claims only measured facts (CRS-013). No frame-rate, latency or hardware claim is made for numeric signals.
- **Commits.** Conventional Commits, **no AI attribution and no Co-Authored-By line**, work-unit commits with tests and docs alongside the behaviour. About 400 changed lines per task is a heuristic, not a cap. Pushing, merging and opening a pull request are the owner's.
- **Shell.** `bat`, `rg`, `fd`, `eza`; not `cat`, `grep`, `find`, `ls`. No CodeGraph or prowl on this branch (stale index).

**Reading note for U2.** Bullets about the plant core (**Determinism**, the trace hash, `exchangeScan`, "M2 touches no file under `IDE/electron/` and no C", numeric signals in **Docs**) do not apply: U2 has no plant-core task. **U2 does touch the Tool API** (`IDE/src/cli/toolApi.ts`, Task T1, which feeds the command-line tool and the MCP server) and may touch `IDE/electron/appMenu.ts` (Task X0b, Unconfirmed). Pull requests and pushes remain the owner's.

**Lessons added for U2 (from the run logbook and the overnight work, now rules).**
- **`/tmp` may be out of inodes** (L59: a tmpfs at 99% of its inodes). Run every command of this plan with `export TMPDIR=$HOME/.cache/zplc-tmp`, and put scratch folders under it (`mktemp -d` honours it).
- **A fresh worktree needs the Electron binary and the compiled main process before the journeys and the screen-reader capture** (L75): `node install.js` in `packages/zplc-ide/node_modules/electron`, then `bun run electron:compile` in `IDE/`, then `ZPLC_NATIVE_SIM_BIN=<worktree runtime binary> bun run smoke:journeys` as in the M2 constraints. The capture is `bun run scripts/screen-reader-capture.ts [--language en|es]` (`IDE/scripts/screen-reader-capture.ts:8`).
- **Monaco traps Tab.** In a Structured Text or Instruction List editor, Tab inserts an indent and does not leave the editor; `Ctrl+M` toggles that first (L73, L75). A journey or a capture step that moves the focus out of the editor with Tab fails for that reason, not because of the product.
- **A test that asserts a store precondition sets it itself with `patchStore`** (L79: `PlantPanel` "SCN-001 any shipped scene opens from the chooser" failed only in the whole-suite run, because `loadedFiles` was inherited from another file). Never rely on the state another test file leaves in `useIDEStore`.
- **Migrate the screen-reader capture and the smokes in the same task that changes a keyboard path.** `IDE/scripts/screen-reader-capture.ts`, `IDE/scripts/run-desktop-smoke.ts`, `IDE/scripts/smoke-studio-vertical.ts` and `tools/docs/capture-screenshots.ts` name the controls U2 moves (`console-tab-tests`, `console-tab-interlocks`, `console-tab-changes`, `console-tab-agent`, `data-tests-view`, "Run host scenarios"; found with `rg`, **Unconfirmed** list). A task that moves or renames one of them updates every script that names it before it commits (L47, L55, L58, L75: the migration after the fact cost a writer each time).
- **Every new component needs a DOM render test and an entry in `tools/ci/dom-render-surfaces.json`**, and a module may not grow past 1600 formatted lines (`tools/ci/ide-structure.ts:42`; `Console.tsx` is 1524 and `toolApi.ts` is above its ratchet, see Finding 2). Run `bun test ./tools/ci` before the task commit.
- **The i18n offenders list only shrinks** (`tools/ci/i18n-offenders.json`; `bun tools/ci/i18n-guard.ts --write` ratchets it). A task never adds an entry.
- **Journey registration is the parent's.** A task writes its journeys in its own `IDE/scripts/journeys013/u2-<task>.ts` (created empty by X0b) and never edits `journeys013.ts`.
- **A lingering notice swallows clicks** (L47): a journey that clicks in the editor or the results panel dismisses notices first (the existing helper in `IDE/scripts/journeyApp.ts` is **Unconfirmed**; confirm its name). Do not "fix" it in U2: Finding 7.
- **Physical operations stay human** (`AGENTS.md`, guideline 8: "AI and MCP must not initiate flash, deploy, force, RUN/STOP, raw serial, or shell actions"). A new command is run by a person through the registry; `AI_COMMAND_PROPOSALS` (`IDE/src/ai/proposals.ts:12`) is not extended, and the restricted AI and MCP regression of 2.0 passes unchanged. A command that touches a device or the running program keeps `physical: true` (`registry.ts:51`). No U2 task flashes, deploys, opens a serial port or runs a program on a board.

## Review Focus (conditions the spec implies; each has a test in the task that owns it)
1. A name resolves by the same scope rules as `ProjectIndex`: a variable local to one program is not a use of a same-named variable of another program or of a global; a diagram resolves a name against its own variable tables first, then the project's globals (R1, R2).
2. One I/O point has one identity however it is written: `%IX0.0` and `%I0.0` are the same point, `%IB0` is the byte that contains it and is a different point (overlap is not a match in U2), `%IW0` is not `%IX0.0`, an output is not an input (R1).
3. Search and references never read what the build does not read and never miss an open buffer: unsaved text of an open file wins over the disk, as `readSearchableFiles` does (`projectSearch.ts:77-99`) (R2, R3).
4. The language service keeps working while typing: references and search run on demand, never on the keystroke path; a 400-file project is the cap (`MAX_FILES`, `store/projectSources.ts:34`) and results stop at `REFERENCE_LIMITS` with `truncated` set (R2, R3).
5. No surface is lost: every 2.0 surface of spec section 7 is still reachable by a command, the palette and the View menu, and a stored `lab`, `interlocks`, `changes` or `agent` tab id opens its new place (H1, H3, T4, H6).
6. The evidence record is complete behind "Details": every field of the 2.0 view (artifacts, hashes, the link to the build, the saved inputs, the recorded trace) is there, and a passed run states its boundary once (T3, V3).
7. The Tool API result keeps every existing key and value, byte for byte, for a run that has no failure; the new fields are optional and the CLI/MCP cross-surface test of IDE-031 passes unchanged (T1).
8. A session or layout of 2.0 opens: an unknown activity, tab or version falls back field by field to the defaults and never to an error (H5, H6).
9. Every new string is in both catalogs, in the vocabulary of MSG-001, in the neutral usted register, with no implementation term on a main-path key (V1 to V3, and every task that adds text).
10. A failed or refused action says what to do and offers the action (MSG-004); no new message is only a line of Output (FLW-004 is kept).
11. Nothing new is reachable by AI or MCP and no new command is `physical` without a gate (Global Constraints, last lesson).
12. Keyboard: every new surface is reachable and operable without a pointer, and the screen-reader capture passes in both languages after the tasks that change a keyboard path (X0b to H6).

---

### Task X0a: Console split, no behaviour change
**Spec:** IDE-014 (modules stay under the size limit), section 5.3 (the surfaces that leave the panel need files of their own). **Lane X. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/components/Console.tsx
IDE/src/components/console/TestsTab.tsx
IDE/src/components/console/InterlocksTab.tsx
IDE/src/components/console/ChangesTab.tsx
IDE/src/components/console/AgentTab.tsx
IDE/src/components/console/useWorkspaceTestRunner.ts
IDE/src/components/console/split.test.ts
IDE/src/components/Console.dom.test.tsx
IDE/src/components/Console.tabNavigation.test.ts
IDE/src/components/ConsoleChangesTrace.dom.test.tsx
tools/ci/dom-render-surfaces.json
```
(The three existing tests are edited for imports only, if at all.)

**Interfaces.** `Console.tsx` is 1524 lines. The test runner state and handlers are inline in the component: `registerWorkspaceManifest` (`Console.tsx:307`), `saveWorkspaceProject` (`:330`), `runWorkspaceTests` (`:357`), `runWorkspaceSafetyCheck` (`:406`), cancel, and the local state that holds the last presentation (`workspaceTestState`, `workspaceSafetyState`). The blocks are the Tests tab (`:946-1062`), Interlocks (`:1063-1073`), Changes (`:1074-1170`), Agent (`:1171-1446`). Output, Problems, Trace, Terminal and Watch stay (`:911`, `:932`, `:1447`, `:1517`, `:1519`). The shared `usePublishWorkspaceTestResult` (`IDE/src/shell/workspaceTestResult.ts:17`) is how `PlantDocument.tsx:34` and the lesson read the last result; keep calling it from the hook.
Move each block to its file as a component that takes the props it used (no store reads added), and move the runner state and handlers to `useWorkspaceTestRunner()` verbatim. Nothing else changes: same markup, same keys, same `data-*` attributes, same order of the tab list.

- [ ] **Step 1: Baseline.** `bun test src/components src/shell src/learn` and `bunx tsc -b`. Record the counts.
- [ ] **Step 2: Failing tests.** `split.test.ts`: `'IDE-014 the Tests, Interlocks, Changes and Agent panels are modules of their own'` (imports the four components and the hook); `'IDE-014 Console.tsx is at most 1100 lines after the split'` (reads the file, counts lines).
- [ ] **Step 3: Run** `bun test src/components/console/split.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the move. Add the four components to `tools/ci/dom-render-surfaces.json` with the existing Console test as their test (they render inside it).
- [ ] **Step 5: Verify.** `bun test src/components src/shell src/learn src/plant`, `bunx tsc -b`, `bun run lint`; root: `bun test ./tools/ci`. Every test that passed passes unchanged.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/components packages/zplc-ide/src/components/console tools/ci/dom-render-surfaces.json
git commit -m "refactor(ide): split the Tests, Interlocks, Changes and Agent panels out of Console"
```
**Risk:** item 6 (a move with no new behaviour; the existing Console tests are the guard). No high-risk item. The line counts of the moved blocks may exceed the 400-line heuristic: a move is not authored change.

---

### Task X0b: Contracts, command ids, catalogs, empty modules, journey files
**Spec:** FND-002 (every surface and action a registered command), UX-015. **Lane X. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/commands/registry.ts
IDE/src/commands/commands.test.ts
IDE/src/commands/useCommandHost.ts
IDE/src/commands/bind/index.ts
IDE/src/commands/bind/tests.ts
IDE/src/commands/bind/find.ts
IDE/src/commands/bind/review.ts
IDE/src/commands/bind/assistant.ts
IDE/src/commands/bind/navigator.ts
IDE/src/commands/bind/layout.ts
IDE/src/commands/bind/preferences.ts
IDE/src/i18n/en.ts
IDE/src/i18n/es.ts
IDE/src/i18n/catalog/u2Commands.ts
IDE/src/i18n/catalog/u2Tests.ts
IDE/src/i18n/catalog/u2Find.ts
IDE/src/i18n/catalog/u2Search.ts
IDE/src/i18n/catalog/u2Review.ts
IDE/src/i18n/catalog/u2Assistant.ts
IDE/src/i18n/catalog/u2Navigator.ts
IDE/src/i18n/catalog/u2Layout.ts
IDE/src/i18n/catalog/u2Preferences.ts
IDE/src/i18n/catalog/u2Panel.ts
IDE/src/refs/contracts.ts
IDE/src/projectTests/contracts.ts
IDE/src/commands/paletteSources/contracts.ts
IDE/src/i18n/vocabulary.ts
IDE/src/shell/useSelection.ts
IDE/src/shell/useSelection.test.ts
IDE/scripts/journeys013.ts
IDE/scripts/journeys013/u2-r4.ts
IDE/scripts/journeys013/u2-t2.ts
IDE/scripts/journeys013/u2-t3.ts
IDE/scripts/journeys013/u2-t4.ts
IDE/scripts/journeys013/u2-h1.ts
IDE/scripts/journeys013/u2-h2.ts
IDE/scripts/journeys013/u2-h3.ts
IDE/scripts/journeys013/u2-h4.ts
IDE/scripts/journeys013/u2-h5.ts
IDE/scripts/journeys013/u2-h6.ts
IDE/scripts/journeys013/u2-p1.ts
IDE/scripts/journeys013/u2-p2.ts
IDE/scripts/journeys013/u2-p3.ts
IDE/scripts/journeys013/u2-r3.ts
IDE/scripts/journeys013/u2-v3.ts
IDE/scripts/journeys013/u2-q1.ts
IDE/electron/appMenu.ts
IDE/electron/appMenu.test.ts
```
(`appMenu.ts` and its test are edited only if the Edit menu is built from roles and the empty-category assumption must change: **Unconfirmed**, read them first. The empty journey files each export `export const journeysU2<Id>: Journey[] = [];` and `journeys013.ts` spreads them, as W0 did for lane W.)

**Interfaces.**
- `COMMANDS` (`registry.ts:61-`) ends with `help.learn`; append the 24 ids of C-X after the lane W block, titles in `u2Commands.ts` (English `as const`, Spanish typed as `Record<keyof typeof u2CommandsEn, string>`, as `IDE/src/i18n/catalog/studioCommands.ts:19`). The three category rules: `build` for tests, `edit` for the four navigation commands, `project` for the six "New". Each `enabled` is `open` (`registry.ts:56`) except `file.preferences` (always) and `edit.goBack` and `edit.goForward` (always); `project.rename`, `project.moveFile`, `project.duplicate` and `project.delete` act on the project tree's current item and are enabled with a project open.
- Move the four bindings `view.tests`, `view.interlocks`, `view.changes`, `view.agent` out of `useShellCommands` (`useCommandHost.ts:102-111`) into `bind/tests.ts` (`view.tests`, `view.interlocks`), `bind/review.ts` (`view.changes`) and `bind/assistant.ts` (`view.agent`), **with today's handlers unchanged**, so that later tasks change a handler in their own file. `bind/index.ts` exports `useU2Commands()` that calls the seven hooks `useTestCommands`, `useFindCommands`, `useReviewCommands`, `useAssistantCommands`, `useNavigatorCommands`, `useLayoutCommands`, `usePreferencesCommands`; `useShellCommands` calls it once. Each of the seven files exports its hook with an empty `bindCommands({})` where it has nothing yet.
- Types only: the declarations of C-R, C-T, C-P, C-V in their files (no function bodies; `vocabulary.ts` also holds the ten rows of MSG-001 as data, below).
- `IDE/src/shell/useSelection.ts` (C-S): a Zustand store `useSelection` with `element: { file: string; element: SourceElementId; names: readonly string[] } | null`, `test: string | null`, `setElement`, `setTest`, `clear`. It is the one place the Inspector (H3), the references commands (R4) and the Tests activity (T2) read the current selection; the visual editors publish into it (H3).
- MSG-001, quoted: the vocabulary below "MUST be the single wording of these concepts in the interface, in English and Spanish, defined once and used by every surface (P10)". `VOCABULARY` holds exactly: `project` Project/Proyecto (replaces workspace, saved workspace); `simulation` Simulation/Simulación (simulator session, native runtime, host, Local POSIX); `board` Board/Placa (hardware, device, controller); `target` Target/Destino (mode); `build` Build/Compilar (compile, canonical build); `deploy` Deploy/Desplegar (upload, load); `test` Test/Prueba (scenario, host scenario, workspace test; the file format keeps "scenario"); `check` Check/Comprobar (scenario verified, lesson evidence); `plant` Plant/Planta (lab); `resultSimulation` Simulation result/Resultado en simulación and `resultBoard` Board result/Resultado en placa (host evidence only; not hardware or HIL evidence). The Spanish column "follows the words the 2.0 catalogue already uses where it has one (design default)": V1 reconciles each word with the 2.0 catalogue.

- [ ] **Step 1: Baseline.** `bun test src/commands src/shell src/i18n` and `bunx tsc -b`; read `electron/appMenu.ts` and `commands.test.ts:134-183`.
- [ ] **Step 2: Failing tests.** In `commands.test.ts`: `'FND-002 every id of the U2 contract is registered with a title in English and Spanish'`; `'UX-015 keeps the commands of 2.0 and of lane W, in their order, ahead of the U2 ones'` (extends the test at `:389`); `'UX-014 lists every U2 command in the menu of its category once'`; `'UX-015 gives the new shortcuts no clash'` (the existing clash test at `:41` already runs over all, assert it still passes with `F12`, `Shift+F12`, `Alt+Left`, `Alt+Right`, `Mod+Alt+T`, `Mod+Comma`); `'UX-015 no U2 command is physical'` (the list at `:111` is unchanged, see question 3). `useSelection.test.ts`: `'SHL-009 the selection store holds one element and one test and clears both'`.
- [ ] **Step 3: Run** `bun test src/commands src/shell/useSelection.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Verify.** `bun test src/commands src/i18n src/shell`, `bunx tsc -b`, `bun run lint`; root `bun test ./tools/ci`. The menu test is edited only where it froze an empty Edit menu (VF-006), and the commit body says so.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts packages/zplc-ide/electron
git commit -m "feat(ide): declare the U2 commands, catalogs, selection store and the lane contracts"
```
**Risk:** item 3 (the registry is consumed by the main process, which builds the application menu from it, `IDE/src/commands/menuEntry.ts`, and by the shortcut reference: an id added is public to them), item 5 (`appMenu.ts` if it changes). The menu and clash tests are the guard. Independent verifier at feature end.

---

### Task R1: FND-004 design; addresses, Instruction List text, JSON places
**Spec:** FND-004, FND-003 (the part about Instruction List), FND-005 (scenarios). **Lane R. Wave 1. KEEP.** This is the first task of the plan, as spec 013 asks ("its design is the first task of the plan for U2"): the design is the next section; the task builds the pure parts of it that do not depend on a diagram model.

#### Design of FND-004 (find references and search over the project)
**What the requirement asks.** "Go to definition" and "Find all references" for a variable, a function block instance and an I/O address, from every editor, listing uses in the five languages and in the I/O mapping. Search (FND-003) covers the five languages and opens a match in a diagram "with the element selected, as Problems do today".

**What exists (verified in code).**
1. Structured Text has a full symbol index, `ProjectIndex` (`IDE/src/langsvc/projectIndex.ts:73`): symbols, scopes (`localsVisibleFrom`, `:161`), `referenceAt(file, line, column)` (`:234`), `referencesTo(id, includeDeclaration)` (`:242`), and Monaco providers for definition and references (`IDE/src/langsvc/monacoProviders.ts:229`, `:246`). It reads the files the project tracker read (`IDE/src/store/projectSources.ts`, `ProjectSource.language` is hard-coded `'ST'` at `:48-53`, capped at 400 files, re-read 250 ms after typing stops) with the open buffer in place (`indexWithBuffer`, `IDE/src/langsvc/session.ts:45`).
2. A diagram is JSON: `LDModel` (`IDE/src/models/ldTypes.ts:233`: `variables.{local,inputs,outputs}` of `{name,type,address,comment}`, rungs whose cells hold elements with `variable`, `instance`, `parameters`, `outputs`, `operands`, `output`), `FBDModel` (`IDE/src/models/fbd.ts:160`), `SFCModel` (`IDE/src/models/sfc.ts:156`). Every element has an id of the forms in `IDE/src/models/sourceElements.ts:5-21` (`rung:`, `block:`, `step:`, `transition:`, ...), and a Problems entry selects it with `requestElementSelection(file, element)` (`IDE/src/editors/elementSelectionRequests.ts:23`, used at `Console.tsx:253`).
3. The build's debug map (`COMPILER/compiler/debug-map.ts:203`) lists for each POU its `vars` (`addr`, `region`, `bitOffset`, `declarationLine`, `:51-78`) and, for a visual program, `monitor` entries `{ element, role, variable }` (`:158-166`) that bind an element to the variable the build resolved. It exists only after a build and is stale after an edit.
4. Today's search reads only `ST` and `IL` files as text (`SEARCHABLE_LANGUAGES`, `IDE/src/shell/projectSearch.ts:33`); a variable used in a rung is not found.

**The design (Plan choices).**
1. **Reference source of truth is the text and the models, not the build.** Search and references must work on unsaved edits and with no build, and must not go stale. The debug map is used in three bounded ways: (a) **an oracle in tests**: for each bundled visual project the test builds it and asserts that every `monitor` entry's `(element, variable)` is an occurrence the walker produced (Task R2 owns that test), which proves the walker finds what the build binds; (b) **the resolved address of a symbol** in the header of a result, when a current build exists (`IDE/src/runtime/ioMap.ts`, `listIoMap`, `outputAddressLabel`), marked "older than the sources" when the build is stale; (c) nothing else. A result never depends on it.
2. **Occurrences, not line matches.** Each language contributes `Occurrence`s (contract C-R): `text` places for ST and IL (line, column, length), `element` places for LD, FBD and SFC (an element id and the field that holds the name: `variable`, `instance`, `parameters.IN`, `condition`, `comment`...), a `table` place for a row of a variable table (Plan choice: add `{ kind: 'table'; file; section: 'local' | 'inputs' | 'outputs'; name }` to `Place`, because a table row has no element id), `config` places for a row of `zplc.json` `io.inputs`, `io.outputs`, `io.virtual` (`IDE/src/types/index.ts:301-370`), `watch` for a Watch table row, `scenario` for a JSON pointer in `tests/*.scenario.json`.
3. **Names in expressions are tokens, not substrings.** Every expression field (a condition, an operand, an ST action body, a constant) is tokenised with the compiler's `tokenizeWithErrors` (as `projectIndex.ts:17` does); an identifier token that is not a keyword is a name; a chain `Inst.Q` is the name `Inst` plus a member. "Start" never matches "StartLamp" (Review Focus 1).
4. **Scope.** A symbol key's scope is opaque and produced by the index: `''` for a project global or a top-level object, the file path for a diagram (a diagram is one program, `IDE/src/navigator/navigatorGroups.ts:104-117` names it after its file), `<file>#<POU>` for the local of an ST or IL POU. A name written in a diagram resolves to its variable tables first (`declaredSymbols`, `IDE/src/editors/symbols.ts:29`: inputs, outputs, locals; case-insensitive, as `upper()` in `projectIndex.ts:66`), then to the project's globals (`ProjectIndex.globalSymbols()`, `:132`). A name that resolves to nothing is not a reference (search still finds it as text).
5. **I/O addresses are normalised.** The same point is written `%IX0.0` in a Structured Text `AT` clause and `%I0.0` in `zplc.json` (`IDE/src/types/index.ts:303` documents `"%I0.0", "%Q0.0", "%IW0", "%QW0"`). `NormalizedAddress` (C-R) is `{ area: 'I' | 'Q' | 'M', byte, bit?, width }`; the number of `W`, `D`, `L` addresses is an index in units of the width (as `outputAddressLabel` writes, `IDE/src/runtime/ioMap.ts:58-64`), so `%IW1` is byte 2, width 16. Two addresses are the same point when `area`, `byte`, `bit` and `width` are equal. `%IB0` is the byte that contains bit `%IX0.0` and is a **different** point: overlap is not a match in U2 (Plan choice, the simplest rule that never lists a wrong use; recorded in Findings). The occurrences of an address are: `AT` clauses (ST, IL), `address` fields of a diagram's variable table, `zplc.json` `io.*` rows, and the plant map where it is a project file (U3).
6. **Definition.** The first occurrence by priority: an ST declaration, then a diagram variable-table row, then a `zplc.json` row (for an address). A name with none says so ("`X` is not declared in this project") and offers nothing to open.
7. **The cursor.** Monaco gives a position, resolved by `ProjectIndex.referenceAt` (ST) or by the identifier token under the cursor (IL). A diagram has no cursor: the editor publishes its selected element into the selection store (C-S, Task H3), and the element yields zero names (nothing to look up: a message), one (it is the target) or several (a small menu chooses; Plan choice). The I/O mapping editor's row yields its address; a Watch table row yields its variable path.
8. **Surface.** Results do not become a new results tab (the panel is at five). They are a "References" mode of the Search sidebar (question 1): the same list control as search, grouped by file, each row with the language, the place in words (`LD rung 2, cell 0,3` from `describeElement`, `sourceElements.ts:119`) and a role mark (declaration, write, use, binding). Choosing a row opens the place: a text place by `navigateToCompilerDiagnostic(file, line, column)` (`IDE/src/store/useIDEStore.ts:794`), an element by `requestElementSelection` then the same navigation, a config row by `openConfigEditorFromNavigator` (`IDE/src/navigator/openConfigEditor.ts`), a scenario by its JSON pointer (Task R1's `locateJsonPointer`).
9. **Limits and cost.** Built on demand (a command or a search), never per keystroke; cached by the identity of the input strings, so a second query on the same project is free; capped at `REFERENCE_LIMITS` (500 occurrences, 100 per file, the numbers of `SEARCH_LIMITS`, `projectSearch.ts:31`) with `truncated` shown; at most 400 files (`MAX_FILES`). The editor-latency budget of PLT-015 is unaffected because no work runs on the keystroke path; the executor measures the largest bundled project and records the time in the commit body (no threshold is invented here).
10. **Not designed:** rename across files (spec 4.5), read versus write for ST (the index does not separate them: `'use'`), references in the firmware C sources, overlap of addresses.

**Allowed edit surfaces**
```
IDE/src/refs/contracts.ts
IDE/src/refs/addresses.ts
IDE/src/refs/addresses.test.ts
IDE/src/refs/ilText.ts
IDE/src/refs/ilText.test.ts
IDE/src/refs/jsonPlace.ts
IDE/src/refs/jsonPlace.test.ts
```
(`contracts.ts` is created by X0b with the types; R1 adds the `table` place and the `Language` set if X0b's differs, and nothing else.)

**Interfaces.** `parseAddress(text): NormalizedAddress | undefined`, `sameAddress(a, b)`, `canonicalAddress(a)` (the `%IX0.0` form; renamed from `addressText` because the i18n guard reads a `*Text` function as user words); `ilOccurrences(file, content): Occurrence[]` (declarations from the `VAR` sections of an IL file as `IDE/projects/blinky_il/src/main.il` writes them, including `AT %Q0.0`, and the operand identifiers of each instruction line with the element id `line:N` from `ilLineElement`, `sourceElements.ts:51`; a comment `(* ... *)` and `;` text is skipped); `locateJsonPointer(text, pointer): { line: number; column: number } | undefined` (the position of the value a JSON pointer such as `/expectations/3` names, in the text as written, for the scenario link of T3 and the scenario place of R2).

- [ ] **Step 1: Baseline.** `bun test src/langsvc src/shell src/runtime/ioMap.test.ts` green.
- [ ] **Step 2: Failing tests.** `addresses.test.ts`: `'FND-004 %IX0.0 and %I0.0 are the same point'`; `'FND-004 %IW1 is byte 2 of the input image and not %IX1.0'`; `'FND-004 an output is not an input and %IB0 is not %IX0.0'`; `'FND-004 a malformed address is refused'` (`%X0`, `%I`, `%IW-1`, empty). `ilText.test.ts`: `'FND-004 an IL operand is a reference and a comment is not'`; `'FND-004 an IL declaration with AT is a declaration occurrence with its address'`; `'FND-003 an IL occurrence names its line element'`. `jsonPlace.test.ts`: `'FND-005 a JSON pointer into expectations gives the line of that object'` and `'FND-005 a pointer that is not in the text gives nothing'`.
- [ ] **Step 3: Run** `bun test src/refs`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement** (no dependency; `JSON.parse` is not enough for positions, so scan the text with a small tolerant tokenizer).
- [ ] **Step 5: Verify.** `bun test src/refs src/langsvc src/shell`, `bunx tsc -b`, `bun run lint`; root `bun tools/ci/format.ts --check` after `git add`.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/refs
git commit -m "feat(ide): reference addresses, Instruction List occurrences and JSON places for find and search"
```
**Risk:** none of the high-risk items (new pure modules with no consumer yet). The address rule is the one place a wrong decision would list a wrong use; its tests are the guard.

---

### Task R1b: Text of Ladder, FBD and SFC documents
**Spec:** FND-003 "the names, variables, comments and expressions of Ladder, FBD and SFC documents", FND-004. **Lane R. Wave 1. KEEP.** Depends on nothing but the models.

**Allowed edit surfaces**
```
IDE/src/refs/diagramText.ts
IDE/src/refs/diagramText.ld.test.ts
IDE/src/refs/diagramText.fbd.test.ts
IDE/src/refs/diagramText.sfc.test.ts
```

**Interfaces.** `diagramFields(file): DiagramField[]` with `DiagramField = { place: Place; field: string; kind: 'name' | 'variable' | 'comment' | 'expression'; text: string }` (the text of every field a person reads or searches; R3 searches it), and `diagramOccurrences(file: { path: string; language: 'LD' | 'FBD' | 'SFC'; content: string }): { occurrences: Occurrence[]; declared: ReadonlyMap<string, DeclaredVariable>; ok: boolean }` (the identifier tokens of those fields), built on the tolerant loaders of `IDE/src/models/visualFileLoad.ts` (the function that parses a stored model; exact name **Unconfirmed**, read the file) and the id builders of `models/sourceElements.ts:51-60` (`rungElement`, `cellElement`, `rungItemElement`, `blockElement`, `connectionElement`, `stepElement`, `transitionElement`, `actionElement`). It never throws: a document that does not parse gives `ok: false` and no occurrences (the file is listed in `broken`, as `ProjectIndex.broken`, `projectIndex.ts:80`).
Fields read (confirm each against the model files; **Unconfirmed** for FBD and SFC): LD `variables.*[].name|address|comment`, rung `comment`, element `variable`, `instance`, `fbType`, `parameters` (values), `outputs` (values), `functionName`, `operands`, `output`, `comment` (`ldTypes.ts:149-183`), in grid cells and in the legacy `elements`; FBD variable blocks' names, function block instance names, port-bound variables, constants, comments; SFC step names, transition conditions, action bodies (an action body is ST, IL, FBD or LD text: `ActionType`, `sfc.ts:125`, read with the same tokenizer), comments. Each text field yields occurrences per identifier token (design point 3); a coil, an `outputs` binding and a variable block feeding an input of the diagram are `write`, the rest `use`, a variable-table row is `declaration`; a field that holds only a literal yields none.

- [ ] **Step 1: Baseline.** `bun test src/models src/editors` green.
- [ ] **Step 2: Failing tests** (build the three documents in the test from the bundled projects `IDE/projects/blinky/src/main.ld.json`, `IDE/projects/batch_count_fbd/src/BatchCount.fbd.json` and one SFC project, **Unconfirmed** name: `fd -e sfc.json IDE/projects`): `'FND-003 a variable used in a rung is an occurrence of its contact with the cell element'`; `'FND-003 a variable used in an FBD block and in a SFC transition condition is found'`; `'FND-003 a comment is an occurrence of kind comment text and an identifier inside it is not a reference'`; `'FND-004 a coil is a write and a contact is a use'`; `'FND-004 a variable table row is a declaration with its address'`; `'FND-004 a document that does not parse gives no occurrences and ok false'`; `'FND-004 Start is not found inside StartLamp'`.
- [ ] **Step 3: Run** `bun test src/refs`. Expected: FAIL.
- [ ] **Step 4: Implement.** Keep each language in its own function; the module stays under 600 lines.
- [ ] **Step 5: Verify.** As R1.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/refs
git commit -m "feat(ide): read the names, variables, comments and expressions of Ladder, FBD and SFC documents"
```
**Risk:** none of the high-risk items (pure, new, no consumer yet). The loader's tolerance (a half-saved document) is the edge to test.

---

### Task V1: Vocabulary, per-surface guard, formatters
**Spec:** MSG-001, MSG-002, MSG-003, MSG-006. **Lane V. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/i18n/vocabulary.ts
IDE/src/i18n/vocabulary.test.ts
tools/ci/i18n-guard.ts
tools/ci/i18n-guard.test.ts
tools/ci/i18n-terms-offenders.json
```

**Interfaces.** MSG-002, quoted: "The command bar, the status rail, notices, the verdict of a test or check, the Guide and the normal level of Output MUST NOT use implementation terms: POSIX, native, host, canonical, workspace, link, adapter, artifact, bytecode, SHA-256, VM. Those terms stay allowed in a Details disclosure, the Inspector, the detailed level of Output, the Terminal and the documentation. The i18n guard MUST enforce this per surface." The guard today checks catalogs for voseo, exclamation marks, sentence case, missing keys and five internal terms (`tools/ci/i18n-guard.ts:518` `INTERNAL_TERMS`, `checkCatalogs` at `:544`). A scan of 2.0 found the terms in about 94 lines of `IDE/src/i18n/catalog/console.ts` and fewer in `moduleText.ts` (22), `toolbarMsg.ts` (11), `notices.ts` (8), `workbench.ts` (6), `statusText.ts` (4), `learnHome.ts` (4), `lab.ts` (4) (ripgrep count, 2026-11-13).
- `vocabulary.ts` gains the data (the rows of X0b), `IMPLEMENTATION_TERMS` in English and Spanish (`posix`, `native|nativo|nativa`, `host|anfitrión`, `canonical|canónic[oa]`, `workspace|espacio de trabajo`, `link|vincul\w*|enlace`, `adapter|adaptador`, `artifact|artefacto`, `bytecode|código de bytes`, `sha-256`, `vm|máquina virtual`; word boundaries, case-insensitive), `MAIN_PATH_PREFIXES` (Plan choice, derived from the keys the main-path surfaces use: `toolbar.`, `status.`, `studio.status`, `studio.flow`, `studio.notice`, `notice.`, `console.tests` and `u2Tests` keys outside a `.details.` segment, `learn.` keys of the lesson verdict, `testsView.`), and `DETAIL_SEGMENTS` (`.details.`, `.inspector.`, `.terminal.`, `.detail.`) that exempt a key. `formatHash(sha256): string` (first 8 hexadecimal digits and an ellipsis), `formatSize(bytes, locale): string` ("302 bytes", "1.2 KB" with `Intl.NumberFormat`), `formatTime(value, locale): string` (`Intl.DateTimeFormat`; a duration in ms as "1.5 s"), per MSG-006 ("a hash MUST be shown shortened with a copy action, a size with its unit and a time in the user's locale").
- `i18n-guard.ts` `checkCatalogs` gains `terms(english, spanish)`: for each key under `MAIN_PATH_PREFIXES` and not under a detail segment, a match of `IMPLEMENTATION_TERMS` in either language is a problem `MSG-002: ... uses the implementation term "..." on a main-path surface (implementation-term)`, **unless** the (key, language) pair is in `tools/ci/i18n-terms-offenders.json` (a new ratchet list in the shape of `i18n-offenders.json`, seeded by `--seed`, shrinking with `--write`, **never grown by hand**; V2 and V3 empty it). A second check, MSG-003: the boundary keys of `BOUNDARY_KEYS` (the two badge texts and their tooltips, defined here) may be referenced only from `IDE/src/components/BoundaryBadge.tsx`, and the three 2.0 keys that state the boundary (`console.hostEvidenceBadge`, `console.recordedDuringThisHost`, `console.nativePosixHostEvidence`; `IDE/src/components/WorkspaceTestResult.tsx:93`, `:172-174`) may be referenced by nothing once T3 merges (the check lists them as removable offenders until V3 deletes them).
- The vocabulary check is advisory in V1: `--list` prints, per surface, the catalog texts that use a word of a row's `replaces` column; it fails nothing (many of those words are right on another surface: "hardware" in the board track, "compile" in a Details line). Plan choice.

- [ ] **Step 1: Baseline.** `bun test ./tools/ci/i18n-guard.test.ts`, `bun tools/ci/i18n-guard.ts` ok.
- [ ] **Step 2: Failing tests.** `i18n-guard.test.ts`: `'MSG-002 a main-path English key with "POSIX" is a problem'`; `'MSG-002 the same term in the Spanish text of a main-path key is a problem'`; `'MSG-002 a key under a details segment may hold the term'`; `'MSG-002 a listed offender is tolerated and an unlisted one is not'`; `'MSG-003 a source file other than BoundaryBadge that references a boundary key is a problem'`. `vocabulary.test.ts`: `'MSG-001 the vocabulary has the ten concepts in both languages and no empty word'`; `'MSG-006 a hash is shortened, a size has its unit and a time follows the locale'` (English and Spanish); `'MSG-001 the Spanish vocabulary is in the neutral register of decision D-10'` (run `VOSEO_MARKERS` over it).
- [ ] **Step 3: Run** `bun test ./tools/ci/i18n-guard.test.ts` (root) and `bun test src/i18n/vocabulary.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement**, then run `bun tools/ci/i18n-guard.ts --seed-terms` (add the flag) once to write the offenders list; the commit body says how many (key, language) pairs it holds.
- [ ] **Step 5: Verify.** `bun test ./tools/ci`, `bun run lint` in `IDE/`.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/i18n tools/ci
git commit -m "feat(ci): one vocabulary and a per-surface check for implementation terms"
```
**Risk:** item 5 (CI tooling: a guard that is too wide blocks every later task; the offenders list exists to prevent that and only shrinks). The list is seeded from the repository, not written by hand.

---

### Task T1: Failure details in the test result
**Spec:** TST-003, quoted: "The Test results tab MUST open with the verdict in one sentence ("3 of 4 tests passed"), then the failed tests, each with the expectation that failed, its time, the expected and the observed value, and links to the scenario step and to that time in Trace (as LRN-026 asks of a lesson). Passed tests follow, collapsed." **Lane T. Wave 1. KEEP. Gated by open question 2** (a change of a contract the command-line tool and MCP consume).

**Allowed edit surfaces**
```
IDE/src/test-engine/index.ts
IDE/src/test-engine/failureDetail.test.ts
IDE/src/cli/toolApi.ts
IDE/src/cli/toolApi.failureDetail.test.ts
IDE/src/components/workspaceTestPresentation.ts
IDE/src/components/workspaceTestPresentation.failureDetail.test.ts
IDE/src/components/learnLesson.ts
```
(New test files, so the large existing suites are not edited. The cross-surface test of IDE-031 is **Unconfirmed**, find it with `rg -l "IDE-031" IDE/src tools`; it is run, not edited.)

**Interfaces.** The finding behind this task (Finding 1): the assertion result carries only `{ kind, passed, atMs? }` (`test-engine/index.ts:133-138`) and the preview built for every surface keeps only those three (`toolApi.ts:106`, `previewScenario` at `:245-288`, which already selects every failed assertion first through `selectIndexes` and keeps the samples at the failure times), and the presentation validator rejects any other key (`workspaceTestPresentation.ts` `onlyKeys`, `:300-303`, `preview` at `:569`). The scenario file names the signals and the expected values (`"condition": { "FirstBlink.Lamp": false }`), the trace holds the observed ones, and only the engine has both at hand. Contract C-E: for a **failed** assertion only, add `index` (its position in `expectations`) and `checks: Array<{ signal, expected, observed? }>` (at most 8, the signals of its condition; `observed` is the value in the sample at `atMs`, absent when the signal is not in the trace). A **passed** assertion is serialised exactly as before, so the evidence of a run with no failure is byte-identical (Review Focus 7). `learnLesson.ts:202` validates the same preview shape for the lesson check: it accepts the new keys on failed assertions. Whether `traceEvidenceSha256` covers the assertions or only the trace is **Unconfirmed**: read the function that computes it; if it covers the assertions, a failing run's hash changes and the commit body says so (the hash of a passing run does not).

- [ ] **Step 1: Baseline.** `bun test src/test-engine src/cli src/learn src/components/workspaceTestPresentation.test.ts` and the IDE-031 test; record the counts.
- [ ] **Step 2: Failing tests.** `failureDetail.test.ts`: `'TST-003 a failed AT expectation reports its index, the signal, the expected and the observed value'`; `'TST-003 a failed FOR expectation reports the first sample where it broke'`; `'TST-003 a passed expectation has no index and no checks'`; `'TST-003 a condition on more than 8 signals reports the first 8'`. `toolApi.failureDetail.test.ts`: `'TST-003 the preview carries the checks of a failed assertion'`; `'IDE-031 a run with no failure serialises byte for byte as before'` (a golden string made from the 2.0 output of one bundled project). `workspaceTestPresentation.failureDetail.test.ts`: `'TST-003 the presentation accepts the new keys on a failed assertion and still rejects an unknown key'`; `'TST-003 the lesson check accepts the same shape'`.
- [ ] **Step 3: Run** `bun test src/test-engine/failureDetail.test.ts src/cli/toolApi.failureDetail.test.ts src/components/workspaceTestPresentation.failureDetail.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Engine first (it has the data), then `previewScenario` (`toolApi.ts` is above its size ratchet: add the smallest code, no new function over 40 lines; the ratchet list `tools/ci/module-size-offenders.json` must not grow), then the two validators.
- [ ] **Step 5: Verify.** `bun test src/test-engine src/cli src/learn src/components src/plant src/plants`, `bunx tsc -b`, `bun run lint`; `bun run electron:compile` (the Tool API bundle is checked by `verify-tool-api-bundle.mjs`); the IDE-031 test passes unchanged. An independent verifier compares the output of `bun run` of the CLI on three bundled projects (pass, fail, mixed) before and after.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src
git commit -m "feat(test-engine): report the expected and observed values of a failed expectation"
```
**Risk:** item 3 (the preview is a contract that the command-line tool, the MCP server and the lesson check consume; adding optional keys to a failed assertion only, with the passing path byte-identical, is the mitigation), item 6 (the hash question above). Independent verifier at feature end: required.

---

### Task R2: The reference index
**Spec:** FND-004, FND-005 (the watch table and the scenarios). **Lane R. Wave 2. KEEP.** Depends on R1 and R1b.

**Allowed edit surfaces**
```
IDE/src/refs/referenceIndex.ts
IDE/src/refs/referenceIndex.test.ts
IDE/src/refs/referenceIndex.oracle.test.ts
IDE/src/refs/sources.ts
IDE/src/refs/sources.test.ts
```

**Interfaces.** `buildReferenceIndex(input: ReferenceInput): ReferenceIndex` where `ReferenceInput = { st: ProjectIndex; files: ReadonlyArray<{ path; language; content }>; config: ZPLCProjectConfig | null; watch: readonly string[]; scenarios: ReadonlyArray<{ path; content }> }`; `ReferenceIndex` has `targetAt(place): RefTarget | undefined` (a text position, an element and one of its names, an address, a watch path), `referencesOf(target): References` and `namesOfElement(file, element): string[]` (the names an element carries, for R4's menu). It composes the design of R1: the ST occurrences come from `input.st` (`referencesTo`, `IDE/src/langsvc/projectIndex.ts:242`), the IL and diagram occurrences from `ilOccurrences` and `diagramOccurrences`, the I/O rows from `config.io.inputs|outputs|virtual` (name and `address` through `parseAddress`; a row's `name` is an occurrence of the symbol of that name **only if** a symbol of that name has that address, else it is a `binding` occurrence of the address; how `zplc.json` rows bind to program variables is **Unconfirmed**, read `IDE/src/runtime/declaredInputs.ts` and `IDE/src/boards/safeOutputs.ts:46-59` and record the rule in the commit body), `watch` rows from `Prog.Var` paths (the store holds them as `watchVariables: string[]`, `IDE/src/store/ideStoreTypes.ts:95`), and scenarios by walking `condition` keys and `events` signals with their JSON pointer (`"FirstBlink.Lamp"` is `Program.Name`, the same path the Watch table uses). `sources.ts` has `readReferenceInput(): Promise<ReferenceInput>`: the tree, loaded buffers and `useProjectSources` (`IDE/src/store/projectSources.ts`), reading the files that are not loaded as `readSearchableFiles` does (`projectSearch.ts:77`, which R3 widens to five languages: use its result, do not copy it), cached by the identity of the strings.
The ST scope of a local is `<file>#<POU>`: obtain the container from `IndexedSymbol.container` and its `file`; a global has `''`. A diagram's names resolve as design point 4 says. The IL declarations come from `ilOccurrences`; an IL name resolves within its program then to globals.

- [ ] **Step 1: Baseline.** `bun test src/langsvc src/refs src/shell`.
- [ ] **Step 2: Failing tests** over a fixture project built in the test as strings (one ST program `Main` declaring `Start AT %IX0.0 : BOOL`, a global `Lamp`, a function block `Delay`; an LD diagram using `Start` and `Lamp`; an FBD using `Delay` as an instance; an SFC transition `Start AND NOT Lamp`; an IL file using `Start`; `zplc.json` with `{ "name": "Start", "address": "%I0.0" }`; a watch list `["Main.Start"]`; a scenario with `"Main.Start": true`): `'FND-004 all references of a variable list its uses in the five languages'`; `'FND-004 a variable local to one program is not a use of a same-named variable of another'` (Review Focus 1); `'FND-004 a global is found from a diagram that does not declare it'`; `'FND-004 a function block instance lists its member accesses'` (`Delay1.Q` is an occurrence of `Delay1`); `'FND-004 an I/O address lists the AT clause, the diagram table row and the zplc.json row, in the two notations'`; `'FND-004 the definition is the ST declaration before a diagram table row before a zplc.json row'`; `'FND-005 the watch table and a scenario are references'`; `'FND-004 a broken file is listed in broken and the rest is still answered'`; `'FND-004 results stop at the limit and say truncated'`. `referenceIndex.oracle.test.ts` (the debug-map oracle of design point 1): `'FND-004 every monitor entry of the build of a Ladder, an FBD and an SFC project is an occurrence of the walker'` (compile the three bundled projects the way `IDE/src/projects/bundledProjectsQuality.test.ts` does, **Unconfirmed** helper; use `itNative` only if the build needs the runtime, it should not).
- [ ] **Step 3: Run** `bun test src/refs`. Expected: FAIL.
- [ ] **Step 4: Implement.** Measure the build of the index and a query on the largest bundled project (`fd -e st IDE/projects | wc -l`) and record the milliseconds in the commit body.
- [ ] **Step 5: Verify.** `bun test src/refs src/langsvc src/shell`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/refs
git commit -m "feat(ide): a reference index across the five languages, the I/O mapping, the watch table and scenarios"
```
**Risk:** none of the high-risk items (no consumer until R4). The oracle test is the proof that the walker agrees with the build. Independent verifier at feature end (R1, R1b, R2, R4 together).

---

### Task R3: Project search across five languages
**Spec:** FND-003, quoted: "Project search MUST cover the five languages: the text of Structured Text and Instruction List files, and the names, variables, comments and expressions of Ladder, FBD and SFC documents. A match in a diagram MUST open it with the element selected, as Problems do today." **Lane R. Wave 2. KEEP.** Depends on R1b.

**Allowed edit surfaces**
```
IDE/src/shell/projectSearch.ts
IDE/src/shell/projectSearch.test.ts
IDE/src/shell/SearchView.tsx
IDE/src/shell/SearchView.dom.test.tsx
IDE/src/i18n/catalog/u2Search.ts
IDE/scripts/journeys013/u2-r3.ts
```

**Interfaces.** `SEARCHABLE_LANGUAGES` is `new Set(['ST', 'IL'])` (`projectSearch.ts:33`); `readSearchableFiles` reads only those (`:77-99`); `searchProject(files, query, options)` matches line by line (`:38`). Widen the set to `LD`, `FBD`, `SFC`; for those files, search the **fields** of `diagramOccurrences` (R1b exposes `diagramFields(file)` (R1b: `{ place, field, kind, text }`); the field text is what is searched, case-insensitively, as for text). `SearchMatch` gains optional `element?: SourceElementId` and `field?: string`; for such a match `line` and `column` are `1` and the row shows the place in words (`describeElement`, `models/sourceElements.ts:119`) instead of a line number. `SearchView.tsx` opens a match with an `element` by `requestElementSelection(file, element)` and then `navigateToCompilerDiagnostic(file, 1, 1)` (the pair `Console.tsx:253` uses), a text match as today (`SearchView.tsx:21`). The 400-file and 500-match caps stay (`SEARCH_LIMITS`).

- [ ] **Step 1: Baseline.** `bun test src/shell` green.
- [ ] **Step 2: Failing tests.** `projectSearch.test.ts`: `'FND-003 a variable used in a rung is found'`; `'FND-003 a variable used in an FBD block and in an SFC transition is found'`; `'FND-003 a comment of a diagram is found'`; `'FND-003 a match of a diagram carries its element and no line'`; `'FND-003 the text search of Structured Text and Instruction List is unchanged'` (the existing cases). `SearchView.dom.test.tsx`: `'FND-003 choosing a diagram match selects its element and opens the file'` (spy on `requestElementSelection` and the navigation action); `'FND-003 the Search view says "No results" and the count of files searched'`. Journey (`u2-r3.ts`): `'FND-003 search a variable used in a rung, a block and a transition, and open each match'` (spec 8 verification, with a project that has the three, **Unconfirmed** which bundled projects: build one in the journey from `IDE/projects` fixtures).
- [ ] **Step 3: Run** `bun test src/shell/projectSearch.test.ts src/shell/SearchView.dom.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Verify.** `bun test src/shell src/refs`, `bunx tsc -b`, `bun run lint`; `ZPLC_NATIVE_SIM_BIN=... bun run smoke:journeys` for `u2-r3`.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/shell packages/zplc-ide/scripts packages/zplc-ide/src/refs
git commit -m "feat(ide): search the names, variables, comments and expressions of diagrams"
```
**Risk:** item 6 (the Search view is UI; the journey is the end-to-end check). Row 11 of spec 8.1 (languages covered: 2 of 5) becomes 5 of 5.

---

### Task P1: The command inventory and the `physical` flag
**Spec:** FND-002, quoted: "Every surface of the registry (SHL-002) and every action offered by the command bar, a menu or a context menu MUST be a registered command. CI MUST fail on a control of those places that runs a handler without one. Physical commands keep their gates and stay out of reach of AI and MCP (constitution rule 9)." **Lane P. Wave 3. KEEP.** Depends on X0b, H1 and H4 (their controls are commands by then). The `physical` part waits for question 3; everything else does not.

**Allowed edit surfaces**
```
IDE/src/commands/inventory.dom.test.tsx
IDE/src/commands/registry.ts
IDE/src/commands/commands.test.ts
IDE/src/commands/useCommandHost.ts
IDE/src/components/Toolbar.tsx
IDE/src/components/ToolbarRunControls.tsx
IDE/src/components/ToolbarBuildMenu.tsx
IDE/src/shell/CommandBarCenter.tsx
IDE/src/shell/ActivityRail.tsx
IDE/scripts/journeys013/u2-p1.ts
```
(`registry.ts` only for an id the inventory proves missing and for the `physical` flags; the new ids are listed in the commit body.)

**Interfaces.** The command bar's controls call handlers directly (`Toolbar.tsx` has 19 `onClick` props, `CommandBarCenter.tsx:17` lists the ids it owns). The rule of this task (Plan choice): **every interactive control of the command bar, the activity rail, the status rail's button and the results-panel tab strip carries `data-command="<registered id>"`, or `data-command-exempt="<reason>"`**; the inventory test renders those surfaces in the states of `Toolbar.dom.test.tsx` (**Unconfirmed**: read it for the harness) and fails on a `button` or `[role=menuitem]` with neither, on a `data-command` that is not in `COMMAND_LIST`, and on an exempt reason that is empty. The application menu is built from the registry and cannot drift (`commands.test.ts:148`). Context menus: see question 4; the default covers the project tree and tab menus (their items are bound by H4 and H1, merged before this task) and leaves the canvas menus of the FBD and SFC editors to their key table (`IDE/src/editors/contextMenus.ts:1-8`: "An item runs the command of the key table that has its name"), with a test that every canvas menu item id is an action of that table.
`physical` (question 3, default yes): `online.restartSimulator` and `debug.rebuildAndRestart` act on the running program and get `physical: true`; the list pinned at `commands.test.ts:111` gains them. `AI_COMMAND_PROPOSALS` (`IDE/src/ai/proposals.ts:12`) is not extended.

- [ ] **Step 1: Baseline.** `bun test src/commands src/components/Toolbar.dom.test.tsx src/ai`.
- [ ] **Step 2: Failing tests.** `inventory.dom.test.tsx`: `'FND-002 every control of the command bar names a registered command or says why not'` (in simulation and with a board double); `'FND-002 every activity of the rail and every tab of the results panel names its command'`; `'FND-002 CI fails on a control with a handler and no command'` (render a fixture control without the attribute, expect the checker to report it); `'FND-002 no physical command is a proposal type the AI may make'` (cross-check `COMMAND_LIST` against `AI_COMMAND_PROPOSALS`); `'FND-002 the physical commands are the pinned list'` (with the two additions, if question 3 stands). Journey `u2-p1.ts`: `'FND-002 every command of the View menu runs from the palette'` (opens each by the palette with the keyboard, no assertion on content).
- [ ] **Step 3: Run** `bun test src/commands/inventory.dom.test.tsx`. Expected: FAIL (the attributes are missing).
- [ ] **Step 4: Implement** the attributes (no behaviour change) and the flags.
- [ ] **Step 5: Verify.** `bun test src/commands src/components src/shell src/ai`, `bunx tsc -b`, `bun run lint`; the restricted AI and MCP regression of 2.0 (`rg -l "restricted" IDE/src/ai IDE/src/mcp`, **Unconfirmed** name) passes unchanged.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "test(ide): every control of the command bar and the rail names a registered command"
```
**Risk:** item 2 (the `physical` flag decides which commands are gated and out of reach of AI and MCP; a wrong flag is a safety defect, so the pinned list test and the AI cross-check are the guard), item 3 (a registry change consumed by the menu). Independent verifier at feature end: required (the physical paths; the logbook's W6 verifier found a real blocker here, L31).

---

### Task P2: The palette finds eight kinds of thing
**Spec:** FND-001, quoted: "One palette MUST find, in ranked groups: commands, files, PLC objects (programs, function blocks, functions, data types, global variables, tasks), I/O points, configuration editors, lessons, preferences by name and, in 2.1, scenes and parts. Choosing an entry opens it at its place." **Lane P. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/commands/CommandPalette.tsx
IDE/src/commands/palette.ts
IDE/src/commands/palette.test.ts
IDE/src/commands/paletteSources/index.ts
IDE/src/commands/paletteSources/files.ts
IDE/src/commands/paletteSources/objects.ts
IDE/src/commands/paletteSources/io.ts
IDE/src/commands/paletteSources/editors.ts
IDE/src/commands/paletteSources/lessons.ts
IDE/src/commands/paletteSources/preferences.ts
IDE/src/commands/paletteSources/scenes.ts
IDE/src/commands/paletteSources/paletteSources.test.ts
IDE/src/commands/CommandPalette.dom.test.tsx
IDE/src/commands/preferenceAnchor.ts
IDE/src/i18n/catalog/u2Find.ts
IDE/scripts/journeys013/u2-p2.ts
```

**Interfaces.** Today the palette lists commands only: `listedCommands(COMMAND_LIST)` (`CommandPalette.tsx:30`), filtered by `filterEntries` and `fuzzyScore` (`palette.ts:21-52`), run through `runCommand(id, { respectEnabled: true })` (`:46`). Keep all of that. Each provider of C-P is a pure function of a snapshot passed in by `paletteSources/index.ts` (which reads the stores once when the palette opens, so a provider's module imports no store): files from `fileTree`; objects from `useProjectSources` declarations and `projectGlobalVariables` (`IDE/src/project/globalVariables.ts`) and `config.tasks` (the same set `buildNavigatorGroups` lists, `IDE/src/navigator/navigatorGroups.ts`, whose result it may reuse); I/O points from `config.io.*` rows (name and address); editors from `CONFIG_EDITOR_KINDS` and their titles; lessons from `LESSON_INDEX.lessons` (`IDE/src/generated/lessonIndex.json`; the title in the current language) with `run` doing what the Start button of the Learn home does (`IDE/src/components/LearnHome.tsx:58`, `startLesson`; opening a lesson needs the Learn flow, so the provider calls the existing function, **Unconfirmed** its export); preferences from a static table `PREFERENCE_ENTRIES` (`key`, `titleKey`) for the fields of `AppPreferences` (`IDE/src/components/settings/AppPreferences.tsx:82`), with a test that every key of `AppSettings` has an entry, and `run` = `runCommand('file.preferences')` after `setPreferenceAnchor(key)` (`preferenceAnchor.ts`; H2 scrolls to the anchor); scenes from the tree's `scenes/*.scene.json` and `scene.json` (the same listing as `useProjectScenes`, `IDE/src/plant/ui/usePlantSession.ts`, **without importing the plant chunk**: list by path). With an **empty query** the palette shows commands only (Plan choice: a short list on open). With a query, groups appear in this order: commands, files, objects, io, editors, lessons, preferences, scenes; inside a group by `fuzzyScore`; at most 8 rows per group and a "show all N" row that sets the query to the group (Plan choice, to keep the list reachable). A group is a `role="group"` with an `aria-labelledby` heading inside the listbox; arrow keys cross groups; the existing `aria-activedescendant` contract stays. Choosing an object, I/O point or file opens it as the navigator does (`navigateToCompilerDiagnostic`, `openConfigEditorFromNavigator`).

- [ ] **Step 1: Baseline.** `bun test src/commands` (the 38-command order test, `commands.test.ts:389`, and the filter tests stay green).
- [ ] **Step 2: Failing tests.** `paletteSources.test.ts`: `'FND-001 a provider lists files, objects, I/O points, editors, lessons, preferences and scenes of a fixture project'`; `'FND-001 every preference field of the settings has a palette entry'`; `'FND-001 the scene provider lists by path and imports nothing from the plant chunk'` (a source scan: no `from '../../plant'` in `paletteSources`). `palette.test.ts`: `'FND-001 groups come in the ranked order and a group has at most 8 rows'`; `'FND-001 an empty query lists commands only'`; `'UX-015 the command filter ranks as before'` (the previous behaviour still holds). `CommandPalette.dom.test.tsx`: `'FND-001 choosing an I/O point opens the I/O mapping editor'`; `'FND-001 choosing a file opens it'`; `'FND-001 the listbox exposes its groups and the arrow keys cross them'`. Journey: `'FND-001 with the keyboard only, open the I/O mapping, a function block, a lesson and a preference from the palette'` (spec 8 verification).
- [ ] **Step 3: Run** `bun test src/commands`. Expected: FAIL.
- [ ] **Step 4: Implement.** Keep `CommandPalette.tsx` under 300 lines by moving the row rendering to a component in the same file's folder if needed (add it to the surfaces list).
- [ ] **Step 5: Verify.** `bun test src/commands src/shell`, `bunx tsc -b`, `bun run lint`; `bun test ./tools/ci`. The interface budget (measure 10, "Kinds of thing the palette finds", target at least 7) is checked in Q1.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): the palette finds files, objects, I/O points, editors, lessons, preferences and scenes"
```
**Risk:** item 6 (UI; the journey is the check). The command route is untouched, so the AI and physical boundaries are as before.

---

### Task T2: The list of tests, the results store, the runner out of Console
**Spec:** TST-001, TST-002, TST-005, FLW-006 ("Build, Run in simulation, Run tests and Check MUST follow it. They MUST NOT fail because a document is unsaved."), SHL-005. **Lane T. Wave 2. KEEP.** Depends on X0a and X0b.

**Allowed edit surfaces**
```
IDE/src/projectTests/scenarioList.ts
IDE/src/projectTests/scenarioList.test.ts
IDE/src/projectTests/useProjectTests.ts
IDE/src/projectTests/useProjectTests.test.ts
IDE/src/projectTests/runProjectTests.ts
IDE/src/projectTests/runProjectTests.test.ts
IDE/src/shell/TestsView.tsx
IDE/src/shell/TestsView.dom.test.tsx
IDE/src/shell/workspaceTestResult.ts
IDE/src/components/console/useWorkspaceTestRunner.ts
IDE/src/components/console/TestsTab.tsx
IDE/src/commands/bind/tests.ts
IDE/src/i18n/catalog/u2Tests.ts
IDE/scripts/journeys013/u2-t2.ts
IDE/scripts/run-desktop-smoke.ts
IDE/scripts/smoke-studio-vertical.ts
```

**Interfaces.** 2.0: the run state is local to `Console` (`workspaceTestState`), the activity is a signpost (`TestsView.tsx:10-30`), the scenarios appear only after a run, a run refuses while any document is unsaved (`Console.tsx:357-366`, `current.hasUnsavedChanges()`), and the chooser reads a `zplc.json` (`:307`). The link to the main process's copy of the project is made on open (`IDE/src/utils/workspaceTestLink.ts:12-27`, `linkWorkspaceScenarios`, `useIDEStore.ts:602`) and `window.electronAPI.workspaceTests.run({ workspaceId, rootId, scenarioId? })` (`IDE/electron/preload.ts:66-78`; the renderer reaches it through `IDE/src/ipc/shownProjectBridge.ts`, which supplies `rootId`) runs one scenario or all.
- `scenarioList.ts`: `listProjectTests(tree, loaded, read): Promise<ProjectTest[]>` over the tree's `tests/*.scenario.json` (`SCENARIO_FILE`, `IDE/src/cli/workspace.ts:58`), tolerant (an invalid file is `valid: false` with no expectations, never an exception), open buffers winning over the disk.
- `useProjectTests.ts` (C-T): `tests`, `records: Record<path, TestRecord>`, `running: 'all' | path | null`, `safety` (the interlock state moved from `Console`, used by T4), `run(paths?)`, `cancel()`, `refresh()`. A record is `older` when its `compilerRunId` or `projectSession` differs from the current one (`compilerRunId` increments when sources change, `useIDEStore.ts` near `:595`: confirm), and stays visible (TST-005). The store still calls `usePublishWorkspaceTestResult`'s publisher so that `PlantDocument.tsx:34` and the lesson keep reading the last presentation (Finding 8).
- `runProjectTests.ts`: before a run, `saveAllDocuments()` (`IDE/src/store/saveAll.ts:19`) when the preference "Save before build and run" is "Always", and the same "Ask" confirmation U1 uses for Build otherwise (the preference and its read live with `IDE/src/runtime/runPlan.ts`; **Unconfirmed** function names, read it): a run never fails for an unsaved document (FLW-006). A refused or failed step is a located notice with the action (FLW-004), never only Output. With no link possible (`workspaceTests` absent) the Tests activity says the tests need the desktop application and offers nothing to choose.
- `TestsView.tsx`: a list (kit tree or list with roving tabindex, keyboard: arrows, Enter runs, `Space` selects into `useSelection.setTest`), one row per file with its last result mark (icon with a text equivalent: not run, passed, failed, older), a Run button per row, "Run all" and "Cancel" at the top, and the expectations of the selected test as child rows. No chooser. `view.tests` (bound in `bind/tests.ts`) now shows the activity only.
- `TestsTab.tsx` (extracted by X0a): reduced to a placeholder that T3 replaces; it keeps compiling.

- [ ] **Step 1: Baseline.** `bun test src/shell src/components src/learn` and the journeys 5, 5b (`IDE/scripts/journeys.ts:1436`, "Tests need no zplc.json to be chosen").
- [ ] **Step 2: Failing tests.** `scenarioList.test.ts`: `'TST-001 the list has one row per scenario file with its id and expectations'`; `'TST-001 an invalid scenario file is listed as invalid'`; `'TST-001 an unsaved scenario buffer is read, not the disk'`. `useProjectTests.test.ts` (set preconditions with `patchStore`, call `stubProjectLoader()` first, Global Constraints): `'TST-001 a record is not run, passed or failed after a run'`; `'TST-005 after the sources change the record stays and is older'`; `'TST-002 no step of a run asks for a manifest'`. `runProjectTests.test.ts`: `'FLW-006 running tests with a modified document saves it first when the preference is Always'`; `'FLW-006 with Ask the run waits for the answer and does nothing on Cancel'`; `'FLW-004 a refused run names the missing step and offers it'`. `TestsView.dom.test.tsx`: `'TST-001 the Tests activity lists the scenarios of the open project'`; `'TST-001 a row is operable by keyboard: arrows move, Enter runs'`; `'SHL-005 the Tests sidebar holds a list and not a pointer to another surface'`. Journey `u2-t2.ts`: `'TST-001 open a project with three scenarios, run one from the list, break the program, run all'` (spec 8 verification, first half).
- [ ] **Step 3: Run** `bun test src/projectTests src/shell`. Expected: FAIL.
- [ ] **Step 4: Implement.** Migrate `run-desktop-smoke.ts`, `smoke-studio-vertical.ts` and any journey that clicked "Run host scenarios" or the Tests tab (`rg "Run host scenarios|console-tab-tests" IDE/scripts`) in this task (Global Constraints).
- [ ] **Step 5: Verify.** `bun test src/projectTests src/shell src/components src/learn src/plant`, `bunx tsc -b`, `bun run lint`; `ZPLC_NATIVE_SIM_BIN=... bun run smoke:journeys`; `bun run smoke:desktop`.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): the Tests activity lists the project's tests and runs them"
```
**Risk:** item 6 (UI and a state move; the 2.0 journeys 5 and 5b are the guard). Not item 1: no stored data changes. The run path itself is unchanged (`workspaceTests.run`).

---

### Task H1: Changes become a review document
**Spec:** SHL-004, quoted: "A proposed change MUST open as a review document in the editor area, and the list of pending changes MUST be reachable whether or not an AI provider is configured (IDE-030)." **Lane H. Wave 2. KEEP.** Depends on X0a and X0b.

**Allowed edit surfaces**
```
IDE/src/components/ReviewDocument.tsx
IDE/src/components/ReviewDocument.dom.test.tsx
IDE/src/store/useReviewDocument.ts
IDE/src/store/useReviewDocument.test.ts
IDE/src/components/EditorGroup.tsx
IDE/src/components/EditorArea.tsx
IDE/src/components/console/ChangesTab.tsx
IDE/src/commands/bind/review.ts
IDE/src/i18n/catalog/u2Review.ts
IDE/scripts/journeys013/u2-h1.ts
```

**Interfaces.** The Changes tab body is `ChangesTab.tsx` (X0a; the 2.0 block is `Console.tsx:1074-1170`, with the candidate-review presentation of `IDE/src/components/ConsoleReviewPanels.tsx:54` and `IDE/src/components/agent/changeSetReview.ts`). The plant document is the pattern: a store (`IDE/src/store/usePlantDocument.ts`: `open`, `active`, `requests`, `show`, `select`, `deselect`, `close`) and its handling in the editor area (`IDE/src/components/EditorArea.tsx:90-92`, `:160`, `:294-297`, `:376`; read them first). `useReviewDocument` mirrors that store; the document id is `review:changes`; the document lists pending changes and the review of the chosen one, shows an empty state ("No pending changes") when there are none and when no AI provider is configured (IDE-030: the list is reachable either way). `view.changes` (bound in `bind/review.ts`) shows it. SHL-010's row "A proposed change arrives: One notice with a Review action" (`IDE/src/shell/reveal.ts:45`, `changeProposed: STAYS`) has **no implementation in code** (Finding 6): this task raises that notice when a proposal arrives (where proposals are received is in `IDE/src/components/agent/`, **Unconfirmed** the entry point) with an action that opens the document; it moves no region by itself. A document of this kind is closable, restored with the session if open (the session format is W2's, `IDE/src/utils/sessionState.ts`: add the id only if the plant document's id is stored there, **Unconfirmed**), and has a command, the palette entry and the View menu item (`view.changes`, SHL-004). The Changes tab stays in the panel until H6 (no surface leaves before its home exists).

- [ ] **Step 1: Baseline.** `bun test src/components src/shell src/store` green.
- [ ] **Step 2: Failing tests.** `useReviewDocument.test.ts`: `'SHL-004 showing the review document opens it and makes it the active view'`. `ReviewDocument.dom.test.tsx`: `'SHL-004 the review document lists pending changes and opens the review of one'`; `'IDE-030 the list of pending changes is reachable with no AI provider configured'`; `'SHL-010 a proposed change raises one notice with a Review action and moves nothing'`; `'IDE-030 accepting and rejecting a change behave as in the Changes tab'` (the 2.0 `ConsoleChangesTrace` cases still pass). Journey: `'SHL-004 view.changes opens the review document by its command and by the palette'`.
- [ ] **Step 3: Run** `bun test src/components/ReviewDocument.dom.test.tsx src/store/useReviewDocument.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** The review logic is moved, not rewritten: `ReviewDocument` reuses the components of `ConsoleReviewPanels.tsx`.
- [ ] **Step 5: Verify.** `bun test src/components src/shell src/store src/ai`, `bunx tsc -b`, `bun run lint`; the restricted AI and MCP regression passes unchanged.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): a proposed change opens as a review document in the editor area"
```
**Risk:** item 2 (the review of an AI proposal is the gate between a proposal and a change to the project: IDE-030; it moves and must stay as strict), item 6. Independent verifier at feature end: required; it exercises accept, reject and a stale proposal in the document.

---

### Task H3: The Assistant view, the Inspector and the selection report
**Spec:** SHL-008, SHL-009 (and SHL-004 for the Agent). **Lane H. Wave 2. KEEP.** Depends on X0a and X0b.

**Allowed edit surfaces**
```
IDE/src/shell/Sidebars.tsx
IDE/src/shell/Sidebars.dom.test.tsx
IDE/src/components/WorkbenchInspector.tsx
IDE/src/components/WorkbenchInspector.dom.test.tsx
IDE/src/components/workbenchInspectorPresentation.ts
IDE/src/components/AssistantView.tsx
IDE/src/components/console/AgentTab.tsx
IDE/src/editors/ld/LDEditor.tsx
IDE/src/editors/fbd/FBDEditor.tsx
IDE/src/editors/sfc/SFCEditor.tsx
IDE/src/shell/useSelection.ts
IDE/src/commands/bind/assistant.ts
IDE/src/i18n/catalog/u2Assistant.ts
IDE/scripts/journeys013/u2-h3.ts
IDE/scripts/screen-reader-capture.ts
```
(`useSelection.ts` is X0b's; H3 adds nothing to its shape, only calls it.)

**Interfaces.** The secondary sidebar shows the Inspector, or the lesson with a two-way toggle when a lesson workspace is open (`IDE/src/shell/Sidebars.tsx:66-104`; the lesson moves between sidebars by `lessonSurface`, `shellRouting.ts:24`). SHL-008, quoted: "The secondary sidebar MUST show one of its views at a time, Inspector, Guide or Assistant, with a visible switch between those that are available. A view MUST NOT move to the other sidebar. In the compact shell, where the secondary sidebar has no room, its current view MUST be offered in place of the primary sidebar." Plan choice for U2: the views are **Inspector, Lesson (until U3 turns it into the Guide, GDE-001) and Assistant**; the switch is the existing kit `ToggleGroup` with the available ones (the Assistant "exists only while an AI provider is configured", design default; with none, the Assistant is absent and `view.agent` opens Preferences at its Assistant section, Task H2). The Agent tab block (`Console.tsx:1171-1446`, now `AgentTab.tsx`) becomes `AssistantView` with its content unchanged, **including the provider settings form** for now (H2 moves that form to Preferences and the Agent tab leaves the panel in H6). The compact-shell offer: below `COMPACT_MAX_WIDTH` (`IDE/src/shell/shellDensity.ts`), `WorkbenchShell.tsx` hides the secondary panel in the compact density (the effect after `useCollapsible`); add the offer "its current view in place of the primary sidebar" as an entry of the primary sidebar's header switch (Plan choice, **Unconfirmed** how `ActivityBody` should host a second view: keep it a prop of `PrimarySidebar`).
SHL-009, quoted: "The Inspector MUST show the properties of the current selection: the active document, the selected element of a visual editor, the selected test, the selected plant part, the connected board. It MUST NOT repeat the status rail. A property it edits MUST go through the undo history of the document that owns it." Today it repeats the name and path of the active file, the project and target and counts the rail and the tabs show (`WorkbenchInspector.tsx:44-77`). New content: the **active document** (language, the POUs it declares, size, last saved), the **selected element** (kind from `describeElement`, its variable names, its comment), the **selected test** (its id, expectations, last result, from `useSelection.test` and `useProjectTests`; T2 wave 2 supplies the store: until it merges, show nothing for a test), the **connected board** (the existing `ControllerView`). The plant part row is U3. Plan choice: **the Inspector is read-only in U2**: the MUST about undo applies only to a property it edits, and the editors expose no commit API to a panel (**Unconfirmed**; `useGestureCommit.ts` and the `editComment` action of `editors/contextMenus.ts:53` are where one would hook in); editing the comment of the selected element is a 2.1.x candidate. The three visual editors publish their selected element into `useSelection.setElement({ file, element, names })` on selection change and `clear` on unmount (one `useEffect` each; `names` from the model, for R4's menu).

- [ ] **Step 1: Baseline.** `bun test src/shell src/components src/editors`; list the steps of `IDE/scripts/screen-reader-capture.ts` that cross the secondary sidebar (`rg -n "inspector|Inspector" IDE/scripts/screen-reader-capture.ts`).
- [ ] **Step 2: Failing tests.** `Sidebars.dom.test.tsx`: `'SHL-008 the secondary sidebar shows one view and a switch between the available ones'`; `'SHL-008 the Assistant is not offered without an AI provider'`; `'SHL-008 a view does not move to the other sidebar when the rail changes'` (the 2.0 rule `lessonSurface` is replaced for the Lesson view: assert it stays secondary); `'SHL-008 in the compact shell the current view is offered in the primary sidebar'`. `WorkbenchInspector.dom.test.tsx`: `'SHL-009 the Inspector shows the selected element of a Ladder editor'`; `'SHL-009 the Inspector does not repeat the status rail'` (no row for project name, target, connection or diagnostics counts); `'SHL-009 the Inspector shows the connected board'`. Editor tests: `'SHL-009 the Ladder, FBD and SFC editors publish their selected element and clear it on unmount'` (one test each, in the existing `*.browser.test.ts` style or a DOM test, **Unconfirmed** harness). Journey: `'SHL-008 switch the secondary sidebar between the Inspector and the Assistant by keyboard'`.
- [ ] **Step 3: Run** `bun test src/shell/Sidebars.dom.test.tsx src/components/WorkbenchInspector.dom.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement.** The screen-reader capture names the Inspector and the lesson toggle in its Tab steps: migrate it here (Global Constraints) and run it in both languages at the end of the task.
- [ ] **Step 5: Verify.** `bun test src/shell src/components src/editors`, `bunx tsc -b`, `bun run lint`; `bun run scripts/screen-reader-capture.ts --language en` and `--language es` (after `node install.js` and `electron:compile`).
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): one view at a time in the secondary sidebar; the Inspector shows the selection"
```
**Risk:** item 6 (UI; the capture and the journey are the end-to-end check). The editors are touched by one effect each: the Ladder, FBD and SFC suites of 2.0 pass unchanged.

---

### Task H4: Creation from the navigator
**Spec:** SHL-013, quoted above in the mapping; UX-021 (an empty group shows the action); IDE-004 (rename, move, duplicate, delete from both views). **Lane H. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/navigator/ObjectNavigator.tsx
IDE/src/navigator/ObjectNavigator.test.tsx
IDE/src/navigator/navigatorGroups.ts
IDE/src/navigator/navigatorGroups.test.ts
IDE/src/navigator/NewObjectMenu.tsx
IDE/src/project/newObject.ts
IDE/src/project/newObject.test.ts
IDE/src/components/Sidebar.tsx
IDE/src/components/ProjectExplorer.tsx
IDE/src/commands/bind/navigator.ts
IDE/src/i18n/catalog/u2Navigator.ts
IDE/scripts/journeys013/u2-h4.ts
IDE/scripts/run-desktop-smoke.ts
```

**Interfaces.** `ObjectNavigator.tsx:44-45` shows "Nothing here yet" with no action; new files exist only in the file view (`IDE/src/components/Sidebar.tsx:51-106`, `NewFileModal`), where the cross that closes the project sits beside Refresh (`Sidebar.tsx`, the header; the close handlers are at `:424`, `:432`, `:447` and keep their unsaved-changes handling). `newObject.ts`: `createObject(kind, language, name, ctx): Promise<{ path; line }>` for `program` (any of ST, IL, LD, FBD, SFC: the file `src/<Name>.<ext>` with the skeleton the New File dialog uses per language, **reuse its templates**, `IDE/src/types/index.ts:35-47` `LANGUAGE_INFO`), `functionBlock`, `function`, `dataType`, `globals` (Structured Text only: a file with the block that declares it) and `task` (a row appended to `config.tasks`, then the Tasks editor opens). The name is validated as an IEC identifier and as unused (a located message, MSG-004). "A skeleton that builds": a test compiles each skeleton with the project's own settings (a skeleton the build rejects is a defect of the skeleton). The object opens at its declaration. Each group header gets a "New" button (kit `Menu` for the language choice of a program), and an empty group shows the same action in place of "Nothing here yet". `project.newProgram`, `project.newFunctionBlock`, `project.newFunction`, `project.newDataType`, `project.newGlobals`, `project.newTask` and `project.rename`, `project.moveFile`, `project.duplicate`, `project.delete` (X0b declares them) are bound in `bind/navigator.ts` and are what the buttons and the item menus run (FND-002). Rename, move, duplicate and delete from the object view act on the item's file (a task row is renamed in place) through `IDE/src/project/treeOperations.ts` (the tree menu's own operations, which have tests). `file.closeProject` is bound to the existing close handler; the cross leaves the file view; the File menu and the palette offer it. P1's inventory test (wave 3) then finds every tree-menu item a command.

- [ ] **Step 1: Baseline.** `bun test src/navigator src/project src/components/Sidebar*` (the `Sidebar` tests are **Unconfirmed**: `fd Sidebar IDE/src/components`).
- [ ] **Step 2: Failing tests.** `newObject.test.ts`: `'SHL-013 each kind creates its skeleton and the skeleton builds'` (table over the six kinds and five languages, compile with the project's config); `'SHL-013 a name that is not an identifier or is in use is refused with a located message'`; `'SHL-013 a task is a row of zplc.json'`. `ObjectNavigator.test.tsx`: `'SHL-013 each group offers New for its kind'`; `'UX-021 an empty group shows the New action'`; `'SHL-013 rename, move, duplicate and delete work from the object view'`; `'SHL-013 Close project is a File menu command and not a control beside Refresh'`; `'IDE-004 rename, move, duplicate and delete still work from the file view'` (previous behaviour). Journey: `'SHL-013 create a program from an empty group and it opens'`.
- [ ] **Step 3: Run** `bun test src/navigator src/project/newObject.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** `run-desktop-smoke.ts` and journeys that press the close cross or the file view's New migrate in this task (`rg "closeProject|Close project|data-new-file" IDE/scripts`).
- [ ] **Step 5: Verify.** `bun test src/navigator src/project src/components`, `bunx tsc -b`, `bun run lint`; `ZPLC_NATIVE_SIM_BIN=... bun run smoke:journeys`.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): create programs, blocks, types, globals and tasks from the navigator"
```
**Risk:** item 1 (it writes files and rows of `zplc.json` into the user's project and renames, moves and deletes files; deletion keeps its existing confirmation (IDE-004), and the unsaved-changes handling of close is reused unchanged), item 6. Independent verifier at feature end: required (a delete and a rename of a file that is open and modified).

---

### Task H5: Reset layout, the saved-state version, 1366 by 768
**Spec:** SHL-015, SHL-016, quoted in the mapping. **Lane H. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/store/useShellLayout.ts
IDE/src/store/useShellLayout.test.ts
IDE/src/store/useEditorGroups.ts
IDE/src/utils/layoutStorage.ts
IDE/src/shell/WorkbenchShell.tsx
IDE/src/commands/bind/layout.ts
IDE/src/i18n/catalog/u2Layout.ts
IDE/scripts/journeys013/u2-h5.ts
IDE/scripts/textFit.ts
```

**Interfaces.** `SHELL_STATE_VERSION = 1` and `parseShellState` (`useShellLayout.ts:10-53`) already carry a version and fall back to the defaults: a document of **another version** returns `DEFAULT_SHELL_STATE` whole (`:44`), and inside version 1 each field falls back alone (`oneOf`, `typeof` guards). SHL-015 reads "a state of another version MUST fall back to the defaults field by field, as it does today"; the two halves disagree (Finding 9). Plan choice: **keep today's behaviour exactly** (a state of another version gives the defaults; inside a version a wrong field gives its default), pin both with tests, and do not bump the version (U2 adds no field; U3's Plant activity will, and an unknown `activityView` already falls back to `project`). `view.resetLayout` (X0b; bound in `bind/layout.ts`) restores: the shell state to `DEFAULT_SHELL_STATE`, the panel sizes (the library's own stored layouts, `IDE/src/utils/layoutStorage.ts` `useShellLayoutSizes`, `useWorkspaceLayout`, applied with `groupPanel.setLayout` and `shellGroup.setLayout` in `WorkbenchShell.tsx:76-110`), the results panel to expanded on Output, and the editor area to one group (`useEditorGroups`: add `reset()`). It does not touch preferences, the project or any file. It asks nothing (it loses no work) and says what it did in one notice.
SHL-016: "At 1366 by 768 pixels with the primary sidebar open, the editor area split and the results panel showing, no control of the main path may be clipped (UX-023)." A journey (`u2-h5.ts`) sets 1366 by 768, opens the primary sidebar, splits the editor, shows the results panel, and asserts for every control of the command bar, the status rail, the activity rail, the tab strips of both editor groups and the panel that its bounding box is inside its container's box and its text is not truncated by `overflow` (use `IDE/scripts/textFit.ts`; extend it only for the check). **A finding is a finding**: a clipped control is reported, fixed inside this task's surfaces if the cause is in them, and otherwise listed.

- [ ] **Step 1: Baseline.** `bun test src/store src/shell`.
- [ ] **Step 2: Failing tests.** `useShellLayout.test.ts`: `'SHL-015 a state of another version gives the defaults'`; `'SHL-015 a wrong field of the current version gives its default and keeps the others'`; `'SHL-015 reset layout restores the defaults and keeps preferences'`; `'SHL-015 an unknown activity gives Project'`. Journey: `'SHL-016 no control of the main path is clipped at 1366 by 768 with the split open'` (English and Spanish, both densities); `'SHL-015 Reset layout restores the regions after the user moved them'`.
- [ ] **Step 3: Run** `bun test src/store/useShellLayout.test.ts`. Expected: FAIL (no `reset`).
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Verify.** `bun test src/store src/shell`, `bunx tsc -b`, `bun run lint`; the journey.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): a Reset layout command and a check that nothing is clipped at 1366 by 768"
```
**Risk:** item 1 (it clears stored layout state; only layout, never project data: the test asserts preferences and files are untouched), item 6.

---

### Task V2: The words of the main path
**Spec:** MSG-001, MSG-002. **Lane V. Wave 2. KEEP.** Depends on V1.

**Allowed edit surfaces**
```
IDE/src/i18n/catalog/toolbarMsg.ts
IDE/src/i18n/catalog/statusText.ts
IDE/src/i18n/catalog/notices.ts
IDE/src/i18n/catalog/studioFlow.ts
IDE/src/i18n/catalog/studioNotices.ts
IDE/src/i18n/catalog/studioStatus.ts
IDE/src/i18n/catalog/studioTransport.ts
IDE/src/i18n/catalog/workbench.ts
IDE/src/i18n/catalog/moduleText.ts
IDE/src/i18n/catalog/learnHome.ts
tools/ci/i18n-terms-offenders.json
IDE/src/components/OperationalStatusBar.test.tsx
IDE/src/components/Toolbar.dom.test.tsx
IDE/src/components/statusPresentation.test.ts
```
(The three test files are edited only where an assertion froze an old English or Spanish string, listed in the commit body; others are **Unconfirmed**: `rg -l "<old string>" IDE/src` for each changed key.)

**Interfaces.** Rewrite the texts the main path shows that use an implementation term, in both languages, with the words of `VOCABULARY`: "Building saved workspace locally..." (`toolbarMsg.ts:20`) becomes a sentence about the project; "Runtime Native POSIX" (`statusText.ts:6`) belongs in the status Details (the one-line rail of U1 already shows less, `studio status` keys: check that the Details popover keys are under a detail segment so the guard allows the term there); "Connect first." and "No compiled bytecode. Compile first." (`toolbarMsg.ts:59-61`) are U1's, check they are gone. Every change keeps the **claim** exactly (P6): "Simulation" says less than "host evidence only", never more. Spanish keeps the neutral usted register and the standard terms (`falla`, `ciclo`, `tarima`) and the vocabulary column. Remove from `i18n-terms-offenders.json` every (key, language) pair this task fixes; the list must not gain entries.

- [ ] **Step 1: Baseline.** `bun tools/ci/i18n-guard.ts`; record the offenders count; `bun test src/components src/i18n`.
- [ ] **Step 2: Failing tests.** The RED is the guard itself: `bun tools/ci/i18n-guard.ts` lists the (key, language) pairs of these catalogs from V1's offenders list, and the check `'MSG-002 ...'` of V1 passes only when the list holds none of them (this task adds no test file; `tools/ci/i18n-guard.test.ts` is V1's). Update the string assertions of the three test files first, watch them fail against the unchanged catalogs, then change the catalogs.
- [ ] **Step 3: Run** `bun tools/ci/i18n-guard.ts` and the three tests. Expected: the guard lists the keys, the tests fail on the new text.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Verify.** `bun test src/components src/i18n src/shell`, `bun run lint`, root `bun test ./tools/ci`.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src tools/ci
git commit -m "fix(ide): say project, simulation and build on the command bar, the status rail and the notices"
```
**Risk:** item 6 (text; the guard and the string tests are the check) and a P6 risk: a shorter word must not claim more. Independent verifier at feature end reads the changed English and Spanish pairs for that.

---

### Task R4: Go to definition and find all references, and where they show
**Spec:** FND-004, quoted: "'Go to definition' and 'Find all references' MUST work for a variable, a function block instance and an I/O address from every editor, and MUST list uses in all five languages and in the I/O mapping." FND-005 (SHOULD). **Lane R. Wave 3. KEEP.** Depends on R2, R3, X0b, H3 (the selection report).

**Allowed edit surfaces**
```
IDE/src/refs/ReferencesPanel.tsx
IDE/src/refs/ReferencesPanel.dom.test.tsx
IDE/src/refs/useReferences.ts
IDE/src/refs/useReferences.test.ts
IDE/src/refs/openPlace.ts
IDE/src/refs/openPlace.test.ts
IDE/src/shell/SearchView.tsx
IDE/src/shell/SearchView.dom.test.tsx
IDE/src/commands/bind/find.ts
IDE/src/langsvc/monacoProviders.ts
IDE/src/components/settings/IOSection.tsx
IDE/src/components/WatchTab.tsx
IDE/src/i18n/catalog/u2Search.ts
IDE/scripts/journeys013/u2-r4.ts
IDE/scripts/screen-reader-capture.ts
```
(The Monaco editor component that registers actions, if the provider file is not where it is added: **Unconfirmed**, `rg -l "registerReferenceProvider|monaco.editor.create" IDE/src`; add that one file to the list and say so in the commit body.)

**Interfaces.** The design is in Task R1. `useReferences` (a store): `target`, `result: References | null`, `status`, `find(target)`, `clear()`; it builds the index once per query from `readReferenceInput()` (R2). `openPlace(place)` opens an `Occurrence` by its kind (design point 8). `ReferencesPanel` is the "References" mode of the Search view: `SearchView.tsx` (R3's, merged) gets a two-option `ToggleGroup` (Search, References) shown only when a result exists; the header reads "References to Start: 12 uses in 4 files" and says "older than the sources" for the resolved address when the build is stale. Keyboard: arrows move, Enter opens, Escape returns to Search. Commands (bound in `bind/find.ts`): `edit.findAllReferences` shows the Search activity in References mode for the target at the cursor or selection, and `edit.goToDefinition` opens the definition place of that target; both resolve the target by this order: the selected element of a visual editor (`useSelection.element`, H3; zero names: a notice "No variable is selected", one: that, several: a small kit `Menu` to choose), the cursor of the focused Monaco editor (`ProjectIndex.referenceAt` for Structured Text; the identifier token for Instruction List), else a notice that nothing is selected (a located message, MSG-004). The I/O mapping editor's rows (`IDE/src/components/settings/IOSection.tsx`) and the Watch table's rows (`IDE/src/components/WatchTab.tsx`) each get a "Find references" button calling `find` with the row's address or path. In a Structured Text editor Monaco's own `F12` and `Shift+F12` act first (the registry's keys do not run in a text field, `useCommandHost.ts:22-24`): register Monaco actions `zplc.goToDefinition` and `zplc.findAllReferences` that call the commands, with the same keybindings, so that the key opens the five-language result and not Monaco's peek of Structured Text only (**Unconfirmed** whether a later action with the same keybinding replaces the built-in one in the Monaco version in use: the journey proves it; if replacement fails, leave Monaco's keys and add the context-menu entry "Find all references (project)" to the editor, and say so in the commit body).

- [ ] **Step 1: Baseline.** `bun test src/refs src/shell src/langsvc`.
- [ ] **Step 2: Failing tests.** `useReferences.test.ts`: `'FND-004 finding references of a variable fills the result and the header counts'`; `'FND-004 a name that is declared nowhere says so and offers nothing to open'`. `openPlace.test.ts`: `'FND-004 a text occurrence opens its file at the line'`; `'FND-004 an element occurrence requests the selection of that element'`; `'FND-004 a configuration occurrence opens the I/O mapping editor'`; `'FND-005 a scenario occurrence opens the file at its JSON pointer'`. `ReferencesPanel.dom.test.tsx`: `'FND-004 references are grouped by file with the language and the place in words'`; `'FND-004 a row is operable by keyboard'`. `SearchView.dom.test.tsx`: `'FND-004 the References mode appears only when there is a result'`. Journey `u2-r4.ts`: `'FND-004 list the references of a variable used in a rung, a block and a transition, open each, and go to its definition'` (spec 8 verification), plus `'FND-004 with an FBD block selected, Find all references offers its names'`.
- [ ] **Step 3: Run** `bun test src/refs src/shell`. Expected: FAIL.
- [ ] **Step 4: Implement.** Update `scripts/screen-reader-capture.ts` if the Search step's Tab budget changes (Global Constraints) and run it in both languages.
- [ ] **Step 5: Verify.** `bun test src/refs src/shell src/langsvc src/components`, `bunx tsc -b`, `bun run lint`; journeys and the capture.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): go to definition and find all references across the five languages"
```
**Risk:** item 6 (UI and the Monaco keybinding question). Independent verifier at feature end with R1, R1b and R2: required for the scope rules (Review Focus 1, 2).

---

### Task T3: The Test results tab: verdict, failed tests, Details, boundary badge
**Spec:** TST-003, TST-004, TST-005, TST-008, MSG-003 (the badge). **Lane T. Wave 3. KEEP.** Depends on T1, T2, V1, R1 (for `locateJsonPointer`).

**Allowed edit surfaces**
```
IDE/src/components/TestResultsTab.tsx
IDE/src/components/TestResultsTab.dom.test.tsx
IDE/src/components/TestVerdict.tsx
IDE/src/components/TestVerdict.dom.test.tsx
IDE/src/components/BoundaryBadge.tsx
IDE/src/components/BoundaryBadge.dom.test.tsx
IDE/src/components/WorkspaceTestResult.tsx
IDE/src/components/WorkspaceTestResult.dom.test.tsx
IDE/src/components/console/TestsTab.tsx
IDE/src/components/LearnPanel.tsx
IDE/src/commands/bind/tests.ts
IDE/src/i18n/catalog/u2Tests.ts
IDE/scripts/journeys013/u2-t3.ts
IDE/scripts/journeys.ts
tools/ci/dom-render-surfaces.json
```
(`journeys.ts` only for the one journey that asserts the old 2.0 Tests tab text, line `:5201` area; **Unconfirmed**: `rg -n "Host evidence|host scenarios" IDE/scripts`.)

**Interfaces.** 2.0 opens the tab with "Host POSIX scenarios passed.", an artifact table with SHA-256 values, a line "Canonical saved build linked · native POSIX run · .zplc match · trace recorded." and the badge "Host evidence only" (`WorkspaceTestResult.tsx:91-93`, `:172-174`; `docs/static/img/screens/guide-scenario-tests.png`; spec 2.3 row 12: three statements of the boundary). The new tab (`TestResultsTab`, mounted in the `tests` tab of the panel by `TestsTab.tsx`; its tab label is H6's) reads the results store (T2): 1. **Verdict**, one sentence with counts (`"{passed} of {total} tests passed"`, key in `u2Tests`; the count uses `totalScenarioCount` and the failed scenarios of the preview, exact while at most 8 fail because the preview lists failed scenarios first, `toolApi.ts` `testPreview` at `:290-310`; with 8 failed it says "at least 8 failed", Finding 10). 2. **Failed tests**, each with the failed expectation (kind in words), its time, the expected and the observed value (T1's `checks`), a link "Scenario step" that opens the scenario file at `/expectations/<index>` (`locateJsonPointer`, R1), and a link "That time in the trace" that opens Details and highlights the sample row at `atMs` in the recorded trace (`ScenarioPreview`, `WorkspaceTestResult.tsx:184`; question 6: the spec says "in Trace", the recorded trace of the run is not the Trace tab's capture, which belongs to a live session). 3. **Passed tests**, collapsed (`<details>`). 4. **Details**, a closed disclosure holding **every field of the 2.0 evidence view** (artifacts, hashes, the link to the build, the saved inputs, the recorded trace; reuse `WorkspaceTestResult`'s sections, `:100-180`, moved under the disclosure; the "motor", "conveyor", "tank" and "pedestrian" recorded-plant sections, `:328-392`, stay there). Hashes outside Details are shortened with a copy action (`formatHash`, V1; MSG-006). 5. **The boundary**, once, as `BoundaryBadge`: "Simulation result" with the full sentence in a tooltip (the vocabulary row `resultSimulation`; `resultBoard` for a board run, which U2 does not produce but the component supports), the tooltip text being the exact claim 2.0 made ("not evidence of a physical lamp, hardware timing, HIL, or certification", `docs/static/img/learn/lesson-checked-en.png`), so that P6 is kept. `WorkspaceTestResult.tsx` loses its headline message and its badge (they are the verdict and the badge now) and its two other statements; the three 2.0 keys (`console.hostEvidenceBadge`, `console.recordedDuringThisHost`, `console.nativePosixHostEvidence`) are no longer referenced (V1's check; V3 deletes the keys). TST-005: a result older than the sources keeps showing, marked "older than the sources" with one "Run again" action (the store's `older` status). TST-008, quoted: "The lesson check and the project's tests MUST use one result component and the same words." `TestVerdict` is the shared part (sentence, failed expectation rows, badge); `LearnPanel.tsx` renders its check result with it (the smallest edit: **Unconfirmed** how `LearnPanel` shows the failed expectation today, `LearnPanel.tsx:28`, `:207-393`; the Guide's layout is U3's and this task does not touch it).
`view.testResults` (bound in `bind/tests.ts`) shows the panel and the tab. SHL-010: a failing run shows this tab through `reveal('testsFailed')` as in 2.0 (`reveal.ts:41`), a passing run moves nothing (one notice).

- [ ] **Step 1: Baseline.** `bun test src/components src/learn src/shell`; the cross-surface IDE-031 test.
- [ ] **Step 2: Failing tests.** `TestVerdict.dom.test.tsx`: `'TST-003 the verdict is one sentence with the counts'`; `'TST-003 a failed test shows its expectation, time, expected and observed value'`; `'TST-003 the scenario step link opens the scenario file at the expectation'`; `'TST-003 passed tests are collapsed'`. `WorkspaceTestResult.dom.test.tsx`: `'TST-004 the Details disclosure is closed and holds every field of the 2.0 evidence view'` (compare against the field list of the 2.0 component, asserted one by one); `'MSG-006 a hash outside Details is shortened with a copy action'`. `BoundaryBadge.dom.test.tsx`: `'MSG-003 a result states its boundary once'`; `'MSG-003 the tooltip carries the full claim'`. `TestResultsTab.dom.test.tsx`: `'TST-005 a result older than the sources stays and offers one Run again'`; `'TST-008 the lesson check and the tests tab render the same verdict component'` (render both, assert the same `data-test-verdict` root and the same sentence form). Journey `u2-t3.ts`: `'TST-003 break the program, run all, follow the failed expectation to its scenario step and to its time in the recorded trace'` (spec 8 verification, second half).
- [ ] **Step 3: Run** `bun test src/components`. Expected: FAIL.
- [ ] **Step 4: Implement.** Update the journey and the smokes that read the old headline (`rg -n "Host POSIX scenarios passed|Host evidence only" IDE/scripts tools/docs`) in this task.
- [ ] **Step 5: Verify.** `bun test src/components src/learn src/shell src/test-engine`, `bunx tsc -b`, `bun run lint`, root `bun test ./tools/ci`; journeys; the IDE-031 test passes unchanged.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts tools/ci
git commit -m "feat(ide): the test results open with the verdict and keep the evidence record in Details"
```
**Risk:** item 6 (UI and a claim: the badge must claim exactly what 2.0 claimed, P6), item 3 only through `LearnPanel` (a shared result component; the lesson suites of 2.0 pass unchanged). Independent verifier at feature end: required (it reads the badge, the tooltip and the 2.0 sentence side by side).

---

### Task H2: Preferences and Project settings are two documents
**Spec:** SHL-011, SHL-012, quoted: "Preferences (per user) and Project settings (per project) MUST be two documents. Preferences MUST open with no project open. Neither may contain the other's fields." and "Theme, density and language MUST each have one control, in Preferences, plus their commands. The command bar MUST NOT hold them." **Lane H. Wave 3. KEEP.** Depends on X0b, H1 (editor-area ownership), P2 (the preference anchor).

**Allowed edit surfaces**
```
IDE/src/components/settings/ProjectSettings.tsx
IDE/src/components/settings/AppPreferences.tsx
IDE/src/components/settings/PreferencesDocument.tsx
IDE/src/components/settings/PreferencesDocument.dom.test.tsx
IDE/src/components/settings/ProjectSettings.dom.test.tsx
IDE/src/components/settings/AssistantSettings.tsx
IDE/src/components/WelcomeScreen.tsx
IDE/src/components/ThemeControl.tsx
IDE/src/components/EditorGroup.tsx
IDE/src/components/EditorArea.tsx
IDE/src/components/AssistantView.tsx
IDE/src/store/usePreferencesDocument.ts
IDE/src/commands/bind/preferences.ts
IDE/src/commands/bind/assistant.ts
IDE/src/i18n/catalog/u2Preferences.ts
IDE/scripts/journeys013/u2-h2.ts
IDE/scripts/journeys013/u2-p2.ts
IDE/scripts/screen-reader-capture.ts
IDE/scripts/run-desktop-smoke.ts
```

**Interfaces.** 2.0: the page behind the gear holds the application's preferences (`<AppPreferences />`, `ProjectSettings.tsx:~85`) and the project's metadata (`:113`); the theme is chosen in three places (the Welcome header `WelcomeScreen.tsx`, `AppPreferences.tsx` through `ThemeControl`, and a menu that U1 already took out of the command bar: confirm with `rg ToolbarThemeMenu`), plus four commands (`registry.ts` `view.theme*`). The settings view is selected by `showSettings` and `SETTINGS_VIEW_ID` (`EditorGroup.tsx:107`, `:412`; `EditorArea.tsx:76`, `:93`) and opened by `project.settings` (`useCommandHost.ts:121` toggles it). Make Preferences a document (`usePreferencesDocument`: `open`, `active`, `show`, `close`, the pattern of H1's store) of the editor area that **opens with no project open** (from the Welcome screen's Preferences entry, which replaces the Welcome theme control, and from `file.preferences`, always enabled, `Mod+Comma`), holds the user's fields only (theme, density, language, editor font and tab size, autosave and "Save before build and run", the plant quality setting VIS-005 where it exists, the assistant provider), scrolls to the anchor P2 sets (`preferenceAnchor.ts`), and carries the single `ThemeControl` of the product. `ProjectSettings` keeps the project's fields (metadata, the editors' entry buttons) and loses `AppPreferences`; its Save button runs `file.save`'s sibling (FLW-005, U1's `Save`/`Save all`; do not add a path). `project.settings` opens Project settings from the root of the navigator and the gear of the command bar opens Preferences (the design default of spec 4.3: "The gear of the command bar opens Preferences; Project settings open from the root of the navigator"): change the gear's command to `file.preferences` and give the navigator's root row an entry for `project.settings` (the root row is `ObjectNavigator`'s header: H4 owns that file in wave 2; **coordinate**: this task adds the entry in `ProjectExplorer.tsx` only if H4 did not, **Unconfirmed**, read the merged result). **Assistant provider settings** move from the Agent view to a section of Preferences ("Assistant", `AssistantSettings.tsx`, the form that `AssistantView` holds after H3), and `view.agent` with no provider configured opens Preferences at that section (H3's rule: the Assistant exists only while a provider is configured). The command bar holds no theme, density or language control (U1's budget test already counts them: confirm it stays green). The registry's `view.theme*` commands stay.

- [ ] **Step 1: Baseline.** `bun test src/components src/shell src/store`; `bun scripts/interfaceBudget.ts --check` if a display is available.
- [ ] **Step 2: Failing tests.** `PreferencesDocument.dom.test.tsx`: `'SHL-011 Preferences opens with no project open'`; `'SHL-011 Preferences holds none of the project fields and Project settings none of the preferences'`; `'SHL-012 the theme has one control in the whole application'` (render the Welcome screen, Preferences and the command bar; count `ThemeControl` instances, expect 1 across the surfaces that show together and 0 on the Welcome header); `'SHL-012 theme, density and language commands change the same state as the control'`; `'FND-001 Preferences scrolls to the anchor a palette entry sets'`; `'SHL-011 the assistant provider form is a section of Preferences'`. `ProjectSettings.dom.test.tsx`: `'SHL-011 Project settings keeps the metadata and the editor entries'`. Journey `u2-h2.ts`: `'SHL-011 open Preferences from the Welcome screen with no project, change the theme, open a project, open Project settings'`.
- [ ] **Step 3: Run** `bun test src/components/settings`. Expected: FAIL.
- [ ] **Step 4: Implement.** Migrate the smoke and the capture where they open settings or change the theme (Global Constraints). Restore the leg of the U2-P2 journey (`IDE/scripts/journeys013/u2-p2.ts`) that chooses a preference in the palette and waits for Preferences open at that setting, and move FND-001 in that file from `partly` back to `proves` (owner, 2026-11-20; the leg was cut at the wave 2 seam because Preferences was not yet a document).
- [ ] **Step 5: Verify.** `bun test src/components src/shell src/store`, `bunx tsc -b`, `bun run lint`; journeys; the capture in both languages.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): Preferences and Project settings are two documents and the theme has one control"
```
**Risk:** item 1 (preferences are persisted per user; the stored keys and values do not change, only where they are edited: a test reads the same stored document before and after), item 6. The AI provider settings hold a credential field (**Unconfirmed**: `rg -n "apiKey|secret" IDE/src/components/agent IDE/electron/aiProvider.ts`): moving the form must keep it write-only and keep `sensitiveConfig` handling; treat as item 2 if it holds one and add the check to the independent verifier.

---

### Task V3: Failure messages, two levels of Output, the boundary sweep
**Spec:** MSG-003 (sweep), MSG-004, MSG-005, MSG-006. **Lane V. Wave 3. KEEP.** Depends on V1, V2, T3.

**Allowed edit surfaces**
```
IDE/src/i18n/catalog/console.ts
IDE/src/i18n/catalog/lab.ts
IDE/src/i18n/catalog/learn.ts
IDE/src/i18n/catalog/u2Words.ts
IDE/src/store/consoleEntries.ts
IDE/src/store/consoleEntries.test.ts
IDE/src/types/index.ts
IDE/src/components/console/OutputTab.tsx
IDE/src/components/console/OutputTab.dom.test.tsx
IDE/src/components/Console.tsx
IDE/src/utils/appSettings.ts
IDE/src/components/settings/AppPreferences.tsx
tools/ci/i18n-terms-offenders.json
IDE/scripts/journeys013/u2-v3.ts
```
(`OutputTab.tsx` is created here by moving the Output block of `Console.tsx:911-931` out; this is the one edit of `Console.tsx` this task makes, wave 3, before H6 in wave 5. `AppPreferences.tsx` gains one field for the level, in the section H2 created.)

**Interfaces.**
- MSG-004, quoted: "A message that reports a failure MUST say what failed, where (a file and line, an element, a setting), and what to do next, and MUST offer that action when there is one (P1). The runtime's own code and text MUST be available in Details." Sweep the failure messages the main path can show: build failures (`toolbarMsg.ts`), a refused run (U1's FLW-004 notices keep their shape), a test or check that could not run (`testDiag.*`, `workspaceTestPresentation.ts:254` `diagnosticMessage`), a scenario that is invalid (T1/T2's list), and the new U2 failures (no BOOL output for a new test, a name in use, a project with no tests). Each gets the three parts and, where an action exists, a button in the notice; the runtime's own code and text go under the notice's details (the existing notice component's detail link, `IDE/src/store/notifications.ts`, **Unconfirmed** its API).
- MSG-005, quoted: "Output MUST have two levels: normal, one line per step a user asked for ("Build finished: 302 bytes, 1 task"), and detailed, everything 2.0 writes. Normal is the default, and the choice is remembered." `ConsoleEntry` has no level (`IDE/src/types/index.ts:204-210`: `type`, `message`, `source`) and there are 119 call sites of `addConsoleEntry` and its relatives (`rg -c`, 2026-11-13). Plan choice (question 5): add an optional `step?: true`; an entry is shown at the **normal** level when it is `error`, `warning` or `success`, or has `step: true`; everything else (`info`, `command`) is **detailed** only. The main-path sources that today write progress as `info` set `step: true` and word it as one line per step with the result ("Build finished: 302 bytes, 1 task", measures with units via `formatSize`, MSG-006); an unmigrated `info` call is hidden at the normal level, which is why failures, warnings and successes are never hidden. A toggle "Detailed output" in the Output tab header (kit `Switch`) and a field in Preferences; the choice is remembered in `appSettings` (`IDE/src/utils/appSettings.ts:48`, the setting `outputLevel: 'normal' | 'detailed'`, default `'normal'`, stored with the same versioning as the other settings: a missing value reads as `'normal'`). The Output tab says how many detailed lines are hidden.
- MSG-003 sweep: remove the keys V1 listed (`console.hostEvidenceBadge`, `console.recordedDuringThisHost`, `console.nativePosixHostEvidence`, the lesson-result sentence that repeats the boundary in `learn.ts`, `lab.ts:10` "Run the saved host scenarios...") and rewrite the ones that stay in the vocabulary of MSG-001 (`console.ts` has the most: 94 lines with an implementation term). Empty the offenders list of V1: `bun tools/ci/i18n-guard.ts --write` must leave it **empty**, or each remaining pair carries a reason that names its Details surface.

- [ ] **Step 1: Baseline.** `bun tools/ci/i18n-guard.ts`, `bun test src/store src/components src/i18n`.
- [ ] **Step 2: Failing tests.** `consoleEntries.test.ts`: `'MSG-005 the normal level shows errors, warnings, successes and steps, and hides other info'`; `'MSG-005 the detailed level shows everything 2.0 wrote'`; `'MSG-005 the choice is remembered and a missing setting reads as normal'`. `OutputTab.dom.test.tsx`: `'MSG-005 Output says how many detailed lines are hidden'`; `'MSG-005 a build writes one line with its result in the normal level'`. A test in `IDE/src/i18n/` is not allowed here (V1 owns the guard): `'MSG-004 every failure message of the main path has what failed, where and what to do'` is asserted in `OutputTab.dom.test.tsx` and in the notice tests of the surfaces swept, each citing the key. Journey `u2-v3.ts`: `'MSG-003 count the boundary statements on the Test results tab: one'` and `'MSG-004 a build error names the file and line and offers Open'`.
- [ ] **Step 3: Run** `bun test src/store/consoleEntries.test.ts src/components/console`. Expected: FAIL.
- [ ] **Step 4: Implement.** Migrate the main-path call sites (build, run, test, deploy messages) to `step: true` by `rg -n "addConsoleEntry\(" IDE/src` and the files in `src/store`, `src/hooks`, `src/components/Toolbar*.tsx`: only those that report a step the user asked for; list the migrated files in the commit body.
- [ ] **Step 5: Verify.** `bun test src/store src/components src/hooks src/i18n src/learn`, `bunx tsc -b`, `bun run lint`, root `bun test ./tools/ci`; journeys.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts tools/ci
git commit -m "feat(ide): two levels of Output, failure messages that say what to do, the boundary stated once"
```
**Risk:** item 1 (a persisted setting with a default; a missing value must read as today's behaviour for a user of 2.0: the test pins it), item 6 (a hidden `info` line is a lost message if a call site is missed: the journey and the "failures are never hidden" rule are the guard). Independent verifier at feature end: required (it greps the call sites for an `info` that reports a failure).

---

### Task T4: Interlocks view, Replay, New test and the test commands
**Spec:** TST-006, TST-007, TST-009, TST-010. **Lane T. Wave 4. KEEP.** Depends on T2, T3, X0b.

**Allowed edit surfaces**
```
IDE/src/shell/InterlocksView.tsx
IDE/src/shell/InterlocksView.dom.test.tsx
IDE/src/shell/TestsView.tsx
IDE/src/shell/PlantDocument.tsx
IDE/src/shell/PlantDocument.test.tsx
IDE/src/store/usePlantDocument.ts
IDE/src/components/InterlockCoverage.tsx
IDE/src/components/TestResultsTab.tsx
IDE/src/projectTests/newTest.ts
IDE/src/projectTests/newTest.test.ts
IDE/src/projectTests/useProjectTests.ts
IDE/src/commands/bind/tests.ts
IDE/src/i18n/catalog/u2Tests.ts
IDE/scripts/journeys013/u2-t4.ts
```

**Interfaces.**
- **TST-006**, quoted: "Interlock coverage MUST be a view of its own in the Tests activity (IDE-032), run from there, with its results under their own heading in the Test results tab." `InterlockCoverage` (147 lines, `IDE/src/components/InterlockCoverage.tsx`) is the 2.0 tab body; its state (`workspaceSafetyState`) moved to the store in T2 (`safety`, `runSafety()`). `InterlocksView` is a section of the Tests activity (a second `ToggleGroup` option "Tests / Interlocks", or a second collapsible; Plan choice: a toggle in the activity header), with "Check interlocks" (`build.checkInterlocks`); `TestResultsTab` shows the result under its own heading "Interlock coverage". `view.interlocks` (bound in `bind/tests.ts`, X0b) shows the activity on that view. The interlock check is not the tests' run: it has its own run and result (IDE-032), and the Tests "Run all" does not run it.
- **TST-007**, quoted: "A result that recorded a plant trace MUST offer "Replay", which opens the plant document in a replay state with a timeline, labelled as a replay (LRN-020)." `recordedLabScenes(presentation)` (`IDE/src/components/labPlayback.ts:62`) says whether a result recorded a plant trace; `PlantDocument.tsx:31-83` already holds a live/replay toggle and reads the last presentation from `useWorkspaceTestResult`. A "Replay" button on a test with a recorded plant (`TestResultsTab`, from `recordedLabScenes`) calls `usePlantDocument.getState().showReplay()` (new: `show()` plus a `replayRequests` counter) and `PlantDocument` starts in the replay view when asked (**Unconfirmed**: that `LabPanel` has a timeline control; `labSampleIndex` and `nextLabPlayback` in `labPlayback.ts:116-120` suggest a slider; if it has none, add a kit `RangeField`, `IDE/src/ui`, over the sample index). The replay says "Replay" in its heading (LRN-020) and has no run controls (PLS-003).
- **TST-009** (SHOULD), quoted: ""New test" action SHOULD create a scenario file with a valid skeleton for the first program and open it." `newTest.ts`: `createTest(ctx)` writes `tests/<Program>.scenario.json` for the first program (`IDE/src/project/entryProgram.ts`, U1's SHL-014 rule) with `{ "schemaVersion": 1, "id": "<Program>", "tickMs": 10, "durationMs": 1000, "events": [], "expectations": [ { "kind": "AT", "atMs": 0, "condition": { "<Program>.<first BOOL output>": false } } ] }`, taken from the format of `IDE/projects/first_blink/tests/first-blink.scenario.json`; the presentation requires at least one assertion (`workspaceTestPresentation.ts:616`, `integerBetween(totalAssertions, 1, 256)`), so one is needed. A program with no BOOL output gets a located refusal ("`<Program>` has no BOOL output to check: add one, or write the test by hand"), not an empty file. A test with the same file name is not overwritten (the file name gets a number). The skeleton must **validate** (a test compiles it with the engine's scenario parser and the program's debug map; **Unconfirmed** the parser's export, `IDE/src/test-engine/index.ts` `compileScenario`-like) and it passes only if the output starts off (stated in the notice).
- **TST-010**, quoted: ""Run all tests", "Run failed tests" and "Run the test at the cursor" MUST be commands." Bound in `bind/tests.ts`: `build.runAllTests` (`Mod+Alt+T`) runs `run()` of the store; `build.runFailedTests` runs the files whose record is `failed`, one after another, cancellable, and says "No failed tests" when there are none; `build.runTestAtCursor`: Plan choice (question 7): the scenario file of the active document if it is one, else the test selected in the Tests activity (`useSelection.test`), else refused with a located message. None is `physical` (a test run starts a host process, never a board; question 3).

- [ ] **Step 1: Baseline.** `bun test src/shell src/components src/projectTests src/plant` (the plant document tests, `PlantDocument.test.tsx`).
- [ ] **Step 2: Failing tests.** `InterlocksView.dom.test.tsx`: `'TST-006 the Tests activity has an interlock view with its own run'`; `'TST-006 the interlock result has its own heading in the Test results tab'`; `'IDE-032 the interlock coverage check behaves as in 2.0'` (the existing `InterlockCoverage` cases). `PlantDocument.test.tsx`: `'TST-007 Replay opens the plant document in the replay view, labelled as a replay'`; `'PLS-003 the replay has no run controls'`. `newTest.test.ts`: `'TST-009 a new test is valid and opens'`; `'TST-009 a program with no BOOL output is refused with a located message'`; `'TST-009 an existing test file is not overwritten'`. Command tests (in `bind` test or `commands.test.ts` additions are X0b/P1's, so here a new `IDE/src/commands/bind/tests.test.ts`: add it to the surfaces): `'TST-010 Run all, Run failed and Run at the cursor are bound and enabled with a project open'`; `'TST-010 Run failed with none failed says so and runs nothing'`; `'TST-010 Run the test at the cursor refuses with no scenario in sight'`. Journey `u2-t4.ts`: `'TST-007 a result with a recorded plant offers Replay and it opens the plant document in replay'` and `'TST-010 Run all tests runs from its shortcut'`.
- [ ] **Step 3: Run** `bun test src/shell src/projectTests src/commands/bind`. Expected: FAIL.
- [ ] **Step 4: Implement.** Add `IDE/src/commands/bind/tests.test.ts` to the surfaces and to `dom-render-surfaces.json` only if it is a component test (it is not).
- [ ] **Step 5: Verify.** `bun test src/shell src/components src/projectTests src/plant src/plants src/learn`, `bunx tsc -b`, `bun run lint`; journeys; the 2.0 lab playback tests (`labPlayback.test.ts`) pass unchanged.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): interlock coverage in the Tests activity, Replay from a result, New test and the test commands"
```
**Risk:** item 1 (it writes a file into the user's `tests/` folder: no overwrite, and the file is created in the project, not elsewhere), item 6. The replay path touches the plant document U0 built: its 2.0 and M1 tests pass unchanged.

---

### Task P3: Back and Forward; the place of the document
**Spec:** FND-006, FND-007 (both SHOULD), quoted: "Back and Forward SHOULD move through the places visited, across documents." and "The editor area SHOULD show the place of the active document as PLC objects (project, group, object), each step of which opens the navigator there." **Lane P. Wave 4. KEEP.** Depends on H2 (it edits `EditorGroup.tsx` last).

**Allowed edit surfaces**
```
IDE/src/store/useNavigationHistory.ts
IDE/src/store/useNavigationHistory.test.ts
IDE/src/components/PlaceBar.tsx
IDE/src/components/PlaceBar.dom.test.tsx
IDE/src/components/EditorGroup.tsx
IDE/src/commands/bind/find.ts
IDE/src/i18n/catalog/u2Find.ts
IDE/scripts/journeys013/u2-p3.ts
```

**Interfaces.** `useNavigationHistory`: a bounded stack (50) of places `{ file; line?; element? }` pushed when the active document changes or when `navigateToCompilerDiagnostic` / `requestElementSelection` is called (hook the store subscription, not the callers: `useIDEStore` `activeFileId` and `compilerNavigationTarget`, `useIDEStore.ts:794-815`), with `back()` and `forward()` that reopen a place through `openPlace` (R4) without pushing; a new push after a back drops the forward tail. `edit.goBack` and `edit.goForward` (`Alt+Left`, `Alt+Right`; enabled when the stack has a place) are bound in `bind/find.ts`. `PlaceBar` shows "Project › Group › Object" for the active document (the group and the object from `buildNavigatorGroups` over the file's declarations, `navigatorGroups.ts`; a diagram or IL file is one program named after its file; a configuration editor shows its group), each step a button that shows the primary sidebar in the object view with that group expanded and that item revealed (`useShellLayout.showActivity('project')`, `setNavigatorMode('objects')`; the expand state is local to `ObjectNavigator`, `:68`: lift it into `useShellLayout` or a small store, the one change this task makes there; `ObjectNavigator.tsx` is H4's and merged by then). It is a single row under the tab strip of each editor group, 22 pixels, and does not take the focus on its own.

- [ ] **Step 1: Baseline.** `bun test src/store src/components src/navigator`.
- [ ] **Step 2: Failing tests.** `useNavigationHistory.test.ts`: `'FND-006 back returns to the previous place across documents and forward returns'`; `'FND-006 a place pushed after back drops the forward tail'`; `'FND-006 the stack is bounded'`. `PlaceBar.dom.test.tsx`: `'FND-007 the place bar shows project, group and object for a program'`; `'FND-007 a step opens the navigator with that group expanded'`; `'FND-007 the place bar is not a tab stop trap'` (Tab passes through in order). Journey: `'FND-006 open three documents by the navigator, go back twice and forward once with the keyboard'`.
- [ ] **Step 3: Run** `bun test src/store/useNavigationHistory.test.ts src/components/PlaceBar.dom.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement.** The screen-reader capture's Tab budgets change if a stop is added: it must not (the bar's steps are buttons in the existing order of the editor group header): run the capture in both languages and migrate it if a step moves.
- [ ] **Step 5: Verify.** `bun test src/store src/components src/navigator`, `bunx tsc -b`, `bun run lint`; the capture; journeys.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts
git commit -m "feat(ide): back and forward through the places visited and the place of the document"
```
**Risk:** item 6 (UI). Both requirements are SHOULD: if the wave runs short, P3 is the first task to leave for 2.1.x.

---

### Task H6: The results panel is cut to five tabs
**Spec:** SHL-003, quoted in the mapping; SHL-004 (a stored tab id opens its new place). **Lane H. Wave 5. KEEP.** Depends on H1, H3, T3, T4.

**Allowed edit surfaces**
```
IDE/src/components/Console.tsx
IDE/src/components/console/ChangesTab.tsx
IDE/src/components/console/AgentTab.tsx
IDE/src/components/console/InterlocksTab.tsx
IDE/src/components/Console.tabNavigation.test.ts
IDE/src/components/Console.dom.test.tsx
IDE/src/components/ConsoleTabStrip.tsx
IDE/src/shell/surfaces.ts
IDE/src/shell/surfaces.test.ts
IDE/src/shell/shellRouting.ts
IDE/src/shell/shellRouting.test.ts
IDE/src/types/index.ts
IDE/src/i18n/catalog/u2Panel.ts
IDE/scripts/interfaceBudget.targets.json
IDE/scripts/interfaceBudget.ts
IDE/scripts/interfaceBudget.test.ts
IDE/scripts/journeys013/u2-h6.ts
IDE/scripts/screen-reader-capture.ts
IDE/scripts/run-desktop-smoke.ts
IDE/scripts/smoke-studio-vertical.ts
tools/docs/capture-screenshots.ts
```

**Interfaces.** Today the panel has nine tabs (`output`, `problems`, `tests`, `interlocks`, `changes`, `agent`, `trace`, `watch`, `terminal`; `Console.tsx:272-307`; `baseline/interface-budget-2.1-m1.json` measures "1 of 9" named at 1366 by 768). Target: Problems, Output, Test results, Watch and Trace by default, **Terminal while the target is a board or after the user opens it** (`view.terminal` opens it; the tab then stays for the session). Remove `interlocks`, `changes` and `agent` from the tab list and from `surfaces.ts` (`results.interlocks`, `results.changes`, `results.agent` become `activity.tests.interlocks` (a view), `editor.review` and `secondary.assistant`; every row keeps its command, `view.interlocks`, `view.changes`, `view.agent`, so `surfaces.test.ts` "a surface with no command" stays satisfied). The tab labelled `tests` shows the name "Test results" (`MSG-001` word "Test", spec 5.3). `ConsoleTab` keeps the three old ids in the type so that stored values parse, as `'lab'` was kept (`shellRouting.ts:31-39`): `routeConsoleTab` routes `interlocks` to the Tests activity (interlock view), `changes` to the review document and `agent` to the Assistant view (SHL-004: "a session or layout saved by 2.0 that names its old tab MUST open it in its new place"); `resultsTabFor` maps them to a tab that exists. I found **no persisted store of the active results tab** (`activeConsoleTab` is not in `IDE/src/utils/sessionState.ts`; **Unconfirmed**, Finding 5): if none exists the routing is still required for the commands and for scripts, and the journey proves a session file written by 2.0 opens. SHL-003's naming: `ConsoleTabStrip` already shortens unselected tabs to icons when they do not fit (`ConsoleTabStrip.tsx:1-5`); with five tabs they must fit with their names at 1366 by 768 in English and Spanish at both densities: the interface-budget check measures it. `interfaceBudget.targets.json` moves `resultsTabs.total` from 9 to 5 (6 with a board; the board state is measured by hand, as the file says for the command bar) and adds `namedAtDefault: 5`; `interfaceBudget.ts` counts "named" per tab already (`baseline` JSON `resultsTabs.named`), and fails when any default tab is unnamed.
Migrate every script that names a removed tab or the old Tests tab (`console-tab-interlocks`, `console-tab-changes`, `console-tab-agent`, `console-tab-tests`; found with `rg` in `IDE/scripts` and `tools/docs`) in this task, and run the screen-reader capture in both languages.

- [ ] **Step 1: Baseline.** `bun test src/components src/shell`, `bun scripts/interfaceBudget.ts` (needs a display or xvfb) and save its output.
- [ ] **Step 2: Failing tests.** `surfaces.test.ts`: `'SHL-003 the results panel registry lists Problems, Output, Test results, Watch, Trace and the conditional Terminal'`; `'SHL-004 every surface that left the panel has a command, the palette and the View menu'`. `shellRouting.test.ts`: `'SHL-004 a stored interlocks, changes or agent tab opens its new place'`; `'SHL-004 a stored lab tab still opens the plant document'` (the 2.0 behaviour). `Console.dom.test.tsx`: `'SHL-003 the panel shows five tabs and Terminal only with a board or after the user opens it'`. `interfaceBudget.test.ts`: `'SHL-003 the budget fails when a default results tab is unnamed or when there are more than five'`. Journeys `u2-h6.ts`: `'SHL-003 the tab strip shows every name at 1366 by 768 in English and Spanish at both densities'` and `'SHL-004 open every surface of the section 7 inventory that U2 moved by its command and by the palette on a session file written by 2.0'` (spec 8 verification).
- [ ] **Step 3: Run** `bun test src/shell src/components/Console*.test.* scripts/interfaceBudget.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Verify.** `bun test src/components src/shell src/store`, `bunx tsc -b`, `bun run lint`, root `bun test ./tools/ci`; `bun scripts/interfaceBudget.ts --check`; journeys; the capture in both languages.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src packages/zplc-ide/scripts tools/docs
git commit -m "feat(ide): the results panel shows five tabs; Changes, Agent and Interlocks have their own places"
```
**Risk:** item 6 (UI; the journey and the budget are the check) and item 3 for the stored ids (an id of 2.0 must keep parsing: the routing test is the guard). Independent verifier at feature end: required (it confirms no surface became unreachable).

---

### Task D1: Documentation in English and Spanish
**Spec:** constitution rule 8 (docs follow the interface), `AGENTS.md` guideline 5 (both languages in parallel), spec 8.2 item 6 for the pages U2 changes. **Lane D. Wave 5. KEEP.** Depends on all code tasks.

**Allowed edit surfaces**
```
docs/docs/ide/tests.md
docs/docs/ide/find-and-references.md
docs/docs/ide/command-palette.md
docs/docs/ide/shell-and-panels.md
docs/docs/ide/vocabulary.md
docs/docs/guides/scenario-tests.md
docs/sidebars.js
docs/i18n/es/docusaurus-plugin-content-docs/current/ide/tests.md
docs/i18n/es/docusaurus-plugin-content-docs/current/ide/find-and-references.md
docs/i18n/es/docusaurus-plugin-content-docs/current/ide/command-palette.md
docs/i18n/es/docusaurus-plugin-content-docs/current/ide/shell-and-panels.md
docs/i18n/es/docusaurus-plugin-content-docs/current/ide/vocabulary.md
docs/i18n/es/docusaurus-plugin-content-docs/current/guides/scenario-tests.md
tools/docs/capture-screenshots.ts
```
(**Unconfirmed**: which of these pages exist; `fd . docs/docs/ide docs/docs/guides`. Edit the existing page where one exists; create a page only for a topic with none, and add it to the sidebar. `docs/docs/guides/scenario-tests.md` is the page the screenshot `guide-scenario-tests.png` illustrates.)

**Interfaces.** Pages describe what shipped: the Tests activity and the Test results tab (verdict, failed tests, Details, "Simulation result"), the palette's kinds, search in five languages, Find all references and the address notations, the results panel's five tabs and where Changes, Agent and Interlocks went, Preferences versus Project settings, "New" in the navigator, Reset layout, and the vocabulary table. Use the words of `VOCABULARY` (MSG-001). No claim that was not measured (CRS-013). The screenshots of the changed screens (`docs/static/img/screens/guide-scenario-tests.png`, `docs/static/img/tutorials/*`) are **stale after U2** and regenerating them needs a display (`bun run docs:screenshots`, `bun run docs:screenshots -- --screens`, run by the parent at the end when no writer is active): this task lists them in its commit body and does not edit images. `tools/docs/capture-screenshots.ts` changes only where it clicks a moved control.

- [ ] **Step 1: Baseline.** `bun test tools/docs` (needs the runtime built) green.
- [ ] **Step 2: Failing tests.** The docs suites compare English and Spanish page sets and the Spanish register and terms (`tools/docs`, the tests named in logbook L17 and L19: sidebar and both-languages, register, DOC-008 source references, DOC-009 fragments): write the English pages first, watch the both-languages test fail, then add the Spanish pages. No new test.
- [ ] **Step 3: Run** `bun test tools/docs`. Expected: FAIL until both languages exist.
- [ ] **Step 4: Implement.** Spanish: neutral usted, `falla`, `ciclo`, `tarima`, "ZPLC" as the product name. Recapture the tutorial screenshots after H6 (`bun tools/docs/capture-screenshots.ts`, whole tutorial set; it has no per-shot option): `docs/static/img/tutorials/blink-6-scenario.png` and `-es` still show the 2.0 headline the T3 prose no longer describes, and `guide-scenario-tests.png` (journey 68) is likely stale; then `--check` (logbook L254).
- [ ] **Step 5: Verify.** `bun test tools/docs`, root `bun test ./tools/ci`, the pinned formatter `--check` (Markdown is checked by Prettier in the docs lint, **Unconfirmed**: run the docs lint named in `docs/package.json`).
- [ ] **Step 6: Commit.**
```bash
git add docs tools/docs
git commit -m "docs: tests, find and references, the results panel, preferences and the vocabulary in English and Spanish"
```
**Risk:** none of the high-risk items. Stale screenshots are listed, not hidden.

---

### Task Q1: Budget, requirement coverage and the closing checks
**Spec:** spec 8.2 items 1 to 5 for the U2 requirements; spec 8.1 rows 2, 3, 9, 10, 11, 12, 13, 17. **Lane Q. Wave 6. KEEP. Run by the parent or a CI-hygiene writer after everything else merges.**

**Allowed edit surfaces**
```
tools/ci/requirement-evidence.json
tools/ci/requirements-index.json
tools/ci/requirement-coverage.test.ts
IDE/scripts/interfaceBudget.ts
IDE/scripts/interfaceBudget.targets.json
IDE/scripts/interfaceBudget.test.ts
IDE/scripts/journeys013/u2-q1.ts
specs/013-zplc-2-1-studio-experience/baseline/interface-budget-2.1-u2.json
```

**Interfaces.** Requirement coverage: `bun tools/ci/requirement-coverage.ts --check` reads spec 013 since U1 (logbook L14, L16: fixtures are fixture-based, never pinned to today's uncovered IDs). Record the TST, FND, MSG-001 to MSG-006 and SHL IDs of U2 as `covered` with the test names above (each test name begins with its requirement ID, so the tool finds them), conditional ones with their decision (FND-005's plant map: pending U3; SHL-005's Plant entry: pending U3; SHL-008's Guide: pending U3; SHL-009's plant part: pending U3), and the SHOULDs P3 left, if any, as `pending (2.1.x)`. The mechanism (`requirement-evidence.json` shape, which indexes regenerate: `bun run generate:requirement-index`, **Unconfirmed**) is read from the commit `e1007fcd` and `62ac99c1`. The budget: extend `interfaceBudget.ts` with measure 10 (kinds the palette finds, counted from the palette's groups with a query that matches one of each in a fixture project; target at least 7), 11 (languages searched: 5 of 5, from the journey), 12 (statements of the boundary on one result: 1), 13 (controls for the theme: 1) and 17 (implementation terms on the main-path surfaces: 0, from the guard's offenders list being empty); record `baseline/interface-budget-2.1-u2.json` with the same shape as `interface-budget-2.1-m1.json`. The closing journey (`u2-q1.ts`) runs the whole U2 path once: open a project with three scenarios, run one from the list, break the program, run all, follow the failure to its step, find all references of a variable used in a rung, a block and a transition, open the I/O mapping, a function block, a lesson and a preference from the palette, create a program from an empty group, reset the layout. The parent then runs the full IDE suite, the journey suite under xvfb on a quiet machine, the screen-reader capture in both languages, and `bun run docs:screenshots` (a display).

- [ ] **Step 1: Steps.** `bun tools/ci/requirement-coverage.ts --check` (expected exit 0 with U2's IDs `covered`, conditional ones with their decision, `pending (U3)` for the rest), `bun test ./tools/ci`, `bun scripts/interfaceBudget.ts --check`, the pinned formatter `--check`.
- [ ] **Step 2: Commit.** `test(ci): requirement coverage and the interface budget for milestone U2`.
**Risk:** item 5 (CI tooling). KEEP.

---

## Open questions for the owner
Only real product decisions. Each has a recommended default; the plan proceeds on the default unless told otherwise, except questions 2 and 3, which gate one task or one part of one.

1. **Where "Find all references" shows its results.** FND-004 says "list uses in all five languages" and does not say where. (A) The References mode of the Search sidebar. (B) A new results tab. (C) A document in the editor area. *Recommended default: A.* A new tab would take the panel back to six by default (SHL-003 asks five), and the Search sidebar already holds a list of places grouped by file. Cost of A: the Search activity has two modes.
2. **Failure details in the Tool API result (Task T1).** TST-003 needs the expected and the observed value of a failed expectation, and the 2.0 evidence has neither (Finding 1). They can only come from the engine, so the result that the command-line tool and the MCP server print gains optional fields on **failed assertions only**; a run with no failure is byte-identical. *Recommended default: yes.* If the owner declines, TST-003 is delivered without the values (expectation kind, time and links only) and the requirement is recorded as partial. Gates T1; T3 shows the values only if T1 merged.
3. **The `physical` flag of two registry commands (open since the W6 verifier, logbook L31/L32).** `online.restartSimulator` and `debug.rebuildAndRestart` act on the running program and are not flagged `physical` (`registry.ts`, the pinned list at `commands.test.ts:111`). *Recommended default: flag both, and pin them.* A `physical` command is a control for the person at the keyboard and is out of reach of AI and MCP (`AGENTS.md`, guideline 8). The U2 commands (tests, navigation, new object, layout) are **not** physical: running a test starts a host process, never a board. Gates the flag change of Task P1 only.
4. **How far "context menu" in FND-002 reaches.** "Every action offered by the command bar, a menu or a context menu MUST be a registered command." The canvas menus of the FBD and SFC editors run editor actions of their own key table (`IDE/src/editors/contextMenus.ts:1-8`), which is a second, local registry. *Recommended default: the command bar, the application menu, the rail, the tab strips and the project tree and tab menus are registry commands, checked by CI; the canvas menus stay on the editor key table with a CI check that each item is an action of that table.* Putting every canvas action in the global registry would add about 40 commands that mean nothing outside a focused diagram.
5. **What "normal" Output shows (MSG-005).** The spec defines normal as "one line per step a user asked for" and detailed as "everything 2.0 writes", and 119 call sites write entries without a level. *Recommended default: errors, warnings and successes are always shown; an `info` entry is shown at the normal level only if its call site marks it a step; the Output tab says how many detailed lines are hidden.* A message that reports a failure is never hidden.
6. **"That time in Trace" (TST-003, LRN-026).** The spec links a failed expectation "to that time in Trace". The Trace tab shows the live session's capture; a graded test run has its own recorded trace (the samples of the result). *Recommended default: the link opens Details and highlights that time in the run's recorded trace.* The alternative is to load the run's samples into the Trace tab, which makes Trace show two different things.
7. **"Run the test at the cursor" (TST-010).** A scenario file holds one scenario, so "the test at the cursor" has no finer unit than the file. *Recommended default: the scenario file of the active document, else the test selected in the Tests activity, else a located refusal.* The expectation under the cursor is not run alone: the engine runs a scenario whole.

## Findings in the spec and in the merged code (contradictions and things that could not be verified)
1. **TST-003 against the evidence that exists.** The assertion result holds `{ kind, passed, atMs? }` (`IDE/src/test-engine/index.ts:133-138`) and every surface's preview keeps exactly those (`IDE/src/cli/toolApi.ts:106`, `:245-290`); the presentation rejects other keys. There is no expected or observed value anywhere to show: Task T1 and question 2.
2. **Module size.** `IDE/src/components/Console.tsx` is 1524 lines against a 1600-line limit and `IDE/src/cli/toolApi.ts` is 1216 lines and "above its size ratchet" by its own comment (`IDE/src/learn/lessonCheck.ts`, the `ponytail` note). Without Task X0a no U2 task could add a line to the Console; T1 must add the smallest code to `toolApi.ts`.
3. **Instruction List is searched but not indexed.** `SEARCHABLE_LANGUAGES` has `IL` (`projectSearch.ts:33`), but the declaration tracker hard-codes `language: 'ST'` and reads Structured Text files (`store/projectSources.ts:48-53`), so IL declarations (`VAR ... AT %Q0.0`) are not symbols of the `ProjectIndex`. R1 reads them itself. Whether `scanFile` tolerates an IL body is **Unconfirmed**.
4. **The same I/O point is written two ways.** `zplc.json` documents `"%I0.0"` and `"%IW0"` (`IDE/src/types/index.ts:303`), Structured Text writes `%IX0.0`. A text search for one misses the other: R1's normalisation. Overlap (`%IB0` contains `%IX0.0`) is not matched in U2.
5. **SHL-004's "a session saved by 2.0 that names its old tab".** I found no persisted active results tab (`activeConsoleTab` is in the store, not in `IDE/src/utils/sessionState.ts`; **Unconfirmed**). The routing of old ids is still needed for commands and scripts (H6); the "session file of 2.0" journey proves what is actually stored.
6. **SHL-010's "A proposed change arrives: one notice with a Review action" has no implementation.** `reveal.ts:45` has the table row (`changeProposed: STAYS`) and nothing raises the notice. H1 adds it.
7. **A lingering notice swallows clicks over the editor** (logbook L47) and a late "Changed outside ZPLC" notice appears: FLW-013 (U1) says a notice MUST NOT cover text of the results panel, and a success notice leaves by itself. This is a U1 follow-up, not a U2 requirement. U2's journeys dismiss notices before they click, and Q1 asks the parent to confirm FLW-013 on the packaged application. *Owner question carried over from the logbook; not folded into U2 because no U2 requirement owns it.*
8. **`PlantDocument` reads the last test result from a shared store.** `PlantDocument.tsx:34` reads `useWorkspaceTestResult` (published by the Console while it is mounted, `shell/workspaceTestResult.ts:16-22`) for the replay. T2's store must keep publishing it, or the replay (TST-007) and the lesson's check state break.
9. **SHL-015 disagrees with itself.** "A state of another version MUST fall back to the defaults field by field, as it does today": today a state of another version falls back to the defaults **as a whole** (`useShellLayout.ts:44`) and only a wrong field inside the current version falls back alone. H5 keeps today's behaviour and pins both halves.
10. **The preview lists at most 8 scenarios** (`toolApi.ts` `testPreview`, `.slice(0, 8)` after failed-first ordering), so the verdict "N of M tests passed" is exact while at most 8 fail; with 8 it says "at least 8 failed". A project with more than 8 failing scenarios is not realistic today, but the limit is real.
11. **Grouping "by file" is degenerate.** One scenario per file (`cli/workspace.ts:58`): T2 shows a file row with its expectations as children.
12. **Two owner questions found overnight and not owned by U2.** (a) The Learn home puts about 27 path "Start" buttons between Continue and the switches (logbook L73, `LearnHomeView`): this is GDE-011 (SHOULD, "put Continue first ... and SHOULD NOT pin the hardware track over the list of lessons"), milestone U3; the Tab order is pinned by a test since `d2fbc4d5`. *Recommendation for U3:* a skip link "Skip to the switches" before the paths. (b) There is no region-jump key from a document back to the command bar (only `F6` = Pause, or `Ctrl+M` first in the editor, L73): spec 013 has no requirement for it (section 8.2 item 5 asks the main path be keyboard-completable, which is GDE/U3). *Recommendation:* a command `view.focusCommandBar` (not `F6`, which is Pause) in U3 or 2.1.x, registered and shown in the shortcut reference; it needs the owner's choice of key. Neither is folded into a U2 task.
13. **Registry counts in the spec are stale.** Spec 2.3 row 9 says 38 commands; the registry has about 56 after lane W (**Unconfirmed**), and 20 more after X0b. `interfaceBudget.targets.json` holds `resultsTabs.total: 9` "that move belongs to U2": H6 changes it to 5.
14. **The Edit menu.** The `edit` category exists and holds no command (`registry.ts:15`); how the application menu builds Edit (X0b) is **Unconfirmed** and decides whether the four navigation commands create the first command-driven Edit menu.
15. **Unconfirmed in this plan** (the executor confirms each first and records the answer in the commit body): the FBD and SFC model fields read by R1b; how `zplc.json` `io` rows bind to program variables (R2); whether `traceEvidenceSha256` covers assertions (T1); the exact names in `runtime/runPlan.ts` and `store/saveAll.ts` that carry the save preference (T2); whether `LabPanel` has a timeline control (T4); whether Monaco lets a later action replace a built-in keybinding (R4); where proposals are received (H1); the AI settings form's credential handling (H2); the names of the existing journey helpers and of the restricted AI and MCP regression test (P1); the docs pages that exist (D1).

## Done when (aligned with spec section 8.2, for U2)
- [ ] The owner has the answers or accepted defaults of the open questions; if question 2 was declined, TST-003 is recorded as partial and T1 did not run.
- [ ] The Tests activity lists the project's tests with their last result and runs one or all by pointer and by keyboard, with no chooser; running never fails for an unsaved document (TST-001, TST-002, TST-005, FLW-006; T2).
- [ ] The Test results tab opens with the verdict in one sentence, then the failed tests with the expectation, time, expected and observed value and the links, passed tests collapsed, the whole 2.0 evidence record behind a closed Details, and the boundary stated once as a badge (TST-003, TST-004, TST-008, MSG-003; T1, T3, V3). Interlock coverage, Replay, New test and the test commands exist (TST-006, TST-007, TST-009, TST-010; T4).
- [ ] The palette finds commands, files, PLC objects, I/O points, configuration editors, lessons, preferences and scenes in ranked groups, and every control of the command bar, the rail and the tab strips names a registered command (FND-001, FND-002; P1, P2). Search covers the five languages and opens a match in a diagram with the element selected (FND-003; R3). Go to definition and Find all references work for a variable, a function block instance and an I/O address from the editors, the I/O mapping and the Watch table, listing uses in all five languages (FND-004; R1, R1b, R2, R4); Back, Forward and the place bar exist or are recorded as pending (FND-006, FND-007; P3).
- [ ] The results panel shows Problems, Output, Test results, Watch and Trace with their names at 1366 by 768 in both languages and densities, and Terminal with a board or on request; Changes, Agent and Interlocks are reachable by command, palette and View menu, and an id of 2.0 opens its new place (SHL-003, SHL-004; H1, H3, H6). The secondary sidebar shows one view at a time and the Inspector shows the selection (SHL-008, SHL-009; H3). Preferences and Project settings are two documents and the theme has one control (SHL-011, SHL-012; H2). Each navigator group offers "New" with a skeleton that builds and Close project is a File command (SHL-013; H4). Reset layout works and nothing of the main path is clipped at 1366 by 768 (SHL-015, SHL-016; H5).
- [ ] The vocabulary of MSG-001 is defined once, the i18n guard fails on an implementation term on a main-path key and on a second statement of the boundary, its offenders list is empty, failure messages say what to do, Output has two levels, and hashes, sizes and times are formatted (MSG-001 to MSG-006; V1, V2, V3).
- [ ] Documentation exists in English and Spanish for what changed, in the vocabulary of MSG-001; the stale screenshots are listed for the parent to regenerate (constitution rule 8; D1).
- [ ] All 2.0 and U0/U1 suites pass unchanged except the tests that froze the old layout or text, each listed in the commit that changed it (VF-006, spec 8.2 item 4): lessons, plants, smoke, journeys, the content security policy test, the restricted AI and MCP regression. `bun run lint`, `bun test`, `bun test ./tools/ci`, `bun test tools/docs`, `bun tools/ci/requirement-coverage.ts --check`, `bun scripts/interfaceBudget.ts --check` and the pinned formatter `--check` pass. The screen-reader capture passes in English and Spanish.
- [ ] The independent verifiers of X0b, T1, P1, R1/R1b/R2/R4, H1, H2, H3 (with H4) and T3 returned with no open blocker; the requirement coverage reports U2's requirements `covered`, conditional ones with their decision, U3's `pending` (spec 8.2 item 1).
- [ ] The tree can ship as 2.1.x with or without any task of U2 (decision D-24): each merged task leaves the application working and each unmerged one leaves its 2.0 surface in place.
