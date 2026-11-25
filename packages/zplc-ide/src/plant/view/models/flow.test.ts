/** The flow control, source and sink models (plan-vis C2; VIS-014): the emitter of belt-to-sensor as the real plant core publishes it. */
import { describe, expect, it } from 'bun:test';
import type { PartView } from '../../contracts';
import { ARM, BLADE, EMITTER, FLOW, PUSHER } from './flow';
import { partModel, pieceExtent } from './index';
import { beltToSensor, bottom, slot } from './models.fixtures';

const plant = beltToSensor();

describe('flow control, source and sink models (VIS-014)', () => {
  it('PRT-009 the flow family draws the emitter, stop blade, pusher and diverter arm', () => {
    expect(Object.keys(FLOW)).toEqual(['emitter', 'stop-blade', 'pusher', 'diverter-arm']);
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

const SURFACE = 0.9; // the belt surface the three parts stand beside, in world y
const Q: PartView['pose']['q'] = [0, 0, 0, 1];
const view = (part: string, size: PartView['pose']['size'], p: PartView['pose']['p'], state: PartView['state']): PartView => ({
  id: part,
  part,
  name: part,
  pose: { id: part, part, kind: 'box', size, p, q: Q },
  state,
  signals: {},
});
/** The stop blade as the plant core publishes it: `f` of its 0.4 s travel, 0 retracted. */
const blade = (f: number) =>
  view('stop-blade', [0.05, 0.3, 0.6], [0, SURFACE + 0.15 - (1 - f) * (0.3 + BLADE.sink), 0], { travelMs: f * BLADE.travelMs, stuck: false });
/** The pusher: its plate has moved `f` of the 0.6 m stroke along +z. */
const pusher = (f: number) => view('pusher', [0.4, 0.25, 0.05], [0, SURFACE + 0.005 + 0.125, f * PUSHER.stroke], { fraction: f });
const arm = (f: number) => view('diverter-arm', [0.8, 0.25, 0.05], [0.4, SURFACE + 0.13, 0], { fraction: f });
const world = (v: PartView, p: { at: readonly number[] }, i: number) => v.pose.p[i]! + p.at[i]!;
const footprint = (v: PartView) => {
  const pieces = partModel(v)!;
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  for (const p of pieces)
    for (const [k, i] of [
      [0, 0],
      [1, 2],
    ] as const) {
      lo[k] = Math.min(lo[k]!, world(v, p, i) - pieceExtent(p)[i]!);
      hi[k] = Math.max(hi[k]!, world(v, p, i) + pieceExtent(p)[i]!);
    }
  return [...lo, ...hi].map((x) => Math.round(x * 1e6) / 1e6);
};

describe('stop blade, pusher and diverter arm models (VIS-014)', () => {
  it('VIS-014 a stop blade is a steel blade on a pneumatic cylinder under the belt, raised or lowered by its height, not its colour', () => {
    const [down, up] = [partModel(blade(0))!, partModel(blade(1))!];
    expect(slot(down, 'blade').role).toBe('steel');
    expect(slot(down, 'cylinder').role).toBe('housing');
    expect(slot(down, 'rod').role).toBe('steel');
    expect(down.filter((p) => p.slot.startsWith('bracket')).every((p) => p.role === 'frame' && p.shape.kind === 'extrusion')).toBe(true);
    // The blade rises by its height and the sink under the belt; the cylinder and its bracket stay where they are in the world.
    expect(world(blade(1), slot(up, 'blade'), 1) - world(blade(0), slot(down, 'blade'), 1)).toBeCloseTo(0.3 + BLADE.sink, 9);
    for (const s of ['cylinder', 'bracket']) expect(world(blade(1), slot(up, s), 1)).toBeCloseTo(world(blade(0), slot(down, s), 1), 9);
    // The rod shows the travel, and the cylinder sits under the belt surface.
    expect(pieceExtent(slot(up, 'rod'))[1] - pieceExtent(slot(down, 'rod'))[1]).toBeCloseTo((0.3 + BLADE.sink) / 2, 9);
    expect(world(blade(0), slot(down, 'cylinder'), 1)).toBeLessThan(SURFACE);
    expect(footprint(blade(1))).toEqual(footprint(blade(0)));
  });

  it('VIS-014 a pusher is a cylinder on a slotted stand with a plate at the rod end that moves by the whole stroke', () => {
    const [back, out] = [partModel(pusher(0))!, partModel(pusher(1))!];
    expect(slot(back, 'plate').role).toBe('painted');
    expect(slot(back, 'cylinder').role).toBe('housing');
    expect(slot(back, 'rod').role).toBe('steel');
    expect(back.some((p) => p.slot.startsWith('leg-') && p.shape.kind === 'extrusion' && p.role === 'frame')).toBe(true);
    // The plate moves the whole stroke in the world; the cylinder does not.
    expect(world(pusher(1), slot(out, 'plate'), 2) - world(pusher(0), slot(back, 'plate'), 2)).toBeCloseTo(PUSHER.stroke, 9);
    expect(world(pusher(1), slot(out, 'cylinder'), 2)).toBeCloseTo(world(pusher(0), slot(back, 'cylinder'), 2), 9);
    expect(pieceExtent(slot(out, 'rod'))[2] - pieceExtent(slot(back, 'rod'))[2]).toBeCloseTo(PUSHER.stroke / 2, 9);
    expect(pieceExtent(slot(back, 'plate'))).toEqual([0.2, 0.125, 0.025]);
    expect(footprint(pusher(0))).toEqual(footprint(pusher(1)));
  });

  it('VIS-014 a diverter arm is a painted arm with a rubber edge on a vertical shaft under a motor housing, turning about its end', () => {
    const pieces = partModel(arm(0))!;
    expect(slot(pieces, 'arm').role).toBe('painted');
    expect(slot(pieces, 'edge').role).toBe('rubber');
    expect(slot(pieces, 'shaft').role).toBe('steel');
    expect(slot(pieces, 'motor').role).toBe('housing');
    expect(world(arm(0), slot(pieces, 'motor'), 1)).toBeGreaterThan(SURFACE + 0.25); // the motor sits above the arm
    // The shaft stands on the arm's pivot (its end, the part position), and the arm ends there too.
    expect(slot(pieces, 'shaft').at[0]).toBeCloseTo(-ARM.length / 2, 9);
    expect(slot(pieces, 'arm').at[0] - pieceExtent(slot(pieces, 'arm'))[0]).toBeCloseTo(-ARM.length / 2, 9);
    // The pose turns the arm; the model is the same in every state, because everything but the arm is round about the shaft.
    expect(partModel(arm(1))).toEqual(pieces);
    expect(footprint(arm(1))).toEqual(footprint(arm(0)));
  });

  it('VIS-014 the three models draw in Low quality and High contrast as in any other state: no piece is hidden or below the floor', () => {
    for (const v of [blade(0), blade(1), pusher(0), pusher(1), arm(0), arm(1)])
      for (const p of partModel(v)!) {
        expect(p.visible).toBe(true);
        expect(world(v, p, 1) - pieceExtent(p)[1]).toBeGreaterThanOrEqual(-1e-9);
      }
  });
});
