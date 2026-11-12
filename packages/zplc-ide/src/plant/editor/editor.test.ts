import { describe, expect, it } from 'bun:test';
import type { PartDefinition, ScenePart } from '../contracts';
import { createCatalogue } from '../core/catalogue';
import { validateScene } from '../core/scene';
import { createSceneEditor, GRID_M, TEMPLATES } from './model';

// A 1 m conveyor: the end snap point is 1 m along local +x and accepts another conveyor.
const conveyor: PartDefinition = {
  id: 'conveyor',
  family: 'conveyors',
  names: { en: 'Conveyor', es: 'Cinta' },
  config: {
    speedMps: { kind: 'number', min: 0.05, max: 2, default: 0.5, unit: 'm/s' },
    variant: { kind: 'enum', values: ['flat', 'curved'], default: 'flat' },
  },
  signals: (p: ScenePart) => [
    { name: `${p.name}.run`, direction: 'command', type: 'BOOL' },
    { name: `${p.name}.eye`, direction: 'sensor', type: 'BOOL' },
  ],
  actions: [],
  snapPoints: () => [{ name: 'end', position: [1, 0, 0], normalYDeg: 0, accepts: ['conveyor'] }],
  doc: { en: '', es: '' },
};
const lamp: PartDefinition = {
  ...conveyor,
  id: 'lamp',
  config: {},
  signals: (p) => [{ name: `${p.name}.on`, direction: 'command', type: 'BOOL' }],
  snapPoints: () => [],
};
const cat = createCatalogue([conveyor, lamp]);
const fresh = () => createSceneEditor(cat);

describe('scene editor', () => {
  it('SCN-008 place, move, rotate, duplicate and delete snap to the grid and to snap points', () => {
    const ed = fresh();
    expect(ed.place('c1', 'conveyor', [0.1, 0, 0.37], 7)).toBe('c1');
    let p = ed.state().scene.parts[0]!;
    expect(p.position).toEqual([0, 0, 0.25]);
    expect(p.rotationYDeg).toBe(0);
    expect(GRID_M).toBe(0.25);
    ed.move('c1', [1.1, 0, 2.2]);
    expect(ed.state().scene.parts[0]!.position).toEqual([1, 0, 2.25]);
    ed.rotate('c1', 100);
    expect(ed.state().scene.parts[0]!.rotationYDeg).toBe(105);
    const copy = ed.duplicate('c1');
    expect(copy).not.toBe('c1');
    p = ed.state().scene.parts[1]!;
    expect(p.name).not.toBe(ed.state().scene.parts[0]!.name);
    expect(ed.state().selection).toBe(copy);
    ed.remove(copy);
    expect(ed.state().scene.parts.map((q) => q.id)).toEqual(['c1']);
    expect(ed.state().selection).toBeNull();
    // snap point wins over the grid: end of c1 is at (1,0,2.25) + rotated (1,0,0)
    ed.rotate('c1', 0);
    ed.move('c1', [0, 0, 0]);
    ed.place('c2', 'conveyor', [1.1, 0, 0.1]);
    expect(ed.state().scene.parts[1]!.position).toEqual([1, 0, 0]);
    // moving a part near the end point of another attaches it too
    ed.place('c3', 'conveyor', [5, 0, 5]);
    ed.move('c3', [1.05, 0, -0.05]);
    expect(ed.state().scene.parts[2]!.position).toEqual([1, 0, 0]);
    // a part that is not accepted does not snap
    ed.place('l1', 'lamp', [1.1, 0, 0.1]);
    expect(ed.state().scene.parts[3]!.position).toEqual([1, 0, 0]);
  });

  it('SCN-008 place refuses an unknown part and a duplicate id with a located problem', () => {
    const ed = fresh();
    expect(ed.place('x1', 'nope', [0, 0, 0])).toMatchObject({ problem: expect.stringContaining('parts[0].part') });
    ed.place('c1', 'conveyor', [0, 0, 0]);
    expect(ed.place('c1', 'conveyor', [2, 0, 0])).toMatchObject({ problem: expect.stringContaining('.id') });
    expect(ed.state().scene.parts).toHaveLength(1);
  });

  it('SCN-008 a running plant refuses every edit with a located message', () => {
    const ed = fresh();
    ed.place('c1', 'conveyor', [0, 0, 0]);
    ed.setRunning(true);
    const msg = 'the scene can only be edited while the plant is stopped';
    expect(() => ed.place('c2', 'conveyor', [1, 0, 0])).toThrow(msg);
    expect(() => ed.move('c1', [1, 0, 0])).toThrow(msg);
    expect(() => ed.rotate('c1', 15)).toThrow(msg);
    expect(() => ed.duplicate('c1')).toThrow(msg);
    expect(() => ed.remove('c1')).toThrow(msg);
    expect(() => ed.configure('c1', { name: 'X' })).toThrow(msg);
    expect(() => ed.undo()).toThrow(msg);
    expect(() => ed.redo()).toThrow(msg);
    expect(() => ed.load(TEMPLATES[0]!.scene)).toThrow(msg);
    expect(ed.state().running).toBe(true);
    ed.setRunning(false);
    ed.move('c1', [1, 0, 0]);
  });

  it('SCN-009 configure rejects a value outside the documented range with its path', () => {
    const ed = fresh();
    ed.place('c1', 'conveyor', [0, 0, 0]);
    const problems = ed.configure('c1', { config: { speedMps: 9 } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ partId: 'c1', path: 'parts[0].config.speedMps' });
    expect(ed.state().scene.parts[0]!.config.speedMps).toBe(0.5);
    expect(ed.state().past).toBe(1); // the refused edit is not in the history
    expect(ed.configure('c1', { config: { speedMps: 1.5, variant: 'curved' }, name: 'Feed' })).toEqual([]);
    const p = ed.state().scene.parts[0]!;
    expect([p.name, p.config.speedMps, p.config.variant]).toEqual(['Feed', 1.5, 'curved']);
    expect(ed.configure('c1', { name: '1bad' })).toHaveLength(1);
    expect(ed.state().scene.parts[0]!.name).toBe('Feed');
  });

  it('SCN-010 every edit has an undo and a redo, and 50 edits undo back to the first state byte-identically', () => {
    const ed = fresh();
    const first = JSON.stringify(ed.toFile());
    const states = [first];
    for (let i = 0; i < 50; i++) {
      const id = `c${i}`;
      if (i % 5 === 0) ed.place(id, 'conveyor', [i, 0, 0]);
      else if (i % 5 === 1) ed.move(`c${i - 1}`, [i, 0, 3]);
      else if (i % 5 === 2) ed.rotate(`c${i - 2}`, 45);
      else if (i % 5 === 3) ed.configure(`c${i - 3}`, { config: { speedMps: 1 + i / 100 } });
      else ed.remove(ed.duplicate(`c${i - 4}`));
      states.push(JSON.stringify(ed.toFile()));
    }
    const done = ed.state().past;
    expect(done).toBeGreaterThanOrEqual(50);
    for (let i = done - 1; i >= 0; i--) {
      ed.undo();
      if (i === 0) expect(JSON.stringify(ed.toFile())).toBe(first);
    }
    expect(ed.state().future).toBe(done);
    for (let i = 0; i < done; i++) ed.redo();
    expect(JSON.stringify(ed.toFile())).toBe(states[states.length - 1]!);
  });

  it('SCN-010 an edit after an undo discards the redo branch', () => {
    const ed = fresh();
    ed.place('c1', 'conveyor', [0, 0, 0]);
    ed.move('c1', [1, 0, 0]);
    ed.undo();
    expect(ed.state().future).toBe(1);
    ed.rotate('c1', 90);
    expect(ed.state().future).toBe(0);
    ed.redo();
    expect(ed.state().scene.parts[0]!.rotationYDeg).toBe(90);
    expect(ed.state().scene.parts[0]!.position).toEqual([0, 0, 0]);
  });

  it('SCN-011 the signal list grows and shrinks with the parts, with type and direction', () => {
    const ed = fresh();
    expect(ed.signals()).toEqual([]);
    ed.place('c1', 'conveyor', [0, 0, 0]);
    ed.place('l1', 'lamp', [3, 0, 3]);
    expect(ed.signals().map((s) => `${s.name}:${s.direction}:${s.type}`)).toEqual([
      'Conveyor1.run:command:BOOL',
      'Conveyor1.eye:sensor:BOOL',
      'Lamp1.on:command:BOOL',
    ]);
    ed.remove('c1');
    expect(ed.signals().map((s) => s.name)).toEqual(['Lamp1.on']);
  });

  it('SCN-015 a duplicate name is reported at the part that causes it, as the edit is made', () => {
    const ed = fresh();
    ed.place('c1', 'conveyor', [0, 0, 0]);
    ed.place('c2', 'conveyor', [3, 0, 3]);
    expect(ed.state().problems).toEqual([]);
    const returned = ed.configure('c2', { name: 'Conveyor1' });
    expect(returned).toHaveLength(1);
    expect(ed.state().problems).toEqual([expect.objectContaining({ partId: 'c2', path: 'parts[1].name' })]);
    expect(ed.state().problems[0]!.message.length).toBeGreaterThan(0);
    ed.configure('c2', { name: 'Conveyor2' });
    expect(ed.state().problems).toEqual([]);
  });

  it('SCN-016 the empty floor template is a valid scene with no parts', () => {
    expect(TEMPLATES[0]!.id).toBe('empty-floor');
    expect(TEMPLATES[0]!.scene.parts).toEqual([]);
    expect(validateScene(TEMPLATES[0]!.scene, cat)).toEqual([]);
    expect(TEMPLATES[0]!.names.en.length + TEMPLATES[0]!.names.es.length).toBeGreaterThan(0);
    const ed = createSceneEditor(cat, TEMPLATES[0]!.scene);
    expect(ed.state().problems).toEqual([]);
  });

  it('PRT-007 a conveyor placed near a conveyor end connects without manual alignment', () => {
    const ed = createSceneEditor(cat, TEMPLATES[0]!.scene);
    ed.place('c1', 'conveyor', [0, 0, 0], 90); // runs along -z (rotated 90 degrees about Y)
    const end = ed.state().scene.parts[0]!;
    expect(end.rotationYDeg).toBe(90);
    ed.place('c2', 'conveyor', [-0.05, 0, -1.1], 0);
    const c2 = ed.state().scene.parts[1]!;
    expect(c2.position).toEqual([0, 0, -1]);
    expect(c2.rotationYDeg).toBe(90);
    // far from every snap point it only snaps to the grid
    ed.place('c3', 'conveyor', [4.1, 0, 4.1]);
    expect(ed.state().scene.parts[2]!.position).toEqual([4, 0, 4]);
  });
});
