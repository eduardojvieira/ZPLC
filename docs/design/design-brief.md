# Site design brief

The visual direction of the new ZPLC site. The prototype is the landing page (`docs/src/pages/index.js`,
`docs/src/components/LandingPage/`) and the theme tokens (`docs/src/css/custom.css`). Screenshots:
`~/.cache/zplc-site/final/` (landing and four docs pages, stage B).

## Direction

**Reading:** the landing page of an open industrial-automation tool, for controls engineers first, in the language of an
electrical drawing: the notation they read every day, not the look of a code editor. Dials: variance 6, motion 4, density 5.

**Inherited world.** ZPLC's application already has a visual system, `packages/zplc-ide/DESIGN.md` ("Wiring Ledger"): Drawing
Sheet (light) and Commissioning Spine (dark) from the brand inks `#172127` and `#E5EDEB`, cobalt for references, green, amber
and red only for state. The site takes the same tokens. Stage A pushes it further into the audience's world, as the owner
asked ("mas moderno", "algo mas de industria, de electronica, de plc, mas que editor de codigo").

- **Thesis.** The page is drawn in the notation of the trade. Each section uses a form that a controls engineer already reads:
  the HAL as a terminal strip with numbered marker tags on a DIN rail, the distinctive features as rungs of a ladder between
  two power rails, the scan as a timing diagram, the course as a sequential function chart, the release status as a lamp.
  Editor captures are evidence inside a section, never the face of the page. It refuses both category defaults: the dark
  neon hero with glowing gradients, and the code-editor screenshot as the hero.
- **Own world.** Tinted paper and graphite neutrals; 1 px rules; IEC 60617 symbols drawn in line work; square shapes; cobalt
  for actions, links and selection; green only when something conducts or is TRUE; amber only for the prerelease status.
- **Story.** The visitor reads what ZPLC is, sees the idea (logic reaching a terminal) in the hero image, learns what sets it
  apart (portability first, with the 18 functions on a terminal strip), sees the five languages, and finds a real course to
  learn with. The limits are on the first screen.
- **First viewport (1440 x 900).** The hero on the dark material: brand, the primary tagline at up to 68 px across three
  lines, then a two-column row: the action tagline, Download and Get started, and the status lamp on the left (5 of 12
  columns); the generated image H1 on the right (7 of 12 columns), reaching the right gutter.
- **Signature interactions.** The hero image is drawn in from the left once, like a signal travelling a wire. A rung of the
  ladder conducts (its wire and symbols turn the green of a TRUE value) under the pointer or the keyboard focus. The steps of
  the course chart come in as they scroll into view.

## Palette

Tokens in `docs/src/css/custom.css`, the same steps as the application's ramps (`packages/zplc-ide/src/theme/tokens.ts`). The readability pass of 2026-10-23 moved four of them with the application: ink-3, green and amber in light, red in dark; every text pair keeps 5:1 or more. `.zplc-spine` puts a region on the dark tokens in both
modes; the hero is the only such region.

| Token                  | Light (Drawing Sheet) | Dark (Commissioning Spine) | Role                                                   |
| ---------------------- | --------------------- | -------------------------- | ------------------------------------------------------ |
| `--zplc-canvas`        | `#F8FAF7`             | `#0F171B`                  | Page background                                        |
| `--zplc-panel`         | `#FFFFFF`             | `#141E23`                  | Terminal strip, figures, the selected tab              |
| `--zplc-band`          | `#EEF2EF`             | `#19262C`                  | Placeholders, the DIN rail, inline code, hover         |
| `--zplc-rule`          | `#D7DFDA`             | `#34464D`                  | 1 px separators (decorative, never a control boundary) |
| `--zplc-rule-strong`   | `#7D8A86`             | `#6B7D82`                  | Control boundary, terminal marker tags                 |
| `--zplc-ink`           | `#172127`             | `#E5EDEB`                  | Headings, body                                         |
| `--zplc-ink-2`         | `#4C5A59`             | `#B7C4C0`                  | Secondary text, step frames, ladder symbols            |
| `--zplc-ink-3`         | `#566462`             | `#8E9E9A`                  | Tertiary text, power rails, rung wires                 |
| `--zplc-cobalt`        | `#245D8F`             | `#5BA7DF`                  | Links, primary action, selection, the task trace       |
| `--zplc-cobalt-strong` | `#1C4A73`             | `#7DB9E6`                  | Hover and pressed accent                               |
| `--zplc-on-cobalt`     | `#FFFFFF`             | `#0F171B`                  | Text on a cobalt fill                                  |
| `--zplc-green`         | `#146C40`             | `#65C98E`                  | A conducting rung (TRUE), a pass, RUN                  |
| `--zplc-amber`         | `#835300`             | `#E0AE4F`                  | The prerelease lamp and label, warnings                |
| `--zplc-red`           | `#A33838`             | `#F07878`                  | Fault or danger only                                   |

### Contrast (WCAG 2.x)

| Foreground        | Canvas, light | Panel, light | Band, light | Canvas, dark | Panel, dark | Band, dark |
| ----------------- | ------------- | ------------ | ----------- | ------------ | ----------- | ---------- |
| ink               | 15.59         | 16.36        | 14.48       | 15.23        | 14.23       | 13.02      |
| ink-2             | 6.87          | 7.21         | 6.38        | 10.07        | 9.41        | 8.61       |
| ink-3             | 5.89          | 6.19         | 5.47        | 6.48         | 6.06        | 5.54       |
| cobalt            | 6.59          | 6.91         | 6.12        | 6.94         | 6.48        | 5.93       |
| cobalt-strong     | 8.79          | 9.22         | 8.16        | 8.59         | 8.03        | 7.35       |
| green             | 6.16          | 6.46         | 5.72        | 8.89         | 8.31        | 7.60       |
| amber             | 6.25          | 6.56         | 5.80        | 8.92         | 8.34        | 7.63       |
| red               | 6.29          | 6.60         | 5.84        | 6.61         | 6.18        | 5.66       |
| rule-strong (3:1) | 3.42          | 3.59         | 3.18        | 4.21         | 3.94        | 3.60       |

On-cobalt text on the cobalt fill: 6.91 (light) and 6.94 (dark). The hero uses the dark column in both modes.

## Type

- Inter (variable, optical size 14 to 32, weights 400 to 700 only) and JetBrains Mono, served from `docs/static/fonts/` (OFL);
  a local fallback face with Inter's metrics prevents a layout shift while Inter loads. The landing uses mono in the regular
  weight only. The detector flags
  Inter as overused; it stays (owner decision 2026-10-23) because the application bundles it and the site matches it.
- Mono is for identifiers only: function names on the terminal strip, terminal and step numbers, file names, `.zplc`.
- `cv05` everywhere (l, I and 1 differ); tabular numerals in code, tags and steps.

| Step            | Size                | Weight  | Line height  | Tracking           | Use                                              |
| --------------- | ------------------- | ------- | ------------ | ------------------ | ------------------------------------------------ |
| hero heading    | 38 to 68 px (fluid) | 650     | 1.04         | -0.03em            | The tagline                                      |
| section heading | 32 to 52 px (fluid) | 650     | 1.08         | -0.028em           | Section titles                                   |
| block heading   | 24 to 32 px (fluid) | 650     | 1.15         | -0.02em            | "A new microcontroller needs 18 functions"       |
| sub-heading     | 20 to 26 px (fluid) | 600     | 1.3          | -0.015em           | Course, plants                                   |
| rung title      | 20 px               | 600     | 1.3          | -0.01em            | Ladder rungs                                     |
| lead            | 17 to 22 px (fluid) | 400     | 1.45 to 1.55 | 0                  | Under headings                                   |
| body            | 16 px               | 400     | 1.6          | 0                  | Text                                             |
| small           | 14 px               | 400/600 | 1.5          | 0                  | Captions, lists, terminal labels                 |
| label           | 13 px               | 650     | 1.4          | 0.06em, upper case | The status label, the levels of the course chart |

Upper case is used only for the status label and the level labels of the chart, as the application's measured-label rule
allows; never as an eyebrow above a heading.

## Space and grid

- Steps of 4 px; sections 64 to 112 px, the bottom about 10 % larger; container 1280 px with a 16 to 32 px gutter.
- Asymmetric 5:7 splits: hero (copy : image), portability (text : terminal strip), Learn (facts : capture). The ladder and
  the course chart span the container; the languages keep their 256 px tab column.
- Under 997 px every split is one column, the tabs become a row of codes, the course chart becomes a vertical list of steps,
  the plants go two by two. Under 600 px the right power rail and the coils are hidden. No horizontal scroll from 360 px.

## Radius, rules and shadow

- Radius: 2 px controls, 4 px figures and the strip, 1 px terminal tags; square step frames; circles only for the lamp.
- Rules: 1 px between regions; 2 px power rails; 1.5 px rung wires and step links; 3 px transition bars.
- Shadow: none at rest; only transient overlays (menus, search).

## Components

Built at stage A:

- Hero on the dark material: brand, heading, lead, two actions, status lamp, image (placeholder H1 until the file exists).
- Placeholder: a dashed box of the exact aspect ratio with the image id, its path and size; it carries the final alt text.
- Terminal strip: head with `zplc_hal.h`, a slotted DIN rail, one row per group with a label column, numbered marker tags
  1 to 18, the optional network group with dashed tags.
- Ladder: two power rails, one rung per feature with an IEC normally open contact and a coil, the title sitting on the wire.
- Timing diagram: three traces over three scans, labelled, with the caption "not to scale".
- Language tabs (from checkpoint 1).
- Facts list (label and text), course chart (steps with numbers, the initial step double-framed, links and transition bars,
  one row per level), plant cards (image, plant, lesson).

Stage B: architecture SVG, boards by level, limits, download block, footer, docs restyle, 404.

## Motion

- Hero: brand, heading and body rise 12 px into place (680 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 70 ms apart) from their
  visible place: nothing starts hidden, so the first paint shows the content (stage B: the clip reveal of the image and the fade
  were removed after Lighthouse showed them delaying the largest paint).
- Ladder: the wire and symbols of a rung change to green in 200 ms on hover or focus within.
- Course chart: each step rises as it enters the viewport (CSS scroll-driven animation where the browser has it; elsewhere it
  is simply visible).
- Only transform animates; nothing loops or blinks (the status lamp is steady). Under `prefers-reduced-motion: reduce`
  nothing moves; the landing animations are declared only under `no-preference`.

## Images

- The hero is a generated image (H1); the plants are generated (G1 to G4); all in one line-drawing style with the palette's
  hexes (`image-plan.md`). No text, people, product UI, recognisable product or glow.
- Real captures are evidence: one per section at most, none in the hero (languages: the editor of the selected language;
  Learn: capture C3, to be taken).
- Diagrams are built by the page (SVG and HTML) from the tokens, so they follow the colour mode.
- Every image has width and height, alt text in English and Spanish, lazy loading below the fold. WebP from a one-time
  conversion in stage B (owner decision 2026-10-23).
