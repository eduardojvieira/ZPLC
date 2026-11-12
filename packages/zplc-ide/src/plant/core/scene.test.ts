import { afterEach, describe, expect, it } from 'bun:test';
import type { PartDefinition, ScenePart } from '../contracts';
import { plantEditorEn, plantEditorEs } from '../../i18n/catalog/plantEditor';
import { createCatalogue } from './catalogue';
import { migrateScene, parseScene, SCENE_SCHEMA_VERSION, sceneSignals, validateScene } from './scene';

const belt: PartDefinition = {
  id: 'belt',
  family: 'conveyors',
  names: { en: 'Belt', es: 'Cinta' },
  config: { speedMps: { kind: 'number', min: 0.05, max: 2, default: 0.5, unit: 'm/s' } },
  signals: (p: ScenePart) => [{ name: `${p.name}.run`, direction: 'command', type: 'BOOL' }],
  actions: ['stall'],
  snapPoints: () => [],
  doc: { en: '', es: '' },
};
const box: PartDefinition = {
  id: 'box',
  family: 'items',
  names: { en: 'Box', es: 'Caja' },
  config: {},
  signals: () => [],
  actions: [],
  snapPoints: () => [],
  doc: { en: '', es: '' },
};
const cat = createCatalogue([belt, box]);

const part = (over: Record<string, unknown> = {}) => ({
  id: 'belt-1',
  part: 'belt',
  name: 'Belt1',
  position: [0, 0, 0],
  rotationYDeg: 0,
  config: { speedMps: 0.5 },
  ...over,
});
const scene = (parts: unknown[] = [part()], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  name: 'test',
  parts,
  cameras: [],
  ...extra,
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('scene', () => {
  it('PLT-002 a valid scene parses and lists its parts in file order', () => {
    const text = JSON.stringify(scene([part(), part({ id: 'box-1', part: 'box', name: 'Box1', config: {} })]));
    const parsed = parseScene(text);
    if (!('scene' in parsed)) throw new Error(JSON.stringify(parsed));
    expect(parsed.scene.parts.map((p) => p.id)).toEqual(['belt-1', 'box-1']);
    expect(validateScene(parsed.scene, cat)).toEqual([]);
    expect(parseScene('{nope')).toEqual({ problems: [{ path: '', message: expect.stringContaining('not valid JSON') }] });
  });

  it('PLT-002 a scene with an unknown part id names the part and the path', () => {
    const problems = validateScene(scene([part(), part({ id: 'x', name: 'X', part: 'turbo-belt' })]), cat);
    expect(problems).toEqual([{ path: 'parts[1].part', message: 'unknown part "turbo-belt"; the catalogue has: belt, box' }]);
  });

  it('PLT-002 loading a scene executes no code and fetches nothing', () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      throw new Error('fetch called');
    }) as unknown as typeof fetch;
    const text = JSON.stringify(
      scene([part({ config: { speedMps: 0.5, a: '__proto__', b: 'constructor', c: 'https://example.com/x.js' } })]),
    );
    const parsed = parseScene(text);
    if (!('scene' in parsed)) throw new Error(JSON.stringify(parsed));
    const config = parsed.scene.parts[0]!.config;
    expect(Object.getPrototypeOf(config)).toBe(Object.prototype);
    expect([config.a, config.b, config.c]).toEqual(['__proto__', 'constructor', 'https://example.com/x.js']);
    validateScene(parsed.scene, cat);
    expect(calls).toBe(0);
  });

  it('PLT-002 unknown keys and malformed fields are rejected with their path', () => {
    const problems = validateScene(scene([part({ extra: 1, position: [0, 0], id: 'Bad Id' })], { surprise: true }), cat);
    const paths = problems.map((p) => p.path).sort();
    expect(paths).toEqual(['parts[0].extra', 'parts[0].id', 'parts[0].position', 'surprise']);
  });

  it('PLT-002 a scene is limited to 512 parts', () => {
    const many = Array.from({ length: 513 }, (_, i) => part({ id: `b${i}`, name: `B${i}` }));
    expect(validateScene(scene(many), cat)).toEqual([{ path: 'parts', message: 'a scene holds at most 512 parts; this one has 513' }]);
  });

  it('PLT-016 a config value out of range is located', () => {
    expect(validateScene(scene([part({ config: { speedMps: 9 } })]), cat)).toEqual([
      { path: 'parts[0].config.speedMps', message: 'speedMps 9 is above the limit 2 m/s' },
    ]);
    expect(validateScene(scene([part({ config: { speedMps: 0 } })]), cat)[0]?.message).toBe('speedMps 0 is below the limit 0.05 m/s');
    expect(validateScene(scene([part({ config: { nope: 1 } })]), cat)[0]).toEqual({
      path: 'parts[0].config.nope',
      message: 'unknown setting "nope" for part "belt"; it has: speedMps',
    });
  });

  it('SCN-006 a scene written by a newer Studio fails with its version', () => {
    const result = migrateScene({ ...scene(), schemaVersion: 2 });
    if (!('problems' in result)) throw new Error('expected problems');
    expect(result.problems[0]!.path).toBe('schemaVersion');
    expect(result.problems[0]!.message).toContain('schemaVersion 2');
    expect(result.problems[0]!.message).toContain('this Studio reads 1');
  });

  it('SCN-006 a version 1 scene migrates to itself', () => {
    const value = scene();
    expect(migrateScene(value)).toEqual({ scene: value });
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-010 a part added to the catalogue needs no change to scene, link or lesson code', () => {
    const eye: PartDefinition = {
      ...box,
      id: 'eye',
      family: 'sensors',
      signals: (p) => [{ name: `${p.name}.detect`, direction: 'sensor', type: 'BOOL' }],
    };
    const bigger = createCatalogue([belt, box, eye]);
    const s = scene([part(), part({ id: 'eye-1', part: 'eye', name: 'EyeA', config: {} })]);
    expect(validateScene(s, bigger)).toEqual([]);
    expect(SCENE_SCHEMA_VERSION).toBe(1);
    const parsed = migrateScene(s);
    if (!('scene' in parsed)) throw new Error('expected scene');
    expect(sceneSignals(parsed.scene, bigger).map((x) => x.name)).toEqual(['Belt1.run', 'EyeA.detect']);
  });

  it('PLT-003 signals are derived and named Part.signal, unique per scene', () => {
    const dup = scene([part(), part({ id: 'belt-2', name: 'Belt1' })]);
    expect(validateScene(dup, cat)).toEqual([{ path: 'parts[1].name', message: 'name "Belt1" is already used by parts[0]' }]);
    const two = scene([part(), part({ id: 'belt-2', name: 'Belt2' })]);
    const parsed = migrateScene(two);
    if (!('scene' in parsed)) throw new Error('expected scene');
    expect(sceneSignals(parsed.scene, cat).map((x) => x.name)).toEqual(['Belt1.run', 'Belt2.run']);
  });
});

describe('scene messages', () => {
  it('PLT-016 the Spanish catalog has every plantScene key with the same placeholders', () => {
    const marks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const keys = Object.keys(plantEditorEn).filter((k) => k.startsWith('plantScene.'));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const es = (plantEditorEs as Record<string, string>)[key];
      expect(es, key).toBeDefined();
      expect(marks(es!), key).toEqual(marks((plantEditorEn as Record<string, string>)[key]!));
    }
  });
});
