# ZPLC 2.1 Milestone M4 Implementation Plan: sorting sensors and diverting parts (PROVISIONAL, revision 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Provisional.** M4 builds on M3 **as merged** on `feat/plant-simulation` at commit `29655251` (`Merge branch 'fix/m3-fault-apply' into feat/plant-simulation`, read with `git rev-parse` on 2026-11-13; later polish commits of M3 may sit on top: that is fine). The gate verdict of decision D-14 is **still pending the owner's macOS and Windows runs** (`research.md` section 11): D-14 is confirmed on Linux x64 only. M4 is **physics-adjacent but lighter than M3**: the new moving parts (turntable, chain transfer, pusher, diverter arm) are kinematic bodies in the static layer, the technique of the stop blade (`core/parts/flow.ts:25-47`); the sensors read the world through the queries that already exist (`rayHit`, `bodiesInBox`, `bodies`). Tasks that load Jolt or pin a trace hash are marked **PHYS-adjacent** in the lane table (A2, A3, B1 to B5, K9, S4, F17 to F21, and the soak of Q5). If macOS or Windows overturns D-14 those tasks are redone; the pure tasks (A0, A1, V6, U4, D5, L5, C3, N10) are written against `PlantCore`, `PlantSnapshot`, `PartRuntime` and the scenario seam and survive (**KEEP**), exactly as in plans M1 to M3.

**Goal:** Deliver milestone M4 of spec 012 (spec section 6.2: "Sorting sensors and diverting parts"): items carry properties a sensor can read (a colour, metal or not, a numeric identity code, on top of the height and mass the box already has); the catalogue gains the sensors **inductive, capacitive, colour (teach-in), light array (height, numeric), scale (weight, numeric) and vision (identity code, INT)**, the diverting parts **pusher, diverter arm, chain transfer and turntable**, and a **grading** vocabulary (`sorted:<Name>`, `misrouted:<Name>` on a remover that declares what it accepts); the plant tells the new facts in English and Spanish; and reference scenes **17 (Colour separation)**, **18 (Height sorting with turntable)**, **19 (Height sorting with chain transfer)**, **20 (Weight sorting)** and **21 (Vision sorting)** ship with a reference program that passes, a starter that fails, a pinned Linux trace hash and a regenerated scene index, in English and Spanish documentation, in a state that could ship as a 2.1 pre-release.

**Architecture:** Nothing in the M1 to M3 architecture changes; M4 adds data, parts and two small pure modules. (1) **Item properties** travel the way the M3 `tag` did: they live in `ItemInfo` (`core/parts/items.ts:43-48`) and in `BodyPose` (optional fields, `contracts.ts:67-76`), never in the physics body, so **no trace changes**: the trace records poses, commands and sensed values only (`plantCore.ts:183-188`), and a scene that does not use a property publishes byte-identical facts and trace. (2) `core/classify.ts` (pure) turns an item into its height class, weight class and the `accepts` match used by the remover; the remover publishes `sorted:` and `misrouted:` **only when it declares an `accepts` other than `any`**, so every M1 to M3 scene keeps its facts and hash. (3) `core/parts/yawTable.ts` (pure, `+ - * /` only, **no libm**) is a table of yaw quaternions and direction vectors at 0.25 degree steps, so a **rotating** kinematic body (turntable, diverter arm) is posed from a table lookup each step, never from `Math.sin` in the step loop. (4) The world (`core/world.ts`) gains `setBeltAxis` and keeps the surface velocity of a **kinematic** belt waking the items on it (a chain transfer and a turntable are kinematic bodies with a surface velocity whose axis changes). (5) The sensors sample **deterministically** from the world: a ray per beam (`rayHit`), a box query in creation order (`bodiesInBox`) joined with `trackedItems` for mass, speed and properties, and the existing numeric path (REAL and INT, M2 rules R-S1 to R-X3) for `height`, `weight` and `code`. No firmware, no C, no IPC allow-list and no Electron main-process change is needed.

**Tech Stack:** TypeScript 5.9 (`erasableSyntaxOnly`: no parameter properties), React 19 with the React Compiler lint, Bun 1.3.14 (`bun test`), three 0.187.0 and `jolt-physics` 1.1.1 as in M1 (no new dependency), the Studio UI kit (`IDE/src/ui`).

**Spec:** `spec.md` sections 5 (PLT, VIS, PRT, SCN, CRS) and 6.2, reference scenes 17 to 21 of the SCN table and the catalogue rows Items, Conveyors, Flow control and Sensors; `plan-m1.md` revision 2 (contracts C1 to C8); `plan-m2.md` (contract C9, rules R-S1 to R-X3); `plan-m3.md` (axis law R-A1 to R-A4, K-lane contracts); the run logbook `odd/tasks/zplc-2-1-0-run.md` (entries L1 to L123) in the main checkout; `course-outline.md` rows 16.1 to 16.6 and 18.3. Read the spec sections of your task before you start.

**Created:** 2026-11-13 by a planning agent. Anything marked **Unconfirmed** was not verified while writing; the executor confirms it first and records the answer in the commit body. "Plan choice" marks a decision of this plan that the spec does not state.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`; `COMPILER/` is `packages/zplc-compiler/src/`; `CORE/` is `firmware/lib/zplc_core/`. `bun test`, `bun run lint` and `bunx tsc -b` run with `IDE/` as the working directory unless the step says "at the root". The pinned formatter is `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` (or `--check`), at the root.

## Roles
| Role | Does |
|---|---|
| Executor | One task each, in its lane. Writes tests first, runs the commands, commits. Never edits a file outside the task's "Allowed edit surfaces". `git add` every new file **before** running the formatter (it only sees tracked files). |
| Parent | Owns git across lanes, merges lanes in dependency order, runs the seam check (full IDE suite once) at each wave merge, adds the five scene ids to `SCENE_ORDER` (`IDE/scripts/generate-scene-index.ts:17-30`) **before wave 5**, regenerates `IDE/src/generated/sceneIndex.ts` and pins `IDE/src/plant/ci/sceneHashes.json` once per wave (so two scene tasks never edit them), adds new docs pages to `docs/sidebars.js`, adds the scene rows to `docs/docs/plant/scenes.md` and its Spanish twin, runs `format --write` after each merge batch, and launches the independent verifiers named in "Done when". |
| Owner | Records the gate verdict (macOS, Windows), answers the open questions at the end (question 1 gates Task N10; question 3 selects the route of Task B4; question 4 gates the `sensor-colour` part in B1), approves `course-outline.md` (CRS-001; gates Task L5), runs the macOS and Windows hash and evidence runs. |

## Start rule
1. **Precondition A, M3 as merged.** `feat/plant-simulation` at `29655251` or later: `fd -t f . IDE/src/plant/core/parts` shows `axis.ts conveyors.ts flow.ts gripper.ts indicators.ts items.ts layerPalletizer.ts manipulators.ts operable.ts panel.ts process.ts sensors.ts sources.ts`; `fd -t d . IDE/plant-scenes -d 1` lists twelve scenes; `IDE/src/plant/ci/sceneHashes.json` has twelve Linux entries; `IDE/src/plant/core/hashes.json` has four pins. If not, stop: the parent merges first.
2. **Precondition B, the gate.** Not blocking for M4 (see the provisional note), but the owner's verdict decides whether the **PHYS-adjacent** tasks are redone. The plan proceeds at risk, as M1 to M3 did. If the probe of Task A2 Step 1 shows a kinematic body cannot carry an item with a surface velocity, Task B4 takes the shuttle fallback of open question 3 and says so in its commit body; that is not a gate failure.
3. **Fresh worktree.** `export TMPDIR=$HOME/.cache/zplc-tmp` (create it with `mkdir -p`), `bun install`, `bun run build:compiler`, `bun run build:runtime`; in `packages/zplc-ide/node_modules/electron` run `node install.js`, and run `bun run electron:compile` in `IDE/`, before any journey or the screen-reader capture (see Global Constraints).
4. **Order.** Wave 1 first. Tasks B4 and B5 wait for A2's probe verdict; B5 and B3 wait for A1; B1 and B2 wait for A3.

## Requirement mapping
Requirements that M4 does not deliver are listed in the last table so nothing is silently dropped.

| Requirement | Task(s) | Note |
|---|---|---|
| PRT-005 | B2 | "The vision sensor MUST report the identity of the item in view as a code; the light array MUST report height; the scale MUST report weight. Each has a documented range." Ranges (Plan choice): vision `code` INT 0 to 9 (0 = nothing in view or an unlabelled item); light array `height` REAL 0 to `beams * pitchM` m (default 0.6); scale `weight` REAL 0 to `rangeKg` kg (default 20). Each is in the part doc and the generated reference (D5). |
| PRT-006 | B1, B2 | "Sensors MUST react to the property they name: an inductive sensor to metal items only, a capacitive sensor to any item, an optical sensor to anything that breaks its beam." Inductive: metal items only (B1). Capacitive: any item (B1). Colour: the item's colour (B1). Light array: the beams a body breaks; scale: mass; vision: code. |
| PRT-001 (Items row) | A3 | "coloured part in two colours, metal and non-metal variants": one new item part, `workpiece` (colour red or blue, material plastic or metal, a code, a mass). The "Box in three heights and two masses" row was delivered in M1 (`items.ts:85-95`). The stackable crate stays with M5 (question 5). |
| PRT-001 (Conveyors row) | B4, B5 | "chain transfer, turntable". The lift is M5. |
| PRT-001 (Flow control row) | B3 | "pusher, diverter arm". Aligner and chute are not needed by scenes 17 to 21 and wait (question 5). |
| PRT-001 (Sensors row) | B1, B2 | "inductive, capacitive, light array for height, scale for weight, vision sensor". The limit switch is not a part of M4 (Findings 4). |
| PRT-002 | all part tasks, D5 | One definition per part; names, configuration, signals, actions, docs from it; the generated reference is compared in CI. |
| PRT-003 | B1 to B5 | "A part's behaviour MUST be tested on the headless core, including its limits (speed, stroke, load)." Limits tested: stroke and speed of the pusher (reuses the M3 axis law), angle and speed of the turntable and the arm, lift travel of the chain transfer, range of every sensor and of every numeric reading. |
| PRT-004 | B5 (partly) | "Where a reference scene needs both, a part MUST offer a digital variant (commands and limit sensors) and a numeric variant (setpoint and feedback)." No scene of M4 needs both on a diverter: the turntable, chain transfer, pusher and arm are **digital**; the numeric parts of M4 are sensors. Recorded in Findings 5 and question 8. |
| PRT-007 | B3, B4, B5 | Snap points (the schematic footprint comes from them, `IDE/src/plant/schematic/schematic.ts:25-34`). |
| PRT-008 | B1 to B5 | "Each part SHOULD define the fault actions a diagnosis lesson needs: at least a sensor stuck on or off, an actuator that does not move, and an item jam where the part can jam." Faults in the signal tables. |
| PRT-009 | V6 | Geometry in code; no asset. |
| PRT-010 | A3, B1 to B5 | A test adds each part without a change to the scene format version, the link or the lesson code. |
| PLT-006 | A1, A2, A3, B3, B4, B5, K9, S4, F17 to F21 | "The same scene, program and input script MUST produce the same signal trace and the same plant facts on Linux, macOS and Windows and on repeated runs." The yaw table uses `+ - * /` only (Taylor series), so a rotating body does not depend on the platform's `Math.sin`; item draws use the seeded generator only when `vary` is not `none`; two core hashes (`m4-diverters-v1`, `m4-sorting-v1`) and five scene hashes are pinned on Linux; macOS and Windows are the owner's. |
| PLT-007 | A2, B3, B4, B5 | "Items MUST have mass, friction and collision. They are carried, pushed, stacked, lifted, gripped, dropped and blocked by the physics, not by a script: a box pushed off a belt falls." Pushed: the pusher and the arm are kinematic bodies that move items by contact. Carried: the turntable and the chain transfer carry items by friction and by a surface velocity. |
| PLT-008 | Q5 | "An item at rest MUST stay at rest, without drift or jitter, for ten simulated minutes." M4 adds an item at rest on a stopped turntable and on a raised chain transfer (Q5 soak). |
| PLT-010 | A3, B1 to B5, K9, U4 | "The core MUST expose named plant facts about what happened: items produced, delivered, dropped and collided, positions reached, levels. Scenarios, the text equivalent of VIS-008 and the trace all read the same facts." New facts: `sorted:<Name>`, `misrouted:<Name>`, and `count:<Name>` for the new beam sensors (table "Facts" below). |
| PLT-011 | B1 to B5 | "A part MAY define fault actions (a jammed item, a stuck sensor, an actuator that does not move). A person, a lesson or a scenario script triggers them." Seven new action names, each with a `plant.action.*` label in both languages (U4). |
| PLT-012 | K9, S4 | Capture and restore replay the journal (`plantCore.ts:310-337`); a capture while an item rides a rotating turntable restores to the same exact state (S4). |
| PLT-016 | A3, B1 to B5, K9 | Located messages for an unknown `accepts`, a code outside 0 to 9, a numeric reading outside its range, a scale `rangeKg` the map does not declare (the M2 R-S3 message). |
| PLT-017 | S4 | One implementation: INT `code` and REAL `height` and `weight` go through `exchangeScan` for both paths. S4 proves live equals graded for a sorting scene. |
| VIS-003 | V6 | "The view MUST show the state that matters for control: sensor beams and whether they detect, actuator state, and the signal name of a part on hover and on focus. It MUST use the signal vocabulary of UX-009, with a cue other than colour for every state." Beam sensors draw their beam with their real range (Findings 2); diverters tell raised, turned, extended with a marker and text; numeric sensors show their reading as text. |
| VIS-008 | U4 | New facts are integer counts, announced on change, silent at 0. Continuous values (height, weight, an angle) **never** enter the change key. |
| VIS-009 | V6 | The two part colours and the metal tone stay three different tones in every display mode, and high contrast outlines items and the new parts. |
| VIS-010 | U4, Q5 | The new parts are not panel parts; the generic fault control (choose, then act, `OperatePanel.tsx:50-80`) already lists every part that has actions. Q5 covers the keyboard-only fault journey. |
| VIS-011 | U4, D5 | English and Spanish; Studio component kit. |
| SCN-001 to SCN-004 | F17 to F21 | Five scenes, original layouts, reference passes, starter fails, in CI. |
| SCN-005 | N10, F17 to F21 | "A scenario MUST be able to script panel inputs, item emission and fault actions at virtual times, and to assert on plant facts with the expectation kinds that exist today." Sorting is graded by boolean facts (`misrouted:<Name>` never, `sorted:<Name>` eventually). Exact counts need the numeric comparison (open question 1). |
| SCN-007 | F17 to F21 | Each scene declares `shortestPulseMs`. |
| SCN-011 to SCN-013 | S4 | The M2 editor handles REAL and INT signals; S4 checks the declaration generator on a map with an INT code, a REAL height and a REAL weight. |
| CRS-003 to CRS-006, CRS-008, CRS-011 (M4 scenes) | L5, D5 | Lessons 16.1 to 16.6 and 18.3. **Conditional** on the owner approving `course-outline.md` (CRS-001). 16.2 is the Instruction List lesson (CRS-008). |

**Not delivered by M4** (later milestones, per spec 6.2, or out of scope): the stackable crate, the lift, the stacker crane and the machining centre (M5); the aligner and the chute (question 5; nothing in scenes 17 to 21 needs them, so they wait for M5 with the other missing catalogue rows); the limit switch part (Findings 4); a numeric variant of a conveyor's speed, a turntable angle setpoint, a pusher position setpoint (PRT-004, Findings 5, question 8); a scale that measures contact force (the scale sums masses of items at rest, question 6); a vision sensor that processes an image (spec section 4.3: "The vision sensor reports an identity code, not a processed image"); drawing an item's code in the 3D view (the code is told by the vision readout); adding a workpiece from the operate panel (the panel adds boxes only; `core.addItem` gains the kind, the panel does not, Findings 7); LNK-007 to LNK-018 (M6); CRS-001, CRS-002, CRS-007 (the rest), CRS-009, CRS-010, CRS-012, CRS-013 (M6 and M7); scenes 1 to 16 (other milestones, done).

## Contract extensions (types and rules; lanes code against these, never against each other)
M4 **extends** contracts C1 to C10 of plans M1 to M3; it changes none of them. Task A0 writes the type changes of `contracts.ts`. Task A2 writes the world additions in `world.ts` (they are code, so A2 owns them). Changing one needs the parent: every lane depends on it.

```ts
// IDE/src/plant/contracts.ts  (Task A0; every other declaration stays as merged in M3)

/** C3 amended: optional properties of an item that a sensor reads and the view draws. Pallets have none. */
export type ItemColour = 'red' | 'blue';
export interface ItemProps {
  colour?: ItemColour;
  /** True for a metal item (an inductive sensor sees only these). Absent means false. */
  metal?: boolean;
  /** An identity code 1 to 9 a vision sensor reads; absent means unlabelled (0). */
  code?: number;
}
export interface BodyPose extends ItemProps {
  // ...existing fields (id, part, kind, size, p, q, tag?)...
}
```

```ts
// IDE/src/plant/core/classify.ts  (Task A3; pure, no import but types)
export type HeightClass = 'short' | 'medium' | 'tall';
export type WeightClass = 'light' | 'heavy';
export const ACCEPTS = ['any', 'red', 'blue', 'metal', 'plastic', 'light', 'heavy', 'short', 'medium', 'tall', 'code'] as const;
export type Accepts = (typeof ACCEPTS)[number];
export interface ClassifyInput extends ItemProps { size: Vec3; massKg: number }
export declare function heightClassOf(heightM: number): HeightClass;
export declare function weightClassOf(massKg: number): WeightClass;
/** `code` is the `acceptsCode` of the remover (1 to 9). An item with no colour never matches `red` or `blue`. */
export declare function matches(accepts: Accepts, item: ClassifyInput, code: number): boolean;

// IDE/src/plant/core/parts/yawTable.ts  (Task A1; pure, `+ - * /` only, no Math function at all)
export interface YawEntry { q: Quat; cos: number; sin: number } // q = yawQuat(deg); (cos, sin) of the angle in degrees
export declare const YAW_STEP_DEG: 0.25;
/** The entry for an angle in degrees, rounded to the nearest 0.25 and wrapped into -360 to 360. */
export declare function yawEntry(deg: number): YawEntry;

// IDE/src/plant/core/world.ts  (Task A2; the existing members stay as merged, `world.ts:26-59`)
export interface PhysicsWorld {
  // ...existing members...
  /** Changes the world-space surface-velocity axis of belt `id` (a unit vector in the xz plane). Throws a located Error for an unknown belt. */
  setBeltAxis(id: string, axis: Vec3): void;
  /** The current surface speed of belt `id` in m/s along its axis (after the acceleration ramp); throws a located Error for an unknown belt. */
  beltSpeed(id: string): number;
}
// `addBelt` on a body whose motion is 'kinematic': the belt's wake box is recomputed from the body's CURRENT bounds on every step in which
// its speed or its pose changed, so a resting item is woken when a kinematic belt starts or rises.
```

```ts
// IDE/src/plant/core/parts/items.ts  (Task A3; the existing members stay as merged, `items.ts:43-79`)
export interface ItemInfo extends ItemProps { kind: 'item' | 'pallet'; size: Vec3; massKg: number; tag?: ItemTag }
// spawnItem gains one optional last parameter `props?: ItemProps`; ItemInfo carries only the keys that are set (so a plain box has the
// same ItemInfo object shape as before).
```

**Rules (fixed here, written once, tested in the task named):**
- **R4-P1 properties (A3).** `colour` is `'red'` or `'blue'`; `metal` is a boolean; `code` is an integer 1 to 9. An item with no property has none of the keys. The `workpiece` part and the emitter set them from configuration (table below); a box has none.
- **R4-C1 classes (A3).** `heightClassOf(h)`: `h <= 0.25` short, `h <= 0.35` medium, else tall (the three box heights 0.2, 0.3, 0.4 are the three classes with 50 mm margin). `weightClassOf(m)`: `m <= 3.5` light, else heavy (the two box masses 2 and 5 kg). `matches`: `any` is always true; `red` and `blue` compare `colour`; `metal` is `metal === true`, `plastic` is `metal !== true` (pallets never match a class: a remover that `accepts` a class and receives a pallet counts it `misrouted`); `code` compares `code` with the remover's `acceptsCode`. The thresholds are **starting values**; the executor may tune them inside the margins above and states the final values in the part docs.
- **R4-V1 emitter variety (A3).** Emitter config `vary`: `none` (default), `colour`, `weight`, `code`. With `none` the emitter draws **nothing** from the seeded generator (so every M1 to M3 scene keeps its hash). With any other value each emit draws **one** number `rng()` **after** the existing draws of `sources.ts:73-75`: `colour` picks red below 0.5 else blue (workpiece only); `weight` picks the box mass from `BOX_MASSES` by `floor(rng() * 2)` (box only); `code` picks `1 + floor(rng() * codes)` (any kind that carries a code: workpiece, box). A `vary` that does not apply to the emitted kind has no effect (scene validation has no cross-field hook, Findings 8) and the part doc says so.
- **R4-D1 beam sensors (B1).** Each step, after the world step, a beam is cast with `rayHit(from, to)` as `sensors.ts:40` does. The inductive sensor detects when the hit item is tracked and `metal === true`; the capacitive sensor when the hit is a tracked item or pallet; the colour sensor sets `detect` for any tracked hit and `match` when the hit item's `colour` equals the `target` setting. The count fact counts rising edges of `detect`, as the optical sensors do (`sensors.ts:41`).
- **R4-D2 light array (B2).** `beams` rays cast across the line at heights `(i + 0.5) * pitchM`, `i = 0 .. beams - 1`, each from the part position across `spanM` along local +z. `height = (i + 1) * pitchM` for the **highest** beam `i` that hits a tracked item (the top edge of what is in the beam, quantised down to the pitch; a lid on a base reads the top of the lid), 0 when none. `detect` is true when any beam hits. With the default pitch 0.05 the three box heights read 0.20, 0.30, 0.40 exactly (top edge 0.201 sits between beams 3 and 4; margin 24 mm).
- **R4-D3 scale (B2).** The weighing volume is a box `lengthM` (local x) by `widthM` (local z) by `heightM` (up), its floor at the part's y. Each step the scale lists `world.bodiesInBox` of the volume in creation order and keeps the tracked **items and pallets**. It is **stable** when it holds at least one item, every item has speed at most 0.05 m/s, and that has been true for `settleMs` of plant time. `weight` is the sum of `massKg` of the items inside, rounded to 0.01, **while stable**; otherwise `weight` is 0. Plan choice: a static scale; contact force is not read (question 6). The reading is bit-exact: a sum in creation order of rounded masses.
- **R4-D4 vision (B2).** The field is a square `fieldM` by `fieldM` (local x, z) centred on the part position, from its y up `heightM`. `code` is the `code` property of the tracked item whose **centre** is inside the field and nearest to the field centre (ties by creation order), 0 when none or when that item has no code. `detect` is true while any tracked item is in the field. There is no trigger and no latency. Faults: `blind` reads 0; `misread` reads `code % 9 + 1`.
- **R4-A1 pusher (B3).** One plate (kinematic body in the static layer) at the part position, its face along local +x of width `widthM` and height `heightM`, whose bottom is 0.005 m above the part's y. It moves along local **+z** with the M3 axis law `stepAxis` (`core/parts/axis.ts:24`): `goto(strokeM)` while `extend` is TRUE, else `goto(0)`; `extended` is `p >= strokeM - AT_LIMIT_M`, `retracted` is `p <= AT_LIMIT_M`. The plate pushes by contact (PLT-007).
- **R4-A2 diverter arm (B3).** One plate of length `lengthM` hinged at the part position, lying along local +x at rest (`home`), swinging towards local +z by `angleDeg` while `divert` is TRUE and back otherwise, at `degPerS`. Its pose each step is a **table lookup** (`yawEntry`), never a trig call; `diverted` is TRUE within 0.5 degrees of `angleDeg`, `home` within 0.5 degrees of 0.
- **R4-T1 chain transfer (B4).** A module `lengthM` by `widthM` whose top is the belt top when **lowered** and `liftM` higher when **raised** (a kinematic body in the static layer carrying a surface velocity). While lowered it moves items along local +x (`run`, and `runReverse` when `allowReverse`), like a belt. While raised (`lift` TRUE, after the travel time) it moves items sideways: `moveRight` along local +z, `moveLeft` along local -z (**right is +z** for a part whose forward is +x). The axis of the surface velocity changes **only while its speed is 0** (the part stops the surface before it switches, rule R4-T2). Travel `liftTravelMs` 400. `raised` and `lowered` report the limits.
- **R4-T2 axis switch (B4, B5).** A kinematic belt changes axis, mode or angle only after its surface speed has ramped to 0; the commands in conflict (`moveLeft` with `moveRight`, `run` with `lift`) do nothing, as the conveyor's `run` with `runReverse` does (`conveyors.ts:99-103`).
- **R4-R1 turntable (B5).** A square platform `sizeM` by `sizeM` (a kinematic body in the static layer) that turns about its vertical centre axis to three positions: centre (0 degrees), left (`-angleDeg`) and right (`+angleDeg`), at `degPerS`, and carries items by friction and by a belt surface velocity along its **current** local +x (`run`, `runReverse`). `toLeft` TRUE targets left, `toRight` TRUE targets right, neither targets centre, both hold the current angle. Sensors `atCentre`, `atLeft`, `atRight` are TRUE within 0.5 degrees. Pose and belt axis each step come from `yawEntry` (A1).
- **R4-X (inherited).** Inside the core a numeric signal is an engineering value in its unit; at the exchange it is raw (M2 rules R-S1, R-S2, R-X, R-X1 to R-X3 apply unchanged). Every numeric sensor reading is inside its declared `range` by construction (a `Math.min`), so no value saturates silently.
- **Determinism restatement (M4).** The per-step state update of every M4 part, of `classify.ts` and of `yawTable.ts` uses `+ - * /`, comparisons, `Math.abs`, `Math.min`, `Math.max`, `Math.round`, `Math.floor`, `Math.fround` and `Math.sqrt` (correctly rounded by IEEE 754). **No `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan2` or `Math.pow` in a step loop.** The yaw table computes its sine and cosine at module load with a Taylor series in basic operators; the existing build-time geometry (`rotateY`, `yawQuat`, `conveyors.ts:42-52`) keeps using `Math` as in M1 to M3 (Findings 8 of plan M3).

**Part signal tables (names are API for scenes, maps and scenarios; `<Name>` is `ScenePart.name`).** Plan choice throughout. Axis conventions as plan M3: X along the part (local +x, turned by `rotationYDeg`), Y up, Z across; **right is local +z**. A sensor's position is its beam origin; a belt-like part's position is the centre of its top surface (`conveyors.ts:5`).

| Part id | Family | Signal | Direction | Type | Range, unit | Config (key: range, default) | Fault actions |
|---|---|---|---|---|---|---|---|
| `workpiece` | items | none | | | | `colour`: red or blue, red; `material`: plastic or metal, plastic; `code`: 0 to 9, 0; `mass`: 0.1 to 5, 0.5 kg. A 0.2 by 0.2 m block, 0.1 m high | |
| `sensor-inductive` | sensors | `detect` | sensor | BOOL | | `rangeM`: 0.02 to 0.3, 0.1; `heightM`: 0 to 2, 0.1 | `stuckOn`, `stuckOff` |
| `sensor-capacitive` | sensors | `detect` | sensor | BOOL | | `rangeM`: 0.02 to 0.5, 0.15; `heightM`: 0 to 2, 0.1 | `stuckOn`, `stuckOff` |
| `sensor-colour` | sensors | `detect`, `match` | sensor | BOOL | | `rangeM`: 0.05 to 1, 0.3; `heightM`: 0 to 2, 0.1; `target`: red or blue, red | `stuckOn`, `stuckOff`, `wrongColour` |
| `light-array` | sensors | `height`; `detect` | sensor | REAL, BOOL | `height`: 0 to `beams * pitchM`, `m` | `beams`: 4 to 32, 12; `pitchM`: 0.025 to 0.1, 0.05; `spanM`: 0.4 to 1.2, 0.8 | `readingStuck`, `readingOffset` |
| `scale` | sensors | `weight`; `stable` | sensor | REAL, BOOL | `weight`: 0 to `rangeKg`, `kg` | `rangeKg`: 5 to 200, 20; `lengthM`: 0.3 to 1.5, 0.6; `widthM`: 0.3 to 1.2, 0.6; `heightM`: 0.2 to 1, 0.5; `settleMs`: 0 to 2000, 300 | `readingStuck`, `readingOffset` |
| `vision-sensor` | sensors | `code`; `detect` | sensor | INT, BOOL | `code`: 0 to 9, `code` (unit text) | `fieldM`: 0.2 to 1, 0.5; `heightM`: 0.2 to 1, 0.5 | `blind`, `misread` |
| `pusher` | flow | `extend`; `extended`, `retracted` | command; sensor | BOOL | | `strokeM`: 0.2 to 1, 0.6; `widthM`: 0.2 to 0.8, 0.4; `heightM`: 0.1 to 0.4, 0.25; `speedMps`: 0.2 to 1.5, 0.8; `accelMps2`: 1 to 10, 4 | `stuck` |
| `diverter-arm` | flow | `divert`; `diverted`, `home` | command; sensor | BOOL | | `lengthM`: 0.4 to 1.2, 0.8; `heightM`: 0.1 to 0.4, 0.25; `angleDeg`: 15 to 60, 35; `degPerS`: 30 to 180, 90 | `stuck` |
| `chain-transfer` | conveyors | `run`, `runReverse` (when `allowReverse`), `lift`, `moveLeft`, `moveRight`; `raised`, `lowered` | command; sensor | BOOL | | `lengthM`: 0.6 to 1.2, 0.8; `widthM`: 0.4 to 0.8, 0.6; `speedMps`: 0.1 to 1, 0.5; `accelMps2`: 0.1 to 5, 1; `liftM`: 0.01 to 0.05, 0.02; `allowReverse`: boolean, false | `stall`, `liftStuck`, `jam` |
| `turntable` | conveyors | `run`, `runReverse` (when `allowReverse`), `toLeft`, `toRight`; `atCentre`, `atLeft`, `atRight` | command; sensor | BOOL | | `sizeM`: 0.6 to 1.2, 0.9; `speedMps`: 0.1 to 1, 0.5; `accelMps2`: 0.1 to 5, 1; `angleDeg`: 30 to 90, 90; `degPerS`: 30 to 120, 90; `allowReverse`: boolean, false | `stall`, `turnStuck`, `jam` |

Additions to existing parts (Task A3, all optional with a default that keeps the M1 to M3 behaviour): **emitter** `kind` gains `workpiece`; `vary`: `none`, `colour`, `weight`, `code`, `none`; `codes`: 1 to 9, 3 (the largest code `vary: code` draws); `colour`, `material`, `code` for a workpiece emitter as the `workpiece` row; `box` gains `code`: 0 to 9, 0 (a box may carry a code; scene 21 uses it); **remover** gains `accepts`: one of `ACCEPTS`, `any`; `acceptsCode`: 0 to 9, 0 (used when `accepts` is `code`). Faults on the stuck/offset family: `readingStuck` holds the last reading; `readingOffset` adds one pitch to `height` (clamped to the range) or 2 kg to `weight`; `wrongColour` inverts `match`; `liftStuck` freezes the lift travel; `turnStuck` freezes the angle; `stall` stops the surface velocity (as the conveyor's); `jam` adds a fixed bar across the part (as `conveyors.ts:110-126`).

**Facts (plan choice; names are API for scenarios, the text equivalent and the trace).**

| Fact | Owner | Meaning |
|---|---|---|
| `sorted:<Name>` | a remover whose `accepts` is not `any` | Items removed that match `accepts` (rule R4-C1). Integer, monotonic. |
| `misrouted:<Name>` | the same remover | Items removed that do not match. Integer, monotonic. `sorted + misrouted` equals the existing `delivered:<Name>`. |
| `count:<Name>` | `sensor-inductive`, `sensor-capacitive`, `sensor-colour`, `light-array`, `scale`, `vision-sensor` | Rising edges of `detect` (the optical sensors' existing fact, `sensors.ts:45`). `scale` and `vision-sensor` publish none (Plan choice: a reading is a signal). |

A remover with `accepts` `any` publishes exactly the facts it published in M3 (`delivered:<Name>` only): **a scene of M1 to M3 reads the same facts**. The fact grammar of `IDE/src/plant/ci/sceneCheck.ts:29-49` learns `sorted` and `misrouted` in K9. Readings (`height`, `weight`, `code`) are **signals, not facts**: a scenario that wants a value asserts on a program output (N10 would extend this to ranges).

**View state keys (so V-lane tasks code against fixed names).** The view `part` field (the **view kinds**) is always the part's own name and **must match exactly what the view, the cues and the panel switch on** (M1 shipped `'curve'` and `'blade'` cases that never matched `'curved'` and `'stop-blade'`): `'sensor'` (the three BOOL beam sensors, the existing kind), `'light-array'`, `'scale'`, `'vision-sensor'`, `'pusher'`, `'diverter-arm'`, `'chain-transfer'`, `'turntable'`, `'workpiece'`. Every beam sensor view now publishes `state.beamLength` = its `rangeM` (Findings 2). A numeric sensor view has `state = { text, fraction, ...}` where `text` is `0.30 m`, `3.50 kg, stable` or `code 2`, and `fraction` is the reading over its range, so `cuesFor` shows the value (`cues.ts:64-69`). A diverter view has `state = { fraction, text }` (`fraction` is the extension, the angle over `angleDeg`, or the lift over `liftM`; `text` reads `extended`, `retracted`, `raised`, `lowered`, `left`, `centre`, `right` as the catalogue gives them), `signals` hold the part's own signals, and its pose is the **moving body** (plate, arm, module, platform). The `colour`, `metal` and `code` of an item travel in `BodyPose` (snapshot `items` and the `workpiece` part view).

## Lanes and dependency graph
**KEEP** = survives any gate outcome. **PHYS-adjacent** = loads Jolt through `createPlantCore` or `createWorld`, or pins a trace hash, so it is re-run if D-14 is overturned.

| Lane | Task | Title | Kind | Depends on | Lane-owned surface (summary) |
|---|---|---|---|---|---|
| A | A0 | Contract extensions: item properties on the pose | KEEP | M3 | `IDE/src/plant/contracts.ts` |
| A | A1 | Yaw table: rotating poses without libm | KEEP | M3 | `IDE/src/plant/core/parts/yawTable.ts` |
| A | A2 | World: surface-velocity axis, kinematic belts, probe | PHYS-adjacent | M3 | `IDE/src/plant/core/world.ts`, `world.divert.test.ts` |
| A | A3 | Item properties, workpiece, emitter variety, remover grading | PHYS-adjacent | A0 | `IDE/src/plant/core/classify.ts`, `IDE/src/plant/core/parts/{items,sources}.ts` |
| A | N10 | Numeric and ranged conditions on plant facts (**conditional on open question 1**; plan M2 Task N10, still unmerged) | KEEP | owner answer | `IDE/src/test-engine/index.ts` |
| B | B1 | Beam sensors: inductive, capacitive, colour; the beam draws its range | PHYS-adjacent | A0, A3 | `IDE/src/plant/core/parts/sensors.ts` |
| B | B2 | Numeric sensors: light array, scale, vision | PHYS-adjacent | A0, A3 | `IDE/src/plant/core/parts/sensorsNumeric.ts` |
| B | B3 | Pusher and diverter arm | PHYS-adjacent | A1 | `IDE/src/plant/core/parts/diverters.ts` |
| B | B4 | Chain transfer | PHYS-adjacent | A2, A1 | `IDE/src/plant/core/parts/chainTransfer.ts` |
| B | B5 | Turntable | PHYS-adjacent | A2, A1 | `IDE/src/plant/core/parts/turntable.ts` |
| V | V6 | View: new parts, beam range, item colours | KEEP | A0 (contract only) | `IDE/src/plant/view/{geometry,cues,renderer}.ts` |
| U | U4 | Readouts, fact sentences, fault labels, strings | KEEP | A0 (contract only) | `IDE/src/plant/ui/{OperatePanel,NumericControls}.tsx`, `IDE/src/plant/text/describe.ts`, `IDE/src/i18n/catalog/plantView.ts` |
| C | K9 | Core integration: register parts, `addItem` kind, pose props, grammar, pinned hashes | PHYS-adjacent | A3, B1 to B5 | `IDE/src/plant/core/plantCore.ts`, `IDE/src/plant/core/hashes.json`, `IDE/src/plant/ci/sceneCheck.ts` |
| D | D5 | Docs EN/ES: sorting, diverters, item properties, scenes, parts reference | KEEP | B1 to B5, A3 | `docs/docs/plant/*`, `docs/i18n/es/.../plant/*`, `docs/sidebars.js`, `tools/docs/plant-parts-reference.ts` |
| S | S4 | Live equals graded for a sorting scene; capture mid-rotation | PHYS-adjacent | K9 | `IDE/src/plant/ci/liveVersusGradedSorting.test.ts`, `IDE/src/plant/ci/fixtureSorting/*` |
| F | F17 | Scene 17, Colour separation | PHYS-adjacent (hash) | K9, U4 | `IDE/plant-scenes/colour-separation/*` |
| F | F19 | Scene 19, Height sorting with chain transfer | PHYS-adjacent (hash) | K9, U4 | `IDE/plant-scenes/height-sorting-chain/*` |
| F | F20 | Scene 20, Weight sorting | PHYS-adjacent (hash) | K9, U4 | `IDE/plant-scenes/weight-sorting/*` |
| F | F18 | Scene 18, Height sorting with turntable | PHYS-adjacent (hash) | K9, U4 | `IDE/plant-scenes/height-sorting-turntable/*` |
| F | F21 | Scene 21, Vision sorting | PHYS-adjacent (hash) | K9, U4, S4 | `IDE/plant-scenes/vision-sorting/*` |
| L | L5 | Lessons 16.1 to 16.6 and 18.3 (**conditional on the course-outline approval**) | KEEP | F17 to F21 | `IDE/lessons/plant-*` (seven) |
| Q | Q5 | Journeys: fault by keyboard on a sorting scene, readouts; rest soak on kinematic surfaces | PHYS-adjacent (soak) | U4, F20, F21 | `IDE/scripts/journeys/plantSorting.ts`, `IDE/src/plant/core/parts/sortSoak.test.ts` |
| Q | C3 | Requirement coverage and indexes for the M4 requirements | KEEP | all | `tools/ci/requirement-*`, generated indexes |

**Graph.**
```
A0 -+-> A3 -+-> B1 -+
    |       +-> B2 -+
A1 -+-> B3 -+       +-> K9 -+-> F17 / F19 / F20 / F18 (parallel) -> F21 -> L5 (conditional)
A1, A2 -> B4, B5 ---+       +-> S4 -> F21
A0 -> V6 ; A0 -> U4         +-> Q5 (also U4, F20, F21)
N10 -> (tightens F17 to F21, M3 scenes 13 and 15) ; K9, B1 to B5, A3 -> D5 ; all -> C3
```
**Parallel waves** (tasks of a wave have disjoint file surfaces and may run together; the parent merges at the end of each wave and runs the seam check):
1. **A0, A1, A2, A3** (A3 types against A0's contract; if A0 is not merged yet, A3 starts after it), and **N10** (only after the owner answers question 1). A0 is a one-line contract task: merge it first, then start A3.
2. **B1, B2, B3, B4, B5, V6, U4.** B4 and B5 need A2's probe verdict; B1 and B2 need A3 merged; B3, B4, B5 need A1 merged. V6 and U4 code against the contract and fakes.
3. **K9, D5.**
4. **S4, F17, F19, F20, F18.** (F-tasks never edit the scene index or the hash file: the parent does. They need K9 merged; U4 for the operate panel and fact text only.)
5. **F21** (after S4: its map carries an INT code, and S4 proves the INT path live equals graded), **Q5**, **L5** (only after the outline approval).
6. **C3.**

Shared files and who edits them: `world.ts` only A2; `plantCore.ts` and `sceneCheck.ts` only K9; `items.ts`, `sources.ts` and `classify.ts` only A3; `sensors.ts` only B1; `contracts.ts` only A0; `geometry.ts`, `cues.ts`, `renderer.ts` only V6; `describe.ts`, `plantView.ts` catalogue, `OperatePanel.tsx`, `NumericControls.tsx` only U4; `test-engine/index.ts` only N10; `tools/docs/plant-parts-reference.ts` only D5; `docs/sidebars.js`, `docs/docs/plant/scenes.md` (and its Spanish twin), `IDE/scripts/generate-scene-index.ts`, `IDE/src/generated/sceneIndex.ts` and `sceneHashes.json` only the parent.

## Global Constraints
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
- **M2 lessons (run logbook L56 to L83), now rules.**
  - **`/tmp` may be out of inodes** (L59): `export TMPDIR=$HOME/.cache/zplc-tmp` before anything that creates temporary directories (native runtime tests, scratch worktrees, journeys).
  - **A fresh worktree needs `node install.js` in `packages/zplc-ide/node_modules/electron` and `bun run electron:compile`** before journeys or the screen-reader capture (L75).
  - **Monaco traps Tab** (L73): a keyboard walk that crosses the code editor presses **Ctrl+M** first to leave it.
  - **Continuous facts never enter `describePlant`'s change key** (L76): positions, levels and volumes are continuous. M3's `axis:` facts join the `CONTINUOUS` prefixes of `describe.ts:7` (U3), and a test keeps the key stable over a whole axis move.
  - **`apply` validates type and range before the journal** (L63): a refused call leaves state and trace hash unchanged. A part never relies on a later check.
  - **The scene JSON schema rejects unknown top-level keys** (`sceneSchema.ts:29`): tuned gains, positions and timings of a scene live in the reference program and the commit body, never in new scene keys.
  - **Tests that assert a store precondition set it themselves** (`patchStore`), never inherit it (L79).
  - **Scene index and pinned hashes are parent-owned** (L65, L67): a scene writer restores `IDE/src/generated/sceneIndex.ts` and `IDE/src/plant/ci/sceneHashes.json` (`git checkout --`) before committing; the parent regenerates and pins them.
  - **A scenario has at most 10,000 samples** (`test-engine/index.ts:18`): at `tickMs` 10 that is 100 s of virtual time. A scene that cannot finish in that time is tuned (speeds within their config ranges) or reported; the limit is not raised.
- **Verification commands (per task, in this order).** In `IDE/`: `bun test <the task's test paths>`, `bunx tsc -b`, `bun run lint`. At the root, once at the end of the task: `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --check`, `bun test ./tools/ci` (the ci tooling suite, including the line-length and product-name tests), `bun tools/ci/requirement-coverage.ts --check`. A task that touches docs also runs `bun test tools/docs` (needs the runtime built). The parent runs the full IDE suite (`bun test` in `IDE/`) at each wave merge.
- **Determinism.** No `Date`, `Math.random`, `performance.now` or unordered iteration in `IDE/src/plant/core/**`; the per-step math is the "Determinism restatement" above (the M2 sentence "no `Math` beyond `abs`, `min`, `max`, `round`, `floor`, `fround`" cannot hold literally for the whole directory, Findings 8). Every collection that feeds an order (attached items, `bodiesInBox`, held items, pending releases) is in creation or attach order. A seeded generator only where randomness is a feature (M3 has none).
- **Security posture and dependencies.** Unchanged: sandboxed renderer, content security policy as is, no remote asset, **no new dependency** (`AGENTS.md` guideline 6). M3 touches no file under `IDE/electron/` and no C.
- **No physical operations.** Nothing here flashes, deploys, opens a serial port, forces I/O on a board or starts plant I/O mode. The only "force" in M3 is the simulated runtime's force-aware memory write, exercised headless in S3 (LNK-009, constitution rule 9).
- **Tests through public interfaces**, with the requirement ID first in the test name (`it('PLT-007 a vacuum pad lifts a box and puts it down', ...)`). Each test asserts every observable effect of its rule. When a task changes an existing helper or option, add one test that its previous behaviour still holds (K1: the M1 hashes of `hashes.json`; K4: the emitter's `box` and `pallet` kinds; K8: the seven shipped scenes keep their hashes).
- **Structural rules.** Modules at most 1600 lines (`tools/ci/ide-structure.ts`), no import cycle, no store import from a component's non-component module, no whole-store subscription; UI uses the Studio kit (`IDE/src/ui`, UX-002) and `RangeField` for a slider.
- **Docs.** Every new part, option, message and page ships in English (`docs/docs/`) and Spanish (`docs/i18n/es/docusaurus-plugin-content-docs/current/`) in the same commit series, and claims only measured facts (CRS-013). No frame-rate, latency or hardware claim is made for manipulators.
- **Commits.** Conventional Commits, **no AI attribution and no Co-Authored-By line**, work-unit commits with tests and docs alongside the behaviour. About 400 changed lines per task is a heuristic, not a cap (K3, K7 and K8 may exceed it; say why in the commit body). Pushing, merging and opening a pull request are the owner's.
- **Shell.** `bat`, `rg`, `fd`, `eza`; not `cat`, `grep`, `find`, `ls`. No CodeGraph or prowl on this branch (stale index).
- **M3 lessons (run logbook L84 to L123), now rules.**
  - **A new part kind or view kind must match exactly what the view and the panel look for.** M1 shipped `'curve'` and `'blade'` view cases that never matched the `'curved'` and `'stop-blade'` the parts publish (L91, L95; the conveyors and blades never got their shape, colour or outline). Every M4 view test is built from a **real `createPlantCore` snapshot** of a scene that contains the part, never from a hand-typed view name, and asserts the shape, the cue and the readout of each new view kind (V6, U4).
  - **A select never acts on change.** The fault select fired a fault per arrow key and made `dropLoad` unreachable by keyboard (L118, WCAG 3.2.2 On Input). The rule is **choose, then act with a button** (`OperatePanel.tsx:50-80`). Any M4 control that picks a value (the target colour is a scene setting, not a control; there is no new select in M4) follows it, and Q5 walks the keyboard path.
  - **Every fact a part publishes needs a `describePlant` sentence in English and Spanish, or a filter.** Raw keys never reach the text (L119 to L122: `itemsAssembled 0`, `stacked:pallet:0`, `highs:`, `emitted:` all reached the generic `plant.text.fact` branch). **Counts are silent at 0**, and plural pairs use the catalogue's `.one` and `.other` keys, not "time(s)". **Continuous values stay out of the change key** (`describe.ts:7`): a height, a weight, an angle and a lift are never announced per scan. U4 adds a table of every M4 fact and how it is told, with a test per row.
  - **New scenes go into `SCENE_ORDER` with their spec number** (`IDE/scripts/generate-scene-index.ts:17-30`); an id that is not there is a generator problem, and a missing entry made `belt-to-belt-transfer` the default scene of the plant document (L114). Scene writers restore `IDE/src/generated/sceneIndex.ts` and `IDE/src/plant/ci/sceneHashes.json` (`git checkout --`) before committing; **the parent adds the ids, regenerates and pins**.
  - **Physical truth versus sensor faults.** A part's view shows the **physical** state; a sensor fault changes only the **signal** (L101: `view.state.holding` follows the physical hold, the `gripped` signal shows the fault). A scale stuck at 0 still draws the item on it; a vision sensor that is `blind` still draws its field; a stuck `raised` sensor does not raise the chain.
  - **A placed or measured item needs rest.** A put-down counts only at speed at most 0.05 m/s for 100 ms (L110: the outfeed belt stops during a put-down). The scale measures only at rest for `settleMs`; scenes that weigh stop the item (a blade) first; a scene whose receiving belt runs under a weighed item is a defect of the scene, not of the scale.
  - **Tests that register a stub part with a shipped id are shadowed by the real one in a shared bun process** (L105: a panel test's stub gantry was shadowed). M4 tests use the **real catalogue** (`createPlantCore` registers the shipped parts) and never register a part id the catalogue already has.
  - **Facts and views are not the trace, but kinematic bodies are** (Findings 9 of plan M3, `world.bodies()` lists kinematic bodies): the pose of a turntable, an arm, a pusher plate and a chain module is in every hash of a scene that has it, so their size, layer and pose rule are pinned by the two M4 core hashes the moment K9 merges.
  - **Scene tuning is measured, not assumed** (L110, L113, L119): run the grade three times and once with each moving speed at 0.9 and 1.1 of the tuned value; the tuned values live in the reference program and the commit body, never in new scene keys; an item that arrives at a station while it works is the scene's design problem (keep items apart with a blade, a timer or the emitter interval), not luck.
  - **A scene's randomness is fixed by the seed**: `createPlantCore(scene)` uses seed 1 in the live session (`usePlantSession.ts:218`) and in the scene check (`sceneCheck.ts:102`), and the scene file cannot set it. A scene with `vary` records in its commit body the exact sequence of properties seed 1 produces and checks that **every class the scene sorts occurs** in it.
  - **A line is at most 140 columns and a part with an action needs its `plant.action.*` label** in both catalogues (the labels guard test, `OperatePanel.test.tsx:219-220`); a new action name without a label fails the suite.
- **M4 additions.**
  - **No libm in a step loop.** Rotating bodies read the yaw table (`yawEntry`); the 0.25 degree step is the resolution of every angle of M4 (a pose error of at most 0.125 degrees). Moving a kinematic body to the pose it already has is what stops it (`flow.ts:45`): a rotating part sets its pose **every step**.
  - **Items are read through `trackedItems`.** `bodiesInBox` also lists kinematic bodies (the pads of M3, the plates of M4); a sensor keeps only ids that `trackedItems(world)` has. `gapBelow` sees static bodies too (L92).
  - **Item properties never reach the physics or the trace.** They are read from `ItemInfo` by sensors, the remover and the snapshot.
  - M4 tasks that may exceed the 400-line heuristic: A3, B2, B5 and K9 (say why in the commit body).

## Review Focus (conditions the spec implies; each has a test in the task that owns it)
1. A scene of M1 to M3 keeps its facts, its fact key order and its pinned hash: no item draw, no new fact and no new body reaches a scene that does not use an M4 part or property (A3, B1, K9).
2. A rotating or lifting kinematic body carries an item without a jump, without penetration and without losing it at the commanded speeds; releasing it (stopping the surface) leaves the item at rest (A2, B4, B5).
3. Repeatability: the same scene, program and script give the same trace hash on repeated runs and with host pacing varied; the yaw table is bit-exact and equals `Math.sin` and `Math.cos` within 1e-12; the seeded draws happen in a fixed order (A1, A3, K9, S4).
4. Each sensor reacts to the property it names and nothing else: inductive only to metal, capacitive to any item, colour to the colour, light array to the top edge, scale to mass at rest, vision to the code (B1, B2).
5. A numeric reading is always inside its declared range and is the same on the live and the graded path (B2, S4).
6. A sorted item and a misrouted item are counted once each at the remover, and `sorted + misrouted` equals `delivered` (A3, F17 to F21).
7. A pusher, an arm, a chain transfer and a turntable never leave their stroke or angle, hold still under their fault action, ignore a contradictory command pair and report their limits (B3, B4, B5).
8. `describePlant` does not announce a height, a weight, an angle or a lift: over a whole sorting run the change key changes only on item count, integer facts and active signals (U4).
9. Every view kind of M4 is matched by the view, the cues and the panel, proved from a real snapshot (V6, U4).
10. The 2.0 plants and lessons are untouched: `bun test src/plants src/test-engine src/learn` passes unchanged at every merge (PLT-013).
11. A scene that sorts has every class it sorts in its fixed item sequence, and the starter fails only because it sorts nothing (F17 to F21).

---

### Task A0: Contract extensions: item properties on the pose
**Spec:** PRT-001 (Items row), PRT-002. **Lane A. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/contracts.ts
IDE/src/plant/contracts.m4.test.ts
```
**Interfaces:** the declarations of "Contract extensions" (`BodyPose` at `contracts.ts:67-76`, which already carries the optional `tag`). `ItemProps` and `ItemColour` are new exports; `BodyPose` extends `ItemProps`. Nothing else in the file changes (no new family: the new parts use `sensors`, `flow`, `conveyors`, `items`).
- [ ] **Step 1: Failing tests** (`contracts.m4.test.ts`): `'PRT-001 a body pose may carry a colour, a metal flag and a code'` (a `satisfies BodyPose` list and a runtime object); `'PRT-001 a pallet pose and a tagged pose still type-check without the new fields'`; `'PRT-010 the scene schema version is still 1'` (`SCENE_SCHEMA_VERSION`).
- [ ] **Step 2: Run** `bun test src/plant/contracts.m4.test.ts` (FAIL on the type check through `bunx tsc -b` and on the missing export).
- [ ] **Step 3: Implement** the types. **Step 4: Run** the test, `bunx tsc -b`, `bun run lint`, `bun test src/plant src/plants src/test-engine` unchanged.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/contracts.ts packages/zplc-ide/src/plant/contracts.m4.test.ts
git commit -m "feat(plant): item properties on the body pose contract"
```
**Risk:** item 3 (the contract every M4 lane consumes; two optional members are added, nothing is removed). KEEP.

---

### Task A1: Yaw table: rotating poses without libm
**Spec:** PLT-006, PLT-007 (carried by a turning platform). **Lane A. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/yawTable.ts
IDE/src/plant/core/parts/yawTable.test.ts
```
**Interfaces:** the `yawEntry` declaration of "Contract extensions" and the determinism restatement. Reference for comparison only: `yawQuat` (`items.ts:38-41`, `[0, sin(a/2), 0, cos(a/2)]`). The table covers -360 to 360 degrees at 0.25 degree steps (2881 entries), built **at module load** with a Taylor series in `+ - * /` (reduce the angle to 0 to 45 degrees by the symmetries of sine and cosine with the constant `PI` written as a literal; 14 terms give an error below 1e-16). `yawEntry(deg)` rounds with `Math.round` (the only `Math` call), wraps by adding or subtracting 360 once, and returns a **frozen shared entry** (no allocation per step).
- [ ] **Step 1: Failing tests:** `'PLT-006 the table equals Math.sin and Math.cos of the angle within 1e-12 for every entry'`; `'PLT-006 yawEntry(deg).q equals yawQuat(deg) within 1e-12 and has unit length'`; `'PLT-006 an angle is rounded to the nearest quarter degree and wraps outside minus 360 to 360'` (`yawEntry(90.1)` is the entry of 90, `yawEntry(90.2)` of 90.25, `yawEntry(450)` of 90); `'PLT-006 yawEntry returns the same object for the same angle'`; `'PLT-006 yawTable.ts calls no Math function but round, and no clock or random'` (a source scan, as the M3 determinism tests do).
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/yawTable.test.ts` (FAIL), implement, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/yawTable.ts packages/zplc-ide/src/plant/core/parts/yawTable.test.ts
git commit -m "feat(plant): yaw table for rotating parts, computed without libm"
```
**Risk:** item 6 (a wrong table entry rotates a platform by a wrong angle and fails nothing else; the whole-table comparison pins it). KEEP.

---

### Task A2: World: surface-velocity axis, kinematic belts, probe
**Spec:** PLT-007, PLT-006, PLT-012. **Lane A. Wave 1. PHYS-adjacent.** Independent verifier required (Review Focus 1 to 3).

**Allowed edit surfaces**
```
IDE/src/plant/core/world.ts
IDE/src/plant/core/world.divert.test.ts
```
(A new test file so `world.test.ts` and `world.grip.test.ts` stay as they are.)

**Interfaces:** the `setBeltAxis` and `beltSpeed` declarations of "Contract extensions". Existing code: `WorldBeltSpec` (`world.ts:17-25`, `axis` is world space and fixed today), the contact listener `surface` (`world.ts:126-142`, which already works for **any** body of `beltByKey`, kinematic or not, and applies `turnPerMps` as an angular surface velocity), `addBelt` (`world.ts:200-211`, reads the wake box from the body's bounds **once**), `setBeltTarget` (`world.ts:212-216`), `setKinematicPose` (`world.ts:217-224`, `MoveKinematic` with `stepMs / 1000`), `step` (`world.ts:225-239`: the belt loop skips a belt whose speed equals its target and wakes bodies in the wake box when the speed changes), `capture` and `restore` (`world.ts:324-391`). Implementation notes: `Belt` gains `kinematic: boolean` (from `entry.spec.motion`); for a kinematic belt the wake box is rebuilt from `e.body.GetWorldSpaceBounds()` on every step in which `belt.speed !== 0` or its pose changed since the last step, and the loop does not `continue` on `speed === target`; `setBeltAxis` replaces `belt.spec.axis` with a copy (the listener reads it each contact). **Unconfirmed:** that Jolt applies `mRelativeLinearSurfaceVelocity` for a pair whose belt side is a **kinematic** body, that a kinematic body raised by `MoveKinematic` lifts a resting item without a jump, and that a rotating kinematic platform drags an item by friction. Step 1 decides.

- [ ] **Step 1: Probe (decides open question 3's route; not committed).** In a scratch test: (a) a kinematic box with `addBelt` axis +x at 0.5 m/s carries a resting 2 kg box 1 m in 2 s within 5 %; (b) the same body raised 0.02 m over 400 ms by `setKinematicPose` lifts the box with no jump (the box's bottom follows within 1 mm) and the box, **asleep** on it before the raise, is carried when the surface starts; (c) `setBeltAxis` to +z while the speed is 0, then speed 0.5, moves the box along +z; (d) a kinematic platform turned at 90 degrees per second about its centre by poses from `yawEntry` (A1 is not needed: use a local `Math.sin` in the probe) carries a box at 0.3 m from the centre without slip for 2 s (friction 0.6); (e) `capture()` mid-rotation restores on a fresh world that repeats the same steps (exact bytes); (f) three fresh worlds give the same SHA-256 of the box pose sequence. Write the verdict (usable: yes or no per item, and why) in the commit body. **If (a) or (b) fails**, stop and report: Task B4 takes the shuttle fallback of open question 3, and the parent revises this task to what is usable. If only (d) fails, Task B5 takes the belt-only fallback (a platform that turns only when empty) and says so.
- [ ] **Step 2: Failing tests** (`world.divert.test.ts`, all on a real world):
  1. `'PLT-007 a kinematic belt carries a resting box along its axis'` and `'PLT-007 a kinematic belt that starts moving wakes a sleeping box on it'`.
  2. `'PLT-007 raising a kinematic belt lifts the box with no jump and lowering it puts the box down at rest'`.
  3. `'PLT-007 setBeltAxis turns the surface velocity: +x then +z moves the box along each axis'`; `'PLT-007 setBeltAxis and beltSpeed refuse an unknown belt with a located message, and beltSpeed follows the acceleration ramp'`.
  4. `'PLT-007 a turning kinematic platform carries a box 0.3 m off its centre for 2 s without slip'` (offset from the centre within 2 mm of the rigid rotation).
  5. `'PLT-012 capture mid-rotation restores to the same exact state'`.
  6. `'PLT-006 the pose sequence of a kinematic-belt run is identical on three fresh worlds'` (hash, `loadJolt()` returns a fresh module, `jolt.ts:6`).
  7. Previous behaviour: `'PLT-006 static belts and the M1 to M3 world tests step exactly as before'`: the existing `world.test.ts` and `world.grip.test.ts` cases stay green, and `hashes.json` is unchanged after `bun test src/plant` (`m1-palletStack-v1`, `m2-tankLoop-v1`, `m3-gripCycle-v1`, `m3-gantryNumeric-v1`).
- [ ] **Step 3: Run.** `bun test src/plant/core/world.divert.test.ts`. Expected: FAIL. **Step 4: Implement**, then `bun test src/plant/core` (every M1 to M3 core test, hashes included), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/world.ts packages/zplc-ide/src/plant/core/world.divert.test.ts
git commit -m "feat(plant): surface-velocity axis and kinematic belts in the physics world"
```
**Risk:** item 4 (the wake loop and the contact listener run on every step of every scene; a change to their order changes traces), item 3 (`PhysicsWorld` is consumed by every part). PHYS-adjacent. The four pinned core hashes and the twelve scene hashes are the guard.

---

### Task A3: Item properties, workpiece, emitter variety, remover grading
**Spec:** PRT-001 (Items row: "coloured part in two colours, metal and non-metal variants"), PRT-002, PRT-003, PRT-010, PLT-010, PLT-006. **Lane A. Wave 1 (after A0). PHYS-adjacent.** Independent verifier required (Review Focus 1, 6).

**Allowed edit surfaces**
```
IDE/src/plant/core/classify.ts
IDE/src/plant/core/classify.test.ts
IDE/src/plant/core/parts/items.ts
IDE/src/plant/core/parts/sources.ts
IDE/src/plant/core/parts/workpiece.test.ts
IDE/src/plant/core/parts/sourcesSorting.test.ts
```
**Interfaces:** `classify.ts` as in "Contract extensions" and rules R4-C1. `ItemInfo` (`items.ts:43-48`) `extends ItemProps`; `spawnItem` (`items.ts:55-79`, the registration at `:77`) takes `props?: ItemProps` as a new last parameter and stores only the keys that are set; `itemRuntime` (`items.ts:99-131`, `build` at `:111-117`) and `itemParts` (`items.ts:134-185`) gain the `workpiece` part (family `items`, size `[0.2, 0.1, 0.2]`, config in the signal table, names `Workpiece` and `Pieza`, doc EN and ES) and `boxConfig` (`items.ts:92-95`) gains `code`. **Emitter** (`sources.ts`): `emitterConfig` (`:23-29`) gains `vary`, `codes`, `colour`, `material`, `code`; `emit` (`:55-78`) passes the properties and applies R4-V1 **after** the existing draws (`:73-75`); a `vary` that does not apply to the emitted kind has no effect and the doc says so (Plan choice: validation has no cross-field hook, `scene.ts:55-89`). **Remover** (`sources.ts`): `removerConfig` (`:30-34`) gains `accepts` and `acceptsCode`; `removerRuntime` (`:107-141`, the removal at `:128-129`) counts `sorted` and `misrouted` with `matches` and publishes them (`:133`) **only when `accepts` is not `any`**; update both docs (`:153-175`).
- [ ] **Step 0: Record the baseline.** Before editing, run the existing emitter in random mode with seed 1 for 10 emits and note the ten heights, and run `bun test src/plant/core` to see it green; Step 1's previous-behaviour tests assert these literals.
- [ ] **Step 1: Failing tests:**
  1. `classify.test.ts`: `'PRT-006 heightClassOf puts 0.2, 0.3 and 0.4 into short, medium and tall with 50 mm margin'` (0.25 and 0.35 are the edges); `'PRT-006 weightClassOf puts 2 kg light and 5 kg heavy and 3.5 kg light'`; `'PLT-010 matches follows rule R4-C1 for every Accepts value, a pallet never matches a class, and any matches everything'`; `'PLT-006 classify.ts uses no Math function and no clock or random'`.
  2. `workpiece.test.ts` (real catalogue and `createPlantCore`, scenes built with `parseScene`): `'PRT-001 the catalogue has a workpiece with English and Spanish names and documentation'`; `'PRT-003 a workpiece honours its colour, material, code and mass settings and refuses one outside them'` (located at `parts[0].config.code`); `'PRT-001 an initial workpiece spawns with the right size, mass and properties in trackedItems'`; `'PRT-010 adding the workpiece changes no scene schema version'`; `'PLT-007 a workpiece rests on a belt and rides it'`.
  3. `sourcesSorting.test.ts`: `'PRT-001 an emitter of workpieces emits the configured colour, material and code'`; `'PLT-006 vary colour draws one number per emit and gives a red and blue sequence that is the same on three runs'`; `'PLT-006 vary weight draws the box mass from 2 and 5 kg and vary code draws 1 to codes'`; `'PLT-010 a remover that accepts red counts a blue workpiece misrouted and a red one sorted, and sorted plus misrouted equals delivered'`; `'PLT-010 a remover that accepts any publishes only delivered, exactly the M3 facts'`; `'PRT-003 an unknown accepts value is refused with a located message at parts[n].config.accepts'`.
  4. Previous behaviour (Review Focus 1): `'PLT-006 an emitter with vary none draws nothing from the seeded generator and keeps the ten heights of the baseline'` (the literals of Step 0); `'PRT-001 the emitter still emits boxes, pallets, lids and bases exactly as before'`; `'PLT-006 the twelve shipped scenes keep their pinned hashes'` (the scene check over `SCENE_INDEX`) and the key list of the facts of one M3 scene is unchanged.
- [ ] **Step 2 to 4:** `bun test src/plant/core/classify.test.ts src/plant/core/parts/workpiece.test.ts src/plant/core/parts/sourcesSorting.test.ts src/plant/core/parts/transport.test.ts src/plant/core/parts/lidBase.test.ts` (FAIL, then pass), `bun test src/plant/core`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/classify.ts packages/zplc-ide/src/plant/core/classify.test.ts packages/zplc-ide/src/plant/core/parts/items.ts packages/zplc-ide/src/plant/core/parts/sources.ts packages/zplc-ide/src/plant/core/parts/workpiece.test.ts packages/zplc-ide/src/plant/core/parts/sourcesSorting.test.ts
git commit -m "feat(plant): workpiece item, item properties, emitter variety and graded removers"
```
**Risk:** item 3 (`ItemInfo`, `spawnItem`, the emitter and the remover are shared by every scene: the change is additive and the M1 to M3 hashes and fact key lists are the guard), item 6 (the emitter's enum and the remover's `accepts` are a persisted vocabulary: adding values is compatible). PHYS-adjacent (new bodies).

---

### Task N10: Numeric and ranged conditions on plant facts (CONDITIONAL on open question 1)
**Spec:** SCN-005, CRS-005 (an expectation on a plant fact). **Lane A. Wave 1. KEEP. Do not start until the owner answers question 1.** Persisted-format change: high risk, independent verifier required.

This is **Task N10 of `plan-m2.md` carried forward unchanged** (as plan M3 carried it): it was never started, and `fd -t f . IDE/src/test-engine` shows no `sceneCompare.test.ts` (read on 2026-11-13). If it was already merged when M4 starts, skip this task and tighten scenes 17 to 21 (and M3's scenes 13 and 15) with it. The allowed surfaces, steps, tests and commit message are those of plan M3's Task N10, restated here so an executor needs only this file:

**Allowed edit surfaces**
```
IDE/src/test-engine/index.ts
IDE/src/test-engine/sceneCompare.test.ts
```
Recommended default of question 1: in a condition, a `fact:` read may carry, instead of a boolean, a number (exact equality) or an object `{ "min"?: n, "max"?: n }` (inclusive); booleans and every non-fact signal stay exactly as today. `signalSet` (`index.ts:206`) is where `expected` must today be boolean; `ResolvedSignal.value` is `boolean` (`index.ts:45-49`). A scenario with no numeric condition compiles, hashes and runs **byte-identically**. `plant/ci/sceneCheck.ts` needs no change (`checkSceneFacts` walks keys, not values). The scenario-format documentation page is **Unconfirmed** (`rg -n "EVENTUALLY" docs/docs -l`); add it and its Spanish twin to the surface when found.
- [ ] **Step 1: Failing tests:** `'SCN-005 a fact condition may be an exact number or a min and max'`; `'SCN-005 a scenario with only boolean conditions compiles to the same object as before'` and `'PLT-013 every 2.0 scenario hash is unchanged'`; `'SCN-005 a numeric condition on a program signal is refused with a located message'`; `'SCN-005 a sorted count of 5 on a remover passes at 5 and fails at 4'` (stub fact).
- [ ] **Step 2 to 4:** implement, `bun test src/test-engine src/plant/ci src/learn`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/test-engine
git commit -m "feat(test-engine): numeric and ranged conditions on plant facts"
```
**Risk:** item 1 (a persisted scenario format), item 3 (consumed by 68 lessons' hashes). Independent verifier: all 2.0 scenario hashes are the guard.

---

### Task B1: Beam sensors: inductive, capacitive, colour; the beam draws its range
**Spec:** PRT-001 (Sensors row), PRT-006, PRT-003, PRT-008, PLT-010, PLT-011. **Lane B. Wave 2 (after A3). PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/sensors.ts
IDE/src/plant/core/parts/sensorsSorting.test.ts
```
**Interfaces:** `sensorRuntime` (`sensors.ts:23-63`, one `rayHit` per step at `:40`, the `stuck` override and the `count` fact at `:41-45`) becomes a runtime factory that takes a **detector**: `(world, hitId) => { detect: boolean; match?: boolean }`, where the optical sensors keep `hitId != null`; `define` (`sensors.ts:65-80`) gains the signal list per part (`detect`, plus `match` for the colour sensor) and `sensorParts` (`sensors.ts:83-96`) gains `sensor-inductive`, `sensor-capacitive` and `sensor-colour` by rules R4-D1, with the config, signals and actions of the signal table, snap points none, doc EN and ES. `trackedItems(world)` (`items.ts:52`) gives the properties. The **view** of every beam sensor, old ones included, adds `state.beamLength` = its `rangeM` (`sensors.ts:57`): `cuesFor` reads it (`cues.ts:84-90`) and, because the key was never published, **every beam is drawn 1 m long today** (Findings 2). `wrongColour` inverts `match` (and nothing else). Facts: `count:<Name>` for each (existing sentence).
- [ ] **Step 1: Failing tests** (real `createPlantCore` scenes built with `parseScene`, or the `plant()` harness of `transport.test.ts:13-60` if importable, **Unconfirmed**): `'PRT-006 an inductive sensor detects a metal workpiece and not a plastic one, a box or a pallet'`; `'PRT-006 a capacitive sensor detects a box, a workpiece and a pallet'`; `'PRT-006 a colour sensor sets detect for any item and match only for its target colour'`; `'PRT-008 stuckOn and stuckOff force detect, wrongColour inverts match, an unknown action throws a located message'`; `'PLT-010 count counts rising edges of detect for the three new sensors'`; `'PRT-003 the range and height settings are honoured and refused outside their limits'` (located at `parts[n].config.rangeM`); `'VIS-003 every beam sensor view carries beamLength equal to its rangeM'` (diffuse, retro and the three new ones); `'PRT-002 each part has English and Spanish names and documentation'`; `'PRT-010 adding the parts changes no scene schema version'`; `'PLT-006 sensors.ts calls no Math function beyond abs, min and max'`; previous behaviour: `'PRT-006 the diffuse and retro sensors detect exactly as before and the M1 sensor tests stay green'` (`sensors.test.ts`).
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/sensorsSorting.test.ts src/plant/core/parts/sensors.test.ts` (FAIL, then pass), `bun test src/plant/core`, `bunx tsc -b`, `bun run lint`. If question 4 is answered "no colour sensor", drop `sensor-colour` and its tests; nothing else in B1 changes.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/sensors.ts packages/zplc-ide/src/plant/core/parts/sensorsSorting.test.ts
git commit -m "feat(plant): inductive, capacitive and colour sensors, and beams that report their range"
```
**Risk:** item 3 (the optical sensors are consumed by seven scenes; their detection logic is refactored, not changed: the previous-behaviour test and the twelve scene hashes guard it), item 6 (a wrong property check makes a grade wrong without failing anything else). PHYS-adjacent.

---

### Task B2: Numeric sensors: light array, scale, vision
**Spec:** PRT-001 (Sensors row), PRT-005, PRT-006, PRT-004 (numeric sensors), PRT-003, PRT-008, PLT-010. **Lane B. Wave 2 (after A3). PHYS-adjacent.** Independent verifier recommended (Review Focus 4, 5).

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/sensorsNumeric.ts
IDE/src/plant/core/parts/sensorsNumeric.test.ts
```
**Interfaces:** produces `export const numericSensorParts: readonly RuntimePartDefinition[]` (`light-array`, `scale`, `vision-sensor`, family `sensors`, **not registered here**: K9 registers them, as K8 did). Rules R4-D2, R4-D3, R4-D4 and the signal table. Uses `marker` (`sensors.ts:6-13`), `cfgNumber`, `rotateY`, `yawQuat`, `trackedItems`, `PartRuntime` (`items.ts:5-16`), `world.rayHit`, `world.bodiesInBox`, `world.bodies` (creation order, with `v`). `signals(part)` derives the ranges from the config (`height`: 0 to `beams * pitchM`; `weight`: 0 to `rangeKg`; `code`: 0 to 9), as `tankSignals` does (`process.ts:134-155`); numeric ranges must equal the plant map's `eng_min`, `eng_max` and `unit` (R-S3). `sense()` returns `{ [name.height]: number, [name.detect]: boolean }` etc.; the **reading is clamped inside its range** (`Math.min`). The scale keeps a `stableSteps` counter (rest for `settleMs / 5` consecutive steps). Views: kinds `'light-array'`, `'scale'`, `'vision-sensor'` with `state = { text, fraction, ... }` (see "View state keys"); the pose is a thin marker at the part position (no body). `snapPoints`: the four corners of the footprint (`spanM` by 0.1, `lengthM` by `widthM`, `fieldM` by `fieldM`), so the schematic shows a footprint. Faults per the table; `readingStuck` holds the reading it had when the action was triggered, `readingOffset` adds one pitch (light array) or 2 kg (scale), both clamped to the range, `blind` reads 0, `misread` reads `code % 9 + 1`.
- [ ] **Step 1: Failing tests** (real core scenes: belts, boxes of 0.2, 0.3, 0.4 m, a stop blade for rest):
  1. `'PRT-005 the light array reports 0.20, 0.30 and 0.40 for the three box heights and 0 for an empty belt'`; `'PRT-005 a lid on a base reads the top of the lid'`; `'PRT-005 the light array height is inside 0 to beams times pitch for any item'`.
  2. `'PRT-005 the scale reports the mass of a box at rest, the sum of two boxes, and 0 while the box moves'`; `'PRT-005 the scale is stable only after settleMs at rest'`; `'PRT-005 the scale reading is inside 0 to rangeKg and a heavier load saturates at rangeKg'`.
  3. `'PRT-005 the vision sensor reports the code of the item in view, 0 for an unlabelled item and for an empty field, and the nearest item when two are in view'`; `'PRT-005 the vision code is an integer 0 to 9'`.
  4. `'PRT-008 readingStuck holds the last reading, readingOffset adds its offset and clamps, blind reads 0, misread reads another code, an unknown action throws a located message'`; `'PLT-010 detect is true while any item is in the field or any beam hits'`.
  5. `'PRT-003 beams above 32 and a pitch below 0.025 are refused with a located message'`; `'PRT-002 each part has English and Spanish names and documentation'`; `'PRT-010 adding the parts changes no scene schema version'`; `'PRT-007 the snap points span the footprint'`.
  6. `'PLT-006 the three sensors use no Math function beyond abs, min, max, round and floor, no clock and no random, and the readings are identical on three runs'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/sensorsNumeric.test.ts` (FAIL), implement, `bun test src/plant/core`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/sensorsNumeric.ts packages/zplc-ide/src/plant/core/parts/sensorsNumeric.test.ts
git commit -m "feat(plant): light array, scale and vision sensors with numeric readings"
```
**Risk:** item 6 (a plausible but wrong reading is caught only by the tests above), item 4 (the sampling order inside the step, guarded by K9 and S4). PHYS-adjacent.

---

### Task B3: Pusher and diverter arm
**Spec:** PRT-001 (Flow control row), PRT-003, PRT-007, PRT-008, PLT-007, PLT-011. **Lane B. Wave 2 (after A1). PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/diverters.ts
IDE/src/plant/core/parts/diverters.test.ts
```
**Interfaces:** produces `export const diverterParts: readonly RuntimePartDefinition[]` (`pusher`, `diverter-arm`, family `flow`, **not registered here**). Rules R4-A1 and R4-A2. Model both on `bladeRuntime` (`flow.ts:16-66`): one kinematic body in the static layer (`world.addBody`, `motion: 'kinematic'`, `layer: 'static'`, `massKg: 0`, `friction: ITEM_FRICTION`), its pose set **every step** by `world.setKinematicPose` (`flow.ts:45-46`), a view whose pose is the moving body. The pusher uses `stepAxis` and `AT_LIMIT_M` (`axis.ts:17-47`) for its stroke (`dtS` 0.005, `stuck` per fault); its plate pose is the part position plus `p` along local +z, rotated by `rotationYDeg` with `rotateY`. The arm keeps its angle as a number advanced by `degPerS * 0.005` and reads `yawEntry` (A1) for the quaternion **and** for the cosine and sine that place the plate centre (`pivot + R(angle) * (lengthM / 2, 0)`); its view state `fraction` is the angle over `angleDeg`. `snapPoints`: four footprint corners (pusher: `widthM` by `strokeM`; arm: `lengthM` by `lengthM`). Docs EN and ES (every setting, signal, fault, and that "right" is +z).
- [ ] **Step 1: Failing tests** (real world through `createPlantCore`, belts and boxes):
  1. `'PRT-003 the pusher extends at its speed to its stroke and retracts, reporting extended and retracted at the limits'`; `'PRT-003 the pusher never leaves 0 to strokeM and ignores a contradictory pair'` (extend commanded with the part stuck).
  2. `'PLT-007 a pusher pushes a box off a belt onto a side belt'` and `'PLT-007 a box pushed past the edge of the only belt falls and is counted dropped'`.
  3. `'PRT-003 the arm swings to angleDeg at degPerS and back, reporting diverted and home within 0.5 degrees'`; `'PLT-007 the arm deflects a box travelling on a belt onto a side belt and a retracted arm lets it pass'`.
  4. `'PRT-008 stuck freezes the pusher and the arm where they are, an unknown action throws a located message'`.
  5. `'PRT-003 settings outside their limits are refused with a located message'`; `'PRT-002 each part has English and Spanish names, documentation'`; `'PRT-010 adding the parts changes no scene schema version'`; `'PRT-007 the snap points span the footprint'`.
  6. `'PLT-006 the pusher and the arm call no Math function beyond abs, min, max, round and floor and the pose sequence is identical on three runs'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/diverters.test.ts` (FAIL), implement, `bun test src/plant/core`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/diverters.ts packages/zplc-ide/src/plant/core/parts/diverters.test.ts
git commit -m "feat(plant): pusher and diverter arm with limit sensors"
```
**Risk:** item 6 (a diverter that pushes in the tests but flings or jams items at other speeds; F-tasks run the 0.9 and 1.1 speed margins), item 4 (the kinematic pose order inside the step). PHYS-adjacent.

---

### Task B4: Chain transfer
**Spec:** PRT-001 (Conveyors row: "chain transfer"), PRT-003, PRT-007, PRT-008, PLT-007, PLT-008, PLT-011. **Lane B. Wave 2 (after A1 and A2's verdict). PHYS-adjacent.** Independent verifier required (Review Focus 2, 7).

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/chainTransfer.ts
IDE/src/plant/core/parts/chainTransfer.test.ts
```
**Interfaces:** produces `export const chainParts: readonly RuntimePartDefinition[]` (`chain-transfer`, family `conveyors`, **not registered here**). Rules R4-T1 and R4-T2. One kinematic body (module `lengthM` by `0.1` by `widthM`, `layer: 'static'`, `motion: 'kinematic'`) with `world.addBelt` (route A of open question 3: **kinematic belt**; A2's probe decides), its top at the part's y when lowered and `liftM` above when raised, posed every step (`flow.ts:45`); the lift travels linearly over `liftTravelMs` 400 as the blade's travel (`flow.ts:7`, `:23`). Commands as `conveyors.ts:99-103`: `run` and `runReverse` are honoured only while **lowered**, `moveLeft` and `moveRight` only while **raised**, a pair in conflict does nothing; before the surface changes axis the part ramps the surface target to 0 and switches with `setBeltAxis` only when `world.beltSpeed(id)` (the accessor A2 adds) is 0. `raised` is true when the travel is complete; a stuck lift (`liftStuck`) freezes the travel, `stall` stops the surface, `jam` adds the fixed bar of `conveyors.ts:110-126` across the module. View kind `'chain-transfer'`, state `{ fraction (lift over liftM), text ('raised' or 'lowered'), speedMps, ... }`. `snapPoints`: `in` and `out` as `straightSnap` (`conveyors.ts:178-184`), accepting the belt family (`ACCEPTS`, `conveyors.ts:9`).
  **Route B (shuttle fallback, only if A2's probe says a kinematic belt cannot carry):** the module is a kinematic plate that, when raised, **translates** along local ±z at `speedMps` over `strokeM` and returns lowered; the commands, sensors and facts are the same, the carry is by friction, and the doc says so.
- [ ] **Step 1: Failing tests:** `'PLT-007 a lowered chain transfer carries a box along +x like a belt and passes it to the next belt'`; `'PLT-007 a raised chain transfer moves a box to the right with moveRight and to the left with moveLeft'`; `'PRT-003 the lift takes 400 ms and raised and lowered report the limits'`; `'PRT-003 the surface switches axis only after it has stopped, and a command pair in conflict does nothing'`; `'PLT-008 a box at rest on a raised module stays at rest for 60 simulated seconds without drift above 0.001 m'`; `'PRT-008 liftStuck freezes the lift, stall stops the surface, jam blocks the box, an unknown action throws a located message'`; `'PRT-003 settings outside their limits are refused with a located message'`; `'PRT-002 names and documentation in both languages'`; `'PRT-010 no scene schema version change'`; `'PRT-007 the snap points are in and out'`; `'PLT-006 no Math function beyond abs, min, max, round and floor and an identical pose sequence on three runs'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/chainTransfer.test.ts` (FAIL), implement, `bun test src/plant/core`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/chainTransfer.ts packages/zplc-ide/src/plant/core/parts/chainTransfer.test.ts
git commit -m "feat(plant): chain transfer that lifts and moves items sideways"
```
**Risk:** item 4 (axis switch and lift order inside the step; a wrong order drops or flings an item), item 6 (the carry is plausible in a unit test and wrong at a belt joint). PHYS-adjacent.

---

### Task B5: Turntable
**Spec:** PRT-001 (Conveyors row: "turntable"), PRT-003, PRT-007, PRT-008, PLT-007, PLT-008, PLT-011. **Lane B. Wave 2 (after A1 and A2's verdict). PHYS-adjacent.** Independent verifier required (Review Focus 2, 7).

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/turntable.ts
IDE/src/plant/core/parts/turntable.test.ts
```
**Interfaces:** produces `export const turntableParts: readonly RuntimePartDefinition[]` (`turntable`, family `conveyors`, **not registered here**). Rules R4-R1 and R4-T2. One kinematic square platform (`sizeM` by `0.1` by `sizeM`, static layer) with `world.addBelt`; each step: advance the angle toward its target at `degPerS * 0.005`, read `yawEntry(angle)` (A1), call `world.setKinematicPose(id, position, entry.q)` and `world.setBeltAxis(id, [entry.cos, 0, -entry.sin])` (the belt axis convention of `conveyors.ts:93`: `[cos a, 0, -sin a]` for a yaw `a` about +y), and set the belt target by `run` and `runReverse` as `conveyors.ts:99-103`. A turn requests `run` to be FALSE: the part stops the surface first (rule R4-T2) and starts the turn only at speed 0; a platform that turns with items on it carries them by friction (A2's probe (d); if only (d) failed the platform turns only when no tracked item is over it and says so). `atCentre`, `atLeft`, `atRight` within 0.5 degrees; `turnStuck` freezes the angle. Left is angle `-angleDeg`, right `+angleDeg` (the same side as the chain transfer's `moveRight`: +z at angle 0, **Unconfirmed**: the executor proves the sign with a test that puts a box on the platform, turns right and runs it, and the box leaves towards local +z). View kind `'turntable'`, `state = { fraction (angle over angleDeg), text ('left', 'centre', 'right'), angleDeg, ... }`; snap points: the four sides (`in` at -x, `out` at +x, `left` at -z, `right` at +z), accepting the belt family.
- [ ] **Step 1: Failing tests:** `'PRT-003 the platform turns to the left and the right position at degPerS and back to the centre, reporting atLeft, atRight and atCentre within 0.5 degrees'`; `'PRT-003 both turn commands hold the current angle and the angle never leaves minus angleDeg to angleDeg'`; `'PLT-007 a box on the platform is carried through a 90 degree turn without slipping off'`; `'PLT-007 a turned platform with run TRUE carries a box off towards the side it faces'` (centre: +x; right: +z; left: -z); `'PRT-003 the surface stops before the platform turns'`; `'PLT-008 a box at rest on a stopped platform at each of the three angles stays at rest for 60 simulated seconds without drift above 0.001 m'`; `'PRT-008 turnStuck, stall and jam, an unknown action throws a located message'`; `'PRT-003 settings outside their limits are refused with a located message'`; `'PRT-002 names and documentation in both languages'`; `'PRT-010 no scene schema version change'`; `'PRT-007 the snap points are in, out, left and right'`; `'PLT-006 turntable.ts calls no Math function beyond abs, min, max, round and floor and the pose sequence is identical on three runs'`; `'PLT-012 a capture mid-turn restores to the same exact state'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/turntable.test.ts` (FAIL), implement, `bun test src/plant/core`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/turntable.ts packages/zplc-ide/src/plant/core/parts/turntable.test.ts
git commit -m "feat(plant): turntable with three positions and a belt surface"
```
**Risk:** item 4 (pose and belt-axis order inside the step, and the stop-then-turn rule), item 6 (a turntable that works at 90 degrees per second and flings items at 120). PHYS-adjacent. May exceed 400 lines.

---

### Task V6: View: new parts, beam range, item colours
**Spec:** VIS-003, VIS-009, PRT-009. **Lane V. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/view/geometry.ts
IDE/src/plant/view/cues.ts
IDE/src/plant/view/renderer.ts
IDE/src/plant/view/sorting.test.ts
```
**Interfaces:** the "View state keys" paragraph. `partShape` (`geometry.ts:50-81`): explicit cases for the new view kinds (`'light-array'`, `'scale'`, `'vision-sensor'`, `'pusher'`, `'diverter-arm'`, `'chain-transfer'`, `'turntable'`, `'workpiece'`), each the pose box (a thin marker for a numeric sensor); the cases are **exactly** the strings the parts publish. `partDecor` (`geometry.ts:138-143`): a turntable and a chain transfer draw a direction marker on their top (a bar along the current surface axis, so the surface direction is told by shape, not colour), a raised chain module draws its chains as two thin bars; a light array draws its beams as a column of thin lines (`beams` from `state`), a scale a flush plate, a vision sensor an open box outline of its field. `cuesFor` (`cues.ts:71-92`): add `'divert'` and `'lift'` to `ACTIVE_SUFFIXES` (`cues.ts:38`) **after** `'gripped'` and before the others; `valueOf` (`cues.ts:64-69`) already shows `state.text` and `state.fraction`; the beam cue (`cues.ts:84-90`) reads `state.beamLength` that B1 now publishes. Items: `ITEM_COLORS` and `instanceColors` (`geometry.ts:186-210`) and `itemTone` (`geometry.ts:199-201`) gain red, blue and metal: red and blue are two tones of **different lightness**, metal is a lighter neutral, and in every palette of `displayModes.ts` the three stay three different tones (VIS-009: `Palette` has six fields and no spare tone, `displayModes.ts:7-14`, so derive red, blue and metal from `palette.item` by lightness, and the high-contrast palette by white, light grey and mid grey with the outline). `renderer.ts:330-360` (`applyOutlines`, which outlines only `'sensor'` and `'stop-blade'` at `:350`) outlines the new parts too in high contrast (VIS-009); the material colours of `partColor` (`renderer.ts:265-268`) get the new kinds.
- [ ] **Step 1: Failing tests** (view tests are pure; follow `manipulators.test.ts`): `'VIS-003 every M4 view kind is matched by partShape, and an unknown name falls to the pose box'` (the list of kind strings is a literal list **and** is asserted equal to the `part` of views from a fake snapshot built with the same constants that the part definitions export: a mismatch is the M1 defect); `'VIS-003 a beam sensor draws its beam with the length it publishes'` (`beamLength` 0.3 gives a 0.3 m beam, none gives the old default); `'VIS-003 a diverter in motion is told by its fraction and text, a raised chain module by its decor and a turntable by its direction marker'`; `'VIS-003 a numeric sensor view shows its reading text'`; `'VIS-009 red, blue and metal items are three different tones in every display mode and the pair of colours differs in lightness'`; `'VIS-009 high contrast outlines the new parts'`; previous behaviour: `'VIS-003 the cues and shapes of the M1 to M3 parts are unchanged'` (a table of the existing views).
- [ ] **Step 2 to 4:** `bun test src/plant/view`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/view
git commit -m "feat(plant): draw the sorting sensors, diverters and coloured items with their cues"
```
**Risk:** item 6 (drawing is checked by pure tests only; K9 adds a test from a real snapshot and Q5 looks at the real view). KEEP.

---

### Task U4: Readouts, fact sentences, fault labels, strings
**Spec:** VIS-008, VIS-010, VIS-011, PLT-011. **Lane U. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/ui/OperatePanel.tsx
IDE/src/plant/ui/NumericControls.tsx
IDE/src/plant/ui/OperatePanel.sorting.test.tsx
IDE/src/plant/text/describe.ts
IDE/src/plant/text/describe.sorting.test.ts
IDE/src/i18n/catalog/plantView.ts
```
**Interfaces:** `describePlant` (`describe.ts:18-64`): `sorted:` and `misrouted:` are integer facts that must be **silent at 0** and told in words: extend `SUPPORT` (`describe.ts:10`) with `sorted:.+` and `misrouted:.+`, special-case them next to `delivered` (`describe.ts:44`) with two catalogue sentences `plant.text.sorted` and `plant.text.misrouted` (English and Spanish, plural pairs with `.one` and `.other` as the catalogue does since L122, never "time(s)"); `count:<Name>` already has its sentence (`describe.ts:45`). **No continuous reading enters the change key**: heights, weights and codes are signals, so they are not in `snapshot.facts`; a test asserts the key over a fake series. `OperatePanel.tsx:91-95` lists the ids that get a readout: add the numeric sensors and the four diverters **by id**; `Readout` (`NumericControls.tsx:101-138`) gains two branches, `<span data-plant-reading={name}>` with `state.text` (`Scale1: 3.50 kg, stable`) and `<span data-plant-diverter={name}>` with `state.text` and a marker (`Pusher1: extended`), through `t()` keys `plant.panel.reading` and `plant.panel.diverter`; a part id with no branch still draws **nothing** (the M3 fallthrough fix, `NumericControls.tsx:127`). Labels: add `plant.action.readingStuck`, `readingOffset`, `wrongColour`, `blind`, `misread`, `liftStuck`, `turnStuck` to both catalogues (`plantView.ts:77-95` English, `:188-206` Spanish; neutral usted, `falla`); `stuck`, `stall`, `jam`, `stuckOn`, `stuckOff` exist. The generic fault control (`OperatePanel.tsx:50-80`) already lists the actions and **chooses before it acts**.
- [ ] **Step 1: Failing tests:** `'VIS-008 sorted and misrouted are told in words, silent at 0, and the change key moves only when a count changes'`; `'VIS-008 a reading, an angle and a lift never change the key over a whole run'` (fake snapshot series with `fraction` and `text` moving); `'VIS-011 every new sentence, panel string and action label exists in English and Spanish with the same placeholders and the plural pair'` (the catalogue parity pattern, **Unconfirmed** file: `rg -n "plant.panel" IDE/src/i18n -l`); `'VIS-010 a numeric sensor and a diverter appear in the fault list with their actions, choosing does not trigger, and are not drawn as a stack light'`; `'PLT-011 every action of every M4 part has a plant.action label in both catalogues'` (the guard of `OperatePanel.test.tsx:219-220`, extended); `'VIS-008 a table test: every fact family of M4 (sorted, misrouted, count of the new sensors) is told or filtered, never as plant.text.fact with a raw key'`; previous behaviour `'VIS-008 the tank, stack light, manipulator and support readouts and sentences are unchanged'`.
- [ ] **Step 2 to 4:** `bun test src/plant/ui src/plant/text src/i18n`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/ui packages/zplc-ide/src/plant/text packages/zplc-ide/src/i18n
git commit -m "feat(plant): sorting readouts, grading sentences and fault labels in English and Spanish"
```
**Risk:** item 6 (an accessibility regression the pure tests cannot hear; Q5 and the screen-reader capture cover it). KEEP.

---

### Task K9: Core integration: register parts, `addItem` kind, pose properties, grammar, pinned hashes
**Spec:** PLT-006, PLT-010, PLT-011, PLT-012, PLT-016, PRT-001. **Lane C. Wave 3. PHYS-adjacent.** Independent verifier required (Review Focus 1, 3, 9).

**Allowed edit surfaces**
```
IDE/src/plant/core/plantCore.ts
IDE/src/plant/core/plantCore.sorting.test.ts
IDE/src/plant/core/hashes.json
IDE/src/plant/ci/sceneCheck.ts
IDE/src/plant/ci/sceneCheck.test.ts
IDE/src/plant/view/m4Views.test.ts
IDE/src/plant/ui/m4Readouts.test.tsx
```
**Interfaces:** `SHIPPED` and `RUNTIMES` (`plantCore.ts:31-45`): append `...numericSensorParts, ...diverterParts, ...chainParts, ...turntableParts` **after** `...stationParts` (the order of earlier parts and their hashes never change; the beam sensors are already in `sensorParts`). `exec` case `'+'` (`plantCore.ts:219-234`, the refusal at `:222`): `addItem` also accepts `'workpiece'` (a red plastic 0.5 kg unlabelled workpiece; the error reads `use box, workpiece or pallet`). `snapshot()` (`plantCore.ts:289-309`, the pose at `:291-306`): the pose copies `colour`, `metal` and `code` from `ItemInfo` when set. `FIXED_FACTS` and `FACT_GRAMMAR` (`sceneCheck.ts:29-33`) and `factFault` (`:36-49`, the `named` list at `:44`): add `sorted` and `misrouted` (the part-name check applies to both) and extend the grammar string. Pin two hashes in `hashes.json`: `m4-diverters-v1` (a scripted run: a belt feeds a chain transfer that lifts, moves a box right and lowers; a pusher pushes a second box off a belt; a turntable turns right and carries a third box) and `m4-sorting-v1` (an emitter with `vary colour`, a colour sensor, a light array, a scale, a vision sensor and a remover with `accepts red`, a fixed command script); update the `notes` string. Two **test-only** files: `m4Views.test.ts` builds a real snapshot of a scene containing **every** M4 part and asserts, for each view, that `partShape`, `partDecor` and `cuesFor` handle its `part` string (no default fall-through for a name that has a case), and `m4Readouts.test.tsx` renders `Readout` for each real view and asserts the right branch (no stack light, no null for a numeric sensor or a diverter). A mismatch found by these tests is **reported to the parent** (it goes back to V6 or U4), not fixed by editing their files.
- [ ] **Step 1: Failing tests** (`plantCore.sorting.test.ts`, real `createPlantCore`, scenes built with `parseScene`):
  1. `'PRT-001 the catalogue contains every M4 part and the workpiece after the core is created'` (ids of the "Part signal tables").
  2. `'PLT-010 sorted and misrouted are published by a remover that accepts a class and not by one that accepts any'`.
  3. `'PLT-010 addItem accepts a workpiece and the snapshot carries its colour, metal and code'`; `'PLT-016 addItem of an unknown kind is refused with the located message'`.
  4. `'PLT-012 a capture taken while a box rides a turning platform restores to the same exact state and the same final hash'`; `'PLT-012 reset returns a sorting scene to its initial state'`.
  5. `'PLT-006 the two M4 core scripts give the pinned hashes on Linux'` (`m4-diverters-v1`, `m4-sorting-v1`; the first run writes them; the test compares to `hashes.json` and skips off Linux, as the M1 to M3 pins do); `'PLT-006 the hash does not depend on host pacing'`.
  6. `'PLT-016 apply refuses a REAL command of the wrong type with the located message and leaves the hash unchanged'` (inherited rule R-X2, on a scene with a numeric sensor and a diverter).
  7. In `sceneCheck.test.ts`: `'SCN-004 the fact grammar accepts sorted and misrouted and names the unknown ones'` (`fact:sorted:BinRed`; `fact:sorted` alone is refused; a part name not in the scene is located).
  8. `m4Views.test.ts` and `m4Readouts.test.tsx` as above.
  9. Previous behaviour (Review Focus 1): `'PLT-006 the twelve shipped scenes keep their pinned hashes'`; `'PLT-010 a scene with no M4 part publishes the same facts, in the same key order, as before'` (key list of two M3 scenes equals a literal); the four M1 to M3 core pins unchanged.
- [ ] **Step 2 to 4:** `bun test src/plant/core src/plant/ci src/plant/view src/plant/ui` with `ZPLC_NATIVE_SIM_BIN` exported for the native tests; `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core packages/zplc-ide/src/plant/ci packages/zplc-ide/src/plant/view/m4Views.test.ts packages/zplc-ide/src/plant/ui/m4Readouts.test.tsx
git commit -m "feat(plant): register the sorting sensors and diverters, publish grading facts, pin the M4 trace hashes"
```
**Risk:** item 4 (step ordering of the new parts inside the core), item 3 (`plantCore.ts` is consumed by every scene), item 1 (the new facts are a persisted vocabulary of scenario files). Independent verifier: the twelve scene hashes and four core pins are the guard. PHYS-adjacent. May exceed 400 lines.

---

### Task D5: Documentation in English and Spanish
**Spec:** CRS-011 (M4 parts and scenes), CRS-013, PRT-002, PRT-005, PRT-006. **Lane D. Wave 3. KEEP.**

**Allowed edit surfaces**
```
tools/docs/plant-parts-reference.ts
tools/docs/plant-parts-reference.test.ts
docs/docs/plant/parts.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/parts.md
docs/docs/plant/sorting.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/sorting.md
docs/docs/plant/numeric-signals.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/numeric-signals.md
```
(`parts.md` in both languages is **generated**: edit the generator, then run it. The generator's `PARTS` array is a **hand-written list** (`tools/docs/plant-parts-reference.ts:24-36`): a part array not added there silently misses the reference. Add `numericSensorParts`, `diverterParts`, `chainParts`, `turntableParts`. `docs/sidebars.js`, `plant/index.md` and `plant/scenes.md` are the parent's.)

**Content.** `sorting.md` (new page): the item properties (colour, material, code, height, mass) and which sensor reads which (a table for PRT-006); the classes and their thresholds (R4-C1) and the remover's `accepts` with the two grading facts and how `sorted` plus `misrouted` equals `delivered`; the sensors with their ranges and the exact rule of each reading (R4-D1 to R4-D4: the scale weighs only at rest, the light array reports the top edge in steps of the pitch, the vision sensor reads a code from 0 to 9 and not an image); the four diverters with their commands, limits, the stop-then-turn rule and "right is +z"; the fault actions and what each teaches; the known limits (a static scale, no contact force; the yaw table resolution of 0.25 degrees; the diverters' plates are the only bodies of their parts). `numeric-signals.md` gains the three new numeric signals and their ranges (the 64-byte exchange span applies). **Only measured claims**: no latency, frame rate, hardware or cross-platform claim; say "pinned on Linux; macOS and Windows not yet measured" where determinism is mentioned. Spanish: neutral usted, `falla`, `ciclo`, `tarima`, "ZPLC".
- [ ] **Step 1: Failing tests:** `'PRT-002 the reference lists the M4 parts with their ranges, variants and fault actions'`; `'PRT-002 the generator PARTS has exactly the ids the catalogue registers'` (import `catalogue` after `plantCore` has registered the shipped parts: no part is missing from the reference); `'PRT-002 --check fails when a part definition changes and the page does not'`; `'PRT-002 English and Spanish pages have the same table structure'`; the docs parity and Spanish register tests of `tools/docs`.
- [ ] **Step 2 to 4:** `bun test tools/docs` at the root (FAIL, implement, `bun tools/docs/plant-parts-reference.ts --write`, `--check` exits 0), and the docs build if present (`bun run --cwd=docs build`, **Unconfirmed**).
- [ ] **Step 5: Commit.**
```bash
git add tools/docs docs/docs/plant docs/i18n/es
git commit -m "docs(plant): sorting sensors, diverters and item properties, with the parts reference generated, in English and Spanish"
```
**Risk:** item 6 (claims beyond evidence; guarded by the rule above), item 5 (a docs CI check).

---

### Task S4: Live equals graded for a sorting scene; capture mid-rotation
**Spec:** PLT-005, PLT-012, PLT-017, LNK-003, LNK-006, SCN-004, SCN-011 to SCN-013. **Lane S. Wave 4. PHYS-adjacent.** (Plan M3's Task S3 is the model; read `IDE/src/plant/ci/liveVersusGradedGrip.test.ts` and `fixtureGrip/` first.)

**Allowed edit surfaces**
```
IDE/src/plant/ci/liveVersusGradedSorting.test.ts
IDE/src/plant/ci/fixtureSorting/scene.json
IDE/src/plant/ci/fixtureSorting/plant-map.json
IDE/src/plant/ci/fixtureSorting/reference.st
IDE/src/plant/ci/fixtureSorting/scenario.json
```
**Content.** A small fixture, not a shipped scene: a belt, an emitter with `vary code` (codes 2), a stop blade, a vision sensor reading INT `code` (raw 0 to 9, eng 0 to 9), a scale reading REAL `weight` (raw float, eng 0 to 20 kg), a light array reading REAL `height`, a diverter arm commanded by the program and a remover with `accepts code`. The reference program reads the three numeric inputs and drives the arm and the belt. **Tests:** `'PLT-017 the live session and the graded run give the same trace hash over 1000 scans for the sorting fixture'`; `'PLT-017 an INT code and REAL readings reach the program with the scaling of rules R-S1 and R-S2 on both paths'`; `'PLT-012 a capture taken while a box rides a turning platform restores and finishes with the same hash'` (the fixture holds a turntable for this case, or a second scene built in the test); `'PLT-005 pause and step mid-run leave the plant frozen and the trace unchanged'`; `'SCN-012 the generated declarations of the fixture map have an INT, two REAL and the BOOL signals with their addresses'`; `'SCN-004 the fixture reference passes and an empty program fails'`.
- [ ] **Steps:** as S3 of plan M3 (read, failing test, implement the fixture, run `bun test src/plant/ci` with `ZPLC_NATIVE_SIM_BIN` exported, `bunx tsc -b`, `bun run lint`).
- [ ] **Commit:** `test(plant): live equals graded for a sorting scene and capture mid-rotation`. **Risk:** item 6 (a wrong exchange of an INT code makes every vision scene wrong). PHYS-adjacent.

---

### Task F17: Reference scene 17, Colour separation (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-006. **Lane F. Wave 4. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/colour-separation/scene.json
IDE/plant-scenes/colour-separation/plant-map.json
IDE/plant-scenes/colour-separation/reference.st
IDE/plant-scenes/colour-separation/starter.st
IDE/plant-scenes/colour-separation/scenario.json
```
(The parent adds `'colour-separation': 17` to `SCENE_ORDER` first, then regenerates `IDE/src/generated/sceneIndex.ts` with `bun run generate:scene-index` and pins `IDE/src/plant/ci/sceneHashes.json` after the wave merges; restore both with `git checkout --` before committing.)

**Content.** Goal of spec SCN row 17, "Send two colours of part to two belts". Layout original (P17, SCN-003). Parts: an infeed belt with an emitter of **workpieces** (`vary colour`, `intervalMs` about 4000, `maxItems` 8), a `stop-blade` and a `sensor-colour` (target red) and a `sensor-diffuse` at the station, a `pusher` across the belt that pushes a red workpiece onto a side belt to a `remover` `RedBin` (`accepts red`), the straight belt ending in a `remover` `BlueBin` (`accepts blue`), a `push-button` Start, a `stack-light`, one camera preset. The reference program: on Start run the infeed; a workpiece reaching the blade stops there; read `match`: TRUE then extend the pusher until `extended`, retract, and release the blade; FALSE then release the blade; repeat; green lamp after eight. The starter has declarations only and a goal comment. Map: BOOL only. `scenario.json` (`tickMs` 10, `durationMs` at most 100000, aim for 50000): Start at 200 ms and boolean expectations (the form that passes with or without N10): `ALWAYS fact:misrouted:RedBin false` and `fact:misrouted:BlueBin false` and `fact:itemsDropped false`, `EVENTUALLY fact:sorted:RedBin` and `fact:sorted:BlueBin`, `AT` the end the green lamp TRUE. **Seed rule:** record in the commit body the eight colours the emitter draws with seed 1 and check that **both** colours occur (otherwise change `maxItems` or the interval, never the seed). **With N10 merged**, a second commit tightens: `fact:sorted:RedBin` and `fact:sorted:BlueBin` to the exact counts of the recorded sequence. `shortestPulseMs`: the shortest `match` pulse at catalogue speeds (the colour sensor beam crossed by a 0.2 m workpiece at 0.5 m/s is 400 ms; **Unconfirmed**: measure it and declare the measured value).
- [ ] **Step 1: Failing tests.** The S2 test `'SCN-004 every shipped scene passes with its reference program and fails with its starter'` iterates `SCENE_INDEX`; run `bun run generate:scene-index` after creating the five files with an empty program and confirm it FAILS. Run `bun test src/plant/ci` with the binary exported.
- [ ] **Step 2: Write** the files until the reference passes and the starter fails; **run the grade three times and once with each moving speed (belt, pusher) at 0.9 and 1.1 of the tuned value** and tune with margin. `bun run lint`, `bun test src/plant src/learn` (2.0 unchanged).
- [ ] **Step 3: Commit** (tuned values in the reference program and the commit body, never in new scene keys).
```bash
git add packages/zplc-ide/plant-scenes/colour-separation
git commit -m "feat(plant-scenes): scene 17, colour separation, with reference program and scenario"
```
**Risk:** item 6 (scene quality beyond the scenario), item 1 (a persisted, versioned scene file). PHYS-adjacent (hash).

---

### Task F19: Reference scene 19, Height sorting with chain transfer (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-006, PLT-011 (the fault case of lesson 18.3). **Lane F. Wave 4. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/height-sorting-chain/scene.json
IDE/plant-scenes/height-sorting-chain/plant-map.json
IDE/plant-scenes/height-sorting-chain/reference.st
IDE/plant-scenes/height-sorting-chain/starter.st
IDE/plant-scenes/height-sorting-chain/scenario.json
```
(`SCENE_ORDER` entry `'height-sorting-chain': 19` is the parent's; same restore rule as F17.)

**Content.** Goal of spec SCN row 19, "Sort boxes by height with a chain transfer". The **basic** height sorting: two digital beams, no numeric sensor (Plan choice: the "Basic" scene of the owner's list; the numeric height is scene 18). Parts: an infeed belt with an emitter of boxes (random mode `intervalMs` about 6000, heights 0.2, 0.3, 0.4 from the seeded draw, `maxItems` 9), two `sensor-diffuse` across the belt at `heightM` 0.25 and 0.35 above the belt top (R4-C1 edges: they separate the three heights), a `stop-blade` and a `sensor-diffuse` at the transfer, a `chain-transfer` at the end of the infeed with a belt beyond it (straight on: short boxes), a belt to its right (medium boxes) and one to its left (tall boxes), three `remover`s `accepts short`, `medium`, `tall`, a Start button and a stack light. The reference program latches the height class while the box passes the two beams, stops the box on the transfer, lifts, moves it right, left, or runs it straight, lowers, and continues. Boolean expectations as F17: `ALWAYS fact:misrouted:<each bin> false`, `fact:itemsDropped false`, `EVENTUALLY fact:sorted:<each bin>`. **Seed rule** as F17 (all three heights occur, recorded in the commit body). The scene is also the plant of lesson 18.3 (diagnose a stuck sensor or a jam), so add one optional `fault` event to `scenario.json` only if it keeps the reference passing; it is not required. `shortestPulseMs`: the shortest pulse (the upper beam crossed by a 0.4 m box at 0.5 m/s, about 800 ms; **Unconfirmed**, declare the measured value).
- [ ] **Steps 1 to 3 and commit** as F17 (the speed margin applies to the belt speed and the chain transfer's `speedMps`): `feat(plant-scenes): scene 19, height sorting with chain transfer, with reference program and scenario`. **Risk:** item 6, item 1. PHYS-adjacent (hash).

---

### Task F20: Reference scene 20, Weight sorting (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-005, PRT-006. **Lane F. Wave 4. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/weight-sorting/scene.json
IDE/plant-scenes/weight-sorting/plant-map.json
IDE/plant-scenes/weight-sorting/reference.st
IDE/plant-scenes/weight-sorting/starter.st
IDE/plant-scenes/weight-sorting/scenario.json
```
(`SCENE_ORDER` entry `'weight-sorting': 20` is the parent's; same restore rule as F17.)

**Content.** Goal of spec SCN row 20, "Sort boxes by weight with a scale". Parts: an infeed belt with an emitter of boxes (`vary weight`, masses 2 and 5 kg, `intervalMs` about 7000, `maxItems` 8), a `stop-blade` over a `scale` (default 0.6 m volume, `settleMs` 300) at the end of the infeed (the box is **stopped** on the scale: the scale reads only at rest), a `pusher` that pushes a heavy box onto a side belt to a `remover` `HeavyBin` (`accepts heavy`), the straight belt ending in `LightBin` (`accepts light`), a Start button, a stack light. The reference program: wait for `stable`, compare `weight` with 3.5 (an analog comparison, lesson 16.3), push if heavier, release the blade. Map: `Scale1.weight` REAL (raw float, eng 0 to 20 `kg`), `Scale1.stable` BOOL, the rest BOOL (the engineering range must equal the part's, rule R-S3). Boolean expectations as F17; `fact:misrouted:HeavyBin` and `LightBin` never. **Seed rule** as F17 (both masses occur). The scale and the belt under it: the **receiving belt stops during the weighing** (M3 lesson: rest). `shortestPulseMs`: the shortest `stable` or `detect`-type pulse is the pusher's `extended` limit reading (about 800 ms); declare the measured value.
- [ ] **Steps 1 to 3 and commit** as F17 (speed margin: belt and pusher): `feat(plant-scenes): scene 20, weight sorting, with reference program and scenario`. **Risk:** item 6, item 1. PHYS-adjacent (hash).

---

### Task F18: Reference scene 18, Height sorting with turntable (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-005. **Lane F. Wave 4. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/height-sorting-turntable/scene.json
IDE/plant-scenes/height-sorting-turntable/plant-map.json
IDE/plant-scenes/height-sorting-turntable/reference.st
IDE/plant-scenes/height-sorting-turntable/starter.st
IDE/plant-scenes/height-sorting-turntable/scenario.json
```
(`SCENE_ORDER` entry `'height-sorting-turntable': 18` is the parent's; same restore rule as F17.)

**Content.** Goal of spec SCN row 18, "Sort boxes by height with a turntable". The **advanced** height sorting (Plan choice: numeric). Parts: an infeed belt with the random box emitter of F19, a `light-array` across the belt (default 12 beams, pitch 0.05) reading REAL `height`, a `stop-blade` and a `sensor-diffuse` before a `turntable` at the end of the infeed, three output belts (centre: short; right: medium; left: tall) each ending in a `remover` with `accepts short`, `medium`, `tall`, a Start button and a stack light. The reference program: latch the peak `height` while the box passes the array, compare it with 0.25 and 0.35, run the box onto the turntable, stop the belt, turn to the target position, wait for the limit sensor, run the turntable belt to send the box out, return to centre, repeat. Map: `LightArray1.height` REAL (eng 0 to 0.6 `m`). Boolean expectations and seed rule as F19. The turntable turns **only while its surface is stopped** (rule R4-T2): the reference waits for the box to stop. `shortestPulseMs`: declare the measured shortest sensor pulse (**Unconfirmed**, about 800 ms for the array's `detect`).
- [ ] **Steps 1 to 3 and commit** as F17 (speed margin: belt speed and the turntable's `degPerS`, 0.9 and 1.1): `feat(plant-scenes): scene 18, height sorting with turntable, with reference program and scenario`. **Risk:** item 6, item 1. PHYS-adjacent (hash). The grade must fit 100 s: a turn of 90 degrees at 90 degrees per second is 1 s; if nine boxes do not fit, lower `maxItems`, never raise the sample limit (`test-engine/index.ts:18`).

---

### Task F21: Reference scene 21, Vision sorting (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-005. **Lane F. Wave 5 (after S4). PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/vision-sorting/scene.json
IDE/plant-scenes/vision-sorting/plant-map.json
IDE/plant-scenes/vision-sorting/reference.st
IDE/plant-scenes/vision-sorting/starter.st
IDE/plant-scenes/vision-sorting/scenario.json
```
(`SCENE_ORDER` entry `'vision-sorting': 21` is the parent's; same restore rule as F17.)

**Content.** Goal of spec SCN row 21, "Separate items with a vision sensor". Parts: an infeed belt with an emitter of **boxes** (`vary code`, `codes` 2, `intervalMs` about 5000, `maxItems` 8; the two codes stand for two products), a `vision-sensor` over the belt reading INT `code`, a `diverter-arm` at the end of the infeed that swings to send code 2 to a side belt, two `remover`s `accepts code` with `acceptsCode` 1 and 2, a Start button and a stack light. The reference program reads `code` while the item is in the field and, when it is 2, swings the arm before the item arrives and returns it after. Map: `Vision1.code` INT (raw 0 to 9, eng 0 to 9, unit `code`), the rest BOOL. Boolean expectations and seed rule as F17 (both codes occur). The scenario may trigger the `misread` fault at a late time only if the reference still passes; not required. `shortestPulseMs`: declare the measured shortest `detect` pulse.
- [ ] **Steps 1 to 3 and commit** as F17 (speed margin: belt speed and the arm's `degPerS`): `feat(plant-scenes): scene 21, vision sorting, with reference program and scenario`. **Risk:** item 6, item 1. PHYS-adjacent (hash).

---

### Task L5: Lessons 16.1 to 16.6 and 18.3 (content; CONDITIONAL on the outline approval)
**Spec:** CRS-003 to CRS-006, CRS-008 (Instruction List in 16.2), CRS-011. **Lane L. Wave 5. Starts only when the owner approves `course-outline.md` (CRS-001) and M1 task L1 (a manifest may name a scene) is merged; without both, stop and report.**

**Allowed edit surfaces**
```
IDE/lessons/plant-colour-separation/*
IDE/lessons/plant-colour-separation-il/*
IDE/lessons/plant-weight-sorting/*
IDE/lessons/plant-height-chain/*
IDE/lessons/plant-height-turntable/*
IDE/lessons/plant-vision-sorting/*
IDE/lessons/plant-fault-actions/*
```
(Ids, languages and scenes from `course-outline.md` rows 16.1 to 16.6 and 18.3: `plant-colour-separation` ST or LD on scene 17, `plant-colour-separation-il` IL on scene 17, `plant-weight-sorting` ST or LD on scene 20, `plant-height-chain` ST or LD on scene 19, `plant-height-turntable` ST on scene 18, `plant-vision-sorting` ST on scene 21, `plant-fault-actions` ST on scene 19. The outline's open items may rename them.) Each lesson is a package in the 2.0 layout (`lesson.json` manifest with `scene`, `starter`, `solution`, `scenario` with the pinned `scenario.sha256`, hints, English and Spanish text with the same structure), built from the F-task scene and reference. The hardware track is **not** opened (M6). **Unconfirmed:** that an Instruction List solution can drive a plant scene (the IL compiler and the plant map's address layout); the executor of 16.2 proves it first and stops with a report if not. Tests: the existing `lessonCi.test.ts` and curriculum and parity tests grade every solution and starter (CRS-005) and check the languages; `bun test src/learn`.
- [ ] One commit per lesson: `feat(lessons): plant-colour-separation`, `feat(lessons): plant-colour-separation-il`, `feat(lessons): plant-weight-sorting`, `feat(lessons): plant-height-chain`, `feat(lessons): plant-height-turntable`, `feat(lessons): plant-vision-sorting`, `feat(lessons): plant-fault-actions`. **Risk:** item 6 (pedagogy), item 1 (hash-pinned content). Independent verifier for the package format use (L1's guard).

---

### Task Q5: Journeys: a fault by keyboard on a sorting scene; readouts; rest soak on kinematic surfaces
**Spec:** VIS-010, VIS-011, VIS-008, PLT-008, SCN-004 (end to end). **Lane Q. Wave 5. KEEP (journey), PHYS-adjacent (soak).**

**Allowed edit surfaces**
```
IDE/scripts/journeys/plantSorting.ts
IDE/scripts/journeys.ts
IDE/src/plant/core/parts/sortSoak.test.ts
```
(`journeys.ts` gets only the registration of the new export, as Q2 to Q4 did; read `IDE/scripts/journeys.ts` and `IDE/scripts/journeys/plantManipulator.ts` first. The helpers `openPlantDocument`, `runInSimulation`, `plantFacts`, `shippedSceneProject` live in `IDE/scripts/journeys/plantSupport.ts`.) Journeys:
1. Open the project of scene 20, run it in simulation, read `sorted:` from the facts text until it is at least 1, then trigger `readingOffset` on the scale **by keyboard** (Tab to the fault select, choose with the arrow keys, then Tab to the trigger button and Enter; press **Ctrl+M** first when the walk leaves the code editor) and see the fact `misrouted:` appear in the live text (a 2 kg reading offset by 2 kg reads 4 kg and is sent to the heavy bin). Tab reaches every operate control in a stable order, and the arrow keys alone never trigger a fault.
2. Open scene 21, confirm the vision readout shows a code and that the live region stays quiet while the readout changes (no announcement per scan).
The soak (`sortSoak.test.ts`, headless, PLT-008): a core with a turntable at each of its three angles and a raised chain transfer, a box at rest on each; 10 simulated minutes at rest give no drift above 0.001 m and no rotation above 0.1 degrees.
A journey that needs a GPU is out of scope: the journeys give no timing evidence. Expected: the 2.0 journeys and the M1 to M3 plant journeys unchanged.
- [ ] **Step 1: Failing journey and soak; Step 2: implement; Step 3: run** `ZPLC_NATIVE_SIM_BIN=<worktree runtime binary> bun run smoke:journeys` in `IDE/` (with `node install.js` and `electron:compile` done, Global Constraints) and `bun test src/plant/core/parts/sortSoak.test.ts`. **Step 4: commit:** `test(plant): sorting fault by keyboard journey and a rest soak on kinematic surfaces`. **Risk:** item 5 (a journey that drives the application; the stale-binary failure of L16 is the known trap), item 6.

---

### Task C3: Requirement coverage and indexes for the M4 requirements
**Spec:** section 7 item 1. **Lane Q. Wave 6. KEEP. Run by the parent or a CI-hygiene writer after the other tasks merge.**

**Allowed edit surfaces**
```
tools/ci/requirement-evidence.json
tools/ci/requirements-index.json
tools/ci/requirement-coverage.test.ts
IDE/src/generated/sceneIndex.ts
IDE/src/plant/ci/sceneHashes.json
```
(The evidence mechanism is **Unconfirmed** beyond what the M2 hygiene commits `e1007fcd` and `62ac99c1` and L116 show: read `tools/ci/requirement-coverage.ts` and the `generate:*` scripts in `IDE/package.json` first. The coverage fixtures for specs 012 and 013 are fixture-based, never pinned to today's uncovered IDs, L14.) The parent also pins the Linux hashes of the five M4 scenes and regenerates the scene index here, if not done at the wave merges.
- [ ] Steps: `bun tools/ci/requirement-coverage.ts --check` (expected exit 0; **PRT-005 and PRT-006 covered by the M4 tests**; PRT-001 stays partly pending with the missing rows listed in "Not delivered"; SCN-003 stays as M3 left it; LNK, CRS pending), `bun test ./tools/ci`, `CLANG_FORMAT=... bun tools/ci/format.ts --check`. Commit: `test(ci): requirement coverage records for the M4 requirements`. **Risk:** item 5 (CI tooling).

---

## Open questions for the owner
Only real product decisions. Each has a recommended default; the plan proceeds on the default unless told otherwise, except question 1, which gates one task, question 3, which selects the route of B4 (and B5 for the platform), and question 4, which gates one part.

1. **Numeric comparison in scenario expectations (SCN-005, CRS-005), still open since M2.** Every expectation value is boolean today (`IDE/src/test-engine/index.ts:206`, run logbook L20); Task N10 of plan M2 was never merged. M4 does not need it to ship: sorting is graded by `misrouted:<Name>` never and `sorted:<Name>` eventually. It would let a scenario assert "exactly five sorted". *Recommended default: yes, for `fact:` names only, an exact number or `{ "min", "max" }` inclusive; existing scenarios byte-identical (Task N10, wave 1); then scenes 17 to 21 (and M3's 13 and 15) are tightened in follow-up commits.* If the owner declines, M4 ships complete with boolean expectations.
2. **Course outline approval (CRS-001), again.** Lessons 16.1 to 16.6 and 18.3 wait for it (Task L5). *Default: approve before wave 5, or accept that M4 ships its five scenes without lessons and the lessons land with M7. Spec 6.2 says milestones ship scenes with their lessons.*
3. **How a chain transfer and a turntable move items (PLT-007: "carried ... by the physics, not by a script").** (A) A **kinematic** body with a surface velocity (the conveyors' technique) whose axis changes while it is stopped; a raised chain module and a turning platform carry items by contact and friction. (B) Shuttle fallback: the chain transfer's raised plate translates sideways (no surface velocity), and the turntable turns only when empty. *Recommended default: A, with B as the documented fallback if the probe of Task A2 Step 1 shows a kinematic belt cannot carry or wake an item on Linux.* The commands, sensors and facts are the same either way; only A2, B4 and B5 differ.
4. **A colour sensor is not in the spec's minimum catalogue.** The Sensors row lists diffuse, retro-reflective, inductive, capacitive, light array, scale, vision and limit switch; scene 17 ("Colour separation") needs a way to tell two colours. *Recommended default: add a `sensor-colour` with two BOOL signals (`detect`, and `match` for a taught target colour), as real teach-in colour sensors work; the catalogue is a "minimum" (PRT-001).* Alternative: the vision sensor tells colours (then scene 17 and scene 21 teach the same thing). If declined, B1 drops the part and F17 uses the vision sensor.
5. **Parts of the minimum catalogue that no scene of M4 needs.** The aligner and the chute (Flow control row), the stackable crate (Items row), the lift (Conveyors row) and the limit switch (Sensors row). PRT-001 requires them. *Recommended default: defer them: the stackable crate and the lift to M5 (scenes 10 and 11 need them), the aligner, the chute and the limit switch to a small catalogue-completion task at the end of M5 or in M7; record them as pending in the requirement coverage (Task C3).*
6. **How the scale weighs.** (A) The sum of the masses of the items at rest in a weighing volume (a static scale: it reads 0 while an item moves). (B) The vertical contact force on a platform body (needs Jolt contact accumulation, which is harder to make repeatable). *Recommended default: A (rule R4-D3), documented as a known limit; it teaches stopping an item to weigh it.*
7. **Where an item's identity comes from, and how colours are told.** The vision sensor reports a code (spec 4.3 design default). *Recommended default: a code is an item property set by configuration or by the emitter's `vary code` (1 to 9, 0 = unlabelled), carried like the M3 `tag`; red and blue are two tones of different lightness in every display mode plus the text equivalent and the colour sensor's readout (VIS-003's "cue other than colour" is about states).* The 3D view does not draw the code.
8. **Numeric variants of the diverters and of conveyor speed (PRT-004).** The spec's table lists "speed in the numeric variant" for conveyors; M1 to M3 shipped belts with `run` only, and no scene of M4 needs a numeric diverter. *Recommended default: no numeric variant in M4 (the numeric parts of M4 are sensors); record the gap in the coverage and add the numeric belt speed with M5 or M7 when a scene needs it.*

## Findings in the spec and in M3 as merged (contradictions and things that could not be verified)
1. **The Items and Sensors rows leave names open.** The Items row says "coloured part in two colours, metal and non-metal variants" without naming a part; this plan adds one item part, `workpiece`. The Sensors row has no colour sensor although scene 17 is "Colour separation" (question 4).
2. **Every beam is drawn 1 m long.** `sensorRuntime` never publishes `beamLength` (`IDE/src/plant/core/parts/sensors.ts:57`), and the only reader (`IDE/src/plant/view/cues.ts:85-86`) defaults to 1 m, so the diffuse sensor with `rangeM` 0.5 and the retro sensor with 1.5 are both drawn at 1 m (`rg -n "beamLength|rangeM"` finds no other use). B1 fixes it for the old sensors too (the view is not in the trace).
3. **Heights and masses already exist.** `box` has three heights and two masses (`items.ts:85-95`) and the random emitter draws the height only (`sources.ts:73-75`); the new work is the property carriage, the mass draw (`vary weight`) and the classes.
4. **The limit switch row.** The Sensors row lists a limit switch; no part has that name (axis limits are signals of the manipulators and the blade, `axis.ts`, `flow.ts:49`). Nothing in scenes 17 to 21 needs it (question 5).
5. **PRT-004 for conveyors is not met.** "speed in the numeric variant" for conveyors: `conveyors.ts:11-16` has no variant and no numeric speed signal; M2 and M3 did not add it (question 8).
6. **`bodiesInBox` and `gapBelow` see kinematic and static bodies** (`world.ts:269-291`; run logbook L92): the scale and the vision sensor filter by `trackedItems`, or the pad of a manipulator and the plate of a pusher would be weighed and read.
7. **`addItem` and the operate panel add boxes and pallets only** (`plantCore.ts:222`, `OperatePanel.tsx:115`). K9 lets the core add a workpiece; the panel's add-item control stays a box (VIS-010 says "where the scene allows it").
8. **Cross-field scene validation does not exist.** `validateScene` checks each config value on its own (`scene.ts:55-89`), so a `vary` that does not apply to the emitted kind cannot be refused: it has no effect, and the part doc says so (A3).
9. **Kinematic bodies are in the trace** (plan M3 Findings 9): the pose of a plate, an arm, a module or a platform is in the hash of every scene that has one; the yaw table keeps that pose independent of the platform's `Math.sin`. JavaScript's `Math.sin` is not guaranteed identical across engines; the existing build-time geometry still uses it, and the owner's macOS and Windows hash runs (`research.md` section 11) are what would show a difference.
10. **`SCENE_ORDER` is hand-maintained** (`IDE/scripts/generate-scene-index.ts:17-30`): an id that is not there is a generator problem; the five ids are the parent's to add before wave 5.
11. **The parts reference lists its parts by hand** (`tools/docs/plant-parts-reference.ts:24-36`): D5 adds the new arrays and a test that the list equals the catalogue.
12. **A scenario is limited to 10,000 samples** (`IDE/src/test-engine/index.ts:18`), 100 s at `tickMs` 10: scenes with a random emitter and a turntable cycle are tuned to fit, never the limit raised.
13. **Seed.** The live session and the scene check both call `createPlantCore(scene)` with the default seed 1 (`usePlantSession.ts:218`, `sceneCheck.ts:102`); the scene file cannot carry a seed (`sceneSchema.ts:29`). Random scenes are therefore deterministic but cannot be re-seeded by a lesson.
14. **N10 is still unmerged** (`fd -t f . IDE/src/test-engine` shows no `sceneCompare.test.ts`, read on 2026-11-13); a numeric reading is a **signal**, so no scenario can assert a reading's value without N10 or a program output.
15. **Unconfirmed baseline facts I could not read in the time given:** the behaviour (not the typings) of Jolt's surface velocity on a kinematic body, of a raised kinematic body under a resting box and of a rotating kinematic platform (A2 Step 1); whether the harness exports of `transport.test.ts` (`plant`, `part`, `defs`) can be imported by new test files (B1); the catalogue-parity test file for the plant strings (U4); the scenario-format documentation page (N10); the docs build command (D5); whether an Instruction List solution can drive a plant scene (L5); the exact shortest sensor pulses of the five scenes (the F tasks measure them); the requirement-evidence mechanism beyond the M2 commits (C3).

## Done when (aligned with spec section 7, for M4)
- [ ] The owner has the answers or accepted defaults of the open questions; the gate verdict (macOS, Windows) is recorded or the PHYS-adjacent tasks (A2, A3, B1 to B5, K9, S4, F17 to F21, the Q5 soak) are listed as at risk.
- [ ] Task A0's contract and A2's world additions are merged and no other task changed a contract (C1 to C10 are unchanged).
- [ ] Items carry a colour, a metal flag and a code; the catalogue has the workpiece, the inductive, capacitive and colour sensors, the light array, the scale, the vision sensor, the pusher, the diverter arm, the chain transfer and the turntable, each defined once with English and Spanish names, documentation, fault actions, tested on the headless core including limits (PRT-001 to PRT-003, PRT-005 to PRT-008, PRT-010, PLT-011; A3, B1 to B5, K9).
- [ ] The vision sensor reports the code of the item in view, the light array reports height and the scale reports weight, each with a documented range, on the live and the graded path alike (PRT-005, PLT-017; B2, S4).
- [ ] Sorting is graded: a remover that declares what it accepts publishes `sorted:` and `misrouted:`, scenarios and the text equivalent read them, and nothing is announced per scan (PLT-010, VIS-008; A3, K9, U4).
- [ ] The new parts are drawn with a cue other than colour, beams draw their real range, items show their colour, and the faults can be triggered by pointer and by keyboard with choose-then-act (VIS-003, VIS-009, VIS-010; V6, U4, Q5).
- [ ] Reference scenes 17, 18, 19, 20 and 21 pass their scenarios with the reference program and fail with the starter, in CI on Linux; their Linux hashes are pinned in `IDE/src/plant/ci/sceneHashes.json`; the scene index is regenerated in spec order; the twelve scenes of M1 to M3 and the four core pins keep their hashes (SCN-001 to SCN-004, PLT-006, section 7 item 2). macOS and Windows runs are the owner's until the nightly job covers them.
- [ ] Documentation exists in English and Spanish for the sensors, the diverters, the item properties, the grading facts and scenes 17 to 21, the parts reference is generated and equals the catalogue, and nothing claims a measured number that was not measured (CRS-011, CRS-013, section 7 item 8).
- [ ] If the owner approved the outline: lessons 16.1 to 16.6 and 18.3 are graded in CI in both languages (CRS-003 to CRS-005, CRS-008). If question 1 was approved: N10 merged and scenes 17 to 21 (and M3's 13 and 15) tightened.
- [ ] All 2.0 suites pass unchanged: lessons, plants, smoke, journeys, the content security policy test (PLT-013, section 7 item 6). `bun run lint`, `bun test`, `bun test ./tools/ci`, `bun tools/ci/requirement-coverage.ts --check` and the pinned formatter `--check` pass.
- [ ] The independent verifiers of A2 with B4 and B5 (kinematic carrying, Review Focus 2, 7), A3 (Review Focus 1, 6), K9 (hashes, Review Focus 1, 3, 9), N10 (if it ran) and the feature-end verifier (B1 to B3, S4 and the five scenes: three repeated grades and the moving speeds at 0.9 and 1.1) returned with no open blocker; the requirement coverage reports M4's requirements `covered`, conditional ones with their decision, later milestones `pending` (section 7 item 1).
- [ ] The tree can ship as a 2.1 pre-release.
