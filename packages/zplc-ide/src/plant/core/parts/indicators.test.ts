import { describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { validateScene } from '../scene';
import { indicatorParts } from './indicators';

const def = (id: string) => indicatorParts.find((d) => d.id === id)!;
const part = (id: string, config: ScenePart['config'] = {}): ScenePart => ({
  id: id.replace(/-/g, '_'),
  part: id,
  name: id.replace(/-/g, '_'),
  position: [0, 0, 0],
  rotationYDeg: 0,
  config,
});
const runtime = (p: ScenePart) => def(p.part).runtime(p, () => 0);
const drive = (p: ScenePart, commands: Record<string, boolean | number>) => {
  const rt = runtime(p);
  rt.beforeStep(commands);
  rt.afterStep();
  return rt.views()[0]!;
};

describe('indicator panel parts', () => {
  it('PRT-003 the stack light shows the three commands independently', () => {
    const p = part('stack-light');
    const names = def('stack-light').signals(p);
    expect(names.map((s) => [s.name, s.direction, s.type])).toEqual([
      ['stack_light.red', 'command', 'BOOL'],
      ['stack_light.amber', 'command', 'BOOL'],
      ['stack_light.green', 'command', 'BOOL'],
    ]);
    const v = drive(p, { 'stack_light.red': true, 'stack_light.amber': false, 'stack_light.green': true });
    expect(v.part).toBe('stack-light');
    expect(v.state).toEqual({ red: true, amber: false, green: true });
    expect(v.signals).toEqual({ red: true, amber: false, green: true });
    expect(drive(p, {}).state).toEqual({ red: false, amber: false, green: false });
    expect(runtime(p).sense()).toEqual({});
    expect(runtime(p).facts()).toEqual({});
  });

  it('PRT-004 the numeric display has a REAL and an INT variant with its range as the signal range', () => {
    const real = def('numeric-display').signals(part('numeric-display', { min: 0, max: 50, unit: 'bar' }));
    expect(real).toEqual([{ name: 'numeric_display.value', direction: 'command', type: 'REAL', unit: 'bar', range: { min: 0, max: 50 } }]);
    const int = def('numeric-display').signals(part('numeric-display', { type: 'INT', min: -10, max: 10, unit: 'V' }));
    expect(int[0]).toMatchObject({ type: 'INT', unit: 'V', range: { min: -10, max: 10 } });
    const dflt = def('numeric-display').signals(part('numeric-display'))[0]!;
    expect(dflt).toMatchObject({ type: 'REAL', unit: '%', range: { min: 0, max: 100 } });
  });

  it('PRT-003 the display clamps a value to its range and formats it with its decimals and unit', () => {
    const p = part('numeric-display', { min: 0, max: 200, unit: 'L/s', decimals: 2 });
    const v = drive(p, { 'numeric_display.value': 12.3456 });
    expect(v.part).toBe('numeric-display');
    expect(v.state).toEqual({ value: 12.3456, min: 0, max: 200, fraction: 12.3456 / 200, unit: 'L/s', text: '12.35 L/s' });
    expect(v.signals).toEqual({ value: 12.3456 });
    expect(drive(p, { 'numeric_display.value': 999 }).state).toMatchObject({ value: 200, fraction: 1, text: '200.00 L/s' });
    expect(drive(p, { 'numeric_display.value': -5 }).state).toMatchObject({ value: 0, fraction: 0 });
    const neg = drive(part('numeric-display', { min: -1, max: 1, decimals: 1, unit: 'C' }), { 'numeric_display.value': -0.04 });
    expect(neg.state.text).toBe('0.0 C');
    // a value that is not a number keeps the previous one
    const rt = runtime(p);
    rt.beforeStep({ 'numeric_display.value': 40 });
    rt.beforeStep({});
    expect(rt.views()[0]!.state.value).toBe(40);
  });

  it('PRT-003 the display config honours its limits', () => {
    const cat = createCatalogue(indicatorParts);
    const scene = (config: ScenePart['config']) => ({
      schemaVersion: 1,
      name: 't',
      cameras: [],
      parts: [{ ...part('numeric-display', config), id: 'nd' }],
    });
    expect(validateScene(scene({ decimals: 3, min: -1000, max: 1000 }), cat)).toEqual([]);
    expect(validateScene(scene({ decimals: 4 }), cat)[0]!.path).toBe('parts[0].config.decimals');
    expect(validateScene(scene({ min: -1001 }), cat)[0]!.path).toBe('parts[0].config.min');
    expect(validateScene(scene({ max: 1001 }), cat)[0]!.path).toBe('parts[0].config.max');
    expect(validateScene(scene({ type: 'DINT' }), cat)[0]!.path).toBe('parts[0].config.type');
    expect(validateScene(scene({ unit: 'furlong' }), cat)[0]!.path).toBe('parts[0].config.unit');
  });

  it('PRT-002 English and Spanish names and doc', () => {
    expect(indicatorParts.map((d) => d.id)).toEqual(['stack-light', 'numeric-display']);
    for (const d of indicatorParts) {
      expect(d.family).toBe('panel');
      expect(d.names.en.length).toBeGreaterThan(0);
      expect(d.names.es.length).toBeGreaterThan(0);
      expect(d.doc.en.length).toBeGreaterThan(0);
      expect(d.doc.es.length).toBeGreaterThan(0);
      expect(d.names.es).not.toBe(d.names.en);
    }
  });
});
