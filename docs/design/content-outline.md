# Site content outline (checkpoint 1)

What the new landing page and the navigation say, ranked for the audience, with the file that backs every claim. This is a
design note for the owner's review. It is not a page of the site: Docusaurus serves `docs/docs/` and `docs/src/pages/`, never
`docs/design/`, and no repository guard reads this folder (checked: `tools/ci/product-name.ts`,
`tools/docs/check_capability_claims.ts`, `tools/docs/check_doc_claims.ts`, `tools/hil/validate_docs_parity.py`,
`tools/docs/docs_structure.test.ts` and `tools/docs/capture-screenshots.ts` read `docs/docs`, the Spanish docs, the landing
module and the configuration only).

## How the content was chosen

Sources reviewed: `README.md`, `CHANGELOG.md`, `docs/docs/**` (platform overview, getting started, languages, ZPLC
application, learn, runtime, guides, reference, safety and limitations, release notes), `packages/zplc-ide/DESIGN.md`,
`packages/zplc-ide/projects/`, `firmware/app/boards/boards.json`, `firmware/lib/zplc_core/src/hal/`,
`tools/docs/language-capabilities.json`, `docs/capability-claims.json`, `docs/static/img/manifest.json` and the intent of
`specs/011-zplc-2-0-remediation/spec.md` (read for intent only; no requirement ID or plan is published).

Ranking rule: a section earns its place by what it proves to the first reader, an automation or controls engineer evaluating
an open PLC, then to students, embedded developers and contributors. A section with nothing backed to show is cut.

## What is proven, and how

| Fact                                                                                                                                    | Evidence                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| All five IEC 61131-3 languages (ST, IL, LD, FBD, SFC) compile to one bytecode format, `.zplc`, run by one C99 runtime                   | `README.md:8-10`                                                                           |
| Each language is edited, built, simulated, debugged, paused, watched, forced and deployed in an end-to-end journey of the application   | `tools/docs/language-capabilities.json` (40 cells, every one `journey`)                    |
| "Deploy" in those journeys goes to the native runtime behind the shell of an emulated board; nothing runs on a physical board           | `docs/docs/languages/index.md:26`                                                          |
| The simulator is a host build of the same C runtime and is bundled with the desktop application                                         | `README.md:52`                                                                             |
| Scenario tests: scripted inputs and timed checks on outputs, from the Tests tab                                                         | `README.md:43`, `docs/docs/guides/scenario-tests.md`                                       |
| 21 example projects, among them a tank level controller, a conveyor, motor start/stop and a pedestrian crossing                         | `README.md:44` (the counts guard holds the number)                                         |
| Learn: 33 lessons in English and Spanish, six stages each, no board, no network                                                         | `docs/docs/learn/index.md:18-24`, `:53`                                                    |
| Learn plants: conveyor, motor, pedestrian crossing, tank                                                                                | `docs/docs/learn/plants.md:15-20`                                                          |
| Seven board profiles, every one at level `cross-build`: it builds and fits its flash and RAM budget; no flash, boot or output is proven | `firmware/app/boards/boards.json`, `docs/docs/reference/capabilities-evidence.md:30,44-56` |
| Scheduler, process image, retentive memory and communication handlers run on `native_sim` and QEMU Cortex-M3 and M0                     | `docs/docs/safety-and-limitations.md:44`                                                   |
| Modbus, MQTT, Sparkplug B and cloud blocks are checked against stand-ins on a loopback socket, not a live broker, service or wire       | `docs/docs/safety-and-limitations.md:46`                                                   |
| `zplc-cli` runs validate, build and scenario tests from a terminal or CI, with the same results as the application                      | `docs/docs/guides/command-line.md:12-16`                                                   |
| `zplc-mcp` is a local MCP server with no network or serial port; AI never flashes, deploys, forces or starts and stops                  | `docs/docs/guides/ai-and-mcp.md:12-17`, `docs/docs/release-notes/index.md:39-40`           |
| HAL ports in source: Zephyr, POSIX, FreeRTOS (and a WebAssembly port that the site will not show)                                       | `firmware/lib/zplc_core/src/hal/`, `docs/docs/runtime/hal.md:4`                            |
| Installers are files of a GitHub release, the only channel today; unsigned; Windows, macOS (ad hoc), Linux `.deb`, `.rpm`, AppImage     | `README.md:27-35`                                                                          |
| MIT licence                                                                                                                             | `LICENSE`, `README.md:68`                                                                  |

## What the site must not say

| Never claim                                                 | Why                                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A board "runs", "supports" or "was tested"                  | Every board is `cross-build`; the `board-capability` and `hardware-tested` rules fail the build |
| Real-time, deterministic scan, timing, jitter               | No board has a measured scan time (`docs/docs/safety-and-limitations.md:25-27`, rule `timing`)  |
| Safety rating, SIL, certification, IEC 61131-3 "compliance" | `docs/docs/safety-and-limitations.md:19-24`; the conformance matrix is not a certification      |
| That Modbus or MQTT "work" or are "supported"               | Checked against stand-ins only (rule `communication-protocols`)                                 |
| Homebrew, AUR, winget, the Microsoft Store                  | Not published (`README.md:29`, rule `distribution-channel`)                                     |
| The browser version, `/app/`, "Try online"                  | Removed by owner decision (S6)                                                                  |
| A number that no file holds                                 | Counts guard; prompt section 3                                                                  |

## Landing page, ranked

Status: **P1** is built in this checkpoint's prototype; **P2** is phase 2, after approval.

### 1. Hero (P1)

- The mark and "ZPLC"; the EN primary tagline as the heading, the action tagline as the line under it (decision D-03).
- Actions: **Download** (the releases page, `README.md:27-29`) and **Get started** (`/docs/getting-started`).
- One real capture: the Ladder Diagram editor with the Blinky example (`docs/static/img/editors/ld-en.png`, `ld-es.png`), its
  regions numbered like the item balloons of a drawing and named in a parts list beside it. Ladder leads because it is the
  notation the first reader recognises at a glance.
- The release status in the caption, one sentence and a link: version 2.0 is a prerelease, no board has been tested on
  hardware, ZPLC must not control machinery (`README.md:13-15`, `docs/docs/safety-and-limitations.md:19-31`).

### 2. Five languages, one bytecode (P1)

- A tab per language with its real editor capture in the visitor's language (`docs/static/img/editors/<lang>-<locale>.png`) and
  one sentence each about what the editor does while the program runs (journeys in `tools/docs/language-capabilities.json`:
  ST 28e, IL 28kc/54b, LD 28f/28b, FBD 28g/28c, SFC 28h/28d).
- One evidence line: each language is edited, built, simulated, debugged, forced and deployed in an end-to-end test, deploy
  goes to an emulated board (`docs/docs/languages/index.md:26`). Link: the Languages page.
- Why second, not third as the prompt's hypothesis had it: it is the strongest backed fact for the first reader, every cell has
  a journey, and real captures exist in both languages.

### 3. Program, simulate and test without hardware (P2)

- The loop of the tutorial in three real captures: the program open, the simulator running with `LED_Output` TRUE, the
  scenario test passed (`docs/static/img/tutorials/blink-2`, `-4`, `-6`; `docs/docs/tutorials/blink-without-hardware.md`).
- One line on automation: `zplc-cli` runs the same checks in CI; `zplc-mcp` lets an assistant compile and test but never
  deploy (`docs/docs/guides/command-line.md`, `docs/docs/guides/ai-and-mcp.md`).
- Gap: the tutorial captures exist in English only. Capture C2 of `image-plan.md` adds Spanish.

### 4. Learn (P2)

- 33 lessons, English and Spanish, six stages each (Objective, Predict, Edit, Run, Observe, Reflect), offline, no board
  (`docs/docs/learn/index.md:18-24,53`).
- The four simulated plants as illustrations G1 to G4 (generated, `image-plan.md`), and one real capture of a lesson
  (capture C3, to be made).
- Link: `/docs/learn`, `/docs/learn/educators`.

### 5. Architecture (P2)

- A hand-built SVG, not a generated image: five languages, the compiler (TypeScript), `.zplc` bytecode, the C99 VM, the HAL,
  and the ports (Zephyr boards, POSIX host, FreeRTOS), with the desktop application around them (`README.md:8-12`,
  `docs/docs/platform-overview/index.md:36-39`, `firmware/lib/zplc_core/src/hal/`).
- Open question: FreeRTOS is a scheduler port in source (`firmware/lib/zplc_core/src/hal/freertos/`); its evidence level is not
  stated anywhere I found. The diagram labels it "port in source" unless the owner names a level.
- Links: Runtime, HAL contract, ISA, compiler.

### 6. Boards and evidence levels (P2)

- The seven boards from `firmware/app/boards/boards.json`, grouped by level (all `cross-build` today), with the level's
  definition (`docs/docs/reference/capabilities-evidence.md:30`) and what is emulated: `native_sim`, QEMU Cortex-M3 and M0
  (`docs/docs/safety-and-limitations.md:44`). Generated from the manifest at build time, never typed.
- No board photographs, real or generated: none is tested, and an image would read as support.

### 7. Communication blocks (P2)

- Modbus TCP and RTU, MQTT with Sparkplug B, cloud blocks: one line each with its guide (`docs/docs/guides/modbus.md`,
  `mqtt-sparkplug.md`, `cloud-blocks.md`) and the honest scope: checked against stand-ins on a loopback socket
  (`docs/docs/safety-and-limitations.md:46`).

### 8. Safety and limits (P2)

- One paragraph of the five "is not" statements and a link (`docs/docs/safety-and-limitations.md:17-31`).

### 9. Get ZPLC and take part (P2)

- Download per system with the unsigned note and the checksum step (`README.md:27-35`), the MIT licence, the repository,
  Contributing, Release notes, Discussions.

### Cut from the prompt's hypothesis

- "Deploy to supported boards, then monitor and debug online" as a lead statement: no board is past `cross-build`, so it moves
  into sections 2 and 6 with its limit attached.
- A comparison table with other projects: it lives in `README.md:61-75`, is dated and sourced, and a landing page cannot keep
  it current. Link it from section 9 at most.

## Navigation

- **Navbar (P1):** Docs (`/docs/getting-started`), Learn (`/docs/learn`), Release notes (`/docs/release-notes`); then search,
  the language switch and GitHub. The "Open in browser" item is removed. Five items keep one line at 1024 px.
- **Footer (P2):** Documentation (Getting started, Languages, ZPLC application, Runtime, Boards, Reference), Project (Release
  notes, Safety and limitations, Contributing, Roadmap), Source (GitHub, Discussions, Licence). The release tag stays in the
  copyright line (REL-033).
- **Docs sidebar:** unchanged in content (owned by the web-removal writer now); restyled in P2.

## Open for the owner

1. Approve the ranking above, in particular languages second and the hero capture (Ladder, Blinky).
2. FreeRTOS on the architecture diagram: "port in source", or a level you can name.
3. `docs/docs/reference/boards.md` is titled "Supported Boards" while every board is `cross-build`; the docs owner may want
   "Boards". Not changed here: it is outside this writer's surface.
4. The Spanish editor captures still show some English strings of the application (the truth rail "Modo SIMULATION",
   "No runtime session", the rung comments of the example). They are real; capture C1 replaces the hero picture when those
   strings are translated in the application.
