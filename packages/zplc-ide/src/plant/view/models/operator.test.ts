/**
 * The operator panel models (plan-vis C4; VIS-014, VIS-016): the push button of belt-to-sensor and the panel parts of the shipped
 * scenes (and a selector switch, which no scene uses yet) as the real plant core publishes them.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import type { PartView, PlantCore, PlantSceneFile } from '../../contracts';
import { createPlantCore } from '../../core/plantCore';
import { modelBounds, partModel, pieceExtent } from './index';
import { beltToSensor, bottom, slot, top } from './models.fixtures';
import { EMERGENCY_STOP, isStand, OPERATOR, PUSH_BUTTON } from './operator';

const plant = beltToSensor();

const cores: PlantCore[] = [];
afterEach(() => cores.splice(0).forEach((core) => core.dispose()));
/** A fresh plant core of `scene`, disposed after the test. */
async function coreOf(scene: PlantSceneFile): Promise<PlantCore> {
  const core = await createPlantCore(scene);
  cores.push(core);
  return core;
}
const viewOf = (core: PlantCore, id: string): PartView => core.snapshot().parts.find((p) => p.id === id)!;
/** A scene of one panel part at `y`, as the editor would place it. */
const lone = (part: string, config: Record<string, number | string> = {}, y = 0.5): PlantSceneFile => ({
  schemaVersion: 1,
  name: 'panel',
  parts: [{ id: 'it', part, name: 'It', position: [0, y, 0], rotationYDeg: 0, config }],
  cameras: [],
});
const twice = (pieces: readonly { at: unknown; shape: unknown; yaw: number }[]) => {
  const keys = pieces.map((p) => JSON.stringify([p.at, p.shape, p.yaw]));
  return keys.filter((k, i) => keys.indexOf(k) !== i);
};
const deg = (rad: number) => (rad * 180) / Math.PI;

describe('operator panel models (VIS-014)', () => {
  it('PRT-009 the operator panel family draws the six operator parts', () => {
    expect(Object.keys(OPERATOR)).toEqual([
      'push-button',
      'selector-switch',
      'emergency-stop',
      'indicator-light',
      'stack-light',
      'potentiometer',
    ]);
  });

  it('VIS-016 the head of a pressed push button travels into its collar', async () => {
    const v = await plant.views();
    const head = (view: PartView) => slot(partModel(view)!, 'head');
    const released = head(v.start!);
    const core = plant.core();
    core.operate('StartButton.pressed', true);
    core.advance(5);
    const pressed = head(core.snapshot().parts.find((p) => p.id === 'start')!);
    expect(released.at[1] - pressed.at[1]).toBeCloseTo(PUSH_BUTTON.released - PUSH_BUTTON.pressed, 9);
    expect(released.at[1] - pressed.at[1]).toBeGreaterThanOrEqual(0.015);
  });

  it('VIS-014 the push button is a control box on a stand: a square column on a base plate bolted to the floor', async () => {
    const start = (await plant.views()).start!;
    const pieces = partModel(start)!;
    const floor = -start.pose.p[1];
    const post = slot(pieces, 'stand-post');
    const base = slot(pieces, 'stand-base');
    expect(post.shape.kind).toBe('box');
    expect(pieceExtent(post)[0]).toBeCloseTo(pieceExtent(post)[2], 9);
    expect(bottom(base)).toBeCloseTo(floor, 9);
    expect(bottom(post)).toBeCloseTo(top(base), 9);
    expect(top(post)).toBeCloseTo(bottom(slot(pieces, 'enclosure')), 9);
    const bolts = pieces.filter((p) => p.slot.startsWith('stand-bolt-'));
    expect(bolts.length).toBe(4);
    for (const b of bolts) expect(bottom(b)).toBeCloseTo(top(base), 9);
    // The stand is the post, the plate and the bolts, nothing of the control itself.
    expect(pieces.filter((p) => isStand(p.slot)).map((p) => p.slot)).toEqual([
      'stand-post',
      'stand-base',
      ...[0, 1, 2, 3].map((k) => `stand-bolt-${k}`),
    ]);
  });

  it('VIS-016 the lever of a selector switch points at the selected position, a quarter turn from end to end', async () => {
    const core = await coreOf(lone('selector-switch', { positions: 3 }));
    const lever = () => slot(partModel(viewOf(core, 'it'))!, 'lever');
    expect(deg(lever().yaw)).toBeCloseTo(45, 9); // position 0: to the left of an operator in front of the box (+z)
    core.operate('It.pos1', true);
    core.advance(5);
    expect(deg(lever().yaw)).toBeCloseTo(0, 9); // straight ahead
    core.operate('It.pos2', true);
    core.advance(5);
    expect(deg(lever().yaw)).toBeCloseTo(-45, 9);
    // The lever stands up from its knob, so it reads from the low first view of a scene, not only from above.
    expect(pieceExtent(lever())[1] * 2).toBeGreaterThanOrEqual(0.035);
  });

  it('VIS-014 a selector switch has one white mark per position around its knob, in the direction of that position', async () => {
    for (const positions of [2, 3, 4]) {
      const pieces = partModel(viewOf(await coreOf(lone('selector-switch', { positions })), 'it'))!;
      const marks = pieces.filter((p) => p.slot.startsWith('detent-'));
      expect(marks.map((m) => m.role)).toEqual(Array(positions).fill('mark'));
      const yaws = marks.map((m) => deg(m.yaw));
      expect(yaws[0]).toBeCloseTo(45, 9);
      expect(yaws.at(-1)!).toBeCloseTo(-45, 9);
      for (const m of marks) expect(Math.atan2(-m.at[0], -m.at[2])).toBeCloseTo(m.yaw, 9);
    }
  });

  it('VIS-016 the emergency stop is modelled; latched, its mushroom head sits lower by its travel, not only another colour', async () => {
    expect(Object.keys(OPERATOR)).toContain('emergency-stop');
    const core = await coreOf(lone('emergency-stop'));
    const pieces = () => partModel(viewOf(core, 'it'))!;
    const up = slot(pieces(), 'head');
    const upBounds = modelBounds(viewOf(core, 'it'))!;
    core.operate('It.pressed', true);
    core.advance(5);
    const down = slot(pieces(), 'head');
    expect(up.at[1] - down.at[1]).toBeCloseTo(EMERGENCY_STOP.travel, 9);
    expect(up.role).toBe(down.role);
    // The footprint of the model does not change with the state.
    const downBounds = modelBounds(viewOf(core, 'it'))!;
    for (const i of [0, 2]) {
      expect(downBounds.min[i]!).toBeCloseTo(upBounds.min[i]!, 9);
      expect(downBounds.max[i]!).toBeCloseTo(upBounds.max[i]!, 9);
    }
  });

  it('VIS-016 a lit indicator light adds a halo behind its lens and lights the lens; unlit it has neither', async () => {
    expect(Object.keys(OPERATOR)).toContain('indicator-light');
    const core = await coreOf(lone('indicator-light'));
    const pieces = () => partModel(viewOf(core, 'it'))!;
    const unlit = pieces();
    expect(unlit.some((p) => p.slot === 'halo')).toBe(false);
    expect(slot(unlit, 'lens').role).toBe('lampOff');
    core.apply({ 'It.lit': true });
    core.advance(5);
    const lit = pieces();
    expect(lit.length).toBe(unlit.length + 1);
    expect(slot(lit, 'halo').role).toBe('lamp');
    expect(slot(lit, 'lens').role).toBe('lamp');
    expect(pieceExtent(slot(lit, 'halo'))[0]).toBeGreaterThan(pieceExtent(slot(lit, 'lens'))[0]);
    expect(twice(lit)).toEqual([]);
  });

  it('VIS-016 a lit stack light segment lights up and grows; one segment per signal, red on top, green at the bottom', async () => {
    const core = await coreOf(lone('stack-light'));
    const pieces = () => partModel(viewOf(core, 'it'))!;
    const off = pieces();
    const segs = ['red', 'amber', 'green'].map((c) => slot(off, `segment-${c}`));
    // Each segment keeps its own colour, lit or not: a dim cover when off, a coloured light when on.
    expect(segs.map((p) => p.role)).toEqual(['signalRedOff', 'signalAmberOff', 'signalGreenOff']);
    expect(segs[0]!.at[1]).toBeGreaterThan(segs[1]!.at[1]);
    expect(segs[1]!.at[1]).toBeGreaterThan(segs[2]!.at[1]);
    const bounds = modelBounds(viewOf(core, 'it'))!;
    for (const c of ['red', 'amber', 'green']) {
      core.apply({ [`It.${c}`]: true });
      core.advance(5);
      const lit = slot(pieces(), `segment-${c}`);
      expect(String(lit.role)).toBe(`signal${c[0]!.toUpperCase()}${c.slice(1)}`);
      expect(pieceExtent(lit)[0]).toBeGreaterThan(pieceExtent(slot(off, `segment-${c}`))[0]);
      const b = modelBounds(viewOf(core, 'it'))!;
      for (const i of [0, 2]) {
        expect(b.min[i]!).toBeCloseTo(bounds.min[i]!, 9);
        expect(b.max[i]!).toBeCloseTo(bounds.max[i]!, 9);
      }
      core.apply({ [`It.${c}`]: false });
      core.advance(5);
    }
  });

  it('VIS-016 the pointer of a potentiometer turns from -135 degrees at the minimum to +135 at the maximum', async () => {
    const core = await coreOf(lone('potentiometer', { min: 0, max: 100 }));
    const pointer = () => slot(partModel(viewOf(core, 'it'))!, 'pointer');
    expect(pointer().role).toBe('mark');
    for (const [value, angle] of [
      [0, -135],
      [50, 0],
      [100, 135],
    ] as const) {
      core.operate('It.value', value);
      core.advance(5);
      expect(deg(pointer().yaw)).toBeCloseTo(angle, 9);
    }
  });
});

describe('numeric display model (VIS-014, F5)', () => {
  const lit = async (config: Record<string, number | string>, value: number): Promise<string[]> => {
    const core = await coreOf(lone('numeric-display', config));
    // The core refuses a value outside the range, so the view is the core's with the value set by hand.
    const view = viewOf(core, 'it');
    const pieces = partModel({ ...view, state: { ...view.state, value } })!;
    return pieces.filter((p) => p.slot.startsWith('d') && p.slot.includes('-')).map((p) => p.slot);
  };
  const range = { type: 'INT', min: 0, max: 100, unit: '%' };

  it('is modelled under its catalogue id, a dark window on a control box', async () => {
    expect(OPERATOR['numeric-display']).toBeDefined();
    const core = await coreOf(lone('numeric-display', range));
    const pieces = partModel(viewOf(core, 'it'))!;
    expect(slot(pieces, 'window').role).toBe('lens');
  });

  it('lights the segments of each digit, right-aligned in as many digits as the range needs', async () => {
    expect((await lit(range, 0)).sort()).toEqual(['d2-a', 'd2-b', 'd2-c', 'd2-d', 'd2-e', 'd2-f']);
    expect((await lit(range, 42)).sort()).toEqual(
      ['d1-f', 'd1-g', 'd1-b', 'd1-c', 'd2-a', 'd2-b', 'd2-g', 'd2-e', 'd2-d'].sort(),
    );
    expect((await lit(range, 100)).sort()).toEqual(
      ['d0-b', 'd0-c', 'd1-a', 'd1-b', 'd1-c', 'd1-d', 'd1-e', 'd1-f', 'd2-a', 'd2-b', 'd2-c', 'd2-d', 'd2-e', 'd2-f'].sort(),
    );
  });

  it('shows dashes on every digit outside the range, and a minus segment for a negative', async () => {
    expect((await lit(range, 500)).sort()).toEqual(['d0-g', 'd1-g', 'd2-g']);
    const signed = { ...range, min: -10, max: 10 };
    expect((await lit(signed, -5)).sort()).toEqual(['d0-g', 'd1-a', 'd1-c', 'd1-d', 'd1-f', 'd1-g'].sort());
  });
});
