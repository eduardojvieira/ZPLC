/** The operator panel models (plan-vis C4; VIS-014, VIS-016): the push button of belt-to-sensor as the real plant core publishes it. */
import { describe, expect, it } from 'bun:test';
import type { PartView } from '../../contracts';
import { partModel, pieceExtent } from './index';
import { beltToSensor, bottom, slot } from './models.fixtures';
import { OPERATOR, PUSH_BUTTON } from './operator';

const plant = beltToSensor();

describe('operator panel models (VIS-014)', () => {
  it('PRT-009 the operator panel family draws the push button', () => {
    expect(Object.keys(OPERATOR)).toEqual(['push-button']);
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

  it('VIS-014 the push button is a control box on a pedestal: a square column on a base plate bolted to the floor', async () => {
    const start = (await plant.views()).start!;
    const pieces = partModel(start)!;
    const floor = -start.pose.p[1];
    const post = slot(pieces, 'post');
    const base = slot(pieces, 'base');
    expect(post.shape.kind).toBe('box');
    expect(pieceExtent(post)[0]).toBeCloseTo(pieceExtent(post)[2], 9);
    expect(bottom(base)).toBeCloseTo(floor, 9);
    expect(bottom(post)).toBeCloseTo(base.at[1] + pieceExtent(base)[1], 9);
    expect(post.at[1] + pieceExtent(post)[1]).toBeCloseTo(bottom(slot(pieces, 'enclosure')), 9);
    const bolts = pieces.filter((p) => p.slot.startsWith('bolt-'));
    expect(bolts.length).toBe(4);
    for (const b of bolts) expect(bottom(b)).toBeCloseTo(base.at[1] + pieceExtent(base)[1], 9);
  });
});
