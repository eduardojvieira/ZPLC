# Site design brief (checkpoint 1)

The visual direction of the new ZPLC site, for the owner's approval before phase 2. The prototype that applies it is the
landing hero and the five-languages section (`docs/src/pages/index.js`, `docs/src/components/LandingPage/`) and the theme
tokens (`docs/src/css/custom.css`). Screenshots: `~/.cache/zplc-site/prototype/landing-{en,es}-{light,dark}-{1440,390}.png`.

## Direction

**Reading:** the landing page and documentation of an open engineering tool, for controls engineers first, in a restrained
technical-drawing language, built with native CSS on Docusaurus and Infima and the application's own tokens. Dials: variance
4, motion 3, density 5.

**The world is inherited, not invented.** ZPLC already has a visual system: `packages/zplc-ide/DESIGN.md`, "Wiring Ledger",
with Drawing Sheet (light) and Commissioning Spine (dark) built from the brand inks `#172127` and `#E5EDEB`, cobalt for
references, and green, amber and red reserved for state. The site takes the same tokens, so that the site and the screenshots
of the application are one system (one palette, one mark, one naming scheme) and a visitor recognises the product from the
page. The Impeccable direction roll was not run: the brief pins the direction (restraint, the brand inks, a sober sans with a
mono) and the application's design system is an established world, which the skill says to inherit.

- **Thesis.** The page is a drawing sheet of the product: real captures read like a technical drawing, with numbered item
  balloons on the picture and a parts list in the margin, and every claim next to how it is checked. It refuses the category
  default of a dark hero with glowing gradients and a row of icon cards.
- **Own world.** Tinted paper and graphite neutrals, 1 px technical rules between regions, square shapes (2 px controls, 4 px
  figures), cobalt for actions, links, selection and balloons, amber for the prerelease status, no shadow at rest. Inter for
  text, JetBrains Mono for identifiers.
- **Story.** The visitor learns what ZPLC is in one sentence, sees the application at work in a real capture, learns that the
  five languages share one bytecode and how that is checked, and reads the limits before anything else is promised.
- **First viewport (1440 x 900).** Brand lockup, the primary tagline as the heading (three lines at 56 px), the action tagline,
  Download and Get started; the top third of the drawing sheet (capture, balloons, parts list) is visible above the fold.
- **Signature interaction.** On load, the copy rises once and the four balloons are placed on the capture in the order of the
  parts list; nothing moves under reduced motion. The language tabs swap the real capture of each editor.

## Palette

Tokens are CSS custom properties in `docs/src/css/custom.css`; Infima's variables point at them. The ramp values are the
application's (`packages/zplc-ide/src/theme/tokens.ts`), except `band`, `rule-strong` and `cobalt-strong`, which are steps
between two ramp values chosen for the site.

| Token                  | Light (Drawing Sheet) | Dark (Commissioning Spine) | Role                                                         |
| ---------------------- | --------------------- | -------------------------- | ------------------------------------------------------------ |
| `--zplc-canvas`        | `#F8FAF7`             | `#0F171B`                  | Page background                                              |
| `--zplc-panel`         | `#FFFFFF`             | `#141E23`                  | Figures, code, tables, the selected tab                      |
| `--zplc-band`          | `#EEF2EF`             | `#19262C`                  | Footer, table heads, inline code, hover                      |
| `--zplc-rule`          | `#D7DFDA`             | `#34464D`                  | 1 px separators between regions (decorative, not a boundary) |
| `--zplc-rule-strong`   | `#7D8A86`             | `#6B7D82`                  | The boundary of a control (secondary button)                 |
| `--zplc-ink`           | `#172127`             | `#E5EDEB`                  | Headings and body text                                       |
| `--zplc-ink-2`         | `#4C5A59`             | `#B7C4C0`                  | Secondary text, leads, captions                              |
| `--zplc-ink-3`         | `#5F6D6B`             | `#8E9E9A`                  | Tertiary text (provenance, tab codes)                        |
| `--zplc-cobalt`        | `#245D8F`             | `#5BA7DF`                  | The one accent: links, primary action, selection, balloons   |
| `--zplc-cobalt-strong` | `#1C4A73`             | `#7DB9E6`                  | Hover and pressed accent                                     |
| `--zplc-on-cobalt`     | `#FFFFFF`             | `#0F171B`                  | Text on a cobalt fill                                        |
| `--zplc-green`         | `#177344`             | `#65C98E`                  | A pass, RUN, TRUE only                                       |
| `--zplc-amber`         | `#8A5800`             | `#E0AE4F`                  | Warning, forced value, the prerelease status                 |
| `--zplc-red`           | `#A33838`             | `#ED7070`                  | Fault or danger only                                         |

### Contrast (WCAG 2.x ratios, computed from the hex values)

Text needs 4.5:1 (AA); a control boundary or focus indicator needs 3:1.

| Foreground        | On canvas, light | On panel, light | On band, light | On canvas, dark | On panel, dark | On band, dark |
| ----------------- | ---------------- | --------------- | -------------- | --------------- | -------------- | ------------- |
| ink               | 15.59            | 16.36           | 14.48          | 15.23           | 14.23          | 13.02         |
| ink-2             | 6.87             | 7.21            | 6.38           | 10.07           | 9.41           | 8.61          |
| ink-3             | 5.15             | 5.40            | 4.78           | 6.48            | 6.06           | 5.54          |
| cobalt (links)    | 6.59             | 6.91            | 6.12           | 6.94            | 6.48           | 5.93          |
| cobalt-strong     | 8.79             | 9.22            | 8.16           | 8.59            | 8.03           | 7.35          |
| green             | 5.60             | 5.88            | 5.20           | 8.89            | 8.31           | 7.60          |
| amber             | 5.76             | 6.04            | 5.35           | 8.92            | 8.34           | 7.63          |
| red               | 6.29             | 6.60            | 5.84           | 6.17            | 5.77           | 5.28          |
| rule-strong (3:1) | 3.42             | 3.59            | 3.18           | 4.21            | 3.94           | 3.60          |

- On-cobalt text on the cobalt fill: 6.91 (light, white on `#245D8F`), 6.94 (dark, `#0F171B` on `#5BA7DF`); on the hover fill:
  9.22 and 8.59.
- Focus indicator: a 2 px cobalt outline with a 2 px offset, 6.59 (light) and 6.94 (dark) against the canvas.
- `--zplc-rule` (1.29 light, 1.84 dark) only separates regions that also differ by position and spacing; it never carries a
  boundary that a reader must see to use a control.

## Type

- **Families.** Inter (variable, `opsz` 14 to 32, `wght` 100 to 900) for text and headings; JetBrains Mono 400 and 700 for
  code, identifiers, file names and commits. Both are the files the application bundles, served from `docs/static/fonts/` with
  their OFL licences (`LICENSES.md`); no font is loaded from another host. Headings get Inter's display cut automatically
  through the optical-size axis.
- **Features.** `cv05` (the tailed l, so that l, I and 1 differ in names such as `I0.1`) everywhere; tabular numerals and the
  slashed zero in code and tables.
- **Scale.**

| Step              | Size                | Weight  | Line height | Tracking               | Use                          |
| ----------------- | ------------------- | ------- | ----------- | ---------------------- | ---------------------------- |
| `--zplc-text-3xl` | 34 to 56 px (fluid) | 600     | 1.08        | -0.022em               | The hero heading             |
| `--zplc-text-2xl` | 28 to 40 px (fluid) | 600     | 1.15        | -0.018em               | Section headings             |
| `--zplc-text-xl`  | 22 px               | 600     | 1.3         | -0.01em                | Sub-headings (phase 2)       |
| `--zplc-text-lg`  | 17 to 20 px (fluid) | 400     | 1.5         | 0                      | Leads under a heading        |
| `--zplc-text-md`  | 16 px               | 400     | 1.6         | 0                      | Body, docs pages             |
| `--zplc-text-sm`  | 14 px               | 400/500 | 1.5         | 0                      | Captions, navigation, tables |
| `--zplc-text-xs`  | 13 px               | 400/650 | 1.4         | 0.06em when upper case | Provenance, the status label |

- Docs pages: h1 36 px, h2 26 px with a 1 px rule above it, h3 20 px. Paragraphs and lists stop at 70 characters.
- Upper case appears once per page, on the prerelease label, as the application's measured-label rule allows. No eyebrow
  above a heading.

## Space and grid

- Steps of 4 px: 4, 8, 12, 16, 24, 32, 48, 64. Section padding is fluid, 64 to 112 px, with the bottom about 10 % larger than
  the top.
- Container: 1280 px of content with a fluid gutter of 16 to 32 px; at 1440 px the page has 80 px margins.
- The hero copy is one column up to 992 px; the drawing sheet spans the container: capture plus a 288 px parts-list margin.
  The languages section uses a 256 px tab column and the capture beside it; the evidence row repeats that column split (label
  column and value column, the application's Inspector layout).
- Under 997 px every grid is one column: the parts list goes under the capture, the tabs become a row of language codes (the
  full name stays the accessible name). No horizontal scroll from 360 px up.

## Radius and shadow

- Radius: 2 px on controls (buttons, tabs, inline code), 4 px on figures, admonitions and the pagination cards; 0 on regions
  and bands. Circles only for the numbered balloons.
- Shadow: none at rest. Only transient overlays (dropdown menus, the search panel) carry a soft, ink-tinted shadow
  (`--ifm-global-shadow-md`, `-tl`). Depth comes from canvas, panel and band, and from the 1 px rules.

## Components

Built in phase 1:

- Navbar: one line, 60 px, a bottom rule; the active item is underlined in cobalt.
- Primary action (cobalt fill) and secondary action (panel with a strong rule); 44 px tall; pressed moves 1 px.
- Drawing sheet: a real capture with absolutely placed numbered balloons, a parts list with the same numbers, and the commit the
  capture comes from (read from `docs/static/img/manifest.json`).
- Status line: an amber upper-case label and one sentence with a link.
- Language tabs: the ARIA tabs pattern (arrows on both axes, Home, End, roving focus), one panel per language with the
  registered capture of the reader's language, a caption and a reference link.
- Evidence row: a label column and a value column.
- Docs theme: tokens, rules above h2, 1 px admonition frames tinted by state (never a thick side stripe), code blocks on the
  panel colour with the One Light and One Dark themes, tables with a band head.

Phase 2: the workflow section (three captures in sequence), the Learn section with the plant illustrations, the architecture
diagram (hand-built SVG), the board table generated from the manifest, the communication list, the limits block, the closing
download block, the footer, the docs sidebar and the 404 page.

## Motion

- One authored moment: on load, the hero copy rises 8 px and fades in (640 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 60 ms apart),
  then the balloons are placed in list order (420 ms each, 110 ms apart). A newly shown tab panel settles in 240 ms.
- Hover and press: colour transitions of 150 ms; a 1 px press on buttons.
- Everything is visible without the animation. Under `prefers-reduced-motion: reduce`, no animation or transition runs (a
  global rule in `custom.css`), and the landing animations are declared only under `no-preference`.
- Only `transform` and `opacity` animate. No scroll-linked effect, no parallax, no autoplaying video.

## Images

- **Screenshots are real.** Only captures registered in `docs/static/img/manifest.json` and produced by
  `tools/docs/capture-screenshots.ts`. The landing shows the capture of the visitor's language. A capture is never cropped into a
  fake detail, retouched or recoloured; balloons sit over it, outside its pixels.
- **Generated images show ideas only:** the four simulated plants of the Learn course, in one line-drawing style
  (`docs/design/image-plan.md`). No product UI, no boards or controllers, no people, no text, no neon or glow.
- **Diagrams are hand-built SVG** (the architecture), drawn with the tokens, so they follow the theme.
- Every image has its width and height, alt text in English and Spanish, `loading="lazy"` below the fold and
  `fetchpriority="high"` on the hero capture. Phase 2 serves WebP or AVIF with the PNG as fallback (see the open decision in
  `image-plan.md`).

## Open for the owner

1. **Typeface.** The Impeccable detector flags Inter as an overused face. It is kept on purpose: the brief names Inter with
   JetBrains Mono, the application bundles both (`packages/zplc-ide/src/assets/fonts/FONTS.md`), and the site then matches
   its own screenshots. A display face with more character for headings only is possible in phase 2 if you want one.
2. **Default colour mode.** The site follows the system preference and falls back to light (Drawing Sheet). The captures are
   light; dark-theme captures are an optional item of the image plan.
3. **Hero capture.** The Ladder Diagram editor with Blinky, not running. Capture C1 of the image plan (Ladder running in the
   simulator, live values, EN and ES) would replace it.
