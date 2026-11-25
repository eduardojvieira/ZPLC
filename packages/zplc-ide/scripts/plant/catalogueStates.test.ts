import { describe, expect, it } from 'bun:test';
import { gripperDecor } from '../../src/plant/view/geometry';
import { MODELS, partModel } from '../../src/plant/view/models';
import { CATALOGUE, catalogueView, ITEMS } from './catalogueStates';

describe('the catalogue sheet', () => {
  it('lists every part kind that has a model, once', () => {
    const ids = CATALOGUE.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(MODELS).sort());
  });

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
    for (const kind of CATALOGUE) {
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
