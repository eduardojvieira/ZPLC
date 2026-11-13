import { describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { validateScene } from '../scene';
import { operableParts } from './operable';
import { isOperable } from './panel';

const def = (id: string) => operableParts.find((d) => d.id === id)!;
const mk = (id: string, name: string, config: ScenePart['config'] = {}): ScenePart => ({
  id: name.toLowerCase(),
  part: id,
  name,
  position: [0, 0, 0],
  rotationYDeg: 0,
  config,
});
const make = (id: string, name: string, config: ScenePart['config'] = {}) => {
  const part = mk(id, name, config);
  const rt = def(id).runtime(part, () => 0);
  if (!isOperable(rt)) throw new Error('not operable');
  return rt;
};
const scene = (parts: ScenePart[]) => ({ schemaVersion: 1, name: 't', parts, cameras: [] });

describe('operable panel parts', () => {
  it('VIS-010 a selector contact selects its position and releases the others', () => {
    const sel = make('selector-switch', 'Sel1');
    expect(sel.sense()).toEqual({ 'Sel1.pos0': true, 'Sel1.pos1': false, 'Sel1.pos2': false });
    expect(sel.operate('Sel1.pos2', true)).toBe(true);
    expect(sel.sense()).toEqual({ 'Sel1.pos0': false, 'Sel1.pos1': false, 'Sel1.pos2': true });
    sel.operate('Sel1.pos2', false);
    expect(sel.sense()['Sel1.pos2']).toBe(true);
    expect(sel.operate('Other.pos0', true)).toBe(false);
    expect(sel.views()[0]!.state).toEqual({ position: 2, positions: 3 });
  });

  it('VIS-010 the integer selector takes a position and refuses a position it does not have', () => {
    const sel = make('selector-switch', 'Sel1', { output: 'integer' });
    expect(sel.operate('Sel1.position', 1)).toBe(true);
    expect(sel.sense()).toEqual({ 'Sel1.position': 1 });
    expect(() => sel.operate('Sel1.position', 5)).toThrow('plant: Sel1.position 5 is above the limit 2');
    expect(() => sel.operate('Sel1.position', -1)).toThrow('plant: Sel1.position -1 is below the limit 0');
    expect(() => sel.operate('Sel1.position', 1.5)).toThrow('plant: Sel1.position 1.5 must be an integer');
    expect(sel.sense()).toEqual({ 'Sel1.position': 1 });
  });

  it('VIS-010 the emergency stop latches until it is released', () => {
    const e = make('emergency-stop', 'Estop1');
    expect(e.sense()).toEqual({ 'Estop1.pressed': false, 'Estop1.ok': true });
    expect(e.operate('Estop1.pressed', true)).toBe(true);
    expect(e.sense()).toEqual({ 'Estop1.pressed': true, 'Estop1.ok': false });
    e.beforeStep({});
    e.afterStep();
    expect(e.sense()['Estop1.ok']).toBe(false);
    e.operate('Estop1.pressed', false);
    expect(e.sense()).toEqual({ 'Estop1.pressed': false, 'Estop1.ok': true });
    expect(e.views()[0]!.state).toEqual({ pressed: false, ok: true });
  });

  it('PRT-008 a broken wire reads as a pressed emergency stop', () => {
    const e = make('emergency-stop', 'Estop1');
    e.act('wireBreak');
    expect(e.sense()).toEqual({ 'Estop1.pressed': false, 'Estop1.ok': false });
    expect(() => e.act('nope')).toThrow('has no action "nope"');
  });

  it('VIS-010 the potentiometer holds the value set and refuses one outside its range', () => {
    const p = make('potentiometer', 'Pot1', { initial: 20 });
    expect(p.sense()).toEqual({ 'Pot1.value': 20 });
    expect(p.operate('Pot1.value', 55.5)).toBe(true);
    expect(p.sense()).toEqual({ 'Pot1.value': 55.5 });
    expect(() => p.operate('Pot1.value', 120)).toThrow('plant: Pot1.value 120 is above the limit 100 %');
    expect(() => p.operate('Pot1.value', -1)).toThrow('plant: Pot1.value -1 is below the limit 0 %');
    expect(() => p.operate('Pot1.value', NaN)).toThrow(RangeError);
    expect(p.sense()).toEqual({ 'Pot1.value': 55.5 });
    expect(p.operate('Pot2.value', 1)).toBe(false);
    expect(p.views()[0]!.state).toEqual({ value: 55.5, min: 0, max: 100, fraction: 0.555, unit: '%', text: '55.5 %' });
  });

  it('PRT-004 the selector offers a contact variant and an integer variant', () => {
    const sel = def('selector-switch');
    expect(sel.signals(mk('selector-switch', 'Sel1', { positions: 2 }))).toEqual([
      { name: 'Sel1.pos0', direction: 'sensor', type: 'BOOL' },
      { name: 'Sel1.pos1', direction: 'sensor', type: 'BOOL' },
    ]);
    expect(sel.signals(mk('selector-switch', 'Sel1', { output: 'integer', positions: 4 }))).toEqual([
      { name: 'Sel1.position', direction: 'sensor', type: 'INT', range: { min: 0, max: 3 } },
    ]);
    expect(def('potentiometer').signals(mk('potentiometer', 'Pot1', { min: -10, max: 10, unit: 'V' }))).toEqual([
      { name: 'Pot1.value', direction: 'sensor', type: 'REAL', unit: 'V', range: { min: -10, max: 10 } },
    ]);
  });

  it('PRT-003 the panel parts honour their config limits', () => {
    const cat = createCatalogue([...operableParts]);
    const messages = (p: ScenePart) => validateScene(scene([p]), cat).map((x) => `${x.path}: ${x.message}`);
    expect(messages(mk('selector-switch', 'Sel1', { positions: 5 }))).toEqual([expect.stringContaining('parts[0].config.positions')]);
    expect(messages(mk('potentiometer', 'Pot1', { min: -1001 }))).toEqual([expect.stringContaining('parts[0].config.min')]);
    expect(messages(mk('potentiometer', 'Pot1', { unit: 'furlong' }))).toEqual([expect.stringContaining('parts[0].config.unit')]);
    expect(messages(mk('selector-switch', 'Sel1'))).toEqual([]);
  });

  it('PRT-008 a stuck selector and potentiometer ignore operation', () => {
    const sel = make('selector-switch', 'Sel1');
    sel.act('stuck');
    expect(sel.operate('Sel1.pos1', true)).toBe(true);
    expect(sel.sense()['Sel1.pos0']).toBe(true);
    const p = make('potentiometer', 'Pot1', { initial: 30 });
    p.act('stuck');
    p.operate('Pot1.value', 80);
    expect(p.sense()).toEqual({ 'Pot1.value': 30 });
    expect(() => p.act('nope')).toThrow('has no action "nope"');
  });

  it('PRT-002 each part has English and Spanish names and doc', () => {
    expect(operableParts.map((d) => d.id)).toEqual(['selector-switch', 'emergency-stop', 'potentiometer']);
    for (const d of operableParts) {
      expect(d.family).toBe('panel');
      for (const l of [d.names, d.doc]) {
        expect(l.en.length).toBeGreaterThan(3);
        expect(l.es.length).toBeGreaterThan(3);
        expect(l.es).not.toBe(l.en);
      }
    }
  });
});
