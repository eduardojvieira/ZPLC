# Feature Specification: ZPLC 2.1 Plant Simulation

**Implementation branch**: `feat/plant-simulation`, created from `master` (design default; the owner may rename it)  
**Created**: 2026-11-12  
**Status**: Approved by the owner on 2026-11-12 ("si, aprobada"). Next: `plan.md` for milestone M0  
**Baseline**: commit `26189851`, version `2.0.0`  
**Builds on**: [spec 011](../011-zplc-2-0-remediation/spec.md) (its principles P1 to P13 and its requirements stay in force)  
**Companion**: `research.md` in this directory (decisions with evidence and sources); `plan.md` (the plan of milestone M0)

## Contents
1. [Purpose, audience, and how to read this document](#1-purpose-audience-and-how-to-read-this-document)
2. [Where 2.0 stands](#2-where-20-stands)
3. [Principles](#3-principles)
4. [Scope and owner decisions](#4-scope-and-owner-decisions)
5. [Workstreams](#5-workstreams): [PLT](#plt-plant-core) plant core, [VIS](#vis-3d-view) 3D view, [PRT](#prt-parts-catalogue) parts, [SCN](#scn-scenes-and-the-scene-editor) scenes and editor, [LNK](#lnk-plant-link) plant link, [CRS](#crs-industrial-automation-course) course
6. [Delivery order and the feasibility gate](#6-delivery-order-and-the-feasibility-gate)
7. [Definition of done for the 2.1 plant simulation](#7-definition-of-done-for-the-21-plant-simulation)
8. [Traceability](#8-traceability)
9. [Glossary](#9-glossary)

## 1. Purpose, audience, and how to read this document
This specification defines the plant simulation of ZPLC 2.1: a three-dimensional, physically simulated factory floor inside ZPLC Studio that a PLC program controls. A learner opens or builds a scene made of conveyors, sensors, manipulators and tanks, runs a program against it in simulation or on a real board, and is graded on what the plant did. 2.1 ships 21 reference scenes and an industrial automation course built on them.

ZPLC 2.0 already has a small version of this: four hand-written plants drawn as two-dimensional schematics (section 2). 2.1 keeps them and adds a general plant made of parts.

**Audience.** The owner, who took the decisions in section 4 and approves this document. Contributors, who implement and need to know what "done" means. Educators and learners, who want to know what the plant will and will not do.

**Reading path.**

| If you have | Read |
|---|---|
| Ten minutes | Sections 2, 3 and 4 |
| A workstream to implement | Its part of section 5, then section 6 |
| A question such as "does 2.1 include X?" | Section 4.4 and the scope lines of section 5 |
| A question about why three.js and not Godot | `research.md` sections 1 and 2 |

**Conventions.** They are the conventions of spec 011, repeated here so that this document stands alone.

- Requirements use MUST, MUST NOT and SHOULD. Each has a stable ID such as `PLT-004`. An ID is never reused. This spec introduces the prefixes PLT, VIS, PRT, SCN, LNK and CRS. IDs with other prefixes (LRN, IO, COM, RT, IDE, UX) belong to spec 011.
- Evidence is cited as `path:line` at the baseline commit. Three path prefixes are shortened: `IDE/` is `packages/zplc-ide/`, `COMPILER/` is `packages/zplc-compiler/src/`, `CORE/` is `firmware/lib/zplc_core/`.
- **Design default** marks a choice made when this spec was written, not an owner decision. It stands until the owner revises it; section 4.3 lists them.
- Evidence levels follow the constitution (`.specify/memory/constitution.md`, rule 7): host, QEMU, target build, hardware-in-the-loop (HIL), manual. A lower level never proves a higher one.
- Numbers marked "confirmed at the gate" are targets until the feasibility gate of section 6 measures them.

## 2. Where 2.0 stands
The plant of 2.0 is the right foundation: a headless model, an explicit binding to the program, and deterministic grading. Each row names what 2.1 builds on and the limit it removes.

| 2.0 has | Evidence | Limit that 2.1 removes |
|---|---|---|
| Four live plant models (motor, conveyor, tank, pedestrian crossing), each a pure `step`, `sense`, `act`, used by the live panel | `IDE/src/plants/plantEngine.ts:15-27`, `:107-112` | The list is closed: a new plant is application code |
| A second set of the same four models inside the scenario engine, used for grading | `IDE/src/test-engine/index.ts:462-470`, `:520-529` | Two models per plant that do not agree (see below) |
| Plant signals are booleans | `plantEngine.ts:13` | No level, weight, position or speed |
| One plant step per PLC scan, no physical time | `plantEngine.ts:114`, `IDE/src/plants/plantLoop.ts:5` | No physics: nothing has mass, falls or collides |
| A two-dimensional schematic drawing | `IDE/src/plants/PlantView.tsx` | No three-dimensional view |
| An explicit plant map, plant signal to `Program.Name` | `IDE/src/plants/plantMap.ts:12-19` | Boolean only (`plantLoop.ts:21`) |
| A closed loop that follows the runtime's scan counter | `plantLoop.ts:1-8` | Polled, not locked to the program's clock |
| Scenarios with nine expectation kinds over program signals, pinned by a content hash | `IDE/src/test-engine/index.ts:10`; `scenario.sha256` in each `lesson.json` | No expectation about what the plant did |
| A text equivalent of plant state | `IDE/src/plants/plantFacts.ts` | Written per plant, by hand |
| 68 lesson packages, 10 of which declare a plant | `IDE/lessons/` | None uses physics |
| Table-driven board I/O: up to 64 channels, digital and 16-bit analog | `CORE/include/zplc_hal.h:266-277` | Inputs always come from pins |
| A scheduler core that reads each input channel of the board table through a port operation, as a 16-bit value | `CORE/src/core/zplc_sched_core.c:938-946` | An input with no channel, or a REAL, cannot be fed; the plant link needs a new operation |
| A framed, versioned control link with sessions | COM-019, COM-020 | It carries no plant data |
| A content security policy that allows WebAssembly and workers | `IDE/electron/security.ts:982`, `:986` | None: no change is needed |
| A PID function block, `PID_Compact` | `COMPILER/compiler/stdlib/process.ts:530` | No plant to tune it against |

**Two models per plant.** The live panel and the grader do not run the same model. The motor counts as at speed from 900 permille live and from 1000 when graded. The tank starts at 500 live and at 200 when graded. The graded conveyor jams by itself, and the live one jams only on a fault action (`plantEngine.ts:40`, `:56`, `:74`; `test-engine/index.ts:464`, `:468`, `:520-529`). A program can therefore look right in the live plant and fail its check. Decision D-19 makes the live plant behave as the graded one, and PLT-017 forbids the same split for scenes.

**No plant reaches a board.** All ten plant lessons are closed to the hardware track because their plant exists only in simulation. `conveyor-classification-jam` says it in full: "The parts and the jam come from the simulated conveyor plant, and the lesson reads seven inputs where the learner boards have four." (`IDE/lessons/conveyor-classification-jam/lesson.json:14`).

Spec 010 excluded "scene editing, general physics/3D" from 2.0 (`specs/010-zplc-2-0-foundation/spec.md:87`) and spec 011 kept that exclusion (`specs/011-zplc-2-0-remediation/spec.md:58`). **This spec lifts those two exclusions for 2.1 and no other.**

## 3. Principles
Principles P1 to P13 of spec 011 apply unchanged. This spec adds four. A requirement that conflicts with a principle is a defect in this spec.

| ID | Principle | Meaning in practice |
|---|---|---|
| P14 | The plant core is the truth; the 3D view is a view | Grading, tests and the board link read the headless plant core. Nothing is graded from pixels, and every lesson can be completed without the 3D view. |
| P15 | One clock in simulation | The plant and the program advance together on virtual time. Pausing one pauses the other. |
| P16 | One plant, three controllers | The same scene and the same program work with the native runtime, the WASM runtime and a board. A difference is a declared capability gap (it extends P3). |
| P17 | Original content | Scenes, names, models, textures and text are made for ZPLC or carry a recorded free licence. Nothing is copied from Factory I/O or any other product. |

## 4. Scope and owner decisions
### 4.1 Owner decisions (binding)
Recorded from the owner's messages of 2026-11-12, quoted as written. Numbering continues from S-5 of spec 011.

| ID | Decision | Owner's words |
|---|---|---|
| S-6 | The plant is complete, performs well and is physically realistic. | "La idea es que sea una planta completa, con buen performance y realismo fisico." |
| S-7 | At minimum the plant covers the exercises of the 21 scenes that ship with Factory I/O. The ideal is a very complete industrial automation course. | "como minimo deberiamos cubrir las escenas de factory i/o y lo ideal es tener un curso de automatizacion industrial muy completo" |
| S-8 | It stays multi-platform, it connects to the simulator and to boards running the ZPLC firmware, and the 2.0 course stays compatible and well integrated. | "la idea es mantener el multiplataforma y que incluso el 3d pueda conectarse no solo con el simulador sino con placas completas corriendo el firmware zplc. todo el curso de programacion de plcs que se esta lanzando en zplc 2.0.0 tiene que ser compatible y bien integrado con la planta de simulacion." |
| S-9 | It ships in ZPLC 2.1. | "esto sera para zplc 2.1" |

Earlier decisions that still bind this work: nothing is descoped (P4), no recurring cost (P5), ZPLC is the desktop application only, with no hosted web build (D-07 of spec 011), and the learner boards are the ESP32-S3-DevKitC-1 and the Raspberry Pi Pico.

### 4.2 Decisions taken on the recommended defaults
Each decision was put to the owner with a recommended default. The owner answered on 2026-11-12: "acepto todas sus recomendaciones". The Decided column is therefore binding. Numbering continues from D-13 of spec 011.

| ID | Decision | Options | Decided | Governs |
|---|---|---|---|---|
| D-14 | Rendering and physics stack | (A) three.js for rendering and Jolt compiled to WebAssembly for physics, inside Studio. (B) Godot with Jolt, as a separate process and window. | A, confirmed or overturned by the feasibility gate (section 6.1). If the gate overturns A, the decision returns to the owner. Reasons and sources: `research.md` sections 1 and 2. | Everything after the gate |
| D-15 | A scene editor for learners in 2.1 | (A) Yes: the editor that builds the reference scenes is also a learner-facing sandbox. (B) Reference scenes only; the editor stays an internal authoring tool and the sandbox comes in 2.2. | A. The 21 scenes cannot be built without an editor, so option A costs finish, not a second tool. | SCN-008 to SCN-016, CRS-012 |
| D-16 | The board's physical outputs while it runs against the plant | (A) Always held in the safe state. (B) Safe by default; a person may turn on mirroring for the session, and the board's outputs then follow the program. | B. The learner sees the board's LEDs follow the plant. The default satisfies P9 and the explicit action satisfies P7. | LNK-010 |
| D-17 | Boards with plant evidence in 2.1 | (A) The two learner boards at HIL level; every other catalogued board at target-build level. (B) Every catalogued board at HIL level. | A. HIL evidence needs the board on the bench. | LNK-016, CRS-009 |
| D-18 | Use of Open Industry Project, an MIT-licensed simulator on the same stack as option A of D-14 | (A) Study it and write ZPLC's own code. (B) Also reuse named parts or assets with attribution, decided item by item after the gate reviews their quality. (C) Depend on it as a library. | B. Not C in 2.1: its README says breaking changes can land in any update (`research.md` section 5). | Effort of PRT |
| D-19 | The four 2.0 plants have a live model and a graded model that differ (section 2) | (A) Leave both as they are. (B) Make the live plant behave as the graded one; every scenario, hash and grade stays. (C) Grade against the live model; scenarios and hashes change. | B. No grade changes (P4, PLT-013), and what the learner sees live becomes what the check measures. | PLT-013, LNK-007 for the 2.0 plants, CRS-010 |

### 4.3 Design defaults
These were chosen while writing and are not owner decisions.

| Default | Where it applies |
|---|---|
| The working names of the 21 reference scenes | SCN, table of reference scenes |
| Budgets: 60 frames per second typical and never below 30 at 1920×1080; 200 dynamic items; 50 MB of installer growth per platform; 60 seconds to grade a lesson | VIS-004, PLT-014, VIS-013, CRS-006 |
| Reference machines: the owner's Linux laptop with AMD integrated graphics, a MacBook Air M1, and a Windows machine with a GPU still to be named | VIS-004 |
| No React binding for three.js unless the gate shows a concrete need (P12) | `research.md` section 4 |
| Tanks are numeric models with a drawn level, not particle fluid | PLT-009 |
| The vision sensor reports an identity code, not a processed image | PRT-005 |
| Parts are parametric geometry generated in code, not modelled meshes, unless a mesh with a recorded free licence exists | PRT-009 |
| A scene is edited only while its plant is stopped | SCN-008 |
| Each milestone ends in a state that could ship as a 2.1 pre-release | Section 6.2 |
| One scenario engine: the engine of 2.0 gains a seam for the plant core, and its four graded models stay inside it untouched | SCN-005, PLT-013 |
| Live simulation with the native runtime is scan-exact, which adds an exchange to the native runtime session | PLT-005, milestone M1 |
| The editor counts as responsive when key press to paint takes at most 100 ms at the 95th percentile | PLT-015, gate check 7 |
| Scene lessons are graded on a board by the rule of the 2.0 hardware check | CRS-009 |
| The course is new modules plus one path per focus language; the outline names them | CRS-002 |
| The feasibility prototype lives on a branch that is never merged | Section 6.1 |
| Requirement coverage for this spec is tracked with `tools/ci/requirement-coverage.ts`, extended to read this spec | Section 7 |

### 4.4 Out of scope for 2.1
- A public part SDK or a marketplace. The exclusion of spec 010 stands.
- Plant drivers for other vendors' PLCs (Modbus TCP, OPC UA, EtherNet/IP or S7 clients inside the plant). The "external PLC control" exclusion of spec 010 stands.
- Six-axis robots, automated guided vehicles and virtual reality.
- Particle fluids, soft bodies and cables.
- Import of CAD formats such as STEP or IGES.
- A hosted web build (D-07).
- Timing claims on hardware beyond published measurements (P6).
- Replacing or removing any 2.0 plant, lesson or example (P4).

**Anti-goals.** These would make the feature a failure even if it worked: a grade that depends on rendering; a second user-interface stack with its own translations and tests; a weaker Electron sandbox or content security policy; content copied from another product.

## 5. Workstreams
| Prefix | Workstream | Outcome | Depends on |
|---|---|---|---|
| PLT | Plant core | A scene runs headless, with physics, typed signals and one clock | The gate |
| VIS | 3D view | The learner sees and operates the plant at interactive frame rates, and can do without it | PLT |
| PRT | Parts catalogue | The parts needed to build the 21 scenes, each defined once | PLT |
| SCN | Scenes and the scene editor | 21 reference scenes and a way to build more | PRT, VIS |
| LNK | Plant link | The same plant map connects a plant to the simulator or to a board | PLT; firmware for the board part |
| CRS | Industrial automation course | Graded lessons on the scenes, in English and Spanish | SCN, LNK |

### PLT: Plant core
#### Intent
A scene runs as a headless, deterministic simulation with physical time and typed signals. It does not depend on rendering.

#### Scope
- **In:** the scene format, the simulation step, rigid-body physics, numeric process models, typed signals, plant facts, fault actions, reset and state capture, the command-line entry.
- **Kept:** the four 2.0 plant models, their maps and their scenario hashes.
- **Out:** drawing (VIS), the catalogue itself (PRT), carrying signals to a controller (LNK).

#### Requirements
- **PLT-001** The plant core MUST run a scene without a window, a GPU or a document object model, in the test runner the rest of Studio uses and from the command-line tool.
- **PLT-002** A scene MUST be data: a versioned file, validated against a schema before use, that lists catalogue parts with their position, configuration and names. Loading a scene MUST NOT execute code from the file or fetch a remote resource (P11).
- **PLT-003** Signals MUST be typed. BOOL, 16-bit integer and REAL are the minimum. Each signal has a direction (command: program to plant; sensor: plant to program), and a numeric signal has a unit, a range and a documented scaling to the program's variable (as IO-006 requires for analog channels).
- **PLT-004** The plant MUST advance in fixed steps of simulated time that do not depend on frame rate, host speed or polling rate.
- **PLT-005** In simulation the plant and the program MUST share one virtual clock: when the program has run N milliseconds of scans, the plant has simulated N milliseconds. Pause, a breakpoint and a stopped runtime MUST freeze the plant, and a single step MUST advance both by one scan (P15). With the native runtime this MUST be scan-exact in live simulation as well as in a graded run: signals are exchanged at every scan boundary, so the same script gives the same trace live and graded. In 2.0 only scenario sessions are stepped this way (`firmware/apps/posix_host/src/native_runtime_session.c:1618-1619`); live sessions run freely and the plant polls them (`plantLoop.ts:1-8`).
- **PLT-006** The same scene, program and input script MUST produce the same signal trace and the same plant facts on Linux, macOS and Windows and on repeated runs. This extends LRN-019 to scenes.
- **PLT-007** Items MUST have mass, friction and collision. They are carried, pushed, stacked, lifted, gripped, dropped and blocked by the physics, not by a script: a box pushed off a belt falls.
- **PLT-008** A stack of five boxes on a pallet MUST stay stacked while the pallet travels on a conveyor at catalogue speed and while that conveyor starts and stops. An item at rest MUST stay at rest, without drift or jitter, for ten simulated minutes.
- **PLT-009** A process without rigid bodies (tank level, flow) MUST be a numeric model stepped on the same clock, with its equations documented.
- **PLT-010** The core MUST expose named plant facts about what happened: items produced, delivered, dropped and collided, positions reached, levels. Scenarios, the text equivalent of VIS-008 and the trace all read the same facts.
- **PLT-011** A part MAY define fault actions (a jammed item, a stuck sensor, an actuator that does not move). A person, a lesson or a scenario script triggers them. This keeps the `actions` of the 2.0 plants.
- **PLT-012** Reset MUST return a scene to exactly its initial state, and the state of a running scene MUST be capturable and restorable.
- **PLT-013** The four 2.0 plants MUST keep grading unchanged: the models inside the scenario engine, their scenario files and their hashes. No 2.0 lesson's simulation grade may change. Their live models change to behave as the graded ones (decision D-19).
- **PLT-014** The core MUST simulate the largest reference scene, and a stress scene of at least 200 dynamic items, in real time on the reference machines without missing its fixed step (the number is a design default, confirmed at the gate).
- **PLT-015** A running plant MUST NOT slow the editor. With a reference scene running on a reference machine, the time from a key press in the code editor to its paint MUST stay at or below 100 ms at the 95th percentile, and the smoke and journey suites of 2.0 MUST still pass. The number is a design default: 2.0 records no timing budget, so the gate measures the same value without a plant as the baseline.
- **PLT-016** Failures MUST be located messages (P1): a scene that fails validation, an unknown part, a missing asset. When the plant cannot keep its step in real time it MUST slow simulated time for the plant and the program together and say so; it MUST NOT drop steps silently.
- **PLT-017** A scene MUST have one model. The live run, the graded run and the board link all use the same plant core and the same plant map (P10, P14). The split of section 2 MUST NOT be repeated for scenes.

#### Verification
- Unit tests per part on the headless core (PLT-001, PLT-007, PLT-009).
- A determinism test hashes the trace of a fixed scene and script and compares it on the three operating systems in CI (PLT-006).
- A soak test covers the stack and the rest conditions of PLT-008.
- A capacity benchmark is recorded as evidence per reference machine (PLT-014).
- The 2.0 plant and lesson suites pass unchanged (PLT-013).
- One scene and script are run live and graded, and the two traces are compared (PLT-005, PLT-017).
- An editor-latency measurement is recorded with and without a running scene (PLT-015).

#### Risks and dependencies
- Whether the WebAssembly build of Jolt gives a conveyor its surface velocity, and whether it is repeatable across operating systems, was not verified when this spec was written. Both are gate checks (section 6.1).
- Determinism limits how physics may use threads. The gate measures whether one thread is enough.
- Scan-exact live simulation adds an exchange to the native runtime session, which is C code that drives the scheduler core. It lands in M1, not M6, and needs the same independent review as the firmware part of LNK.

### VIS: 3D view
#### Intent
The learner sees and operates the plant in three dimensions at interactive frame rates on an ordinary laptop, and loses nothing essential without it.

#### Scope
- **In:** the 3D panel, cameras, quality settings, state cues, operating panel parts by hand, the generated schematic, the text equivalent, fallbacks.
- **Kept:** the schematic drawings of the four 2.0 plants.
- **Out:** photorealism, virtual reality, video export.

#### Requirements
- **VIS-001** Studio MUST show the running scene in a 3D panel where 2.0 shows the live plant. The panel MUST be maximisable and SHOULD be movable to a window of its own for a second monitor.
- **VIS-002** The camera MUST orbit, pan and zoom by mouse and by keyboard, and each scene MUST offer named camera presets.
- **VIS-003** The view MUST show the state that matters for control: sensor beams and whether they detect, actuator state, and the signal name of a part on hover and on focus. It MUST use the signal vocabulary of UX-009, with a cue other than colour for every state.
- **VIS-004** On each reference machine at 1920×1080, the largest reference scene MUST render at 60 frames per second typically and never below 30 (design default, confirmed at the gate and published as evidence, P6).
- **VIS-005** A quality setting with at least three levels MUST exist, chosen automatically at first run. The lowest level MUST meet VIS-004 on integrated graphics.
- **VIS-006** When WebGL 2 is unavailable, the graphics context is lost and cannot be restored, or the frame rate stays below the minimum, Studio MUST say so and offer the schematic view. The program, the plant core and grading MUST continue (P1, P14).
- **VIS-007** Every scene MUST have a two-dimensional schematic generated from the scene, with no drawing made by hand per scene.
- **VIS-008** The plant facts MUST be available as live text and announced when the situation changes, not on every scan. This extends LRN-037 to scenes.
- **VIS-009** The light, dark, high-contrast and reduced-motion modes MUST apply to the 3D panel (UX-027). Reduced motion turns off camera animation; high contrast outlines sensors, actuators and items.
- **VIS-010** While a scene runs, a person MUST be able to operate panel parts (push button, selector, emergency stop, potentiometer), trigger a fault action and, where the scene allows it, add or remove an item, by pointer and by keyboard.
- **VIS-011** All text of the view MUST exist in English and Spanish (LRN-029), and its controls MUST come from the Studio component kit (UX-002).
- **VIS-012** The Electron security posture MUST NOT weaken: the sandboxed renderer and the existing content security policy stay as they are (constitution rule 6). The view MUST NOT load a remote asset; every asset is bundled.
- **VIS-013** The feature MUST add no more than 50 MB to each installer (design default, confirmed at the gate), and every binary asset MUST have its licence recorded (P17).

#### Verification
- A frame-rate benchmark is recorded per reference machine and quality level (VIS-004, VIS-005).
- Journeys cover a forced context loss, a machine with no WebGL 2, keyboard-only operation and each display mode (VIS-006, VIS-002, VIS-009, VIS-010).
- The content security policy test of 2.0 passes unchanged (VIS-012).

#### Risks and dependencies
- A Windows virtual machine without a GPU proves the fallback only. The Windows frame-rate evidence needs a machine with a GPU, which is not named yet.

### PRT: Parts catalogue
#### Intent
One catalogue holds the parts needed to build the 21 reference scenes. Each part is defined once, with its geometry, physics, signals, configuration, faults, text and documentation.

#### Scope
- **In:** the parts of the table below, their variants, their snap points and their tests.
- **Out:** parts no reference scene needs; parts supplied by third parties (section 4.4).

#### Minimum catalogue
| Family | Parts | Signals of note |
|---|---|---|
| Items | Box in three heights and two masses, pallet, stackable crate, lid, base, coloured part in two colours, metal and non-metal variants | None; sensors read the item |
| Sources and sinks | Emitter (item kind, interval, scripted or random with a seed), remover | Emit command, item count |
| Conveyors | Belt, roller conveyor, curved conveyor, chain transfer, turntable, lift | Run forward and reverse; speed in the numeric variant; position sensors |
| Flow control | Stop blade, pusher, diverter arm, aligner, chute | Extend and retract; limit sensors |
| Sensors | Diffuse, retro-reflective, inductive, capacitive, light array for height, scale for weight, vision sensor, limit switch | BOOL, or numeric for the scale and the light array |
| Manipulators | Two-axis pick and place, three-axis gantry, vacuum gripper, clamp | Move commands and limit sensors in the digital variant; position setpoint and feedback in the numeric variant; grip |
| Stations | Stacker crane with rack, layer palletizer, machining centre | Composite |
| Process | Tank with fill and discharge valves (on/off and proportional), level meter, flow meter | Numeric |
| Operator panel | Push button, selector switch, emergency stop, indicator light, stack light, potentiometer, numeric display | BOOL and numeric |

#### Requirements
- **PRT-001** Every part of the minimum catalogue MUST exist and be usable in a scene.
- **PRT-002** A part MUST be defined once (P10): its signals, configuration, limits, fault actions, English and Spanish names and its documentation page all come from that definition.
- **PRT-003** A part's behaviour MUST be tested on the headless core, including its limits (speed, stroke, load).
- **PRT-004** Where a reference scene needs both, a part MUST offer a digital variant (commands and limit sensors) and a numeric variant (setpoint and feedback).
- **PRT-005** The vision sensor MUST report the identity of the item in view as a code; the light array MUST report height; the scale MUST report weight. Each has a documented range.
- **PRT-006** Sensors MUST react to the property they name: an inductive sensor to metal items only, a capacitive sensor to any item, an optical sensor to anything that breaks its beam.
- **PRT-007** Parts MUST have snap points so that conveyors, sensors and stations connect without manual alignment.
- **PRT-008** Each part SHOULD define the fault actions a diagnosis lesson needs: at least a sensor stuck on or off, an actuator that does not move, and an item jam where the part can jam.
- **PRT-009** A part's geometry MUST be generated in code or be a mesh with a recorded licence that allows redistribution (P17). No mesh, texture or sound may come from Factory I/O or another proprietary product.
- **PRT-010** Adding a part MUST NOT require a change to a scene file format version, to the plant link or to lesson packages.

#### Verification
- A catalogue test checks every part of the table against PRT-002 and PRT-003.
- The parts reference in the documentation is generated from the definitions and compared in CI (PRT-002).

### SCN: Scenes and the scene editor
#### Intent
2.1 ships 21 reference scenes that cover the teaching goals of the scenes shipped with Factory I/O, and a way to build more.

#### Reference scenes
Names are working names (design default). The last column records which scene of the owner's list each one answers; it is traceability, not a name to ship.

| # | Working name | What the learner practises | Main families | Answers Factory I/O scene |
|---|---|---|---|---|
| 1 | Belt to sensor | Move a box to a sensor | Conveyors, sensors | From A to B |
| 2 | Latch between two sensors | Move a box from sensor A to sensor B with set and reset | Conveyors, sensors | From A to B (Set and Reset) |
| 3 | Timed tank | Fill and drain a tank with timers | Process, panel | Filling Tank (Timers) |
| 4 | Counted queue | Load and unload three boxes with counters | Conveyors, sources | Queue of Items (Counters) |
| 5 | Two-axis assembly | Assemble lids and bases with a two-axis pick and place | Manipulators, flow control | Assembler |
| 6 | Two-axis assembly, numeric | The same with numeric positions | Manipulators | Assembler (Analog) |
| 7 | Stacker-crane warehouse | Store boxes in a rack and retrieve them | Stations | Automated Warehouse |
| 8 | Buffer and release | Accumulate up to five boxes and release them one by one | Flow control | Buffer Station |
| 9 | Merge two lines | Join two conveyor routes into one | Conveyors, flow control | Converge Station |
| 10 | Lift with stacking | Gather up to five items into a stackable crate with a lift | Conveyors, items | Elevator (Advanced) |
| 11 | Three-level lifts | Move items between three levels with two lifts | Conveyors | Elevator (Basic) |
| 12 | Tank level control | Control level or flow with a PID loop | Process | Level Control |
| 13 | Layer palletizer | Palletize boxes in several layers | Stations | Palletizer |
| 14 | Belt-to-belt transfer | Pick parts from one belt and place them on another | Manipulators | Pick & Place (Basic) |
| 15 | Three-axis palletizing | Place boxes on pallets with a three-axis gantry | Manipulators | Pick & Place XYZ |
| 16 | Balanced production line | Produce equal numbers of lids and bases with two machining centres | Stations | Production Line |
| 17 | Colour separation | Send two colours of part to two belts | Sensors, flow control | Separating Station |
| 18 | Height sorting with turntable | Sort boxes by height with a turntable | Sensors, conveyors | Sorting by Height (Advanced) |
| 19 | Height sorting with chain transfer | Sort boxes by height with a chain transfer | Sensors, conveyors | Sorting by Height (Basic) |
| 20 | Weight sorting | Sort boxes by weight with a scale | Sensors | Sorting by Weight |
| 21 | Vision sorting | Separate items with a vision sensor | Sensors | Vision Sensor Sorting |

#### Scope
- **In:** the 21 reference scenes, the scene file, the editor, the plant-map editor, templates.
- **Out:** sharing scenes online; importing scenes from other tools.

#### Requirements
- **SCN-001** The 21 reference scenes MUST ship. Each opens ready to run, with a plant map and a reference program that controls it.
- **SCN-002** A reference scene MUST use only the catalogue and the scene format available to every user. No scene may rely on a private capability.
- **SCN-003** Layouts, names, text and assets MUST be original (P17). A reference scene answers a teaching goal; it is not a copy of another product's scene.
- **SCN-004** Each reference scene MUST have a deterministic scenario that its reference program passes and an empty program fails, run in CI.
- **SCN-005** A scenario MUST be able to script panel inputs, item emission and fault actions at virtual times, and to assert on plant facts with the expectation kinds that exist today.
- **SCN-006** A scene MUST be saved with its project. A scene written by an older Studio MUST open in a newer one or fail with a located message that names the version.
- **SCN-007** Each scene MUST declare the shortest sensor pulse it can produce at catalogue speeds, for LNK-014.
- **SCN-008** The editor MUST place, move, rotate, duplicate and delete parts with snapping and a grid, while the plant is stopped. (Under decision D-15, SCN-008 to SCN-016 apply to learners as well as to scene authors.)
- **SCN-009** The editor MUST let the user configure a part: its name, variant and limits within the documented range.
- **SCN-010** The editor MUST support undo and redo for every edit.
- **SCN-011** The editor MUST list the signals of the scene, built from its parts, with type and direction.
- **SCN-012** A plant-map editor MUST bind signals to program inputs and outputs with a type check, and report an unbound or mismatched signal as a located message.
- **SCN-013** Studio SHOULD generate the variable declarations for a scene's signals, so that a learner starts a program without typing the I/O list.
- **SCN-014** The editor MUST offer a path that needs no pointer: add a part from a list, position it with numeric fields, bind its signals (UX-025).
- **SCN-015** The editor MUST validate a scene as it is edited and show each problem at the part that causes it.
- **SCN-016** Studio MUST offer an empty floor and each reference scene as starting templates.

#### Verification
- CI runs the scenario of every reference scene on the three operating systems (SCN-004).
- A journey builds a small scene from the empty floor, binds it and runs it, once by pointer and once by keyboard (SCN-008 to SCN-014).
- A migration test opens scenes saved by each released schema version (SCN-006).

### LNK: Plant link
#### Intent
The same plant map connects a plant to the program, whichever controller runs it: the native runtime, the WASM runtime or a board.

#### Scope
- **In:** the typed plant map, the exchange with the simulated runtimes, plant I/O mode in the firmware, its safety behaviour, latency measurement, evidence.
- **Kept:** the plant map of 2.0 and the faceplate.
- **Out:** drivers for other vendors' PLCs (section 4.4).

#### Requirements
- **LNK-001** The plant map MUST carry typed signals and name a scene or a 2.0 plant. Maps written for 2.0 MUST keep loading (PLT-013).
- **LNK-002** Binding MUST be explicit and checked against the program's I/O map, including type compatibility. No signal is ever bound by guessing a variable name (it keeps LRN-018).
- **LNK-003** The exchange MUST be atomic with respect to the scan: all sensor values of a plant step are applied at one scan boundary, and commands are read from one consistent output image. This extends LRN-017 and COM-023.
- **LNK-004** With the native runtime the exchange MUST satisfy PLT-005.
- **LNK-005** With the WASM runtime the plant MUST work, and any difference from the native runtime MUST be a declared capability gap (IDE-025, P16).
- **LNK-006** Plant writes MUST go through the force-aware memory interface: a forced input keeps its forced value over the plant's (RT-011).
- **LNK-007** A board MUST offer plant I/O mode: the inputs bound in the plant map take their values from the plant link instead of the board's pins, and the board's output image is published to the plant. The learner's program does not change. This applies to scenes and to the four 2.0 plants; a 2.0 plant feeds the board from the model its lesson is graded against (decision D-19).
- **LNK-008** Entering plant I/O mode is a physical operation. It MUST be started by an explicit action of a person, per session, and shown by a persistent indicator that differs from simulation and from an ordinary hardware connection (P7, UX-018, LRN-015).
- **LNK-009** AI and MCP MUST NOT start plant I/O mode (constitution rule 9). They MAY run a scene scenario headless against a simulated runtime.
- **LNK-010** While a board is in plant I/O mode its physical outputs MUST be in the safe state, unless a person has turned on mirroring for that session (decision D-16).
- **LNK-011** When the session ends, times out or loses its link, the board MUST leave plant I/O mode into its documented safe state. It MUST NOT keep running on stale plant values and MUST NOT return to pin inputs and continue by itself (constitution rule 4, COM-020).
- **LNK-012** Plant I/O mode MUST be a negotiated capability of the control link (COM-019). With firmware that lacks it, Studio MUST say so, and a lesson MUST show the hardware track as unsupported with its reason (LRN-011).
- **LNK-013** Deploy admission (IO-004) MUST count a plant-fed input as provided. An input that neither a pin nor the plant provides MUST still be refused.
- **LNK-014** Against a board the plant runs in real time. Studio MUST measure and show the round-trip latency of the link, and the worst case per transport MUST be published as evidence (P6). Studio MUST warn when that latency can miss the shortest sensor pulse a scene declares (SCN-007).
- **LNK-015** The plant exchange MUST NOT delay the scan (COM-025): its time per scan is bounded, and an exchange that arrives late is counted and visible.
- **LNK-016** Plant I/O mode MUST be implemented in C99 behind the port interface of IO-013 (constitution rule 1), with bounded static memory and no dynamic allocation (a requirement of this spec; the baseline documents state no memory rule). It adds a port operation for plant-fed inputs: the existing one reads only channels of the board table as 16-bit values (`CORE/src/core/zplc_sched_core.c:938-946`), so it cannot carry an input with no channel or a REAL. Plant I/O mode MUST be proven at each evidence level: host, native simulator, target build for every catalogued board, and HIL on the boards that decision D-17 selects.
- **LNK-017** Plant I/O mode MUST work over USB serial, and SHOULD work over TCP on boards with a network interface.
- **LNK-018** The firmware MUST validate every plant frame before it changes an input (P11): frame integrity, session, signal count and width.

#### Verification
- Host tests close the loop between a scripted plant and the scheduler core through the plant port (LNK-003, LNK-006, LNK-007, LNK-011, LNK-018).
- Twister tests on the native simulator cover the entry, the exit, the link loss and the safe state (LNK-008, LNK-010, LNK-011).
- A HIL run on each selected board records the latency of LNK-014 and the link-loss behaviour of LNK-011.

#### Risks and dependencies
- The latency of the link over USB serial is not known. If it is too high for a scene, that scene's lesson stays closed to the hardware track with its reason (LRN-011); the scene is not changed to hide it.
- The firmware part touches the scheduler core and the control link, which are safety-relevant. It needs an independent review before merge.

### CRS: Industrial automation course
#### Intent
A learner who finished the language paths of 2.0 learns industrial automation by controlling the scenes, from one conveyor to a warehouse.

#### Scope
- **In:** a new course path, its outline, its lessons, grading on plant facts, the hardware track through plant I/O mode, documentation pages.
- **Kept:** all 68 lessons of 2.0, the staged lesson model, lesson packages as data, progress export and import.
- **Out:** certification, classroom management beyond what 2.0 has.

#### Requirements
- **CRS-001** A course outline MUST be written and approved by the owner before any lesson: for every module, its lessons with scene, language, tracks and the skill each one teaches.
- **CRS-002** The course MUST appear in Learn as new modules ordered by difficulty and as at least one path. A path of 2.0 is an ordered list of lessons with one focus language (LRN-043), so the outline names each path and its language.
- **CRS-003** Every reference scene MUST be used by at least one graded lesson. Lessons keep the staged model and the manifest of LRN-009; the manifest names the scene the lesson ships.
- **CRS-004** A scene lesson MUST be a data package (LRN-027): adding one requires no change to application code.
- **CRS-005** A scene lesson MUST be graded by a scenario pinned by its content hash, with at least one expectation on a plant fact, so that writing outputs without the plant doing the work cannot pass. CI MUST prove that each reference solution passes and each starter fails.
- **CRS-006** Grading MUST run headless, give the same result on every platform (PLT-006), need no 3D view (P14) and finish within 60 seconds on the reference machines (design default).
- **CRS-007** The outline MUST cover at least: sequences with set and reset, timers, counters, analog scaling, PID level control with `PID_Compact`, state machines for stations, sorting logic, interlocks and emergency stop, manual and automatic modes, and fault diagnosis with fault actions.
- **CRS-008** Each lesson MUST state its languages. Across the new modules, Structured Text, Ladder Diagram, Function Block Diagram and Sequential Function Chart MUST each be used at least once, and Instruction List SHOULD be.
- **CRS-009** A lesson whose scene meets LNK-014 on a learner board MUST offer the hardware track through plant I/O mode, and its page MUST say what to connect. It is graded as 2.0 grades on a board (LRN-024, LRN-026): the same scenario and hash, evaluated on a trace recorded during the run, with the tolerances the lesson declares, and labelled as a hardware result. Studio replays the scenario's plant events in real time.
- **CRS-010** The 68 lessons of 2.0 MUST keep their starter, solution, scenario, scenario hash and simulation grade. A manifest MAY change only to open a track. The ten plant lessons, all closed to the hardware track because their plant exists only in simulation, SHOULD be opened through plant I/O mode; the outline (CRS-001) says which.
- **CRS-011** Every lesson, hint, part name and scene text MUST exist in English and Spanish with the same structure (LRN-029). The docs site MUST have, in both languages, pages generated from the packages for each module, lesson and reference scene, and pages for the plant, the parts catalogue, the scene format and plant I/O mode (LRN-035).
- **CRS-012** The course MUST include lessons in which the learner builds or changes a scene.
- **CRS-013** Public text about the plant MUST state only what recorded evidence supports, including the frame rates, the supported boards and the link latency (P6).

#### Verification
- CI grades every reference solution and every starter on the three operating systems (CRS-005, CRS-006).
- The curriculum and parity checks of 2.0 cover the new path (CRS-002, CRS-011).
- A HIL run completes one hardware-track scene lesson on each selected board (CRS-009).

## 6. Delivery order and the feasibility gate
This is the largest feature since the 2.0 remediation. Its main cost is content: about forty part types, 21 scenes, and at least 21 lessons in two languages. The engine work is smaller and comes first because everything depends on it.

### 6.1 Feasibility gate
A throwaway prototype answers the questions that were not verified when this spec was written. No code from it enters the product. It lives on a branch that is never merged, because checks 4, 6 and 7 need Studio and the native runtime around it. Its results are appended to `research.md`.

| Check | Passes when | Covers |
|---|---|---|
| 1. Conveyor and stack | A box on a belt reaches belt speed and stops with it; a five-box stack survives a travelling pallet; ten simulated minutes at rest show no drift | PLT-007, PLT-008 |
| 2. Repeatability | One scene and script give the same trace hash on three runs on each of Linux, macOS and Windows | PLT-006 |
| 3. Capacity | 200 dynamic boxes on 20 conveyors meet VIS-004 and PLT-014 on the reference machines | VIS-004, PLT-014 |
| 4. One clock | With the native runtime at a 10 ms scan, pause, step and a breakpoint freeze the plant, and a live run gives the same trace as a graded run | PLT-005, PLT-017 |
| 5. Headless | The same scene runs in the test runner with no GPU | PLT-001 |
| 6. Security | It runs in the sandboxed renderer with the content security policy unchanged | VIS-012 |
| 7. Editor stays responsive | Key press to paint stays at or below 100 ms at the 95th percentile with the scene running; the value without a plant is recorded as the baseline | PLT-015 |
| 8. Prior art | Each part or asset of Open Industry Project worth reusing is named, with its licence | D-18 |

**Outcome.** If every check passes, option A of D-14 is confirmed. If only check 1 fails, another physics library is tried before anything else changes (`research.md` section 3). If check 2 fails, the owner decides between a tolerance-based grade and another library. If check 7 fails, physics moves off the user-interface thread and the check is repeated. If check 3 still fails after tuning, option B of D-14 is evaluated with the costs listed in `research.md` section 2, and the owner decides.

### 6.2 Milestones
Each milestone ships its scenes together with their lessons and ends in a state that could be a 2.1 pre-release (design default).

| Milestone | Delivers | Reference scenes |
|---|---|---|
| M0 | The feasibility gate: D-14 confirmed or overturned, and the Open Industry Project items to reuse named (D-18) | None |
| M1 | Plant core, one clock with the scan-exact exchange in the native runtime, 3D view, fallbacks, the editor's authoring path, the transport parts | 1, 2, 4, 8, 9 |
| M2 | Numeric signals end to end, process parts, operator panel | 3, 12 |
| M3 | Manipulators and gripping | 5, 6, 13, 14, 15 |
| M4 | Sorting sensors and diverting parts | 17, 18, 19, 20, 21 |
| M5 | Stations | 7, 10, 11, 16 |
| M6 | Plant I/O mode in the firmware and its evidence. It can start after M1 and run alongside M2 to M5. | Hardware track of the scenes that qualify |
| M7 | The learner-facing editor (decision D-15), the complete course, the documentation in both languages | All |

## 7. Definition of done for the 2.1 plant simulation
1. Every requirement of this spec has an executed check, tracked by the requirement coverage tool extended to this spec, or is recorded as conditional on a decision.
2. The 21 reference scenes pass their scenarios in CI on Linux, macOS and Windows (SCN-004).
3. The course outline is approved and every lesson in it is graded in CI in both languages (CRS-001, CRS-005, CRS-011).
4. The frame-rate, capacity and editor-latency evidence is recorded for each reference machine (VIS-004, PLT-014, PLT-015).
5. Plant I/O mode has evidence at every level decision D-17 requires, including the measured latency (LNK-014, LNK-016).
6. All 2.0 suites pass unchanged: lessons, plants, smoke, journeys, the content security policy test (PLT-013, PLT-015, CRS-010, VIS-012).
7. Every new dependency has its justification in `research.md` (P12) and every asset its licence (P17).
8. The documentation exists in English and Spanish and claims only what the evidence supports (CRS-011, CRS-013).

## 8. Traceability
### 8.1 Owner decisions to requirements
| Decision | Requirements |
|---|---|
| S-6: complete, good performance, physical realism | PLT-007, PLT-008, PLT-014, VIS-004, VIS-005 |
| S-7: the 21 scenes and a complete course | PRT-001, SCN-001, the table of reference scenes, CRS-001 to CRS-008 |
| S-8: multi-platform | PLT-006, VIS-004, SCN-004, CRS-006 |
| S-8: simulator and boards | LNK-004, LNK-005, LNK-007 to LNK-018 |
| S-8: the 2.0 course stays compatible and integrated | PLT-013, CRS-002 to CRS-004, CRS-010 |
| S-9: ships in 2.1 | Sections 6 and 7 |

### 8.2 Requirements of spec 011 that this spec extends
| Spec 011 | Says | Extended by |
|---|---|---|
| LRN-017 | Inputs are applied at a scan boundary | LNK-003 |
| LRN-018 | Live plants bound by an explicit mapping | LNK-001, LNK-002 |
| LRN-019 | A plant is deterministic on every platform | PLT-006 |
| LRN-027 | A lesson is a data package | PLT-002, CRS-004 |
| LRN-037 | Every plant animation has a text equivalent | VIS-008 |
| LRN-011, LRN-013, LRN-015 | Tracks, the hardware track, physical operations by the learner | LNK-008, LNK-012, CRS-009 |
| LRN-024, LRN-026 | The hardware check: the same scenario on a trace recorded from the board, with tolerances | CRS-009 |
| LRN-043 | A path is an ordered list of lessons with one focus language | CRS-002 |
| IO-004, IO-013 | Deploy admission; the port interface | LNK-013, LNK-016 |
| COM-019, COM-020, COM-023, COM-025 | The control link, sessions, atomic writes, events | LNK-003, LNK-011, LNK-012, LNK-015 |
| RT-011 | Force-aware writes | LNK-006 |
| UX-002, UX-009, UX-025, UX-027 | Component kit, signal vocabulary, keyboard paths, display modes | VIS-003, VIS-009, VIS-011, SCN-014 |

## 9. Glossary
| Term | Meaning |
|---|---|
| Plant | A simulated machine or process that reacts to the program's outputs and feeds its inputs. 2.0 has four; 2.1 adds scenes. |
| Scene | A saved arrangement of parts that forms a plant. |
| Part | A reusable piece of equipment in a scene: a conveyor, a sensor, a pusher, a tank. |
| Item | An object the plant handles: a box, a pallet, a lid. |
| Signal | A named, typed value a part exchanges with the program. A command goes from the program to the plant; a sensor signal goes from the plant to the program. Factory I/O calls these tags. |
| Plant map | The file that binds each signal to a program input or output. |
| Plant core | The headless simulation: physics, part behaviour, signals and facts, with no drawing. |
| Plant fact | A named statement about what happened in the plant, such as "three boxes delivered". |
| Live model, graded model | The two implementations of each 2.0 plant: one drawn by the live panel, one run by the scenario engine (decision D-19). |
| Scan-exact | Signals are exchanged at every scan boundary, so a run does not depend on host speed. |
| 3D view | The three-dimensional drawing of a running scene. |
| Schematic view | The two-dimensional drawing: hand-made for the four 2.0 plants, generated for scenes. |
| Fault action | A failure a person or a script triggers in a part, such as a stuck sensor. |
| Plant link | The path that carries signals between a plant and a controller. |
| Plant I/O mode | A board state in which bound inputs come from the plant link instead of the pins. |
| Mirroring | In plant I/O mode, letting the board's physical outputs follow the program (decision D-16). |
| Reference scene | One of the 21 scenes 2.1 ships. |
| Reference machine | A named computer on which performance evidence is recorded. |
| Feasibility gate | The throwaway prototype and its eight checks that confirm or overturn decision D-14. |
