import { describe, expect, it } from 'bun:test';
import { plantViewEn, plantViewEs } from '../../i18n/catalog/plantView';
import type { BodyPose, PlantSceneFile, PlantSnapshot } from '../contracts';
import { describePlant } from './describe';

const scene: PlantSceneFile = {
  schemaVersion: 1,
  name: 'Sorting',
  parts: [{ id: 'w', part: 'scale', name: 'Scale1', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
  cameras: [],
};
const pose = (id: string): BodyPose => ({ id, part: 'box', kind: 'item', size: [0.2, 0.2, 0.2], p: [0, 0.1, 0], q: [0, 0, 0, 1] });
const snap = (facts: PlantSnapshot['facts'], step = 0, detect = false): PlantSnapshot => ({
  timeMs: step * 5,
  scans: step,
  parts: [
    {
      id: 'w',
      part: 'scale',
      name: 'Scale1',
      pose: pose('w'),
      state: { text: `${(step / 7).toFixed(2)} kg, stable`, fraction: step / 700, angle: step * 0.37 },
      signals: { weight: step / 7, detect },
    },
  ],
  items: [pose('a')],
  facts: { ...facts, 'position:box:0': step / 3, 'axis:Chain1': step / 11 },
});

describe('describePlant sorting facts', () => {
  it('VIS-008 sorted and misrouted are told in words, silent at 0, and the change key moves only when a count changes', () => {
    const zero = describePlant(snap({ 'sorted:BinRed': 0, 'misrouted:BinRed': 0, 'delivered:BinRed': 0 }), scene, 'en');
    expect(zero.text).not.toContain('sorted');
    expect(zero.text).not.toContain('misrouted');
    const one = describePlant(snap({ 'sorted:BinRed': 1, 'misrouted:BinRed': 0, 'delivered:BinRed': 1 }), scene, 'en');
    expect(one.text).toContain('BinRed sorted 1 item correctly.');
    expect(one.key).not.toBe(zero.key);
    const two = describePlant(snap({ 'sorted:BinRed': 2, 'misrouted:BinRed': 1, 'delivered:BinRed': 3 }), scene, 'en');
    expect(two.text).toContain('BinRed sorted 2 items correctly.');
    expect(two.text).toContain('BinRed received 1 item that does not belong there.');
    expect(describePlant(snap({ 'sorted:BinRed': 2, 'misrouted:BinRed': 1, 'delivered:BinRed': 3 }, 5), scene, 'en').key).toBe(two.key);
    const es = describePlant(snap({ 'sorted:BinRed': 2, 'misrouted:BinRed': 1, 'delivered:BinRed': 3 }), scene, 'es');
    expect(es.text).toContain('BinRed clasificó 2 elementos correctamente.');
    expect(es.text).toContain('BinRed recibió 1 elemento que no le corresponde.');
    expect(es.key).toBe(two.key);
  });

  it('VIS-008 a reading, an angle and a lift never change the key over a whole run; a sorted item changes it once', () => {
    const keys: string[] = [];
    let sorted = 0;
    for (let step = 0; step < 300; step++) {
      if (step % 100 === 99) sorted += 1;
      keys.push(describePlant(snap({ 'sorted:BinRed': sorted, 'delivered:BinRed': sorted, 'count:Scale1': 0 }, step), scene, 'en').key);
    }
    // three increments in a run of 300 scans: four distinct keys, three changes
    expect(new Set(keys).size).toBe(4);
    expect(keys.filter((k, i) => i > 0 && k !== keys[i - 1])).toHaveLength(3);
  });

  it('VIS-008 every M4 fact family is told or filtered, never as plant.text.fact with a raw key', () => {
    const facts = {
      'sorted:Bin1': 2,
      'misrouted:Bin1': 1,
      'delivered:Bin1': 3,
      'count:Ind1': 4,
      'count:Cap1': 1,
      'count:Col1': 2,
      'count:Arr1': 5,
    };
    const { text } = describePlant(snap(facts), scene, 'en');
    for (const raw of ['sorted:', 'misrouted:', 'count:']) expect(text).not.toContain(raw);
    expect(text).toContain('Ind1: 4 pulses.');
    expect(text).toContain('Arr1: 5 pulses.');
    // continuous readings are not facts of the text at all
    expect(text).not.toContain('axis');
    expect(text).not.toContain('kg');
  });

  it(
    'VIS-011 every new sentence, panel string and action label exists in English and Spanish with the same placeholders and the plural ' +
      'pair',
    () => {
      const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const keys = [
        'plant.text.sorted.one',
        'plant.text.sorted.other',
        'plant.text.misrouted.one',
        'plant.text.misrouted.other',
        'plant.panel.reading',
        'plant.panel.diverter',
        'plant.fault.readingStuck',
        'plant.fault.readingOffset',
        'plant.fault.wrongColour',
        'plant.fault.blind',
        'plant.fault.misread',
        'plant.fault.liftStuck',
        'plant.fault.turnStuck',
      ] as const;
      for (const k of keys) {
        expect(plantViewEn[k].length).toBeGreaterThan(0);
        expect(plantViewEs[k].length).toBeGreaterThan(0);
        expect(holes(plantViewEs[k])).toEqual(holes(plantViewEn[k]));
      }
      expect(plantViewEn['plant.text.sorted.other']).toContain('{count}');
      expect(plantViewEn['plant.text.sorted.one']).not.toBe(plantViewEn['plant.text.sorted.other']);
    },
  );
});
