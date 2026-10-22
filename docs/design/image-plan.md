# Site image plan (stage A)

The images the new site needs: (a) five illustrations that the owner generates with Antigravity and drops at the paths below,
the hero first, and (b) the real captures still to be taken. Diagrams (the scan timing diagram, the course chart, the HAL
terminal strip, and the architecture in phase 2) are drawn by the site in SVG and HTML, never generated. No real board,
controller of a brand, person or product screen is ever generated.

Until a file exists, the page shows a dashed placeholder of its exact size with its id and path.

## The shared style (every prompt below contains it word for word)

> Technical line illustration in the manner of an electrical and mechanical engineering drawing. True isometric view (30
> degrees) of the subject described above, with an empty margin of at least 8 percent of the frame on every side. Thin,
> even line work of one weight (about 2 px at the final width), hidden edges omitted, light parallel hatching only on cut
> or shadowed faces. Schematic symbols are drawn as in IEC 60617, in the same line weight. Flat, solid background colour
> filling the whole frame. One line colour. One accent colour, used only for what the description above names as the
> accent; everything else is line colour. An optional secondary flat fill on large faces. No gradients, no shading, no
> shadows, no glow, no bloom, no texture, no paper grain, no perspective distortion, no photorealism, no 3D render look.
> Do not draw: any text, letters, numbers, labels, logos or markings on any part; people, hands or silhouettes; screens,
> computers or user interfaces; any recognisable commercial product, development board or brand; neon, glow, lens flare
> or light rays.

Light colours (Drawing Sheet): background `#F8FAF7`, lines `#172127`, accent `#245D8F`, secondary fill `#E7ECE8`. Dark colours
(Commissioning Spine): background `#0F171B`, lines `#E5EDEB`, accent `#5BA7DF`, secondary fill `#19262C`.

## (a) Generated images

### H1: the hero, from a ladder rung to an output terminal (generate this one first)

- **Purpose and section:** the first viewport of the landing page. It shows the idea of ZPLC in the visual world of the
  audience: control logic, drawn as a ladder rung, becomes the wire and the signal that reach a terminal of a generic
  controller on a DIN rail. It shows no product UI and no board that ZPLC names.
- **Path:** `docs/static/img/generated/hero-rung-to-terminal.png`
- **Size:** 2400 x 1500 px, 16:10, PNG, sRGB, no transparency. The site shows it at up to about 760 px wide beside the hero
  text, and full width on a phone.
- **Variants:** dark only. The hero sits on the dark material in both colour modes.
- **Prompt:**

  > The inside of an industrial control cabinet. On a horizontal DIN rail fixed to the cabinet back plate sit, from left to
  > right, a short row of feed-through terminal blocks with wire ferrules, and a generic PLC controller module: a plain,
  > unbranded housing with a row of screw terminals along its top edge and another along its bottom edge, and a column of
  > eight small round status lamps on its front. Part of the front cover of the module is cut away to show the circuit board
  > inside: one generic square microcontroller chip, a plain package with pins on four sides and no markings, a few small
  > passive components, and copper traces running from the chip to the terminals. Single wires come down from a slotted
  > cable duct above the rail and land on the input terminals. In the empty space on the left of the frame, drawn flat as if
  > printed on a transparent sheet floating in front of the cabinet, is one rung of a ladder diagram: a vertical power rail at
  > each end, a normally open contact and a coil on the horizontal rung. The wire of that rung continues to the right, enters
  > the cabinet and becomes the wire that lands on one output terminal of the module. Accent: the rung and its wire, the
  > trace from the chip to that output terminal, and the one status lamp of that output, shown lit as a solid accent fill
  > with no glow. Keep the right third of the frame calmer than the left, so that the eye travels from the rung to the
  > module. Technical line illustration in the manner of an electrical and mechanical engineering drawing. True isometric
  > view (30 degrees) of the subject described above, with an empty margin of at least 8 percent of the frame on every side.
  > Thin, even line work of one weight (about 2 px at the final width), hidden edges omitted, light parallel hatching only on
  > cut or shadowed faces. Schematic symbols are drawn as in IEC 60617, in the same line weight. Flat, solid background
  > colour filling the whole frame. One line colour. One accent colour, used only for what the description above names as
  > the accent; everything else is line colour. An optional secondary flat fill on large faces. No gradients, no shading,
  > no shadows, no glow, no bloom, no texture, no paper grain, no perspective distortion, no photorealism, no 3D render
  > look. Do not draw: any text, letters, numbers, labels, logos or markings on any part; people, hands or silhouettes;
  > screens, computers or user interfaces; any recognisable commercial product, development board or brand; neon, glow,
  > lens flare or light rays. Colours: background #0F171B, lines #E5EDEB, accent #5BA7DF, secondary fill #19262C. 2400 x
  > 1500 px.

### G1 to G4: the four plants of the Learn course

The Learn course runs lessons against four simulated plants (`LESSON_PLANTS` in `packages/zplc-ide/src/learn/lessonPackage.ts`;
their signals in `packages/zplc-ide/src/test-engine/index.ts`): a tank, a conveyor, a motor and a pedestrian crossing. Each
illustration sits on the card of its plant in the Learn section, with the lesson it serves. In these four, the accent has one
meaning: a solid accent fill is the actuator the program drives, an accent outline is a sensor the program reads.

- **Size:** 1600 x 1200 px, 4:3, PNG, sRGB, no transparency. The site shows them at up to 300 px wide, four in a row.
- **Variants:** light and dark of the same drawing. Generate the light one first; for the dark one, give the light image as
  the reference and use the dark prompt, so that only the colours change.
- **Dark prompt of each:** its light prompt with the last two sentences replaced by: "Colours: background #0F171B, lines
  #E5EDEB, accent #5BA7DF, secondary fill #19262C. 1600 x 1200 px. Keep the composition of the reference image exactly;
  change only the colours."

#### G1: the tank

- **Section:** Learn, lesson "Tank level, faults, and reset" (signals: pump, level low, level high).
- **Paths:** `docs/static/img/generated/plant-tank-light.png`, `docs/static/img/generated/plant-tank-dark.png`
- **Light prompt:**

  > One vertical cylindrical liquid tank standing on four short legs, about 60 percent full, the liquid surface drawn as a
  > flat ellipse. At its base, a small centrifugal pump with its motor feeds an inlet pipe that rises and enters the tank at
  > the top. An outlet pipe with a hand valve leaves the tank near the bottom. Two float level switches are mounted on the
  > tank wall, drawn as small cylinders on short horizontal stems: one near the bottom and one near the top. Accent: the pump
  > and its motor as a solid accent fill, the two level switches as an accent outline. The subject is centred. Technical
  > line illustration in the manner of an electrical and mechanical engineering drawing. True isometric view (30 degrees)
  > of the subject described above, with an empty margin of at least 8 percent of the frame on every side. Thin, even line
  > work of one weight (about 2 px at the final width), hidden edges omitted, light parallel hatching only on cut or
  > shadowed faces. Schematic symbols are drawn as in IEC 60617, in the same line weight. Flat, solid background colour
  > filling the whole frame. One line colour. One accent colour, used only for what the description above names as the
  > accent; everything else is line colour. An optional secondary flat fill on large faces. No gradients, no shading, no
  > shadows, no glow, no bloom, no texture, no paper grain, no perspective distortion, no photorealism, no 3D render look.
  > Do not draw: any text, letters, numbers, labels, logos or markings on any part; people, hands or silhouettes; screens,
  > computers or user interfaces; any recognisable commercial product, development board or brand; neon, glow, lens flare
  > or light rays. Colours: background #F8FAF7, lines #172127, accent #245D8F, secondary fill #E7ECE8. 1600 x 1200 px.

#### G2: the conveyor

- **Section:** Learn, lesson "Conveyor classification and safe jam" (signals: belt, diverter, part at the classifier, metal
  detected, part at the diverter, jam).
- **Paths:** `docs/static/img/generated/plant-conveyor-light.png`, `docs/static/img/generated/plant-conveyor-dark.png`
- **Light prompt:**

  > One straight horizontal belt conveyor on a steel frame, with its drive motor at the right end, carrying three small
  > rectangular boxes spaced along the belt; the middle box is metal, drawn with dense parallel lines. Along the belt, in the
  > order of travel: a photoelectric sensor on a short post facing the belt, an inductive proximity sensor drawn as a short
  > cylinder pointing down at the belt, a second photoelectric sensor further along, and at the far end a pivoting diverter
  > arm that can push a box into a small side chute. Accent: the drive motor and the diverter arm as a solid accent fill,
  > the two photoelectric sensors and the inductive sensor as an accent outline. The subject is centred. Technical line
  > illustration in the manner of an electrical and mechanical engineering drawing. True isometric view (30 degrees) of the
  > subject described above, with an empty margin of at least 8 percent of the frame on every side. Thin, even line work of
  > one weight (about 2 px at the final width), hidden edges omitted, light parallel hatching only on cut or shadowed faces.
  > Schematic symbols are drawn as in IEC 60617, in the same line weight. Flat, solid background colour filling the whole
  > frame. One line colour. One accent colour, used only for what the description above names as the accent; everything
  > else is line colour. An optional secondary flat fill on large faces. No gradients, no shading, no shadows, no glow, no
  > bloom, no texture, no paper grain, no perspective distortion, no photorealism, no 3D render look. Do not draw: any text,
  > letters, numbers, labels, logos or markings on any part; people, hands or silhouettes; screens, computers or user
  > interfaces; any recognisable commercial product, development board or brand; neon, glow, lens flare or light rays.
  > Colours: background #F8FAF7, lines #172127, accent #245D8F, secondary fill #E7ECE8. 1600 x 1200 px.

#### G3: the motor

- **Section:** Learn, lessons "Command, feedback, and speed" and "Interlocks and permissives: a guard that stops the motor"
  (signals: command, at speed).
- **Paths:** `docs/static/img/generated/plant-motor-light.png`, `docs/static/img/generated/plant-motor-dark.png`
- **Light prompt:**

  > One foot-mounted industrial electric motor with a finned cylindrical body and a terminal box on top, bolted to a flat
  > base plate. Its shaft runs through a flexible coupling to a short driven shaft that carries a toothed wheel. A proximity
  > sensor, drawn as a short cylinder on a bracket, points at the teeth of the wheel. Accent: the motor body as a solid
  > accent fill, the proximity sensor as an accent outline. The subject is centred. Technical line illustration in the
  > manner of an electrical and mechanical engineering drawing. True isometric view (30 degrees) of the subject described
  > above, with an empty margin of at least 8 percent of the frame on every side. Thin, even line work of one weight (about
  > 2 px at the final width), hidden edges omitted, light parallel hatching only on cut or shadowed faces. Schematic symbols
  > are drawn as in IEC 60617, in the same line weight. Flat, solid background colour filling the whole frame. One line
  > colour. One accent colour, used only for what the description above names as the accent; everything else is line
  > colour. An optional secondary flat fill on large faces. No gradients, no shading, no shadows, no glow, no bloom, no
  > texture, no paper grain, no perspective distortion, no photorealism, no 3D render look. Do not draw: any text, letters,
  > numbers, labels, logos or markings on any part; people, hands or silhouettes; screens, computers or user interfaces; any
  > recognisable commercial product, development board or brand; neon, glow, lens flare or light rays. Colours: background
  > #F8FAF7, lines #172127, accent #245D8F, secondary fill #E7ECE8. 1600 x 1200 px.

#### G4: the pedestrian crossing

- **Section:** Learn, lesson "Pedestrian crossing and safe states" (signals: request, walk).
- **Paths:** `docs/static/img/generated/plant-crossing-light.png`, `docs/static/img/generated/plant-crossing-dark.png`
- **Light prompt:**

  > A short stretch of two-lane road with a zebra crossing, seen as a small isometric block of ground. On the near kerb
  > stands one pole with a vehicle traffic light of three round lamps stacked vertically, a pedestrian signal head of two
  > plain round lamps below it, with no pictograms and no figures in the lamps, and a small push-button box on the pole at
  > hand height. The road is empty: no vehicles. Accent: the two lamps of the pedestrian signal head as a solid accent fill,
  > the push-button box as an accent outline. The subject is centred. Technical line illustration in the manner of an
  > electrical and mechanical engineering drawing. True isometric view (30 degrees) of the subject described above, with an
  > empty margin of at least 8 percent of the frame on every side. Thin, even line work of one weight (about 2 px at the
  > final width), hidden edges omitted, light parallel hatching only on cut or shadowed faces. Schematic symbols are drawn as
  > in IEC 60617, in the same line weight. Flat, solid background colour filling the whole frame. One line colour. One
  > accent colour, used only for what the description above names as the accent; everything else is line colour. An
  > optional secondary flat fill on large faces. No gradients, no shading, no shadows, no glow, no bloom, no texture, no
  > paper grain, no perspective distortion, no photorealism, no 3D render look. Do not draw: any text, letters, numbers,
  > labels, logos or markings on any part; people, hands or silhouettes; screens, computers or user interfaces; any
  > recognisable commercial product, development board or brand; neon, glow, lens flare or light rays. Colours: background
  > #F8FAF7, lines #172127, accent #245D8F, secondary fill #E7ECE8. 1600 x 1200 px.

### Not generated, and why

- The portability section shows the HAL as a terminal strip built in HTML from the real function names: a picture would only
  repeat it less precisely.
- No image of a board: every board is at `cross-build`, and a picture would read as support.

### Format, conversion and record

- The owner drops the PNG files at the paths above. Phase 2 converts each once to WebP with a command recorded in
  `docs/static/img/generated/README.md` (no new dependency; owner decision 2026-10-23), serves the WebP with the PNG as
  fallback, and lists for each file what it shows, that it was generated with Antigravity from the prompt in this plan, the
  date and who generated it.
- Reject and regenerate a file that shows any text or glyph, a person, a screen, a recognisable product, a gradient or glow,
  a second accent colour, a perspective view, or a crop that cuts the subject.

## (b) Real captures

Every capture is taken by `tools/docs/capture-screenshots.ts` from the application at a recorded commit, registered in
`docs/static/img/manifest.json`, and must pass `bun tools/docs/capture-screenshots.ts --check`. Today the tool has two modes:
journey 56 in Electron (needs a display, the native runtime and the built application) for `tutorials/`, and `--editors`
(headless Chromium against the Vite renderer) for `editors/`. Each capture below names the change the tool needs; that change
is phase-2 work in `tools/docs/` and `packages/zplc-ide/scripts/`.

| Id  | Scenario (project, panel, state)                                                                   | Locales | Size       | How the capture tool would produce it                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C3  | Learn: the first lesson open beside the editor with its six stages, after **Check** passed.        | EN, ES  | 1440 x 900 | Journey 57 (the first lesson from a fresh profile) reaches this state. Add a picture step there (the `ZPLC_DOC_SHOTS` hook that journey 56 uses), a locale pass, and a `learn/` folder that `check()` lists. |
| C4  | C3 in the dark theme (Commissioning Spine), shown by the landing under `[data-theme='dark']`.      | EN, ES  | 1440 x 900 | The same step as C3 with the theme set to dark before the picture. Owner decision 2026-10-23: dark captures are welcome.                                                                                     |
| C2  | The tutorial in Spanish (the Spanish twins of `blink-2`, `blink-4`, `blink-6`), for the docs page. | ES      | 1440 x 900 | Run journey 56 with the interface in Spanish and write `tutorials/blink-<n>-es.png`; `PICTURES` gains a locale and the manifest lists both files. Not used on the landing page.                              |

C1 of the first plan (a running Ladder program for the hero) is dropped: the hero is now the generated image H1. The five
editor captures (`editors/<language>-<locale>.png`) stay as the evidence of the languages section, one at a time.
