# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a controls engineer or PLC programmer working locally at a
desktop workstation to build, test, simulate, commission, and debug control
logic. A learner uses the same product to understand those workflows. Educators,
maintainers, and local coding agents are secondary users where the relevant
workflow explicitly supports them.

## Product Purpose

ZPLC Studio 2.0 is a desktop environment for programming, testing,
simulating, learning, building, deploying, and debugging PLC projects against
the same runtime semantics and evidence model. Success is a user completing a
verified PLC task without needing a terminal for the main Studio path.

## Positioning

ZPLC shares one project model, PLC semantics, Tool API, and evidence spine
across Studio, CLI, AI, MCP, Lab, Learn, and supported hardware workflows.
AI can explain and prepare locally verifiable changes, but it is structurally
prevented from initiating physical operations.

## Operating Context

ZPLC runs as a React web interface inside an Electron desktop application on
Windows, Linux, and macOS. It keeps project work in a user-selected folder and
can work without AI. Its programming surfaces include ST, LD, FBD, and
SFC; POSIX provides simulation evidence, while Zephyr hardware workflows stay
human-controlled.

## Capabilities and Constraints

- Studio supports project work, compilation, temporal tests, simulation,
  evidence, and staged hardware workflows through shared contracts.
- Build runtime firmware, flash runtime firmware, deploy a `.zplc` program,
  and run/debug are separate operations.
- AI and MCP can inspect, validate, compile, test, simulate, and retrieve
  evidence inside a workspace. They cannot initiate physical operations,
  expose a shell, or use raw serial.
- Evidence gates every timing, hardware, support, and release claim. POSIX is
  not HIL evidence and WASM is a declared degraded fallback.
- ZPLC is not a certified safety PLC. It does not claim universal OTA,
  remote MCP, cloud collaboration, external PLC control, or public extension
  marketplaces in the 2.0 GA scope.

## Brand Commitments

The product is named ZPLC Studio 2.0. Its voice is direct, calm, and aware of
industrial evidence. The user requires a “calma industrial” character; the
specific visual language remains a later design decision.

## Evidence on Hand

Repository evidence includes the product overview in `README.md`, the approved
2.0 foundation RFC in `specs/010-zplc-2-0-foundation/spec.md`, the C99 runtime
under `firmware/lib/zplc_core`, the current IDE in `packages/zplc-ide`, and
published documentation under `docs/`. The repository explicitly distinguishes
host, QEMU, target-build, HIL, and manual evidence. There are no customer
testimonials, certifications, or production-qualification evidence to present
as proof.

## Product Principles

1. One project model and one PLC semantics across every experience.
2. Evidence over claims; a visible result must identify what verified it.
3. Useful workflows remain available without AI.
4. Human authority over hardware and explicit separation of physical actions.
5. Progressive migration preserves valuable working assets without freezing
   unsafe or duplicate implementations.

## Accessibility & Inclusion

The Studio golden path must be operable by keyboard and meet WCAG AA. Status
cannot rely on color alone. Light, dark, high-contrast, and reduced-motion
experiences are required for published workflows.
