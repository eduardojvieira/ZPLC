# ZPLC 2.1 Milestone M2 Implementation Plan: numeric signals end to end, process parts, operator panel (PROVISIONAL, revision 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Provisional.** M2 builds on M1 **as merged** on `feat/plant-simulation` at commit `c8705332` (`Merge branch 'fix/m1-toolbar-transport-state' into feat/plant-simulation`, read with `git log --oneline -1` on 2026-11-12, about 23:15 -03). The gate verdict of decision D-14 is **still pending the owner's macOS and Windows runs** (`research.md` section 11): D-14 is confirmed on Linux x64 only. M2 is almost physics-free (the tank is a numeric model with no rigid body, PLT-009), so the exposure is small: the tasks that touch Jolt or pin a trace hash are marked **PHYS-adjacent** in the lane table (N6, N9, F3, F4). If macOS or Windows overturns D-14, those four re-pin hashes or re-run on the new library; every other task is written against `PlantCore`, `PlantSnapshot`, `PartRuntime` and the scenario seam and survives (**KEEP**), exactly as the tasks of plan M1 marked KEEP.

**Goal:** Deliver milestone M2 of spec 012 (spec section 6.2: "Numeric signals end to end, process parts, operator panel"): INT and REAL signals travel from the part, through the scan exchange, to the program and back, in the live session and in the graded run, with the documented scaling of the typed plant map; the process parts (a tank with fill and discharge valves, level and flow meters) and the operator-panel parts (selector switch, emergency stop, stack light, potentiometer, numeric display) exist in the catalogue with tests, documentation and a 3D drawing; and reference scenes **3 (Timed tank)** and **12 (Tank level control)** ship with a reference program that passes, a starter that fails, a pinned Linux trace hash and a regenerated scene index, in English and Spanish documentation, in a state that could ship as a 2.1 pre-release.

**Architecture:** Nothing in the M1 architecture changes. The numeric work lives at three seams and one new part family. (1) A new pure module `plant/scaling.ts` converts between **raw** values (what the program's INT or REAL variable holds) and **engineering** values (what the core uses, in the signal's unit) with the `range` of the typed plant map. (2) `exchangeScan` of the scenario seam, which the live session and the graded run both call (PLT-017), applies that scaling, so there is one implementation: the callbacks it receives carry raw values. The live exchange (`session/exchange.ts`) encodes and decodes raw values as 16-bit and 32-bit little-endian slots of the same two memory images it already reads and writes once per scan (LNK-003); the graded run (`test-engine/index.ts`, `cli/nativeScenarioRuntime.ts`) gains optional numeric port methods. (3) The core's `apply`, `sense`, `operate` already type values `boolean | number` (contract C4): only validation and range clamping are added. The process part is a pure numeric model (`stepTank`) wrapped in a `PartRuntime`, stepped on the 5 ms plant step, written with `+ - * /` only so it is bit-for-bit repeatable on every platform (PLT-006). No firmware, no C, no IPC allow-list and no Electron main-process change is needed: `memory.read` and `memory.write` of at most 64 bytes already carry any scalar (contract C5).

**Tech Stack:** TypeScript 5.9 (`erasableSyntaxOnly`: no parameter properties), React 19 with the React Compiler lint, Bun 1.3.14 (`bun test`), three 0.187.0 and `jolt-physics` 1.1.1 as in M1 (no new dependency), the Studio UI kit (`IDE/src/ui`, `RangeField` at `IDE/src/ui/Field.tsx:172`; its export from `IDE/src/ui/index.ts` is **Unconfirmed**), `PID_Compact` of the compiler standard library (`packages/zplc-compiler/src/compiler/stdlib/process.ts:531`; the spec cites `:530`).

**Spec:** `spec.md` sections 5 (PLT, VIS, PRT, SCN, LNK, CRS) and 6.2, reference scenes 3 and 12 of the SCN table; `plan-m1.md` revision 2 (format, contracts C1 to C8, lanes); the run logbook `odd/tasks/zplc-2-1-0-run.md` (entries L1 to L46) in the main checkout; `course-outline.md` rows 13.1 to 13.4. Read the spec sections of your task before you start.

**Created:** 2026-11-12 by a planning agent. Anything marked **Unconfirmed** was not verified while writing; the executor confirms it first and records the answer in the commit body.

**Path shorthand:** `IDE/` is `packages/zplc-ide/`; `COMPILER/` is `packages/zplc-compiler/src/`; `CORE/` is `firmware/lib/zplc_core/`. `bun test`, `bun run lint` and `bunx tsc -b` run with `IDE/` as the working directory unless the step says "at the root". The pinned formatter is `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --write` (or `--check`), at the root.

## Roles
| Role | Does |
|---|---|
| Executor | One task each, in its lane. Writes tests first, runs the commands, commits. Never edits a file outside the task's "Allowed edit surfaces". `git add` every new file **before** running the formatter (it only sees tracked files). |
| Parent | Owns git across lanes, merges lanes in dependency order, runs the seam check (full IDE suite once) at each wave merge, regenerates `IDE/src/generated/sceneIndex.ts` and pins `IDE/src/plant/ci/sceneHashes.json` once per wave (so two scene tasks never edit them), runs `format --write` after each merge batch, and launches the independent verifiers named in "Done when". |
| Owner | Records the gate verdict (macOS, Windows), answers the open questions at the end (question 1 gates Task N10), approves `course-outline.md` (CRS-001; gates Task L3), runs the macOS and Windows hash and evidence runs. |

## Start rule
1. **Precondition A, M1 as merged.** `feat/plant-simulation` at `c8705332` or later: `rg -n "schemaVersion: 2" IDE/src/plants/plantMap.ts`, `fd -t f . IDE/src/plant/core/parts` shows `conveyors.ts flow.ts items.ts panel.ts sensors.ts sources.ts`, and `IDE/src/plant/session/plantSession.ts` exists. If not, stop: the parent merges first.
2. **Precondition B, the gate.** Not blocking for M2 (see the provisional note), but the owner's verdict decides whether the **PHYS-adjacent** tasks are redone. The plan proceeds at risk, as M1 did.
3. **Fresh worktree.** `bun install`, `bun run build:compiler` and `bun run build:runtime` first (the native-runtime tests and the journeys need the worktree's own runtime binary; see Global Constraints).
4. **Order.** Task N0 first; it is the only task of wave 1 and every later task compiles against its types.

## Requirement mapping
"Plan choice" marks a design decision of this plan that the spec does not state. Requirements that M2 does not deliver are listed in the last table so nothing is silently dropped.

| Requirement | Task(s) | Note |
|---|---|---|
| PLT-003 | N0, N3, N4, N6 | "Signals MUST be typed. BOOL, 16-bit integer and REAL are the minimum. Each signal has a direction (command: program to plant; sensor: plant to program), and a numeric signal has a unit, a range and a documented scaling to the program's variable (as IO-006 requires for analog channels)." M1 derived the type and unit from parts (`PlantSignalDef.unit`) but kept the range only in the map; N0 adds the part-side range and the rule that the map's engineering range equals it. |
| PLT-005, LNK-003, LNK-004 | N3, N9 | Unchanged: numeric slots travel in the same one read of the output image and one write of the input image per scan, so lock-step holds. N9 proves live equals graded for a numeric scene. |
| PLT-006 | N1, N6, N9, F3, F4 | The tank is written with `+ - * /` only; the trace already records sensor values as float32 (`IDE/src/plant/core/trace.ts`, `createTrace().record`). Hash pinned on Linux; macOS and Windows are the owner's. |
| PLT-009 | N1, N6 | "A process without rigid bodies (tank level, flow) MUST be a numeric model stepped on the same clock, with its equations documented." Equations in `PartDefinition.equations` (N0 type, N1 text), generated into the docs (D3). |
| PLT-010 | N1, N6 | New facts: `level:<Name>`, `volume:<Name>`, `spilledL:<Name>`, `highs:<Name>`, `inBand:<Name>`. |
| PLT-011, PRT-008 | N1, N2a | Fault actions of the new parts (tank: `inletStuck`, `outletStuck`, `levelStuck`, `leak`; emergency stop: `wireBreak`; selector and potentiometer: `stuck`). |
| PLT-012 | N6 | Capture, restore and reset of a running tank scene (the core's journal replay already covers it; N6 proves it). |
| PLT-016 | N3, N6 | Located messages for a type mismatch, an out-of-range operation and a numeric slot that does not fit the 64-byte exchange. |
| PLT-017 | N3, N4, N9 | One scaling implementation, called by `exchangeScan` for both paths. |
| VIS-003 | N7 | "The view MUST show the state that matters for control ... with a cue other than colour for every state." Numeric parts show their value as text and a fill. |
| VIS-008 | N8 | Levels and values are announced on a change of band, not every scan. |
| VIS-010 | N2a, N8, Q3 | "While a scene runs, a person MUST be able to operate panel parts (push button, selector, emergency stop, potentiometer), trigger a fault action and, where the scene allows it, add or remove an item, by pointer and by keyboard." M1 delivered the push button; M2 delivers the other three. Q3 covers the keyboard-only journey. |
| VIS-011 | N8, D3 | English and Spanish; Studio component kit. |
| PRT-001 | N1, N2a, N2b | Catalogue rows "Process" and "Operator panel": "Tank with fill and discharge valves (on/off and proportional), level meter, flow meter" and "Push button, selector switch, emergency stop, indicator light, stack light, potentiometer, numeric display". Plan choice: the valves, the level meter and the flow meter are **signals and variants of the one `tank` part**, not separate placeable parts (open question 4). |
| PRT-002 | N1, N2a, N2b, D3 | One definition per part; the generated reference is compared in CI. |
| PRT-003 | N1, N2a, N2b | Behaviour tested on the headless core with limits. |
| PRT-004 | N1, N2a | "Where a reference scene needs both, a part MUST offer a digital variant (commands and limit sensors) and a numeric variant (setpoint and feedback)." Tank: `variant` digital or numeric. Selector: `output` contacts or integer. Scenes 3 and 12 each need one. |
| PRT-007 | N1 | Snap points of the tank (they also give the schematic its footprint, `IDE/src/plant/schematic/schematic.ts`). |
| PRT-009 | N7 | Geometry in code; no asset. |
| PRT-010 | N1 | A test adds the tank without a change to the scene format version, the link or the lesson code. |
| SCN-001 to SCN-004 | F3, F4 | Scenes 3 and 12, original layouts, reference passes, starter fails, in CI. |
| SCN-005 | N6, N9, N10 | "A scenario MUST be able to script panel inputs, item emission and fault actions at virtual times, and to assert on plant facts with the expectation kinds that exist today." Numeric `operate` values already parse (`scenePort.ts` `compileSceneBlock`). Asserting a numeric fact by value is an open owner question (question 1); N10 is conditional on it. |
| SCN-007 | F3, F4 | Each scene declares `shortestPulseMs`. |
| SCN-011 to SCN-013 | N5 | The editor's signal list, type check and declaration generator for numeric signals; the range is prefilled from the part, never invented. |
| LNK-001, LNK-002 | N0, N3, N5 | The exact type of a numeric signal and its variable is checked (today only BOOL against not-BOOL is). |
| LNK-006 | N9 | A forced numeric input keeps its forced value over the plant's write. |
| CRS-003 to CRS-006, CRS-011 (M2 scenes) | L3, D3 | Lessons 13.1 to 13.4. **Conditional** on the owner approving `course-outline.md` (CRS-001). |
| CRS-007 (partial), CRS-008 (FBD) | L3 | Timers (13.1), analog scaling (13.2), PID with `PID_Compact` (13.3, 13.4); 13.4 is the FBD lesson. |

**Not delivered by M2** (later milestones, per spec 6.2, or out of scope): PRT-005 (vision sensor identity, light array height, scale weight: M4), PRT-004 for manipulators (M3), pipes between tanks, heat and mixing, sensor noise (nothing in the spec asks for it; a seeded noise option would enter the trace and is deferred), PLT-007 and PLT-008 beyond what M1 proved, LNK-007 to LNK-018 (M6, firmware and plant I/O mode), CRS-001, CRS-002, CRS-007 (the rest), CRS-009, CRS-010, CRS-012, CRS-013 (M6 and M7), a numeric readout drawn **inside** the 3D view (the display's number is shown in the operate panel and the text equivalent; N7 draws the display box and its fill only), scenes 1, 2, 4, 5 to 11 and 13 to 21 (other milestones or done in M1).

## Contract extensions (types and rules; lanes code against these, never against each other)
M2 **extends** contracts C1 to C8 of plan M1; it changes none of them. Task N0 writes the type changes below into `IDE/src/plant/contracts.ts` and the pure functions into `IDE/src/plant/scaling.ts`. Changing one needs the parent: every lane depends on it.

```ts
// IDE/src/plant/contracts.ts  (additions; every other declaration stays as merged in M1)

/** C2 amended: one optional field. PLT-003: "a numeric signal has a unit, a range ...". Absent for BOOL. */
export interface PlantSignalDef {
  name: string;
  direction: 'command' | 'sensor';
  type: SignalType; // 'BOOL' | 'INT' | 'REAL' of the plant signal (INT: integer-valued physics, REAL: continuous)
  unit?: string;
  /** The engineering range of a numeric signal, in `unit`. The plant map's `eng_min`, `eng_max` and `unit` MUST equal it (rule R-S below). */
  range?: { min: number; max: number };
}

/** C2 amended: a new family and the documented equations of a process model (PLT-009). */
export interface PartDefinition {
  // ...existing fields...
  family: 'items' | 'sources' | 'conveyors' | 'flow' | 'sensors' | 'panel' | 'process';
  /** The equations of a process model, in prose and symbols, both languages; generated into the parts reference (D3). Required for family 'process'. */
  equations?: { en: string; es: string };
}
```

```ts
// IDE/src/plant/scaling.ts  (new, Task N0; pure, no import but types)
import type { PlantSignal, SignalRange } from '../plants/plantMap';
export type ScaledSignal = { type: 'INT' | 'REAL'; range: SignalRange };
/** Raw program value to engineering value. Rule R-S1. */
export function toEngineering(signal: ScaledSignal, raw: number): number;
/** Engineering value to the raw value the program variable holds. Rule R-S2. */
export function toRaw(signal: ScaledSignal, eng: number): number;
/** Located problems of a map signal against the part's signal definition. Rule R-S3. Empty means valid. */
export function validateScaling(def: import('./contracts').PlantSignalDef, signal: PlantSignal): string[];
```

**Rules (fixed here, written once, tested in N0):**
- **R-S1 raw to engineering.** `r = clamp(raw, raw_min, raw_max)`; `eng = eng_min + ((r - raw_min) / (raw_max - raw_min)) * (eng_max - eng_min)`. Double arithmetic, basic operators only.
- **R-S2 engineering to raw.** `e = clamp(eng, eng_min, eng_max)`; `raw = raw_min + ((e - eng_min) / (eng_max - eng_min)) * (raw_max - raw_min)`. For `INT`: `Math.round(raw)` (ties toward +infinity, as ECMAScript fixes it), then clamp to `raw_min..raw_max`. For `REAL`: `Math.fround(raw)`. A value outside the range **saturates**, it never wraps. These are the only `Math` calls in the module.
- **R-S3 map against part.** A numeric map signal is valid when: the part signal has a `range`; the map's `type` is `INT` or `REAL` (either, for a numeric part signal: this is the IO-006 analog-channel case, a REAL physical value on an INT raw channel); `eng_min`, `eng_max` and `unit` equal the part's `range.min`, `range.max` and `unit`; and, for `INT`, `raw_min..raw_max` fits `-32768..32767` (already checked by `plantMap.ts`). A BOOL part signal takes a BOOL map signal only. Raw range and the program variable are free: the raw range is the lesson's choice (open question 3).
- **R-X value types at each seam (C9).** Inside the core (`apply`, `sense`, `operate`, `facts`, `PartView.signals`): BOOL is `boolean`; INT and REAL are `number` **engineering values** within the signal's `range`. At the exchange (between `exchangeScan` or `exchangeOnce` and the program image): **raw values**: `boolean`; INT an integer in `raw_min..raw_max`; REAL a float32-representable double. `exchangeScan` converts; nobody else scales.
- **R-X1 commands.** A numeric command read from the program that is not finite (REAL `NaN` or infinity) is **ignored**: the plant keeps the previous value of that command. A finite one is clamped to the signal's range by R-S1 and again, idempotently, by `PlantCore.apply`.
- **R-X2 core validation.** `PlantCore.apply` throws a located `Error` when a value's JS type does not match the signal's type (`plant: Tank1.fill is BOOL, got 12`), and a `RangeError` for a non-finite number. `PlantCore.operate` throws a located `RangeError` for a numeric value outside the range (`plant: Pot1.value 120 is above the limit 100 %`); the operate panel's slider cannot produce one, a scenario script can (an authoring error is a located message, never a silent clamp).
- **R-X3 exchange layout.** `planExchange` (`IDE/src/plant/session/exchange.ts`) lays out **slots**: a BOOL is one bit of a byte (as in M1); an INT is a 2-byte and a REAL a 4-byte little-endian slot at the program variable's address (`DeclaredInput.address`, `DeclaredInput.size` of `IDE/src/runtime/declaredInputs.ts:18-28`; `DeclaredOutput` of `IDE/src/runtime/ioMap.ts:13-23`). The input span and the output span are each the bytes from the lowest slot address to the end of the highest slot (`max(address + width) - min(address)`, not `max(address) - min(address) + 1` as for bits), and each must be at most `MAX_EXCHANGE_BYTES` (64); a longer span is a located problem that tells the author to map the points closer together. A numeric signal's program variable must be `INT` (width 2) or `REAL` (width 4), in the input image for a sensor and the output image for a command, and its type must **equal** the map's `type`.
- **R-G graded run.** `ScenarioRuntimePort` (`IDE/src/test-engine/index.ts:25-33`) gains two **optional** methods `setInputNumber(address, type, raw)` and `readOutputNumber(address, type)` (Task N4). `CompiledScene.commands` and `.sensors` entries gain an optional `numeric?: { type: 'INT' | 'REAL'; size: 2 | 4 }`. A scene with a numeric signal and a runtime without those methods is a located compile problem. A scenario with no `"scene"` block, and a scene with BOOL signals only, compile and run **exactly** as before (the 2.0 snapshot test of S1 stays).
- **R-E scenario expectations.** Unchanged in M2: every expectation value is boolean and a `fact:` read is true-ish when a number is above 0 (`factTruthy`, `IDE/src/test-engine/scenePort.ts`). **Numeric comparison in a condition is an open owner question (question 1) and is not decided here.** Scenes 3 and 12 are written so that they pass with boolean-only expectations, using plant-derived boolean-readable facts (`highs:`, `spilledL:`, `inBand:`); Task N10 (conditional) adds comparison and may then tighten scene 12.

**Part signal tables (names are API for scenes, maps and scenarios; `<Name>` is `ScenePart.name`).** Plan choice throughout.

| Part id | Family | Signal | Direction | Type | Range, unit | Config (key: range, default) | Fault actions |
|---|---|---|---|---|---|---|---|
| `tank` (digital) | process | `fill`, `drain` | command | BOOL | | `variant`: digital or numeric, numeric; `widthM`: 0.2 to 2, 0.4; `depthM`: 0.2 to 2, 0.25; `heightM`: 0.3 to 2, 1; `initialFraction`: 0 to 1, 0; `inletMaxLps`: 1 to 50, 20; `outletCoef`: 1 to 50, 12 (L/s per square root of metre at full opening); `valveTauS`: 0 to 5, 0.5; `highFraction`: 0.5 to 1, 0.8; `lowFraction`: 0 to 0.5, 0.2; `bandLow`: 0 to 1, 0; `bandHigh`: 0 to 1, 1; `leakLps`: 0 to 10, 1 | `inletStuck`, `outletStuck`, `levelStuck`, `leak` |
| `tank` (digital) | process | `levelLow` (TRUE at or below `lowFraction`), `levelHigh` (TRUE at or above `highFraction`) | sensor | BOOL | | (same part) | |
| `tank` (numeric) | process | `fill`, `drain` (valve opening) | command | REAL | 0 to 100 `%` | | |
| `tank` (numeric) | process | `level` | sensor | REAL | 0 to `heightM` `m` | | |
| `tank` (numeric) | process | `flowIn`, `flowOut` | sensor | REAL | 0 to `inletMaxLps`, 0 to `outletCoef * detSqrt(heightM)`, `L/s` | | |
| `selector-switch` | panel | contacts: `pos0` to `pos<n-1>`; integer: `position` | sensor | BOOL; INT | `position`: 0 to `positions - 1` | `positions`: 2 to 4, 3; `output`: contacts or integer, contacts | `stuck` |
| `emergency-stop` | panel | `pressed` (person operates it; latches), `ok` (normally-closed contact: TRUE while released) | sensor | BOOL | | | `wireBreak` (`ok` reads FALSE as if the wire were cut) |
| `stack-light` | panel | `red`, `amber`, `green` | command | BOOL | | | |
| `potentiometer` | panel | `value` | sensor | REAL | `min` to `max`, `unit` | `min`: -1000 to 1000, 0; `max`: -1000 to 1000, 100; `initial`: -1000 to 1000, 0; `unit`: one of `%`, `m`, `L/s`, `bar`, `V`, `C`; default `%` | `stuck` |
| `numeric-display` | panel | `value` | command | REAL or INT by `type` | `min` to `max`, `unit` | `type`: REAL or INT, REAL; `min`, `max`, `unit` as the potentiometer; `decimals`: 0 to 3, 1 | |

**Tank equations (documented in `PartDefinition.equations`, both languages; the one source of truth for PLT-009).** State: level `h` in m, valve openings `uIn` and `uOut` in 0 to 1, `spilled` in L. Constants: area `A = widthM * depthM` (m squared), plant step `dt = 0.005 s`. Per plant step, in this order:
1. Valve command to target: digital `cmd` is 1 for TRUE and 0 for FALSE; numeric is `clamp(value, 0, 100) / 100`. A valve with the stuck fault keeps its current opening.
2. First-order valve lag: if `valveTauS <= dt` then `u = target`, else `u = u + (target - u) * dt / valveTauS`.
3. Flows in L/s: `qIn = inletMaxLps * uIn`; gravity discharge (Torricelli, head `h`): `qOut = outletCoef * uOut * detSqrt(h)`; with the `leak` fault, a further constant `leakLps` leaves the tank.
4. Level: `h = h + (qIn - qOut - qLeak) * dt / (1000 * A)`; if `h < 0` then `h = 0`.
5. Overflow: if `h > heightM` then `spilled = spilled + (h - heightM) * 1000 * A` and `h = heightM`.
`detSqrt(v)` is the square root by a fixed number of Newton iterations written with `+ - * /` only (seed `1` for `v >= 1`, `v` otherwise; 12 iterations; `0` for `v <= 0`), so it is identical on every platform. `Math.sqrt`, `Math.pow`, `Math.exp`, `Math.log`, trigonometry, `Math.random` and `Date` are **forbidden** in process models (a test greps the source). With a Torricelli outlet the tank empties in finite time `2 * sqrt(h0) * 1000 * A / outletCoef` at full opening; with the defaults (`A = 0.1`, `h0 = 0.8`) that is about 14.9 s. The plan choice of a Torricelli outlet over a linear one is open question 2.

**Facts (plan choice; names are API for scenarios, the text equivalent and the trace).**
`level:<Name>` (metres, rounded to 0.001, like `position:` facts), `volume:<Name>` (litres, rounded to 0.1), `spilledL:<Name>` (litres spilled since the start, rounded to 0.1), `highs:<Name>` (count of rising edges of `h >= highFraction * heightM`), `inBand:<Name>` (boolean: `bandLow * heightM <= h <= bandHigh * heightM`; with the defaults always true, so a scene sets the band it grades). All five exist in both variants. The fact grammar of `IDE/src/plant/ci/sceneCheck.ts` (`FACT_GRAMMAR`, `factFault`) and the text equivalent learn them in N6 and N8.

**View state keys (so V-lane tasks code against fixed names).** A tank `PartView` has `state = { level, heightM, fraction, spilling }` (numbers, `spilling` boolean) and a pose from `marker()` with size `[widthM, heightM, depthM]` centred half a height above the part position. A potentiometer or display has `state = { value, min, max, fraction, unit, text }`. The `part` field of a `PartView` is a **view kind**: `'tank'`, `'selector-switch'`, `'emergency-stop'`, `'stack-light'`, `'potentiometer'`, `'numeric-display'` (M1 used `'sensor'` for the two sensor definitions and `'push-button'`, `'indicator-light'`, so a view kind is not always the catalogue id; confirm before relying on it).

## Lanes and dependency graph
**KEEP** = survives any gate outcome. **PHYS-adjacent** = loads Jolt through `createPlantCore` or pins a trace hash, so it is re-run if D-14 is overturned.

| Lane | Task | Title | Kind | Depends on | Lane-owned surface (summary) |
|---|---|---|---|---|---|
| N | N0 | Contract extensions, scaling module, exact type check, docs-generator family | KEEP | A | `IDE/src/plant/contracts.ts`, `scaling.ts`, `IDE/src/plants/plantMap.ts`, `tools/docs/plant-parts-reference.ts` |
| P | N1 | Tank process model and part | KEEP | N0 | `IDE/src/plant/core/parts/process.ts` |
| P | N2a | Operable panel parts: selector, emergency stop, potentiometer | KEEP | N0 | `IDE/src/plant/core/parts/operable.ts` |
| P | N2b | Indicator panel parts: stack light, numeric display | KEEP | N0 | `IDE/src/plant/core/parts/indicators.ts` |
| R | N3 | Numeric scan exchange, shared scaling in `exchangeScan` | KEEP | N0 | `IDE/src/plant/session/exchange.ts`, `IDE/src/test-engine/scenePort.ts` |
| E | N5 | Editor: numeric map, prefilled range, declarations | KEEP | N0 | `IDE/src/plant/editor/{mapEditor,SignalTable,declarations}` |
| P | N6 | Core integration: register parts, numeric validation, facts grammar, pinned hash | PHYS-adjacent | N1, N2a, N2b | `IDE/src/plant/core/plantCore.ts`, `hashes.json`, `IDE/src/plant/ci/sceneCheck.ts` |
| S | N4 | Graded run drives numeric signals | KEEP | N3 | `IDE/src/test-engine/index.ts`, `IDE/src/cli/nativeScenarioRuntime.ts` |
| V | N7 | View: tank and panel drawing, numeric cues | KEEP | N0 | `IDE/src/plant/view/{geometry,cues,renderer}.ts` |
| V | N8 | Operate panel for numeric parts; announcements; strings | KEEP | N0, N2a (N6 to run end to end) | `IDE/src/plant/ui/{OperatePanel,NumericControls}.tsx`, `IDE/src/plant/text/describe.ts`, `IDE/src/i18n/catalog/plantView.ts` |
| S | N9 | Live equals graded for a numeric scene; forced numeric input | PHYS-adjacent | N3, N4, N6 | `IDE/src/plant/ci/liveVersusGradedNumeric.test.ts`, `IDE/src/plant/ci/fixtureNumeric/*` |
| F | F3 | Scene 3, Timed tank | PHYS-adjacent (hash) | N6, N8 | `IDE/plant-scenes/timed-tank/*` |
| F | F4 | Scene 12, Tank level control | PHYS-adjacent (hash) | N3, N4, N6, N9 | `IDE/plant-scenes/tank-level-control/*` |
| D | D3 | Docs EN/ES: numeric signals, tank, operator panel; parts reference with equations | KEEP | N1, N2a, N2b, N3 | `docs/docs/plant/*`, `docs/i18n/es/.../plant/*`, `tools/docs/plant-parts-reference.ts` |
| S | N10 | Numeric comparison in scenario conditions (**conditional on open question 1**) | KEEP | N4, owner answer | `IDE/src/test-engine/index.ts` |
| L | L3 | Lessons 13.1 to 13.4 (**conditional on the course-outline approval**) | KEEP | F3, F4, M1 task L1 | `IDE/lessons/plant-timed-tank/*` and three more |
| Q | Q3 | Journeys: operator panel by keyboard; numeric scene run | KEEP | N8, F3, F4 | `IDE/scripts/journeys/plantOperator.ts`, registration |
| Q | C1 | Requirement coverage and indexes for the M2 requirements | KEEP | all | `tools/ci/requirement-*`, generated indexes |

**Graph.**
```
N0 -+-> N1 --+
    +-> N2a -+-> N6 -+-> F3 --+
    +-> N2b -+       |        |
    +-> N3 ----------+-> N4 --+-> N9 -> F4 -> L3 (conditional) ; N4 -> N10 (conditional)
    +-> N5           |
    +-> N7           +-> N8 (also N2a) ; F3,F4,N8 -> Q3 ; N1,N2,N3 -> D3 ; all -> C1
```
**Parallel waves** (tasks of a wave have disjoint file surfaces and may run together; the parent merges at the end of each wave and runs the seam check):
1. **N0.**
2. **N1, N2a, N2b, N3, N5.**
3. **N6, N4, N7, N8.** (N8 may start with fakes after N2a; it needs N6 for its end-to-end test.)
4. **N9, F3, F4, D3.** (F4 needs N9's fixture only for the parity proof; it may start when N4 and N6 are merged. F3 and F4 never edit the scene index or the hash file: the parent does.)
5. **N10** (only after the owner answers question 1), **L3** (only after the outline approval), **Q3**, **C1**.

Shared files and who edits them: `plantCore.ts` only N6; `test-engine/index.ts` N4 in wave 3 and N10 in wave 5; `test-engine/scenePort.ts` only N3; `plant/ci/sceneCheck.ts` only N6; `plantView.ts` catalogue only N8; `tools/docs/plant-parts-reference.ts` N0 (one line) then D3; `IDE/src/generated/sceneIndex.ts` and `sceneHashes.json` only the parent.

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
- **Verification commands (per task, in this order).** In `IDE/`: `bun test <the task's test paths>`, `bunx tsc -b`, `bun run lint`. At the root, once at the end of the task: `CLANG_FORMAT=$HOME/.cache/zplc-tmp/cf/bin/clang-format bun tools/ci/format.ts --check`, `bun test ./tools/ci` (the ci tooling suite, including the line-length and product-name tests), `bun tools/ci/requirement-coverage.ts --check`. A task that touches docs also runs `bun test tools/docs` (needs the runtime built). The parent runs the full IDE suite (`bun test` in `IDE/`) at each wave merge.
- **Determinism.** No `Date`, `Math.random`, `performance.now`, unordered iteration, or `Math` beyond `abs`, `min`, `max`, `round`, `floor`, `fround` in `IDE/src/plant/core/**` and `scaling.ts`; process models use `+ - * /` and `detSqrt` only. A seeded generator only where randomness is a feature (M2 has none).
- **Security posture and dependencies.** Unchanged: sandboxed renderer, content security policy as is, no remote asset, **no new dependency** (`AGENTS.md` guideline 6). M2 touches no file under `IDE/electron/` and no C.
- **No physical operations.** Nothing here flashes, deploys, opens a serial port, forces I/O on a board or starts plant I/O mode. The only "force" in M2 is the simulated runtime's force-aware memory write, exercised headless in N9 (LNK-009, constitution rule 9).
- **Tests through public interfaces**, with the requirement ID first in the test name (`it('PLT-009 a filling tank follows the documented equation', ...)`). Each test asserts every observable effect of its rule. When a task changes an existing helper or option, add one test that its previous behaviour still holds.
- **Structural rules.** Modules at most 1600 lines (`tools/ci/ide-structure.ts`), no import cycle, no store import from a component's non-component module, no whole-store subscription; UI uses the Studio kit (`IDE/src/ui`, UX-002) and `RangeField` for a slider.
- **Docs.** Every new part, option, message and page ships in English (`docs/docs/`) and Spanish (`docs/i18n/es/docusaurus-plugin-content-docs/current/`) in the same commit series, and claims only measured facts (CRS-013). No frame-rate, latency or hardware claim is made for numeric signals.
- **Commits.** Conventional Commits, **no AI attribution and no Co-Authored-By line**, work-unit commits with tests and docs alongside the behaviour. About 400 changed lines per task is a heuristic, not a cap. Pushing, merging and opening a pull request are the owner's.
- **Shell.** `bat`, `rg`, `fd`, `eza`; not `cat`, `grep`, `find`, `ls`. No CodeGraph or prowl on this branch (stale index).

## Review Focus (conditions the spec implies; each has a test in the task that owns it)
1. Scaling is one function pair used by both paths; a numeric value never reaches the core unscaled or the program unscaled (N0, N3, N4, N9).
2. A value outside its range saturates and never wraps; a non-finite REAL command is ignored and the previous value kept (N0, N3, N6).
3. The numeric exchange keeps LNK-003: one read of the output image and one write of the input image per scan, however many numeric slots (N3).
4. A numeric slot never overlaps a BOOL bit another signal owns; the span limit counts widths (N3).
5. A forced numeric input keeps its forced value over the plant's write (LNK-006; the C side applies staged writes through `zplc_force_write_bytes`, `firmware/apps/posix_host/src/native_runtime_session.c:488-517`, which is per byte; whether a forced 4-byte REAL is held whole is **Unconfirmed** and N9 proves or falsifies it).
6. The tank never goes below 0 or above `heightM`, conserves volume (inflow minus outflow minus leak minus spill) and empties in finite time with a Torricelli outlet (N1).
7. The tank trace is identical on repeated runs and with host pacing varied; the hash is pinned (N6).
8. `describePlant` does not announce a level every scan: its change key holds a coarse band (N8).
9. A scene that existed in M1 (scenes 1, 2, 4, 8, 9) keeps its pinned hash: nothing in M2 changes its trace (N6, N9).
10. The 2.0 plants and lessons are untouched: `bun test src/plants src/test-engine src/learn` passes unchanged at every merge (PLT-013).

---

### Task N0: Contract extensions, scaling module, exact type check
**Spec:** PLT-003, LNK-001, LNK-002. **Lane N. Wave 1. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/contracts.ts
IDE/src/plant/scaling.ts
IDE/src/plant/scaling.test.ts
IDE/src/plants/plantMap.ts
IDE/src/plants/plantMap.numeric.test.ts
tools/docs/plant-parts-reference.ts
tools/docs/plant-parts-reference.test.ts
```
(`plantMap.numeric.test.ts` is a new file so the existing plant-map tests, whose name is **Unconfirmed**, are not edited. The docs generator change is one entry: `FAMILY` of `tools/docs/plant-parts-reference.ts:28` is typed `Record<PartDefinition['family'], L10n>`, so adding `'process'` to the union breaks `bunx tsc -b` there until it gains `{ en: 'Process', es: 'Proceso' }`.)

**Interfaces:** the declarations of "Contract extensions", exactly. `validateScaling` and the two conversions in `scaling.ts`; in `plantMap.ts`, `resolvePlantMap` (today `plantMap.ts:190-205`: `(type === 'BOOL') !== (found.type === 'BOOL')`) compares the **exact** type for numeric signals: an `INT` signal needs a program variable of type `INT`, a `REAL` signal one of type `REAL`; BOOL behaves as before.

- [ ] **Step 1: Baseline.** `bun test src/plants src/plant src/test-engine`, `bunx tsc -b`. Expected: green. Record the counts.
- [ ] **Step 2: Failing tests.** `scaling.test.ts`:
  1. `'PLT-003 an INT raw value converts to engineering units and back with the map range'`: raw 0 to 27648 against 0 to 1 m: `toEngineering(sig, 13824) === 0.5`, `toRaw(sig, 0.5) === 13824`.
  2. `'PLT-003 an INT conversion rounds half up and stays inside the raw range'`: `toRaw` of an engineering value that lands on x.5 gives the next integer; never below `raw_min` or above `raw_max`.
  3. `'PLT-003 a REAL raw value is the nearest float32'`: `toRaw(realSig, 0.1) === Math.fround(0.1)`.
  4. `'PLT-003 a value outside its range saturates and never wraps'`: raw 40000 on 0 to 27648 gives the top of the engineering range; engineering 2 m on 0 to 1 gives raw 27648.
  5. `'LNK-002 validateScaling reports a map whose engineering range differs from the part range'`: located message `plant map.signals.Tank1.level.range.eng_max: 2 differs from the range 1 of the part signal`; also a unit mismatch; `'LNK-002 a BOOL part signal with an INT map signal is a located problem'`.
  `plantMap.numeric.test.ts`:
  6. `'LNK-002 an INT plant signal is not bound to a REAL program variable'` (message `Tank1.level: Prog.Level is REAL, the signal is INT`), and `'LNK-002 an INT signal binds an INT variable'`.
  7. `'LNK-001 a schema 1 map of a 2.0 plant resolves exactly as before'` (one existing 2.0 map, BOOL only, same `reads`, `drives`, `problems`).
  Docs generator test: `'PRT-002 the parts reference orders a Process section after the others in both languages'` (or whatever the existing order test pattern is; read `plant-parts-reference.test.ts` first).
- [ ] **Step 3: Run.** `bun test src/plant/scaling.test.ts src/plants` and `bun test tools/docs/plant-parts-reference.test.ts` (root). Expected: FAIL (module not found, mismatch not reported).
- [ ] **Step 4: Implement** `scaling.ts` per R-S1 to R-S3 (basic operators, `Math.round`, `Math.fround`, `Math.min`, `Math.max` only), the type declarations, the stricter `resolvePlantMap`, the family label.
- [ ] **Step 5: Verify.** `bun test src/plants src/plant src/test-engine src/learn`, `bunx tsc -b`, `bun run lint`; at the root `bun test tools/docs/plant-parts-reference.test.ts`. 2.0 plant and lesson suites unchanged.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/plant packages/zplc-ide/src/plants tools/docs
git commit -m "feat(plant): numeric signal contracts, scaling rules and an exact type check for plant maps"
```
**Risk:** item 3 (the contracts every M2 lane consumes; `resolvePlantMap` is a shared checker of the plant map consumed by the live panel, the editor and the lessons: it can only get stricter for numeric signals, which no 2.0 map has), item 1 (the rule that the map's engineering range equals the part's is a persisted-format rule). The 2.0 resolve test is the guard. Independent verifier at feature end.

---

### Task N1: Tank process model and part
**Spec:** PLT-009, PLT-010, PLT-011, PRT-001 (Process row), PRT-003, PRT-004, PRT-007, PRT-008, PRT-010. **Lane P. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/process.ts
IDE/src/plant/core/parts/process.test.ts
```
Nothing else. The tank is **not** registered with the catalogue here (N6 does it in `plantCore.ts`), so this task and N2a, N2b, N3 never touch a shared file. Tests compose the runtime directly, as P3 did.

**Interfaces:** consumes `PartDefinition` (with `family: 'process'`, `equations`, `PlantSignalDef.range` of N0), `ScenePart`, `PartRuntime`, `RuntimePartDefinition` of `IDE/src/plant/core/parts/items.ts:5-16`, and the helpers `cfgNumber`, `cfg` (`items.ts:25-31`), `marker` (`sensors.ts:5`). Produces:
```ts
export const DT_S = 0.005; // a test asserts it equals PLANT_STEP_MS / 1000
export function detSqrt(v: number): number; // + - * / only, 12 Newton iterations
export interface TankParams { areaM2: number; heightM: number; inletMaxLps: number; outletCoef: number; valveTauS: number; leakLps: number }
export interface TankState { h: number; uIn: number; uOut: number; spilledL: number }
export interface TankInput { targetIn: number; targetOut: number; inletStuck: boolean; outletStuck: boolean; leak: boolean }
/** One plant step. Pure. Equations of "Tank equations". */
export function stepTank(s: TankState, i: TankInput, p: TankParams, dtS: number): { state: TankState; qIn: number; qOut: number };
export const processParts: readonly RuntimePartDefinition[]; // [tank]
```
The `PartRuntime`: `beforeStep(commands)` reads `<Name>.fill` and `<Name>.drain` (boolean for the digital variant, a finite number for the numeric one; a missing key keeps the previous target); `afterStep()` calls `stepTank` once (so `sense()` after an `advance` reflects the step); `sense()` returns the variant's sensors (digital: `levelLow`, `levelHigh`; numeric: `level`, `flowIn`, `flowOut`), engineering values; `facts()` returns the five facts of "Facts"; `act` implements the four actions (`inletStuck` and `outletStuck` freeze the valve opening where it is; `levelStuck` freezes the meter reading at its current value; `leak` starts the leak); `views()` returns one view with the keys of "View state keys". `build()` adds no world body. Snap points: four corner points at `(+-width/2, 0, +-depth/2)` with `accepts: []` (they give the schematic its footprint; no pipes exist in M2).

- [ ] **Step 1: Failing tests** (`process.test.ts`, no core, no Jolt, `PartRuntime` driven in a loop of `beforeStep`, `afterStep`):
  1. `'PLT-009 the tank holds its level with both valves closed'`.
  2. `'PLT-009 a filling tank follows the documented equation'`: `valveTauS` 0, `inletMaxLps` 20, `A` 0.1 m squared: after 1 s `level` is 0.2 m within 1e-9.
  3. `'PLT-009 a gravity outlet follows Torricelli and empties in finite time'`: from 0.8 m, outlet fully open, `outletCoef` 12, `A` 0.1: `h` is exactly 0 within `2 * sqrt(0.8) * 100 / 12` seconds plus 1% and not before 98% of it.
  4. `'PLT-009 a valve follows a first-order lag'`: `valveTauS` 0.5, after 0.5 s the opening is within 1% of `1 - 1/e`.
  5. `'PLT-009 an overflowing tank spills and is counted'`: full tank, inlet open 1 s: `spilledL` equals `qIn * 1 s` within 1e-6 L and `level` equals `heightM`.
  6. `'PLT-009 volume is conserved'`: fill, drain, leak and spill: `volume + spilled + drained + leaked` equals `initial + filled` within 1e-6 L over 60 s.
  7. `'PLT-006 the tank source uses no Math function beyond abs, min and max, and no clock or random'`: read `process.ts` and assert it has none of `Math.sqrt`, `Math.pow`, `Math.exp`, `Math.log`, `Math.sin`, `Math.cos`, `Math.random`, `Date`, `performance`; and `'PLT-006 detSqrt is exact for perfect squares and within 1 ulp elsewhere'` over a table.
  8. `'PRT-004 the digital variant has on/off valves and level switches, the numeric variant proportional valves, a level and flow meters'`: `def.signals(part)` names, directions, types and ranges (`level` 0 to `heightM` m, `fill` 0 to 100 %, `flowIn` 0 to `inletMaxLps` L/s).
  9. `'PRT-003 the tank honours its limits'`: `validateScene` (with `createCatalogue([...processParts])`) reports `widthM 3 is above the limit 2 m` located at `parts[0].config.widthM`; `heightM` below 0.3; `highFraction` below `lowFraction` is not a config relation the schema checks, so assert the runtime clamps `lowFraction` to at most `highFraction` and records it in the part doc.
  10. `'PRT-008 an inlet stuck valve stays where it is, a leak drains a closed tank, a stuck meter freezes its reading'`; `'PRT-008 an unknown action throws a located message'`.
  11. `'PLT-010 the tank publishes level, volume, spilledL, highs and inBand'`: `highs` counts rising edges only; `inBand` follows `bandLow`/`bandHigh`.
  12. `'PLT-009 the equations are documented in English and Spanish'` and `'PRT-010 adding the tank changes no scene schema version'` (`SCENE_SCHEMA_VERSION` still 1).
- [ ] **Step 2: Run.** `bun test src/plant/core/parts/process.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** The Spanish `doc` and `equations` use the neutral usted register and "falla" for fault.
- [ ] **Step 4: Run** tests, `bunx tsc -b`, `bun run lint`. Expected: 12 pass.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/process.ts packages/zplc-ide/src/plant/core/parts/process.test.ts
git commit -m "feat(plant): tank process model with documented equations, digital and numeric variants"
```
**Risk:** item 6 (a process model that is plausible but wrong is caught only by the equation tests above), item 4 (step ordering inside the core, guarded by N6). KEEP.

---

### Task N2a: Operable panel parts: selector switch, emergency stop, potentiometer
**Spec:** VIS-010, PRT-001 (Operator panel row), PRT-003, PRT-004, PRT-008, PLT-011. **Lane P. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/operable.ts
IDE/src/plant/core/parts/operable.test.ts
```
**Interfaces:** `OperableRuntime`, `isOperable` of `IDE/src/plant/core/parts/panel.ts:6-10` (read only; reuse, do not edit) and `marker` of `sensors.ts`. Produces `export const operableParts: readonly RuntimePartDefinition[]` (`selector-switch`, `emergency-stop`, `potentiometer`, family `panel`). The core routes `operate(signal, value)` to the part that owns the signal (`plantCore.ts` `exec` case `'o'`: the first runtime whose `operate` returns true), so each part's `operate` returns `true` only for its own signals and throws for an invalid value:
- **selector** contacts variant: `operate('Sel1.posK', true)` selects K (the other contacts read FALSE); `false` on the selected contact is ignored; integer variant: `operate('Sel1.position', n)` with integer `n` in `0..positions-1`, else a located `RangeError`. With the `stuck` fault every operation is ignored.
- **emergency stop**: `operate('Estop1.pressed', true)` latches: `pressed` TRUE, `ok` FALSE until `operate('Estop1.pressed', false)` (twist to release). With `wireBreak`, `ok` reads FALSE whatever the button is.
- **potentiometer**: `operate('Pot1.value', v)` with `min <= v <= max` else a located `RangeError` (R-X2); the value starts at `initial`. `stuck` ignores operation.
Each view has `state` per "View state keys" (`pressed`, `ok`, `position`, `value`, `fraction`, `unit`, `text`) and `signals` with the engineering values; `sense()` returns the part's sensor signals.

- [ ] **Step 1: Failing tests** (`operable.test.ts`, runtimes driven directly):
  1. `'VIS-010 a selector contact selects its position and releases the others'`; `'VIS-010 the integer selector takes a position and refuses a position it does not have'` (`plant: Sel1.position 5 is above the limit 2`).
  2. `'VIS-010 the emergency stop latches until it is released'`; `'PRT-008 a broken wire reads as a pressed emergency stop'` (`ok` FALSE with `pressed` FALSE).
  3. `'VIS-010 the potentiometer holds the value set and refuses one outside its range'`; `'PRT-004 the selector offers a contact variant and an integer variant'` (signal lists and types, `position` range `0..n-1`).
  4. `'PRT-003 the panel parts honour their config limits'` (`positions` 5, `min` below -1000 located); `'PRT-008 a stuck selector and potentiometer ignore operation'`.
  5. `'PRT-002 each part has English and Spanish names and doc'`.
- [ ] **Step 2 to 4:** run `bun test src/plant/core/parts/operable.test.ts` (FAIL), implement, run with `bunx tsc -b` and `bun run lint` (expected: 9 or more pass).
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/operable.ts packages/zplc-ide/src/plant/core/parts/operable.test.ts
git commit -m "feat(plant): selector switch, emergency stop and potentiometer parts"
```
**Risk:** item 6 (a panel part with no test of its operation by a person; N8 and Q3 cover the pointer and keyboard path).

---

### Task N2b: Indicator panel parts: stack light, numeric display
**Spec:** PRT-001 (Operator panel row), PRT-003, PRT-004. **Lane P. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/core/parts/indicators.ts
IDE/src/plant/core/parts/indicators.test.ts
```
**Interfaces:** `lightRuntime` of `panel.ts:46-65` is the model (read only). Produces `export const indicatorParts: readonly RuntimePartDefinition[]` (`stack-light`: commands `red`, `amber`, `green` BOOL; `numeric-display`: command `value`, type REAL or INT by `type`, range `min..max`, `unit`). The display clamps the commanded value to `min..max` and exposes `value`, `text` (`value.toFixed(decimals)` plus a space and the unit, locale-neutral) and `fraction` in its view; its fact is none. The stack light's view signals are the three booleans.

- [ ] **Step 1: Failing tests:** `'PRT-003 the stack light shows the three commands independently'`; `'PRT-004 the numeric display has a REAL and an INT variant with its range as the signal range'`; `'PRT-003 the display clamps a value to its range and formats it with its decimals and unit'`; `'PRT-003 the display config honours its limits'`; `'PRT-002 English and Spanish names and doc'`.
- [ ] **Step 2 to 4:** as N2a (`bun test src/plant/core/parts/indicators.test.ts`).
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core/parts/indicators.ts packages/zplc-ide/src/plant/core/parts/indicators.test.ts
git commit -m "feat(plant): stack light and numeric display parts"
```
**Risk:** item 6. KEEP.

---

### Task N3: Numeric scan exchange, shared scaling in `exchangeScan`
**Spec:** PLT-003, PLT-016, PLT-017, LNK-002, LNK-003. **Lane R. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/session/exchange.ts
IDE/src/plant/session/exchange.numeric.test.ts
IDE/src/test-engine/scenePort.ts
IDE/src/test-engine/scenePort.numeric.test.ts
```
(New test files, so the M1 tests of the same modules stay as they are. `plantSession.ts` should need no edit: it calls `planExchange` and `exchangeOnce` with unchanged signatures; if it needs one, stop and ask the parent.)

**Interfaces:** rules R-S1, R-S2, R-X, R-X1, R-X3. In `scenePort.ts`, `exchangeScan` (today `scenePort.ts` near its end: for each command signal `commands[name] = await readCommand(signal.point)`, then `core.apply`, `core.advance(scanMs)`, `core.sense()`, `writeSensors(sensors)`) converts: for a numeric command signal it calls `toEngineering(signal as ScaledSignal, raw)` with `map.signals[name]` and skips a non-finite raw (R-X1); for a numeric sensor it calls `toRaw` before `writeSensors`. BOOL paths are byte-identical to M1. In `exchange.ts`: `ExchangeLayout.sensors` and `.commands` hold slots `{ name, byte, width, bit?, type }`; `planExchange` implements R-X3 and keeps the M1 message for a bit that is not in the image; `exchangeOnce` decodes a command slot with a `DataView` (`getInt16`, `getFloat32`, little-endian), and encodes a sensor slot into the same one read-modify-write of the input span (bits kept, numeric bytes overwritten). Signature of `exchangeOnce` and `planExchange` unchanged.

- [ ] **Step 1: Probe (Unconfirmed items).** Read `exchange.ts` and `scenePort.ts` as merged; confirm the M1 tests (`plantSession.test.ts`, `scenePort.test.ts`, `exchange*.test.ts` if any) and record their names. Run `bun test src/plant/session src/test-engine`. Expected: green.
- [ ] **Step 2: Failing tests.**
  1. `'PLT-003 planExchange lays out INT and REAL slots with their widths and offsets'` (a fake `IoMap` with `%IW0`, `%ID4`, `%QD0`, `%QW6`).
  2. `'PLT-003 a REAL sensor is written as float32 little-endian and an INT as int16, after scaling'` (fake runtime records the one `pokeN`).
  3. `'PLT-003 a REAL and an INT command are read from the output image and scaled to engineering units'`.
  4. `'LNK-002 a numeric signal bound to a variable of another type is a located problem'` (`Tank1.level: Prog.Level is REAL, the map says INT`), `'LNK-002 a numeric signal needs its range in the map'`.
  5. `'LNK-003 one read of the output image and one write of the input image per scan, numeric slots included'` (count calls on the fake runtime).
  6. `'PLT-016 a span of more than 64 bytes counts the widths of the slots and says what to do'`.
  7. `'PLT-003 a non-finite REAL command is ignored and the previous command value is kept'` (`exchangeScan` with a fake core recording `apply`).
  8. `'PLT-017 exchangeScan scales a numeric command and sensor with the map range, the same for any caller'` (two callers, one graded-style closure and one live-style, same output).
  9. `'PLT-003 the BOOL behaviour of M1 holds'`: re-run one M1 BOOL exchange fixture and compare bytes.
- [ ] **Step 3: Run** `bun test src/plant/session src/test-engine`. Expected: new tests FAIL (the M1 message "the live session exchanges BOOL signals only" is the first failure).
- [ ] **Step 4: Implement.** Keep the one-write order: sensors of one plant step are applied by one `memory.write` at one scan boundary (LNK-003).
- [ ] **Step 5: Run** `bun test src/plant src/test-engine src/learn`, `bunx tsc -b`, `bun run lint`. 2.0 suites unchanged.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/plant/session packages/zplc-ide/src/test-engine
git commit -m "feat(plant): numeric slots in the scan exchange, scaling shared by the live and graded paths"
```
**Risk:** item 3 (`exchangeScan` is the shared seam of the live session and the graded run, and `planExchange` is consumed by the session and the panel), item 4 (the order of read, apply, advance, write must not change). The M1 live-equals-graded tests are the guard. Independent verifier at feature end.

---

### Task N5: Editor: numeric map, prefilled range, declarations
**Spec:** SCN-011, SCN-012, SCN-013, LNK-002. **Lane E. Wave 2. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/editor/mapEditor.ts
IDE/src/plant/editor/SignalTable.tsx
IDE/src/plant/editor/declarations.ts
IDE/src/plant/editor/numericMap.test.ts
IDE/src/plant/editor/EditorPanel.tsx
IDE/src/plant/editor/EditorPanel.test.tsx
```
(`EditorPanel.tsx` and its test are listed only because `SignalTable` is mounted there with `onBind`; edit them only if the new `bind` parameter needs a pass-through. If it does not, leave both alone.)

**Interfaces:** `MapEditor.bind(signal, point, range?, type?)` gains a fourth optional parameter `type: 'INT' | 'REAL'` (the type of the program variable; BOOL signals ignore it); the map it emits uses `type` for a numeric signal (default: the part signal's type), and `check` compares the **program variable's type with the map's type** (not with the part's), reports a numeric signal whose map range differs from the part's with the message of `validateScaling` (N0), and reports a missing range. `SignalTable` shows the engineering range and unit of a numeric signal **read-only and prefilled** from `PlantSignalDef.range` and `unit` (never invented: M1's `SignalTable.tsx:30-79` asks the author for all five numbers), and asks only for the raw range and the type. `generateDeclarations` already writes `s.type` and the unit comment (`declarations.ts:20-24`); a REAL part signal is declared `REAL`, an INT one `INT`, so the generator is unchanged unless a test shows otherwise.

- [ ] **Step 1: Failing tests** (`numericMap.test.ts`): `'SCN-012 a numeric signal binds with a raw range and the part's engineering range'`; `'SCN-012 a numeric signal whose engineering range differs from the part is a located problem'`; `'SCN-012 an INT map signal on a REAL part signal is valid when the program variable is INT'` (analog-channel case); `'SCN-012 a program variable of another type than the map is reported at the signal'`; `'SCN-011 the signal list shows type, direction, unit and range'` (SignalTable render, kit components, Spanish and English through `t()`); `'SCN-013 a tank scene generates REAL and INT declarations with their unit'`; `'SCN-012 the BOOL path of M1 is unchanged'`.
- [ ] **Step 2 to 4:** `bun test src/plant/editor` (FAIL), implement, `bun test src/plant/editor src/plant/ui`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/editor
git commit -m "feat(plant): editor binds numeric signals with the part range and a typed raw range"
```
**Risk:** item 6 (UI; N8 and Q3 cover the keyboard path), item 3 (`bind` gains a parameter; the M1 callers pass three).

---

### Task N6: Core integration: register the parts, numeric validation, facts grammar, pinned hash
**Spec:** PLT-003, PLT-006, PLT-009, PLT-010, PLT-012, PLT-016, VIS-010, SCN-005, PRT-001. **Lane P. Wave 3. PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/src/plant/core/plantCore.ts
IDE/src/plant/core/plantCore.numeric.test.ts
IDE/src/plant/core/hashes.json
IDE/src/plant/ci/sceneCheck.ts
IDE/src/plant/ci/sceneCheck.test.ts
```
**Interfaces:** `plantCore.ts` adds `...processParts, ...operableParts, ...indicatorParts` to `SHIPPED` (today `plantCore.ts:20-27`) so `registerParts` (`plantCore.ts:29-30`) puts them in the catalogue; `apply` and `operate` validate as R-X2 (against `signals`: type and range, with the clamp of R-X for commands); the trace and facts need no change (`sense()` already merges every runtime; `advance` records `sensed.map(Number)`); `capture`/`restore` replay the journal, which already stores numeric commands (JSON). In `sceneCheck.ts`, `FACT_GRAMMAR` and `factFault` (today names `itemsEmitted, ..., position:<kind>:<index>` and accept `emitted|delivered|count` with one part name) learn `level`, `volume`, `spilledL`, `highs`, `inBand`, each with exactly one part name that must be a scene part (same located message shape). `hashes.json` gains `m2-tankLoop-v1` (Linux; `notes` keeps macOS and Windows pending).

- [ ] **Step 1: Failing tests** (`plantCore.numeric.test.ts`, real `createPlantCore`):
  1. `'PLT-003 apply refuses a value whose type is not the signal type, with the signal named'`; `'PLT-003 apply clamps a numeric command to its range and refuses a non-finite one'`.
  2. `'PLT-009 a tank scene runs in the test runner with no body but the floor'` (digital variant scene literal: tank, push button, emergency stop, stack light; `snapshot().parts` has the keys of "View state keys").
  3. `'VIS-010 operate sets a potentiometer and a selector, and refuses an out-of-range value with the range named'`; `'VIS-010 the emergency stop latches through the core and ok follows'`.
  4. `'PLT-010 the tank facts reach the scene facts'` after a scripted fill.
  5. `'PLT-006 the trace hash of the reference tank script equals the pinned hash'` (numeric variant; fill 100% for 5 s, drain 60% for 10 s, 2000 scans of 10 ms; key `m2-tankLoop-v1`; **compute and pin fresh on Linux**), `'PLT-006 three fresh cores give the same hash'`, `'PLT-006 host pacing does not change the numeric trace'`.
  6. `'PLT-012 reset returns a tank scene to its initial state and capture and restore resume a running one'` (level, valve openings, `highs`, `spilledL`).
  7. `'PRT-002 every signal a part declares exists in sense() or is accepted by apply(), over the whole catalogue including the new parts'` (extend the M1 catalogue-wide test by iteration, not by copying).
  8. `'PLT-013 the M1 pinned hash m1-palletStack-v1 is unchanged'` and `'the five M1 scenes keep their sceneHashes.json hash'` (reads `IDE/src/plant/ci/sceneHashes.json`, runs through `runSceneCheck` only if the native binary exists, else skips with the reason printed).
  `sceneCheck.test.ts` (existing file, add): `'SCN-005 the fact grammar accepts level, volume, spilledL, highs and inBand and names the part'` and a located message for `level:Nope`.
- [ ] **Step 2: Run.** `bun test src/plant/core src/plant/ci`. Expected: FAIL (parts not in the catalogue).
- [ ] **Step 3: Implement.** Add the parts and the validation; compute the pinned hash with a throwaway script, not a copy.
- [ ] **Step 4: Run** `bun test src/plant src/test-engine`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/core packages/zplc-ide/src/plant/ci
git commit -m "feat(plant): register process and operator parts, validate numeric values, pin the tank trace hash"
```
**Risk:** item 3 (`PlantCore` is consumed by the session, the seam, the view and the scenes; `apply` now refuses a mismatched type), item 4 (step ordering: the tank integrates in `afterStep`), item 1 (the pinned hash is evidence others rely on; PHYS-adjacent because the world still loads Jolt for the floor). The M1 pinned hashes and the five scene hashes are the guard. Independent verifier at feature end.

---

### Task N4: Graded run drives numeric signals
**Spec:** PLT-003, PLT-017, SCN-004, SCN-005, LNK-009. **Lane S. Wave 3. KEEP.**

**Allowed edit surfaces**
```
IDE/src/test-engine/index.ts
IDE/src/test-engine/sceneNumeric.test.ts
IDE/src/cli/nativeScenarioRuntime.ts
IDE/src/cli/nativeScenarioRuntime.numeric.test.ts
IDE/src/test-engine/sceneScenario.test.ts
```
(`sceneScenario.test.ts` only for the LNK-009 allowed-methods list, see step 2 item 6; the rest are new files.)

**Interfaces:** rule R-G. In `index.ts`: `ScenarioRuntimePort` (`index.ts:25-33`) gains the two optional methods; `CompiledScene` (`index.ts:42-47`) entries gain `numeric?`; `bindScene` (`index.ts:~310-326`) replaces the rejection `scene map: "<name>" is <type>; scene scenarios drive BOOL signals only` with a numeric binding: it resolves the program variable (`resolve(debugMap, point, 'IPI' | 'OPI', false)`), checks its type equals the map's (`INT` width 2, `REAL` width 4) and records `numeric`, and fails with a located problem when the runtime lacks the methods; `runScenario` (`index.ts:525-650`) keeps a `commandValues` record for numeric commands (read after each `runtime.step` with `readOutputNumber`, mirroring `lastOutputs` for BOOL) and passes the numeric raw values through the `exchangeScan` callbacks of N3 (`readCommand` returns the raw value, `writeSensors` receives raw values and calls `setInputNumber`). The trace and the expectations stay boolean. In `nativeScenarioRuntime.ts`: `NativeScenarioAdapter` (`:9`) adds `'pokeN'` to its `Pick`; `createNativeScenarioRuntime` implements `setInputNumber` (little-endian bytes of an INT or a float32, written with `pokeN`; address validated against the IPI range, `IPI_END` 0x1000) and `readOutputNumber` (`peek(address, width)` decoded; OPI range).

- [ ] **Step 1: Read.** `bindScene`, the `scene` blocks of `runScenario` and `nativeScenarioRuntime.test.ts` as merged; record in the commit body the exact fields added to `CompiledScene`.
- [ ] **Step 2: Failing tests.**
  1. `'PLT-017 a numeric scene scenario resolves INT and REAL variables with their sizes'` (debug map fixture from the S1 tests).
  2. `'PLT-017 a graded numeric run drives sensors in raw units and reads commands in raw units'` (fake runtime records `setInputNumber` and `readOutputNumber`; a fake core records engineering values: both scaled by N3's `exchangeScan`).
  3. `'PLT-003 a numeric scene on a runtime without numeric methods is a located compile problem'`.
  4. `'PLT-003 the numeric native runtime encodes INT as int16 and REAL as float32 little-endian and refuses an address outside its image'`.
  5. `'PLT-013 a scenario with no scene block and a scene with BOOL signals only compile and run exactly as before'` (the S1 2.0 snapshot test stays and passes).
  6. `'LNK-009 the headless runner needs no hardware or session'`: the existing test's adapter that throws on any other method now allows `pokeN`; edit only that allow-list.
- [ ] **Step 3 to 5:** `bun test src/test-engine src/cli src/learn` (FAIL, implement, pass), `bunx tsc -b`, `bun run lint`. All 68 lesson suites and the compiled 2.0 scenario traces unchanged.
- [ ] **Step 6: Commit.**
```bash
git add packages/zplc-ide/src/test-engine packages/zplc-ide/src/cli
git commit -m "feat(test-engine): graded scene runs drive INT and REAL signals through optional numeric port methods"
```
**Risk:** item 3 (`runScenario` and the CLI runtime are consumed by 68 lessons, the CLI and the conformance suite), item 4 (the exchange order inside the scan loop). The S1 2.0 snapshot and the compiled-scenario identity test are the guard. Independent verifier at feature end.

---

### Task N7: View: tank and panel drawing, numeric cues
**Spec:** VIS-003, VIS-009 (unchanged modes), PRT-009. **Lane V. Wave 3. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/view/geometry.ts
IDE/src/plant/view/geometry.test.ts
IDE/src/plant/view/cues.ts
IDE/src/plant/view/cues.test.ts
IDE/src/plant/view/renderer.ts
IDE/src/plant/view/renderer.test.ts
```
(Test file names are **Unconfirmed**: `fd . IDE/src/plant/view -e test.ts` first and edit the existing ones; create none unless a module has no test.) No catalogue strings: a numeric cue is `value` text plus a fill fraction and carries no sentence; every sentence is N8's.

**Interfaces:** consumes the "View state keys". `geometry.ts` `partShape` (today `geometry.ts:57-70`, switch on `view.part`) gains `tank` (a box of the pose size, drawn translucent, plus a fill shape: a box with height `fraction * heightM` at the bottom), `selector-switch`, `emergency-stop`, `stack-light` (three stacked small boxes), `potentiometer` and `numeric-display` (a flat box); all generated in code (PRT-009). `cues.ts` `cuesFor` (`cues.ts:51-68`): `stateOf` today decides active/inactive from BOOL suffixes (`ACTIVE_SUFFIXES`) and `Boolean(v)`; a numeric value 0 would read as FALSE. Add a `value?: { text: string; fraction: number }` to `PartCues` for numeric parts (read from `state.text` and `state.fraction`) and keep the vocabulary of UX-009 (`true`, `false`, `unknown`, `forced`, `fault`) and do not invent a numeric state: a part whose signals are all numeric reports `true` while it has a reading (its information is the `value`), and `unknown` before the first snapshot. The emergency stop uses `ok` (FALSE is the alarming state: marker `outline`), the stack light is `true` when any lamp is lit. `renderer.ts` draws the fill and updates it from the snapshot without allocating per frame (follow the instanced-matrix pattern already used for items; **Unconfirmed** exact structure, read `renderer.ts:370-400` first), and sets no module-level state.

- [ ] **Step 1: Failing tests.** `'PRT-009 the tank, selector, emergency stop, stack light, potentiometer and display shapes are generated in code and name no asset'`; `'VIS-003 a numeric part has a value text and a fill, and a cue other than colour for each state'` (marker per state); `'VIS-003 a tank at 40 percent has a fill of 0.4 of its height'`; `'VIS-003 the emergency stop is told by its ok contact'`; renderer: `'VIS-003 the tank fill changes with the snapshot and allocates no new mesh per frame'` (with the fake THREE the M1 renderer test uses).
- [ ] **Step 2 to 4:** `bun test src/plant/view` (FAIL), implement, `bun test src/plant`, `bunx tsc -b`, `bun run lint`.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/view
git commit -m "feat(plant-view): draw the tank and the operator panel parts and give numeric parts a value cue"
```
**Risk:** item 6 (rendering is not pixel-tested here; Q3 and the owner's windowed run cover it), item 3 (`PartCues` gains an optional field). KEEP.

---

### Task N8: Operate panel for numeric parts; announcements; strings
**Spec:** VIS-010, VIS-008, VIS-011. **Lane V. Wave 3. KEEP.**

**Allowed edit surfaces**
```
IDE/src/plant/ui/OperatePanel.tsx
IDE/src/plant/ui/NumericControls.tsx
IDE/src/plant/ui/OperatePanel.test.tsx
IDE/src/plant/text/describe.ts
IDE/src/plant/text/describe.test.ts
IDE/src/i18n/catalog/plantView.ts
```
(`OperatePanel.test.tsx` and `describe.test.ts` may be new files; confirm with `fd`.) `OperatePanel.tsx` today (`ui/OperatePanel.tsx:53-55`) selects `panelParts` by `family === 'panel'` and renders only `push-button` buttons and `indicator-light` readouts, so any other panel part is ignored. New controls live in `NumericControls.tsx` (keeps both modules short): a potentiometer is a `RangeField` slider (native `input type="range"`, arrow keys step, `min`, `max`, `step` of `(max - min) / 100`, `aria-valuetext` the value with its unit) that calls `core.operate('<Name>.value', v)`; a selector is a kit `Select` of its positions calling `operate('<Name>.posK', true)` or `operate('<Name>.position', n)`; an emergency stop is a toggle button (`aria-pressed`) calling `operate('<Name>.pressed', ...)`; a numeric display and a stack light are readouts (text with the number and unit; each lamp with a marker other than colour, as `MARKERS` of `OperatePanel.tsx:14`); a tank shows `level` as text. Every control is native, so pointer and keyboard both work. `describe.ts` (`describePlant`, today ignoring non-integer numeric facts so positions are never announced): the **change key** gains, per tank, the level band (`Math.floor(fraction * 10)`) and `spilling`, so a level is announced when it crosses a tenth of the height and never every scan; the sentence gains `plant.text.level` ("Tank1 level 40 percent"). All strings in `plantView.ts` (English `as const`, Spanish neutral usted).

- [ ] **Step 1: Failing tests.** `'VIS-010 a potentiometer is operated by the pointer and by the arrow keys'` (fires `change` and `keydown` events; asserts `core.operate` calls); `'VIS-010 a selector is operated from a list by keyboard'`; `'VIS-010 an emergency stop toggles and exposes aria-pressed'`; `'VIS-010 a numeric display and a stack light have a text state other than colour'`; `'VIS-008 the level is announced on a change of tenth, not on every scan'` (two snapshots 1% apart share a key, 12% apart do not); `'VIS-011 every new string exists in English and Spanish'` (the i18n parity guard); `'VIS-010 the M1 push button and indicator light behave as before'`.
- [ ] **Step 2 to 4:** `bun test src/plant/ui src/plant/text` (FAIL), implement, `bun test src/plant`, `bunx tsc -b`, `bun run lint` (the `i18n-guard`, `ux-tokens` and `ui-kit-guard` run inside it).
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/ui packages/zplc-ide/src/plant/text packages/zplc-ide/src/i18n/catalog/plantView.ts
git commit -m "feat(plant-ui): operate potentiometers, selectors and emergency stops, announce levels by band"
```
**Risk:** item 6 (UI behaviour; Q3's keyboard journey is the end-to-end check), item 3 (`describePlant`'s change key is read by the live region; a key that changes every scan would flood a screen reader: test 5 is the guard). KEEP.

---

### Task N9: Live equals graded for a numeric scene; forced numeric input
**Spec:** PLT-005, PLT-017, LNK-003, LNK-006, SCN-004. **Lane S. Wave 4. PHYS-adjacent.**

**Allowed edit surfaces**
```
IDE/src/plant/ci/liveVersusGradedNumeric.test.ts
IDE/src/plant/ci/fixtureNumeric/scene.json
IDE/src/plant/ci/fixtureNumeric/plant-map.json
IDE/src/plant/ci/fixtureNumeric/reference.st
IDE/src/plant/ci/fixtureNumeric/scenario.json
```
**Interfaces:** the fixture is a small numeric scene authored here: one numeric tank, one potentiometer (INT raw `0..1000` over `0..100 %`), one numeric display, a program that sets the inlet valve proportional to the potentiometer and shows the level. It mirrors `IDE/src/plant/ci/fixture/` of S2 (read it first for the file set; the file names above assume the same names as that fixture, **Unconfirmed**). The test file runs everything through `itNative`.

- [ ] **Step 1: Failing tests.**
  1. `'PLT-017 one numeric scene and script give the same trace live and graded'`: graded through `runScenario` (N4) and live through `createPlantSession` (R3) with `paceMs: async () => {}` over the native runtime; equal `traceHash`.
  2. `'LNK-006 a forced numeric input keeps its forced value over the plant's write'`: force an `INT` input and a `REAL` input in the runtime (`NativeAdapter` forced-value API of `listForcedValues`; **Unconfirmed** call to set a force, read `runtime/nativeAdapter.ts`), run the session, read the program's variable: it holds the forced value for both widths. **If a forced multi-byte value is not held whole, that is a finding**: report it, do not weaken the test (Review Focus 5).
  3. `'LNK-003 the numeric scan writes the input span once'` on the real runtime (count `memory.write` calls through a wrapping adapter).
- [ ] **Step 2 to 4:** run with the worktree's binary exported in the same command: `ZPLC_NATIVE_SIM_BIN=$PWD/../../firmware/lib/zplc_core/build/zplc_runtime bun test src/plant/ci/liveVersusGradedNumeric.test.ts` (from `IDE/`; **Unconfirmed** path, confirm with `ls`). Expected: FAIL before N3/N4/N6 are merged, pass after.
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/plant/ci
git commit -m "test(plant): a numeric scene gives the same trace live and graded; forced numeric inputs hold"
```
**Risk:** item 4 (concurrency: the session's read-modify-write of the input span against the runtime's staged writes), item 1 (the fixture is a persisted example). PHYS-adjacent (trace equality is measured on Jolt-loaded cores).

---

### Task F3: Reference scene 3, Timed tank (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-004 (digital variant), VIS-010. **Lane F. Wave 4. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/timed-tank/scene.json
IDE/plant-scenes/timed-tank/plant-map.json
IDE/plant-scenes/timed-tank/reference.st
IDE/plant-scenes/timed-tank/starter.st
IDE/plant-scenes/timed-tank/scenario.json
```
(The parent regenerates `IDE/src/generated/sceneIndex.ts` with `bun run generate:scene-index` and pins `IDE/src/plant/ci/sceneHashes.json` after this task and F4 merge.)

**Content.** Layout original (P17, SCN-003): the goal of the spec's SCN row 3, "Fill and drain a tank with timers". Parts: a digital `tank` (`Tank1`), a `push-button` (`StartButton`), an `emergency-stop` (`EStop1`), a `stack-light` (`StackLight1`), one camera preset. Signals: sensors `StartButton.pressed`, `EStop1.ok`, `Tank1.levelLow`, `Tank1.levelHigh`; commands `Tank1.fill`, `Tank1.drain`, `StackLight1.green`, `StackLight1.amber`, `StackLight1.red`, all BOOL, so the scene needs **no numeric exchange** and works the moment N6 is merged. The reference program: a press of Start while `EStop1.ok` and idle starts the sequence: green off and amber on; open the fill valve for a time set by a `TON` (starting values: fill for 3.5 s, which lifts a tank of `A` 0.1 m squared and `inletMaxLps` 20 from empty to about 0.7 m, just under `highFraction` 0.8; hold 2 s; open the drain until a `TON` of 20 s has elapsed or `levelLow`; the executor tunes the times so the scenario is exactly repeatable), then green on; an emergency stop at any time closes both valves and lights red. The starter has declarations only (generated by the N5 generator; `Program.Name` points as in scene 4) and a goal comment. `scenario.json` (`schemaVersion` 1, `tickMs` 10, `durationMs` at most 60000, the `"scene"` block with `script`: Start press at 200 ms, release at 400 ms, an `EStop1.pressed` at a time that the sequence is mid-fill and its release later, and a `fault` of `Tank1` `leak` only if the executor wants a diagnosis case; `leak` is the diagnosis lesson's, not required here). Boolean-only expectations (rule R-E): the fill valve closes before `levelHigh` (`ALWAYS fact:spilledL:Tank1 false`), `EVENTUALLY fact:highs:Tank1` is **not** expected (the fill is timed below the high mark: the timer is the lesson), `AT` the end `StackLight1.green` TRUE and `Tank1.drain` FALSE, an `AT` shortly after the emergency stop with both valve outputs FALSE and the red lamp TRUE. `shortestPulseMs`: the shortest sensor pulse the scene produces at catalogue speeds is the scripted Start press (200 ms) and the level switches (seconds); declare the minimum and record the reasoning in the commit body (SCN-007).

- [ ] **Step 1: Failing tests.** The S2 test `'SCN-004 every shipped scene passes with its reference program and fails with its starter'` iterates `SCENE_INDEX`; run `bun run generate:scene-index` after creating the five files with an empty program and confirm it FAILS (starter passes or reference fails). Run `bun test src/plant/ci` with the binary exported.
- [ ] **Step 2: Write** the files until the reference passes and the starter fails. Check the shortest-pulse claim against the trace. `bun run lint`, `bun test src/plant src/learn` (2.0 unchanged).
- [ ] **Step 3: Commit.**
```bash
git add packages/zplc-ide/plant-scenes/timed-tank
git commit -m "feat(plant-scenes): scene 3, timed tank, with reference program and scenario"
```
**Risk:** item 6 (scene quality beyond the scenario), item 1 (a persisted, versioned scene file). PHYS-adjacent (hash).

---

### Task F4: Reference scene 12, Tank level control (content)
**Spec:** SCN-001 to SCN-004, SCN-007, PRT-004 (numeric variant), PLT-003, PLT-009, VIS-010. **Lane F. Wave 4. PHYS-adjacent (hash).**

**Allowed edit surfaces**
```
IDE/plant-scenes/tank-level-control/scene.json
IDE/plant-scenes/tank-level-control/plant-map.json
IDE/plant-scenes/tank-level-control/reference.st
IDE/plant-scenes/tank-level-control/starter.st
IDE/plant-scenes/tank-level-control/scenario.json
```
**Content.** Goal of spec SCN row 12: "Control level or flow with a PID loop". Parts: a numeric `tank` (`Tank1`, `bandLow` 0.45 and `bandHigh` 0.55 of its height, valves proportional, `valveTauS` 0.5), a `potentiometer` `SetPoint` (0 to 1 m, unit `m`), a second `potentiometer` `DrainPot` (0 to 100 `%`, the disturbance: the operator opens the discharge), a `numeric-display` `LevelDisplay` (0 to 1 `m`), a `stack-light`. Map (the scene's reference scaling; a lesson may carry a different raw range): `Tank1.level` sensor INT raw 0 to 27648 over 0 to 1 m; `SetPoint.value` sensor INT raw 0 to 1000 over 0 to 1 m; `DrainPot.value` sensor INT raw 0 to 1000 over 0 to 100 %; `Tank1.fill` command REAL raw 0 to 100 over 0 to 100 %; `Tank1.drain` command REAL raw 0 to 100 over 0 to 100 %; `LevelDisplay.value` command REAL raw 0 to 1 over 0 to 1 m; `StackLight1.green` command BOOL. This exercises both numeric widths and both scaling directions (R-S1, R-S2). The reference program scales the level and the set point to REAL metres, runs `PID_Compact` (inputs `SP`, `PV`, `KP`, `KI`, `KD`, `DT`, `OUT_MIN`, `OUT_MAX`, output `OUT`, all REAL; `COMPILER/compiler/stdlib/process.ts:531`; `DT` is the scan interval in seconds, 0.01) from `SetPoint` to the inlet valve, passes `DrainPot` through to the discharge valve, shows the level, and lights green when within 5 % of the set point. Starting values only: `inletMaxLps` 20, `outletCoef` 12, `A` 0.1 m squared; the executor tunes `KP`, `KI` and the scenario times inside the documented config ranges and records the final values in the scene. Script (virtual time, `operate` with engineering values): `SetPoint.value` to 0.5 at 200 ms; `DrainPot.value` to 40 at 40 s (the disturbance); `SetPoint.value` to 0.3 at 70 s. `durationMs` at most 100000 at `tickMs` 10 (the engine's 10000-sample limit); aim for 90000 and keep a grade under 30 s of wall time on Linux (CRS-006 allows 60). Boolean-only expectations (rule R-E): `FOR fact:inBand:Tank1` true for 8 s from 30 s (the loop settles near 0.5 m), `EVENTUALLY fact:inBand:Tank1` after the disturbance within 20 s, `ALWAYS fact:spilledL:Tank1 false`, and no expectation on the display (the engine reads program outputs as booleans, so a REAL display value cannot be asserted; the display is for the person watching). With open question 1 approved and N10 merged, the executor of N10 tightens these to `fact:level:Tank1` ranges in a follow-up commit. `shortestPulseMs`: the scene's signals are slow (seconds); declare the shortest scripted step (an operator input held for the rest of the run) and record the reasoning.

- [ ] **Step 1: Failing tests, Step 2: write, Step 3: commit** as F3 (S2's scene check, binary exported, `bun run lint`, `bun test src/plant src/learn`). Confirm the **empty program fails** (level 0, never in band) and the starter fails.
```bash
git add packages/zplc-ide/plant-scenes/tank-level-control
git commit -m "feat(plant-scenes): scene 12, tank level control with PID, reference program and scenario"
```
**Risk:** item 6 (control quality beyond the asserted band; a loop that passes on Linux by a hair may fail elsewhere, so tune with margin and re-run three times), item 1. PHYS-adjacent (hash).

---

### Task D3: Documentation in English and Spanish
**Spec:** CRS-011 (M2 parts), CRS-013, PLT-009 (equations), PRT-002. **Lane D. Wave 4. KEEP.**

**Allowed edit surfaces**
```
tools/docs/plant-parts-reference.ts
tools/docs/plant-parts-reference.test.ts
docs/docs/plant/parts.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/parts.md
docs/docs/plant/numeric-signals.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/numeric-signals.md
docs/docs/plant/scenes.md
docs/i18n/es/docusaurus-plugin-content-docs/current/plant/scenes.md
```
(The docs sidebar file is edited here only to add `numeric-signals`; its name is **Unconfirmed**, `fd sidebars docs`. `parts.md` in both languages is **generated**: edit the generator, then run it.)

**Content.** The generator renders `equations`, the signal `range` and `unit`, and the variant of each part (table columns); the generated pages stay the only place part facts are written (PRT-002). `numeric-signals.md` (new page): raw against engineering values; the rules R-S1 and R-S2 as a worked example with the scene 12 map (13824 raw is 0.5 m); saturation; REAL float32; that a REAL part signal may bind an INT variable and vice versa; the 64-byte exchange span; what the Faceplate and force do (a forced input keeps its value). `scenes.md` gains rows for scenes 3 and 12, with the goal and the parts, and says expectations are about plant facts. **Only measured claims**: no latency, frame rate or hardware statement (CRS-013, P6); say "not yet measured on the reference machines" where a number would go, as D2 did. Spanish: neutral usted, `falla`, `ciclo`, `tarima`, "ZPLC".

- [ ] **Step 1: Failing tests:** `'PRT-002 the reference lists the equations, the signal ranges and the variants of every process part'`; `'PRT-002 --check fails when a part definition changes and the page does not'` (existing pattern); `'PRT-002 English and Spanish pages have the same table structure'`; the docs parity and Spanish register tests of `tools/docs`.
- [ ] **Step 2 to 4:** `bun test tools/docs` at the root (FAIL, implement, `bun tools/docs/plant-parts-reference.ts --write`, `--check` exits 0), and the docs build if present (`bun run --cwd=docs build`, **Unconfirmed**).
- [ ] **Step 5: Commit.**
```bash
git add tools/docs docs/docs/plant docs/i18n/es
git commit -m "docs(plant): numeric signals, the tank and the operator panel, with the equations generated, in English and Spanish"
```
**Risk:** item 6 (claims beyond evidence; guarded by the rule above), item 5 (a docs CI check).

---

### Task N10: Numeric comparison in scenario conditions (CONDITIONAL on open question 1)
**Spec:** SCN-005, CRS-005 (an expectation on a plant fact), PLT-003. **Lane S. Wave 5. KEEP. Do not start until the owner answers question 1.** Persisted-format change: high risk, independent verifier required.

**Allowed edit surfaces**
```
IDE/src/test-engine/index.ts
IDE/src/test-engine/sceneCompare.test.ts
IDE/src/plant/ci/sceneCheck.ts
IDE/src/plant/ci/sceneCheck.test.ts
```
(Documentation of the scenario file format lives in a place that is **Unconfirmed**: `rg -n "EVENTUALLY" docs/docs -l`; add that page to this surface and to its Spanish twin when found.) Recommended default of question 1: in a condition, a `fact:` read may carry, instead of a boolean, a number (exact equality) or an object `{ "min"?: n, "max"?: n }` (inclusive); booleans and every non-fact signal stay exactly as today. `signalSet` (`index.ts:~140-150`) is where `expected` must today be boolean; `ResolvedSignal.value` is `boolean` (`index.ts:35-40`). A scenario with no numeric condition compiles, hashes and runs **byte-identically**.

- [ ] **Step 1: Failing tests:** `'SCN-005 a fact condition may be an exact number or a min and max'`; `'SCN-005 a scenario with only boolean conditions compiles to the same object as before'` (deep equality against the S1 snapshot) and `'PLT-013 every 2.0 scenario hash is unchanged'`; `'SCN-005 a numeric condition on a program signal is refused with a located message'`; `'SCN-005 the fact grammar names a level in sceneCheck'`.
- [ ] **Step 2 to 4:** implement, `bun test src/test-engine src/plant/ci src/learn`, `bunx tsc -b`, `bun run lint`; then tighten scene 12's expectations in `plant-scenes/tank-level-control/scenario.json` **only if the parent adds that file to this task's surface** (it changes its content, hence its pinned hash).
- [ ] **Step 5: Commit.**
```bash
git add packages/zplc-ide/src/test-engine packages/zplc-ide/src/plant/ci
git commit -m "feat(test-engine): numeric and ranged conditions on plant facts"
```
**Risk:** item 1 (a persisted scenario format), item 3 (consumed by 68 lessons' hashes). Independent verifier: all 2.0 scenario hashes are the guard.

---

### Task L3: Lessons 13.1 to 13.4 (content; CONDITIONAL on the outline approval)
**Spec:** CRS-003 to CRS-006, CRS-007 (timers, analog scaling, PID), CRS-008 (FBD in 13.4), CRS-011. **Lane L. Wave 5. Starts only when the owner approves `course-outline.md` (CRS-001) and M1 task L1 (a manifest may name a scene) is merged; without both, stop and report.**

**Allowed edit surfaces**
```
IDE/lessons/plant-timed-tank/*
IDE/lessons/plant-tank-level-scaling/*
IDE/lessons/plant-tank-pid/*
IDE/lessons/plant-tank-pid-fbd/*
```
(Ids and languages from `course-outline.md` rows 13.1 to 13.4: `plant-timed-tank` ST or LD on scene 3, `plant-tank-level-scaling` ST or LD on scene 12, `plant-tank-pid` ST on scene 12, `plant-tank-pid-fbd` FBD on scene 12. The outline's open items A1 to A10 may rename them.) Each lesson is a package in the 2.0 layout (`lesson.json` manifest with `scene`, `starter`, `solution`, `scenario` with the pinned `scenario.sha256`, hints, English and Spanish text with the same structure), built from the F3 or F4 scene and reference. The hardware track is **not** opened (M6). Tests: the existing `lessonCi.test.ts` and curriculum and parity tests grade every solution and starter (CRS-005) and check the languages; `bun test src/learn`.

- [ ] One commit per lesson: `feat(lessons): plant-timed-tank`, `feat(lessons): plant-tank-level-scaling`, `feat(lessons): plant-tank-pid`, `feat(lessons): plant-tank-pid-fbd`. **Risk:** item 6 (pedagogy), item 1 (hash-pinned content). Independent verifier for the package format use (L1's guard).

---

### Task Q3: Journeys: operator panel by keyboard; a numeric scene run
**Spec:** VIS-010, VIS-011, SCN-004 (end to end). **Lane Q. Wave 5. KEEP.**

**Allowed edit surfaces**
```
IDE/scripts/journeys/plantOperator.ts
IDE/scripts/journeys.ts
```
(`journeys.ts` gets only the registration of the new export, as Q2 did for `journeysPlant`; **Unconfirmed** how, read `IDE/scripts/journeys.ts` and `IDE/scripts/journeys/plantJourneys.ts` first. The helpers `openPlantDocument`, `holdPushButton`, `plantFacts`, `runInSimulation`, `shippedSceneProject` live in `IDE/scripts/journeys/plantSupport.ts`.) Journeys:
1. Open the project of scene 12, run it in simulation, set the set point by keyboard (focus the slider, arrow keys), and read the level fact change; Tab reaches every operate control in a stable order.
2. Open scene 3, press Start, operate the emergency stop by keyboard, and see the sequence stop.
A journey that needs a GPU is out of scope: the journeys give no timing evidence (`plantJourneys.ts` header). Expected: the 2.0 journeys and the M1 plant journeys unchanged.

- [ ] **Step 1: Failing journey, Step 2: implement, Step 3: run** `ZPLC_NATIVE_SIM_BIN=<worktree runtime binary> bun run smoke:journeys` in `IDE/`. **Step 4: commit:** `test(plant): operator panel by keyboard and a numeric scene run journey`. **Risk:** item 5 (a journey that drives the application; the stale-binary failure of L16 is the known trap), item 6. KEEP.

---

### Task C1: Requirement coverage and indexes for the M2 requirements
**Spec:** section 7 item 1. **Lane Q. Wave 5. KEEP. Run by the parent or a CI-hygiene writer after the other tasks merge.**

**Allowed edit surfaces**
```
tools/ci/requirement-evidence.json
tools/ci/requirements-index.json
tools/ci/requirement-coverage.test.ts
IDE/src/generated/sceneIndex.ts
IDE/src/plant/ci/sceneHashes.json
```
(The evidence mechanism and which generated index files need regeneration are **Unconfirmed**: read `tools/ci/requirement-coverage.ts` and the `generate:*` scripts in `IDE/package.json` first; the M1 hygiene writer's commit `e1007fcd` shows the pattern. Per L14 the coverage fixtures for specs 012 and 013 must be fixture-based, never pinned to today's uncovered IDs.) The parent also pins the Linux hashes of `timed-tank` and `tank-level-control` in `sceneHashes.json` and regenerates the scene index here, if not done at the wave-4 merge.

- [ ] Steps: `bun tools/ci/requirement-coverage.ts --check` (expected exit 0 with M2's IDs reported `covered`, conditional ones with their decision, `pending (later milestone)` for the rest), `bun test ./tools/ci`, `CLANG_FORMAT=... bun tools/ci/format.ts --check`. Commit: `test(ci): requirement coverage records for the M2 requirements`. **Risk:** item 5 (CI tooling).

---

## Open questions for the owner
Only real product decisions. Each has a recommended default; the plan proceeds on the default unless told otherwise, except question 1, which gates one task.

1. **Numeric comparison in scenario expectations (SCN-005, CRS-005).** Every expectation value is boolean today, so a plant level cannot be asserted by value (run logbook L20). It is a new persisted scenario syntax. *Recommended default: yes, for `fact:` names only, an exact number or `{ "min", "max" }` inclusive; existing scenarios byte-identical (Task N10).* Not decided here. M2's scenes are written boolean-only (`inBand:`, `spilledL:`, `highs:` facts) so they pass either way; if the owner declines, M2 ships complete and scene 12's band lives in the part config.
2. **Tank outlet: Torricelli (square-root head law) or linear.** Spec decision S-6 asks for physical realism; a Torricelli outlet empties a tank in finite time, so "drain for N seconds" teaches timers sensibly (a linear outlet decays forever, never reaching empty), and `detSqrt` keeps it bit-for-bit repeatable. A linear outlet gives a textbook first-order plant that is easier to tune. *Recommended default: Torricelli, as written in "Tank equations".*
3. **Raw range convention of the scene maps.** The scenes' INT raw ranges (0 to 27648 for the level, 0 to 1000 for the potentiometers) are the plan's starting values. Boards describe analog channels with a `range` of their own (`firmware/zephyr/scripts/zplc_boards.py:218`; shipped values **Unconfirmed**), and plant I/O mode (M6) feeds a board through them. *Recommended default: keep the scene maps as the plan states and revisit when M6 measures a board; the lesson maps may choose another raw range, since the map is lesson data.*
4. **Valves and meters as signals of the tank, or as separate placeable parts.** The spec's row lists "Tank with fill and discharge valves (on/off and proportional), level meter, flow meter". One composite part needs no cross-part wiring in the scene format (a separate meter would need a part-to-part reference that the format of M1 does not have). *Recommended default: one `tank` part with variants; separate parts when pipes between tanks arrive (not before M5), a scene-format version change then.*
5. **Course outline approval (CRS-001), again.** Lessons 13.1 to 13.4 wait for it (Task L3). *Default: approve before wave 5, or accept that M2 ships its two scenes without lessons and the lessons land with M7. Spec 6.2 says milestones ship scenes with their lessons.*

## Findings in the spec and in M1 as merged (contradictions and things that could not be verified)
- **SCN-005 against the expectation values that exist.** SCN-005 says a scenario asserts "on plant facts with the expectation kinds that exist today". The kinds exist; their **values** are boolean (`signalSet` rejects anything else, `IDE/src/test-engine/index.ts:~145-150`). A numeric level can only be asserted by truthiness. This is open question 1.
- **PLT-003 against the M1 contract.** PLT-003 requires a numeric signal to have "a unit, a range and a documented scaling"; M1's `PlantSignalDef` (`IDE/src/plant/contracts.ts`) has `unit` but no range, and the range exists only in the map (`SignalRange`, `IDE/src/plants/plantMap.ts:33-39`). N0 adds the part-side range and the rule that the two agree.
- **LNK-002 against `resolvePlantMap` and the map editor.** `resolvePlantMap` (`plantMap.ts:190-205`) checks only BOOL against not-BOOL, so an INT signal bound to a REAL variable passes; the M1 map editor's `check` compares the program variable's type with the **part's** signal type (`IDE/src/plant/editor/mapEditor.ts`, `found.type !== s.type`), which would forbid the IO-006 case of a REAL physical value on an INT raw channel. N0 and N5 fix both.
- **M1 refuses numeric on both paths.** The live session throws "the live session exchanges BOOL signals only" (`IDE/src/plant/session/exchange.ts`, `planExchange`) and the graded run throws `scene map: ... scene scenarios drive BOOL signals only` (`IDE/src/test-engine/index.ts`, `bindScene`). These are M2's work (N3, N4), not defects.
- **Spec 012 row 6.2 and the table in section 5.** The PRT row "Process" lists valves, a level meter and a flow meter as parts; the plan delivers them as one part with variants (open question 4).
- **`COMPILER/compiler/stdlib/process.ts:530` in the spec** is the `PID_COMPACT_FB` declaration area; `name: 'PID_Compact'` is at `:531` (off by one, harmless).
- **Scene names have no Spanish.** `IDE/scripts/generate-scene-index.ts` gives both languages the scene's English name (its own `ponytail` comment says so), against CRS-011's "scene text ... English and Spanish". M2's two scenes inherit the gap until a names source exists (M7, with the course texts).
- **`view.part` is a view kind, not always a catalogue id.** M1 views use `'sensor'` for `sensor-diffuse` and `sensor-retro`, and `geometry.ts` `partShape` switches on `'blade'` and `'curve'` while the definitions are `'stop-blade'` and the conveyor ids (**Unconfirmed** which; both fall to the default box). N7 uses explicit view kinds for the new parts and should record the mismatch if it is real.
- **The in-3D number of the numeric display is not delivered** (the value is text in the operate panel and the announcement); drawing text in the 3D view needs a canvas texture and a decision about the generated-assets rule, and nothing in M2's requirements needs it.
- **Unconfirmed baseline facts I could not read in the time given:** the existing plant-map test file name (N0), the scene-check fixture file names (N9), whether `RangeField` is exported by `IDE/src/ui/index.ts` (N8), the view test file names (N7), the docs sidebar file and the docs build command (D3), the scenario-format documentation page (N10), the exact path of the runtime binary the journeys and native tests use (Global Constraints), whether a forced multi-byte numeric input is held whole by the runtime (N9 proves it), and the requirement-evidence mechanism of `tools/ci` (C1).

## Done when (aligned with spec section 7, for M2)
- [ ] The owner has the answers or accepted defaults of the open questions; the gate verdict (macOS, Windows) is recorded or the PHYS-adjacent tasks (N6, N9, F3, F4) are listed as at risk.
- [ ] Task N0's contracts are merged and no other task changed a contract (C1 to C8 of M1 are unchanged).
- [ ] Numeric signals work end to end: a REAL and an INT signal travel in the live session and in the graded run with the scaling of the typed map, saturate and never wrap, ignore a non-finite command, and keep one read and one write of the images per scan (PLT-003, LNK-002, LNK-003, PLT-017; N3, N4, N9).
- [ ] The catalogue has the tank (digital and numeric variants) and the operator-panel parts (selector, emergency stop, stack light, potentiometer, numeric display), each defined once with English and Spanish names, documentation and equations, tested on the headless core including limits and fault actions (PRT-001 to PRT-004, PRT-008, PLT-009, PLT-011; N1, N2a, N2b, N6).
- [ ] A person can operate the potentiometer, the selector and the emergency stop by pointer and by keyboard, and a level is announced on a change of band only (VIS-010, VIS-008; N8, Q3).
- [ ] Reference scenes 3 and 12 pass their scenarios with the reference program and fail with the starter, in CI on Linux; their Linux hashes are pinned in `IDE/src/plant/ci/sceneHashes.json`; the scene index is regenerated; the five M1 scenes keep their hashes (SCN-001 to SCN-004, PLT-006, section 7 item 2). macOS and Windows runs are the owner's until the nightly job covers them.
- [ ] Documentation exists in English and Spanish for numeric signals, the tank, the operator panel and scenes 3 and 12, the parts reference is generated with the equations, and nothing claims a measured number that was not measured (CRS-011, CRS-013, section 7 item 8).
- [ ] If the owner approved the outline: lessons 13.1 to 13.4 are graded in CI in both languages (CRS-003 to CRS-005, CRS-007, CRS-008). If question 1 was approved: N10 merged and scene 12 tightened.
- [ ] All 2.0 suites pass unchanged: lessons, plants, smoke, journeys, the content security policy test (PLT-013, section 7 item 6). `bun run lint`, `bun test`, `bun test ./tools/ci`, `bun tools/ci/requirement-coverage.ts --check` and the pinned formatter `--check` pass.
- [ ] The independent verifiers of N0, N3, N4, N6 (and N10 if it ran) returned with no open blocker; the requirement coverage reports M2's requirements `covered`, conditional ones with their decision, later milestones `pending` (section 7 item 1).
- [ ] The tree can ship as a 2.1 pre-release.
