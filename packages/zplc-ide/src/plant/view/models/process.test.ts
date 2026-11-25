/** The process model (plan-vis C7): the tank with its pipes, valves and instruments, as the real plant core publishes its view. */
import { describe, expect, it } from 'bun:test';
import type { PartView, ScenePart } from '../../contracts';
import { PROCESS } from './process';
import { partModel, pieceExtent } from './index';
import { bottom, shown, slot } from './models.fixtures';

const SIZE: PartView['pose']['size'] = [0.4, 1, 0.25];
const tank = (fraction = 0.5, spilling = false): PartView => ({
  id: 'tank',
  part: 'tank',
  name: 'Tank',
  pose: { id: 'tank', part: 'tank', kind: 'box', size: SIZE, p: [0, SIZE[1] / 2, 0], q: [0, 0, 0, 1] },
  state: { level: fraction * SIZE[1], heightM: SIZE[1], fraction, spilling },
  signals: {},
});
const scenePart = (config: ScenePart['config']): ScenePart => ({
  id: 'tank',
  part: 'tank',
  name: 'Tank',
  position: [0, 0, 0],
  rotationYDeg: 0,
  config,
});
const digital = (view: PartView) => partModel(view, { travel: 0, scenePart: scenePart({ variant: 'digital' }) })!;
const numeric = (view: PartView) => partModel(view, { travel: 0, scenePart: scenePart({ variant: 'numeric' }) })!;
const has = (pieces: readonly { slot: string }[], prefix: string) => pieces.some((p) => p.slot.startsWith(prefix));

describe('process models (VIS-014)', () => {
  it('PRT-009 the process family draws the tank', () => {
    expect(Object.keys(PROCESS)).toEqual(['tank']);
  });

  it('VIS-014 the tank is a steel vessel with a dished cap on four legs, an inlet and an outlet pipe, each with a valve', () => {
    for (const pieces of [digital(tank()), numeric(tank())]) {
      for (const name of ['vessel', 'cap-lower', 'cap-upper', 'inlet-pipe', 'outlet-pipe', 'inlet-valve', 'outlet-valve'])
        expect(pieces.some((p) => p.slot === name)).toBe(true);
      expect(slot(pieces, 'vessel').role).toBe('steel');
      expect(slot(pieces, 'inlet-valve').role).toBe('housing');
      expect(pieces.filter((p) => p.slot.startsWith('leg-')).length).toBe(4);
    }
  });

  it('VIS-014 the legs end in feet on the floor, and the model stays within the pose box plus the pipe stubs', () => {
    const view = tank();
    for (const pieces of [digital(view), numeric(view)]) {
      const feet = pieces.filter((p) => p.slot.startsWith('foot-'));
      expect(feet.length).toBe(4);
      for (const f of feet) expect(bottom(f)).toBeCloseTo(-view.pose.p[1], 9);
      for (const p of pieces) {
        const e = pieceExtent(p);
        expect(Math.abs(p.at[0]) + e[0]).toBeLessThanOrEqual(SIZE[0] / 2 + 0.25);
        expect(Math.abs(p.at[2]) + e[2]).toBeLessThanOrEqual(SIZE[2] / 2 + 1e-9);
        expect(p.at[1] + e[1]).toBeLessThanOrEqual(SIZE[1] / 2 + 1e-9);
      }
    }
  });

  it('VIS-014 the numeric tank has a level transmitter and a flow meter on each pipe, and no level switches', () => {
    const pieces = numeric(tank());
    expect(has(pieces, 'transmitter')).toBe(true);
    expect(slot(pieces, 'inlet-meter').role).toBe('housing');
    expect(slot(pieces, 'outlet-meter').role).toBe('housing');
    expect(pieces.filter((p) => p.slot.endsWith('-meter-head')).map((p) => p.role)).toEqual(['painted', 'painted']);
    expect(has(pieces, 'level-switch')).toBe(false);
    expect(has(pieces, 'inlet-positioner') && has(pieces, 'outlet-positioner')).toBe(true);
    expect(has(pieces, 'inlet-actuator')).toBe(false);
  });

  it('VIS-014 the digital tank has two level switches at the configured heights, and no transmitter or meters', () => {
    const view = tank();
    const pieces = partModel(view, { travel: 0, scenePart: scenePart({ variant: 'digital', lowFraction: 0.3, highFraction: 0.9 }) })!;
    expect(has(pieces, 'transmitter') || has(pieces, 'inlet-meter') || has(pieces, 'outlet-meter')).toBe(false);
    expect(has(pieces, 'inlet-positioner')).toBe(false);
    expect(has(pieces, 'inlet-actuator') && has(pieces, 'outlet-actuator')).toBe(true);
    const [low, high] = [slot(pieces, 'level-switch-low'), slot(pieces, 'level-switch-high')];
    const vessel = slot(pieces, 'vessel');
    const length = vessel.shape.kind === 'cylinder' ? vessel.shape.length : NaN;
    expect(low.role).toBe('housing');
    expect((low.at[1] - bottom(vessel)) / length).toBeCloseTo(0.3, 9);
    expect((high.at[1] - bottom(vessel)) / length).toBeCloseTo(0.9, 9);
  });

  it('VIS-014 the default variant is the catalogue default when the scene part is not known', () => {
    expect(has(partModel(tank())!, 'transmitter')).toBe(true);
  });

  it('VIS-003 the sight glass liquid is as tall as the fraction of the vessel, and hidden when empty', () => {
    for (const build of [digital, numeric]) {
      const vessel = slot(build(tank()), 'vessel');
      const length = vessel.shape.kind === 'cylinder' ? vessel.shape.length : NaN;
      for (const f of [0, 0.5, 1]) {
        const liquid = slot(build(tank(f)), 'sight-liquid');
        const height = liquid.shape.kind === 'box' ? liquid.shape.size[1] : NaN;
        expect(liquid.visible).toBe(f > 0);
        expect(height).toBeCloseTo(Math.max(f * length, 0.001), 3);
        if (f > 0) expect(bottom(liquid)).toBeCloseTo(bottom(vessel), 9);
      }
      expect(shown(build(tank(0.5)), 'sight-rail').length).toBe(2);
    }
  });

  it('VIS-003 the overflow piece is drawn only while the tank spills, in the same slot', () => {
    for (const build of [digital, numeric]) {
      expect(slot(build(tank(1, false)), 'overflow').visible).toBe(false);
      expect(slot(build(tank(1, true)), 'overflow').visible).toBe(true);
    }
  });
});
