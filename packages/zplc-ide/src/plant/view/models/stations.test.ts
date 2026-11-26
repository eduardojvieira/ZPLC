/**
 * The stacker crane models (plan-vis C6; VIS-014, VIS-016): the crane, its mast and its high-bay rack as the real plant core publishes
 * them. The mast and the crane are posed where they stand, so the rails and the rack are checked in the world, where they must not move.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import type { PartView, PlantCore, PlantSceneFile, ScenePart, Vec3 } from '../../contracts';
import warehouse from '../../../../plant-scenes/stacker-crane-warehouse/scene.json';
import { TOKENS } from '../../../theme/tokens';
import { createPlantCore } from '../../core/plantCore';
import { paletteFor } from '../displayModes';
import { controlStation } from '../controlStations';
import { roleLook } from '../look';
import { partModel, pieceExtent, rotate } from './index';
import { bottom, slot, top } from './models.fixtures';
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
    // The two faces of the rack (C10 adds the posts across the aisle and the end frames, checked in their own test).
    const faces = (prefix: string) => [...slotsOf(pieces, `${prefix}-front-`), ...slotsOf(pieces, `${prefix}-back-`)];
    expect(faces('upright').length).toBe(2 * (config.columns + 1));
    expect(new Set(faces('upright').map((p) => p.role))).toEqual(new Set(['painted']));
    expect(slotsOf(pieces, 'beam').length).toBe(2 * config.levels);
    expect(new Set(slotsOf(pieces, 'beam').map((p) => p.role))).toEqual(new Set(['steel']));
    expect(faces('base').length).toBe(2 * (config.columns + 1));
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
      expect(rest.some((p) => p.slot === 'rail-top')).toBe(false);
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
    expect(slotsOf(rest.pieces, 'fork').every((p) => p.role === 'fork')).toBe(true);
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

  it('VIS-014 (S3-06) stacker rack has load beams, cell shelves, depth ties and diagonal bracing', async () => {
    const { views } = await crane();
    const pieces = partModel(views['stacker-rack']!)!;
    expect(slotsOf(pieces, 'shelf-').length).toBe(config.columns * config.levels);
    expect(slotsOf(pieces, 'tie-').length).toBeGreaterThanOrEqual((config.columns + 1) * config.levels);
    expect(slotsOf(pieces, 'brace-').length).toBeGreaterThan(0);
  });

  it('VIS-014 (S3-06) mast matches rack height, has twin braced columns, drive and top head, and no stray floor bar', async () => {
    const { views } = await crane();
    const rack = views['stacker-rack']!;
    const mast = views['stacker-mast']!;
    const rackTop = rack.pose.p[1] + Math.max(...partModel(rack)!.map(top));
    const rest = partModel(mast)!; // no scenePart, as renderer & catalogue call it
    const mastCol = slot(rest, 'mast');
    expect(mastCol.at[1] + pieceExtent(mastCol)[1] + mast.pose.p[1]).toBeLessThanOrEqual(rackTop);
    expect(slot(rest, 'mast-b').role).toBe('painted');
    expect(slot(rest, 'mast-head').role).toBe('housing');
    expect(slot(rest, 'drive-aisle').role).toBe('painted');
    expect(slotsOf(rest, 'wheel-').length).toBeGreaterThanOrEqual(4);

    // At bay 2 without scenePart (catalogue state "raised, bay 2, level 2"), rail-floor stays local under the truck.
    const atBay2 = mastAt(mast, 2);
    const bay2Pieces = partModel(atBay2)!;
    const rail = slot(bay2Pieces, 'rail-floor');
    expect(pieceExtent(rail)[0]).toBeLessThan(0.5);
    expect(world(atBay2, rail)[0]).toBeCloseTo(atBay2.pose.p[0], 6);
  });

  it('VIS-014 (S3-06) carriage wraps mast above the floor with guide cheeks, rollers, and fork drive', async () => {
    const { views } = await crane();
    const view = views['stacker-crane']!;
    const pieces = partModel(view)!;
    expect(slot(pieces, 'carriage-side-a').role).toBe('housing');
    expect(slot(pieces, 'carriage-side-b').role).toBe('housing');
    expect(slot(pieces, 'drive-fork').role).toBe('painted');
    expect(slotsOf(pieces, 'roller-').length).toBeGreaterThanOrEqual(4);
    for (const p of pieces) expect(bottom(p) + view.pose.p[1]).toBeGreaterThanOrEqual(-1e-6);
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

const PALLETIZER_IDS = [
  'palletizer',
  'palletizer-frame',
  'palletizer-beam',
  'palletizer-pusher',
  'palletizer-plate-far',
  'palletizer-plate-side',
];
const palletizerPart: ScenePart = {
  id: 'palletizer',
  part: 'layer-palletizer',
  name: 'Palletizer1',
  position: [0, 0.54, 0],
  rotationYDeg: 0,
  config: { variant: 'digital', strokeXM: 1.6, strokeYM: 1, speedMps: 1.5, accelMps2: 2, columns: 2, rows: 2 },
};

/** The views of a layer palletizer at rest, by id, as the real core publishes them. */
async function palletizer(): Promise<Record<string, PartView>> {
  const scene: PlantSceneFile = { schemaVersion: 1, name: 'palletizer', parts: [palletizerPart], cameras: [] };
  const core = await createPlantCore(scene);
  cores.push(core);
  return Object.fromEntries(core.snapshot().parts.map((p) => [p.id, p]));
}
/** `view` moved by (dx, dy, dz) in the part's frame (the part is not turned). */
const moved = (view: PartView, dx: number, dy: number, dz: number): PartView => ({
  ...view,
  pose: { ...view.pose, p: [view.pose.p[0] + dx, view.pose.p[1] + dy, view.pose.p[2] + dz] },
});

describe('layer palletizer models (VIS-014)', () => {
  it('PRT-009 every view the layer palletizer publishes has a model, drawn once', async () => {
    const views = await palletizer();
    expect(Object.keys(views)).toEqual(expect.arrayContaining(PALLETIZER_IDS));
    for (const id of PALLETIZER_IDS) expect(partModel(views[id]!, { travel: 0, scenePart: palletizerPart })?.length).toBeGreaterThan(0);
  });

  it('VIS-014 the rails and their legs stay where they are in the world and the feet reach the floor', async () => {
    const view = (await palletizer())['palletizer-frame']!;
    const rest = partModel(view)!;
    expect(slotsOf(rest, 'rail').map((p) => p.role)).toEqual(['frame', 'frame']);
    expect(slotsOf(rest, 'foot').length).toBe(4);
    for (const f of slotsOf(rest, 'foot')) close(bottom(f), -view.pose.p[1]);
    // The same view in another pose (the part never moves it) is drawn as the same pieces.
    expect(partModel({ ...view, state: { x: 1 } })).toEqual(rest);
  });

  it('VIS-014 the column carries a carriage on the rail that follows the pose of the column', async () => {
    const view = (await palletizer())['palletizer-beam']!;
    expect(slot(partModel(view)!, 'column').role).toBe('frame');
    for (const dx of [0, 0.5, 1.2]) {
      const v = moved(view, dx, 0, 0);
      const carriage = slot(partModel(v)!, 'carriage');
      expect(carriage.role).toBe('housing');
      expect(world(v, carriage)[0]).toBeCloseTo(view.pose.p[0] + dx, 9);
      expect(world(v, carriage)[1]).toBeCloseTo(view.pose.p[1] + view.pose.size[1] / 2, 9);
    }
  });

  it('VIS-014 the pusher bar with its rubber face and guide rods follows its pose, and the plates have a rim', async () => {
    const views = await palletizer();
    const pusher = views['palletizer-pusher']!;
    const rest = partModel(pusher)!;
    expect(slot(rest, 'bar').role).toBe('painted');
    expect(slot(rest, 'face').role).toBe('rubber');
    expect(slotsOf(rest, 'guide').map((p) => p.role)).toEqual(['steel', 'steel']);
    const out = moved(pusher, 0, 0, 0.15);
    expect(partModel(out)).toEqual(rest);
    close(world(out, slot(rest, 'face'))[2] - world(pusher, slot(rest, 'face'))[2], 0.15);
    for (const id of ['palletizer-plate-far', 'palletizer-plate-side']) {
      const pieces = partModel(views[id]!)!;
      expect(slot(pieces, 'plate').role).toBe('steel');
      expect(slot(pieces, 'rim')).toBeDefined();
    }
  });

  it('VIS-014 the pad and its clamp jaws: the jaws close with the grip and nothing is drawn below them', async () => {
    const pad = (await palletizer())['palletizer']!;
    const context = { travel: 0, scenePart: palletizerPart };
    const at = (dx: number, dy: number, closeFraction: number) => {
      const v = { ...moved(pad, dx, dy, 0), state: { ...pad.state, closeFraction } };
      return { v, pieces: partModel(v, context)! };
    };
    const home = at(0, 0, 0);
    expect(slot(home.pieces, 'pad').role).toBe('steel');
    for (const [dx, dy] of [
      [0.8, 0.3],
      [1.6, 1],
    ] as const) {
      const there = at(dx, dy, 1);
      expect(world(there.v, slot(there.pieces, 'pad'))[0]).toBeCloseTo(dx, 9);
    }
    // Nothing hangs lower than the jaws: no base under the forming zone (it would lie in the infeed belt).
    for (const p of home.pieces) expect(bottom(p)).toBeGreaterThanOrEqual(-0.03 / 2 - 0.25 - 1e-9);
    const gap = (f: number) => {
      const { pieces } = at(0, 0, f);
      return Math.abs(slot(pieces, 'jaw-a').at[2] - slot(pieces, 'jaw-b').at[2]);
    };
    expect(gap(0) - gap(1)).toBeGreaterThanOrEqual(0.1);
    expect(gap(1)).toBeLessThan(gap(0));
    expect(partModel(pad)!.length).toBeGreaterThan(0);
  });

  it('VIS-014 (S3-07) manipulator-frame and manipulator-beam skip duplicate portals emitted by pick-place and gantry', async () => {
    for (const part of ['pick-place', 'gantry'] as const) {
      const core = await createPlantCore({
        schemaVersion: 1,
        name: 'dup',
        parts: [{ id: 'm', part, name: 'M1', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
        cameras: [],
      });
      cores.push(core);
      const snap = core.snapshot().parts;
      expect(partModel(snap.find((v) => v.part === 'manipulator-frame')!)).toEqual([]);
      expect(partModel(snap.find((v) => v.part === 'manipulator-beam')!)).toEqual([]);
    }
  });
});

const machiningPart: ScenePart = {
  id: 'mc',
  part: 'machining-centre',
  name: 'Mc1',
  position: [0, 0.5, 0],
  rotationYDeg: 0,
  config: {},
};

/** The machining centre and its two doors, as the real core publishes them at rest. */
async function machining(): Promise<readonly PartView[]> {
  const core = await createPlantCore({ schemaVersion: 1, name: 'mc', parts: [machiningPart], cameras: [] });
  cores.push(core);
  return core.snapshot().parts;
}

describe('machining centre models (VIS-014)', () => {
  it(
    'VIS-014 (S3-05) housing has painted casing, housing crown & plinth, framed window, spindle/fixture, front console & ' + 'light',
    async () => {
      const views = await machining();
      const centre = views.find((v) => v.part === 'machining-centre')!;
      const doors = views.filter((v) => v.part === 'machining-door');
      expect(doors.length).toBe(2);
      const pieces = partModel(centre)!;
      expect(slot(pieces, 'window').role).toBe('glass');
      expect(slot(pieces, 'spindle').role).toBe('steel');
      expect(slot(pieces, 'table').role).toBe('steel');
      expect(slot(pieces, 'pendant').role).toBe('housing');
      expect(slot(pieces, 'wall-back').role).toBe('housing');
      // The body is inset so neighbouring machines stand apart, and its roof/plinth are housing (not a pale frame slab).
      const body = pieces.filter((p) => !p.slot.startsWith('light-') && !p.slot.startsWith('beacon-') && !p.slot.startsWith('pendant'));
      for (const p of body) expect(Math.abs(p.at[2]) + pieceExtent(p)[2]).toBeLessThanOrEqual(0.85 * (centre.pose.size[2] / 2) + 1e-9);
      expect(slot(pieces, 'roof').role).toBe('housing');
      expect(slot(pieces, 'crown').role).toBe('housing');
      expect(pieces.some((p) => p.role === 'painted')).toBe(true);
      expect(slotsOf(pieces, 'mullion-').length).toBeGreaterThanOrEqual(4);
      expect(slotsOf(pieces, 'plinth').length).toBeGreaterThan(0);
      expect(new Set(slotsOf(pieces, 'plinth').map((p) => p.role))).toEqual(new Set(['housing']));
      // Interior machining detail: headstock column, chuck, tool, clamping vise, and machine base reaching floor.
      expect(slot(pieces, 'column').role).toBe('housing');
      expect(slot(pieces, 'chuck').role).toBe('collar');
      expect(slot(pieces, 'tool').role).toBe('steel');
      expect(slotsOf(pieces, 'vise-').length).toBeGreaterThanOrEqual(2);
      expect(Math.min(...pieces.map((p) => bottom(p) + centre.pose.p[1]))).toBeCloseTo(0, 6);
      // Front operator control console is on the +z front side, visible from the first view, with screen and buttons.
      expect(slot(pieces, 'pendant').at[2]).toBeGreaterThan(0);
      expect(slot(pieces, 'pendant-screen')).toBeDefined();
      expect(slotsOf(pieces, 'pendant-btn-').length).toBeGreaterThanOrEqual(2);
      expect(slotsOf(pieces, 'light-').length).toBe(3);
      expect(slot(pieces, 'beacon-pole').role).toBe('steel');
      // No piece reaches into the volume of a door at its closed pose.
      for (const p of pieces)
        for (const d of doors) {
          const reach = Math.abs(p.at[0] + centre.pose.p[0] - d.pose.p[0]) - pieceExtent(p)[0] - d.pose.size[0] / 2;
          expect(reach).toBeGreaterThanOrEqual(-1e-9);
        }
    },
  );

  it('VIS-014 the stack light shows running (green) and done (amber); red stays off, as no fault state is published', async () => {
    const centre = (await machining()).find((v) => v.part === 'machining-centre')!;
    const roles = (state: PartView['state']) =>
      slotsOf(partModel({ ...centre, state: { ...centre.state, ...state } })!, 'light-').map((p) => p.role);
    expect(roles({ busy: false, text: 'idle' })).toEqual(['signalGreenOff', 'signalAmberOff', 'signalRedOff']);
    expect(roles({ busy: true, text: 'busy 1.0 s' })).toEqual(['signalGreen', 'signalAmberOff', 'signalRedOff']);
    expect(roles({ busy: false, text: 'done' })).toEqual(['signalGreenOff', 'signalAmber', 'signalRedOff']);
  });

  it('VIS-014 the spindle head is lowered toward the table while a cycle runs and raised otherwise', async () => {
    const centre = (await machining()).find((v) => v.part === 'machining-centre')!;
    const y = (busy: boolean) => slot(partModel({ ...centre, state: { ...centre.state, busy } })!, 'spindle').at[1];
    expect(y(true)).toBeLessThan(y(false));
    expect(y(false) - y(true)).toBeCloseTo(0.1, 9);
  });

  it('VIS-014 the door is a panel with a glass window and a handle, drawn once per view, and does not depend on its travel', async () => {
    const doors = (await machining()).filter((v) => v.part === 'machining-door');
    for (const door of doors) {
      const pieces = partModel(door)!;
      expect(slot(pieces, 'panel').role).toBe('painted');
      expect(slot(pieces, 'window').role).toBe('glass');
      expect(slot(pieces, 'handle').role).toBe('steel');
      expect(partModel({ ...door, state: { fraction: 0.5 } })).toEqual(pieces);
      expect(pieces.every((p) => p.visible)).toBe(true);
    }
    expect(doors.length).toBe(2);
  });
});

describe('stacker crane, rack and fork (C10)', () => {
  it('C10 in stacker-crane-warehouse the mast stands between two upright frames of the rack all along the aisle, no taller than it', async () => {
    const core = await createPlantCore(warehouse as unknown as PlantSceneFile);
    cores.push(core);
    const parts = core.snapshot().parts;
    const rack = parts.find((p) => p.part === 'stacker-rack')!;
    const mast = parts.find((p) => p.part === 'stacker-mast')!;
    const rackPieces = partModel(rack)!; // the renderer finds no scene part for the mast and rack views
    const highest = (v: PartView, pieces: readonly Piece[]) => Math.max(...pieces.map((p) => world(v, p)[1] + pieceExtent(p)[1]));
    expect(highest(mast, partModel(mast)!)).toBeCloseTo(highest(rack, rackPieces), 9);
    // The upright posts of the rack in the world, as x and z extents (not the floor bed or ties).
    const posts = rackPieces
      .filter((p) => p.slot.startsWith('upright-'))
      .map((p) => footprint(rack, [p], [p.slot]))
      .map(([x0, z0, x1, z1]) => ({ x0: x0!, z0: z0!, x1: x1!, z1: z1! }));
    // A frame: posts at one place along the aisle on both sides of the mast's line.
    const frameXs = [...new Set(posts.map((p) => Math.round(((p.x0 + p.x1) / 2) * 1e4) / 1e4))];
    const [, mz0, , mz1] = footprint(mast, partModel(mast)!, ['mast']);
    const frames = frameXs.filter((x) => {
      const at = posts.filter((p) => Math.abs((p.x0 + p.x1) / 2 - x) < 1e-3);
      return at.some((p) => p.z1 <= mz0!) && at.some((p) => p.z0 >= mz1!);
    });
    const columns = warehouse.parts[0]!.config.columns as number;
    const where: string[] = [];
    for (let bay = 0; bay <= columns; bay++) {
      const v = mastAt(mast, bay);
      const [x0, z0, x1, z1] = footprint(v, partModel(v)!, ['mast']);
      const before = frames.some((x) => x < x0!);
      const after = frames.some((x) => x > x1!);
      // Within the rack's depth: the posts reach past the mast's columns on both sides across the aisle.
      const deep = Math.min(...posts.map((p) => p.z0)) <= z0! && Math.max(...posts.map((p) => p.z1)) >= z1!;
      if (!(before && after && deep)) where.push(`bay ${bay}: frame before ${before}, after ${after}, within depth ${deep}`);
    }
    expect(where).toEqual([]);
  });

  it('C10 no operator device of stacker-crane-warehouse meets the crane, its mast, carriage or fork anywhere along their travel', async () => {
    const core = await createPlantCore(warehouse as unknown as PlantSceneFile);
    cores.push(core);
    const parts = core.snapshot().parts;
    const box3 = (v: PartView, p: Piece) => {
      const c = world(v, p);
      const e = pieceExtent(p);
      return { min: [c[0] - e[0], c[1] - e[1], c[2] - e[2]], max: [c[0] + e[0], c[1] + e[1], c[2] + e[2]] };
    };
    const devices = parts
      .filter((p) => ['push-button', 'stack-light', 'emergency-stop', 'selector-switch', 'indicator-light'].includes(p.part))
      .flatMap((v) => partModel(v, { travel: 0, station: controlStation(v, parts) })!.map((p) => ({ id: v.id, ...box3(v, p) })));
    expect(devices.length).toBeGreaterThan(0);
    const mast = parts.find((p) => p.part === 'stacker-mast')!;
    const crane = parts.find((p) => p.part === 'stacker-crane')!;
    const { columns, levels } = warehouse.parts[0]!.config as { columns: number; levels: number };
    const hits = new Set<string>();
    for (let dx = 0; dx <= columns + 1e-9; dx += 0.25)
      for (let l = 0; l <= levels; l++)
        for (const raise of [0, 0.06])
          for (const f of [-1, -0.5, 0, 0.5, 1]) {
            const m = mastAt(mast, dx);
            const c = craneAt(mastAt(crane, dx), f, l * config.levelPitchM + raise);
            const moving = [...partModel(m)!.map((p) => box3(m, p)), ...partModel(c)!.map((p) => box3(c, p))];
            for (const d of devices)
              for (const b of moving) if ([0, 1, 2].every((i) => d.min[i]! < b.max[i]! && d.max[i]! > b.min[i]!)) hits.add(d.id);
          }
    expect([...hits]).toEqual([]);
  });

  it('C10 every cell of the rack has a shelf that carries a box under it, below the lowest pass of the fork', async () => {
    const { views } = await crane();
    const pieces = partModel(views['stacker-rack']!)!;
    for (let c = 1; c <= config.columns; c++)
      for (let l = 1; l <= config.levels; l++) {
        const shelf = slot(pieces, `shelf-${c}-${l}`);
        const [a, b] = [slot(pieces, `cell-${c}-${l}-a`), slot(pieces, `cell-${c}-${l}-b`)];
        const e = pieceExtent(shelf);
        // Across both rails, and deep enough for the 0.4 m box.
        expect(shelf.at[0] - e[0]).toBeLessThanOrEqual(a.at[0] - pieceExtent(a)[0] + 1e-9);
        expect(shelf.at[0] + e[0]).toBeGreaterThanOrEqual(b.at[0] + pieceExtent(b)[0] - 1e-9);
        expect(2 * e[2]).toBeGreaterThanOrEqual(0.4);
        // The fork passes 0.03 m under the rail tops and is 0.04 m thick: the shelf stays under it.
        expect(top(shelf)).toBeLessThanOrEqual(top(a) - 0.07 + 1e-9);
      }
  });

  it('C10 the fork has its own colour, the teal of the design tokens, apart from the carriage and the steel', async () => {
    const { views } = await crane();
    const pieces = partModel(views['stacker-crane']!)!;
    const palette = paletteFor({ mode: 'light', reducedMotion: false });
    const colour = (s: string) => roleLook(slot(pieces, s).role, 'stacker-crane', palette).colour;
    const teal = parseInt(TOKENS.find((t) => t.name === '--ramp-teal-300')!.light.slice(1), 16);
    expect(colour('fork-a')).toBe(teal);
    expect(colour('fork-b')).toBe(teal);
    for (const other of ['carriage', 'roller-0-0-0', 'tine-rail-a']) expect(colour(other)).not.toBe(teal);
  });
});
