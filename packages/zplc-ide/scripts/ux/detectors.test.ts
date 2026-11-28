import { describe, expect, test } from 'bun:test';

import { en } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import { detectDefects, detectors, type Catalogs } from './detectors';
import type { ElementMeasure, Measurement } from './measurement';

const catalogs: Catalogs = { en, es };

/** A text of 13 px, black on white, that fits its box: no detector has anything to say about it. */
function element(overrides: Partial<ElementMeasure> = {}): ElementMeasure {
  return {
    name: 'div',
    parent: null,
    rect: { x: 10, y: 10, width: 100, height: 20 },
    scroll: { width: 100, height: 20 },
    client: { width: 100, height: 20 },
    overflowX: 'visible',
    overflowY: 'visible',
    textOverflow: 'clip',
    lineClamp: false,
    text: 'Open project',
    readable: false,
    color: [0, 0, 0, 1],
    background: [255, 255, 255, 1],
    fontSize: 13,
    fontWeight: 400,
    control: false,
    disabled: false,
    focusRing: null,
    blocked: null,
    clip: { x: 0, y: 0, width: 1440, height: 900 },
    modal: false,
    field: null,
    ...overrides,
  };
}

function page(elements: ElementMeasure[], overrides: Partial<Measurement> = {}): Measurement {
  return { viewport: { width: 1440, height: 900 }, locale: 'en', elements, textOutOfBox: [], scene: null, ...overrides };
}

const button = (x: number, y: number, overrides: Partial<ElementMeasure> = {}) =>
  element({ name: `button@${x},${y}`, rect: { x, y, width: 80, height: 24 }, control: true, focusRing: true, text: 'Build', ...overrides });

/** A page of every kind of thing the detectors look at, all of it right. */
const clean = page(
  [
    element({ name: 'h1', text: 'Open project', fontSize: 24, fontWeight: 600, color: [118, 118, 118, 1] }),
    element({ name: 'p', text: 'Hardware', color: [89, 89, 89, 1] }), // the same in both catalogues: not the other language
    element({ name: 'span.ellipsis', overflowX: 'hidden', textOverflow: 'ellipsis', text: 'A name that fits' }),
    element({ name: 'span.long', overflowX: 'hidden', textOverflow: 'ellipsis', scroll: { width: 300, height: 20 }, readable: true }),
    element({ name: 'ul.list', text: '', overflowY: 'auto', scroll: { width: 100, height: 900 } }),
    button(10, 100),
    button(100, 100),
    button(1350, 860),
    // scrolled out of its list: the list's padding box is all that shows of it
    button(-500, 100, { clip: { x: 0, y: 0, width: 300, height: 900 } }),
    element({
      name: 'select',
      text: '',
      control: true,
      focusRing: true,
      rect: { x: 400, y: 100, width: 120, height: 24 },
      client: { width: 120, height: 24 },
      field: { textWidth: 82, paddingLeft: 8, paddingRight: 28, arrow: 20 },
    }),
    button(200, 100, { text: 'Run', focusRing: null }),
    element({ name: 'button.disabled', text: 'Deploy', control: true, disabled: true, color: [180, 180, 180, 1], focusRing: false }),
  ],
  { scene: { canvas: { x: 0, y: 0, width: 800, height: 600 }, bounds: { x: 40, y: 30, width: 700, height: 500 } } },
);

describe('the measured defects of a capture (UXV-004)', () => {
  test('UXV-004 a page with nothing wrong has no defect', () => {
    expect(detectDefects(clean, catalogs)).toEqual([]);
    for (const [name, detect] of Object.entries(detectors))
      expect({ name, defects: detect(clean, catalogs) }).toEqual({ name, defects: [] });
  });

  test('UXV-004 content cut by its container, or spilling out of it, is a defect', () => {
    const cut = page([element({ name: 'span.cut', overflowX: 'hidden', scroll: { width: 160, height: 20 } })]);
    const spill = page([element({ name: 'span.spill', scroll: { width: 100, height: 46 } })]);
    expect(detectors.cutOrSpilling!(cut, catalogs).map((d) => [d.kind, d.where])).toEqual([['clip', 'span.cut']]);
    expect(detectors.cutOrSpilling!(spill, catalogs).map((d) => [d.kind, d.where])).toEqual([['spill', 'span.spill']]);
    // the Welcome heading: a display font whose glyphs reach 2 px past a line box set tighter than the font; nothing shows
    const ink = page([
      element({ name: 'h1', text: 'ZPLC', fontSize: 36, scroll: { width: 639, height: 42 }, client: { width: 639, height: 40 } }),
    ]);
    expect(detectors.cutOrSpilling!(ink, catalogs)).toEqual([]);
    expect(detectors.cutOrSpilling!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 every line textFit finds is a defect of its own kind', () => {
    const found = page([], {
      textOutOfBox: [
        'clip: "Build" in button, cut by div',
        'spill: "Run" runs 12 px out of div',
        'word: "x" breaks',
        'control: "a"',
        'scroll: div',
      ],
    });
    // a field's text is judged by the field detector, from the measures of the field
    expect(detectors.textOutOfBox!(found, catalogs).map((d) => d.kind)).toEqual(['clip', 'spill', 'word', 'scroll']);
    expect(detectors.textOutOfBox!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 text shortened with no way to read the rest is a defect', () => {
    const ellipsis = element({ name: 'span.name', overflowX: 'hidden', textOverflow: 'ellipsis', scroll: { width: 240, height: 20 } });
    const clamp = element({ name: 'p.clamp', overflowY: 'hidden', lineClamp: true, scroll: { width: 100, height: 60 } });
    expect(detectors.truncated!(page([ellipsis, clamp]), catalogs).map((d) => d.where)).toEqual(['span.name', 'p.clamp']);
    expect(detectors.truncated!(page([{ ...ellipsis, readable: true }]), catalogs)).toEqual([]);
    expect(detectors.truncated!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 controls that overlap are a defect, a control inside another is not', () => {
    const overlapping = page([button(10, 100), button(60, 110)]);
    expect(detectors.overlap!(overlapping, catalogs).map((d) => d.where)).toEqual(['button@10,100 / button@60,110']);
    const nested = page([button(10, 100), { ...button(20, 102), parent: 0 }]);
    expect(detectors.overlap!(nested, catalogs)).toEqual([]);
    expect(detectors.overlap!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 controls hidden under a modal are not measured as overlapping, faint, offscreen or without focus', () => {
    // the command palette over the Ladder toolbox: its rows cross the toolbox buttons, which sit behind it
    const row = (y: number) =>
      element({ name: `div[data-command]@${y}`, rect: { x: 450, y, width: 540, height: 36 }, control: true, focusRing: true });
    const hidden = (y: number) =>
      button(350, y, {
        name: `button[data-ld-toolbox-item]@${y}`,
        rect: { x: 350, y, width: 140, height: 60 },
        blocked: 'covered',
        focusRing: false,
        color: [200, 200, 200, 1],
      });
    const modal = page([row(380), row(416), hidden(380), hidden(416), button(1430, 10, { blocked: 'inert' })]);
    for (const name of ['overlap', 'offscreen', 'contrast', 'focus'])
      expect({ name, defects: detectors[name]!(modal, catalogs) }).toEqual({ name, defects: [] });
    // two controls a person sees still overlap
    const seen = page([row(380), { ...button(400, 390), name: 'button.visible' }]);
    expect(detectors.overlap!(seen, catalogs).map((d) => d.where)).toEqual(['div[data-command]@380 / button.visible']);
  });

  test('UXV-004 a control partly or wholly outside the window is a defect', () => {
    const outside = page([button(1400, 100), button(10, 890), button(1500, 100)]);
    expect(detectors.offscreen!(outside, catalogs).map((d) => d.where)).toEqual(['button@1400,100', 'button@10,890', 'button@1500,100']);
    expect(detectors.offscreen!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 a message key on screen is a defect', () => {
    const leaked = page([element({ name: 'h2', text: 'welcome.open.title' }), element({ name: 'p', text: 'Saved main.st' })]);
    expect(detectors.messageKey!(leaked, catalogs).map((d) => [d.where, d.detail])).toEqual([['h2', 'welcome.open.title']]);
    expect(detectors.messageKey!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 a key the catalogue does not have is still a key on screen: translate() returns the bare key', () => {
    const bare = page([
      element({ name: 'h2', text: 'plant.part.bogusKind' }),
      element({ name: 'p', text: 'See learn.state.xyz, then go' }),
    ]);
    expect(detectors.messageKey!(bare, catalogs).map((d) => d.detail)).toEqual(['plant.part.bogusKind', 'learn.state.xyz']);
    const names = page(
      ['src/Main.st', 'Motor.Start', 'main.st', 'scene.json', 'plant.json', 'Version 2.0.1', 'docs.zplc.dev', 'e.g.', 'Blinky.ld'].map(
        (text) => element({ name: 'td', text }),
      ),
    );
    expect(detectors.messageKey!(names, catalogs)).toEqual([]);
  });

  test('UXV-004 a string of the other language on screen is a defect', () => {
    const spanishInEnglish = page([element({ name: 'h2', text: es['welcome.open.title'] })]);
    const englishInSpanish = page([element({ name: 'h2', text: en['welcome.open.title'] })], { locale: 'es' });
    expect(detectors.wrongLanguage!(spanishInEnglish, catalogs).map((d) => d.where)).toEqual(['h2']);
    expect(detectors.wrongLanguage!(englishInSpanish, catalogs).map((d) => d.where)).toEqual(['h2']);
    expect(detectors.wrongLanguage!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 text contrast under 4.5 to 1, or under 3 to 1 for large text, is a defect', () => {
    const grey = element({ name: 'p.faint', color: [150, 150, 150, 1] }); // 2.96:1 on white
    const largeGrey = element({ name: 'h1.faint', color: [150, 150, 150, 1], fontSize: 24 });
    const boldGrey = element({ name: 'b.faint', color: [130, 130, 130, 1], fontSize: 19, fontWeight: 700 }); // 3.9:1, large
    const translucent = element({ name: 'p.fade', color: [0, 0, 0, 0.3] });
    expect(detectors.contrast!(page([grey, largeGrey, boldGrey, translucent]), catalogs).map((d) => d.where)).toEqual([
      'p.faint',
      'h1.faint',
      'p.fade',
    ]);
    expect(detectors.contrast!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 a control that keyboard travel reaches without a visible focus is a defect', () => {
    expect(detectors.focus!(page([button(10, 100, { focusRing: false })]), catalogs).map((d) => d.where)).toEqual(['button@10,100']);
    expect(detectors.focus!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 a scene that its opening camera does not hold whole is a defect', () => {
    const cut = page([], {
      scene: { canvas: { x: 0, y: 0, width: 800, height: 600 }, bounds: { x: -20, y: 30, width: 700, height: 500 } },
    });
    expect(detectors.sceneFraming!(cut, catalogs).map((d) => d.kind)).toEqual(['scene-framing']);
    expect(detectors.sceneFraming!(page([], { scene: 'unmeasured' }), catalogs)).toEqual([]);
    expect(detectors.sceneFraming!(clean, catalogs)).toEqual([]);
  });

  test('UXV-004 overlap compares only what shows: the part a scroller, the window or a modal leaves visible', () => {
    // a toolbox button scrolled under the tab strip: its scroller shows nothing of it where it crosses the strip
    const scrolled = page([button(10, 100), button(20, 110, { clip: { x: 0, y: 130, width: 300, height: 500 } })]);
    expect(detectors.overlap!(scrolled, catalogs)).toEqual([]);
    // two controls below the fold
    expect(detectors.overlap!(page([button(10, 950), button(20, 960)]), catalogs)).toEqual([]);
    // a row of an open modal and a control outside it
    const modal = page([button(10, 100, { modal: true }), button(20, 110)]);
    expect(detectors.overlap!(modal, catalogs)).toEqual([]);
    // two visible controls of the same modal still overlap
    const both = page([button(10, 100, { modal: true }), button(20, 110, { modal: true })]);
    expect(detectors.overlap!(both, catalogs).map((d) => d.where)).toEqual(['button@10,100 / button@20,110']);
  });

  test('UXV-004 a control that its scroller hides is not outside the window', () => {
    const hidden = page([button(1400, 100, { clip: { x: 1000, y: 0, width: 300, height: 900 } })]);
    expect(detectors.offscreen!(hidden, catalogs)).toEqual([]);
  });

  test("UXV-004 a field's text wider than the room its padding and arrow leave is a defect", () => {
    const field = (textWidth: number, overrides: Partial<ElementMeasure> = {}) =>
      element({
        name: 'select',
        text: '',
        control: true,
        rect: { x: 400, y: 100, width: 120, height: 24 },
        client: { width: 120, height: 24 },
        field: { textWidth, paddingLeft: 8, paddingRight: 28, arrow: 20 },
        ...overrides,
      });
    // the right padding holds the arrow: 120 - 8 - max(28, 20) = 84 px of room, 4 px of tolerance
    expect(detectors.fieldText!(page([field(88)]), catalogs)).toEqual([]);
    expect(detectors.fieldText!(page([field(89)]), catalogs).map((d) => [d.kind, d.where])).toEqual([['control', 'select']]);
    // a field its scroller hides is not seen
    expect(detectors.fieldText!(page([field(120, { clip: { x: 0, y: 0, width: 300, height: 900 } })]), catalogs)).toEqual([]);
  });

  test('UXV-004 a spill counts only the part that shows inside the nearest clipper and the window', () => {
    const wide = (x: number, overrides: Partial<ElementMeasure> = {}) =>
      element({
        name: `span@${x}`,
        rect: { x, y: 10, width: 100, height: 20 },
        client: { width: 100, height: 20 },
        scroll: { width: 300, height: 20 },
        ...overrides,
      });
    expect(
      detectors.cutOrSpilling!(page([wide(10, { clip: { x: 0, y: 0, width: 150, height: 900 } })]), catalogs).map((d) => d.kind),
    ).toEqual(['spill']);
    expect(detectors.cutOrSpilling!(page([wide(10, { clip: { x: 0, y: 0, width: 105, height: 900 } })]), catalogs)).toEqual([]);
    expect(detectors.cutOrSpilling!(page([wide(1340)]), catalogs).map((d) => d.kind)).toEqual([]);
    expect(detectors.cutOrSpilling!(page([wide(1300)]), catalogs).map((d) => d.detail)).toEqual([
      '"Open project" spills 40 px past its box',
    ]);
  });
});
