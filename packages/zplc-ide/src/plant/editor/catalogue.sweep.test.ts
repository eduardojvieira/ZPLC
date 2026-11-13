import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import type { ConfigField, PartDefinition, PlantSceneFile } from '../contracts';
import { catalogue } from '../core/catalogue';
import '../core/plantCore'; // registers the shipped parts
import { migrateScene, parseScene, sceneSignals, validateScene } from '../core/scene';
import { createSceneEditor, GRID_M, TEMPLATES } from './model';

const parts = catalogue.list();
const json = (s: unknown) => JSON.stringify(s);
/** Opens an editor on the empty floor with one part of `def` placed off-grid; returns the editor and the part id. */
function withPart(def: PartDefinition) {
  const ed = createSceneEditor(catalogue);
  const id = ed.place('p1', def.id, [1.1, 0, 2.3], 7);
  if (typeof id !== 'string') throw new Error(`${def.id} cannot be placed: ${id.problem}`);
  return { ed, id };
}
const outside = (f: ConfigField, side: 'low' | 'high') => (side === 'high' ? (f.max ?? 0) + 1 : (f.min ?? 0) - 1);

describe('the scene editor against every part of the catalogue', () => {
  it('PRT-010 the catalogue lists every part once, and every part has an id the editor can use', () => {
    expect(parts.length).toBeGreaterThanOrEqual(40);
    expect(new Set(parts.map((d) => d.id)).size).toBe(parts.length);
    for (const d of parts) expect(d.id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  for (const def of parts) {
    describe(`part ${def.id}`, () => {
      it(`SCN-008 ${def.id} places on the grid and moves, rotates, duplicates and removes`, () => {
        const { ed, id } = withPart(def);
        const placed = ed.state().scene.parts[0]!;
        expect(placed.part).toBe(def.id);
        // Nothing else is in the scene: the position is the grid, not a snap point.
        expect(placed.position.map((n) => Math.abs(n / GRID_M - Math.round(n / GRID_M)) < 1e-9)).toEqual([true, true, true]);
        expect(placed.rotationYDeg).toBe(0);
        ed.move(id, [3.1, 0, -1.1]);
        expect(ed.state().scene.parts[0]!.position).toEqual([3, 0, -1]);
        ed.rotate(id, 100);
        expect(ed.state().scene.parts[0]!.rotationYDeg).toBe(105);
        ed.rotate(id, 113);
        expect(ed.state().scene.parts[0]!.rotationYDeg).toBe(120);
        const copy = ed.duplicate(id);
        const [a, b] = ed.state().scene.parts;
        expect(copy).not.toBe(id);
        expect(b!.id).toBe(copy);
        expect(b!.name).not.toBe(a!.name);
        expect(b!.part).toBe(def.id);
        expect(b!.config).toEqual(a!.config);
        expect(ed.state().selection).toBe(copy);
        ed.remove(copy);
        expect(ed.state().scene.parts.map((p) => p.id)).toEqual([id]);
        ed.remove(id);
        expect(ed.state().scene.parts).toEqual([]);
      });

      it(`SCN-009 ${def.id} accepts every limit of its config and refuses a value outside it, at its path`, () => {
        const { ed, id } = withPart(def);
        for (const [key, f] of Object.entries(def.config)) {
          const path = `parts[0].config.${key}`;
          const refusals: unknown[][] = [];
          const accepted: (number | string | boolean)[] = [];
          if (f.kind === 'number') {
            if (f.min !== undefined) {
              accepted.push(f.min);
              refusals.push([outside(f, 'low')]);
            }
            if (f.max !== undefined) {
              accepted.push(f.max);
              refusals.push([outside(f, 'high')]);
            }
            refusals.push(['not a number']);
          } else if (f.kind === 'enum') {
            accepted.push(...(f.values ?? []));
            refusals.push(['no-such-value']);
          } else {
            accepted.push(true, false);
            refusals.push(['yes']);
          }
          for (const value of accepted) {
            expect(ed.configure(id, { config: { [key]: value } }).filter((p) => p.path === path)).toEqual([]);
            expect(ed.state().scene.parts[0]!.config[key]).toBe(value);
          }
          for (const [value] of refusals) {
            const before = json(ed.toFile());
            const problems = ed.configure(id, { config: { [key]: value as number } });
            expect(problems.length).toBeGreaterThan(0);
            expect(problems.map((p) => p.path)).toContain(path);
            expect(problems.find((p) => p.path === path)!.partId).toBe(id);
            expect(problems.find((p) => p.path === path)!.message.length).toBeGreaterThan(0);
            expect(json(ed.toFile())).toBe(before); // a refused value is not applied
          }
        }
        expect(ed.configure(id, { config: { noSuchSetting: 1 } }).map((p) => p.path)).toEqual(['parts[0].config.noSuchSetting']);
      });

      it(`SCN-010 ${def.id} undoes and redoes every edit kind byte for byte`, () => {
        const { ed, id } = withPart(def);
        const steps: (() => unknown)[] = [
          () => ed.move(id, [2, 0, 2]),
          () => ed.rotate(id, 90),
          () => ed.configure(id, { name: 'Renamed1' }),
          () => ed.duplicate(id),
          () => ed.place('p9', def.id, [-3, 0, -3]),
          () => ed.remove(id),
        ];
        const states = [json(ed.toFile())];
        for (const step of steps) {
          step();
          states.push(json(ed.toFile()));
        }
        for (let i = steps.length; i > 0; i--) {
          ed.undo();
          expect(json(ed.toFile())).toBe(states[i - 1]!);
        }
        expect(ed.state().past).toBe(1); // only the original placement remains
        for (let i = 1; i <= steps.length; i++) {
          ed.redo();
          expect(json(ed.toFile())).toBe(states[i]!);
        }
        expect(ed.state().future).toBe(0);
      });

      it(`SCN-011 ${def.id} lists its signals with type and direction, and takes them away on remove`, () => {
        const { ed, id } = withPart(def);
        const name = ed.state().scene.parts[0]!.name;
        const signals = ed.signals();
        expect(signals).toEqual(def.signals(ed.state().scene.parts[0]!));
        expect(signals).toEqual(sceneSignals(ed.toFile(), catalogue));
        for (const s of signals) {
          expect(s.name.startsWith(`${name}.`)).toBe(true);
          expect(['command', 'sensor']).toContain(s.direction);
          expect(['BOOL', 'INT', 'DINT', 'REAL']).toContain(s.type);
        }
        expect(new Set(signals.map((s) => s.name)).size).toBe(signals.length);
        ed.remove(id);
        expect(ed.signals()).toEqual([]);
        ed.undo();
        expect(ed.signals()).toEqual(signals);
      });

      it(`SCN-015 ${def.id} reports a duplicate name at the part that repeats it and keeps it`, () => {
        const { ed, id } = withPart(def);
        const second = ed.place('p2', def.id, [3, 0, 3]);
        expect(second).toBe('p2');
        const first = ed.state().scene.parts[0]!.name;
        const problems = ed.configure('p2', { name: first });
        const at = problems.find((p) => p.path === 'parts[1].name');
        expect(at?.partId).toBe('p2');
        expect(at?.message).toContain(first);
        expect(ed.state().scene.parts[1]!.name).toBe(first);
        expect(ed.state().problems.some((p) => p.partId === 'p2' && p.path === 'parts[1].name')).toBe(true);
        expect(ed.state().problems.some((p) => p.partId === id)).toBe(false);
        // A name that is not a name at all is refused and not applied.
        expect(ed.configure('p2', { name: '1 bad name' }).map((p) => p.path)).toContain('parts[1].name');
        expect(ed.state().scene.parts[1]!.name).toBe(first);
      });

      it(`SCN-008 ${def.id} refuses every edit while the plant runs and changes nothing`, () => {
        const { ed, id } = withPart(def);
        const before = json(ed.toFile());
        ed.setRunning(true);
        const edits = [
          () => ed.place('p2', def.id, [1, 0, 1]),
          () => ed.move(id, [1, 0, 1]),
          () => ed.rotate(id, 90),
          () => ed.duplicate(id),
          () => ed.remove(id),
          () => ed.configure(id, { name: 'Other1' }),
          () => ed.undo(),
          () => ed.redo(),
        ];
        for (const edit of edits) expect(edit).toThrow('while the plant is stopped');
        expect(json(ed.toFile())).toBe(before);
        ed.setRunning(false);
        ed.undo();
        expect(ed.state().scene.parts).toEqual([]);
      });
    });
  }
});

describe('scene templates (SCN-016)', () => {
  const reopen = (scene: PlantSceneFile) => {
    const ed = createSceneEditor(catalogue);
    ed.load(scene);
    expect(ed.state().problems).toEqual([]);
    expect(validateScene(ed.toFile(), catalogue)).toEqual([]);
    const saved = json(ed.toFile());
    expect(parseScene(saved)).toEqual({ scene: ed.toFile() });
    const again = createSceneEditor(catalogue);
    again.load(JSON.parse(saved) as PlantSceneFile);
    expect(json(again.toFile())).toBe(saved);
    return ed;
  };

  it('SCN-016 the empty floor opens, validates and saves and reopens equal', () => {
    const floor = TEMPLATES.find((t) => t.id === 'empty-floor')!;
    expect(floor.names.en.length).toBeGreaterThan(0);
    expect(floor.names.es.length).toBeGreaterThan(0);
    expect(reopen(floor.scene).toFile().parts).toEqual([]);
  });

  it('SCN-016 every shipped scene opens as a template and validates', () => {
    expect(SCENE_INDEX.length).toBe(21);
    for (const entry of SCENE_INDEX) {
      const file = readFileSync(join(import.meta.dir, '../../..', entry.dir, 'scene.json'), 'utf8');
      const opened = parseScene(file);
      if (!('scene' in opened)) throw new Error(`${entry.id} does not open: ${json(opened.problems)}`);
      expect(migrateScene(JSON.parse(file))).toEqual(opened);
      const ed = reopen(opened.scene);
      expect(ed.toFile()).toEqual(opened.scene);
      expect(ed.signals().length).toBeGreaterThan(0);
      expect(entry.names.en.length).toBeGreaterThan(0);
    }
  });
});
