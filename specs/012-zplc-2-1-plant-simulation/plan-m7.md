# ZPLC 2.1 Milestone M7 Implementation Plan: the learner-facing editor, the complete course, the documentation in both languages (PROVISIONAL, revision 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Provisional.** M7 builds on M1 to M4 and U0/U1 **as merged** on `feat/plant-simulation` at commit `a2c80b32` (`Merge branch 'test/m4-q5' into feat/plant-simulation`, read with `git log --oneline -1` in the worktree `m7-plan` on 2026-11-13). M5 (scenes 7, 10, 11, 16), M6 (plant I/O mode in the firmware), U2 and U3 are being planned or built in parallel and are **not** in that tree: every dependency on them is named below by task id and marked. **The course outline is a draft awaiting the owner's approval** (`course-outline.md`, CRS-001: "No lesson is written before approval"). Every task that writes a lesson, a module, a path, or a number that counts lessons is marked **GATED (CRS-001)**; the rest of M7 can start now. The gate verdict of decision D-14 is still pending the owner's macOS and Windows runs (`research.md` section 11); M7 adds no physics, so only the scene-grading tasks are PHYS-adjacent (they re-run the existing scene CI).

**Goal:** Deliver milestone M7 of spec 012 (spec section 6.2: "The learner-facing editor (decision D-15), the complete course, the documentation in both languages"; requirements SCN-008 to SCN-016, CRS-001 to CRS-013, VIS-001 where relevant). Concretely: (1) the scene editor that M1 built as an authoring tool becomes usable by a learner who has never seen a catalogue of forty parts: the catalogue is grouped and explained, the declarations of a scene's signals are generated for every language, the editor is tested against the whole catalogue as it stands after M5, and a journey builds a scene by pointer and by keyboard; (2) a **scene lesson works end to end in the application** (today it is only a data package: Finding 1), is graded headless on plant facts, and has a CI guard; (3) the course of the outline exists as data: modules 12 to 19, two paths, 43 new lesson packages by default (Open question 2), the lessons that no earlier milestone wrote, the Ladder siblings, and the hardware track opened where M6's evidence allows (CRS-009, CRS-010); (4) the documentation exists in English and Spanish: a generated page for each module, lesson and reference scene, pages for the plant, the parts catalogue, the scene format, the scene editor and plant I/O mode, with every number counted from the repository and every performance claim tied to recorded evidence (CRS-011, CRS-013).

**Architecture:** M7 adds no engine and no dependency. Six seams carry it. (1) **A scene lesson is a project plus data.** The manifest already names a scene (`IDE/src/learn/lessonPackage.ts:126`, Task L1 of M1); Task K1 makes the *workspace* carry it: the starter project holds `scene.json` and `plant-map.json`, the scenario's `scene.file` resolves in the learner's project, and the headless runner that Check uses compiles the scenario with the project's own scene. That one rule serves lessons 12.1 to 18.3 (the scene as shipped) and 19.1 and 19.2 (the scene the learner built or changed, A9 of the outline) with no new scenario key. (2) **The editor stays three components and a model** (`IDE/src/plant/editor/{PartList,PartForm,SignalTable}.tsx`, `model.ts`): M7 changes what they show and what they generate, never where they are mounted. Spec 013 milestone U3 moves them (part list to the Plant activity, form to the Inspector, signal table beside the plant-map editor); M7 and U3 never edit the same file (section "Shared files"). (3) **Declarations are a pure module** (`IDE/src/plant/editor/declarations.ts`) that returns text per language; the button that calls it belongs to U3 (PLS-006). (4) **Course data is generated, never counted by hand where a generator can count** (`tools/ci/generate-lesson-index.ts`, `tools/docs/generate_course_pages.ts`); the hand-written places that name a lesson count are listed and changed once, in Task D3. (5) **Scene text lives beside the scene** (`plant-scenes/<id>/text.json`, new), because `scene.json` rejects unknown top-level keys (`IDE/src/plant/core/sceneSchema.ts:29`) and the scene index carries the same name for both languages today (`IDE/scripts/generate-scene-index.ts:53`, a `ponytail` note). (6) **Claims come from evidence files** (CRS-013): a docs check fails on a frame-rate, latency or board claim in a plant page that no evidence file backs.

**Tech Stack:** TypeScript 5.9 (`erasableSyntaxOnly`: no parameter properties), React 19 with the React Compiler lint, Bun 1.3.14 (`bun test`), the Studio UI kit (`IDE/src/ui`), the lesson package format of 2.0 (`lesson.json`, `scenario.json`, `text.en.json`, `text.es.json`, `plant-map.json`, `checks.json`), Docusaurus v3 for the docs. **No new dependency.**

**Spec:** `spec.md` of 012 sections 5 (SCN, CRS, VIS-001), 6.2 and 7; `course-outline.md` (draft); `plan-m1.md` revision 2 (Task E3 as built, Task L1, Task L2), `plan-m2.md` Task L3, `plan-m3.md` Task L4, `plan-m4.md` (format model; Task L5, D5); `specs/013-zplc-2-1-studio-experience/plan-u3.md` (the homes of the editor, the Guide); the run logbook `odd/tasks/zplc-2-1-0-run.md` (main checkout, not in git; entries L1 to L154).

**Created:** 2026-11-13 by a planning agent. Anything marked **Unconfirmed** was not verified while writing; the executor confirms it first and records the answer in the commit body. "Plan choice" marks a decision of this plan that the spec does not state.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`. `bun test`, `bun run lint` and `bunx tsc -b` run with `IDE/` as the working directory unless the step says "at the root". The pinned formatter is `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` (or `--check`), at the root, after `git add`. Task ids are local to this plan; cite them as `M7-K1` from another document. Tasks of the sibling plan are cited `U3-G1`.

## Roles
| Role | Does |
|---|---|
| Executor | One task each, in its lane. Writes tests first, runs the commands, commits. Never edits a file outside the task's "Allowed edit surfaces". `git add` every new file **before** running the formatter. A lesson writer loads `.agents/skills/zplc-plc-programmer/SKILL.md` first (AGENTS.md, Project Skills). |
| Parent | Owns git across lanes, merges lanes in dependency order, runs the seam check (the full IDE suite once) at each wave merge, owns `IDE/src/i18n/en.ts` and `es.ts`, `docs/sidebars.js`, `IDE/scripts/generate-scene-index.ts` (`SCENE_ORDER`), `IDE/src/generated/*` and `IDE/src/plant/ci/sceneHashes.json` (regenerates and pins at each wave merge), and runs `bun tools/ci/generate-lesson-index.ts --update-hashes` after a lesson writer's commit so that two lesson tasks never edit the generated index. |
| Owner | Approves `course-outline.md` (CRS-001; **gates every GATED task**), answers the open questions, runs the macOS and Windows hash and evidence runs, runs every physical step (HIL on the two learner boards, CRS-009), and sets the key of nothing here (the key question belongs to U3). |

## Start rule
1. **Precondition A, M1 to M4 and U0/U1 as merged.** `feat/plant-simulation` at `a2c80b32` or later. Confirm: `fd -t d . IDE/plant-scenes -d 1 | wc -l` is 17; `rg -n "scene\?: string" IDE/src/learn/lessonPackage.ts` matches (Task L1 of M1); `fd -t f . IDE/src/plant/editor` lists `EditorPanel.tsx PartList.tsx PartForm.tsx SignalTable.tsx declarations.ts`; `fd lesson.json IDE | wc -l` is 68 (no scene lesson exists yet: Findings 2). If not, stop: the parent merges first.
2. **Precondition B, the owner's answers.** Not blocking for the KEEP tasks. **Every GATED task starts only when the owner has approved `course-outline.md`**; without it the executor stops and reports (M1 Task L2 and M2 to M4 Tasks L3 to L5 say the same). Question 2 (siblings or one package per lesson) is answered by the approval of the outline (A2); the plan proceeds on its default.
3. **Fresh worktree.** `export TMPDIR=$HOME/.cache/zplc-tmp` (create it with `mkdir -p`), `bun install`, `bun run build:compiler`, `bun run build:runtime`; in `IDE/node_modules/electron` run `node install.js` and in `IDE/` run `bun run electron:compile` before any journey or capture.
4. **Order.** Wave 1 first. K1 is on the critical path of every lesson (Finding 1): the parent merges it before any lesson task starts. Lesson tasks also wait for the scene tasks they use (M5's F tasks for scenes 7, 10, 11 and 16) and for the sibling milestone tasks named in "Cross-plan dependencies".

## Cross-plan dependencies
| M7 task | Depends on | Why |
|---|---|---|
| L8 | M1-L2 (lessons 12.1 to 12.3, 14.2), M2-L3 (13.1, 13.2) merged | Ladder siblings copy the scene, scenario and teaching of the ST lesson. |
| L9 | M3-L4 (15.1), M4-L5 (16.1, 16.3, 16.4) merged | Same. |
| L10 | **M5** lesson task for 18.1 (plan-m5.md, id not yet known: cite as `M5-<id>` when it lands; **Unconfirmed** that plan M5 writes 18.1: the outline gives 18.1 to M5, scene 11) | Same. If M5 does not write 18.1, this task writes both packages. |
| L6 | M3 scene 5 (merged) | 18.2 `plant-manual-auto` is on scene 5 and **no earlier plan writes it** (M3-L4 covers 15.1 to 15.5 only: Findings 3). |
| D1, C4 | **M5** F tasks (scenes 7, 10, 11, 16) merged | 21 scene pages and the "every scene has a lesson" check need all 21 scenes. |
| H1, D4 (I/O page) | **M6** (plan-m6.md, ids not yet known: `M6-<id>`): the plant I/O mode session, its evidence file with the measured round-trip latency and `shortestPulseMs` comparison, the lesson hardware-track contract | The hardware track and every number on the I/O mode page. |
| U3-P4, U3-P2 | M7-E1, M7-E2 | U3 mounts what M7 finishes. |
| U3-G2, U3-G4 | M7-K1 | The Guide's Check and Practice need a scene lesson that opens and grades. |
| M7-K1 | none of U2 (it avoids `IDE/src/cli/toolApi.ts`, which U2-T1 owns; see Shared files) | |

## Requirement mapping
Requirements that M7 does not deliver are in the last table so nothing is silently dropped.

| Requirement | Task(s) | Note |
|---|---|---|
| SCN-008 | E3, Q6 | "place, move, rotate, duplicate and delete parts with snapping and a grid, while the plant is stopped". Built in M1 (`model.ts`, `pointer.ts`). M7 proves it for **every part of the catalogue as it stands after M5** (E3) and by pointer and by keyboard (Q6), now that learners use it. |
| SCN-009 | E2, E3 | Configure a part's name, variant and limits within the documented range: E3 sweeps every part's config schema (limits refused with a located message, values at the limit accepted). E2 shows each part's one-line description before it is added. |
| SCN-010 | E3, (U3-P5) | Undo and redo for every edit: E3 undoes every edit kind over every part. The **Edit menu commands** are U3's (Finding 5): today they are buttons (`IDE/src/plant/ui/PlantPanel.tsx:233-236`). |
| SCN-011 | E3 | The signal list for every part; a test per catalogue entry (type, direction). U3-P2 places the list. |
| SCN-012 | E3, K1 | "report an unbound or mismatched signal as a located message": E3 over the real map editor; K1 proves a lesson's Check says it. |
| SCN-013 | E1 | "SHOULD generate the variable declarations": the generator exists but only for ST and nothing calls it (Findings 4). E1: five languages, applied to the open program, with the action as a prop; U3-P4 mounts the button. |
| SCN-014 | E2, Q6 | The path with no pointer: kept, and its journey extended (Q2 journey exists, `IDE/scripts/journeys/plantJourneys.ts:121`). |
| SCN-015 | E3, (U3-P5) | Problems at the part: kept; U3 mirrors them into Problems. |
| SCN-016 | E3, D1 | "an empty floor and each reference scene as starting templates": `SceneChooser` lists `SCENE_INDEX` (`IDE/src/plant/ui/SceneChooser.tsx:7`, `:39`); E3 proves every shipped scene opens as a template and validates. |
| SCN-006 | E3 | Migration test: a scene saved by the release (schema 1, `scene.ts:24`) opens; a newer version fails with a located message that names it. Only one version is released; the test pins a fixture so the next bump cannot break it silently. |
| CRS-001 | (owner), K3 | The outline is approved by the owner; K3 and every lesson task wait for it. |
| CRS-002 | K3, K4 | Modules 12 to 19 in Learn ordered by difficulty; paths `plant-st` and `plant-ld`. |
| CRS-003 | K2, C4 | Each scene named by at least one lesson manifest: K2 states the rule, C4 asserts it for the 21 once the last lesson lands. |
| CRS-004 | K1, K2 | "A scene lesson MUST be a data package": K2's guard proves a fixture lesson needs no application change; K1 makes the application able to run it. |
| CRS-005 | K2, L6 to L10 | "graded by a scenario pinned by its content hash, with at least one expectation on a plant fact": K2's guard checks every scene lesson (≥1 `fact:` expectation, hash pinned, solution passes, starter fails). |
| CRS-006 | K1, K2 | Headless, same result on every platform, no 3D view, within 60 seconds: K2 measures the wall time of every scene lesson's grade and fails above 60 s. |
| CRS-007 | L6 to L10, (M1-L2, M2-L3, M3-L4, M4-L5, M5) | The topics list is covered by the outline's rows; C4 prints the table skill-by-lesson from the manifests for the owner's review. |
| CRS-008 | K3, C4 | Each lesson states its languages; C4 asserts ST, LD, FBD, SFC each appear in a new module and warns (does not fail) when IL does not. |
| CRS-009 | H1, D4 | **GATED (CRS-001) and on M6.** The hardware track through plant I/O mode, graded as 2.0 grades on a board. Physical steps are the Owner's. |
| CRS-010 | H1, K2 | The 68 lessons keep starter, solution, scenario, hash and simulation grade: K2 pins the ten plant lessons' scenario hashes; H1 changes only manifests. |
| CRS-011 | L6 to L10, D1 to D4 | Every lesson, hint, part name and scene text in English and Spanish with the same structure (the existing `lessonLanguage.test.ts` runs on new packages unchanged); generated pages per module, lesson and scene; pages for the plant, the parts catalogue, the scene format, the scene editor, plant I/O mode. |
| CRS-012 | L7 | Lessons 19.1 and 19.2 (build a scene, change a scene). |
| CRS-013 | D4, D5 | Public text states only what evidence supports. |
| VIS-001 | W1 | "SHOULD be movable to a window of its own": **conditional** (Open question 4). Maximise is the shell's (M1 W2, merged). |

**Not delivered by M7** (later work, other milestones, or out of scope): the scenes 7, 10, 11 and 16 and their lessons 17.1 to 17.4 and 18.1 (M5); plant I/O mode itself and its evidence (M6); the Guide, the Learn outline, the reading frame, the homes of the editor's three components, the Edit menu commands, the Plant activity and the plant I/O indicator (spec 013 milestone U3); the numeric comparison in scenario expectations (open question 1 of plan M4: M7's lessons use boolean `fact:` expectations); certification and classroom management (spec 5, CRS Out).

## Contract extensions (types and rules; lanes code against these, never against each other)
M7 **extends** the lesson, scene and docs contracts of M1 to M4; it changes none of the scene format (schema stays 1) and none of the 68 packages of 2.0.

```ts
// IDE/src/learn/lessonWorkspace.ts and IDE/src/cli/workspace.ts  (Task K1; names Unconfirmed: the executor reads both files first)
/** What a scene lesson adds to the project the learner opens: the two files of the scene the manifest names. */
export interface SceneProjectFiles { 'scene.json': string; 'plant-map.json': string }
export declare function sceneFilesOf(lesson: { scene?: string }): SceneProjectFiles | null; // reads plant-scenes/<scene>/ at build time (generated index), null for a 2.0 lesson
// Rule R-K1: the workspace of a scene lesson contains scene.json and plant-map.json at the project root; the scenario's `scene.file` and
// `scene.map` are resolved against the project root (a path inside the project, no `..`), never against plant-scenes/.
```

```ts
// IDE/src/plant/editor/declarations.ts  (Task E1; the existing generateDeclarations(signals, 'st') keeps its output byte for byte)
export type DeclarationLanguage = 'ST' | 'LD' | 'FBD' | 'SFC' | 'IL';
/** The variables a program needs to talk to the scene, as text for a text language and as variable rows for a diagram language. */
export type Declarations =
  | { kind: 'text'; language: 'ST' | 'IL'; block: string }
  | { kind: 'variables'; language: 'LD' | 'FBD' | 'SFC'; rows: readonly { name: string; type: 'BOOL' | 'INT' | 'REAL'; direction: 'input' | 'output'; comment?: string }[] };
export declare function declarationsFor(signals: readonly PlantSignalDef[], language: DeclarationLanguage): Declarations;
```

```jsonc
// IDE/plant-scenes/<id>/text.json  (Task D1; the scene index and the scene pages read it; scene.json is unchanged)
{ "name": { "en": "Belt to sensor", "es": "Cinta hasta el sensor" },
  "goal": { "en": "Move a box to a sensor.", "es": "Llevar una caja hasta un sensor." },
  "teaches": { "en": "…", "es": "…" } }
```

**Rules (fixed here, written once, tested in the task named):**
- **R7-L1 lesson identity (K3, L6 to L10).** Ids are the outline's slugs (`plant-belt-to-sensor`, …); a Ladder sibling is `<id>-ladder` (the 2.0 convention: `seal-in-ladder`, `IDE/lessons/seal-in-ladder`). A package names `scene`, never `plant` (`lessonPackage.ts:333`). Starter and solution are `IDE/projects/<id-with-underscores>_starter` and `_solution`, which `IDE/src/utils/exampleCatalog.ts:189-195` keeps off the Welcome list.
- **R7-L2 grading (K2).** Every scene lesson's scenario has a `scene` block and at least one expectation whose subject is `fact:<name>` (CRS-005). The scenario hash is the manifest's `scenario.sha256` (`generate-lesson-index.ts --update-hashes` pins it). The reference solution passes, the starter fails, headless, in at most 60 s of wall time.
- **R7-L3 languages (K3).** A lesson's `languages` and its starter's file extension agree (`curriculum.test.ts` `editedLanguageOf`); a sibling differs only in language, starter, solution and the text that names the language. Same scene, same scenario file (hash equal), same expectations.
- **R7-L4 level and tracks (K3, H1).** Modules 12 to 19 are `advanced` (A4: levels never go back, `courseDefinition.ts:163-165`); a module offers a track only if one of its lessons does; a lesson that is not simulation-only names why in `unsupported.hardware` in both languages until H1 opens it.
- **R7-E1 declarations (E1).** Names come from the existing identifier rule (`declarations.ts:4-14`); types come from the signal; no `AT` address is chosen (binding stays explicit, LNK-002). A sensor is an input of the program, a command an output.
- **R7-D1 counts (D3).** A lesson count, a module count and a scene count in a hand-written page equals the generated index, in both languages, or the docs check fails.

## Lanes and dependency graph
**KEEP** = survives any gate outcome and any answer to the owner's questions. **GATED** = waits for the approval of the outline. **PHYS-adjacent** = runs a scene on the plant core (the existing scene CI), so it is re-run if D-14 is overturned.

| Lane | Task | Title | Kind | Depends on | Lane-owned surface (summary) |
|---|---|---|---|---|---|
| X | X0 | Contracts: catalogs, journey files | KEEP | A | `IDE/src/i18n/catalog/{plantEditorLearner,plantCourse}.ts`, `en.ts`, `es.ts`, `IDE/scripts/journeys/plantCourse.ts` |
| K | K1 | Scene lessons in the workspace and in Learn | KEEP, PHYS-adjacent | A | `IDE/src/learn/{lessonWorkspace,managedWorkspace,lessonCheck}.ts`, `IDE/src/cli/workspace.ts` |
| K | K2 | The scene-lesson guard (CRS-003, 005, 006, 010) | KEEP | K1 | `IDE/src/learn/sceneLessons.test.ts`, `tools/ci/scene-lessons.ts` |
| E | E1 | Declarations in five languages | KEEP | A | `IDE/src/plant/editor/{declarations,SignalTable}.tsx` and tests |
| E | E2 | The catalogue for learners | KEEP | X0 | `IDE/src/plant/editor/PartList.tsx` and test |
| E | E3 | The editor against the whole catalogue; migration; templates | KEEP | A (and M5 scenes for the last test) | `IDE/src/plant/editor/catalogue.sweep.test.ts`, `IDE/src/plant/core/sceneMigration.test.ts` |
| Q | Q6 | Journeys: build a scene by pointer and by keyboard, declare, bind, run | KEEP | E1, E2 | `IDE/scripts/journeys/plantCourse.ts` |
| W | W1 | The plant in a window of its own (**conditional**, Open question 4) | KEEP, high risk | none | `IDE/electron/plantWindow.ts`, `IDE/electron/main.ts`, preload |
| D | D1 | Scene text and generated scene pages | KEEP | E3, M5 scenes | `IDE/plant-scenes/*/text.json`, `tools/docs/generate_scene_pages.ts`, `docs/docs/plant/scenes*`, `IDE/scripts/generate-scene-index.ts` (names only) |
| D | D2 | Course pages know scenes | KEEP | K1 | `tools/docs/generate_course_pages.ts` and test |
| D | D4 | The scene editor page and the plant I/O mode page | KEEP (claims wait for M6) | E1, E2 | `docs/docs/plant/{scene-editor,io-mode}.md` + es, `plant/index.md` |
| D | D5 | The claims guard (CRS-013) | KEEP | A | `tools/docs/check_plant_claims.ts` and test |
| K | K3 | Modules 12 to 19 | **GATED** | K1, K2, approval | `IDE/lessons/course.json`, `IDE/src/learn/curriculum.test.ts`, `lessonScene.test.ts` |
| L | L6 | Lesson 18.2 `plant-manual-auto` (ST and Ladder) | **GATED**, PHYS-adjacent | K3 | `IDE/lessons/plant-manual-auto*`, `IDE/projects/plant_manual_auto*` |
| L | L7 | Lessons 19.1 and 19.2 (ST and Ladder) | **GATED**, PHYS-adjacent | K3 | `IDE/lessons/plant-build-belt-scene*`, `plant-change-scene*`, `IDE/projects/*` |
| L | L8 | Ladder siblings: 12.1, 12.2, 12.3, 13.1, 13.2, 14.2 | **GATED**, PHYS-adjacent | K3, M1-L2, M2-L3 | six `*-ladder` packages and projects |
| L | L9 | Ladder siblings: 15.1, 16.1, 16.3, 16.4 | **GATED**, PHYS-adjacent | K3, M3-L4, M4-L5 | four `*-ladder` packages and projects |
| L | L10 | Ladder sibling: 18.1 | **GATED**, PHYS-adjacent | K3, M5 lesson 18.1 | one package and project |
| H | H1 | The hardware track of the lessons that qualify; the ten 2.0 plant lessons | **GATED**, on M6 | M6, lessons merged | `lesson.json` of the lessons named by the evidence |
| K | K4 | Paths `plant-st` and `plant-ld` | **GATED** | L6 to L10 | `IDE/lessons/course.json`, `coursePaths.test.ts` |
| D | D3 | Hand-written pages and every count of lessons | **GATED** | K3, K4, all L | `docs/docs/learn/*`, README, roadmap, es twins |
| Q | Q7 | Journey: a scene lesson end to end, and lesson 19.1 | **GATED** (needs real lessons) | K1, L7, M1-L2 | `IDE/scripts/journeys/plantCourse.ts` |
| Q | C4 | Requirement coverage, the 21-scene lesson check, the closing checks | partly **GATED** | all | `tools/ci/requirement-*`, `IDE/src/learn/sceneLessons.test.ts` (second owner) |

**Graph.**
```
X0 -> E2 ; E1 ; E3 (needs M5 scenes for the final test) -> Q6 (E1, E2) ; K1 -> K2 ; K1 -> D2
E3, M5 scenes -> D1 ; E1, E2 -> D4 ; D5 (standalone) ; W1 (standalone, conditional)
-- approval of the outline --
K1, K2 -> K3 -> L6, L7 ; K3 + M1..M4 lessons -> L8, L9 ; K3 + M5-18.1 -> L10
M6 + lessons -> H1 ; L6..L10 -> K4 -> D3 ; K1, L7, M1-L2 -> Q7 ; all -> C4
```
**Parallel waves** (tasks of a wave have disjoint file surfaces and may run together; the parent merges at the end of each wave and runs the seam check):
1. **X0** (parent or one writer; wave 1 first, alone, small), then **K1, E1, E3, D5, W1**.
2. **K2, E2, D2, Q6, D4** (E2 needs X0; K2 and D2 need K1 merged; Q6 needs E1 and E2; D4 needs E1 and E2). **D1** joins when M5's scenes have merged.
3. **K3** (after approval). Alone: it edits the course file every lesson task also needs to be valid.
4. **L6, L7, L8, L9** in parallel (four writers, disjoint packages). **L10** joins when M5's lesson 18.1 has merged. The parent runs `--update-hashes` after each.
5. **H1** (after M6 and the lessons), **K4** (after every L), **Q7**.
6. **D3**, then **C4**.

### Shared files and who edits them
- `IDE/src/learn/lessonWorkspace.ts`, `managedWorkspace.ts`, `lessonCheck.ts`, `IDE/src/cli/workspace.ts`: only K1 in M7. **`IDE/src/learn/useLessonCheck.ts` and `IDE/src/components/LearnPanel.tsx` are U3's** (U3-G2); K1 does not edit them. If K1 needs a hook change, it asks the parent. **`IDE/src/cli/toolApi.ts` is U2-T1's**; K1 does not edit it.
- `IDE/src/plant/editor/PartList.tsx`: only E2. `declarations.ts`, `SignalTable.tsx`: only E1. `PartForm.tsx`, `EditorPanel.tsx`, `model.ts`, `commands.ts`: none of M7's tasks (E3 adds tests and fixes only through a named bug in its commit body, asking the parent first). **`IDE/src/plant/ui/PlantPanel.tsx` and `IDE/src/shell/PlantDocument.tsx`: U3 only.**
- `IDE/src/i18n/en.ts`, `es.ts`: only X0 (it imports the empty catalogs once). Each task adds keys only to its own catalog: `plantEditorLearner.ts` (E1 then E2), `plantCourse.ts` (K1, Q6, Q7). `plantEditor.ts` stays as merged.
- `IDE/lessons/course.json`: K3 then K4, each from the merged result; no lesson task edits it. `IDE/src/generated/lessonIndex.*`: the parent only.
- `IDE/scripts/generate-scene-index.ts`: the parent (`SCENE_ORDER`); D1 changes only the names source, after M5's F tasks have merged.
- `docs/sidebars.js`, `docs/docs/plant/index.md`, `docs/docs/plant/scenes.md` and its Spanish twin: D1 and D4 write the pages; the parent edits `sidebars.js` once at the wave merge from the page lists in the commit bodies.
- `IDE/scripts/journeys.ts` (the registration): only X0 (one line for `plantCourse.ts`); Q6 and Q7 add journeys in `plantCourse.ts`, never in the list.
- `tools/ci/requirement-evidence.json`, `requirements-index.json`: only C4.

## Global Constraints
- **The Global Constraints of `plan-m4.md` apply unchanged** (its integration lessons of M1, M2, M3 and M4: `git add` before the formatter; text through `t()` with the neutral usted register and the product named "ZPLC"; lines at most 140 columns; tests that import `useIDEStore` call `stubProjectLoader()` first; `itNative` for native-runtime tests; `erasableSyntaxOnly`; React Compiler lint; journeys need `ZPLC_NATIVE_SIM_BIN` in the same command; `/tmp` may be out of inodes; Monaco traps Tab, press Ctrl+M first; a scenario has at most 10,000 samples; the scene schema rejects unknown top-level keys; scene index and pinned hashes are the parent's; tests use the real catalogue; a placed or measured item needs rest). Read them before the first task. M7 adds the following.
- **Lessons (the 2.0 rules still hold).** A lesson is a data package (LRN-027); text in `text.en.json` and `text.es.json` with the same structure; quoted facts are marked so CI checks them against the reference scenario (LRN-025); Spanish in the neutral usted register with the glossary terms (`docs/docs/learn/glossary.md`; the voseo guard of `IDE/src/learn/lessonCi.test.ts:89`); no physical operation in a lesson (LRN-015); only the reference scenario grades (LRN-022). The scenario is written once and **the hash is pinned by the generator** (`bun tools/ci/generate-lesson-index.ts --update-hashes` run by the parent), never typed by hand.
- **A lesson task proves its package before it ends**, in this order: `bun test src/learn` in `IDE/` (the package, language and parity tests), `bun test src/components/learnLesson.test.ts`, the scene lesson guard of K2 (`bun test src/learn/sceneLessons.test.ts`), and at the root `bun tools/ci/generate-lesson-index.ts --check`, `bun test ./tools/ci`, `bun test tools/docs`. A lesson that cannot be passed by its own reference solution in the application's runner is not delivered.
- **Edit surfaces of a lesson task always include the projects.** The packages of M1 to M4 name only `IDE/lessons/plant-*/*`; a package also needs `IDE/projects/<id>_starter/*` and `<id>_solution/*` (Findings 3). They are listed in each task here.
- **No claim without evidence (CRS-013).** No frame rate, latency, board or hardware-support figure in any page, lesson text or hint unless an evidence file in `specs/012-zplc-2-1-plant-simulation/evidence/` backs it and the text names the file. Until M6's evidence exists the pages say "not yet measured on the reference machines" (the sentence `docs/docs/plant/index.md` already uses).
- **No physical operations.** Nothing here flashes, deploys, opens a serial port, forces I/O on a board or starts plant I/O mode. H1 changes manifests and pages only; every HIL run is the Owner's (AGENTS.md guideline 7).
- **Verification commands (per task, in this order).** In `IDE/`: `bun test <the task's test paths>`, `bunx tsc -b`, `bun run lint`. At the root, once at the end: the pinned formatter `--check`, `bun test ./tools/ci`, `bun tools/ci/requirement-coverage.ts --check`. A task that touches docs also runs `bun test tools/docs` and `bun tools/docs/generate_course_pages.ts --check`. The parent runs the full IDE suite at each wave merge. A finding is a finding: do not change a threshold or a test to make a check pass; report it.
- **Dependencies and security.** No new dependency. The sandboxed renderer and the content security policy do not change, except Task W1 (conditional, high risk: a new window with the same hardening; constitution rule 6).
- **Tests through public interfaces**, requirement ID first in the test name. Each test asserts every observable effect of its rule. When a task changes an existing helper, one test proves its previous behaviour still holds (E1: the ST output of `generateDeclarations` byte for byte; K1: a 2.0 plant lesson loads and grades as before; D2: the 68 existing pages are byte-identical).
- **Docs.** Every page in English (`docs/docs/`) and Spanish (`docs/i18n/es/docusaurus-plugin-content-docs/current/`) in the same commit series. The interface says "Plant", never "Lab" (decision D-25 of spec 013). A hand-written count is changed only in D3.
- **Commits.** Conventional Commits, no AI attribution, no Co-Authored-By line, one commit per lesson (the lesson tasks) and per task otherwise, tests and docs alongside the behaviour. About 400 changed lines per task is a heuristic, not a cap (L tasks, D1 and K1 may exceed it; say why). Pushing, merging and opening a pull request are the owner's.
- **Shell.** `bat`, `rg`, `fd`, `eza`; not `cat`, `grep`, `find`, `ls`.

## Review Focus (conditions the spec implies; each has a test in the task that owns it)
1. A scene lesson of the application behaves like the CI harness: the same scenario, the same plant facts, the same verdict, from Learn's Check and from `sceneCheck.ts` (K1, K2).
2. A learner-built scene is graded on what the plant did: a scene without the part the lesson names fails with a located message, not with a silent "false" (K1, L7).
3. A starter always fails and the reference always passes, for ST and Ladder alike; the two siblings of a lesson share scene, scenario and hash (K2, L8 to L10).
4. The 68 lessons of 2.0 and the ten plant lessons keep starter, solution, scenario, hash and grade; opening a track changes only the manifest (K2, H1).
5. The editor never leaves a scene in a state it cannot save: every edit of every catalogue part undoes, redoes and validates; a refused edit leaves state unchanged (E3).
6. Declarations never choose an address and never overwrite what the learner typed (E1).
7. The catalogue shown to a learner lists every part and nothing else, grouped by family, with the family names and descriptions in both languages (E2).
8. A number in a page equals the repository: lesson, module, scene and part counts, in both languages (D1 to D3, D5).
9. English and Spanish have the same structure for every new lesson, hint, scene text and page (CRS-011).
10. No page claims a frame rate, latency or board without an evidence file (D4, D5).

---

### Task X0: Contracts: catalogs and journey files
**Spec:** (infrastructure). **Lane X. Wave 1, first. KEEP. Run by the parent or one writer.**

**Allowed edit surfaces**
```
IDE/src/i18n/en.ts
IDE/src/i18n/es.ts
IDE/src/i18n/catalog/plantEditorLearner.ts
IDE/src/i18n/catalog/plantCourse.ts
IDE/scripts/journeys.ts
IDE/scripts/journeys/plantCourse.ts
```
Create the two catalogs (empty `as const` English and Spanish objects), import them once in `en.ts` and `es.ts`, create `plantCourse.ts` with an empty `journeysCourse` export and register it in `journeys.ts` (read how `journeysSorting` is registered, `journeys.ts:39`).
- [ ] **Step 1: Failing test:** the existing catalogue parity test (**Unconfirmed** name: `rg -ln "plantEditor" IDE/src/i18n --glob '*.test.ts'`) must fail when a catalog is imported in English only; create the catalogs empty and see it pass.
- [ ] **Step 2: Run** `bun test src/i18n`, `bunx tsc -b`, `bun run lint`. **Commit:** `chore(ide): catalogs and journey file for the learner editor and the course`. **Risk:** none.

---

### Task K1: Scene lessons in the workspace and in Learn
**Spec:** CRS-004, CRS-005, CRS-006, SCN-012, LNK-001. **Lane K. Wave 1. KEEP (PHYS-adjacent: it runs a scene).** This is the critical task of M7 (Findings 1).

**Allowed edit surfaces**
```
IDE/src/learn/lessonWorkspace.ts
IDE/src/learn/managedWorkspace.ts
IDE/src/learn/lessonCheck.ts
IDE/src/cli/workspace.ts
IDE/src/learn/sceneLessonWorkspace.test.ts
IDE/src/i18n/catalog/plantCourse.ts
```
(`useLessonCheck.ts`, `LearnPanel.tsx` and `toolApi.ts` are not here: Shared files.)

**Interfaces.** Contract "Scene lessons" above. Today the manifest names a scene and the index carries `scene` and `plantMap` (`lessonPackage.ts:804-807`), CI can run a scene scenario (`IDE/src/plant/ci/sceneCheck.ts`, through `compileScenario` with a `CompiledScene`, `IDE/src/test-engine/index.ts:65-86`), and the plant document loads the project's own `scene.json` or `scenes/*.scene.json` (`IDE/src/plant/ui/usePlantSession.ts:208`). But `rg -n "scene" IDE/src/learn/lessonWorkspace.ts IDE/src/learn/lessonCheck.ts IDE/src/cli/workspace.ts` finds nothing: no code opens a lesson's scene into the workspace or resolves a `scene` block when the workspace runner grades. **Unconfirmed in detail**: read `cli/workspace.ts` (how it calls `compileScenario`) and `lessonCheck.ts:50-100` (how Check builds the run) first.
Plan choice (R-K1): the starter project carries `scene.json` and `plant-map.json`; the workspace opens them with the program; the runner resolves the `scene` block against the project root, loads the map (`validatePlantMap`), and passes a `CompiledScene` built exactly as `sceneCheck.ts` builds it. A scene or map that does not parse is a located message (path and reason), a map signal bound to a variable the program does not declare is a located message naming the signal (SCN-012). The 2.0 `scenario.plant` path is untouched.

- [ ] **Step 1: Failing tests** (`sceneLessonWorkspace.test.ts`, on the fixture lesson of `IDE/src/learn/lessonScene.test.ts:12-58`, never on a real lesson): `'CRS-004 a scene lesson opens its scene.json and plant-map.json in the learner project'`; `'CRS-005 Check on the starter of a scene lesson fails on a plant fact and passes on the reference'` (same verdicts as `runSceneCheck` for the same files: assert equal `solution` and `starter` results); `'SCN-012 a map signal bound to a variable the program lacks is a located message that names the signal'`; `'CRS-006 the grade runs headless and finishes in at most 60000 ms'` (measure with the existing clock helper; no 3D view imported); `'PLT-013 a 2.0 plant lesson opens and grades as before'` (motor-plant-feedback through `loadLessonPackages()` unchanged).
- [ ] **Step 2: Run** `bun test src/learn/sceneLessonWorkspace.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the contract. **Step 4: Verify** `bun test src/learn src/cli src/test-engine src/plant/ci`, `bunx tsc -b`, `bun run lint`; root: pinned formatter `--check`, `bun test ./tools/ci`.
- [ ] **Step 5: Commit** `feat(learn): a scene lesson opens its scene in the project and grades on plant facts`. **Risk:** item 3 (the workspace runner is shared with every 2.0 lesson and the CLI; the 2.0 test above and `bun test src/learn src/test-engine` unchanged are the guard); item 4 (headless clock). **Independent verifier:** yes (Review Focus 1, 2).

---

### Task K2: The scene-lesson guard
**Spec:** CRS-003, CRS-005, CRS-006, CRS-010. **Lane K. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/learn/sceneLessons.test.ts
tools/ci/scene-lessons.ts
tools/ci/scene-lessons.test.ts
```
**What it checks, for every lesson whose manifest names a scene** (zero lessons today: the guard passes vacuously and is proven on the fixture of K1): the manifest names a scene directory that exists and whose map the lesson's `plant-map.json` targets; the scenario has a `scene` block and at least one expectation on `fact:<name>` where the name satisfies the fact grammar of the scene (`sceneCheck.ts` `factFault`); the scenario hash equals `scenario.sha256`; the reference solution passes and the starter fails through the K1 runner; the wall time of each grade is at most 60 s (printed per lesson); a sibling (`-ladder`) has the same `scenario.sha256` as its ST lesson. It also pins, for the ten 2.0 plant lessons, `scenario.sha256`, starter and solution project names as they are at `a2c80b32` (CRS-010: only the manifest `tracks` and `unsupported` may change; the pin compares everything else), and states the "every scene has a lesson" rule as `missingSceneLessons()` returning the scene ids with no lesson (C4 asserts it empty at the end).
- [ ] **Step 1: Failing tests:** `'CRS-005 a scene lesson with no fact expectation is refused'`, `'CRS-005 an empty program cannot pass: the starter must fail'`, `'CRS-006 a grade over 60 s is refused'`, `'CRS-010 the ten 2.0 plant lessons keep their scenario hashes and projects'`, `'CRS-003 missingSceneLessons lists the scenes no lesson names'`, `'R7-L3 a Ladder sibling has the hash of its ST lesson'` (on the K1 fixtures with a copied sibling).
- [ ] **Step 2 to 4:** `bun test src/learn/sceneLessons.test.ts` (FAIL, implement, pass), `bunx tsc -b`, `bun run lint`; root `bun test tools/ci/scene-lessons.test.ts`. **Commit:** `test(learn): a guard for scene lessons: plant-fact expectations, hashes, grade time, siblings`. **Risk:** item 6 mitigated (the guard is the test).

---

### Task E1: Declarations in five languages
**Spec:** SCN-013. **Lane E. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/editor/declarations.ts
IDE/src/plant/editor/declarations.test.ts
IDE/src/plant/editor/SignalTable.tsx
IDE/src/plant/editor/EditorPanel.test.tsx
IDE/src/i18n/catalog/plantEditorLearner.ts
```
**Interfaces.** Contract "Declarations" above. Today `generateDeclarations(signals, 'st')` returns the VAR blocks (`declarations.ts:19-29`), throws for any other language, and **nothing calls it** (`rg -n generateDeclarations IDE/src --glob '!*.test.*'` finds only the definition). A learner starts in Ladder, FBD, SFC or Instruction List as often as in ST (the 2.0 course has a Ladder path). How each language declares variables is **Unconfirmed**: read how `IDE/src/editors` and `IDE/src/models/projectBlocks.ts` store a Ladder or FBD document's variables, and how an IL file declares (`VAR ... AT %Q0.0` appears in IL per plan U2 Findings 3). Plan choice: ST and IL get a text block (`kind: 'text'`); LD, FBD and SFC get rows (`kind: 'variables'`) that the document's own variable table takes; applying rows to a document is the caller's (U3-P4), which owns the store. `SignalTable` gains one optional prop `onCreateDeclarations?: (language: DeclarationLanguage) => void` and a button that calls it; absent, nothing changes in the table.
- [ ] **Step 1: Failing tests:** `'SCN-013 ST output is unchanged byte for byte'` (the previous behaviour test), `'SCN-013 each language returns the variables of the scene, inputs for sensors and outputs for commands'`, `'SCN-013 a REAL and an INT signal keep their type in every language'`, `'SCN-013 no AT address is chosen'`, `'LNK-002 a name collision gets a numeric suffix in every language'`, `'SCN-013 the button appears only with the prop and calls it with the chosen language'` (render test, `EditorPanel.test.tsx` style).
- [ ] **Step 2 to 4:** `bun test src/plant/editor`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(plant): declarations for a scene's signals in all five languages`. **Risk:** none (pure generation; the call site is U3's).

---

### Task E2: The catalogue for learners
**Spec:** SCN-014, SCN-009, VIS-011 (words), PRT-002. **Lane E. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/editor/PartList.tsx
IDE/src/plant/editor/PartList.test.tsx
IDE/src/i18n/catalog/plantEditorLearner.ts
```
**Interfaces.** `PartList` offers the whole catalogue as one flat `<select>` in catalogue order (`PartList.tsx:36-43`), about forty parts after M5. `PartDefinition.family` (`contracts.ts:33`) and the part `doc` (PRT-002) exist and are unused here. Change (props stay compatible; new props optional): options grouped by family in `<optgroup>` with the family name in both languages (`plantEditorLearner.ts`), a filter field that narrows the options by name in the active language, and the chosen part's one-line description (the first sentence of its `doc[locale]`) under the select, announced politely when the choice changes. Still a native select and a button: the keyboard path (SCN-014) is unchanged. No scene state moves.
- [ ] **Step 1: Failing tests** from a **real catalogue** (`catalogue.list()` of the shipped parts, never hand-typed names): `'SCN-014 every shipped part is offered once, grouped under its family'`, `'SCN-014 the filter narrows by the part name in English and in Spanish and keeps the choice valid'`, `'PRT-002 the description of the chosen part is its documented first sentence in the active language'`, `'SCN-014 the add path needs no pointer: Tab to the select, choose, Tab to Add, Enter'`, `'PLT-013 the previous props still render the flat list'` (previous behaviour).
- [ ] **Step 2 to 4:** `bun test src/plant/editor src/i18n`, `bunx tsc -b`, `bun run lint`. **Commit:** `feat(plant): the parts list is grouped by family and says what each part is`. **Risk:** none.

---

### Task E3: The editor against the whole catalogue; migration; templates
**Spec:** SCN-006, SCN-008 to SCN-011, SCN-015, SCN-016, PRT-010. **Lane E. Wave 1 (the last test waits for M5's scenes, in wave 2). KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/editor/catalogue.sweep.test.ts
IDE/src/plant/core/sceneMigration.test.ts
IDE/src/plant/core/fixtures/scene-v1-release.json
```
(Tests and one fixture. A bug that a test finds in `model.ts`, `commands.ts` or a part is reported and fixed by the owner of that file; ask the parent.)

**What it proves** (the editor was written in M1 against three parts; `PartList` now offers about forty): for **every part id of `catalogue.list()`**, placed on an empty floor at a grid point: `place` succeeds and snaps (SCN-008); `move`, `rotate` (15 degree steps) and `duplicate` succeed and `remove` restores the previous scene (SCN-008); `configure` accepts each documented limit and refuses a value outside it with its config path (SCN-009); every edit has an undo and a redo that restore a byte-identical scene (SCN-010); `signals()` lists the part's signals with type and direction and removes them on remove (SCN-011); a duplicate name is reported at the part (SCN-015); and a running plant refuses every edit (SCN-008). Migration: a v1 scene file of this release opens through `migrateScene`; a scene whose `schemaVersion` is 2 fails with a located message that names `2` and the supported `1` (SCN-006, `scene.ts:12-24`, `sceneSchema.ts:30-35`). Templates: the empty floor and **each shipped scene** (`SCENE_INDEX`) opens in the editor, validates with no problem, and saves and reopens equal (SCN-016); the last assertion runs over 21 scenes once M5 merged, over the shipped ones before.
- [ ] **Step 1: Failing tests:** the names above, requirement ID first, e.g. `'SCN-010 every part of the catalogue undoes and redoes every edit byte for byte'`, `'SCN-006 a scene of a newer schema fails with a located message that names its version'`, `'SCN-016 every shipped scene opens as a template and validates'`.
- [ ] **Step 2 to 4:** `bun test src/plant/editor/catalogue.sweep.test.ts src/plant/core/sceneMigration.test.ts`; if a test fails for a real defect, record it as a finding and stop that part; `bunx tsc -b`, `bun run lint`. **Commit:** `test(plant): the scene editor against every part of the catalogue, scene migration and templates`. **Risk:** none.

---

### Task Q6: Journeys: build a scene by pointer and by keyboard, declare, bind, run
**Spec:** SCN-008 to SCN-014, SCN-016. **Lane Q. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/scripts/journeys/plantCourse.ts
IDE/src/i18n/catalog/plantCourse.ts
```
Read `IDE/scripts/journeys/plantJourneys.ts:121` (the Q2 journey "A scene is built, bound and run from the keyboard alone") and `plantSupport.ts` helpers first. Journeys: (1) from the empty floor, add a belt, a sensor and a stop by the catalogue select (filter by name, family groups from E2), position them with the numeric fields, bind the signals, run in simulation and see a fact change, by keyboard alone (press Ctrl+M first where the walk crosses Monaco); (2) the same scene placed by **pointer** (drag on the canvas, `PlantCanvas.tsx:152-191`; **Unconfirmed** that a journey has ever driven the drag: `rg -n drag IDE/scripts/journeys` finds nothing) and one undo step; (3) press the declaration button when the host mounts it (U3-P4): until then the journey asserts the prop-driven button in `EditorPanel` and records that the application button is U3's. Expected: the 2.0 journeys and the M1 to M4 plant journeys unchanged. A journey that needs a GPU is out of scope; journeys give no timing evidence.
- [ ] **Step 1: Failing journeys; Step 2: implement; Step 3: run** `ZPLC_NATIVE_SIM_BIN=<worktree>/firmware/lib/zplc_core/build/zplc_runtime bun run smoke:journeys` in `IDE/` (**Unconfirmed** binary path, confirm with `eza`). **Step 4: commit** `test(plant): journeys that build, declare, bind and run a scene by pointer and by keyboard`. **Risk:** item 5 (drives the application; the stale-binary trap of L16/L24).

---

### Task W1: The plant in a window of its own (CONDITIONAL on Open question 4)
**Spec:** VIS-001 (SHOULD), spec 013 PLS-001. **Lane W. Wave 1 start, last to merge. KEEP. High risk (item 2).**

**Allowed edit surfaces**
```
IDE/electron/plantWindow.ts
IDE/electron/plantWindow.test.ts
IDE/electron/main.ts
IDE/electron/preload.ts
IDE/electron/security.test.ts
```
Nothing in `IDE/src/plant/` or `IDE/src/shell/` changes here: the command that opens the window and the document that moves into it are U3's (it adds a registered command). **Unconfirmed**: how the sandboxed renderer can show a second 3D document (same renderer bundle with a route, or the same project state over IPC): read `main.ts:312` (the first `BrowserWindow`) and `security.test.ts` first. The window gets the same hardening as the first (sandbox on, context isolation, no node integration, the same content security policy, the same navigation guards); a test asserts each flag and that no remote URL loads. If the window cannot share the plant session without weakening any of them, the task stops and records VIS-001's window as not delivered; the spec says SHOULD.
- [ ] **Step 1: Failing tests:** `'VIS-012 the plant window has the sandbox, context isolation and the content security policy of the main window'`, `'VIS-012 the plant window refuses navigation and new windows'`; **Step 2 to 4:** `bun test electron`, `bun test src/security`(**Unconfirmed** path of the CSP test; `rg -ln "content security policy" IDE --glob '*.test.ts'`), `bunx tsc -b`. **Commit:** `feat(electron): a window of its own for the plant, with the hardening of the main window`. **Risk:** item 2 (security: sandbox, guards). **Independent verifier:** yes, mandatory, before merge.

---

### Task D1: Scene text and generated scene pages
**Spec:** CRS-011, CRS-013, PRT-002. **Lane D. Wave 2, after M5's scenes merged (for the 21). KEEP.**

**Allowed edit surfaces**
```
IDE/plant-scenes/*/text.json
IDE/scripts/generate-scene-index.ts
IDE/scripts/generate-scene-index.test.ts
tools/docs/generate_scene_pages.ts
tools/docs/generate_scene_pages.test.ts
docs/docs/plant/scenes.md
docs/docs/plant/scenes/*.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/scenes.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/scenes/*.md
```
(The generator edit is the names source only: `text.json` replaces the repeated scene name at `generate-scene-index.ts:53-56`, and a scene with no `text.json` is a located problem. `SCENE_ORDER` stays the parent's.) **Content.** One `text.json` per scene directory (contract above): name, goal, what it teaches, in both languages, original text (P17), taken from the spec's table of reference scenes and the existing hand-written `scenes.md`, whose per-scene paragraphs move into `text.json`. The generator writes, in both languages, one page per scene `docs/docs/plant/scenes/<id>.md` (name, goal, what it teaches, the parts with their counts, the signals of the plant map with type and direction, `shortestPulseMs`, what the scenario checks, the lessons that use it from the lesson index, and "what is not claimed") and turns `scenes.md` into a generated index. Facts come from `scene.json`, `plant-map.json` and `scenario.json`; no frame rate, latency or board appears (CRS-013).
- [ ] **Step 1: Failing tests:** `'CRS-011 every scene has a page in English and in Spanish with the same table structure'`, `'CRS-011 the page of a scene lists its signals from the plant map'`, `'CRS-011 --check fails when a scene changes and its page does not'`, `'CRS-013 a scene page states no frame rate, latency or board'`, `'CRS-011 a scene without text.json is a located problem of the scene index'`, `'SCN-001 the scene index carries a Spanish name different from the English one'`.
- [ ] **Step 2 to 4:** `bun test tools/docs/generate_scene_pages.test.ts`; `bun tools/docs/generate_scene_pages.ts --write` then `--check` (exit 0); in `IDE/`: `bun scripts/generate-scene-index.ts --check`, `bun test scripts`. **Commit:** `docs(plant): a generated page for every reference scene, in English and Spanish`. **Risk:** item 5 (the scene index generator is shared; a test keeps its output for the 17 scenes of M1 to M4 except the Spanish names).

---

### Task D2: Course pages know scenes
**Spec:** CRS-011. **Lane D. Wave 2. KEEP.**

**Allowed edit surfaces**
```
tools/docs/generate_course_pages.ts
tools/docs/generate_course_pages.test.ts
docs/docs/learn/plants.md
docs/i18n/es/docusaurus-plugin-content-docs/current/learn/plants.md
```
`lessonBody` writes `Plant: none` for a lesson whose manifest names a scene (`generate_course_pages.ts` reads `lesson.plant`, `null` for a scene lesson), and `plantsBody` lists only `lesson.plant` values. Change: a scene lesson links `[<scene name>](../../plant/scenes/<id>.md)` in its facts (D1's page; the link target is checked), and `learn/plants.md` gains a second table "Scenes" with the lessons that use each. The 68 existing lesson pages and the module pages stay byte-identical (Review Focus 4). Test fixtures use the K1 fixture lesson through an injected index, never a real lesson.
- [ ] **Step 1: Failing tests:** `'CRS-011 a scene lesson page links the page of its scene'`, `'CRS-011 the Spanish page links the Spanish scene page'`, `'PLT-013 the pages of the 68 lessons of 2.0 are unchanged'`, `'CRS-011 the plants page lists scenes and their lessons'`. **Steps 2 to 4:** `bun test tools/docs/generate_course_pages.test.ts`, `bun tools/docs/generate_course_pages.ts --check`. **Commit:** `docs(learn): course pages link the scene of a scene lesson`. **Risk:** none.

---

### Task D4: The scene editor page and the plant I/O mode page
**Spec:** CRS-011, CRS-013, CRS-009. **Lane D. Wave 2 (the editor page); the I/O page text waits for M6's evidence. KEEP.**

**Allowed edit surfaces**
```
docs/docs/plant/scene-editor.md
docs/docs/plant/io-mode.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/scene-editor.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/io-mode.md
docs/docs/plant/index.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/index.md
```
`scene-editor.md` (a learner's page, task-shaped): build a scene from the empty floor, add a part from the list (groups, filter, description), position it with the numeric fields or by dragging, snapping and the grid, configure within the documented ranges, see the signal list and the problems at each part, bind the signals to variables, create the declarations (the page says where the button is once U3 mounts it: **write the page against the interface as merged; if U3 has not merged, say "the Signals table" and fix the wording in D3**), undo and redo, save, run. `io-mode.md`: what plant I/O mode is (LNK-007), the explicit action and confirmation, safe-state default and mirroring (D-16), what to connect for the hardware track, **every number as "not yet measured on the reference machines" until M6's evidence file exists; then the page cites it by path**. Update `plant/index.md` "Pages in this section". The parent adds both pages to `sidebars.js`.
- [ ] **Step 1: Failing tests:** `bun test tools/docs` structure and parity tests (**Unconfirmed** file: `docs_structure.test.ts`) plus `'CRS-011 the scene editor page exists in both languages with the same headings'`, `'CRS-013 the I/O mode page states no latency or board support unless an evidence file backs it'` (D5's check). **Steps 2 to 4:** `bun test tools/docs`, `bun tools/docs/check-docs-config.ts`. **Commit:** `docs(plant): the scene editor and plant I/O mode, in English and Spanish`. **Risk:** item 6 (claims beyond evidence; guarded by D5).

---

### Task D5: The claims guard
**Spec:** CRS-013, P6. **Lane D. Wave 1. KEEP.**

**Allowed edit surfaces**
```
tools/docs/check_plant_claims.ts
tools/docs/check_plant_claims.test.ts
```
A check over `docs/docs/plant/**` and `docs/docs/learn/**` (and the Spanish twins) and the lesson texts of scene lessons: a figure with a unit of frame rate (`fps`, `FPS`, "frames per second", "cuadros por segundo"), latency (`ms` next to "latency"/"latencia"), or a named board next to the words "supported"/"compatible"/"soportada" fails unless the same paragraph cites a file of `specs/012-zplc-2-1-plant-simulation/evidence/` that exists. Existing pages pass (they say "not yet measured"). Wire it into the existing docs checks (**Unconfirmed**: how `check_capability_claims.ts` is invoked; add a call, do not fork it).
- [ ] **Step 1: Failing tests:** `'CRS-013 a plant page with "60 fps" and no evidence file fails'`, `'CRS-013 the same sentence citing an existing evidence file passes'`, `'CRS-013 the pages of this tree pass'`, `'CRS-013 the Spanish twin is checked'`. **Steps 2 to 4:** `bun test tools/docs/check_plant_claims.test.ts`, `bun test tools/docs`. **Commit:** `test(docs): plant pages claim only what an evidence file backs`. **Risk:** none.

---

### Task K3: Modules 12 to 19 (GATED, CRS-001)
**Spec:** CRS-001, CRS-002, CRS-008, CRS-010. **Lane K. Wave 3, alone. GATED.**

**Allowed edit surfaces**
```
IDE/lessons/course.json
IDE/src/learn/curriculum.test.ts
IDE/src/learn/lessonScene.test.ts
IDE/src/learn/courseDefinition.test.ts
```
Add the eight modules of `course-outline.md` section 1 to `course.json`: `id` 12 to 19, `level: "advanced"` (A4), `requires` per the table (module 12 requires 3, 13 requires 12, 14 requires 12, 15 requires 14, 16 requires 14, 17 requires 16, 18 requires 17, 19 requires 18), `tracks: ["simulation"]` until H1, titles and "why" in English and Spanish (the outline's titles; the "why" paragraph says why the module sits there, as each 2.0 module does and as `curriculum.test.ts:155-165` requires). Extend the curriculum table (`curriculum.test.ts:20-109`, `TABLE`) with rows 12 to 19 and the languages each allows (12: ST, LD; 13: ST, LD, FBD; 14: ST, LD, SFC; 15: ST, LD, SFC; 16: ST, LD, IL; 17: ST, SFC; 18: ST, LD; 19: ST, LD). **Two tests froze the old layout and change** (VF-006), each named in the commit body: `curriculum.test.ts:116` (`modules.map(id)` equals the table: the table grows) and `lessonScene.test.ts:80-87` (the hard-coded "68 packages, none naming a scene": restate it as "the 68 packages of 2.0, named by id, name no scene and validate as before"; **if M1-L2 has already restated it, this step is done**: Findings 5). A module with no lesson yet must not break `generate_course_pages.ts` (`moduleBody` prints "none").
- [ ] **Step 1: Failing tests:** `'CRS-002 the course has modules 0 to 19 in order, each requiring an earlier one and never lowering the level'`, `'CRS-002 each new module says why it sits where it does, in both languages'`, `'CRS-010 the 68 packages of 2.0 are unchanged and name no scene'`. **Steps 2 to 4:** `bun test src/learn`, `bun tools/ci/generate-lesson-index.ts --check`, `bun test tools/docs`, `bunx tsc -b`. **Commit:** `feat(learn): modules 12 to 19 of the industrial automation course`. **Risk:** item 1 (the course file is data every lesson reads; the 2.0 suites unchanged are the guard).

---

### Task L6: Lesson 18.2 `plant-manual-auto`, in ST and in Ladder (GATED)
**Spec:** CRS-003 to CRS-007 (manual and automatic modes), CRS-008, CRS-011. **Lane L. Wave 4. GATED. PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/lessons/plant-manual-auto/*
IDE/lessons/plant-manual-auto-ladder/*
IDE/projects/plant_manual_auto_starter/*
IDE/projects/plant_manual_auto_solution/*
IDE/projects/plant_manual_auto_ladder_starter/*
IDE/projects/plant_manual_auto_ladder_solution/*
```
**Content** (outline row 18.2, "Switch between manual jog and the automatic sequence without surprises", scene 5 Two-axis assembly, M3, merged; prerequisite lessons of A5 settle by id when written: `sfc-fill-mix-sequence` and the scene 5 lesson 15.2 `plant-assembler` of M3-L4). A package in the 2.0 layout, built from `IDE/plant-scenes/two-axis-assembly/` (copy `scene.json` and `plant-map.json` into each starter and solution project, R-K1) and its `reference.st`. The scenario drives the mode selector and a jog, then the automatic sequence, with **at least one `fact:` expectation** per outcome (an assembled count; no drop; the manual jog moves an axis only in manual mode) and a fault action. Hints name what to look at, never the answer. ST and Ladder siblings share the scenario file. The Ladder solution is authored with the `zplc-plc-programmer` skill and proven by the K1 runner. Hardware track: **closed** (`unsupported.hardware` with a reason and "instead", both languages): the outline marks it Sim only.
- [ ] **Step 1: Failing guard:** `bun test src/learn/sceneLessons.test.ts` lists the new lesson and fails until the package is complete. **Step 2: build** the package; the parent runs `--update-hashes`. **Step 3: verify** per Global Constraints (the lesson task order). **Step 4: two commits** `feat(lessons): plant-manual-auto` and `feat(lessons): plant-manual-auto-ladder`. **Risk:** item 6 (pedagogy), item 1 (hash-pinned content). **Independent verifier** for the package format use, once per wave.

---

### Task L7: Lessons 19.1 and 19.2, in ST and in Ladder (GATED; CRS-012)
**Spec:** CRS-012, CRS-005, CRS-011, SCN-008 to SCN-014. **Lane L. Wave 4. GATED. PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/lessons/plant-build-belt-scene/*
IDE/lessons/plant-build-belt-scene-ladder/*
IDE/lessons/plant-change-scene/*
IDE/lessons/plant-change-scene-ladder/*
IDE/projects/plant_build_belt_scene_starter/*
IDE/projects/plant_build_belt_scene_solution/*
IDE/projects/plant_build_belt_scene_ladder_starter/*
IDE/projects/plant_build_belt_scene_ladder_solution/*
IDE/projects/plant_change_scene_starter/*
IDE/projects/plant_change_scene_solution/*
IDE/projects/plant_change_scene_ladder_starter/*
IDE/projects/plant_change_scene_ladder_solution/*
```
**Content** (outline rows 19.1 and 19.2; assumption A9). **19.1 "Build a scene from the empty floor":** the starter project's `scene.json` is the empty floor (`IDE/src/plant/editor/templates.ts`) and its `plant-map.json` is empty; the learner places a belt, a sensor and a stop with the parts **named** in the lesson (`Belt1`, `Eye1`, ...: the names the reference scene uses), binds the signals and writes the program (ST or Ladder). The scenario runs on **the learner's saved scene** (R-K1 resolves `scene.file` in the project) and its expectations are plant facts (`delivered:` and `count:` of the named parts, as in scene 1). **A scene missing a part the lesson names fails with a located message that names the part** (Review Focus 2; **Unconfirmed** whether `compileScenario` reports an unknown part as a message or yields a silent false: read `test-engine/index.ts:303-312` and `sceneCheck.ts` `factFault`; if silent, K1 adds the message and this task waits). The solution project carries the built scene; the starter fails because the empty floor delivers nothing. **19.2 "Change a scene":** the starter is scene 9 (Merge two lines) as shipped; the learner adds a part and re-binds without breaking the program; expectations are facts of the added part. The lesson texts state the rules (names, signals) because the spec does not say how a built scene is graded (A9 and Open question 3). Hardware track: closed (both lessons), reason: the editor is part of the lesson.
- [ ] **Steps and commits as L6**; four commits, one per package. **Risk:** item 6, item 1. **Independent verifier:** yes (the guard that grades a learner-built scene is the new idea of M7).

---

### Task L8: Ladder siblings for modules 12 to 14 (GATED)
**Spec:** CRS-008, CRS-011, assumption A2. **Lane L. Wave 4. GATED. PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/lessons/plant-belt-to-sensor-ladder/*
IDE/lessons/plant-latch-two-sensors-ladder/*
IDE/lessons/plant-counted-queue-ladder/*
IDE/lessons/plant-timed-tank-ladder/*
IDE/lessons/plant-tank-level-scaling-ladder/*
IDE/lessons/plant-merge-lines-ladder/*
IDE/projects/plant_belt_to_sensor_ladder_{starter,solution}/*
IDE/projects/plant_latch_two_sensors_ladder_{starter,solution}/*
IDE/projects/plant_counted_queue_ladder_{starter,solution}/*
IDE/projects/plant_timed_tank_ladder_{starter,solution}/*
IDE/projects/plant_tank_level_scaling_ladder_{starter,solution}/*
IDE/projects/plant_merge_lines_ladder_{starter,solution}/*
```
(Lessons 12.1, 12.2, 12.3, 13.1, 13.2 and 14.2 of the outline. Each sibling copies the scenario, scene and map of its ST lesson **unchanged** (hash equal, R7-L3) and writes Ladder starter and solution; the text says Ladder where the ST text says ST and keeps every hint's intent. Hardware track as the ST lesson at the time of writing; H1 opens both together.) **Needs the ST lessons merged** (M1-L2, M2-L3), else stop and report.
- [ ] Steps as L6; six commits `feat(lessons): plant-<id>-ladder`. **Risk:** item 6, item 1.

### Task L9: Ladder siblings for 15.1, 16.1, 16.3, 16.4 (GATED)
**Lane L. Wave 4. GATED. PHYS-adjacent.** Same rules as L8, for `plant-belt-transfer-ladder` (15.1), `plant-colour-separation-ladder` (16.1), `plant-weight-sorting-ladder` (16.3), `plant-height-chain-ladder` (16.4), with the projects `plant_belt_transfer_ladder_*`, `plant_colour_separation_ladder_*`, `plant_weight_sorting_ladder_*`, `plant_height_chain_ladder_*`.

**Allowed edit surfaces**
```
IDE/lessons/plant-belt-transfer-ladder/*
IDE/lessons/plant-colour-separation-ladder/*
IDE/lessons/plant-weight-sorting-ladder/*
IDE/lessons/plant-height-chain-ladder/*
IDE/projects/plant_belt_transfer_ladder_{starter,solution}/*
IDE/projects/plant_colour_separation_ladder_{starter,solution}/*
IDE/projects/plant_weight_sorting_ladder_{starter,solution}/*
IDE/projects/plant_height_chain_ladder_{starter,solution}/*
```
Needs M3-L4 and M4-L5 merged. Four commits. **Risk:** item 6, item 1.

### Task L10: Ladder sibling for 18.1 (GATED, on M5)
**Lane L. Wave 4 (joins after M5's lesson 18.1). GATED. PHYS-adjacent.** `plant-estop-interlocks-ladder`, same rules; if M5 did not write 18.1 (Cross-plan dependencies), this task writes `plant-estop-interlocks` too (scene 11, `three-level-lifts`).

**Allowed edit surfaces**
```
IDE/lessons/plant-estop-interlocks-ladder/*
IDE/projects/plant_estop_interlocks_ladder_{starter,solution}/*
```
(add `IDE/lessons/plant-estop-interlocks/*` and `IDE/projects/plant_estop_interlocks_{starter,solution}/*` only in the fallback). One commit. **Risk:** item 6, item 1.

---

### Task H1: The hardware track of the lessons that qualify (GATED, on M6)
**Spec:** CRS-009, CRS-010, LNK-014, LNK-016, D-17. **Lane H. Wave 5. GATED. Starts only when M6 has merged and recorded its evidence file; the HIL runs are the Owner's.**

**Allowed edit surfaces**
```
IDE/lessons/*/lesson.json
IDE/lessons/*/wiring.json
IDE/lessons/*/text.en.json
IDE/lessons/*/text.es.json
IDE/lessons/course.json
docs/docs/learn/hardware-track.md
docs/i18n/es/docusaurus-plugin-content-docs/current/learn/hardware-track.md
```
(Only the lessons that the M6 evidence names, as a list in the commit body. **Unconfirmed**: the manifest and wiring form of a lesson whose hardware track runs through plant I/O mode: `lessonPackage.ts` `hardware` and `lessonPackageHardware.test.ts` are the 2.0 form; M6's plan states the plant-mode contract, cite as `M6-<id>`.) Rule: a lesson offers `hardware` only if its scene's `shortestPulseMs` is not shorter than the worst-case round-trip latency M6 published for a learner board (LNK-014; the outline's eight candidates 12.1, 12.2, 13.1 to 13.4, 14.1, 18.1 are an assumption A1 that the evidence replaces). The page of such a lesson says what to connect (CRS-009). The ten 2.0 plant lessons (`course-outline.md` section 3) are opened **only if M6's plan supports plant I/O mode for the 2.0 plants** (D-19, LNK-007); otherwise they stay as they are and the commit body says why. **Nothing about a scenario, starter, solution, hash or simulation grade changes** (CRS-010; K2's pin proves it). Each module's `tracks` gains `hardware` where a lesson does.
- [ ] **Step 1: Failing tests:** `'CRS-009 a lesson offering the hardware track names what to connect, in both languages'`, `'CRS-010 opening a track changes only the manifest: the scenario hash, starter and solution of the ten plant lessons are the pins of K2'`, `'CRS-009 a lesson whose scene pulse is shorter than the published latency stays Sim only'`. **Steps 2 to 4:** per Global Constraints plus `bun test src/learn/lessonPackageHardware.test.ts`. **Commit:** `feat(lessons): open the hardware track of the lessons the plant I/O evidence supports`. **Owner step (not run here):** one hardware-track scene lesson completed on each selected learner board (spec 5, CRS verification), recorded as evidence. **Risk:** item 6 (claims about hardware), item 3 (manifest of 2.0 lessons).

---

### Task K4: Paths `plant-st` and `plant-ld` (GATED)
**Spec:** CRS-002. **Lane K. Wave 5. GATED.**

**Allowed edit surfaces**
```
IDE/lessons/course.json
IDE/src/learn/coursePaths.test.ts
```
Add the two paths (`course.json` `paths`, `courseDefinition.ts:84-108`): `plant-st` (language ST) lists every lesson that offers ST in module order (outline: 23), `plant-ld` (language LD) every Ladder lesson and sibling (14); the six lessons that are only FBD, SFC or IL stay in their modules (A3). Titles, summaries and rationales in both languages. Order inside a path decides when a lesson opens (`coursePaths.test.ts:79-105`: path order replaces the prerequisites). A path may only name lessons that exist (`validateCoursePlacement`), which is why K4 runs after every L task.
- [ ] **Step 1: Failing tests:** `'CRS-002 the course has the paths ladder, plant-st and plant-ld, each with lessons of its language only'`, `'CRS-002 plant-st holds every ST lesson of modules 12 to 19 in module order'`, `'CRS-002 the first lesson of a path is open and the next opens when it is passed'`; the LRN-044 test of `ladder` (21 lessons) is untouched. **Steps 2 to 4:** `bun test src/learn`, `bun tools/ci/generate-lesson-index.ts --check`. **Commit:** `feat(learn): the plant-st and plant-ld paths`. **Risk:** item 1 (course data).

---

### Task D3: Hand-written pages and every count of lessons (GATED)
**Spec:** CRS-011, CRS-013, constitution rule 8. **Lane D. Wave 6. GATED.**

**Allowed edit surfaces**
```
docs/docs/learn/course-outline.md
docs/docs/learn/index.md
docs/docs/learn/plants.md
docs/docs/learn/hardware-track.md
docs/docs/contributing/roadmap.md
docs/docs/getting-started/index.md
docs/docs/release-notes/index.md
docs/docs/reference/learner-kits/index.md
README.md
docs/i18n/es/docusaurus-plugin-content-docs/current/learn/*.md
docs/i18n/es/docusaurus-plugin-content-docs/current/contributing/roadmap.md
docs/i18n/es/docusaurus-plugin-content-docs/current/getting-started/index.md
docs/i18n/es/docusaurus-plugin-content-docs/current/reference/learner-kits/index.md
tools/ci/course-outline.test.ts
```
The places that name a count: `README.md:46`, `docs/docs/learn/index.md:6` and `:18` ("68, in 12 modules (0 to 11)"), `docs/docs/learn/course-outline.md:12` and `:29` ("Available today: **68**. Planned: **0**."), `docs/docs/contributing/roadmap.md:20`, plus the places `rg -n "68 lessons|68 lecciones|12 modules|12 módulos"` finds in both languages (`tools/docs/check_capability_claims.ts` compares `lessons` claims with `lessonIndex.json`). Change them to the counts of the index (default: 111 lessons, 20 modules; 97 if Open question 2 is answered "one package"). `course-outline.md` gains headings and rows for modules 12 to 19 (the format `tools/ci/course-outline.test.ts:55-100` checks: a heading per module, a row per lesson with languages, plant and minutes, "Why this order" equal to the course rationale, the paragraph under each module's facts equal to its `why`); the same test file gains the check that the Spanish page matches (it already reads both). The scene editor page's wording about the declaration button is fixed to the merged U3 interface. State the time of the course only from the manifests (`estimatedMinutes`), never an estimate.
- [ ] **Step 1: Failing tests:** `'R7-D1 every hand-written lesson, module and scene count equals the generated index, in both languages'`, `bun test tools/ci/course-outline.test.ts` (fails until the page lists the modules). **Steps 2 to 4:** `bun test tools/docs tools/ci`, `bun tools/docs/generate_course_pages.ts --check`, `bun tools/docs/generate_scene_pages.ts --check`. **Commit:** `docs(learn): the outline and every count of the course after modules 12 to 19`. **Risk:** item 6 (claims).

---

### Task Q7: Journey: a scene lesson end to end, and lesson 19.1 (GATED: needs real lessons)
**Spec:** CRS-004 to CRS-006, CRS-012. **Lane Q. Wave 5. GATED.**

**Allowed edit surfaces**
```
IDE/scripts/journeys/plantCourse.ts
IDE/src/i18n/catalog/plantCourse.ts
```
Journeys: open lesson 12.1 from Learn (whichever surface Learn has at that time: the LearnPanel of today or the Guide of U3-G1; read the helpers of `IDE/scripts/journeys.ts` journey 11 and 52 first), see the plant beside the program, edit the program, Check, pass; then 19.1: build the scene in the editor, save, Check, see the located message for a missing part, fix it, pass. **Unconfirmed** how the journey reaches Check if U3-G2 has moved it; the journey uses the registered command or the stable `data-learn-check` attribute (`LearnPanel.tsx:377`) and is updated by U3-G2's task if it moves. Expected: journeys 11 and 52 unchanged. Needs `ZPLC_NATIVE_SIM_BIN` as above.
- [ ] **Steps:** failing journey, implement, run `bun run smoke:journeys`. **Commit:** `test(learn): journeys for a scene lesson and for building the scene of lesson 19.1`. **Risk:** item 5.

---

### Task C4: Requirement coverage, the 21-scene lesson check, the closing checks
**Spec:** section 7 items 1 to 3 and 8. **Lane Q. Wave 6. Partly GATED (the lesson assertions). Run by the parent or a CI-hygiene writer after the other tasks merge.**

**Allowed edit surfaces**
```
tools/ci/requirement-evidence.json
tools/ci/requirements-index.json
tools/ci/requirement-coverage.test.ts
IDE/src/learn/sceneLessons.test.ts
IDE/src/generated/sceneIndex.ts
IDE/src/plant/ci/sceneHashes.json
```
(The evidence mechanism is **Unconfirmed** beyond what the M2 and M4 hygiene commits show: read `tools/ci/requirement-coverage.ts` and the `generate:*` scripts first. Coverage fixtures are never pinned to today's uncovered ids.) Steps: `bun tools/ci/requirement-coverage.ts --check` (exit 0; SCN-006, SCN-008 to SCN-016 and CRS-001 to CRS-013 covered or recorded as conditional on a decision; LNK pending with M6); the second owner of `sceneLessons.test.ts` adds `'CRS-003 every one of the 21 reference scenes is named by at least one lesson'` (asserts `missingSceneLessons()` empty), `'CRS-008 Structured Text, Ladder, Function Block Diagram and Sequential Function Chart each appear in a lesson of modules 12 to 19'`, and a **warning**, not a failure, when Instruction List does not (SHOULD); prints the skill-by-lesson table for the owner (CRS-007). Final: `bun test`, `bun run lint`, `bun test ./tools/ci`, `bun test tools/docs`, every generator `--check`, the pinned formatter `--check`. Commit: `test(ci): requirement coverage and the scene lesson check for M7`. **Risk:** item 5 (CI tooling).

---

## Open questions for the owner
Only real product decisions. Each has a recommended default; the plan proceeds on the default unless told otherwise, except question 1, which gates every GATED task.

1. **Approval of the course outline (CRS-001).** `course-outline.md` is a draft; its assumptions A1 to A10 are settled by approval. *Recommended default: approve it as drafted before wave 3.* Until then M7 delivers the editor for learners, scene lessons in the application, the guards, the scene and course pages and the docs; no lesson, module, path or count changes. The spec's definition of done item 3 cannot be met without it.
2. **One package per language, or one package with two starters (outline A2).** The package format has one starter and one solution (`lessonPackage.ts:129-131`), and the 2.0 course uses sibling packages with the suffix `-ladder`. (A) Siblings: 14 lessons marked `ST/LD` become 28 packages; **43 new packages and 111 lessons in all**. (B) Extend the format so one package carries a starter per language: 29 packages and 97 lessons, but a contract change to the lesson package, to Learn and to the guards. *Recommended default: A.* No application change, the 2.0 pattern, the per-language paths of the outline fall out of it, and the cost is content (Task L8 to L10), which the milestone is for. This also settles how M1-L2, M2-L3, M3-L4, M4-L5 read "ST or LD": each of those plans writes the ST package, and M7 writes the Ladder sibling.
3. **How a scene the learner built is graded (outline A9, lessons 19.1 and 19.2).** (A) The lesson ships the starter scene in the project, the scenario runs on the learner's saved scene file, the expectations are plant facts of parts the lesson names, and a missing part is a located message. (B) Add a structural expectation kind to scenarios ("the scene has a part named X of kind Y") that checks the scene before it runs. *Recommended default: A.* No new scenario key (P4: the scenario format of 2.0 does not change), and what is graded is what the plant did (CRS-005); B can follow if learners need a clearer message.
4. **The plant in a window of its own (VIS-001, a SHOULD).** (A) Build it as the last task (W1), merge only if the security checks and the independent verifier pass, else record it as not delivered. (B) Defer to 2.1.x. *Recommended default: A*, because the owner asked for all of 2.1 and the second monitor is the stated reason; it is the only task of M7 that touches `IDE/electron/`, so it merges last and alone.

## Findings in the spec and in the merged code (contradictions and things that could not be verified)
1. **A scene lesson cannot yet open or be graded in the application.** The manifest and the index carry `scene` and `plantMap` (`IDE/src/learn/lessonPackage.ts:126`, `:804-807`) and CI grades scene scenarios through `IDE/src/plant/ci/sceneCheck.ts`, but `rg -n "scene" IDE/src/learn/lessonWorkspace.ts IDE/src/learn/lessonCheck.ts IDE/src/learn/useLessonCheck.ts IDE/src/cli/workspace.ts IDE/src/cli/toolApi.ts` finds nothing. Task L1 of M1 delivered the package format only; M1-L2 to M4-L5 assume the application opens and grades what they write. K1 closes this and is therefore the first task of M7; **Unconfirmed in detail** until the executor reads `cli/workspace.ts` (the finding rests on a search, not on a run of a scene lesson).
2. **No scene lesson exists in the tree.** `fd lesson.json IDE | wc -l` is 68 and none names a scene (`lessonScene.test.ts:80-87` pins exactly that). The guard of K2 therefore passes vacuously until the first lesson lands.
3. **The edit surfaces of M1-L2, M2-L3, M3-L4 and M4-L5 omit the projects.** They list `IDE/lessons/plant-*/*`; a package's `starter.project` and `solution.project` are folders of `IDE/projects/` (`lessonPackage.ts:15-17`; `IDE/src/utils/exampleCatalog.ts:189-195`), so a writer that follows those plans exactly cannot create them. Lesson 18.2 `plant-manual-auto` (outline row, scene 5, M3) is in **no** plan: M3-L4 lists 15.1 to 15.5 only. Both are fixed here (L6 to L10 list the projects); the parent should tell the M1 to M4 writers.
4. **SCN-013's generator exists and is unused.** `generateDeclarations` supports `'st'` only (`declarations.ts:19`) and has no caller outside tests; the spec says a learner "starts a program without typing the I/O list" in any language. E1 and U3-P4.
5. **Undo and redo are buttons of the plant panel** (`PlantPanel.tsx:233-236`, `data-plant-undo`, `data-plant-redo`), although the text of M1 Task E3 and PLS-005 say they are commands of the Edit menu; the whole edit state is local to `PlantPanel` (`:111`). U3-P1 and U3-P5 own the fix. The two tests that froze the 68-lesson layout (`lessonScene.test.ts:80-87`, `curriculum.test.ts:116`) change in K3 unless M1-L2 changed the first.
6. **The outline numbers modules 12 to 19; the brief for this plan said 12 to 17.** The outline (section 1) has eight modules and 29 lessons; the spec's CRS-002 does not fix a number. This plan follows the outline (modules 18 and 19 hold CRS-007's safety, modes, diagnosis lessons and CRS-012's build-a-scene lessons). If the owner trims the outline, K3, K4 and D3 change; nothing else does.
7. **Scene names are the same in both languages.** `IDE/scripts/generate-scene-index.ts:53` copies `scene.json`'s `name` to English and Spanish; CRS-011 asks for scene text in both languages. D1 adds `text.json` per scene.
8. **The hand-written scene page and the generated course pages can drift.** `docs/docs/plant/scenes.md` is hand-written (142 lines, 17 scenes); CRS-011 asks for pages *generated from the packages* per scene. D1 replaces it with generated pages.
9. **`generate_course_pages.ts` shows `Plant: none` for a scene lesson** (it reads `lesson.plant`, which is `null` when the manifest names a scene, `lessonPackage.ts:333`); D2.
10. **The outline's "ST/LD in one package" (A2) does not match the package format** (`starter` is a single program, `lessonPackage.ts:129`); only the capstone `one-logic-five-languages` lists several languages and it has one starter (`src/Gate.st`). Open question 2.
11. **The window of its own is not built** (VIS-001 SHOULD; `plan-m1.md` open question 2): `rg "new BrowserWindow" IDE/electron` finds only the main window (`main.ts:312`). W1 is conditional.
12. **Unconfirmed baseline facts I could not read in the time given:** whether the lesson workspace copies every file of a starter project (so `scene.json` and `plant-map.json` travel with it) or only the program and tests (K1 step 1); how Ladder, FBD and SFC documents store variables (E1); whether an unknown part in a `fact:` expectation is a message or a silent false (L7); whether Instruction List can drive a plant scene (the same open item as M4-L5, which writes the IL lesson); the manifest form of a plant-I/O-mode hardware track (H1, M6); whether a journey has ever driven the canvas drag (Q6); the docs structure test names (D4); the requirement-evidence mechanism (C4); the lesson count assertions in `tools/docs/check_capability_claims.ts` beyond what `rg` shows (D3).

## Done when (aligned with spec section 7, for M7)
- [ ] The owner has the answers or accepted defaults of the open questions; **the outline is approved** or every GATED task is listed as pending with the reason (spec 7 item 3 cannot be met without it).
- [ ] A learner can build a scene from the empty floor, with a grouped and explained catalogue, bind its signals, create the declarations in any of the five languages (the button is U3's) and run it, by pointer and by keyboard; every part of the catalogue places, configures, undoes and validates; the migration, template and located-problem rules hold (SCN-006, SCN-008 to SCN-016; E1 to E3, Q6).
- [ ] A scene lesson opens its scene in the learner's project and Check grades it headless in at most 60 s on plant facts, with the same verdict as the CI harness (CRS-004 to CRS-006; K1, K2).
- [ ] Modules 12 to 19 and the paths `plant-st` and `plant-ld` exist; every lesson of the approved outline is a graded data package in English and Spanish; each of ST, Ladder, FBD and SFC is used (IL as the outline says); every one of the 21 scenes is named by a lesson; lessons 19.1 and 19.2 build and change a scene (CRS-001 to CRS-005, CRS-008, CRS-011, CRS-012; K3, K4, L6 to L10, C4).
- [ ] The hardware track is offered by the lessons whose scene meets the measured latency and by the ten 2.0 plant lessons if M6 supports them; the Owner has run one hardware-track scene lesson on each selected learner board and recorded it (CRS-009, CRS-010; H1, **Owner**).
- [ ] The 68 lessons of 2.0 keep starter, solution, scenario, hash and simulation grade (CRS-010; K2's pins and the unchanged 2.0 suites).
- [ ] The docs site has, in English and Spanish, a generated page for each module, lesson and scene, and pages for the plant, the parts catalogue, the scene format, the scene editor and plant I/O mode; every count equals the index; no page claims a number that no evidence file backs (CRS-011, CRS-013, section 7 item 8; D1 to D5).
- [ ] `bun run lint`, `bun test` (in `IDE/`), `bun test ./tools/ci`, `bun test tools/docs`, `bun tools/ci/requirement-coverage.ts --check`, every generator `--check` and the pinned formatter `--check` pass. All 2.0 suites pass unchanged except the two tests that froze the old layout, each named in its commit.
- [ ] The independent verifiers of K1 (Review Focus 1, 2), L7 (a learner-built scene graded), W1 (if built: the hardening), and one feature-end verifier of the lesson packages (K2's guard, three repeated grades, siblings equal) returned with no open blocker.
- [ ] The tree can ship as a 2.1 pre-release.
