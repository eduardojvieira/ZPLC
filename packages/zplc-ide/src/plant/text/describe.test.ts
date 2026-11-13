import { describe, expect, it } from 'bun:test';
import { plantViewEn, plantViewEs } from '../../i18n/catalog/plantView';
import type { BodyPose, PlantSceneFile, PlantSnapshot } from '../contracts';
import { describePlant } from './describe';

const scene: PlantSceneFile = {
  schemaVersion: 1,
  name: 'Line',
  parts: [{ id: 's1', part: 'sensor', name: 'S1', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
  cameras: [],
};
const item = (id: string, x: number): BodyPose => ({
  id,
  part: 'box',
  kind: 'item',
  size: [0.3, 0.3, 0.3],
  p: [x, 0.15, 0.2],
  q: [0, 0, 0, 1],
});
const snap = (x: number, delivered: number, blocked = false): PlantSnapshot => ({
  timeMs: x * 1000,
  scans: x * 100,
  parts: [{ id: 's1', part: 'sensor', name: 'S1', pose: item('s1', 0), state: {}, signals: { detect: blocked } }],
  items: [item('a', x)],
  facts: { itemsEmitted: 5, itemsDropped: 0, [`delivered:Out`]: delivered, 'count:S1': 4, 'position:box:0': x },
});

describe('describePlant', () => {
  it('VIS-008 the text names counts and positions in English and Spanish with the same structure', () => {
    const en = describePlant(snap(1.5, 2), scene, 'en');
    const es = describePlant(snap(1.5, 2), scene, 'es');
    expect(en.text).toContain('2');
    expect(en.text).toContain('1.5');
    expect(es.text).toContain('1.5');
    expect(en.text).not.toBe(es.text);
    expect(en.key).toBe(es.key);
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const keys = Object.keys(plantViewEn).filter((k) => k.startsWith('plant.text.'));
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys)
      expect(holes(plantViewEs[k as keyof typeof plantViewEn])).toEqual(holes(plantViewEn[k as keyof typeof plantViewEn]));
    expect(Object.keys(plantViewEs).sort()).toEqual(Object.keys(plantViewEn).sort());
  });

  it('VIS-008 the key changes when an item arrives and not on every scan', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) keys.add(describePlant(snap(i * 0.01, 2), scene, 'en').key);
    expect(keys.size).toBe(1);
    expect(describePlant(snap(0, 3), scene, 'en').key).not.toBe(describePlant(snap(0, 2), scene, 'en').key);
  });

  it('VIS-008 the text names the plan facts: counts per remover and sensor, and no position fact in the key', () => {
    const d = describePlant(snap(1.5, 2), scene, 'en');
    expect(d.text).toContain('Out');
    expect(d.text).toContain('S1: 4 pulses');
    expect(d.text).not.toContain('position:');
    expect(describePlant(snap(0.7, 2), scene, 'en').key).toBe(d.key);
  });

  it('VIS-008 a sensor turning on changes the key and the text names it', () => {
    const on = describePlant(snap(0, 2, true), scene, 'en');
    expect(on.key).not.toBe(describePlant(snap(0, 2), scene, 'en').key);
    expect(on.text).toContain('S1');
  });
});

describe('describePlant tank level', () => {
  const tankScene: PlantSceneFile = { ...scene, parts: [{ ...scene.parts[0]!, id: 't', part: 'tank', name: 'Tank1' }] };
  const at = (fraction: number, spilling = false): PlantSnapshot => ({
    timeMs: 0,
    scans: 0,
    parts: [
      {
        id: 't',
        part: 'tank',
        name: 'Tank1',
        pose: item('t', 0),
        state: { level: fraction, heightM: 1, fraction, spilling },
        signals: { level: fraction },
      },
    ],
    items: [],
    facts: { 'level:Tank1': fraction },
  });

  it('VIS-008 the level is announced on a change of tenth, not on every scan', () => {
    const a = describePlant(at(0.41), tankScene, 'en');
    expect(a.text).toContain('Tank1 level 41 percent');
    expect(describePlant(at(0.42), tankScene, 'en').key).toBe(a.key);
    expect(describePlant(at(0.53), tankScene, 'en').key).not.toBe(a.key);
    expect(describePlant(at(0.41, true), tankScene, 'en').key).not.toBe(a.key);
    expect(describePlant(at(0.41), tankScene, 'es').text).toContain('Nivel de Tank1: 41 por ciento');
    expect(describePlant(at(0.41), tankScene, 'es').key).toBe(a.key);
  });
});

describe('describePlant over the real tank', () => {
  const tankScene = (config: Record<string, number | string>): PlantSceneFile => ({
    schemaVersion: 1,
    name: 't',
    cameras: [],
    parts: [{ id: 'tank', part: 'tank', name: 'Tank1', position: [0, 0, 0], rotationYDeg: 0, config }],
  });
  const fill = async (config: Record<string, number | string>, scans: number) => {
    const { createPlantCore } = await import('../core/plantCore');
    const s = tankScene(config);
    const core = await createPlantCore(s);
    try {
      core.apply({ 'Tank1.fill': 100 });
      const seen: { key: string; band: string }[] = [];
      for (let i = 0; i < scans; i++) {
        core.advance(10);
        const snapshot = core.snapshot();
        const tank = snapshot.parts.find((p) => p.name === 'Tank1')!;
        const band = `${Math.floor((tank.state.fraction as number) * 10 + 1e-9)}:${String(tank.state.spilling)}`;
        seen.push({ key: describePlant(snapshot, s, 'en').key, band });
      }
      return seen;
    } finally {
      core.dispose();
    }
  };
  const changes = (xs: readonly string[]) => xs.filter((x, i) => i > 0 && x !== xs[i - 1]).length;

  it('VIS-008 a filling tank changes the announcement key only when its level crosses a tenth or it starts or stops spilling', async () => {
    const fast = await fill({ variant: 'numeric' }, 400);
    const bandChanges = changes(fast.map((x) => x.band));
    expect(bandChanges).toBeGreaterThan(3);
    expect(changes(fast.map((x) => x.key))).toBe(bandChanges);
    // A slow fill that stays inside the first tenth never changes the key.
    const slow = await fill({ variant: 'numeric', inletMaxLps: 1 }, 300);
    expect(new Set(slow.map((x) => x.band)).size).toBe(1);
    expect(changes(slow.map((x) => x.key))).toBe(0);
  });
});

describe('describePlant support facts', () => {
  const withFacts = (extra: Record<string, number>): PlantSnapshot => {
    const base = snap(1, 2);
    return { ...base, facts: { ...base.facts, ...extra } };
  };
  const zero = { itemsAssembled: 0, 'stacked:pallet:0': 0, 'layers:pallet:0': 0 };

  it('VIS-008 support facts at zero leave the text and the announcement key exactly as without them', () => {
    for (const locale of ['en', 'es'] as const) {
      expect(describePlant(withFacts(zero), scene, locale)).toEqual(describePlant(snap(1, 2), scene, locale));
    }
    expect(describePlant(withFacts(zero), scene, 'en').text).not.toContain('itemsAssembled');
  });

  it('VIS-011 a stacked pallet reads as a sentence in English and Spanish, numbered from 1, never as its raw key', () => {
    const facts = withFacts({ 'stacked:pallet:0': 8, 'layers:pallet:0': 2 });
    expect(describePlant(facts, scene, 'en').text).toContain('Pallet 1: 8 boxes in 2 layers.');
    expect(describePlant(facts, scene, 'es').text).toContain('Tarima 1: 8 cajas en 2 capas.');
    for (const locale of ['en', 'es'] as const) expect(describePlant(facts, scene, locale).text).not.toMatch(/pallet:|layers:/);
    expect(describePlant(facts, scene, 'en').key).not.toBe(describePlant(withFacts(zero), scene, 'en').key);
  });

  it('VIS-011 items assembled reads as a sentence when above 0', () => {
    expect(describePlant(withFacts({ itemsAssembled: 2 }), scene, 'en').text).toContain('Items assembled: 2.');
    expect(describePlant(withFacts({ itemsAssembled: 2 }), scene, 'es').text).toContain('Piezas ensambladas: 2.');
  });
});

describe('describePlant tank facts', () => {
  const tankFacts = (extra: Record<string, number | boolean>): PlantSnapshot => {
    const base = snap(1, 2);
    return { ...base, facts: { ...base.facts, ...extra } };
  };

  it('VIS-011 the high-mark count reads as a sentence in both languages and is silent at 0', () => {
    expect(describePlant(tankFacts({ 'highs:Tank1': 2 }), scene, 'en').text).toContain('Tank1 reached the high mark 2 time(s).');
    expect(describePlant(tankFacts({ 'highs:Tank1': 2 }), scene, 'es').text).toContain('Tank1 llegó a la marca alta 2 vez (veces).');
    for (const locale of ['en', 'es'] as const)
      expect(describePlant(tankFacts({ 'highs:Tank1': 0 }), scene, locale)).toEqual(describePlant(snap(1, 2), scene, locale));
  });

  it('VIS-011 the band fact reads as a sentence in both languages, never as its raw key', () => {
    const inBand = tankFacts({ 'inBand:Tank1': true });
    const out = tankFacts({ 'inBand:Tank1': false });
    expect(describePlant(inBand, scene, 'en').text).toContain('Tank1 level is in its band.');
    expect(describePlant(out, scene, 'en').text).toContain('Tank1 level is out of its band.');
    expect(describePlant(inBand, scene, 'es').text).toContain('El nivel de Tank1 está dentro de su banda.');
    expect(describePlant(out, scene, 'es').text).toContain('El nivel de Tank1 está fuera de su banda.');
    for (const locale of ['en', 'es'] as const) expect(describePlant(inBand, scene, locale).text).not.toMatch(/inBand|highs:/);
    // the key still changes when the tank enters or leaves its band (VIS-008)
    expect(describePlant(inBand, scene, 'en').key).not.toBe(describePlant(out, scene, 'en').key);
  });
});
