# Feature Specification: ZPLC 2.1 Studio Experience

**Implementation branch**: `feat/studio-experience`, created from the 2.1 integration branch `feat/plant-simulation` and merged back into it (design default; the owner may rename it)  
**Created**: 2026-11-12  
**Status**: Draft. The owner took the seven decisions of section 4.2 on their recommended defaults on 2026-11-12 ("toma las desiciones recomendadas") and asked for the M1 plan to be redone on them. Approval of the document as a whole is not recorded  
**Baseline**: commit `26189851`, version `2.0.0` (the baseline of spec 012; `packages/zplc-ide` is identical at tag `v2.0.0`)  
**Builds on**: [spec 011](../011-zplc-2-0-remediation/spec.md) (principles P1 to P13 and its requirements stay in force) and [spec 012](../012-zplc-2-1-plant-simulation/spec.md) (principles P14 to P17; this spec gives its views a place in the shell)  
**Answers**: open questions 2, 3 and 4 of revision 1 of the M1 plan of spec 012 (`specs/012-zplc-2-1-plant-simulation/plan-m1.md`, commit `e614555e`)  
**Companion**: revision 2 of `specs/012-zplc-2-1-plant-simulation/plan-m1.md`, which plans milestones U0 and U1 of this spec together with M1. U2 and U3 have no plan yet

## Contents
1. [Purpose, audience, and how to read this document](#1-purpose-audience-and-how-to-read-this-document)
2. [Where 2.0 stands](#2-where-20-stands)
3. [Principles](#3-principles)
4. [Scope and decisions](#4-scope-and-decisions)
5. [The workbench model](#5-the-workbench-model)
6. [Workstreams](#6-workstreams): [SHL](#shl-shell-and-surfaces) shell, [FLW](#flw-main-flow) main flow, [TST](#tst-tests) tests, [FND](#fnd-find-and-navigate) find, [MSG](#msg-words-and-feedback) words, [GDE](#gde-learn-in-the-shell-and-first-use) Learn, [PLS](#pls-plant-in-the-shell) plant
7. [Feature preservation inventory](#7-feature-preservation-inventory)
8. [Measures and definition of done](#8-measures-and-definition-of-done)
9. [Delivery order](#9-delivery-order)
10. [Traceability](#10-traceability)
11. [Glossary](#11-glossary)

## 1. Purpose, audience, and how to read this document
This specification defines how ZPLC Studio becomes easier to use in 2.1 without losing anything it does. Studio 2.0 has every surface a controls engineer needs. It also shows most of them at once, repeats some of them in two or three places, and asks the user to remember the order of steps that the product could take by itself. This document gives each job one place, makes the main path one action, and fixes where the plant simulation of spec 012 lives in the shell before that work builds its views.

It changes no file format, no protocol, no compiler or runtime behaviour, and no safety rule.

**Audience.** The owner, who took the decisions of section 4.2. Contributors and agents, who implement and need to know what "done" means. Whoever implements spec 012, because sections 5 and PLS say where its views go.

**Reading path.**

| If you have | Read |
|---|---|
| Ten minutes | Sections 2.2, 2.3, 4.2 and 5 |
| A workstream to implement | Its part of section 6, then its rows in sections 7 and 8 |
| A question such as "where did X go?" | Section 7 |
| A view of spec 012 to build | Section 5 and workstream PLS |
| A doubt about what this spec changes in specs 011 and 012 | Section 4.4 |

**Conventions.** They are the conventions of specs 011 and 012, repeated so that this document stands alone.

- Requirements use MUST, MUST NOT and SHOULD. Each has a stable ID such as `FLW-003`. An ID is never reused. This spec introduces the prefixes SHL, FLW, TST, FND, MSG, GDE and PLS. IDs with other prefixes belong to spec 011 (VF, CMP, LNG, RT, IO, COM, IDE, UX, LRN, HIL, REL, DOC) or to spec 012 (PLT, VIS, PRT, SCN, LNK, CRS).
- Evidence is cited as `path:line` at the baseline commit. `IDE/` is `packages/zplc-ide/`. Within one workstream, a file cited once with its path is afterwards cited by file name, and `:line` alone continues the file named just before it.
- `plan-m1.md` with a line number is revision 1 of `specs/012-zplc-2-1-plant-simulation/plan-m1.md`, at commit `e614555e` on `feat/plant-simulation`. It is later than the baseline; it is cited for what it intended, not for what exists. Revision 2 replaces it and applies the decisions of section 4.2.
- Screenshots are cited by path under `docs/static/img/`. They were captured from the running application by the documentation pipeline at 1440 by 900 pixels.
- **Design default** marks a choice made when this spec was written, not an owner decision. It stands until the owner revises it; section 4.3 lists them.
- Evidence levels follow the constitution (`.specify/memory/constitution.md`, rule 7). Everything this spec measures is host evidence about the desktop application.

**Limits of the evidence.** Nobody launched the application for this spec. The findings come from reading the source at the baseline and from screenshots the documentation pipeline took of the running application. No person was observed using Studio. Two things follow: the first task of milestone U0 measures the table of section 2.3 again on the running application, and the first-use sessions of GDE-013 are the first observation of people.

## 2. Where 2.0 stands
### 2.1 What works and stays
The remediation of spec 011 built the right skeleton. This spec keeps it and changes what goes in it.

| 2.0 has | Evidence | This spec |
|---|---|---|
| A shell with the regions of UX-011: command bar, activity rail, two sidebars, editor area, results panel | `IDE/src/shell/WorkbenchShell.tsx:102-209` | Keeps the regions; changes what each one holds |
| One command registry that feeds the application menu, the palette, the shortcut hints and the keyboard | `IDE/src/commands/registry.ts:1-12` | Extends it to every surface and action |
| A project navigator organised by PLC objects, with a file view as second mode | `IDE/src/navigator/ObjectNavigator.tsx:23-68`, `IDE/src/store/useShellLayout.ts:14` | Keeps both modes; adds creation |
| Tasks, I/O mapping, network, communication and target as editors in the editor area | `IDE/src/navigator/configEditors.ts:7` | Keeps them; one save path |
| An owned component kit, design tokens, one signal vocabulary, light, dark and high-contrast themes | `IDE/DESIGN.md` | Unchanged |
| Notifications that link to their details and show progress | `IDE/src/components/Notifications.tsx:1-5` | Keeps them; changes where they sit and how they merge |
| Session restore, crash recovery, autosave, per-user preferences | `IDE/src/App.tsx:97-139` | Unchanged |
| An operational status model computed by a pure module, a force banner, a designed deploy dialog | `IDE/src/components/OperationalStatusBar.tsx:66-79` | Keeps the model; shows less of it at once |
| Learn: a home with paths, reading pages with live labs, a one-button lesson check, a board track | `IDE/src/components/LearnHomeView.tsx`, `IDE/src/learn/reading/LdTry.tsx` | Keeps all of it; fixes where the lesson sits |
| A journey suite that drives the real application | `IDE/scripts/journeys.ts` | The instrument for the measures of section 8 |

### 2.2 What is wrong, in one paragraph
Spec 011 moved the surfaces of release candidate 3 into the new shell one requirement at a time, and each surface arrived with its own controls, its own words and its own save button. Nothing was removed, which was the rule (P4), and nothing was merged. The result is a correct shell that still behaves as the sum of its parts: ten tabs in the results panel, four sets of run controls, four places to set a simulated input, three places to choose the theme, two save paths for one project, and a main path that needs four ordered actions where the product could take one. The plant of spec 012 was about to be added to this in the same way: revision 1 of its M1 plan put the 3D panel in the Lab tab, gave it a transport of its own, and had the global Run answer "Use the plant panel's Run" (`plan-m1.md:52`, `:863`, `:1168`). The remedy is not a new shell. It is one place for each job and one action for the main path.

### 2.3 Measured baseline
Counted from the source and the screenshots at the baseline. Section 8 sets the target for each row.

| # | Measure | 2.0.0 | Evidence |
|---|---|---|---|
| 1 | Actions from a modified program to a running simulation | 4: save, build, connect, run | `IDE/src/components/workspaceTestPresentation.ts:173`; `IDE/src/components/Toolbar.tsx:591-606`; journey "6 Simulate: connect, run, watch a value change" (`IDE/scripts/journeys.ts:1459`) |
| 2 | Tabs in the results panel | 10 | `IDE/src/components/Console.tsx:272-307` |
| 3 | Results tabs shown with their name at 1440 by 900 | 1 of 10; the other nine are icons | `IDE/src/components/ConsoleTabStrip.tsx:2-5`; `docs/static/img/tutorials/blink-3-built.png` |
| 4 | Sets of run controls | 4: command bar, live plant, recorded replay, reading-page lab. The first two act on the same simulation. | `IDE/src/components/ToolbarRunControls.tsx`; `IDE/src/plants/PlantLivePanel.tsx:169-211`; `IDE/src/components/LabPanel.tsx:248`; `IDE/src/learn/reading/LdTry.tsx:63-70` |
| 5 | Places to set an input of the running simulation | 4: faceplate in Watch, faceplate in Lab, motor buttons in Trace, the Watch table | `IDE/src/components/WatchTab.tsx:10`; `PlantLivePanel.tsx:247`; `Console.tsx:1453`; `IDE/src/components/DebugWatchPanel.tsx` |
| 6 | Controls in the command bar while a simulation runs | 13: nine on the left, four on the right | `docs/static/img/tutorials/blink-running.png` |
| 7 | Facts in the status rail while a simulation runs | 9 | `IDE/src/components/OperationalStatusBar.tsx:119-148`; `blink-running.png` |
| 8 | Times the mode (simulation or hardware) is shown | 3: toggle, indicator, "Mode" field | `ToolbarRunControls.tsx:87`, `:106`; `OperationalStatusBar.tsx:119-124` |
| 9 | Commands in the registry | 38. Five of the ten results tabs have one; none of the five configuration editors has one. | `IDE/src/commands/registry.ts:61-151`, `:86-90`, `:96` |
| 10 | Kinds of thing the palette finds | 1: commands | `IDE/src/commands/CommandPalette.tsx:30` |
| 11 | Languages covered by the project search | 2 of 5: Structured Text and Instruction List | `IDE/src/shell/projectSearch.ts:1-4`, `:33` |
| 12 | Statements of the evidence boundary on one passed test result | 3 | `docs/static/img/screens/guide-scenario-tests.png` |
| 13 | Places to choose the theme | 3, plus four commands | `Toolbar.tsx:957`; `IDE/src/components/settings/AppPreferences.tsx:98`; `IDE/src/components/WelcomeScreen.tsx:136`; `registry.ts:91-94` |
| 14 | Save paths for one project | 2: the active file; the configuration, by a button of its own. There is no "Save all" command. | `Toolbar.tsx:192-198`; `IDE/src/navigator/ConfigEditorHost.tsx:49`; `registry.ts:62-65` |
| 15 | Lessons listed in the lesson panel, as one group of toggle buttons in a 280-pixel sidebar | 68 | `IDE/src/components/LearnPanel.tsx:190-205`; `WorkbenchShell.tsx:126` |
| 16 | English messages that contain "host", "workspace", "POSIX" or "evidence" | About 51, 28, 26 and 26 of about 2,370 | A text scan of `IDE/src/i18n/en.ts` and `IDE/src/i18n/catalog/`; MSG-002 replaces the scan with an exact check |

## 3. Principles
Principles P1 to P13 of spec 011 and P14 to P17 of spec 012 apply unchanged. This spec adds five. A requirement that conflicts with a principle is a defect in this spec.

| ID | Principle | Meaning in practice |
|---|---|---|
| P18 | One job, one place | Each kind of information and each control has one home. The same control never appears twice with a state of its own. |
| P19 | The main path is one action | What a user does most (see a change run, check a lesson, run the tests) takes one action. Steps in between are the product's work, reported as they happen. Physical operations are the exception: they stay separate and human-initiated (P7). |
| P20 | Show what matters now, keep the rest one step away | A surface that is not needed now is hidden, never removed (P4). Every surface has a command, and the palette finds it. |
| P21 | Plain words first, the record on demand | A result is stated in the user's words. Hashes, artifact tables and runtime names stay available behind a disclosure. The evidence boundary is still stated, once (P6, UX-031). |
| P22 | Simpler is measured | "More intuitive" is a count or a timed journey with a baseline and a target, checked on the running application (it extends P2 and P13). |

## 4. Scope and decisions
### 4.1 Owner decisions (binding)
Recorded from the owner's message of 2026-11-12, quoted as written. Numbering continues from S-9 of spec 012.

| ID | Decision | Owner's words |
|---|---|---|
| S-10 | Studio becomes more intuitive and less complicated, loses no functionality, and is better integrated. | "quiero mejorar el "zplc studio" para que sea mas intuitivo y no tan complicado con tantas cosas sin perder funcionalidad, que todo est emejor integrado, sea mas intuitivo, etc." |
| S-11 | The work may ship with release 2.1.0 and takes 2.0 and the 2.1 spec in progress into account. | "esto se puede integrar con la release 2.1.0 que esoty preparando." "toma en cuenta la version actual zplc 2.0 y la spec que ya se esta trabajando zplc 2.1" |

Earlier decisions that still bind this work: nothing is descoped (S-1, P4), no recurring cost (S-2, P5), the Spanish register of decision D-10, the desktop application only (D-07), and the decisions of spec 012.

### 4.2 Decisions taken on the recommended defaults
Each decision was put to the owner with a recommended default. The owner answered on 2026-11-12: "rehaz el plan. toma las desiciones recomendadas." The Decided column is therefore binding. Numbering continues from D-19 of spec 012.

| ID | Decision | Options | Decided | Governs |
|---|---|---|---|---|
| D-20 | Where the plant lives in the shell | (A) A document of the editor area, which can sit beside the program in a split, be maximised, and be moved to a window of its own. (B) Docked in the secondary sidebar. (C) A tab of the results panel, as in 2.0, as VIS-001 reads literally and as `plan-m1.md` Task V4 intends. | A. The learner must see the program and the plant together, and a 3D factory floor does not fit in a panel that opens at 28% of the height (`IDE/src/shell/WorkbenchShell.tsx:174`). It changes one clause of VIS-001 and the edit surface of two M1 tasks (section 4.4). | PLS, SHL-006; Tasks V4 and E3 and open questions 2 and 3 of `plan-m1.md` |
| D-21 | Run in simulation | (A) One action: Run saves, builds what is stale, starts the simulator, loads and runs. (B) The same, but it asks before saving every time. (C) The four separate steps of 2.0. | A, with a preference "Save before build and run" that is on by default and can be set to "Ask". Hardware does not change: connect, deploy and run stay separate (P7). | FLW-001 to FLW-006 |
| D-22 | The results panel | (A) Five tabs by default (Problems, Output, Test results, Watch, Trace), Terminal with a board, and a new home for Tests controls, Interlocks, Lab, Changes and Agent (section 5.3). (B) Keep the ten tabs and only make their names fit. | A. It is the panel UX-011 already describes; 2.0 shipped ten tabs because five surfaces had no other home. | SHL-003, SHL-004, TST, PLS-002 |
| D-23 | Status and result wording | (A) Shorten the words to the vocabulary of MSG-001, keeping every state and every boundary distinguishable. (B) Keep the 2.0 strings and only move the detail behind a disclosure. | A. IDE-029 is kept in meaning: each state 2.0 words differently stays distinguishable, with the one exception MSG-007 names. | MSG-001, MSG-003, MSG-007, FLW-011 |
| D-24 | How much ships in 2.1.0 | (A) All of this spec. (B) U0 before any view of spec 012 is built and U1 with its milestone M1; U2 and U3 as they fit, the rest in 2.1.x (section 9). (C) All of it after 2.1.0. | B. U0 is small and decides where spec 012 puts its views; building those views in the Lab tab first means building them twice. | Section 9 |
| D-25 | The name of the plant surface | (A) "Plant" everywhere; the name "Lab" is retired from the interface and the docs. (B) Keep "Lab" as the name of the activity. | A. Spec 012 defines plant, scene and part, and no document defines Lab. | PLS-001, PLS-002, DOC parity |
| D-26 | Who owns Run, Pause, Step and Reset while a plant runs. This is open question 4 of `plan-m1.md`. | (A) The command bar. Its controls drive whichever transport is active: the debug controller for a program alone, the lock-step plant session when a plant is bound. The plant has no run controls. (B) The default of `plan-m1.md`: the plant panel owns its own Run, Pause, Step and Reset, and the global Run points to the panel. | A. Under P15 there is one clock, so there is one thing to start and stop; with B, the most visible button of Studio is refused while a scene runs. The cost `plan-m1.md` names is real: it touches the debug controller every lesson uses. PLS-003 bounds it with a seam, and the 2.0 suites prove that lessons without a scene do not change. | PLS-003, PLS-013, FLW-014; Task V4 of `plan-m1.md` |

### 4.3 Design defaults
These were chosen while writing and are not owner decisions.

| Default | Where it applies |
|---|---|
| The budgets of section 8: seven controls left of the project name with a simulation target and nine with a board, three on the right, six results tabs, four status items | FLW-009, FLW-011, SHL-003 |
| The editor area splits into two groups side by side, no more, and only side by side | SHL-006 |
| The gear of the command bar opens Preferences; Project settings open from the root of the navigator | SHL-011 |
| The Assistant view exists only while an AI provider is configured | SHL-004, SHL-008 |
| The Inspector may edit a property of the selection | SHL-009 |
| Live values are on by default in simulation and opt-in on a board | FLW-010 |
| Reset resets the program and the plant together | PLS-003 |
| The vocabulary table and its Spanish column | MSG-001 |
| The list of implementation terms kept off the main path | MSG-002 |
| The parts catalogue is the sidebar of the Plant activity; part properties are in the Inspector | PLS-005 |
| Test commands are in the Build menu, plant commands in the View and Online menus, Learn in Help, so that UX-014 keeps its eight menus | FND-002 |
| Default shortcuts of the new commands are chosen in `plan.md` and listed in the shortcut reference | FND-002 |
| Three people for the first-use sessions | GDE-013 |
| Requirement coverage for this spec is tracked with `tools/ci/requirement-coverage.ts`, extended to read this spec | Section 8.2 |

### 4.4 Relationship to specs 011 and 012
Where this spec touches a statement of an earlier spec, the table says which statement holds.

| Earlier statement | Position of this spec |
|---|---|
| UX-011: the results panel holds "Problems, Output, Watch, Trace, Terminal, test results" | Kept, and made true. 2.0 ships ten tabs (section 2.3, row 2). |
| UX-011: the activity rail is "Project, Search, Tests, Learn" | Extended: Plant is added, because spec 012 lifted the exclusion of scene editing and 3D. |
| UX-011: the secondary sidebar holds "Inspector, Toolbox" | Extended: Guide and Assistant are views of it (SHL-008). The toolboxes of the visual editors stay inside their editors. |
| UX-012: the navigator groups | Extended: a Plant group (PLS-011) and creation from each group (SHL-013). |
| UX-014: eight menus | Kept. No menu is added (section 4.3). |
| UX-015: one registry feeds the menu, the palette, the hints and the reference | Extended: every surface and every action is a command (SHL-002, FND-002), and the palette finds more than commands (FND-001). |
| UX-031: the evidence boundary of a surface is stated once | Kept, and enforced per surface (MSG-003). 2.0 states it three times on a test result. |
| UX-032: `IDE/DESIGN.md` describes the shipped interface | Kept, and overdue: at the baseline it says the Explorer is a tab of the lower panel and that there is no command palette (`IDE/DESIGN.md:148-150`, `:214`). Section 8.2 makes it part of done. |
| IDE-007: an autosave setting SHOULD exist | Kept. FLW-006 adds saving before a build or a run, as a separate preference. |
| IDE-020, IDE-021: Problems first; results as notifications that link to details | Kept. SHL-010 and FLW-013 say when the shell moves and where notices sit. |
| IDE-029: the operational status wording MUST be preserved | Kept in meaning under decision D-23: every state stays distinguishable, with the one exception MSG-007 names. |
| IDE-030: the AI assistant and the Changes review are preserved | Kept. They move out of the results panel (SHL-004). |
| IDE-032: the interlock coverage check is preserved in a view of its own | Kept: a view of the Tests activity, with its own heading in the results (TST-006). |
| LRN-004: a lesson is shown in a surface of its own beside the editor and the simulation | Kept. GDE-001 fixes its place, so that it stops moving between sidebars. |
| LRN-018: the plants have play, pause, step and fault actions | Read under P15: play, pause and step are the controls of the command bar, which act on program and plant together (PLS-003). The fault actions stay in the plant. |
| LRN-020: recorded replay stays available and labelled | Kept: it opens in the plant document from a test result (TST-007). |
| LRN-039: a reading page opens full screen over the workbench | Made true (GDE-006). 2.0 covers the editor region only (`IDE/src/shell/WorkbenchShell.tsx:165-167`). |
| LRN-041: a try-it lab runs on a session of its own | Kept. Its controls are the only run controls on a reading page (GDE-006). |
| VIS-001: the 3D panel is shown "where 2.0 shows the live plant" | Changed by decision D-20: the place is the plant document. "Maximisable" and "a window of its own" stay as written. Revision 2 of `plan-m1.md` amends that clause of spec 012 as its precondition C. |
| `plan-m1.md` Task V4: the panel is mounted in `LabPanel.tsx`, has a Maximise control and "owns its transport (Run, Pause, Step, Reset)"; the global Run answers "Use the plant panel's Run" (`:863`) | Changed by D-20 and D-26: the panel is the content of the plant document (PLS-001), Maximise is the shell's command (SHL-007), and the command bar is the transport (PLS-003). The rest of V4 (operation, fallbacks, text) is unchanged. |
| `plan-m1.md` Task E3: `PlantPanel` mounts the editor panel with its part list, form and signal table (`:973`) | Kept for M1, inside the plant document in its edit state. PLS-005 and PLS-006 name the final homes, which arrive with U3; they need the three to be separate components. |
| `plan-m1.md` open question 2: no window of its own in M1 | Agreed. SHL-007 gives Maximise; the window stays spec 012's SHOULD. |
| `plan-m1.md` open question 3: the editor is reachable "from the Lab panel" as "Edit scene" | Agreed, with the place changed: "Edit scene" is an action of the plant document (PLS-004). |
| `plan-m1.md` open question 4: the plant panel owns the transport | Closed by decision D-26: the command bar owns it. |
| VIS-005, VIS-006, VIS-008, VIS-010 | Given a home: PLS-012, PLS-009, PLS-001, PLS-004. |
| SCN-008 to SCN-016: the scene editor and the plant-map editor | Given a home: PLS-005, PLS-006. Their behaviour is spec 012's. |
| LNK-008: plant I/O mode has a persistent indicator of its own | Given a home: one indicator with three states (PLS-008). |
| PLT-005: pause, a breakpoint and a stopped runtime freeze the plant | Its consequence for the interface: one set of run controls (PLS-003). |

### 4.5 Out of scope
- A new visual identity. The Wiring Ledger direction, the tokens and the kit of `IDE/DESIGN.md` stay.
- A docking framework in which any panel can be dragged anywhere. The regions are fixed; SHL-006 adds one split.
- Any change to the project schema, the `.zplc` container, the control protocol, the Tool API, the command-line tool or the MCP server.
- New AI capability. The assistant only moves.
- Usage telemetry. Measures come from journeys and from sessions with people who agreed to them (P5).
- New editor behaviour inside the Ladder, FBD and SFC editors (workstream LNG of spec 011).

**Anti-goals.** These would make the work a failure even if every count improved: a simplification that hides a force, a hardware connection or a fault; an automatic step that touches a board; a "beginner mode" switch, which is two interfaces to test and document; a surface that moved and left no command behind; a release whose documentation shows the old interface.

## 5. The workbench model
### 5.1 Six regions, one job each
A person who knows these six rules knows where anything is.

| Region | Its job | Holds | Rule |
|---|---|---|---|
| Command bar | What you do to the project | Save state, Build, the target, the run controls, Deploy with a board | One primary action; everything else is in menus and the palette |
| Activity rail and primary sidebar | Where you look for things | Project, Search, Tests, Plant, Learn | Lists and trees. Choosing an item opens it in the editor area. |
| Editor area | What you work on | Programs, diagrams, configuration, the plant, reading pages, change reviews, settings | Documents in tabs, one or two side by side |
| Secondary sidebar | About the selected thing or the current task | Inspector, Guide, Assistant | One view at a time. Never the only way to do something. |
| Results panel | What the last action produced | Problems, Output, Test results, Watch, Trace, Terminal | Moves by itself only by the rules of SHL-010 |
| Status rail | What is true now | Target and connection, program state, scan, forces | One line; the rest on request |

Editing:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Save  Build ▾ │ Simulation ▾ │ ▶ Run │           Blinky           ⌕  ◫  ⚙ │ command bar
│ ● Simulation · Stopped                                       scan 10 ms   │ status rail
├────┬──────────────┬───────────────────────────────────────────────────────┤
│ Pr │ PROJECT      │ Main.st │ I/O mapping │                               │
│ Se │ ▾ Programs   │                                                       │
│ Te │     Main     │    editor area: one document, or two side by side     │
│ Pl │ ▾ Tasks      │                                                       │
│ Le │ ▸ Plant      ├───────────────────────────────────────────────────────┤
│    │ …            │ Problems │ Output │ Test results │ Watch │ Trace      │ results panel
└────┴──────────────┴───────────────────────────────────────────────────────┘
```

Running a program against a plant, with a lesson open:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Save  Build ▾ │ Simulation ▾ │ ⏸ Pause  ⏭  ⏹  ↺ │    Belt to sensor  ⌕ ◫ ⚙ │
│ ● Simulation · Running                        scan 10 ms · 1 force        │
├────┬──────────┬──────────────────┬──────────────────────┬─────────────────┤
│ Pr │ PLANT    │ Main.ld          │ Plant        3D ▾    │ GUIDE           │
│ Se │ Signals  │                  │                      │ Stage 4 of 6    │
│ Te │ Parts    │   the program    │  3D view, or the     │ Run             │
│ Pl │          │                  │  schematic           │ …               │
│ Le │          ├──────────────────┴──────────────────────┤                 │
│    │          │ Problems │ Output │ Test results │ Watch │ [ Check ]       │
└────┴──────────┴─────────────────────────────────────────┴─────────────────┘
```

### 5.2 The main path
| The user wants to | 2.0 | 2.1 |
|---|---|---|
| See a change run in simulation | Save, Build, Connect, Run | Run |
| Check a lesson | Save, find Check at the end of the lesson panel | Check, always visible in the Guide |
| Run the tests | Open the Tests tab, Run host scenarios | Run all in the Tests activity, or its shortcut |
| Open anything | Know which region and tab it is in | Type its name in the palette |
| Deploy to a board | Build, Connect, Deploy (confirm), Run | The same four, on purpose (P7) |

### 5.3 Where each 2.0 surface goes
Only the surfaces that move are listed. Section 7 lists all of them.

| Surface | In 2.0 | In 2.1 | Requirement |
|---|---|---|---|
| Tests: choose, run, cancel | Tab of the results panel | Tests activity | TST-001, TST-002 |
| Test results | Same tab | "Test results" tab | TST-003, TST-004 |
| Interlock coverage | Tab of the results panel | A view of the Tests activity | TST-006 |
| Live plant | Lab tab of the results panel | Plant document | PLS-001, PLS-002 |
| Recorded replay | Lab tab | Plant document, opened from a test result | TST-007 |
| Changes review | Tab of the results panel | A review document in the editor area | SHL-004 |
| Agent | Tab of the results panel, with the provider's settings | Assistant view of the secondary sidebar; provider settings in Preferences | SHL-004, SHL-008 |
| Lesson | Primary sidebar, or secondary when the rail leaves Learn | Guide view of the secondary sidebar | GDE-001 |
| Course list | A group of 68 toggle buttons inside the lesson | Learn activity | GDE-002 |
| Motor input buttons | Trace tab | The faceplate | PLS-007 |
| I/O faceplate | Watch tab and Lab tab | Watch tab | PLS-007 |
| Application preferences | Inside the project settings page | A document of their own | SHL-011 |
| Theme menu | Command bar, Preferences, Welcome | Preferences, View menu, palette | SHL-012 |
| "To ST" button, Live toggle | Command bar | Build menu; Debug menu and status rail | FLW-009, FLW-010 |
| Simulation and Hardware toggle | Command bar | Target selector | FLW-007 |
| Close project | A cross in the Explorer header | File menu and palette | SHL-013 |

## 6. Workstreams
| Prefix | Workstream | Outcome | Depends on |
|---|---|---|---|
| SHL | Shell and surfaces | Each surface has one home; fewer are visible at once; all are reachable | D-20, D-22 |
| FLW | Main flow | One action to run in simulation; one save model; a status line that fits | D-21 |
| TST | Tests | A list of tests that run, a verdict in plain words, the record on demand | SHL |
| FND | Find and navigate | One palette finds anything; search and references cross the five languages | SHL-002 |
| MSG | Words and feedback | One word per concept; a failure says what to do | D-23 |
| GDE | Learn in the shell and first use | The lesson has a fixed place; Check is one visible action | SHL, FLW |
| PLS | Plant in the shell | The views of spec 012 have a home before they are built | D-20, D-25, D-26, spec 012 |

### SHL: Shell and surfaces
#### Intent
Anyone can say where a thing is from the six rules of section 5.1. Fewer things are on screen at once, and nothing is gone.

#### Current friction
- **The results panel has ten tabs**, and at 1440 pixels wide nine of them are icons without a name (`IDE/src/components/Console.tsx:272-307`; `IDE/src/components/ConsoleTabStrip.tsx:2-5`; `docs/static/img/tutorials/blink-3-built.png`). Two of the ten belong to an optional feature (Changes `:1077`, Agent `:1174`), and the Agent tab also holds the provider's settings form.
- **The Tests activity is a signpost.** Its sidebar holds two sentences and a button that opens the Tests tab (`IDE/src/shell/TestsView.tsx:10-30`; `IDE/src/shell/WorkbenchShell.tsx:108-111`).
- **The lesson changes sides.** It fills the primary sidebar on the Learn rail and moves to the secondary sidebar on any other, where a toggle swaps it with the Inspector (`IDE/src/shell/shellRouting.ts:21-22`; `IDE/src/shell/Sidebars.tsx:71`, `:89`).
- **The Inspector repeats what is already visible:** the name and path of the active file, the project and target, and counts the status rail and the tabs show (`IDE/src/components/WorkbenchInspector.tsx:44-77`).
- **Settings mix two owners.** The page behind the gear holds the application's preferences and the project's metadata (`IDE/src/components/settings/ProjectSettings.tsx:85`, `:113`).
- **The default navigator cannot create anything.** An empty group says "Nothing here yet" with no action (`IDE/src/navigator/ObjectNavigator.tsx:44-45`); new files exist only in the file view (`IDE/src/components/Sidebar.tsx:561`), where a cross that closes the project sits beside Refresh (`:576`).
- **A newly opened project shows "No file open"** (`IDE/src/components/EditorArea.tsx:481-488`; `docs/static/img/screens/first-board-hardware.png`).
- **One document at a time.** The editor area selects a single view (`EditorArea.tsx:114`), so a program and a plant, or a program and its I/O mapping, cannot be seen together.

#### Scope
- **In:** what each region holds, the results panel, the activities, the split, the secondary sidebar, the Inspector, settings, creation from the navigator, the rules by which the shell moves, layout state.
- **Kept:** the regions and separators of UX-011 and UX-017, the kit, session restore (IDE-008), the compact shell (UX-023).
- **Out:** the content of Tests (TST), Learn (GDE) and the plant (PLS).

#### Requirements
- **SHL-001** Every surface MUST belong to exactly one region of section 5.1, and `IDE/DESIGN.md` MUST record the map (P18, UX-032).
- **SHL-002** Surfaces MUST be declared once in a registry: id, title key, region, the command that shows it, and when it is offered. The activity rail, the tabs of the results panel, the views of the secondary sidebar, the View menu, the palette's entries for surfaces and the inventory check of section 8.2 MUST be generated from it or compared with it in CI (P10).
- **SHL-003** The results panel MUST show Problems, Output, Test results, Watch and Trace by default, and Terminal while the target is a board or after the user opens it. Every tab MUST show its name, not only an icon, at 1366 by 768 pixels in English and Spanish at both densities.
- **SHL-004** Each surface that leaves the results panel (section 5.3) MUST stay reachable by a command, the palette and the View menu, and a session or layout saved by 2.0 that names its old tab MUST open it in its new place. A proposed change MUST open as a review document in the editor area, and the list of pending changes MUST be reachable whether or not an AI provider is configured (IDE-030).
- **SHL-005** The activity rail MUST offer Project, Search, Tests, Plant and Learn. The sidebar of an activity MUST hold working content, a list or a tree whose items open or run. An activity whose sidebar only points elsewhere MUST NOT exist.
- **SHL-006** The editor area MUST be able to show two documents side by side. Any document can be moved to the other side by pointer and by keyboard, the split and its sizes are restored with the session (IDE-008), and below the compact width the two sides become tabs of one (UX-023).
- **SHL-007** Any document MUST be maximisable: one command hides the sidebars and the results panel, and the same command or Escape brings them back as they were.
- **SHL-008** The secondary sidebar MUST show one of its views at a time, Inspector, Guide or Assistant, with a visible switch between those that are available. A view MUST NOT move to the other sidebar. In the compact shell, where the secondary sidebar has no room, its current view MUST be offered in place of the primary sidebar.
- **SHL-009** The Inspector MUST show the properties of the current selection: the active document, the selected element of a visual editor, the selected test, the selected plant part, the connected board. It MUST NOT repeat the status rail. A property it edits MUST go through the undo history of the document that owns it.
- **SHL-010** The shell MUST change the active tab, open a region or move the keyboard focus only as the table below says, or when a person asks.

  | Event | The shell does |
  |---|---|
  | A build fails | Shows Problems (IDE-020) |
  | A build succeeds, a run starts, tests pass | Nothing moves; one notice |
  | The program stops at a breakpoint or after a step | Opens the document at that place |
  | The runtime reports a fault | The status rail shows it; a notice links to the place and to Output |
  | A test fails | Shows Test results |
  | A lesson check finishes | Shows the result in the Guide, and opens the Guide if it is hidden |
  | A message is written to a tab that is not visible | Marks the tab (IDE-020); does not switch to it |
  | A force becomes active or unconfirmed | The banner and the alert of IDE-029 |
  | The plant view cannot draw | A message in the plant document (PLS-009) |
  | A proposed change arrives | One notice with a Review action |

- **SHL-011** Preferences (per user) and Project settings (per project) MUST be two documents. Preferences MUST open with no project open. Neither may contain the other's fields.
- **SHL-012** Theme, density and language MUST each have one control, in Preferences, plus their commands. The command bar MUST NOT hold them.
- **SHL-013** In the object view of the navigator, each group MUST offer "New" for its kind (program, function block, function, data type, global variables, task). It creates the object in the chosen language with a skeleton that builds, and opens it. An empty group MUST show that action (UX-021). Rename, move, duplicate and delete (IDE-004) MUST work from both views. Close project MUST be a command of the File menu, not a control beside Refresh.
- **SHL-014** Opening a project that has no saved session MUST open the first program of its first task.
- **SHL-015** A "Reset layout" command MUST restore the default regions, sizes and tabs. The saved shell state MUST carry a version, and a state of another version MUST fall back to the defaults field by field, as it does today (`IDE/src/store/useShellLayout.ts:36-53`).
- **SHL-016** At 1366 by 768 pixels with the primary sidebar open, the editor area split and the results panel showing, no control of the main path may be clipped (UX-023).

#### Verification
- A unit test builds the rail, the tab strip and the View menu from the registry and fails on a surface with no command (SHL-002, SHL-004).
- A journey opens every surface of section 7 by its command and by the palette, on a session file written by 2.0 (SHL-004).
- A journey measures the tab strip at 1366 by 768 in both languages and densities (SHL-003).
- Pure tests cover the table of SHL-010; a journey proves that a successful build moves nothing.
- A keyboard-only journey splits the editor, moves a document across and maximises it (SHL-006, SHL-007, UX-025).

#### Risks and dependencies
- Journeys and render tests name the tabs that move. Those that freeze the old layout are rewritten with it (VF-006).
- Two code editors side by side must stay inside the editor-latency budget of PLT-015. It is measured with the split open.
- Depends on decisions D-20 and D-22.

### FLW: Main flow
#### Intent
A user sees a change run in simulation with one action, saves in one way, and reads the state of the program in one line.

#### Current friction
- **Four ordered steps.** Build refuses while a file is unsaved and sends the user to the Tests tab with a message about a "saved workspace" (`IDE/src/components/workspaceTestPresentation.ts:173`; `IDE/src/components/Toolbar.tsx:276-284`; `IDE/src/i18n/catalog/toolbarMsg.ts:17`). Run refuses without a connection or a build (`Toolbar.tsx:591-606`). The refusals are lines in the Output tab: "Connect first.", "No compiled bytecode. Compile first." (`toolbarMsg.ts:59-61`).
- **Save covers one file.** It saves the active file only (`Toolbar.tsx:192-198`), the registry has no "Save all" (`IDE/src/commands/registry.ts:62-65`), autosave is off by default (`IDE/src/utils/appSettings.ts:48`), and the project configuration has a save button of its own (`IDE/src/navigator/ConfigEditorHost.tsx:49`; `IDE/src/components/settings/ProjectSettings.tsx:81`).
- **The simulator is "connected" to.** Simulation uses the Connect button and the word "Disconnected", which belong to hardware (`Toolbar.tsx:478-508`; `docs/static/img/tutorials/blink-3-built.png`).
- **The mode is shown three times** (`IDE/src/components/ToolbarRunControls.tsx:87`, `:106`; `IDE/src/components/OperationalStatusBar.tsx:119-124`).
- **The status rail shows nine facts** while a simulation runs, among them "Runtime Native POSIX", "Target Local POSIX" and "Debug Attached, not paused" (`OperationalStatusBar.tsx:119-148`; `IDE/src/i18n/en.ts:344`; `IDE/src/i18n/catalog/statusText.ts:6-11`).
- **The command bar holds thirteen controls** while a simulation runs, including a purple "To ST" button, a "Live" toggle and a theme menu (`Toolbar.tsx:905`, `:957`; `ToolbarRunControls.tsx:185`; `docs/static/img/tutorials/blink-running.png`).
- **Notices cover results.** Two notices stack over the right third of the Output text (`blink-running.png`).

#### Scope
- **In:** run in simulation, save, the target, the command bar, the status rail, notices of composite actions.
- **Kept:** every physical gate: the deploy dialog (UX-019), the confirmations (UX-020), the hardware indicator (UX-018), the force banner and stale-build detection (IDE-029), deploy admission.
- **Out:** the wording of states (MSG-007); the plant's part in a run (PLS-003).

#### Requirements
- **FLW-001** With a simulation target, Run MUST do, in order, whatever is missing: save modified documents (FLW-006), build if the last build is not of the current sources, start the simulator, load the program, run. One notice names the step in progress and offers Cancel (IDE-021). A failure MUST stop the sequence at that step with a located message (P1), and no later step may run.
- **FLW-002** With a simulation target and no program running, Step MUST prepare the session as Run does and stop before the first scan.
- **FLW-003** With a board as target, Run MUST NOT connect, deploy or start anything by implication. Connect, Deploy and Run stay separate actions of a person, with the confirmations of UX-019 and UX-020 (P7, P9, constitution rule 5).
- **FLW-004** An action refused because an earlier step is missing MUST say which step and offer it as a button in the notice. A refusal MUST NOT be delivered only as a line of Output, and MUST NOT send the user to another surface to find the cause.
- **FLW-005** A program file, the project configuration, a scene and a plant map MUST share one modified mark and one save path: Save saves the active document, "Save all" saves every modified one, and both are commands. A configuration editor MAY show a Save button, which runs the same command.
- **FLW-006** A preference "Save before build and run" MUST exist with the values "Always" (default) and "Ask". Build, Run in simulation, Run tests and Check MUST follow it. They MUST NOT fail because a document is unsaved.
- **FLW-007** One target selector in the command bar MUST show and choose where Run goes: Simulation, or the board of the project. It replaces the Simulation and Hardware toggle. Changing the target while a program runs MUST ask first (UX-020). Connect and Disconnect MUST be shown only for a board.
- **FLW-008** In simulation the session MUST be the product's concern: Studio starts it when Run or Step needs it and ends it when the project closes or the target changes. "Restart the simulator" MUST exist as a command. The interface MUST NOT say "connect" or "disconnected" about a simulation.
- **FLW-009** Left of the project name the command bar MUST hold at most seven controls with a simulation target and nine with a board, in any state, and at most three on the right (design default). Generate ST, Download program, View assembly, Export and the theme MUST be in menus and the palette, not in the bar.
- **FLW-010** Live values MUST be on by default in simulation and off by default on a board, with their toggle in the Debug menu, the palette and the details of the status rail.
- **FLW-011** The status rail MUST fit one line at 1366 pixels and show, in this order: the target and connection indicator (UX-018), the program state (MSG-007), the scan interval, and the count of active forces. Overruns appear in the line only when they are not zero. One control, operable by keyboard, MUST show the rest: runtime, cycles, tasks, firmware and protocol. The "degraded" label of the WASM runtime (IDE-025) and the force banner (IDE-029) MUST stay visible without that control.
- **FLW-012** When the sources changed after the build that is running, the status rail MUST say so and offer one action: in simulation "Rebuild and restart", on a board "Build", after which Deploy stays a separate action.
- **FLW-013** A notice MUST NOT cover text of the results panel or of a dialog. The steps of one composite action MUST be one notice. At most one success notice is visible at a time and it leaves by itself; a failure stays until dismissed and links to its detail (IDE-021).
- **FLW-014** The decision of which steps Run takes MUST be a pure function of the state (target, modified documents, build, session, program, whether a plant is bound), tested without the interface, and the menu, the palette, the shortcut and the button MUST all use it.

#### Verification
- Unit tests cover the plan of FLW-014 for every combination of state, including each failure.
- Journey: edit a program, press Run once, watch a value change; and the same with a build error, which ends in Problems with the simulator not started (FLW-001).
- Journey on the board path with a device double: Run with nothing connected changes nothing on the device and offers Connect (FLW-003, FLW-004).
- The interface-budget check of section 8.2 counts the command bar and the status rail in each state (FLW-009, FLW-011).
- The restricted AI and MCP regression of 2.0 passes unchanged: no new command is reachable from them.

#### Risks and dependencies
- Saving before a build writes to disk without an explicit Save. The preference names it, and the first time it happens a notice says so and links to the preference.
- `Toolbar.tsx` is 996 lines and owns these handlers. FLW-014 moves the decision out before the bar changes.
- Depends on decision D-21.

### TST: Tests
#### Intent
A user sees the tests of the project, runs one or all, and reads the verdict in a sentence. The record that proves it is one click away.

#### Current friction
- **A leftover chooser.** The Tests tab opens with "Choose zplc.json again" beside "Run host scenarios" (`IDE/src/components/Console.tsx:968-972`; `IDE/src/i18n/catalog/console.ts:17-25`), although the project is linked without it (journey "5b Tests need no zplc.json to be chosen", `IDE/scripts/journeys.ts:1436`).
- **The record comes before the answer.** A passed run shows "Host POSIX scenarios passed.", an artifact table with SHA-256 values, "Canonical saved build linked · native POSIX run · .zplc match · trace recorded." and a "Host evidence only" badge (`docs/static/img/screens/guide-scenario-tests.png`).
- **No list of tests.** The scenarios of the project are not shown until a run reports them.
- **Related checks are other tabs.** Interlock coverage (`Console.tsx:1066`) and the replay of a recorded run (`IDE/src/components/LabPanel.tsx:248`) are separate tabs.

#### Scope
- **In:** the Tests activity, the Test results tab, interlock coverage, replay, the commands.
- **Kept:** the scenario format, the test engine, the nine expectation kinds, the evidence record and its hashes, the same result from Studio, the command-line tool and MCP (IDE-031).
- **Out:** the lesson check's place (GDE-004), though it uses the same result component.

#### Requirements
- **TST-001** The Tests activity MUST list the scenarios of the open project, grouped by file, each with its last result (not run, passed, failed, older than the sources), and a Run action per scenario, per file and for all. It MUST be operable by keyboard.
- **TST-002** The Tests surface MUST NOT offer a chooser for the project manifest. Tests run against the open project (IDE-001, IDE-002) and follow FLW-006.
- **TST-003** The Test results tab MUST open with the verdict in one sentence ("3 of 4 tests passed"), then the failed tests, each with the expectation that failed, its time, the expected and the observed value, and links to the scenario step and to that time in Trace (as LRN-026 asks of a lesson). Passed tests follow, collapsed.
- **TST-004** The evidence record (artifacts, hashes, the link to the build, the saved inputs, the recorded trace) MUST be kept and shown in a "Details" disclosure that is closed by default. The boundary of the result MUST be stated once, as a badge (MSG-003).
- **TST-005** When the sources change after a run, its results MUST stay, marked as older than the sources, with one action to run again.
- **TST-006** Interlock coverage MUST be a view of its own in the Tests activity (IDE-032), run from there, with its results under their own heading in the Test results tab.
- **TST-007** A result that recorded a plant trace MUST offer "Replay", which opens the plant document in a replay state with a timeline, labelled as a replay (LRN-020).
- **TST-008** The lesson check and the project's tests MUST use one result component and the same words.
- **TST-009** A "New test" action SHOULD create a scenario file with a valid skeleton for the first program and open it.
- **TST-010** "Run all tests", "Run failed tests" and "Run the test at the cursor" MUST be commands.

#### Verification
- Journey: open a project with three scenarios, run one from the list, break the program, run all, follow the failed expectation to its place in Trace (TST-001, TST-003).
- A render test proves that the Details disclosure holds every field of the 2.0 evidence view (TST-004).
- The cross-surface test of IDE-031 passes unchanged.

#### Risks and dependencies
- The words "host", "POSIX" and "canonical" leave the main view; the record keeps them. Depends on decision D-23.

### FND: Find and navigate
#### Intent
A user who knows the name of a thing gets to it by typing the name, whatever the thing is and whatever language it is written in.

#### Current friction
- **The palette finds commands only**, and there are 38 of them (`IDE/src/commands/CommandPalette.tsx:30`; `IDE/src/commands/registry.ts:61-151`). Lab, Changes, Agent, Terminal and Interlocks have no command, and neither do the five configuration editors (`:86-90`, `:96`).
- **Search reads two languages of five.** Ladder, FBD and SFC documents are not searched (`IDE/src/shell/projectSearch.ts:1-4`, `:33`), so a variable used in a rung is not found.
- **No way from a name to its uses** across languages, the I/O mapping and the watch table.

#### Scope
- **In:** the palette, commands for every surface and action, project search, definitions and references, navigation history.
- **Kept:** the registry, its shortcuts and the shortcut reference (UX-015); the Structured Text language service.
- **Out:** refactoring (rename across files).

#### Requirements
- **FND-001** One palette MUST find, in ranked groups: commands, files, PLC objects (programs, function blocks, functions, data types, global variables, tasks), I/O points, configuration editors, lessons, preferences by name and, in 2.1, scenes and parts. Choosing an entry opens it at its place.
- **FND-002** Every surface of the registry (SHL-002) and every action offered by the command bar, a menu or a context menu MUST be a registered command. CI MUST fail on a control of those places that runs a handler without one. Physical commands keep their gates and stay out of reach of AI and MCP (constitution rule 9).
- **FND-003** Project search MUST cover the five languages: the text of Structured Text and Instruction List files, and the names, variables, comments and expressions of Ladder, FBD and SFC documents. A match in a diagram MUST open it with the element selected, as Problems do today.
- **FND-004** "Go to definition" and "Find all references" MUST work for a variable, a function block instance and an I/O address from every editor, and MUST list uses in all five languages and in the I/O mapping.
- **FND-005** References SHOULD include the plant map, the watch table and the scenarios.
- **FND-006** Back and Forward SHOULD move through the places visited, across documents.
- **FND-007** The editor area SHOULD show the place of the active document as PLC objects (project, group, object), each step of which opens the navigator there.

#### Verification
- A unit test compares the registry with the controls of the command bar and the menus (FND-002).
- Journey: with the keyboard only, open the I/O mapping, a function block, a lesson and a preference from the palette (FND-001).
- Journey: search a variable used in a rung, a block and a transition, and open each match (FND-003); list its references (FND-004).

#### Risks and dependencies
- FND-004 is the largest item of this workstream. It builds on the declaration index (`IDE/src/store/projectSources.ts`) and the debug map; its design is the first task of the plan for U2.

### MSG: Words and feedback
#### Intent
The interface speaks about the user's things in one word each. A message that reports a failure says what to do.

#### Current friction
- **Implementation words on the main path.** "Building saved workspace locally..." (`IDE/src/i18n/catalog/toolbarMsg.ts:20`); "The starter fails this host scenario until the stated omission is corrected." (`IDE/src/i18n/catalog/learn.ts:7`); "Run the saved host scenarios to inspect a recorded plant trace here." (`IDE/src/i18n/catalog/lab.ts:10`); "Runtime Native POSIX" (`IDE/src/i18n/catalog/statusText.ts:6`).
- **Several words for one thing.** A test is a scenario, a host scenario and a workspace test. The simulation is the simulator, the native runtime, the host and Local POSIX. The board is hardware, a device, a controller and a target.
- **The boundary is repeated.** A beginner's lesson result reads "Tests provide native POSIX host evidence on your computer only; they are not evidence of a physical lamp, hardware timing, HIL, or certification." (`docs/static/img/learn/lesson-checked-en.png`), beside two more statements of the same boundary on the test result (section 2.3, row 12).
- **The guard is narrow.** The check for internal terms knows five (`tools/ci/i18n-guard.ts:518`).

#### Scope
- **In:** the vocabulary, the terms kept off the main path, the boundary badge, failure messages, the two levels of Output, state words.
- **Kept:** externalised strings in two languages (UX-029), the register of D-10 (UX-030), sentence case (UX-031), the truth of every claim (P6).
- **Out:** the documentation site, except that it follows the same vocabulary (section 8.2).

#### Requirements
- **MSG-001** The vocabulary below MUST be the single wording of these concepts in the interface, in English and Spanish, defined once and used by every surface (P10). The Spanish column follows the words the 2.0 catalogue already uses where it has one (design default).

  | Concept | English | Spanish | Replaces |
  |---|---|---|---|
  | What you open and save | Project | Proyecto | workspace, saved workspace |
  | Running on this computer | Simulation | Simulación | simulator session, native runtime, host, Local POSIX |
  | The physical controller | Board | Placa | hardware, device, controller |
  | Where Run goes | Target | Destino | mode |
  | Sources into a program | Build | Compilar | compile, canonical build |
  | A program onto a board | Deploy | Desplegar | upload, load |
  | A scripted check you run | Test | Prueba | scenario, host scenario, workspace test (the file format keeps the name "scenario") |
  | Grading a lesson | Check | Comprobar | scenario verified, lesson evidence |
  | The simulated machine | Plant | Planta | lab |
  | What a result is worth | Simulation result, Board result | Resultado en simulación, Resultado en placa | host evidence only; not hardware or HIL evidence |

- **MSG-002** The command bar, the status rail, notices, the verdict of a test or check, the Guide and the normal level of Output MUST NOT use implementation terms: POSIX, native, host, canonical, workspace, link, adapter, artifact, bytecode, SHA-256, VM. Those terms stay allowed in a Details disclosure, the Inspector, the detailed level of Output, the Terminal and the documentation. The i18n guard MUST enforce this per surface.
- **MSG-003** A surface that shows a result MUST state its boundary once, as a badge of the vocabulary with its explanation in a tooltip (UX-031, P6). A check MUST fail when a surface states it twice.
- **MSG-004** A message that reports a failure MUST say what failed, where (a file and line, an element, a setting), and what to do next, and MUST offer that action when there is one (P1). The runtime's own code and text MUST be available in Details.
- **MSG-005** Output MUST have two levels: normal, one line per step a user asked for ("Build finished: 302 bytes, 1 task"), and detailed, everything 2.0 writes. Normal is the default, and the choice is remembered.
- **MSG-006** Outside a Details disclosure and the deploy dialog (UX-019), a hash MUST be shown shortened with a copy action, a size with its unit and a time in the user's locale.
- **MSG-007** The state of the program MUST be worded from the table below, and every state 2.0 words differently MUST stay distinguishable (IDE-029). There is one exception, which FLW-001 empties of meaning: in simulation 2.0 tells "Ready" from "Ready · rebuild required"; Run now rebuilds by itself, so both read "Stopped", and the Build control carries a mark while the last build is not of the current sources.

  | State | Shown as |
  |---|---|
  | Simulation, nothing running | Stopped |
  | Board, not connected | Not connected |
  | Board connected, nothing built | Connected · build needed |
  | Board connected, sources changed since the last build | Connected · rebuild needed |
  | Board connected, the current build not deployed | Connected · deploy needed |
  | The current build on the board, stopped | Deployed · stopped |
  | Running the current build | Running |
  | Running, sources changed since | Running an older build |
  | Paused | Paused at its place (file and line, rung, step) |
  | Paused, sources changed since | Paused on an older build |
  | Fault | Fault, with its reason |
  | Simulated time slower than real time (PLS-013) | Running slower than real time |

#### Verification
- The i18n guard gains the per-surface term list and the vocabulary; its own tests cover both languages (MSG-001, MSG-002).
- A journey counts the boundary statements on the Test results tab, the Guide and the plant document (MSG-003).
- A pure test maps every state of `IDE/src/components/Toolbar.tsx:805-835` to a row of MSG-007 and fails on two states with the same words, apart from the exception the requirement names.

#### Risks and dependencies
- Shorter words must not claim more than the evidence (P6). "Simulation result" says less than "host evidence only", not more; the tooltip carries the full sentence.
- About 2,370 messages exist in two languages. The work goes surface by surface in the order of section 9.
- Depends on decision D-23.

### GDE: Learn in the shell and first use
#### Intent
A learner always finds the lesson in the same place, sees one stage at a time, and checks the work with a button that is always visible.

#### Current friction
- **The course list is inside the lesson.** All 68 lessons are one group of toggle buttons in a 280-pixel sidebar, each with its state as text, "(Locked)" (`IDE/src/components/LearnPanel.tsx:190-205`; `IDE/src/shell/WorkbenchShell.tsx:126`; `docs/static/img/screens/learn-lab-en.png`).
- **Check is the last thing on a long page.** After the list come file paths (`LearnPanel.tsx:207`), "The starter fails this host scenario until the stated omission is corrected." (`:209`), the result, every stage, the hints and the board section. Check is below them (`:377`), and the primary button beside it opens the Tests tab (`:393`).
- **A second language switch** sits in the lesson (`:181`) beside the application's own setting.
- **A reading page does not take the screen.** It covers the editor region only (`WorkbenchShell.tsx:165-167`; `IDE/src/components/LearnReadingView.tsx:83`), so a lab that says "The simulation is running." sits under a status rail that says "Not connected" and a command bar with Build, Simulate, Hardware and Connect (`learn-lab-en.png`).

#### Scope
- **In:** the Guide, the Learn activity, Check, the reading page's frame, the lesson layout, first use.
- **Kept:** every lesson, stage, hint, solution, grade record and reading page; the Learn home and its paths; the board track; the rules that Learn starts no physical operation (LRN-015) and that only the reference scenario grades (LRN-022).
- **Out:** lesson content and the course of spec 012 (CRS).

#### Requirements
- **GDE-001** While a lesson project is open, the lesson MUST be the Guide view of the secondary sidebar, whatever the activity (LRN-004).
- **GDE-002** The Learn activity MUST show the course as an outline: paths and modules that open and close, each lesson with its state as an icon with a text equivalent, the current lesson marked, and a filter. A locked lesson MUST say what unlocks it on hover and on focus. The Guide MUST NOT contain the list of lessons.
- **GDE-003** The Guide MUST show, top to bottom: the title and the position in the path ("Lesson 4 of 21"), the stages of LRN-010 one at a time with Back and Next and a list to jump, the hints, and an action bar fixed at its bottom edge with Check as the primary action, then Reset, Read again and Solution. Check MUST be visible without scrolling at 1366 by 768 pixels.
- **GDE-004** Check MUST be one action: it follows FLW-006, builds, runs the reference scenario of the lesson (LRN-022) and shows the verdict in the Guide with the failed expectation (LRN-026). It MUST NOT need the Tests surface.
- **GDE-005** The Guide MUST follow MSG-002: file paths, scenario ids and the record of the check are in a "Files and record of this lesson" disclosure. The Guide MUST NOT hold a language control of its own (LRN-029).
- **GDE-006** A reading page MUST cover the whole workbench (LRN-039) under a header with Back to course, the title, the position in the path and Practice. While it is shown, the command bar's run controls, the status rail and the results panel MUST NOT be visible, so that the lab's own controls (LRN-041) are the only run controls on screen.
- **GDE-007** Practice MUST open the lesson layout: the lesson's first file, the plant beside it when the lesson names one, and the Guide. A "Lesson layout" command MUST restore it.
- **GDE-008** After a pass the Guide MUST offer the next lesson of the path (LRN-002).
- **GDE-009** The board track of a lesson MUST be a section of the Guide that is closed until the learner opens it, with the connection indicator of UX-018. Every physical action stays the learner's (LRN-015).
- **GDE-010** From the Welcome screen a first-time user MUST reach a running simulated blink in at most three actions: open the example, Run, and at most one answer to a question Studio asks (it serves LRN-012).
- **GDE-011** The Learn home SHOULD put Continue first and SHOULD NOT pin the hardware track over the list of lessons.
- **GDE-012** The first time each region is shown, an empty state SHOULD name the one action most users take next there (UX-021).
- **GDE-013** Before U3 closes, at least three people who have not used Studio SHOULD each do the first lesson and the first blink while being observed; the time to the first blink and each place they stopped are recorded as manual evidence.

#### Verification
- Journey 11 ("Learn with no project open") and the lesson journeys are extended: start a lesson, read, Practice, change the program, Check from the Guide without touching the results panel, pass, Next (GDE-001 to GDE-008).
- A journey proves that no run control of the command bar is visible on a reading page and that the lab's are (GDE-006).
- The journey of GDE-010 counts the actions.
- The lesson and curriculum suites of 2.0 pass unchanged: no lesson package changes.

#### Risks and dependencies
- The Guide is narrower than a document. Stages shown one at a time keep it short; the reading page carries long explanations.
- Depends on SHL-008, FLW-006 and TST-008.

### PLS: Plant in the shell
#### Intent
The views of spec 012 are built once, in their final place, and use the controls and the words of the rest of Studio.

#### Current friction
- **The plant is a tab of the results panel.** The live plant and the replay share the Lab tab (`IDE/src/components/Console.tsx:1520`; `IDE/src/components/LabPanel.tsx:221`), in a panel that opens at 28% of the height (`IDE/src/shell/WorkbenchShell.tsx:174`). VIS-001 puts the 3D view "where 2.0 shows the live plant".
- **The plant has run controls of its own**, play, pause, step and reset, beside those of the command bar (`IDE/src/plants/PlantLivePanel.tsx:169-211`). Under P15 and PLT-005 the program and the plant share one clock, so two sets of controls for it can only disagree.
- **Revision 1 of the M1 plan repeated both.** It mounted the 3D panel in the Lab tab, kept the 2.0 panel beside it for the four 2.0 plants, and let the new panel "own its transport". While a scene ran, the global Run was refused with "Use the plant panel's Run" (`plan-m1.md:52`, `:863`, `:1168`). The plan itself flagged this as "a behaviour change for any user who expected the global Run to drive a plant" (`:1178`). M1 began on that revision on 2026-11-12; its Tasks V4 and E3 had not started when the owner took decisions D-20 and D-26.
- **Inputs are set in four places** (section 2.3, row 5). One of them serves a single example: the buttons of the Trace tab appear only for a program named Motor with Start, Stop and EStop (`IDE/src/runtime/nativeTrace.ts:182-186`). Spec 012 adds a fifth, the operator panel of a scene (VIS-010).
- **Spec 012 does not place its new surfaces.** The scene editor, the parts catalogue, the signal list, the plant-map editor, the quality setting and the plant I/O indicator have requirements and no region.

#### Scope
- **In:** the region, the controls and the words of every plant surface of spec 012 and of the four 2.0 plants.
- **Kept:** every requirement of spec 012 about behaviour; the four 2.0 plants, their maps and grades (PLT-013).
- **Out:** the plant core, rendering, the catalogue, the scenes, the link and the course.

#### Requirements
- **PLS-001** A plant MUST be a document of the editor area. It opens from the navigator, the Plant activity, a lesson and a test result. It shows the 3D view (VIS-001) or the schematic (VIS-006, VIS-007) with a switch between them, and the plant facts as text (VIS-008). It can sit beside a program (SHL-006), be maximised (SHL-007) and, where spec 012 builds it, move to a window of its own.
- **PLS-002** The four plants of 2.0 MUST open in the same kind of document, with their hand-drawn schematics. When the live plant and the replay have moved (TST-007), the Lab tab is retired and every place the interface or the docs said "Lab" says "Plant" (decision D-25).
- **PLS-003** A plant document MUST NOT have run controls. Run, Pause, Step, Stop and Reset of the command bar act on the program and the plant together (P15, PLT-005), and they are the play, pause and step of LRN-018. The command bar MUST drive one transport interface (run, pause, resume, step, stop, reset and a state) with two implementations: the debug controller for a program alone, and the lock-step plant session of spec 012 while a plant is bound. A press of Run MUST never be answered by a pointer to another control (decision D-26).
- **PLS-004** The toolbar of a plant document MUST hold only what belongs to a plant: the view switch, the camera presets (VIS-002), "Reset plant" (PLT-012), the fault actions (PLT-011), adding and removing an item (VIS-010), and "Edit scene", which is offered only while the plant is stopped (SCN-008).
- **PLS-005** While a scene is edited (SCN-008 to SCN-016): the parts catalogue is the sidebar of the Plant activity, from which a part is added by pointer and by keyboard (SCN-014); the properties of the selected part are in the Inspector (SCN-009, SHL-009); problems of the scene are in Problems and select the part (SCN-015); undo and redo are the commands of the Edit menu (SCN-010); the scene is saved by Save and "Save all" (FLW-005, SCN-006).
- **PLS-006** The Plant activity MUST list the signals of the scene (SCN-011), each with its type, direction and binding (bound to a variable, unbound, type mismatch). The plant map MUST be a configuration editor in the Plant group of the navigator, beside the I/O mapping (UX-013). An unbound or mismatched signal MUST be a problem that opens its row (SCN-012). "Create the declarations" (SCN-013) is an action of that editor.
- **PLS-007** An input MUST have one owner at a time (P18). The faceplate (LRN-017) has one place, the Watch tab. An input the plant feeds is shown there read-only, marked "from the plant", and can still be forced (LNK-006, UX-009). Operator-panel parts are operated in the plant (VIS-010). The motor buttons of the Trace tab are retired once a journey proves that the faceplate sets the same inputs.
- **PLS-008** Plant I/O mode (LNK-007) MUST be started by an explicit action, "Feed the board from the plant", offered in the Online menu and in the plant document while a board is connected, and confirmed in an alert dialog (LNK-008, UX-020). The indicator of the status rail MUST then show a third state, different in text, icon and colour from Simulation and from Board, a mark while mirroring is on (decision D-16), and the measured latency in its details (LNK-014).
- **PLS-009** A failure of the view (no WebGL 2, a lost context, a low frame rate, VIS-006) and a failure of a scene (PLT-016) MUST be shown in the plant document, with the schematic offered, not only in Output.
- **PLS-010** A plant document that is not visible MUST NOT draw frames. The plant core keeps running (P14).
- **PLS-011** The object view of the navigator MUST show a Plant group, with the scene and the plant map, when the project has a plant, and an "Add a plant" action that offers the templates of SCN-016 when it has none.
- **PLS-012** Every surface of spec 012 MUST be in the registry of SHL-002. The quality setting (VIS-005) is a section of Preferences.
- **PLS-013** The state of a plant session MUST be shown by the one program state of the status rail (MSG-007), not by a second status in the plant document. When simulated time runs slower than real time (PLT-016), or a scan interval is refused because the plant cannot step it, the status rail and one notice MUST say so, with the action that resolves it.

#### Verification
- Journey: open a 2.0 plant lesson, see the program and the plant side by side, Run once, pause from the command bar and see the plant freeze, trigger a fault action in the plant (PLS-001 to PLS-004).
- Journey: a session saved by 2.0 with the Lab tab active opens the plant document (SHL-004, PLS-002).
- A render test proves that the plant document has no play, pause or step control (PLS-003).
- A unit test drives the transport interface with a fake debug controller and a fake plant session and gets the same states from both (PLS-003, PLS-013).
- The plant and lesson suites of 2.0 pass unchanged (PLT-013), which proves that a lesson without a scene still runs through the debug controller as before.

#### Risks and dependencies
- PLS-003 touches the debug controller every lesson uses, as `plan-m1.md` warns (`:1168`). The seam is the mitigation: a program without a plant keeps today's path untouched, and only the command bar learns that a second implementation exists.
- If Task V4 runs before the plant document and the transport exist, the 3D panel is built in the Lab tab with its own transport and moved later. Revision 2 of `plan-m1.md` orders the work so that it cannot: V4 depends on the two tasks that deliver them.
- Until U3, the part list, the form and the signal table of Task E3 live inside the plant document. PLS-005 and PLS-006 move them without changing them only if they are three components that do not know where they are mounted.
- A window of its own must be created by the main process with the same hardening as the first (constitution rule 6); it is spec 012's SHOULD and stays one.
- Depends on decisions D-20, D-25 and D-26.

## 7. Feature preservation inventory
Every surface of 2.0 and its place in 2.1. "Same" means the place and the behaviour do not change. Nothing in this table is removed. Where a control existed twice (the faceplate, the plant's run controls, the motor buttons, the theme menu), one copy stays; section 4.3 of spec 011 allows removing a duplicate that a living module replaced.

| Surface | In 2.0 | In 2.1 | Requirement |
|---|---|---|---|
| Welcome: open, new, Learn, recent, examples, import, preferences | Start screen | Same | GDE-010 |
| New project dialog | Dialog | Same | |
| Save | Command bar | Same, plus "Save all" | FLW-005 |
| Build menu: build, generate ST, download program, view assembly, export | Command bar | Same menu | FLW-009 |
| "To ST" button | Command bar | Build menu, palette | FLW-009 |
| Simulation and Hardware toggle | Command bar | Target selector | FLW-007 |
| Connect, Disconnect | Command bar | Command bar, for a board; the simulator session is implicit | FLW-007, FLW-008 |
| Deploy and its dialog | Command bar | Same | FLW-003 |
| Run, Pause, Resume, Step, Stop, Reset | Command bar | Same; Run prepares a simulation | FLW-001, FLW-002 |
| Live values | Command bar | Debug menu, status rail details | FLW-010 |
| Theme | Command bar, Preferences, Welcome | Preferences, View menu, palette | SHL-012 |
| Settings page | Editor tab | Preferences, and Project settings | SHL-011 |
| Command palette, shortcut reference | Overlay | Same; the palette finds more | FND-001 |
| Application menu | Eight menus | Same eight | FND-002 |
| Status rail, connection indicator, force banner | Under the command bar | Same place; one line and details | FLW-011, MSG-007 |
| Notices | Over the results panel | Clear of results; merged | FLW-013 |
| Project navigator: objects, files, declarations, library folder | Primary sidebar | Same, plus creation and a Plant group | SHL-013, PLS-011 |
| Search | Primary sidebar | Same; five languages | FND-003 |
| Tests activity | Primary sidebar, a link | The list of tests | TST-001 |
| Inspector and controller view | Secondary sidebar | Same; shows the selection | SHL-009 |
| Lesson | Primary or secondary sidebar | Guide | GDE-001, GDE-003 |
| Course list | Inside the lesson | Learn activity | GDE-002 |
| Learn home, paths, progress export and import | Over the editor | Same | GDE-011 |
| Reading pages and try-it labs | Over the editor region | Over the whole workbench | GDE-006 |
| Board track, board check, firmware image | Learn home and lesson | Same; a section of the Guide | GDE-009 |
| Structured Text, Instruction List, Ladder, FBD and SFC editors | Editor area | Same; two side by side | SHL-006 |
| Function-block instance monitor, generated code view | In their editors | Same | |
| Tasks, I/O mapping, Network, Communication, Target editors | Editor tabs | Same; one save path | FLW-005 |
| Firmware build, toolchain card | Target editor | Same | |
| Output | Results tab | Same; two levels | MSG-005 |
| Problems | Results tab | Same | SHL-003 |
| Tests: run and results | Results tab | Tests activity; Test results tab | TST-001 to TST-005 |
| Evidence record of a run | In the Tests tab | Details of the result | TST-004 |
| Interlock coverage | Results tab | A view of the Tests activity | TST-006 |
| Live plant | Lab tab | Plant document | PLS-001, PLS-002 |
| Recorded replay | Lab tab | Plant document, from a test result | TST-007 |
| Plant play, pause, step, reset | Lab tab | The command bar's controls; "Reset plant" in the document | PLS-003, PLS-004 |
| Plant fault actions | Lab tab | Plant document | PLS-004 |
| Changes review | Results tab | Review document | SHL-004 |
| Agent and provider settings | Results tab | Assistant view; Preferences | SHL-004, SHL-008 |
| Trace | Results tab | Same | SHL-003 |
| Motor input buttons | Trace tab | Retired into the faceplate | PLS-007 |
| Watch, force, release all | Results tab | Same | SHL-003 |
| I/O faceplate | Watch tab and Lab tab | Watch tab | PLS-007 |
| Terminal | Results tab | Same; shown with a board or on request | SHL-003 |
| Serial port dialog, unsaved-changes dialog, recovery offer, external-change prompt, migration preview, update notice | Dialogs | Same | |
| Light, dark, high-contrast, forced-colours and reduced-motion modes; two densities; two languages | Everywhere | Same, on every new surface | UX-027 |
| Command-line tool, MCP tools and resources | Outside Studio | Unchanged | |

Surfaces spec 012 adds, and their place: 3D view, schematic and plant facts (plant document, PLS-001); scene editor (plant document in edit state, PLS-005); parts catalogue and signal list (Plant activity, PLS-005, PLS-006); part properties (Inspector, PLS-005); plant map (configuration editor, PLS-006); plant I/O mode and mirroring (Online menu and status rail, PLS-008); quality setting (Preferences, PLS-012); the course modules (Learn activity and Learn home, GDE-002).

## 8. Measures and definition of done
### 8.1 Measures
Each row is checked on the running application by the journey suite or by the interface-budget check. The 2.0.0 column is section 2.3, measured again in U0.

| # | Measure | 2.0.0 | Target | Requirement |
|---|---|---|---|---|
| 1 | Actions from a modified program to a running simulation | 4 | 1 | FLW-001 |
| 2 | Tabs in the results panel by default | 10 | 5, and 6 with a board | SHL-003 |
| 3 | Results tabs shown with their name at 1366 by 768, both languages | 1 of 10 | All | SHL-003 |
| 4 | Sets of run controls that act on the project's simulation | 2, and 3 under revision 1 of the M1 plan | 1 | PLS-003 |
| 5 | Places to set one input of the running simulation | 4 | 1 | PLS-007 |
| 6 | Controls in the command bar while a simulation runs | 13 | At most 10 | FLW-009 |
| 7 | Items in the status rail while a simulation runs | 9 | At most 4, and details | FLW-011 |
| 8 | Times the target is shown | 3 | 2: the selector and the indicator | FLW-007 |
| 9 | Surfaces with a command | 5 of 10 results tabs; 0 of 5 configuration editors | All | SHL-002, FND-002 |
| 10 | Kinds of thing the palette finds | 1 | At least 7 | FND-001 |
| 11 | Languages covered by search | 2 of 5 | 5 of 5 | FND-003 |
| 12 | Statements of the boundary on one result | 3 | 1 | MSG-003 |
| 13 | Controls for the theme | 3 | 1 | SHL-012 |
| 14 | Save paths for one project | 2, no "Save all" | 1, with "Save all" | FLW-005 |
| 15 | Check visible without scrolling at 1366 by 768 | No | Yes | GDE-003 |
| 16 | Actions from Welcome to a running simulated blink | Not measured | At most 3 | GDE-010 |
| 17 | Implementation terms on the main-path surfaces | Present (section 2.3, row 16) | 0 | MSG-002 |

### 8.2 Definition of done
1. Every requirement of this spec has an executed check, tracked by the requirement coverage tool extended to this spec, or is recorded as conditional on a decision.
2. Every target of section 8.1 is met on the packaged application on Linux, macOS and Windows. An interface-budget check counts rows 2, 3, 6, 7 and 8 in each state, language and density, and CI fails when a count is over its budget.
3. A journey opens every surface of section 7 by its command, and the registry of SHL-002 has no surface without one.
4. Every 2.0 suite passes: lessons, plants, smoke, journeys, the content security policy test, the restricted AI and MCP regression. A test is changed only where it froze the old layout (VF-006), and the change is listed in the pull request.
5. The main path, with the split and a plant document, is completable by keyboard alone, and the contrast and labelling checks of UX-024 and UX-026 pass on every new surface.
6. `IDE/DESIGN.md` and `IDE/PRODUCT.md` describe the shipped interface (UX-032). The documentation pages and their screenshots are regenerated in English and Spanish and use the vocabulary of MSG-001 (constitution rule 8).
7. No dependency is added, or each one has its justification in `research.md` (P12).
8. The results of GDE-013, if the sessions were held, are recorded.

## 9. Delivery order
Four milestones. Each ends in a state that could ship, and none needs the next. The right-hand column ties them to the milestones of spec 012.

| Milestone | Delivers | Requirements | With spec 012 |
|---|---|---|---|
| U0. The contract | The baseline measured on the running application; the surface registry; the plant document holding the four 2.0 plants; the editor split and maximise; the transport interface, with one set of run controls; the results panel without Lab | SHL-001, SHL-002, SHL-006, SHL-007, PLS-001 to PLS-003, PLS-012, the U0 part of SHL-003 and SHL-004 | Before Task V4 of `plan-m1.md` starts (its wave 6) |
| U1. The main flow | One-action Run, the save model, the target selector, the status rail, notices, the state words | FLW-001 to FLW-014, MSG-007, SHL-010, SHL-014, PLS-013 | With M1 |
| U2. Tests, find and words | The Tests activity and results; the rest of the panel's moves; the palette, search and references; the vocabulary and the guard; settings and creation from the navigator | TST, FND, MSG-001 to MSG-006, SHL-003 to SHL-005 (the Plant activity gets its content in U3), SHL-008, SHL-009, SHL-011 to SHL-013, SHL-015, SHL-016 | Alongside M2 to M5 |
| U3. Learn and plant authoring | The Guide, the outline, the reading frame, first use; the homes of the scene editor, the signals, the plant map and plant I/O mode; the docs and screenshots | GDE, PLS-004 to PLS-011, section 8.2 items 5, 6 and 8 | With M6 and M7 |

**Exit of U0.** A plant lesson of 2.0 opens with its program and its plant side by side, Run and Pause of the command bar drive both, the Lab tab is gone and its command opens the plant document, and all 2.0 suites pass. Revision 2 of `plan-m1.md` carries the matching changes: Task V4 mounts its panel in the plant document, builds no Maximise and no transport, and has no "Use the plant panel's Run" message; Task E3 mounts its editor in the edit state of the plant document; open questions 2, 3 and 4 are closed by decisions D-20 and D-26.

**If time runs out.** U0 and U1 are what 2.1.0 needs (decision D-24, option B). U2 and U3 change nothing that spec 012 builds on, so each can ship in a 2.1.x release without rework, except PLS-005, PLS-006 and PLS-008, which ship with the features of spec 012 they place.

## 10. Traceability
### 10.1 Owner decisions to requirements
| Decision | Requirements |
|---|---|
| S-10: more intuitive | FLW-001, FLW-004, FND-001, MSG-001, MSG-004, GDE-003, GDE-004, GDE-010; the measures of section 8.1 |
| S-10: less complicated, fewer things at once | SHL-003, SHL-008, FLW-009, FLW-011, MSG-005, GDE-002 |
| S-10: no functionality lost | SHL-002, SHL-004, FND-002, TST-004, section 7, section 8.2 items 3 and 4 |
| S-10: better integrated | SHL-001, SHL-006, FLW-005, TST-006 to TST-008, FND-003, FND-004, PLS-003, PLS-007 |
| S-11: ships with 2.1.0, fits spec 012 | PLS-001 to PLS-013, section 4.4, section 9 |

### 10.2 Requirements of specs 011 and 012 that this spec extends
| Earlier requirement | Says | Extended by |
|---|---|---|
| UX-011 | The regions of the shell and what they hold | SHL-001, SHL-003, SHL-005, SHL-008 |
| UX-012, UX-013 | Navigator by PLC objects; configuration as editors | SHL-013, PLS-006, PLS-011 |
| UX-015 | One command registry | SHL-002, FND-001, FND-002 |
| UX-018, UX-019, UX-020 | Hardware indicator, deploy dialog, confirmations | FLW-003, FLW-007, PLS-008 |
| UX-021 | Empty states with a next action | SHL-013, GDE-012 |
| UX-023 | Usable at 1366 by 768 and at the minimum | SHL-003, SHL-016, FLW-011, GDE-003 |
| UX-031, UX-032 | The boundary once; the design documents describe what ships | MSG-003, section 8.2 item 6 |
| IDE-005, IDE-007, IDE-008 | Ask to save; autosave; session restore | FLW-005, FLW-006, SHL-006, SHL-015 |
| IDE-020, IDE-021 | Problems first; notices that link | SHL-010, FLW-013 |
| IDE-029, IDE-030, IDE-032 | Status wording; assistant and review; interlock view | MSG-007, SHL-004, TST-006 |
| LRN-002, LRN-004, LRN-010 | Learn home; the lesson's own surface; stages | GDE-001 to GDE-003, GDE-008 |
| LRN-017, LRN-018, LRN-020 | Faceplate; live plants; replay | PLS-007, PLS-003, TST-007 |
| LRN-022, LRN-026 | Grading by the reference scenario; what a failed check shows | GDE-004, TST-003 |
| LRN-039, LRN-041 | Reading pages; try-it labs | GDE-006 |
| PLT-005, PLT-011, PLT-012, PLT-016 | One clock; fault actions; reset; located failures and slowed time | PLS-003, PLS-004, PLS-009, PLS-013 |
| VIS-001, VIS-002, VIS-005 to VIS-008, VIS-010 | The 3D view and its fallbacks | PLS-001, PLS-004, PLS-009, PLS-012 |
| SCN-006, SCN-008 to SCN-016 | Scene file and editor | PLS-005, PLS-006, PLS-011 |
| LNK-006 to LNK-008, LNK-014 | Force over the plant; plant I/O mode; latency | PLS-007, PLS-008 |

## 11. Glossary
| Term | Meaning |
|---|---|
| Surface | A named part of the interface a person can open: a tab, a sidebar view, a document, a dialog. |
| Region | One of the six fixed areas of the workbench (section 5.1). |
| Activity | An entry of the activity rail and the sidebar it shows. |
| Document | What the editor area shows in a tab: a program, a diagram, a configuration editor, a plant, a review, Preferences. |
| Split | The editor area showing two documents side by side. |
| Guide | The view of the secondary sidebar that holds the open lesson. |
| Assistant | The view of the secondary sidebar that holds the optional AI assistant. |
| Target | Where Run goes: the simulation, or the board of the project. |
| Main path | Edit, run in simulation, watch, test, check a lesson. |
| Composite action | One action that takes several steps in order, such as Run in simulation. |
| Surface registry | The single declaration of every surface, from which the rail, the tabs, the menu and the palette are built. |
| Reveal rule | A row of the table of SHL-010: when the shell may move by itself. |
| Implementation term | A word about how Studio works, not about the user's project, such as POSIX or canonical (MSG-002). |
| Boundary badge | The one label that says what a result is worth: a simulation result or a board result. |
| Evidence record | The artifacts, hashes and trace that prove a test run; kept, and shown on request. |
| Interface budget | A maximum count of visible controls, tabs or status items, checked in CI. |
| Lesson layout | The arrangement Practice opens: the lesson's file, its plant, the Guide. |
