import { describe, expect, it } from 'bun:test';
import { gripperDecor, snapshotBounds } from '../../src/plant/view/geometry';
import { MODELS, partModel } from '../../src/plant/view/models';
import { CATALOGUE, catalogueCamera, catalogueKindCells, catalogueView, catalogueViews, ITEMS, unionBounds } from './catalogueStates';

const MACHINES = {
  'stacker-crane': ['stacker-crane', 'stacker-mast', 'stacker-rack'],
  'layer-palletizer': ['layer-palletizer', 'manipulator-frame', 'manipulator-beam', 'layer-pusher', 'layer-plate'],
  'machining-centre': ['machining-centre', 'machining-door'],
} as const;
const SECONDARY = Object.values(MACHINES).flatMap((v) => v.slice(1));

describe('the catalogue sheet', () => {
  it('lists every part kind that has a model, once, either as its own cell or inside its machine', () => {
    const ids = CATALOGUE.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    const covered = [...ids, ...CATALOGUE.flatMap((k) => k.machine?.views.slice(1) ?? [])];
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual(Object.keys(MODELS).sort());
  });

  it('draws each machine whole: it lists all its views, and no secondary view has a cell of its own', () => {
    for (const [id, views] of Object.entries(MACHINES)) {
      expect({ id, views: CATALOGUE.find((k) => k.id === id)?.machine?.views }).toEqual({ id, views });
    }
    for (const id of SECONDARY) expect({ id, own: CATALOGUE.some((k) => k.id === id) }).toEqual({ id, own: false });
  });

  it('builds each machine state through the core: every view the part publishes, and a different look per state', async () => {
    for (const kind of CATALOGUE.filter((k) => k.machine)) {
      const drawn: string[] = [];
      for (const state of kind.states) {
        const views = await catalogueViews(kind, state);
        expect(new Set(views.map((v) => v.part))).toEqual(new Set(kind.machine!.views));
        expect(views.every((v) => partModel(v) !== null)).toBe(true);
        drawn.push(JSON.stringify(views.map((v) => [partModel(v), gripperDecor(v), v.pose.p, v.pose.q, v.state])));
      }
      expect({ id: kind.id, distinct: new Set(drawn).size }).toEqual({ id: kind.id, distinct: kind.states.length });
    }
  }, 60000);

  it('gives each kind that shows more than one look at least two states, with distinct labels', () => {
    for (const kind of CATALOGUE) {
      const labels = kind.states.map((s) => s.label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels.length).toBeGreaterThanOrEqual(1);
      if (kind.stateful) expect(labels.length).toBeGreaterThanOrEqual(2);
    }
    expect(CATALOGUE.filter((k) => k.stateful).length).toBeGreaterThan(20);
  });

  it('builds a view of every state that its model draws, and the states of a stateful kind do not draw the same pieces', () => {
    for (const kind of CATALOGUE.filter((k) => !k.machine)) {
      const views = kind.states.map((s) => catalogueView(kind, s));
      expect(views.every((v) => partModel(v) !== null)).toBe(true);
      // A state changes the pieces, the gripper the renderer adds, or (a diverter arm, a door) the pose.
      const drawn = views.map((v) => JSON.stringify([partModel(v), gripperDecor(v), v.pose.p, v.pose.q]));
      if (kind.stateful) expect({ id: kind.id, distinct: new Set(drawn).size }).toEqual({ id: kind.id, distinct: kind.states.length });
    }
  });

  it('draws every item kind: a plain box, a coloured part, a metal item, a lid, a base, a crate and a pallet', () => {
    expect(ITEMS.map((i) => i.id)).toEqual(['box', 'part', 'metal', 'lid', 'base', 'crate', 'pallet']);
  });

  it('aligns turntable left/right yawDeg with the core pose and raises extended stop-blade above the floor', () => {
    const turntable = CATALOGUE.find((k) => k.id === 'turntable')!;
    const left = turntable.states.find((s) => s.label === 'left')!;
    const right = turntable.states.find((s) => s.label === 'right')!;
    expect(left.yawDeg).toBe(90);
    expect(right.yawDeg).toBe(-90);

    const gantry = CATALOGUE.find((k) => k.id === 'gantry')!;
    expect(gantry.states.find((s) => s.label === 'moved, gripping')?.state).toMatchObject({ holding: true });

    const blade = CATALOGUE.find((k) => k.id === 'stop-blade')!;
    const extended = blade.states.find((s) => s.label === 'extended (up)')!;
    expect(extended.rise).toBeCloseTo(0.32, 9);
    const v = catalogueView(blade, extended);
    expect(v.pose.p[1]).toBeCloseTo(0.65, 9);
  });

  it('S3-11 fits one shared camera on the union bounds across all states of each CatalogueKind', async () => {
    const merged = unionBounds([
      { min: [-1, 0, -0.5], max: [1, 1, 0.5] },
      { min: [-0.2, 0.2, -2], max: [3, 1.5, 1] },
    ]);
    expect(merged).toEqual({ min: [-1, 0, -2], max: [3, 1.5, 1] });

    for (const id of ['turntable', 'pusher', 'diverter-arm', 'stop-blade', 'stacker-crane'] as const) {
      const k = CATALOGUE.find((c) => c.id === id)!;
      const cells = await catalogueKindCells(k, 400 / 300);
      expect(cells.length).toBe(k.states.length);
      const expectedBounds = unionBounds(cells.map((c) => snapshotBounds(c.snapshot)!));
      const expectedCam = catalogueCamera(expectedBounds, 400 / 300);
      for (const cell of cells) {
        expect(cell.camera).toEqual(expectedCam);
      }
    }
  }, 60000);

  it('shows the five beam sensor kinds side by side, clear and detecting, each drawn its own way (owner decision 4)', () => {
    const sensor = CATALOGUE.find((k) => k.id === 'sensor')!;
    const kinds = ['diffuse', 'retro-reflective', 'inductive', 'capacitive', 'colour'];
    expect(sensor.states.map((s) => s.label)).toEqual(kinds.flatMap((k) => [`${k}, clear`, `${k}, detecting`]));
    const clear = sensor.states.filter((s) => s.label.endsWith('clear')).map((s) => catalogueView(sensor, s));
    expect(clear.map((v) => v.state.kind)).toEqual(kinds);
    const bodies = clear.map((v) =>
      JSON.stringify(
        partModel(v)!
          .filter((p) => p.role !== 'beam')
          .map((p) => [p.slot, p.shape, p.role]),
      ),
    );
    expect(new Set(bodies).size).toBe(kinds.length);
  });
});
