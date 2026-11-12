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
| Conveyor surface velocity | Expected through its contact listener (**Not verified** for the WebAssembly build; gate check 1) | The JavaScript user guide lists two hooks only, `filterContactPair` and `filterIntersectionPair`, and no contact modification (**Verified** in the user guide; the API reference was not checked). A belt would need a workaround. |
| Repeatability | A build flag, `CROSS_PLATFORM_DETERMINISTIC`, exists (**Verified**); behaviour in WebAssembly is **Not verified** (gate check 2) | "The WASM/Typescript/JavaScript version of Rapier is fully cross-platform deterministic" given the same version and the same order of insertion (**Verified**) |
| Threads | Multi-threaded builds are published (**Verified**); their effect on repeatability is **Not verified** | **Not verified** |
| Runs without a browser | **Not verified** (gate check 5) | **Not verified** |

Conveyors appear in most of the 21 scenes, so native surface velocity weighs more than Rapier's documented determinism. If gate check 1 fails for Jolt, Rapier with a kinematic-belt technique is tried next. If check 2 fails for Jolt and passes for Rapier, the owner chooses between them.

## 4. Dependency justification
Required by P12, `AGENTS.md` guideline 6 and constitution rule 8. Sizes are measured at the gate and recorded here.

| Dependency | Why it is needed | Why not something already installed | Licence |
|---|---|---|---|
| `three` | Draws the 3D view (VIS) | Nothing in Studio draws 3D; writing a WebGL renderer is not proportionate | MIT (**Not verified** at the pinned version) |
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
