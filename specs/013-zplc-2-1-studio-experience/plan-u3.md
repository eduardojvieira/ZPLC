# ZPLC 2.1 Studio Experience, Milestone U3 Implementation Plan: the Guide, the outline, the reading frame, first use, and the homes of plant authoring (PROVISIONAL, revision 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Provisional.** U3 builds on U0, U1 **and U2** of spec 013. This revision was written against `feat/plant-simulation` at `a2c80b32` (U0 and U1 merged; **U2 is not**: its first tasks X0a and X0b are starting while this plan is written, see `plan-u2.md`). Every dependency on a U2 task is named by id (`U2-H3`) and every dependency on spec 012 work by its plan (`M7-E1`, `M6-<id>`). Spec 013 is **Draft**: the owner took decisions D-20 to D-26 on their recommended defaults on 2026-11-12, and approval of the document as a whole is not recorded. U3 is not on the path of 2.1.0 (decision D-24, option B), except that **PLS-005, PLS-006 and PLS-008 ship with the features of spec 012 they place** (spec section 9): P2 to P5 and P8 therefore follow the M7 editor and M6 plant I/O mode, and every other task can be merged on its own and shipped in 2.1.x. Nothing here is verified on a running application on macOS or Windows; the measures of spec section 8.1 are checked on Linux by `IDE/scripts/interfaceBudget.ts`.

**Goal:** Deliver milestone U3 of spec 013 (section 9: "The Guide, the outline, the reading frame, first use; the homes of the scene editor, the signals, the plant map and plant I/O mode; the docs and screenshots"; requirements GDE-001 to GDE-013, PLS-004 to PLS-011, and items 5, 6 and 8 of the definition of done in section 8.2). Concretely: a lesson is always the **Guide** in the secondary sidebar, one stage at a time, with Check fixed at its bottom edge and visible at 1366 by 768; the course is an outline in the Learn activity (paths and modules that open and close, state icons with text, a filter), no longer a list of toggle buttons inside the lesson; a reading page covers the whole workbench with the lab's own controls as the only run controls; Practice opens the lesson layout; a first-time user reaches a running simulated blink in at most three actions; and the plant surfaces of spec 012 get their final regions: the toolbar of the plant document holds only plant things, the parts catalogue and the signal list are the Plant activity, the properties of the selected part are in the Inspector, the plant map is a configuration editor beside the I/O mapping, the scene's problems are in Problems, undo and redo are Edit menu commands, a Plant group and "Add a plant" are in the navigator, an input has one owner, and "Feed the board from the plant" is an explicit, confirmed action with a third state in the status rail.

**Architecture:** U3 adds no framework and no dependency. Seven seams carry it. (1) **A view table** (`IDE/src/shell/views.ts`, Task X1b): `Sidebars.tsx` stops growing a `switch`; each activity body and each secondary-sidebar view is a lazily imported component named in one table, with the three new ones (`LearnOutline`, `PlantView`, `GuideView`) as empty stubs, so G1, G3 and P2 edit only files of their own. (2) **The Guide is three components and the existing hooks**: `GuideHeader`, `GuideStages`, `GuideActionBar` read `buildCourseView`, `useLessonCheck` and the stage model that `LearnPanel.tsx` reads today; the course list leaves `LearnPanel` for `LearnOutline` (GDE-002) and `LearnPanel.tsx` shrinks until G1 deletes it. (3) **Check is one action**: `useLessonCheck` follows the run plan of U1 (FLW-006), builds, runs the reference scenario headless and publishes the verdict that `U2-T3` renders; the Tests surface is never needed (GDE-004). (4) **The reading frame is a layer over the whole workbench**, not over `main` (`WorkbenchShell.tsx:177-191`): one store flag hides the command bar's run controls, the status rail and the results panel (GDE-006). (5) **One plant edit session** (`IDE/src/plant/editSession.ts`, Task P1): the edit state that lives in `useState` inside `PlantPanel` (`PlantPanel.tsx:111`) becomes a store, so the part list (Plant activity), the part form (Inspector) and the signal table (beside the plant-map editor) are three views of one `SceneEditor` and one `MapEditor`, and Undo and Redo become commands of the Edit menu acting on it. (6) **The plant map is a configuration editor kind** (`CONFIG_EDITOR_KINDS`, `IDE/src/navigator/configEditors.ts:7`), so it opens in the editor area beside the I/O mapping, and the surface registry and the palette see it without new machinery. (7) **Plant I/O mode is a command and a status**: a `physical` registry command, an alert dialog, and a third state of the one program state of the status rail; the session, the mirroring switch and the measured latency come from the firmware milestone (M6) through a typed interface that U3 fakes in tests.

**Tech Stack:** TypeScript 5.9 (`erasableSyntaxOnly`: no parameter properties), React 19 with the React Compiler lint, Zustand stores, Bun 1.3.14 (`bun test`), the Studio UI kit (`IDE/src/ui`), Playwright-style journeys through the existing `IDE/scripts/journeys.ts` harness, Docusaurus v3 for the docs. **No new dependency.**

**Spec:** `specs/013-zplc-2-1-studio-experience/spec.md` sections 4.2 (decisions D-20 to D-26), 4.3, 5, 6 (workstreams GDE and PLS), 7, 8 and 9; `plan-u2.md` (the format model and its tasks); `specs/012-zplc-2-1-plant-simulation/plan-m7.md` (the editor and the course that U3 places and opens); `plan-m1.md` revision 2 (Task E3, lane W); the run logbook `odd/tasks/zplc-2-1-0-run.md` in the main checkout (L73: the Learn home Start buttons and the region-jump key; L154); `specs/013-zplc-2-1-studio-experience/baseline/interface-budget-2.1-m1.json`.

**Created:** 2026-11-13 by a planning agent. Anything marked **Unconfirmed** was not verified while writing; the executor confirms it first and records the answer in the commit body. "Plan choice" marks a design decision of this plan that the spec does not state.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`. `bun test`, `bun run lint` and `bunx tsc -b` run with `IDE/` as the working directory unless the step says "at the root". The pinned formatter is `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` (or `--check`), at the root, after `git add`. Task ids are local to this plan; cite them as `U3-G1` from another document, and `M7-E1`, `U2-H3` for the sibling plans.

## Roles
| Role | Does |
|---|---|
| Executor | One task each, in its lane. Writes tests first, runs the commands, commits. Never edits a file outside the task's "Allowed edit surfaces". `git add` every new file **before** running the formatter. |
| Parent | Owns git across lanes, merges lanes in dependency order, runs the seam check (the full IDE suite once) at each wave merge, owns the shared files named in "Shared files and who edits them", runs `format --write` after each merge batch, and launches the independent verifiers named in "Done when". |
| Owner | Answers the open questions (the key of the region-jump command is the owner's choice), runs the macOS and Windows checks (the interface budget and the screen-reader capture are measured on Linux only), **holds the three people of GDE-013**, and runs every physical step of plant I/O mode (AGENTS.md guideline 7: no flash, deploy, force, RUN/STOP, raw serial or shell by AI). |

## Start rule
1. **Hard precondition: U2-X0a and U2-X0b merged** (the Console split and the registry contract). Confirm: `fd -t f . IDE/src/components/console` shows `TestsTab.tsx`; `rg -n "u2Commands" IDE/src/i18n/en.ts` matches; `fd -t f . IDE/scripts/journeys013` lists `u2-*.ts`. If not, stop: the parent merges first. Tasks marked "needs U2-<id>" additionally wait for that task (see the lanes table); the first wave has only X1a depend on U2.
2. **Precondition B, U0 and U1 as merged** (already in the tree at `a2c80b32`): `rg -n "export const SURFACES" IDE/src/shell/surfaces.ts`; `fd -t f . IDE/src/shell` lists `PlantDocument.tsx reveal.ts Sidebars.tsx`; `rg -n "file.saveAll" IDE/src/commands/registry.ts` matches.
3. **Precondition C, the sibling plans.** P2, P3, P4 need `M7-E1` (declarations) and `M7-E2` (the grouped catalogue list) merged; G2 and G4 need `M7-K1` (a scene lesson opens and grades in the application); P8 needs the plant I/O session contract of M6 (`M6-<id>`, **Unconfirmed**: plan-m6.md is being written). A task whose precondition is missing stops and reports; it does not invent the contract.
4. **The owner's answers.** Not blocking: the plan proceeds on the recommended default of every question, except question 1, which gates the shortcut of `view.focusCommandBar` in G5 only (the command itself is registered without a shortcut until answered).
5. **Fresh worktree.** `export TMPDIR=$HOME/.cache/zplc-tmp`, `bun install`, `bun run build:compiler`, `bun run build:runtime`; then, for journeys and captures, `node install.js` in `IDE/node_modules/electron` and `bun run electron:compile` in `IDE/`.

## Requirement mapping
| Requirement | Task(s) | Note |
|---|---|---|
| GDE-001 | G1, X1b | "While a lesson project is open, the lesson MUST be the Guide view of the secondary sidebar, whatever the activity." Today the lesson is the **primary** sidebar on the Learn rail and a toggle (`lesson`/`inspector`) in the secondary one otherwise (`IDE/src/shell/shellRouting.ts:27-28`, `Sidebars.tsx:84-90`). |
| GDE-002 | G3 | The Learn activity shows the course as an outline: paths and modules that open and close, state icon plus text, current lesson marked, filter, locked lessons say what unlocks them on hover and focus. After M7 the course has 20 modules, 3 paths and up to 111 lessons. The Guide has no list. |
| GDE-003 | G1 | Title and position, stages one at a time with Back and Next and a jump list, hints, action bar fixed at the bottom edge with Check primary, then Reset, Read again, Solution. Check visible without scrolling at 1366 by 768. "Lesson 4 of 21" is **plan choice R-G3** (below). |
| GDE-004 | G2 | Check is one action: it follows FLW-006, builds, runs the reference scenario headless and shows the verdict and the failed expectation in the Guide. No Tests surface. |
| GDE-005 | G1 | The file paths, scenario ids and the record of the check are in a "Files and record of this lesson" disclosure (MSG-002). No language control in the Guide. |
| GDE-006 | G4 | A reading page covers the whole workbench under a header (Back to course, title, position, Practice); the command bar's run controls, the status rail and the results panel are not visible while it is shown. |
| GDE-007 | G4 | Practice opens the lesson layout (first file, the plant beside it when the lesson names a scene, the Guide); a "Lesson layout" command restores it. |
| GDE-008 | G1 | After a pass the Guide offers the next lesson of the path (LRN-002). |
| GDE-009 | G1 | The board track is a closed section of the Guide with the connection indicator of UX-018. Every physical action stays the learner's (LRN-015). |
| GDE-010 | G6 | Welcome to a running simulated blink in at most three actions. |
| GDE-011 | G5 | Continue first; the hardware track not pinned over the list; a skip link (plan-u2 finding 12(a)). |
| GDE-012 | G6 | First time each region is shown, an empty state names the one action most users take next. |
| GDE-013 | G7 | Three observed first-use sessions: **an Owner step**; G7 delivers the protocol and the record, not the sessions. |
| PLS-004 | P1 | The toolbar of a plant document holds the view switch, camera presets, Reset plant, fault actions, add and remove item, and "Edit scene" (only while stopped). The scene chooser, the save button, and Undo, Redo, Done leave it. |
| PLS-005 | P2, P3, P5 | Parts catalogue = the sidebar of the Plant activity (P2); properties of the selected part = the Inspector (P3); scene problems in Problems, selecting the part, undo and redo as Edit menu commands, Save and Save all (P5). |
| PLS-006 | P2, P4 | The Plant activity lists the signals with type, direction and binding (P2); the plant map is a configuration editor beside the I/O mapping, an unbound or mismatched signal is a problem that opens its row, "Create the declarations" is an action of that editor (P4, over `M7-E1`). |
| PLS-007 | P7 | One owner per input (P18): the faceplate in the Watch tab; an input the plant feeds is read-only there, marked "from the plant", and can still be forced; the motor buttons of the Trace tab retire once a journey proves the faceplate sets the same inputs. |
| PLS-008 | P8 | Plant I/O mode starts with an explicit, confirmed action; a third state in the status rail with a mirroring mark and the measured latency. **Needs M6.** |
| PLS-009 | P1 | A failure of the view or of a scene is shown in the plant document with the schematic offered (partly built: `PlantPanel.tsx:262-280`; P1 adds the missing test for a failed scene). |
| PLS-010 | P1 | A plant document that is not visible draws no frames (partly built: `data-visible`, the `visible` prop; P1 adds the test over the lesson layout and the split). |
| PLS-011 | P6 | The navigator shows a Plant group, with the scene and the plant map, when the project has a plant, and an "Add a plant" action that offers the templates of SCN-016 when it has none. |
| 8.2 item 5 | Q1 | The main path with the split and a plant document is completable by keyboard alone; contrast and labelling (UX-024, UX-026) pass on every new surface. Includes the region-jump command (G5). |
| 8.2 item 6 | D1, D2 | `IDE/DESIGN.md` and `IDE/PRODUCT.md` describe the shipped interface (UX-032); pages and screenshots regenerated in English and Spanish in the vocabulary of MSG-001. |
| 8.2 item 8 | G7 | The results of GDE-013, if the sessions were held, are recorded. |

**Not delivered by U3** (other milestones, other plans, or out of scope): PLS-001 to PLS-003 and PLS-012, PLS-013 (U0 and U1, merged or planned there); the quality setting of Preferences (VIS-005, with PLS-012 in U2-H2); the plant core, rendering, catalogue, scenes, link and course (spec 012); a window of its own for the plant (spec 012's SHOULD: `M7-W1`; U3 only needs the command id to exist: X1a registers `view.plantWindow` only if `M7-W1` merged); lesson content (GDE Out).

## Contract extensions (types and rules; lanes code against these, never against each other)
U3 extends the registry, the surface table and two stores; it changes no lesson, scene or scenario format.

```ts
// IDE/src/plant/editSession.ts  (Task P1; the one edit state of the plant, replacing useState in PlantPanel.tsx:111)
export interface PlantEditSession {
  /** Null while no scene is being edited. */
  readonly editor: SceneEditor | null;
  readonly mapEditor: MapEditor | null;
  /** Bumped after every edit, undo and redo, so views that read the editor re-render (replaces PlantPanel's `version`). */
  readonly version: number;
  /** The scene the session was opened on: the reference of the plant document that owns it. */
  readonly sceneRef: string | null;
}
export interface PlantEditActions {
  begin(ready: { scene: PlantSceneFile; map: PlantMapV2 | null }, ref: string): void;
  end(): { scene: string; map: string } | null; // the texts the plant core is rebuilt from (the SceneOverride of usePlantSession)
  undo(): void; redo(): void;
  setMapEditor(mapEditor: MapEditor): void;
  touch(): void;
}
export declare const usePlantEdit: UseBoundStore<StoreApi<PlantEditSession & PlantEditActions>>;
// Rule R-P1: undo, redo and begin refuse (no-op) while the plant is running (SCN-008); the views show why from the plant state.
```

```ts
// IDE/src/shell/views.ts  (Task X1b)
export type PrimaryView = 'project' | 'search' | 'tests' | 'learn' | 'plant';       // ActivityView gains 'plant'
export type SecondaryView = 'inspector' | 'assistant' | 'guide';                     // U2-H3 adds the first two
export declare const PRIMARY_VIEWS: Record<PrimaryView, LazyExoticComponent<() => JSX.Element>>;
export declare const SECONDARY_VIEWS: Record<SecondaryView, LazyExoticComponent<() => JSX.Element>>;
// Rule R-G1: the Guide shows exactly one lesson and no list of lessons; the Learn activity is the only place the course is listed.
```

```ts
// IDE/src/commands/registry.ts  (Task X1a adds the ids; each is bound only in the file named; `enabled` rules in the task that binds it)
//   view.guide, view.lessonLayout, view.focusCommandBar, learn.guide.next, learn.guide.back, learn.check,
//   plant.edit, plant.endEdit, plant.createDeclarations, edit.undo, edit.redo (if U2-X0b has not added them),
//   plant.feedBoard   (physical: true; the Online menu and the plant document; Task P8)
// Rule R-G2: `learn.check` is one command: save per FLW-005, build, run the reference scenario, show the verdict in the Guide.
// Rule R-G3 (plan choice): the position in the title is the lesson's place in the path it was opened from ("Lesson 4 of 21"); a lesson opened
//   outside a path says its place in its module ("Lesson 2 of 4 in module 13"). The spec's "of 21" assumed one path; after spec 012 there are three.
```

## Lanes and dependency graph
**KEEP** = survives a change of spec 013's draft status. **ON M7 / ON M6** = needs that milestone's output (named). Every task can merge alone.

| Lane | Task | Title | Kind | Depends on | Lane-owned surface (summary) |
|---|---|---|---|---|---|
| X | X1a | Contracts: ids, catalogs, empty modules, journey files | KEEP | **U2-X0b** | `IDE/src/commands/registry.ts`, `IDE/src/i18n/catalog/u3*.ts`, `IDE/src/commands/bind/{guide,plantEdit}.ts`, `IDE/scripts/journeys013/u3-*.ts` |
| X | X1b | The view table and the Plant activity entry | KEEP | **U2-H3, U2-H6** | `IDE/src/shell/{views,surfaces,Sidebars,ActivityRail}.ts*`, `store/useShellLayout.ts`, `interfaceBudget.targets.json` |
| G | G1 | The Guide view | KEEP | X1b, **U2-H3**, **U2-V1** | `IDE/src/components/guide/{Guide,GuideHeader,GuideStages,GuideActionBar}.tsx` |
| G | G2 | Check is one action | KEEP, ON M7 (scene lessons) | G1, **U2-T3**, **U2-T1** (optional), **M7-K1**, U1 run plan | `IDE/src/learn/useLessonCheck.ts`, `IDE/src/commands/bind/guide.ts` |
| G | G3 | The Learn activity outline | KEEP | X1b, **U2-V1** | `IDE/src/components/learn/LearnOutline.tsx`, `courseOutline.ts` |
| G | G4 | The reading frame and the lesson layout | KEEP, ON M7 (plant beside) | **U2-H5**, X1a, P1 | `IDE/src/shell/WorkbenchShell.tsx` (second owner), `components/LearnReadingView.tsx`, `store/useLearnLayout.ts` |
| G | G5 | The Learn home and the region-jump command | KEEP | X1a | `IDE/src/components/LearnHomeView.tsx`, `commands/bind/guide.ts` (second owner) |
| G | G6 | First use: three actions to a blink, empty states | KEEP | X1a, U1 | `IDE/src/components/WelcomeScreen.tsx`, `components/EmptyState.tsx`, `IDE/scripts/journeys013/u3-g6.ts` |
| G | G7 | The first-use sessions: protocol and record (**Owner step**) | KEEP | none | `specs/013-zplc-2-1-studio-experience/evidence/gde-013-*.md` |
| P | P1 | One plant edit session; the plant toolbar | KEEP | X1a, **U2-T4** | `IDE/src/plant/editSession.ts`, `plant/ui/PlantPanel.tsx`, `shell/PlantDocument.tsx` |
| P | P2 | The Plant activity: the catalogue and the signal list | KEEP, ON M7 | P1, X1b, **M7-E2** | `IDE/src/plant/ui/PlantView.tsx` |
| P | P3 | The Inspector edits the selected part | KEEP | P1, **U2-H3** | `IDE/src/components/inspector/PlantPartInspector.tsx`, `WorkbenchInspector.tsx` |
| P | P4 | The plant map is a configuration editor | KEEP, ON M7 | P1, X1b, **U2-H4**, **M7-E1** | `IDE/src/navigator/configEditors.ts`, `plant/ui/PlantMapEditor.tsx` |
| P | P5 | Edit menu, Problems and Save | KEEP | P1, X1b, **U2-H6** | `IDE/src/commands/bind/plantEdit.ts`, `plant/ui/plantProblems.ts` |
| P | P6 | The navigator Plant group and "Add a plant" | KEEP | P1, **U2-H4** | `IDE/src/navigator/plantGroup.ts`, `components/Sidebar.tsx` (second owner) |
| P | P7 | One owner per input: the faceplate | KEEP | P1, **U2-H6** | `IDE/src/components/DebugWatchPanel.tsx`, `runtime/faceplateState.ts`, `runtime/nativeTrace.ts` |
| P | P8 | Plant I/O mode in the shell | ON M6 | P1, X1b, U1 status rail, **M6** | `IDE/src/plant/ui/PlantIoMode.tsx`, `store/statusRail*`, `commands/bind/plantEdit.ts` (second owner) |
| D | D1 | Documentation and `DESIGN.md`/`PRODUCT.md` in English and Spanish | KEEP | all code tasks | `docs/docs/*`, `docs/i18n/es/*`, `IDE/DESIGN.md`, `IDE/PRODUCT.md` |
| D | D2 | The screenshots, regenerated | KEEP | D1 and all UI tasks | `docs/static/img/screens/*`, `tools/docs/capture-screenshots.ts` |
| Q | Q1 | Budget, requirement coverage, keyboard main path, closing checks | KEEP | all | `IDE/scripts/interfaceBudget*`, `tools/ci/requirement-*`, `IDE/scripts/journeys013/u3-q1.ts` |

**Graph.**
```
U2-X0b -> X1a -> G5, G6 (U1), P1 (U2-T4) ; G7 (standalone)
U2-H3, U2-H6 -> X1b -> G1 (U2-V1), G3 (U2-V1) ; X1b, P1, M7-E2 -> P2 ; P1, U2-H3 -> P3
G1, U2-T3, M7-K1 -> G2 ; U2-H5, P1 -> G4
P1, X1b, U2-H4, M7-E1 -> P4 ; P1, X1b, U2-H6 -> P5 ; P1, U2-H4 -> P6 ; P1, U2-H6 -> P7
P1, X1b, M6 -> P8 ; all code -> D1 -> D2 ; all -> Q1
```
**Parallel waves** (tasks of a wave have disjoint file surfaces and may run together; the parent merges at the end of each wave and runs the seam check):
1. **X1a** (after U2-X0b), then **G5, G6, G7**. (G7 is the owner's protocol and starts any time.)
2. **P1** (after U2-T4), **X1b** (after U2-H3 and U2-H6).
3. **G1, G3, G4** (G4 after U2-H5 and P1), **P3, P5, P6, P7** (each edits files of its own created by X1b or owned alone).
4. **G2** (after G1 and M7-K1), **P2** (after M7-E2), **P4** (after M7-E1 and U2-H4).
5. **P8** (after M6).
6. **D1**, then **D2**, then **Q1**.

### Shared files and who edits them
A file with two owners is edited by the earlier wave first; the later owner starts from the merged result.
- `IDE/src/commands/registry.ts`: only X1a (the ids above) and P8 (the `physical` pin of `plant.feedBoard` goes in `commands.test.ts`, with X1a declaring the id). `IDE/src/commands/bind/guide.ts`: G2, then G5. `bind/plantEdit.ts`: P5, then P8. `useCommandHost.ts`: only X1a (mount). A task that needs a command that is not declared asks the parent.
- `IDE/src/i18n/en.ts`, `es.ts`: only X1a (it imports the empty catalogs once). Each task adds keys only to the catalog it owns: `u3Guide.ts` (G1, then G2), `u3Learn.ts` (G3, then G5, G6), `u3Reading.ts` (G4), `u3Plant.ts` (P1, then P2, P3, P4, P5, P6), `u3Faceplate.ts` (P7), `u3IoMode.ts` (P8). **U2's catalogs `learnHome.ts`, `toolbarMsg.ts`, `statusText.ts`, `notices.ts` belong to U2-V2**: U3 adds no key there; the words of U3 are checked by the vocabulary guard of U2-V1 and listed in `u3*.ts`.
- `IDE/src/shell/Sidebars.tsx`, `views.ts`, `surfaces.ts`, `ActivityRail.tsx`, `store/useShellLayout.ts`: only X1b (U2-H3 and U2-H6 own them before it). After X1b the sidebars are edited by no task: G1, G3, P2 write the stub components `GuideView`, `LearnOutline`, `PlantView` named in `views.ts`.
- `IDE/src/shell/WorkbenchShell.tsx`: U2-H5, then G4 (nobody else).
- `IDE/src/plant/ui/PlantPanel.tsx`, `IDE/src/shell/PlantDocument.tsx`: only P1 in U3 (U2-T4 owns them first for the Replay); `plant/editor/*` is **M7's** (E1, E2) and U3 edits none of it.
- `IDE/src/components/LearnPanel.tsx`: G1 deletes the course list and the lesson body into the Guide components in one commit and leaves a re-export for one release; no other task edits it. `IDE/src/learn/useLessonCheck.ts`: only G2 (M7-K1 owns `lessonCheck.ts`, not this hook).
- `IDE/src/components/WorkbenchInspector.tsx`: U2-H3, then P3. `IDE/src/navigator/configEditors.ts`: U2-H4, then P4. `IDE/src/components/Sidebar.tsx` (the navigator): U2-H4, then P6.
- `IDE/scripts/journeys013.ts` (the registration list): only X1a, which creates the empty files `scripts/journeys013/u3-<task>.ts`, so tasks never edit the list. `IDE/scripts/screen-reader-capture.ts`, `run-desktop-smoke.ts`, `smoke-studio-vertical.ts`: several tasks migrate them; each edits only the step it changes and the parent resolves a textual conflict at the wave merge.
- `tools/ci/requirement-evidence.json`, `requirements-index.json`: only Q1. `docs/sidebars.js`: only the parent.

## Global Constraints
- **The Global Constraints of `plan-u2.md` and of `plan-m4.md` apply unchanged** (their integration lessons: `git add` before the formatter; text through `t()` with the neutral usted register and the product named "ZPLC"; **new interface text says "Plant", never "Lab"** (D-25); lines at most 140 columns; tests that import `useIDEStore` call `stubProjectLoader()` first; `itNative` for native-runtime tests; `erasableSyntaxOnly`; the React Compiler lint (no mutation in render, no ref read in render, components select the store fields they show); journeys need `ZPLC_NATIVE_SIM_BIN` in the same command; `/tmp` may be out of inodes; Monaco traps Tab, so a keyboard walk that crosses the editor presses Ctrl+M first, **which is exactly what G5's region-jump command removes**; a select never acts on change; a lingering notice swallows clicks, so journeys dismiss notices first). U3 adds the following.
- **No lesson changes.** The lesson, curriculum and path suites of 2.0 and of M7 pass unchanged: `bun test src/learn src/components/learnLesson.test.ts` after every Learn task. A test changes only where it froze the old layout (VF-006), and the change is named in the commit body and the pull request.
- **Words come from MSG-001 and the guard of U2-V1.** No implementation term (file path, scenario id, hash) on a main-path key; they live in the "Files and record of this lesson" disclosure. Every new key exists in English and Spanish with the same placeholders.
- **Focus and keyboard are requirements, not polish.** Every new surface has a registered command that opens it (SHL-002), a named landmark, a visible focus ring, a text equivalent for every state icon (UX-024, UX-026), and a keyboard path; the Guide's action bar is reachable from the document in at most one Tab press from a region-jump (G5). Contrast is checked in the three display modes (`domAudit.ts`).
- **No physical operations.** Nothing here connects, deploys, forces, runs a board or starts plant I/O mode. P8 builds a command, a dialog and a status state and tests them against a fake session; its `physical` pin keeps it out of AI and MCP reach (AGENTS.md guideline 7). Every run against a board is the Owner's.
- **Verification commands (per task, in this order).** In `IDE/`: `bun test <the task's test paths>`, `bunx tsc -b`, `bun run lint`. At the root, once at the end: the pinned formatter `--check`, `bun test ./tools/ci`, `bun tools/ci/requirement-coverage.ts --check`, `bun scripts/interfaceBudget.ts --check` (in `IDE/`) when the task touches a counted surface. A task that touches docs also runs `bun test tools/docs`. The parent runs the full IDE suite at each wave merge. A finding is a finding: do not change a threshold or a test to make a check pass.
- **Budgets (spec 8.1) are not regressed**: the interface budget script counts rows 2, 3, 6, 7 and 8 per state, language and density; a task that adds a control to the command bar, a tab or a status item says so and updates `interfaceBudget.targets.json` only through X1b and Q1.
- **Dependencies and security.** No new dependency; the content security policy and the sandbox do not change; U3 touches no file under `IDE/electron/`.
- **Tests through public interfaces**, requirement ID first in the test name. When a task changes an existing component, option or command, one test proves its previous behaviour still holds (G1: the grade states of `LearnPanel` render in the Guide with the same `data-learn-*` attributes; P1: a plant that is not edited renders as before; G5: the Tab order of the Learn home is pinned by the existing test).
- **Docs.** English and Spanish in parallel (AGENTS.md, guideline 4), `docs/docs/` and `docs/i18n/es/docusaurus-plugin-content-docs/current/`; every claim is a measured fact or states "not yet measured".
- **Commits.** Conventional Commits, no AI attribution, no Co-Authored-By line, work-unit commits with tests and docs alongside the behaviour; about 400 changed lines is a heuristic (G1, P1 and P4 may exceed it; say why). Pushing and merging are the owner's.
- **Shell.** `bat`, `rg`, `fd`, `eza`; not `cat`, `grep`, `find`, `ls`.

## Review Focus (conditions the spec implies; each has a test in the task that owns it)
1. The Guide never contains the list of lessons and never holds a language control; the Learn activity is the only list (GDE-002, GDE-005; G1, G3).
2. Check is visible without scrolling at 1366 by 768 in both languages and the three densities, with a hint and a long stage open (GDE-003; G1, Q1).
3. A Check from the Guide never opens or needs the Tests surface, builds when stale, and shows the failed expectation (GDE-004; G2).
4. While a reading page is shown, no run control of the command bar, no status rail and no results panel is visible, and the lab's controls are (GDE-006; G4).
5. The state of a lesson, a locked lesson's reason, and the current lesson are never conveyed by colour or icon alone (GDE-002, UX-024; G3).
6. The plant document has no play, pause, step or reset control of its own, and its toolbar holds only plant things (PLS-003, PLS-004; P1).
7. One scene, one edit session: the part list, the form and the signal table always show the same selection and the same signals; undo from the Edit menu updates all three (PLS-005, PLS-006; P1 to P5).
8. A refused edit leaves the scene, the session and the trace hash unchanged; no edit runs while the plant runs (SCN-008; P1, P5).
9. An input has one owner at a time; a plant-fed input is read-only in the faceplate, marked, and can still be forced (PLS-007, LNK-006; P7).
10. Plant I/O mode starts only from an explicit, confirmed, `physical` action; the status rail's third state differs in text, icon and colour; a failed confirmation changes nothing (PLS-008; P8).
11. The 2.0 plant lessons and plants, the lesson suites and the journeys pass unchanged (PLT-013; all).

---

### Task X1a: Contracts: ids, catalogs, empty modules, journey files
**Spec:** FND-002 (every surface and action a registered command), UX-015. **Lane X. Wave 1. KEEP. Needs U2-X0b.**

**Allowed edit surfaces**
```
IDE/src/commands/registry.ts
IDE/src/commands/commands.test.ts
IDE/src/commands/useCommandHost.ts
IDE/src/commands/bind/index.ts
IDE/src/commands/bind/guide.ts
IDE/src/commands/bind/plantEdit.ts
IDE/src/i18n/en.ts
IDE/src/i18n/es.ts
IDE/src/i18n/catalog/u3Guide.ts
IDE/src/i18n/catalog/u3Learn.ts
IDE/src/i18n/catalog/u3Reading.ts
IDE/src/i18n/catalog/u3Plant.ts
IDE/src/i18n/catalog/u3Faceplate.ts
IDE/src/i18n/catalog/u3IoMode.ts
IDE/scripts/journeys013.ts
IDE/scripts/journeys013/u3-g1.ts
IDE/scripts/journeys013/u3-g4.ts
IDE/scripts/journeys013/u3-g5.ts
IDE/scripts/journeys013/u3-g6.ts
IDE/scripts/journeys013/u3-p.ts
IDE/scripts/journeys013/u3-q1.ts
```
Declare the ids of "Contract extensions" (titles in the six catalogs, empty bind files, one `physical: true` for `plant.feedBoard`, no shortcut for `view.focusCommandBar` yet), create the six empty catalogs and import them once, and create the empty journey files and their registration. `edit.undo` and `edit.redo` are added only if `rg "edit\.undo" IDE/src/commands/registry.ts` shows U2-X0b did not.
- [ ] **Step 1: Failing tests:** `'FND-002 every command id declared by U3 has a title in English and Spanish'`, `'FND-002 plant.feedBoard is physical and is absent from the AI and MCP command list'` (the pinned list at `commands.test.ts`, **Unconfirmed** line; the physical list was `:111` in U2), `'FND-002 the six U3 catalogs have the same keys in both languages'`.
- [ ] **Step 2 to 4:** `bun test src/commands src/i18n`, `bunx tsc -b`, `bun run lint`. **Commit:** `chore(ide): command ids, catalogs and journey files for the Guide and the plant homes`. **Risk:** item 3 (the registry is a contract the palette, menus, AI and MCP read; the `physical` pin is the guard).

---

### Task X1b: The view table and the Plant activity entry
**Spec:** SHL-002, SHL-005, PLS-005. **Lane X. Wave 2. KEEP. Needs U2-H3 and U2-H6 merged (they own these files first).**

**Allowed edit surfaces**
```
IDE/src/shell/views.ts
IDE/src/shell/Sidebars.tsx
IDE/src/shell/surfaces.ts
IDE/src/shell/surfaces.test.ts
IDE/src/shell/ActivityRail.tsx
IDE/src/shell/ActivityRail.test.tsx
IDE/src/store/useShellLayout.ts
IDE/src/components/guide/GuideView.tsx
IDE/src/components/learn/LearnOutline.tsx
IDE/src/plant/ui/PlantView.tsx
IDE/scripts/interfaceBudget.targets.json
```
Today `ACTIVITY_VIEWS` is `project, search, tests, learn` (`useShellLayout.ts:13`) and the surface table has no Plant activity and no Guide (`surfaces.ts:31-45`). Add `plant` to the rail (icon, title key, command `view.showPlant`, **Unconfirmed** whether U2-H3 or H6 already added it: `rg "activity\('plant'" IDE/src/shell/surfaces.ts`), the surfaces `activity.plant`, `secondary.guide`, `editor.config.plantMap` (the last is added with P4), and replace the `switch` of `ActivityBody` and the inline secondary logic of `SecondarySidebar` by the table of `views.ts`. The three stubs render a labelled empty region. The lesson routing (`lessonSurface`) now returns `secondary` for every activity, including Learn (R-G1, GDE-001). The interface budget gains the Plant rail item.
- [ ] **Step 1: Failing tests:** `'SHL-002 every surface of the table has a command and the command opens it'` (extended), `'GDE-001 with a lesson project open the lesson is the Guide of the secondary sidebar on every activity, Learn included'`, `'SHL-005 the Plant activity is on the rail with a title and a command'`, `'SHL-008 the secondary sidebar shows one view at a time'` (previous behaviour kept from U2-H3). Update `shellRouting.test.ts` for `lessonSurface` (the test froze the old layout: name it).
- [ ] **Step 2 to 4:** `bun test src/shell src/store src/components`, `bunx tsc -b`, `bun run lint`; `bun scripts/interfaceBudget.ts --check` in `IDE/`. **Commit:** `feat(ide): a view table for the sidebars, the Plant activity and the Guide's place`. **Risk:** item 6 mitigated (the shell tests and the budget script are the guard); a change of `lessonSurface` is behaviour every lesson sees.

---

### Task G1: The Guide view
**Spec:** GDE-001, GDE-003, GDE-005, GDE-008, GDE-009, LRN-010, LRN-029. **Lane G. Wave 3. KEEP. Needs X1b, U2-H3, U2-V1.**

**Allowed edit surfaces**
```
IDE/src/components/guide/GuideView.tsx
IDE/src/components/guide/Guide.tsx
IDE/src/components/guide/GuideHeader.tsx
IDE/src/components/guide/GuideStages.tsx
IDE/src/components/guide/GuideActionBar.tsx
IDE/src/components/guide/Guide.test.tsx
IDE/src/components/LearnPanel.tsx
IDE/src/components/LearnPanel.test.ts
IDE/src/i18n/catalog/u3Guide.ts
IDE/scripts/journeys013/u3-g1.ts
```
**Interfaces.** `LearnPanel` is 448 lines and renders the course list, file paths, a sentence about the starter, the result, every stage, the hints and the board section, with **Check last** (`LearnPanel.tsx:377`) and a second language control. The Guide renders, top to bottom (GDE-003): `GuideHeader` (title; position by R-G3), `GuideStages` (one stage at a time with Back and Next and a list to jump; the stage text, checkpoints and hints), the result of the last check, then `GuideActionBar` fixed at the bottom edge of the sidebar: **Check** (primary), Reset, Read again, Solution (behind the existing confirmations, `LearnPanel.tsx:328-348` kept in behaviour). The files, the scenario id and the record of the check are a closed "Files and record of this lesson" disclosure (GDE-005); the board track is a closed section with the connection indicator (GDE-009); after a pass a "Next lesson" action offers the next lesson of the path (GDE-008, `buildCourseView` already knows it). All state comes from `buildCourseView`, `useLessonCheck`, `useLearnUi`, `useLearnProgress` as `LearnPanel` reads them today; **the lesson text comes from the generated index** and is not edited. `LearnPanel.tsx` keeps one export that renders `Guide` for a release so a stale import does not break; its list moves to G3.
- [ ] **Step 1: Failing tests:** `'GDE-003 the Guide shows the title, the position, one stage with Back and Next, the hints and an action bar'`, `'GDE-003 the action bar is the last element and Check is the first control in it'`, `'GDE-001 the lesson is in the secondary sidebar on the Project activity and on the Learn activity'`, `'GDE-002 the Guide contains no list of lessons'` (no element with `data-learn-lesson-button`), `'GDE-005 file paths and the scenario id are inside a closed disclosure and there is no language control'`, `'GDE-008 after a pass the Guide offers the next lesson of the path'`, `'GDE-009 the board track is closed until opened and shows the connection indicator'`, `'PLT-013 the grade states and the data-learn attributes of 2.0 are unchanged'` (previous behaviour); build the cases from the **real generated index** (a 2.0 lesson and, after M7, a scene lesson), never hand-typed lesson shapes.
- [ ] **Step 2 to 4:** `bun test src/components src/learn src/shell`, `bunx tsc -b`, `bun run lint`; the journey of `u3-g1.ts`: start a lesson, read the stage, change the program, Check from the Guide without opening the results panel, pass, Next. **Commit:** `feat(learn): the lesson is the Guide of the secondary sidebar, one stage at a time, with Check fixed`. **Risk:** item 6 (every lesson is shown by this view; the 2.0 lesson suites unchanged and the journeys are the guard). **Independent verifier:** yes (Review Focus 1, 2).

---

### Task G2: Check is one action
**Spec:** GDE-004, FLW-006, LRN-022, LRN-026. **Lane G. Wave 4. KEEP, ON M7 (scene lessons). Needs G1, U2-T3, and `M7-K1` for scene lessons.**

**Allowed edit surfaces**
```
IDE/src/learn/useLessonCheck.ts
IDE/src/learn/useLessonCheck.test.ts
IDE/src/commands/bind/guide.ts
IDE/src/components/guide/GuideActionBar.tsx
IDE/src/components/guide/GuideResult.tsx
IDE/src/i18n/catalog/u3Guide.ts
IDE/scripts/journeys013/u3-g1.ts
```
The Check of 2.0 asks the learner to save, then press Check, and the primary button next to it opens the Tests tab (`LearnPanel.tsx:393`). `learn.check` follows the run plan of U1 (`store/saveAll.ts` and `runtime/runPlan.ts`, names **Unconfirmed**: read what Task W5 of plan M1 merged): save per the preference, build what is stale, run the lesson's reference scenario through the runner that `M7-K1` made scene-aware, publish the verdict. The Guide shows the verdict as a sentence and the failed expectation with its time, expected and observed value when `U2-T1` merged (else kind and time only, as U2's question 2 says), through the same component `U2-T3` renders. A refusal (no project, unsaved with "Ask") is a located message in the Guide. The command is the same function the button calls; the Tests surface, the results panel and the Trace tab are not opened.
- [ ] **Step 1: Failing tests:** `'GDE-004 Check saves, builds, runs the reference scenario and shows the verdict in the Guide with the results panel closed'`, `'GDE-004 a failed expectation is named with its time'`, `'GDE-004 Check never opens the Tests surface'` (spy on the surface reveal), `'FLW-006 a stale build is rebuilt by Check, an unsaved document is saved per the preference'`, `'LRN-022 only the reference scenario of the lesson grades'` (previous behaviour: a different scenario in the workspace does not grade), `'GDE-004 a scene lesson is graded on a plant fact'` (skipped with a reason until `M7-K1` merged: say so, never green by omission).
- [ ] **Step 2 to 4:** `bun test src/learn src/components/guide src/commands`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(learn): Check is one action from the Guide`. **Risk:** item 3 (the check path every lesson uses; `bun test src/learn src/components/learnLesson.test.ts` unchanged is the guard). **Independent verifier:** yes (Review Focus 3).

---

### Task G3: The Learn activity outline
**Spec:** GDE-002, UX-024, UX-026. **Lane G. Wave 3. KEEP. Needs X1b, U2-V1.**

**Allowed edit surfaces**
```
IDE/src/components/learn/LearnOutline.tsx
IDE/src/components/learn/courseOutline.ts
IDE/src/components/learn/LearnOutline.test.tsx
IDE/src/i18n/catalog/u3Learn.ts
IDE/scripts/journeys013/u3-g1.ts
```
The Learn activity shows the course as a tree: paths, then modules, each open or closed, each lesson with its state as an icon **and** text, the current lesson marked (`aria-current`), a filter by title and id, and for a locked lesson "what unlocks it" on hover and on focus (the prerequisite titles, or "the lesson before it in the path"). A pure module `courseOutline.ts` builds the rows from `buildCourseView` (a flat list of rows with depth, state and reason; the component only renders and handles keys: Up/Down, Left/Right to close or open, Enter to open a lesson, type-ahead from the filter). Choosing a lesson opens it as before (`useLearnUi.select`, `openReading`) and the Guide follows (G1). Scale: after M7 the course has 20 modules, 3 paths and up to 111 lessons; the tree is virtualised only if a render test over a 111-lesson fixture takes over 100 ms (**Unconfirmed**; plan choice: no virtualisation until measured).
- [ ] **Step 1: Failing tests:** `'GDE-002 the outline lists paths and modules that open and close'`, `'GDE-002 each lesson has a state icon and a text equivalent, and the current lesson is marked'`, `'GDE-002 a locked lesson says what unlocks it on hover and on focus'`, `'GDE-002 the filter narrows by title and keeps the open state'`, `'GDE-002 the outline is a tree operable by keyboard alone'`, `'GDE-002 a 111-lesson course renders within the budget'`; fixtures built from `LESSON_INDEX` plus a generated synthetic course for the scale test.
- [ ] **Step 2 to 4:** `bun test src/components/learn`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(learn): the course is an outline in the Learn activity`. **Risk:** item 6 (the list is the only way to a locked lesson's reason; the progress suites unchanged are the guard).

---

### Task G4: The reading frame and the lesson layout
**Spec:** GDE-006, GDE-007, LRN-039, LRN-041. **Lane G. Wave 3. KEEP, ON M7 (the plant beside the program for a scene lesson). Needs U2-H5, X1a, P1.**

**Allowed edit surfaces**
```
IDE/src/shell/WorkbenchShell.tsx
IDE/src/shell/WorkbenchShell.test.tsx
IDE/src/components/LearnReadingView.tsx
IDE/src/components/LearnReadingView.test.tsx
IDE/src/store/useLearnLayout.ts
IDE/src/commands/bind/guide.ts
IDE/src/i18n/catalog/u3Reading.ts
IDE/scripts/journeys013/u3-g4.ts
```
**Interfaces.** `LearnReadingView` is mounted inside `<main>` (`WorkbenchShell.tsx:177-191`), so it covers the editor region only; the command bar and status rail stay above and below it and say "Not connected" over a lab that says "The simulation is running" (the friction of GDE). Move the layer to the shell root, over the activity rail, sidebars, editor area and results panel, under a header with **Back to course**, the title, the position (R-G3) and **Practice**; while it shows, a store flag (`useLearnLayout.reading`) hides the command bar's run controls, the status rail and the results panel (they are unmounted from the tab order, not only hidden), so the lab's own controls (LRN-041) are the only run controls. **Where the command bar and the status rail render** (`Toolbar.tsx`, `shell/CommandBarCenter.tsx`, the status rail of U1-W7) is **Unconfirmed**: read them first; only the flag read is added there, through the parent if they are not in the allowed list. **Practice** applies the lesson layout (GDE-007): opens the lesson's first file, shows the plant document beside it in a split when the lesson names a plant or a scene (needs P1 and `M7-K1`; a 2.0 lesson without a plant gets no plant), shows the Guide; `view.lessonLayout` ("Lesson layout" command) restores it. Escape still closes the page (existing behaviour, `LearnReadingView.tsx` header comment).
- [ ] **Step 1: Failing tests:** `'GDE-006 a reading page covers the whole workbench: the activity rail, sidebars and results panel are not in the tab order'`, `'GDE-006 while it is shown no run control of the command bar and no status rail are present'`, `'GDE-006 the lab's own run controls are present'`, `'GDE-007 Practice opens the first file, the plant beside it when the lesson names one, and the Guide'`, `'GDE-007 a 2.0 lesson without a plant opens no plant document'`, `'GDE-007 the Lesson layout command restores the layout'`, `'LRN-039 Escape closes the page and gives the focus back to the Guide'` (previous behaviour).
- [ ] **Step 2 to 4:** `bun test src/shell src/components src/learn`, `bunx tsc -b`, `bun run lint`; journey `u3-g4.ts` ("no run control of the command bar is visible on a reading page and the lab's are"). **Commit:** `feat(learn): a reading page covers the whole workbench, and Practice opens the lesson layout`. **Risk:** item 6 (the reading page is how the 21 lessons of the Ladder path open). **Independent verifier:** with G1 (Review Focus 4).

---

### Task G5: The Learn home and the region-jump command
**Spec:** GDE-011, section 8.2 item 5, plan-u2 finding 12. **Lane G. Wave 1. KEEP. Needs X1a.**

**Allowed edit surfaces**
```
IDE/src/components/LearnHomeView.tsx
IDE/src/components/LearnHomeView.test.tsx
IDE/src/commands/bind/guide.ts
IDE/src/commands/commands.test.ts
IDE/src/i18n/catalog/u3Learn.ts
IDE/scripts/journeys013/u3-g5.ts
```
**Interfaces.** The Learn home puts every lesson of every path, each with a Start button (`data-learn-path-start`, `LearnHomeView.tsx:122`, `:259`), between **Continue** and the switches: about 27 Tab stops before the switches with one path of 21 lessons (logbook L73), and about **58** with the two paths of M7 (21 + 23 + 14). Changes: Continue stays first; each path's lesson list is inside a `<details>` that is **closed** except for the path that holds the lesson to continue; a skip link "Skip to the switches" is the second Tab stop; the hardware track no longer sits over the list (GDE-011). The Tab order is pinned by a test since `d2fbc4d5` (**Unconfirmed** name: `rg -n "Tab" IDE/src/components/LearnHomeView.test.tsx`); that test **froze the old layout** and changes with a named commit line. `view.focusCommandBar` (finding 12(b)): focus moves from any document to the command bar, and a second press returns to the last focused region; it works from Monaco without Ctrl+M first (the editor's key binding is registered through the command host, **Unconfirmed**: read how `F6` is bound, `registry.ts:145`). **The key is the owner's choice** (Open question 1): until answered the command has no shortcut and is in the palette and the View menu; the proposed default is `Alt+F6`, and the executor checks `tools/docs/generate_keyboard_reference.ts` for a conflict before binding.
- [ ] **Step 1: Failing tests:** `'GDE-011 Continue is the first control and the skip link the second'`, `'GDE-011 a path that holds no lesson to continue is closed and its Start buttons are not in the tab order'`, `'GDE-011 a learner reaches the switches within 4 Tab presses'`, `'GDE-011 the hardware track is not pinned over the lessons'`, `'FND-002 view.focusCommandBar moves focus to the command bar from a document and back'`, `'UX-025 view.focusCommandBar works inside the code editor without Ctrl+M'`. Journey: the screen-reader capture steps 8 and 9 (L73) pass **without the adjusted budget** (`screen-reader-capture.ts`; edit only those two steps' presses).
- [ ] **Step 2 to 4:** `bun test src/components src/commands`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(learn): Continue first, a skip link, and a command that jumps to the command bar`. **Risk:** item 3 (a new shortcut is a contract; the keyboard reference check is the guard).

---

### Task G6: First use: three actions to a blink, and empty states
**Spec:** GDE-010, GDE-012, UX-021, LRN-012. **Lane G. Wave 1. KEEP. Needs X1a and U1's one-action Run.**

**Allowed edit surfaces**
```
IDE/src/components/WelcomeScreen.tsx
IDE/src/components/WelcomeScreen.test.tsx
IDE/src/components/EmptyState.tsx
IDE/src/components/EmptyState.test.tsx
IDE/src/i18n/catalog/u3Learn.ts
IDE/scripts/journeys013/u3-g6.ts
```
**Interfaces.** Journey 57 ("First launch to a blinking simulated output, following only what Studio shows", `IDE/scripts/journeys.ts:6045`) exists; how many actions it takes is **Unconfirmed**. Write the counting journey first (`u3-g6.ts`): from the Welcome screen of a fresh profile, **open the example** (1), **Run** (2) and at most one answer to a question Studio asks (3), and the journey **counts** the actions it takes and fails above three. Fix the surfaces that add a fourth (a confirmation, a second Run, a notice that must be dismissed: logbook L47). `EmptyState` is a small kit component: the first time each region is shown with nothing in it (the editor area with no document, Problems, Test results, Watch, Trace, the Plant activity with no plant, the navigator with no project) it names the one action most users take next and offers it as a button wired to the registered command (GDE-012); "first time" is a persisted flag per region in the layout store (**Unconfirmed**: where `useShellLayout`'s versioned state keeps flags; U2-H5 owns the version, so G6 stores its flags in a key of its own).
- [ ] **Step 1: Failing tests:** the counting journey; `'GDE-010 the first blink takes at most three actions'`, `'GDE-012 each region names its one next action the first time it is shown empty'`, `'GDE-012 the empty state does not return once the action was taken'`, `'GDE-010 the questions Studio asks before the first blink are at most one'`.
- [ ] **Step 2 to 4:** `bun test src/components`, `bunx tsc -b`, `bun run lint`; `ZPLC_NATIVE_SIM_BIN=<worktree runtime> bun run smoke:journeys` (the journey only). **Commit:** `feat(ide): a first blink in three actions, and empty states that name the next action`. **Risk:** item 6 (first use is the first thing every user sees; journeys 13 and 57 unchanged are the guard).

---

### Task G7: The first-use sessions: protocol and record (**Owner step**)
**Spec:** GDE-013, section 8.2 item 8. **Lane G. Any wave. KEEP.**

**Allowed edit surfaces**
```
specs/013-zplc-2-1-studio-experience/evidence/gde-013-protocol.md
specs/013-zplc-2-1-studio-experience/evidence/gde-013-sessions.md
```
The task is documents, not code. `gde-013-protocol.md`: who (three people who have not used Studio), what each does (the first lesson and the first blink, in the language they choose), what the observer writes (time to the first blink, each place the person stopped, each thing said aloud), what the observer does not do (point, hint, touch the keyboard), the build and platform used, and how a session is recorded (a table row, no recording of a person without their written consent, no personal data in the repository). `gde-013-sessions.md`: the empty table. **The sessions are the Owner's** (they need three people); the plan records the result when they exist and, if they are not held, the spec's SHOULD is recorded as not met with the reason (8.2 item 8 says "if the sessions were held").
- [ ] **Step 1:** write both files. **Step 2: commit** `docs(ux): protocol and record for the first-use sessions`. **Risk:** none.

---

### Task P1: One plant edit session; the plant toolbar
**Spec:** PLS-004, PLS-009, PLS-010, PLS-001. **Lane P. Wave 2. KEEP. Needs X1a and U2-T4 (which touches `PlantDocument.tsx` for the Replay).**

**Allowed edit surfaces**
```
IDE/src/plant/editSession.ts
IDE/src/plant/editSession.test.ts
IDE/src/plant/ui/PlantPanel.tsx
IDE/src/plant/ui/PlantPanel.test.tsx
IDE/src/plant/ui/SceneChooser.tsx
IDE/src/shell/PlantDocument.tsx
IDE/src/shell/PlantDocument.test.tsx
IDE/src/i18n/catalog/u3Plant.ts
IDE/scripts/journeys013/u3-p.ts
```
**Interfaces.** Contract `PlantEditSession`. Today `editing` is `useState` inside `PlantPanel` (`PlantPanel.tsx:111`), and its toolbar holds, besides the plant things, the scene chooser (`:183-191`), the save button (`:228-230`), Undo, Redo and Done (`:231-240`). Move the edit state to `usePlantEdit`; the panel renders the `EditorPanel` from the session only as long as the three homes (P2, P3, P4) do not exist (**interim, removed by P4**: until then the editor still renders inside the document, so no user loses it between merges). The toolbar keeps the view switch, the camera select, Reset plant, the fault controls and add/remove item of `OperatePanel`, and a single **Edit scene** / **Done editing** toggle (offered only while stopped); the scene chooser moves to the Plant activity and the navigator (P2, P6) and the save to Save and Save all (P5): until they merge, P1 leaves a one-line fallback of each in the toolbar behind the flag `legacyToolbar` (default on), which P2 and P6 turn off. PLS-009 and PLS-010: tests for a failed **scene** (a scene whose JSON is invalid shows its located message in the document with the schematic offered, not only in Output) and for the document drawing no frame while not visible, including in a split and in the lesson layout.
- [ ] **Step 1: Failing tests:** `'PLS-004 the toolbar holds only the view switch, cameras, Reset plant, faults, items and Edit scene'`, `'PLS-004 Edit scene is offered only while the plant is stopped'`, `'SCN-008 begin, undo and redo are refused while the plant runs and the trace hash is unchanged'`, `'PLS-005 two views of the session show the same selection after a select in one of them'`, `'PLS-009 an invalid scene is a message in the plant document with the schematic offered'`, `'PLS-010 a hidden plant document receives no snapshot and draws no frame'`, `'PLT-013 a plant that is not edited renders as before'`.
- [ ] **Step 2 to 4:** `bun test src/plant src/shell`, `bunx tsc -b`, `bun run lint`. **Commit:** `refactor(plant): one edit session for the plant and a toolbar with only plant things`. **Risk:** item 6 (the document every plant lesson opens; `bun test src/plant src/plants src/test-engine src/learn` unchanged is the guard). **Independent verifier:** yes (Review Focus 6, 8).

---

### Task P2: The Plant activity: the catalogue and the signal list
**Spec:** PLS-005, PLS-006, SCN-011, SCN-014. **Lane P. Wave 4. KEEP, ON M7. Needs P1, X1b, `M7-E2`.**

**Allowed edit surfaces**
```
IDE/src/plant/ui/PlantView.tsx
IDE/src/plant/ui/PlantView.test.tsx
IDE/src/i18n/catalog/u3Plant.ts
IDE/scripts/journeys013/u3-p.ts
```
The Plant activity (stub from X1b) shows, for the scene of the active plant document: the scene's name and a chooser of the shipped scenes, the empty floor and the project's scenes (the `SceneChooser` list moves here; P1's `legacyToolbar` flag turns off), the **parts catalogue** (`PartList` of `M7-E2`, grouped by family and filtered, mounted unchanged: a part is added by pointer and by keyboard through the same props as in M7) while the session is editing, and the **signal list** of the scene with type, direction and binding state (bound to a variable, unbound, type mismatch: text plus icon). `PartList`, `PartForm` and `SignalTable` are mounted **without changing them** (spec 013 risk: they must not know where they are mounted). With no plant document, the view says what to do (an `EmptyState` from G6 naming "Add a plant").
- [ ] **Step 1: Failing tests:** `'PLS-005 the catalogue is the Plant activity and adds a part by pointer and by keyboard'`, `'PLS-006 the signal list shows type, direction and binding state with a text equivalent'`, `'PLS-005 PartList is mounted with the props it had in the plant document'`, `'SCN-016 the Plant activity offers the empty floor and every shipped scene'`.
- [ ] **Step 2 to 4:** `bun test src/plant src/shell`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(plant): the parts catalogue and the signal list are the Plant activity`. **Risk:** none (no new behaviour in the moved components).

---

### Task P3: The Inspector edits the selected part
**Spec:** PLS-005, SHL-009, SCN-009. **Lane P. Wave 3. KEEP. Needs P1, U2-H3.**

**Allowed edit surfaces**
```
IDE/src/components/inspector/PlantPartInspector.tsx
IDE/src/components/inspector/PlantPartInspector.test.tsx
IDE/src/components/WorkbenchInspector.tsx
IDE/src/i18n/catalog/u3Plant.ts
```
When the selection is a part of the scene being edited, the Inspector (U2-H3's selection report) shows `PartForm` (name, position, rotation, variant and limits within the documented range) bound to the session; a refused edit is said at its field and changes nothing; nothing is editable while the plant runs (the form is disabled with the reason). `PartForm` is not changed. Other selections (a PLC object, an I/O point) are U2's.
- [ ] **Step 1: Failing tests:** `'PLS-005 selecting a part shows its form in the Inspector'`, `'SCN-009 a value outside its documented range is refused at its field and the scene is unchanged'`, `'SCN-008 the form is disabled while the plant runs and says why'`, `'SHL-009 the Inspector keeps its other selections'` (previous behaviour). **Steps 2 to 4:** `bun test src/components src/plant`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(plant): the properties of the selected part are in the Inspector`. **Risk:** none.

---

### Task P4: The plant map is a configuration editor
**Spec:** PLS-006, SCN-012, SCN-013, UX-013. **Lane P. Wave 4. KEEP, ON M7. Needs P1, X1b, U2-H4, `M7-E1`.**

**Allowed edit surfaces**
```
IDE/src/navigator/configEditors.ts
IDE/src/navigator/configEditors.test.ts
IDE/src/plant/ui/PlantMapEditor.tsx
IDE/src/plant/ui/PlantMapEditor.test.tsx
IDE/src/plant/ui/PlantPanel.tsx
IDE/src/i18n/catalog/u3Plant.ts
IDE/scripts/journeys013/u3-p.ts
```
(`PlantPanel.tsx` is touched once here, to **remove the interim `EditorPanel`** of P1; its second owner is P4 only for that deletion.) Add the kind `plantMap` to `CONFIG_EDITOR_KINDS` (`configEditors.ts:7`), with its command `project.plantMap`, title and surface entry, so it opens in the editor area beside the I/O mapping and the palette and the registry see it. The editor mounts `SignalTable` (`M7-E1` added `onCreateDeclarations`): each signal with a bind control, the type check, an unbound or mismatched signal as a **problem that opens its row** (SCN-012; the problems are published for P5), and the action **Create the declarations** for the language of the open program: it calls `declarationsFor` and applies the result to the program (text languages: inserts the block at the declaration section of the active document without touching existing text; diagram languages: adds the rows to the document's variable table; **Unconfirmed**: the document stores of Ladder, FBD and SFC, read `IDE/src/editors` first; if a language cannot be applied programmatically, the action copies the declaration and says so). It never chooses an address (LNK-002). When the project has no plant, the editor offers "Add a plant" (P6).
- [ ] **Step 1: Failing tests:** `'PLS-006 the plant map opens in the editor area as a configuration editor next to the I/O mapping'`, `'SCN-012 an unbound signal is a problem that opens its row'`, `'SCN-012 a type mismatch is a problem that opens its row'`, `'SCN-013 Create the declarations adds the variables of the scene to the open program without overwriting its text'` (ST, and one diagram language), `'LNK-002 no address is chosen'`, `'PLS-006 the plant map is listed by the palette and the surface registry'`.
- [ ] **Step 2 to 4:** `bun test src/navigator src/plant src/shell`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(plant): the plant map is a configuration editor, with the declarations action`. **Risk:** item 3 (a new config editor kind joins a contract the navigator, session restore and the palette read; `configEditors.test.ts` unchanged for the five old kinds is the guard).

---

### Task P5: Edit menu, Problems and Save
**Spec:** PLS-005, SCN-010, SCN-015, FLW-005, SCN-006. **Lane P. Wave 3. KEEP. Needs P1, X1b, U2-H6.**

**Allowed edit surfaces**
```
IDE/src/commands/bind/plantEdit.ts
IDE/src/commands/bind/plantEdit.test.ts
IDE/src/plant/ui/plantProblems.ts
IDE/src/plant/ui/plantProblems.test.ts
IDE/src/i18n/catalog/u3Plant.ts
IDE/scripts/journeys013/u3-p.ts
```
`edit.undo` and `edit.redo` act on the edit session **when the plant document is the active document and a scene is being edited**, and on the focused editor otherwise (Monaco keeps its own history; the command host asks the focused document, **Unconfirmed**: read how the Edit category and Monaco's keybindings interact, plan-u2 finding 14). `plant.edit` and `plant.endEdit` replace the toolbar button's handler. The scene's problems (`validateAt`, `IDE/src/plant/editor/validate.ts`) are published to the **Problems** tab as entries with a source "Plant" that select the part when activated (Plant activity row, Inspector form) and the plant map's unbound and mismatched signals open their row (P4). The scene joins **Save** and **Save all** through the participant that `EditorPanel` registers today (`registerSaveAllParticipant`, `EditorPanel.tsx:62`), which P5 moves to the session so it exists while the editor panel is not mounted; the edited scene is saved under the project's scene file (`persistence/sceneFiles.ts`) and a scene of an older schema opens or fails with its version (SCN-006, kept).
- [ ] **Step 1: Failing tests:** `'SCN-010 Edit > Undo and Redo act on the plant edit session and update every view'`, `'SCN-010 in a code editor Undo is the code editor's'`, `'SCN-015 a scene problem is an entry of Problems that selects its part'`, `'FLW-005 Save all saves an edited scene and no other document is affected'`, `'PLS-005 the Undo and Redo buttons are gone from the toolbar'`, `'SCN-008 undo is refused while the plant runs'`.
- [ ] **Step 2 to 4:** `bun test src/commands src/plant src/shell`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(plant): undo and redo in the Edit menu, scene problems in Problems, and Save`. **Risk:** item 6 (an Edit command that must not steal the code editor's undo: the second test).

---

### Task P6: The navigator Plant group and "Add a plant"
**Spec:** PLS-011, SCN-016. **Lane P. Wave 3. KEEP. Needs P1, U2-H4.**

**Allowed edit surfaces**
```
IDE/src/navigator/plantGroup.ts
IDE/src/navigator/plantGroup.test.ts
IDE/src/components/Sidebar.tsx
IDE/src/i18n/catalog/u3Plant.ts
```
The object view of the navigator shows a **Plant** group (the scene and the plant map) when the project has one or more scenes (`hasProjectScene`, `useProjectScenes`, as `PlantDocument.tsx` reads them), and an **Add a plant** action when it has none: it opens a chooser of the empty floor and each shipped scene as templates (the list `SceneChooser` builds, SCN-016), saves the choice under a name into the project (the existing `saveScene` flow, `PlantPanel.tsx:171-178`), and opens the plant document on it. Uses the "New" pattern U2-H4 builds (skeleton that builds): a new scene is never invalid.
- [ ] **Step 1: Failing tests:** `'PLS-011 the navigator shows a Plant group with the scene and the plant map when the project has a plant'`, `'PLS-011 a project with no plant offers Add a plant with the empty floor and every shipped scene'`, `'PLS-011 Add a plant saves the template under a name and opens it'`, `'PLS-011 a project with a scene shows no Add a plant'` (the group is the entry). **Steps 2 to 4:** `bun test src/navigator src/components src/plant`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(plant): a Plant group in the navigator and Add a plant`. **Risk:** none.

---

### Task P7: One owner per input: the faceplate
**Spec:** PLS-007, LNK-006, UX-009, P18. **Lane P. Wave 3. KEEP. Needs P1, U2-H6.**

**Allowed edit surfaces**
```
IDE/src/components/DebugWatchPanel.tsx
IDE/src/components/DebugWatchPanel.test.tsx
IDE/src/runtime/faceplateState.ts
IDE/src/runtime/faceplateState.test.ts
IDE/src/runtime/nativeTrace.ts
IDE/src/runtime/nativeTrace.test.ts
IDE/src/i18n/catalog/u3Faceplate.ts
IDE/scripts/journeys013/u3-p.ts
```
The faceplate has one place, the Watch tab. An input the plant feeds (a signal the plant map binds to a program input, read from the session) is shown **read-only, marked "from the plant"** (text, not only colour), and **can still be forced** (LNK-006: the existing force path of the Watch table). Operator-panel parts are operated in the plant (VIS-010, not here). The motor buttons of the Trace tab appear only for a program named Motor with Start, Stop and EStop (`nativeTrace.ts:182-186`); retire them **only after** a journey proves that the faceplate sets the same three inputs (Start, Stop, EStop of `motor_plant`): write that journey first, then remove the buttons in the same task, and name the removed test as one that froze the old layout. **Unconfirmed:** the surface that holds the motor buttons (`rg -n "EStop" IDE/src/components`).
- [ ] **Step 1: Failing tests:** `'PLS-007 an input the plant feeds is read-only in the Watch tab and marked from the plant'`, `'LNK-006 a plant-fed input can still be forced and the force is shown'`, `'PLS-007 the faceplate sets Start, Stop and EStop of the motor program as the Trace buttons did'` (the journey, before the removal), `'PLS-007 an input with no plant is editable as before'` (previous behaviour). **Steps 2 to 4:** `bun test src/components src/runtime`, `bunx tsc -b`, `bun run lint`, then the journey. **Commit:** `feat(ide): one owner per input: the faceplate in the Watch tab, the motor buttons retired`. **Risk:** item 3 (removing a control a user saw: guarded by the equivalence journey).

---

### Task P8: Plant I/O mode in the shell (ON M6)
**Spec:** PLS-008, LNK-007, LNK-008, LNK-010, LNK-014, UX-018, UX-020. **Lane P. Wave 5. ON M6. Needs P1, X1b, U1's status rail, and the session contract of M6 (`M6-<id>`, Unconfirmed).**

**Allowed edit surfaces**
```
IDE/src/plant/ui/PlantIoMode.tsx
IDE/src/plant/ui/PlantIoMode.test.tsx
IDE/src/commands/bind/plantEdit.ts
IDE/src/store/ioModeStatus.ts
IDE/src/shell/StatusRail.tsx
IDE/src/shell/StatusRail.test.tsx
IDE/src/i18n/catalog/u3IoMode.ts
IDE/scripts/journeys013/u3-p.ts
```
(`StatusRail.tsx` is the rail of U1-W7; **Unconfirmed** file name: `fd StatusRail IDE/src`.) Build against a typed interface that M6 provides and that U3 fakes: `{ state: 'off' | 'starting' | 'running' | 'failed'; mirroring: boolean; latencyMs: { last: number; worst: number } | null; start(): Promise<void>; stop(): Promise<void>; setMirroring(on: boolean): Promise<void> }`. If M6's contract differs, M6 wins and this task adapts the fake. The command `plant.feedBoard` ("Feed the board from the plant"), `physical: true`, in the **Online** menu and as a button of the plant document, **offered only while a board is connected**; pressing it opens an **alert dialog** (LNK-008, UX-020) that says what will happen (the board's outputs are held in their safe state; mirroring is off until the person turns it on, D-16), with Cancel as the default focus; only the confirmation starts the mode. The status rail's one program state gains a third state, different in **text, icon and colour** from Simulation and from Board, a mark while mirroring is on, and the measured latency in its details (LNK-014) from the session. A failure of the start is a located message and the rail stays at Board. **No code here starts anything on a board**; tests use the fake.
- [ ] **Step 1: Failing tests:** `'PLS-008 the action is offered only while a board is connected'`, `'PLS-008 the dialog confirms before the mode starts and Cancel changes nothing'`, `'PLS-008 the status rail shows a third state that differs from Simulation and Board in text, icon and colour'`, `'LNK-010 mirroring shows a mark and is off by default'`, `'LNK-014 the measured latency is in the details of the rail'`, `'FND-002 plant.feedBoard is physical and absent from the AI and MCP surfaces'`, `'PLS-008 a failed start is a located message and the rail stays at Board'`.
- [ ] **Step 2 to 4:** `bun test src/plant src/shell src/commands`, `bunx tsc -b`, `bun run lint`; **the restricted AI and MCP regression test** (name **Unconfirmed**, `rg -ln "physical" IDE/src --glob '*.test.ts'`). **Commit:** `feat(plant): Feed the board from the plant, confirmed, with its own state in the status rail`. **Risk:** item 2 (a physical action's gate: AI and MCP must not reach it), item 3. **Independent verifier:** yes (Review Focus 10). **Owner step (not run here):** the mode against a real board, by the person at the keyboard.

---

### Task D1: Documentation and the design documents, in English and Spanish
**Spec:** section 8.2 item 6, UX-032, constitution rule 8. **Lane D. Wave 6. KEEP.**

**Allowed edit surfaces**
```
docs/docs/learn/index.md
docs/docs/learn/guide.md
docs/docs/learn/reading-pages.md
docs/docs/getting-started/first-blink.md
docs/docs/plant/index.md
docs/docs/plant/workspace.md
docs/i18n/es/docusaurus-plugin-content-docs/current/learn/index.md
docs/i18n/es/docusaurus-plugin-content-docs/current/learn/guide.md
docs/i18n/es/docusaurus-plugin-content-docs/current/learn/reading-pages.md
docs/i18n/es/docusaurus-plugin-content-docs/current/getting-started/first-blink.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/index.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/workspace.md
IDE/DESIGN.md
IDE/PRODUCT.md
```
(Page names that already exist are edited in place; **Unconfirmed**: which of `getting-started/` pages exists, `eza docs/docs/getting-started` first. `docs/sidebars.js` is the parent's. `plant/scene-editor.md` and `plant/io-mode.md` are `M7-D4`'s; U3 only fixes their wording about where a control is.) Content: the Guide and its action bar, the Learn outline, the reading page and Practice, the lesson layout, the region-jump command (with its key once chosen), the Plant activity, the Inspector for a part, the plant map editor, the Edit menu commands, Add a plant, the faceplate and plant-fed inputs, plant I/O mode as an action that the person takes (the page says what is and is not measured: nothing numeric without an evidence file, CRS-013). `DESIGN.md` and `PRODUCT.md` describe the shipped interface (the six regions of section 5.1, the Guide and the Plant activity, the third status state). Words follow MSG-001; the word "Lab" appears nowhere (D-25).
- [ ] **Step 1: Failing tests:** `bun test tools/docs` structure and parity (English and Spanish same headings), `'DOC the docs never call the plant surface Lab'` (a rg-style test over the docs and the catalogs), the keyboard reference check for the new command. **Steps 2 to 4:** `bun test tools/docs`, `bun tools/docs/check-docs-config.ts`, `bun tools/docs/generate_keyboard_reference.ts --check`. **Commit:** `docs(studio): the Guide, the outline, the reading frame and the plant homes, in English and Spanish`. **Risk:** item 6 (claims).

---

### Task D2: The screenshots, regenerated
**Spec:** section 8.2 item 6, DOC-013. **Lane D. Wave 6, after D1 and every UI task. KEEP. Run by the parent.**

**Allowed edit surfaces**
```
docs/static/img/screens/*
docs/static/img/tutorials/*
tools/docs/capture-screenshots.ts
tools/docs/capture-screenshots.test.ts
```
The pictures that show the 2.0 layout are stale: `learn-lab-en.png`, `learn-lab-es.png` (the lesson in the primary sidebar and the Lab), `learn-path-*.png`, `learn-reading-*.png` (a reading page under the command bar), `guide-*.png`, `lesson-checked-*.png`, and the blink pictures of `ENGLISH_PICTURES` (`capture-screenshots.ts:132-`). Regenerate them with `bun run docs:screenshots` (each of its modes: `--learn`, `--screens`, `--editors`) in the real application on Linux, in both languages and in the display modes the script lists; the capture is automation of the application and starts nothing on a board. Add pictures of the Guide, the Learn outline, the plant document beside a program, the Plant activity and the plant map editor to the manifest. `--check` compares the manifest with the files. **Unconfirmed:** that the capture needs a display (xvfb) on this machine; the parent runs it where the journeys run.
- [ ] **Step 1: Failing test:** `bun tools/docs/capture-screenshots.ts --check` lists the stale and missing pictures. **Step 2:** run the modes; **Step 3:** `--check` exits 0 and `bun test tools/docs`. **Commit:** `docs(studio): screenshots of the Guide, the outline and the plant homes, in English and Spanish`. **Risk:** none.

---

### Task Q1: Budget, requirement coverage, the keyboard main path and the closing checks
**Spec:** section 8.2 items 1 to 5. **Lane Q. Wave 6. KEEP. Run by the parent or a CI-hygiene writer after the other tasks merge.**

**Allowed edit surfaces**
```
IDE/scripts/interfaceBudget.ts
IDE/scripts/interfaceBudget.targets.json
IDE/scripts/interfaceBudget.test.ts
IDE/scripts/journeys013/u3-q1.ts
IDE/scripts/screen-reader-capture.ts
tools/ci/requirement-evidence.json
tools/ci/requirements-index.json
tools/ci/requirement-coverage.test.ts
```
(The evidence mechanism is **Unconfirmed** beyond what the M2 and M4 hygiene commits show: read `tools/ci/requirement-coverage.ts` first. Fixtures are never pinned to today's uncovered ids.) Steps: (1) the **keyboard main path journey** (`u3-q1.ts`, section 8.2 item 5): from the Welcome screen, open a lesson, Practice (split with the plant document), edit, Run, Check from the Guide, pass, Next; open the plant document, Edit scene, add a part from the Plant activity, edit its properties in the Inspector, bind a signal in the plant map, undo from the Edit menu, save, run: **no pointer**, using `view.focusCommandBar` and no Ctrl+M; (2) the screen-reader capture in English and Spanish passes with the Guide, the outline and the plant document (the steps G5 fixed); (3) the budget script counts the new rail item, the Guide's controls and the plant toolbar and `--check` exits 0 on Linux; (4) `bun tools/ci/requirement-coverage.ts --check`: GDE-001 to GDE-012 and PLS-004 to PLS-011 covered, GDE-013 recorded as an Owner step (or conditional on the sessions), PLS-008 conditional on M6 if P8 did not merge; (5) the contrast and labelling audit (`IDE/scripts/domAudit.ts`) over every new surface in the three display modes.
- [ ] **Step 1 to 4:** run the journey (`ZPLC_NATIVE_SIM_BIN=<worktree runtime> bun run smoke:journeys`), the capture, `bun scripts/interfaceBudget.ts --check`, `bun tools/ci/requirement-coverage.ts --check`, `bun test ./tools/ci`, the pinned formatter `--check`. **Commit:** `test(ide): the keyboard main path, the interface budget and requirement coverage for U3`. **Risk:** item 5 (journeys drive the application; the stale-binary trap of L16 and L24).

---

## Open questions for the owner
Only real product decisions. Each has a recommended default; the plan proceeds on the default unless told otherwise.

1. **The key of the region-jump command (`view.focusCommandBar`).** The owner chooses the key (plan-u2 finding 12(b): `F6` is Pause, so it cannot be reused). The command is registered in G5 with no shortcut and appears in the palette and the View menu regardless. *Recommended default: `Alt+F6`* (near F6, free in the keyboard reference and in Monaco as far as this plan could read; **Unconfirmed**: the executor checks `tools/docs/generate_keyboard_reference.ts` for a conflict and falls back to `Ctrl+Alt+F6`).
2. **What "position in the path" says for a lesson that is in two paths or in none (R-G3).** The spec's "Lesson 4 of 21" assumed one path; with M7 the course has the Ladder path, `plant-st` and `plant-ld`, and the siblings of a lesson sit in different paths. (A) The place in the path the lesson was opened from, or in its module when there is none. (B) The place in the whole course order. *Recommended default: A.* It is what the learner is following; B changes every time a module is added.
3. **Where the scene chooser lives once it leaves the plant toolbar (PLS-004).** (A) The Plant activity (a chooser of the project's scenes, the shipped scenes and the empty floor) plus the navigator's "Add a plant" for a project with none. (B) Only the navigator. *Recommended default: A.* A learner who is looking at the plant should switch it without going to the project tree; the navigator keeps the creation action PLS-011 requires.
4. **GDE-013 sessions.** Three people who have not used Studio are needed before U3 closes. *Recommended default: the owner finds them after P and G tasks merge and before the release candidate; if they are not found, the spec's SHOULD is recorded as not met (8.2 item 8) and U3 closes without them.* G7 prepares the protocol either way.

## Findings in the spec and in the merged code (contradictions and things that could not be verified)
1. **The lesson is the primary sidebar on the Learn rail.** `lessonSurface` returns `primary` on the Learn rail and `secondary` elsewhere (`IDE/src/shell/shellRouting.ts:27-28`), and the secondary sidebar toggles `lesson`/`inspector` with a `ToggleGroup` (`IDE/src/shell/Sidebars.tsx:84-90`); GDE-001 asks for the Guide in the secondary sidebar whatever the activity. X1b changes it; every journey that reaches the lesson through the Learn rail (journeys 11 and 52, the screen-reader capture) moves with it.
2. **Check is the last control of the lesson** (`IDE/src/components/LearnPanel.tsx:377`, `data-learn-check`) and the primary button beside it opens the Tests tab (`:393`); the spec's friction list is accurate. The language control and the course list are still in the lesson (`LearnPanel.tsx:28-60` builds `buildCourseView`).
3. **The reading page covers only the editor region**: `LearnReadingView` is mounted inside `<main>` (`IDE/src/shell/WorkbenchShell.tsx:177-191`), under the command bar and above the status rail, as the spec says (GDE-006).
4. **The plant toolbar holds more than plant things**: the scene chooser, the save button, and Undo, Redo and Done (`IDE/src/plant/ui/PlantPanel.tsx:183-247`), and its edit state is `useState` (`:111`). PLS-004 and PLS-005 describe the opposite. The Undo and Redo buttons are `data-plant-undo` and `data-plant-redo` (`:233-236`), while plan M1 Task E3 and PLS-005 say they are Edit menu commands.
5. **There is no Plant activity and no Guide in the surface registry**: `ACTIVITY_VIEWS` is `project, search, tests, learn` (`IDE/src/store/useShellLayout.ts:13`), and `SURFACES` has `editor.plant` but no activity or secondary view for the plant or the lesson (`surfaces.ts:31-45`). Whether U2-H3 or U2-H6 adds the Plant activity is **Unconfirmed** (plan-u2 says "the Plant activity gets its content in U3", which implies U2 only reserves it).
6. **The plant map has no document of its own**: `CONFIG_EDITOR_KINDS` has five kinds (`IDE/src/navigator/configEditors.ts:7`); the map editor exists only inside the scene editor panel (`IDE/src/plant/editor/EditorPanel.tsx`).
7. **The Learn home will have about 58 Start buttons once M7 lands** (21 for the Ladder path, 23 for `plant-st`, 14 for `plant-ld`; each lesson of a path has a `data-learn-path-start`, `LearnHomeView.tsx:259`) against about 27 today (logbook L73). The skip link recommended in plan-u2 finding 12(a) is therefore necessary, and G5 closes the paths that do not hold the lesson to continue.
8. **GDE-003's "Lesson 4 of 21" assumes one path of 21 lessons** (the `ladder` path). After spec 012 there are three paths and a lesson may be in two (R-G3, Open question 2).
9. **`PlantDocument` is touched by U2-T4** (Replay opens the plant document from a test result) and by P1; U3-P1 therefore waits for U2-T4, and the order in "Shared files" is the contract.
10. **U2 owns the catalogs the U3 words would naturally go into** (`learnHome.ts` and `toolbarMsg.ts` belong to U2-V2 in plan-u2). U3 uses catalogs of its own (`u3*.ts`) and relies on the guard of U2-V1 for the vocabulary, so no key has two owners.
11. **PLS-007's motor buttons** are read from a program named Motor with `Start`, `Stop`, `EStop` (`IDE/src/runtime/nativeTrace.ts:182-186`); the surface that renders them was not read while writing (**Unconfirmed**).
12. **GDE-010 may already hold.** Journey 57 exists (`IDE/scripts/journeys.ts:6045`) after U1's one-action Run; the number of actions it takes was not counted. G6 counts first and changes only what a count shows.
13. **The edit state and Monaco's undo.** Whether the command host can route one Edit-menu command to either the plant session or Monaco depends on how Monaco's own keybindings are registered (**Unconfirmed**; plan-u2 finding 14 says the Edit category is empty today). P5's second test is the guard.
14. **Unconfirmed in this plan** (the executor confirms each first and records the answer in the commit body): the names in `store/saveAll.ts` and `runtime/runPlan.ts` that carry the save preference (G2); where the command bar and the status rail render (G4); the Tab-order test of the Learn home (G5); where U2's layout version keeps per-region flags (G6); the document stores of Ladder, FBD and SFC that can take declaration rows (P4); the status rail's file name (P8); the physical-command regression test's name (P8); the `getting-started` pages that exist (D1); whether the screenshot capture needs xvfb here (D2); the contract of plant I/O mode in plan M6 (P8).

## Done when (aligned with spec section 8.2, for U3)
- [ ] The owner has the answers or accepted defaults of the open questions; the key of `view.focusCommandBar` is recorded.
- [ ] While a lesson project is open the lesson is the Guide of the secondary sidebar on every activity: title and position, one stage at a time with Back, Next and a jump list, hints, and an action bar fixed at the bottom with Check primary, visible at 1366 by 768; Check is one action that saves, builds, grades and shows the verdict and the failed expectation without the Tests surface; files and the record are in a disclosure; no language control; after a pass, the next lesson (GDE-001, GDE-003 to GDE-005, GDE-008, GDE-009; G1, G2).
- [ ] The Learn activity shows the course as an outline with state icons and text, the current lesson marked, a filter and the reason a lesson is locked; the Learn home puts Continue first and has a skip link (GDE-002, GDE-011; G3, G5).
- [ ] A reading page covers the whole workbench with the lab's controls as the only run controls; Practice opens the lesson layout with the plant beside the program for a lesson that names one, and "Lesson layout" restores it (GDE-006, GDE-007; G4).
- [ ] A first-time user reaches a running simulated blink in at most three actions, counted by a journey, and each region's first empty state names its next action (GDE-010, GDE-012; G6). The three observed sessions are held and recorded, or recorded as not held (GDE-013, 8.2 item 8; G7, **Owner**).
- [ ] The plant document's toolbar holds only plant things and has no run control; its failures are shown in it with the schematic offered; it draws no frame while hidden (PLS-003 to PLS-004, PLS-009, PLS-010; P1).
- [ ] The parts catalogue and the signal list are the Plant activity; the selected part's properties are in the Inspector; the plant map is a configuration editor with the declarations action; the scene's problems are in Problems; undo and redo are Edit menu commands; the scene joins Save and Save all; the navigator has a Plant group and Add a plant (PLS-005, PLS-006, PLS-011; P2 to P6).
- [ ] An input has one owner; the faceplate marks a plant-fed input read-only and still forces it; the Trace motor buttons are retired after the equivalence journey (PLS-007; P7).
- [ ] "Feed the board from the plant" is an explicit, confirmed, physical command with a third state in the status rail, tested against a fake session; the run against a board is the Owner's (PLS-008; P8, on M6).
- [ ] The main path with the split and a plant document is completable by keyboard alone; contrast and labelling pass on every new surface in the three display modes; the budgets of section 8.1 hold on Linux (8.2 items 2 and 5; Q1).
- [ ] `IDE/DESIGN.md`, `IDE/PRODUCT.md`, the documentation pages and their screenshots are regenerated in English and Spanish in the vocabulary of MSG-001, and the word "Lab" appears nowhere (8.2 item 6; D1, D2).
- [ ] All 2.0, U0, U1, U2 and M7 suites pass unchanged except the tests that froze the old layout, each named in its commit and in the pull request (VF-006): lessons, plants, smoke, journeys, the content security policy test, the restricted AI and MCP regression. `bun run lint`, `bun test`, `bun test ./tools/ci`, `bun test tools/docs`, `bun tools/ci/requirement-coverage.ts --check`, `bun scripts/interfaceBudget.ts --check` and the pinned formatter `--check` pass.
- [ ] The independent verifiers of G1 with G4, G2, P1, P8 (if built) returned with no open blocker; the requirement coverage reports U3's requirements `covered`, conditional ones with their decision.
- [ ] The tree can ship as 2.1.x with or without any task of U3 (decision D-24): each merged task leaves the application working and each unmerged one leaves its 2.0 surface in place.
