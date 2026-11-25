import { describe, expect, it } from 'bun:test';
import { gripperDecor } from '../../src/plant/view/geometry';
import { MODELS, partModel } from '../../src/plant/view/models';
import { CATALOGUE, catalogueView, catalogueViews, ITEMS } from './catalogueStates';

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
});
