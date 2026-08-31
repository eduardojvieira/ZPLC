---
name: "ZPLC Studio 2.0"
description: "Un workbench PLC local-first, denso y verificable."
colors:
  drawing-sheet-canvas: "#e7ece8"
  drawing-sheet-panel: "#f8faf7"
  drawing-sheet-rule: "#d7dfda"
  drawing-sheet-ink: "#172127"
  drawing-sheet-cobalt: "#245d8f"
  drawing-sheet-green: "#177344"
  drawing-sheet-amber: "#8a5800"
  drawing-sheet-red: "#a33838"
  commissioning-spine-canvas: "#0f171b"
  commissioning-spine-panel: "#141e23"
  commissioning-spine-rule: "#34464d"
  commissioning-spine-ink: "#e5edeb"
  commissioning-spine-cobalt: "#5ba7df"
  commissioning-spine-green: "#65c98e"
  commissioning-spine-amber: "#e0ae4f"
  commissioning-spine-red: "#ed7070"
typography:
  body:
    fontFamily: "Bahnschrift, Aptos, 'Segoe UI', system-ui, sans-serif"
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace"
rounded:
  technical: "2px"
spacing:
  inspector-padding: "10px"
components:
  lower-tool-ledger:
    rounded: "{rounded.technical}"
  truth-rail:
    backgroundColor: "{colors.drawing-sheet-canvas}"
    textColor: "{colors.drawing-sheet-ink}"
  visual-editor-surface:
    backgroundColor: "{colors.drawing-sheet-canvas}"
    textColor: "{colors.drawing-sheet-ink}"
    rounded: "{rounded.technical}"
---

# Design System: ZPLC Studio 2.0

## Overview

**Creative North Star: "Wiring Ledger"**

Wiring Ledger treats the PLC workbench as a calm, active technical drawing: named work regions, measured labels, technical rules, and one dominant editing surface. It is dense enough for commissioning work without becoming a card dashboard or a neon control-room fantasy.

The geometry follows the approved Ledger Grid reference. Drawing Sheet supplies the light material and Commissioning Spine supplies the dark material; both preserve the same information hierarchy and interaction meaning. The approved references are provenance, not production UI assets: `wiring-ledger.webp`, `wiring-ledger-drawing-sheet.webp`, and `wiring-ledger-commissioning-spine.webp` were selected under direction seed `3c2d8cb8`.

**Key Characteristics:**

- Flat, cross-referenced technical regions instead of decorative cards.
- One persistent lower tool ledger holds factual and operational panels, so the editor stays primary.
- Operational truth remains persistent and readable while editing.
- Evidence is named accurately: host/POSIX screenshots and tests are not hardware or HIL evidence.

## Colors

Drawing Sheet pairs a warm technical canvas with graphite ink; Commissioning Spine preserves that restraint in charcoal steel with pale gray-green ink.

### Primary

- **Cobalt reference:** identifies selection, focus, active references, and connected technical navigation. It is not a generic success color.

### Secondary

- **Confirmed green:** communicates confirmed RUN, pass, or safe state only.
- **Amber attention:** communicates warning, force, or attention only.
- **Red fault:** communicates fault or danger only.

### Neutral

- **Drawing Sheet:** canvas, panels, rules, and ink provide the light technical drawing material.
- **Commissioning Spine:** canvas, panels, rules, and ink provide the dark commissioning material.
- **STOP and idle:** stay neutral.

### Visual editors

- **Canvas, panel, node, and wire:** FBD, LD, and SFC share the Drawing Sheet and Commissioning Spine surface tokens.
- **Signal state:** idle/FALSE stays neutral; energized/TRUE is active green; armed is amber; delete/fault is red.

**The Evidence-Over-Color Rule.** Every status also has text, iconography, or another non-color cue; color never carries a state alone.

## Typography

**Body Font:** Bahnschrift, Aptos, Segoe UI, system-ui, sans-serif.
**Label/Mono Font:** JetBrains Mono, Fira Code, Consolas, monospace.

**Character:** The UI uses a workhorse sans for compact controls and prose, while code, identifiers, paths, timings, hashes, trace values, and tabular facts use monospace.

### Hierarchy

- **Inspector section label** (700, 10px, 0.08em tracking, uppercase): names a compact technical group.
- **Inspector header** (700, 11px, 0.08em tracking, uppercase): identifies the read-only region.
- **Inspector row** (12px, 1.35 line-height): presents one legible operational fact.

**The Measured Label Rule.** Use uppercase tracking for compact structural labels; do not turn all body information into all-caps.

## Layout

Ledger Grid keeps the command band and operational truth rail above a dominant editor and one persistent resizable lower tool ledger. Explorer, Inspector, Output, Problems, Tests, Trace, Watch, and Terminal are roving tabs in that ledger; they never cover or reflow the editor.

Technical regions are separated with 1px rules; resizable panel handles are 4px and turn cobalt only on hover or active resize. Results remains available in the existing bottom ledger through Output, Problems, Tests, Trace, Watch, and Terminal. No command palette, global search, or Devices dashboard is present because there is not yet a shared command or device contract to make those controls real.

## Elevation & Depth

Depth is tonal, not card-based. Surfaces sit flat at rest and use borders and canvas/panel separation to establish structure. The existing small and medium shadows are reserved for transient raised UI, not for turning persistent work regions into floating cards.

**The Flat-At-Rest Rule.** Persistent workbench regions use tonal layers and technical rules; only transient interaction surfaces may use restrained shadow.

## Shapes

The shell is square by default. Technical tabs use 2px corners and 1px borders; status dots and existing compact runtime chips may be rounded where their state needs a compact marker. Tabs expose a visible 2px cobalt focus outline with a 2px offset.

## Components

### Lower tool ledger

The lower ledger is the only auxiliary navigation surface. Its tabs use the same 2px cobalt focus outline and expose actual content, not placeholder tools. Explorer owns project/tree operations; Inspector remains factual and read-only.

### Operational truth rail

The truth rail is a persistent, read-only status strip with a 34px minimum height. It names mode, runtime, target, connection/status, and available task facts; force information adds a labeled warning or alert treatment.

### Explorer and Inspector

Explorer owns project, migration, tree, and file operations only. Inspector is factual context: it is read-only, uses 1px-rule sections, and each fact uses a 72px label column with a wrapping value column. Inspector shows Controller only when a real connection and board are present, and its evidence note explicitly distinguishes host trace from hardware/HIL evidence.

### Active tab and selection

Active references use cobalt consistently across the lower ledger, focus ring, and resizable-handle interaction. The selected state is always accompanied by structure such as a border, label, pressed state, or focus ring.

### Activity badges

Activity badges come only from real migration, diagnostics, native trace, or forces data. Cobalt identifies reference or trace, amber identifies migration, warning, or force, and red identifies actual errors or unconfirmed forces.

### Visual editor surface

FBD, LD, and SFC use the shared Drawing Sheet/Commissioning Spine canvas, panel, node, and wire tokens. Their boolean and operational color states follow the same neutral, green, amber, and red meanings as the rest of Studio.

### Buttons

Generic buttons, role buttons, and tabs transition background, border, and text color over 0.12s. The existing industrial-button variant instead transitions all properties over 0.1s and may translate upward by 1px on hover; active returns it to rest. These transitions are effectively removed under reduced-motion preferences.

### Accessibility modes

Under `forced-colors: active`, the ledger regions and visual editors accept the system Canvas, CanvasText, Highlight, and HighlightText colors while keeping their borders and focus structure. Under reduced motion, scrolling stays immediate and animation/transition duration is reduced to 0.01ms.

## Do's and Don'ts

### Do:

- **Do** use cobalt for a real selection, focus, or technical reference.
- **Do** reserve green for confirmed RUN, pass, or safe states; reserve amber for warning or force; reserve red for fault or danger.
- **Do** use the same semantic state colors in FBD, LD, and SFC.
- **Do** keep operational truth and evidence wording explicit about its source and scope.
- **Do** preserve the same hierarchy in Drawing Sheet light, Commissioning Spine dark, forced-colors, and reduced-motion modes.

### Don't:

- **Don't** use decorative cards, gradients, neon cyberpunk treatment, or fake connector lines in the workbench shell.
- **Don't** imply hardware, HIL, selected-symbol, or causal evidence that the current data contract does not provide.
- **Don't** add a command palette, global search, or Devices dashboard before a shared contract makes it functional.
- **Don't** encode RUN, STOP, fault, force, or connection only through color.
