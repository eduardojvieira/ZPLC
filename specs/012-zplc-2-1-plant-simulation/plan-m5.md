# ZPLC 2.1 Milestone M5 Implementation Plan: stations, lifts and the warehouse (PROVISIONAL, revision 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Provisional.** M5 builds on M1 to M4 **as merged** on `feat/plant-simulation` at commit `a2c80b32` (`Merge branch 'test/m4-q5' into feat/plant-simulation`, read with `git log` on 2026-11-13; later polish commits may sit on top: that is fine). The gate verdict of decision D-14 is **still pending the owner's macOS and Windows runs** (`research.md` section 11): D-14 is confirmed on Linux x64 only. M5 is the **most physics-heavy milestone after M3**: a lift moves a kinematic belt through a metre of travel under a load, a stacker crane carries a box on a moving fork into a rack and puts it down on rails, and a crate is a compound body that catches dropped items. Tasks that load Jolt or pin a trace hash are marked **PHYS-adjacent** (A1, A2, B1 to B4, K10, S5, F7, F10, F11, F16 and the soak of Q6). If macOS or Windows overturns D-14 those tasks are redone; the pure tasks (A0, V7, U5, D6, C4) are written against `PlantCore`, `PlantSnapshot`, `PartRuntime` and the scenario seam and survive (**KEEP**), exactly as in plans M1 to M4. Task IDs are local to this plan (they repeat letters of plan M4, never the same task).

**Goal:** Deliver milestone M5 of spec 012 (spec section 6.2: "Stations", reference scenes 7, 10, 11 and 16): the catalogue gains the **stackable crate** (Items row), the **lift** (Conveyors row), the **stacker crane with rack** and the **machining centre** (Stations row), and, to close the minimum catalogue (PRT-001), the **limit switch** (Sensors row), the **aligner** and the **chute** (Flow control row); the plant tells the new facts in English and Spanish; and reference scenes **7 (Stacker-crane warehouse)**, **10 (Lift with stacking)**, **11 (Three-level lifts)** and **16 (Balanced production line)** ship with a reference program that passes, a starter that fails, a pinned Linux trace hash and a regenerated scene index, in English and Spanish documentation, in a state that could ship as a 2.1 pre-release. Lessons 17.1 to 17.4 and 18.1 of the draft outline are **not** written here (CRS-001; Task L6 is conditional and may move to M7).

**Architecture:** Nothing in the M1 to M4 architecture changes; M5 adds three physics techniques, parts, and a few pure rules. (1) **Compound bodies** (Task A1): `WorldBodySpec` gains an optional `shapes` list so one dynamic body can be an open box (floor plus four walls), and an optional `tiltDeg` for static ramps (the chute). A body with neither is created exactly as today, so no M1 to M4 trace changes. (2) **Vertical kinematic belts** (Tasks B1, B2): the lift platform and the crane fork are kinematic bodies with a surface velocity (the technique of the chain transfer, `core/parts/chainTransfer.ts:23-137`, and of the turntable) moved along a vertical axis with the M3 axis law `stepAxis` (`core/parts/axis.ts:24`) and posed **every step** (`flow.ts:45`). (3) **Stations are composite parts** (the precedent is the layer palletizer, `core/parts/layerPalletizer.ts:353-416`, family `stations`): the stacker crane builds its own rack of static rails, the machining centre builds its own chamber, doors and integrated belt; the carriage and mast are **views**, not bodies. (4) **Items change identity** only in the machining centre, which removes a blank (`removeTrackedItem`, `items.ts`) and spawns a lid or a base (`spawnItem`) in its own `afterStep`, as the remover (`sources.ts:131-160`) and the emitter already change the set of bodies inside a step; the journal replay (`plantCore.ts`, `exec`) needs no change. (5) Readings and counters stay **facts** or **signals** by the M2 to M4 rules (INT setpoints and REAL/INT sensors cross the exchange with rules R-S1 to R-X3). No firmware, no C, no IPC allow-list and no Electron main-process change is needed.

**Tech Stack:** TypeScript 5.9 (`erasableSyntaxOnly`: no parameter properties), React 19 with the React Compiler lint, Bun 1.3.14 (`bun test`), three 0.187.0 and `jolt-physics` 1.1.1 as in M1 (no new dependency; **Unconfirmed**: that this WebAssembly build exports `StaticCompoundShapeSettings`, `MassProperties` override and `MutableCompoundShapeSettings`; Task A1 Step 1 decides), the Studio UI kit (`IDE/src/ui`).

**Spec:** `spec.md` sections 5 (PLT, VIS, PRT, SCN, CRS) and 6.2, reference scenes 7, 10, 11 and 16 of the SCN table and the catalogue rows Items, Conveyors, Flow control, Sensors and Stations; `plan-m1.md` revision 2 (contracts C1 to C8); `plan-m2.md` (contract C9, rules R-S1 to R-X3); `plan-m3.md` (axis law R-A1 to R-A4, gripper, support tracker, layer palletizer); `plan-m4.md` (kinematic belts, `setBeltAxis`, yaw table, facts grammar, readouts, SCN-001 order test); the run logbook `odd/tasks/zplc-2-1-0-run.md` (entries L1 to L154) in the main checkout; `course-outline.md` rows 17.1 to 17.4 and 18.1. Read the spec sections of your task before you start.

**Created:** 2026-11-13 by a planning agent. Anything marked **Unconfirmed** was not verified while writing; the executor confirms it first and records the answer in the commit body. "Plan choice" marks a decision of this plan that the spec does not state.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`; `COMPILER/` is `packages/zplc-compiler/src/`; `CORE/` is `firmware/lib/zplc_core/`. `bun test`, `bun run lint` and `bunx tsc -b` run with `IDE/` as the working directory unless the step says "at the root". **The typecheck that CI runs is `bun run typecheck` at the root (it includes tests); `bunx tsc -b` excludes them** (run logbook L126), so every verification block below runs both. The pinned formatter is `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` (or `--check`), at the root, after `git add`.

## Roles
| Role | Does |
|---|---|
| Executor | One task each, in its lane. Writes tests first, runs the commands, commits. Never edits a file outside the task's "Allowed edit surfaces". `git add` every new file **before** running the formatter (it only sees tracked files). |
| Parent | Owns git across lanes, merges lanes in dependency order, runs the seam check (`bun test src/plant src/test-engine src/plants src/learn` plus `bun run typecheck`) at each wave merge and the full IDE suite once at the end, adds the four scene ids to `SCENE_ORDER` (`IDE/scripts/generate-scene-index.ts:17-30`; `'stacker-crane-warehouse': 7`, `'lift-stacking': 10`, `'three-level-lifts': 11`, `'balanced-production-line': 16`) **before wave 4**, regenerates `IDE/src/generated/sceneIndex.ts` (`bun run generate:scene-index`) and pins `IDE/src/plant/ci/sceneHashes.json` once per scene merge (so no two scene tasks edit them), updates the SCN-001 order test in `IDE/src/plant/ci/sceneCatalogue.test.ts:17-35` (the ids go between `two-axis-assembly-numeric` and `buffer-release`, after `merge-lines`, and between `three-axis-palletizing` and `colour-separation`, in spec order), adds the scene rows to `docs/docs/plant/scenes.md` and its Spanish twin and the new page to `docs/sidebars.js:164-171` and to `plant/index.md`, runs `format --write` after each merge batch, and launches the independent verifiers named in "Done when". |
| Owner | Records the gate verdict (macOS, Windows), answers the open questions at the end (question 1 selects the route of Tasks A2 and F10; question 2 gates Task B4; question 4 gates Task N10), approves `course-outline.md` (CRS-001; gates Task L6), runs the macOS and Windows hash and evidence runs. |

## Start rule
1. **Precondition A, M4 as merged.** `feat/plant-simulation` at `a2c80b32` or later: `fd -t f . IDE/src/plant/core/parts` lists `chainTransfer.ts turntable.ts diverters.ts sensorsNumeric.ts yawTable.ts` besides the M1 to M3 files; `fd -t d . IDE/plant-scenes -d 1` lists seventeen scenes; `IDE/src/plant/ci/sceneHashes.json` has seventeen Linux entries; `IDE/src/plant/core/hashes.json` has six pins (the four of M1 to M3 and `m4-diverters-v1`, `m4-sorting-v1`). If not, stop: the parent merges first.
2. **Precondition B, the gate.** Not blocking (see the provisional note); the plan proceeds at risk, as M1 to M4 did. If a probe of Task A1 Step 1 fails, the route named in "Open questions" (1) or the fallback written in the task is taken and said in the commit body; that is not a gate failure.
3. **Fresh worktree.** `export TMPDIR=$HOME/.cache/zplc-tmp` (create it with `mkdir -p`), `bun install`, `bun run build:compiler`, `bun run build:runtime`; in `packages/zplc-ide/node_modules/electron` run `node install.js`, and run `bun run electron:compile` in `IDE/`, before any journey (see Global Constraints).
4. **Order.** Wave 1 first. Tasks A2, B1, B2 wait for A1's probe verdicts (the verdicts decide route, not whether the task runs); A2, B1, B2, B3, B4 wait for A0.

## Requirement mapping
Requirements that M5 does not deliver are listed in the last table so nothing is silently dropped.

| Requirement | Task(s) | Note |
|---|---|---|
| PRT-001 (Items row) | A2 | "stackable crate". A crate is an open-top container (floor and four walls, one compound body) that other crates stack on (the walls' rims carry the next floor) and that catches items dropped into it. The row's other entries were delivered in M1 and M4 (`items.ts:178-250`). |
| PRT-001 (Conveyors row) | B1 | "lift". The row's turntable and chain transfer shipped in M4. The part id is `lift`; it is **not** the chain transfer's `lift` signal (Findings 3). |
| PRT-001 (Flow control row) | B4 | "aligner, chute" (the stop blade, pusher and diverter arm shipped in M1 and M4). **Conditional on open question 2.** |
| PRT-001 (Sensors row) | B4 | "limit switch" (the rest shipped in M1 and M4). **Conditional on open question 2.** |
| PRT-001 (Stations row) | B2, B3 | "Stacker crane with rack, layer palletizer, machining centre". The layer palletizer shipped in M3. |
| PRT-002 | all part tasks, D6 | One definition per part; names, configuration, signals, actions, docs from it; the generated reference is compared in CI. |
| PRT-003 | A2, B1 to B4 | "A part's behaviour MUST be tested on the headless core, including its limits (speed, stroke, load)." Limits tested: travel, speed and load of the lift and the crane axes, the fork stroke, the crate's capacity and wall height, the machining cycle time, the aligner gap, the chute angle. |
| PRT-004 | B1, B2 (partly) | "Where a reference scene needs both, a part MUST offer a digital variant (commands and limit sensors) and a numeric variant (setpoint and feedback)." The lift is digital (hold to move, level sensors); the crane takes **INT bay and level setpoints** (an addressed positioning drive: the crane is the numeric variant of itself, as the numeric manipulators are). No scene of M5 needs a second variant of either; the conveyor speed variant stays pending (open question 3, Findings 6). |
| PRT-007 | B1 to B4 | Snap points (the schematic footprint comes from them, `IDE/src/plant/schematic/schematic.ts:25-34`). |
| PRT-008 | A2, B1 to B4 | "Each part SHOULD define the fault actions a diagnosis lesson needs: at least a sensor stuck on or off, an actuator that does not move, and an item jam where the part can jam." Faults in the signal tables. |
| PRT-009 | V7 | Geometry in code; no mesh, no texture. |
| PRT-010 | A2, B1 to B4 | A test adds each part without a change to the scene format version, the link or the lesson code. |
| PLT-006 | A1, A2, B1 to B4, K10, S5, F7, F10, F11, F16 | "The same scene, program and input script MUST produce the same signal trace and the same plant facts on Linux, macOS and Windows and on repeated runs." Per-step arithmetic uses `+ - * /` and the allow-list of the determinism restatement below; rotation comes from `yawEntry` (`core/parts/yawTable.ts`); two core hashes (`m5-lifts-v1`, `m5-station-v1`) and four scene hashes are pinned on Linux; macOS and Windows are the owner's. |
| PLT-007 | A1, A2, B1, B2, B3 | "Items MUST have mass, friction and collision. They are carried, pushed, stacked, lifted, gripped, dropped and blocked by the physics, not by a script." Lifted: a box rides a platform up and down by friction; carried: a box rides a crane fork; stacked: a crate on a crate; dropped: items fall into a crate. The machining centre's swap of a blank for a product is the **one** scripted transformation (it changes what an item is, not where it is) and is documented as such. |
| PLT-008 | A1, A2, B1, B2, Q6 | "An item at rest MUST stay at rest, without drift or jitter, for ten simulated minutes." M5 adds a box at rest on a stopped lift at each level, on a fork, on rack rails, a crate holding five items and a stack of two crates (Q6 soak). |
| PLT-010 | A2, B2, B3, K10, U5 | New facts: `loaded:crate:<index>`, `stored:<Name>`, `cell:<Name>:<c>:<l>`, `blocked:<Name>`, `produced:<Name>`, `misfires:<Name>`, `axis:` for the lift and the crane (table "Facts" below). |
| PLT-011 | A2, B1 to B4 | Fault actions with a `plant.fault.*` label in both languages (U5). |
| PLT-012 | K10, S5 | Capture and restore replay the journal; a capture while a crate rides a lift and while a fork is extended restores to the same exact state (S5). |
| PLT-016 | A1, A2, B1 to B4, K10 | Located messages for an unknown `product`, a `bay` or `level` outside its range, a `levels` outside 2 to 4, a crate that does not fit its scene. |
| PLT-017 | S5 | One implementation: INT `bay` and `level` setpoints and INT/REAL sensors go through `exchangeScan` on both paths. S5 proves live equals graded for a station scene. |
| VIS-003 | V7 | "The view MUST show the state that matters for control ... with a cue other than colour for every state." Lifts and the crane tell their position and motion with a marker and text, the machining centre tells busy by the doors and the text, the crate is drawn open. |
| VIS-008 | U5 | New facts are integer counts, announced on change, silent at 0. Continuous values (a position, a travel fraction) **never** enter the change key. |
| VIS-009 | V7 | The crate and the new parts keep their cues in every display mode; high contrast outlines them. |
| VIS-010 | U5, Q6 | The generic fault control (choose, then act with a button, `OperatePanel.tsx:50-80`) lists the new parts' actions; Q6 walks the keyboard path on scene 11. |
| VIS-011 | U5, D6 | English and Spanish; Studio component kit. |
| SCN-001 to SCN-004 | F7, F10, F11, F16 | Four scenes, original layouts, reference passes, starter fails, in CI. |
| SCN-005 | N10, F7 to F16 | Boolean facts only without N10; exact counts with it (open question 4). |
| SCN-007 | F7, F10, F11, F16 | Each scene declares `shortestPulseMs`. |
| SCN-011 to SCN-013 | S5 | The editor handles INT, REAL and BOOL signals; S5 checks the declaration generator on a crane map. |
| CRS-003 to CRS-006, CRS-008, CRS-011 (M5 scenes) | L6, D6 | Lessons 17.1 to 17.4 and 18.1. **Conditional** on the owner approving `course-outline.md` (CRS-001). 17.1 is the SFC lesson, 17.3 the second SFC lesson (CRS-008 already covered by earlier modules). |

**Not delivered by M5** (later milestones, per spec 6.2, or out of scope): a numeric speed variant of a conveyor and a numeric lift or fork position (PRT-004, open question 3); a second rack on the other side of the crane aisle, a double-deep rack and shuttle vehicles (the crane serves **one rack** on its +z side; Plan choice); crate lids and crate walls that open; a crate that collapses or spills by a fault; a machining centre that cuts geometry (the product replaces the blank by identity, see "R5-M1"); tool wear and part tolerances; contact-force sensing under a lift (the lift carries, it does not weigh); drawing an item's inner stack in the 3D view beyond the physics poses; LNK-007 to LNK-018 (M6); CRS-001, CRS-002, CRS-007 (the rest), CRS-009, CRS-010, CRS-012, CRS-013 (M6 and M7); the learner-facing editor (M7); scenes 1 to 6, 8, 9, 12 to 15 and 17 to 21 (other milestones, done).

## Contract extensions (types and rules; lanes code against these, never against each other)
M5 **extends** contracts C1 to C10 of plans M1 to M4; it changes none of them. Task A0 writes the type changes of `contracts.ts` and `core/support.ts`. Task A1 writes the world additions in `world.ts` (they are code, so A1 owns them). Changing one needs the parent: every lane depends on it.

```ts
// IDE/src/plant/contracts.ts  (Task A0; every other declaration stays as merged in M4)

/** C3 amended: the tag of a body pose gains 'crate' (`contracts.ts:85` today lists 'box' | 'lid' | 'base'). */
export type BodyTag = 'box' | 'lid' | 'base' | 'crate';
export interface BodyPose /* ...existing fields... */ {
  tag?: BodyTag;
}
// IDE/src/plant/core/support.ts (Task A0 changes only the type of `SupportItem.tag`, `support.ts:8`; A2 writes the crate logic)
```

```ts
// IDE/src/plant/core/world.ts  (Task A1; the existing members stay as merged, `world.ts:5-59`)
export interface WorldBodySpec {
  // ...existing fields (id, kind, half, position, rotationYDeg, massKg, friction, motion, layer)...
  /**
   * Compound body: the listed boxes, each with its own half extents and an offset from the body centre in the body frame, replace the single
   * box of `half` (which then only bounds the body for wake boxes and `gapBelow`). A dynamic compound keeps the mass `massKg` (its inertia
   * comes from the shapes). Absent: a single box of `half` exactly as today.
   */
  shapes?: readonly { half: Vec3; offset: Vec3 }[];
  /** Static bodies only: a tilt in degrees about the body's local z axis, applied after the yaw (a ramp). Absent or 0: exactly as today. */
  tiltDeg?: number;
}
```

```ts
// IDE/src/plant/core/parts/items.ts  (Task A2; the existing members stay as merged)
export const CRATE_OUTER: Vec3 = [0.8, 0.25, 0.6];  // x, y, z metres (Plan choice, starting values)
export const CRATE_WALL_M = 0.02;                    // floor and wall thickness
export const CRATE_MASS_KG = 4;
// ItemTag (items.ts) follows BodyTag: 'box' | 'lid' | 'base' | 'crate'. spawnItem gains an optional last parameter
// `shapes?: WorldBodySpec['shapes']`; ItemInfo carries `size` = CRATE_OUTER for a crate.
```

**Rules (fixed here, written once, tested in the task named):**
- **R5-W compound and tilt (A1).** A compound body is created from `shapes` and behaves as one rigid body in capture, restore, sleep and `gapBelow`. A body with no `shapes` and no `tiltDeg` is created by the **same code path and with the same bytes** as today (so every M1 to M4 hash is untouched). `tiltDeg` on a non-static body is refused with a located message.
- **R5-C crate (A2).** A crate is a dynamic compound: a floor `CRATE_WALL_M` thick and four walls `CRATE_WALL_M` thick from the floor to `CRATE_OUTER[1]`, outer size `CRATE_OUTER`, 4 kg, friction `ITEM_FRICTION`, tag `crate`, kind `item`. Its interior is the box inside the walls (`0.76 x 0.23 x 0.56` m above the floor). **Stackable:** a second crate set on top rests on the four wall rims and stays (the test). The `crate` scene part and the emitter kind `crate` spawn it; the emitter's `vary` has no effect on a crate (the part doc says so). The support tracker gains `loaded:crate:<index>`: the number of non-crate, non-pallet items whose centre is inside the interior of crate `<index>` (crates numbered by creation order, 0 first) and whose speed is at most 0.05 m/s, silent at 0 in the text (R5-C2).
- **R5-L lift (B1).** `lift`: a kinematic platform `lengthM` by `widthM` by 0.1 m (top face is the carrying surface) with a belt surface along local +x (`run`, `runReverse` when `allowReverse`, as `conveyors.ts:99-103`), moved along world +y by `stepAxis` with `strokeM = (levels - 1) * levelPitchM`. `up` TRUE jogs up, `down` TRUE jogs down, both or neither hold (the axis decelerates, `axis.ts:24`). The part position is the platform's top face centre at **level 1** (the lowest). `atLevelK` (`K` = 1 to `levels`) is TRUE while the platform top is within 0.01 m of level `K` (level K is `(K - 1) * levelPitchM` above level 1) and the axis speed is at most 0.02 m/s. A `stuck` fault freezes the axis; `stall` stops the surface; `levelStuckOff` makes every `atLevelK` read FALSE. **The plant does not inhibit anything** (Plan choice): a platform that travels while its surface runs may lose its load, and that is a lesson (lesson 18.1), not a defect.
- **R5-S crane (B2).** The crane has four axes on one carriage: **X** along the aisle (local +x), **Y** the mast, **Z** the fork (local +z, centre 0, ranges `-forkStrokeM` to `+forkStrokeM`), and a small **R** (raise) axis of 0.06 m. Setpoints: INT `bay` 0 to `columns` (X target `bay * bayPitchM`) and INT `level` 0 to `levels` (Y target `level * levelPitchM`); each tracks its setpoint with `stepAxis` (goto). `raise` TRUE sends R to 0.06 m (fork top 0.03 m **above** the shelf top of the addressed level), FALSE to 0 (0.03 m **below**). `forkLeft` TRUE extends the fork towards -z, `forkRight` towards +z (hold to extend, else it centres; both hold). The fork surface is a kinematic belt along z: `beltRight` TRUE runs it towards +z, `beltLeft` towards -z, at `beltSpeedMps`; both do nothing. **Level 0 is the dock level:** the dock belts (scene parts) end within 0.03 m of the extended fork tip at the height of the fork top when `raise` is TRUE; levels 1 to `levels` are the rack shelves. The rack is on the **+z** side: for column `c` (1 to `columns`) and level `l` (1 to `levels`) a cell is a pair of static rails along z at `x = c * bayPitchM ± 0.12`, 0.05 m wide, whose tops are at `l * levelPitchM + 0.1` above the part position; a stored box (0.3 m across x, 0.4 m along z) rests on both rails and the fork, 0.16 m wide, passes between them. **Mechanical inhibition (R5-S4):** X and Y stop (the axis is held) while the fork is not centred (`|z| > 0.005`), and each rising edge of a setpoint change that this inhibits adds one to the fact `blocked:<Name>`. Faults: `stuckX`, `stuckY`, `forkStuck`, `loadedStuckOff`, `beltStall`.
- **R5-S2 crane sensors.** `inPosition` is TRUE when X and Y are within 0.005 m of their setpoints and both axis speeds are at most 0.02 m/s; `forkCentre`, `forkAtLeft`, `forkAtRight` within 0.005 m of 0 and of the two ends; `raised` is TRUE at R = 0.06; `loaded` is TRUE while a tracked item's centre is within 0.1 m (x, z) of the fork centre and its bottom is within 0.02 m of the fork top. The crane is `inPosition` at start only if the setpoints are 0 (`bay` 0, `level` 0).
- **R5-S3 rack facts.** `cell:<Name>:<c>:<l>` is TRUE while a tracked item rests (speed at most 0.05 m/s) on the rails of that cell; `stored:<Name>` counts the TRUE cells. Occupancy is read each step from one `bodiesInBox` over the rack joined with `trackedItems` (kinematic bodies are filtered, Findings 5).
- **R5-M machining centre (B3).** A chamber `lengthM` by `widthM` over an **integrated belt** (a static belt along local +x, run by `feed`), two **door plates** (kinematic, one at each end of the chamber, 0.3 m high), and the state `idle`, `busy`, `done`. `ready` is TRUE in `idle` when exactly one **blank** (a tracked item with no `tag` and a `colour`, that is a workpiece of M4) lies at rest (speed at most 0.05 m/s) inside the chamber and nothing else does. A rising edge of `start` while `ready` closes the doors (they rise in 0.4 s) and starts a cycle of `cycleMs` of plant time; during it the integrated belt target is 0 and the doors block the ends. At the end the blank is removed and **one product** (`lid` or `base` per `product`, default masses, tag set, resting on the belt at the chamber centre, rotation of the part) is spawned in its place, the doors lower, the state is `done`, and `done` stays TRUE until the product's centre has left the chamber or the next `start`. A `start` while not `ready` does nothing except add one to `misfires:<Name>` (rising edges only). `produced:<Name>` counts finished cycles. Faults: `doorStuck` (the doors never rise: every `start` is a misfire), `cycleSlow` (the cycle takes twice as long), `readyStuckOff`.
- **R5-M1 the one scripted transformation (B3).** The swap of the blank for the product is a plant-model event, not physics, like the tank's level (PLT-009): the part doc says so, with the cycle time, in both languages. Conservation: the product spawns only if the blank was removed in the same step.
- **R5-F inherited.** Inside the core a numeric or INT signal is an engineering value in its unit; at the exchange it is raw (M2 rules R-S1, R-S2, R-X, R-X1 to R-X3 apply unchanged). `apply` validates type and range **before** the journal (L63): a refused call leaves state and trace hash unchanged.
- **Determinism restatement (M5).** The per-step state update of every M5 part and of the support additions uses `+ - * /`, comparisons, `Math.abs`, `Math.min`, `Math.max`, `Math.round`, `Math.floor`, `Math.fround` and `Math.sqrt` (correctly rounded by IEEE 754). **No `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan2` or `Math.pow` in a step loop.** Rotations of a part about +y come from `yawEntry` (`yawTable.ts`) **at build time and in the step**; build-time geometry (`rotateY`, `yawQuat`, the compound offsets, `tiltDeg`) may use `Math` as in M1 to M4 (Findings 9 of plan M4). Because **no test reads product source text** (VF-006), determinism is proved **by behaviour**: three fresh worlds give one hash, host pacing is varied, and one test stubs `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan2` and `Math.pow` to throw **while the step loop runs** (the libm-stub test of M4 Task A1, L127).

**Part signal tables (names are API for scenes, maps and scenarios; `<Name>` is `ScenePart.name`).** Plan choice throughout; every number is a **starting value** the executor may tune inside the stated range and records in the part doc. Axis conventions as plans M3 and M4: X along the part (local +x, turned by `rotationYDeg`), Y up, Z across; **right is local +z**. A belt-like part's position is the centre of its top surface.

| Part id | Family | Signal | Direction | Type | Range, unit | Config (key: range, default) | Fault actions |
|---|---|---|---|---|---|---|---|
| `crate` | items | none | | | | none (a fixed 0.8 by 0.25 by 0.6 m open box, 4 kg). Its position is the centre of its bottom face | |
| `lift` | conveyors | `up`, `down`, `run`, `runReverse` (when `allowReverse`); `atLevel1` to `atLevelN` | command; sensor | BOOL | | `levels`: 2 to 4, 2; `levelPitchM`: 0.3 to 1.5, 0.6; `lengthM`: 0.8 to 1.6, 1.0; `widthM`: 0.5 to 1.0, 0.7; `speedMps` (belt): 0.1 to 1, 0.5; `travelSpeedMps`: 0.1 to 1, 0.4; `accelMps2`: 0.1 to 3, 0.8; `allowReverse`: boolean, false | `stuck`, `stall`, `levelStuckOff` |
| `stacker-crane` | stations | `bay`, `level`; `inPosition`; `raise`, `raised`; `forkLeft`, `forkRight`, `forkCentre`, `forkAtLeft`, `forkAtRight`; `beltLeft`, `beltRight`; `loaded` | command; sensor | INT (`bay`: 0 to `columns`, unit `bay`; `level`: 0 to `levels`, unit `level`); BOOL | | `columns`: 1 to 8, 4; `levels`: 1 to 4, 3; `bayPitchM`: 0.7 to 1.5, 1.0; `levelPitchM`: 0.4 to 1.0, 0.6; `forkStrokeM`: 0.6 to 1.0, 0.8; `speedXMps`: 0.2 to 1.5, 1.0; `speedYMps`: 0.2 to 1, 0.5; `forkSpeedMps`: 0.1 to 0.8, 0.4; `beltSpeedMps`: 0.1 to 0.8, 0.4; `accelMps2`: 0.5 to 3, 1.5; `maxLoadKg`: 5 to 30, 10 | `stuckX`, `stuckY`, `forkStuck`, `loadedStuckOff`, `beltStall` |
| `machining-centre` | stations | `feed`, `start`; `ready`, `busy`, `done`, `doorClosed` | command; sensor | BOOL | | `product`: `lid` or `base`, `lid`; `cycleMs`: 1000 to 30000, 4000; `lengthM`: 0.8 to 1.4, 1.0; `widthM`: 0.5 to 0.8, 0.6; `speedMps` (integrated belt): 0.2 to 1, 0.5 | `doorStuck`, `cycleSlow`, `readyStuckOff`, `stall` |
| `limit-switch` | sensors | `contact` | sensor | BOOL | | `reachM`: 0.02 to 0.2, 0.05; `heightM`: 0 to 2, 0.1 | `stuckOn`, `stuckOff` |
| `aligner` | flow | `align`; `aligned`, `open` | command; sensor | BOOL | | `widthM`: 0.4 to 1.0, 0.7 (the belt width it spans); `gapM`: 0.2 to 0.6, 0.35 (the clear width when aligned); `lengthM`: 0.2 to 0.8, 0.4 | `stuck` |
| `chute` | flow | none | | | | `lengthM`: 0.4 to 2, 1.0; `widthM`: 0.4 to 1.0, 0.6; `tiltDeg`: 5 to 35, 20 | none |

Additions to existing parts (Task A2, all optional with a default that keeps the M1 to M4 behaviour): **emitter** `kind` gains `crate` (an emitted crate has the default mass). **Fault wording:** `beltStall` and `stall` stop a surface (as the conveyor's `stall`); `forkStuck` freezes Z; `loadedStuckOff` makes `loaded` read FALSE (the item stays on the fork: physical truth versus sensor faults, L101).

**Facts (plan choice; names are API for scenarios, the text equivalent and the trace).**

| Fact | Owner | Meaning |
|---|---|---|
| `loaded:crate:<index>` | the support tracker (A2) | Items resting inside crate `<index>` (R5-C). Integer. Silent at 0 in the text. |
| `stored:<Name>` | `stacker-crane` | Cells with a box at rest. Integer. |
| `cell:<Name>:<c>:<l>` | `stacker-crane` | TRUE while that cell holds a box at rest (a **boolean** fact: filtered from the text, only `stored:` is told). |
| `blocked:<Name>` | `stacker-crane` | Rising edges of a request that the fork inhibits (R5-S4). Integer. |
| `produced:<Name>` | `machining-centre` | Finished cycles. Integer. |
| `misfires:<Name>` | `machining-centre` | `start` edges refused for lack of a ready blank or by `doorStuck`. Integer. |
| `axis:<Name>:y` | `lift`; `axis:<Name>:x|y|z` for `stacker-crane` | Position in metres (continuous: **never** in the change key, `describe.ts:7`). |

The fact grammar of `IDE/src/plant/ci/sceneCheck.ts:29-49` learns `stored`, `produced`, `misfires`, `blocked` (a part-name check), `cell:<Name>:<c>:<l>` (name check, two integers) and `loaded:crate:<index>` in K10. Existing parts publish the facts they published in M4: **a scene of M1 to M4 reads the same facts, in the same key order.**

**View state keys (so V-lane tasks code against fixed names).** The view `part` field (the **view kinds**) is always the part's own id and **must match exactly what the view, the cues and the panel switch on** (M1 shipped `'curve'` and `'blade'` cases that never matched, L91, L95): `'crate'`, `'lift'`, `'stacker-crane'` (the carriage, its pose is the fork carriage), `'stacker-mast'` and `'stacker-rack'` (secondary views of the crane, drawn by the default box shape, as M3's `'layer-plate'`), `'machining-centre'`, `'machining-door'` (secondary), `'limit-switch'`, `'aligner'`, `'chute'`. `lift` state `{ fraction (height over strokeM), text ('level 2' or 'travelling'), level (the nearest level number), speedMps }`; `stacker-crane` state `{ fraction (the fork extension over forkStrokeM, signed), text ('bay 2, level 1, fork centre'), bay, level, raised }`; `machining-centre` state `{ fraction (cycle progress), text ('idle', 'busy 2.5 s', 'done'), busy, product }`. A fault never changes a **physical** view (a scale stuck at 0 still draws the item): `levelStuckOff` leaves the lift drawn where it is.

## Lanes and dependency graph
**KEEP** = survives any gate outcome. **PHYS-adjacent** = loads Jolt through `createPlantCore` or `createWorld`, or pins a trace hash, so it is re-run if D-14 is overturned.

| Lane | Task | Title | Kind | Depends on | Lane-owned surface (summary) |
|---|---|---|---|---|---|
| A | A0 | Contract extensions: the crate tag | KEEP | M4 | `IDE/src/plant/contracts.ts`, `IDE/src/plant/core/support.ts` (type line only) |
| A | A1 | World: compound bodies, tilt, and the four probes | PHYS-adjacent | M4 | `IDE/src/plant/core/world.ts`, `world.stations.test.ts` |
| A | A2 | Crate item, emitter kind, loaded-in-crate fact | PHYS-adjacent | A0, A1 | `IDE/src/plant/core/parts/{items,sources}.ts`, `IDE/src/plant/core/support.ts` |
| A | N10 | Numeric and ranged conditions on plant facts (**conditional on open question 4**; plan M2 Task N10, still unmerged) | KEEP | owner answer | `IDE/src/test-engine/index.ts` |
| B | B1 | Lift | PHYS-adjacent | A0, A1 | `IDE/src/plant/core/parts/lift.ts` |
| B | B2 | Stacker crane with rack | PHYS-adjacent | A0, A1 | `IDE/src/plant/core/parts/stackerCrane.ts` |
| B | B3 | Machining centre | PHYS-adjacent | A0 | `IDE/src/plant/core/parts/machining.ts` |
| B | B4 | Catalogue completion: limit switch, aligner, chute (**conditional on open question 2**) | PHYS-adjacent | A0, A1 | `IDE/src/plant/core/parts/completion.ts` |
| V | V7 | View: crate, lift, crane and rack, machining centre, completion parts | KEEP | A0 (contract only) | `IDE/src/plant/view/{geometry,cues,renderer}.ts` |
| U | U5 | Readouts, fact sentences, fault labels, strings | KEEP | A0 (contract only) | `IDE/src/plant/ui/{OperatePanel,NumericControls}.tsx`, `IDE/src/plant/text/describe.ts`, `IDE/src/i18n/catalog/plantView.ts` |
| C | K10 | Core integration: register parts, `addItem` crate, grammar, pinned hashes | PHYS-adjacent | A2, B1 to B4 | `IDE/src/plant/core/plantCore.ts`, `IDE/src/plant/core/hashes.json`, `IDE/src/plant/ci/sceneCheck.ts` |
| D | D6 | Docs EN/ES: stations page, parts reference, scenes | KEEP | B1 to B4, A2 | `docs/docs/plant/stations.md`, Spanish twin, `tools/docs/plant-parts-reference.ts` |
| S | S5 | Live equals graded for a station scene; capture mid-lift and mid-fork | PHYS-adjacent | K10 | `IDE/src/plant/ci/liveVersusGradedStations.test.ts`, `IDE/src/plant/ci/fixtureStations/*` |
| F | F11 | Scene 11, Three-level lifts | PHYS-adjacent (hash) | K10, U5 | `IDE/plant-scenes/three-level-lifts/*` |
| F | F10 | Scene 10, Lift with stacking | PHYS-adjacent (hash) | K10, U5 | `IDE/plant-scenes/lift-stacking/*` |
| F | F16 | Scene 16, Balanced production line | PHYS-adjacent (hash) | K10, U5 | `IDE/plant-scenes/balanced-production-line/*` |
| F | F7 | Scene 7, Stacker-crane warehouse | PHYS-adjacent (hash) | K10, U5, S5 | `IDE/plant-scenes/stacker-crane-warehouse/*` |
| L | L6 | Lessons 17.1 to 17.4 and 18.1 (**conditional on the course-outline approval; may move to M7**) | KEEP | F7, F10, F11, F16 | `IDE/lessons/plant-*` (five) |
| Q | Q6 | Journeys: fault and e-stop by keyboard on scene 11, crane readout; rest soak | PHYS-adjacent (soak) | U5, F11, F7 | `IDE/scripts/journeys/plantStations.ts`, `IDE/scripts/journeys.ts`, `IDE/src/plant/core/parts/stationSoak.test.ts` |
| Q | C4 | Requirement coverage and indexes for the M5 requirements | KEEP | all | `tools/ci/requirement-*`, generated indexes |

**Graph.**
```
A0 -+-> A2 (needs A1) ------------+
A1 -+-> B1, B2, B4 (need A0, A1)   +-> K10 -+-> F11 / F10 / F16 (parallel) -> F7 -> L6 (conditional)
A0 -> B3 ---------------------------+        +-> S5 -> F7
A0 -> V7 ; A0 -> U5                           +-> Q6 (also U5, F11, F7)
N10 -> (tightens F7 to F16, M3 scenes 13 and 15, M4 scenes 17 to 21) ; K10, B1 to B4, A2 -> D6 ; all -> C4
```
**Parallel waves** (tasks of a wave have disjoint file surfaces and may run together; the parent merges at the end of each wave and runs the seam check):
1. **A0, A1**, and **N10** (only after the owner answers question 4). A0 is a one-line contract task: merge it first. A1's probe verdicts are written in its commit body and in the logbook before wave 2 starts.
2. **A2, B1, B2, B3, B4, V7, U5.** A2, B1, B2, B4 need A1's verdicts and the contract; B3, V7, U5 need only A0. B4 only if question 2 is answered yes (default yes).
3. **K10, D6.**
4. **S5, F11, F10, F16.** (F-tasks never edit the scene index or the hash file: the parent does. They need K10 merged; U5 for the operate panel and fact text only.)
5. **F7** (after S5: its map carries INT setpoints and S5 proves the INT path live equals graded), **Q6**, **L6** (only after the outline approval).
6. **C4.**

Shared files and who edits them: `world.ts` only A1; `plantCore.ts` and `sceneCheck.ts` only K10; `items.ts`, `sources.ts` and `support.ts` only A2 (A0 changes one type line of `support.ts` and merges first); `contracts.ts` only A0; `geometry.ts`, `cues.ts`, `renderer.ts` only V7; `describe.ts`, the `plantView.ts` catalogue, `OperatePanel.tsx`, `NumericControls.tsx` only U5; `test-engine/index.ts` only N10; `tools/docs/plant-parts-reference.ts` only D6; `docs/sidebars.js`, `docs/docs/plant/scenes.md` (and its Spanish twin), `docs/docs/plant/index.md` (and its twin), `IDE/scripts/generate-scene-index.ts`, `IDE/src/generated/sceneIndex.ts`, `sceneHashes.json` and the SCN-001 order test only the parent.

## Global Constraints
- **Integration lessons of M1 to M4 (run logbook L9 to L154), now rules.**
  - **`git add` new files before the formatter.** `tools/ci/format.ts` sees only git-tracked files (L9). Run `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` then `--check` at the root, after `git add`.
  - **Text through `t()`.** No literal user-facing string in a component or a part. English is the catalogue in `as const`; Spanish uses the **neutral usted register** and the standard terms (`falla` for fault, `ciclo` for scan cycle, `tarima` for pallet, `cajón` for crate, `elevador` for lift, `transelevador` for stacker crane, `centro de mecanizado` for machining centre); the product is named **"ZPLC"**, never "Studio" in a sentence that is not about the application shell (a `tools/ci` product-name test failed in M1, L11); new interface text says "Plant", never "Lab" (decision D-25 of spec 013). Part names and docs live in the part definition (`names`, `doc`, `equations`), both languages, PRT-002.
  - **Fault labels live under `plant.fault.*`** (L129): `plant.action.*` collided with the 2.0 lab catalogue (`stall`, `jam`). Catalogue keys must not collide across catalogue modules: the guard is `IDE/src/i18n/catalogKeys.test.ts`.
  - **Lines at most 140 columns**; the `tools/ci` line-length test fails on longer code (L11).
  - **Tests that import `useIDEStore`** call `stubProjectLoader()` first and then use dynamic imports (L26, L27). Tests that touch the native runtime use **`itNative`** (VF-023, L28).
  - **`erasableSyntaxOnly`**: no parameter properties, no enums, no namespaces. **React Compiler lint**: no mutation of props or state in render, no ref reads during render, components select the store fields they show (`bun run lint` in `IDE/` fails on warnings).
  - **Tests are behavioural** (VF-006): no test reads product source text. Test names carry the requirement ID first; every test asserts every observable effect of its rule and goes through the public interface (`createPlantCore`, `parseScene`, the scene check).
  - **A fresh worktree needs** `bun install`, `bun run build:compiler`, `bun run build:runtime` before the native-runtime tests and the journeys; **`node install.js` in `packages/zplc-ide/node_modules/electron` and `bun run electron:compile`** before any journey (L75).
  - **Journeys** run under `xvfb-run` with `ZPLC_NATIVE_SIM_BIN` exported **in the same command**, pointing at the worktree's own runtime binary (`<worktree>/firmware/lib/zplc_core/build/zplc_runtime`; **Unconfirmed**, confirm with `ls`) and a **free `ZPLC_ELECTRON_SMOKE_PORT`**: a journey that finds the main checkout's stale binary fails with "Request denied" (L16, L24). `bun run smoke:journeys` in `IDE/`. **Monaco traps Tab** (L73): a keyboard walk that crosses the code editor presses **Ctrl+M** first.
  - **`/tmp` may be out of inodes** (L59): `export TMPDIR=$HOME/.cache/zplc-tmp` before anything that creates temporary directories.
  - **Scene index and pinned hashes are parent-owned** (L65, L67, L140): a scene writer restores `IDE/src/generated/sceneIndex.ts` and `IDE/src/plant/ci/sceneHashes.json` (`git checkout --`) before committing; the parent adds the id to `SCENE_ORDER` **with the scene number** (a missing entry made `belt-to-belt-transfer` the default scene, L114), regenerates, pins, and updates the SCN-001 order test.
  - **A scenario has at most 10,000 samples** (`test-engine/index.ts:18`): at `tickMs` 10 that is 100 s of virtual time. A scene that cannot finish in that time is tuned (speeds within their config ranges, fewer items) or reported; the limit is not raised (L147).
  - **The scene JSON schema rejects unknown top-level keys** (`sceneSchema.ts:29`): tuned gains, positions and timings of a scene live in the reference program and the commit body, never in new scene keys.
  - **`apply` validates type and range before the journal** (L63). A part never relies on a later check.
  - **A line is a finding, not a threshold:** do not change a threshold or a test to make a check pass; report it (L126, L129).
- **describePlant (M3 and M4 lessons L76, L119 to L124, L134).** Every fact a part publishes needs an English and Spanish sentence **or** a filter in `describe.ts`; raw keys never reach the text. Counts are **silent at 0**; plurals use the catalogue's `.one` and `.other` keys read with `tn()`, never "time(s)". **Continuous facts stay out of the announcement change key** (`describe.ts:7`, `CONTINUOUS`): `axis:` already is; a lift or crane position is **never** in `snapshot.facts` as a number the key reads. U5 adds a table of every M5 fact and how it is told, with a test per row.
- **View kinds must match exactly** (L91, L95): every M5 view test is built from a **real `createPlantCore` snapshot** of a scene that contains the part, never from a hand-typed view name, and asserts the shape, the cue and the readout of each new view kind (V7 writes the pure tests, K10 the real-snapshot tests, as K9 did).
- **A select never acts on change** (L118, WCAG 3.2.2): any M5 control that picks a value follows "choose, then act with a button" (`OperatePanel.tsx:50-80`); there is no new select in M5. Q6 walks the keyboard path.
- **Determinism.** No `Date`, `Math.random`, `performance.now` or unordered iteration in `IDE/src/plant/core/**`; the per-step math is the "Determinism restatement" above. Every collection that feeds an order (cells, stored items, crate contents, doors) is in creation or index order. The scene check and the live session both use seed 1 (`sceneCheck.ts:102`, `usePlantSession.ts:218`); M5 uses **no random emission**: emitters are scripted or timed (`vary` stays `none`), so no seed sequence is recorded.
- **Items are read through `trackedItems`.** `bodiesInBox` also lists kinematic bodies (the fork, the platform, the doors, the pads of M3, the plates of M4); a sensor, a cell and a chamber keep only ids that `trackedItems(world)` has (L92, Findings 5).
- **Scene tuning is measured, not assumed** (L110, L113, L119, L143 to L149): run the grade three times and once with each moving speed (belt, lift `travelSpeedMps`, crane `speedXMps` and `speedYMps`, fork speed) at **0.9 and 1.1 of the tuned value**; the tuned values live in the reference program and the commit body. A station that works while an item arrives is the scene's design problem (a blade, a timer, the emitter interval), not luck.
- **Placed or measured items need rest** (L110): a box counts as stored only at speed at most 0.05 m/s; a blank is `ready` only at rest; scenes keep a belt that feeds a chamber stopped while the door closes.
- **Security posture and dependencies.** Unchanged: sandboxed renderer, content security policy as is, no remote asset, **no new dependency** (`AGENTS.md` guideline 6). M5 touches no file under `IDE/electron/` and no C.
- **No physical operations.** Nothing here flashes, deploys, opens a serial port, forces I/O on a board or starts plant I/O mode (`AGENTS.md` guideline 7, LNK-009). The only "force" is the simulated runtime's force-aware write, exercised headless.
- **Docs.** Every new part, option, message and page ships in English (`docs/docs/`) and Spanish (`docs/i18n/es/docusaurus-plugin-content-docs/current/`) in the same commit series, and claims only measured facts (CRS-013). No frame-rate, latency, hardware or cross-platform claim ("pinned on Linux; macOS and Windows not yet measured").
- **Commits.** Conventional Commits, **no AI attribution and no Co-Authored-By line**, work-unit commits with tests and docs alongside the behaviour. About 400 changed lines per task is a heuristic, not a cap (A1, B2, B3, K10 may exceed it; say why in the commit body). Pushing, merging and opening a pull request are the owner's.
- **Shell.** `bat`, `rg`, `fd`, `eza`; not `cat`, `grep`, `find`, `ls`. No CodeGraph or prowl on this branch (stale index).
- **Structural rules.** Modules at most 1600 lines (`tools/ci/ide-structure.ts`), no import cycle, no whole-store subscription; UI uses the Studio kit (`IDE/src/ui`, UX-002).
- **Plant suite time.** `src/plant/ci` runs every shipped scene's check once (a full plant suite took 612 s with 17 scenes, L149): scene writers run `bun test src/plant/ci/sceneCheck.test.ts` only, the parent runs the whole of `src/plant/ci` once per wave.

## Review Focus (conditions the spec implies; each has a test in the task that owns it)
1. A scene of M1 to M4 keeps its facts, its fact key order and its pinned hash: no new body, no new fact and no changed byte reaches a scene that does not use an M5 part (A1, A2, K10).
2. A vertical kinematic belt carries a loaded box (2 and 5 kg) up and down at the catalogue speeds without a jump, slip or loss, and a stopped platform leaves the box at rest; a fork that extends, lowers and retracts leaves a box on the rails and takes it back (B1, B2).
3. A crate catches dropped items and keeps them, stacks on a crate, rides a lift and a belt, and is the **same** compound after capture and restore (A1, A2, S5).
4. A crane never moves X or Y with the fork out; the request is counted; a rack cell reads TRUE only for a box at rest on its rails (B2).
5. The machining centre never creates mass: a blank is removed in the same step the product appears; a start without a ready blank changes nothing but `misfires` (B3).
6. Repeatability: the same scene, program and script give the same trace hash on repeated runs and with host pacing varied; the libm-stub test passes during stepping (A1, B1 to B4, K10, S5).
7. `describePlant` does not announce a position, a fraction or a cell boolean: over a whole warehouse run the change key changes only on item counts, integer facts and active signals (U5).
8. Every view kind of M5 is matched by the view, the cues and the panel, proved from a real snapshot (V7, U5, K10).
9. Live equals graded for INT setpoints and BOOL sensors of a station (S5).
10. The 2.0 plants and lessons are untouched: `bun test src/plants src/test-engine src/learn` passes unchanged at every merge (PLT-013).
11. Each scene grades the plant doing the work: the starter fails, and a program that writes outputs without the plant doing the work cannot pass (a fact is asserted in every scenario) (F7, F10, F11, F16).

---

### Task A0: Contract extensions: the crate tag
**Spec:** PRT-001 (Items row), PRT-002. **Lane A. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/contracts.ts
IDE/src/plant/contracts.m5.test.ts
IDE/src/plant/core/support.ts
```
**Interfaces:** the `BodyTag` declaration of "Contract extensions". `BodyPose['tag']` (`contracts.ts:85`) becomes `BodyTag`; `SupportItem['tag']` (`support.ts:8`) becomes the same type (a type-only change: the logic stays as merged). `ItemTag` in `items.ts` is `NonNullable<BodyPose['tag']>` already, so it follows without an edit.
- [ ] **Step 1: Failing tests** (`contracts.m5.test.ts`): `'PRT-001 a body pose may carry the crate tag'` (a `satisfies BodyPose` list and a runtime object); `'PRT-001 box, lid and base tags and a pose with no tag still type-check'`; `'PRT-010 the scene schema version is still 1'` (`SCENE_SCHEMA_VERSION`).
- [ ] **Step 2: Run** `bun test src/plant/contracts.m5.test.ts` (FAIL on the type check: run `bun run typecheck` at the root, the test is RED there, L127).
- [ ] **Step 3: Implement** the types. **Step 4: Run** the test, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`, `bun test src/plant src/plants src/test-engine` unchanged.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/contracts.ts packages/zplc-ide/src/plant/contracts.m5.test.ts packages/zplc-ide/src/plant/core/support.ts
git commit -m "feat(plant): crate tag on the body pose contract"
```
**Risk:** item 3 (the contract every M5 lane consumes; one union member is added, nothing is removed). KEEP.

---

### Task A1: World: compound bodies, tilt, and the four probes
**Spec:** PLT-007, PLT-006, PLT-012, PLT-008. **Lane A. Wave 1. PHYS-adjacent.** Independent verifier required (Review Focus 1, 2, 3, 6); it runs together with the B1, B2 verifier.

**Allowed edit surfaces**
```
IDE/src/plant/core/world.ts
IDE/src/plant/core/world.stations.test.ts
```
(A new test file so `world.test.ts`, `world.grip.test.ts` and `world.divert.test.ts` stay as they are.)

**Interfaces:** the `WorldBodySpec` additions of "Contract extensions" and rule R5-W. Existing code: `addBody` (`world.ts:194`), `addBelt` and the kinematic wake box (M4 Task A2), `capture` and `restore` (PLT-012; `restore` needs the same set of bodies created in the same order), `gapBelow` and `bodiesInBox`. **Unconfirmed:** that `jolt-physics` 1.1.1 exports `StaticCompoundShapeSettings` (and `Add(shape, position, rotation)`), that a compound dynamic body accepts a `MassPropertiesOverride` (so `massKg` is the mass), that `SaveState` and `RestoreState` cover a compound body byte-exactly, that a static body can be given a tilted quaternion, and that **kinematic bodies do not collide with static bodies** in this world's object-layer filter (Findings 4). Step 1 decides each.
- [ ] **Step 1: Probes (decide the routes of open questions 1 and the B tasks; not committed as tests, recorded as verdicts in the commit body).** In a scratch test:
  - **P1 compound crate.** A compound open box (0.8 by 0.25 by 0.6 m, 0.02 m walls) on a floor: five 0.2 by 0.2 by 0.1 m, 0.5 kg workpieces dropped one every 1.5 s onto the centre line from 0.15 m above the rim all come to rest **inside** within 10 s with no body leaving the interior, none sunk into the floor, speeds under 0.05 m/s; a second crate set on the rims of the first stays 60 simulated seconds with drift under 1 mm; `capture()` mid-drop restores on a fresh world that repeats the same steps (exact bytes); three fresh worlds give one SHA-256 of the pose sequence. **If the items pile into a tower that topples out, say so with the drop-spread that fixes it (the lift indexing the crate between drops) and continue; if the compound cannot be created or restored, stop and report: Task A2 takes the tray fallback of open question 1.**
  - **P2 vertical carry.** A kinematic belt platform with a resting 2 kg box and with a 5 kg box, moved 1.2 m up at `travelSpeedMps` 0.4, accel 0.8, held, and back down: the box bottom follows the platform within 2 mm during every phase, the box is at rest within 5 mm of its start position on the platform after each stop, a box **asleep** on the platform before the first move is carried; the same at the maximum speed 1.0 m/s and accel 3 m/s2.
  - **P3 fork and rails.** A kinematic 0.16 m wide plate carrying a 0.3 by 0.4 by 0.3 m, 5 kg box moves 1.0 m along x at 1.0 m/s with accel 1.5 (then 3), extends 0.8 m along z into a pair of static rails (0.05 m wide, 0.24 m apart), lowers 0.06 m: the box stays on the plate until the rails take it, ends at rest on the rails, and the plate retracts empty; the reverse (plate below, lifts 0.06 m, retracts) takes the box with it.
  - **P4 tilt and layer filter.** A static ramp tilted 20 degrees at friction 0.2: a box slides down and stops on a belt below; a **kinematic** plate poses through a **static** rail without being blocked (the verdict of Findings 4: if they do collide, the part tasks' inhibition rule R5-S4 stays and the findings are updated).
- [ ] **Step 2: Failing tests** (`world.stations.test.ts`, all on a real world, `loadJolt()` as the other world tests):
  1. `'PLT-007 a compound body is one rigid body: a box dropped into a compound crate stays in it'` and `'PLT-007 a crate set on a crate rests on its rims'` (P1 as tests, 60 s).
  2. `'PLT-012 capture of a compound body mid-fall restores to the same exact state'`; `'PLT-006 the pose sequence of a compound run is identical on three fresh worlds'` (hash).
  3. `'PLT-007 a kinematic belt carries a box 1.2 m up and back down without slip'` (P2, both loads); `'PLT-008 the box at rest on a stopped platform stays at rest for 60 simulated seconds with drift under 0.001 m'`.
  4. `'PLT-007 a kinematic fork moving along x carries a box and puts it on rails by lowering'` (P3).
  5. `'PLT-007 a tilted static ramp slides a box'` (P4); `'PLT-016 tiltDeg on a dynamic body is refused with a located message'`.
  6. Previous behaviour: `'PLT-006 a body with no shapes and no tilt is created exactly as before'` (the existing `world.test.ts`, `world.grip.test.ts`, `world.divert.test.ts` cases stay green) and `'PLT-006 hashes.json is unchanged after bun test src/plant'` (the six pins: `m1-palletStack-v1`, `m2-tankLoop-v1`, `m3-gripCycle-v1`, `m3-gantryNumeric-v1`, `m4-diverters-v1`, `m4-sorting-v1`).
- [ ] **Step 3: Run.** `bun test src/plant/core/world.stations.test.ts`. Expected: FAIL. **Step 4: Implement**, then `bun test src/plant/core` (every M1 to M4 core test, hashes included), `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/world.ts packages/zplc-ide/src/plant/core/world.stations.test.ts
git commit -m "feat(plant): compound bodies and tilted ramps in the physics world"
```
The commit body carries the four verdicts (P1 to P4, usable yes or no, and why) and the measured numbers.

**Risk:** item 4 (`addBody` runs for every body of every scene: a change to its path changes traces), item 3 (`PhysicsWorld` is consumed by every part). PHYS-adjacent. The six core pins and the seventeen scene hashes are the guard. May exceed 400 lines.

---

### Task A2: Crate item, emitter kind, loaded-in-crate fact
**Spec:** PRT-001 (Items row: "stackable crate"), PRT-002, PRT-003, PRT-010, PLT-007, PLT-010, PLT-006. **Lane A. Wave 2 (after A0, A1). PHYS-adjacent.** Independent verifier required (Review Focus 1, 3); it folds into the K10 verifier.

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/items.ts
IDE/src/plant/core/parts/sources.ts
IDE/src/plant/core/support.ts
IDE/src/plant/core/parts/crate.test.ts
IDE/src/plant/core/support.crate.test.ts
```
**Interfaces:** `crate` part of "Part signal tables" and rule R5-C. `itemRuntime` (`items.ts:119`) gains the part id `'crate'`; `itemParts` (`items.ts:178`) gains the definition (family `items`, names `Crate` and `Cajón`, doc EN and ES, config `{}`); `spawnItem` (`items.ts:57-78`) takes `shapes?` as a new last parameter and passes it to `world.addBody`; the registered `ItemInfo` carries `tag: 'crate'` and `size: CRATE_OUTER`. `sources.ts`: `emitterConfig` (`sources.ts:27`) `kind` gains `crate`; `emit` spawns a crate at the emitter position. `support.ts`: `createSupportTracker` (`support.ts:56`) computes `loaded:crate:<index>` from the same `SupportItem` list it already gets (poses, sizes, tags; geometric, never a physics query, as the pallet facts), with a `ponytail:` comment on the axis-aligned interior (the yaw of a crate is ignored, exact for crates squared to the axes). The new fact keys come **after** the existing ones so key order of existing facts is unchanged (a scene with no crate publishes no `loaded:` key). **If P1 of Task A1 failed (open question 1, fallback):** the crate is a tray (a plain box 0.8 by 0.05 by 0.6, the same API and tag) and the facts count items on top; the commit body says so.
- [ ] **Step 1: Failing tests:**
  1. `crate.test.ts` (real catalogue and `createPlantCore`, scenes built with `parseScene`): `'PRT-001 the catalogue has a crate with English and Spanish names and documentation'`; `'PRT-001 an initial crate spawns with the right size, mass and tag in trackedItems and in the snapshot pose'`; `'PLT-007 five workpieces dropped into a crate stay inside it and the fact loaded:crate:0 reads 5'`; `'PLT-007 a crate set on a crate stays stacked for 60 simulated seconds'`; `'PLT-007 a crate rides a belt and a lift platform'` (the lift part is not registered yet: use a kinematic belt body through the core's `belt` part instead); `'PRT-001 an emitter of crates emits one at its interval and counts it'`; `'PRT-010 adding the crate changes no scene schema version'`.
  2. `support.crate.test.ts` (pure, `createSupportTracker`): `'PLT-010 loaded:crate counts items inside a crate and not items beside it or on its rim'`; `'PLT-010 loaded:crate is absent when the scene has no crate'`; `'PLT-010 a moving item inside a crate is not counted until it rests'`; previous behaviour: `'PLT-010 itemsAssembled, stacked:pallet and layers:pallet are unchanged by the crate additions'` (the M3 support tests stay green).
  3. Previous behaviour (Review Focus 1): `'PRT-001 the emitter still emits boxes, pallets, lids, bases and workpieces exactly as before'`; `'PLT-006 every shipped scene keeps its pinned hash'` (the scene check over `SCENE_INDEX`, **one** pass: see "Plant suite time") and the key list of the facts of two M4 scenes is unchanged.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/crate.test.ts src/plant/core/support.crate.test.ts src/plant/core/support.test.ts` (FAIL, then pass), `bun test src/plant/core`, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/items.ts packages/zplc-ide/src/plant/core/parts/sources.ts packages/zplc-ide/src/plant/core/support.ts packages/zplc-ide/src/plant/core/parts/crate.test.ts packages/zplc-ide/src/plant/core/support.crate.test.ts
git commit -m "feat(plant): stackable crate, crate emitter and the loaded-in-crate fact"
```
**Risk:** item 3 (`ItemInfo`, `spawnItem`, the emitter and the support tracker are shared by every scene: the change is additive and the M1 to M4 hashes and fact key lists are the guard), item 6 (a crate that jitters at rest is caught only by the soak test above). PHYS-adjacent (new bodies).

---

### Task N10: Numeric and ranged conditions on plant facts (CONDITIONAL on open question 4)
**Owner, 2026-11-23: yes.** Exact value only for an integer fact, an inclusive `{ min, max }` range for a real fact (spec 012 SCN-005). The validators of spec 013 Task T1 (the failure detail of a failed assertion, `checks[].expected`) must accept a numeric expected value and a `{ min, max }` range.
**Spec:** SCN-005, CRS-005. **Lane A. Wave 1. KEEP. Do not start until the owner answers question 4.** Persisted-format change: high risk, independent verifier required.

This is **Task N10 of `plan-m2.md` carried forward unchanged** (as plans M3 and M4 carried it): it was never started, and `fd -t f . IDE/src/test-engine` shows no `sceneCompare.test.ts` (read on 2026-11-13). If it was already merged when M5 starts, skip this task and tighten scenes 7, 10, 11 and 16 (and the M3 and M4 scenes, in follow-up commits) with it. The allowed surfaces, steps, tests and commit message are those of plan M4's Task N10:

**Allowed edit surfaces**
```
IDE/src/test-engine/index.ts
IDE/src/test-engine/sceneCompare.test.ts
```
Recommended default: in a condition, a `fact:` read may carry, instead of a boolean, a number (exact equality) or `{ "min"?: n, "max"?: n }` (inclusive); booleans and every non-fact signal stay exactly as today. A scenario with no numeric condition compiles, hashes and runs **byte-identically**.
- [ ] **Steps:** failing tests `'SCN-005 a fact condition may be an exact number or a min and max'`, `'SCN-005 a scenario with only boolean conditions compiles to the same object as before'`, `'PLT-013 every 2.0 scenario hash is unchanged'`, `'SCN-005 a numeric condition on a program signal is refused with a located message'`, `'SCN-005 a stored count of 3 on a rack passes at 3 and fails at 2'` (stub fact); implement; `bun test src/test-engine src/plant/ci src/learn`, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`. **Commit:** `feat(test-engine): numeric and ranged conditions on plant facts`.
**Risk:** item 1 (a persisted scenario format), item 3 (consumed by 68 lessons' hashes). Independent verifier: all 2.0 scenario hashes are the guard.

---

### Task B1: Lift
**Spec:** PRT-001 (Conveyors row: "lift"), PRT-003, PRT-004 (digital variant), PRT-007, PRT-008, PLT-007, PLT-008, PLT-011. **Lane B. Wave 2 (after A0, A1's P2 verdict). PHYS-adjacent.** Independent verifier required (Review Focus 2).

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/lift.ts
IDE/src/plant/core/parts/lift.test.ts
```
**Interfaces:** produces `export const liftParts: readonly RuntimePartDefinition[]` (`lift`, family `conveyors`, **not registered here**: K10 registers it). Rule R5-L and the signal table. Model it on the chain transfer (`chainTransfer.ts:23-137`): one kinematic body (`lengthM` by 0.1 by `widthM`, `layer: 'static'`, `motion: 'kinematic'`) with `world.addBelt` along the yaw axis from `yawEntry(part.rotationYDeg)` (`[cos, 0, -sin]` as `chainTransfer.ts:23-40`), its centre y = `part.position[1] - 0.05 + p` where `p` is the axis position from `stepAxis` (`axis.ts:24`, `dtS` 0.005, `stuck` per fault), posed **every step** by `world.setKinematicPose` (`flow.ts:45`). Commands as `conveyors.ts:99-103` for `run`/`runReverse`; `up` and `down` as jog (`{ mode: 'jog', dir }`, both TRUE or neither TRUE is `dir: 0`). `atLevelK` is the pure function of `p` in R5-L. View kind `'lift'` (pose is the platform), state per "View state keys". Snap points: `in` and `out` as `straightSnap` (`conveyors.ts:178-184`) accepting the belt family (`ACCEPTS`, `conveyors.ts:9`), at **every level** (names `in1`..`inN`, `out1`..`outN`, positions at the level heights): the schematic then shows the lift as a footprint with its landings. Facts: `axis:<Name>:y` (the position, metres, continuous). `jam` is not an action of the lift (Plan choice: a platform that travels blocked is the scene's design problem). Docs EN and ES: every setting, signal, fault, the level convention, "right is +z", the difference from the chain transfer's `lift` signal, and the known limit "a platform that travels with its surface running may lose its load".
- [ ] **Step 1: Failing tests** (real `createPlantCore` scenes built with `parseScene`, belts and boxes of the catalogue): `'PRT-003 the platform travels between levels at travelSpeedMps and atLevelK reports each level within 0.01 m'`; `'PRT-003 up with down holds, the platform never leaves its stroke and stops at the ends'`; `'PLT-007 a box rides the platform up one level and is carried off at the top by run'`; `'PLT-007 a box carried down two levels arrives at rest'` (2 and 5 kg, default and maximum speeds); `'PLT-008 a box at rest on the stopped platform at each level stays at rest for 60 simulated seconds without drift above 0.001 m'`; `'PRT-008 stuck freezes the axis, stall stops the surface, levelStuckOff makes every atLevelK read FALSE while the view still shows the real position, an unknown action throws a located message'`; `'PRT-003 settings outside their limits are refused with a located message'` (located at `parts[n].config.levels`); `'PRT-002 names and documentation in both languages'`; `'PRT-010 no scene schema version change'`; `'PRT-007 the snap points are in and out at every level'`; `'PLT-006 the lift calls no libm function while stepping and the pose sequence is identical on three runs'` (the libm-stub test, behavioural); `'PLT-012 a capture mid-travel with a box on the platform restores to the same exact state'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/lift.test.ts` (FAIL), implement, `bun test src/plant/core`, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`. If A1's P2 failed, stop and report: the parent revises this task (a stepped platform with a stop at each level is the fallback).
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/lift.ts packages/zplc-ide/src/plant/core/parts/lift.test.ts
git commit -m "feat(plant): lift with levels, a belt surface and level sensors"
```
**Risk:** item 4 (axis and surface order inside the step; a wrong order drops or flings a box), item 6 (the carry is plausible in a unit test and wrong at the belt joint of a landing). PHYS-adjacent.

---

### Task B2: Stacker crane with rack
**Spec:** PRT-001 (Stations row: "Stacker crane with rack"), PRT-003, PRT-004 (the INT setpoint variant), PRT-007, PRT-008, PLT-007, PLT-008, PLT-010, PLT-011. **Lane B. Wave 2 (after A0, A1's P2 and P3 verdicts). PHYS-adjacent.** Independent verifier required (Review Focus 2, 4); it runs with the B1 verifier. **Largest task of the plan; may exceed 400 lines (say why in the commit body).**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/stackerCrane.ts
IDE/src/plant/core/parts/stackerCrane.test.ts
```
**Interfaces:** produces `export const stackerParts: readonly RuntimePartDefinition[]` (`stacker-crane`, family `stations`, **not registered here**). Rules R5-S, R5-S2, R5-S3 and the signal table. Models: the layer palletizer for a composite station (`layerPalletizer.ts:68-176`: the part builds its own bodies, derives world directions from `yawEntry`, publishes secondary views) and `stepAxis` for the four axes (X, Y, Z fork, R raise; `axis.ts:17-47`). Bodies: the **fork** (a kinematic belt plate 0.16 m wide by `2 * forkStrokeM / 2` long, with `world.addBelt` along z) posed every step; the **rack rails** (static bodies, `columns * levels * 2`), built at `build` time; no body for the carriage or the mast (views `'stacker-mast'`, `'stacker-rack'` secondary, as K7's plates). Item reads go through `trackedItems` (kinematic fork and rails are filtered). INT signals: `bay` range `{ min: 0, max: columns }`, unit `bay`; `level` range `{ min: 0, max: levels }`, unit `level` (the plant map range must equal them, rule R-S3; a mismatch is the M2 located message). Setpoints are read each step from `commands` (a number); `apply` rejects a value outside its range (R-F). Inhibition R5-S4: the X and Y axes are held while `|z| > 0.005`; `blocked` counts rising edges of "setpoint differs from position by more than 0.005 m while inhibited". Cells `cell:<Name>:<c>:<l>` and `stored:<Name>` from one `bodiesInBox` over the rack volume joined with `trackedItems` (creation order). `snapPoints`: `dockIn` at the -z end of bay 0 (`accepts` the belt family) and `dockOut` at its +z end, plus the four footprint corners of the rack. Docs EN and ES: every setting, the cell geometry and the level convention ("level 0 is the dock; levels start at 1"), the transfer sequences (**store:** the fork loaded and raised, extend, lower, retract; **retrieve:** extend lowered, raise, retract), the inhibition, the rack side, the known limits (one rack, one side, no double-deep, the fork does not collide with the rack: the plant refuses the move).
- [ ] **Step 1: Failing tests** (real core scenes: belts as docks, boxes of 2 and 5 kg, orientation 90 degrees so the 0.4 m side lies along z):
  1. `'PRT-003 X and Y travel to the INT setpoints at their speeds and inPosition reports it within 0.005 m'`; `'PRT-003 bay and level outside their ranges are refused with a located message and leave the trace hash unchanged'`.
  2. `'PRT-003 the fork extends to forkStrokeM on each side and centres when released, reporting forkAtLeft, forkAtRight and forkCentre'`; `'PRT-003 raise moves the fork 0.06 m and raised reports the limit'`.
  3. `'PLT-007 a box from a dock belt is taken onto the fork by beltRight and is reported loaded'`; `'PLT-007 the crane stores a box on a rack cell: extend, lower, retract leave it at rest on the rails and cell:<Name>:1:1 reads TRUE'`; `'PLT-007 the crane retrieves it: extend lowered, raise, retract bring it back and the cell reads FALSE'`; `'PLT-007 a box on the fork survives X, Y and fork moves at the maximum speeds and accelerations'` (5 kg, `accelMps2` 3).
  4. `'PRT-003 X and Y are held while the fork is out and blocked counts one rising edge per refused request'`.
  5. `'PLT-008 a box at rest on a cell stays at rest for 60 simulated seconds without drift above 0.001 m and stored reads the number of boxes'`.
  6. `'PRT-008 stuckX, stuckY and forkStuck freeze their axis, loadedStuckOff makes loaded read FALSE with the box still on the fork, beltStall stops the fork surface, an unknown action throws a located message'`.
  7. `'PRT-003 settings outside their limits are refused with a located message'`; `'PRT-002 names and documentation in both languages'`; `'PRT-010 no scene schema version change'`; `'PRT-007 the snap points include dockIn, dockOut and the rack corners'`.
  8. `'PLT-006 the crane calls no libm function while stepping and the pose sequence of a store-and-retrieve run is identical on three runs'`; `'PLT-012 a capture with the fork extended and a box on it restores to the same exact state'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/stackerCrane.test.ts` (FAIL), implement, `bun test src/plant/core`, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`. If A1's P3 failed, stop and report: the parent revises this task (the fork-as-gripper fallback: `createGripper` attach with a clamp, as plan M3, and the doc says the transfer is not by friction).
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/stackerCrane.ts packages/zplc-ide/src/plant/core/parts/stackerCrane.test.ts
git commit -m "feat(plant): stacker crane with a rack, addressed by bay and level"
```
**Risk:** item 4 (axis order, fork pose and rail contact inside the step), item 6 (a transfer that works at 0.4 m/s and flings the box at the maxima). PHYS-adjacent.

---

### Task B3: Machining centre
**Spec:** PRT-001 (Stations row: "machining centre"), PRT-003, PRT-007, PRT-008, PLT-007, PLT-009 (the swap is a documented model event), PLT-010, PLT-011. **Lane B. Wave 2 (after A0). PHYS-adjacent.** Independent verifier recommended (Review Focus 5); it folds into the K10 verifier.

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/machining.ts
IDE/src/plant/core/parts/machining.test.ts
```
**Interfaces:** produces `export const machiningParts: readonly RuntimePartDefinition[]` (`machining-centre`, family `stations`, **not registered here**). Rules R5-M and R5-M1 and the signal table. Bodies: an integrated belt (a static body at the part position, as a `belt` of `conveyors.ts:60-130`, `world.addBelt`, target from `feed`), and two door plates (kinematic, in the static layer, 0.3 m high, posed every step as the stop blade `flow.ts:45`, travel 0.4 s). Each step: read tracked items inside the chamber (`bodiesInBox`, filtered by `trackedItems`); `ready` per R5-M; on the `start` edge with `ready` and not `doorStuck`, start the cycle; at its end `removeTrackedItem(world, blankId)` then `spawnItem(world, \`${part.id}-p${n}\`, 'item', LID_SIZE or BASE_SIZE, mass, at, rotation, 'lid' or 'base')` in the **same** `afterStep` (items spawn with the bottom face at `at`, `items.ts:57-78`). The cycle timer counts plant steps (`cycleMs / 5`, doubled by `cycleSlow`). `produced` and `misfires` as facts. View kinds `'machining-centre'` (the housing: pose box over the chamber) and `'machining-door'` (two secondary views); state per "View state keys". Snap points: `in` at -x and `out` at +x accepting the belt family. Docs EN and ES: the cycle, the doors, "ready needs one workpiece at rest", the swap as a model event (R5-M1), faults, limits (one blank at a time; only workpieces are blanks).
- [ ] **Step 1: Failing tests:** `'PRT-003 a workpiece fed into the chamber stops at rest and ready reads TRUE'`; `'PLT-007 start closes the doors, the belt holds, and after cycleMs the blank is replaced by one lid (or one base) and done reads TRUE'`; `'PLT-010 produced counts one per finished cycle and the body count is unchanged by the swap'` (mass is not created: bodies before = bodies after); `'PLT-007 a second blank waits at the closed door and enters after the doors open'`; `'PLT-010 a start with no blank, a box in the chamber, or two blanks does nothing but add one to misfires per rising edge'`; `'PRT-008 doorStuck makes every start a misfire, cycleSlow doubles the cycle, readyStuckOff hides ready, stall stops the integrated belt, an unknown action throws a located message'`; `'PRT-003 settings outside their limits and an unknown product are refused with a located message'` (located at `parts[n].config.product`); `'PRT-002 names and documentation in both languages'`; `'PRT-010 no scene schema version change'`; `'PRT-007 the snap points are in and out'`; `'PLT-006 the machining centre calls no libm function while stepping and the facts and poses are identical on three runs'`; `'PLT-012 a capture mid-cycle restores and finishes with the same hash'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/machining.test.ts` (FAIL), implement, `bun test src/plant/core`, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/machining.ts packages/zplc-ide/src/plant/core/parts/machining.test.ts
git commit -m "feat(plant): machining centre that turns a blank into a lid or a base"
```
**Risk:** item 4 (the swap inside `afterStep` changes the body set mid-step: the journal replay and the pinned hashes guard it), item 6 (a swap that conserves bodies but leaves a stale tracked entry). PHYS-adjacent. May exceed 400 lines.

---

### Task B4: Catalogue completion: limit switch, aligner, chute (CONDITIONAL on open question 2; default yes)
**Spec:** PRT-001 (Sensors row: "limit switch"; Flow control row: "aligner, chute"), PRT-003, PRT-007, PRT-008, PLT-007. **Lane B. Wave 2 (after A0, A1's P4 verdict). PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/completion.ts
IDE/src/plant/core/parts/completion.test.ts
```
**Interfaces:** produces `export const completionParts: readonly RuntimePartDefinition[]` (`limit-switch`, `aligner`, `chute`, **not registered here**). `limit-switch` (family `sensors`): a lever box of `reachM` in front of the part along local +x and `heightM` tall; `contact` is TRUE while a tracked item's body is inside the box (`bodiesInBox` filtered by `trackedItems`), `stuckOn` and `stuckOff` faults; the fact `count:<Name>` counts rising edges (the sentence exists, `describe.ts:45`). `aligner` (family `flow`): two kinematic guides at +z and -z of the belt that close to `gapM` on `align` over 0.4 s (the blade technique, `flow.ts:16-66`), `aligned` and `open` limit sensors, `stuck` fault: it squares an item to the belt axis. `chute` (family `flow`): a static plate of `lengthM` by `widthM` tilted `tiltDeg` about its local z (A1's `tiltDeg`), friction 0.2, snap points `in` (high end) and `out` (low end); no signal, no fault. Docs EN and ES for the three. If A1's P4 failed for the tilt, the chute is dropped and the report says so (PRT-001 stays partly pending with the chute named).
- [ ] **Step 1: Failing tests:** `'PRT-001 a limit switch is TRUE while an item touches its lever and counts the rising edges'`; `'PRT-008 stuckOn and stuckOff force contact, an unknown action throws a located message'`; `'PLT-007 an aligner squares a skewed box to the belt axis and reports aligned and open at its limits'`; `'PRT-008 an aligner stuck holds where it is'`; `'PLT-007 a box placed at the high end of a chute slides to the low end and onto a belt'`; `'PRT-003 settings outside their limits are refused with a located message'` (a `tiltDeg` of 40); `'PRT-002 names and documentation in both languages'`; `'PRT-010 no scene schema version change'`; `'PRT-007 the snap points of the chute are in and out'`; `'PLT-006 the three parts call no libm function while stepping and the traces are identical on three runs'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/completion.test.ts` (FAIL), implement, `bun test src/plant/core`, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/completion.ts packages/zplc-ide/src/plant/core/parts/completion.test.ts
git commit -m "feat(plant): limit switch, aligner and chute to complete the minimum catalogue"
```
**Risk:** item 6 (no shipped scene uses these parts: an error hides until a learner builds with them; the unit tests are the only guard, so M7's editor journey should place each once). PHYS-adjacent.

---

### Task V7: View: crate, lift, crane and rack, machining centre, completion parts
**Spec:** VIS-003, VIS-009, PRT-009. **Lane V. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/view/geometry.ts
IDE/src/plant/view/cues.ts
IDE/src/plant/view/renderer.ts
IDE/src/plant/view/stations.test.ts
```
**Interfaces:** the "View state keys" paragraph. `partShape` (`geometry.ts:50-91`): explicit cases for the new view kinds (`'crate'`, `'lift'`, `'stacker-crane'`, `'stacker-mast'`, `'stacker-rack'`, `'machining-centre'`, `'machining-door'`, `'limit-switch'`, `'aligner'`, `'chute'`), each the pose box; the cases are **exactly** the strings the parts publish. `partDecor` (`geometry.ts:138`+): the crate draws its **walls as four thin bars and an open top** (a hollow box, by shape not colour), the lift a direction marker on its platform and two thin guide rails at the travel, the crane a mast column and a fork plate with an extension marker, the rack its rails per cell, the machining centre its housing as an open frame with the doors as bars that lower, the chute a tilted plate (the pose carries the tilt). `cuesFor` (`cues.ts:71-92`): add `'up'`, `'down'`, `'raise'`, `'start'`, `'align'`, `'contact'` to `ACTIVE_SUFFIXES` (`cues.ts:38`) **after** `'gripped'`, `'divert'` and the existing `'lift'`; **note that `lift` already matches any signal ending in `.lift` (the chain transfer's)** (Findings 3): the order of the list is part of the contract and a test pins it. `OUTLINED_PARTS` (`geometry.ts:149`) and `applyOutlines` (`renderer.ts:340`) outline the new parts in high contrast; the material colours of `partColor` (`renderer.ts:273`) and `PART_COLORS` (`renderer.ts:126`) get the new kinds. Items: the crate is drawn in the item tone with the open-top decor (VIS-009: three tones stay different in every palette).
- [ ] **Step 1: Failing tests** (view tests are pure; follow `sorting.test.ts` and `manipulators.test.ts`): `'VIS-003 every M5 view kind is matched by partShape, and an unknown name falls to the pose box'` (the literal list of kind strings and the strings the part definitions export); `'VIS-003 a crate is drawn open: four wall bars and no top'`; `'VIS-003 a lift is told by its fraction and text, a crane by its fork extension marker, a machining centre by its doors and its cycle text'`; `'VIS-003 ACTIVE_SUFFIXES keeps its order and the chain transfer lift signal still reads as active'`; `'VIS-009 high contrast outlines the new parts and the crate keeps its tone in every display mode'`; previous behaviour: `'VIS-003 the cues and shapes of the M1 to M4 parts are unchanged'` (a table of the existing views).
- [ ] **Step 2 to 4:** `bun test src/plant/view`, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/view
git commit -m "feat(plant): draw crates, lifts, the stacker crane, machining centres and the completion parts with their cues"
```
**Risk:** item 6 (drawing is checked by pure tests only; K10 adds a test from a real snapshot and Q6 looks at the real view). KEEP.

---

### Task U5: Readouts, fact sentences, fault labels, strings
**Spec:** VIS-008, VIS-010, VIS-011, PLT-011. **Lane U. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/ui/OperatePanel.tsx
IDE/src/plant/ui/NumericControls.tsx
IDE/src/plant/ui/OperatePanel.stations.test.tsx
IDE/src/plant/text/describe.ts
IDE/src/plant/text/describe.stations.test.ts
IDE/src/i18n/catalog/plantView.ts
```
**Interfaces:** `describePlant` (`describe.ts:18-64`): `stored:<Name>`, `produced:<Name>`, `misfires:<Name>`, `blocked:<Name>` and `loaded:crate:<index>` are integer facts **silent at 0** and told in words (extend `SUPPORT`, `describe.ts:10`, and special-case them next to `delivered`; catalogue sentences `plant.text.stored`, `produced`, `misfires`, `blocked`, `crateLoaded`, each with `.one` and `.other` keys, read with `tn()`); `cell:<Name>:<c>:<l>` is **filtered** (a boolean the generic branch would print raw: add it to the filtered prefixes); `axis:` is already continuous. `OperatePanel.tsx:83` `READOUT_IDS` (the ids that get a readout, `:96` the list that is not drawn as a generic part): add `'lift'`, `'stacker-crane'`, `'machining-centre'`; `Readout` (`NumericControls.tsx`) gains one branch per id with `<span data-plant-station={name}>` showing `state.text` through `t()` keys `plant.panel.lift`, `plant.panel.crane`, `plant.panel.machine`; a part id with no branch still draws **nothing** (the M3 fallthrough fix). Labels: add `plant.fault.forkStuck`, `loadedStuckOff`, `beltStall`, `levelStuckOff`, `doorStuck`, `cycleSlow`, `readyStuckOff` to both catalogues (`plantView.ts:77-120` English, `:188-250` Spanish; neutral usted, `falla`); `stuck`, `stall`, `stuckX`, `stuckY`, `stuckOn`, `stuckOff` exist. **`rg -n "plant.fault" IDE/src/i18n` first and reuse an existing key; the guard `src/i18n/catalogKeys.test.ts` rejects a key defined in two modules.** The generic fault control (`OperatePanel.tsx:50-80`) already lists every action and **chooses before it acts**.
- [ ] **Step 1: Failing tests:** `'VIS-008 stored, produced, misfires, blocked and the crate load are told in words, silent at 0, and the change key moves only when a count changes'`; `'VIS-008 a cell boolean, a lift position and a crane axis never change the key over a whole run'` (fake snapshot series with `fraction` and `text` moving and `cell:` flipping); `'VIS-011 every new sentence, panel string and fault label exists in English and Spanish with the same placeholders and the plural pairs'`; `'VIS-010 a lift, a crane and a machining centre appear in the fault list with their actions, choosing does not trigger'`; `'PLT-011 every action of every M5 part has a plant.fault label in both catalogues'` (the labels guard of `OperatePanel.test.tsx:219-220`, extended: the parts come from the **real** registered catalogue once K10 merges; until then the test uses the action lists exported by the part tasks and **skips with a reason** if a part is absent, then K10 turns the skip into a failure); `'VIS-008 a table test: every fact family of M5 is told or filtered, never as plant.text.fact with a raw key'`; previous behaviour: `'VIS-008 the tank, stack light, manipulator, sorting and support readouts and sentences are unchanged'`.
- [ ] **Step 2 to 4:** `bun test src/plant/ui src/plant/text src/i18n`, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/ui packages/zplc-ide/src/plant/text packages/zplc-ide/src/i18n
git commit -m "feat(plant): station readouts, warehouse and production sentences and fault labels in English and Spanish"
```
**Risk:** item 6 (an accessibility regression the pure tests cannot hear; Q6 and the screen-reader capture cover it). KEEP.

---

### Task K10: Core integration: register parts, `addItem` crate, grammar, pinned hashes
**Spec:** PLT-006, PLT-010, PLT-011, PLT-012, PLT-016, PRT-001. **Lane C. Wave 3. PHYS-adjacent.** Independent verifier required (Review Focus 1, 3, 5, 6, 8); it also covers A2 and B3.

**Allowed edit surfaces**
```
IDE/src/plant/core/plantCore.ts
IDE/src/plant/core/plantCore.stations.test.ts
IDE/src/plant/core/hashes.json
IDE/src/plant/ci/sceneCheck.ts
IDE/src/plant/ci/sceneCheck.test.ts
IDE/src/plant/view/m5Views.test.ts
IDE/src/plant/ui/m5Readouts.test.tsx
```
**Interfaces:** `SHIPPED` (`plantCore.ts:45-60`): append `...liftParts, ...stackerParts, ...machiningParts, ...completionParts` **after** `...turntableParts` (the order of earlier parts and their hashes never change; the crate is already in `itemParts`). `exec` case `'+'` (`plantCore.ts:237`, the refusal at `:241`): `addItem` also accepts `'crate'`; the error reads `use box, workpiece, crate or pallet` (the existing refusal text is updated and its test with it). `snapshot()` pose: the crate pose carries `tag: 'crate'` (already copied from `ItemInfo.tag` since M3). `FIXED_FACTS` and `FACT_GRAMMAR` (`sceneCheck.ts:29-33`) and `factFault` (`:36-49`): add `stored`, `produced`, `misfires`, `blocked` (the `named` list at `:44`), `cell:<Name>:<c>:<l>` (two integers, a name check) and `loaded:crate:<index>`; extend the grammar string. Pin two hashes in `hashes.json`: `m5-lifts-v1` (a scripted run: a belt feeds a lift that rises one level with a box, runs it off, a crate on the platform receives two dropped workpieces and is carried down) and `m5-station-v1` (a stacker crane stores two boxes and retrieves one, with a machining centre producing a lid; fixed command script); update the `notes` string. Two **test-only** files, as K9: `m5Views.test.ts` builds a real snapshot of a scene containing **every** M5 part and asserts that `partShape`, `partDecor` and `cuesFor` handle each view's `part` string; `m5Readouts.test.tsx` renders `Readout` for each real view and asserts the right branch (no stack light, no null for a lift, a crane or a machining centre). A mismatch is **reported to the parent** (it goes back to V7 or U5), not fixed by editing their files. U5's labels test, which skipped for absent parts, now fails for any part without a label: K10 un-skips it.
- [ ] **Step 1: Failing tests** (`plantCore.stations.test.ts`, real `createPlantCore`, scenes built with `parseScene`):
  1. `'PRT-001 the catalogue contains every M5 part and the crate after the core is created'` (ids of the "Part signal tables"; the completion parts only if B4 ran).
  2. `'PLT-010 stored, cell, produced, misfires and blocked are published by their parts and not by a scene without them'`.
  3. `'PLT-010 addItem accepts a crate and the snapshot carries its tag'`; `'PLT-016 addItem of an unknown kind is refused with the located message'`.
  4. `'PLT-012 a capture taken while a crate rides a lift, and one taken with the fork extended, restore to the same exact state and the same final hash'`; `'PLT-012 reset returns a station scene to its initial state'`.
  5. `'PLT-006 the two M5 core scripts give the pinned hashes on Linux'` (`m5-lifts-v1`, `m5-station-v1`; the first run writes them; the test compares to `hashes.json` and skips off Linux, as the M1 to M4 pins do); `'PLT-006 the hash does not depend on host pacing'`.
  6. `'PLT-016 apply refuses a bay or a level outside its range with the located message and leaves the hash unchanged'` (rule R-F).
  7. In `sceneCheck.test.ts`: `'SCN-004 the fact grammar accepts stored, produced, misfires, blocked, cell and loaded:crate and names the unknown ones'` (`fact:stored:Crane1`; `fact:cell:Crane1:2:1`; `fact:cell:Crane1:2` alone is refused; a part name not in the scene is located).
  8. `m5Views.test.ts` and `m5Readouts.test.tsx` as above.
  9. Previous behaviour (Review Focus 1): `'PLT-006 every shipped scene keeps its pinned hash'` (generalised since M4: it iterates `SCENE_INDEX`, **one** pass); `'PLT-010 a scene with no M5 part publishes the same facts, in the same key order, as before'` (the key list of two M3 and two M4 scenes equals a literal); the six M1 to M4 core pins unchanged.
- [ ] **Step 2 to 4:** `bun test src/plant/core src/plant/ci/sceneCheck.test.ts src/plant/view src/plant/ui` with `ZPLC_NATIVE_SIM_BIN` exported for the native tests; `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core packages/zplc-ide/src/plant/ci/sceneCheck.ts packages/zplc-ide/src/plant/ci/sceneCheck.test.ts packages/zplc-ide/src/plant/view/m5Views.test.ts packages/zplc-ide/src/plant/ui/m5Readouts.test.tsx
git commit -m "feat(plant): register the lift, the stacker crane and the machining centre, publish station facts, pin the M5 trace hashes"
```
**Risk:** item 4 (step ordering of the new parts inside the core, and a swap that changes the body set), item 3 (`plantCore.ts` is consumed by every scene), item 1 (the new facts are a persisted vocabulary of scenario files). Independent verifier: the seventeen scene hashes and six core pins are the guard. PHYS-adjacent. May exceed 400 lines.

---

### Task D6: Documentation in English and Spanish
**Spec:** CRS-011 (M5 parts and scenes), CRS-013, PRT-002. **Lane D. Wave 3. KEEP.**

**Allowed edit surfaces**
```
tools/docs/plant-parts-reference.ts
tools/docs/plant-parts-reference.test.ts
docs/docs/plant/parts.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/parts.md
docs/docs/plant/stations.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/stations.md
docs/docs/plant/numeric-signals.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/numeric-signals.md
```
(`parts.md` in both languages is **generated**: edit the generator, then run it. The generator's `PARTS` array is built from the `*Parts` exports (`tools/docs/plant-parts-reference.ts:28`); a part array not added there silently misses the reference, and M4 added a test that `PARTS` equals every export. Add `liftParts`, `stackerParts`, `machiningParts` and `completionParts`. `docs/sidebars.js`, `plant/index.md` and `plant/scenes.md` are the parent's.)

**Content.** `stations.md` (new page): the crate (size, stacking, what counts as loaded), the lift (levels, the level convention, the surface, the known limit), the stacker crane (the four axes, INT bay and level, the transfer sequences store and retrieve, the dock level and the rack, the inhibition and `blocked`), the machining centre (the cycle, the doors, `ready`, `misfires`, the swap as a model event), the facts and how each is told, the fault actions and what each teaches, the known limits. The three completion parts get a short section if B4 ran. `numeric-signals.md` gains the crane's `bay` and `level` INT signals with their ranges and the note that the 64-byte exchange span applies (the crane has two INT commands and eleven BOOL signals). **Only measured claims**: no latency, frame rate, hardware or cross-platform claim; say "pinned on Linux; macOS and Windows not yet measured" where determinism is mentioned. Spanish: neutral usted, `falla`, `ciclo`, `elevador`, `transelevador`, `cajón`, `centro de mecanizado`, "ZPLC".
- [ ] **Step 1: Failing tests:** `'PRT-002 the reference lists the M5 parts with their ranges, variants and fault actions'`; `'PRT-002 the generator PARTS has exactly the ids the catalogue registers'` (import the catalogue after `plantCore` has registered the shipped parts); `'PRT-002 --check fails when a part definition changes and the page does not'`; `'PRT-002 English and Spanish pages have the same table structure'`; the docs parity and Spanish register tests of `tools/docs`.
- [ ] **Step 2 to 4:** `bun test tools/docs` at the root (FAIL, implement, `bun tools/docs/plant-parts-reference.ts --write`, `--check` exits 0), and the docs build if present (`bun run --cwd=docs build`, **Unconfirmed**).
- [ ] **Step 5: Commit.**
```bash
git add tools/docs docs/docs/plant docs/i18n/es
git commit -m "docs(plant): stations, lifts, crates and machining, with the parts reference generated, in English and Spanish"
```
**Risk:** item 6 (claims beyond evidence; guarded by the rule above), item 5 (a docs CI check).

---

### Task S5: Live equals graded for a station scene; capture mid-lift and mid-fork
**Spec:** PLT-005, PLT-012, PLT-017, LNK-003, LNK-006, SCN-004, SCN-011 to SCN-013. **Lane S. Wave 4. PHYS-adjacent.** (Plan M4's Task S4 is the model; read `IDE/src/plant/ci/liveVersusGradedSorting.test.ts` and `fixtureSorting/` first.)

**Allowed edit surfaces**
```
IDE/src/plant/ci/liveVersusGradedStations.test.ts
IDE/src/plant/ci/fixtureStations/scene.json
IDE/src/plant/ci/fixtureStations/plant-map.json
IDE/src/plant/ci/fixtureStations/reference.st
IDE/src/plant/ci/fixtureStations/scenario.json
```
**Content.** A small fixture, not a shipped scene: a dock belt, a stacker crane (`columns` 2, `levels` 2) with INT `bay` and `level` commands (raw 0 to 2, eng 0 to 2, unit `bay` and `level`), a lift with two levels, a machining centre, a crate emitter and a remover; the reference program stores one box at cell (1, 1), retrieves it, and sends a workpiece through the machine. **Tests:** `'PLT-017 the live session and the graded run give the same trace hash over 1000 scans for the station fixture'`; `'PLT-017 an INT bay and level reach the plant with the scaling of rules R-S1 and R-S2 on both paths'`; `'PLT-012 a capture taken while a crate rides the lift and one with the fork extended restore and finish with the same hash'`; `'PLT-005 pause and step mid-run leave the plant frozen and the trace unchanged'`; `'SCN-012 the generated declarations of the fixture map have two INT and the BOOL signals with their addresses, and the span is at most 64 bytes'`; `'SCN-004 the fixture reference passes and an empty program fails'`.
- [ ] **Steps:** as S4 of plan M4 (read, failing test, implement the fixture, run `bun test src/plant/ci/liveVersusGradedStations.test.ts` with `ZPLC_NATIVE_SIM_BIN` exported, `bun run typecheck` (root), `bunx tsc -b`, `bun run lint`).
- [ ] **Commit:** `test(plant): live equals graded for a station scene and capture mid-lift and mid-fork`. **Risk:** item 6 (a wrong exchange of an INT setpoint makes every warehouse scene wrong). PHYS-adjacent.

---

### Task F11: Reference scene 11, Three-level lifts (content)
**Spec:** SCN-001 to SCN-004, SCN-007. **Lane F. Wave 4. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/three-level-lifts/scene.json
IDE/plant-scenes/three-level-lifts/plant-map.json
IDE/plant-scenes/three-level-lifts/reference.st
IDE/plant-scenes/three-level-lifts/starter.st
IDE/plant-scenes/three-level-lifts/scenario.json
```
(The parent adds `'three-level-lifts': 11` to `SCENE_ORDER` first, then regenerates `IDE/src/generated/sceneIndex.ts` with `bun run generate:scene-index` and pins `IDE/src/plant/ci/sceneHashes.json` after the merge; restore both with `git checkout --` before committing.)

**Content.** Goal of spec SCN row 11, "Move items between three levels with two lifts". Layout original (P17, SCN-003). Parts: an infeed belt at level 1 with an emitter of boxes (timed, `intervalMs` about 8000, `maxItems` 5), **lift A** (`levels` 2) from level 1 to level 2, a transfer belt at level 2 that both lifts share (lift A's top is lift B's bottom), **lift B** (`levels` 2) from level 2 to level 3, an outfeed belt at level 3 ending in a `remover`, a diffuse sensor at each landing (three), a push button Start, an **emergency stop**, a stack light, camera presets for the three levels. The reference program: on Start run the infeed; a box reaching the foot of lift A stops there, lift A runs the box on, rises, runs it off onto the transfer belt, lowers; lift B does the same one level up; an emergency stop or a lift that is not at a level refuses to run its surface (the interlock the lesson 18.1 teaches; the plant does not inhibit, R5-L). `scenario.json` (`tickMs` 10, `durationMs` at most 100000): Start at 200 ms and boolean expectations: `ALWAYS fact:itemsDropped false`, `EVENTUALLY fact:delivered:TopBin`, `AT` the end the green lamp TRUE; a second phase presses the emergency stop at a scripted time and asserts both `axis` unchanged is **not** expressible (no numeric comparison, open question 4): assert instead the program output `Stopped` TRUE **and** `ALWAYS fact:itemsDropped false` through the stop (the plant does the work: a box that was on a travelling lift must still be on it). With N10, a follow-up commit tightens `delivered:TopBin` to the exact count. `shortestPulseMs`: the shortest landing sensor pulse at catalogue speeds (a 0.4 m box at 0.5 m/s is 800 ms; **Unconfirmed**: measure it and declare the measured value; the hardware track of lesson 18.1 depends on it, M6). Tune the lift speeds inside their ranges to fit 100 s with five boxes.
- [ ] **Step 1: Failing tests.** The SCN-004 test `'SCN-004 every shipped scene passes with its reference program and fails with its starter'` iterates `SCENE_INDEX`; after creating the five files with an empty program run `bun run generate:scene-index` and confirm it FAILS. Run `bun test src/plant/ci/sceneCheck.test.ts` with the binary exported (the parent runs the whole of `src/plant/ci` once).
- [ ] **Step 2: Write** the files until the reference passes and the starter fails; **run the grade three times and once with each moving speed (belt, `travelSpeedMps`) at 0.9 and 1.1 of the tuned value** and tune with margin. `bun run lint`, `bun test src/plant/core src/learn` (2.0 unchanged).
- [ ] **Step 3: Commit** (tuned values in the reference program and the commit body, never in new scene keys).
```bash
git add packages/zplc-ide/plant-scenes/three-level-lifts
git commit -m "feat(plant-scenes): scene 11, three-level lifts, with reference program and scenario"
```
**Risk:** item 6 (scene quality beyond the scenario), item 1 (a persisted, versioned scene file). PHYS-adjacent (hash).

---

### Task F10: Reference scene 10, Lift with stacking (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PLT-007 (items caught by the crate). **Lane F. Wave 4. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/lift-stacking/scene.json
IDE/plant-scenes/lift-stacking/plant-map.json
IDE/plant-scenes/lift-stacking/reference.st
IDE/plant-scenes/lift-stacking/starter.st
IDE/plant-scenes/lift-stacking/scenario.json
```
(`SCENE_ORDER` entry `'lift-stacking': 10` is the parent's; same restore rule as F11.)

**Content.** Goal of spec SCN row 10, "Gather up to five items into a stackable crate with a lift". An empty crate arrives on a floor belt (crate emitter), enters a lift platform at level 1 and stops (the surface stops); the lift rises to level 2, where a **feeder belt** (raised) drops workpieces into the crate one at a time; a count of five (a diffuse sensor over the feeder end, the lesson-17.2 counter) closes the batch; the lift lowers, runs the full crate out to a belt that ends in a `remover`. **Route (open question 1 / A1 P1):** with the compound crate the items fall into it; if five dropped items do not rest inside (P1's drop-spread finding), the reference **indexes the crate** with short timed runs of the platform surface between drops (the lift's `run`) and the commit body says so; with the tray fallback this scene gathers three items and loads them by a pusher (rename the count in the program, the scene id and name stay). Boolean expectations: `ALWAYS fact:itemsDropped false`, `EVENTUALLY fact:loaded:crate:0` (a nonzero count; with N10, exactly 5), `EVENTUALLY fact:delivered:CrateBin`, `AT` the end the green lamp TRUE. A **second** crate is emitted when the first leaves, and is left stacked on a scripted pallet-free floor spot only if it keeps the grade inside 100 s: the stacking of crates is proved by the A2 test, not required here. `shortestPulseMs`: the shortest count-sensor pulse (**Unconfirmed**, measure it). The scene must fit 100 s: one crate and five items is the default; lower `maxItems`, never raise the sample limit.
- [ ] **Steps 1 to 3 and commit** as F11 (speed margin: the lift's `travelSpeedMps`, the feeder belt, the floor belt): `feat(plant-scenes): scene 10, lift with stacking, with reference program and scenario`. **Risk:** item 6, item 1. PHYS-adjacent (hash).

---

### Task F16: Reference scene 16, Balanced production line (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PLT-010. **Lane F. Wave 4. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/balanced-production-line/scene.json
IDE/plant-scenes/balanced-production-line/plant-map.json
IDE/plant-scenes/balanced-production-line/reference.st
IDE/plant-scenes/balanced-production-line/starter.st
IDE/plant-scenes/balanced-production-line/scenario.json
```
(`SCENE_ORDER` entry `'balanced-production-line': 16` is the parent's; same restore rule as F11.)

**Content.** Goal of spec SCN row 16, "Produce equal numbers of lids and bases with two machining centres". An infeed belt with an emitter of **workpieces** (timed, `maxItems` 8) ends at a `diverter-arm` that sends each blank to **machine A** (`product` lid, `cycleMs` 3000) or **machine B** (`product` base, `cycleMs` 6000), each on its own branch belt, each with a diffuse sensor before it, each leaving onto an output belt that ends in a `remover` (`LidBin`, `BaseBin`; both `accepts any`, so the facts are `delivered:<Name>`), a Start button, a stack light. The two cycle times are different on purpose: a program that feeds whichever machine is free makes lids faster than bases; the reference **balances** (alternates, and waits for the slower machine) so four lids and four bases come out. Boolean expectations: `ALWAYS fact:itemsDropped false`, `ALWAYS fact:misfires:MachineA false` and `MachineB false`, `EVENTUALLY fact:delivered:LidBin` and `fact:delivered:BaseBin`, `EVENTUALLY fact:produced:MachineA` and `MachineB`, `AT` the end the green lamp TRUE. **Balance is graded exactly only with N10** (open question 4): a follow-up commit asserts `delivered:LidBin` equals `delivered:BaseBin` equals 4; without N10 the boolean set above ships and the scene's doc says the balance check needs it. The scene can also host the fault `cycleSlow` (a lesson on diagnosis): add one optional `fault` event only if the reference still passes. `shortestPulseMs`: the shortest sensor pulse (**Unconfirmed**; the `ready` pulse is the program's reaction, not the plant, as L145 found for pusher limits). The grade must fit 100 s: eight blanks through a 6 s machine is 24 s of cycles per machine; lower `maxItems` if the sample limit bites.
- [ ] **Steps 1 to 3 and commit** as F11 (speed margin: belts and the arm's `degPerS`; the cycle times are scene settings, so the 0.9 and 1.1 margin applies to the belt speed and a 10 percent change of `cycleMs` in the **test only**, not the scene): `feat(plant-scenes): scene 16, balanced production line, with reference program and scenario`. **Risk:** item 6, item 1. PHYS-adjacent (hash).

---

### Task F7: Reference scene 7, Stacker-crane warehouse (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-004. **Lane F. Wave 5 (after S5). PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/stacker-crane-warehouse/scene.json
IDE/plant-scenes/stacker-crane-warehouse/plant-map.json
IDE/plant-scenes/stacker-crane-warehouse/reference.st
IDE/plant-scenes/stacker-crane-warehouse/starter.st
IDE/plant-scenes/stacker-crane-warehouse/scenario.json
```
(`SCENE_ORDER` entry `'stacker-crane-warehouse': 7` is the parent's; same restore rule as F11.)

**Content.** Goal of spec SCN row 7, "Store boxes in a rack and retrieve them". Parts: a stacker crane (`columns` 3, `levels` 2) with its rack on the +z side; an infeed belt at the -z dock (an emitter of three **boxes**, timed, rotation so the 0.4 m side lies along z), an outfeed belt at the +z dock ending in a `remover` `OutBin`, a diffuse sensor at the infeed end (a box waits for the crane), three push buttons `Req1`, `Req2`, `Req3` (the retrieve requests), a Start button, a stack light, camera presets (aisle, rack, dock). The reference program is the **request queue** the lesson teaches: on Start take each arriving box to the next free cell (first free cell in column-major order), keep a table of occupied cells in the program, and on a request retrieve the box of that cell to the outfeed. The script presses `Req1` and `Req3` after the three boxes are stored. Boolean expectations: `ALWAYS fact:blocked:Crane1 false` (the program never moves the crane with the fork out), `ALWAYS fact:itemsDropped false`, `EVENTUALLY fact:stored:Crane1`, `EVENTUALLY fact:cell:Crane1:1:1` and `fact:cell:Crane1:2:1`, `EVENTUALLY fact:delivered:OutBin`; `AT` the end the green lamp TRUE. With N10: `stored:Crane1` exactly 1 at the end (three stored, two retrieved) and `delivered:OutBin` exactly 2. Map: `Crane1.bay` and `Crane1.level` INT commands (raw 0 to 3 and 0 to 2, eng equal, units `bay` and `level`), the rest BOOL (the engineering ranges must equal the part's, rule R-S3). `shortestPulseMs`: the shortest sensor pulse (the infeed sensor crossed by a 0.4 m box at 0.5 m/s, **Unconfirmed**, measure it). The scenario must fit 100 s: a store cycle (dock, travel, place) is about 25 s at the default speeds, so three stores and two retrieves do not fit; raise the axis speeds inside their ranges (`speedXMps` up to 1.5) and, if that is not enough, store **two** boxes and retrieve one, say so in the commit body, **never** raise the sample limit.
- [ ] **Steps 1 to 3 and commit** as F11 (speed margin: belt, `speedXMps`, `speedYMps`, `forkSpeedMps`, 0.9 and 1.1): `feat(plant-scenes): scene 7, stacker-crane warehouse, with reference program and scenario`. **Risk:** item 6, item 1. PHYS-adjacent (hash).

---

### Task L6: Lessons 17.1 to 17.4 and 18.1 (content; CONDITIONAL on the outline approval; may move to M7)
**Spec:** CRS-003 to CRS-006, CRS-011. **Lane L. Wave 5. Starts only when the owner approves `course-outline.md` (CRS-001) and M1 task L1 (a manifest may name a scene) is merged; without both, stop and report.** M5 ships **without** lessons if the outline is not approved; the lessons then land with M7 (open question 5).

**Allowed edit surfaces**
```
IDE/lessons/plant-three-level-lifts/*
IDE/lessons/plant-lift-stacking/*
IDE/lessons/plant-warehouse/*
IDE/lessons/plant-production-line/*
IDE/lessons/plant-estop-interlocks/*
```
(Ids, languages and scenes from `course-outline.md` rows 17.1 to 17.4 and 18.1: `plant-three-level-lifts` SFC on scene 11, `plant-lift-stacking` ST on scene 10, `plant-warehouse` SFC on scene 7, `plant-production-line` ST on scene 16, `plant-estop-interlocks` ST or LD on scene 11. The outline's open items may rename them.) Each lesson is a package in the 2.0 layout (`lesson.json` manifest with `scene`, `starter`, `solution`, `scenario` with the pinned `scenario.sha256`, hints, English and Spanish text with the same structure), built from the F-task scene and reference. The hardware track is **not** opened (M6; lesson 18.1 is marked `Sim + HW*` in the outline and depends on the scene 11 pulse). Tests: the existing `lessonCi.test.ts` and the curriculum and parity tests grade every solution and starter (CRS-005) and check the languages; `bun test src/learn`.
- [ ] One commit per lesson: `feat(lessons): plant-three-level-lifts`, `feat(lessons): plant-lift-stacking`, `feat(lessons): plant-warehouse`, `feat(lessons): plant-production-line`, `feat(lessons): plant-estop-interlocks`. **Risk:** item 6 (pedagogy), item 1 (hash-pinned content). Independent verifier for the package format use (L1's guard).

---

### Task Q6: Journeys: fault and emergency stop by keyboard on scene 11; crane readout; rest soak
**Spec:** VIS-010, VIS-011, VIS-008, PLT-008, SCN-004 (end to end). **Lane Q. Wave 5. KEEP (journey), PHYS-adjacent (soak).**

**Allowed edit surfaces**
```
IDE/scripts/journeys/plantStations.ts
IDE/scripts/journeys.ts
IDE/src/plant/core/parts/stationSoak.test.ts
```
(`journeys.ts` gets only the registration of the new export, as Q2 to Q5 did; read `IDE/scripts/journeys.ts` and `IDE/scripts/journeys/plantSorting.ts` first. The helpers `openPlantDocument`, `runInSimulation`, `plantFacts`, `shippedSceneProject` live in `IDE/scripts/journeys/plantSupport.ts`.) Journeys:
1. Open the project of scene 11, run it in simulation, read `delivered:` from the facts text until it is at least 1, then trigger `levelStuckOff` on lift A **by keyboard** (Tab to the fault select, choose with the arrow keys, then Tab to the trigger button and Enter; press **Ctrl+M** first when the walk leaves the code editor) and see the emergency-stop operation by keyboard stop the plant program's outputs (the `Stopped` indicator in the operate panel). Tab reaches every operate control in a stable order, and the arrow keys alone never trigger a fault.
2. Open scene 7, confirm the crane readout shows a bay and a level and that the live region stays quiet while the readout changes (no announcement per scan).
The soak (`stationSoak.test.ts`, headless, PLT-008): a core with a box at rest on a stopped lift at each level, a box on the crane fork, a box on a rack cell, a crate holding five items and a stack of two crates; 10 simulated minutes at rest give no drift above 0.001 m and no rotation above 0.1 degrees.
A journey that needs a GPU is out of scope: the journeys give no timing evidence. Expected: the 2.0 journeys and the M1 to M4 plant journeys unchanged.
- [ ] **Step 1: Failing journey and soak; Step 2: implement; Step 3: run** `ZPLC_NATIVE_SIM_BIN=<worktree runtime binary> ZPLC_ELECTRON_SMOKE_PORT=<free port> xvfb-run bun run smoke:journeys` in `IDE/` (with `node install.js` and `electron:compile` done, Global Constraints) and `bun test src/plant/core/parts/stationSoak.test.ts`. **Step 4: commit:** `test(plant): station fault and emergency stop by keyboard, crane readout journey and a rest soak`. **Risk:** item 5 (a journey that drives the application; the stale-binary failure of L16 is the known trap), item 6.

---

### Task C4: Requirement coverage and indexes for the M5 requirements
**Spec:** section 7 item 1. **Lane Q. Wave 6. KEEP. Run by the parent or a CI-hygiene writer after the other tasks merge.**

**Allowed edit surfaces**
```
tools/ci/requirement-evidence.json
tools/ci/requirements-index.json
tools/ci/requirement-coverage.test.ts
IDE/src/generated/sceneIndex.ts
IDE/src/plant/ci/sceneHashes.json
```
(The evidence mechanism is **Unconfirmed** beyond what the M2 hygiene commits `e1007fcd` and `62ac99c1` and L116 show: read `tools/ci/requirement-coverage.ts` and the `generate:*` scripts in `IDE/package.json` first. The coverage fixtures for specs 012 and 013 are fixture-based, never pinned to today's uncovered IDs, L14.) The parent also pins the Linux hashes of the four M5 scenes and regenerates the scene index here, if not done at the wave merges.
- [ ] Steps: `bun tools/ci/requirement-coverage.ts --check` (expected exit 0; **PRT-001 fully covered only if B4 ran**, otherwise the aligner, chute and limit switch are listed pending; PRT-004 stays partly pending with the conveyor speed variant listed; SCN-003 stays as M4 left it; LNK, CRS pending), `bun test ./tools/ci`, `CLANG_FORMAT=... bun tools/ci/format.ts --check`. Commit: `test(ci): requirement coverage records for the M5 requirements`. **Risk:** item 5 (CI tooling).

---

## Open questions for the owner
Only real product decisions. Each has a recommended default; the plan proceeds on the default unless told otherwise, except question 1, which selects the route of A2 and F10, question 2, which gates B4, and question 4, which gates N10.

1. **How a crate holds items (PRT-001 "stackable crate", scene 10 "gather items into a crate").** (A) An open-top **compound** body with a floor and four walls: dropped items stay in, crates stack on their rims (the physics does the work). (B) A flat **tray** (one box): items are loaded by a pusher and the scene gathers three, not five. *Recommended default: A, with B as the documented fallback if the probe P1 of Task A1 shows a compound body cannot be created, captured or restored in this WebAssembly build.* The commands, facts and the scene id are the same either way; only A1, A2 and F10 differ.
2. **Complete the minimum catalogue in M5 (aligner, chute, limit switch).** PRT-001 requires every part of the table; no reference scene needs these three (plan M4 question 5 deferred them to "the end of M5 or M7"). *Recommended default: yes, Task B4, so that M5 closes the part-building milestones and the learner editor of M7 has the whole catalogue.* If declined, they move to M7 and C4 lists them pending.
3. **A numeric variant of the conveyor speed and of the lift position (PRT-004).** The spec's Conveyors row says "speed in the numeric variant"; M1 to M4 shipped digital belts, and the lift here is digital while the crane is addressed by INT setpoints. No scene of M5 needs a second variant. *Recommended default: not in M5; record the gap in the coverage (Task C4) and add the numeric belt speed and the numeric lift setpoint in M7 together with the learner editor, when a scene or a lesson needs it.*
4. **Numeric comparison in scenario expectations (SCN-005, CRS-005), still open since M2.** Every expectation value is boolean today (`IDE/src/test-engine/index.ts:206`, L20); Task N10 of plan M2 was never merged. M5 ships without it, but scene 16's whole point (**equal** numbers of lids and bases) and the warehouse's exact stock can only be graded as "at least one" without it. *Recommended default: yes, for `fact:` names only, an exact number or `{ "min", "max" }` inclusive; existing scenarios byte-identical (Task N10, wave 1); then scenes 7, 10, 11, 16 (and the M3 and M4 scenes) are tightened in follow-up commits.* If the owner declines, M5 ships complete with boolean expectations and the balance check of scene 16 is documented as informal.
5. **Course outline approval (CRS-001), again.** Lessons 17.1 to 17.4 and 18.1 wait for it (Task L6). *Default: approve before wave 5, or accept that M5 ships its four scenes without lessons and the lessons land with M7. Spec 6.2 says milestones ship scenes with their lessons; `course-outline.md` is a draft and CRS-001 forbids a lesson before approval.*

## Findings in the spec and in M4 as merged (contradictions and things that could not be verified)
1. **The Stations row is "composite", the scenes name behaviours the spec does not define.** "Machining centre" has no stated function; scene 16 says "produce equal numbers of lids and bases". This plan defines it as a blank-to-product machine with a cycle time (rules R5-M, R5-M1); the swap of a blank for a product is the one non-physical transformation in the catalogue (PLT-009-style model event) and the part doc says so. Likewise the stacker crane's "rack" is part of the crane definition (one definition, PRT-002), not a separate part.
2. **"Lift with stacking" and "stackable crate".** The spec's scene table and the Items row do not say what is stacked. This plan reads "stackable" as crates stacking on crates (proved in the A2 test and the Q6 soak) and "gather" as items caught inside a crate; scene 10 does not itself stack crates (it would not fit the 100 s scenario budget).
3. **The word "lift" means two things.** The chain transfer already has a **signal** called `lift` that raises the module a few centimetres (`IDE/src/plant/core/parts/chainTransfer.ts:58-90`, `signals` at `:139-147`), and `ACTIVE_SUFFIXES` lists `lift` (`IDE/src/plant/view/cues.ts:38`), which matches any signal ending in `.lift`. The new part `lift` uses `up` and `down`; V7 adds `up`, `down` and pins the list order, and the docs page disambiguates.
4. **Do kinematic bodies collide with static ones?** In Jolt, static and kinematic bodies do not collide by default; this plan relies on that for the crane fork passing through the rack rails and replaces the missing collision with the inhibition R5-S4 (a deliberate mechanical interlock). **Unconfirmed** for this world's object layers (`world.ts` creates only a `moving` and a `static` layer): probe P4 of A1 settles it, and if they do collide the rails can block the fork (the inhibition then becomes a physical consequence).
5. **`bodiesInBox` and `gapBelow` see kinematic and static bodies** (`IDE/src/plant/core/world.ts:269-291`; L92): the cell, chamber and crate readers filter by `trackedItems`, or the fork, the platform, the doors and the rails would be read as items.
6. **PRT-004 for conveyors is still not met** (M4 Findings 5): `IDE/src/plant/core/parts/conveyors.ts:11-16` has no numeric speed; M5 adds none (open question 3).
7. **The rack and the exchange span.** The crane has two INT commands and eleven BOOL signals; the live exchange carries at most 64 bytes per span (`IDE/src/plant/session/exchange.ts:15`, `docs/docs/plant/numeric-signals.md:58-60`). A scene that maps all of them close together fits; **Unconfirmed**: the width of a BOOL slot in the generated declarations (S5 measures it and a failure goes back to B2 as a smaller signal set).
8. **`SCENE_ORDER` is hand-maintained** (`IDE/scripts/generate-scene-index.ts:17-30`): ids 7, 10, 11 and 16 are absent today; the parent adds them before wave 4 and updates the SCN-001 order test (`IDE/src/plant/ci/sceneCatalogue.test.ts:17-35`).
9. **N10 is still unmerged** (`fd -t f . IDE/src/test-engine` shows no `sceneCompare.test.ts`, read on 2026-11-13): a numeric reading or a balance is not assertable without it (question 4).
10. **The plant suite is slow.** One full `src/plant/ci` took 612 s with seventeen scenes (L149) and four more scenes add about a third; writers run the single scene check, the parent the whole directory once per wave. The scenario sample limit (10,000 samples, 100 s at `tickMs` 10, `IDE/src/test-engine/index.ts:18`) is the real constraint on scene 7 (one store cycle is about 25 s at default speeds).
11. **Lesson 18.1 reuses scene 11 with an emergency stop.** The `emergency-stop` part exists (`IDE/src/plant/core/parts/operable.ts:174`) and scene 11 contains one; the hardware track of 18.1 depends on the scene's shortest sensor pulse (LNK-014, M6), which F11 measures and declares.
12. **Unconfirmed baseline facts I could not read in the time given:** the behaviour of a compound dynamic body in this Jolt build (A1 P1); a long vertical carry at the maximum lift speed (A1 P2); a kinematic fork carrying a 5 kg box into rails (A1 P3); a tilted static body and the kinematic-versus-static filter (A1 P4); whether `jolt-physics` 1.1.1 exports `StaticCompoundShapeSettings` and a mass-properties override; the exact `emitter` spawn orientation for rotated boxes (F7 confirms it); the width of a BOOL slot in the generated declarations; the docs build command (D6); the requirement-evidence mechanism beyond the M2 commits (C4); the path of the worktree's runtime binary for the journeys; the shortest sensor pulse of each M5 scene (the F tasks measure them).

## Done when (aligned with spec section 7, for M5)
- [ ] The owner has the answers or accepted defaults of the open questions; the gate verdict (macOS, Windows) is recorded or the PHYS-adjacent tasks (A1, A2, B1 to B4, K10, S5, F7, F10, F11, F16, the Q6 soak) are listed as at risk.
- [ ] Task A0's contract and A1's world additions are merged and no other task changed a contract (C1 to C10 are unchanged); A1's four probe verdicts are in its commit body and in the run logbook.
- [ ] The catalogue has the crate, the lift, the stacker crane with its rack and the machining centre (and the limit switch, the aligner and the chute if question 2 was yes), each defined once with English and Spanish names, documentation, fault actions, tested on the headless core including limits (PRT-001 to PRT-003, PRT-007, PRT-008, PRT-010, PLT-011; A2, B1 to B4, K10).
- [ ] A box rides a lift and a crane fork by the physics, a crate catches and holds items and stacks, a rack cell reads a box at rest, and the machining centre never creates mass (PLT-007, PLT-008; A1, A2, B1 to B3).
- [ ] The new facts are published, graded by scenarios, told in words and filtered where boolean, and nothing is announced per scan (PLT-010, VIS-008; A2, B2, B3, K10, U5).
- [ ] The new parts are drawn with a cue other than colour, the crate is drawn open, and the faults and the emergency stop can be operated by pointer and by keyboard with choose-then-act (VIS-003, VIS-009, VIS-010; V7, U5, Q6).
- [ ] Reference scenes 7, 10, 11 and 16 pass their scenarios with the reference program and fail with the starter, in CI on Linux; their Linux hashes are pinned in `IDE/src/plant/ci/sceneHashes.json`; the scene index is regenerated in spec order and the SCN-001 order test is updated; the seventeen scenes of M1 to M4 and the six core pins keep their hashes (SCN-001 to SCN-004, PLT-006, section 7 item 2). macOS and Windows runs are the owner's until the nightly job covers them.
- [ ] Live equals graded for INT setpoints and BOOL sensors of a station, and a capture mid-lift and mid-fork restores exactly (PLT-005, PLT-012, PLT-017; S5).
- [ ] Documentation exists in English and Spanish for the stations, the crate, the lift, the crane, the machining centre and scenes 7, 10, 11 and 16, the parts reference is generated and equals the catalogue, and nothing claims a measured number that was not measured (CRS-011, CRS-013, section 7 item 8).
- [ ] If the owner approved the outline: lessons 17.1 to 17.4 and 18.1 are graded in CI in both languages (CRS-003 to CRS-005). If question 4 was approved: N10 merged and scenes 7, 10, 11 and 16 (and the earlier scenes) tightened.
- [ ] All 2.0 suites pass unchanged: lessons, plants, smoke, journeys, the content security policy test (PLT-013, section 7 item 6). `bun run typecheck`, `bun run lint`, `bun test`, `bun test ./tools/ci`, `bun tools/ci/requirement-coverage.ts --check` and the pinned formatter `--check` pass.
- [ ] The independent verifiers of A1 with B1 and B2 (kinematic carry and fork transfer, Review Focus 2, 4), K10 with A2 and B3 (hashes, Review Focus 1, 3, 5, 6, 8), N10 (if it ran) and the feature-end verifier (the four scenes: three repeated grades and the moving speeds at 0.9 and 1.1, three-process hash identity, docs against code, text and panel from real snapshots, PLT-013, the full suite) returned with no open blocker; the requirement coverage reports M5's requirements `covered`, conditional ones with their decision, later milestones `pending` (section 7 item 1).
- [ ] The tree can ship as a 2.1 pre-release.
