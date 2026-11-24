# Course outline: ZPLC 2.1 industrial automation course

**Status:** Approved by the owner on 2026-11-13 (CRS-001), with A2 decided the same day (sibling packages).
**Amended:** 2026-11-23 by the owner's decision S-13 (spec section 4.1): every lesson, of programming and of the plant, is very didactic and the lessons together serve as complete courses. In the full course an explanation comes before the practice that uses it; the didactic standard, the path "Structured Text from zero" and the new lessons are added by the amendment that follows, which the owner approves before modules are rewritten. Lesson ids, scenarios and hashes do not change.
**Amended:** 2026-11-24, approval by the owner pending: section 6 adds the didactic standard (spec CRS-014 to CRS-025), the path "Structured Text from zero" and the proposed new lessons for the gaps of review finding L7. The pilot of three lessons (6.5) shows the standard; modules are rewritten only after the owner approves this section.

## How to review this

You decide three things: **accept** the outline, **change** a row (scene, language, skill or track), or **reorder** lessons or modules. Check first the module list (section 1), then the tables of lessons (section 2), then the assumptions (section 4), which are the choices the spec does not fix. Section 5 shows that every CRS requirement and all 21 reference scenes are covered. Nothing here changes a 2.0 lesson.

Scene numbers and names are those of the SCN table of `spec.md` (working names). Milestones are from spec section 6.2.

**Reading the tables**

| Column | Meaning |
|---|---|
| Language | Languages the lesson offers (CRS-008). `ST/LD` means two sibling packages, the Structured Text one and its `-ladder` sibling, with the same scene, scenario and hash (A2, decided). |
| Tracks | `Sim` = simulation. `Sim + HW*` = hardware track through plant I/O mode, offered only if the scene meets LNK-014 on a learner board (CRS-009); if not, the page shows the hardware track as closed with its reason (LRN-011). Learner boards only (D-17): ESP32-S3-DevKitC-1 and Raspberry Pi Pico. |
| Milestone | The milestone that delivers the scene (6.2). The hardware track of a scene lands in M6; the complete course in M7. |

## 1. Modules

New modules continue the 2.0 numbering (0 to 11) and are ordered by difficulty (CRS-002).

| Module | Title | Requires | Lessons |
|---|---|---|---|
| 12 | First plants | 2.0 module 3 | 3 |
| 13 | Timers and process control | 12 | 4 |
| 14 | Flow control | 12 | 2 |
| 15 | Manipulators and assembly | 14 | 5 |
| 16 | Sorting | 14 | 6 |
| 17 | Stations | 16 | 4 |
| 18 | Safe and diagnosable machines | 17 | 3 |
| 19 | Build your own scenes | 18 | 2 |

Total: 8 modules, 29 lessons.

**Paths (CRS-002).** Each path lists the lessons that offer its language, in module order.

| Path | Language | Lessons |
|---|---|---|
| `plant-st` | ST | 23 (every lesson that offers ST) |
| `plant-ld` | LD | 14 (every lesson that offers LD) |
| `st` (proposed, 6.2) | ST | 33, 11 of them new: "Structured Text from zero", modules 0 to 11 |

The six lessons that are only FBD, SFC or IL (13.4, 14.1, 15.2, 16.2, 17.1, 17.3) belong to their modules and are not in either path.

## 2. Lessons by module

### Module 12: First plants

| Id | Title | Scene | Language | Tracks | Skill taught | Milestone |
|---|---|---|---|---|---|---|
| 12.1 `plant-belt-to-sensor` | Move a box to a sensor | 1 Belt to sensor | ST/LD | Sim + HW* | Start and stop an actuator from a sensor edge. | M1 |
| 12.2 `plant-latch-two-sensors` | From sensor A to sensor B | 2 Latch between two sensors | ST/LD | Sim + HW* | Sequence a move with set and reset. | M1 |
| 12.3 `plant-counted-queue` | Load and unload three boxes | 4 Counted queue | ST/LD | Sim | Count items with a counter to run a fixed batch. | M1 |

### Module 13: Timers and process control

| Id | Title | Scene | Language | Tracks | Skill taught | Milestone |
|---|---|---|---|---|---|---|
| 13.1 `plant-timed-tank` | Fill and drain with timers | 3 Timed tank | ST/LD | Sim + HW* | Time a process with on-delay timers and a panel start. | M2 |
| 13.2 `plant-tank-level-scaling` | Read the level | 12 Tank level control | ST/LD | Sim + HW* | Scale an analog level to engineering units. | M2 |
| 13.3 `plant-tank-pid` | Hold the level with PID | 12 Tank level control | ST | Sim + HW* | Control a level with `PID_Compact` and tune it. | M2 |
| 13.4 `plant-tank-pid-fbd` | The same loop in function blocks | 12 Tank level control | FBD | Sim + HW* | Wire a PID loop as a function block diagram. | M2 |

### Module 14: Flow control

| Id | Title | Scene | Language | Tracks | Skill taught | Milestone |
|---|---|---|---|---|---|---|
| 14.1 `plant-buffer-release` | Accumulate and release | 8 Buffer and release | SFC | Sim + HW* | Model a station as a state machine with steps and transitions. | M1 |
| 14.2 `plant-merge-lines` | Merge two lines | 9 Merge two lines | ST/LD | Sim | Arbitrate two inputs with priority and interlock. | M1 |

### Module 15: Manipulators and assembly

| Id | Title | Scene | Language | Tracks | Skill taught | Milestone |
|---|---|---|---|---|---|---|
| 15.1 `plant-belt-transfer` | Pick from one belt, place on another | 14 Belt-to-belt transfer | ST/LD | Sim | Sequence a gripper with position and grip feedback. | M3 |
| 15.2 `plant-assembler` | Assemble lids and bases | 5 Two-axis assembly | SFC | Sim | Coordinate two axes and a gripper in one sequence. | M3 |
| 15.3 `plant-assembler-numeric` | The same with numeric positions | 6 Two-axis assembly, numeric | ST | Sim | Command axes with numeric setpoints and a position tolerance. | M3 |
| 15.4 `plant-layer-palletizer` | Palletize in layers | 13 Layer palletizer | ST | Sim | Compute positions with arrays and loops. | M3 |
| 15.5 `plant-xyz-palletizing` | Palletize with a gantry | 15 Three-axis palletizing | ST | Sim | Drive three axes through a computed pattern. | M3 |

### Module 16: Sorting

| Id | Title | Scene | Language | Tracks | Skill taught | Milestone |
|---|---|---|---|---|---|---|
| 16.1 `plant-colour-separation` | Send each colour to its belt | 17 Colour separation | ST/LD | Sim | Divert parts with sorting logic on a sensor result. | M4 |
| 16.2 `plant-colour-separation-il` | The same sorting in Instruction List | 17 Colour separation | IL | Sim | Write the sorting logic as an instruction list. | M4 |
| 16.3 `plant-weight-sorting` | Sort by weight | 20 Weight sorting | ST/LD | Sim | Classify by comparing an analog value to limits. | M4 |
| 16.4 `plant-height-chain` | Sort by height, chain transfer | 19 Height sorting with chain transfer | ST/LD | Sim | Decide a route from sensor combinations. | M4 |
| 16.5 `plant-height-turntable` | Sort by height, turntable | 18 Height sorting with turntable | ST | Sim | Coordinate a turntable with the sorting decision. | M4 |
| 16.6 `plant-vision-sorting` | Sort by identity code | 21 Vision sorting | ST | Sim | Route items by the identity code of a vision sensor. | M4 |

### Module 17: Stations

| Id | Title | Scene | Language | Tracks | Skill taught | Milestone |
|---|---|---|---|---|---|---|
| 17.1 `plant-three-level-lifts` | Move items between three levels | 11 Three-level lifts | SFC | Sim | Sequence two lifts that share a level. | M5 |
| 17.2 `plant-lift-stacking` | Gather items into a crate | 10 Lift with stacking | ST | Sim | Combine a count, a lift and a crate in one station. | M5 |
| 17.3 `plant-warehouse` | Store and retrieve | 7 Stacker-crane warehouse | SFC | Sim | Run a request queue on a stacker crane. | M5 |
| 17.4 `plant-production-line` | Balance a production line | 16 Balanced production line | ST | Sim | Split a program into function blocks, one per machine, and balance two outputs. | M5 |

### Module 18: Safe and diagnosable machines

| Id | Title | Scene | Language | Tracks | Skill taught | Milestone |
|---|---|---|---|---|---|---|
| 18.1 `plant-estop-interlocks` | Emergency stop and interlocks | 11 Three-level lifts | ST/LD | Sim + HW* | Make a machine stop safely and refuse unsafe moves. | M5 |
| 18.2 `plant-manual-auto` | Manual and automatic modes | 5 Two-axis assembly | ST/LD | Sim | Switch between manual jog and the automatic sequence without surprises. | M3 |
| 18.3 `plant-fault-actions` | Find the fault | 19 Height sorting with chain transfer | ST | Sim | Diagnose a stuck sensor or a jam from the trace, using fault actions. | M4 |

### Module 19: Build your own scenes

| Id | Title | Scene | Language | Tracks | Skill taught | Milestone |
|---|---|---|---|---|---|---|
| 19.1 `plant-build-belt-scene` | Build a scene from the empty floor | 1 Belt to sensor (rebuilt from the empty floor) | ST/LD | Sim | Place parts, bind signals in the plant map and run the result. | M7 |
| 19.2 `plant-change-scene` | Change a scene | 9 Merge two lines (a part added) | ST/LD | Sim | Edit a scene and re-bind its signals without breaking the program. | M7 |

## 3. How this relates to the 68 lessons of 2.0

Spec section 5 (CRS) and CRS-010 count 68 lessons in 2.0. The count the brief gave for this task was 33; the 68 are confirmed by `fd lesson.json packages/zplc-ide` (68 files). The outline uses 68.

| Relation | Lessons | What happens |
|---|---|---|
| Kept as is | All 68, in 2.0 modules 0 to 11 | Starter, solution, scenario, hash and simulation grade unchanged (CRS-010, P4). By S-13 the text, the reading page, the place in the course order and the version may change (section 6). |
| Prerequisite | Module 12 requires 2.0 module 3 (logic, set and reset, timers, edges, counters). Lessons that need more list 2.0 lessons as their prerequisites (see A5). | New lessons open only after them. |
| Referenced | `interlock-guard-permissive`, `tank-level-fault-reset` and `conveyor-classification-jam` (2.0 modules 6 and 8) are named in the pages of 18.1, 13.1 and 18.3 as the earlier form of the same skill. | Link only. |
| Track opened | The ten plant lessons of 2.0 (those that name a plant): `conveyor-sorting-sfc`, `pedestrian-crossing-sfc`, `pedestrian-crossing-states`, `interlock-guard-permissive`, `interlock-guard-permissive-fbd`, `interlock-guard-permissive-il`, `motor-plant-feedback`, `tank-level-fault-reset`, `tank-level-fault-reset-ladder`, `conveyor-classification-jam`. | Proposed: all ten get the hardware track through plant I/O mode (CRS-010, LNK-007). Only the manifest changes. |

## 4. Assumptions for the owner

The spec does not fix these. Each is a choice to accept or change.

| # | Assumption | If you change it |
|---|---|---|
| A1 | The hardware track is offered by eight lessons (12.1, 12.2, 13.1 to 13.4, 14.1, 18.1) because their scenes have slow signals. The real set depends on the latency measured for LNK-014 against each scene's pulse (SCN-007); the spec does not say which scenes qualify. | The marked lessons change; M6 evidence decides in the end. |
| A2 | **Decided by the owner on 2026-11-13:** a lesson marked `ST/LD` is two sibling packages, as 2.0 does: the Structured Text package and its `-ladder` sibling share scene, scenario and scenario hash and have the same text structure, which a CI test checks. Public counts say "97 lessons, 14 in two languages" (the index holds 111 packages). Each path carries only the sibling of its language; in the full course, passing either sibling unlocks what follows. The one-package form was set aside because the lesson format holds one starter. **Sibling rule (owner, 2026-11-13):** two packages are alternatives only when one id is the other plus `-ladder`, both have the same scenario hash, and neither names the other as a prerequisite (so no 2.0 pair qualifies and 2.0 still counts 68). For alternatives, a prerequisite naming either sibling is met by passing the other; the sibling not taken stays available, never passed. The rule is computed when the course is read and writes nothing to the progress file; the course counter counts an alternative pair once. | Lesson count and content effort. |
| A3 | Paths are `plant-st` and `plant-ld` only. Lessons that are only FBD, SFC or IL sit in modules, not in a path. | Add paths per language. |
| A4 | The `course.json` rules require module levels never to go back, and module 11 is advanced, so modules 12 to 19 are all `advanced`; difficulty is carried by module order. A new lower level would change 2.0 data. | Add a level or accept this. |
| A5 | Lessons name 2.0 lessons as prerequisites: 12.x need `seal-in-ladder` or `motor-start-stop-safe`, 13.x need `analog-scaling-integer`, 14.1 and 15.2 need `sfc-fill-mix-sequence`, 15.4 needs `structures-arrays-call-panel`, 16.2 needs `instruction-list-door-alarm`, 17.4 needs `function-block-pump-pair`. | Exact ids are settled when lessons are written. |
| A6 | 13.4 uses FBD, 14.1, 15.2, 17.1 and 17.3 use SFC, 16.2 uses IL. These languages are assigned to give each its use (CRS-008) on a fitting skill. | Move a language to another lesson. |
| A7 | Where a scene has several lessons (1, 5, 9, 11, 12, 17, 19) the extra lessons teach a different skill on the same scene. Reuse saves content effort. | Use another scene. |
| A8 | 18.1 to 18.3 and 19.x reuse scenes so that safety, modes and faults (CRS-007) are taught on a scene the learner already knows. | Give them new scenes. |
| A9 | Module 19 lessons are graded by a scenario that the lesson supplies, run on the learner's saved scene; the rules a learner must follow (part names, signals) are stated in the lesson. The spec does not say how a built scene is graded. | Grading design for CRS-012. |
| A10 | Lesson ids, slugs and titles are proposals. | Rename freely. |

## 5. Coverage

### CRS requirements

| Requirement | Where the outline satisfies it |
|---|---|
| CRS-001 | This document: modules, lessons, scene, language, tracks, skill. Approval is yours. |
| CRS-002 | Modules 12 to 19 ordered by difficulty (section 1); paths `plant-st` and `plant-ld`. |
| CRS-003 | Every scene appears in at least one lesson (scene table below); the manifest names the scene. |
| CRS-004 | Constraint on each lesson, decided when written: every lesson is a data package. Not an outline choice. |
| CRS-005 | Constraint on each lesson: a pinned scenario with a plant-fact expectation. Not an outline choice. |
| CRS-006 | Constraint on each lesson: headless grading within 60 s. Not an outline choice. |
| CRS-007 | Set and reset: 12.2. Timers: 13.1. Counters: 12.3. Analog scaling: 13.2. PID with `PID_Compact`: 13.3, 13.4. State machines: 14.1, 15.2, 17.1, 17.3. Sorting: 16.1 to 16.6. Interlocks and emergency stop: 18.1 (and 14.2). Manual and automatic: 18.2. Fault diagnosis with fault actions: 18.3. |
| CRS-008 | Each lesson states its languages. ST: 13.3 and others. LD: all `ST/LD` lessons. FBD: 13.4. SFC: 14.1, 15.2, 17.1, 17.3. IL: 16.2. |
| CRS-009 | Eight lessons offer the hardware track, subject to LNK-014 (A1); their pages say what to connect. |
| CRS-010 | Section 3: 68 lessons unchanged; the ten plant lessons listed for the hardware track. |
| CRS-011 | Constraint on each lesson and on the docs: English and Spanish. Not an outline choice. |
| CRS-012 | Module 19 (19.1, 19.2). |
| CRS-013 | Constraint on public text. Not an outline choice. |

### Reference scenes

| # | Scene | Lessons |
|---|---|---|
| 1 | Belt to sensor | 12.1, 19.1 |
| 2 | Latch between two sensors | 12.2 |
| 3 | Timed tank | 13.1 |
| 4 | Counted queue | 12.3 |
| 5 | Two-axis assembly | 15.2, 18.2 |
| 6 | Two-axis assembly, numeric | 15.3 |
| 7 | Stacker-crane warehouse | 17.3 |
| 8 | Buffer and release | 14.1 |
| 9 | Merge two lines | 14.2, 19.2 |
| 10 | Lift with stacking | 17.2 |
| 11 | Three-level lifts | 17.1, 18.1 |
| 12 | Tank level control | 13.2, 13.3, 13.4 |
| 13 | Layer palletizer | 15.4 |
| 14 | Belt-to-belt transfer | 15.1 |
| 15 | Three-axis palletizing | 15.5 |
| 16 | Balanced production line | 17.4 |
| 17 | Colour separation | 16.1, 16.2 |
| 18 | Height sorting with turntable | 16.5 |
| 19 | Height sorting with chain transfer | 16.4, 18.3 |
| 20 | Weight sorting | 16.3 |
| 21 | Vision sorting | 16.6 |

21 of 21 scenes covered.

## 6. Amendment of 2026-11-24: the didactic standard, Structured Text from zero, new lessons

**Status:** proposed, approval by the owner pending. Nothing in modules 0 to 19 is rewritten before the approval, except the three pilot lessons of 6.5. Lesson ids, scenarios and hashes of 2.0 do not change, and no lesson is renamed or deleted, so saved progress stays valid.

### 6.1 The standard

The owner's brief of 2026-11-23 (logbook L278) as requirements of spec section 5 (CRS). The measure is what fails when a lesson breaks the rule; "to add" marks a rule of task T1 of `plan-crs.md`.

| Brief | Requirement | Measure |
|---|---|---|
| A lesson that introduces an idea opens with a reading page in English and Spanish: plain words, a figure or timing diagram, a worked example, common mistakes, a quiz. The format does not change. | CRS-014 | Rule `reading`; rule `reading-parts` (to add). |
| In the full course the explanation comes before the practice. | CRS-015 | Rule `order` with `tools/ci/lesson-ideas.json`. |
| A plant lesson's reading presents the machine, with a labelled image and a signal table generated from the scene and the plant map. | CRS-016 | The generators' `--check`; rule `machine` (to add). |
| Edit says what the program must do, never how; the full answer only in the last hint. | CRS-017 | Rule `answer` (to add) for ST and IL; a person reads LD, FBD and SFC at each stop. |
| Exercises grow: a one-line warm-up, each module ends with a program written from its declarations, the capstone from the description. | CRS-018 | Rule `grows` (to add); column "Starter statements". |
| Run leads to Check; control names come from the i18n catalogue through a placeholder. | CRS-019 | Rule `check`; `{{ui:<key>}}` expanded when the index is built; `generate-lesson-index.ts --check`. |
| The evidence scope stays true, said once, in plain words, outside the checkpoints. | CRS-020 | Rule `vocabulary`; rule `scope` (to add). |
| Spanish in "usted", one term per concept from the glossary. | CRS-021 | LRN-029 tests; rule `glossary`. |
| A path "Structured Text from zero". | CRS-022 | `course.json`; the path tests; rules `reading`, `order`, `grows` on its lessons. |
| The gaps of L7, each construct checked against the compiler first. | CRS-023 | `course-l7-support.md`; `lesson-ideas.json`; a test (to add) for a supported construct without an explainer. |
| A wrong-program set in every lesson. | CRS-024 | The validator and the RED proofs; done for all 111 in step 1. |
| A journey follows the first lesson and the first plant lesson word for word until passed. | CRS-025 | Two journeys (task T7). |

The placeholder for control names is `{{ui:<catalogue key>}}`, for example `{{ui:learn.check}}`, which shows "Check" in English and "Comprobar" in Spanish. It is expanded when the lesson index is built, not when Learn draws the lesson: LRN-038 of 2.0 forbids replacing a lesson string at run time, and a build-time expansion gives the same result, because a renamed label makes the committed index stale and CI fails until it is regenerated. When U3 renames a control or moves its key, the lessons follow on the next regeneration, or the validator names every lesson whose key is gone.

### 6.2 The path "Structured Text from zero"

Id `st`, focus language ST (LRN-043, CRS-022). It takes a learner who never programmed a PLC from what a PLC is to the tested program of a machine, with only a computer, as the `ladder` path does for Ladder diagram. Module 9 is the Instruction List module and has no ST lesson. A lesson marked "new" is proposed in 6.3 and is subject to the compiler support matrix. "Ends" marks the module's last practice, which CRS-018 asks to be written from the declarations.

| # | Lesson | Module | New | What it teaches |
|---|---|---|---|---|
| 1 | `first-blink-simulation` | 0 | | What a PLC is, what a Structured Text program looks like, and how ZPLC runs and checks it; a one-number warm-up. |
| 2 | `scan-cycle-one-scan-memory` | 1 | | The scan cycle in ST: the statements run from top to bottom once per scan, so a copy taken before a change lags one scan. |
| 3 | `st-if-then-else` | 1 | new | IF, ELSIF and ELSE, and why an output written in only one branch keeps its last value. |
| 4 | `blink-structured-text` | 1 | | A first function block: a TON as a clock, switched by an enable input. Ends. |
| 5 | `boolean-logic-two-hand-guard` | 2 | | AND, OR, NOT and XOR in one expression; warm-up. |
| 6 | `set-reset-alarm-latch` | 2 | | Memory with SR and RS, and which one wins when set and reset arrive together. |
| 7 | `motor-start-stop-safe` | 2 | | Seal-in, stop and overload, written from the declarations. Ends. |
| 8 | `timers-on-delay-off-delay` | 3 | | TON and TOF as instances called on every scan (pilot, 6.5). |
| 9 | `timer-pulse-tp` | 3 | new | TP: a pulse of fixed length that a long press cannot stretch. |
| 10 | `edge-counter-pulses` | 3 | | R_TRIG and CTU: count each press once. |
| 11 | `counter-down-up-down` | 3 | new | CTD and CTUD: count up and down between empty and full. Ends. |
| 12 | `types-arithmetic-comparison` | 4 | | INT, arithmetic and the comparison operators. |
| 13 | `st-real-numbers` | 4 | new | REAL, the conversions to and from INT, division and rounding, before any lesson uses REAL. |
| 14 | `analog-scaling-integer` | 4 | | Raw counts to a percentage with integer arithmetic. |
| 15 | `st-bits-and-words` | 4 | new | WORD, bitwise AND, OR and XOR, shifts, and one bit of a word. Ends. |
| 16 | `pedestrian-crossing-states` | 5 | | A state machine with CASE, written from the declarations. Ends. |
| 17 | `motor-plant-feedback` | 6 | | A command and its run confirmation are two signals. |
| 18 | `interlock-guard-permissive` | 6 | | A permissive that no start can override. |
| 19 | `tank-level-fault-reset` | 6 | | Level control with fault and reset latches. Ends. |
| 20 | `st-user-function` | 7 | new | A FUNCTION returns a value and keeps no memory; when a FUNCTION_BLOCK is needed instead. |
| 21 | `function-block-pump-pair` | 7 | | Write a FUNCTION_BLOCK and use two instances of it. |
| 22 | `st-arrays-for` | 7 | new | ARRAY and FOR: one loop over five values. |
| 23 | `st-while-repeat` | 7 | new | WHILE and REPEAT, and why every loop must end inside one scan. |
| 24 | `st-structures` | 7 | new | A STRUCT type that groups the signals of one machine. |
| 25 | `st-global-variables` | 7 | new | VAR_GLOBAL and VAR_EXTERNAL: one value shared by a program and its function blocks. |
| 26 | `structures-arrays-call-panel` | 7 | | An array of structures handled by one FOR loop. Ends. |
| 27 | `conveyor-classification-jam` | 8 | | Classify parts and lock out a jam safely. |
| 28 | `temporal-assertions-jam-fault` | 8 | | Prove a timing with AT, WITHIN, FOR, UNTIL, RISING and FALLING. |
| 29 | `conveyor-two-parts-diagnosis` | 8 | | Tell two parts apart from the trace. Ends. |
| 30 | `modbus-register-round-trip` | 10 | | Write a holding register and read it back. |
| 31 | `st-strings` | 10 | new | STRING: build a message with CONCAT and measure it with LEN, before MQTT uses one. |
| 32 | `mqtt-publish-subscribe` | 10 | | Publish a message and keep it when it comes back. Ends (open: its starter holds four statements, see A12). |
| 33 | `capstone-packing-station` | 11 | | A small machine written from its description and proved by a scenario. |

The path changes no 2.0 lesson: 22 of its lessons exist and keep their starters. The order of the full course follows the path's order inside each module (the `order` field, S-13), so that each explanation comes first.

### 6.3 Proposed new lessons for the gaps of L7

Every row is subject to the compiler support matrix (`course-l7-support.md`, written by the course tools of step 2): a construct the compiler or the runtime does not support becomes a compiler gap, and its lesson is not written (CRS-023). Each new lesson is a package of its own, with a new starter and solution, a scenario with at least three assertions, a wrong-program set, a reading page and its text in English and Spanish.

| Construct (L7) | Proposed lesson | Module | Language | What the practice asks | Status |
|---|---|---|---|---|---|
| IF, ELSIF, ELSE (used from lesson 1, never taught) | `st-if-then-else` | 1 | ST | A lamp that shows one of three states of a tank, written as one IF with two ELSIF branches. | Subject to the compiler support matrix |
| TP | `timer-pulse-tp` | 3 | ST | A lubrication pulse of fixed length per press, that holding the button does not stretch. | Subject to the compiler support matrix |
| CTD, CTUD | `counter-down-up-down` | 3 | ST | A car park that counts cars in and out and shows full and empty. | Subject to the compiler support matrix |
| REAL (first used at `plant-tank-level-scaling`, never taught) | `st-real-numbers` | 4 | ST | A temperature in tenths of a degree turned into REAL, averaged and rounded back. | Subject to the compiler support matrix |
| Bit and word operations | `st-bits-and-words` | 4 | ST | Eight lamp states packed into a status WORD, and one bit tested and set. | Subject to the compiler support matrix |
| A user FUNCTION | `st-user-function` | 7 | ST | A function that limits a setpoint, called from two places. | Subject to the compiler support matrix |
| FOR and ARRAY, apart from STRUCT | `st-arrays-for` | 7 | ST | The largest and the sum of five tank levels in one FOR loop. | Subject to the compiler support matrix |
| WHILE, REPEAT | `st-while-repeat` | 7 | ST | The first free slot of a rack found with a bounded WHILE, and the same with REPEAT. | Subject to the compiler support matrix |
| STRUCT, apart from ARRAY | `st-structures` | 7 | ST | The signals of one motor grouped in a STRUCT and passed as one value. | Subject to the compiler support matrix |
| VAR_GLOBAL | `st-global-variables` | 7 | ST | A shared count written by the program and read by a function block. The grade runs one task and one program, so a global shared between two programs cannot be graded. | Subject to the compiler support matrix |
| STRING | `st-strings` | 10 | ST | An alarm text built from a name and a number, and its length checked. | Subject to the compiler support matrix |
| RETAIN | none proposed | | | The ZPLC programming skill states that source `RETAIN` is unsupported; if the matrix confirms it, this is a compiler gap and no lesson teaches it. | Subject to the compiler support matrix |
| CASE | none: `pedestrian-crossing-states` explains it in its reading page | 5 | ST | | |
| TP, CTD and CTUD in Ladder diagram | `timer-pulse-tp-ladder`, `counter-down-up-down-ladder` | 3 | LD | The same practice as the ST lesson, as sibling packages (A2) for the `ladder` path. Optional, recommended. | Subject to the compiler support matrix |

Counts if every row is written: 111 packages become 122, or 124 with the two Ladder siblings. The counters, the tests that pin them and the generated pages change with them.

### 6.4 Assumptions of the amendment

| # | Assumption | If you change it |
|---|---|---|
| A11 | Control names expand when the index is built, not when Learn draws the lesson, because LRN-038 forbids replacing lesson text at run time. The result for the learner is the same, and CI fails on a stale name. | Display-time expansion means amending LRN-038 of spec 011. |
| A12 | Module 10 of the path ends with `mqtt-publish-subscribe`, whose starter holds four statements. Recommended: accept it, because the module is about the protocols, not about writing a program from its declarations. | One more new lesson, a module project. |
| A13 | The rule `reading` treats every lesson as one that introduces an idea, as the check of step 1 does: a sibling in another language explains the idea in its own language and may point to the first page for the rest. | Siblings could keep no page; the check would need a list of exempt lessons. |
| A14 | The full answer stays in hint 2, the last hint: the lesson format has two hint levels and keeps them. | A third hint level changes the format. |

### 6.5 The pilot

Three lessons brought to the standard in both languages before the approval, as the owner asked: `timers-on-delay-off-delay` (ST, module 3), `sfc-fill-mix-sequence` (SFC, module 5) and `plant-belt-to-sensor` (ST, module 12). Each gets a reading page, an Edit stage that says what and not how, the answer only in the last hint, a Run stage that leads to Check through `{{ui:learn.check}}`, the scope said once, and its version raised. Their scenarios, hashes and starters do not change. The evidence is in the owner's stop folder, `.cache/claude-ux-review/course/step2/`.

