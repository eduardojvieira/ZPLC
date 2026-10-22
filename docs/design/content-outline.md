# Site content outline

What the new landing page and the navigation say, ranked for the audience, with the file that backs every claim. This is a
design note for the owner's review. It is not a page of the site: Docusaurus serves `docs/docs/` and `docs/src/pages/`, never
`docs/design/`, and no repository guard reads this folder (checked: `tools/ci/product-name.ts`,
`tools/docs/check_capability_claims.ts`, `tools/docs/check_doc_claims.ts`, `tools/hil/validate_docs_parity.py`,
`tools/docs/docs_structure.test.ts` and `tools/docs/capture-screenshots.ts` read `docs/docs`, the Spanish docs, the landing
module and the configuration only). The landing text itself is in `docs/src/components/LandingPage/content.js`, which the
capability-claims and product-name guards do read.

## What changed at stage A (owner, 2026-10-23)

- "un poco mas moderno": a bolder scale, asymmetric sections, a dark hero.
- "una imagen generada en el primer hero": the hero is the generated image H1, not an editor capture.
- "no abusar" of editor captures: one per section at most, none in the hero; they are evidence, not the face of the site.
- "destacar el learn": Learn is a full section with the real course.
- "todas las features que hacen a zplc unico ... ser portado facilmente a cualquier mcu": a "What makes ZPLC different"
  section that leads with portability, phrased as far as the evidence goes.
- "algo mas de industria, de electronica, de plc, mas que editor de codigo": the page speaks in the notation of the audience
  (terminal strips, ladder rungs, a timing diagram, sequential function chart steps, status lamps).

## Sources reviewed

`README.md`, `CHANGELOG.md`, `docs/docs/**`, `packages/zplc-ide/DESIGN.md`, `packages/zplc-ide/lessons/*/lesson.json` (33
packages), `packages/zplc-ide/src/learn/lessonPackage.ts`, `packages/zplc-ide/src/test-engine/index.ts`,
`firmware/app/boards/boards.json`, `firmware/lib/zplc_core/include/zplc_hal.h`, `firmware/lib/zplc_core/src/hal/`,
`.github/workflows/ci.yml`, `tools/docs/language-capabilities.json`, `docs/capability-claims.json`, `AGENTS.md`, and
`specs/011-zplc-2-0-remediation/spec.md` for intent only.

## What the site must not say

| Never claim                                                                   | Why                                                                                                                         |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| "Ports easily to any MCU", or that a board "runs", "supports" or "was tested" | Ports exist for Zephyr, POSIX and FreeRTOS only; every board is `cross-build` (rules `board-capability`, `hardware-tested`) |
| Real-time, deterministic scan, a scan time, jitter                            | No board has a measured scan time (`docs/docs/safety-and-limitations.md:25-27`, rules `timing`, `timing-figure`)            |
| A safety rating, SIL, certification, IEC 61131-3 "compliance"                 | `docs/docs/safety-and-limitations.md:19-24`                                                                                 |
| That Modbus or MQTT "work" or are "supported"                                 | Checked against stand-ins only (rule `communication-protocols`)                                                             |
| Homebrew, AUR, winget, the Microsoft Store                                    | Not published (`README.md:29`, rule `distribution-channel`)                                                                 |
| A browser version                                                             | Removed from the project (S6)                                                                                               |
| A subset count written as "N lessons"                                         | The counts guard reads it as the total; write "all but one", "21 of them"                                                   |

## Landing page, ranked

Status: every section below is built (stage A built 1 to 4, stage B built 5 to 8 and the footer).

### 1. Hero (A)

- The mark and "ZPLC"; the EN primary tagline as the heading, the action tagline under it (decision D-03); Download (the
  releases page, `README.md:27-29`) and Get started.
- The generated image H1 (`image-plan.md`): a ladder rung drawn as a schematic whose wire reaches an output terminal of a
  generic controller module on a DIN rail. It shows the idea, not the product.
- The release status with an amber lamp: version 2.0 is for evaluation, no board has been tested on hardware, ZPLC must not
  control machinery (`README.md:13-15`, `docs/docs/safety-and-limitations.md:19-31`).

### 2. What makes ZPLC different (A), ranked

| #   | Feature, as the page says it                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **A new microcontroller needs 18 functions.** Portable C99 behind a HAL of 18 functions (clock 2, I/O table 6, storage 3, locks 4, log and life cycle 3) plus 2 optional network calls; a port implements them and passes the port conformance suite (opcodes, loader rejections, scheduler phases and faults, timing, I/O, storage). | `firmware/lib/zplc_core/include/zplc_hal.h`; `docs/docs/runtime/port-interface.md` (generated by `tools/docs/generate_port_interface.ts`), sections "The HAL" and "The conformance suite"; `tools/ci/port-conformance.json` |
| 1a  | Zephyr RTOS: seven board profiles on RP2040, STM32 and ESP32-S3 chips build in CI; the suite runs on `native_sim` and QEMU Cortex-M3 and M0; no board tested on hardware.                                                                                                                                                             | `firmware/app/boards/boards.json`; `docs/docs/reference/capabilities-evidence.md:30,44-56`; `docs/docs/runtime/port-interface.md` (per-opcode row of Zephyr)                                                                |
| 1b  | POSIX host: the simulator of the application is this port.                                                                                                                                                                                                                                                                            | `README.md:52`; `firmware/lib/zplc_core/src/hal/posix/`                                                                                                                                                                     |
| 1c  | FreeRTOS: built and conformance-tested on the FreeRTOS POSIX simulator in CI (owner wording, 2026-10-23).                                                                                                                                                                                                                             | `.github/workflows/ci.yml:323-331` (job "FreeRTOS port (POSIX simulator)"); `docs/docs/runtime/port-interface.md`, "What the suite shows about the ports today"                                                             |
| 2   | **Simulate before any hardware**: the same C runtime built for the host, bundled; scenario tests from the Tests tab or `zplc-cli` in CI.                                                                                                                                                                                              | `README.md:42-43,52`; `docs/docs/guides/scenario-tests.md`; `docs/docs/guides/command-line.md:12-16`                                                                                                                        |
| 3   | **Watch, force and step online** in all five languages: online values, breakpoints, pause and one-cycle step, forced values marked as forced.                                                                                                                                                                                         | `tools/docs/language-capabilities.json` (rows watch, debug, pause, force; journeys 51, 51b, 51d show forced values)                                                                                                         |
| 4   | **A scan in a fixed order**: tasks released together run by release time, priority, task ID, against one snapshot of the inputs; up to 16 tasks, each with its interval; the interval is a deadline, no scan time is measured. The timing diagram shows the order (read inputs, run tasks, write outputs), "not to scale".            | `docs/docs/runtime/scheduler.md:38-45,67`; `docs/docs/safety-and-limitations.md:60`; scheduler phases in `docs/docs/runtime/port-interface.md` ("The scheduler port")                                                       |
| 5   | **A person starts every physical action**: Learn and the MCP server never flash, deploy, force, or start and stop a program.                                                                                                                                                                                                          | `AGENTS.md` rule 7; `docs/docs/release-notes/index.md:39-40`; `docs/docs/guides/ai-and-mcp.md:12-17`; `docs/docs/learn/hardware-track.md` ("You start every physical operation")                                            |
| 6   | **Communication blocks**: Modbus, MQTT with Sparkplug B, cloud services; checked against test servers on this computer, not a live broker or a device on a wire.                                                                                                                                                                      | `docs/docs/safety-and-limitations.md:46`; `docs/docs/runtime/communication-function-blocks.md`                                                                                                                              |
| 7   | **English and Spanish**: the application, the 33 lessons, the documentation.                                                                                                                                                                                                                                                          | `packages/zplc-ide/src/i18n/catalog/`; `packages/zplc-ide/lessons/*/text.{en,es}.json` (33 of each); `docs/i18n/es/`                                                                                                        |

The language feature (one bytecode for five languages) has its own section, next.

### 3. Five languages, one bytecode (A, kept from checkpoint 1)

- One tab per language with its registered editor capture in the reader's language (`docs/static/img/editors/`), one
  sentence each, and the evidence line (`tools/docs/language-capabilities.json`, `docs/docs/languages/index.md:26`).

### 4. Learn (A)

| Fact                                                                                                                                                     | Evidence                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 33 lessons in 12 modules (0 to 11), from the scan cycle to a capstone machine                                                                            | `packages/zplc-ide/lessons/*/lesson.json` (`module`); `docs/docs/learn/course-outline.md`                                                 |
| Levels: modules 0 to 3 foundation (12 lessons), 4 to 7 intermediate (12), 8 to 11 advanced (9)                                                           | `lesson.json` (`level`)                                                                                                                   |
| Every lesson graded: Check runs the saved program against the lesson's scenario and lists failed assertions with time, expected and seen values          | `docs/docs/learn/index.md:23-27`; `packages/zplc-ide/src/learn/lessonCheck.ts`, `gradeRecord.ts`                                          |
| All but one lesson run in simulation (32); 21 also have a hardware track for a learner board, with wiring diagrams and pin maps; no board check recorded | `lesson.json` (`tracks`: 20 both, 12 simulation only, 1 hardware only); `wiring.json` in 21 packages; `docs/docs/learn/hardware-track.md` |
| Four simulated plants: tank, conveyor, motor, pedestrian crossing                                                                                        | `LESSON_PLANTS` in `packages/zplc-ide/src/learn/lessonPackage.ts:37`; `docs/docs/learn/plants.md`                                         |
| Two hint levels, solution on request, teachers can hide it                                                                                               | `LESSON_HINT_LEVELS` in `lessonPackage.ts:40`; `docs/docs/learn/index.md`; `docs/docs/learn/educators.md`                                 |
| Offline, English and Spanish                                                                                                                             | `docs/docs/learn/index.md:18,53`; `text.en.json` and `text.es.json` in every package                                                      |

- The course is drawn as a sequential function chart: each module a step (module 0 the initial step, double frame), one row
  per level.
- One real capture of a lesson (C3, to be taken) and the four plant illustrations (G1 to G4).

### 5. Architecture (built)

A hand-built SVG in the same schematic line work: five languages, the compiler, `.zplc` bytecode, the C99 VM, the HAL and the
ports (Zephyr, POSIX host, FreeRTOS), the application around them.

### 6. Boards and evidence levels (built)

The seven boards from `firmware/app/boards/boards.json` with their level, read from `docs/src/data/boards.json`, which
`tools/docs/generate_board_reference.py` writes and checks; the four levels with the number of boards on each. No board picture.

### 7. Safety and limits, 8. Get ZPLC and take part, footer (built)

As in checkpoint 1: the five "is not" statements and a link; download per system with the unsigned note; licence, repository,
Contributing, Release notes. The workflow section of checkpoint 1 is folded into feature 2; communications into feature 6.

## Navigation

- **Navbar (built):** Docs, Learn, Release notes; then search, language, GitHub.
- **Footer (built):** Documentation, Project, Source.
- **Boards page (built):** renamed "Boards" ("Placas") by its generator, which now states the number of boards at each level.

## Open for the owner

1. Approve the hero concept and generate H1 first.
2. The hero is dark in both colour modes; the rest of the page follows the mode.
