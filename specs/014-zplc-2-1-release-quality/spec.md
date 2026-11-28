# Feature Specification: ZPLC 2.1 Release Quality

**Implementation branch**: none of its own. Work lands on the 2.1 integration branch `feat/plant-simulation` through the threads of sections 6 and 9 (design default)  
**Created**: 2026-11-24  
**Status**: Adopted in its decisions. The owner's statements of section 5.1 are recorded. The decisions of section 5.2 were taken on 2026-11-24 by the reviewer, as statement S-19 delegates, D-31 was changed on 2026-11-25 by statement S-20, and D-36 was added the same day under S-21; D-37 was taken by the owner on 2026-11-26 with statement S-23, the one addition after the freeze; the owner overturns any of them with a new statement  
**Baseline**: commit `ed3a95bb`, version `2.0.1`  
**Builds on**: [spec 011](../011-zplc-2-0-remediation/spec.md) (principles P1 to P13), [spec 012](../012-zplc-2-1-plant-simulation/spec.md) (P14 to P17) and [spec 013](../013-zplc-2-1-studio-experience/spec.md) (P18 to P22). Their requirements stay in force  
**Paths**: `IDE/` stands for `packages/zplc-ide/`

## Contents
1. [Purpose and audience](#1-purpose-and-audience)
2. [What ZPLC is](#2-what-zplc-is)
3. [Where 2.1 stands](#3-where-21-stands)
4. [Principles](#4-principles)
5. [Scope and decisions](#5-scope-and-decisions)
6. [Workstreams](#6-workstreams): [FRZ](#frz-scope-freeze) freeze, [BAR](#bar-the-commercial-bar) bar, [JRN](#jrn-golden-journeys) journeys, [REV](#rev-deep-reviews) reviews, [AIX](#aix-ai-experience) AI, [UXV](#uxv-final-visual-verification) visual verification, [FIX](#fix-fix-waves) fixes, [OSS](#oss-free-project-readiness) free project, [PUB](#pub-documentation-and-site) documentation and site, [RCN](#rcn-candidates-and-release) candidates
7. [The review map](#7-the-review-map)
8. [Measures and definition of done](#8-measures-and-definition-of-done)
9. [Delivery order](#9-delivery-order)
10. [Traceability](#10-traceability)
11. [Glossary](#11-glossary)

## 1. Purpose and audience
Specs 012 and 013 say what 2.1 adds. This specification says when 2.1 is finished: what "complete" and "polished" mean for ZPLC, how that is found out, and how what is found gets closed before the release.

It adds no feature of its own, with one exception: what closes a gap in a golden journey (section JRN). The AI work of section AIX is that exception applied to the assistant and to MCP, which were built before the plant existed.

It changes no safety rule, no evidence rule and no originality rule. P7, P17 and LNK-009 stay as they are.

**Audience.** The owner, who signs the candidate and may overturn any decision of section 5.2. The orchestrating agent and its writers, who close findings. The reviewer, who looks from outside the run, took the decisions of section 5.2 under S-19, and writes the bar (BAR-001).

## 2. What ZPLC is
ZPLC is one free tool that takes a person the whole way from a first rung of Ladder to a real board that controls a machine. The way has four legs:

| Leg | What the person does | What ZPLC gives |
|---|---|---|
| Learn | Understands an idea and practises it | The course inside Studio, in five IEC 61131-3 languages |
| Program | Writes, reads and changes a program | Studio, the compiler, the assistant |
| Simulate and check | Sees the program run a plant and knows whether it is right | The 3D plant with physics, tests and deterministic grading |
| Take it to hardware | Runs the same program on a board | The runtime on low-cost microcontrollers, and a real board that drives the simulated plant |

Each leg exists elsewhere as a separate product. ZPLC is the path that joins them, and it says at every step what has been verified and at what level. That honesty is part of the product.

Two definitions follow, and the rest of this document applies them (owner's statement S-15):

- **Complete**: the path has no gaps. A person never has to leave ZPLC, or guess, to get from one leg to the next.
- **Polished**: the path has no stumbles. Nothing on the way makes a person stop, wonder what happened, or lose trust.

The people on the path are a **learner** (student or self-taught), a **maker** (owns a board), a **teacher** (runs a class), and, through AI, a person who works with the **assistant** inside Studio or with their own **agent** over MCP.

## 3. Where 2.1 stands
Measured on `ed3a95bb` unless a date is given.

| Fact | Measure | Evidence |
|---|---|---|
| The four legs exist | Course, Studio, plant, board link are in the tree | Specs 012 and 013 |
| Course | 111 lesson packages, 20 modules, 3 paths; 21 packages have a reading page | `IDE/lessons/course.json`; `IDE/lessons/*/reading.en.md` |
| Plant look | Composed models for four part kinds (belt, diffuse sensor, push button, emitter); every other kind is one box, cylinder or arc | `IDE/src/plant/view/models.ts`; spec 012 D-27 |
| Assistant | Four modes: ask, plan, edit, debug. A change is a reviewed proposal that a person saves | `IDE/src/components/aiProviderPresentation.ts:1`; IDE-030 |
| MCP | 15 tools and 15 resources, all read or evidence; no physical operation | `docs/docs/reference/mcp.md:30-64` |
| AI, measured | A reviewer acting as an agent over MCP passed a plant lesson in Structured Text with its own file tools. A failed run answers "Test execution failed" and no detail; the trace of 33 of 43 plant lessons is refused; no MCP tool writes; the Ladder, FBD and SFC documents are described nowhere; the assistant was never run against a model | `reviews/ai.md` (2026-11-24, source `25142fb7`) |
| AI and the plant | The MCP server names no scene and no plant map; `IDE/src/ai` names neither | `IDE/src/mcp/server.ts` (no occurrence of "scene"); `IDE/src/ai/` |
| Visual checks today | The window opens at 1440 by 900 and its minimum is 1024 by 768. The journeys run almost always at 1440 by 900; the editor captures at 1366 by 768, in light and dark, English and Spanish. Studio has three themes and the 3D view three display modes and three quality levels. In one week three layout defects were found by checks that were not looking for them: an overflow in Project settings, the clipped tabs of the results panel, and scenes cut by the opening camera | `IDE/electron/main.ts:315-318`; `IDE/scripts/journeys.ts`; `IDE/scripts/capture-editor-shots.ts`; `IDE/src/store/ideStoreTypes.ts:33`; `IDE/src/plant/view/{displayModes,quality}.ts`; run log L298, L302 |
| Documentation and site today | The site is built with Docusaurus in English and Spanish and published at `https://eduardojvieira.github.io/ZPLC/`; a broken link fails the build. It keeps one version, labelled 2.0. It is published on every push to `master` that touches the documentation or the product, and its footer names the latest published release. The release notes page is the one of 2.0.0, and the home page names neither the plant, nor AI, nor 2.1 | `docs/docusaurus.config.js:30-42`, `:103-106`; `docs/versions.json` (empty); `.github/workflows/deploy-docs.yml:3-20`; `docs/docs/release-notes/index.md:10`; `docs/src/pages/index.js` (at `77dfb9af`) |
| Physical boundary | In force and numbered rule 8; spec 011 P7 still cites "rule 7" | `AGENTS.md:44-45`; `specs/011-zplc-2-0-remediation/spec.md:98` |
| Board evidence | A rehearsal against the native simulator only | `specs/012-zplc-2-1-plant-simulation/evidence/plant-io-native-sim-rehearsal.json` |
| Journeys | 156 automated journeys | `IDE/scripts` (`proves:` entries) |
| Hosted checks | CI starts on pushes to `main`, `master`, `zplc-2.0-candidate`, on pull requests to them, and by hand | `.github/workflows/ci.yml:3-8` |
| Release state | Version `2.0.1`; `## Unreleased` is empty | `IDE/package.json:4`; `CHANGELOG.md:23` |
| Reviews from outside | Two on 2026-11-23 (plant look, lessons) and one on 2026-11-24 (plant pilot) found what the tests did not: state not drawn, scenes cut by the first camera, lessons that set a task without teaching it, 42 lessons whose steps did not lead to a grade | Spec 012 S-12, S-13 |

**What this shows.** The parts are built. What decides the release now is the join between them and the finish of each, and neither is visible to a unit test. Both reviews of 2026-11-23 closed defects that sat under green suites.

## 4. Principles

| # | Principle | Meaning |
|---|---|---|
| P23 | The path is the product | Work is ordered by what it does to a person walking the path of section 2. A gap or a stumble on a golden journey comes before any other improvement. |
| P24 | A reference sets a bar, never a target | Other products show what a finished product does. They are read for criteria, from several references per subject. Nothing is matched to one product, and P17 holds. |
| P25 | Found by looking, closed by measuring | A finding comes from someone who did not write the thing, looking at the thing itself. It is closed when the measure that found it is run again and passes. |
| P26 | AI walks the same path | The assistant and MCP see what the person sees, use the same words, respect the same boundaries (P7) and report evidence at the same levels. AI is a way through the path, not a path of its own. |
| P27 | What is not done is said | Whatever misses the release is written in "Known limits", at the evidence level it holds. A release is never polished by leaving a limit out. |

## 5. Scope and decisions

### 5.1 Owner statements (binding)

| # | Statement | The owner's words |
|---|---|---|
| S-14 | 2.1 finishes integrating the features and is a complete and polished product. | "La idea de 2.1 es terminar de integrar features y tener un producto completo y pulido" (2026-11-24) |
| S-15 | ZPLC is the complete path from learning to real hardware; complete and polished are defined on that path. | "Es exactamente eso: Completo: el camino no tiene huecos. Pulido: el camino no tiene tropiezos." (2026-11-24) |
| S-16 | Existing products are used, in clean-room mode, to raise the quality to commercial standards. Factory I/O is one example; others that serve may be used. | "la idea es usarlo comparando con proyectos existentes en modo sala limpia para subir el nivel de calidad del proyecto hasta estándares comerciales"; "también podemos usar otros ejemplos que nos sirvan" (2026-11-24) |
| S-17 | Deep reviews from outside the run are part of the method. | "También lo vamos a combinar con revisiones profundas de tu parte." (2026-11-24) |
| S-18 | AI in ZPLC is polished too: well integrated and useful. It adds journeys, MCP among them. | "También el tema de la IA en zplc hay que pulirlo. Que este bien integrado todo y que se útil. Esto también agrega otros recorridos como el de mcp" (2026-11-24) |
| S-19 | The reviewer takes every decision of section 5.2 in the owner's place, for the best and most complete release. The reviewer defines the commercial bar and does all of its research when its time comes. | "Responde vos de la mejor forma, para tener la mejor release y más completa todas las desiciones mías. Vos vas a definir la vara comercial, vas a hacer el research completo cuando llegue el momento" (2026-11-24) |
| S-20 | ZPLC is to have the best AI integration. An agent such as Claude Code, through MCP, writes a program in any supported language, debugs it, and does everything else. | "Hagamos la.mejor integración con IA. Un agente de Claude code con el mcp debería poder escribir un programa en cualquiera de los lenguajes soportados, hacer depuración, todo. Hoy en día la integración con IA es muy importante" (2026-11-25) |
| S-21 | A final visual verification with correction is added: how Studio, the 3D view, the lessons and everything else look, in different conditions, so that the experience is excellent. It is the last addition to the scope. | "Agrega también una verificación final visual con corrección de ux. Verificar como se ve el ide, el visor 3d, las lecciones, todo en distintos escenarios para garantizar una excelente ux. Ya esto es lo último" (2026-11-25) |
| S-22 | The release includes the update of the documentation and of the published site with everything that is new. | "Me imagino que también se incluye una actualización de la documentación y del Github pages para este reléase con todo lo nuevo" (2026-11-25) |
| S-23 | A hole to fix: an FBD diagram and a Ladder rung are to place every standard function the compiler registers, and the build is to translate them. It enters 2.1.0 after the freeze of S-21 because the owner decides so (D-37). | "parece que hay un agujero que hay que arreglar, deberiamos hacer que el compilador los traduzca" (2026-11-26) |

### 5.2 Decisions
Taken on 2026-11-24 by the reviewer, as S-19 delegates. Each is the option that gives the most complete release that can still converge. The owner overturns any of them with a new statement.

| # | Subject | Options | Taken | Why | Decides |
|---|---|---|---|---|---|
| D-28 | When the scope freezes | (A) No freeze: features keep arriving until the release. (B) Freeze when the threads open on 2026-11-24 reach their last stop; after it only fixes of findings enter. | **B, with nothing cut.** Every item open on 2026-11-24 stays in 2.1.0: the plant catalogue and the closes of spec 012, board evidence on two families, the closes of U2 and all of U3 of spec 013, the course to the standard of S-13 in every module, the hosted checks and the release work, and AIX as D-31 sets it, whose tools land before the freeze. The freeze stops new scope only. | Complete is the goal (S-14, S-19), so nothing in scope moves to 2.1.x. Polish cannot converge on a scope that keeps growing (two large scopes entered in one week, S-12 and S-13), so nothing new enters. | FRZ |
| D-29 | How references are used | (A) Run a compare-and-refine loop with another product as the original. (B) Read at least two references per subject for criteria, from public material and ordinary use; run compare-and-refine only against targets the project owns. | **B, and the reviewer is the study side.** The reviewer reads the references and writes `bar.md`. The run (orchestrator, writers, generators) reads `bar.md` and never a reference. | A loop that measures likeness to one product pulls ZPLC towards that product, which P17 forbids. Keeping whoever writes code or generates assets away from the references is clean-room work in the strict sense (S-16, S-19). | BAR |
| D-30 | The golden journeys | (A) The 156 automated journeys are the test. (B) Five end-to-end journeys on the packaged application are the test, one per person of section 2, and the automated ones support them. | **B.** | A person meets the installer, not the test suite. | JRN |
| D-31 | AI scope of 2.1.0 | (A) Polish what exists. (B) Also let the assistant and MCP read what 2.1 added. (C) Also let an agent write and debug over MCP. | **C in full, in simulation** (changed on 2026-11-25 by S-20). Over MCP an agent does in simulation what a person does in Studio: it reads the project, the plant and the lesson, writes a program in any of the five languages, builds, tests and debugs. Nothing on a board and nothing on a session a person is running: rule 8 of `AGENTS.md` stays. The assistant inside Studio keeps its reviewed proposals and is polished; making it a tool-using agent is left to 2.2. | S-20. The review of 2026-11-24 measured the distance (`reviews/ai.md`): an agent passes a plant lesson in Structured Text with its own file tools, but learns nothing from a failed run, cannot read the trace of 33 of 43 plant lessons, and has no description of the Ladder, FBD and SFC documents. The best agents already exist outside Studio, so 2.1.0 gives them hands and eyes inside ZPLC instead of building a lesser one inside it. | AIX |
| D-32 | The assistant inside a lesson | (A) It answers whatever is asked. (B) It gives a hint first and a solution only when asked plainly, and never when solutions are hidden. | **B.** | A course that the assistant solves teaches nothing; a teacher's setting must hold. | AIX-005 |
| D-33 | The polish budget | (A) Fix until nothing is found. (B) Two fix waves per review; what remains is a blocker to fix or a known limit to write down. | **B; a blocker has no budget.** The two waves bound the visible findings. A blocker is fixed however many waves it takes. | P27 makes the remainder honest instead of endless, and no blocker ships. | FIX |
| D-34 | Who signs the candidate | (A) Green automated checks. (B) The owner walks the five journeys on the packaged application on Linux and on one of Windows or macOS, after green hosted checks and board evidence. | **B, on Linux and on Windows, one walk in each interface language.** The first-run check on a real Mac and a real Windows machine that REL-016 of spec 011 asks before a release is published stays as it is: this decision adds the five journeys, it removes nothing. Only a statement of the owner waives a real machine, and then the release notes say so. | Most people who program PLCs work on Windows. English and Spanish are both shipped, so both are walked. REL-016 already binds the release to real machines, and P27 covers what is waived. | RCN |
| D-35 | Which protocol revisions the MCP server serves | (A) Revision 2026-07-28 only, as today (`legacy: 'reject'`). (B) Both eras, as the SDK serves by default. | **B.** | The repository records no reason for A (`docs/docs/guides/ai-and-mcp.md:66`). Reports of October 2026 say several common clients still open with the 2025 handshake, which the server answers with error `-32022` (`reviews/ai.md`, AI-04). An agent that cannot connect cannot do anything else. | AIX-007 |
| D-36 | The conditions of the visual verification | (A) Every surface in every combination of size, theme, language, density, system and state. (B) A covering set. | **B.** Every surface: at 1440 by 900 in light and in dark, in English and in Spanish; at 1024 by 768 in Spanish, the longest language at the smallest window; in high contrast in English. Every surface that has them: its empty, full, waiting and failed states, and the compact density. Sizes 1366 by 768 and 1920 by 1080, a display scale of 150 %, and a screen whose usable area is smaller than the minimum window, on the surfaces of the golden journeys. The 3D view: the 21 scenes at three window shapes; a reduced set of scenes at each quality, each display mode, reduced motion and software rendering. Linux in full; Windows and macOS on the installers, on the surfaces of the golden journeys. | A does not end: the product of the conditions is in the thousands per surface. B puts each condition where it breaks things: the longest text in the smallest window, each theme once everywhere, each system where fonts and frames differ. | UXV |
| D-37 | Whether FBD and Ladder place every function the compiler registers | (A) Keep the limit of 2.0: FBD places 8 of the 297 registered functions and Ladder 15 boxes, and the pages send the rest to Structured Text (`docs/docs/languages/fbd.md:31` and `:49`, `docs/docs/languages/ld.md:32`). (B) Both place all 297 through one mechanism driven by the compiler's own table, in 2.1.0, after the freeze. | **B, taken by the owner on 2026-11-26 (S-23)**, as LNG-029 and LNG-030 state it: one mechanism, not 289 cases; the ST of every existing diagram and rung and the lesson trace hashes stay identical; no change to the compiler's code generation or to the C runtime, and if one is needed the run stops and asks the owner. The plan is `plan-lng.md`. | The external review of 2026-11-26 (`.cache/claude-ux-review/fbd-functions-check/README.md`, F-04) measured the gap against "Complete": a diagram cannot convert an `INT` to a `REAL`, take a square root or shift a word without a second file in another language, and an agent writing FBD or Ladder over MCP meets the refusal at once. In IEC 61131-3 the standard functions are common to every language. It is no new language feature: the compiler already registers the 297 and Structured Text and Instruction List call them. | LNG-029, LNG-030 |

### 5.3 Design defaults

| Default | Used by |
|---|---|
| The bar, the journeys and the review records live in this folder: `bar.md`, `journeys.md`, `reviews/<area>.md` | BAR, JRN, REV |
| The reviewer writes the bar and the review records; the run writes the journeys, the scope list and every change to the product | BAR-001, REV-001 |
| `handoff.md` in this folder is the brief for the run: what to do first, the threads, the stops. It replaces the messages in which this spec was written | All |
| Captures are output of a run and stay out of the repository; the list of surfaces and the manifest of the accepted set are in it (`screens.md`) | UXV-001, UXV-003 |
| A finding has an id, a measure, a place, a severity and a state; severities are blocker, visible and later | REV-004 |
| A reference is classed as open (may be studied in depth under its licence) or proprietary (public material and ordinary use only) | BAR-003 |
| Usefulness of AI is judged by outcome on a fixed task set, with the model and the date recorded | AIX-009 |
| Time targets of journeys are measured on the reference laptop with a clean profile | JRN-003 |

### 5.4 Relationship to specs 011, 012 and 013
This spec adds requirements; it removes none. It extends IDE-030 (the assistant and the review), LNG-007, LNG-022, LNG-023 and LNG-028 (the standard functions in FBD and Ladder, LNG-029 and LNG-030 continue the numbering of spec 011), LNK-009 (AI may run a scene scenario headless), CRS and LRN (the course), VIS (the plant view), GDE (first use) and REL (the release). Section 10.2 lists the pairs.

### 5.5 Out of scope
- New language features, new plant parts, new board families.
- Any AI or MCP path to a physical operation (P7, LNK-009).
- An MCP tool or an assistant proposal that acts on a board, a serial port, plant I/O mode or a session a person is running (rule 8, AIX-010).
- A tool-using agent inside Studio: in 2.1.0 the assistant inside Studio stays a one-request helper with reviewed proposals (D-31).
- Matching the look, the layouts or the content of another product (P17, SCN-003).
- A redesign of the product website; only what OSS asks of the repository front page.

## 6. Workstreams

| Prefix | Workstream | Requirements |
|---|---|---|
| FRZ | Scope freeze | 4 |
| BAR | The commercial bar | 7 |
| JRN | Golden journeys | 8 |
| REV | Deep reviews | 6 |
| AIX | AI experience | 15 |
| UXV | Final visual verification | 9 |
| FIX | Fix waves | 4 |
| OSS | Free-project readiness | 5 |
| PUB | Documentation and site | 5 |
| RCN | Candidates and release | 6 |
| LNG | Standard functions in FBD and Ladder | 2 |

### FRZ: Scope freeze
- **FRZ-001** The scope of 2.1.0 MUST be written as one list in the repository: each item, its spec, its state and who or what blocks it. The list replaces every other ledger as the answer to "what is left".
- **FRZ-002** The scope MUST freeze at the point decision D-28 names. The freeze is a commit that says so. An item of the list of FRZ-001 MUST NOT move to 2.1.x without a statement of the owner (D-28). By statement S-21 the scope takes no addition after 2026-11-25. Statement S-22 adds nothing: it makes explicit what rule 5 of `AGENTS.md` and RCN-006 already asked. Statement S-23 adds LNG-029 and LNG-030 after the freeze, by the owner's decision (D-37); it is the one exception.
- **FRZ-003** After the freeze a change MUST name the finding (REV-004) or the journey step (JRN) it closes. A change that names neither waits for 2.1.x.
- **FRZ-004** The list of FRZ-001 MUST be updated by the same change that closes or adds an item, and a check MUST fail when a requirement of specs 012 to 014 is neither covered, nor listed as open, nor listed as a known limit.

### BAR: The commercial bar
- **BAR-001** A bar MUST exist as `bar.md`: a list of criteria per subject (first use, programming environment, plant view, teaching, AI, documentation, installers, free project), each stated in ZPLC's own terms and marked must or should. The reviewer researches and writes it (S-19, D-29) in two passes. The first pass covers the subjects still being built on 2026-11-24 (AI, plant view, teaching, programming environment) and MUST arrive before the thread that builds each reaches its last stop, so that the work aims at the bar instead of being redone after it. The second pass covers the rest and MUST arrive at the freeze.
- **BAR-002** Each criterion MUST rest on at least two references or on a requirement of specs 011 to 013. A criterion that only one product meets is that product's choice, not a bar.
- **BAR-003** The references MUST be listed with their class and what was read. An open reference MAY be studied in depth under its licence. A proprietary reference MUST be read only through its public material and ordinary use within its licence terms. The run MUST NOT read a reference of either class for this purpose: it works from `bar.md` (D-29).
- **BAR-004** No asset, scene layout, name, text or screen capture of another product MAY enter the repository, a prompt of an image generator, or a lesson (P17, SCN-003, PRT-009). The bar records ideas and criteria, classed as in `gate/prior-art.md` of spec 012.
- **BAR-005** A tool that compares a build with an original and refines it (Craft Anything is the one named by the owner) MUST run that loop only against a target the project owns: its concept images, the previous release, the published documentation. Against another product it MAY be used for the study step in clean-room mode and for nothing else.
- **BAR-006** Such a tool MUST be tried on a disposable copy before it touches a worktree, MUST NOT run on the integration worktree, and its changes MUST enter through the ordinary flow of writers, checks and verifier.
- **BAR-007** Each area of section 7 MUST be checked against its part of the bar by the reviewer, in the review of that area or, when the review ran before the bar existed, in a check after the freeze. A must criterion that is not met is a finding (REV-004) and joins the fix waves of that area.

### JRN: Golden journeys
- **JRN-001** Five journeys MUST be written step by step in `journeys.md`, each from a clean install to its outcome, with the outcome stated as something the person can see:
  1. **Learner.** Installs, opens Studio, passes the first lesson, and later passes the first plant lesson with the plant moving under their program.
  2. **Maker.** Connects a supported board and reaches a program running on it that drives the simulated plant.
  3. **Teacher.** Chooses a path for a class, hides solutions, and moves a learner's progress from one computer to another.
  4. **Assistant.** Sets up the assistant, has an error explained, accepts a reviewed change in a textual and in a graphical language, runs it, and has a failed plant scenario explained from the plant facts.
  5. **Agent over MCP.** Connects Claude Code or another agent to a project folder, from Studio or with the documented command; the agent reads the project, the plant and the goal, writes the program through MCP in a textual and in a graphical language, builds, runs the scenario, finds the cause of a failure by debugging in simulation, and reaches a pass; the person sees the program appear in Studio and runs it there.
- **JRN-002** A journey MUST be walked on the packaged application, not on a development build.
- **JRN-003** Each journey MUST have a time target and a count of steps, and both MUST be the documented ones: a step the documentation does not give is a gap.
- **JRN-004** A stumble MUST be recorded when a journey shows: a message with no next step; a wait with no sign of progress; a word the glossary does not hold; a control that does nothing; a result the person cannot place; a step that works only on a second try.
- **JRN-005** Journeys 1, 3, 4 and 5 MUST have an automated form that runs in the checks. Journeys 4 and 5 run automated against a scripted model or a scripted client, so the result does not depend on a model.
- **JRN-006** Journey 2 MUST be run on two board families with a person at the bench (HIL), and its record MUST say what was seen on the board.
- **JRN-007** Journeys 4 and 5 MUST also be run once per candidate with a real model and a real client, recorded with the model, the client and the date (AIX-009).
- **JRN-008** A gap or a stumble on a golden journey is a blocker (REV-004).

### REV: Deep reviews
- **REV-001** Each area of section 7 MUST be reviewed by someone who did not write it and is outside the run that wrote it.
- **REV-002** A review MUST look at the thing itself: the drawn frame, the packaged window, the lesson as a learner reads it, the page as published. A test that passes is not a review.
- **REV-003** A review MUST state its method and its evidence level, and MUST say what it did not check.
- **REV-004** A review MUST deliver findings, each with an id, a measure, the place, and a severity: **blocker** (a gap or stumble on a golden journey, a false statement, lost work), **visible** (a person notices it and goes on), **later** (worth doing, not for this release).
- **REV-005** A review MUST leave the script or the steps that produced each measure, so that the measure can be run again.
- **REV-006** A review runs when its area closes, not at the end of the release. The plant look, the lessons and the plant pilot have had theirs; section 7 lists the rest.

### AIX: AI experience
The baseline is `reviews/ai.md` (2026-11-24). Its blockers are closed under FIX. The rule of this workstream (D-31): in simulation an agent does what a person does in Studio; on hardware it does nothing.

- **AIX-001** The assistant and an MCP client MUST be able to read what 2.1 added, for the open project: the parts and signals of the scene, the plant map, the list of scenarios and the expectations of each, and after a run the plant facts and the detail of each failed expectation.
- **AIX-002** In a lesson, the assistant and MCP MUST be able to read the lesson's goal and the stage the learner is at. They MUST NOT read the solution while solutions are hidden.
- **AIX-003** The assistant MUST be reachable from where the need arises, with the context already attached: from a problem in the Problems list, from a failed test or scenario, from the lesson guide, and from a selection in an editor of any of the five languages.
- **AIX-004** What the assistant writes MUST use the words of the interface and of the glossary, and when it names a place (a file, a line, an element, a test) the place MUST open on a click. The assistant has one name in the interface.
- **AIX-005** Inside a lesson the assistant MUST give a hint before a solution, and a solution only on a plain request and never while solutions are hidden (D-32). It MUST NOT mark a lesson as passed; only Check does.
- **AIX-006** Setting up the assistant MUST take the steps the documentation gives and no others, for a hosted provider with a key and for a local endpoint. Every failure MUST say what is wrong and what to do. An answer in any shape a common model gives (a fenced block, a sentence before the data) MUST still reach the person as a reviewable change or as a plain message that says why not.
- **AIX-007** Connecting an agent MUST take one action in Studio, which writes the client's configuration for the open project (a lesson's folder included) and shows the command, or one documented command. Both are shown for Claude Code and at least two other clients. The server MUST serve clients of both protocol eras (D-35), MUST offer a self-check that reports the folder, the tools and the boundary, and a start that fails MUST say why and what to do.
- **AIX-008** The name and description of every MCP tool, parameter, result and resource MUST say, in plain words, what it returns and when to use it. The server MUST give an agent instructions: how to work (read, write, check, run, debug) and where the boundary is. The evidence level is stated once per result, as P21 asks of the interface.
- **AIX-009** Usefulness MUST be measured on a fixed task set kept in the repository, judged by outcome. For each of the five languages: write a program from a goal, repair a failing one, and explain a failure. For the assistant: an explanation names the failing condition, and a proposed change compiles and its scenario passes. Claude Code is the reference client over MCP. Each run records the model, the client, the date and the result. This is recorded evidence, not a deterministic test, and is reported as such.
- **AIX-010** The boundary MUST be visible and pinned: no assistant proposal and no MCP tool acts on a board, a serial port, plant I/O mode, or a session a person is running (P7, LNK-009); a refusal says so in plain words and says what the person can do; a test fails if a tool or a proposal of that kind appears. Rule 8 of `AGENTS.md` and the pages that cite it MUST say exactly this, by its right number. What leaves the computer MUST match `docs/docs/ide/ai-privacy.md`.
- **AIX-011** **Write.** Through MCP an agent MUST be able to create and replace a program of `src` in each of the five languages, to change `zplc.json`, and to create and replace a scenario of `tests`. A write MUST be checked first and refused whole when the file would not load, with diagnostics that name the place and the accepted values. A Ladder, FBD or SFC document is stored in the editors' stable form. A write MUST stay inside the workspace, MUST refuse a sensitive field as IDE-030 does, and MUST leave the old file intact when it fails. The same check MUST be available without writing. Writing a scene or a plant map SHOULD be possible in the same way.
- **AIX-012** **Studio follows.** When Studio has the project open, a file written from outside, by an MCP tool or by an agent's own file tool, MUST appear in its editors and in the 3D view without a restart, with a notice that names the file. A file the person has changed and not saved MUST NOT be replaced without asking.
- **AIX-013** **Formats.** The documents of Ladder, FBD and SFC, the scene, the plant map and the scenario MUST each be described where an agent reads them: a reference page and an MCP resource, with a schema and one worked example. A diagnostic about one of them MUST name the accepted values.
- **AIX-014** **Debug in simulation.** An agent MUST be able to run the program on a simulator the server starts for it, under inputs it chooses, with or without the scene, and to watch any signal it names: inputs, outputs, internal variables, the state of a function block, the active step of an SFC, and the signals and facts of the plant. It MUST be able to stop at a place in any of the five languages (a line, a rung, a block, a step or a transition), to step by cycle, and to read the values there, as a person does in Studio (`docs/docs/guides/simulate-and-debug.md`). The simulator is private to the agent: it never attaches to a board or to a session a person is running.
- **AIX-015** **Answers an agent can use.** A failed expectation MUST come with its position, its condition, and what was expected against what was observed. A trace MUST be readable for every scenario the product ships, as the changes of the watched signals or as a window the agent asks for, never whole by default. An error MUST name its cause and the next step, and a wrong name MUST be answered with the valid ones.

### UXV: Final visual verification
Everything a person sees is captured in the conditions of D-36, measured by a tool, looked at from outside, corrected, and captured again. The run builds the tool and makes the corrections; the reviewer looks.

- **UXV-001** **Inventory.** `screens.md` MUST list every surface a person sees, each with an id and the states it has: Studio (the shell, the five editors, the tabs of the results panel, the sidebars, the preferences, every dialog and notice), Learn (home, paths, a reading, an exercise in each language, the guide, a result), the 3D view (the view, the operate panel, the scene chooser, the scene editor), boards and connection, the assistant, the installers' own windows, and the documentation site. The list MUST be checked against the registries of commands and views, so a new surface cannot stay out of it.
- **UXV-002** **Conditions.** The surfaces are captured in the conditions decision D-36 gives.
- **UXV-003** **Capture.** A tool MUST produce every capture without a person, with fixed data and fixed plant time, so that two runs on one build give the same picture. It builds on what exists (`IDE/scripts/capture-editor-shots.ts`, `IDE/scripts/interfaceBudget.ts`, `IDE/scripts/textFit.ts`, the journeys). A capture is named by surface, state and condition, and the captures of an area are laid out in sheets.
- **UXV-004** **Measured defects.** On every capture the tool MUST measure what a machine can find, and a check MUST fail on any of it: content cut by its container or spilling out of it; text shortened with no way to read the rest; controls that overlap or lie outside the window; a message key or a string of the other language on screen; text contrast under 4.5 to 1, or under 3 to 1 for large text; a control that keyboard travel reaches without a visible focus; in the 3D view, a scene that its opening camera does not hold whole.
- **UXV-005** **Looked at from outside.** Every sheet MUST be looked at by the reviewer (REV-001), against the bar and for what a tool cannot judge: what the eye meets first, alignment and spacing, the same thing looking the same on every surface, a state that can be told from another, a part that looks like what it is, a screen that says what to do next. Each finding is recorded as REV-004 asks, with the capture that shows it.
- **UXV-006** **In motion.** What a still picture cannot show MUST be checked running: the 3D view with the plant moving and its states changing, with the frame rate at each quality on the reference laptop and under software rendering; the window and its panels resized live across the range of sizes; and every wait, which MUST show that work is going on.
- **UXV-007** **Lessons.** Every lesson MUST be captured in both languages, in its reading and in its exercise, with the measures of UXV-004 run on all of them. The reviewer looks at one lesson of each kind in each module at least, and at the 3D view of every plant lesson.
- **UXV-008** **Correction.** The findings go through the fix waves (FIX, D-33). A correction MUST show the same capture before and after. After the last wave the whole set is captured again and compared with the one before: a surface that changed and that no finding names is itself a finding. The accepted set SHOULD stay as the comparison of a check on Linux, so a later change is seen.
- **UXV-009** **The final pass.** The verification MUST run whole on the installers of the candidate, after every other fix wave and before the signature, and its sheets are part of what the owner signs (D-34). It SHOULD also run on each area as the area closes, because a defect seen early costs less.

### FIX: Fix waves
- **FIX-001** Each review is followed by a fix wave: its findings become tasks in the list of FRZ-001, blockers first.
- **FIX-002** A finding is closed only when the measure of REV-005 is run again and passes, and an independent verifier has read the change.
- **FIX-003** Each review has at most the waves decision D-33 gives. What remains is either a blocker, which holds the release, or a known limit.
- **FIX-004** A known limit MUST be written in the `Known limits` part of the changelog, in words for a user, with the evidence level it holds (P27).

### OSS: Free-project readiness
- **OSS-001** The front page of the repository MUST say what ZPLC is in its first screen, in the terms of section 2, and MUST lead to the install of each operating system and to the first lesson.
- **OSS-002** The licence of the code, of the course and of every bundled asset MUST be stated, and generated assets MUST carry their record of origin (VIS-019).
- **OSS-003** A person who wants to contribute MUST find how to build, how to run the checks and how a change is reviewed, and the steps MUST work on a clean clone.
- **OSS-004** The release notes MUST be written for a user: what they can now do, what changed, what to do when moving from 2.0, and the known limits.
- **OSS-005** Cross-references inside the repository MUST agree. Spec 011 P7 citing rule 7 while `AGENTS.md` numbers the rule 8 is the example to fix.

### PUB: Documentation and site
The documentation and the published site describe 2.1 whole, in both languages, on the day of the release. Each change already carries its own pages (rule 5 of `AGENTS.md`); this workstream closes the whole at the end.

- **PUB-001** **Everything new has its page.** Each item of the scope list (FRZ-001) MUST name the pages that document it, in English and in Spanish: what it is, how to use it, and its limits. A check MUST fail when an item names none or names a page that does not exist in both languages.
- **PUB-002** **What is new.** One page MUST tell a user what 2.1 adds, with pictures of the product as it is: the plant, the course, Studio, AI and agents, boards. It MUST give the steps to move from 2.0 and the known limits, and the release notes lead to it (OSS-004).
- **PUB-003** **Made again from the release.** Every generated reference page MUST be generated from the source of the release, and every capture in the documentation MUST be taken again from the candidate, in both languages. A check MUST fail on a generated page or a capture that is older than its source.
- **PUB-004** **The site.** The published site MUST present 2.1: its first screen says what ZPLC is in the terms of section 2 and shows what 2.1 adds, with the plant in motion; it leads to the install of each operating system, with the files of 2.1.0 and their checksums, and to the first lesson. Both languages MUST be complete, no link may be broken, and every page says which version it describes. The site is a surface of UXV-001.
- **PUB-005** **Published with the release.** The site MUST change to 2.1 by the release itself and not before, so that what a visitor reads is what they can download. After publishing, the public address MUST be opened and checked (the version shown, each install link, both languages, the search) and the result recorded. Today the site is published by a push to `master`, which the merge of the release branch makes before the release exists, and its version label is written by hand (`docs/docusaurus.config.js:106`): the run MUST propose, before the first candidate, how the site turns to 2.1 with the release.

### RCN: Candidates and release
- **RCN-001** The hosted checks MUST be green on the release branch before a pull request is opened. A green local run does not stand in for them.
- **RCN-002** A candidate MUST be built by the release workflow, as an installer per operating system, and the journeys run on those installers.
- **RCN-003** Board evidence MUST exist for two board families before the first candidate (JRN-006).
- **RCN-004** The candidate MUST be signed as decision D-34 says.
- **RCN-005** A second candidate is built only for a blocker.
- **RCN-006** The release is cut with the version, the compiler version, the changelog and the documentation captures in one change, after the scope list of FRZ-001 shows nothing open.

### LNG: Standard functions in FBD and Ladder
The ids continue the numbering of spec 011, whose LNG-028 is the last (D-37). The requirements live here because they are 2.1.0 scope: this spec's index counts them, and the gate of spec 011 stays as 2.0 left it. Today FBD places 8 of the 297 functions the compiler registers (`getAllFnNames()`) and Ladder has 15 boxes; the 289 missing are 240 conversions `<FROM>_TO_<TO>` and 49 named functions (bits, strings, trigonometry, arithmetic, logarithms, rounding, scaling, system and `MUX`). The plan is `plan-lng.md`.

- **LNG-029** An FBD diagram MUST be able to place every function the compiler registers (`getAllFnNames()`, 297), and the build MUST translate each one. It MUST be one mechanism, not one case per function: the pins and their types come from the compiler's table, `FUNCTION_DOCS` (parameters and return type) and `CONVERSION_TYPES`, and when `@zplc/compiler` does not export those data it MUST export them and nothing more. A function is a block without an instance and is emitted as `OUT := NAME(args)`; the type of the output is the table's, and with `ANY`, `ANY_NUM` and `ANY_BIT` it MUST follow the inputs, as `MAX` and `MIN` do today; a `VOID` function is a statement with no output. `MUX` is variadic, and a person MUST be able to add inputs to it. The 240 conversions MUST NOT be a flat list in "Other": the palette MUST show a group of conversions ordered by source type, which the search finds by name, with the group names in English and in Spanish and the descriptions of `FUNCTION_DOCS` in both languages; a capture of the palette in each language is left for the reviewer. The Structured Text generated for every existing diagram MUST stay identical byte for byte, and the trace hashes of the lessons too. The compiler's code generation and the C runtime MUST NOT change; if a function needs either, the run stops and asks the owner. LNG-002 and LNG-003 MUST keep holding: nothing is dropped and every error names the block. Tests MUST be generated from the table (LNG-007 asks one executed test per palette element): for each of the 297, a diagram that calls it compiles without errors, and on the native runtime it gives the same value as the same call in Structured Text, with the operands of the reference example. The same change MUST update, in English and in Spanish, `docs/docs/languages/fbd.md` (lines 31 and 49, which send the reader to Structured Text today), the generated references, the formats resource of MCP and the changelog.
- **LNG-030** A Ladder rung MUST be able to place every function the compiler registers (`getAllFnNames()`, 297) as a box with EN and ENO as LNG-028 says, and the build MUST translate each one. The same table as LNG-029 MUST feed `LD_FUNCTIONS`: pins and types from `FUNCTION_DOCS` and `CONVERSION_TYPES`, the output following the operands for `ANY`, `ANY_NUM` and `ANY_BIT`, a `VOID` function a statement with no output, and `MUX` a box to which a person can add inputs. The palette, the guards and the generated tests of LNG-029 MUST hold for the rung: the conversions grouped by source type with search and the group names in both languages; the Structured Text of every existing rung identical byte for byte and the lesson trace hashes unchanged; no change to the compiler's code generation or to the C runtime; nothing dropped and every error naming the rung and cell (LNG-002, LNG-003); for each of the 297 a rung that calls it compiles without errors and gives on the native runtime the same value as the same call in Structured Text. The same change MUST update `docs/docs/languages/ld.md` (line 32, "the fifteen IEC functions") in English and in Spanish, with the generated references, the formats resource of MCP and the changelog.

## 7. The review map

| Area | The question | Looks at | Runs when |
|---|---|---|---|
| Plant view | Does every part look like what it is and show its state? | The catalogue sheet; the 21 scenes; state pairs; frame rate | The catalogue closes |
| Studio | Is each job in one place, and is the main path one action? | The measures of spec 013 section 8 on the packaged window | U2 and U3 close |
| Course | Does each lesson teach before it asks, and do the paths stand alone? | The lesson table; lessons read in both languages | Each batch of content closes |
| AI | Is the assistant where the need arises, does it know the plant, and is it useful? Does an agent over MCP reach a pass? | Journeys 4 and 5; the task set; the tool descriptions | Now, for the baseline; again when AIX-001 lands |
| Words | Does every message say what happened and what to do, in both languages? | Every interface string and every error | After the freeze |
| Documentation | Does every page describe the product as it is, and does everything new have its page? | Pages against the packaged application; the list of PUB-001; captures; three widths; the published site | After the freeze, and the site again after release |
| Robustness | Can a person lose work or be left with no way on? | Broken projects, long sessions, full disks, interrupted runs | After the freeze |
| Hardware path | Do the documented steps reach a running board? | Journey 2 at the bench | After board evidence |
| First use | What happens in the first ten minutes on a clean computer? | Journey 1 on each installer | First candidate |
| Free project | Can a stranger understand, install and contribute? | The front page, a clean clone | First candidate |
| Look, final | Does every surface look right in every condition a person will have? | The sheets and the measured defects of UXV; the 3D view in motion; every lesson | As each area closes, and whole on the candidate, last |

## 8. Measures and definition of done

### 8.1 Measures

| Measure | Target |
|---|---|
| Golden journeys that reach their outcome on the packaged application | 5 of 5 |
| Gaps and stumbles on a golden journey | 0 |
| Open blockers | 0 |
| Visible findings neither fixed nor written as a known limit | 0 |
| Must criteria of the bar that are met | All |
| Areas of section 7 reviewed from outside | 11 of 11 |
| Surfaces of `screens.md` captured in the conditions of D-36 (UXV-002) | All |
| Measured visual defects open (UXV-004) | 0 |
| Lessons captured in both languages (UXV-007) | All |
| Tasks of the AI task set passed with the reference model | All marked must |
| 2.1 concepts readable by the assistant and over MCP (AIX-001) | All listed |
| Languages in which the reference agent writes a passing program over MCP (AIX-009, AIX-011) | 5 of 5 |
| Shipped scenarios whose trace an agent can read (AIX-015) | All |
| Named clients that connect with the documented steps (AIX-007) | 3 of 3 |
| Items of the scope list with their pages in both languages (PUB-001) | All |
| Broken links on the published site (PUB-004) | 0 |
| Hosted checks on the release branch | Green |
| Board families with journey 2 recorded at the bench | 2 |
| Requirements of specs 012 to 014 neither covered, open nor a known limit | 0 |

### 8.2 Definition of done
2.1.0 is complete and polished when every target of 8.1 is met, the owner has signed the candidate (D-34), and the changelog states the known limits.

## 9. Delivery order

| Stage | What | Depends on |
|---|---|---|
| Q0 | Now, beside the open threads. By the run: the five journeys written down (JRN-001) and the scope list (FRZ-001). By the reviewer: the AI review of section 7 as the first new review, then the first pass of the bar (BAR-001) | Nothing; none of it touches product code |
| Q1 | The open threads reach their stops; AIX-001, AIX-002 and the write and debug tools (AIX-011, AIX-014, AIX-015) land; the capture tool and its measures (UXV-001 to UXV-004); the freeze (FRZ-002); the second pass of the bar | D-28, D-31 |
| Q2 | Reviews as areas close, each with its fix waves (REV, FIX); the check of each area against the bar (BAR-007); the sheets of each area looked at (UXV-005 to UXV-008); the rest of AIX | Q1 |
| Q3 | Hosted checks green, board evidence, first candidate, the journeys on the installers, the last two reviews, the documentation made again from the candidate (PUB-003), the final visual pass (UXV-009) | Q2 |
| Q4 | Signature, release, the site published and checked at its public address (PUB-005) | D-34 |

## 10. Traceability

### 10.1 Owner statements to requirements

| Statement | Requirements |
|---|---|
| S-14 | FRZ-001 to FRZ-004, RCN-006 |
| S-15 | JRN-001 to JRN-008, section 8 |
| S-16 | BAR-001 to BAR-007 |
| S-17 | REV-001 to REV-006, FIX-001 to FIX-004 |
| S-18 | AIX-001 to AIX-015, JRN-001 (journeys 4 and 5), JRN-007 |
| S-19 | Decisions D-28 to D-36 (section 5.2), BAR-001, BAR-007, FRZ-002 |
| S-20 | D-31, D-35, AIX-007 to AIX-015, JRN-001 (journey 5) |
| S-21 | D-36, UXV-001 to UXV-009, FRZ-002 |
| S-22 | PUB-001 to PUB-005, OSS-001, OSS-004, RCN-006 |
| S-23 | D-37, LNG-029, LNG-030, FRZ-002 |

### 10.2 Requirements of earlier specs that this spec extends

| Earlier | Extended by | How |
|---|---|---|
| IDE-030 | AIX-003, AIX-004, AIX-005, AIX-006 | The reviewed proposal stays for the assistant inside Studio; it gains places to start from and a stance in lessons |
| The MCP server writes nothing (spec 011; `docs/docs/guides/ai-and-mcp.md`) | AIX-011, AIX-012 | Changed by S-20: the server writes inside the workspace, checked first, and Studio follows |
| P7, LNK-009, rule 8 of `AGENTS.md` | AIX-010, AIX-014 | The boundary stays for boards and for sessions a person runs, and is worded exactly; a simulator private to the agent is inside it |
| REL-016, HIL-009 (spec 011) | D-34, RCN-003, RCN-004 | The first-run check on real machines and the hardware records before a release is published stay; the five journeys and the sheets are added to the signature |
| LNK-009 (headless scene scenario) | AIX-001, JRN-001 (5) | An agent can read the scene it is allowed to run |
| P17, SCN-003, PRT-009 | BAR-003 to BAR-005 | Originality is applied to how references are used |
| P21 (spec 013) | AIX-008 | Plain words reach the tool descriptions |
| GDE (spec 013) | JRN-001 (1), section 7 "First use" | First use is walked on the installer |
| CRS, LRN | Section 7 "Course" | The standard of S-13 is reviewed per batch |
| VIS-014 to VIS-019 | Section 7 "Plant view" | The catalogue is reviewed from outside |
| LNG-007, LNG-022, LNG-023, LNG-028 (spec 011) | LNG-029, LNG-030 | Every registered function is placed in FBD and Ladder from the compiler's table, and each palette element keeps its executed test |
| REL | RCN-001 to RCN-006, OSS-004 | The release waits for hosted checks, journeys and a signature |

## 11. Glossary

| Term | Meaning |
|---|---|
| Path | The way of section 2: learn, program, simulate and check, take it to hardware |
| Gap | A point where a person must leave ZPLC or guess to go on |
| Stumble | A point where a person stops, wonders what happened, or loses trust (JRN-004) |
| Golden journey | One of the five end-to-end walks of JRN-001 |
| Sheet | The captures of one area laid side by side for a reviewer |
| Site | The documentation as published for the public, in both languages |
| Surface | One thing a person sees and can name: a screen, a panel, a dialog, a page |
| Bar | The list of criteria a finished product meets, drawn from several references (BAR) |
| Reference | Another product or project read for criteria; open or proprietary |
| Reviewer | Whoever looks from outside the run: reviews the areas (REV), writes the bar (BAR-001), and took the decisions of section 5.2 under S-19 |
| Run | The orchestrating agent, its writers and its generators: everything that changes the product |
| Finding | A defect a review reports, with a measure that can be run again |
| Blocker | A finding that holds the release |
| Known limit | Something not done or not verified, written for the user |
| Fix wave | The tasks that close the findings of one review |
| Candidate | A build of the release workflow that the journeys are walked on |
