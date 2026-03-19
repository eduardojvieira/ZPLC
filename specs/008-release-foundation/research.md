# Research: ZPLC v1.5.0 Release Foundation

**Feature**: 008-release-foundation  
**Date**: 2026-03-13  
**Status**: Complete - all planning unknowns resolved

---

## 1. Supported-Board Truth Source

### Decision

Use one machine-readable supported-board manifest adjacent to the real firmware support
assets under `firmware/app/boards/`, and derive IDE/docs/release claims from that single
source.

### Rationale

- Board-support drift already exists across `firmware/app/boards/`,
  `packages/zplc-ide/src/config/boardProfiles.ts`, `packages/zplc-ide/zplc.schema.json`,
  `README.md`, and the docs site.
- The spec requires one supported-board truth source and a supported-board list only,
  rather than broad experimental claims.
- Locating the source of truth next to actual overlay/config assets keeps support claims
  coupled to reality instead of to marketing copy.

### Alternatives Considered

- **README as source of truth**: rejected because it must remain concise and currently
  over-claims support.
- **IDE config as source of truth**: rejected because it already exposes boards that are
  not aligned with maintained firmware assets.
- **Docs page as source of truth**: rejected because docs should publish truth, not author
  it.

---

## 2. Release Evidence Model

### Decision

Maintain one release evidence matrix for all gates plus one evidence record per human-owned
or shared gate. Each evidence record must capture owner, date, environment, steps run,
result, and artifacts.

### Rationale

- The spec now mandates standard evidence records for human-owned gates.
- A matrix-plus-record model makes sign-off auditable, supports reruns after AI-assisted
  fixes, and keeps release claims traceable to concrete validation.
- This structure cleanly separates `AI`, `Human`, and `Shared` ownership while preserving
  one release-level view of status.

### Alternatives Considered

- **Free-form notes/screenshots only**: rejected because they are not auditable enough for
  a truth-based release.
- **Only one aggregate release checklist**: rejected because it hides per-gate evidence and
  rerun responsibility.

---

## 3. IEC Language Parity Strategy

### Decision

Treat `ST` as the executable semantic baseline and require `IL`, `LD`, `FBD`, and `SFC` to
prove parity by normalizing into that path while still satisfying full IDE workflow proof:
author, compile, simulate, deploy, and debug.

### Rationale

- The repository already behaves like a single-path compiler architecture, with non-ST
  languages flowing through transpilation before final compilation.
- The clarified spec requires full end-to-end IDE workflow for every claimed language.
- For v1.5.0, truthfulness matters more than maintaining the illusion of five independent
  compiler backends.

### Alternatives Considered

- **Build five independent compiler pipelines**: rejected as unnecessary scope for the
  release foundation.
- **Allow non-ST languages to stop at compile/simulate only**: rejected by clarification;
  it would undercut the release claim.

---

## 4. Protocol Validation Layers

### Decision

Split protocol validation into three layers:

1. **Host/runtime**: compiler FB contracts, runtime dispatch, status semantics.
2. **IDE/workflow**: board capability gating, protocol config serialization, compile and
   deploy flows across supported languages.
3. **HIL**: real Modbus RTU/TCP and MQTT behavior, including non-blocking scan-cycle and
   human-observed debugging.

### Rationale

- Current gaps span multiple layers: compiler/IDE wiring, runtime semantics, and real
  transport behavior.
- Some protocol features already exist in code but are incomplete or not fully verified,
  so one validation layer is not enough.
- HIL alone is insufficient because it bypasses portions of the real IDE experience.

### Alternatives Considered

- **HIL-only proof**: rejected because it misses IDE/config/debug regressions.
- **Host-test-only proof**: rejected because it cannot validate real serial/network/broker
  behavior.

---

## 5. Documentation Parity Scope

### Decision

Treat a fixed canonical docs manifest as release-blocking. Every canonical English slug
must have a Spanish counterpart before release sign-off. `README.md` remains a concise
entry point; the docs site becomes the canonical user-facing truth; release notes describe
only the verified delta and link back to canonical docs.

### Rationale

- The docs tree already contains duplicates, placeholders, and parity drift.
- Sidebar exposure alone is not enough to define release-grade documentation.
- The constitution and spec both require English/Spanish parity when docs are part of the
  supported product surface.

### Alternatives Considered

- **Entire docs tree is release-blocking**: rejected because it would turn cleanup debt
  into uncontrolled scope.
- **Only top-level index pages are release-blocking**: rejected because protocol, board,
  runtime, and IDE claims need deeper canonical pages.

---

## 6. Minimum Human Validation Scope

### Decision

Require human hardware-in-the-loop validation for at least one serial-focused board and
one network-capable board. Other supported boards may rely on cross-build evidence unless
they are separately promoted into the human-validated subset.

### Rationale

- This matches the clarified spec and balances truthfulness with release feasibility.
- The repository already contains both serial and network HIL assets under `tools/hil/`.
- Requiring human HIL for every supported board would inflate scope without materially
  improving confidence for v1.5.0.

### Alternatives Considered

- **Human HIL for every supported board**: rejected as too expensive for the release.
- **No fixed human HIL minimum**: rejected because it makes sign-off subjective.
