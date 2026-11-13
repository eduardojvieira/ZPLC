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

  it('VIS-003 a numeric part has a value text and a fill, and a cue other than colour for each state', () => {
    const pot = (value: number, over: Partial<PartView> = {}) =>
      cuesFor(
        view({
          part: 'potentiometer',
          name: 'Pot1',
          state: { value, fraction: value / 100, text: `${value.toFixed(1)} %` },
          signals: { 'Pot1.value': value },
          ...over,
        }),
      );
    const zero = pot(0);
    expect(zero.state).toBe('true'); // 0 is a reading, not FALSE
    expect(zero.value).toEqual({ text: '0.0 %', fraction: 0 });
    expect(pot(40).value).toEqual({ text: '40.0 %', fraction: 0.4 });
    expect(pot(250).value?.fraction).toBe(1); // clamped to the range
    expect(pot(0, { signals: {} }).state).toBe('unknown');
    const states = [pot(40), pot(0, { signals: {} }), pot(0, { state: { forced: true } }), pot(0, { state: { fault: true } })];
    expect(new Set(states.map((s) => s.marker)).size).toBe(3);
    expect(states.map((s) => s.stateKey)).toEqual(['signal.cue.true', 'signal.cue.unknown', 'signal.cue.forced', 'signal.cue.fault']);
  });

  it('VIS-003 a tank is true while it has a reading and shows its level and fill', () => {
    const c = cuesFor(
      view({ part: 'tank', name: 'T1', state: { level: 0.6, fraction: 0.3 }, signals: { 'T1.level': 0, 'T1.flowIn': 0, 'T1.flowOut': 0 } }),
    );
    expect(c.state).toBe('true');
    expect(c.value).toEqual({ text: '0.60 m', fraction: 0.3 });
    // the digital tank reads its level switches: both open is FALSE, one closed is TRUE
    const digital = (low: boolean) =>
      cuesFor(
        view({ part: 'tank', name: 'T1', state: { level: 0.1, fraction: 0.1 }, signals: { 'T1.levelLow': low, 'T1.levelHigh': false } }),
      );
    expect(digital(true).state).toBe('true');
    expect(digital(false).state).toBe('false');
  });

  it('VIS-003 the emergency stop is told by its ok contact, with the outline marker when it is open', () => {
    const estop = (pressed: boolean, ok: boolean) =>
      cuesFor(view({ part: 'emergency-stop', name: 'E1', state: { pressed, ok }, signals: { 'E1.pressed': pressed, 'E1.ok': ok } }));
    expect(estop(false, true).state).toBe('true');
    expect(estop(true, false).state).toBe('false');
    expect(estop(true, false).marker).toBe('outline');
    expect(estop(false, false).state).toBe('false'); // a broken wire reads as pressed
    expect(estop(false, true).marker).not.toBe(estop(true, false).marker);
    expect(estop(false, true).value).toBeUndefined();
  });

  it('VIS-003 the stack light is true when any lamp is lit, and the M1 cues still hold', () => {
    const lamps = (red: boolean, amber: boolean, green: boolean) =>
      cuesFor(view({ part: 'stack-light', name: 'L1', state: { red, amber, green }, signals: { red, amber, green } }));
    expect(lamps(false, false, false).state).toBe('false');
    expect(lamps(false, true, false).state).toBe('true');
    // M1 parts keep their cues and gain no value
    const eye = cuesFor(view({ signals: { 'EyeA.detect': true } }));
    expect(eye.value).toBeUndefined();
    expect(eye.state).toBe('true');
    expect(cuesFor(view({ part: 'belt', name: 'B', signals: { 'B.run': false } })).state).toBe('false');
  });
});
