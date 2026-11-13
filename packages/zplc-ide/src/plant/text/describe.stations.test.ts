import { describe, expect, it } from 'bun:test';
import { plantViewEn, plantViewEs } from '../../i18n/catalog/plantView';
import type { PlantSceneFile, PlantSnapshot } from '../contracts';
import { describePlant } from './describe';

const scene: PlantSceneFile = { schemaVersion: 1, name: 'Warehouse', parts: [], cameras: [] };
const snap = (facts: PlantSnapshot['facts']): PlantSnapshot => ({ timeMs: 0, scans: 0, parts: [], items: [], facts });
const KEYS = ['stored', 'produced', 'misfires', 'blocked', 'crateLoaded'] as const;

describe('describePlant M5 station facts', () => {
  it(
    'VIS-008 stored, produced, misfires, blocked and the crate load are told in words, silent at 0, and the key moves only on a ' + 'count',
    () => {
      const quiet = describePlant(
        snap({ 'stored:Crane1': 0, 'blocked:Crane1': 0, 'produced:Mill1': 0, 'misfires:Mill1': 0, 'loaded:crate:0': 0 }),
        scene,
        'en',
      );
      expect(quiet.text).toBe('Warehouse: 0 items on the plant.');
      const told = describePlant(
        snap({ 'stored:Crane1': 1, 'blocked:Crane1': 2, 'produced:Mill1': 1, 'misfires:Mill1': 3, 'loaded:crate:1': 2 }),
        scene,
        'en',
      );
      expect(told.text).toBe(
        'Warehouse: 0 items on the plant. Crane1 holds 1 box in the rack. Crane1 refused 2 move requests. Mill1 finished 1 part. ' +
          'Mill1 refused 3 starts. Crate 2 holds 2 items.',
      );
      expect(told.text).not.toContain('stored:');
      expect(describePlant(snap({ 'stored:Crane1': 2 }), scene, 'es').text).toContain('Crane1 guarda 2 cajas en el estante.');
      expect(describePlant(snap({ 'loaded:crate:0': 1 }), scene, 'es').text).toContain('El cajón 1 contiene 1 elemento.');
      expect(describePlant(snap({ 'stored:Crane1': 2 }), scene, 'en').key).not.toBe(
        describePlant(snap({ 'stored:Crane1': 3 }), scene, 'en').key,
      );
      expect(describePlant(snap({ 'stored:Crane1': 2 }), scene, 'en').key).toBe(
        describePlant(snap({ 'stored:Crane1': 2 }), scene, 'es').key,
      );
    },
  );

  it('VIS-008 a cell boolean, a lift position and a crane axis never change the key over a whole run', () => {
    const at = (i: number) =>
      snap({
        'stored:Crane1': 1,
        'axis:Lift1:y': i / 7,
        'axis:Crane1:x': i / 3,
        'axis:Crane1:y': i / 5,
        'axis:Crane1:z': i / 11,
        'cell:Crane1:1:1': i % 2 === 0,
        'cell:Crane1:2:1': i % 3 === 0,
      });
    const first = describePlant(at(0), scene, 'en');
    for (let i = 1; i < 60; i += 1) {
      const next = describePlant(at(i), scene, 'en');
      expect(next.key).toBe(first.key);
      expect(next.text).toBe(first.text);
    }
    expect(first.text).not.toMatch(/cell|axis/);
  });

  it('VIS-008 a table test: every fact family of M5 is told or filtered, never as plant.text.fact with a raw key', () => {
    const FAMILIES = [
      'stored:Crane1',
      'blocked:Crane1',
      'produced:Mill1',
      'misfires:Mill1',
      'loaded:crate:0',
      'cell:Crane1:1:1',
      'axis:Lift1:y',
    ];
    for (const locale of ['en', 'es'] as const)
      for (const k of FAMILIES) {
        const text = describePlant(snap({ [k]: k.startsWith('cell:') ? true : k.startsWith('axis:') ? 1 : 4 }), scene, locale).text;
        expect(text).not.toContain(k);
      }
  });

  it('VIS-011 every new sentence exists in English and Spanish with the same placeholders and the plural pairs', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of KEYS)
      for (const form of ['one', 'other']) {
        const key = `plant.text.${k}.${form}` as keyof typeof plantViewEn;
        expect(plantViewEn[key]).toBeTruthy();
        expect(plantViewEs[key]).toBeTruthy();
        expect(placeholders(plantViewEs[key])).toEqual(placeholders(plantViewEn[key]));
        expect(plantViewEn[key]).toContain('{count}');
      }
    for (const key of ['forkStuck', 'loadedStuckOff', 'beltStall', 'levelStuckOff', 'doorStuck', 'cycleSlow', 'readyStuckOff'])
      expect(plantViewEs[`plant.fault.${key}` as keyof typeof plantViewEs]).not.toBe(
        plantViewEn[`plant.fault.${key}` as keyof typeof plantViewEn],
      );
  });

  it('VIS-008 the previous facts of the sorting and support parts are told as before', () => {
    const text = describePlant(
      snap({ 'sorted:Chain1': 2, 'misrouted:Chain1': 1, 'delivered:Out1': 3, 'highs:Tank1': 0 }),
      scene,
      'en',
    ).text;
    expect(text).toContain('Chain1 sorted 2 items correctly.');
    expect(text).toContain('Chain1 received 1 item that does not belong there.');
    expect(text).toContain('Delivered at Out1: 3.');
    expect(text).not.toContain('Tank1');
  });
});
