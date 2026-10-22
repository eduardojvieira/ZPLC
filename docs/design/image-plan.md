# Site image plan (checkpoint 1)

The images the new site needs beyond the captures it already has: (a) four illustrations that the owner generates with
Antigravity and drops at the paths below, and (b) new real captures of the application. The architecture diagram is not here:
it is a hand-built SVG in phase 2. No board, controller or product screen is ever generated.

## (a) Generated images

### Why these four, and only these

The Learn course runs every lesson against one of four simulated plants (`docs/docs/learn/plants.md`; their signals are in
`packages/zplc-ide/src/test-engine/index.ts`): a tank, a conveyor, a motor and a pedestrian crossing. A visitor understands
what a lesson asks the program to do when they see the process, and a process is an idea, not product UI or hardware that
ZPLC claims. Each illustration sits on the card of its plant in the Learn section of the landing page (section 4 of
`content-outline.md`), with the lesson it serves. Nothing else on the page needs a generated picture.

### The shared style (every prompt below contains it word for word)

> Technical line illustration in the manner of a mechanical engineering drawing sheet. One piece of industrial process
> equipment in a true isometric view (30 degrees), centred, with an empty margin of at least 12 percent of the frame on
> every side. Thin, even line work of one weight (about 2 px at 1600 px wide), hidden edges omitted, light parallel
> hatching only on cut or shadowed faces. Flat, solid background colour filling the whole frame. One line colour. One accent
> colour with one meaning: a solid accent fill marks the actuator that the control program drives, and an accent outline
> marks the sensors that the control program reads; everything else is line colour. An optional secondary flat fill on large
> faces. No gradients, no shading, no shadows, no glow, no texture, no paper grain, no perspective distortion, no
> photorealism, no 3D render look. Do not draw: any text, letters, numbers, labels or logos; people, hands or silhouettes;
> screens, computers, user interfaces, control panels, PLCs, circuit boards or electronic modules; brand marks; neon, glow,
> lens flare or light rays.

Light variants use background `#F8FAF7`, lines `#172127`, accent `#245D8F`, secondary fill `#E7ECE8`. Dark variants use
background `#0F171B`, lines `#E5EDEB`, accent `#5BA7DF`, secondary fill `#19262C`. These are the site's Drawing Sheet and
Commissioning Spine tokens (`design-brief.md`).

### Format of every file

- PNG, sRGB, no transparency, **1600 x 1200 px (4:3)**. The site shows them at up to 600 px wide in a two-by-two grid, so the
  source is a little over twice the largest display size.
- Two variants per image, light and dark, of the same composition: generate the light one first, then ask for the dark one
  with the dark prompt and the light image as the reference, so the drawing does not change.
- The build does not convert images today (Docusaurus here has no image plugin). Phase 2 commits the PNG and a WebP made from
  it once, with the command recorded in `docs/static/img/generated/README.md`, and serves the WebP with the PNG as fallback.
  Adding `@docusaurus/plugin-ideal-image` would do this at build time but is a new dependency: the owner decides.
- Phase 2 writes `docs/static/img/generated/README.md`: for each file, what it shows, that it was generated with Antigravity
  from the prompt in this plan, the date, and who generated it.

### G1: the tank plant

- **Purpose and section:** the card of the tank plant in the Learn section; lesson "Tank level, faults, and reset".
- **Paths:** `docs/static/img/generated/plant-tank-light.png`, `docs/static/img/generated/plant-tank-dark.png`
- **Size:** 1600 x 1200 px, 4:3, PNG.
- **Light prompt:**

  > A vertical cylindrical liquid tank standing on four short legs, about 60 percent full, the liquid surface drawn as a flat
  > ellipse. At the base, a small centrifugal pump with its motor feeds an inlet pipe that rises and enters the tank at the
  > top. An outlet pipe with a hand valve leaves the tank near the bottom. Two float level switches are mounted on the tank
  > wall, drawn as small cylinders on short horizontal stems: one near the bottom (low level) and one near the top (high
  > level). Accent fill: the pump and its motor. Accent outline: the two level switches. Technical line illustration in the
  > manner of a mechanical engineering drawing sheet. One piece of industrial process equipment in a true isometric view (30
  > degrees), centred, with an empty margin of at least 12 percent of the frame on every side. Thin, even line work of one
  > weight (about 2 px at 1600 px wide), hidden edges omitted, light parallel hatching only on cut or shadowed faces. Flat,
  > solid background colour filling the whole frame. One line colour. One accent colour with one meaning: a solid accent
  > fill marks the actuator that the control program drives, and an accent outline marks the sensors that the control
  > program reads; everything else is line colour. An optional secondary flat fill on large faces. No gradients, no shading,
  > no shadows, no glow, no texture, no paper grain, no perspective distortion, no photorealism, no 3D render look. Do not
  > draw: any text, letters, numbers, labels or logos; people, hands or silhouettes; screens, computers, user interfaces,
  > control panels, PLCs, circuit boards or electronic modules; brand marks; neon, glow, lens flare or light rays. Colours:
  > background #F8FAF7, lines #172127, accent #245D8F, secondary fill #E7ECE8. 1600 x 1200 px.

- **Dark prompt:** the light prompt with its last sentence replaced by: "Colours: background #0F171B, lines #E5EDEB, accent
  #5BA7DF, secondary fill #19262C. 1600 x 1200 px. Keep the composition of the reference image exactly; change only the
  colours."

### G2: the conveyor plant

- **Purpose and section:** the card of the conveyor plant in the Learn section; lesson "Conveyor classification and safe jam".
- **Paths:** `docs/static/img/generated/plant-conveyor-light.png`, `docs/static/img/generated/plant-conveyor-dark.png`
- **Size:** 1600 x 1200 px, 4:3, PNG.
- **Light prompt:**

  > A straight horizontal belt conveyor on a steel frame, with its drive motor at the right end, carrying three small
  > rectangular boxes spaced along the belt; the middle box is metal, drawn with dense parallel lines. Along the belt, in
  > order of travel: a photoelectric sensor on a short post facing the belt, an inductive proximity sensor drawn as a short
  > cylinder pointing down at the belt, a second photoelectric sensor further along, and at the far end a pivoting diverter
  > arm that can push a box into a small side chute. Accent fill: the drive motor and the diverter arm. Accent outline: the
  > two photoelectric sensors and the inductive sensor. Technical line illustration in the manner of a mechanical
  > engineering drawing sheet. One piece of industrial process equipment in a true isometric view (30 degrees), centred, with
  > an empty margin of at least 12 percent of the frame on every side. Thin, even line work of one weight (about 2 px at 1600
  > px wide), hidden edges omitted, light parallel hatching only on cut or shadowed faces. Flat, solid background colour
  > filling the whole frame. One line colour. One accent colour with one meaning: a solid accent fill marks the actuator that
  > the control program drives, and an accent outline marks the sensors that the control program reads; everything else is
  > line colour. An optional secondary flat fill on large faces. No gradients, no shading, no shadows, no glow, no texture,
  > no paper grain, no perspective distortion, no photorealism, no 3D render look. Do not draw: any text, letters, numbers,
  > labels or logos; people, hands or silhouettes; screens, computers, user interfaces, control panels, PLCs, circuit boards
  > or electronic modules; brand marks; neon, glow, lens flare or light rays. Colours: background #F8FAF7, lines #172127,
  > accent #245D8F, secondary fill #E7ECE8. 1600 x 1200 px.

- **Dark prompt:** the light prompt with its last sentence replaced by: "Colours: background #0F171B, lines #E5EDEB, accent
  #5BA7DF, secondary fill #19262C. 1600 x 1200 px. Keep the composition of the reference image exactly; change only the
  colours."

### G3: the motor plant

- **Purpose and section:** the card of the motor plant in the Learn section; lessons "Command, feedback, and speed" and
  "Interlocks and permissives: a guard that stops the motor".
- **Paths:** `docs/static/img/generated/plant-motor-light.png`, `docs/static/img/generated/plant-motor-dark.png`
- **Size:** 1600 x 1200 px, 4:3, PNG.
- **Light prompt:**

  > A foot-mounted industrial electric motor with a finned cylindrical body and a terminal box on top, bolted to a flat base
  > plate. Its shaft runs through a flexible coupling to a short driven shaft that carries a toothed wheel. A proximity
  > sensor, drawn as a short cylinder on a bracket, points at the teeth of the wheel to read the speed. Accent fill: the
  > motor body. Accent outline: the proximity sensor. Technical line illustration in the manner of a mechanical engineering
  > drawing sheet. One piece of industrial process equipment in a true isometric view (30 degrees), centred, with an empty
  > margin of at least 12 percent of the frame on every side. Thin, even line work of one weight (about 2 px at 1600 px
  > wide), hidden edges omitted, light parallel hatching only on cut or shadowed faces. Flat, solid background colour filling
  > the whole frame. One line colour. One accent colour with one meaning: a solid accent fill marks the actuator that the
  > control program drives, and an accent outline marks the sensors that the control program reads; everything else is line
  > colour. An optional secondary flat fill on large faces. No gradients, no shading, no shadows, no glow, no texture, no
  > paper grain, no perspective distortion, no photorealism, no 3D render look. Do not draw: any text, letters, numbers,
  > labels or logos; people, hands or silhouettes; screens, computers, user interfaces, control panels, PLCs, circuit boards
  > or electronic modules; brand marks; neon, glow, lens flare or light rays. Colours: background #F8FAF7, lines #172127,
  > accent #245D8F, secondary fill #E7ECE8. 1600 x 1200 px.

- **Dark prompt:** the light prompt with its last sentence replaced by: "Colours: background #0F171B, lines #E5EDEB, accent
  #5BA7DF, secondary fill #19262C. 1600 x 1200 px. Keep the composition of the reference image exactly; change only the
  colours."

### G4: the pedestrian crossing plant

- **Purpose and section:** the card of the pedestrian crossing plant in the Learn section; lesson "Pedestrian crossing and
  safe states".
- **Paths:** `docs/static/img/generated/plant-crossing-light.png`, `docs/static/img/generated/plant-crossing-dark.png`
- **Size:** 1600 x 1200 px, 4:3, PNG.
- **Light prompt:**

  > A short stretch of two-lane road with a zebra crossing, seen as a small isometric block of ground. On the near kerb
  > stands one pole with a vehicle traffic light of three round lamps stacked vertically, a pedestrian signal head of two
  > plain round lamps below it (no pictograms, no figures in the lamps), and a small push-button box on the pole at hand
  > height. The road is empty: no vehicles. Accent fill: the two lamps of the pedestrian signal head. Accent outline: the
  > push-button box. Technical line illustration in the manner of a mechanical engineering drawing sheet. One piece of
  > industrial process equipment in a true isometric view (30 degrees), centred, with an empty margin of at least 12 percent
  > of the frame on every side. Thin, even line work of one weight (about 2 px at 1600 px wide), hidden edges omitted, light
  > parallel hatching only on cut or shadowed faces. Flat, solid background colour filling the whole frame. One line colour.
  > One accent colour with one meaning: a solid accent fill marks the actuator that the control program drives, and an
  > accent outline marks the sensors that the control program reads; everything else is line colour. An optional secondary
  > flat fill on large faces. No gradients, no shading, no shadows, no glow, no texture, no paper grain, no perspective
  > distortion, no photorealism, no 3D render look. Do not draw: any text, letters, numbers, labels or logos; people, hands
  > or silhouettes; screens, computers, user interfaces, control panels, PLCs, circuit boards or electronic modules; brand
  > marks; neon, glow, lens flare or light rays. Colours: background #F8FAF7, lines #172127, accent #245D8F, secondary fill
  > #E7ECE8. 1600 x 1200 px.

- **Dark prompt:** the light prompt with its last sentence replaced by: "Colours: background #0F171B, lines #E5EDEB, accent
  #5BA7DF, secondary fill #19262C. 1600 x 1200 px. Keep the composition of the reference image exactly; change only the
  colours."

### Checking a generated file before it is committed

Reject and regenerate when a file shows any text or glyph, a person, a screen or electronic board, a gradient or glow, a
second accent colour, a perspective view, or a crop that cuts the equipment. The accent must mark only the elements the
prompt names.

## (b) Real captures

Every capture is taken by `tools/docs/capture-screenshots.ts` from the application at a recorded commit, registered in
`docs/static/img/manifest.json`, and must pass `bun tools/docs/capture-screenshots.ts --check`. Today the tool has two modes:
journey 56 in Electron (needs a display, the native runtime and the built application) for `tutorials/`, and `--editors`
(headless Chromium against the Vite renderer) for `editors/`. Each capture below names the change the tool needs; that change
is phase-2 work in `tools/docs/` and `packages/zplc-ide/scripts/`, outside this writer's surface.

| Id  | Scenario (project, panel, state)                                                                                                                                        | Locales | Size       | How the capture tool would produce it                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Hero. The Blinky example in Ladder Diagram, running in the simulator: rungs with live values, the Watch tab open on `LED_Output`, the truth rail showing Running.       | EN, ES  | 1440 x 900 | Journey 64c ("Ladder Diagram from a new project to a deployed program that is watched") already reaches a watched Ladder program. Add a picture step there (the `ZPLC_DOC_SHOTS` hook journey 56 uses), a list of these pictures beside `PICTURES`, a locale pass, and a `landing/` folder that `check()` lists. The Spanish capture should wait until the truth rail and the example's rung comments are translated in the application. |
| C2  | The tutorial in Spanish: the program open, the simulator running with the output TRUE, the scenario test passed (the Spanish twins of `blink-2`, `blink-4`, `blink-6`). | ES      | 1440 x 900 | Run journey 56 with the interface in Spanish and write `tutorials/blink-<n>-es.png`; `PICTURES` gains a locale and the manifest lists both files. Used by the workflow section (section 3).                                                                                                                                                                                                                                              |
| C3  | Learn: the first lesson open beside the editor with its six stages, after **Check** passed.                                                                             | EN, ES  | 1440 x 900 | Journey 57 (the first lesson from a fresh profile) reaches this state; add a picture step and a `learn/` folder that `check()` lists. Used by the Learn section (section 4).                                                                                                                                                                                                                                                             |
| C4  | Optional: C1 in the dark theme (Commissioning Spine), so that the dark site shows a dark capture.                                                                       | EN, ES  | 1440 x 900 | The same step as C1 with the theme set to dark before the picture. The landing swaps it in under `[data-theme='dark']`. Owner's choice.                                                                                                                                                                                                                                                                                                  |

Until C1 exists, the hero uses the registered `editors/ld-en.png` and `editors/ld-es.png`, which are real but show the editor
before a program runs.
