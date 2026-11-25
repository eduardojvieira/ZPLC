/**
 * The stacker crane models (plan-vis C6; VIS-014, VIS-016): the crane, its mast and its high-bay rack as the real plant core publishes
 * them. The mast and the crane are posed where they stand, so the rails and the rack are checked in the world, where they must not move.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import type { PartView, PlantCore, PlantSceneFile, ScenePart, Vec3 } from '../../contracts';
import { createPlantCore } from '../../core/plantCore';
import { partModel, pieceExtent, rotate } from './index';
import { slot } from './models.fixtures';
import type { Piece } from './shared';
import { STATIONS } from './stations';

const cores: PlantCore[] = [];
afterEach(() => cores.splice(0).forEach((core) => core.dispose()));

const config = { columns: 3, levels: 2, bayPitchM: 1, levelPitchM: 0.6, forkStrokeM: 0.8 };
const scenePart = (rotationYDeg: number): ScenePart => ({
  id: 'crane',
  part: 'stacker-crane',
  name: 'Crane1',
  position: [2, 0, 1],
  rotationYDeg,
  config,
});

/** The three views of a crane at rest, as the real core publishes them, and the scene part they come from. */
async function crane(rotationYDeg = 0): Promise<{ views: Record<string, PartView>; part: ScenePart }> {
  const part = scenePart(rotationYDeg);
  const scene: PlantSceneFile = { schemaVersion: 1, name: 'crane', parts: [part], cameras: [] };
  const core = await createPlantCore(scene);
  cores.push(core);
  return { views: Object.fromEntries(core.snapshot().parts.map((p) => [p.part, p])), part };
}

const world = (view: PartView, p: Piece): Vec3 => {
  const r = rotate(view.pose.q, p.at);
  return [r[0] + view.pose.p[0], r[1] + view.pose.p[1], r[2] + view.pose.p[2]];
};
/** The x and z extent, in the world, of the pieces whose slot starts with one of `prefixes` (the part is turned by whole quarters). */
function footprint(view: PartView, pieces: readonly Piece[], prefixes: readonly string[]): number[] {
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (const p of pieces.filter((q) => prefixes.some((s) => q.slot.startsWith(s)))) {
    const c = world(view, p);
    const e = pieceExtent(p);
    const turned = Math.abs(view.pose.q[1]) > 0.5 && Math.abs(view.pose.q[1]) < 0.9; // a quarter turn swaps the extents
    const [ex, ez] = turned ? [e[2], e[0]] : [e[0], e[2]];
    for (const [i, v, h] of [[0, c[0], ex] as const, [1, c[2], ez] as const]) {
      min[i] = Math.min(min[i]!, v - h);
      max[i] = Math.max(max[i]!, v + h);
    }
  }
  return [...min, ...max].map((v) => Math.round(v * 1e6) / 1e6);
}
const slotsOf = (pieces: readonly Piece[], prefix: string) => pieces.filter((p) => p.slot.startsWith(prefix));
const close = (got: number, want: number) => expect(got).toBeCloseTo(want, 9);

/** The mast, `dx` metres along the aisle from where it is at rest. */
const mastAt = (view: PartView, dx: number): PartView => {
  const d = rotate(view.pose.q, [dx, 0, 0]);
  return { ...view, pose: { ...view.pose, p: [view.pose.p[0] + d[0], view.pose.p[1], view.pose.p[2] + d[2]] } };
};
/** The crane, with its fork at `fraction` of the stroke and its carriage `dy` metres higher. */
const craneAt = (view: PartView, fraction: number, dy: number): PartView => {
  const d = rotate(view.pose.q, [0, 0, fraction * config.forkStrokeM]);
  return {
    ...view,
    pose: { ...view.pose, p: [view.pose.p[0] + d[0], view.pose.p[1] + dy, view.pose.p[2] + d[2]] },
    state: { ...view.state, fraction },
  };
};

describe('stacker crane models (VIS-014)', () => {
  it('PRT-009 the stations family draws the crane, its mast and its rack', () => {
    expect(Object.keys(STATIONS)).toEqual(expect.arrayContaining(['stacker-crane', 'stacker-mast', 'stacker-rack']));
  });

  it('VIS-014 the rack has an upright at every bay boundary on both faces and a load beam at every level', async () => {
    const { views } = await crane();
    const rack = views['stacker-rack']!;
    const pieces = partModel(rack)!;
    expect(slotsOf(pieces, 'upright').length).toBe(2 * (config.columns + 1));
    expect(new Set(slotsOf(pieces, 'upright').map((p) => p.role))).toEqual(new Set(['painted']));
    expect(slotsOf(pieces, 'beam').length).toBe(2 * config.levels);
    expect(new Set(slotsOf(pieces, 'beam').map((p) => p.role))).toEqual(new Set(['steel']));
    expect(slotsOf(pieces, 'base').length).toBe(2 * (config.columns + 1));
    // The beams carry the cell rails: the top of the beam of level l is l levels above the floor the rack stands on.
    const floor = -rack.pose.p[1];
    for (let l = 1; l <= config.levels; l++) {
      const b = slot(pieces, `beam-front-${l}`);
      close(b.at[1] + pieceExtent(b)[1] - floor, l * config.levelPitchM);
    }
    // Cells stay open: nothing is drawn across the middle of a bay between two levels.
    const xs = slotsOf(pieces, 'upright').map((p) => p.at[0]);
    for (let c = 1; c <= config.columns; c++) {
      const centre = (c - (config.columns + 1) / 2) * config.bayPitchM;
      expect(xs.filter((x) => Math.abs(x - centre) < 0.15).length).toBe(0);
    }
  });

  it('VIS-014 the mast follows the aisle with its pose while the floor and top rails stay where they are in the world', async () => {
    for (const yaw of [0, 90]) {
      const { views, part } = await crane(yaw);
      const mast = views['stacker-mast']!;
      const context = { travel: 0, scenePart: part };
      const rest = partModel(mast, context)!;
      expect(slot(rest, 'rail-floor').role).toBe('steel');
      expect(slot(rest, 'rail-top').role).toBe('steel');
      expect(slot(rest, 'mast').role).toBe('painted');
      const railsAt = (dx: number) => {
        const v = mastAt(mast, dx);
        const pieces = partModel(v, context)!;
        return { v, pieces, rails: footprint(v, pieces, ['rail-']), at: world(v, slot(pieces, 'mast')) };
      };
      const home = railsAt(0);
      for (const dx of [1, 2, 3]) {
        const there = railsAt(dx);
        expect(there.rails).toEqual(home.rails);
        const moved = [there.at[0] - home.at[0], there.at[2] - home.at[2]];
        close(Math.hypot(moved[0]!, moved[1]!), dx);
      }
      // The rails cover the aisle from bay 0 to the last bay.
      const length = yaw === 0 ? home.rails[2]! - home.rails[0]! : home.rails[3]! - home.rails[1]!;
      expect(length).toBeGreaterThan(config.columns * config.bayPitchM);
    }
  });

  it('VIS-014 the carriage rides at the height of the view and the forks extend by the fork stroke from it', async () => {
    const { views } = await crane();
    const at = (fraction: number, dy: number) => {
      const v = craneAt(views['stacker-crane']!, fraction, dy);
      return { v, pieces: partModel(v)! };
    };
    const rest = at(0, 0);
    expect(slot(rest.pieces, 'carriage').role).toBe('housing');
    expect(slotsOf(rest.pieces, 'fork').every((p) => p.role === 'steel')).toBe(true);
    expect(slotsOf(rest.pieces, 'fork').length).toBeGreaterThanOrEqual(2);
    const high = at(0, 1.2);
    close(world(high.v, slot(high.pieces, 'carriage'))[1] - world(rest.v, slot(rest.pieces, 'carriage'))[1], 1.2);
    for (const f of [-1, -0.5, 0.5, 1]) {
      const { v, pieces } = at(f, 0);
      const reach = world(v, slotsOf(pieces, 'fork')[0]!)[2] - world(v, slot(pieces, 'carriage'))[2];
      close(reach, f * config.forkStrokeM);
      // The carriage stays on the mast: its place in the world does not follow the fork.
      close(world(v, slot(pieces, 'carriage'))[2], world(rest.v, slot(rest.pieces, 'carriage'))[2]);
    }
    expect(slot(rest.pieces, 'slide').visible).toBe(false);
    expect(slot(at(0.5, 0).pieces, 'slide').visible).toBe(true);
  });

  it('VIS-014 the rack is the same in every state the crane can be in, and Low quality and High contrast still draw it', async () => {
    const { views, part } = await crane();
    const rack = views['stacker-rack']!;
    const a = partModel(rack, { travel: 0, scenePart: part })!;
    const b = partModel({ ...rack, state: { ...rack.state, stored: 3 } }, { travel: 0, scenePart: part })!;
    expect(b).toEqual(a);
    expect(a.every((p) => p.visible)).toBe(true);
  });
});
