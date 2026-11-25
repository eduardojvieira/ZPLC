/**
 * The manipulator models (plan-vis C5; VIS-014, VIS-016): the two-axis pick and place and the three-axis gantry as the real plant core
 * publishes them. A part view is posed at the head, so the frame is checked in the world, where it must not move.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import type { PartView, PlantCore, PlantSceneFile, Vec3 } from '../../contracts';
import { createPlantCore } from '../../core/plantCore';
import { partModel, pieceExtent } from './index';
import { MANIPULATORS } from './manipulators';
import { bottom, slot } from './models.fixtures';
import type { Piece } from './shared';

const cores: PlantCore[] = [];
afterEach(() => cores.splice(0).forEach((core) => core.dispose()));

/** The view of a lone manipulator of kind `part` with its axes at rest, as the real core publishes it. */
async function rest(part: string): Promise<PartView> {
  const scene: PlantSceneFile = {
    schemaVersion: 1,
    name: 'manipulator',
    parts: [{ id: 'it', part, name: 'It', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
    cameras: [],
  };
  const core = await createPlantCore(scene);
  cores.push(core);
  return core.snapshot().parts.find((p) => p.id === 'it')!;
}

/** The same view with its axes at x, y, z metres: the pose follows the head, as the core's does. */
const moved = (view: PartView, [x, y, z]: Vec3): PartView => ({
  ...view,
  pose: { ...view.pose, p: [view.pose.p[0] + x, view.pose.p[1] + y, view.pose.p[2] + z] },
  state: { ...view.state, x, y, z },
});
/** The centre of a piece in the world (the part is not turned). */
const world = (view: PartView, p: Piece): Vec3 => [p.at[0] + view.pose.p[0], p.at[1] + view.pose.p[1], p.at[2] + view.pose.p[2]];
/** The box that holds every piece, in the world. */
function hull(view: PartView, pieces: readonly Piece[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pieces) {
    const c = world(view, p);
    const e = pieceExtent(p);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, c[i]! - e[i]!);
      max[i] = Math.max(max[i]!, c[i]! + e[i]!);
    }
  }
  return { min, max };
}
const model = (view: PartView): Piece[] => partModel(view)!;

describe('manipulator models (VIS-014)', () => {
  it('PRT-009 the manipulator family draws the pick and place and the gantry', () => {
    expect(Object.keys(MANIPULATORS)).toContain('pick-place');
    expect(Object.keys(MANIPULATORS)).toContain('gantry');
  });

  it('VIS-014 a pick and place is a beam on two columns with levelling feet, a carriage, a slide and a head', async () => {
    const view = await rest('pick-place');
    const pieces = model(view);
    expect(['beam', 'leg-a', 'leg-b', 'carriage', 'slide', 'head'].map((s) => slot(pieces, s).role)).toEqual([
      'frame',
      'frame',
      'frame',
      'housing',
      'frame',
      'steel',
    ]);
    expect(pieces.filter((p) => p.slot.startsWith('foot-')).length).toBe(2);
    for (const foot of pieces.filter((p) => p.slot.startsWith('foot-'))) expect(bottom(foot) + view.pose.p[1]).toBeCloseTo(0, 9);
    expect(slot(pieces, 'beam').shape.kind).toBe('extrusion');
    expect(pieceExtent(slot(pieces, 'head'))[0]).toBeGreaterThan(0.05);
  });

  it('VIS-014 the x axis moves the carriage, the slide and the head along the beam, and the frame stays', async () => {
    const view = await rest('pick-place');
    const a = model(view);
    const b = model(moved(view, [0.5, 0, 0]));
    const wa = (s: string) => world(view, slot(a, s));
    const wb = (s: string) => world(moved(view, [0.5, 0, 0]), slot(b, s));
    for (const s of ['carriage', 'slide', 'head']) expect(wb(s)[0] - wa(s)[0]).toBeCloseTo(0.5, 9);
    for (const s of ['beam', 'leg-a', 'leg-b', 'foot-a', 'foot-b']) expect(wb(s)).toEqual(wa(s));
  });

  it('VIS-014 the y axis lifts the head, and the slide always reaches from the carriage to the head', async () => {
    const view = await rest('pick-place');
    const low = moved(view, [0, 0, 0]);
    const up = moved(view, [0, 0.4, 0]);
    expect(world(up, slot(model(up), 'head'))[1] - world(low, slot(model(low), 'head'))[1]).toBeCloseTo(0.4, 9);
    for (const v of [low, up]) {
      const pieces = model(v);
      const slide = slot(pieces, 'slide');
      const carriage = slot(pieces, 'carriage');
      const head = slot(pieces, 'head');
      expect(slide.at[1] + pieceExtent(slide)[1]).toBeCloseTo(carriage.at[1], 9); // the slide runs up into the carriage
      expect(slide.at[1] - pieceExtent(slide)[1]).toBeCloseTo(head.at[1] + pieceExtent(head)[1], 9); // and ends on the head
    }
  });

  it('VIS-014 the footprint of a pick and place is the same in every state', async () => {
    const view = await rest('pick-place');
    const strokeX = view.state.strokeX as number;
    const strokeY = view.state.strokeY as number;
    const frameBox = (v: PartView) => hull(v, model(v).filter((p) => p.slot !== 'head'));
    const first = hull(view, model(view));
    for (const at of [[strokeX, strokeY, 0], [strokeX / 2, 0, 0], [0, strokeY, 0]] as Vec3[]) {
      const v = moved(view, at);
      const h = hull(v, model(v));
      expect([h.min[0], h.max[0], h.min[2], h.max[2]]).toEqual([first.min[0], first.max[0], first.min[2], first.max[2]]);
      expect(frameBox(v).min[0]).toBeCloseTo(frameBox(view).min[0], 9);
    }
  });

  it('VIS-014 a gantry stands on four columns under two rails, with a bridge, a carriage, a slide and a head', async () => {
    const view = await rest('gantry');
    const pieces = model(view);
    expect(pieces.filter((p) => p.slot.startsWith('foot-')).length).toBe(4);
    expect(['rail-a', 'rail-b', 'bridge', 'carriage', 'slide', 'head'].map((s) => slot(pieces, s).role)).toEqual([
      'frame',
      'frame',
      'frame',
      'housing',
      'frame',
      'steel',
    ]);
    const [rail] = [slot(pieces, 'rail-a'), slot(pieces, 'rail-b')];
    expect(pieceExtent(rail)[0]).toBeGreaterThan(pieceExtent(rail)[2]); // the rails run along x, the bridge across them
    expect(pieceExtent(slot(pieces, 'bridge'))[2]).toBeGreaterThan(pieceExtent(slot(pieces, 'bridge'))[0]);
  });

  it('VIS-014 each gantry axis moves its own piece: x the bridge, z the carriage, y the head', async () => {
    const view = await rest('gantry');
    const rest0 = model(view);
    const w0 = (s: string) => world(view, slot(rest0, s));
    const byX = moved(view, [0.6, 0, 0]);
    const byZ = moved(view, [0, 0, 0.5]);
    const byY = moved(view, [0, 0.4, 0]);
    expect(world(byX, slot(model(byX), 'bridge'))[0] - w0('bridge')[0]).toBeCloseTo(0.6, 9);
    expect(world(byX, slot(model(byX), 'carriage'))[0] - w0('carriage')[0]).toBeCloseTo(0.6, 9);
    expect(world(byZ, slot(model(byZ), 'carriage'))[2] - w0('carriage')[2]).toBeCloseTo(0.5, 9);
    expect(world(byZ, slot(model(byZ), 'bridge'))).toEqual(w0('bridge')); // the bridge does not follow z
    expect(world(byY, slot(model(byY), 'head'))[1] - w0('head')[1]).toBeCloseTo(0.4, 9);
    expect(world(byY, slot(model(byY), 'carriage'))).toEqual(w0('carriage'));
    for (const s of ['rail-a', 'rail-b', 'leg-a', 'leg-d']) for (const v of [byX, byY, byZ]) expect(world(v, slot(model(v), s))).toEqual(w0(s));
  });

  it('VIS-014 the footprint of a gantry is the same in every state, on the floor, and holds the whole stroke', async () => {
    const view = await rest('gantry');
    const [sx, sy, sz] = [view.state.strokeX, view.state.strokeY, view.state.strokeZ] as number[];
    const first = hull(view, model(view));
    for (const at of [[sx, sy, sz], [sx / 2, 0, sz / 2], [0, sy, sz]] as Vec3[]) {
      const v = moved(view, at);
      const h = hull(v, model(v));
      expect([h.min[0], h.max[0], h.min[2], h.max[2]]).toEqual([first.min[0], first.max[0], first.min[2], first.max[2]]);
    }
    expect(first.min[1]).toBeCloseTo(0, 9);
    expect(first.min[0]).toBeLessThan(0);
    expect(first.max[0]).toBeGreaterThan(sx!);
    expect(first.max[2]).toBeGreaterThan(sz!);
    for (const foot of model(view).filter((p) => p.slot.startsWith('foot-'))) expect(bottom(foot) + view.pose.p[1]).toBeCloseTo(0, 9);
  });
});
