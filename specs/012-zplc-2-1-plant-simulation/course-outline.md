# Course outline: ZPLC 2.1 industrial automation course

**Status:** Approved by the owner on 2026-11-13 (CRS-001), with A2 decided the same day (sibling packages).

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
| Kept as is | All 68, in 2.0 modules 0 to 11 | Starter, solution, scenario, hash and simulation grade unchanged (CRS-010, P4). |
| Prerequisite | Module 12 requires 2.0 module 3 (logic, set and reset, timers, edges, counters). Lessons that need more list 2.0 lessons as their prerequisites (see A5). | New lessons open only after them. |
| Referenced | `interlock-guard-permissive`, `tank-level-fault-reset` and `conveyor-classification-jam` (2.0 modules 6 and 8) are named in the pages of 18.1, 13.1 and 18.3 as the earlier form of the same skill. | Link only. |
| Track opened | The ten plant lessons of 2.0 (those that name a plant): `conveyor-sorting-sfc`, `pedestrian-crossing-sfc`, `pedestrian-crossing-states`, `interlock-guard-permissive`, `interlock-guard-permissive-fbd`, `interlock-guard-permissive-il`, `motor-plant-feedback`, `tank-level-fault-reset`, `tank-level-fault-reset-ladder`, `conveyor-classification-jam`. | Proposed: all ten get the hardware track through plant I/O mode (CRS-010, LNK-007). Only the manifest changes. |

## 4. Assumptions for the owner

The spec does not fix these. Each is a choice to accept or change.

| # | Assumption | If you change it |
|---|---|---|
| A1 | The hardware track is offered by eight lessons (12.1, 12.2, 13.1 to 13.4, 14.1, 18.1) because their scenes have slow signals. The real set depends on the latency measured for LNK-014 against each scene's pulse (SCN-007); the spec does not say which scenes qualify. | The marked lessons change; M6 evidence decides in the end. |
| A2 | **Decided by the owner on 2026-11-13:** a lesson marked `ST/LD` is two sibling packages, as 2.0 does: the Structured Text package and its `-ladder` sibling share scene, scenario and scenario hash and have the same text structure, which a CI test checks. Public counts say "97 lessons, 14 in two languages" (the index holds 111 packages). Each path carries only the sibling of its language; in the full course, passing either sibling unlocks what follows. The one-package form was set aside because the lesson format holds one starter. | Lesson count and content effort. |
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
