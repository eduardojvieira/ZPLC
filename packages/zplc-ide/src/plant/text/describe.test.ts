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
const item = (id: string, x: number): BodyPose => ({ id, part: 'box', kind: 'item', size: [0.3, 0.3, 0.3], p: [x, 0.15, 0.2], q: [0, 0, 0, 1] });
const snap = (x: number, delivered: number, blocked = false): PlantSnapshot => ({
  timeMs: x * 1000,
  scans: x * 100,
  parts: [{ id: 's1', part: 'sensor', name: 'S1', pose: item('s1', 0), state: {}, signals: { detect: blocked } }],
  items: [item('a', x)],
  facts: { delivered, dropped: 0 },
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
    for (const k of keys) expect(holes(plantViewEs[k as keyof typeof plantViewEn])).toEqual(holes(plantViewEn[k as keyof typeof plantViewEn]));
    expect(Object.keys(plantViewEs).sort()).toEqual(Object.keys(plantViewEn).sort());
  });

  it('VIS-008 the key changes when an item arrives and not on every scan', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) keys.add(describePlant(snap(i * 0.01, 2), scene, 'en').key);
    expect(keys.size).toBe(1);
    expect(describePlant(snap(0, 3), scene, 'en').key).not.toBe(describePlant(snap(0, 2), scene, 'en').key);
  });

  it('VIS-008 a sensor turning on changes the key and the text names it', () => {
    const on = describePlant(snap(0, 2, true), scene, 'en');
    expect(on.key).not.toBe(describePlant(snap(0, 2), scene, 'en').key);
    expect(on.text).toContain('S1');
  });
});
