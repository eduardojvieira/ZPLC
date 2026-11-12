import { describe, expect, it } from 'bun:test';
import type { PartView } from '../contracts';
import { cuesFor } from './cues';

const view = (over: Partial<PartView> = {}): PartView => ({
  id: 'eye',
  part: 'sensor',
  name: 'EyeA',
  pose: { id: 'eye', part: 'sensor', kind: 'box', size: [0.1, 0.1, 0.1], p: [1, 0.5, 0], q: [0, 0, 0, 1] },
  state: {},
  signals: { 'EyeA.detect': false },
  ...over,
});

describe('cues', () => {
  it('VIS-003 a detecting sensor shows its beam, a stateWord and a marker that differ from a clear one without relying on colour', () => {
    const on = cuesFor(view({ signals: { 'EyeA.detect': true } }));
    const off = cuesFor(view());
    expect(on.beam?.detecting).toBe(true);
    expect(off.beam?.detecting).toBe(false);
    expect(on.stateWord).toBe('Confirmed TRUE');
    expect(off.stateWord).toBe('FALSE');
    expect(on.marker).not.toBe(off.marker);
    expect(on.beam?.from).toEqual([1, 0.5, 0]);
    expect(on.beam?.to[0]).toBeGreaterThan(1);
  });

  it('VIS-003 every state of the UX-009 vocabulary has its own word and marker', () => {
    const states = [
      cuesFor(view({ signals: { 'EyeA.detect': true } })),
      cuesFor(view()),
      cuesFor(view({ signals: {} })),
      cuesFor(view({ state: { forced: true } })),
      cuesFor(view({ state: { fault: true } })),
    ];
    expect(new Set(states.map((s) => s.stateWord)).size).toBe(5);
    // the plan's marker type has four shapes: fault and forced share one and are told apart by their word
    expect(new Set(states.map((s) => s.marker)).size).toBe(4);
    expect(states.map((s) => s.stateWord)).toEqual(['Confirmed TRUE', 'FALSE', 'Not read yet', 'Forced by the user', 'Fault']);
  });

  it('VIS-003 the signal name of a part is its label', () => {
    expect(cuesFor(view()).label).toBe('EyeA');
    expect(cuesFor(view({ name: 'Belt1', part: 'belt', signals: { 'Belt1.run': true } })).beam).toBeUndefined();
  });

  it('VIS-003 a part that is not a sensor has no beam but still states its state', () => {
    const c = cuesFor(view({ name: 'Belt1', part: 'belt', signals: { 'Belt1.run': true } }));
    expect(c.beam).toBeUndefined();
    expect(c.stateWord).toBe('Confirmed TRUE');
  });
});
