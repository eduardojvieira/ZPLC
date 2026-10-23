---
name: "ZPLC"
description: "A dense, verifiable desktop workbench for PLC programming."
colors:
  drawing-sheet-canvas: "#e7ece8"
  drawing-sheet-panel: "#f8faf7"
  drawing-sheet-rule: "#d7dfda"
  drawing-sheet-ink: "#172127"
  drawing-sheet-cobalt: "#245d8f"
  drawing-sheet-green: "#146c40"
  drawing-sheet-amber: "#835300"
  drawing-sheet-red: "#a33838"
  commissioning-spine-canvas: "#0f171b"
  commissioning-spine-panel: "#141e23"
  commissioning-spine-rule: "#34464d"
  commissioning-spine-ink: "#e5edeb"
  commissioning-spine-cobalt: "#5ba7df"
  commissioning-spine-green: "#65c98e"
  commissioning-spine-amber: "#e0ae4f"
  commissioning-spine-red: "#f07878"
typography:
  body:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace"
rounded:
  control: "2px"
  overlay: "4px"
spacing:
  unit: "0.25rem (0.1875rem in compact density)"
  control-height: "32px comfortable, 26px compact"
components:
  button:
    backgroundColor: "#ffffff"
    textColor: "#172127"
    rounded: "2px"
  field:
    backgroundColor: "#ffffff"
    textColor: "#172127"
    rounded: "2px"
---

# Design System: ZPLC

This document describes the interface ZPLC ships. The colour, type, shape and density values are printed from the token
source (`src/theme/tokens.ts`) by `bun tools/ci/ux-tokens.ts --write`, and CI fails when the tables below differ from it, so
a value written here is a value the application uses.

## Overview

**Creative North Star: "Wiring Ledger"**

Wiring Ledger treats the PLC workbench as a calm, active technical drawing: named work regions, measured labels, technical rules, and one dominant editing surface. It is dense enough for commissioning work without becoming a card dashboard or a neon control-room fantasy.

Drawing Sheet supplies the light material, Commissioning Spine the dark one, and a high-contrast theme keeps the same hierarchy in black and white; all three preserve the same information hierarchy and interaction meaning. The approved references are provenance, not production UI assets: `wiring-ledger.webp`, `wiring-ledger-drawing-sheet.webp`, and `wiring-ledger-commissioning-spine.webp` were selected under direction seed `3c2d8cb8`.

**Key Characteristics:**

- Flat, cross-referenced technical regions instead of decorative cards.
- One persistent lower tool ledger holds factual and operational panels, so the editor stays primary.
- Operational truth remains persistent and readable while editing.
- One owned component kit (`src/ui`) and one token source: no component draws its own colour, radius, shadow or focus ring.
- Evidence is named accurately: host/POSIX screenshots and tests are not hardware or HIL evidence.

## Colors

Colour is a role, not a decoration. A component reads a semantic role (`--color-surface-800`, `--text-primary`, `--color-accent-blue`) or one of its own component tokens (`--button-bg`, `--signal-true-fg`); the roles map to raw ramp steps once per theme. The three tiers and every value are in the token tables at the end of this document.

### Primary

- **Cobalt reference:** identifies selection, focus, active references, and connected technical navigation. It is not a generic success color.

### Secondary

- **Confirmed green:** communicates confirmed RUN, pass, or a TRUE value only.
- **Amber attention:** communicates warning, force, or attention only.
- **Red fault:** communicates fault or danger only. FALSE is never red.

### Neutral

- **Drawing Sheet:** canvas, panels, rules, and ink provide the light technical drawing material.
- **Commissioning Spine:** canvas, panels, rules, and ink provide the dark commissioning material.
- **High contrast:** a black canvas with white rules and ink, a thicker focus ring, and no shadows.
- **STOP and idle:** stay neutral.

### Code editor

The Monaco themes are generated from the roles (`src/utils/monaco-themes.ts`): the editor background, text, selection, line numbers and the syntax colours (`--syntax-*`) of each theme are tokens, every syntax colour meets 4.5:1 on the editor background and on the line of the cursor, and the breakpoint and paused-line markers are tokens too (`--debug-*`). The themes are defined when Monaco loads (`src/components/monacoRuntime.ts`), before any editor exists: Monaco answers an editor created with an unknown theme with its light base, which put light token colours on the dark editor. Every token class the Structured Text and Instruction List grammars emit has a rule of its own, and no bracket pair is colourised: Monaco's bracket rainbow is not a token, and its grammar pairs keywords such as PROGRAM and END_PROGRAM as brackets. One Monaco theme serves every editor on the page, the diff editor of a reviewed change included, and it switches with the app theme. Red stays the breakpoint colour; whether a breakpoint should be red, given that the vocabulary keeps red for faults, is an open decision.

### Themes

The theme is light, dark or high contrast, chosen in the Welcome screen header, the project settings and the toolbar; with no choice the operating-system preference applies. An explicit high-contrast choice is never overridden by the system preference. Under `forced-colors: active` the operating system supplies Canvas, CanvasText, Highlight and HighlightText, and the focus indicator follows Highlight.

### Contrast

Text and meaningful graphics meet WCAG 2.2 AA in the three themes: 4.5:1 for text, 3:1 for a graphic that carries meaning (a field border, the focus ring, a signal border). CI computes the ratio of every declared foreground and background pair from the tokens; the pairs and their ratios are in the Contrast table below.

The light and dark themes keep a margin above that floor, because 11px labels and thin code strokes lose contrast to anti-aliasing: body text and code read at 7:1 or more, every other text pair at 5:1 or more (`src/theme/contrast.test.ts`). The readability pass of 2026-10-23 measured the pairs that sat at the floor and moved six ramp steps, keeping each hue:

| Step | Before | After | Weakest pair it carries, before → after |
| --- | --- | --- | --- |
| `--ramp-paper-500` | `#5f6d6b` | `#566462` | Light hints, comments and line numbers on the canvas: 4.52 → 5.17 |
| `--ramp-green-700` | `#177344` | `#146c40` | Light TRUE chip: 4.60 → 5.02 |
| `--ramp-amber-700` | `#8a5800` | `#835300` | Light forced chip: 4.73 → 5.10 |
| `--ramp-violet-700` | `#635b95` | `#5d558f` | Light strings and labels on the line of the cursor: 4.91 → 5.37 |
| `--ramp-red-300` | `#ed7070` | `#f07878` | Dark fault chip: 4.77 → 5.04 |
| `--ramp-graphite-600` | `#52666e` | `#5c737c` | Dark idle wire on the visual-editor canvas: 3.01 → 3.62 |

**The Evidence-Over-Color Rule.** Every status also has text, iconography, or another non-color cue; color never carries a state alone.

## Signal vocabulary

One vocabulary shows the state of a value, defined once in `src/theme/signalTone.ts` and coloured by the `--signal-*` tokens. The inline values of the code editor, the Watch table, the status dot of the operational truth rail and the kit's signal chip read it.

| State | Word | Glyph | Colour | Means |
|---|---|---|---|---|
| TRUE | `TRUE` | `●` | green | A confirmed TRUE value |
| FALSE | `FALSE` | `○` | neutral | A FALSE value, never red |
| Unknown | `---` | `◌` | neutral, dashed outline | A value that has not been read |
| Forced | `FORCED` | `◆` | amber | A value the user forced; a forced Watch value also says "(forced)" |
| Fault | `FAULT` | `▲` | red | A fault, and only a fault |
| Value | `VALUE` | `#` | cobalt | A number or a string that is not a state |

The Ladder, FBD and SFC editors now use the kit's controls and tooltips and the caption size of the scale; their node and rung drawing keeps its own element styling and adopts the tokens and `signalTone` with the editor work (UX-009, UX-010).

## Typography

**Body Font:** Inter, bundled with the application, then the system sans.
**Label/Mono Font:** JetBrains Mono, bundled with the application, then the system monospace.

**Character:** The UI uses a workhorse sans for compact controls and prose, while code, identifiers, paths, timings, hashes, trace values, and tabular facts use monospace. Values, addresses and times use tabular numerals (`.ui-tabular`).

### Scale

The scale is fixed and its floor is 11 pixels: caption 11, label 12, body 13, title 14, heading 16 (`--font-size-*`). A class that sets a size under 11 pixels fails the kit guard everywhere outside the kit; the list of exceptions is empty.

### Hierarchy

- **Inspector section label** (700, 11px, 0.08em tracking, uppercase): names a compact technical group.
- **Inspector header** (700, 11px, 0.08em tracking, uppercase): identifies the read-only region.
- **Inspector row** (12px, 1.35 line-height): presents one legible operational fact.

**The Measured Label Rule.** Use uppercase tracking for compact structural labels; do not turn all body information into all-caps.

## Layout

Ledger Grid keeps the toolbar and the operational truth rail above a dominant editor area and one persistent resizable lower tool ledger. Explorer, Inspector, Output, Problems, Tests, Lab, Learn, Changes, Trace, Watch, and Terminal are roving tabs in that ledger; they never cover or reflow the editor. A project opens with the Output tab selected; the Explorer is one of the ledger tabs.

Technical regions are separated with 1px rules; resizable panel handles are 4px, show cobalt on hover, while dragging and on keyboard focus, and move with the arrow keys. No command palette, global search, or Devices dashboard is present because there is not yet a shared command or device contract to make those controls real.

### Density

Comfortable and compact (Preferences). The attribute `data-density` on the document root scales every spacing utility through `--spacing` and gives the kit its control and row heights (`--control-height`, `--row-height`); it is applied before the first frame and kept per user. Sizes written as fixed pixels in a surface that is not on the kit do not scale; journey 55 proves that the setting reaches the Welcome screen and the workbench.

## Elevation & Depth

Depth is tonal, not card-based. Surfaces sit flat at rest and use borders and canvas/panel separation to establish structure. The shadow tokens belong to transient overlays only: dialogs, menus, popovers and tooltips (`--elevation-overlay`, `--elevation-tooltip`). The high-contrast theme draws a border instead of a shadow.

**The Flat-At-Rest Rule.** Persistent workbench regions use tonal layers and technical rules; only transient interaction surfaces may use restrained shadow.

## Shapes

The shell is square by default (`--radius-surface`). Controls, tabs and chips use the 2px control radius (`--radius-control`), overlays 4px (`--radius-overlay`); status dots are round. Icons are 12, 16 and 20 pixels (`--icon-size-*`).

## Components

The kit lives in `src/ui` and is the only place a raw `button`, `input`, `select` or `textarea`, a `title` tooltip or a native `confirm` or `alert` may be written (`tools/ci/ui-kit-guard.ts`). It provides: button, icon button, toggle group, field, text field, number field, range field, text area, select, checkbox, switch, tabs, toolbar, menu button, context menu, dialog, alert dialog, popover, tooltip, badge, status dot, signal chip, spinner, empty state and property list. A combo box, a toast, a tree and a data grid are not built yet. The primitives are owned: no headless library is installed.

Every form control has a programmatically associated label (a `Field`, a wrapping label or an `aria-label`), an icon button has a required accessible name that is also its tooltip, errors are announced, and keyboard behaviour (arrows, Home and End, type-ahead, Escape, Tab wrap in a dialog, focus return) is pure logic with tests (`src/ui/logic`).

### Component gallery

A development build serves every component in every theme and density, six panels on one page, at the `#ui-gallery` address: `http://localhost:3000/#ui-gallery` while `bun run dev` serves ZPLC (in the Electron development window, set `location.hash = '#ui-gallery'` and reload). The page, its scoped theme stylesheet and its text are not in a production build (`scripts/galleryBundle.test.ts`), and journey 40 drives it with real key events.

### Lower tool ledger

The lower ledger is the only auxiliary navigation surface. Its tabs are roving, with the arrow keys, Home and End, and expose actual content, not placeholder tools. Explorer owns project/tree operations; Inspector remains factual and read-only.

### Operational truth rail

The truth rail is a persistent, read-only status strip with a 34px minimum height. It names mode, runtime, target, connection/status, and available task facts; force information adds a labeled warning or alert treatment.

### Explorer and Inspector

Explorer owns project, migration, tree, and file operations only. Inspector is factual context: it is read-only, uses 1px-rule sections, and each fact uses a label column and a wrapping value column. Inspector shows Controller only when a real connection and board are present, and its evidence note explicitly distinguishes host trace from hardware/HIL evidence.

### Active tab and selection

Active references use cobalt consistently across the lower ledger, focus ring, and resizable-handle interaction. The selected state is always accompanied by structure such as a border, label, pressed state, or focus ring.

### Focus

One focus indicator: a 2px cobalt outline with a 2px offset (3px in high contrast, Highlight under forced colours), drawn by the single `:focus-visible` rule. No control removes it or draws a second one; the kit guard fails on an outline or ring utility on `focus:` or `focus-visible:`.

### Accessibility modes

Under `forced-colors: active`, the ledger regions and visual editors accept the system Canvas, CanvasText, Highlight, and HighlightText colors while keeping their borders and focus structure. Under reduced motion, scrolling stays immediate and animation/transition duration is reduced to 0.01ms.

## Do's and Don'ts

### Do:

- **Do** use a kit component for a control, and a token for a colour.
- **Do** use cobalt for a real selection, focus, or technical reference.
- **Do** reserve green for confirmed RUN, pass, or a TRUE value; reserve amber for warning or force; reserve red for fault or danger.
- **Do** keep operational truth and evidence wording explicit about its source and scope.
- **Do** preserve the same hierarchy in Drawing Sheet light, Commissioning Spine dark, high contrast, forced-colors, and reduced-motion modes.

### Don't:

- **Don't** use decorative cards, gradients, neon cyberpunk treatment, or fake connector lines in the workbench shell.
- **Don't** imply hardware, HIL, selected-symbol, or causal evidence that the current data contract does not provide.
- **Don't** add a command palette, global search, or Devices dashboard before a shared contract makes it functional.
- **Don't** encode RUN, STOP, fault, force, or connection only through color.
- **Don't** write a font size under 11 pixels, a `title` tooltip, or a raw control outside the kit.

## Design tokens

<!-- tokens:begin (generated by tools/ci/ux-tokens.ts from src/theme/tokens.ts; do not edit) -->

### Tier 1: colour ramps

Raw values with no meaning. Only a role may name a ramp step; a component never does.

#### Ramp: paper

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--ramp-paper-50` | Drawing Sheet neutral, from the page to the ink (step 50). | `#ffffff` | `= light` | `= light` |
| `--ramp-paper-100` | Drawing Sheet neutral, from the page to the ink (step 100). | `#f8faf7` | `= light` | `= light` |
| `--ramp-paper-200` | Drawing Sheet neutral, from the page to the ink (step 200). | `#e7ece8` | `= light` | `= light` |
| `--ramp-paper-300` | Drawing Sheet neutral, from the page to the ink (step 300). | `#d7dfda` | `= light` | `= light` |
| `--ramp-paper-400` | Drawing Sheet neutral, from the page to the ink (step 400). | `#a8b5b0` | `= light` | `= light` |
| `--ramp-paper-500` | Drawing Sheet neutral, from the page to the ink (step 500). | `#566462` | `= light` | `= light` |
| `--ramp-paper-600` | Drawing Sheet neutral, from the page to the ink (step 600). | `#4c5a59` | `= light` | `= light` |
| `--ramp-paper-800` | Drawing Sheet neutral, from the page to the ink (step 800). | `#273537` | `= light` | `= light` |
| `--ramp-paper-900` | Drawing Sheet neutral, from the page to the ink (step 900). | `#172127` | `= light` | `= light` |

#### Ramp: graphite

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--ramp-graphite-50` | Commissioning Spine neutral, from the ink to the canvas (step 50). | `#e5edeb` | `= light` | `= light` |
| `--ramp-graphite-100` | Commissioning Spine neutral, from the ink to the canvas (step 100). | `#d3ddda` | `= light` | `= light` |
| `--ramp-graphite-200` | Commissioning Spine neutral, from the ink to the canvas (step 200). | `#b7c4c0` | `= light` | `= light` |
| `--ramp-graphite-400` | Commissioning Spine neutral, from the ink to the canvas (step 400). | `#8e9e9a` | `= light` | `= light` |
| `--ramp-graphite-600` | Commissioning Spine neutral, from the ink to the canvas (step 600). | `#5c737c` | `= light` | `= light` |
| `--ramp-graphite-700` | Commissioning Spine neutral, from the ink to the canvas (step 700). | `#34464d` | `= light` | `= light` |
| `--ramp-graphite-800` | Commissioning Spine neutral, from the ink to the canvas (step 800). | `#19262c` | `= light` | `= light` |
| `--ramp-graphite-900` | Commissioning Spine neutral, from the ink to the canvas (step 900). | `#141e23` | `= light` | `= light` |
| `--ramp-graphite-950` | Commissioning Spine neutral, from the ink to the canvas (step 950). | `#0f171b` | `= light` | `= light` |

#### Ramp: pure

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--ramp-pure-0` | Neutral of the high-contrast theme, black to white (step 0). | `#000000` | `= light` | `= light` |
| `--ramp-pure-50` | Neutral of the high-contrast theme, black to white (step 50). | `#080808` | `= light` | `= light` |
| `--ramp-pure-100` | Neutral of the high-contrast theme, black to white (step 100). | `#111111` | `= light` | `= light` |
| `--ramp-pure-700` | Neutral of the high-contrast theme, black to white (step 700). | `#d7d7d7` | `= light` | `= light` |
| `--ramp-pure-800` | Neutral of the high-contrast theme, black to white (step 800). | `#e5e5e5` | `= light` | `= light` |
| `--ramp-pure-900` | Neutral of the high-contrast theme, black to white (step 900). | `#f2f2f2` | `= light` | `= light` |
| `--ramp-pure-1000` | Neutral of the high-contrast theme, black to white (step 1000). | `#ffffff` | `= light` | `= light` |

#### Ramp: cobalt

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--ramp-cobalt-200` | Cobalt, the reference and selection hue (step 200). | `#55c8ff` | `= light` | `= light` |
| `--ramp-cobalt-300` | Cobalt, the reference and selection hue (step 300). | `#5ba7df` | `= light` | `= light` |
| `--ramp-cobalt-500` | Cobalt, the reference and selection hue (step 500). | `#347bb6` | `= light` | `= light` |
| `--ramp-cobalt-700` | Cobalt, the reference and selection hue (step 700). | `#245d8f` | `= light` | `= light` |

#### Ramp: green

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--ramp-green-200` | Confirmed green, TRUE and RUN only (step 200). | `#7dff9a` | `= light` | `= light` |
| `--ramp-green-300` | Confirmed green, TRUE and RUN only (step 300). | `#65c98e` | `= light` | `= light` |
| `--ramp-green-700` | Confirmed green, TRUE and RUN only (step 700). | `#146c40` | `= light` | `= light` |

#### Ramp: amber

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--ramp-amber-200` | Amber, forced values and warnings (step 200). | `#ffe16b` | `= light` | `= light` |
| `--ramp-amber-300` | Amber, forced values and warnings (step 300). | `#e0ae4f` | `= light` | `= light` |
| `--ramp-amber-700` | Amber, forced values and warnings (step 700). | `#835300` | `= light` | `= light` |

#### Ramp: red

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--ramp-red-200` | Fault red (step 200). | `#ff9393` | `= light` | `= light` |
| `--ramp-red-300` | Fault red (step 300). | `#f07878` | `= light` | `= light` |
| `--ramp-red-700` | Fault red (step 700). | `#a33838` | `= light` | `= light` |

#### Ramp: violet

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--ramp-violet-200` | Violet, types and labels in code (step 200). | `#d0b8ff` | `= light` | `= light` |
| `--ramp-violet-300` | Violet, types and labels in code (step 300). | `#b9a8ef` | `= light` | `= light` |
| `--ramp-violet-700` | Violet, types and labels in code (step 700). | `#5d558f` | `= light` | `= light` |

#### Ramp: teal

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--ramp-teal-200` | Teal, numbers and literals in code (step 200). | `#5ff5e0` | `= light` | `= light` |
| `--ramp-teal-300` | Teal, numbers and literals in code (step 300). | `#4fc1b3` | `= light` | `= light` |
| `--ramp-teal-700` | Teal, numbers and literals in code (step 700). | `#1c6b66` | `= light` | `= light` |

### Tier 2: semantic roles

What a colour is for, per theme. A value written `= light` is the light value; the dark and high-contrast themes override only what differs.

#### Surface

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--color-surface-900` | Application canvas: the window behind every region and the visual-editor canvas. | `#e7ece8` | `#0f171b` | `#000000` |
| `--color-surface-800` | Panel: sidebars, the code editor, the inspector and the result panels. | `#f8faf7` | `#141e23` | `#080808` |
| `--color-surface-700` | Raised surface: nodes, inputs, cards and controls sitting on a panel. | `#ffffff` | `#19262c` | `#111111` |
| `--color-surface-600` | Rule and separator fill; the border colour of the high-contrast theme. | `#d7dfda` | `#34464d` | `#ffffff` |
| `--color-surface-500` | Strong rule, scrollbar thumb and the quiet side of a border. | `#a8b5b0` | `#5c737c` | `#d7d7d7` |
| `--color-surface-400` | Quiet ink: tertiary text, wires and the stopped state. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--color-surface-300` | Secondary ink. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--color-surface-200` | Strong ink for emphasis on a panel. | `#273537` | `#d3ddda` | `#ffffff` |
| `--color-surface-100` | Primary ink. | `#172127` | `#e5edeb` | `#ffffff` |

#### Accent

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--color-accent-blue` | Cobalt: selection, focus, an active reference and connected technical navigation. Never a success colour. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--color-accent-cyan` | Alias of cobalt kept for components that name it. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--color-accent-green` | Confirmed green: a TRUE value, RUN, a pass. Nothing else. | `#146c40` | `#65c98e` | `#7dff9a` |
| `--color-accent-yellow` | Amber: a forced value, a warning, attention. | `#835300` | `#e0ae4f` | `#ffe16b` |
| `--color-accent-orange` | Alias of amber kept for components that name it. | `#835300` | `#e0ae4f` | `#ffe16b` |
| `--color-accent-red` | Fault red: an error, a fault, a destructive action. Never FALSE. | `#a33838` | `#f07878` | `#ff9393` |
| `--color-accent-purple` | Violet: a type or a label that is neither state nor selection. | `#5d558f` | `#b9a8ef` | `#d0b8ff` |
| `--color-on-accent` | Text and icons on a solid accent fill: white on the light accents, the canvas colour on the dark ones. | `#ffffff` | `#0f171b` | `#000000` |

#### Status

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--color-status-running` | The runtime is running. | `#146c40` | `#65c98e` | `#7dff9a` |
| `--color-status-stopped` | The runtime is stopped or idle: neutral. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--color-status-warning` | A warning needs attention. | `#835300` | `#e0ae4f` | `#ffe16b` |
| `--color-status-connected` | A connection is established. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--color-status-disconnected` | No connection: neutral. | `#566462` | `#8e9e9a` | `#e5e5e5` |

#### Text and border

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--text-primary` | Body text and values. | `#172127` | `#e5edeb` | `#ffffff` |
| `--text-secondary` | Labels and supporting text. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--text-tertiary` | Hints, units and captions. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--text-muted` | De-emphasised text that is still readable. | `#566462` | `#8e9e9a` | `#d7d7d7` |
| `--border-color` | The default 1px rule between regions and around controls. | `#d7dfda` | `#34464d` | `#ffffff` |
| `--color-scrim` | The veil behind a modal dialog. | `rgb(23 33 39 / 0.5)` | `rgb(0 0 0 / 0.6)` | `rgb(0 0 0 / 0.8)` |

#### Elevation

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--shadow-sm` | Shadow of a small transient overlay (a tooltip). Surfaces are flat at rest. | `0 1px 2px rgb(23 33 39 / 0.08)` | `0 1px 2px rgb(0 0 0 / 0.3)` | `none` |
| `--shadow-md` | Shadow of a transient overlay (a dialog, a menu, a popover). The high-contrast theme draws a border instead. | `0 8px 20px rgb(23 33 39 / 0.14)` | `0 8px 20px rgb(0 0 0 / 0.42)` | `none` |

#### Visual editors

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--visual-canvas` | Canvas of the Ladder, FBD and SFC editors. | `#e7ece8` | `#0f171b` | `#000000` |
| `--visual-panel` | Toolbox and control panels of the visual editors. | `#f8faf7` | `#141e23` | `#080808` |
| `--visual-node` | Fill of a node, a rung element or a step. | `#ffffff` | `#19262c` | `#111111` |
| `--visual-muted` | Secondary labels on the canvas. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--visual-wire` | An idle wire or connection: neutral, never a state. | `#566462` | `#5c737c` | `#e5e5e5` |

#### Focus and separators

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--focus-ring-color` | The one focus indicator (UX-005); the operating system supplies it in forced-colors mode. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--focus-ring-width` | Thickness of the focus indicator; thicker in the high-contrast theme. | `2px` | `= light` | `3px` |
| `--focus-ring-offset` | Gap between a control and its focus indicator. | `2px` | `= light` | `= light` |
| `--separator-rule` | The 1px rule drawn inside a resize handle at rest. | `#566462` | `#8e9e9a` | `#e5e5e5` |

#### Code editor

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--editor-bg` | Background of the code editor and its gutter. | `#f8faf7` | `#141e23` | `#080808` |
| `--editor-fg` | Default text of the code editor. | `#172127` | `#e5edeb` | `#ffffff` |
| `--editor-selection-bg` | The selection of the active code editor. | `color-mix(in srgb, #245d8f 28%, transparent)` | `color-mix(in srgb, #5ba7df 32%, transparent)` | `color-mix(in srgb, #55c8ff 55%, transparent)` |
| `--editor-inactive-selection-bg` | The selection of a code editor that does not have focus. | `color-mix(in srgb, #566462 22%, transparent)` | `color-mix(in srgb, #8e9e9a 22%, transparent)` | `color-mix(in srgb, #e5e5e5 22%, transparent)` |
| `--editor-line-number` | Line numbers in the gutter. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--editor-line-number-active` | The line number of the cursor line. | `#172127` | `#e5edeb` | `#ffffff` |
| `--editor-cursor` | The text cursor. | `#172127` | `#e5edeb` | `#ffffff` |
| `--editor-line-highlight` | The background of the cursor line. | `color-mix(in srgb, #566462 12%, transparent)` | `color-mix(in srgb, #8e9e9a 12%, transparent)` | `color-mix(in srgb, #e5e5e5 12%, transparent)` |
| `--syntax-comment` | Comments, set in italic. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--syntax-keyword` | Keywords and control structures (bold). | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--syntax-type` | Data types such as INT, REAL and TIME. | `#1c6b66` | `#4fc1b3` | `#5ff5e0` |
| `--syntax-number` | Numeric and time literals. | `#835300` | `#e0ae4f` | `#ffe16b` |
| `--syntax-string` | String literals. | `#5d558f` | `#b9a8ef` | `#d0b8ff` |
| `--syntax-address` | Direct addresses (%I, %Q, %M) and predefined variables (bold). | `#835300` | `#e0ae4f` | `#ffe16b` |
| `--syntax-label` | IL labels and jump targets (bold). | `#5d558f` | `#b9a8ef` | `#d0b8ff` |
| `--syntax-operator` | Operators and delimiters. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--syntax-bracket` | Brackets and parentheses. | `#172127` | `#e5edeb` | `#ffffff` |

#### Debugging in the code editor

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--debug-breakpoint` | Fill of a breakpoint dot in the editor margin. Red stays the breakpoint colour; the signal vocabulary reserves red for faults, which is an open question for the owner (see DESIGN.md). | `#a33838` | `#f07878` | `#ff9393` |
| `--debug-breakpoint-edge` | Ring around a breakpoint dot: toward the text colour, so the dot keeps its outline on either margin. | `color-mix(in srgb, #a33838 65%, #172127)` | `color-mix(in srgb, #f07878 65%, #e5edeb)` | `color-mix(in srgb, #ff9393 65%, #ffffff)` |
| `--debug-breakpoint-line` | Tint of the line a breakpoint is on. | `color-mix(in srgb, #a33838 15%, transparent)` | `color-mix(in srgb, #f07878 15%, transparent)` | `color-mix(in srgb, #ff9393 15%, transparent)` |
| `--debug-line-bg` | Background of the line execution is paused on. | `color-mix(in srgb, #a33838 16%, transparent)` | `color-mix(in srgb, #f07878 16%, transparent)` | `color-mix(in srgb, #ff9393 16%, transparent)` |
| `--debug-line-edge` | Left edge and arrow of the line execution is paused on. | `#a33838` | `#f07878` | `#ff9393` |

### Tier 3: component tokens

What one component reads. They reference roles, so they follow every theme.

#### Button

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--button-bg` | Fill of a secondary button. | `#ffffff` | `#19262c` | `#111111` |
| `--button-fg` | Label of a secondary button. | `#172127` | `#e5edeb` | `#ffffff` |
| `--button-border` | Border of a secondary button. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--button-bg-hover` | Fill of a secondary button under the pointer. | `color-mix(in srgb, #172127 12%, #ffffff)` | `color-mix(in srgb, #e5edeb 12%, #19262c)` | `color-mix(in srgb, #ffffff 12%, #111111)` |
| `--button-bg-active` | Fill of a secondary button while pressed. | `color-mix(in srgb, #172127 20%, #ffffff)` | `color-mix(in srgb, #e5edeb 20%, #19262c)` | `color-mix(in srgb, #ffffff 20%, #111111)` |
| `--button-primary-bg` | Fill of the primary action of a surface. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--button-primary-fg` | Label of a primary button. | `#ffffff` | `#0f171b` | `#000000` |
| `--button-primary-bg-hover` | Fill of a primary button under the pointer: nearer to the text colour, so the label keeps its contrast. | `color-mix(in srgb, #245d8f 85%, #172127)` | `color-mix(in srgb, #5ba7df 85%, #e5edeb)` | `color-mix(in srgb, #55c8ff 85%, #ffffff)` |
| `--button-danger-bg` | Fill of a destructive action. | `#a33838` | `#f07878` | `#ff9393` |
| `--button-danger-fg` | Label of a destructive button. | `#ffffff` | `#0f171b` | `#000000` |
| `--button-danger-bg-hover` | Fill of a destructive button under the pointer. | `color-mix(in srgb, #a33838 85%, #172127)` | `color-mix(in srgb, #f07878 85%, #e5edeb)` | `color-mix(in srgb, #ff9393 85%, #ffffff)` |
| `--button-ghost-fg` | Label or icon of a button with no fill. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--button-ghost-bg-hover` | Fill of a button with no fill under the pointer. | `color-mix(in srgb, #172127 12%, transparent)` | `color-mix(in srgb, #e5edeb 12%, transparent)` | `color-mix(in srgb, #ffffff 12%, transparent)` |
| `--button-disabled-opacity` | Opacity of a disabled control. | `0.5` | `= light` | `= light` |

#### Field

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--input-bg` | Fill of a text, number or select field. | `#ffffff` | `#19262c` | `#111111` |
| `--input-fg` | Text of a field. | `#172127` | `#e5edeb` | `#ffffff` |
| `--input-border` | Border of a field; 3:1 against the panel it sits on. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--input-border-hover` | Border of a field under the pointer. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--input-placeholder` | Placeholder text. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--input-invalid` | Border and message of a field with an error. | `#a33838` | `#f07878` | `#ff9393` |
| `--label-fg` | The label of a field. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--hint-fg` | The hint under a field. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--check-border` | Border of an unchecked checkbox or switch. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--check-bg-checked` | Fill of a checked checkbox or switch. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--check-fg-checked` | Mark on a checked checkbox or switch. | `#ffffff` | `#0f171b` | `#000000` |

#### Tabs and menus

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--tab-fg` | An unselected tab. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--tab-fg-selected` | The selected tab. | `#172127` | `#e5edeb` | `#ffffff` |
| `--tab-indicator` | The rule under the selected tab. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--tab-bg-hover` | A tab under the pointer. | `color-mix(in srgb, #172127 8%, transparent)` | `color-mix(in srgb, #e5edeb 8%, transparent)` | `color-mix(in srgb, #ffffff 8%, transparent)` |
| `--menu-item-bg-active` | The active item of a menu, listbox or tree. | `color-mix(in srgb, #245d8f 22%, transparent)` | `color-mix(in srgb, #5ba7df 22%, transparent)` | `color-mix(in srgb, #55c8ff 22%, transparent)` |
| `--menu-item-bg-active-danger` | The active item of a menu when the item is destructive: a red tint, so red text keeps its contrast. | `color-mix(in srgb, #a33838 14%, transparent)` | `color-mix(in srgb, #f07878 14%, transparent)` | `color-mix(in srgb, #ff9393 14%, transparent)` |
| `--menu-separator` | A separator between groups of menu items. | `#a8b5b0` | `#5c737c` | `#d7d7d7` |

#### Overlay

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--overlay-bg` | Fill of a dialog, a menu and a popover. | `#f8faf7` | `#141e23` | `#080808` |
| `--overlay-fg` | Text on an overlay. | `#172127` | `#e5edeb` | `#ffffff` |
| `--overlay-border` | Border of an overlay. | `#a8b5b0` | `#5c737c` | `#d7d7d7` |
| `--tooltip-bg` | Fill of a tooltip: the inverse of the panel. | `#172127` | `#e5edeb` | `#ffffff` |
| `--tooltip-fg` | Text of a tooltip. | `#e7ece8` | `#0f171b` | `#000000` |

#### Tone

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--tone-info-fg` | Text and icon of a info badge or message. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--tone-info-bg` | Fill of a info badge or message. | `color-mix(in srgb, #245d8f 14%, transparent)` | `color-mix(in srgb, #5ba7df 14%, transparent)` | `color-mix(in srgb, #55c8ff 14%, transparent)` |
| `--tone-info-border` | Border of a info badge or message. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--tone-success-fg` | Text and icon of a success badge or message. | `#146c40` | `#65c98e` | `#7dff9a` |
| `--tone-success-bg` | Fill of a success badge or message. | `color-mix(in srgb, #146c40 14%, transparent)` | `color-mix(in srgb, #65c98e 14%, transparent)` | `color-mix(in srgb, #7dff9a 14%, transparent)` |
| `--tone-success-border` | Border of a success badge or message. | `#146c40` | `#65c98e` | `#7dff9a` |
| `--tone-warning-fg` | Text and icon of a warning badge or message. | `#835300` | `#e0ae4f` | `#ffe16b` |
| `--tone-warning-bg` | Fill of a warning badge or message. | `color-mix(in srgb, #835300 14%, transparent)` | `color-mix(in srgb, #e0ae4f 14%, transparent)` | `color-mix(in srgb, #ffe16b 14%, transparent)` |
| `--tone-warning-border` | Border of a warning badge or message. | `#835300` | `#e0ae4f` | `#ffe16b` |
| `--tone-danger-fg` | Text and icon of a danger badge or message. | `#a33838` | `#f07878` | `#ff9393` |
| `--tone-danger-bg` | Fill of a danger badge or message. | `color-mix(in srgb, #a33838 14%, transparent)` | `color-mix(in srgb, #f07878 14%, transparent)` | `color-mix(in srgb, #ff9393 14%, transparent)` |
| `--tone-danger-border` | Border of a danger badge or message. | `#a33838` | `#f07878` | `#ff9393` |
| `--tone-neutral-fg` | Text and icon of a neutral badge or message. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--tone-neutral-bg` | Fill of a neutral badge or message. | `color-mix(in srgb, #566462 14%, transparent)` | `color-mix(in srgb, #8e9e9a 14%, transparent)` | `color-mix(in srgb, #e5e5e5 14%, transparent)` |
| `--tone-neutral-border` | Border of a neutral badge or message; 3:1 against the panel, so a FALSE chip keeps its outline. | `#566462` | `#8e9e9a` | `#e5e5e5` |

#### Signal vocabulary

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--signal-true-fg` | A confirmed TRUE value: green. | `#146c40` | `#65c98e` | `#7dff9a` |
| `--signal-true-bg` | Chip fill of a TRUE value. | `color-mix(in srgb, #146c40 14%, transparent)` | `color-mix(in srgb, #65c98e 14%, transparent)` | `color-mix(in srgb, #7dff9a 14%, transparent)` |
| `--signal-true-border` | Chip border of a TRUE value. | `#146c40` | `#65c98e` | `#7dff9a` |
| `--signal-false-fg` | A FALSE value: neutral, never red. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--signal-false-bg` | Chip fill of a FALSE value. | `color-mix(in srgb, #566462 14%, transparent)` | `color-mix(in srgb, #8e9e9a 14%, transparent)` | `color-mix(in srgb, #e5e5e5 14%, transparent)` |
| `--signal-false-border` | Chip border of a FALSE value. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--signal-unknown-fg` | A value that has not been read: neutral, and the border is dashed. | `#4c5a59` | `#b7c4c0` | `#f2f2f2` |
| `--signal-unknown-bg` | Chip fill of an unknown value. | `transparent` | `= light` | `= light` |
| `--signal-unknown-border` | Chip border of an unknown value. | `#566462` | `#8e9e9a` | `#e5e5e5` |
| `--signal-forced-fg` | A forced value: amber. | `#835300` | `#e0ae4f` | `#ffe16b` |
| `--signal-forced-bg` | Chip fill of a forced value. | `color-mix(in srgb, #835300 14%, transparent)` | `color-mix(in srgb, #e0ae4f 14%, transparent)` | `color-mix(in srgb, #ffe16b 14%, transparent)` |
| `--signal-forced-border` | Chip border of a forced value. | `#835300` | `#e0ae4f` | `#ffe16b` |
| `--signal-fault-fg` | A fault: red, and only a fault. | `#a33838` | `#f07878` | `#ff9393` |
| `--signal-fault-bg` | Chip fill of a fault. | `color-mix(in srgb, #a33838 14%, transparent)` | `color-mix(in srgb, #f07878 14%, transparent)` | `color-mix(in srgb, #ff9393 14%, transparent)` |
| `--signal-fault-border` | Chip border of a fault. | `#a33838` | `#f07878` | `#ff9393` |
| `--signal-value-fg` | A numeric or string value that is not a state: cobalt. | `#245d8f` | `#5ba7df` | `#55c8ff` |
| `--signal-value-bg` | Chip fill of a plain value. | `color-mix(in srgb, #245d8f 14%, transparent)` | `color-mix(in srgb, #5ba7df 14%, transparent)` | `color-mix(in srgb, #55c8ff 14%, transparent)` |
| `--signal-value-border` | Chip border of a plain value. | `#245d8f` | `#5ba7df` | `#55c8ff` |

### Scales

Type, shape, elevation, icons, layers and density. The compact column is the value under the compact density.

#### Typography

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--font-sans` | The interface typeface: Inter, bundled, then the system face. | `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` | `= light` | `= light` |
| `--font-mono` | The code and value typeface: JetBrains Mono, bundled, then a system monospace. | `'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace` | `= light` | `= light` |
| `--font-size-caption` | Smallest text: captions, units and badges. The floor of the scale is 11px (UX-006). | `11px` | `= light` | `= light` |
| `--font-size-label` | Labels, table cells and compact controls. | `12px` | `= light` | `= light` |
| `--font-size-body` | Body text and the default size of the interface. | `13px` | `= light` | `= light` |
| `--font-size-title` | Panel and dialog titles. | `14px` | `= light` | `= light` |
| `--font-size-heading` | Page headings. | `16px` | `= light` | `= light` |
| `--font-weight-normal` | Regular weight. | `400` | `= light` | `= light` |
| `--font-weight-medium` | Medium weight: labels and tabs. | `500` | `= light` | `= light` |
| `--font-weight-strong` | Strong weight: titles and values that matter. | `600` | `= light` | `= light` |
| `--line-height-tight` | Line height of controls and tables. | `1.3` | `= light` | `= light` |
| `--line-height-normal` | Line height of running text. | `1.5` | `= light` | `= light` |
| `--letter-spacing-label` | Tracking of an uppercase structural label. | `0.08em` | `= light` | `= light` |

#### Shape, elevation and icons

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--radius-control` | Corner radius of a button, a field and a tab. | `2px` | `= light` | `= light` |
| `--radius-surface` | Corner radius of a panel or a card: square. | `0px` | `= light` | `= light` |
| `--radius-overlay` | Corner radius of a dialog, a menu and a popover. | `4px` | `= light` | `= light` |
| `--radius-round` | Corner radius of a status dot. | `9999px` | `= light` | `= light` |
| `--elevation-flat` | Surfaces are flat at rest. | `none` | `= light` | `= light` |
| `--elevation-tooltip` | The shadow of a tooltip, the only small overlay. | `0 1px 2px rgb(23 33 39 / 0.08)` | `0 1px 2px rgb(0 0 0 / 0.3)` | `none` |
| `--elevation-overlay` | The shadow of a dialog, a menu or a popover: transient surfaces only. | `0 8px 20px rgb(23 33 39 / 0.14)` | `0 8px 20px rgb(0 0 0 / 0.42)` | `none` |
| `--icon-size-sm` | Icon inside a compact control or a badge. | `12px` | `= light` | `= light` |
| `--icon-size-md` | Icon in a toolbar or a button. | `16px` | `= light` | `= light` |
| `--icon-size-lg` | Icon of an empty state or a dialog. | `20px` | `= light` | `= light` |
| `--status-dot-size` | Diameter of a status dot. | `8px` | `= light` | `= light` |

#### Layers and motion

| Token | Use | Light | Dark | High contrast |
|---|---|---|---|---|
| `--z-overlay` | Dialogs and their scrim. | `50` | `= light` | `= light` |
| `--z-popover` | Menus and popovers, above dialogs. | `60` | `= light` | `= light` |
| `--z-tooltip` | Tooltips, above everything. | `70` | `= light` | `= light` |
| `--z-toast` | Notifications. | `80` | `= light` | `= light` |
| `--motion-fast` | Duration of a hover or state transition; reduced to nothing under reduced motion. | `120ms` | `= light` | `= light` |

#### Density

| Token | Use | Light | Dark | High contrast | Compact |
|---|---|---|---|---|---|
| `--spacing` | The base spacing unit that every spacing utility is a multiple of (UX-008). | `0.25rem` | `= light` | `= light` | `0.1875rem` |
| `--control-height` | Height of a button, a field and a tab. | `32px` | `= light` | `= light` | `26px` |
| `--control-height-sm` | Height of a compact control inside a row or a toolbar. | `26px` | `= light` | `= light` | `22px` |
| `--control-padding-x` | Horizontal padding of a control. | `12px` | `= light` | `= light` | `8px` |
| `--row-height` | Height of a list, tree or table row. | `30px` | `= light` | `= light` | `24px` |
| `--gap-control` | Gap between related controls. | `8px` | `= light` | `= light` | `6px` |

### Contrast

CI computes the WCAG 2.2 ratio of each pair below from the tokens, in all three themes, and fails when one falls under its minimum (4.5:1 for text, 3:1 for a graphic that carries meaning). 147 pairs are declared and listed here with their computed ratios.

| Pair | Use | Minimum | Light | Dark | High contrast |
|---|---|---|---|---|---|
| `--text-primary` on `--color-surface-900` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 13.68:1 | 15.23:1 | 21.00:1 |
| `--text-primary` on `--color-surface-800` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 15.59:1 | 14.23:1 | 20.03:1 |
| `--text-primary` on `--color-surface-700` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 16.36:1 | 13.02:1 | 18.88:1 |
| `--text-secondary` on `--color-surface-900` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 6.03:1 | 10.07:1 | 18.76:1 |
| `--text-secondary` on `--color-surface-800` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 6.87:1 | 9.41:1 | 17.89:1 |
| `--text-secondary` on `--color-surface-700` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 7.21:1 | 8.61:1 | 16.87:1 |
| `--text-tertiary` on `--color-surface-900` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 5.17:1 | 6.48:1 | 16.67:1 |
| `--text-tertiary` on `--color-surface-800` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--text-tertiary` on `--color-surface-700` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 6.19:1 | 5.54:1 | 14.99:1 |
| `--text-muted` on `--color-surface-900` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 5.17:1 | 6.48:1 | 14.59:1 |
| `--text-muted` on `--color-surface-800` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 5.89:1 | 6.06:1 | 13.92:1 |
| `--text-muted` on `--color-surface-700` | Body, label, hint and muted text on the canvas, a panel and a raised surface | 4.5:1 | 6.19:1 | 5.54:1 | 13.12:1 |
| `--color-accent-blue` on `--color-surface-900` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 5.78:1 | 6.94:1 | 11.09:1 |
| `--color-accent-blue` on `--color-surface-800` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.59:1 | 6.48:1 | 10.58:1 |
| `--color-accent-blue` on `--color-surface-700` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.91:1 | 5.93:1 | 9.97:1 |
| `--color-accent-green` on `--color-surface-900` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 5.41:1 | 8.89:1 | 16.64:1 |
| `--color-accent-green` on `--color-surface-800` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.16:1 | 8.31:1 | 15.87:1 |
| `--color-accent-green` on `--color-surface-700` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.46:1 | 7.60:1 | 14.96:1 |
| `--color-accent-yellow` on `--color-surface-900` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 5.48:1 | 8.92:1 | 16.23:1 |
| `--color-accent-yellow` on `--color-surface-800` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.25:1 | 8.34:1 | 15.48:1 |
| `--color-accent-yellow` on `--color-surface-700` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.56:1 | 7.63:1 | 14.60:1 |
| `--color-accent-red` on `--color-surface-900` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 5.52:1 | 6.61:1 | 9.85:1 |
| `--color-accent-red` on `--color-surface-800` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.29:1 | 6.18:1 | 9.39:1 |
| `--color-accent-red` on `--color-surface-700` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.60:1 | 5.66:1 | 8.85:1 |
| `--color-accent-purple` on `--color-surface-900` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 5.55:1 | 8.55:1 | 11.98:1 |
| `--color-accent-purple` on `--color-surface-800` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.33:1 | 7.99:1 | 11.43:1 |
| `--color-accent-purple` on `--color-surface-700` | Accent text and icons on the canvas, a panel and a raised surface | 4.5:1 | 6.64:1 | 7.31:1 | 10.77:1 |
| `--color-on-accent` on `--color-accent-blue` | Text on a solid accent fill | 4.5:1 | 6.91:1 | 6.94:1 | 11.09:1 |
| `--color-on-accent` on `--color-accent-green` | Text on a solid accent fill | 4.5:1 | 6.46:1 | 8.89:1 | 16.64:1 |
| `--color-on-accent` on `--color-accent-yellow` | Text on a solid accent fill | 4.5:1 | 6.56:1 | 8.92:1 | 16.23:1 |
| `--color-on-accent` on `--color-accent-red` | Text on a solid accent fill | 4.5:1 | 6.60:1 | 6.61:1 | 9.85:1 |
| `--color-on-accent` on `--color-accent-purple` | Text on a solid accent fill | 4.5:1 | 6.64:1 | 8.55:1 | 11.98:1 |
| `--color-on-accent` on `--button-primary-bg-hover` | Label of a primary or destructive button under the pointer | 4.5:1 | 7.94:1 | 7.85:1 | 12.16:1 |
| `--color-on-accent` on `--button-danger-bg-hover` | Label of a primary or destructive button under the pointer | 4.5:1 | 7.77:1 | 7.44:1 | 11.04:1 |
| `--button-fg` on `--button-bg` | Label of a secondary button | 4.5:1 | 16.36:1 | 13.02:1 | 18.88:1 |
| `--button-fg` on `--button-bg-hover` | Label of a secondary button under the pointer | 4.5:1 | 12.89:1 | 9.29:1 | 13.66:1 |
| `--button-fg` on `--button-bg-active` | Label of a secondary button while pressed | 4.5:1 | 10.85:1 | 7.24:1 | 10.27:1 |
| `--button-ghost-fg` on `--color-surface-800` | Label or icon of a button with no fill | 4.5:1 | 6.87:1 | 9.41:1 | 17.89:1 |
| `--button-ghost-fg` on `--button-ghost-bg-hover` over `--color-surface-800` | Label of a button with no fill under the pointer | 4.5:1 | 5.42:1 | 6.79:1 | 13.58:1 |
| `--input-fg` on `--input-bg` | Text in a field | 4.5:1 | 16.36:1 | 13.02:1 | 18.88:1 |
| `--input-placeholder` on `--input-bg` | Placeholder text in a field | 4.5:1 | 6.19:1 | 5.54:1 | 14.99:1 |
| `--label-fg` on `--color-surface-800` | Field label on a panel | 4.5:1 | 6.87:1 | 9.41:1 | 17.89:1 |
| `--hint-fg` on `--color-surface-800` | Field hint on a panel | 4.5:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--input-invalid` on `--color-surface-800` | Validation message on a panel | 4.5:1 | 6.29:1 | 6.18:1 | 9.39:1 |
| `--input-border` on `--color-surface-800` | Boundary of a field, a checkbox or a switch | 3:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--input-border` on `--color-surface-700` | Boundary of a field, a checkbox or a switch | 3:1 | 6.19:1 | 5.54:1 | 14.99:1 |
| `--check-border` on `--color-surface-800` | Boundary of a field, a checkbox or a switch | 3:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--check-border` on `--color-surface-700` | Boundary of a field, a checkbox or a switch | 3:1 | 6.19:1 | 5.54:1 | 14.99:1 |
| `--check-fg-checked` on `--check-bg-checked` | Mark on a checked box | 4.5:1 | 6.91:1 | 6.94:1 | 11.09:1 |
| `--tab-fg` on `--color-surface-800` | An unselected tab | 4.5:1 | 6.87:1 | 9.41:1 | 17.89:1 |
| `--tab-fg-selected` on `--color-surface-800` | The selected tab | 4.5:1 | 15.59:1 | 14.23:1 | 20.03:1 |
| `--tab-fg` on `--tab-bg-hover` over `--color-surface-800` | A tab under the pointer | 4.5:1 | 5.88:1 | 7.65:1 | 15.26:1 |
| `--tab-indicator` on `--color-surface-800` | The rule under the selected tab | 3:1 | 6.59:1 | 6.48:1 | 10.58:1 |
| `--overlay-fg` on `--overlay-bg` | Text of a dialog, a menu or a popover | 4.5:1 | 15.59:1 | 14.23:1 | 20.03:1 |
| `--overlay-fg` on `--menu-item-bg-active` over `--overlay-bg` | The active item of a menu | 4.5:1 | 11.17:1 | 9.65:1 | 13.36:1 |
| `--color-accent-red` on `--menu-item-bg-active-danger` over `--overlay-bg` | A destructive item of a menu when it is active | 4.5:1 | 5.08:1 | 5.04:1 | 7.70:1 |
| `--color-accent-red` on `--overlay-bg` | A destructive item of a menu | 4.5:1 | 6.29:1 | 6.18:1 | 9.39:1 |
| `--tooltip-fg` on `--tooltip-bg` | Text of a tooltip | 4.5:1 | 13.68:1 | 15.23:1 | 21.00:1 |
| `--tone-info-fg` on `--tone-info-bg` over `--color-surface-800` | A info badge on a panel | 4.5:1 | 5.35:1 | 5.13:1 | 8.53:1 |
| `--tone-success-fg` on `--tone-success-bg` over `--color-surface-800` | A success badge on a panel | 4.5:1 | 5.02:1 | 6.31:1 | 11.92:1 |
| `--tone-warning-fg` on `--tone-warning-bg` over `--color-surface-800` | A warning badge on a panel | 4.5:1 | 5.10:1 | 6.38:1 | 11.64:1 |
| `--tone-danger-fg` on `--tone-danger-bg` over `--color-surface-800` | A danger badge on a panel | 4.5:1 | 5.08:1 | 5.04:1 | 7.70:1 |
| `--tone-neutral-fg` on `--tone-neutral-bg` over `--color-surface-800` | A neutral badge on a panel | 4.5:1 | 5.67:1 | 7.53:1 | 13.35:1 |
| `--signal-true-fg` on `--signal-true-bg` over `--color-surface-800` | A true value in a chip, the Watch table and the status bar | 4.5:1 | 5.02:1 | 6.31:1 | 11.92:1 |
| `--signal-true-border` on `--color-surface-800` | Chip border of a true value | 3:1 | 6.16:1 | 8.31:1 | 15.87:1 |
| `--signal-false-fg` on `--signal-false-bg` over `--color-surface-800` | A false value in a chip, the Watch table and the status bar | 4.5:1 | 5.67:1 | 7.53:1 | 13.35:1 |
| `--signal-false-border` on `--color-surface-800` | Chip border of a false value | 3:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--signal-unknown-fg` on `--signal-unknown-bg` over `--color-surface-800` | A unknown value in a chip, the Watch table and the status bar | 4.5:1 | 6.87:1 | 9.41:1 | 17.89:1 |
| `--signal-unknown-border` on `--color-surface-800` | Chip border of a unknown value | 3:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--signal-forced-fg` on `--signal-forced-bg` over `--color-surface-800` | A forced value in a chip, the Watch table and the status bar | 4.5:1 | 5.10:1 | 6.38:1 | 11.64:1 |
| `--signal-forced-border` on `--color-surface-800` | Chip border of a forced value | 3:1 | 6.25:1 | 8.34:1 | 15.48:1 |
| `--signal-fault-fg` on `--signal-fault-bg` over `--color-surface-800` | A fault value in a chip, the Watch table and the status bar | 4.5:1 | 5.08:1 | 5.04:1 | 7.70:1 |
| `--signal-fault-border` on `--color-surface-800` | Chip border of a fault value | 3:1 | 6.29:1 | 6.18:1 | 9.39:1 |
| `--signal-value-fg` on `--signal-value-bg` over `--color-surface-800` | A value value in a chip, the Watch table and the status bar | 4.5:1 | 5.35:1 | 5.13:1 | 8.53:1 |
| `--signal-value-border` on `--color-surface-800` | Chip border of a value value | 3:1 | 6.59:1 | 6.48:1 | 10.58:1 |
| `--visual-wire` on `--visual-canvas` | An idle wire on the visual editor canvas | 3:1 | 5.17:1 | 3.62:1 | 16.67:1 |
| `--text-primary` on `--visual-canvas` | Text and labels drawn in a visual editor | 4.5:1 | 13.68:1 | 15.23:1 | 21.00:1 |
| `--text-secondary` on `--visual-canvas` | Text and labels drawn in a visual editor | 4.5:1 | 6.03:1 | 10.07:1 | 18.76:1 |
| `--visual-muted` on `--visual-canvas` | Text and labels drawn in a visual editor | 4.5:1 | 5.17:1 | 6.48:1 | 16.67:1 |
| `--signal-true-fg` on `--visual-canvas` | A true value drawn on the canvas or on a node of a visual editor | 4.5:1 | 5.41:1 | 8.89:1 | 16.64:1 |
| `--signal-false-fg` on `--visual-canvas` | A false value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.03:1 | 10.07:1 | 18.76:1 |
| `--signal-unknown-fg` on `--visual-canvas` | A unknown value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.03:1 | 10.07:1 | 18.76:1 |
| `--signal-forced-fg` on `--visual-canvas` | A forced value drawn on the canvas or on a node of a visual editor | 4.5:1 | 5.48:1 | 8.92:1 | 16.23:1 |
| `--signal-fault-fg` on `--visual-canvas` | A fault value drawn on the canvas or on a node of a visual editor | 4.5:1 | 5.52:1 | 6.61:1 | 9.85:1 |
| `--signal-value-fg` on `--visual-canvas` | A value value drawn on the canvas or on a node of a visual editor | 4.5:1 | 5.78:1 | 6.94:1 | 11.09:1 |
| `--signal-true-border` on `--visual-canvas` | A wire that carries power or a TRUE value, and the border of an active step | 3:1 | 5.41:1 | 8.89:1 | 16.64:1 |
| `--text-primary` on `--visual-node` | Text and labels drawn in a visual editor | 4.5:1 | 16.36:1 | 13.02:1 | 18.88:1 |
| `--text-secondary` on `--visual-node` | Text and labels drawn in a visual editor | 4.5:1 | 7.21:1 | 8.61:1 | 16.87:1 |
| `--visual-muted` on `--visual-node` | Text and labels drawn in a visual editor | 4.5:1 | 6.19:1 | 5.54:1 | 14.99:1 |
| `--signal-true-fg` on `--visual-node` | A true value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.46:1 | 7.60:1 | 14.96:1 |
| `--signal-false-fg` on `--visual-node` | A false value drawn on the canvas or on a node of a visual editor | 4.5:1 | 7.21:1 | 8.61:1 | 16.87:1 |
| `--signal-unknown-fg` on `--visual-node` | A unknown value drawn on the canvas or on a node of a visual editor | 4.5:1 | 7.21:1 | 8.61:1 | 16.87:1 |
| `--signal-forced-fg` on `--visual-node` | A forced value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.56:1 | 7.63:1 | 14.60:1 |
| `--signal-fault-fg` on `--visual-node` | A fault value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.60:1 | 5.66:1 | 8.85:1 |
| `--signal-value-fg` on `--visual-node` | A value value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.91:1 | 5.93:1 | 9.97:1 |
| `--signal-true-border` on `--visual-node` | A wire that carries power or a TRUE value, and the border of an active step | 3:1 | 6.46:1 | 7.60:1 | 14.96:1 |
| `--text-primary` on `--visual-panel` | Text and labels drawn in a visual editor | 4.5:1 | 15.59:1 | 14.23:1 | 20.03:1 |
| `--text-secondary` on `--visual-panel` | Text and labels drawn in a visual editor | 4.5:1 | 6.87:1 | 9.41:1 | 17.89:1 |
| `--visual-muted` on `--visual-panel` | Text and labels drawn in a visual editor | 4.5:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--signal-true-fg` on `--visual-panel` | A true value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.16:1 | 8.31:1 | 15.87:1 |
| `--signal-false-fg` on `--visual-panel` | A false value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.87:1 | 9.41:1 | 17.89:1 |
| `--signal-unknown-fg` on `--visual-panel` | A unknown value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.87:1 | 9.41:1 | 17.89:1 |
| `--signal-forced-fg` on `--visual-panel` | A forced value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.25:1 | 8.34:1 | 15.48:1 |
| `--signal-fault-fg` on `--visual-panel` | A fault value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.29:1 | 6.18:1 | 9.39:1 |
| `--signal-value-fg` on `--visual-panel` | A value value drawn on the canvas or on a node of a visual editor | 4.5:1 | 6.59:1 | 6.48:1 | 10.58:1 |
| `--signal-true-border` on `--visual-panel` | A wire that carries power or a TRUE value, and the border of an active step | 3:1 | 6.16:1 | 8.31:1 | 15.87:1 |
| `--color-status-running` on `--color-surface-900` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 5.41:1 | 8.89:1 | 16.64:1 |
| `--color-status-running` on `--color-surface-800` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 6.16:1 | 8.31:1 | 15.87:1 |
| `--color-status-stopped` on `--color-surface-900` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 5.17:1 | 6.48:1 | 16.67:1 |
| `--color-status-stopped` on `--color-surface-800` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--color-status-warning` on `--color-surface-900` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 5.48:1 | 8.92:1 | 16.23:1 |
| `--color-status-warning` on `--color-surface-800` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 6.25:1 | 8.34:1 | 15.48:1 |
| `--color-status-connected` on `--color-surface-900` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 5.78:1 | 6.94:1 | 11.09:1 |
| `--color-status-connected` on `--color-surface-800` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 6.59:1 | 6.48:1 | 10.58:1 |
| `--color-status-disconnected` on `--color-surface-900` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 5.17:1 | 6.48:1 | 16.67:1 |
| `--color-status-disconnected` on `--color-surface-800` | A runtime or connection status in the status bar and the toolbar | 4.5:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--focus-ring-color` on `--color-surface-900` | The focus indicator on the canvas | 3:1 | 5.78:1 | 6.94:1 | 11.09:1 |
| `--focus-ring-color` on `--color-surface-800` | The focus indicator on a panel | 3:1 | 6.59:1 | 6.48:1 | 10.58:1 |
| `--focus-ring-color` on `--color-surface-700` | The focus indicator on a raised surface | 3:1 | 6.91:1 | 5.93:1 | 9.97:1 |
| `--separator-rule` on `--color-surface-900` | The rule inside a resize handle | 3:1 | 5.17:1 | 6.48:1 | 16.67:1 |
| `--separator-rule` on `--color-surface-800` | The rule inside a resize handle | 3:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--editor-fg` on `--editor-bg` | Code and the active line number | 4.5:1 | 15.59:1 | 14.23:1 | 20.03:1 |
| `--editor-line-number-active` on `--editor-bg` | Code and the active line number | 4.5:1 | 15.59:1 | 14.23:1 | 20.03:1 |
| `--editor-line-number` on `--editor-bg` | Line numbers | 4.5:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--syntax-comment` on `--editor-bg` | Syntax colour on the code editor background | 4.5:1 | 5.89:1 | 6.06:1 | 15.90:1 |
| `--syntax-comment` on `--editor-line-highlight` over `--editor-bg` | Syntax colour on the line of the cursor | 4.5:1 | 5.01:1 | 5.02:1 | 12.55:1 |
| `--syntax-keyword` on `--editor-bg` | Syntax colour on the code editor background | 4.5:1 | 6.59:1 | 6.48:1 | 10.58:1 |
| `--syntax-keyword` on `--editor-line-highlight` over `--editor-bg` | Syntax colour on the line of the cursor | 4.5:1 | 5.59:1 | 5.37:1 | 8.35:1 |
| `--syntax-type` on `--editor-bg` | Syntax colour on the code editor background | 4.5:1 | 5.98:1 | 7.75:1 | 14.90:1 |
| `--syntax-type` on `--editor-line-highlight` over `--editor-bg` | Syntax colour on the line of the cursor | 4.5:1 | 5.08:1 | 6.43:1 | 11.76:1 |
| `--syntax-number` on `--editor-bg` | Syntax colour on the code editor background | 4.5:1 | 6.25:1 | 8.34:1 | 15.48:1 |
| `--syntax-number` on `--editor-line-highlight` over `--editor-bg` | Syntax colour on the line of the cursor | 4.5:1 | 5.31:1 | 6.91:1 | 12.22:1 |
| `--syntax-string` on `--editor-bg` | Syntax colour on the code editor background | 4.5:1 | 6.33:1 | 7.99:1 | 11.43:1 |
| `--syntax-string` on `--editor-line-highlight` over `--editor-bg` | Syntax colour on the line of the cursor | 4.5:1 | 5.37:1 | 6.62:1 | 9.02:1 |
| `--syntax-address` on `--editor-bg` | Syntax colour on the code editor background | 4.5:1 | 6.25:1 | 8.34:1 | 15.48:1 |
| `--syntax-address` on `--editor-line-highlight` over `--editor-bg` | Syntax colour on the line of the cursor | 4.5:1 | 5.31:1 | 6.91:1 | 12.22:1 |
| `--syntax-label` on `--editor-bg` | Syntax colour on the code editor background | 4.5:1 | 6.33:1 | 7.99:1 | 11.43:1 |
| `--syntax-label` on `--editor-line-highlight` over `--editor-bg` | Syntax colour on the line of the cursor | 4.5:1 | 5.37:1 | 6.62:1 | 9.02:1 |
| `--syntax-operator` on `--editor-bg` | Syntax colour on the code editor background | 4.5:1 | 6.87:1 | 9.41:1 | 17.89:1 |
| `--syntax-operator` on `--editor-line-highlight` over `--editor-bg` | Syntax colour on the line of the cursor | 4.5:1 | 5.83:1 | 7.80:1 | 14.12:1 |
| `--syntax-bracket` on `--editor-bg` | Syntax colour on the code editor background | 4.5:1 | 15.59:1 | 14.23:1 | 20.03:1 |
| `--syntax-bracket` on `--editor-line-highlight` over `--editor-bg` | Syntax colour on the line of the cursor | 4.5:1 | 13.24:1 | 11.80:1 | 15.81:1 |
| `--editor-fg` on `--editor-line-highlight` over `--editor-bg` | Code on the line of the cursor | 4.5:1 | 13.24:1 | 11.80:1 | 15.81:1 |
| `--editor-fg` on `--editor-selection-bg` over `--editor-bg` | Selected code | 4.5:1 | 10.13:1 | 7.87:1 | 5.35:1 |
| `--debug-breakpoint` on `--editor-bg` | A breakpoint dot and the marker of the paused line in the editor margin | 3:1 | 6.29:1 | 6.18:1 | 9.39:1 |
| `--debug-line-edge` on `--editor-bg` | A breakpoint dot and the marker of the paused line in the editor margin | 3:1 | 6.29:1 | 6.18:1 | 9.39:1 |
| `--editor-fg` on `--debug-line-bg` over `--editor-bg` | Code on the line execution is paused on | 4.5:1 | 12.18:1 | 11.21:1 | 15.78:1 |

<!-- tokens:end -->
