---
version: 1
slug: 'src-pages-index-js'
primary_target: 'src/pages/index.js'
related_targets: ['src/components/LandingPage']
---

# Landing page (product page)

Scope: `docs/src/pages/index.js` and `docs/src/components/LandingPage/*`, EN and ES. Mode: Persuade.

Audience and job: people who build control systems and people who learn PLC programming, with equal weight (PRODUCT.md).
The visitor should leave knowing that ZPLC is an open-source PLC they can take to the microcontroller they choose, or learn
with, and act: download the application or start Learn. Proof on the page: real captures, the board manifest, the course
data, page-drawn diagrams. Constraints: DOC-012 claims guard, counts that match the repository, no evaluation notice or
limits text on the site (it lives in the documentation), EN/ES parity, usted.

Rework type: extension of the incumbent world (Wiring Ledger, docs/design/design-brief.md); content and hierarchy change,
the visual system does not. No concept tournament was run: the world is settled and the owner asked for a content rework.

## Direction contract

THESIS: The landing is the product sheet of an open PLC, drawn in the notation of the trade: one PLC for the microcontroller
the visitor chooses, with two doors of equal weight, build and learn. It refuses the developer-project page (function names,
evidence jargon, limits on the first screen) and the SaaS template (a centred headline over a row of icon cards).

OWN-WORLD: Wiring Ledger, inherited. Drawing Sheet light and Commissioning Spine dark; graphite ink on tinted paper; 1 px
rules; cobalt for actions; green only when something conducts; IEC 60617 line symbols; square frames; isometric line
illustrations; Inter, with JetBrains Mono only for designations (language codes, terminal tags, targets).

STORY: The visitor reads what ZPLC is and picks a door; then sees the proof in order: portability and the boards, the five
editors, the simulator and debugger, the course, the technical data sheet; and picks a door again at the close.

FIRST VIEWPORT: The dark spine. Brand; the heading in two lines across the container; the lead under it; then a 5:7 row: on
the left two path panels of equal size stacked like terminal blocks (Build: Download ZPLC; Learn: Start learning), each with
a primary button; on the right the isometric rung-to-terminal illustration.

FORM: the incumbent landing form, extended (position 1 of 1; seed key: none, extension of an established surface).

Signature interaction: a ladder rung conducts (wire and symbols turn green) under the pointer or keyboard focus; the
portability diagram is wired from program to runtime to the three platforms.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every
shipping raster carrying its provenance
