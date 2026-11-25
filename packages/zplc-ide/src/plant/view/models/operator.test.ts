/**
 * The operator panel models (plan-vis C4; VIS-014, VIS-016): the push button of belt-to-sensor and the panel parts of the shipped
 * scenes (and a selector switch, which no scene uses yet) as the real plant core publishes them.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import type { PartView, PlantCore, PlantSceneFile } from '../../contracts';
import { createPlantCore } from '../../core/plantCore';
import { partModel, pieceExtent } from './index';
import { beltToSensor, bottom, slot, top } from './models.fixtures';
import { isStand, OPERATOR, PUSH_BUTTON } from './operator';

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
const deg = (rad: number) => (rad * 180) / Math.PI;

describe('operator panel models (VIS-014)', () => {
  it('PRT-009 the operator panel family draws the push button and the selector switch', () => {
    expect(Object.keys(OPERATOR)).toEqual(['push-button', 'selector-switch']);
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
});
