# ZPLC 2.1 Plant Simulation: Feasibility Gate (M0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer the eight checks of the feasibility gate (spec section 6.1) with a throwaway prototype, and record a verdict that confirms or overturns decision D-14 (three.js and Jolt in WebAssembly, inside Studio).

**Architecture:** A headless plant core in TypeScript on Jolt (`wasm-compat` flavour, fixed 5 ms step) runs unchanged in `bun test` and in Studio's renderer. A lock-step driver exchanges signals with the native runtime once per 10 ms scan, on the runtime's virtual clock. A three.js canvas only draws the core's state. A bench script drives a packaged Studio over the Chrome DevTools Protocol and writes one JSON record per machine.

**Tech Stack:** TypeScript 5.9, Bun 1.3.14 (`bun test`), Electron 45, `three`, `jolt-physics`, the native runtime `zplc_runtime` (C99, not changed by this plan).

**Spec:** `specs/012-zplc-2-1-plant-simulation/spec.md` (section 6.1 defines the gate) and `research.md` beside it (sections 3, 4, 8.1 and 9). Read both before Task 0.

**Created:** 2026-11-12, for milestone M0 only. Milestones M1 to M7 get their plans after the gate, because the gate may change the stack.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`. Commands that start with `bun test` or `bun run` run with `IDE/` as the working directory unless the step says "at the root".

## Roles
| Role | Does |
|---|---|
| Executor | Every task below. An agent or a contributor; not the author of this plan. |
| Owner | Commits the spec and this plan, pushes branches, dispatches CI, names the Windows machine with a GPU, and runs (or arranges) the runs on the MacBook Air M1 and on Windows. |

## Global Constraints
- **Throwaway.** "No code from it enters the product. It lives on a branch that is never merged" (spec 6.1). The branch is `spike/plant-gate`. Never open a pull request from it. Only evidence files and the report reach `feat/plant-simulation` (Task 11).
- **Security posture.** "The sandboxed renderer and the existing content security policy stay as they are" (VIS-012). Do not edit `createContentSecurityPolicy` (`IDE/electron/security.ts:977-1001`), `sandbox: true` or `contextIsolation: true` (`IDE/electron/main.ts:321-327`). Do not add cross-origin isolation headers. Load no remote asset.
- **Dependencies.** Only `three`, `jolt-physics` and the type package `@types/three`, at exact versions. "No React binding for three.js unless the gate shows a concrete need" (spec 4.3). Any other package needs the owner (`AGENTS.md` guideline 6).
- **Spec budgets, verbatim.** "60 frames per second typical and never below 30 at 1920×1080"; "200 dynamic items"; "key press to paint takes at most 100 ms at the 95th percentile"; "50 MB of installer growth per platform".
- **No hardware.** The gate uses no board. Nothing here flashes, deploys, opens a serial port or forces I/O.
- **No C changes.** The native runtime is used as it is at the baseline. A missing runtime capability is recorded as a finding for M1.
- **Commits.** Conventional Commits, on `spike/plant-gate` only, no AI attribution lines. Pushing and dispatching workflows are the owner's actions.
- **Reporting.** State the command you ran and what it printed (`AGENTS.md` guideline 4). Evidence records name the machine by platform, architecture, CPU and GPU, never by host name or user name.
- **Shell on the owner's machine.** Use `bat`, `rg`, `fd` and `eza`, not `cat`, `grep`, `find` and `ls`.
- **Language.** Code, comments, test names and evidence files are in English.

## How a check is judged
- Every check is a test or a bench sequence whose thresholds are fixed here, before anything is measured.
- A threshold quoted from the spec is the spec's. A threshold marked *plan threshold* was chosen by the author of this plan to make a spec sentence measurable. It is not an owner decision; the raw numbers are recorded beside it so the owner can judge again.
- **A failing check is a finding.** Do not change a threshold, a scene or a script to make it pass. Each task lists the tuning it allows. After that, record the failure and follow "If a check fails" at the end of this plan.

## Review Focus
Conditions the spec implies and the eight checks do not name. Each has a test in the task that owns the code.

1. A box that has gone to sleep on a stopped belt must move when the belt starts (Task 2, test 4).
2. A host slower than real time, or uneven polling, must not change the trace (Task 5, test 2).
3. A runtime that fails in the middle of a run must stop the plant at the last completed scan and surface the error (Task 5, test 5).
4. With no WebGL 2 or with the GPU disabled, the core and the lock-step must still run and give the same trace (Task 7, sequence 5).
5. Resetting a scene many times must not grow WebAssembly memory (Task 1, test 3).

## File structure
All product-side files are new and live on `spike/plant-gate`.

| File | Responsibility |
|---|---|
| `IDE/src/plant-gate/jolt.ts` | Loads the Jolt module |
| `IDE/src/plant-gate/world.ts` | The headless core: bodies, belts, photo-eyes, fixed step |
| `IDE/src/plant-gate/scenes.ts` | The five gate scenes, as data |
| `IDE/src/plant-gate/trace.ts` | Records the state per scan and hashes it |
| `IDE/src/plant-gate/gateProgram.ts` | The PLC program of the gate and its I/O addresses |
| `IDE/src/plant-gate/lockStep.ts` | One exchange per scan between the runtime and the world |
| `IDE/src/plant-gate/view.ts` | three.js drawing of a world (renderer only) |
| `IDE/src/plant-gate/gateEntry.ts` | `window.__zplcPlantGate`: what the bench calls (renderer only) |
| `IDE/src/plant-gate/*.test.ts` | Checks 1, 2, 4 and 5 |
| `IDE/scripts/plant-gate/capacityHeadless.ts`, `bench.ts`, `bundleSize.ts` | Measurements that write evidence |
| `specs/012-zplc-2-1-plant-simulation/gate/` | Evidence: JSON records and `prior-art.md` |

Modified on the spike only: `IDE/package.json`, `bun.lock`, `IDE/src/main.tsx` (one line), `IDE/shared/nativeSimulationEnvironment.ts`, `IDE/electron/security.ts` (method allow-list only), `IDE/scripts/journeyApp.ts` (`launchPackagedApp` flags).

---

### Task 0: Workspace, dependencies, baseline

**Files:**
- Modify: `IDE/package.json`, `bun.lock`
- Create: `specs/012-zplc-2-1-plant-simulation/gate/dependencies.json`

- [ ] **Step 1: Confirm the precondition**

Run at the root of the `feat/plant-simulation` checkout: `git log --oneline -1 -- specs/012-zplc-2-1-plant-simulation/plan.md`
Expected: one commit line. If it prints nothing, stop: the owner commits the spec and this plan first.

- [ ] **Step 2: Create the branch in its own worktree**

Run in the main checkout: `git worktree add -b spike/plant-gate ../ZPLC-worktrees/plant-gate feat/plant-simulation`
All later steps run in `../ZPLC-worktrees/plant-gate`.

- [ ] **Step 3: Install and build the native runtime**

Run at the root: `bun install && bun run build:runtime`
Expected: `firmware/lib/zplc_core/build/zplc_runtime` exists.

- [ ] **Step 4: Confirm the baseline is green**

Run: `bun test src/plants src/test-engine`
Expected: every test passes. If not, stop and report; do not build on a red baseline.

- [ ] **Step 5: Add the dependencies**

Run: `bun add --exact three jolt-physics && bun add --dev --exact @types/three`

- [ ] **Step 6: Record them**

Write `gate/dependencies.json`: for `three`, `jolt-physics` and `@types/three`, the fields `name`, `version`, `license` (copied from `node_modules/<name>/package.json`) and `unpackedBytes`.
Expected: both runtime packages say `MIT`. Any other licence: stop and report.

- [ ] **Step 7: Commit**

```bash
git add packages/zplc-ide/package.json bun.lock specs/012-zplc-2-1-plant-simulation/gate/dependencies.json
git commit -m "chore(plant-gate): add three and jolt-physics for the feasibility prototype"
```

---

### Task 1: Headless world (check 5)

**Files:**
- Create: `IDE/src/plant-gate/jolt.ts`, `IDE/src/plant-gate/world.ts`, `IDE/src/plant-gate/scenes.ts`
- Test: `IDE/src/plant-gate/headless.test.ts`

**Interfaces:**
- Consumes: `jolt-physics/wasm-compat` (the WebAssembly file is embedded in the bundle, so nothing is fetched).
- Produces:

```ts
// jolt.ts
export type JoltModule = Awaited<ReturnType<typeof import('jolt-physics/wasm-compat').default>>;
export function loadJolt(): Promise<JoltModule>; // a fresh module instance on every call

// scenes.ts
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export interface BoxSpec { id: string; halfExtents: Vec3; position: Vec3; massKg: number; friction: number; motion: 'static' | 'dynamic' }
export interface BeltSpec { id: string; halfExtents: Vec3; position: Vec3; axis: Vec3; friction: number; accelMps2: number }
export interface EyeSpec { id: string; from: Vec3; to: Vec3 }
export interface GateScene { name: string; boxes: BoxSpec[]; belts: BeltSpec[]; eyes: EyeSpec[] }
export function dropBox(): GateScene; // a static floor with its top at y = 0 and one 0.3 m cube of 5 kg, centre at y = 1

// world.ts
export const PLANT_STEP_MS = 5;
export interface BodyState { id: string; p: Vec3; q: Quat; v: Vec3 }
export interface GateWorld {
  readonly timeMs: number;
  step(ms: number): void; // throws RangeError unless ms is a positive multiple of the plant step
  setBeltTarget(id: string, speedMps: number): void;
  eye(id: string): boolean; // true while a dynamic body crosses the beam
  bodies(): BodyState[]; // dynamic bodies, in scene order
  writeState(out: Float32Array, offset: number): number; // p then q of each dynamic body; returns floats written
  dispose(): void;
}
export function createWorld(Jolt: JoltModule, scene: GateScene, stepMs?: number): GateWorld; // stepMs defaults to PLANT_STEP_MS
```

- [ ] **Step 1: Write the failing tests**

```ts
it('simulates a falling box in the test runner', async () => {
  const world = createWorld(await loadJolt(), dropBox());
  world.step(2000);
  const [box] = world.bodies();
  expect(world.timeMs).toBe(2000);
  expect(Math.abs(box!.p[1] - 0.15)).toBeLessThan(0.002);
  world.dispose();
});

it('rejects a step that is not a multiple of the plant step', async () => {
  const world = createWorld(await loadJolt(), dropBox());
  expect(() => world.step(7)).toThrow(RangeError);
  world.dispose();
});

it('does not grow WebAssembly memory across 50 create and dispose cycles', async () => {
  const Jolt = await loadJolt();
  const free: number[] = [];
  for (let cycle = 0; cycle < 50; cycle += 1) {
    const world = createWorld(Jolt, dropBox());
    world.step(100);
    world.dispose();
    free.push(freeHeapBytes(Jolt));
  }
  expect(Math.abs(free[49]! - free[4]!)).toBeLessThan(free[4]! * 0.01);
});
```

`freeHeapBytes` is a test helper that reads the free-memory counter the Jolt examples display (`Examples/js/example.js` in the JoltPhysics.js repository at the installed version).

- [ ] **Step 2: Run them to see them fail**

Run: `bun test src/plant-gate/headless.test.ts`
Expected: FAIL, module `./world` not found.

- [ ] **Step 3: Implement `loadJolt`, `dropBox` and `createWorld`**

Follow `Examples/falling_shapes.html` and `Examples/js/example.js` of JoltPhysics.js at the installed version: two object layers (moving, non-moving), gravity −9.81 m/s² on y, one `jolt.Step(stepMs / 1000, 1)` per plant step. Destroy with `Jolt.destroy` everything created with `new Jolt.…`; `dispose` removes and destroys every body and the Jolt interface. `eye` uses a ray cast through Jolt's narrow-phase query. Belts come in Task 2; `setBeltTarget` may throw "unknown belt" for now.

- [ ] **Step 4: Run the tests to see them pass**

Run: `bun test src/plant-gate/headless.test.ts`
Expected: 3 pass. This is check 5: the scene ran in the test runner, where there is no GPU.

- [ ] **Step 5: Commit**

```bash
git add packages/zplc-ide/src/plant-gate
git commit -m "feat(plant-gate): headless world on Jolt in the test runner"
```

---

### Task 2: Conveyor and stack (check 1)

**Files:**
- Modify: `IDE/src/plant-gate/world.ts`, `IDE/src/plant-gate/scenes.ts`
- Test: `IDE/src/plant-gate/conveyor.test.ts`

**Interfaces:**
- Consumes: `createWorld`, `GateWorld`, `loadJolt` (Task 1).
- Produces: `beltBox(): GateScene`, `palletStack(): GateScene`, `restSoak(): GateScene`, and the constant `BELT_SPEED_MPS = 0.5` in `scenes.ts`.

**Scene values (the gate's stand-in for "catalogue speed"; plan thresholds):**

| Scene | Content |
|---|---|
| `beltBox` | Belt `belt`: 4.0 × 0.1 × 0.6 m, top at y = 0.5, travels along +x, friction 0.6, `accelMps2` 1.0. Box: 0.3 m cube, 5 kg, friction 0.6, centred on the belt at x = −1.5. Eye `eye`: a beam across the belt at x = +1.0, 0.1 m above the belt top. |
| `palletStack` | The same belt, 8.0 m long. Pallet: 1.2 × 0.144 × 0.8 m, 25 kg, at x = −3.0. Five boxes of 0.4 × 0.2 × 0.3 m and 5 kg, in one column centred on the pallet. |
| `restSoak` | A floor, a stopped `beltBox` belt, one box on each. |

- [ ] **Step 1: Write the failing tests**

Each test builds its world with `createWorld(await loadJolt(), scene)` and disposes it.

1. `'a box reaches belt speed and stops with the belt'`: `setBeltTarget('belt', 0.5)`; after `step(1500)`, `|v.x − 0.5| ≤ 0.01`. After `step(1500)` more, `setBeltTarget('belt', 0)`; after `step(1500)`, `|v| ≤ 0.005`. At each of those points `|p.z| ≤ 0.005`.
2. `'a five-box stack survives a travelling pallet'`: three cycles of belt on for 2000 ms and off for 1000 ms. Afterwards, for each box: its x and z offset from the pallet changed by at most 0.010 m, its tilt from vertical is at most 1°, and the boxes keep their order in y.
3. `'an item at rest stays at rest for ten simulated minutes'`: `restSoak`, `step(600_000)`. For each box: position moved at most 0.001 m, rotation changed at most 0.1°, and after the first second its speed never exceeded 0.001 m/s (sample every 1000 ms).
4. `'a box asleep on a stopped belt moves when the belt starts'`: `beltBox`, `step(60_000)` with the belt stopped, then `setBeltTarget('belt', 0.5)` and `step(1500)`: `|v.x − 0.5| ≤ 0.01`.

- [ ] **Step 2: Run them to see them fail**

Run: `bun test src/plant-gate/conveyor.test.ts`
Expected: FAIL, `beltBox` is not exported.

- [ ] **Step 3: Implement belts and the three scenes**

A belt is a static box whose surface velocity is applied in a `Jolt.ContactListenerJS` that writes `mRelativeLinearSurfaceVelocity` on contact added and on contact persisted, as `Examples/conveyor_belt.html` does. The belt's current speed moves toward its target by `accelMps2 × stepSeconds` per plant step. A change of target wakes the bodies resting on the belt.

- [ ] **Step 4: Run the tests**

Run: `bun test src/plant-gate/conveyor.test.ts`
Expected: 4 pass. That is check 1.

Allowed tuning, each change recorded with its value in `gate/check-1.json`: friction between 0.4 and 0.8; restitution; Jolt's solver iteration counts; a plant step of 2.5 ms instead of 5 ms. Not allowed: other thresholds, lighter stacks, slower belts, gentler ramps.
If a test still fails: write the measured values to `gate/check-1.json` with `"verdict": "fail"` and continue with Task 3. The failure is handled at the end.

- [ ] **Step 5: Write `gate/check-1.json` and commit**

Fields: `schema: "zplc.plant-gate/1"`, `check: 1`, `commit`, `plantStepMs`, `tuning`, the measured value behind every threshold, `verdict`.

```bash
git add packages/zplc-ide/src/plant-gate specs/012-zplc-2-1-plant-simulation/gate/check-1.json
git commit -m "feat(plant-gate): belt surface velocity, stack and rest checks"
```

---

### Task 3: Repeatability (check 2)

**Files:**
- Create: `IDE/src/plant-gate/trace.ts`
- Test: `IDE/src/plant-gate/repeatability.test.ts`

**Interfaces:**
- Consumes: `GateWorld.writeState`, `GateWorld.eye`, `palletStack` (Tasks 1 and 2).
- Produces:

```ts
export class TraceRecorder {
  constructor(world: GateWorld);
  sample(signals: number): void; // appends the raw float32 state of every dynamic body, then one byte of signals
  bytes(): Uint8Array;
}
export function sha256Hex(bytes: Uint8Array): Promise<string>; // crypto.subtle, present in Bun and in the renderer
export interface BeltScript { scans: number; scanMs: number; events: ReadonlyArray<{ scan: number; belt: string; speedMps: number }> }
export const STACK_SCRIPT: BeltScript; // 6000 scans of 10 ms; 'belt' to 0.5 at scans 100, 1000, 1900 and to 0 at scans 700, 1600, 2500
export function runScripted(Jolt: JoltModule, scene: GateScene, script: BeltScript): Promise<string>; // the hash of the run
```

`runScripted` applies the events of a scan, steps the world by `scanMs`, then samples.

- [ ] **Step 1: Write the failing tests**

```ts
const EXPECTED_HASH = 'pin-me'; // replaced in Step 4 by the hash of the first Linux run

it('gives the same hash on three fresh runs', async () => {
  const hashes = [];
  for (let run = 0; run < 3; run += 1) hashes.push(await runScripted(await loadJolt(), palletStack(), STACK_SCRIPT));
  console.log('plant-gate repeatability', process.platform, process.arch, hashes[0]);
  expect(new Set(hashes).size).toBe(1);
});

it('gives the hash pinned on Linux', async () => {
  expect(await runScripted(await loadJolt(), palletStack(), STACK_SCRIPT)).toBe(EXPECTED_HASH);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test src/plant-gate/repeatability.test.ts`
Expected: FAIL, module `./trace` not found.

- [ ] **Step 3: Implement `trace.ts`**

- [ ] **Step 4: Run, pin, run again**

Run: `bun test src/plant-gate/repeatability.test.ts`
Expected: the first test passes and prints the hash; the second fails. Copy the printed hash into `EXPECTED_HASH`, run again: 2 pass.
If the first test fails on one machine, repeatability already fails without leaving it: record `gate/check-2.json` with `"verdict": "fail"` and the three hashes.

- [ ] **Step 5: Commit**

```bash
git add packages/zplc-ide/src/plant-gate
git commit -m "feat(plant-gate): trace hash and repeatability check"
```

The macOS and Windows half of check 2 is this same test, run in Task 8.

---

### Task 4: Stress scene and headless step cost (input to check 3)

**Files:**
- Modify: `IDE/src/plant-gate/scenes.ts`
- Create: `IDE/scripts/plant-gate/capacityHeadless.ts`
- Test: `IDE/src/plant-gate/stress.test.ts`

**Interfaces:**
- Consumes: `createWorld`, `loadJolt`, `BELT_SPEED_MPS`.
- Produces: `stress(): GateScene` (20 belts named `belt-0` to `belt-19`, each 8.0 × 0.1 × 0.6 m, in a grid of 4 by 5; 10 boxes of 0.3 m and 5 kg on each, 0.35 m apart, centred) and `driveStress(world: GateWorld, scan: number): void` (every 200 scans it reverses every belt between +0.5 and −0.5 m/s, so the 200 boxes stay awake and stay on their belts).

- [ ] **Step 1: Write the failing test**

`'the stress scene keeps 200 boxes on 20 belts for 30 simulated seconds'`: 3000 scans of `driveStress` then `step(10)`; `world.bodies().length === 200` and every box has `p[1] > 0.4`.

- [ ] **Step 2: Run it to see it fail**

Run: `bun test src/plant-gate/stress.test.ts`
Expected: FAIL, `stress` is not exported.

- [ ] **Step 3: Implement `stress` and `driveStress`; run the test**

Expected: 1 pass.

- [ ] **Step 4: Write `capacityHeadless.ts`**

It runs the same 3000 scans twice, with a plant step of 5 ms and of 10 ms, times every `world.step(10)` with `performance.now()`, and writes `gate/capacity-headless-<platform>-<arch>.json`: `schema`, `commit`, `host` (`platform`, `arch`, `cpu`, `memoryGb`), and per plant step `stepMsP50`, `stepMsP95`, `stepMsMax`, `realTimeFactor` (30 s divided by the wall time). It exits with code 1 when `stepMsP95` at the 5 ms plant step is above 5 ms (*plan threshold*: half of the scan stays free for the view and the editor).

- [ ] **Step 5: Run it and commit**

Run: `bun scripts/plant-gate/capacityHeadless.ts`
Expected: the JSON file is written. Report the four numbers of each plant step. Exit code 1 is a finding, not a reason to stop.

```bash
git add packages/zplc-ide/src/plant-gate packages/zplc-ide/scripts/plant-gate specs/012-zplc-2-1-plant-simulation/gate
git commit -m "feat(plant-gate): stress scene and headless step cost"
```

---

### Task 5: Lock-step with the native runtime (check 4, graded side)

**Files:**
- Create: `IDE/src/plant-gate/gateProgram.ts`, `IDE/src/plant-gate/lockStep.ts`
- Test: `IDE/src/plant-gate/lockStep.test.ts`

**Interfaces:**
- Consumes: `beltBox`, `createWorld`, `TraceRecorder`, `sha256Hex`; from the product `compileSingleFileWithTask` (`IDE/src/compiler/index.ts`), `NativeAdapter` (`IDE/src/runtime/nativeAdapter.ts`: `connect`, `loadProgram`, `pokeN`, `peek`, `scenarioStep`, `getInfo`, `setBreakpoint`, `removeBreakpoint`), `NativeSimulationSupervisor`, and `itNative` with `nativeRuntimeBinary` (`IDE/src/cli/nativeRuntimeGuard.ts`).
- Produces:

```ts
// gateProgram.ts
export const SCAN_MS = 10;
export const IO = { start: { address: 0x0000, bit: 0 }, eye: { address: 0x0000, bit: 1 }, belt: { address: 0x1000, bit: 0 } } as const;
export const GATE_PROGRAM_ST: string;
export function compileGateProgram(): { zplcFile: Uint8Array; debugMap: DebugMap };
export const GRADED_HASH: string; // pinned in Step 5

// lockStep.ts
export type GateAdapter = Pick<NativeAdapter, 'pokeN' | 'peek' | 'scenarioStep' | 'getInfo'>;
export interface LockStepOptions {
  adapter: GateAdapter; // connected, with the gate program loaded
  world: GateWorld; // a beltBox world
  steps: number; // scenario steps to request
  startPulse: { from: number; to: number }; // steps during which Start is TRUE
  gate?: (step: number) => Promise<void>; // awaited before each step: pause and single step
  pace?: (step: number) => Promise<void>; // awaited after each step: real-time pacing
}
export interface LockStepResult { hash: string; completedScans: number; heldSteps: number; signals: number[] }
export function runLockStep(options: LockStepOptions): Promise<LockStepResult>;
```

**The program.** Start latches the belt; 500 ms after the eye sees the box the belt stops. The timer makes the trace depend on the virtual clock.

```
PROGRAM Main
VAR
  Start AT %IX0.0 : BOOL;
  Eye AT %IX0.1 : BOOL;
  Belt AT %QX0.0 : BOOL;
  Run : BOOL;
  Hold : TON;
END_VAR
IF Start THEN Run := TRUE; END_IF;
Hold(IN := Eye, PT := T#500ms);
IF Hold.Q THEN Run := FALSE; END_IF;
Belt := Run;
END_PROGRAM
```

Compile it as `IDE/src/editors/paletteExecution.test.ts:39-44` does: `compileSingleFileWithTask(GATE_PROGRAM_ST, 'ST', { sourceRef: 'src/main.st', programName: 'Main', intervalMs: SCAN_MS })`. If the compiler wants another spelling for the addresses, use the one of that test file; the three addresses must stay input byte 0 bits 0 and 1 and output byte 0 bit 0.

**The exchange.** This order is the order of the 2.0 scenario engine (`IDE/src/test-engine/index.ts:467-519`): plant to inputs, events, one scan, outputs to plant. For step `k`, with `atMs = k × SCAN_MS`:

```
1. await gate?.(k)
2. inputs = (startPulse covers k ? 1 : 0) | (world.eye('eye') ? 2 : 0)
   if inputs changed since the last write: adapter.pokeN(IO.start.address, [inputs])
3. before = cycles of the last getInfo (0 at the start)
   await adapter.scenarioStep(atMs); after = (await adapter.getInfo()).cycles
4. if after === before: heldSteps += 1, go to 7        (a breakpoint held the scan: the plant does not move)
5. belt = ((await adapter.peek(IO.belt.address, 1))[0] & 1) !== 0
   world.setBeltTarget('belt', belt ? BELT_SPEED_MPS : 0)
6. world.step(SCAN_MS); recorder.sample(inputs | (belt ? 0x80 : 0)); completedScans += 1; signals.push(that byte)
7. await pace?.(k)
```

The plant follows completed scans, never timestamps. A rejected `scenarioStep` rejects `runLockStep` with the same error, before the plant moves.

One session takes one `runLockStep` call: the runtime demands that `at_ms` starts at 0 and then advances by one interval at every step (`firmware/apps/posix_host/src/native_runtime_session.c:1826-1838`). A test that acts in the middle of a run (pause, set or remove a breakpoint) does it inside `gate`.

- [ ] **Step 1: Write the failing tests**

A helper `openSession()` builds the supervisor and adapter exactly as `IDE/src/editors/paletteExecution.test.ts:45-62` does (environment `ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1'`), loads `compileGateProgram().zplcFile` and registers its cleanup. Every test uses `itNative`, a fresh session, a fresh `beltBox` world, and `startPulse: { from: 10, to: 15 }`.

1. `'the plant and the program share one clock'`: 800 steps, no `gate`, no `pace`. `completedScans === 800`, `world.timeMs === 8000`, `heldSteps === 0`. With `eyeOn` the first scan whose signal byte has bit 1 set and `beltOff` the first later scan with bit 7 clear: `beltOff − eyeOn` is 50 or 51. At the end the box speed is at most 0.005 m/s. The test prints the hash.
2. `'host speed does not change the trace'`: the same run with `pace` waiting a seeded pseudo-random 0 to 5 ms gives the hash of test 1.
3. `'pause and single step freeze both'`: `gate` blocks at step 100. After 300 ms of wall time, `getInfo().cycles === 100` and `world.timeMs === 1000`. The test lets one step through: `101` and `1010`.
4. `'a breakpoint holds the plant'`: run 100 steps; `setBreakpoint(pc)` on the statement `Belt := Run` (read the PC from `debugMap`; `pcOf` at `IDE/src/compiler/debugElementsRuntime.test.ts:67-73` shows how a map is read); request one more step: `heldSteps === 1` and `world.timeMs === 1000`. `removeBreakpoint(pc)`, request 100 more: `world.timeMs === completedScans × 10`.
5. `'a runtime failure stops the plant at the last completed scan'`: wrap the adapter so that `scenarioStep` rejects on its 51st call. `runLockStep` rejects with that error and `world.timeMs === 500`.

- [ ] **Step 2: Run them to see them fail**

Run: `bun test src/plant-gate/lockStep.test.ts`
Expected: FAIL, module `./lockStep` not found. If the tests are reported as skipped, the runtime binary is missing: run `bun run build:runtime` at the root.

- [ ] **Step 3: Implement `gateProgram.ts` and `lockStep.ts`**

- [ ] **Step 4: Run the tests**

Run: `bun test src/plant-gate/lockStep.test.ts`
Expected: 5 pass.

Test 4 documents how the baseline runtime behaves; no C code changes in the gate. Whatever happens, write it to `gate/check-4-graded.json` under `breakpoint`: whether the step returned normally, `heldSteps`, and `timerSkewScans` (`beltOff − eyeOn` measured in a run with one held step between them, minus the value of test 1). If the runtime rejects the step, or the held scan never completes, the breakpoint clause of check 4 fails: record the runtime's message as the finding for M1 and keep the other four tests green.

- [ ] **Step 5: Pin the graded hash, write the record, commit**

Copy the hash printed by test 1 into `GRADED_HASH`. Write `gate/check-4-graded.json` (`schema`, `check: 4`, `commit`, `host`, `gradedHash`, `timerScans`, `breakpoint`, `verdict`).

```bash
git add packages/zplc-ide/src/plant-gate specs/012-zplc-2-1-plant-simulation/gate
git commit -m "feat(plant-gate): scan-exact lock-step with the native runtime"
```

---

### Task 6: The prototype inside Studio

**Files:**
- Create: `IDE/src/plant-gate/view.ts`, `IDE/src/plant-gate/gateEntry.ts`
- Modify: `IDE/src/main.tsx` (one line), `IDE/shared/nativeSimulationEnvironment.ts:23`, `IDE/electron/security.ts:7-27` and the parameter validation near `:215-260`
- Test: the existing test files of the two modified modules (`IDE/electron/security.test.ts`, and the test file that covers `nativeSimulationEnvironment`)

**Interfaces:**
- Consumes: everything of Tasks 1 to 5; `new NativeAdapter()` (in the renderer it uses `window.electronAPI.nativeSimulation`).
- Produces:

```ts
// view.ts
export type Quality = 'low' | 'medium';
export function createView(canvas: HTMLCanvasElement, world: GateWorld, scene: GateScene, quality: Quality): { render(): void; dispose(): void };

// gateEntry.ts
export interface StressResult { frames: number; medianFrameMs: number; worstSecondFps: number; stepMsP50: number; stepMsP95: number; stepMsMax: number; maxBacklogMs: number; realTimeFactor: number }
export interface LiveResult { hash: string; completedScans: number; exchangeMsP50: number; exchangeMsP95: number; exchangeMsMax: number; realTimeFactor: number; pausedHeld: boolean }
export interface PlantGate {
  probe(): Promise<{ jolt: boolean; webgl2: boolean; gpu: string; cspViolations: string[] }>;
  runStress(options: { seconds: number; quality: Quality; view: boolean }): Promise<StressResult>;
  runLive(options: { steps: number; realTime: boolean }): Promise<LiveResult>;
}
export const plantGate: PlantGate;
```

`IDE/src/main.tsx` gains exactly this, so three.js and Jolt stay out of the start chunks:

```ts
(window as unknown as { __zplcPlantGate?: () => Promise<PlantGate> }).__zplcPlantGate = () => import('./plant-gate/gateEntry').then((module) => module.plantGate);
```

**Behaviour that the signatures do not fix:**
- `createView`: the drawing buffer is always 1920×1080 (`setPixelRatio(1)`, `setSize(1920, 1080, false)`), whatever the size of the window. Boxes are one `InstancedMesh`. `medium` has antialiasing and one directional light with a 2048 shadow map; `low` has neither. The canvas is appended to `document.body`, fixed over the right half of the window, with `pointer-events: none`. It is created with the DOM API, not with JSX.
- `probe`: `gpu` is the unmasked renderer string of WebGL; `cspViolations` collects `securitypolicyviolation` events as `directive blockedURI` from the moment the module loads.
- `runStress`: the world is `stress()`. A loop on the user-interface thread steps it by 10 ms whenever wall time is due and calls `driveStress`. `maxBacklogMs` is the largest lag of simulated time behind wall time; `realTimeFactor` is simulated time divided by wall time. With `view`, a `requestAnimationFrame` loop renders; `medianFrameMs` and `worstSecondFps` (the fewest frames in any whole second) come from its timestamps. The first 5 seconds are warm-up and are not measured.
- `runLive`: opens a session of its own on every call (connect, load, run, disconnect), because one session takes one run. It connects a `NativeAdapter`, loads the gate program, and calls `runLockStep` on a `beltBox` world with `startPulse: { from: 10, to: 15 }`. With `realTime`, `pace` waits until wall time reaches `(k + 1) × 10 ms`. The exchange time is the wall time of steps 2 to 5 of the exchange. At step 200 it pauses through `gate` for 500 ms and sets `pausedHeld` when `cycles` and `world.timeMs` did not change.

**Session changes (spike only; each is a finding for M1, see `research.md` section 8.1):**
- `nativeSimulationEnvironment`: when `environment.ZPLC_PLANT_GATE === '1'`, set `ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK = '1'` instead of deleting it. Without that variable the function behaves as before.
- `NATIVE_SIMULATION_METHODS` gains `'scenario.step'`, validated like its neighbours: the parameters are exactly `{ at_ms }`, an integer from 0 to 4294967295.

- [ ] **Step 1: Write the failing tests for the two session changes**

`'keeps the virtual clock only for the plant gate'`: with `ZPLC_PLANT_GATE: '1'` the result has `ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK === '1'`; without it, the key is absent even when the input had it.
`'allows scenario.step with exactly one uint32 at_ms'`: `{ at_ms: 10 }` is accepted; `{}`, `{ at_ms: -1 }`, `{ at_ms: 1.5 }`, `{ at_ms: 4294967296 }` and `{ at_ms: 10, extra: 1 }` are rejected.

- [ ] **Step 2: Run them to see them fail, implement, run them to see them pass**

Run: `bun test electron/security.test.ts shared`
Expected after the change: all pass, including the tests that were there before.

- [ ] **Step 3: Implement `view.ts`, `gateEntry.ts` and the line in `main.tsx`**

- [ ] **Step 4: Verify the build and the security posture**

Run: `bun run build`
Expected: the build succeeds.
Run: `bun test electron/security.test.ts electron/cspEnforcement.test.ts`
Expected: all pass, unchanged.
Run at the root: `git diff feat/plant-simulation -- packages/zplc-ide/electron/security.ts packages/zplc-ide/electron/main.ts`
Expected: only the allow-list entry and its validation. No line of `createContentSecurityPolicy` and no `webPreferences` line appears in the diff.

- [ ] **Step 5: Commit**

```bash
git add packages/zplc-ide
git commit -m "feat(plant-gate): three.js view and bench entry inside Studio"
```

---

### Task 7: Bench script (checks 3, 4, 6 and 7)

**Files:**
- Create: `IDE/scripts/plant-gate/bench.ts`
- Modify: `IDE/scripts/journeyApp.ts:390-411` (`launchPackagedApp` gains two optional parameters: `flags: string[] = ['--headless', '--disable-gpu']` and `environment: Record<string, string> = {}`)

**Interfaces:**
- Consumes: `window.__zplcPlantGate` (Task 6); `launchPackagedApp` and `App` (`IDE/scripts/journeyApp.ts`), `Cdp` (`IDE/scripts/cdpHarness.ts:102`); the executable lookup of `IDE/scripts/run-packaged-desktop-smoke.ts:20-54`; `GRADED_HASH`.
- Produces: `bun scripts/plant-gate/bench.ts --out <dir>` writes `<dir>/bench-<platform>-<arch>.json` and exits 0 when every sequence that ran passed.

The bench runs the **packaged, unpacked** application, because the production content security policy applies only there (`IDE/electron/main.ts:153`). It launches it with `ZPLC_PLANT_GATE=1`, a fresh `--user-data-dir`, and for sequences 1 to 4 the flags `['--window-size=1920,1080']` (a real window, GPU on).

| # | Sequence | What it does | Passes when |
|---|---|---|---|
| 1 | `probe` (check 6) | `probe()`; collects console errors over the protocol | `jolt` and `webgl2` are true, `cspViolations` is empty, and no console error mentions `Content Security Policy` |
| 2 | `live` (check 4) | `runLive({ steps: 800, realTime: true })`, then `runLive({ steps: 6000, realTime: true })` | The first hash equals `GRADED_HASH`; `pausedHeld` is true; `realTimeFactor ≥ 0.99` in both (*plan threshold*) |
| 3 | `stress` (check 3) | `runStress({ seconds: 65, quality, view: true })` for `medium` and for `low` | Per quality: `medianFrameMs ≤ 17.5` and `worstSecondFps ≥ 30` (the spec's "60 typical, never below 30"); `realTimeFactor ≥ 0.995` and `maxBacklogMs ≤ 50` (*plan threshold* for "without missing its fixed step"). The machine passes when `low` passes (VIS-005); `medium` is recorded. |
| 4 | `latency` (check 7) | Opens an example project and a Structured Text file as the packaged smoke opens its project, focuses the code editor, and types 500 characters, one every 100 ms, with `Input.dispatchKeyEvent`. First with no plant, then while `runStress({ seconds: 70, quality: 'low', view: true })` runs. | The 95th percentile with the plant is at most 100 ms (spec). The baseline's 50th and 95th percentiles are recorded. |
| 5 | `noGpu` | Relaunches with `['--headless', '--disable-gpu']`; `probe()`, then `runLive({ steps: 800, realTime: false })` | The hash equals `GRADED_HASH` whatever `webgl2` says (P14) |

**The latency sample.** Before typing, the page installs `new PerformanceObserver(...).observe({ type: 'event', durationThreshold: 16 })`. The sample of one key press is the largest `duration` among the `keydown`, `keypress`, `beforeinput` and `input` entries whose `startTime` falls between that key press and the next. A key press with no entry counts as 16 ms, the floor of the interface. Synthetic DOM events are not measured by the browser, which is why the keys go through the protocol.

**The record.** `schema: "zplc.plant-gate-bench/1"`, `commit`, `dirtyTree`, `started`, `finished`, `host` (`platform`, `arch`, `cpu`, `memoryGb`, `gpu`, `screen` width, height and refresh rate), then one key per sequence with every number above and its `verdict`.

- [ ] **Step 1: Build the unpacked application**

Run: `bun run build:assets && bun run build && bun run electron:compile && bunx electron-builder --dir`
Expected: exactly one unpacked application under `IDE/dist-electron/`.

- [ ] **Step 2: Write `bench.ts` and the two parameters of `launchPackagedApp`**

- [ ] **Step 3: Run it on this machine**

Run: `bun scripts/plant-gate/bench.ts --out ../../specs/012-zplc-2-1-plant-simulation/gate`
Expected: the JSON file has the five keys `probe`, `live`, `stress`, `latency`, `noGpu`, each with a verdict. The machine needs a desktop session; keep the window visible, on mains power, with no other heavy program. If the executor has no display, a person runs this one command.

- [ ] **Step 4: Confirm the journeys still launch**

Run: `bun run smoke:desktop-packaged`
Expected: it passes as before; the default flags of `launchPackagedApp` are unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/zplc-ide/scripts specs/012-zplc-2-1-plant-simulation/gate
git commit -m "feat(plant-gate): bench for frame rate, lock-step, security and editor latency"
```

---

### Task 8: Runs on the reference machines (checks 2, 3, 4 and 7)

**Files:**
- Create: `gate/bench-<platform>-<arch>.json`, `gate/capacity-headless-<platform>-<arch>.json` and `gate/check-2.json`, all under `specs/012-zplc-2-1-plant-simulation/`

The reference machines are the spec's (section 4.3): "the owner's Linux laptop with AMD integrated graphics, a MacBook Air M1, and a Windows machine with a GPU still to be named".

The commands of one machine, after the prerequisites of `CONTRIBUTING.md` and a checkout of `spike/plant-gate`:

```bash
bun install && bun run build:runtime
cd packages/zplc-ide
bun test src/plant-gate
bun scripts/plant-gate/capacityHeadless.ts
bun run build:assets && bun run build && bun run electron:compile && bunx electron-builder --dir
bun scripts/plant-gate/bench.ts --out ../../specs/012-zplc-2-1-plant-simulation/gate
```

- [ ] **Step 1: Linux laptop.** The executor runs the commands (they were all run once in Tasks 1 to 7; run them again on the final commit). Report the repeatability line and the verdicts.
- [ ] **Step 2: MacBook Air M1.** A person runs the commands. The branch reaches the machine by a push or a copy; both are the owner's actions. The JSON files and the line `plant-gate repeatability darwin arm64 <hash>` come back to the executor.
- [ ] **Step 3: Windows.** The headless half (`bun test src/plant-gate`) runs on any Windows machine, or in CI if the owner pushes the branch and dispatches `nightly-quality.yml` on it. The bench needs the Windows machine with a GPU that the owner has not named yet (`research.md` section 9, question 8). Until it is named, record Windows as `"verdict": "pending owner"` for checks 3 and 7.
- [ ] **Step 4: Write `gate/check-2.json`.** One entry per system with the printed hash and the result of the two tests. The verdict is `pass` only when the three hashes are equal.
- [ ] **Step 5: Commit the evidence**

```bash
git add specs/012-zplc-2-1-plant-simulation/gate
git commit -m "docs(plant-gate): evidence from the reference machines"
```

---

### Task 9: Bundle size and bundle guards (VIS-013)

**Files:**
- Create: `IDE/scripts/plant-gate/bundleSize.ts`, `specs/012-zplc-2-1-plant-simulation/gate/bundle-size.json`

**Interfaces:**
- Produces: `bun scripts/plant-gate/bundleSize.ts <distDir>` prints `{ "bytes": n, "gzipBytes": n, "files": [{ "file", "bytes", "gzipBytes" }] }` for every file under `<distDir>` (gzip with `Bun.gzipSync`).

- [ ] **Step 1: Measure the baseline.** In the `feat/plant-simulation` worktree run `bun run build`, then the script of this branch on that `dist`.
- [ ] **Step 2: Measure the prototype.** The same on this branch.
- [ ] **Step 3: Write `gate/bundle-size.json`**: `base`, `gate`, `deltaBytes`, `deltaGzipBytes`, and the files that exist only in the prototype build. The spec's limit is "50 MB of installer growth per platform"; this number covers the two libraries only, with no part and no asset, and the report must say so.
- [ ] **Step 4: Run the production bundle test.** Run: `bun test scripts/welcomeBundle.test.ts`. Record each failure and what it names (a start chunk, a worker, a host name) under `bundleGuards` in the same file. Do not edit the test: what it rejects is a finding for M1.
- [ ] **Step 5: Commit**

```bash
git add packages/zplc-ide/scripts/plant-gate specs/012-zplc-2-1-plant-simulation/gate/bundle-size.json
git commit -m "docs(plant-gate): bundle growth of three and jolt-physics"
```

---

### Task 10: Prior art (check 8)

**Files:**
- Create: `specs/012-zplc-2-1-plant-simulation/gate/prior-art.md`

- [ ] **Step 1: Read Open Industry Project at one commit.** Clone `https://github.com/Open-Industry-Project/Open-Industry-Project` into a scratch directory outside this repository and note the commit. Read it; run nothing from it and copy nothing into ZPLC (P17).
- [ ] **Step 2: Write the table.** Columns: item, path at that commit, what it is, licence, the ZPLC part it would serve, verdict (`reuse`, `study`, `no`), reason. Cover at least: straight, curved and roller conveyors; diverters and pushers; photo-eyes and the other sensors; boxes and pallets; grippers and pick-and-place; tanks or process parts; meshes and textures; and its belt technique, compared with Task 2.
- [ ] **Step 3: Check the licences.** The licence of a row is the notice of that file or asset; "MIT (repository)" is written only when the item carries no notice of its own. A row is `reuse` only when its licence allows it, and it then carries the attribution line ZPLC would publish. An item with an unclear licence is `study`.
- [ ] **Step 4: Commit**

```bash
git add specs/012-zplc-2-1-plant-simulation/gate/prior-art.md
git commit -m "docs(plant-gate): prior art in Open Industry Project"
```

Check 8 passes when every `reuse` row has a licence that permits it and its attribution line.

---

### Task 11: The gate report

**Files:**
- Modify (in the `feat/plant-simulation` worktree): `specs/012-zplc-2-1-plant-simulation/research.md`, and `spec.md` only as Step 4 says
- Create (same worktree): `specs/012-zplc-2-1-plant-simulation/gate/`, brought from the spike

- [ ] **Step 1: Bring the evidence, and only the evidence**

Run in the `feat/plant-simulation` worktree: `git checkout spike/plant-gate -- specs/012-zplc-2-1-plant-simulation/gate`
Run: `git status --short`
Expected: only files under `specs/012-zplc-2-1-plant-simulation/gate/`.

- [ ] **Step 2: Append `## 11. Gate results` to `research.md`**

- One row per check: verdict (`pass`, `fail` or `pending owner`), the numbers that decide it, the evidence file, the commit of `spike/plant-gate`.
- The answers to the eight questions of section 9, each with its number. Question 2 is answered for one thread; say why several threads were not measured (see "If a check fails").
- The tuning used in check 1 and the plant step that passed.
- The measured growth for the table of section 4, and the licences of the pinned versions. Change a **Not verified** mark in sections 3 and 4 to **Verified** only where this gate verified it.
- "Findings for M1": the session changes of Task 6, the breakpoint behaviour of Task 5, the bundle guards of Task 9, the product gates the prototype would trip if it were merged (`scripts/release/sbom.ts --check`, `tools/ci/spec-tracking.test.ts`), and every *plan threshold* with the number measured against it.

- [ ] **Step 3: Write the outcome by the rule of spec section 6.1**

Quote the sentence of the "Outcome" paragraph that applies. Checks that are `pending owner` keep the gate open; say exactly what is missing.

- [ ] **Step 4: Update the decision only if the gate confirms it**

If all eight checks pass on the three reference machines, append to the "Decided" cell of D-14 in `spec.md` section 4.2: "Confirmed by the feasibility gate on <date> (`research.md` section 11)." In every other case leave `spec.md` as it is: the decision returns to the owner.

- [ ] **Step 5: Verify and commit**

Run at the root: `bun test ./tools/ci/spec-tracking.test.ts`
Expected: pass.

```bash
git add specs/012-zplc-2-1-plant-simulation
git commit -m "docs(spec-012): record the feasibility gate results"
```

- [ ] **Step 6: Hand over.** Tell the owner the verdict of each check, what is pending, and that `spike/plant-gate` stays unmerged. Delete the branch or its worktree only when the owner says so.

---

## If a check fails
These are the branches of the "Outcome" paragraph of spec section 6.1. Run a contingency only when its condition holds, record it in `research.md` section 11, and keep the failed evidence.

| Failure | Action | Decides |
|---|---|---|
| Only check 1 | Contingency A, then repeat Tasks 2 to 5 on the other library | Executor; the owner is told |
| Check 2 | Stop after Task 8. Report the three hashes and where the traces first differ | Owner: a grade with tolerances, or another library |
| Check 7 | Contingency B, then repeat sequences 1 to 4 of the bench | Executor; the owner is told |
| Check 3, on any machine | Tune in this order and measure again after each: the 10 ms plant step if it passed check 1; Contingency B; quality `low` with shadows and antialiasing off. If it still fails, stop | Owner: option B of D-14, with the costs of `research.md` section 2 |
| Check 4, live hash differs from the graded hash | Stop. Report the first scan at which the two traces differ | Owner |
| Check 4, breakpoint clause only | Not a reason to change the stack. Report it as C work for M1 | Owner is told |
| Check 5 or 6 | Stop. Neither has a fallback in the spec | Owner |

The multi-threaded flavours of `jolt-physics` are not a tuning option: they need `SharedArrayBuffer`, which needs cross-origin isolation headers, and VIS-012 forbids weakening the security posture inside the gate. If capacity fails on one thread, say so in the report.

**Contingency A: Rapier.** Ask the owner before adding `@dimforge/rapier3d-compat` (a new dependency). Add `createRapierWorld(scene: GateScene, stepMs?: number): Promise<GateWorld>` in `IDE/src/plant-gate/rapierWorld.ts`, with the belt as a kinematic body that carries what rests on it, since Rapier's JavaScript interface has no contact modification (`research.md` section 3). The tests of Tasks 1 to 5 run against it without changing a threshold.

**Contingency B: physics off the user-interface thread.** Move `createWorld` and `runLockStep` into a Web Worker; the view receives the state of the bodies after each scan as a transferred `Float32Array`. The policy already allows `worker-src 'self' blob:`. `IDE/scripts/welcomeBundle.test.ts:148-151` will fail, because it allows only `editor.worker`: record that as a finding for M1 and do not edit the test.

## Done when
- [ ] `research.md` has section 11 with a verdict, numbers and an evidence file for each of the eight checks.
- [ ] Every evidence file under `gate/` names its commit and its machine.
- [ ] The outcome sentence of spec section 6.1 that applies is quoted, and D-14 in `spec.md` changed only if every check passed.
- [ ] `spike/plant-gate` is unmerged, and nothing from `IDE/` on that branch is on `feat/plant-simulation`.
- [ ] The owner has the list of what is pending on their side.
