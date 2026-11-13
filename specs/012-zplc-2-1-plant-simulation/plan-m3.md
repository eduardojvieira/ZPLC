# ZPLC 2.1 Milestone M3 Implementation Plan: manipulators and gripping (PROVISIONAL, revision 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Provisional.** M3 builds on M2 **as merged** on `feat/plant-simulation` at commit `bebc223b` (`Merge branch 'test/m2-c1-coverage' into feat/plant-simulation`, read with `git log --oneline -1` on 2026-11-13). The gate verdict of decision D-14 is **still pending the owner's macOS and Windows runs** (`research.md` section 11): D-14 is confirmed on Linux x64 only. Unlike M2, **M3 is physics-heavy**: a gripper holds a rigid body while a kinematic carriage moves it, so most tasks touch Jolt or pin a trace hash. They are marked **PHYS-adjacent** in the lane table (K1, K3, K4, K6, K7, K8, S3, F5, F6, F13, F14, F15, and the soak of Q4). If macOS or Windows overturns D-14, those tasks are redone; the pure tasks (K0, K2, K5, V5, U3, D4, N10, L4, C2) are written against `PlantCore`, `PlantSnapshot`, `PartRuntime` and the scenario seam and survive (**KEEP**), exactly as in plans M1 and M2.

**Goal:** Deliver milestone M3 of spec 012 (spec section 6.2: "Manipulators and gripping"): the catalogue gains the manipulator parts (a two-axis pick and place, a three-axis gantry, a vacuum gripper and a clamp, each with a digital variant of move commands and limit sensors and a numeric variant of position setpoint and feedback), the layer palletizer, and the lid and base items; a gripper holds, carries and releases a rigid body through the physics, deterministically, with capture and restore; the plant publishes the facts a grader needs (picked, placed, dropped, axis positions, assembled, stacked); and reference scenes **5 (Two-axis assembly)**, **6 (Two-axis assembly, numeric)**, **13 (Layer palletizer)**, **14 (Belt-to-belt transfer)** and **15 (Three-axis palletizing)** ship with a reference program that passes, a starter that fails, a pinned Linux trace hash and a regenerated scene index, in English and Spanish documentation, in a state that could ship as a 2.1 pre-release.

**Architecture:** Nothing in the M1 or M2 architecture changes. M3 adds one capability to the physics world and three pure or near-pure modules, then composes parts from them. (1) The world (`core/world.ts`) gains a **grip primitive**: `attach` fixes a dynamic item to a kinematic anchor body with a Jolt `FixedConstraint`, `detach` releases it, `bodiesInBox` and `gapBelow` are the two queries a gripper needs, and `removeBody` detaches first. (2) `core/parts/axis.ts` is a pure motion law for one linear axis, written with `+ - * /` only so it is bit-for-bit repeatable (PLT-006). (3) `core/parts/gripper.ts` is the gripper runtime shared by every manipulator: capture rule, release rule, load limit, and the three counters `picked`, `placed`, `drops`. (4) `core/support.ts` computes the stacking facts (`itemsAssembled`, `stacked:pallet:<i>`, `layers:pallet:<i>`) from poses and sizes with no physics call. The parts (`pick-place`, `gantry`, `layer-palletizer`) are thin definitions over 2 and 3, each wrapped in a `PartRuntime` stepped on the 5 ms plant step; the pad (the one body the part owns) is **kinematic in the static layer**, the technique of the stop blade (`core/parts/flow.ts:25-47`), so a sensor beam never mistakes it for an item. The numeric variant uses the M2 numeric path unchanged: REAL setpoints and feedback, scaled by `exchangeScan`. No firmware, no C, no IPC allow-list and no Electron main-process change is needed.

**Tech Stack:** TypeScript 5.9 (`erasableSyntaxOnly`: no parameter properties), React 19 with the React Compiler lint, Bun 1.3.14 (`bun test`), three 0.187.0 and `jolt-physics` 1.1.1 as in M1 (no new dependency; the typings of 1.1.1 declare `FixedConstraintSettings` with `mAutoDetectPoint`, `AddConstraint`, `RemoveConstraint`, `SetMotionType` and `BroadPhaseQuery.CollideAABox` in `dist/types.d.ts`, read on 2026-11-13; their **behaviour** is not verified until Task K1 Step 1), the Studio UI kit (`IDE/src/ui`).

**Spec:** `spec.md` sections 5 (PLT, VIS, PRT, SCN, LNK, CRS) and 6.2, reference scenes 5, 6, 13, 14 and 15 of the SCN table; `plan-m1.md` revision 2 (format, contracts C1 to C8); `plan-m2.md` (contracts C9 and R-rules); the run logbook `odd/tasks/zplc-2-1-0-run.md` (entries L1 to L83) in the main checkout; `course-outline.md` rows 15.1 to 15.5. Read the spec sections of your task before you start.

**Created:** 2026-11-13 by a planning agent. Anything marked **Unconfirmed** was not verified while writing; the executor confirms it first and records the answer in the commit body. "Plan choice" marks a decision of this plan that the spec does not state.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`; `COMPILER/` is `packages/zplc-compiler/src/`; `CORE/` is `firmware/lib/zplc_core/`. `bun test`, `bun run lint` and `bunx tsc -b` run with `IDE/` as the working directory unless the step says "at the root". The pinned formatter is `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` (or `--check`), at the root.

## Roles
| Role | Does |
|---|---|
| Executor | One task each, in its lane. Writes tests first, runs the commands, commits. Never edits a file outside the task's "Allowed edit surfaces". `git add` every new file **before** running the formatter (it only sees tracked files). |
| Parent | Owns git across lanes, merges lanes in dependency order, runs the seam check (full IDE suite once) at each wave merge, regenerates `IDE/src/generated/sceneIndex.ts` and pins `IDE/src/plant/ci/sceneHashes.json` once per wave (so two scene tasks never edit them), adds new docs pages to `docs/sidebars.js`, runs `format --write` after each merge batch, and launches the independent verifiers named in "Done when". |
| Owner | Records the gate verdict (macOS, Windows), answers the open questions at the end (question 1 gates Task N10 and the tight expectations of scenes 13 and 15; question 2 gates the route of Task K3), approves `course-outline.md` (CRS-001; gates Task L4), runs the macOS and Windows hash and evidence runs. |

## Start rule
1. **Precondition A, M2 as merged.** `feat/plant-simulation` at `bebc223b` or later: `fd -t f . IDE/src/plant/core/parts` shows `conveyors.ts flow.ts indicators.ts items.ts operable.ts panel.ts process.ts sensors.ts sources.ts`; `fd -t d . IDE/plant-scenes -d 1` lists seven scenes (the five of M1, `timed-tank`, `tank-level-control`); `IDE/src/plant/ci/sceneHashes.json` has seven Linux entries. If not, stop: the parent merges first.
2. **Precondition B, the gate.** Not blocking for M3 (see the provisional note), but the owner's verdict decides whether the **PHYS-adjacent** tasks are redone. The plan proceeds at risk, as M1 and M2 did. If the probe of Task K1 Step 1 shows the Jolt constraint is not usable, Task K3 takes the fallback of open question 2 and says so in its commit body; that is not a gate failure.
3. **Fresh worktree.** `export TMPDIR=$HOME/.cache/zplc-tmp` (create it with `mkdir -p`), `bun install`, `bun run build:compiler`, `bun run build:runtime`; in `packages/zplc-ide/node_modules/electron` run `node install.js`, and run `bun run electron:compile` in `IDE/`, before any journey or the screen-reader capture (see Global Constraints).
4. **Order.** Wave 1 first. Task K3 waits for K1's probe verdict; Tasks K6 and K7 wait for K2 and K3.

## Requirement mapping
Requirements that M3 does not deliver are listed in the last table so nothing is silently dropped.

| Requirement | Task(s) | Note |
|---|---|---|
| PLT-006 | K1, K2, K3, K8, S3, F5 to F15 | "The same scene, program and input script MUST produce the same signal trace and the same plant facts on Linux, macOS and Windows and on repeated runs." The axis law uses `+ - * /` only; constraint creation and destruction are in a fixed order; `bodiesInBox` returns creation order, never broad-phase order. Two core hashes (`m3-gripCycle-v1`, `m3-gantryNumeric-v1`) and five scene hashes are pinned on Linux; macOS and Windows are the owner's. |
| PLT-007 | K1, K3, K6, K7 | "Items MUST have mass, friction and collision. They are carried, pushed, stacked, lifted, gripped, dropped and blocked by the physics, not by a script: a box pushed off a belt falls." Gripped is the new word: the grip is a physical constraint between a kinematic pad and a dynamic item (open question 2 records the fallback). |
| PLT-008 | K3, Q4 | "A stack of five boxes on a pallet MUST stay stacked while the pallet travels on a conveyor at catalogue speed and while that conveyor starts and stops. An item at rest MUST stay at rest, without drift or jitter, for ten simulated minutes." M3 adds: an item released by a gripper onto a stack settles and stays at rest ten simulated minutes (Q4 soak). |
| PLT-010 | K3, K5, K6, K7, K8 | "The core MUST expose named plant facts about what happened: items produced, delivered, dropped and collided, positions reached, levels. Scenarios, the text equivalent of VIS-008 and the trace all read the same facts." New facts: `picked:<Name>`, `placed:<Name>`, `drops:<Name>`, `axis:<Name>:<x|y|z>`, `itemsAssembled`, `stacked:pallet:<i>`, `layers:pallet:<i>` (table "Facts" below). |
| PLT-011, PRT-008 | K3, K6, K7 | "Each part SHOULD define the fault actions a diagnosis lesson needs: at least a sensor stuck on or off, an actuator that does not move, and an item jam where the part can jam." Faults: `stuckX`, `stuckY`, `stuckZ`, `gripFail`, `dropLoad`, `grippedStuckOn`, `grippedStuckOff` (palletizer adds `squareStuck`, `layerReadyStuckOff`). An item jam does not apply to a carriage: it applies to the conveyors of the scene (M1 `jam`). |
| PLT-012 | K1, K8, S3 | "Reset MUST return a scene to exactly its initial state, and the state of a running scene MUST be capturable and restorable." Capture mid-carry and restore replays the journal (`plantCore.ts:285-312`), so the constraint is recreated at the same step; S3 proves it with the exact world state comparison the core already makes. |
| PLT-016 | K1, K3, K8 | Located messages for a grip on an unknown item, an out-of-range setpoint (already clamped by the M2 rule R-X1), and a scene whose gantry would not fit its 64-byte exchange (the M2 span message). |
| PLT-017 | S3 | One implementation: the numeric positions go through `exchangeScan` for both paths. S3 proves live equals graded for a gripping scene. |
| VIS-003 | V5 | "The view MUST show the state that matters for control: sensor beams and whether they detect, actuator state, and the signal name of a part on hover and on focus. It MUST use the signal vocabulary of UX-009, with a cue other than colour for every state." The gripper state (holding or not) gets the `signal.cue.*` vocabulary and a marker; axis positions are shown as text. |
| VIS-008 | U3 | Picks, places and drops are integer facts: announced on change. Axis positions are continuous and **never** enter the change key (M2 lesson, Review Focus 8). |
| VIS-010 | U3, Q4 | Manipulators are not panel parts: a person does not jog them. The fault control of the operate panel is generic (`OperatePanel.tsx:61`) and already lists every part that has actions. Q4 covers the keyboard-only fault journey. |
| VIS-011 | U3, D4 | English and Spanish; Studio component kit. |
| PRT-001 | K4, K6, K7 | Catalogue rows "Manipulators" and "Stations" (layer palletizer only) and the Items "lid" and "base". Plan choice: the vacuum gripper and the clamp are **variants (`gripper`) of the manipulator parts**, not placeable parts (open question 3). |
| PRT-002 | K6, K7, K4, D4 | One definition per part; the generated reference is compared in CI. |
| PRT-003 | K2, K3, K6, K7 | "A part's behaviour MUST be tested on the headless core, including its limits (speed, stroke, load)." Limits: speed and acceleration (K2), stroke (K2, K6), load (K3). |
| PRT-004 | K6, K7 | "Where a reference scene needs both, a part MUST offer a digital variant (commands and limit sensors) and a numeric variant (setpoint and feedback)." `variant` digital or numeric on `pick-place`, `gantry` and `layer-palletizer`. Scenes 5 and 6 are the pair. |
| PRT-007 | K6, K7 | Snap points (the schematic footprint of a gantry comes from them, `schematic.ts:25-34`). |
| PRT-009 | V5 | Geometry in code; no asset. |
| PRT-010 | K6, K7, K4 | A test adds each part without a change to the scene format version, the link or the lesson code. |
| SCN-001 to SCN-004 | F5, F6, F13, F14, F15 | Five scenes, original layouts, reference passes, starter fails, in CI. |
| SCN-005 | N10, F13, F15 | "A scenario MUST be able to script panel inputs, item emission and fault actions at virtual times, and to assert on plant facts with the expectation kinds that exist today." Counting boxes on a pallet needs a numeric comparison (open question 1, carried from plan M2). |
| SCN-007 | F5 to F15 | Each scene declares `shortestPulseMs`. |
| SCN-011 to SCN-013 | none new | The M2 editor handles numeric REAL signals; gantry signals appear automatically. S3 checks the declaration generator on a gantry map. |
| CRS-003 to CRS-006, CRS-008, CRS-011 (M3 scenes) | L4, D4 | Lessons 15.1 to 15.5. **Conditional** on the owner approving `course-outline.md` (CRS-001). 15.2 is the SFC lesson. |
| CRS-007 (partial) | L4 | State machines for stations (15.1, 15.2), manual and automatic modes are not taught by M3 scenes. |

**Not delivered by M3** (later milestones, per spec 6.2, or out of scope): the rest of the Items row (stackable crate, coloured parts, metal variants: M4 and M5); the Flow control parts pusher, diverter arm, aligner, chute (M4); sensors beyond M1's (inductive, capacitive, light array, scale, vision: PRT-005, M4); the stacker crane, machining centre and the lift (M5); the layer palletizer is a "Stations" part delivered early because spec 6.2 lists scene 13 under M3 (Findings 1); LNK-007 to LNK-018 (M6); CRS-001, CRS-002, CRS-007 (the rest), CRS-009, CRS-010, CRS-012, CRS-013 (M6 and M7); a manual jog of an axis by a person (open question 8); separate placeable gripper parts and pipes-style part-to-part wiring (open question 3); six-axis robots (spec 4.4); a numeric readout drawn **inside** the 3D view; arm and frame collision with items (the pad is the only body of a manipulator, Plan choice); scenes 1 to 4, 7 to 12 and 16 to 21 (other milestones or done in M1 and M2).

## Contract extensions (types and rules; lanes code against these, never against each other)
M3 **extends** contracts C1 to C8 of plan M1 and C9 of plan M2; it changes none of them. Task K0 writes the type changes of `contracts.ts`. Task K1 writes the world additions in `world.ts` (they are part of C10 and K1 owns them because they are code, not types only). Changing one needs the parent: every lane depends on it.

```ts
// IDE/src/plant/contracts.ts  (Task K0; every other declaration stays as merged in M2)

/** C1/C2 amended: two families. 'stations' holds the layer palletizer now and the stacker crane and machining centre in M5. */
export interface PartDefinition {
  // ...existing fields...
  family: 'items' | 'sources' | 'conveyors' | 'flow' | 'sensors' | 'panel' | 'process' | 'manipulators' | 'stations';
}

/** C3 amended: an optional tag of an item, so the view can draw a lid or a base differently from a box. Pallets have none. */
export interface BodyPose {
  // ...existing fields...
  tag?: 'box' | 'lid' | 'base';
}
```

```ts
// IDE/src/plant/core/world.ts  (Task K1; the existing members stay as merged, `world.ts:26-43`)
export interface PhysicsWorld {
  // ...existing members...
  has(id: string): boolean;
  /** Ids of dynamic and kinematic bodies whose centre lies inside the box, in CREATION order (never the broad-phase order). */
  bodiesInBox(min: Vec3, max: Vec3): readonly string[];
  /** Vertical distance from the lowest face of body `id` to the highest surface under its centre (any layer, itself excluded), in m; Infinity if none. */
  gapBelow(id: string): number;
  /** Fixes `itemId` to `anchorId` at their current relative pose (Jolt FixedConstraint) and activates the item. Throws a located Error for an unknown id or an item already attached. */
  attach(anchorId: string, itemId: string): void;
  /** Releases the item; it keeps its velocity and is activated. A no-op when it is not attached. */
  detach(itemId: string): void;
  attachedTo(itemId: string): string | null;
}
// `removeBody(id)` of an attached item, or of an anchor, detaches first. `capture()` records the attachments `[itemId, anchorId][]` in attach order in its head;
// `restore()` throws a located Error when they differ (the core never calls it: it restores by journal replay).
```

```ts
// IDE/src/plant/core/parts/axis.ts  (Task K2; pure, no import but types)
export interface AxisSpec { strokeM: number; speedMps: number; accelMps2: number }
export interface AxisState { p: number; v: number } // position along the stroke in m, 0..strokeM; velocity in m/s
export type AxisCommand = { mode: 'jog'; dir: -1 | 0 | 1 } | { mode: 'goto'; target: number };
/** One plant step of `dtS` seconds. `stuck` freezes the axis (fault action). Rules R-A1 to R-A4. */
export declare function stepAxis(s: AxisState, cmd: AxisCommand, spec: AxisSpec, dtS: number, stuck: boolean): AxisState;
export declare const AT_LIMIT_M: 0.001; // a limit sensor is TRUE within this distance of an end

// IDE/src/plant/core/parts/gripper.ts  (Task K3)
export type GripperKind = 'vacuum' | 'clamp';
export interface GripperSpec { kind: GripperKind; maxLoadKg: number; maxItems: number }
export interface Pad { id: string; centre: Vec3; half: readonly [number, number] } // the pad body id, its bottom-face centre and half footprint (x, z), world frame
export interface Gripper {
  /** Called once per plant step from `beforeStep`, after the pad has been posed: capture or release by rules R-G1 to R-G4. */
  update(grip: boolean, pad: Pad): void;
  /** Called from `afterStep`: settles the `placed` and `drops` accounting of released items (rule R-G3). */
  settle(): void;
  held(): readonly string[]; // item ids, attach order
  counts(): { picked: number; placed: number; drops: number };
  act(action: 'gripFail' | 'dropLoad'): void;
}
export declare function createGripper(world: PhysicsWorld, spec: GripperSpec): Gripper;

// IDE/src/plant/core/support.ts  (Task K5; pure)
export interface SupportItem { id: string; kind: 'item' | 'pallet'; tag?: 'box' | 'lid' | 'base'; size: Vec3; p: Vec3; v: Vec3 }
export interface SupportTracker { update(items: readonly SupportItem[]): void; facts(): Record<string, number> }
export declare function createSupportTracker(): SupportTracker;
```

**Rules (fixed here, written once, tested in the task named):**
- **R-A1 axis law (K2).** Per step, `+ - * /` and comparisons only, double arithmetic. `jog` with `dir`: target velocity `dir * speedMps`; velocity moves toward it by at most `accelMps2 * dtS` per step; position `p = p + v * dtS`; at `p <= 0` or `p >= strokeM` the position clamps and `v = 0`. `goto` with `target` clamped to `0..strokeM`: let `d = target - p`, `vc` the velocity this step would reach moving toward `sign(d) * speedMps` by at most `accelMps2 * dtS`, and `braking = vc * vc / (2 * accelMps2)`; if `|d - vc * dtS| <= braking` the velocity is decreased toward 0 by `accelMps2 * dtS` (braking), else it moves toward `sign(d) * speedMps` by the same amount (amended during K2: testing the braking distance on the current velocity brakes one step late and overshot by up to 8 mm in 18 of 216 table cases, against R-A3's 1 mm); **snap rule** (R-A2): if `|d| <= 0.0005` and `|v| <= accelMps2 * dtS` then `p = target` and `v = 0`. `stuck` returns the state unchanged. No `Math.sqrt`, no `Math.pow`, no trigonometry.
- **R-A3 no overshoot (K2).** After any `goto` from rest over any distance within the stroke, the position never passes the target by more than 0.001 m and the axis is within the snap distance after at most `|d| / speedMps + 2 * speedMps / accelMps2 + 0.1` seconds.
- **R-A4 limit sensors (K6).** Digital variant: `AtMin` is `p <= AT_LIMIT_M`, `AtMax` is `p >= strokeM - AT_LIMIT_M`. A hold-to-move command with both directions TRUE does not move (as the conveyor's `run` with `runReverse`).
- **R-G1 capture (K3).** While `grip` is TRUE and the gripper holds fewer than `maxItems`, each step it looks for capturable items among `world.bodiesInBox` of the capture volume and attaches, nearest first (horizontal distance, ties by id). An item is **capturable** when: it is a tracked item (`trackedItems`, `items.ts:46`), its mass is at most `maxLoadKg` (the part reads it from the item's config; items carry their mass in `ItemInfo`, K4 adds `massKg`), its speed relative to the pad is at most 0.05 m/s (a grip on a moving item **misses**; this is a lesson, not a defect), and the kind geometry holds. **Vacuum:** the item's top face is between 0.005 m above and 0.02 m below the pad's bottom face and the pad centre is over the item's footprint. **Clamp:** the item's centre is within 0.05 m (x and z) of the pad centre, its top face is 0 to 0.25 m below the pad bottom, and the jaws have closed: `closeFraction` reaches 1 after 0.3 s of `grip` TRUE (the jaws are drawn, not bodies; Plan choice). The constants are **starting values**; the executor may tune them within these ranges and states the final values in the part doc.
- **R-G2 release (K3).** `grip` FALSE with items held detaches them all in held order. `picked` counts attached items.
- **R-G3 placed and dropped (K3).** A released item is watched for up to 3 s of plant time. It is **placed** when it has been at rest (speed at most 0.05 m/s) with `gapBelow <= 0.01` for 20 consecutive steps (100 ms); it is a **drop** when 3 s pass without that, when it falls below the drop plane (the core removes it, `plantCore.ts:42`), or when it is released by `dropLoad`. Each item is counted once.
- **R-G4 faults (K3).** `gripFail`: capture never happens (existing holds stay). `dropLoad`: every held item is detached at once and counted a drop; the gripper then behaves normally. A removed item (`world.has(id)` false) is forgotten without a count.
- **R-X (inherited).** Inside the core a numeric signal is an engineering value in metres; at the exchange it is raw (M2 rules R-S1, R-S2, R-X, R-X1 to R-X3 apply unchanged). Setpoints are clamped to `0..stroke`.
- **Determinism restatement (M3).** The per-step state update of every M3 part and of `axis.ts` and `support.ts` uses `+ - * /`, comparisons, `Math.abs`, `Math.min`, `Math.max`, `Math.round`, `Math.floor`, `Math.fround`. Build-time geometry may use trigonometry through the existing `rotateY` and `yawQuat` (`items.ts:32-39`); that is how `conveyors.ts`, `world.ts:134` and the M1 hashes already work (Findings 8).

**Part signal tables (names are API for scenes, maps and scenarios; `<Name>` is `ScenePart.name`).** Plan choice throughout. Axis letters follow the world: X along the part (its local +x, turned by `rotationYDeg`), Y **up**, Z across (local +z). A part's position is the point on the floor under the pad's home corner: axis position 0 on every axis is the pad at its lowest, minimum-X, minimum-Z point; the pad's bottom face is at `position.y + yPos`.

| Part id | Family | Signal | Direction | Type | Range, unit | Config (key: range, default) | Fault actions |
|---|---|---|---|---|---|---|---|
| `pick-place` | manipulators | digital: `xPlus`, `xMinus`, `yPlus`, `yMinus` (hold to move) | command | BOOL | | `variant`: digital or numeric, digital; `gripper`: vacuum or clamp, vacuum; `strokeXM`: 0.4 to 3, 1.2; `strokeYM`: 0.2 to 1.2, 0.5; `speedMps`: 0.1 to 2, 0.8; `accelMps2`: 0.5 to 10, 3; `maxLoadKg`: 1 to 25, 5 | `stuckX`, `stuckY`, `gripFail`, `dropLoad`, `grippedStuckOn`, `grippedStuckOff` |
| `pick-place` | manipulators | digital: `xAtMin`, `xAtMax`, `yAtMin`, `yAtMax` | sensor | BOOL | | (same part) | |
| `pick-place` | manipulators | numeric: `xSet`, `ySet` | command | REAL | 0 to stroke, `m` | | |
| `pick-place` | manipulators | numeric: `xPos`, `yPos` | sensor | REAL | 0 to stroke, `m` | | |
| `pick-place` | manipulators | `grip` (vacuum on or jaws close) | command | BOOL | | | |
| `pick-place` | manipulators | `gripped` (an item is held) | sensor | BOOL | | | |
| `gantry` | manipulators | as `pick-place`, plus Z: `zPlus`, `zMinus`, `zAtMin`, `zAtMax`; `zSet`, `zPos` | as above | as above | `0 to strokeZM`, `m` | as `pick-place` plus `strokeZM`: 0.4 to 3, 1 | as `pick-place` plus `stuckZ` |
| `layer-palletizer` | stations | `square` (squaring pusher extend); `squared` (pusher at its limit); `layerReady` (a full layer lies at rest in the forming zone); axes X (transfer) and Y (lift), `grip`, `gripped` as `pick-place` | command and sensor | BOOL; numeric as `pick-place` | | `variant`, `strokeXM`: 0.8 to 3, 1.6; `strokeYM`: 0.3 to 1.5, 0.8; `speedMps`, `accelMps2` as above; `columns`: 1 to 3, 2; `rows`: 1 to 3, 2 (boxes per layer = columns times rows, 0.4 by 0.3 m each); `maxLoadKg`: 5 to 60, 40 (the layer) | `stuckX`, `stuckY`, `squareStuck`, `gripFail`, `dropLoad`, `grippedStuckOn`, `grippedStuckOff`, `layerReadyStuckOff` |
| `lid` | items | none | | | | `mass`: enum `0.5`, `1`, default `0.5` kg. A 0.4 by 0.3 m slab, 0.04 m high | |
| `base` | items | none | | | | `mass`: enum `2`, `5`, default `2` kg. A 0.4 by 0.3 m block, 0.15 m high | |

The emitter's `kind` enum (`sources.ts:22`) gains `lid` and `base` (Task K4). The pad is 0.3 by 0.2 m for the vacuum gripper and the clamp (starting values). The layer palletizer's forming zone is `columns * 0.4` by `rows * 0.3` metres on the floor at its local +x side of the part position, bounded on two sides by fixed plates and on the third by the squaring pusher (a kinematic plate, as the stop blade); the pallet is a scene item (`pallet` part) placed under the transfer stroke's far end. The executor of K7 fixes the exact offsets and records them in the part doc.

**Facts (plan choice; names are API for scenarios, the text equivalent and the trace).**

| Fact | Owner | Meaning |
|---|---|---|
| `picked:<Name>`, `placed:<Name>`, `drops:<Name>` | each gripping part | Integer counts by rules R-G1 to R-G4. A layer palletizer counts items, not layers. |
| `axis:<Name>:x`, `axis:<Name>:y`, `axis:<Name>:z` | each gripping part | Axis position in metres, rounded to 0.001. Continuous: never in `describePlant`'s change key. `z` only on the gantry. |
| `itemsAssembled` | core (`support.ts`) | Distinct lids that have rested on a base (their bottom within 0.005 m of its top, centres within 0.1 m, both at rest) for 40 consecutive steps. Monotonic. |
| `stacked:pallet:<i>` | core (`support.ts`) | Number of boxes supported, directly or through other boxes, by the i-th pallet in creation order (the index of `position:pallet:<i>`), counting only items at rest. State, not monotonic. |
| `layers:pallet:<i>` | core (`support.ts`) | The deepest support chain of boxes on that pallet (a stack of 3 boxes is 3). |

The fact grammar of `IDE/src/plant/ci/sceneCheck.ts:30-45` (`FACT_GRAMMAR`, `factFault`) learns them in K8. Support is geometric (poses and sizes of tracked items, axis-aligned footprints; the yaw of an item is ignored, a `ponytail:` comment records the ceiling), never a physics query, so it is repeatable.

**View state keys (so V-lane tasks code against fixed names).** A manipulator's primary `PartView` (id = `part.id`) has `state = { x, y, z, strokeX, strokeY, strokeZ, fraction, text, holding, gripper, variant, closeFraction }` (numbers except `holding` boolean and the two strings); `fraction` is `x / strokeX`; `text` is `X 0.52 m, Y 0.20 m` (and Z); `signals` hold the part's own signals (so the cue and `describePlant` read `gripped`). Its pose is the **pad** (size `[0.3, 0.03, 0.2]`, centre at the pad's bottom-face centre plus half its height). Two secondary views, ids `${part.id}-frame` and `${part.id}-beam`, have `signals: {}` and the part name, and carry the static frame and the moving beam; the **view kinds** (the `part` field) are `'pick-place'`, `'gantry'`, `'layer-palletizer'`, `'manipulator-frame'`, `'manipulator-beam'`, `'lid'`, `'base'` (M1 and M2 used view kinds that differ from catalogue ids, Findings 6). The `tag` of items travels in `BodyPose.tag`.

## Lanes and dependency graph
**KEEP** = survives any gate outcome. **PHYS-adjacent** = loads Jolt through `createPlantCore` or `createWorld`, or pins a trace hash, so it is re-run if D-14 is overturned.

| Lane | Task | Title | Kind | Depends on | Lane-owned surface (summary) |
|---|---|---|---|---|---|
| K | K0 | Contract extensions: two families, item tag, docs-generator family labels | KEEP | A | `IDE/src/plant/contracts.ts`, `tools/docs/plant-parts-reference.ts` |
| K | K1 | World grip primitive: attach, detach, queries, capture | PHYS-adjacent | A | `IDE/src/plant/core/world.ts`, `world.grip.test.ts` |
| K | K2 | Axis motion law | KEEP | A | `IDE/src/plant/core/parts/axis.ts` |
| K | K4 | Lid and base items, emitter kinds, item mass and tag | PHYS-adjacent | A | `IDE/src/plant/core/parts/items.ts`, `sources.ts` |
| K | K5 | Support facts: assembled, stacked, layers | KEEP | A | `IDE/src/plant/core/support.ts` |
| K | N10 | Numeric and ranged conditions on plant facts (**conditional on open question 1**; plan M2 Task N10, still unmerged) | KEEP | owner answer | `IDE/src/test-engine/index.ts` |
| K | K3 | Gripper runtime: vacuum and clamp, counters, faults | PHYS-adjacent | K0, K1, K4 | `IDE/src/plant/core/parts/gripper.ts` |
| V | V5 | View: gantry, pad, jaws, lid and base, grip cue | KEEP | K0 (contract only) | `IDE/src/plant/view/{geometry,cues,renderer}.ts` |
| U | U3 | Operate panel readouts, announcements, strings | KEEP | K0 (contract only) | `IDE/src/plant/ui/{OperatePanel,NumericControls}.tsx`, `IDE/src/plant/text/describe.ts`, `IDE/src/i18n/catalog/plantView.ts` |
| P | K6 | Manipulator parts: `pick-place` and `gantry` | PHYS-adjacent | K2, K3 | `IDE/src/plant/core/parts/manipulators.ts` |
| P | K7 | Layer palletizer station | PHYS-adjacent | K2, K3 | `IDE/src/plant/core/parts/layerPalletizer.ts` |
| C | K8 | Core integration: register parts, support facts, grammar, tag in snapshot, pinned hashes | PHYS-adjacent | K3 to K7 | `IDE/src/plant/core/{plantCore,facts}.ts`, `hashes.json`, `IDE/src/plant/ci/sceneCheck.ts` |
| D | D4 | Docs EN/ES: manipulators, gripping model, scenes, parts reference | KEEP | K6, K7 | `docs/docs/plant/*`, `docs/i18n/es/.../plant/*`, `docs/sidebars.js` |
| S | S3 | Live equals graded for a gripping scene; capture and restore mid-carry | PHYS-adjacent | K8 | `IDE/src/plant/ci/liveVersusGradedGrip.test.ts`, `IDE/src/plant/ci/fixtureGrip/*` |
| F | F14 | Scene 14, Belt-to-belt transfer | PHYS-adjacent (hash) | K8, U3 | `IDE/plant-scenes/belt-to-belt-transfer/*` |
| F | F5 | Scene 5, Two-axis assembly | PHYS-adjacent (hash) | K8, K4, U3 | `IDE/plant-scenes/two-axis-assembly/*` |
| F | F13 | Scene 13, Layer palletizer | PHYS-adjacent (hash) | K8, U3 | `IDE/plant-scenes/layer-palletizer/*` |
| F | F15 | Scene 15, Three-axis palletizing | PHYS-adjacent (hash) | K8, U3 | `IDE/plant-scenes/three-axis-palletizing/*` |
| F | F6 | Scene 6, Two-axis assembly, numeric | PHYS-adjacent (hash) | F5, S3 | `IDE/plant-scenes/two-axis-assembly-numeric/*` |
| L | L4 | Lessons 15.1 to 15.5 (**conditional on the course-outline approval**) | KEEP | F5, F6, F13, F14, F15 | `IDE/lessons/plant-*` (five) |
| Q | Q4 | Journeys: fault by keyboard on a manipulator scene; ten-minute rest soak | PHYS-adjacent (soak) | U3, F14, F15 | `IDE/scripts/journeys/plantManipulator.ts`, `IDE/src/plant/core/parts/gripSoak.test.ts` |
| Q | C2 | Requirement coverage and indexes for the M3 requirements | KEEP | all | `tools/ci/requirement-*`, generated indexes |

**Graph.**
```
K0 -+-> K3 -+-> K6 -+
K1 -+       |       +-> K8 -+-> F14 / F5 / F13 / F15 (parallel) -> F6 -> L4 (conditional)
K4 -+-> K7 -+       |       +-> S3 -> F6
K2 -----> K6, K7    |       +-> Q4 (also U3, F14, F15)
K5 -----------------+       +-> D4 (also K6, K7)
K0 -> V5 ; K0 -> U3 ; N10 -> (tightens F13, F15, M2 scene 12) ; all -> C2
```
**Parallel waves** (tasks of a wave have disjoint file surfaces and may run together; the parent merges at the end of each wave and runs the seam check):
1. **K0, K1, K2, K4, K5**, and **N10** (only after the owner answers question 1).
2. **K3** (after K1's probe verdict and K0, K4 merged), **V5**, **U3** (both against the contract and fakes).
3. **K6, K7.**
4. **K8, D4.**
5. **S3, F14, F5, F13, F15.** (F-tasks never edit the scene index or the hash file: the parent does. They need K8 merged; U3 for the operate panel only.)
6. **F6** (after F5 is merged: it copies F5's layout and changes the variant, and after S3), **Q4**, **L4** (only after the outline approval).
7. **C2.**

Shared files and who edits them: `world.ts` only K1; `plantCore.ts` and `facts.ts` only K8; `sceneCheck.ts` only K8; `items.ts` and `sources.ts` only K4; `contracts.ts` only K0; `geometry.ts`, `cues.ts`, `renderer.ts` only V5; `describe.ts`, `plantView.ts` catalogue, `OperatePanel.tsx`, `NumericControls.tsx` only U3; `test-engine/index.ts` only N10; `tools/docs/plant-parts-reference.ts` K0 (one line) then D4; `docs/sidebars.js`, `IDE/src/generated/sceneIndex.ts` and `sceneHashes.json` only the parent.

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

## Review Focus (conditions the spec implies; each has a test in the task that owns it)
1. A held item moves with its pad on every step and is not left behind by an acceleration of the axis; releasing it puts it down without a jump and without penetration (K1, K3).
2. `attach`, `detach` and `removeBody` leave no dangling constraint: removing a held item, removing the world, `reset` and `restore` never crash or leak, and a capture mid-carry restores to the same exact world state (K1, S3).
3. Repeatability: the same scene, program and script give the same trace hash on repeated runs and with host pacing varied; the axis law is bit-exact; `bodiesInBox` and every counter follow creation order (K1, K2, K8, S3).
4. A grip on a moving item misses and does not yank it; an item above `maxLoadKg` is never captured; a gripper never holds more than `maxItems` (K3).
5. `picked`, `placed` and `drops` count each item once; a drop is never also a place; a box that bounces off a pallet edge is a drop (K3).
6. The axis never leaves `0..stroke`, never overshoots a setpoint by more than 1 mm, ignores a non-finite setpoint (inherited from R-X1) and holds still under `stuck` (K2, K6).
7. The digital variant moves only while a command is held and reports its limits; the numeric variant follows its setpoint and reports its position; both give the same trace for the same motion (K6, S3).
8. `describePlant` does not announce an axis position: over a whole 1 m move the change key changes only on the grip and limit transitions (U3).
9. A scene that existed in M1 or M2 keeps its pinned hash: nothing in M3 changes its trace, including the world's new contact path (K1, K8).
10. The 2.0 plants and lessons are untouched: `bun test src/plants src/test-engine src/learn` passes unchanged at every merge (PLT-013).
11. Stacking facts are state of the plant, not of the program: they read the same on a pallet that arrived by belt or by gripper, ignore items in motion, and do not flicker (K5).

---

### Task K0: Contract extensions: two families, item tag
**Spec:** PRT-001, PRT-002. **Lane K. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/contracts.ts
IDE/src/plant/contracts.m3.test.ts
tools/docs/plant-parts-reference.ts
tools/docs/plant-parts-reference.test.ts
```
**Interfaces:** the declarations of "Contract extensions" (the `family` union at `contracts.ts:33`, `BodyPose` at `contracts.ts:67-73`). The generator's `FAMILY` map (`tools/docs/plant-parts-reference.ts:34-42`) is typed `Record<PartDefinition['family'], L10n>`, so it must gain `manipulators` (`Manipulators`, `Manipuladores`) and `stations` (`Stations`, `Estaciones`) in the same commit or `tsc` fails; the section order is the order of the keys.
- [ ] **Step 1: Failing tests.** `contracts.m3.test.ts`: `'PRT-002 a part definition may declare the manipulators and stations families'` (a `satisfies PartDefinition['family']` list and a runtime array of the nine families); `'PRT-009 a body pose may carry a tag of box, lid or base and a pallet carries none'`. In `plant-parts-reference.test.ts` (read it first for the pattern): `'PRT-002 the parts reference has a heading for every family of the contract in both languages'`.
- [ ] **Step 2: Run.** `bun test src/plant/contracts.m3.test.ts` (in `IDE/`) and `bun test tools/docs/plant-parts-reference.test.ts` (root). Expected: FAIL.
- [ ] **Step 3: Implement.** Type changes and the two labels (Spanish neutral usted register where a sentence is written; the labels are nouns).
- [ ] **Step 4: Run** the tests, `bunx tsc -b`, `bun run lint`; `bun test src/plant src/plants src/test-engine` unchanged.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/contracts.ts packages/zplc-ide/src/plant/contracts.m3.test.ts tools/docs
git commit -m "feat(plant): manipulators and stations families and an item tag in the plant contracts"
```
**Risk:** item 3 (the contracts every M3 lane consumes; nothing is removed, two members are added). KEEP.

---

### Task K1: World grip primitive: attach, detach, queries, capture
**Spec:** PLT-007, PLT-006, PLT-012. **Lane K. Wave 1. PHYS-adjacent.** Independent verifier required (Review Focus 1 to 3 and 9).

**Allowed edit surfaces**
```
IDE/src/plant/core/world.ts
IDE/src/plant/core/world.grip.test.ts
```
(A new test file so the M1 `world.test.ts` stays as it is.)

**Interfaces:** the C10 declarations of "Contract extensions". Existing code to extend: the `entries` map and `keyOf` (`world.ts:82-91`), `setKinematicPose` (`world.ts:179-186`: `MoveKinematic` with `stepMs / 1000`; a kinematic body keeps the velocity it was last given, so moving to the pose it already has is what stops it, see the comment in `flow.ts:45`), `step` (`world.ts:187-201`), `rayHit` (`world.ts:202-212`, which sees the moving layer only: `gapBelow` needs a cast against **all** layers, so it builds its own broad-phase and object-layer filters with every layer enabled), `bodies` (`world.ts:213-229`; kinematic bodies are listed and therefore **enter the trace**), `capture` and `restore` (`world.ts:230-287`), `removeBody` (`world.ts:155-161`) and `dispose` (`world.ts:288-302`: constraints must be removed before bodies).
Implementation notes: `attach` builds a `FixedConstraintSettings` with `mAutoDetectPoint = true`, creates it with the two `Body` objects (`bodyInterface.GetBody...` or the stored `entry.body`; **Unconfirmed** which call creates a constraint from settings in the 1.1.1 typings: read `dist/types.d.ts` around `class FixedConstraintSettings`, line 1347, and `class PhysicsSystem` for `AddConstraint`), adds it with `physics.AddConstraint`, and activates the item (`bodyInterface.ActivateBody`). `bodiesInBox` uses `physics.GetBroadPhaseQuery().CollideAABox` with a `CollideShapeBodyCollectorJS` (typings `types.d.ts:2472-2506`), then sorts by the creation index of `entries` (a `Map` keeps insertion order) so the result never depends on the broad-phase tree. `gapBelow` casts a ray down from the body's bottom-centre; to exclude the body itself it uses `Jolt.IgnoreSingleBodyFilter` (**Unconfirmed** it exists in the typings) or starts the ray 1 mm below the bottom face.

- [ ] **Step 1: Probe (Unconfirmed items; this decides open question 2's route).** In a scratch test (not committed) create a world, a kinematic pad, a dynamic box on a floor, attach with a `FixedConstraint`, move the pad 1 m up over 400 steps and back, detach, and record: the box follows within 2 mm; `capture()` mid-carry restores on a fresh world that repeats the same attach and steps (the exact bytes match); three fresh runs give the same SHA-256 of the box pose sequence. Write the verdict (constraint usable: yes or no, and why) in the commit body. **If it is not usable**, stop and report: Task K3 takes the kinematic-carry fallback (open question 2) and the parent revises this task to `SetMotionType` instead of a constraint.
- [ ] **Step 2: Failing tests** (`world.grip.test.ts`, all on a real world):
  1. `'PLT-007 an attached box follows its kinematic anchor up and sideways and is not left behind'`: anchor 0.3 m above a 5 kg box, attach, accelerate the anchor at 3 m/s squared for 1 m; the box's offset to the anchor stays within 2 mm.
  2. `'PLT-007 a detached box falls and rests on the floor without a jump'`: release 0.05 m above the floor; it comes to rest with its bottom within 1 mm of the floor and speed below 0.005 m/s after 1 s.
  3. `'PLT-007 an item removed while attached leaves no constraint and the world keeps stepping'` and `'PLT-007 removing the anchor of an attached item detaches it'`; `dispose` with an attachment does not throw.
  4. `'PLT-006 bodiesInBox returns creation order, whatever the order the bodies were moved in'`: three boxes created a, b, c, then moved; the result is `[a, b, c]` in a box that contains all; a body whose centre is outside is excluded; the floor (static) is never returned.
  5. `'PLT-007 gapBelow measures the distance to the surface under a body, any layer'`: on a belt top 0.45 m, a box bottom at 0.50 gives 0.05; over nothing gives `Infinity`; stacked on another box gives the distance to its top.
  6. `'PLT-012 capture and restore keep the attachments'`: capture mid-carry; `restore` on a world rebuilt with the same bodies and the same `attach` call reproduces the exact state; a world without the attachment throws `capture belongs to a different set of attachments`.
  7. `'PLT-006 the pose sequence of an attach, carry and release is identical on three fresh worlds'` (hash of the box poses, N=3 runs in the same process, a fresh module each: `loadJolt()` returns a fresh instance, `jolt.ts:6`).
  8. `'PLT-007 attach refuses an unknown id and an item that is already attached with a located message'`.
  9. Previous behaviour: `'PLT-006 a world with no attachment steps exactly as before'`: the existing `world.test.ts` hash cases stay green; additionally `hashes.json` is unchanged after `bun test src/plant` (a world built with the new listener code still gives `m1-palletStack-v1`).
- [ ] **Step 3: Run.** `bun test src/plant/core/world.grip.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement**, then run `bun test src/plant/core` (all M1 and M2 core tests, hashes included), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/world.ts packages/zplc-ide/src/plant/core/world.grip.test.ts
git commit -m "feat(plant): attach and detach items to a kinematic anchor, box and gap queries in the physics world"
```
**Risk:** item 4 (constraint lifetime and solver order are concurrency-like hazards: a leaked constraint or a different creation order changes the trace), item 1 (`capture()` head gains a field), item 3 (`PhysicsWorld` is consumed by every part). PHYS-adjacent. The M1 hashes are the guard.

---

### Task K2: Axis motion law
**Spec:** PRT-003 (speed and stroke limits), PLT-006. **Lane K. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/axis.ts
IDE/src/plant/core/parts/axis.test.ts
```
**Interfaces:** "Contract extensions" (`AxisSpec`, `AxisState`, `AxisCommand`, `stepAxis`, `AT_LIMIT_M`) and rules R-A1 to R-A3, nothing else. The module imports nothing but types. The plant step is 5 ms (`PLANT_STEP_MS`, `world.ts:4`); the function takes `dtS` so the tests can use any step.

- [ ] **Step 1: Failing tests:**
  1. `'PRT-003 a jogged axis accelerates to its speed limit, no further, and brakes at its stroke end'`: speed never above `speedMps`; position never above `strokeM`; velocity is 0 on reaching the end.
  2. `'PRT-003 a jog in the other direction at the end moves away again'` and `'PRT-003 jog with dir 0 decelerates to rest'`.
  3. `'PRT-003 a goto reaches its target within 0.0005 m and stops, without overshoot'`: table of strokes 0.4 to 3 m, speeds 0.1 to 2 m/s, accelerations 0.5 to 10 m/s squared, distances from 0.001 m to the stroke: overshoot at most 0.001 m, settling within the R-A3 bound.
  4. `'PRT-003 a goto target outside the stroke is clamped to it'`; `'PRT-006 a goto with a target changed mid-move reverses without overshooting the new target'`.
  5. `'PRT-008 a stuck axis returns its state unchanged'`.
  6. `'PLT-006 the axis law is bit-exact: the same inputs give the same state sequence, hashed'` and `'PLT-006 axis.ts uses no Math function beyond abs, min and max, and no clock or random'`: read `axis.ts` and assert it has none of `Math.sqrt`, `Math.pow`, `Math.exp`, `Math.log`, `Math.sin`, `Math.cos`, `Math.random`, `Date`, `performance` (as `process.test.ts` does for the tank).
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/axis.test.ts` (FAIL), implement, run with `bunx tsc -b` and `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/axis.ts packages/zplc-ide/src/plant/core/parts/axis.test.ts
git commit -m "feat(plant): deterministic linear axis motion law with stroke, speed and acceleration limits"
```
**Risk:** item 6 (a motion law that is plausible but wrong is caught only by the tests above), item 4 (every manipulator steps it each plant step). KEEP.

---

### Task K4: Lid and base items, emitter kinds, item mass and tag
**Spec:** PRT-001 (Items row: "lid, base"), PRT-002, PRT-003, PRT-010. **Lane K. Wave 1. PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/items.ts
IDE/src/plant/core/parts/sources.ts
IDE/src/plant/core/parts/lidBase.test.ts
```
**Interfaces:** `ItemInfo` (`items.ts:41-44`: `kind`, `size`) gains `massKg: number` and `tag?: 'box' | 'lid' | 'base'` (read by K3 for the load limit and by K8 for the snapshot pose); `spawnItem` (`items.ts:49-72`) takes them (a new optional last parameter `tag`, mass is already a parameter), `itemRuntime` (`items.ts:90-113`) and the `itemParts` array (`items.ts:116-145`) gain `lid` and `base` definitions (family `items`; config `mass`, no signals, no actions; names `Lid`/`Tapa`, `Base`/`Base`; doc EN and ES). Sizes: lid `[0.4, 0.04, 0.3]`, base `[0.4, 0.15, 0.3]`. The emitter (`sources.ts:21-27` config, `:43-62` `emit`) gains the kinds `lid` and `base` in its `kind` enum; a lid or base emitter takes `mass` from its config (the `height` setting is ignored for them and the part doc says so). Existing boxes keep `tag: 'box'`; pallets have none. `ItemInfo.kind` stays `'item' | 'pallet'`, so every existing consumer (`facts.ts`, remover, `postStep`) is untouched; lids and bases are `item` kind and therefore appear in `position:box:<n>` (Findings 5).

- [ ] **Step 1: Failing tests** (`lidBase.test.ts`, with the `plant()` harness of `transport.test.ts:13-60` or a local copy; **Unconfirmed** that harness is importable, it exports `plant`, `part`, `defs`):
  1. `'PRT-001 the catalogue has a lid and a base with English and Spanish names and documentation'`; `'PRT-010 adding lid and base changes no scene schema version'` (`SCENE_SCHEMA_VERSION` still 1).
  2. `'PRT-003 a lid and a base honour their mass setting and refuse one outside it'` (validateScene message located at `parts[0].config.mass`).
  3. `'PRT-001 an emitter of lids and one of bases emit items of the right size, mass and tag'`: `trackedItems` entry has `tag`, `massKg`, `size`.
  4. `'PLT-007 a lid placed on a base rests on it and stays at rest for 60 simulated seconds'` (the stacked pair: no drift above 0.001 m).
  5. Previous behaviour: `'PRT-001 the emitter still emits boxes and pallets exactly as before'` (the M1 emitter tests plus one trace comparison of a box emitter against a hard-coded pose after 2 s).
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/lidBase.test.ts src/plant/core/parts/transport.test.ts` (FAIL then pass), `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/items.ts packages/zplc-ide/src/plant/core/parts/sources.ts packages/zplc-ide/src/plant/core/parts/lidBase.test.ts
git commit -m "feat(plant): lid and base items and emitter kinds, item mass and tag"
```
**Risk:** item 3 (`ItemInfo` and `spawnItem` are shared by sources, sensors, the core and the facts: the change is additive and the M1 transport tests are the guard), item 6 (the emitter's enum is a persisted vocabulary: adding values is compatible). PHYS-adjacent (new bodies).

---

### Task K5: Support facts: assembled, stacked, layers
**Spec:** PLT-010, PLT-008. **Lane K. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/core/support.ts
IDE/src/plant/core/support.test.ts
```
**Interfaces:** "Contract extensions" (`SupportItem`, `SupportTracker`, `createSupportTracker`) and the Facts table. Pure and synchronous: it receives one `SupportItem[]` per plant step in creation order (K8 builds it from `trackedItems` and `world.bodies()`, `plantCore.ts:233-247` shows the same join for `position:` facts) and keeps its own counters. The relation: item B is supported by item A when `B.bottom` is within 0.005 m of `A.top`, the horizontal overlap of their footprints is at least 30 % of B's footprint, both have speed at most 0.05 m/s, and B is above A. A lid counts toward `itemsAssembled` when its support is a `base` for 40 consecutive steps (centres within 0.1 m); each lid id counts once. `stacked:pallet:<i>`: boxes (`tag` box, lid or base all count) supported by pallet `i` directly or through a chain, at rest; `layers:pallet:<i>`: the longest chain. Footprints are axis-aligned from `size` (yaw ignored: write a `ponytail:` comment naming the ceiling and the upgrade, an oriented-box test).
- [ ] **Step 1: Failing tests:** `'PLT-010 a lid resting on a base for 200 ms counts as assembled once, and removing it later does not uncount it'`; `'PLT-010 a lid moving over a base does not count'`; `'PLT-010 five boxes in a 2 by 2 pattern plus one on top give stacked 5 and layers 2 on their pallet'`; `'PLT-008 an item at rest keeps the facts constant for 10 simulated minutes'` (feed 120000 identical steps; counters unchanged, runs in under 2 s); `'PLT-010 a box carried above a pallet does not count until it rests'`; `'PLT-010 two pallets are told apart by creation order index'`; `'PLT-006 support.ts uses no Math function beyond abs, min and max, and no clock or random'`; `'PLT-010 facts is empty of stacked and layers entries when the scene has no pallet'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/support.test.ts`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/support.ts packages/zplc-ide/src/plant/core/support.test.ts
git commit -m "feat(plant): geometric support facts for assembled items and stacks on a pallet"
```
**Risk:** item 6 (a wrong support rule makes a grade wrong without failing anything else; the table above pins the cases). KEEP.

---

### Task N10: Numeric and ranged conditions on plant facts (CONDITIONAL on open question 1)
**Spec:** SCN-005, CRS-005 (an expectation on a plant fact). **Lane K. Wave 1. KEEP. Do not start until the owner answers question 1.** Persisted-format change: high risk, independent verifier required.

This is **Task N10 of `plan-m2.md` carried forward unchanged**: it was never started (the M2 run closed with it conditional, run logbook L83), and `fd -t f . IDE/src/test-engine` shows no `sceneCompare.test.ts`. M3 needs it more than M2 did: scenes 13 and 15 grade a count of boxes on a pallet, which a boolean-only expectation cannot assert (open question 1). If it was already merged when M3 starts, skip this task and tighten scenes 13 and 15 with it.

**Allowed edit surfaces**
```
IDE/src/test-engine/index.ts
IDE/src/test-engine/sceneCompare.test.ts
```
(The scenario-format documentation page is **Unconfirmed**: `rg -n "EVENTUALLY" docs/docs -l`; add that page and its Spanish twin to this surface when found. `plant/ci/sceneCheck.ts` needs no change: `checkSceneFacts` walks keys, not values, `sceneCheck.ts:48-63`.) Recommended default of question 1: in a condition, a `fact:` read may carry, instead of a boolean, a number (exact equality) or an object `{ "min"?: n, "max"?: n }` (inclusive); booleans and every non-fact signal stay exactly as today. `signalSet` (`index.ts:206`) is where `expected` must today be boolean; `ResolvedSignal.value` is `boolean` (`index.ts:45-49`). A scenario with no numeric condition compiles, hashes and runs **byte-identically**.
- [ ] **Step 1: Failing tests:** `'SCN-005 a fact condition may be an exact number or a min and max'`; `'SCN-005 a scenario with only boolean conditions compiles to the same object as before'` (deep equality against the S1 snapshot) and `'PLT-013 every 2.0 scenario hash is unchanged'`; `'SCN-005 a numeric condition on a program signal is refused with a located message'`; `'SCN-005 a stacked count of 8 on a pallet passes at 8 and fails at 7'` (uses a stub fact).
- [ ] **Step 2 to 4:** implement, `bun test src/test-engine src/plant/ci src/learn`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/test-engine
git commit -m "feat(test-engine): numeric and ranged conditions on plant facts"
```
**Risk:** item 1 (a persisted scenario format), item 3 (consumed by 68 lessons' hashes). Independent verifier: all 2.0 scenario hashes are the guard.

---

### Task K3: Gripper runtime: vacuum and clamp, counters, faults
**Spec:** PLT-007, PLT-010, PLT-011, PRT-003 (load), PRT-008. **Lane K. Wave 2. PHYS-adjacent.** Independent verifier required, with K1 (Review Focus 1, 2, 4, 5).

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/gripper.ts
IDE/src/plant/core/parts/gripper.test.ts
```
**Interfaces:** the `Gripper`, `GripperSpec`, `Pad`, `createGripper` declarations and rules R-G1 to R-G4 of "Contract extensions"; `PhysicsWorld.attach`, `detach`, `attachedTo`, `bodiesInBox`, `gapBelow`, `has` (K1); `trackedItems`, `ItemInfo.massKg` (K4, `items.ts:41-46`). The gripper owns no body: the part (K6, K7) creates the kinematic pad body and poses it, then calls `update(grip, pad)` from `beforeStep` and `settle()` from `afterStep` (`PartRuntime`, `items.ts:5-14`). The pad is created by the part in the **static** layer with motion `kinematic` (as `flow.ts:28-38`), so `world.rayHit` never sees it. State per release (item id, plant steps since release, steps at rest) is kept in arrays in attach order. If K1's probe (Step 1 there) says the constraint is not usable, this task implements the same interface with the fallback of open question 2: `SetMotionType` to kinematic and a pose set each step relative to the pad; the tests below are written against the interface and do not change. The route taken is stated in the commit body.

- [ ] **Step 1: Failing tests** (a minimal pad driver in the test: a kinematic body moved by `setKinematicPose` each step; real world):
  1. `'PLT-007 a vacuum pad over a box captures it on grip, lifts it and puts it down on release'` (counts: picked 1, placed 1, drops 0).
  2. `'PLT-007 a clamp closes for 0.3 s before it holds and picks a box from the side-and-top capture volume'`.
  3. `'PRT-003 an item above maxLoadKg is never captured and the pad reports it holds nothing'`; `'PRT-003 a gripper never holds more than maxItems'` (a layer of four with maxItems 4 holds four, with 3 holds three).
  4. `'PLT-007 a grip on a moving item misses'`: a box on a belt at 0.5 m/s under a stationary pad is not captured and is not disturbed (its speed stays 0.5 m/s).
  5. `'PLT-010 releasing onto a pallet counts placed, releasing 0.3 m above it counts a drop'`; `'PLT-010 a box that bounces off a pallet edge and falls to the floor is a drop and never also placed'`; `'PLT-010 each item is counted once even if grabbed and released twice'` (second cycle counts picked 2, placed 2).
  6. `'PRT-008 gripFail captures nothing and keeps existing holds; dropLoad drops everything held at once and counts drops'`.
  7. `'PLT-006 a pick, carry and place cycle gives the same hash of poses and counts on three fresh worlds'`.
  8. `'PLT-008 a placed box stays at rest for 60 simulated seconds, with no drift above 0.001 m'`.
  9. `'PLT-007 an item removed while held is forgotten with no count and no error'`.
  10. `'PLT-016 update refuses a pad whose id is not a body of the world with a located message'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/gripper.test.ts` (FAIL), implement, run with `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/gripper.ts packages/zplc-ide/src/plant/core/parts/gripper.test.ts
git commit -m "feat(plant): vacuum and clamp gripper runtime with load limit, placed and drop accounting and faults"
```
**Risk:** item 6 (grip rules plausible but wrong are caught only by the tests above), item 4 (constraint lifetime shared with the world), item 1 (the counters are facts consumed by scenario files). PHYS-adjacent.

---

### Task V5: View: gantry, pad, jaws, lid and base, grip cue
**Spec:** VIS-003, VIS-009, PRT-009. **Lane V. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/view/geometry.ts
IDE/src/plant/view/cues.ts
IDE/src/plant/view/renderer.ts
IDE/src/plant/view/manipulators.test.ts
```
**Interfaces:** the "View state keys" paragraph. `partShape` (`geometry.ts:49-71`) gains cases for the new view kinds; **note the existing cases `'blade'` and `'curve'` never match** (the views are `'stop-blade'`, `flow.ts:58`, and the conveyor view kind is the layout id `'curved'`, `conveyors.ts:8`): do not copy the pattern; do not fix those two cases either (outside this task's remit unless a test of yours needs it: report it). `partDecor` (`geometry.ts:106-110`) draws the jaws of a clamp as two boxes whose gap follows `state.closeFraction` and `state.gripper === 'clamp'`, and a suction skirt for `'vacuum'`; the frame and beam are the secondary views (their shapes are boxes from their poses). `cuesFor` (`cues.ts:71-91`): add `'gripped'` to `ACTIVE_SUFFIXES` (`cues.ts:38`) before the others so a manipulator's state is its grip; `valueOf` (`cues.ts:64-69`) already reads `state.text` and `state.fraction` for the axis readout; the cue marker for `true` is `solid`, for `false` `dashed` (VIS-003: a cue other than colour). `renderer.ts:405-433` keys part meshes by `view.id`, so the secondary views work with no change; `materialFor` and `partColor` (`renderer.ts:237-247`) get the lid and base colours (a lid and a base differ in tone **and** in outline, VIS-009 high contrast; items are drawn by `instanceColors`, `geometry.ts:153-163`, which reads `BodyPose.kind`: it gains the `tag`). **Unconfirmed:** how `PlantCanvas.tsx` labels or picks views on hover (a secondary view carries the part name on purpose); read it first and record the answer.
- [ ] **Step 1: Failing tests** (view tests are pure; follow `cues.test.ts` and `renderer.test.ts` fakes): `'VIS-003 a manipulator holding an item is told TRUE with a solid marker, an empty one FALSE with a dashed marker'`; `'VIS-003 a manipulator view carries its axis position as text and a fraction'`; `'PRT-009 the pick-place, gantry and palletizer shapes are generated in code and need no asset'`; `'VIS-003 a clamp draws its jaws closer as closeFraction grows'`; `'VIS-009 lids and bases are drawn with their own tone and an outline'`; `'VIS-003 the frame and beam views have no signals and the part name'`; previous behaviour `'VIS-003 the cues of the M1 and M2 parts are unchanged'` (a table of the existing views).
- [ ] **Step 2 to 4:** `bun test src/plant/view`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/view
git commit -m "feat(plant): draw manipulators, grippers, lids and bases with a grip cue"
```
**Risk:** item 6 (drawing is checked by pure tests only; the journey of Q4 looks at the real view). KEEP.

---

### Task U3: Operate panel readouts, announcements, strings
**Spec:** VIS-008, VIS-010, VIS-011. **Lane U. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/ui/OperatePanel.tsx
IDE/src/plant/ui/NumericControls.tsx
IDE/src/plant/ui/OperatePanel.manipulators.test.tsx
IDE/src/plant/text/describe.ts
IDE/src/plant/text/describe.manipulators.test.ts
IDE/src/i18n/catalog/plantView.ts
```
**Interfaces:** `describePlant` (`describe.ts:14-42`): add `'axis:'` to `CONTINUOUS` (`describe.ts:7`) so an axis fact never enters the change key or the sentence; `picked:`, `placed:` and `drops:` are integer facts and already announce on change through the generic `plant.text.fact` line (`describe.ts:28`); add three catalogue sentences (`plant.text.picked`, `plant.text.placed`, `plant.text.drops`) in English and Spanish and special-case them like `delivered` (`describe.ts:26`); a held item is announced through `active` (the part name appears when `gripped` is TRUE, `describe.ts:30`). `OperatePanel.tsx:58-60` hard-codes the ids that get a readout, and **`Readout` ends in a fallthrough that draws a stack light for any other id** (`NumericControls.tsx:114-124`): adding a manipulator id to that list without a branch would draw it as a lamp. Add a `manipulator` branch: `<span data-plant-manipulator={name}>` with the position text (`state.text`) and the grip state with a marker, e.g. `Gantry1: X 0.52 m, Y 0.20 m, holding` (a `t()` key with `{name}`, `{text}`, `{state}`; "holding" and "empty" in both languages). The generic fault `Select` (`OperatePanel.tsx:105-123`) already lists the manipulators' actions; the action names are shown as the catalogue gives them (unlocalised, as today). Strings in `plantView.ts` (English as the catalogue, Spanish neutral usted, `falla`, `tarima`).
- [ ] **Step 1: Failing tests:** `'VIS-008 an axis position never changes the change key over a whole move'` (a fake snapshot series: `axis:Gantry1:x` from 0 to 1 m in 200 steps: the key changes only when `gripped` toggles); `'VIS-008 picks, places and drops are announced when they change and only then'`; `'VIS-008 describePlant says a manipulator is holding when gripped is TRUE'`; `'VIS-011 the manipulator readout and the new sentences exist in English and Spanish'` (the catalogue parity test pattern; **Unconfirmed** its file: `rg -n "plant.panel" IDE/src/i18n -l`); `'VIS-010 a manipulator appears in the fault list with its actions and is not drawn as a stack light'`; previous behaviour `'VIS-008 the tank and the stack light readouts are unchanged'`.
- [ ] **Step 2 to 4:** `bun test src/plant/ui src/plant/text src/i18n`, `bunx tsc -b`, `bun run lint` (2632+ keys both catalogues).
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/ui packages/zplc-ide/src/plant/text packages/zplc-ide/src/i18n
git commit -m "feat(plant): manipulator readout, grip announcements and strings in English and Spanish"
```
**Risk:** item 6 (an accessibility regression the pure tests cannot hear; Q4 and the screen-reader capture cover it). KEEP.

---

### Task K6: Manipulator parts: `pick-place` and `gantry`
**Spec:** PRT-001 (Manipulators row), PRT-002, PRT-003, PRT-004, PRT-007, PRT-008, PRT-010, PLT-010, PLT-011. **Lane P. Wave 3. PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/manipulators.ts
IDE/src/plant/core/parts/manipulators.test.ts
```
**Interfaces:** `stepAxis` (K2), `createGripper` (K3), `marker` (`sensors.ts:6-13`), `cfgNumber`, `cfg`, `rotateY`, `yawQuat` (`items.ts:25-39`), `PartRuntime` and `RuntimePartDefinition` (`items.ts:5-16`), the signal table and fact table above. Produces `export const manipulatorParts: readonly RuntimePartDefinition[]` (`pick-place`, `gantry`, family `manipulators`, **not registered here**: K8 registers them, as M2 did). Design: one runtime factory `manipulatorRuntime(axes: 2 | 3)` builds one kinematic pad body in the static layer (`world.addBody`, id `${part.id}-pad`, half `[0.15, 0.015, 0.1]`, as the blade at `flow.ts:28-38`); `beforeStep(commands)` reads the commands (digital: hold-to-move per R-A4; numeric: a finite number sets the target, a non-finite or absent value keeps the previous target), steps each axis with `stepAxis` (`dtS` 0.005, `stuck` per fault), computes the pad pose (the part position, rotated by `rotationYDeg` for the x and z strokes, plus the axis positions; the pad's bottom face at `position.y + y`), calls `world.setKinematicPose(padId, ...)` **every step** (a kinematic body keeps its last velocity, `flow.ts:45`), then `gripper.update(grip === true, pad)`; `afterStep` calls `gripper.settle()`. `sense()` returns the sensors of the chosen variant plus `gripped` (false when stuck off, true when stuck on, otherwise `gripper.held().length > 0`). `facts()` returns `picked`, `placed`, `drops` and the `axis:<Name>:<letter>` positions rounded to 0.001. `views()` returns the primary view and the two secondary views of "View state keys". `signals(part)` derives the table from `variant`, `gripper`, the strokes and (for the gantry) Z; the numeric ranges are `0..stroke`, unit `m` (R-S3 of plan M2: the map's engineering range equals it). `snapPoints(part)` returns the four corners of the plan footprint (`strokeXM` by `strokeZM` or `0.6` for two axes) so the schematic gets a footprint (`schematic.ts:25-34`) and the two pick and place anchors `pickLow`, `placeLow` named points (accepts belts). The part `doc` and `equations` (the axis law in words and symbols, EN and ES, **Plan choice**: `equations` is optional for non-process families, `contracts.ts:41`) list settings, signals, faults and the fact names.

- [ ] **Step 1: Failing tests** (real world; `plant()`-style harness; commands driven directly):
  1. `'PRT-004 the digital variant has hold-to-move commands, limit sensors, grip and gripped; the numeric variant has setpoints, positions, grip and gripped'`: names, directions, types, ranges, units of `signals(part)` for both parts and both variants (Z only on the gantry).
  2. `'PRT-003 a digital axis moves only while its command is held, stops at its stroke end and reports the limit'`; `'PRT-003 both directions commanded together do not move the axis'`.
  3. `'PRT-003 a numeric axis follows a setpoint within 0.001 m and reports its position'`; `'PRT-003 a setpoint outside the stroke is clamped and a non-finite one is ignored'`.
  4. `'PRT-004 the digital and numeric variants make the same motion for the same trajectory'` (hold the command for the time a setpoint move takes: pad pose within 2 mm).
  5. `'PLT-007 a pick-place with a vacuum gripper picks a box from x 0 and places it at x 1 on a belt'`: facts `picked 1`, `placed 1`, `drops 0`, `axis:Pick1:x` ≈ 1.
  6. `'PLT-007 the gantry carries a box along X, Z and Y and lowers it onto a pallet'`; `'PLT-007 a clamp variant picks a box from a belt stopped by a blade'`.
  7. `'PRT-008 stuckX stops the X axis, stuckY the Y axis, grippedStuckOn reads TRUE with nothing held, grippedStuckOff reads FALSE while holding; an unknown action throws a located message'`.
  8. `'PRT-003 the manipulator config honours its limits'` (`strokeXM 5 is above the limit 3 m` located at `parts[0].config.strokeXM`; `maxLoadKg` below 1).
  9. `'PRT-002 each part has English and Spanish names, documentation and equations'`; `'PRT-010 adding the parts changes no scene schema version'`; `'PRT-007 the snap points span the footprint'`.
  10. `'PLT-006 the manipulator source uses no Math function beyond abs, min, max, round and floor, and no clock or random'` (rotations come from `rotateY` and `yawQuat`, imported).
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/manipulators.test.ts` (FAIL), implement, run with `bunx tsc -b` and `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/manipulators.ts packages/zplc-ide/src/plant/core/parts/manipulators.test.ts
git commit -m "feat(plant): two-axis pick and place and three-axis gantry with vacuum and clamp grippers, digital and numeric"
```
**Risk:** item 6 (a manipulator that is plausible but wrong is caught only by the tests above), item 4 (step order inside the core, guarded by K8 and S3). PHYS-adjacent.

---

### Task K7: Layer palletizer station
**Spec:** PRT-001 (Stations row: "layer palletizer"), PRT-002, PRT-003, PRT-004, PRT-007, PRT-008, PLT-010. **Lane P. Wave 3. PHYS-adjacent.** May exceed 400 changed lines (a composite station): say why in the commit body.

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/layerPalletizer.ts
IDE/src/plant/core/parts/layerPalletizer.test.ts
```
**Interfaces:** the signal table row of `layer-palletizer`; `stepAxis` (K2), `createGripper` with `maxItems = columns * rows` (K3), the kinematic-plate technique of `flow.ts:16-66` for the squaring pusher (travel 0.4 s, extended and retracted limits), `world.bodiesInBox` (K1) for `layerReady`. Produces `export const stationParts: readonly RuntimePartDefinition[]` (`layer-palletizer`, family `stations`). Design: a forming zone of `columns * 0.4` by `rows * 0.3` metres (the executor fixes its offsets from the part position and records them in the part doc); boxes arrive from a belt of the scene against two fixed plates; `square` extends a kinematic pusher plate that squares them into a block (it is a stop-blade like plate across the zone); `layerReady` is TRUE when exactly `columns * rows` boxes lie at rest (speed at most 0.05 m/s) inside the zone; the transfer axis X runs from over the zone to over the pallet, the lift axis Y raises and lowers the clamp head (a wide pad as large as the zone, a capture volume covering the zone); the same digital and numeric variants as `pick-place` (no Z axis). `maxLoadKg` is the layer total (the clamp captures up to `columns * rows` boxes only when their total mass is within it). The pallet is a scene `pallet` item placed at the transfer's far end; the scene (F13) decides its position. Faults as in the table (`squareStuck`, `layerReadyStuckOff` added).

- [ ] **Step 1: Failing tests:**
  1. `'PRT-004 the digital and numeric variants of the palletizer have the signals of the table'` (names, types, ranges).
  2. `'PLT-007 four boxes squared into a layer are lifted together and set on a pallet as one layer'`: `columns` 2, `rows` 2: `picked 4`, `placed 4`, pallet `stacked` ≥ 4 through K5's facts (use `createSupportTracker` over the poses in the test: K8 wires it into the core later).
  3. `'PLT-007 a second layer is placed on top of the first when the lift target is one box height higher'` (`layers` 2 through the same tracker).
  4. `'PRT-003 layerReady is TRUE only with a full layer at rest in the zone, FALSE with three of four boxes'`; `'PRT-003 a layer above maxLoadKg is not captured'`.
  5. `'PRT-008 squareStuck leaves the pusher where it is, layerReadyStuckOff hides a full layer, stuckX and stuckY stop their axes'`; `'PRT-008 an unknown action throws a located message'`.
  6. `'PRT-003 columns 4 is above the limit 3 and rows 0 below 1, located'`; `'PRT-002 English and Spanish names, documentation and equations'`; `'PRT-010 the station changes no scene schema version'`; `'PRT-007 snap points: the infeed side accepts belts'`.
  7. `'PLT-006 the palletizer source uses no Math function beyond abs, min, max, round and floor, and no clock or random'`.
- [ ] **Step 2 to 4:** `bun test src/plant/core/parts/layerPalletizer.test.ts` (FAIL), implement, run with `bunx tsc -b` and `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/layerPalletizer.ts packages/zplc-ide/src/plant/core/parts/layerPalletizer.test.ts
git commit -m "feat(plant): layer palletizer station with squaring pusher, layer sensor and clamp head"
```
**Risk:** item 6 (a composite whose physics is plausible but may be tuned wrong; the tests above and scene 13 are the guard). PHYS-adjacent.

---

### Task K8: Core integration: register parts, support facts, grammar, tag, pinned hashes
**Spec:** PLT-006, PLT-010, PLT-011, PLT-012, PLT-016, PRT-001. **Lane C. Wave 4. PHYS-adjacent.** Independent verifier required (Review Focus 3, 9, 11).

**Allowed edit surfaces**
```
IDE/src/plant/core/plantCore.ts
IDE/src/plant/core/facts.ts
IDE/src/plant/core/plantCore.grip.test.ts
IDE/src/plant/core/hashes.json
IDE/src/plant/ci/sceneCheck.ts
IDE/src/plant/ci/sceneCheck.test.ts
```
**Interfaces:** `SHIPPED` and `RUNTIMES` (`plantCore.ts:28-40`: append `...manipulatorParts`, `...stationParts`, so the order of the earlier parts and their hashes never change), `postStep` (`plantCore.ts:144-157`) and `facts()` (`plantCore.ts:233-247`): feed `createSupportTracker().update` from `trackedItems` joined with `world.bodies()` (the join `facts()` already does for `position:` facts), once per plant step in `postStep`, and merge `tracker.facts()` into `buildFacts` input (`facts.ts:62-91`; `FactInputs` gains `support: Record<string, number>`; the new facts come after the existing ones so key order of existing facts is unchanged). `snapshot()` (`plantCore.ts:274-284`): `poses` gain `tag` from `ItemInfo.tag` (K4) for items. `FACT_GRAMMAR` and `factFault` (`sceneCheck.ts:30-45`): add `picked:<Name>`, `placed:<Name>`, `drops:<Name>`, `axis:<Name>:<x|y|z>`, `itemsAssembled` (to `FIXED_FACTS`), `stacked:pallet:<index>`, `layers:pallet:<index>`; the part-name check applies to the first three and to `axis`; the message grammar string is extended. The journal replay (`plantCore.ts:47-54`, `:294-312`) needs no change (the gripper is a part runtime driven by commands). Pin two hashes in `hashes.json`: `m3-gripCycle-v1` (a pick and place cycle of a box by a digital `pick-place` with a vacuum pad on Linux) and `m3-gantryNumeric-v1` (a numeric gantry placing two boxes on a pallet), each from a fixed script written in the test; update the `notes` string.
- [ ] **Step 1: Failing tests** (`plantCore.grip.test.ts`, real `createPlantCore`, scenes built in the test with `parseScene`):
  1. `'PRT-001 the catalogue contains pick-place, gantry, layer-palletizer, lid and base after the core is created'`.
  2. `'PLT-010 picked, placed, drops and axis facts are published and rounded'`; `'PLT-010 itemsAssembled counts a lid placed on a base by the pick and place'`; `'PLT-010 stacked and layers facts read the boxes on a pallet'`.
  3. `'PLT-012 a capture taken mid-carry restores to the same exact state and the same final hash as the run without capture'` (the replay, `plantCore.ts:305-311`).
  4. `'PLT-012 reset returns a manipulator scene to its initial state, the pad home and nothing held'`.
  5. `'PLT-006 the two M3 core scripts give the pinned hashes on Linux'`: `m3-gripCycle-v1`, `m3-gantryNumeric-v1` (the first run writes them; the test compares to `hashes.json` and skips off Linux, as the M1 and M2 pins do).
  6. `'PLT-006 the hash does not depend on host pacing'` (a seeded 0 to 5 ms pause after every advance gives the same hash).
  7. `'PLT-016 apply refuses a REAL setpoint of the wrong type with the located message and leaves the hash unchanged'` (inherited rule R-X2).
  8. In `sceneCheck.test.ts`: `'SCN-004 the fact grammar accepts the M3 facts and names the unknown ones'` (`fact:placed:Gantry1`, `fact:axis:Gantry1:x`, `fact:stacked:pallet:0`; `fact:placed` alone is refused; a part name not in the scene is located).
  9. Previous behaviour: `'PLT-006 the seven shipped scenes keep their pinned hashes'` (the S2 scene check over `SCENE_INDEX`, `m1-palletStack-v1` and `m2-tankLoop-v1` in `hashes.json` unchanged); `'PLT-010 a scene with no manipulator publishes the same facts as before'` (key list of the M2 fixture equals).
- [ ] **Step 2 to 4:** `bun test src/plant/core src/plant/ci`, with `ZPLC_NATIVE_SIM_BIN` exported for the native tests; `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core packages/zplc-ide/src/plant/ci
git commit -m "feat(plant): register manipulators and the palletizer, publish grip and stacking facts, pin the M3 trace hashes"
```
**Risk:** item 4 (step ordering inside the core and the support tracker's place in it), item 3 (`plantCore.ts` is consumed by every scene), item 1 (the new facts are a persisted vocabulary of scenario files). Independent verifier: the seven pinned hashes are the guard. PHYS-adjacent.

---

### Task D4: Documentation in English and Spanish
**Spec:** CRS-011 (M3 parts and scenes), CRS-013, PRT-002. **Lane D. Wave 4. KEEP.**

**Allowed edit surfaces**
```
tools/docs/plant-parts-reference.ts
tools/docs/plant-parts-reference.test.ts
docs/docs/plant/parts.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/parts.md
docs/docs/plant/manipulators.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/manipulators.md
docs/docs/plant/scenes.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/scenes.md
docs/sidebars.js
```
(`parts.md` in both languages is **generated**: edit the generator (add the K6 and K7 arrays to `PARTS`, `plant-parts-reference.ts:22-32`), then run it. The generator already renders ranges, variants and equations, `plant-parts-reference.ts:88-142`.)

**Content.** `manipulators.md` (new page): the axes and their letters (Y is up); the digital and numeric variants with a worked example for a two-axis move; how a grip works (capture volume, speed rule, load limit, release, what `placed` and `drops` mean, rules R-G1 to R-G4 in words), the facts table, the fault actions and what each teaches; that the pad is the only body of a manipulator and the frame does not collide (a known limit); the 64-byte exchange span for a gantry map (point to `numeric-signals.md`). `scenes.md` gains rows for scenes 5, 6, 13, 14 and 15 with goal and parts, and says expectations are about plant facts. **Only measured claims**: no latency, frame rate, hardware or cross-platform claim; say "pinned on Linux; macOS and Windows not yet measured" where determinism is mentioned. Spanish: neutral usted, `falla`, `ciclo`, `tarima`, "ZPLC".
- [ ] **Step 1: Failing tests:** `'PRT-002 the reference lists the manipulator and station parts with their variants, ranges and equations'`; `'PRT-002 --check fails when a part definition changes and the page does not'`; `'PRT-002 English and Spanish pages have the same table structure'`; the docs parity and Spanish register tests of `tools/docs`.
- [ ] **Step 2 to 4:** `bun test tools/docs` at the root (FAIL, implement, `bun tools/docs/plant-parts-reference.ts --write`, `--check` exits 0), and the docs build if present (`bun run --cwd=docs build`, **Unconfirmed**).
- [ ] **Step 5: Commit.**
```bash
git add tools/docs docs/docs/plant docs/i18n/es docs/sidebars.js
git commit -m "docs(plant): manipulators, gripping and the palletizer, with the parts reference generated, in English and Spanish"
```
**Risk:** item 6 (claims beyond evidence; guarded by the rule above), item 5 (a docs CI check).

---

### Task S3: Live equals graded for a gripping scene; capture and restore mid-carry
**Spec:** PLT-005, PLT-012, PLT-017, LNK-003, LNK-006, SCN-004. **Lane S. Wave 5. PHYS-adjacent.** (Plan M2 Task N9 is the model; read `IDE/src/plant/ci/liveVersusGradedNumeric.test.ts` and `fixtureNumeric/` first.)

**Allowed edit surfaces**
```
IDE/src/plant/ci/liveVersusGradedGrip.test.ts
IDE/src/plant/ci/fixtureGrip/scene.json
IDE/src/plant/ci/fixtureGrip/plant-map.json
IDE/src/plant/ci/fixtureGrip/reference.st
IDE/src/plant/ci/fixtureGrip/scenario.json
```
The fixture is a numeric `pick-place` with a vacuum pad: a program reads a start button, moves X to a setpoint, lowers Y, grips, lifts, moves X to a second setpoint, lowers, releases; a box is emitted on the script. Both paths: the native scenario session (graded) and the live lock-step `createPlantSession` on the native runtime, as in the M2 fixture.
- [ ] **Step 1: Failing tests:** `'PLT-017 a gripping scene gives the same trace hash live and graded'` (including scan 0); `'PLT-005 pause freezes the carriage and the held box, and a single step advances both by one scan'`; `'PLT-012 capturing the plant mid-carry and restoring it gives the same remaining trace as the uninterrupted run'`; `'LNK-006 a forced numeric setpoint keeps its forced value over the plant's write while the pad is carrying'` (REAL, 4 bytes, held whole: N9 of M2 proved the mechanism on Linux); `'LNK-003 the numeric scan writes the input span once'` (count `memory.write` calls through a wrapping adapter); `'SCN-013 the declaration generator names the gantry signals with their types'` (uses the M2 generator on the fixture map).
- [ ] **Step 2 to 4:** run with the worktree's binary exported in the same command: `ZPLC_NATIVE_SIM_BIN=$PWD/../../firmware/lib/zplc_core/build/zplc_runtime bun test src/plant/ci/liveVersusGradedGrip.test.ts` (from `IDE/`; **Unconfirmed** path, confirm with `ls`). Expected: FAIL before K8 is merged, pass after.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/ci
git commit -m "test(plant): a gripping scene gives the same trace live and graded; capture mid-carry restores"
```
**Risk:** item 4 (the session's read-modify-write of the input span against the runtime's staged writes), item 1 (the fixture is a persisted example). PHYS-adjacent.

---

### Task F14: Reference scene 14, Belt-to-belt transfer (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-004 (digital variant), PRT-001 (clamp). **Lane F. Wave 5. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/belt-to-belt-transfer/scene.json
IDE/plant-scenes/belt-to-belt-transfer/plant-map.json
IDE/plant-scenes/belt-to-belt-transfer/reference.st
IDE/plant-scenes/belt-to-belt-transfer/starter.st
IDE/plant-scenes/belt-to-belt-transfer/scenario.json
```
(The parent regenerates `IDE/src/generated/sceneIndex.ts` with `bun run generate:scene-index` and pins `IDE/src/plant/ci/sceneHashes.json` after the wave-5 scenes merge; restore both with `git checkout --` before committing.)

**Content.** Goal of spec SCN row 14, "Pick parts from one belt and place them on another". Layout original (P17, SCN-003). Parts: an infeed belt with an emitter of boxes (`maxItems` 4), a `stop-blade` and a `sensor-diffuse` at the pick spot, a digital `pick-place` with the **clamp** gripper (`strokeXM` about 1.2, `strokeYM` about 0.5) between the pick spot (X home) and a second belt (X end) that carries the placed box to a `remover`, a `push-button` Start, a `stack-light`, one camera preset. The reference program: on Start, run the infeed, retract and extend the blade by the sensor, then a state machine: move X to the pick limit, lower Y to its limit, grip, wait for `gripped`, raise Y, move X to the place limit, lower, release, raise, return; repeat per box, run the second belt, lights green when four have been delivered. A scene whose belts feed each other keeps boxes apart by the blade (do not rely on luck). The starter has declarations only and a goal comment. Map: all BOOL (digital variant): the commands `xPlus`, `xMinus`, `yPlus`, `yMinus`, `grip`, the belts, the blade, the emitter; the sensors `xAtMin`, `xAtMax`, `yAtMin`, `yAtMax`, `gripped`, the diffuse sensor, the button. `scenario.json` (`tickMs` 10, `durationMs` at most 100000; aim for 80000): Start at 200 ms (release at 400 ms) and one `fault` of `Pick1` `dropLoad` only if the executor wants a diagnosis case (not required). Boolean-only expectations (the form that passes with or without N10): `EVENTUALLY fact:placed:Pick1` and `fact:delivered:Remover1`, `ALWAYS fact:itemsDropped false` and `fact:drops:Pick1 false`, `AT` the end the green lamp TRUE and every motion command FALSE. **With N10 merged** (question 1), the executor adds a second commit tightening them: `fact:placed:Pick1` exactly 4, `fact:delivered:Remover1` exactly 4. `shortestPulseMs`: the shortest sensor pulse at catalogue speeds is a limit switch passed at axis speed, or the diffuse sensor at belt speed; measure it on the trace and record the reasoning in the commit body (SCN-007).
- [ ] **Step 1: Failing tests.** The S2 test `'SCN-004 every shipped scene passes with its reference program and fails with its starter'` iterates `SCENE_INDEX`; run `bun run generate:scene-index` after creating the five files with an empty program and confirm it FAILS. Run `bun test src/plant/ci` with the binary exported.
- [ ] **Step 2: Write** the files until the reference passes and the starter fails; **run the grade three times and once with each axis speed at 0.9 and 1.1 of the tuned value** (the M2 verifier's check, L76) and tune with margin. `bun run lint`, `bun test src/plant src/learn` (2.0 unchanged).
- [ ] **Step 3: Commit** (tuned values in the reference program and the commit body, never in new scene keys).
```bash
git add packages/zplc-ide/plant-scenes/belt-to-belt-transfer
git commit -m "feat(plant-scenes): scene 14, belt-to-belt transfer, with reference program and scenario"
```
**Risk:** item 6 (scene quality beyond the scenario), item 1 (a persisted, versioned scene file). PHYS-adjacent (hash).

---

### Task F5: Reference scene 5, Two-axis assembly (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-004 (digital variant), PRT-001 (lid, base). **Lane F. Wave 5. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/two-axis-assembly/scene.json
IDE/plant-scenes/two-axis-assembly/plant-map.json
IDE/plant-scenes/two-axis-assembly/reference.st
IDE/plant-scenes/two-axis-assembly/starter.st
IDE/plant-scenes/two-axis-assembly/scenario.json
```
**Content.** Goal of spec SCN row 5, "Assemble lids and bases with a two-axis pick and place". Layout original. Parts: a base belt carrying bases (an emitter of `base`, `maxItems` 3) to a work position held by a `stop-blade` and detected by a `sensor-diffuse`; a lid feeder (an emitter of `lid`, `maxItems` 3) onto a short belt that ends at a second stop blade and sensor at the pick spot; a digital `pick-place` with the **vacuum** gripper whose X stroke spans the lid pick spot and the base work position; an exit belt to a `remover`; a `push-button` Start; a `stack-light`. Program: per cycle wait for a lid and a base in place, lower, grip, raise, move to the base, lower, release, raise, return, then release the assembled base to the exit; three cycles. Digital map as scene 14. Boolean-only expectations: `EVENTUALLY fact:itemsAssembled`, `EVENTUALLY fact:delivered:Remover1`, `ALWAYS fact:itemsDropped false` and `fact:drops:Pick1 false`, green at the end. With N10: `itemsAssembled` exactly 3 and `delivered:Remover1` exactly 3 (the remover counts the lid and the base as two removals unless the lid is carried on its base, so the executor reads the trace before fixing the number; **Unconfirmed**). Same tuning and `shortestPulseMs` rules as F14.
- [ ] **Step 1 to 3** as F14 (S2's scene check, binary exported, `bun run lint`, `bun test src/plant src/learn`; the **empty program fails**: no lid is assembled).
```bash
git add packages/zplc-ide/plant-scenes/two-axis-assembly
git commit -m "feat(plant-scenes): scene 5, two-axis assembly of lids and bases, with reference program and scenario"
```
**Risk:** item 6, item 1. PHYS-adjacent (hash).

---

### Task F13: Reference scene 13, Layer palletizer (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-004 (digital variant), PRT-001 (layer palletizer). **Lane F. Wave 5. PHYS-adjacent (hash).** The spec's scene table lists scene 13 under "Stations" and section 6.2 lists it under M3: this plan follows 6.2 (Findings 1; open question 6).

**Allowed edit surfaces**
```
IDE/plant-scenes/layer-palletizer/scene.json
IDE/plant-scenes/layer-palletizer/plant-map.json
IDE/plant-scenes/layer-palletizer/reference.st
IDE/plant-scenes/layer-palletizer/starter.st
IDE/plant-scenes/layer-palletizer/scenario.json
```
**Content.** Goal of spec SCN row 13, "Palletize boxes in several layers". Parts: an infeed belt with an emitter of boxes (`maxItems` 12) and a `sensor-diffuse` counting boxes into the forming zone; a digital `layer-palletizer` (`columns` 2, `rows` 2); a `pallet` item at the far end of the transfer; a `push-button` Start; a `stack-light`. Program: on Start run the infeed until four boxes are in the zone (count the sensor's pulses; the zone's `layerReady` confirms), `square`, wait for `squared` and `layerReady`, retract, lower the clamp, grip, raise, transfer to the pallet, lower to the layer height (**digital**: lower until `yAtMin` for layer 1; for the next layer the Y axis is jogged for a timed interval of one box height: the lesson is the sequence and the counter), release, raise, return; three layers (12 boxes) is the target but **eight (two layers) if three do not fit 100 s**; report the choice. Boolean-only expectations: `EVENTUALLY fact:stacked:pallet:0` and `fact:layers:pallet:0`, `ALWAYS fact:itemsDropped false` and `fact:drops:Palletizer1 false`, green at the end. With N10: `stacked:pallet:0` exactly the number of boxes placed and `layers:pallet:0` exactly the layer count. `shortestPulseMs` as F14.
- [ ] **Step 1 to 3** as F14. **Risk:** item 6 (a stack placed by timed jogs is sensitive to speed tuning: grade at 0.9 and 1.1 of the speeds, three runs), item 1. PHYS-adjacent (hash).
```bash
git add packages/zplc-ide/plant-scenes/layer-palletizer
git commit -m "feat(plant-scenes): scene 13, layer palletizer, with reference program and scenario"
```

---

### Task F15: Reference scene 15, Three-axis palletizing (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-004 (numeric variant), PLT-003. **Lane F. Wave 5. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/three-axis-palletizing/scene.json
IDE/plant-scenes/three-axis-palletizing/plant-map.json
IDE/plant-scenes/three-axis-palletizing/reference.st
IDE/plant-scenes/three-axis-palletizing/starter.st
IDE/plant-scenes/three-axis-palletizing/scenario.json
```
**Content.** Goal of spec SCN row 15, "Place boxes on pallets with a three-axis gantry". Parts: an infeed belt with an emitter of boxes (`maxItems` 8), a `stop-blade` and a `sensor-diffuse` at the pick spot; a **numeric** `gantry` (vacuum, `strokeXM` about 1.6, `strokeZM` about 1.2, `strokeYM` about 0.7); a `pallet` on the floor; a `push-button` Start; a `stack-light`. Map: the six REAL signals with ranges equal to the strokes, in `m`; raw ranges as the plan of M2 chose for scene 12 (an INT raw 0 to 1000 over the stroke is enough; the lesson may use another), grip and gripped BOOL. The reference program computes the pallet pattern with an array of X and Z offsets (a 2 by 2 pattern, two layers of four boxes = eight) and drives `xSet`, `zSet`, `ySet` in order (lift, travel, lower), waits for `xPos` within 2 mm of the setpoint, grips, and so on. Boolean-only expectations: as F13 on the gantry's facts. With N10: `stacked:pallet:0` exactly 8, `layers:pallet:0` exactly 2. `durationMs` at most 100000: eight cycles of about 11 s each is tight; tune speeds within their config ranges, or palletize **six** boxes and report. **The exchange span:** six REAL signals are 24 bytes; place the program's variables adjacent so the input and output spans stay within 64 bytes (the M2 message tells the author). `shortestPulseMs` as F14.
- [ ] **Step 1 to 3** as F14. **Risk:** item 6 (control quality beyond the asserted pattern), item 1. PHYS-adjacent (hash).
```bash
git add packages/zplc-ide/plant-scenes/three-axis-palletizing
git commit -m "feat(plant-scenes): scene 15, three-axis palletizing with numeric positions, reference program and scenario"
```

---

### Task F6: Reference scene 6, Two-axis assembly, numeric (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-004 (numeric variant), PLT-003. **Lane F. Wave 6. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/two-axis-assembly-numeric/scene.json
IDE/plant-scenes/two-axis-assembly-numeric/plant-map.json
IDE/plant-scenes/two-axis-assembly-numeric/reference.st
IDE/plant-scenes/two-axis-assembly-numeric/starter.st
IDE/plant-scenes/two-axis-assembly-numeric/scenario.json
```
**Content.** The same goal as scene 5 with numeric positions ("The same with numeric positions", spec SCN row 6). Copy F5's `scene.json` after it is merged and change the `pick-place` `variant` to `numeric` (Plan choice: the same layout makes the pair a clean comparison for the lesson; **the scene is still its own directory and its own file**, SCN-002). Map: `xSet`, `ySet` REAL commands and `xPos`, `yPos` REAL sensors in metres over the strokes; INT raw as F15. The program moves to named positions held in constants (lid pick, base place, safe height) with a position tolerance (`ABS(xPos - xSet) < 0.002`), the lesson skill of 15.3. Expectations as F5; with N10 the same exact counts. S3 must be merged first: it proves live equals graded for a numeric pick and place.
- [ ] **Step 1 to 3** as F14. **Risk:** item 6 (a tolerance that passes on Linux by a hair may fail elsewhere: tune with margin), item 1. PHYS-adjacent (hash).
```bash
git add packages/zplc-ide/plant-scenes/two-axis-assembly-numeric
git commit -m "feat(plant-scenes): scene 6, two-axis assembly with numeric positions, reference program and scenario"
```

---

### Task L4: Lessons 15.1 to 15.5 (content; CONDITIONAL on the outline approval)
**Spec:** CRS-003 to CRS-006, CRS-008 (SFC in 15.2), CRS-011. **Lane L. Wave 6. Starts only when the owner approves `course-outline.md` (CRS-001) and M1 task L1 (a manifest may name a scene) is merged; without both, stop and report.**

**Allowed edit surfaces**
```
IDE/lessons/plant-belt-transfer/*
IDE/lessons/plant-assembler/*
IDE/lessons/plant-assembler-numeric/*
IDE/lessons/plant-layer-palletizer/*
IDE/lessons/plant-xyz-palletizing/*
```
(Ids and languages from `course-outline.md` rows 15.1 to 15.5: `plant-belt-transfer` ST or LD on scene 14, `plant-assembler` SFC on scene 5, `plant-assembler-numeric` ST on scene 6, `plant-layer-palletizer` ST on scene 13, `plant-xyz-palletizing` ST on scene 15. The outline's open items A1 to A10 may rename them.) Each lesson is a package in the 2.0 layout (`lesson.json` manifest with `scene`, `starter`, `solution`, `scenario` with the pinned `scenario.sha256`, hints, English and Spanish text with the same structure), built from the F-task scene and reference. The hardware track is **not** opened (M6). Tests: the existing `lessonCi.test.ts` and curriculum and parity tests grade every solution and starter (CRS-005) and check the languages; `bun test src/learn`.
- [ ] One commit per lesson: `feat(lessons): plant-belt-transfer`, `feat(lessons): plant-assembler`, `feat(lessons): plant-assembler-numeric`, `feat(lessons): plant-layer-palletizer`, `feat(lessons): plant-xyz-palletizing`. **Risk:** item 6 (pedagogy), item 1 (hash-pinned content). Independent verifier for the package format use (L1's guard).

---

### Task Q4: Journeys: a fault by keyboard on a manipulator scene; ten-minute rest soak
**Spec:** VIS-010, VIS-011, PLT-008, SCN-004 (end to end). **Lane Q. Wave 6. KEEP (journey), PHYS-adjacent (soak).**

**Allowed edit surfaces**
```
IDE/scripts/journeys/plantManipulator.ts
IDE/scripts/journeys.ts
IDE/src/plant/core/parts/gripSoak.test.ts
```
(`journeys.ts` gets only the registration of the new export, as Q2 and Q3 did; read `IDE/scripts/journeys.ts` and `IDE/scripts/journeys/plantJourneys.ts` first. The helpers `openPlantDocument`, `runInSimulation`, `plantFacts`, `shippedSceneProject` live in `IDE/scripts/journeys/plantSupport.ts:31-168`.) Journeys:
1. Open the project of scene 14, run it in simulation, read `placed:` from the facts text until it is at least 1, then trigger `dropLoad` on the pick and place **by keyboard** (Tab to the fault select, choose with the arrow keys; press **Ctrl+M** first when the walk leaves the code editor) and see the fact `drops:` change in the live text. Tab reaches every operate control in a stable order.
2. Open scene 15 and confirm the manipulator readout appears with the position text and is not announced every scan (the live region stays quiet for a whole move).
The soak (`gripSoak.test.ts`, headless, PLT-008): a core with a pallet and a gantry places four boxes; then 10 simulated minutes at rest give no drift above 0.001 m, no rotation above 0.1 degrees and no change in `stacked:pallet:0` (the run is quick: bodies sleep).
A journey that needs a GPU is out of scope: the journeys give no timing evidence. Expected: the 2.0 journeys and the M1 and M2 plant journeys unchanged.
- [ ] **Step 1: Failing journey and soak; Step 2: implement; Step 3: run** `ZPLC_NATIVE_SIM_BIN=<worktree runtime binary> bun run smoke:journeys` in `IDE/` (with `node install.js` and `electron:compile` done, Global Constraints) and `bun test src/plant/core/parts/gripSoak.test.ts`. **Step 4: commit:** `test(plant): manipulator fault by keyboard journey and a ten-minute rest soak`. **Risk:** item 5 (a journey that drives the application; the stale-binary failure of L16 is the known trap), item 6. 

---

### Task C2: Requirement coverage and indexes for the M3 requirements
**Spec:** section 7 item 1. **Lane Q. Wave 7. KEEP. Run by the parent or a CI-hygiene writer after the other tasks merge.**

**Allowed edit surfaces**
```
tools/ci/requirement-evidence.json
tools/ci/requirements-index.json
tools/ci/requirement-coverage.test.ts
IDE/src/generated/sceneIndex.ts
IDE/src/plant/ci/sceneHashes.json
```
(The evidence mechanism is **Unconfirmed** beyond what the M2 hygiene commits `e1007fcd` and `62ac99c1` show: read `tools/ci/requirement-coverage.ts` and the `generate:*` scripts in `IDE/package.json` first. Per L14 the coverage fixtures for specs 012 and 013 must be fixture-based, never pinned to today's uncovered IDs.) The parent also pins the Linux hashes of the five M3 scenes in `sceneHashes.json` and regenerates the scene index here, if not done at the wave-5 and wave-6 merges.
- [ ] Steps: `bun tools/ci/requirement-coverage.ts --check` (expected exit 0 with M3's IDs reported `covered`, conditional ones with their decision, `pending (later milestone)` for the rest; SCN-003 stays as M2 left it, L81), `bun test ./tools/ci`, `CLANG_FORMAT=... bun tools/ci/format.ts --check`. Commit: `test(ci): requirement coverage records for the M3 requirements`. **Risk:** item 5 (CI tooling).

---

## Open questions for the owner
Only real product decisions. Each has a recommended default; the plan proceeds on the default unless told otherwise, except question 1, which gates one task, and question 2, which selects K3's route.

1. **Numeric comparison in scenario expectations (SCN-005, CRS-005), again, now more pressing.** Every expectation value is boolean today, so a count of boxes on a pallet cannot be asserted by value (run logbook L20; plan M2 question 1, never answered; its Task N10 was never merged). M3's scenes 13 and 15 grade stacks. *Recommended default: yes, for `fact:` names only, an exact number or `{ "min", "max" }` inclusive; existing scenarios byte-identical (Task N10, wave 1); then scenes 13 and 15 (and M2's scene 12) are tightened in follow-up commits.* If the owner declines, M3 ships complete with boolean-only expectations that prove a stack exists and nothing dropped, but cannot prove "exactly eight".
2. **How a gripper holds an item (PLT-007: "gripped ... by the physics, not by a script").** (A) A Jolt `FixedConstraint` between the kinematic pad and the dynamic item, created on capture and destroyed on release (the item keeps its mass and inertia and is blocked by obstacles). (B) Kinematic carry: the item is switched to a kinematic body and posed relative to the pad each step; simpler and cheaper, but the carried item no longer reacts to the world. *Recommended default: A, with B as the documented fallback if the probe of Task K1 Step 1 shows the constraint is not usable or not repeatable on Linux.* The behaviour (rules R-G1 to R-G4) is the same either way; only K1 and K3 differ.
3. **Grippers as variants of the manipulators, or as separate placeable parts.** The spec's row lists "Two-axis pick and place, three-axis gantry, vacuum gripper, clamp". A separate gripper would need a part-to-part reference that the scene format of M1 does not have (the same reason as plan M2 question 4). *Recommended default: `gripper` is a setting (vacuum or clamp) of the manipulator parts; a part-to-part reference and a separate gripper wait for a scene-format version change (not before M5).*
4. **Axis names.** Industrial gantries usually put Z vertical; this plan uses the world's axes (X along the part, Y up, Z across) so that the 3D view, the facts and the part's pose agree, and says so in the docs. *Recommended default: X, Y (up), Z as written; the docs state it in the first paragraph.*
5. **Lid and base items belong to M3.** The Items row of the minimum catalogue lists "lid, base", but M1 shipped only box and pallet, and scene 5 and 6 need the other two. *Recommended default: M3 adds `lid` and `base` only; the stackable crate and the coloured and metal parts stay with M4 and M5.*
6. **Scene 13 in M3.** Spec 6.2 lists scene 13 under M3, but the scene table gives its family as "Stations" and the catalogue puts the layer palletizer among "Stations" (Findings 1). *Recommended default: follow 6.2; M3 delivers the `layer-palletizer` part and scene 13 (Tasks K7, F13), and the Stations milestone M5 delivers the rest of the family. If the owner prefers the table, K7 and F13 move to M5 and M3 ships four scenes.*
7. **Course outline approval (CRS-001), again.** Lessons 15.1 to 15.5 wait for it (Task L4). *Default: approve before wave 6, or accept that M3 ships its five scenes without lessons and the lessons land with M7. Spec 6.2 says milestones ship scenes with their lessons.*
8. **Manual jog of an axis by a person (VIS-010).** The spec's panel parts are push button, selector, emergency stop and potentiometer; it does not ask for jogging a manipulator. A jog would be a new operable control and a manual mode the program must respect. *Recommended default: no jog in M3; a person triggers the faults and uses the force and set-value tools of the application, as in 2.0.*

## Findings in the spec and in M2 as merged (contradictions and things that could not be verified)
1. **Scene 13 in two places.** The scene table gives scene 13's main family as "Stations" and the catalogue lists the "layer palletizer" under "Stations"; section 6.2 puts scene 13 under M3 ("Manipulators and gripping") and the M5 row ("Stations") lists scenes 7, 10, 11, 16 without 13. The two only agree if the layer palletizer is delivered early; this plan follows 6.2 (question 6). The course outline puts 13 in module 15 with the manipulators (`course-outline.md` row 15.4), which also agrees with 6.2.
2. **PRT-004 for manipulators and PRT-001's row.** The spec asks for "a digital variant (commands and limit sensors) and a numeric variant (setpoint and feedback)" where a scene needs both, and the Manipulators row lists "grip" as a signal without a name. This plan names `grip` and `gripped` (Plan choice) and delivers the gripper as a variant of each manipulator (question 3).
3. **Lid and base items missing from M1.** PRT-001 requires every part of the minimum catalogue; the Items row lists lid and base; M1 delivered box and pallet only (`items.ts:116-145`). M3 closes lid and base (question 5).
4. **Expectation values are boolean only** (`IDE/src/test-engine/index.ts:206` `signalSet`, `:45-49` `ResolvedSignal.value`). Question 1.
5. **The fact grammar is a closed list** (`IDE/src/plant/ci/sceneCheck.ts:29-45`): every new fact must be added there, or a scenario that names it is rejected as "not a plant fact"; K8 owns it. Also `position:<kind>:<index>` knows only `box` and `pallet` (`facts.ts:83-88`), so lids and bases count as boxes in those indexes (they are `ItemInfo.kind` `'item'`).
6. **`geometry.ts` cases that never match.** `partShape` switches on `'blade'` and `'curve'` (`geometry.ts:55-58`) but the views are `'stop-blade'` (`flow.ts:58`) and the conveyor layout id `'curved'` (`conveyors.ts:8`, view kind `layoutId`); both fall to the default box. `renderer.ts:247` also tests `part !== 'blade'`. Confirmed by reading (plan M2 marked it Unconfirmed). V5 uses explicit new view kinds and does not copy the pattern; it reports the mismatch.
7. **`OperatePanel` `Readout` fallthrough.** `Readout` ends by drawing a stack light for any part that is not a numeric display or a tank (`NumericControls.tsx:114-124`), and `OperatePanel.tsx:58-60` lists the ids that reach it. A new part added to that list without a branch would be drawn as a lamp; U3 adds the branch.
8. **The "no `Math` beyond ..." determinism rule of plan M2 cannot hold literally for `plant/core/**`.** `rotateY` (`items.ts:32-35`), `conveyors.ts` (`Math.sin`, `Math.cos`, `Math.tan`, `Math.PI`, lines 42-52), `world.ts:134-135` and the trace's constants (`trace.ts:10-11`, `Math.cbrt`, `Math.sqrt`) already use them at build time. M3 states the rule as the per-step state update (Global Constraints). JavaScript does not guarantee identical trigonometric results across engines; the owner's macOS and Windows hash runs (`research.md` section 11) are what would show a difference, and they are still pending.
9. **Kinematic bodies are in the trace.** `world.bodies()` lists dynamic and kinematic bodies (`world.ts:213-229`) and `advance` records them (`plantCore.ts:169-174`), so the pad's pose is part of every manipulator scene's hash. A change to the pad's size, layer or pose rule re-pins those hashes.
10. **`rayHit` sees the moving layer only** (`world.ts:93-94`, `:208`). A pad in the moving layer would be detected by a sensor beam as an item; the pad is kinematic in the static layer (the blade's technique). `gapBelow` therefore needs its own all-layer filters.
11. **`PhysicsWorld.restore` is not used by the core.** `plantCore.restore` replays the journal on a fresh world and compares the exact Jolt state (`plantCore.ts:294-312`); `world.restore` (`world.ts:254-287`) is only exercised by tests. K1 adds the attachments to the capture head for those tests and for honesty, but PLT-012 for a manipulator scene is proven by the core-level replay (K8, S3).
12. **A scenario is limited to 10,000 samples** (`IDE/src/test-engine/index.ts:18`), 100 s at `tickMs` 10. A palletizing scene of twelve boxes may not fit: F13 and F15 say how many layers they fall back to (Tasks F13, F15).
13. **The editor and the schematic need no change but one thing.** The schematic footprint of a part is the box around its snap points (`schematic.ts:25-34`), so a gantry with no snap points would be drawn 0.4 m square; K6 and K7 return the corners of the footprint. The editor's part list is generic over the catalogue (`PartList.tsx:36`): **Unconfirmed** that nothing in `EditorPanel.tsx` or `PartForm.tsx` filters by family; U3 or K8 records the answer if a test shows otherwise.
14. **Unconfirmed baseline facts I could not read in the time given:** the behaviour (not the typings) of Jolt's `FixedConstraint` in the 1.1.1 WebAssembly build, whether `IgnoreSingleBodyFilter` is in the typings, and which call creates a constraint from settings (K1 Step 1); whether the harness exports of `transport.test.ts` (`plant`, `part`, `defs`) can be imported by new test files; how `PlantCanvas.tsx` labels secondary views on hover (V5); the catalogue-parity test file for the plant strings (U3); the scenario-format documentation page (N10); the docs build command (D4); the exact path of the runtime binary (Global Constraints); the requirement-evidence mechanism beyond the M2 commits (C2); whether the remover counts a lid on its base as one or two removals (F5).

## Done when (aligned with spec section 7, for M3)
- [ ] The owner has the answers or accepted defaults of the open questions; the gate verdict (macOS, Windows) is recorded or the PHYS-adjacent tasks (K1, K3, K4, K6, K7, K8, S3, F5, F6, F13, F14, F15, the Q4 soak) are listed as at risk.
- [ ] Task K0's contracts and K1's world additions are merged and no other task changed a contract (C1 to C9 are unchanged).
- [ ] A gripper holds, carries and releases a rigid body through the physics, deterministically: the same scene, program and script give the same trace hash on repeated runs and with host pacing varied; a capture mid-carry restores; a held item removed leaves no constraint (PLT-006, PLT-007, PLT-012; K1, K3, K8, S3).
- [ ] The catalogue has the two-axis pick and place, the three-axis gantry (digital and numeric variants, vacuum and clamp grippers), the layer palletizer and the lid and base items, each defined once with English and Spanish names, documentation, tested on the headless core including limits (speed, stroke, load) and fault actions (PRT-001 to PRT-004, PRT-007, PRT-008, PRT-010, PLT-011; K2, K3, K4, K6, K7, K8).
- [ ] The plant publishes `picked`, `placed`, `drops`, `axis`, `itemsAssembled`, `stacked` and `layers` facts that scenarios, the text equivalent and the trace read, and an axis position is never announced every scan (PLT-010, VIS-008; K3, K5, K8, U3).
- [ ] A manipulator is drawn in the 3D view with a grip cue other than colour and its position as text, and its faults can be triggered by pointer and by keyboard (VIS-003, VIS-010; V5, U3, Q4).
- [ ] Reference scenes 5, 6, 13, 14 and 15 pass their scenarios with the reference program and fail with the starter, in CI on Linux; their Linux hashes are pinned in `IDE/src/plant/ci/sceneHashes.json`; the scene index is regenerated; the seven scenes of M1 and M2 keep their hashes (SCN-001 to SCN-004, PLT-006, section 7 item 2). macOS and Windows runs are the owner's until the nightly job covers them.
- [ ] Documentation exists in English and Spanish for the manipulators, the gripping model, the palletizer and scenes 5, 6, 13, 14, 15, the parts reference is generated, and nothing claims a measured number that was not measured (CRS-011, CRS-013, section 7 item 8).
- [ ] If the owner approved the outline: lessons 15.1 to 15.5 are graded in CI in both languages (CRS-003 to CRS-005, CRS-008). If question 1 was approved: N10 merged and scenes 13, 15 (and M2's scene 12) tightened.
- [ ] All 2.0 suites pass unchanged: lessons, plants, smoke, journeys, the content security policy test (PLT-013, section 7 item 6). `bun run lint`, `bun test`, `bun test ./tools/ci`, `bun tools/ci/requirement-coverage.ts --check` and the pinned formatter `--check` pass.
- [ ] The independent verifiers of K1 with K3 (physics, Review Focus 1, 2, 4, 5), K8 (hashes, Review Focus 3, 9, 11), N10 (if it ran) and the feature-end verifier (K6, K7, S3 and the five scenes: three repeated grades and axis speeds at 0.9 and 1.1) returned with no open blocker; the requirement coverage reports M3's requirements `covered`, conditional ones with their decision, later milestones `pending` (section 7 item 1).
- [ ] The tree can ship as a 2.1 pre-release.
