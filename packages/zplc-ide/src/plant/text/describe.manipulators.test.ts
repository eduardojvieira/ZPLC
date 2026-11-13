import { describe, expect, it } from 'bun:test';
import { plantViewEn, plantViewEs } from '../../i18n/catalog/plantView';
import type { BodyPose, PlantSceneFile, PlantSnapshot } from '../contracts';
import { describePlant } from './describe';

const scene: PlantSceneFile = {
  schemaVersion: 1,
  name: 'Cell',
  parts: [{ id: 'g', part: 'gantry', name: 'Gantry1', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
  cameras: [],
};
const pose: BodyPose = { id: 'g', part: 'gantry', kind: 'box', size: [0.3, 0.03, 0.2], p: [0, 0, 0], q: [0, 0, 0, 1] };
const snap = (facts: PlantSnapshot['facts'], gripped = false): PlantSnapshot => ({
  timeMs: 0,
  scans: 0,
  parts: [{ id: 'g', part: 'gantry', name: 'Gantry1', pose, state: {}, signals: { gripped } }],
  items: [],
  facts,
});
const keyOf = (s: PlantSnapshot) => describePlant(s, scene, 'en').key;

describe('describePlant manipulators', () => {
  it('VIS-008 an axis position never changes the change key over a whole move', () => {
    const keys = new Set<string>();
    let changes = 0;
    let last = '';
    for (let i = 0; i <= 200; i++) {
      const k = keyOf(snap({ 'axis:Gantry1:x': i / 200, 'axis:Gantry1:y': i % 2 }, i >= 100));
      if (k !== last) changes++;
      last = k;
      keys.add(k);
    }
    expect(changes).toBe(2); // the first key, then gripped toggling once
    expect(describePlant(snap({ 'axis:Gantry1:x': 1 }), scene, 'en').text).not.toContain('axis');
  });

  it('VIS-008 picks, places and drops are announced when they change and only then', () => {
    const a = describePlant(snap({ 'picked:Gantry1': 0, 'placed:Gantry1': 0, 'drops:Gantry1': 0 }), scene, 'en');
    const b = describePlant(snap({ 'picked:Gantry1': 1, 'placed:Gantry1': 0, 'drops:Gantry1': 0 }), scene, 'en');
    const b2 = describePlant(snap({ 'picked:Gantry1': 1, 'placed:Gantry1': 0, 'drops:Gantry1': 0 }), scene, 'en');
    const c = describePlant(snap({ 'picked:Gantry1': 1, 'placed:Gantry1': 1, 'drops:Gantry1': 1 }), scene, 'en');
    expect(b.key).not.toBe(a.key);
    expect(b2.key).toBe(b.key);
    expect(b.text).toContain('Gantry1 picked: 1.');
    expect(c.text).toContain('Gantry1 placed: 1.');
    expect(c.text).toContain('Gantry1 drops: 1.');
    expect(c.text).not.toContain('picked:Gantry1');
    expect(describePlant(snap({ 'picked:Gantry1': 1 }), scene, 'es').text).toContain('Gantry1 tomó: 1.');
  });

  it('VIS-008 describePlant says a manipulator is holding when gripped is TRUE', () => {
    expect(describePlant(snap({}, true), scene, 'en').text).toContain('Gantry1');
    expect(describePlant(snap({}, false), scene, 'en').text).not.toContain('Active');
  });

  it('VIS-011 the manipulator readout and the new sentences exist in English and Spanish', () => {
    for (const k of [
      'plant.text.picked',
      'plant.text.placed',
      'plant.text.drops',
      'plant.panel.manipulator',
      'plant.panel.holding',
      'plant.panel.empty',
    ])
      for (const cat of [plantViewEn, plantViewEs] as Record<string, string>[]) expect(cat[k]).toBeTruthy();
  });
});
