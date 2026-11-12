# Research: ZPLC 2.1 Plant Simulation

**Companion to**: `spec.md` in this directory  
**Researched**: 2026-11-12  
**Baseline**: commit `26189851`, version `2.0.0`

This file records why the spec recommends what it recommends, what was checked, and what was not. The feasibility gate (spec section 6.1) appends its measurements here.

## How to read the evidence marks
| Mark | Meaning |
|---|---|
| **Verified** | Read in a primary source on 2026-11-12: the project's own page, its documentation, or this repository at the baseline |
| **Reported** | Read in a secondary source or a search summary; the source is named |
| **Not verified** | Assumed from general knowledge; the gate or a named task must confirm it |

## Contents
1. [Rendering and physics stack](#1-rendering-and-physics-stack)
2. [Why not Godot](#2-why-not-godot)
3. [Physics library: Jolt or Rapier](#3-physics-library-jolt-or-rapier)
4. [Dependency justification](#4-dependency-justification)
5. [Open Industry Project](#5-open-industry-project)
6. [How a board takes its inputs from the plant](#6-how-a-board-takes-its-inputs-from-the-plant)
7. [A correction to the conversation of 2026-11-12](#7-a-correction-to-the-conversation-of-2026-11-12)
8. [Baseline facts found by the design review](#8-baseline-facts-found-by-the-design-review)
9. [Open questions for the gate](#9-open-questions-for-the-gate)
10. [Sources](#10-sources)

## 1. Rendering and physics stack
**Recommendation (decision D-14, option A; accepted by the owner on 2026-11-12, subject to the feasibility gate):** three.js for rendering and Jolt compiled to WebAssembly for physics, inside Studio's existing Electron renderer.

The physics engine does not separate the two serious options. Godot 4.6 uses Jolt as its default 3D physics (**Reported**: search summary of the Godot 4.6 release page), and the same engine is published for the web as the npm package `jolt-physics` (**Verified**: its repository). What separates the options is everything around the physics.

| Criterion | three.js + Jolt (WebAssembly) in Studio | Godot + Jolt as a separate process |
|---|---|---|
| Physics | Same solver, in WebAssembly. Slower than native by an unmeasured factor (**Not verified**; gate check 3) | Native and multi-threaded |
| Rendering | Good with manual work on lighting | Better lighting with less work |
| Integration with Studio and Learn | One more panel: same store, same translations, breakpoints can freeze the plant | A second window and process, a second user-interface stack with its own translations, accessibility work and tests |
| Grading (LRN-019, P14) | The plant runs headless in the test runner Studio already uses | Tests launch a second runtime; "should not be relied upon if determinism is a hard requirement" (**Reported**: ziva.sh, a vendor of Godot tooling) |
| Distribution (P5) | Nothing new to package or sign | One more unsigned binary per platform |
| Repository | TypeScript, already the language of Studio | A second language and toolchain in CI |

The requirement that decides is the owner's S-8: the 2.0 course stays "compatible and well integrated". Godot would be the choice if the plant were a product separate from Studio.

The strongest outside evidence is Open Industry Project (section 5): the closest open-source project to this feature started on Godot and restarted on TypeScript, three.js and Jolt.

**Not considered further.** Unity is proprietary. Babylon.js with Havok is a capable alternative, but Havok is a closed binary and its physics is tied to the engine's scene, which works against P14; neither point was verified in a primary source. A hosted web build is not a goal (decision D-07 of spec 011), so "it also runs in a browser" is not an argument for option A.

## 2. Why not Godot
Godot can deliver the realism and the frame rate. The cost is in ZPLC's own rules:

- **P14 and LRN-019.** Lessons are graded by deterministic scenarios in CI. With Godot the truth of the plant lives in a second runtime that the TypeScript test runner cannot step.
- **UX-002, UX-025, UX-027, LRN-029, LRN-037.** Studio's component kit, keyboard paths, display modes, translations and screen-reader text would have to be built again in Godot's interface system.
- **P5 and the release pipeline.** Each platform would carry a second binary through the same unsigned-installer path.
- **P12.** A game engine is a far larger dependency than two libraries.

If the gate fails on performance after tuning (checks 3 or 7), option B is evaluated against these costs and the owner decides.

Godot's web export does not change this: it is limited to the WebGL 2 Compatibility renderer and does not support C# (**Verified**: Godot documentation, "Exporting for the Web"), and ZPLC has no web build to serve.

## 3. Physics library: Jolt or Rapier
Earlier in the conversation Rapier was suggested. Jolt is now the first choice; Rapier is the fallback.

| | Jolt (`jolt-physics`) | Rapier (`@dimforge/rapier3d`) |
|---|---|---|
| Licence | MIT (**Verified**) | Apache-2.0 (**Not verified**) |
| Conveyor surface velocity | Through its contact listener (**Verified** for the WebAssembly build at the gate, check 1; section 11) | The JavaScript user guide lists two hooks only, `filterContactPair` and `filterIntersectionPair`, and no contact modification (**Verified** in the user guide; the API reference was not checked). A belt would need a workaround. |
| Repeatability | A build flag, `CROSS_PLATFORM_DETERMINISTIC`, exists (**Verified**); behaviour in WebAssembly is **Verified** on Linux x64 only (gate check 2); macOS and Windows are **Not verified** (section 11) | "The WASM/Typescript/JavaScript version of Rapier is fully cross-platform deterministic" given the same version and the same order of insertion (**Verified**) |
| Threads | Multi-threaded builds are published (**Verified**); their effect on repeatability is **Not verified** | **Not verified** |
| Runs without a browser | **Verified** in the Bun test runner at the gate (check 5) | **Not verified** |

Conveyors appear in most of the 21 scenes, so native surface velocity weighs more than Rapier's documented determinism. If gate check 1 fails for Jolt, Rapier with a kinematic-belt technique is tried next. If check 2 fails for Jolt and passes for Rapier, the owner chooses between them.

## 4. Dependency justification
Required by P12, `AGENTS.md` guideline 6 and constitution rule 8. Sizes are measured at the gate and recorded here (renderer `dist/` growth in section 11.5; installer growth per platform is not measured).

| Dependency | Why it is needed | Why not something already installed | Licence |
|---|---|---|---|
| `three` | Draws the 3D view (VIS) | Nothing in Studio draws 3D; writing a WebGL renderer is not proportionate | MIT (**Verified** at the pinned version 0.187.0, `gate/dependencies.json`) |
| `jolt-physics` | Rigid-body physics (PLT-007, PLT-008) | The 2.0 plants have no physics; a rigid-body solver is not something to write in-house | MIT (**Verified**) |

A React binding for three.js (`@react-three/fiber`) is not included. The plant core owns the scene and the view only draws it, so a binding is optional; it is added only if the gate shows a concrete need.

## 5. Open Industry Project
- It describes itself as a "Browser-based industrial automation simulator: conveyors, sensors, PLCs (TypeScript, three.js, Jolt)" under the MIT licence (**Verified**: repository page).
- It includes its own PLC with a subset of Structured Text and Ladder Diagram, and a desktop application that connects to external PLCs over Modbus TCP, OPC UA, EtherNet/IP, S7, SLMP and ADS (**Verified**: README).
- It has a part SDK and warns that "The project is in early development, and breaking changes can land in any update" (**Verified**: README).
- Its earlier Godot version was archived in October 2026 and the maintainers have not published a reason (**Reported**: ziva.sh).

**What this means for ZPLC.** It confirms that the stack of option A can carry this kind of product. Its code and parts may be reused item by item under MIT with attribution (decision D-18, option B). Depending on it as a library is not recommended in 2.1 because of its own stability warning. The ZPLC firmware has a Modbus TCP server, so a ZPLC board may be able to drive that simulator today; this was **Not verified**.

## 6. How a board takes its inputs from the plant
At the baseline the scheduler core reads each input channel through a port operation, falling back to `zplc_io_read_channel` (`CORE/src/core/zplc_sched_core.c:946`), and board I/O is a table of up to 64 digital or 16-bit analog channels (`CORE/include/zplc_hal.h:266-277`) (**Verified**). That operation visits only the channels of the board table and carries a 16-bit value (`zplc_sched_core.c:938-946`), so it cannot feed an input that has no channel, or a REAL (**Verified**). Plant I/O mode therefore adds a port operation; it does not reuse this one.

| Option | How | Verdict |
|---|---|---|
| A. Force table | The plant writes each sensor as a forced value over the control link | Rejected. Force is a diagnostic tool with its own banner and confirmation (IDE-029, UX-018); using it as a data path hides real forces and breaks RT-011's meaning. |
| B. Plant I/O mode | A negotiated mode in which bound inputs are fed by the plant link through a new operation of the port interface | **Recommended** (LNK-007 to LNK-018). The learner's program does not change, and the safe-state rules of the constitution apply to one clearly named mode. |
| C. Modbus TCP | The plant acts as a Modbus client of the board | Rejected for this purpose. The learner's program would have to read Modbus-mapped variables instead of its inputs, so the same program would not run in simulation and on the board (P16). It also needs a network, which the Raspberry Pi Pico lacks. |

## 7. A correction to the conversation of 2026-11-12
Two statements made to the owner before this spec was written were read from a stale checkout (branch `wp-04-compiler-vm-stopgaps`) and are wrong for the baseline:

- "The Zephyr HAL exposes a fixed four outputs and four inputs." At the baseline, board I/O is table-driven (IO-001, IO-002) with up to 64 channels.
- "`sync_inputs_to_ipi` copies the pins to the input image every scan." That function does not exist at the baseline; the input latch is in the scheduler core (section 6).

The conclusion drawn from them still holds: an input written from outside is overwritten by the pin at the next scan unless the firmware has a mode that says otherwise.

## 8. Baseline facts found by the design review
An independent reader checked the first draft of the spec against the baseline on 2026-11-12. Five facts changed the spec. Each was then confirmed by reading the cited lines (**Verified**).

| Fact | Evidence | Effect on the spec |
|---|---|---|
| 2.0 has two models per plant. The live panel runs `plantEngine.ts` and the scenario engine runs its own. They differ: at speed from 900 against 1000 permille, a tank that starts at 500 against 200, and only the graded conveyor jams by itself. | `IDE/src/plants/plantEngine.ts:40`, `:56`, `:74`; `IDE/src/test-engine/index.ts:464`, `:468`, `:520-529` | Decision D-19, PLT-013, PLT-017 |
| Stepping scan by scan exists only in scenario sessions of the native runtime, which refuse `start`. Live sessions run freely and the plant polls them. | `firmware/apps/posix_host/src/native_runtime_session.c:1618-1619`; `IDE/src/plants/plantLoop.ts:1-8` | PLT-005 asks for a scan-exact live exchange, and that work moves into M1 |
| 2.0 records no timing budget. The journey runner states that it gives no timing evidence. | `IDE/scripts/run-journeys.ts:110`, `:162` | PLT-015 and gate check 7 define their own limit |
| A 2.0 path is an ordered list of lessons with one focus language. | `IDE/src/learn/courseDefinition.ts:32-33`, `:99`; LRN-043 | CRS-002, CRS-008 |
| 2.0 grades on a board by evaluating the same scenario on a recorded trace, with the tolerances the lesson declares. | `IDE/src/learn/hardwareCheck.ts:1-14` | CRS-009 |

The first fact is a defect of the released 2.0, not only an input to this spec: a program can look right in the live plant and fail its check.

### 8.1 Baseline facts found while planning the gate
Found on 2026-11-12 while writing `plan.md`. **Verified** rows were read at the cited lines; **Reported** rows come from a code map and were not re-read.

| Fact | Evidence | Effect |
|---|---|---|
| Studio's renderer cannot step a session on the virtual clock: `scenario.step` is not in the renderer's method allow-list, and Studio removes `ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK` from the runtime's environment. | `IDE/electron/security.ts:7-27`; `IDE/shared/nativeSimulationEnvironment.ts:23` (**Verified**) | The scan-exact exchange of PLT-005 needs one more renderer-allowed method and a session option. Both are security-relevant changes for M1 to review; the gate prototypes them on its own branch. |
| A step on the virtual clock that a breakpoint interrupts returns without counting the scan, and the next step must still advance the timestamp by one interval. | `firmware/apps/posix_host/src/native_runtime_session.c:553-568`, `:1826-1838` (**Verified**) | The plant follows completed scans, not timestamps. Whether a held scan costs the program one interval of virtual time is measured at the gate (check 4). |
| A live session emits one `status.changed` per completed scan and applies an input write at the start of the next scan. | `native_runtime_session.c:1983-2000`, `:2423` (**Reported**) | A free-running live session can be followed but cannot be made scan-exact, which is why PLT-005 asks for a stepped exchange. |
| The production bundle test allows exactly one Web Worker (`editor.worker`) and a fixed list of host names, and keeps editors out of the Welcome start chunks. | `IDE/scripts/welcomeBundle.test.ts:81-88`, `:148-151`, `:158-197` (**Reported**) | three.js and Jolt load lazily. Moving physics to a worker (the fallback of check 7) means changing that test on purpose. |
| The production content security policy applies only to a packaged application (`isDev = !app.isPackaged`). | `IDE/electron/main.ts:153`, `:435` (**Verified**) | Check 6 runs in an unpacked packaged build, not in development mode. |
| A branch other than `master` gets no automatic CI run, and the IDE tests run on macOS and Windows only in the nightly workflow. | `.github/workflows/ci.yml:3-9`; `.github/workflows/nightly-quality.yml:106-192` (**Reported**) | The three-system evidence of check 2 comes from the reference machines or from a manual dispatch by the owner. |
| `tools/ci/spec-tracking.test.ts` fails on a spec folder that is neither completed nor linked to spec 011. | `tools/ci/spec-tracking.test.ts:22-30` (**Verified**) | The spec links spec 011 in its header. The test still assumes that 011 is the only open spec; M1 updates it when it extends requirement coverage to this spec. |

Two citations of the first draft were wrong for the baseline and are corrected: the dependency rule is `AGENTS.md` guideline 6 and constitution rule 8, not "rule 5"; and LNK-016 cited an `AGENTS.md` memory rule that the baseline does not contain.

## 9. Open questions for the gate
1. Does the WebAssembly build of Jolt give a belt its surface velocity, and is a five-box stack stable on a travelling pallet? (check 1)
2. Is a run repeatable across Linux, macOS and Windows, with one thread and with several? (check 2)
3. What frame rate and step time does the stress scene reach on each reference machine? (check 3)
4. Can the plant be locked to the native runtime's virtual clock at a 10 ms scan? (check 4)
5. Does the physics library load in the test runner without a browser? (check 5)
6. How many megabytes do the two dependencies add to each installer? (VIS-013)
7. Which parts or assets of Open Industry Project are worth reusing? (check 8)
8. Which Windows machine with a GPU records the Windows evidence? (owner)

## 10. Sources
- Godot 4.6 release page: https://godotengine.org/releases/4.6/
- Godot documentation, Exporting for the Web: https://docs.godotengine.org/en/4.6/tutorials/export/exporting_for_web.html
- Open Industry Project repository: https://github.com/Open-Industry-Project/Open-Industry-Project
- "Is Godot Good for Digital Twins?" (ziva.sh, a vendor of Godot tooling): https://ziva.sh/blogs/godot-digital-twin
- Rapier, JavaScript user guide, advanced collision detection: https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection_js
- Rapier, JavaScript user guide, determinism: https://rapier.rs/docs/user_guides/javascript/determinism
- JoltPhysics.js repository: https://github.com/jrouwe/JoltPhysics.js
- Factory I/O, the product the owner named; the list of its 21 scenes is as the owner pasted it on 2026-11-12 and was not checked against the vendor's site: https://factoryio.com/

## 11. Gate results
**Interim report, 2026-11-12.** The spike is `spike/plant-gate` (latest commit `8749f9d9`, never merged). Its evidence is in `gate/` next to this file. Several checks wait for the owner, so the gate is **open** (section 11.3).

### 11.1 One row per check
Verdicts are `pass`, `fail` or `pending owner`. "Spike commit" is the commit the evidence file names, or the spike commit that added it when the file names an amended one (see the notes under the table).

| # | Check | Verdict | Deciding numbers | Evidence file | Spike commit |
|---|---|---|---|---|---|
| 1 | Conveyor and stack | **pass** (linux x64) | No tuning, plant step 5 ms. Box on belt: speed 0.5 m/s against a 0.5 m/s belt (tolerance 0.01), lateral drift 2.26e-7 m (limit 0.005), speed after the belt stops 0 (limit 0.005). Stack: pallet travel 2.99995 m, largest offset 9.15e-5 m in x and 3.19e-5 m in z (limit 0.010), largest tilt 0.0182 degrees (limit 1), order kept. Ten minutes at rest: speed 0, drift 0, rotation 0 (limits 0.001 m/s, 0.001 m, 0.1 degrees). Box asleep on a stopped belt reaches 0.5 m/s when the belt starts. | `gate/check-1.json` | `406d7a74` as named by the file (pre-amend; the log shows `e8f0b279`) |
| 2 | Repeatability | **pending owner** (linux x64 pass; macOS arm64 and Windows not run) | Linux x64: three fresh runs gave the same hash `5091d6e028aba6d068fdf4079149def92c8fafec4e53b6260c8a64d93f1916e0` (6000 scans of 10 ms). The spec asks for three runs on each of three systems. | `gate/check-2.json` | `a4149b97` as named by the file (the log shows `cbca1894`) |
| 3 | Capacity | **pending owner** (headless step cost only) | Stress scene (20 belts, 200 boxes), 3000 scans of 10 ms, on a loaded host (load average 11.79, 13.7, 9.8). Plant step 5 ms: step p50 1.70 ms, p95 3.10 ms, max 13.66 ms, 5.17 times faster than real time. Plant step 10 ms: p50 0.85 ms, p95 1.57 ms, max 15.52 ms, 10.41 times. Plan threshold p95 at 5 ms step at most 5 ms: met. Frame rate (60 typical, never below 30) and the backlog limit are not measured: sequence 3 `stress` has not run. | `gate/capacity-headless-linux-x64.json` | `cbca1894` as named by the file (the log adds the stress scene in `b9e4bdd1`, after it; see the notes) |
| 4 | One clock | **pending owner** (graded side pass; live side partly run; breakpoint clause reported) | Graded: `gradedHash` `d49abaf2985f0f641662ee9ef235094e4e98072319d977fcf58f24d99de462cb`; eye-on to belt-off timer 50 scans (expected 50 or 51); a seeded 0 to 5 ms pause after every step gives the same hash; pause holds the plant at 1000 ms and one step moves it to 1010 ms. Live, packaged app, GPU off (sequence 5): live hash equals the graded hash, 800 scans, `pausedHeld` true, exchange p50 0.70 ms, p95 1.10 ms, max 8.80 ms. Breakpoint: plant held (`heldSteps` 1, plant at 1000 ms), `timerSkewScans` is -1 (the held scan is not clock-neutral; section 11.4). Not run: the real-time live sequence 2 (`realTimeFactor` of at least 0.99 on 800 and 6000 scans). | `gate/check-4-graded.json`, `gate/bench-linux-x64.json` | `98955984` (graded); `6b92110f` (bench, dirty tree) |
| 5 | Headless | **pass** | The scene runs in the test runner with no GPU: the evidence of checks 1, 2 and 4 (graded) and the step cost of check 3 were all produced headless, in Bun, on Linux x64. The `jolt` flag is true in the packaged app with the GPU off. | `gate/check-1.json`, `gate/check-2.json`, `gate/capacity-headless-linux-x64.json`, `gate/bench-linux-x64.json` | as rows 1 to 4 |
| 6 | Security | **pending owner** (partial) | Packaged app, GPU off: `cspViolations` empty and the plant ran. `webgl2` was false there, so the sequence 1 `probe` (needs a real window with WebGL 2) has not run. The statement that the policy and the security tests are unchanged and pass comes from the executor of Task 7; no evidence file records it. | `gate/bench-linux-x64.json` (key `noGpu.probe`) | `6b92110f` |
| 7 | Editor stays responsive | **pending owner** | Not run (sequence 4 `latency`). No baseline and no value with a plant. | none | none |
| 8 | Prior art | **pass** | Open Industry Project at `5fad5d27c99fd6a297081d610b5c71009aedcdd9`: 1 `reuse` row (box and pallet textures: MIT, with the attribution line), 22 `study`, 11 `no`. | `gate/prior-art.md` | `139e67e4` |

Notes on the evidence files:
- `check-1.json` and `check-2.json` name commits (`406d7a74`, `a4149b97`) that are not in the spike log; the check 1 file calls its hash pre-amend, and the check 2 file says only that it names the commit that adds it. I read the log commits `e8f0b279` and `cbca1894` as their amended counterparts from the log messages; that reading is an inference.
- `capacity-headless-linux-x64.json` names `cbca1894`, but the spike log adds the stress scene and the capacity script in `b9e4bdd1`, one commit later. The file's `scene` is `stress`, so it was produced by code of `b9e4bdd1` or later; the recorded commit is wrong or the file was produced on a dirty tree.
- `bench-linux-x64.json` names `6b92110f` with `dirtyTree: true`: the bench files were uncommitted when it ran.
- `prior-art.md` states 33 rows; its verdict counts (1, 22, 11) add up to 34 and the table has 34 data rows. The counts, not the 33, are the ones to trust.

### 11.2 Answers to the questions of section 9
1. **Answered, yes.** The WebAssembly build of Jolt gives a belt its surface velocity (box at 0.5 m/s, stops with the belt), and a five-box stack stayed within 1e-4 m and 0.02 degrees of its pallet over three travel cycles (`gate/check-1.json`). No tuning was needed.
2. **Partly answered.** One thread, Linux x64: three identical hashes (`gate/check-2.json`). macOS and Windows are open: the owner runs them (Task 8 Steps 2 and 3). Several threads were not measured: the multi-threaded builds of `jolt-physics` need `SharedArrayBuffer`, which needs cross-origin isolation headers, and VIS-012 forbids weakening the security posture inside the gate (`plan.md`, "If a check fails").
3. **Open.** Only the headless step cost is measured (plant step 5 ms: p95 3.10 ms; 10 ms: p95 1.57 ms, on a loaded host, `gate/capacity-headless-linux-x64.json`). Frame rate needs a real window: the owner runs the bench (section 11.3). No macOS or Windows number exists.
4. **Mostly answered.** The plant locks to the native runtime's virtual clock at a 10 ms scan: the graded hash is independent of pace, and the live run through the packaged app (GPU off, not real time) gives the same hash. Pause and single step hold the plant. A breakpoint holds the plant but costs the program one scan of virtual time (section 11.4). Open: the real-time live run.
5. **Answered, yes.** The scene runs in the Bun test runner with no browser and no GPU (all headless evidence files).
6. **Partly answered.** The renderer `dist/` grows by 4,107,562 bytes without source maps (1,089,917 bytes gzip), and by 15,503,958 bytes (2,910,693 gzip) with them (`gate/bundle-size.json`). Installer growth per platform is not measured, because no baseline Electron package was built (too slow); the 4.1 MB is far below the 50 MB limit, but it is not the number the limit names.
7. **Answered.** One item is reusable under its licence (the box and pallet textures); 22 are for study; 11 are not useful (`gate/prior-art.md`). The textures are a licence verdict: the owner should view them before using them (D-18, option B).
8. **Open, owner.** Which Windows machine with a GPU records the Windows evidence is still not named.

### 11.3 Outcome
Spec section 6.1: "**Outcome.** If every check passes, option A of D-14 is confirmed." That sentence does not apply yet. No check has failed, so none of the other sentences ("If only check 1 fails ...", "If check 2 fails ...", "If check 7 fails ...", "If check 3 still fails after tuning ...") applies either. **The gate stays open.** `spec.md` is not changed, and D-14 stays "A, confirmed or overturned by the feasibility gate".

What is missing, and who runs it:
- **Owner, on this Linux machine, with a real window and the GPU on** (the sequences that need a desktop session; keep the window visible, on mains power, with no other heavy program). First `bun run build:compiler` at the repository root, then the build of Task 7 Step 1, with `zplc_runtime` copied into `packages/zplc-ide/dist-native/` (electron-builder only warns when it is missing). Then:
  `cd packages/zplc-ide && bun scripts/plant-gate/bench.ts --sequences probe,live,stress,latency --out ../../specs/012-zplc-2-1-plant-simulation/gate`
  This closes check 6 (sequence 1), the live side of check 4 (sequence 2), check 3 (sequence 3) and check 7 (sequence 4).
- **Owner, MacBook Air M1:** the commands of Task 8 Step 2 (headless tests, `capacityHeadless.ts`, the packaged build and the bench), for checks 2, 3, 4 and 7; the line `plant-gate repeatability darwin arm64 <hash>` comes back.
- **Owner, Windows:** the headless half (`bun test src/plant-gate`) on any Windows machine, or `nightly-quality.yml` dispatched on the branch; the bench needs the Windows machine with a GPU that is still to be named (question 8). Until then Windows is `pending owner` for checks 3 and 7.
- **Executor, after the evidence arrives:** write `gate/check-2.json` with one entry per system (the verdict is `pass` only when the three hashes are equal), update this section, and apply "If a check fails" to any failure.

### 11.4 Check 1 tuning, the plant step, and the held scan
- **Tuning used in check 1: none** (`"tuning": []` in `gate/check-1.json`). The plant step that passed is **5 ms** (`plantStepMs` 5). The 10 ms step was measured only for step cost (check 3), not for check 1.
- **Breakpoint clause of check 4.** The plant stays frozen (`heldSteps` 1), but `timerSkewScans` is -1: with the hold at step 520, `beltOff - eyeOn` was 49 scans instead of 50, because the runtime clock moved during the held step. By "If a check fails" this is "Not a reason to change the stack. Report it as C work for M1": the owner is told, the stack is unchanged.

### 11.5 Growth, licences and marks
Section 4's table gets these numbers (the marks in sections 3 and 4 were updated in place where this gate verified them):

| Dependency | Pinned | Licence | Unpacked size | Renderer `dist/` growth |
|---|---|---|---|---|
| `three` | 0.187.0 | MIT | 21,030,536 bytes | together with `jolt-physics`: +4,107,562 bytes without source maps, +1,089,917 gzip; +15,503,958 and +2,910,693 gzip with source maps (11,395,883 bytes of the growth is the source map) |
| `jolt-physics` | 1.1.1 | MIT | 46,705,042 bytes | (counted with `three`) |
| `@types/three` | 0.187.0 | MIT | 1,946,811 bytes | none (types only) |

All from `gate/dependencies.json` and `gate/bundle-size.json`. The growth is for the two libraries alone, with no part and no asset; the one new renderer chunk is `assets/gateEntry-NL4rK1GY.js`. The unpacked Linux application is 392,681,394 bytes (`unpackedLinuxBytes`); there is no baseline package to subtract it from, so **installer growth per platform is not measured** and VIS-013 is not yet confirmed. The `dist/` files go from 71 to 73.

Marks changed by this gate: section 3, Jolt "conveyor surface velocity" (**Verified**, check 1, WebAssembly build); "repeatability" (**Verified** on Linux x64 only; macOS and Windows still **Not verified**); "runs without a browser" (**Verified**, check 5). Section 4, `three` licence (**Verified** at 0.187.0). Unchanged and still **Not verified**: Jolt threads and their effect on repeatability (not measured, see question 2); the factor by which WebAssembly is slower than native (no native comparison was run); everything about Rapier; the statement that a ZPLC board may drive Open Industry Project over Modbus TCP.

### 11.6 Findings for M1
From the evidence files, the bench and bundle notes, and the work of the spike:
1. **`scenario.step` is absent from the product IPC allow-list** (`IDE/electron/security.ts:7-27`). The scan-exact exchange of PLT-005 needs it allowed in the renderer; this is a security-relevant change for M1 to review (the spike carries it on its own branch).
2. **The native session deletes `ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK`** from the runtime environment (`IDE/shared/nativeSimulationEnvironment.ts:23`). A session option is needed to keep it. Same review.
3. **A held scan is not clock-neutral.** At a breakpoint the runtime clock moves, and a timer fires one scan early against completed scans (`timerSkewScans` -1, `gate/check-4-graded.json`). The plant follows completed scans, so it stays frozen; the fix is in the runtime (C work).
4. **The spike's wake-all of every body while a belt ramps costs 30 to 45 percent of the step.** M1 should wake only the bodies on the belt that changes target (the technique of Open Industry Project: `wakeCargoOn`, with a 0.05 m margin, `gate/prior-art.md`).
5. **`dist-native` must be populated before electron-builder** builds the unpacked application: electron-builder only warns when `zplc_runtime` is missing, so the build looks fine and the native runtime is absent.
6. **A fresh worktree needs `bun run build:compiler` before `tsc -b`.**
7. **`scripts/welcomeBundle.test.ts` passes (9 pass, 0 fail) only because the plant code is behind a dynamic import** of the `gateEntry` chunk, which never joins the start chunks of the Welcome screen. It says nothing about a merged, statically reachable simulation (`gate/bundle-size.json`, `bundleGuards`). Moving physics to a worker (Contingency B) would trip the single-worker rule of that test (`:148-151`) on purpose.
8. **Source maps are 11.4 MB of the 15.5 MB growth** (11,395,883 of 15,503,958 bytes). The size to compare with VIS-013 is the one without them; M1 decides whether Studio ships maps.
9. **Product gates the prototype would trip if it were merged:** `scripts/release/sbom.ts --check` (new dependencies) and `tools/ci/spec-tracking.test.ts` (M1 updates it when requirement coverage extends to this spec; section 8.1). Neither was run against the prototype.
10. **Pallet solver iterations.** Open Industry Project raises them for pallets because a load sinks into the deck at the defaults (`PALLET_VELOCITY_STEPS` 60, `PALLET_POSITION_STEPS` 10, `gate/prior-art.md`). Check 1 passed without tuning, so this is not needed at the gate's pallet, but it is the first thing to try if a catalogue pallet sinks.
11. **Measured host load.** The capacity run was taken at a load average of 11.79, 13.7 and 9.8; the real numbers on a quiet machine should be lower, but the M1 benchmark should record the load.
12. **The bench ran on a dirty tree** (`dirtyTree: true` in `gate/bench-linux-x64.json`); the owner's run should be on a clean checkout of the final spike commit.

Every plan threshold, with the number measured against it:

| Threshold (plan, unless marked spec) | Limit | Measured | Source |
|---|---|---|---|
| Box speed tolerance on belt | 0.01 m/s | speed 0.5 m/s at belt speed 0.5 | `check-1.json` |
| Stopped speed | 0.005 m/s | 0 | `check-1.json` |
| Lateral drift | 0.005 m | 2.26e-7 m (moving), 2.26e-7 m (after stop) | `check-1.json` |
| Stack offset | 0.01 m | 9.15e-5 m (x), 3.19e-5 m (z) | `check-1.json` |
| Stack tilt | 1 degree | 0.0182 degrees | `check-1.json` |
| Rest drift, rotation, speed (ten minutes) | 0.001 m, 0.1 degrees, 0.001 m/s | 0, 0, 0 | `check-1.json` |
| Repeatability | 3 equal hashes per system (spec) | 3 equal on linux x64; macOS and Windows not run | `check-2.json` |
| Step p95 at a 5 ms plant step | 5 ms | 3.10 ms | `capacity-headless-linux-x64.json` |
| Timer scans, eye on to belt off | 50 or 51 | 50 | `check-4-graded.json` |
| Live hash equals graded hash | equal (spec) | equal (GPU off, not real time) | `bench-linux-x64.json` |
| Live `realTimeFactor` | at least 0.99 | not run in real time (the GPU-off run, `realTime: false`, gave 12.46, which is not comparable) | `bench-linux-x64.json` |
| `pausedHeld` | true | true | `bench-linux-x64.json` |
| `medianFrameMs`, `worstSecondFps` | at most 17.5 ms, at least 30 (spec: 60 typical, never below 30) | not run | none |
| Stress `realTimeFactor`, `maxBacklogMs` | at least 0.995, at most 50 ms | not run | none |
| Editor key press to paint, 95th percentile | at most 100 ms (spec) | not run | none |
| `jolt` true, `webgl2` true, `cspViolations` empty | all (check 6) | `jolt` true, `webgl2` false (no GPU), `cspViolations` empty | `bench-linux-x64.json` |
| Installer growth | at most 50 MB per platform (spec) | not measured; renderer `dist/` +4,107,562 bytes without source maps | `bundle-size.json` |
| `welcomeBundle.test.ts` | 0 failures | 9 pass, 0 fail (by a dynamic import) | `bundle-size.json` |
