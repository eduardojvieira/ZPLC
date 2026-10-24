# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The site speaks to two audiences with equal weight (owner, 2026-10-24: "Los dos por igual"):

- People who build control systems: automation engineers, integrators and makers of hardware who want an
  IEC 61131-3 PLC on a board or microcontroller of their choice, with a complete environment to program, simulate
  and debug it.
- People who learn: students, technicians and makers who want to learn PLC programming without buying a PLC, through
  the built-in course and the simulator.

Both arrive evaluating ZPLC; the page has to show quickly what it is, what it does and how to start.

## Product Purpose

ZPLC is an open-source PLC: a portable C99 runtime that executes IEC 61131-3 programs, and the ZPLC desktop
application (Windows, Linux, macOS) to write, compile, simulate, debug and deploy them, with a course that teaches PLC
programming inside the same application. Success for the site is a visitor who understands that ZPLC is a complete PLC
they can take to their own hardware, or learn with, and who downloads it or opens the documentation.

## Positioning

- One open PLC runtime for many microcontrollers: the core is portable C99 behind a hardware abstraction layer, and the
  same core runs on Zephyr, on FreeRTOS and as the desktop simulator.
- A complete product, not a library: five IEC 61131-3 languages (ST, LD, FBD, SFC, IL), an editor for each, a native
  simulator, an online debugger with breakpoints, stepping, watch and forcing, a live I/O faceplate, and Learn.
- Learn turns the same application into a PLC course with lessons that are checked in the simulator.
- Free and open source.

## Operating Context

Visitors read the site on desktop and on phones, in English or Spanish. The site is the Docusaurus documentation site
under `docs/`, deployed to GitHub Pages; the landing page is `docs/src/pages/index.js` with
`docs/src/components/LandingPage/*`. The download is the desktop application; the documentation is on the same site.

## Capabilities and Constraints

- Public claims are evidence-gated (DOC-012, `tools/docs/check_capability_claims.ts` with
  `docs/capability-claims.json`): the site states only what a recorded check backs. No board has a hardware record, so
  the site never says a board is tested, validated or production-ready, and gives no timing figures.
- Supported boards are the board profiles the firmware builds for in CI (`docs/src/data/boards.json`,
  `firmware/app/boards/boards.json`); the site calls them build targets or supported boards, not verified hardware.
- Counts on the site (functions, lessons, modules, boards) must match what the repository holds; the claims guard
  compares them.
- The 2.0 evaluation notice ("Version 2.0 is for evaluation. No board has been tested on hardware, and ZPLC must not
  control machinery.") lives in the documentation, not on the website (owner, 2026-10-24).
- ZPLC is not a certified safety PLC. AI assistance cannot start physical operations (flash, deploy, force, run/stop).

## Brand Commitments

- The product is named ZPLC; the version is shown apart from the name.
- Voice: direct, calm, confident, industrial. It sells through concrete capabilities, not superlatives.
- Brand mark: `tools/brand/mark.svg`.
- English and Spanish pages stay in parity; Spanish uses neutral "usted", never voseo.
- Owner direction for the site (2026-10-23): modern, an industrial and electronics language (PLC, cabinets, terminals,
  circuit boards) rather than a code editor; screenshots support the story and are not overused.

## Evidence on Hand

- Real application captures from the capture tool (`tools/docs/capture-screenshots.ts`, `docs/static/img/`, manifest
  `docs/static/img/manifest.json`), in light and dark.
- Generated illustrative images under `docs/static/img/generated/`.
- The board manifest, the conformance matrix behind the language reference, the Learn course (33 lessons in 12
  modules, four lesson plants) and the host runtime functions (18) are the backed facts.
- There are no customers, testimonials, certifications, benchmarks or hardware test records; the site must not invent
  any.

## Product Principles

1. Sell what ZPLC does today, with proof on the page.
2. Portability is the headline: one PLC for the hardware the visitor chooses.
3. Building and learning are equal paths into the same application.
4. Every claim can be traced to the repository.
