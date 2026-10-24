# Site content outline

What the landing page says, section by section, with the file that backs every claim. This is a design note for the owner's
review. It is not a page of the site: Docusaurus serves `docs/docs/` and `docs/src/pages/`, never `docs/design/`. The landing
text itself is in `docs/src/components/LandingPage/content.js`, which the capability-claims guard
(`tools/docs/check_capability_claims.ts`) and the product-name guard (`tools/ci/product-name.ts`) read.

## The product page (owner, 2026-10-24)

The landing was rewritten from a project page into a product page (`odd/tasks/site-product-page.md`, S1 to S5):

- "te enfocas mucho en las cosas de programacion, no en un PLC de código abierto que puede llevar a cualquier
  microcontrolador": the promise is the PLC for the microcontroller you choose; function names, file names, the bytecode and
  the compiler stages left the page.
- "destacar los puntos fuertes, los lenguajes, el editor, las placas soportadas, la simulacion": each one has its own section.
- "haz una pagina que venda y muestre las features como el learn, la simulacion, debugger": Learn, the simulator and the
  debugger are sections of their own, and a data sheet lists the rest.
- "oculta de la pagina web: La versión 2.0 es para evaluación. Ninguna placa se ha probado con hardware, y ZPLC no debe
  controlar maquinaria. esta aclaracion dejala para la documentcion": the status line of the hero and the "What ZPLC is not"
  label are gone from the site, with the limits that rode inside other sections. The notice is in the documentation: the
  warning at the top of Getting Started (`docs/docs/getting-started/index.md`, and the Spanish page) states it in full, and
  Safety and limitations (`docs/docs/safety-and-limitations.md`) keeps the detail.
- "Los dos por igual": building and learning are two ways in of the same size, each with its own primary action, in the hero
  and again at the close.

## What the site must not say

| Never claim                                                                    | Why                                                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| That a board "runs", "supports", "works", "is ready" or "was tested"           | Every board is `cross-build` (rules `board-capability`, `hardware-tested`); boards are build targets           |
| Real-time, deterministic scan, a scan time, jitter                             | No board has a measured scan time (rules `timing`, `timing-figure`)                                            |
| A safety rating, SIL, certification, "industrial-grade", "production-ready"    | `docs/docs/safety-and-limitations.md` (rule `safety`)                                                          |
| That Modbus, MQTT or a cloud service "works", "is supported" or "was verified" | Checked against stand-ins only (rules `communication-protocols`, `cloud-verified`)                             |
| A browser version, Homebrew, AUR, winget, the Microsoft Store, notarization    | Removed or not published (rules `browser-simulator`, `distribution-channel`, `notarized-or-developer-signed`)  |
| Retentive variables from the source (`RETAIN`)                                 | Source-level `RETAIN` is not supported yet (`docs/docs/runtime/index.md`)                                      |
| A count that differs from the repository                                       | The guard compares boards, lessons, examples, standard functions and standard function blocks with the sources |

The guard reads `content.js` as one block of text and cuts it into sentences only at a full stop followed by a space, so a
sentence runs across the ends of strings. A chip name (RP2040, STM32, ESP32) must not share such a sentence with "runs",
"works", "supports", "ready" or "tested", even across two properties.

## Landing page, in order

### 1. Hero (spine)

- The promise: "The open-source PLC for the microcontroller you choose." Lead: the five IEC 61131-3 languages, simulate and
  debug on your computer, build the same runtime for your board, free and open source. Source: `docs/PRODUCT.md`
  (Positioning).
- The two ways in, the same size, each with a primary action: **Build a controller** (Download ZPLC, the releases page;
  Windows, macOS and Linux; Get started) and **Learn PLC programming** (33 lessons, ZPLC checks the program in every lesson;
  Start learning, `/docs/learn`; For educators). Sources: `README.md` (download), `packages/zplc-ide/src/generated/
lessonIndex.json` (33 lessons, the count the guard holds), `docs/docs/learn/index.md` (Check).
- The generated image H1, kept from the previous rewrite.

### 2. Portability: "Write the program once. Choose the hardware."

| Claim                                                                                                                   | Evidence                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| The runtime is portable C99 and reaches the hardware through one interface                                              | `firmware/lib/zplc_core/include/zplc_hal.h`; `docs/docs/runtime/port-interface.md`                              |
| The program runs on the same runtime on Zephyr boards, the FreeRTOS port and the simulator; the wiring diagram draws it | `docs/PRODUCT.md`; `.github/workflows/ci.yml` (FreeRTOS POSIX simulator job); `firmware/lib/zplc_core/src/hal/` |
| Zephyr: seven board profiles with RP2040, STM32 and ESP32-S3 chips, serial to Ethernet and Wi-Fi                        | `firmware/app/boards/boards.json` (7 entries, `network`)                                                        |
| FreeRTOS: a second RTOS port checked by the port conformance suite in CI                                                | `docs/docs/runtime/port-interface.md` ("What the suite shows about the ports today")                            |
| A port implements 18 functions; the conformance suite checks instructions, scheduler, I/O and storage                   | `docs/docs/runtime/port-interface.md` (The HAL, The conformance suite)                                          |
| The terminal strip: the six groups of the HAL with each function in words, 18 numbered plus 2 optional                  | `zplc_hal.h`; groups as in `port-interface.md`                                                                  |

### 3. Boards: "Seven boards to start from"

- The boards come from `docs/src/data/boards.json` (written by `tools/docs/generate_board_reference.py` from the manifest):
  name, Zephyr target, network, and the tag of the two learner boards (`learner: true`). Each profile builds on every change
  and fits its flash and RAM budget (`docs/docs/reference/boards.md`).
- The generated image G5 (boards on one rail, wired to the same terminal block), `docs/static/img/generated/README.md`.
- A request for community reports, with the board report form; no claim of a level.

### 4. Languages: "Five IEC 61131-3 languages, an editor for each"

- One tab per language with its registered editor capture (`docs/static/img/editors/`, `manifest.json`) and one sentence.
- What the editors offer: completion, go to definition, find references and rename across the project in Structured Text
  (`docs/docs/ide/editors.md`, "The Structured Text language service"); every editing action of the Ladder, FBD and SFC
  editors from the keyboard (`docs/docs/ide/editors.md`, "Editing from the keyboard"); the command palette, Ctrl+Shift+P,
  reaches every command (`docs/docs/ide/features.md`, "Application menu, command palette and shortcuts").

### 5. Simulate and debug: "Simulate and debug before you wire anything"

| Rung                                                                                               | Evidence                                                                                     |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Breakpoints on an ST or IL line, a rung, an FBD block, an SFC step                                 | `docs/docs/guides/simulate-and-debug.md` (section 2)                                         |
| Pause between scans, step one cycle, resume (timing diagram of one scan, "not to scale")           | `docs/docs/ide/features.md` (Pause, resume, step and Stop); `docs/docs/runtime/scheduler.md` |
| Watch in decimal, hexadecimal, binary or time; a forced value stays marked until released          | `docs/docs/ide/features.md` (The Watch table); `docs/docs/guides/force-values.md`            |
| The live I/O faceplate: switch, push button or slider per input; the change lands at the next scan | `docs/docs/ide/features.md` (Live I/O)                                                       |
| Scenario tests in the Tests tab or with `zplc-cli` in CI                                           | `docs/docs/guides/scenario-tests.md`; `docs/docs/guides/command-line.md`                     |

- The capture is the recorded picture `screen-reader-check/2026-10-20/<locale>-9-plant-at-speed.png` (listed with its hash in
  that folder's `results.json`), shown as two regions through a CSS crop window (`Crop.js`): the status line and the code
  with live values, and the inputs of the Live I/O faceplate. No derived raster is published.

### 6. Learn (band): "Learn PLC programming without buying a PLC"

| Fact                                                                                  | Evidence                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 33 lessons in 12 modules, from the scan cycle to a small machine, English and Spanish | `packages/zplc-ide/lessons/*/lesson.json`; `docs/docs/learn/course-outline.md`              |
| Check lists each failed assertion with time, expected and seen value                  | `docs/docs/ide/features.md` (Learn); `packages/zplc-ide/src/learn/lessonCheck.ts`           |
| All lessons but one run in the simulator; 21 have a track for a learner board         | `lesson.json` (`tracks`: 20 both, 12 simulation only, 1 hardware only); `wiring.json` in 21 |
| Four plants, with faults you can trigger                                              | `LESSON_PLANTS` in `lessonPackage.ts`; `docs/docs/ide/features.md` (Live plants)            |
| Two hint levels, solution on request, a teacher can hide it                           | `docs/docs/learn/educators.md`                                                              |

- The course as a sequential function chart, the capture `learn/lesson-checked-*.png` (journey 59, shown through a crop
  window on the lesson panel and the code), the plants G1 to G4.

### 7. Technical data

| Row           | Evidence                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Languages     | `docs/docs/languages/index.md`                                                                                                |
| Runtime       | `docs/docs/runtime/index.md`                                                                                                  |
| Platforms     | as section 2                                                                                                                  |
| Boards        | `firmware/app/boards/boards.json`                                                                                             |
| Tasks         | `docs/docs/runtime/scheduler.md` (at most 16 tasks, interval, priority)                                                       |
| Library       | `docs/docs/reference/function-blocks.md` (34 blocks, their groups); `docs/docs/reference/functions.md` (297, 240 conversions) |
| Communication | `docs/docs/runtime/communication-function-blocks.md` (twelve blocks: Modbus, MQTT, Sparkplug B, Azure, AWS)                   |
| Debugging     | as section 5                                                                                                                  |
| Testing       | as section 5                                                                                                                  |
| Examples      | `welcomeExamples()` in `tools/docs/check_capability_claims.ts` (46 on the Welcome screen)                                     |
| Application   | `README.md`; `docs/docs/ide/features.md` (Interface language)                                                                 |
| AI assistants | `docs/docs/guides/ai-and-mcp.md` (no tool flashes, deploys, forces, starts or stops)                                          |
| Licence       | `LICENSE`                                                                                                                     |

### 8. Close

The two ways in again, side by side, and the source: MIT, one public repository, Contributing, Discussions, Release notes.

## Navigation

Unchanged: the navbar (Docs, Learn, Release notes; search, language, GitHub) and the footer (Documentation, Project, Source).
The footer still links Safety and limitations, which is a page of the documentation.
