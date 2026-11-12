# ZPLC 2.1 Plant Simulation: Milestone M1 Implementation Plan (PROVISIONAL)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Provisional.** This plan is built on decision D-14 (three.js for rendering, Jolt in WebAssembly for physics, inside Studio) as confirmed by the feasibility gate **on Linux x64 only** (`gate/check-1.json`, `check-2.json`, `check-4-graded.json`, `capacity-headless-linux-x64.json`; Ryzen 5 8600G). The macOS and Windows runs of checks 2, 3, 4 and 7 are still pending the owner, and the gate's own rule says D-14 is confirmed only when every check passes. **No task of this plan may start before the owner records the gate verdict**, except Tasks Q1 and R1 named in "Start rule". If macOS or Windows overturns D-14, the tasks marked **PHYS** in the lane table are physics-specific and would be redone; the tasks marked **KEEP** do not depend on the physics library and survive any outcome (they are written against `PlantCore`, `PlantSnapshot` and `PlantSceneFile` of section "Contracts", never against Jolt).

**Goal:** Deliver milestone M1 of spec 012: the plant core, one clock with the scan-exact exchange in the native runtime, the 3D view with its fallbacks, the editor's authoring path, the transport parts, and reference scenes 1, 2, 4, 8 and 9, in a state that could ship as a 2.1 pre-release (spec 6.2).

**Architecture:** A headless `PlantCore` (TypeScript, Jolt `wasm-compat`, fixed 5 ms plant step) is built from a validated scene file made of catalogue parts. A lock-step session exchanges signals with the runtime once per scan on the runtime's virtual clock, through a new session request that switches a live session to scan-stepping. The three.js view only draws `PlantSnapshot`s. The scenario engine gains one optional plant port; its four graded 2.0 models are untouched. Everything heavy (three, Jolt, the editor) loads through one dynamic import.

**Tech Stack:** TypeScript 5.9 (`erasableSyntaxOnly`: no parameter properties), React 19, Bun 1.3.14 (`bun test`), Electron 45, `three` 0.187.0, `jolt-physics` 1.1.1 (`jolt-physics/wasm-compat`), C99 in `firmware/apps/posix_host/src/native_runtime_session.c`, ANSI C99 tests in `firmware/lib/zplc_core/tests/test_native_runtime_session.c`.

**Spec:** `spec.md` (sections 5 and 6.2), `research.md` (sections 8.1 and the gate results), `plan.md` (M0, the format model), `gate/*` on `spike/plant-gate` (evidence). Read the spec sections of your task before you start.

**Created:** 2026-11-12 by a planning agent. Anything marked **Unconfirmed** was not verified while writing; the executor confirms it first and records the answer in the commit body.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`; `CORE/` is `firmware/lib/zplc_core/`. `bun test`, `bun run lint` and `bunx tsc -b` run with `IDE/` as the working directory unless the step says "at the root".

## Roles
| Role | Does |
|---|---|
| Executor | One task each, in its lane. Writes tests first, runs the commands, commits. Never edits a file outside the task's "Allowed edit surfaces". |
| Parent | Owns git across lanes, merges lanes in dependency order, runs the seam check (full IDE suite once) at each lane merge, and launches the independent review of Task R1. |
| Owner | Records the gate verdict, approves `course-outline.md` (CRS-001), names the Windows GPU machine, runs the macOS and Windows evidence, answers the open questions at the end. |

## Start rule
1. **Precondition A, the typed plant map.** `IDE/src/plants/plantMap.ts` in this worktree is still schema 1. Branch `feat/plant-typed-map` (commit `6db934c8`, worktree `ZPLC-worktrees/plant-map`) holds the typed map v2 for LNK-001, LNK-002 and PLT-003 (`PlantMapV2`, `normalizePlantMap`, `resolvePlantMap`, `plantMap.ts:13-215` there). M1 builds on it and does not redo it. The parent merges it into `feat/plant-simulation` before Task T0.
2. **Precondition B, the gate.** The owner records the D-14 verdict in `research.md` section 11. If it is anything but "confirmed", stop and re-plan the PHYS tasks.
3. **May start before the verdict** because they touch no physics and no dependency: R1 (C), Q1 (coverage tooling). Everything else waits for T0, which waits for the verdict.

## Requirement mapping
"Plan choice" marks a design decision of this plan that the spec does not state. Requirements that M1 does not deliver are listed in the last table so nothing is silently dropped.

| Requirement | Task(s) | Note |
|---|---|---|
| PLT-001 | P2, P4, S1 | Core runs in `bun test` with no window, GPU or DOM; command-line entry through the scenario runner (S1). |
| PLT-002 | P1 | Versioned file, schema-validated, no code, no remote fetch. |
| PLT-003 | P1 (derivation), done in precondition A (map) | Signals derive from parts; BOOL only in M1 (numeric end to end is M2). |
| PLT-004 | P2, R3 | Plant step 5 ms (plan choice, gate-verified); a scan interval that is not a multiple of 5 ms is refused with a located message. |
| PLT-005 | R1, R2, R3 | "In simulation the plant and the program MUST share one virtual clock: when the program has run N milliseconds of scans, the plant has simulated N milliseconds. Pause, a breakpoint and a stopped runtime MUST freeze the plant, and a single step MUST advance both by one scan (P15)." |
| PLT-006 | P4, S2 | Pinned trace hash; run on the three systems by the nightly job (S2); macOS and Windows hashes are owner evidence. |
| PLT-007 | P3 | |
| PLT-008 | P3 | Five-box stack on a travelling pallet, ten simulated minutes at rest. |
| PLT-010 | P4 | Facts: items produced, delivered, dropped and collided (positions and levels beyond M1 parts are M2+). |
| PLT-011 | P4 | |
| PLT-012 | P2 (capture, restore), P4 (reset) | |
| PLT-013 | S1 (graded models untouched), P5 (live models), Q1 | 2.0 suites run unchanged at every lane merge. |
| PLT-014 | P4 (stress scene), Q2 (evidence) | Gate: 5 ms step p95 3.10 ms on a loaded Linux host (headless only). |
| PLT-015 | Q2 | Editor-latency measurement, with and without a scene. |
| PLT-016 | P1 (located load errors), R3 ("When the plant cannot keep its step in real time it MUST slow simulated time for the plant and the program together and say so; it MUST NOT drop steps silently."), V4 (the message) | |
| PLT-017 | R3, S1 | One model: live, graded and (later) board use `PlantCore`. |
| VIS-001 | V4 | Panel replaces the 2.0 live plant in `LabPanel`; maximisable. The separate window is SHOULD and is not in M1 (open question 2). |
| VIS-002 | V1 | |
| VIS-003 | V2 | |
| VIS-004 | V1 (performance work), Q2 (evidence, pending machines) | |
| VIS-005 | V1 | Three quality levels, automatic at first run. |
| VIS-006 | V1 (detection, loss), V4 (message and schematic offer) | |
| VIS-007 | V3 | |
| VIS-008 | V3 | |
| VIS-009 | V2 | |
| VIS-010 | V4 | M1 panel parts: push button, indicator light (plan choice); selector, emergency stop, potentiometer, display are M2. |
| VIS-011 | V4 and every UI task | English and Spanish; Studio component kit. |
| VIS-012 | T0, Q2 | Sandbox and CSP unchanged; no remote asset. |
| VIS-013 | T0 | Installer growth recorded; licences recorded. |
| PRT-001 | P3, P4 (partial) | Plan choice, M1 subset: box (three heights, two masses), pallet, emitter, remover, belt, roller conveyor, curved conveyor, stop blade, diffuse and retro-reflective optical sensors, push button, indicator light. The rest of the family is M2 to M5. |
| PRT-002 | P1, D1 | One definition per part; generated reference compared in CI (D1). |
| PRT-003 | P3, P4 | |
| PRT-006 | P4 | Optical sensors only; inductive and capacitive are M4. |
| PRT-007 | P1 (snap point definition), E1 (use) | |
| PRT-008 | P4 | Sensor stuck on or off, actuator that does not move, item jam. |
| PRT-009 | P3, V1 | Geometry generated in code. The OIP box and pallet textures are `reuse` in `gate/prior-art.md`; this plan does not use them (open question 5). |
| PRT-010 | P1 | A test adds a part to the catalogue without touching the scene, link or lesson code. |
| SCN-001 | F1, F2 | Scenes 1, 2, 4 (F1), 8, 9 (F2); each with a plant map and a reference program. |
| SCN-002, SCN-003 | F1, F2 | Only catalogue and public scene format; original layouts. |
| SCN-004 | S2, F1, F2 | Reference passes, empty fails, in CI. |
| SCN-005 | S1 | "A scenario MUST be able to script panel inputs, item emission and fault actions at virtual times, and to assert on plant facts with the expectation kinds that exist today." |
| SCN-006 | P1 (versioning, located message), E5 (saved with the project) | |
| SCN-007 | F1, F2 | Each scene declares its shortest sensor pulse. |
| SCN-008 to SCN-011, SCN-014 to SCN-016 | E1, E3, E4, E5 | The authoring path. Learner exposure under D-15 is open question 3. |
| SCN-012, SCN-013 | E2 | Plant-map editor over `PlantMapV2`; declaration generator. |
| LNK-001, LNK-002 | precondition A, E2 | |
| LNK-003 | R3 | Sensors of one plant step applied by one write at one scan boundary; commands read from one consistent output image. |
| LNK-004 | R1, R2, R3 | |
| LNK-005 | R2, R3 | WASM runtime works through the same session; differences become declared capability gaps. |
| LNK-006 | R3 | Test: a forced input keeps its forced value over the plant's. |
| LNK-009 | S1, Global Constraints | Headless scene scenarios may be run by AI and MCP; nothing here starts plant I/O mode. |
| CRS-003 to CRS-006 (M1 scenes only) | L1, L2 | Conditional on the owner approving `course-outline.md`. |
| CRS-011 (M1 parts) | D2 | |

**Not delivered by M1** (later milestones, per spec 6.2): PLT-009 (process models, M2), PRT-004 numeric variants (M2), PRT-005 (M4), LNK-007 to LNK-018 (M6), CRS-001, CRS-002, CRS-007 to CRS-010, CRS-012, CRS-013 (course, M7), SCN-001 for scenes 3, 5, 6, 7, 10 to 21, VIS-001 "movable to a window of its own" (open question 2).

## Contracts (fixed up front; lanes code against these, never against each other)
Task T0 writes `IDE/src/plant/contracts.ts` containing exactly these declarations (types and interfaces only, no logic, so every lane compiles from the first merge). Changing one needs the parent: every lane depends on it.

```ts
// IDE/src/plant/contracts.ts
import type { PlantMapV2, SignalType } from '../plants/plantMap';

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export type FactValue = number | boolean | string;

/** C1. The scene file (PLT-002). A file `scene.json` of a project or of `plant-scenes/<id>/`. Data only. */
export interface PlantSceneFile {
  schemaVersion: 1;
  name: string;
  parts: ScenePart[]; // order is the creation order: it is part of determinism
  cameras: CameraPreset[];
  /** The shortest sensor pulse the scene can produce at catalogue speeds, in ms (SCN-007). */
  shortestPulseMs?: number;
}
export interface ScenePart {
  id: string; // unique in the scene, [a-z][a-z0-9-]{0,31}
  part: string; // a catalogue id, e.g. 'belt'
  name: string; // the signal prefix, [A-Za-z][A-Za-z0-9_]{0,23}, unique in the scene
  position: Vec3; // metres
  rotationYDeg: number; // multiple of 15 in the editor; any value in a file
  config: Readonly<Record<string, number | string | boolean>>;
}
export interface CameraPreset { name: string; position: Vec3; target: Vec3 }

/** C2. One catalogue part, defined once (PRT-002). `physics` and `behave` are the only parts that know Jolt. */
export interface PartDefinition {
  id: string;
  family: 'items' | 'sources' | 'conveyors' | 'flow' | 'sensors' | 'panel';
  names: { en: string; es: string };
  config: Readonly<Record<string, ConfigField>>;
  signals(part: ScenePart): PlantSignalDef[]; // derived: `${part.name}.${signal}`
  actions: readonly string[]; // fault actions (PLT-011, PRT-008)
  snapPoints(part: ScenePart): readonly SnapPoint[];
  doc: { en: string; es: string };
}
export interface ConfigField { kind: 'number' | 'enum' | 'boolean'; min?: number; max?: number; values?: readonly string[]; default: number | string | boolean; unit?: string }
export interface SnapPoint { name: string; position: Vec3; normalYDeg: number; accepts: readonly string[] }
export interface PlantSignalDef { name: string; direction: 'command' | 'sensor'; type: SignalType; unit?: string }

/** C3. A drawable state; the view reads nothing else (P14). */
export interface BodyPose { id: string; part: string; kind: 'box' | 'pallet' | 'item'; size: Vec3; p: Vec3; q: Quat }
export interface PartView { id: string; part: string; name: string; pose: BodyPose; state: Readonly<Record<string, FactValue>>; signals: Readonly<Record<string, boolean | number>> }
export interface PlantSnapshot { timeMs: number; scans: number; parts: readonly PartView[]; items: readonly BodyPose[]; facts: Readonly<Record<string, FactValue>> }

/** C4. The plant core. Created by `createPlantCore` (Task P4). All times are multiples of `stepMs`. */
export interface PlantCore {
  readonly stepMs: 5;
  readonly signals: readonly PlantSignalDef[]; // direction 'command' goes program to plant
  /** Latch commands (by full signal name) for the next `advance`. Unknown names throw a located Error. */
  apply(commands: Readonly<Record<string, boolean | number>>): void;
  advance(ms: number): void; // throws RangeError unless ms is a positive multiple of stepMs
  sense(): Readonly<Record<string, boolean | number>>;
  facts(): Readonly<Record<string, FactValue>>;
  /** A person operating a panel part (push button, VIS-010). */
  operate(signal: string, value: boolean | number): void;
  act(part: string, action: string): void; // fault action by part name
  addItem(kind: string, at: Vec3): string; // returns the item id; throws when the scene forbids it
  removeItem(id: string): void;
  snapshot(): PlantSnapshot;
  capture(): PlantState; // PLT-012
  restore(state: PlantState): void;
  reset(): void;
  traceHash(): Promise<string>; // sha256 hex of the per-advance trace so far
  dispose(): void;
}
export type PlantState = { readonly format: 1; readonly bytes: Uint8Array }; // opaque to every caller
export declare function createPlantCore(scene: PlantSceneFile, options?: { seed?: number }): Promise<PlantCore>;

/** C5. The runtime port the lock-step session uses (a subset of `NativeAdapter`; WASM adapter shares it). */
export interface PlantRuntimePort {
  setClockMode(mode: 'virtual' | 'free'): Promise<{ scanIntervalMs: number }>; // new, Tasks R1/R2
  scenarioStep(atMs: number): Promise<void>;
  getInfo(): Promise<{ cycles: number }>;
  peek(address: number, length: number): Promise<Uint8Array>; // memory.read, at most 64 bytes
  pokeN(address: number, bytes: Uint8Array): Promise<void>; // memory.write, at most 64 bytes, force-aware (RT-011)
}

/** C6. The lock-step session (Task R3). */
export type PlantSessionState = 'idle' | 'running' | 'paused' | 'held' | 'faulted' | 'stopped';
export interface PlantSession {
  readonly state: PlantSessionState;
  readonly slowdown: number; // 1 = real time; below 1 the plant and program are slowed together (PLT-016)
  start(): Promise<void>; pause(): void; resume(): void; step(): Promise<void>; stop(): Promise<void>; reset(): Promise<void>;
  onChange(listener: (event: PlantSessionEvent) => void): () => void;
}
export type PlantSessionEvent =
  | { kind: 'scan'; scans: number; snapshot: PlantSnapshot }
  | { kind: 'state'; state: PlantSessionState; reason?: string }
  | { kind: 'slowdown'; factor: number; message: string };
export declare function createPlantSession(ports: { core: PlantCore; runtime: PlantRuntimePort; map: PlantMapV2; paceMs?: (ms: number) => Promise<void> }): PlantSession;

/** C7. Scenario seam (Task S1): the optional port `runScenario` uses for a scene scenario. */
export interface ScenarioPlantPort { core: PlantCore; map: PlantMapV2 }
```

**Interfaces beyond TypeScript (fixed here):**
- **IPC method names** (renderer to native session, added to the allow-list in R2): `simulation.clock.set` with params exactly `{ "mode": "virtual" | "free" }`, and `scenario.step` with params exactly `{ "at_ms": <uint32> }`. The result of `simulation.clock.set` is the normal status result plus `"clock_mode"` and `"scan_interval_ms"` (0 when no program is loaded). Plan choice: the clock is requested per session by this method, never by the environment variable; `nativeSimulationEnvironment` keeps deleting `ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK` (`IDE/shared/nativeSimulationEnvironment.ts:23`).
- **Files on disk (plan choice):** shipped scenes live in `IDE/plant-scenes/<scene-id>/` with `scene.json`, `plant-map.json` (schema 2), `reference.st`, `starter.st`, `scenario.json`. A project scene is `<project>/scenes/<name>.scene.json` (E5).
- **Scene-scenario file (plan choice, S1 finalises after reading `compileScenario`, `IDE/src/test-engine/index.ts:265-440`):** the existing `scenario.json` gains an optional `"scene"` block `{ "file": "scene.json", "map": "plant-map.json", "script": [{ "atMs": n, "operate": {"signal": "...", "value": true} } | { "atMs": n, "emit": {"kind": "...", "at": [x,y,z]} } | { "atMs": n, "fault": {"part": "...", "action": "..."} }] }`, and an expectation `reads` entry may name `fact:<factName>`. A scenario without `"scene"` compiles and hashes exactly as in 2.0.
- **Signal names:** `<ScenePart.name>.<signal>`, for example `Belt1.run`, `EyeA.detect`, `StartButton.pressed`. Plan choice. Catalogue part signals in M1: belts and rollers `run` (command, BOOL), `runReverse` (command, BOOL, only where the part config allows it); optical sensors `detect` (sensor, BOOL); stop blade `extend` (command), `extended`, `retracted` (sensors); emitter `emit` (command, BOOL, edge); push button `pressed` (sensor), indicator light `lit` (command).
- **Facts (plan choice, names are API for scenarios and text):** `itemsEmitted`, `itemsRemoved`, `itemsDropped` (fell below the floor plane minus 0.5 m), `itemsCollided` (box to box contacts above 0.5 m/s closing speed), `delivered:<RemoverName>`, `count:<SensorName>` (rising edges), `position:<itemKind>:<index>`.

## Lanes and dependency graph
**PHYS** = redone if D-14 is overturned. **KEEP** = survives.

| Lane | Task | Title | Kind | Depends on | Lane-owned surface (summary) |
|---|---|---|---|---|---|
| 0 | T0 | Foundation: dependencies, contracts, bundle and SBOM gates | KEEP (dependency lines PHYS) | A, B | `IDE/package.json`, `bun.lock`, `scripts/release/sbom-floor.json`, `IDE/scripts/welcomeBundle.test.ts`, `IDE/src/i18n/*`, `IDE/src/plant/contracts.ts`, stubs |
| P | P1 | Scene format, validation, catalogue registry | KEEP | T0 | `IDE/src/plant/core/scene*.ts`, `catalogue.ts` |
| P | P2 | Physics world on Jolt | **PHYS** | T0 | `IDE/src/plant/core/jolt.ts`, `world.ts` |
| P | P3 | Items and transport parts | **PHYS** | P1, P2 | `IDE/src/plant/core/parts/{items,conveyors,sources}.ts` |
| P | P4 | Sensors, stop blade, panel parts, facts, `createPlantCore` | **PHYS** (sensors, blade) / KEEP (facts, hash) | P3 | `IDE/src/plant/core/{plantCore,facts,trace}.ts`, `parts/{sensors,flow,panel}.ts` |
| P | P5 | Live 2.0 models behave as the graded ones (D-19) | KEEP | T0 | `IDE/src/plants/plantEngine*.ts`, `plantFacts*.ts` |
| S | S1 | Scenario seam for scenes | KEEP | P1 (fake core until P4) | `IDE/src/test-engine/*`, `IDE/src/cli/nativeScenarioRuntime.ts` |
| S | S2 | Scene CI harness and determinism pin | KEEP (hash PHYS) | S1, P4 | `IDE/src/plant/ci/*`, `IDE/scripts/generate-scene-index.ts`, `IDE/src/generated/sceneIndex.ts` |
| R | R1 | C: virtual-clock request and clock-neutral held scan | KEEP | none (start rule 3) | `firmware/apps/posix_host/src/native_runtime_session.{c,h}`, `CORE/tests/test_native_runtime_session.c` |
| R | R2 | Allow-list and adapters | KEEP | R1 | `IDE/electron/security*.ts`, `IDE/src/runtime/{nativeAdapter,wasmAdapter}*.ts` |
| R | R3 | Lock-step session | KEEP | R2, P4 | `IDE/src/plant/session/*` |
| V | V1 | three.js renderer core | KEEP | T0 | `IDE/src/plant/view/{renderer,camera,quality,geometry}.ts` |
| V | V2 | State cues and display modes | KEEP | V1 | `IDE/src/plant/view/cues.ts`, `displayModes.ts` |
| V | V3 | Schematic and text equivalent | KEEP | P1 | `IDE/src/plant/schematic/*`, `IDE/src/plant/text/*` |
| V | V4 | Panel integration, operation, fallbacks | KEEP | V1, V2, V3, R3, P4 | `IDE/src/plant/ui/*`, `IDE/src/components/LabPanel.tsx` |
| E | E1 | Editor model: commands, undo/redo, snapping, validation | KEEP | P1 | `IDE/src/plant/editor/{model,commands,validate,templates}.ts` |
| E | E2 | Plant-map editor and declaration generator | KEEP | E1 | `IDE/src/plant/editor/{mapEditor,declarations}.ts` |
| E | E3 | Editor panel: the pointer-free path | KEEP | E1, E2, V4 | `IDE/src/plant/editor/EditorPanel.tsx` and parts |
| E | E4 | Pointer placement in the 3D view | KEEP | E3, V1 | `IDE/src/plant/editor/pointer.ts` |
| E | E5 | Scenes saved with the project | KEEP | E1 | locator-dependent, see task |
| F | F1 | Scenes 1, 2, 4 | KEEP (content) | S2, P4 | `IDE/plant-scenes/{belt-to-sensor,latch-two-sensors,counted-queue}/*` |
| F | F2 | Scenes 8, 9 | KEEP (content) | S2, P4 | `IDE/plant-scenes/{buffer-release,merge-lines}/*` |
| L | L1 | Lesson packages name a scene | KEEP | S1, P1 | `IDE/src/learn/lessonPackage*.ts` |
| L | L2 | Lessons 12.1, 12.2, 12.3, 14.1, 14.2 | KEEP | F1, F2, L1, owner approval | `IDE/lessons/plant-*/*` |
| D | D1 | Parts reference generated and compared | KEEP | P4 | `tools/docs/plant-parts-reference.ts` and generated pages |
| D | D2 | Plant, scene format and scene pages (EN, ES) | KEEP | F1, F2, V4 | `docs/docs/plant/*`, `docs/i18n/es/.../plant/*` |
| Q | Q1 | Requirement coverage reads spec 012 | KEEP | none (start rule 3) | `tools/ci/requirement-*`, `tools/ci/spec-tracking.test.ts` |
| Q | Q2 | Benchmarks, journeys, security check | KEEP (frame numbers PHYS) | V4, R3 | `IDE/scripts/plant/*`, `IDE/scripts/run-journeys.ts` journeys |

**Graph.**
```
(A: merge typed map, B: gate verdict) -> T0 -+-> P1 --+-> P3 -> P4 -+-> R3 ---+
                                             |        |            |         |
                                             +-> P2 --+            +-> S2 -> F1,F2 -> L2, D2
R1 -> R2 ----------------------------------------------------------+  (R3 needs R2 and P4)
T0 -> V1 -> V2 -+-> V4 (needs V3, R3, P4) -> E3 -> E4 ; V4 -> Q2
T0 -> P1 -> V3 ; P1 -> E1 -> E2 -> E3 ; E1 -> E5 ; T0 -> P5 ; S1 (after P1) -> S2, L1 -> L2 ; P4 -> D1
Q1 independent.
```
**Parallel waves** (lanes run at the same time inside a wave; the parent merges at the end of each wave and runs the seam check):
1. R1, Q1 (before the verdict, if the owner wants the C review to start early).
2. T0.
3. P1, P2, P5, V1, R2, E1 (disjoint surfaces).
4. P3, V2, V3, S1, E2, L1.
5. P4, E5.
6. R3, S2, D1, V4 (V4 starts when R3 has a stable `createPlantSession` signature; it may code against C6 with a fake session earlier).
7. F1, F2, E3, Q2.
8. E4, L2, D2.

## Global Constraints
- **Security posture (VIS-012).** The renderer stays sandboxed (`sandbox: true`, `contextIsolation: true`, `IDE/electron/main.ts:321-327` as cited by plan M0) and the content security policy stays as it is (`createContentSecurityPolicy`, `IDE/electron/security.ts:977-1001`; the spec cites `:982` and `:986` for the WebAssembly and worker allowances). No cross-origin isolation headers, so no multi-threaded Jolt flavour and no `SharedArrayBuffer`. No remote asset: every texture, geometry and font is generated or bundled. The only security-surface edits in M1 are the two renderer-allowed methods of R2, reviewed on their own.
- **Dependencies.** Only `three`, `jolt-physics` and `@types/three`, at the exact versions of `gate/dependencies.json` (0.187.0, 1.1.1, 0.187.0; all MIT). No React binding for three.js (spec 4.3). Anything else needs the owner (`AGENTS.md` guideline 6, constitution rule 8).
- **Firmware.** C99, bounded static memory, no dynamic allocation in anything R1 adds; no new heap use in the session. Run `bun run lint:c` and the formatter check at the root. The formatter is clang-format 23.1.3 from a uv venv through `CLANG_FORMAT` (skipping it broke the 2.0 CI).
- **Tests through public interfaces**, with the requirement ID in the test name (`it('PLT-008 five boxes stay stacked ...')`), the style the existing suites use (`welcomeBundle.test.ts`). Each test asserts every observable effect of its rule. When a task changes an existing option or helper, add one test that its previous behaviour still holds.
- **Determinism.** No `Date`, `Math.random`, `performance.now` or iteration over an unordered collection in `IDE/src/plant/core/**`; a seeded generator only. Creation order of bodies is the order of `scene.parts`.
- **The 2.0 suites pass unchanged** (PLT-013, PLT-015): `bun test` in `IDE/` at every merge, plus the lesson, plant, smoke and journey suites named in `IDE/package.json` scripts. A 2.0 test may change only in Task P5, and only the live-model assertions that D-19 names.
- **Structural rules.** `bun run lint` in `IDE/` (eslint with warnings as errors, then `tools/ci/ide-structure.ts`: modules at most 1600 lines, no import cycle, a store module imports no component, no whole-store subscription; `ux-tokens`, `ui-kit-guard`, `i18n-guard`). Components select the store fields they show; the plant panel never subscribes to the whole store. UI uses the Studio kit (`IDE/src/ui`, UX-002).
- **Docs.** Every new command, option, message and page ships in English (`docs/docs/`) and Spanish (`docs/i18n/es/docusaurus-plugin-content-docs/current/`) in the same commit series. Evidence levels stay distinct (host, QEMU, target, HIL, manual).
- **No physical operations.** Nothing here flashes, deploys, opens a serial port, forces I/O on a board or starts plant I/O mode. AI and MCP may only run scene scenarios headless against a simulated runtime (LNK-009; constitution rule 9). R2's methods are renderer-to-simulated-runtime only.
- **Commits.** Conventional Commits, no AI attribution lines, work-unit commits with tests and docs alongside the behaviour. About 400 changed lines per task is a heuristic, not a cap. Pushing and merging are the owner's.
- **Reporting.** State each command and what it printed. A failing check is a finding: do not change a threshold or a test to make it pass.
- **Shell.** `bat`, `rg`, `fd`, `eza`; not `cat`, `grep`, `find`, `ls`. Do not use CodeGraph or prowl on this branch.
- **Fresh worktree.** `bun run build` needs `bun run build:compiler` first.

## Review Focus (conditions the spec implies; each has a test in the task that owns it)
1. A box asleep on a stopped belt moves when its belt starts, with a per-belt wake, not a wake of every body (P2; the spike woke every body, 30 to 45 % of its cost).
2. A held scan (breakpoint) leaves the program's timers exactly where an unheld run would leave them (R1; the gate measured a skew of one scan).
3. A runtime failure stops the plant at the last completed scan and says why (R3; gate-verified on the spike).
4. Pause freezes plant and program; host pacing never changes the trace (R3).
5. `Jolt.destroy(JoltInterface)` also frees the layer filters and the broad-phase interface; destroying them again corrupts the module. Resetting a scene 50 times must not grow WebAssembly memory (P2).
6. No WebGL 2, or a lost context, leaves the core, the session and grading running (V1, V4).
7. A forced input keeps its forced value over the plant's write (R3).
8. Old scene files open or fail with a message that names the version (P1).

---

### Task T0: Foundation
**Spec:** PLT-002 (prerequisite), VIS-012, VIS-013. **Lane:** 0. **Wave 2.**

**Allowed edit surfaces**
```
IDE/package.json
bun.lock
scripts/release/sbom-floor.json
IDE/scripts/welcomeBundle.test.ts
IDE/vite.config.ts
IDE/src/i18n/en.ts
IDE/src/i18n/es.ts
IDE/src/i18n/catalog/plantView.ts
IDE/src/i18n/catalog/plantEditor.ts
IDE/src/plant/contracts.ts
IDE/src/plant/editor/EditorPanel.tsx
IDE/src/plant/ui/PlantPanel.tsx
specs/012-zplc-2-1-plant-simulation/gate-m1/dependencies.json
```
(`IDE/vite.config.ts` only if a manual chunk is needed; the file name is **Unconfirmed**, run `fd vite.config IDE` first.)

**Interfaces:** produces `contracts.ts` exactly as in "Contracts"; `plantViewEn/plantViewEs` and `plantEditorEn/plantEditorEs` catalogues (empty objects typed like `labEn`, `IDE/src/i18n/catalog/lab.ts:2`, registered in `en.ts` and `es.ts` the way `labEn` is, `en.ts:11`); a stub `EditorPanel` (`export function EditorPanel(): null`) and a stub `PlantPanel` that later tasks replace in place.

- [ ] **Step 1: Preconditions.** At the root: `git log --oneline -1 -- IDE/src/plants/plantMap.ts` must show the typed-map commit, and `rg -n "schemaVersion: 2" IDE/src/plants/plantMap.ts` must match. If not, stop: the parent merges `feat/plant-typed-map` first. Run `rg -n "Gate results" specs/012-zplc-2-1-plant-simulation/research.md`; it must exist with a D-14 verdict of confirmed.
- [ ] **Step 2: Baseline.** `bun install && bun run build:compiler`, then in `IDE/`: `bun test src/plants src/test-engine scripts/welcomeBundle.test.ts` (build first if the bundle test needs `dist`: `bun run build`). Expected: green. Record `bun ../../scripts/release/sbom.ts --check` output (at the root: `bun scripts/release/sbom.ts --check`).
- [ ] **Step 3: Failing test.** In `welcomeBundle.test.ts` add `it('VIS-012 three and Jolt are in no start chunk and arrive through a dynamic import', ...)`: every module path under `node_modules/three/` or `node_modules/jolt-physics/` appears only in chunks that are not in `startChunks()`. Run `bun test scripts/welcomeBundle.test.ts`. Expected: the new test passes vacuously before the dependency exists, so also add `it('VIS-013 the plant chunk exists and stays under 6 MB', ...)` that fails with "no chunk holds jolt-physics" until Step 5.
- [ ] **Step 4: Add dependencies.** `bun add --exact three@0.187.0 jolt-physics@1.1.1 && bun add --dev --exact @types/three@0.187.0`. Create `src/plant/contracts.ts` and the stubs, and register the catalogues.
- [ ] **Step 5: Make the chunk real.** The stub `PlantPanel` does `void import('../view/probe')`-style lazy loading only if needed to keep the chunk test honest: create `IDE/src/plant/ui/loadPlantEngine.ts` exporting `loadPlantEngine = () => Promise.all([import('three'), import('jolt-physics/wasm-compat')])`, imported by nothing yet except the test fixture. If the bundler drops it, V4 owns making it live; the Step 3 test then asserts only the "not in start chunks" half and records the size check as pending V4 (state which in the commit body).
- [ ] **Step 6: Gates.** `bun run build` (IDE), then `bun test scripts/welcomeBundle.test.ts`. The host-name check (`INERT_HOSTS`, `welcomeBundle.test.ts:158-197`) names any host three or Jolt mention in the built chunk: for each new host, add an entry with the reason it loads nothing (the same discipline as `www.w3.org`). Never add a host that is loaded.  At the root: `bun scripts/release/sbom.ts --check`; if it reports the floor, run `bun scripts/release/sbom.ts --update-floor` and commit the new `sbom-floor.json`.
- [ ] **Step 7: Record sizes.** Write `gate-m1/dependencies.json` with name, version, licence (from `node_modules/<name>/package.json`) and the built chunk size in bytes (gate: about 4.1 MB, one lazy chunk). Any licence other than MIT: stop.
- [ ] **Step 8: Verify and commit.** `bunx tsc -b`, `bun run lint`, `bun test`. Expected: all pass.
```bash
git add packages/zplc-ide bun.lock scripts/release/sbom-floor.json specs/012-zplc-2-1-plant-simulation/gate-m1
git commit -m "build(plant): add three and jolt-physics, plant contracts, lazy-chunk and SBOM gates"
```
**Risk:** item 5 (dependencies, bundle and SBOM gates), item 3 (the contracts every lane consumes).

---

### Task P1: Scene format, validation, catalogue registry
**Spec:** PLT-002, PLT-003 (derivation), PLT-016 (load errors), SCN-006 (versioning), PRT-002, PRT-007 (snap point definition), PRT-010. **Lane P. Wave 3. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/core/scene.ts
IDE/src/plant/core/sceneSchema.ts
IDE/src/plant/core/catalogue.ts
IDE/src/plant/core/scene.test.ts
IDE/src/plant/core/catalogue.test.ts
```

**Interfaces:** consumes `PlantSceneFile`, `ScenePart`, `PartDefinition` (contracts). Produces:
```ts
// scene.ts
export interface SceneProblem { path: string; message: string } // path like 'parts[2].config.speedMps'
export function parseScene(text: string): { scene: PlantSceneFile } | { problems: SceneProblem[] };
export function validateScene(value: unknown, catalogue: Catalogue): SceneProblem[]; // located messages (PLT-016, SCN-015)
export const SCENE_SCHEMA_VERSION = 1;
export function migrateScene(value: unknown): { scene: PlantSceneFile } | { problems: SceneProblem[] }; // unknown newer version: message names it
export function sceneSignals(scene: PlantSceneFile, catalogue: Catalogue): PlantSignalDef[]; // derived, sorted by part order then signal order
// catalogue.ts
export interface Catalogue { get(id: string): PartDefinition | undefined; list(): readonly PartDefinition[] }
export function createCatalogue(defs: readonly PartDefinition[]): Catalogue; // rejects duplicate ids
export const catalogue: Catalogue; // the shipped catalogue; parts register from P3/P4 files, see below
```
Registration: `catalogue.ts` holds `const DEFINITIONS: PartDefinition[] = []` and exports `registerParts(defs)`; the part files (P3, P4) are imported by `plantCore.ts` (P4) which calls `registerParts` once. P1 must not import the part files (disjoint surfaces).

- [ ] **Step 1: Failing tests** (`scene.test.ts`, with a two-part test catalogue defined inside the test, so P1 needs no part file):
  1. `'PLT-002 a valid scene parses and lists its parts in file order'`.
  2. `'PLT-002 a scene with an unknown part id names the part and the path'`: expect `{ path: 'parts[1].part', message: 'unknown part "turbo-belt"; the catalogue has: belt, box' }`.
  3. `'PLT-002 loading a scene executes no code and fetches nothing'`: a scene whose config string is `"__proto__"`, `"constructor"` or a URL stays a plain string; assert `Object.getPrototypeOf(scene.parts[0].config) === Object.prototype` and that `globalThis.fetch` was never called (replace it with a throwing stub in the test).
  4. `'PLT-016 a config value out of range is located'`: `{ path: 'parts[0].config.speedMps', message: 'speedMps 9 is above the limit 2 m/s' }`.
  5. `'SCN-006 a scene written by a newer Studio fails with its version'`: message contains `schemaVersion 2` and `this Studio reads 1`.
  6. `'PRT-010 a part added to the catalogue needs no change to scene, link or lesson code'`: create a catalogue with a third definition, validate a scene that uses it; assert `SCENE_SCHEMA_VERSION` is still 1 and `sceneSignals` lists its signals.
  7. `'PLT-003 signals are derived and named Part.signal, unique per scene'`; a scene with two parts named alike gives a problem `parts[1].name`.
- [ ] **Step 2: Run.** `bun test src/plant/core/scene.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** with hand-written validators (no schema library: no new dependency). Reject unknown top-level and part keys. Names and ids by the patterns in `ScenePart`. At most 512 parts (plan choice, bounds the editor and the core).
- [ ] **Step 4: Run, then** `bun run lint` and `bunx tsc -b`. Expected: 7 pass.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core
git commit -m "feat(plant): scene format, validation with located messages and catalogue registry"
```
**Risk:** item 1 (a persisted format), item 3 (the format is consumed by every later lane); the migration test is the guard.

---

### Task P2: Physics world on Jolt (PHYS)
**Spec:** PLT-001, PLT-004, PLT-012, PLT-007 (basis). **Lane P. Wave 3.**

**Allowed edit surfaces**
```
IDE/src/plant/core/jolt.ts
IDE/src/plant/core/world.ts
IDE/src/plant/core/world.test.ts
```
The spike (`plant-gate/world.ts`, `jolt.ts`) is reference only; write fresh and follow its verified techniques: `jolt-physics/wasm-compat`; two object layers; one `jolt.Step(stepMs/1000, 1)` per plant step; belt surface velocity in a `ContactListenerJS` writing `mRelativeLinearSurfaceVelocity` on contact added and persisted, where the setting is the velocity of body 2 relative to body 1 (flip the sign when the belt is body 1).

**Interfaces:**
```ts
export type JoltModule = Awaited<ReturnType<typeof import('jolt-physics/wasm-compat').default>>;
export function loadJolt(): Promise<JoltModule>; // a fresh module per call
export interface WorldBodySpec { id: string; kind: 'box' | 'pallet' | 'item'; half: Vec3; position: Vec3; rotationYDeg: number; massKg: number; friction: number; motion: 'static' | 'dynamic' | 'kinematic'; layer: 'moving' | 'static' }
export interface WorldBeltSpec { id: string; bodyId: string; axis: Vec3; accelMps2: number } // a belt is a static body plus a surface velocity
export interface PhysicsWorld {
  readonly timeMs: number;
  addBody(spec: WorldBodySpec): void; removeBody(id: string): void;
  addBelt(spec: WorldBeltSpec): void; setBeltTarget(id: string, speedMps: number): void;
  setKinematicPose(id: string, p: Vec3, q: Quat): void;
  step(ms: number): void; // positive multiple of stepMs, else RangeError
  rayHit(from: Vec3, to: Vec3): string | null; // id of the nearest moving body crossing the segment, or null
  bodies(): readonly { id: string; p: Vec3; q: Quat; v: Vec3; asleep: boolean }[]; // creation order
  capture(): Uint8Array; restore(bytes: Uint8Array): void; // PLT-012; plan choice: Jolt state recorder if exposed in 1.1.1, else poses and velocities of every body
  dispose(): void;
}
export function createWorld(Jolt: JoltModule, stepMs?: number): PhysicsWorld; // stepMs defaults to 5
```
**Per-belt wake (the M1 improvement over the spike).** When a belt's target changes, wake only the bodies in contact with it. **Unconfirmed:** whether `jolt-physics` 1.1.1 exposes `BodyInterface.ActivateBodiesInAABox` or an equivalent; the first step of this task finds out. If it does, wake the AABox over the belt's top plus a 0.05 m margin (Open Industry Project uses `CARGO_WAKE_MARGIN = 0.05`, `gate/prior-art.md`, belt technique row). If not, track belt contacts in `OnContactAdded` and drop them in `OnContactRemoved`, keeping a per-belt `Set` of body ids iterated in creation order (never set order of memory addresses).

- [ ] **Step 1: Probe.** Write `world.probe.test.ts` (deleted before the commit) calling `Object.keys(Jolt.BodyInterface.prototype)` filtered by `Activate`. Record the answer in the commit body.
- [ ] **Step 2: Failing tests** (`world.test.ts`):
  1. `'PLT-001 a falling box lands in the test runner'`: floor top y = 0, 0.3 m cube 5 kg at y = 1, `step(2000)`: `|y - 0.15| < 0.002`.
  2. `'PLT-004 a step that is not a multiple of the plant step is rejected'`.
  3. `'PLT-007 a box on a belt reaches belt speed and stops with it'`: belt 4.0 x 0.1 x 0.6 m top y 0.5 friction 0.6, `accelMps2` 1, box friction 0.6; target 0.5: after `step(1500)` `|vx - 0.5| <= 0.01`, `|z| <= 0.005`; after target 0 and `step(1500)` `|v| <= 0.005`. (Gate values, no tuning.)
  4. `'a box asleep on a stopped belt moves when its belt starts'` (Review Focus 1): `step(60000)` stopped, then target 0.5, `step(1500)`, `|vx - 0.5| <= 0.01`.
  5. `'only bodies on the started belt are woken'`: two belts, a box on each, both asleep, start belt A; assert the box on belt B is still `asleep` after one step and the box on A is not.
  6. `'PLT-012 capture then restore reproduces the same future'`: run 1000 ms, `capture`, run 1000 ms, hash poses; `restore`, run the same 1000 ms, same hash. Poses are hashed as little-endian float32 of p and q per body in creation order.
  7. `'no WebAssembly growth across 50 create and dispose cycles'` (Review Focus 5): free heap within 1 % between cycle 5 and cycle 50; `freeHeapBytes` is a test helper reading the module's heap counter as the Jolt examples do (**Unconfirmed** name; find it in `node_modules/jolt-physics`). `dispose` must destroy the `JoltInterface` once and nothing it owns again.
- [ ] **Step 3: Run.** `bun test src/plant/core/world.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Destroy everything created with `new Jolt.*` that is not owned by the interface; belts' surface velocity applies per contact; fixed iteration order everywhere.
- [ ] **Step 5: Run** the tests, `bunx tsc -b`, `bun run lint`. Expected: 7 pass. Allowed tuning if 3 or 4 fail: friction 0.4 to 0.8, solver iteration counts, plant step 2.5 ms; record any tuning in the commit body. Thresholds are not tunable.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/jolt.ts packages/zplc-ide/src/plant/core/world.ts packages/zplc-ide/src/plant/core/world.test.ts
git commit -m "feat(plant): fixed-step Jolt world with belts, per-belt wake, capture and restore"
```
**Risk:** item 4 (ordering and sleeping bodies decide determinism), item 6 for any path the tests above do not cover. PHYS: redone entirely if D-14 is overturned.

---

### Task P3: Items and transport parts (PHYS)
**Spec:** PLT-007, PLT-008, PRT-001 (subset), PRT-003, PRT-009. **Lane P. Wave 4.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/items.ts
IDE/src/plant/core/parts/conveyors.ts
IDE/src/plant/core/parts/sources.ts
IDE/src/plant/core/parts/transport.test.ts
IDE/src/plant/core/parts/soak.test.ts
```

**Interfaces:** each file exports `PartDefinition`s (contracts C2) plus a runtime builder:
```ts
export interface PartRuntime { // internal to the core; P4 composes them
  build(world: PhysicsWorld, part: ScenePart): void;
  beforeStep(commands: Readonly<Record<string, boolean | number>>): void; // latched commands to belt targets, emitter edges
  afterStep(): void;
  sense(): Record<string, boolean | number>;
  facts(): Record<string, FactValue>;
  act(action: string): void;
  views(): readonly PartView[];
}
export const itemParts: readonly (PartDefinition & { runtime: PartRuntimeFactory })[];
```
(`PartRuntimeFactory = (part: ScenePart, rng: () => number) => PartRuntime`.) Parts and their config (plan choice, ranges are the catalogue's documented ranges):
- `box`: `height` enum {0.2, 0.3, 0.4} m, `mass` enum {2, 5} kg (three heights, two masses), base 0.4 x 0.3 m. Items are created by emitters and `addItem`; the `box` part in a scene is an initial item.
- `pallet`: 1.2 x 0.144 x 0.8 m, 25 kg (gate values).
- `belt`: `length` 0.5 to 8 m, `width` 0.4 to 0.8 m, `speedMps` 0.1 to 1.0 (catalogue speed; gate used 0.5), `accelMps2` 1.0, `allowReverse`. Signals `run`, `runReverse`. Fault actions `stall` (belt will not move), `jam`.
- `roller`: as belt with decorative rollers; surface velocity technique identical (Open Industry Project does the same, study only).
- `curved`: quarter turn, arc surface velocity (rigid rotation, omega = speed / centreline radius, from `gate/prior-art.md` curved conveyor row, study only; written fresh). Signals as belt.
- `emitter`: `kind`, `intervalMs` (scripted when `0`), `seed`, `maxItems`; signal `emit` (rising edge emits one item); random mode uses the seeded generator passed in.
- `remover`: a sensor volume that removes items entering it; fact `delivered:<Name>`.
Items resting on conveyors: friction 0.6 (gate-verified).

- [ ] **Step 1: Failing tests** (`transport.test.ts`, `soak.test.ts`; scenes built as `PlantSceneFile` literals and driven through a minimal builder in the test that composes `PartRuntime`s with `createWorld`, since `createPlantCore` is P4):
  1. `'PLT-007 a box pushed off a belt falls'` (an `jam`-free belt ending at x = 2, box carried past the end: its y drops below the floor top within 2 s).
  2. `'PLT-007 items are carried, stopped and blocked by the physics'`: a box on a belt against a static wall stops with `|v| < 0.005` while the belt runs.
  3. `'PLT-008 a five-box stack stays stacked while the pallet travels and while the belt starts and stops'`: palletStack scene (belt 8.0 m, pallet at x -3, five 0.4 x 0.2 x 0.3 m 5 kg boxes in one column), three cycles belt on 2000 ms / off 1000 ms; per box x and z offset from pallet changed at most 0.010 m, tilt at most 1 degree, boxes keep their order in y.
  4. `'PLT-008 an item at rest stays at rest for ten simulated minutes'`: `step(600000)`; position at most 0.001 m, rotation at most 0.1 degree, speed at most 0.001 m/s after the first second (sampled each second).
  5. `'PRT-003 a belt honours its limits'`: a `speedMps` of 1.5 is a located validation problem; a stalled belt (`stall`) carries nothing; reverse moves the box in -x.
  6. `'PRT-003 the emitter emits on the rising edge only and is repeatable with a seed'`; `maxItems` caps it; same seed, same positions.
  7. `'PRT-003 the curved conveyor turns a box through ninety degrees at catalogue speed'` (heading changes by 90 degrees plus or minus 5, box stays on the belt).
  8. `'PRT-009 every item and belt has generated geometry data and no asset path'`: definitions carry `size` only; no string in a definition ends in `.glb`, `.png`, `.webp` or `.jpg`.
- [ ] **Step 2: Run.** `bun test src/plant/core/parts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse `PhysicsWorld.addBelt` for belt, roller and curved (curved passes a per-contact velocity function or a tangent computed from the contact point; add that to `PhysicsWorld` only through a request to P2's owner: if `addBelt` lacks `axisAt(point)`, P3 does **not** edit `world.ts`; it asks the parent to extend P2's interface, and until then curved is built as a ring of straight belt segments of at most 7.5 degrees each, a plan choice that needs no change to P2).
- [ ] **Step 4: Run** tests, `bunx tsc -b`, `bun run lint`. Expected: 8 pass (soak takes about a minute of host time; the gate measured 600 simulated seconds of a rest scene headless in under that on Linux).
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts
git commit -m "feat(plant): box, pallet, belt, roller, curved conveyor, emitter and remover parts"
```
**Risk:** item 6 (visual or physical regressions beyond the asserted ones are not caught), item 4 (ordering); the soak and stack tests are the guard. PHYS.

---

### Task P4: Sensors, stop blade, panel parts, facts, `createPlantCore` (PHYS for sensors and blade)
**Spec:** PLT-001, PLT-006, PLT-010, PLT-011, PLT-012, PLT-014, PRT-003, PRT-006, PRT-008, PRT-001 (subset). **Lane P. Wave 5.**

**Allowed edit surfaces**
```
IDE/src/plant/core/plantCore.ts
IDE/src/plant/core/facts.ts
IDE/src/plant/core/trace.ts
IDE/src/plant/core/parts/sensors.ts
IDE/src/plant/core/parts/flow.ts
IDE/src/plant/core/parts/panel.ts
IDE/src/plant/core/plantCore.test.ts
IDE/src/plant/core/parts/sensors.test.ts
IDE/src/plant/core/hashes.json
```

**Interfaces:** implements `createPlantCore` of C4 exactly. Parts: `sensor-diffuse` and `sensor-retro` (optical; `detect`; config `rangeM` 0.05 to 2, `heightM`; ray cast through `PhysicsWorld.rayHit`; retro-reflective is the same beam with a reflector at the far end, and detects an item that breaks it), `stop-blade` (`extend` command, `extended` and `retracted` sensors, 0.4 s travel; blocks items physically as a kinematic body via `setKinematicPose`), `push-button` (`pressed` sensor, operator-driven through `operate`), `indicator-light` (`lit` command). Fault actions: sensors `stuckOn`, `stuckOff`; blade `stuck` (does not move); belts `stall`, `jam` (P3). Facts per the "Facts" list in Contracts. Trace: per `advance`, append to a rolling buffer the poses (float32 little-endian, creation order), the command bytes and the sensor bytes; `traceHash()` is sha256 hex through `crypto.subtle` (available in Bun and Electron renderer; **Unconfirmed** in the test runner version, fall back to `node:crypto` only in the test).

- [ ] **Step 1: Failing tests:**
  1. `'PLT-001 the core runs a scene in the test runner and returns its snapshot'`.
  2. `'PRT-006 an optical sensor reacts to anything that breaks its beam'`, `'PRT-006 a retro-reflective sensor is blocked by an item and clear without one'`.
  3. `'PRT-003 the stop blade stops a box on a running belt and releases it on retract'` (limit sensors `extended` and `retracted` change at the travel limit, not before).
  4. `'PRT-008 a stuck sensor reports its stuck value whatever the plant does'` for `stuckOn` and `stuckOff`; `'PRT-008 a stuck blade does not move'`; `'PLT-011 a fault action is triggered by name and by a scenario script'` (the script half lands in S1: here `act`).
  5. `'PLT-010 facts count emitted, removed, dropped and collided items and the rising edges of a sensor'`.
  6. `'PLT-012 reset returns the scene to exactly its initial state'`: hash of `snapshot()` after `reset()` equals the first snapshot; `'PLT-012 capture and restore of a running scene'` repeats P2's test through the core, including emitter counters and blade position.
  7. `'PLT-006 the trace hash of the reference script equals the pinned hash'`: scene `palletStack` equivalent, 6000 scans of 10 ms, belt run at scans 100, 1000, 1900 and off at 700, 1600, 2500 (the gate's script). Pinned in `hashes.json` under key `m1-palletStack-v1`; the Linux value is produced by this task on Linux and the file notes `macOS: pending, Windows: pending`. **Do not copy the spike's hash** (`5091d6e0...`): the scene and trace layout differ; compute and pin fresh.
  8. `'PLT-006 three fresh cores give the same hash'`, `'host pacing does not change the trace'` (a seeded random wait of 0 to 5 ms between advances, same hash).
  9. `'PLT-014 the stress scene of 200 dynamic items on 20 conveyors keeps its step'`: build the scene in the test; run 3000 scans of 10 ms; assert `p95(stepMs) < 8 ms` and `realTimeFactor > 1` (plan thresholds, loose on purpose, the gate saw p95 3.10 ms on a loaded host at a 5 ms step; the strict numbers are Q2's evidence). The test is skipped, with the reason printed, when `process.env.CI_SLOW` is set.
  10. `'every signal a part declares exists in sense() or is accepted by apply()'` over the whole catalogue (PRT-002 consistency).
- [ ] **Step 2: Run.** `bun test src/plant/core`. Expected: FAIL.
- [ ] **Step 3: Implement.** `plantCore.ts` calls `registerParts(...)` (P1) for every part definition of P3 and P4 at module load, composes runtimes in `scene.parts` order, per `advance(ms)`: for each plant step apply latched commands, `beforeStep`, `world.step(5)`, `afterStep`, record trace. `apply` with an unknown signal throws `Error('plant: unknown signal "X"; the scene has: ...')`.
- [ ] **Step 4: Run** tests, `bunx tsc -b`, `bun run lint`. Expected: 10 pass.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core
git commit -m "feat(plant): sensors, stop blade, panel parts, facts and the headless plant core"
```
**Risk:** item 3 (the `PlantCore` interface is consumed by R3, S1, V4, F1, F2), item 4 (step ordering), item 1 (the pinned hash is evidence others rely on). PHYS for the sensors and blade; facts, trace and hash code is KEEP.

---

### Task P5: Live 2.0 models behave as the graded ones (D-19)
**Spec:** PLT-013, decision D-19 (option B). **Lane P. Wave 3. KEEP.** Timing is open question 1.

**Allowed edit surfaces**
```
IDE/src/plants/plantEngine.ts
IDE/src/plants/plantEngine.test.ts
IDE/src/plants/plantFacts.ts
IDE/src/plants/plantFacts.test.ts
IDE/src/plants/plantLoop.test.ts
```
**Not** edited: `IDE/src/test-engine/index.ts`, any `scenario.json`, any `scenario.sha256`, any lesson package.

The differences the spec lists (live against graded): motor at speed from 900 against 1000 permille, tank start 500 against 200, conveyor jam only on a fault action against a self-jam (`plantEngine.ts:40`, `:56`, `:74`; `test-engine/index.ts:464`, `:468`, `:520-529`). **Unconfirmed:** the graded motor also steps `+500`/`-1000` per tick against the live `+100`/`-100` (read at `test-engine/index.ts:~507` and `plantEngine.ts:~38`). Step 1 tabulates every difference, line by line, before any change.

- [ ] **Step 1: Table.** Write the full difference table (live arithmetic, graded arithmetic, per plant) into the commit body.
- [ ] **Step 2: Failing tests.** For each plant, `it('PLT-013 the live <plant> step equals the graded one for the same command script')`: drive `createPlantRun(kind)` and a transcription of the graded arithmetic (copied into the test as the oracle, with a comment naming the lines of `test-engine/index.ts`) over a 200-tick script with seeded commands; assert equal sensor sequences. Expected before the change: FAIL on motor, tank, conveyor.
- [ ] **Step 3: Implement** until they pass, changing only `plantEngine.ts` arithmetic and the fault `actions` semantics D-19 requires; keep the `PlantModel` interface (`plantEngine.ts:15-27`) and the four kinds.
- [ ] **Step 4: Verify.** `bun test src/plants src/test-engine src/learn` (every lesson and scenario hash test must pass **unchanged**), `bun run lint`. The `plantEngine.test.ts` assertions that encoded the old live numbers change; each changed assertion is listed in the commit body with the graded line that justifies it.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plants
git commit -m "fix(plants): make the live 2.0 plants behave as the graded models (D-19)"
```
**Risk:** item 3 (live behaviour of ten lessons' plants that learners see), item 6 for any live behaviour no test pins; the equivalence tests are the guard. Independent verifier after the change's own checks.

---

### Task S1: Scenario seam for scenes
**Spec:** PLT-001, PLT-013, PLT-017, SCN-005, LNK-009. **Lane S. Wave 4. KEEP.**

**Allowed edit surfaces**
```
IDE/src/test-engine/index.ts
IDE/src/test-engine/scenePort.ts
IDE/src/test-engine/scenePort.test.ts
IDE/src/test-engine/sceneScenario.test.ts
IDE/src/cli/nativeScenarioRuntime.ts
IDE/src/cli/nativeScenarioRuntime.test.ts
```
**Interfaces:** consumes `ScenarioPlantPort` (C7), `PlantCore`. Produces:
```ts
// scenePort.ts
export interface SceneScenarioBlock { file: string; map: string; script: SceneScriptEvent[] }
export type SceneScriptEvent = { atMs: number; operate: { signal: string; value: boolean | number } } | { atMs: number; emit: { kind: string; at: Vec3 } } | { atMs: number; fault: { part: string; action: string } };
export function compileSceneBlock(input: unknown): SceneScenarioBlock | { problems: string[] };
export function exchangeScan(port: ScenarioPlantPort, readCommand: (point: string) => Promise<boolean | number>, writeSensors: (sensors: Record<string, boolean|number>) => Promise<void>, atMs: number, scanMs: number): Promise<void>;
```
`runScenario(scenario, zplc, runtime)` (`index.ts:441`) gains one optional field on `CompiledScenario`: `scene?: { port: ScenarioPlantPort; script: ... }`. When absent, **no line of the existing path runs differently** (the four models, `index.ts:462-470`, `:520-529`, stay).

- [ ] **Step 1: Read** `compileScenario` (`index.ts:265-440`) and `runScenario` (`:441-624`) and `IDE/src/learn/lessonPackage.ts:440-460` (how `scenario.plant` is validated); write the finished file format of the `"scene"` block into the commit body, adjusting the "Interfaces" section above if the code forces it. Record the adjustment as a note at the end of this task in `plan-m1.md` (the parent reconciles).
- [ ] **Step 2: Failing tests** (`sceneScenario.test.ts` uses a fake `PlantCore` that scripts sensor values, so this task is independent of P4):
  1. `'PLT-013 a 2.0 scenario compiles and hashes exactly as before'`: for every `scenario.json` under `IDE/lessons/*/` that names a plant, compile and compare `scenario.sha256` with the lesson's recorded value (the lesson tests do this; this test asserts the compile output object is deep-equal to a snapshot taken before the change, captured by running the test on the baseline commit first and committing the snapshot in this task: `IDE/src/test-engine/__snapshots__/` or an inline JSON, whichever the suite uses).
  2. `'SCN-005 a scene scenario scripts a panel input, an emission and a fault at virtual times'`: the fake core records `operate`, `addItem`, `act` calls with the `atMs` at which the exchange happened; they happen at the scan whose virtual time equals `atMs`.
  3. `'SCN-005 an expectation reads a plant fact'`: `reads: ["fact:itemsRemoved"]` with kind `EVENTUALLY` passes when the fake core's fact becomes true-ish (`> 0` for numbers; the rule is written in the commit).
  4. `'PLT-017 the exchange is one write of all sensors per scan and one read of all commands'`: count calls on the fake runtime: per scan, `setInput` batch once, `readOutput` batch once.
  5. `'LNK-009 the headless runner needs no hardware or session'`: `nativeScenarioRuntime` with a scene scenario uses only `loadProgram`, `reset`, `scenarioStep`, `peek`, `poke`; assert by passing an adapter that throws on any other method.
  6. `'a scene block with an unknown part action reports a located problem'` (`script[2].fault.action: "melt" is not an action of belt1; it has: stall, jam`).
- [ ] **Step 3: Run** `bun test src/test-engine src/cli`. Expected: FAIL (tests 2 to 6), test 1 passes on the baseline snapshot.
- [ ] **Step 4: Implement.** `exchangeScan` order per scan k: apply script events with `atMs === k * scanMs`; read the command image from the runtime; `core.apply(commands)`; `core.advance(scanMs)`; write the sensor image; `runtime.step(atMs)` for scan k+1 follows (the same order the lock-step session of R3 uses, so graded and live agree: R3 imports `exchangeScan` and may not reimplement it).
- [ ] **Step 5: Run** `bun test src/test-engine src/cli src/learn`, `bun run lint`. Expected: all pass, 2.0 lesson suites unchanged.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/test-engine packages/zplc-ide/src/cli
git commit -m "feat(test-engine): scenario seam for plant scenes, graded 2.0 models untouched"
```
**Risk:** item 3 (the scenario format and `runScenario` are consumed by 68 lessons and the CLI). Independent verifier: the 2.0 hash test is the guard.

---

### Task S2: Scene CI harness and determinism pin
**Spec:** SCN-004, PLT-006, SCN-001 (loader), PLT-017. **Lane S. Wave 6. KEEP (hashes PHYS).**

**Allowed edit surfaces**
```
IDE/src/plant/ci/sceneCheck.ts
IDE/src/plant/ci/sceneCheck.test.ts
IDE/src/plant/ci/liveVersusGraded.test.ts
IDE/scripts/generate-scene-index.ts
IDE/src/generated/sceneIndex.ts
IDE/package.json
```
(`IDE/package.json` only to add one script line `generate:scene-index`; T0 owns the dependency lines, and S2 edits no other part of the file. The parent resolves a merge there. **Unconfirmed:** how `IDE/src/generated/lessonIndex` is produced; run `rg -l "lessonIndex" IDE/scripts IDE/package.json` and mirror it, including whether `generated/` is committed.)

**Interfaces:**
```ts
export interface SceneCheckResult { sceneId: string; solution: 'pass' | 'fail'; starter: 'pass' | 'fail'; traceHash: string; problems: string[] }
export function runSceneCheck(sceneDir: string, runtime: 'native' | 'wasm'): Promise<SceneCheckResult>;
// sceneIndex.ts (generated): export const SCENE_INDEX: readonly { id: string; dir: string; names: { en: string; es: string } }[]
```
`runSceneCheck` compiles `reference.st` and `starter.st` with the compiler package (the same path `lessonCheck.ts` uses; **Unconfirmed** exact API, read `IDE/src/learn/lessonCheck.ts:50-100`), loads the scene and map, and runs `scenario.json` through the S1 seam with a real `PlantCore`.

- [ ] **Step 1: Failing tests.**
  1. `'SCN-004 every shipped scene passes with its reference program and fails with its starter'`: iterates `SCENE_INDEX`; with no scene present yet, asserts the index is non-empty only once F1 lands; until then the test iterates the fixture scene `IDE/src/plant/ci/fixture/` (a one-belt, one-sensor scene authored in this task: 4 files) so the harness is tested on its own. Name the fixture in the commit.
  2. `'PLT-017 one scene and script give the same trace live and graded'`: run the fixture graded (S1 seam, `scenarioStep` virtual clock) and live (R3 `createPlantSession` over the native runtime with `paceMs: async () => {}`); equal `traceHash`. Skipped with a printed reason when the native runtime binary is absent (`ZPLC_NATIVE_SIM_BIN` unset and `firmware/lib/zplc_core/build/zplc_runtime` missing), as the lesson tests do; the CI job builds it (`bun run build:runtime`). This test needs R3: until R3 is merged it is `it.todo`.
  3. `'PLT-006 the trace hash of every shipped scene equals the pinned hash'` reading `IDE/src/plant/ci/sceneHashes.json` (`linux`, `darwin`, `win32` keys left `null` until the owner records them; `null` means "compare against `linux`", and a mismatch on macOS or Windows is then a finding for the owner, not a silent pass).
- [ ] **Step 2: Implement** the generator, the harness and the fixture. `bun run generate:scene-index` must be idempotent; `bun scripts/generate-scene-index.ts --check` fails on drift (wire into `lint` only if the lessons' generator is wired the same way).
- [ ] **Step 3: Run** `bun test src/plant/ci`, `bun run lint`, `bunx tsc -b`.
- [ ] **Step 4: Commit.**
```bash
git add packages/zplc-ide/src/plant/ci packages/zplc-ide/scripts/generate-scene-index.ts packages/zplc-ide/src/generated packages/zplc-ide/package.json
git commit -m "test(plant): scene CI harness, scene index and the pinned determinism hash"
```
**Risk:** item 5 (CI behaviour on three systems, `package.json` script line), item 1 (pinned hashes).
**Note on CI:** plan `research.md` 8.1 reports that macOS and Windows IDE tests run only in `nightly-quality.yml:106-192` (**Reported**, not re-read). All plant tests live under `IDE/src/plant` and run in that job with no workflow edit; if the executor finds otherwise it asks the parent, because a workflow edit is item 5.

---

### Task R1: C, virtual-clock request and clock-neutral held scan
**Spec:** PLT-005, LNK-004, LNK-015 (no scan delay). **Lane R. Start rule 3. KEEP. Needs an independent review before merge (spec PLT risks).**

**Allowed edit surfaces**
```
firmware/apps/posix_host/src/native_runtime_session.c
firmware/apps/posix_host/src/native_runtime_session.h
firmware/lib/zplc_core/tests/test_native_runtime_session.c
```
Nothing else. `tools/wasm-core/shim/embed.c` is **not** edited: the new request goes through the same session handler (`native_runtime_session.c:2217` dispatches `scenario.step`; the WASM build embeds this file). If the WASM build needs a new export, stop and ask the parent.

**Interfaces (fixed):**
- Request `simulation.clock.set`, params `{"mode":"virtual"}` or `{"mode":"free"}`. Parser next to `parse_scenario_step_params` (`:835`), dispatch next to `:1023` and `:2217`. Allowed only when `session->state == ZPLC_NATIVE_SESSION_IDLE` (not running, not paused mid-scan, not faulted); otherwise error `INVALID_STATE` with a located message ("clock mode can only change while the runtime is stopped"). `virtual` sets `scenario_clock_enabled = 1` and resets the scenario clock (`session_reset_scenario_clock`, `:235`); `free` sets it to 0 and resets likewise. It reuses the existing flag (`:82`), so no new state: `start`, `resume` and `execution.step` keep refusing with "scenario session only accepts scenario.step" (`:1618`, `:1660`, `:1752`) in virtual mode, which is the contract R3 relies on. Result: the normal status result (`format_status_result`) plus `"clock_mode":"virtual"|"free"` and `"scan_interval_ms":<uint>` (`session->scan_interval_ms`, 0 when no program).
- Held scan. Today `handle_scenario_step` stores `scenario_last_timestamp_ms = request->at_ms` and `last_scan_tick_ms = request->at_ms` after a step that a breakpoint interrupted (`:1870-1873`), while `session_complete_scan` leaves the scan in flight and uncounted (`:553-568`). The gate measured the consequence: with a breakpoint holding step 520, `beltOff - eyeOn` was 49 scans instead of 50 (`gate/check-4-graded.json`, `timerSkewScans = -1`): the runtime clock moved one interval for timers while no scan completed. **Required behaviour:** a held scan is clock-neutral: after any sequence of held steps, the virtual timestamp at which scan n completes is the same as in a run with no hold, and the next `scenario.step` after a hold is accepted at the timestamp the program's clock expects. **Design choice (Unconfirmed, the executor decides after reading `:530-570`, `:1801-1880` and the tick-override use `zplc_hal_posix_set_tick_override`):** either (a) a step that ends held does not advance `scenario_last_timestamp_ms` and the continuation step must repeat the held `at_ms`, or (b) it advances and the clock the program sees is rebased when the scan completes. Choose the one that leaves every existing scenario caller (`runScenario`, the CLI, the conformance suite) unchanged, because none of them reaches a held scan; record the choice and why in the commit body. The status result of a held step must let a caller tell it was held (the spike used "`cycles` unchanged"; a `"scan_held":true` field is welcome and optional).

- [ ] **Step 1: Failing tests** in `test_native_runtime_session.c`, following the existing tests that call `zplc_native_runtime_session_set_scenario_clock_enabled` (`:937`, `:3303`, `:4251`):
  1. `test_clock_set_virtual_then_scenario_step` : a fresh session with the flag **off** answers `scenario.step` with `INVALID_STATE` (existing message, `:1810`); after `simulation.clock.set virtual` the same step succeeds, `start` is refused with "scenario session only accepts scenario.step", and the result carries `"clock_mode":"virtual"` and the program's `scan_interval_ms`.
  2. `test_clock_set_refused_while_running` : after `execution.start` the request answers `INVALID_STATE`; after `execution.stop` it succeeds; `free` restores `start`.
  3. `test_clock_set_rejects_bad_params` : missing `mode`, `"mode":"real"`, extra key: `INVALID_REQUEST`, state unchanged.
  4. `test_held_scan_is_clock_neutral` : a program with a 500 ms on-delay timer and a breakpoint inside the scan; run 30 steps unheld and note the scan number at which the output rises (call it N); reset, add the breakpoint, run until it holds, call step again twice while held (none completes), `breakpoint.remove`, finish; the output must rise at completed scan N, not N-1.
  5. `test_virtual_mode_matches_env_flag_mode` : the same step script under `simulation.clock.set` and under `set_scenario_clock_enabled(&session, 1)` gives byte-identical status results (the new path adds no behaviour of its own).
  6. Every existing test of the file still passes unchanged.
- [ ] **Step 2: Build and run (expected FAIL).** At the root:
  `cmake -S firmware/lib/zplc_core -B build/core-sanitized -DCMAKE_BUILD_TYPE=Debug "-DCMAKE_C_FLAGS=-fsanitize=address,undefined,float-cast-overflow -fno-sanitize-recover=undefined,float-cast-overflow -fno-omit-frame-pointer" && cmake --build build/core-sanitized --target test_native_runtime_session --parallel && ASAN_OPTIONS=detect_leaks=1 UBSAN_OPTIONS=halt_on_error=1 ctest --test-dir build/core-sanitized -R native_runtime_session --output-on-failure`
  (the `-R` pattern is **Unconfirmed**; `ctest --test-dir build/core-sanitized -N` lists the names). Expected: the new tests fail, the old ones pass.
- [ ] **Step 3: Implement** in C99, no allocation, bounded buffers (the parser takes a fixed-size mode token, rejects anything longer than 7 characters), every error path returns `format_error_response`.
- [ ] **Step 4: Run** the command of Step 2 (expected all pass), then `bun run lint:c`, then `CLANG_FORMAT=<clang-format 23.1.3> bun run format:check`, then the whole `bun run test:core` (all of `ctest`). Expected: all green.
- [ ] **Step 5: Independent review (mandatory before merge).** The parent launches a reviewer who did not write R1, with this brief: the diff, the contract above, and "find a way for `simulation.clock.set` or the held-scan change to (1) corrupt a running scan, (2) let a renderer-reachable request change the clock of a session that is running a program, (3) change the behaviour of an existing scenario caller, (4) overflow a buffer or leave state inconsistent after a rejected request". The reviewer writes the probes as extra `test_*` functions. Blockers get one correction batch, then one recheck.
- [ ] **Step 6: Commit.**
```bash
git add firmware/apps/posix_host/src firmware/lib/zplc_core/tests/test_native_runtime_session.c
git commit -m "feat(posix-host): switch a session to the virtual clock by request and keep a held scan clock-neutral"
```
**Risk:** item 4 (scan clock and ordering in the scheduler path), item 3 (a request others will consume), item 2 (a new request reachable from the renderer once R2 lands). Independent verifier required.

---

### Task R2: Allow-list and adapters
**Spec:** PLT-005, LNK-004, LNK-005, VIS-012. **Lane R. Wave 3. KEEP.**

**Allowed edit surfaces**
```
IDE/electron/security.ts
IDE/electron/security.test.ts
IDE/src/runtime/nativeAdapter.ts
IDE/src/runtime/wasmAdapter.ts
IDE/src/runtime/nativeAdapter.test.ts
IDE/src/runtime/wasmAdapter.test.ts
```
Check first whether `IDE/electron/ipcContract.ts` or `preload.ts` also enumerate native methods (**Unconfirmed**: `rg -n "execution.step" IDE/electron IDE/shared`). If they do, they are added to this task's surface by the parent before the task starts; this task does not widen its own surface.

**Interfaces:** `NATIVE_SIMULATION_METHODS` (`security.ts:7-27`) gains `'simulation.clock.set'` and `'scenario.step'`. `isAllowedNativeSimulationParams` (`:215-`) gains: `simulation.clock.set` accepts `hasExactKeys(params, ['mode']) && (params.mode === 'virtual' || params.mode === 'free')`; `scenario.step` accepts `hasExactKeys(params, ['at_ms']) && Number.isInteger(params.at_ms) && params.at_ms >= 0 && params.at_ms <= 0xffffffff`. `NativeAdapter` gains `setClockMode(mode): Promise<{ scanIntervalMs: number }>` (sends `simulation.clock.set`, validates the reply shape, publishes the snapshot as `scenarioStep` does at `nativeAdapter.ts:552-562`); `WASMAdapter` inherits it (it extends `NativeAdapter`, `wasmAdapter.ts:36`); its `scenarioClock` option stays as it is.

- [ ] **Step 1: Failing tests.**
  1. `security.test.ts`: `'VIS-012 the renderer may send simulation.clock.set with mode virtual or free and nothing else'`: accepted `{mode:'virtual'}`, `{mode:'free'}`; rejected `{mode:'x'}`, `{}`, `{mode:'virtual', extra:1}`, `{mode: 1}`.
  2. `'VIS-012 the renderer may send scenario.step with an integer at_ms in uint32 range'`: rejected `-1`, `1.5`, `4294967296`, `'5'`, extra keys.
  3. `'VIS-012 no other method was added'`: the set of allowed methods equals the 2.0 list plus exactly these two (snapshot the 2.0 list in the test).
  4. `'the content security policy is unchanged'`: `createContentSecurityPolicy(...)` string equals the 2.0 string (take it from the baseline commit and inline it); the existing CSP test also runs unchanged.
  5. `nativeAdapter.test.ts`: `'LNK-004 setClockMode sends simulation.clock.set and returns the scan interval'` with a fake transport; `'a malformed reply is an error'`.
  6. `wasmAdapter.test.ts`: `'LNK-005 the WASM adapter switches to the virtual clock through the same request'` against the real WASM module when the existing parity tests can load it (follow `wasmParity.test.ts`), else skipped with the reason printed.
  7. `'nativeSimulationEnvironment still removes ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK'`: the existing test of `shared/nativeSimulationEnvironment.ts:23` is run and cited, not edited.
- [ ] **Step 2: Run** `bun test electron src/runtime`. Expected: FAIL for 1, 2, 3, 5, 6.
- [ ] **Step 3: Implement.** Smallest change; no refactor of the validators.
- [ ] **Step 4: Verify.** `bun test electron src/runtime shared`, `bun run lint`. With R1 built (`bun run build:runtime` at the root): one integration test `'LNK-004 a Studio-path session switches to the virtual clock and steps'` against `ZPLC_NATIVE_SIM_BIN`, skipped with the reason when the binary is absent.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/electron packages/zplc-ide/src/runtime
git commit -m "feat(electron): allow the virtual-clock request and scenario step from the renderer, exactly shaped"
```
**Risk:** item 2 (the renderer-to-runtime allow-list), item 3. Independent verifier on the allow-list only: reads the diff, tries to send variants.

---

### Task R3: Lock-step session
**Spec:** PLT-004, PLT-005, PLT-016, PLT-017, LNK-003, LNK-004, LNK-005, LNK-006. **Lane R. Wave 6. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/session/plantSession.ts
IDE/src/plant/session/pacing.ts
IDE/src/plant/session/exchange.ts
IDE/src/plant/session/plantSession.test.ts
IDE/src/plant/session/plantSessionNative.test.ts
```
**Interfaces:** implements `createPlantSession` (C6). Uses `exchangeScan` from S1 (import, no copy) and `PlantRuntimePort` (C5).

Behaviour: `start()` calls `setClockMode('virtual')`, reads `scanIntervalMs`, refuses with a located message if it is not a positive multiple of 5 ("plant: the scan interval of 7 ms is not a multiple of the plant step of 5 ms; set the task interval to a multiple of 5 ms", PLT-004), then loops: per scan, `exchangeScan`, `scenarioStep((k)*scanMs)`, read `getInfo().cycles`: if unchanged the scan was **held** (state `held`, the plant does not advance, `heldSteps++`), else the plant follows the **completed scan** (never timestamps; verified in the gate). `pace` waits `scanMs / speed` of wall time between scans (default `setTimeout`); `slowdown`: if the mean exchange plus advance time of the last 20 scans exceeds `0.9 * scanMs`, set `slowdown = scanMs / meanCost` clamped to [0.1, 1], and emit `{ kind: 'slowdown', factor, message }` once per change (PLT-016: slow plant and program together, say so, never drop a step; since the loop is lock-step, slowing is just longer pacing). `pause()` stops issuing steps; `step()` issues exactly one; `stop()` calls `setClockMode('free')` after the runtime is idle; a rejected `scenarioStep` sets `faulted` and stops the plant at the last completed scan with the runtime's message.

Exchange: sensors of one plant step written with **one** `pokeN` per scan over the contiguous input image range (at most 64 bytes, atomic with respect to the scan: LNK-003), commands read with **one** `peek` of the contiguous output image range. The address ranges come from `resolvePlantMap(...)` and the program's I/O map (`IDE/src/runtime/ioMap.ts`); BOOL only in M1, one bit per signal.

- [ ] **Step 1: Failing tests** (`plantSession.test.ts` over a fake runtime that simulates scans, a fake `PlantCore`; `plantSessionNative.test.ts` over the real `zplc_runtime` with the gate program idea, written fresh: Start pulse, belt run, eye, 500 ms timer):
  1. `'PLT-005 N ms of scans is N ms of plant'`: after 100 scans of 10 ms, `core` advanced 1000 ms total.
  2. `'PLT-005 pause freezes both and step advances both by one scan'`: cycles 100 and plant 1000 ms while paused; 101 and 1010 after one `step()`.
  3. `'PLT-005 a runtime failure stops the plant at the last completed scan'`: reject the 51st `scenarioStep`; state `faulted`, plant at 500 ms, reason is the runtime's message.
  4. `'PLT-005 a breakpoint holds the plant and a held scan costs no clock'` (native test, needs R1): hold at step 520 of the gate-style script; `heldSteps >= 1`, plant frozen at the completed scans x 10 ms, and after removing the breakpoint the timer interval measured in completed scans is 50, not 49.
  5. `'PLT-017 host pacing does not change the trace'`: a seeded 0 to 5 ms pause after every step gives the same `traceHash`.
  6. `'PLT-017 live equals graded'`: the S2 test of that name becomes a real test here too (S2 owns the file; R3's copy uses its own fixture script of the gate: `startPulse`, beltRun, eye). Expected equal hash.
  7. `'LNK-003 the exchange is one memory.write and one memory.read per scan'`.
  8. `'LNK-006 a forced input keeps its forced value over the plant'`: `force.set` on an input byte through the real session, plant drives the other value, the program sees the forced one.
  9. `'PLT-016 a plant that cannot keep up slows both and says so, dropping no step'`: fake `advance` costing 2x the scan: `slowdown` about 0.5, one `slowdown` event, `core` advanced exactly once per completed scan.
  10. `'PLT-004 a scan interval that is not a multiple of 5 ms is refused with a located message'`.
  11. `'LNK-005 the same session runs over the WASM adapter'`, skipped with reason when the module cannot load; any difference found is written as a **declared capability gap** string exported as `PLANT_WASM_GAPS` (an empty array is a valid and good answer).
- [ ] **Step 2: Run** `bun test src/plant/session`. Expected: FAIL. **Step 3: Implement. Step 4: Run** the suite, `bun run lint`, `bunx tsc -b`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/session
git commit -m "feat(plant): lock-step session on the virtual clock with pause, step, hold and slowdown"
```
**Risk:** item 4 (ordering between the plant, the exchange and the scan), item 3 (the session is consumed by the panel and by M6).

---

### Task V1: three.js renderer core
**Spec:** VIS-002, VIS-004, VIS-005, VIS-006, PRT-009. **Lane V. Wave 3. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/view/renderer.ts
IDE/src/plant/view/camera.ts
IDE/src/plant/view/quality.ts
IDE/src/plant/view/geometry.ts
IDE/src/plant/view/renderer.test.ts
IDE/src/plant/view/camera.test.ts
IDE/src/plant/view/quality.test.ts
```
**Interfaces:**
```ts
export interface PlantRenderer {
  readonly webgl2: boolean;
  setSnapshot(snapshot: PlantSnapshot): void; // draws; never mutates the snapshot
  setQuality(level: 'low' | 'medium' | 'high'): void;
  setCameraPreset(name: string): void; // from scene.cameras
  orbit(dxDeg: number, dyDeg: number): void; pan(dx: number, dz: number): void; zoom(factor: number): void;
  onContext(listener: (event: 'lost' | 'restored' | 'unavailable') => void): () => void;
  fps(): { current: number; p5: number };
  resize(width: number, height: number): void;
  dispose(): void;
}
export function createRenderer(canvas: HTMLCanvasElement, scene: PlantSceneFile, options?: { quality?: 'low'|'medium'|'high' }): PlantRenderer | { unavailable: string };
export function chooseInitialQuality(probe: { webgl2: boolean; rendererString: string; maxTextureSize: number }): 'low' | 'medium' | 'high';
// geometry.ts: pure functions from a PartView or BodyPose to three BufferGeometry parameters (box, pallet, belt, roller, curve, blade, sensor)
```
Plan choices: `low` = no shadows, no antialiasing, pixel ratio 1; `medium` = antialiasing; `high` = shadows plus antialiasing. Automatic choice: integrated GPU strings (`/Radeon.*Graphics|Intel|UHD|Iris|Apple M|llvmpipe|SwiftShader/i`) start at `low`; unknown starts at `medium`; no WebGL 2 returns `{ unavailable }`. The lowest level must meet VIS-004 on integrated graphics: evidence is Q2's, not this task's. Camera and quality logic is pure and unit-tested; three itself loads lazily (`await import('three')` in `createRenderer`'s async sibling `loadRenderer`, so tests of the pure functions do not need a GPU).

- [ ] **Step 1: Failing tests.**
  1. `camera.test.ts` `'VIS-002 orbit, pan and zoom are bounded and keyboard-equivalent'`: arrow keys map to orbit, `+`/`-` to zoom, `W A S D` to pan; polar angle clamped to [5, 85] degrees; zoom clamped; the mapping function `cameraKeyAction(key, shift)` is pure.
  2. `'VIS-002 a scene preset moves the camera to its named position'`.
  3. `quality.test.ts` `'VIS-005 first-run quality is low on integrated graphics and never above medium on an unknown GPU'`, `'VIS-005 three levels exist and differ in shadows and antialiasing'`.
  4. `renderer.test.ts` `'VIS-006 no WebGL 2 reports unavailable with a message, not an exception'` (a fake canvas whose `getContext('webgl2')` returns null); `'VIS-006 a lost context emits lost and a restored one emits restored'` (fake `webglcontextlost` event with `preventDefault` called, so restoration can happen).
  5. `'PRT-009 geometry is generated: every shape function is pure and returns sizes from the snapshot'`.
- [ ] **Step 2: Run** `bun test src/plant/view`. Expected: FAIL. **Step 3: Implement. Step 4: Run** the suite, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/view
git commit -m "feat(plant-view): three.js renderer core with cameras, quality levels and context-loss events"
```
**Risk:** item 6 (rendering correctness has no pixel test; Q2's journeys and manual check cover the gap, stated in the commit body).

---

### Task V2: State cues and display modes
**Spec:** VIS-003, VIS-009. **Lane V. Wave 4. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/view/cues.ts
IDE/src/plant/view/displayModes.ts
IDE/src/plant/view/cues.test.ts
IDE/src/plant/view/displayModes.test.ts
```
**Interfaces:**
```ts
export type DisplayMode = 'light' | 'dark' | 'high-contrast';
export interface DisplayPrefs { mode: DisplayMode; reducedMotion: boolean }
export function cuesFor(view: PartView): { beam?: { from: Vec3; to: Vec3; detecting: boolean }; label: string; stateWord: string; marker: 'solid' | 'dashed' | 'dotted' | 'outline' }; // a cue other than colour for every state
export function paletteFor(prefs: DisplayPrefs): { floor: number; belt: number; item: number; sensorOn: number; sensorOff: number; outline: number | null };
export function applyDisplayPrefs(renderer: PlantRenderer, prefs: DisplayPrefs): void;
```
The signal vocabulary is UX-009's: **Unconfirmed** where it lives; find it (`rg -n "UX-009" IDE specs/011-zplc-2-0-remediation/spec.md | head`) and use its exact words for `stateWord`.

- [ ] **Step 1: Failing tests:** `'VIS-003 a detecting sensor shows its beam, a stateWord and a marker that differ from a clear one without relying on colour'` (assert marker and stateWord differ while palettes may be equal), `'VIS-003 the signal name of a part is its label'`, `'VIS-009 high contrast outlines sensors, actuators and items'` (`outline !== null` in high contrast only), `'VIS-009 reduced motion turns off camera animation'` (`applyDisplayPrefs` sets `renderer.setCameraAnimation(false)`; V1 exposes it as part of `setCameraPreset` behaviour: if V1's interface lacks `setCameraAnimation`, this task asks the parent to extend V1's file, it does not edit `renderer.ts`; fallback: the prefs object is passed into `createRenderer` options by V4), `'VIS-009 light, dark and high-contrast palettes meet a 4.5:1 contrast ratio for sensor on against sensor off and item against floor'` (contrast function in the test).
- [ ] **Step 2: Run, implement, run.** `bun test src/plant/view`, `bun run lint`.
- [ ] **Step 3: Commit.**
```bash
git add packages/zplc-ide/src/plant/view/cues.ts packages/zplc-ide/src/plant/view/displayModes.ts packages/zplc-ide/src/plant/view/cues.test.ts packages/zplc-ide/src/plant/view/displayModes.test.ts
git commit -m "feat(plant-view): sensor and actuator cues and the display modes of the 3D panel"
```
**Risk:** item 6 (visual quality unchecked beyond contrast arithmetic).

---

### Task V3: Schematic and text equivalent
**Spec:** VIS-007, VIS-008. **Lane V. Wave 4. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/schematic/schematic.ts
IDE/src/plant/schematic/schematic.test.ts
IDE/src/plant/text/describe.ts
IDE/src/plant/text/describe.test.ts
IDE/src/i18n/catalog/plantView.ts
```
(T0 pre-registers the `plantView` and `plantEditor` catalogues only. V2, V3 and V4 add keys to the same `plantView.ts`, so the parent serialises the three on that one file or each task owns a key prefix: V3 `plant.text.*`, V4 `plant.panel.*`, V2 `plant.cue.*`, and merges by appending.)

**Interfaces:**
```ts
export function schematicFor(scene: PlantSceneFile, catalogue: Catalogue): SchematicModel; // generated; no per-scene drawing
export interface SchematicModel { width: number; height: number; shapes: readonly SchematicShape[]; labels: readonly { x: number; y: number; text: string }[] } // top-down projection, metres to px
export function describePlant(snapshot: PlantSnapshot, scene: PlantSceneFile, locale: 'en' | 'es'): { text: string; key: string }; // `key` changes only when the situation changes, for announce()
```
The 2.0 convention: `plantFacts(kind, state)` returns `{ key, params }` and `PlantLivePanel` announces only when `key` changes (`PlantLivePanel.tsx` `refresh`, using `announce` from `IDE/src/utils/announce`). V3 follows that, not every scan.

- [ ] **Step 1: Failing tests:** `'VIS-007 every catalogue part draws in the schematic and no scene has a hand-made drawing'` (iterate the catalogue; the module imports no scene id), `'VIS-007 the schematic of the same scene is byte-identical on repeated generation'`, `'VIS-008 the text names counts and positions in English and Spanish with the same structure'` (same key set, same placeholder set), `'VIS-008 the key changes when an item arrives and not on every scan'` (200 snapshots in which only positions change give one key).
- [ ] **Step 2: Run, implement, run.** `bun test src/plant/schematic src/plant/text`, `bun run lint` (the i18n guard checks the keys).
- [ ] **Step 3: Commit.**
```bash
git add packages/zplc-ide/src/plant/schematic packages/zplc-ide/src/plant/text packages/zplc-ide/src/i18n/catalog/plantView.ts
git commit -m "feat(plant-view): generated schematic and a live text equivalent of the plant facts"
```
**Risk:** item 6 (translations' quality is not machine-checked beyond structure).

---

### Task V4: Panel integration, operation and fallbacks
**Spec:** VIS-001, VIS-006, VIS-010, VIS-011, PLT-016 (message). **Lane V. Wave 6. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/ui/PlantPanel.tsx
IDE/src/plant/ui/PlantCanvas.tsx
IDE/src/plant/ui/OperatePanel.tsx
IDE/src/plant/ui/usePlantSession.ts
IDE/src/plant/ui/loadPlantEngine.ts
IDE/src/plant/ui/PlantPanel.test.tsx
IDE/src/components/LabPanel.tsx
IDE/src/i18n/catalog/plantView.ts
```
**Interfaces:** `PlantPanel` replaces the T0 stub: `export function PlantPanel(props: { controller: DebugController | undefined }): JSX.Element`. `LabPanel.tsx` (`:221`, `const live = <PlantLivePanel controller={controller} />`) shows `PlantPanel` when a scene is chosen and keeps `PlantLivePanel` for the four 2.0 plants and for lessons; the 2.0 panel is **not** modified. `PlantPanel` loads three, Jolt, the core and the renderer through `loadPlantEngine()` (one dynamic import, so the 4.1 MB chunk stays lazy; the T0 chunk test now has its real subject) and owns its transport (Run, Pause, Step, Reset), like the 2.0 live panel does with `Pause, Play, RotateCcw, SkipForward` (`PlantLivePanel.tsx:6`). The global Run is not wired to the plant (open question 4): when a scene session is active and the person presses the global Run, the existing refusal "scenario session only accepts scenario.step" must surface as a located, translated message ("Use the plant panel's Run"), added to the catalogue.

Behaviour: scene chooser (shipped scenes from `SCENE_INDEX`, once S2 lands; before that a prop), a "Maximise" control; an operate region listing the scene's panel parts (push button: press and hold by pointer, Space or Enter by keyboard; indicator light shown), fault-action menu per part, "Add item"/"Remove item" where the scene's emitter allows it (`addItem` returns an id; keyboard path: choose the part from a list, press Enter); the fallback banner: when the renderer reports `unavailable`, `lost` without `restored` within 3 s, or `fps().p5 < 30` for 5 s, show a translated message naming the reason and a button that switches to the schematic (V3) while the session, the core and grading keep running (VIS-006); the live text region (V3) with `announce`.

- [ ] **Step 1: Failing tests** (`PlantPanel.test.tsx`, React Testing Library as the 2.0 `PlantView.test.tsx` does; the renderer and the session are fakes through props so no GPU is needed):
  1. `'VIS-001 the panel shows the 3D canvas where the live plant was and offers Maximise'`.
  2. `'VIS-006 with no WebGL 2 the panel says so and offers the schematic, and the session keeps running'` (fake session keeps emitting `scan` events; assert the text updates).
  3. `'VIS-006 a lost context offers the schematic after 3 seconds without restoration'` (fake timers).
  4. `'VIS-010 the push button works by pointer and by keyboard'` (`operate` called with true on down and false on up; Space and Enter on key down and up).
  5. `'VIS-010 a fault action is triggered from the menu by keyboard'`.
  6. `'VIS-010 add item is refused with a located message when the scene has no emitter that allows it'`.
  7. `'VIS-011 every visible string comes from the catalogue in English and Spanish'` (render in both locales, no raw key shown; `bun run lint`'s i18n guard).
  8. `'PLT-016 the slowdown message is shown and announced once per change'`.
  9. `'the panel subscribes to no whole store'` is enforced by `bun run lint`; the panel selects the fields it shows.
- [ ] **Step 2: Run** `bun test src/plant/ui src/components`. Expected: FAIL. **Step 3: Implement. Step 4: Run** the suites; then `bun run build` and `bun test scripts/welcomeBundle.test.ts` (the T0 chunk tests now exercise the real import; if they were recorded pending in T0, this task completes them). Also `bun test` (the whole IDE suite) once: the 2.0 `LabPanel` and `PlantLivePanel` tests must pass unchanged.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/ui packages/zplc-ide/src/components/LabPanel.tsx packages/zplc-ide/src/i18n/catalog/plantView.ts
git commit -m "feat(plant-ui): 3D panel with operation, fallbacks and keyboard paths in Lab"
```
**Risk:** item 3 (`LabPanel` is the 2.0 entry for the live plant; the change is one conditional), item 6 for pixels.

---

### Task E1: Editor model
**Spec:** SCN-008, SCN-009, SCN-010, SCN-011, SCN-015, SCN-016, PRT-007. **Lane E. Wave 3. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/editor/model.ts
IDE/src/plant/editor/commands.ts
IDE/src/plant/editor/validate.ts
IDE/src/plant/editor/templates.ts
IDE/src/plant/editor/editor.test.ts
```
**Interfaces:**
```ts
export interface EditorState { scene: PlantSceneFile; selection: string | null; problems: ProblemAt[]; past: number; future: number; running: boolean }
export interface ProblemAt { partId: string | null; path: string; message: string } // shown at the part that causes it (SCN-015)
export interface SceneEditor {
  state(): EditorState;
  place(partId: string, catalogueId: string, at: Vec3, rotationYDeg?: number): string | { problem: string }; // snaps to grid and to snap points
  move(id: string, to: Vec3): void; rotate(id: string, deg: number): void; duplicate(id: string): string; remove(id: string): void;
  configure(id: string, patch: { name?: string; config?: Record<string, number | string | boolean> }): ProblemAt[];
  signals(): PlantSignalDef[]; // SCN-011, from sceneSignals (P1)
  undo(): void; redo(): void;
  setRunning(running: boolean): void; // while true every edit throws Error('the scene can only be edited while the plant is stopped')
  load(scene: PlantSceneFile): void; toFile(): PlantSceneFile;
}
export function createSceneEditor(catalogue: Catalogue, scene?: PlantSceneFile): SceneEditor;
export const TEMPLATES: readonly { id: 'empty-floor' | string; names: { en: string; es: string }; scene: PlantSceneFile }[]; // empty floor first; reference scenes added by F tasks through the scene index, not here
export const GRID_M = 0.25; // plan choice
```
Snapping: positions round to `GRID_M`; a `place` near a snap point of another part (`PartDefinition.snapPoints`) within 0.15 m attaches to it and sets the rotation to the point's `normalYDeg`.

- [ ] **Step 1: Failing tests:** `'SCN-008 place, move, rotate, duplicate and delete snap to the grid and to snap points'`, `'SCN-008 a running plant refuses every edit with a located message'`, `'SCN-009 configure rejects a value outside the documented range with its path'`, `'SCN-010 every edit has an undo and a redo, and 50 edits undo back to the first state byte-identically'`, `'SCN-010 an edit after an undo discards the redo branch'`, `'SCN-011 the signal list grows and shrinks with the parts, with type and direction'`, `'SCN-015 a duplicate name is reported at the part that causes it, as the edit is made'`, `'SCN-016 the empty floor template is a valid scene with no parts'`, `'PRT-007 a conveyor placed near a conveyor end connects without manual alignment'`.
- [ ] **Step 2: Run** `bun test src/plant/editor`. Expected: FAIL. **Step 3: Implement** (commands as inverse pairs; no global state). **Step 4: Run, lint.**
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/editor
git commit -m "feat(plant-editor): scene editor model with snapping, validation and undo"
```
**Risk:** item 6 (undo correctness has the 50-edit test only).

---

### Task E2: Plant-map editor and declaration generator
**Spec:** SCN-012, SCN-013, LNK-001, LNK-002. **Lane E. Wave 4. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/editor/mapEditor.ts
IDE/src/plant/editor/declarations.ts
IDE/src/plant/editor/mapEditor.test.ts
```
**Interfaces:**
```ts
export interface MapEditor {
  map(): PlantMapV2; bind(signal: string, point: string): ProblemAt | null; unbind(signal: string): void;
  check(ioMap: IoMap): ProblemAt[]; // unbound command or sensor signals, type mismatches: located
  load(map: PlantMap): void; // v1 or v2 through normalizePlantMap
}
export function createMapEditor(signals: readonly PlantSignalDef[], scene: string): MapEditor;
export function generateDeclarations(signals: readonly PlantSignalDef[], language: 'st'): string; // VAR_INPUT/VAR_OUTPUT text with AT addresses left for the user? plan choice: names only, typed, no addresses
```
Uses `resolvePlantMap` and `normalizePlantMap` of precondition A; never guesses by variable name (LNK-002). `IoMap` is `IDE/src/runtime/ioMap.ts`.

- [ ] **Step 1: Failing tests:** `'SCN-012 binding a BOOL signal to an INT point is a located mismatch'`, `'SCN-012 an unbound signal is reported at the signal'`, `'LNK-002 no signal is bound by guessing a name'` (two similar variable names, nothing bound until `bind`), `'LNK-001 a 2.0 map (schema 1) loads and keeps loading'` (use the lesson maps of `IDE/lessons/*/plant-map.json`, as `lessonPlantMaps.test.ts` does), `'SCN-013 the generated declarations compile'` (compile the ST text with the compiler package inside a tiny program and expect no diagnostics), `'SCN-013 a REAL signal declares REAL, an INT signal INT'`.
- [ ] **Step 2: Run, implement, run.** `bun test src/plant/editor src/plants`, `bun run lint`.
- [ ] **Step 3: Commit.**
```bash
git add packages/zplc-ide/src/plant/editor/mapEditor.ts packages/zplc-ide/src/plant/editor/declarations.ts packages/zplc-ide/src/plant/editor/mapEditor.test.ts
git commit -m "feat(plant-editor): plant-map editor with type check and generated declarations"
```
**Risk:** item 1 (the map is a persisted format; it only reads schema 1 and writes schema 2).

---

### Task E3: Editor panel, the pointer-free path
**Spec:** SCN-014, SCN-009, SCN-011, SCN-012, SCN-015, VIS-011. **Lane E. Wave 7. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/editor/EditorPanel.tsx
IDE/src/plant/editor/PartList.tsx
IDE/src/plant/editor/PartForm.tsx
IDE/src/plant/editor/SignalTable.tsx
IDE/src/plant/editor/EditorPanel.test.tsx
IDE/src/i18n/catalog/plantEditor.ts
```
**Interfaces:** replaces the T0 stub `EditorPanel`; `export function EditorPanel(props: { editor: SceneEditor; mapEditor: MapEditor; stopped: boolean }): JSX.Element`. `PlantPanel` (V4) already mounts it lazily through `React.lazy`. A path that needs no pointer: a catalogue list (add a part), numeric fields for x, z, rotation (position it), a signal table with a bind control per signal (bind its signals), problems listed at the part. Everything through the Studio kit.

- [ ] **Step 1: Failing tests:** `'SCN-014 a small scene is built from the empty floor by keyboard alone'` (Tab, type, Enter: add a belt and a sensor, set numeric positions, bind both signals to two points, no pointer event fired); `'SCN-015 a problem is shown at the part that causes it and the part is focusable from the list'`; `'SCN-011 the signal table lists type and direction'`; `'SCN-008 the form is disabled with a message while the plant runs'`; `'VIS-011 English and Spanish render with no missing key'`.
- [ ] **Step 2: Run, implement, run.** `bun test src/plant/editor`, `bun run lint`.
- [ ] **Step 3: Commit.**
```bash
git add packages/zplc-ide/src/plant/editor packages/zplc-ide/src/i18n/catalog/plantEditor.ts
git commit -m "feat(plant-editor): keyboard-only editor panel with part list, form and signal table"
```
**Risk:** item 6 (the keyboard journey in Q2 is the end-to-end proof).

---

### Task E4: Pointer placement in the 3D view
**Spec:** SCN-008. **Lane E. Wave 8. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/editor/pointer.ts
IDE/src/plant/editor/pointer.test.ts
```
**Interfaces:** `export function pointerToGround(ndc: readonly [number, number], camera: CameraState): Vec3 | null` (ray to the floor plane y = 0, pure maths) and `export function dragPlan(editor: SceneEditor, id: string): { move(to: Vec3): void; commit(): void; cancel(): void }` (one undo step per drag). The renderer wiring (pointer events on the canvas) is a small addition the parent asks V4's owner for; this task delivers the logic and its tests only.

- [ ] **Step 1: Failing tests:** `'SCN-008 a pointer at the centre of the view looks at the ground point under the camera target'`, `'SCN-008 a ray parallel to the floor returns null'`, `'SCN-010 a drag is one undo step and cancel leaves the scene unchanged'`.
- [ ] **Step 2: Run, implement, run, commit.**
```bash
git add packages/zplc-ide/src/plant/editor/pointer.ts packages/zplc-ide/src/plant/editor/pointer.test.ts
git commit -m "feat(plant-editor): ground-plane picking and drag plan for pointer placement"
```
**Risk:** item 6.

---

### Task E5: Scenes saved with the project
**Spec:** SCN-006. **Lane E. Wave 5. KEEP.**

**Allowed edit surfaces: Unconfirmed.** The executor first maps how a project stores files: `rg -n "projectFiles|projectArchive" IDE/electron IDE/src --glob '!*.test.*' -l` and `bat IDE/electron/projectFilesProtocol.ts` for allowed extensions and size caps, and `IDE/electron/projectArchive*.ts` for the archive list. The parent then fixes the surface list (expected: `IDE/electron/projectFilesProtocol.ts` and its test, `IDE/electron/projectArchive.ts` and its test, `IDE/src/plant/persistence/sceneFiles.ts` and its test, and the Studio file-tree code that lists project files). This task does **not** start until that list is approved, because it touches a main-process allow-list (item 2) and the project archive format (item 1).

**Interfaces:** `export function sceneFilePath(name: string): string` (`scenes/<name>.scene.json`), `export function saveScene(...)`, `export function openScene(...)` built on the existing project file API, using `parseScene`/`migrateScene` (P1) so an old scene opens or fails with the version named (SCN-006).

- [ ] **Step 1: Failing tests:** `'SCN-006 a scene is saved in the project and reopened byte-identically'`; `'SCN-006 a scene written by an older schema opens through the migration'` (fixtures per released schema version: only version 1 exists in M1, the test iterates a `FIXTURES` list that later versions extend); `'SCN-006 a scene of a newer version fails with a message that names the version'`; `'the project archive includes scene files and rejects a scene larger than the cap'` (cap plan choice: 1 MiB); `'a scene file outside <project>/scenes is not readable through the plant API'`.
- [ ] **Step 2 to 4:** run, implement, run `bun test electron src/plant`, `bun run lint`. **Step 5: Commit.**
```bash
git commit -m "feat(plant): save and open scenes with the project, versioned"
```
**Risk:** item 1 (project and archive formats), item 2 (main-process file allow-list). Independent verifier.

---

### Task F1: Reference scenes 1, 2 and 4 (content)
**Spec:** SCN-001, SCN-002, SCN-003, SCN-004, SCN-007. **Lane F. Wave 7. KEEP (content).**

**Allowed edit surfaces**
```
IDE/plant-scenes/belt-to-sensor/*
IDE/plant-scenes/latch-two-sensors/*
IDE/plant-scenes/counted-queue/*
```
(`IDE/src/generated/sceneIndex.ts` is regenerated by `bun run generate:scene-index`; the parent commits that file once per wave, so two scene tasks never edit it concurrently.)

Each scene directory holds `scene.json` (a `PlantSceneFile`), `plant-map.json` (schema 2), `reference.st`, `starter.st` (declarations only, from the E2 generator's output), `scenario.json` (the `"scene"` block of S1). Layouts are original (P17, SCN-003): the learner practises the goal in the table of spec section "Reference scenes"; nothing is traced from Factory I/O. Each declares `shortestPulseMs` (SCN-007): computed as sensor beam width over belt speed for the narrowest item (for example a 0.2 m box at 0.5 m/s breaks a beam for 400 ms, the declared value is the minimum over the scene's items and sensors).
- **Scene 1 Belt to sensor.** Emitter (one box on `emit` rising edge), a belt, a diffuse sensor at the far end; the program runs the belt on a start button press and stops when the sensor sees the box.
- **Scene 2 Latch between two sensors.** Two sensors A and B on one belt; set on A, reset on B (set and reset latch).
- **Scene 4 Counted queue.** Emitter with `maxItems` 3 and a remover; a counter in the program loads three boxes, then unloads them.

- [ ] **Step 1: Failing tests** (one table-driven test file per scene is not needed: S2's `'SCN-004 every shipped scene passes ...'` is the test; confirm it fails first by regenerating the index with the scene directories empty of a passing program). For each scene add the explicit facts the scenario expects, with requirement IDs in the scenario's expectation labels: scene 1 `EVENTUALLY fact:count:EyeFar >= 1`, scene 2 `fact:count:EyeA == 1 and fact:count:EyeB == 1 and belt stopped after B`, scene 4 `fact:delivered:Remover1 == 3 and fact:itemsEmitted == 3`.
- [ ] **Step 2: Run** `bun test src/plant/ci`. Expected: FAIL (starter passes or reference fails). **Step 3: Write** scenes and programs until: reference passes, starter fails, trace hash recorded in `sceneHashes.json` by the parent. **Step 4:** `bun run lint`, `bun test src/plant src/learn` (2.0 unchanged).
- [ ] **Step 5: Commit** one commit per scene.
```bash
git add packages/zplc-ide/plant-scenes/belt-to-sensor
git commit -m "feat(plant-scenes): scene 1, belt to sensor, with reference program and scenario"
```
**Risk:** item 6 (scene quality beyond the scenario), item 1 (scene files are persisted, versioned).

### Task F2: Reference scenes 8 and 9 (content)
Same shape as F1. **Allowed edit surfaces:** `IDE/plant-scenes/buffer-release/*`, `IDE/plant-scenes/merge-lines/*`. **Depends on:** S2, P4.
- **Scene 8 Buffer and release.** A belt, a stop blade, three sensors; accumulate up to five boxes against the blade, release them one by one. Expectations: `fact:itemsRemoved == 5`, blade `extended` while accumulating, never more than one box passes per release command (a fact `count:EyeRelease` rising once per command).
- **Scene 9 Merge two lines.** Two feeder belts joining one outfeed belt, a stop blade on each feeder (plan choice, so the arbitration lesson 14.2 uses blades, not diverters, which are M4); the program must never let two boxes meet at the merge. Expectation: `fact:itemsCollided == 0` and `fact:itemsRemoved == 6`.
- [ ] Steps as F1. Commits: `feat(plant-scenes): scene 8, buffer and release, with reference program and scenario` and `feat(plant-scenes): scene 9, merge two lines, with reference program and scenario`.
**Risk:** item 6, item 1.

---

### Task L1: Lesson packages can name a scene
**Spec:** CRS-003, CRS-004. **Lane L. Wave 4. KEEP. Conditional.**

**Allowed edit surfaces**
```
IDE/src/learn/lessonPackage.ts
IDE/src/learn/lessonPackageFiles.ts
IDE/src/learn/lessonPackage.test.ts
IDE/src/learn/lessonScene.test.ts
```
Today a manifest `plant` is `null` or one of `LESSON_PLANTS` (`lessonPackage.ts:322-323`) and the plant map is a `PlantMap` (`:792-794`, imported `:30`). **Change:** the manifest gains an optional `scene: string | null` naming a directory of `plant-scenes/`; `plant` stays for the 2.0 plants; exactly one of them may be non-null. The lesson's `plant-map.json` may then be schema 2 targeting `{ scene }`.

- [ ] **Step 1: Failing tests:** `'CRS-003 a manifest names the scene the lesson ships'`; `'CRS-004 a scene lesson is data only: adding one changes no application code'` (a fixture lesson on the fixture scene of S2 builds the package model with no code edit); `'CRS-010 a 2.0 manifest, with scene absent, validates exactly as before'` for every lesson of `IDE/lessons/` (existing suites already run; add one explicit `it` that counts the packages and compares to 68); `'a manifest with both plant and scene is rejected with a located message'`.
- [ ] **Step 2 to 4:** run `bun test src/learn`, implement, run `bun test src/learn src/plants`, `bun run lint`. All 68 lesson tests unchanged. **Step 5: Commit.**
```bash
git commit -m "feat(learn): a lesson package may name the plant scene it ships"
```
**Risk:** item 3 (the package format is consumed by 68 lessons, the generated index and the hardware check), item 1. Independent verifier; starts only when the owner has approved `course-outline.md` (CRS-001), since this is the first code a lesson needs.

### Task L2: Lessons 12.1, 12.2, 12.3, 14.1, 14.2 (content)
**Spec:** CRS-003, CRS-004, CRS-005, CRS-006, CRS-011. **Lane L. Wave 8. Conditional: starts only after the owner approves `course-outline.md` (CRS-001). Allowed edit surfaces:** `IDE/lessons/plant-belt-to-sensor/*`, `IDE/lessons/plant-latch-two-sensors/*`, `IDE/lessons/plant-counted-queue/*`, `IDE/lessons/plant-buffer-release/*`, `IDE/lessons/plant-merge-lines/*` (ids from the outline, modules 12 and 14; the outline lists 14.1 as SFC only and the rest as ST/LD). Each lesson is a package in the 2.0 layout (`lesson.json` manifest, starter, solution, scenario with the pinned `scenario.sha256`, hints, English and Spanish text with the same structure), built from the corresponding F task's scene and reference. Tests: the existing `lessonCi.test.ts` and curriculum tests grade every solution and starter (CRS-005) and the parity tests check English and Spanish. Without the outline approval the executor stops and reports.
- [ ] Steps: one commit per lesson, `feat(lessons): plant-belt-to-sensor, ...`. **Risk:** item 6 (pedagogy), item 1 (hash pinned content).

---

### Task D1: Parts reference generated and compared
**Spec:** PRT-002, CRS-011 (reference pages). **Lane D. Wave 6. KEEP.**

**Allowed edit surfaces**
```
tools/docs/plant-parts-reference.ts
tools/docs/plant-parts-reference.test.ts
docs/docs/plant/parts.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/parts.md
```
(`docs/docs/plant/` and its Spanish twin are new directories; D2 owns every other file in them. The sidebar file is edited by D2 only.)

**Interfaces:** `bun tools/docs/plant-parts-reference.ts --write | --check`; generated from `catalogue.list()` (names en/es, config ranges, signals, fault actions, doc text). `--check` fails when either page differs from the generated text (the "compared in CI" of the spec's PRT verification). Wire into `lint` the way `tools/docs` checks are wired (**Unconfirmed**: read `rg -n "check-docs" package.json`).

- [ ] **Step 1: Failing tests:** `'PRT-002 the reference lists every catalogue part with its signals, ranges and fault actions'`, `'PRT-002 --check fails when a part definition changes and the page does not'` (temp catalogue copy), `'PRT-002 English and Spanish pages have the same table structure'`.
- [ ] **Step 2 to 4:** run `bun test tools/docs`, implement, `bun tools/docs/plant-parts-reference.ts --write`, `--check` (expected exit 0), the docs build `bun run --cwd=docs build` if present (**Unconfirmed**).
- [ ] **Step 5: Commit.**
```bash
git add tools/docs docs/docs/plant docs/i18n/es
git commit -m "docs(plant): generate the parts reference in English and Spanish and compare it in CI"
```
**Risk:** item 5 (a new CI check).

### Task D2: Plant, scene format and scene pages (EN, ES)
**Spec:** CRS-011 (M1 parts), CRS-013. **Lane D. Wave 8. KEEP.** **Allowed edit surfaces:** `docs/docs/plant/index.md`, `docs/docs/plant/scene-format.md`, `docs/docs/plant/scenes.md`, `docs/docs/plant/clock.md`, the four Spanish twins under `docs/i18n/es/docusaurus-plugin-content-docs/current/plant/`, the docs sidebar file (**Unconfirmed** name: `fd sidebars docs`). Content: what the plant is and is not (P14: the 3D view is a view), the one clock and the debug caveat (breakpoints freeze the plant), the scene file format and `schemaVersion`, the five scenes, the capability gaps of the WASM runtime (`PLANT_WASM_GAPS`), and **only measured claims** (CRS-013, P6): no frame-rate or latency number appears before Q2's evidence exists; until then the pages say "not yet measured on the reference machines". Test: the docs parity check of 2.0 (find it: `rg -n "i18n/es" tools/docs tools/ci -l`) and `bun run --cwd=docs build`. Commit: `docs(plant): the plant, the scene format and the first five scenes in English and Spanish`. **Risk:** item 6 (claims beyond evidence), guarded by the rule above.

---

### Task Q1: Requirement coverage reads spec 012
**Spec:** section 7 item 1. **Lane Q. Start rule 3. KEEP.**

**Allowed edit surfaces**
```
tools/ci/requirement-coverage.ts
tools/ci/requirement-coverage.test.ts
tools/ci/requirement-evidence.json
tools/ci/requirements-index.json
tools/ci/spec-tracking.test.ts
IDE/scripts/generate-requirement-index.ts
```
`research.md` 8.1: `tools/ci/spec-tracking.test.ts:22-30` fails on a spec folder that is neither completed nor linked to spec 011 and "assumes 011 is the only open spec; M1 updates it when it extends requirement coverage to this spec". **Unconfirmed:** how the tool extracts evidence (test names, JSON fragments); read `tools/ci/requirement-coverage.ts` first and record the mechanism in the commit body. Lanes record requirement IDs in test names (Global Constraints); Q1's output reports every PLT, VIS, PRT, SCN, LNK and CRS ID of spec 012 as `covered`, `conditional on a decision` (with the decision) or `pending (later milestone)`.

- [ ] **Step 1: Failing tests:** `'requirements of spec 012 are indexed with their IDs'` (counts PLT 17, VIS 13, PRT 10, SCN 16, LNK 18, CRS 13 from the spec text); `'a requirement of spec 012 with no test and no condition is reported as uncovered'`; `'spec-tracking accepts spec 012 as open and linked to spec 011'`; the 011 tests unchanged.
- [ ] **Step 2 to 4:** `bun test ./tools/ci/requirement-coverage.test.ts ./tools/ci/spec-tracking.test.ts` at the root, implement, run, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add tools/ci packages/zplc-ide/scripts/generate-requirement-index.ts
git commit -m "test(ci): extend requirement coverage and spec tracking to spec 012"
```
**Risk:** item 5 (CI tooling), item 3 (the coverage report others read).

### Task Q2: Benchmarks, journeys and the security check
**Spec:** VIS-004, VIS-005, VIS-006, VIS-009, VIS-010, VIS-012, PLT-014, PLT-015, VIS-002. **Lane Q. Wave 7. KEEP (numbers PHYS).**

**Allowed edit surfaces**
```
IDE/scripts/plant/bench.ts
IDE/scripts/plant/benchRecord.ts
IDE/scripts/plant/bench.test.ts
IDE/scripts/run-journeys.ts
IDE/scripts/journeys/plant*.ts
specs/012-zplc-2-1-plant-simulation/evidence/*
```
(`run-journeys.ts` gets only the registration of the new journeys; **Unconfirmed** whether journeys live in separate files, read it first. It states it gives no timing evidence, `IDE/scripts/run-journeys.ts:110`, `:162`: the timing runs are the separate bench script, never the journeys.)

**Interfaces:** `bun scripts/plant/bench.ts --out <file>` against a **packaged** build (`launchPackagedApp` in `IDE/scripts/journeyApp.ts` of the spike's design; the production CSP applies only to a packaged app, `electron/main.ts:153`, `:435` as cited in `research.md` 8.1) and writes one JSON record named by platform, architecture, CPU and GPU, never host or user name. Sequences: (1) frame rate per quality level on the largest M1 scene and on the stress scene, 60 s each; (2) capacity: p50, p95, max of plant step cost headless and in the renderer; (3) editor latency: key press to paint p95, with the scene running and without (baseline), in the code editor (PLT-015); (4) no-WebGL run (`--disable-gpu`): core and session still run, panel offers the schematic; (5) CSP: zero violations; the existing CSP test of 2.0 passes unchanged.

Journeys added (each a script of `run-journeys.ts`'s style): forced context loss, a machine with no WebGL 2, keyboard-only operation of the push button and the editor path (SCN-014 build-bind-run), each display mode (light, dark, high contrast, reduced motion).

- [ ] **Step 1: Failing tests** (`bench.test.ts`, no GPU needed): `'the record names platform, arch, cpu and gpu and no host or user name'`; `'the p95 of an empty sample is an error, not zero'`; `'the record schema is stable'`.
- [ ] **Step 2: Implement, then run on this machine:** `bun run build:compiler && bun run build` (IDE), package as the 2.0 packaged-smoke does (`bun run smoke:desktop-packaged` shows the exact command; **Unconfirmed** whether it also exposes the packaged path), `bun scripts/plant/bench.ts --out ../../specs/012-zplc-2-1-plant-simulation/evidence/bench-<platform>-<arch>.json`. The thresholds are the spec's (60 typical and never below 30 at 1920x1080; editor 100 ms p95); a miss is recorded as a finding and reported, never tuned away. Expected on Linux: headless step p95 under 8 ms (spike: 3.10 ms); everything else is evidence, not an expectation.
- [ ] **Step 3: Journeys:** `bun run smoke:journeys` (IDE). Expected: the 2.0 journeys and the new ones pass; the 2.0 ones are unchanged.
- [ ] **Step 4: Commit** the scripts and the Linux record. macOS and Windows records are the owner's runs: the commit message and the report list them as **pending owner**.
```bash
git add packages/zplc-ide/scripts specs/012-zplc-2-1-plant-simulation/evidence
git commit -m "test(plant): benchmarks, journeys and the packaged security check with the Linux record"
```
**Risk:** item 5 (a script that drives a packaged app), item 6 (frame-rate evidence exists for one machine only).

---

## Open questions for the owner
Only where the spec leaves a real product decision open. Each has a recommended default; the plan proceeds on the default unless told otherwise.

1. **When do the live 2.0 plants take the graded models (D-19)?** The spec records the decision but 6.2 assigns it to no milestone. *Default: M1, Task P5*, because it is a defect of released 2.0 (a program can look right live and fail its check) and the equivalence tests are cheap before more code depends on the live models.
2. **VIS-001 says the panel SHOULD be movable to a window of its own.** A second window is a main-process change with new IPC and sandbox review. *Default: not in M1; maximise only. Schedule the window with the M7 editor work.*
3. **Is the scene editor reachable by learners in the M1 pre-release?** D-15 says the editor is learner-facing in 2.1, but 6.2 lists "the learner-facing editor" under M7 and "the editor's authoring path" under M1. *Default: reachable from the Lab panel from M1 as "Edit scene" with no flag, documentation in M7; the pre-release label covers it.*
4. **Does the global Run button start a plant session when a scene is bound?** *Default: no. The plant panel owns Run, Pause, Step and Reset (as the 2.0 live panel does), and the global Run shows a translated pointer to the panel.* Wiring it into the global transport touches the debug controller used by every lesson.
5. **Use the Open Industry Project box and pallet textures (the only `reuse` items of `gate/prior-art.md`)?** *Default: no; geometry and procedural textures made in code (PRT-009), the attribution line unnecessary. Revisit after a viewing if the boxes look poor.*
6. **Plant step of 5 ms refuses scan intervals that are not a multiple of 5 ms.** Gate-verified step; any lesson with a 1 ms or 7 ms task would be refused with a located message. *Default: refuse in M1 and list the lessons that would be affected (none of the five M1 lessons).* A 1 ms plant step is a P2 change and a capacity retest.
7. **Course outline approval (CRS-001) is pending.** The five M1 lessons (12.1, 12.2, 12.3, 14.1, 14.2) wait for it (L1, L2). *Default: approve before wave 4, or accept that M1 ships its five scenes without lessons and the lessons land with M7.* Spec 6.2 says milestones ship scenes with their lessons, so the second option departs from it.
8. **Where the gate's macOS and Windows evidence stands.** Not a new decision: M1 does not begin until the verdict exists, and the Windows GPU machine is still unnamed (research.md question 8).

## Findings in the spec (contradictions and things that could not be verified)
- **6.2 against D-15 and SCN-008.** M1 lists "the editor's authoring path"; M7 lists "the learner-facing editor (decision D-15)"; SCN-008 says its requirements "apply to learners as well as to scene authors". The plan builds the whole authoring path in M1 and treats the learner exposure as open question 3.
- **6.2 against CRS-001.** "Each milestone ships its scenes together with their lessons", but CRS-001 forbids lessons before the owner approves the outline, and `course-outline.md` is still a draft (open question 7).
- **D-19 has no milestone** (open question 1); PLT-013 says the live models change, which nothing in 6.2 schedules.
- **PLT-005 against the baseline's live sessions.** The spec says live sessions run freely and the plant polls them; the M1 design instead moves a live plant session onto the virtual clock (the transport belongs to the plant panel while a scene runs). That is a behaviour change for any user who expected the global Run to drive a plant; flagged in open question 4.
- **LNK-006 relies on staged writes.** `native_runtime_session.c:488-517` shows staged memory writes applied through `zplc_force_write_bytes`, so a forced byte keeps its value (read, not executed). Review Focus 7 and R3 test 8 prove it end to end; the claim stays unproven until that test passes.
- **PLT-014 and VIS-004 are measured on Linux headless only.** The gate has no rendered frame-rate number and no macOS or Windows number; the spec's "60 typical, never below 30 at 1920x1080" is untested.
- **Unconfirmed baseline facts I could not read in the time given:** the exact ctest target names for the C tests; the test-engine's evidence mechanism in `tools/ci`; where project files and archives enumerate file kinds (E5); whether `ipcContract.ts` or `preload.ts` also enumerate native methods (R2); whether `jolt-physics` 1.1.1 exposes `ActivateBodiesInAABox` (P2 step 1); how `src/generated/lessonIndex` is generated (S2); the docs sidebar and docs-parity check names (D1, D2); the single plant-map type of the worktree is schema 1 until precondition A.
- **`security.ts` line citations differ** between spec (`:982`, `:986`) and M0 plan (`:977-1001`); both are inside `createContentSecurityPolicy`. This plan cites the function.

## Done when (aligned with spec section 7, for M1)
- [ ] The owner has recorded the gate verdict and the open questions above have answers or accepted defaults.
- [ ] Every requirement in the mapping table has an executed check named by its ID, and `tools/ci/requirement-coverage.ts` reports spec 012 (Q1): M1's requirements `covered`, later milestones `pending`, conditional ones with their decision (section 7 item 1).
- [ ] Reference scenes 1, 2, 4, 8 and 9 pass their scenarios in CI with the reference program and fail with the starter, in CI on Linux, macOS and Windows (SCN-004, section 7 item 2). macOS and Windows runs are the owner's until the nightly job covers them.
- [ ] The frame-rate, capacity and editor-latency records exist for each reference machine (VIS-004, PLT-014, PLT-015, section 7 item 4); a machine without a record is listed as pending, not omitted.
- [ ] All 2.0 suites pass unchanged: lessons, plants (apart from the D-19 assertions of P5, each justified), smoke, journeys, the content security policy test (section 7 item 6).
- [ ] `welcomeBundle.test.ts` and `bun scripts/release/sbom.ts --check` pass with three and Jolt in one lazy chunk, and every dependency and asset has its licence recorded (VIS-012, VIS-013, section 7 item 7).
- [ ] The independent reviews of Task R1 (C) and of R2's allow-list, and the independent verifiers of P5, S1, L1 and E5, returned with no open blocker.
- [ ] Documentation in English and Spanish exists for the parts reference and the plant pages and claims only what recorded evidence supports (section 7 item 8).
- [ ] The tree can ship as a 2.1 pre-release: `bun run lint`, `bun test`, `bun run test:core`, `bun run format:check` all pass at the root.
