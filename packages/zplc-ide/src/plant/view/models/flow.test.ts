/** The flow control, source and sink models (plan-vis C2; VIS-014): the emitter of belt-to-sensor as the real plant core publishes it. */
import { describe, expect, it } from 'bun:test';
import { EMITTER, FLOW } from './flow';
import { partModel, pieceExtent } from './index';
import { beltToSensor, bottom } from './models.fixtures';

const plant = beltToSensor();

describe('flow control, source and sink models (VIS-014)', () => {
  it('PRT-009 the flow family draws the emitter', () => {
    expect(Object.keys(FLOW)).toEqual(['emitter']);
  });

  it('VIS-014 the emitter marks the zone where items appear with four flat corner marks, not a cage', async () => {
    const emitter = (await plant.views()).emitter!;
    const pieces = partModel(emitter)!;
    expect(pieces.length).toBe(8);
    expect(new Set(pieces.map((p) => p.role))).toEqual(new Set(['zone']));
    for (const p of pieces) {
      expect(bottom(p)).toBeGreaterThanOrEqual(0);
      expect(p.at[1] + pieceExtent(p)[1]).toBeLessThanOrEqual(0.005); // lying on the surface the items appear on
      expect(Math.max(Math.abs(p.at[0]), Math.abs(p.at[2])) + 1e-9).toBeGreaterThanOrEqual(EMITTER.size / 2 - EMITTER.mark);
    }
  });
});
