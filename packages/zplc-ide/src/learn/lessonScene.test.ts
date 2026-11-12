import { afterEach, describe, expect, it } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LESSONS_DIRECTORY, buildIndex, loadCourse, loadLessonPackages, scenarioHash } from './lessonPackageFiles';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

const LESSON = 'motor-plant-feedback';
const SCENE = 'fixture-cell';
const sceneFile = { schemaVersion: 1, name: SCENE, cameras: [], parts: [] };
const sceneMap = {
  schemaVersion: 2,
  target: { scene: SCENE },
  signals: {
    'Belt1.run': { direction: 'command', type: 'BOOL', point: 'MotorPlant.Command' },
    'EyeA.detect': { direction: 'sensor', type: 'BOOL', point: 'MotorPlant.AtSpeed' },
  },
};
const sceneBlock = { file: 'scene.json', map: 'plant-map.json', script: [] };

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));

/** A copy of the lessons in which `motor-plant-feedback` ships the fixture scene instead of the 2.0 motor plant. */
function sceneLessons(
  over: { manifest?: Record<string, unknown>; scenario?: Record<string, unknown>; map?: unknown; scene?: unknown } = {},
) {
  const lessons = mkdtempSync(join(tmpdir(), 'zplc-scene-lessons-'));
  const scenes = mkdtempSync(join(tmpdir(), 'zplc-scenes-'));
  temporary.push(lessons, scenes);
  cpSync(LESSONS_DIRECTORY, lessons, { recursive: true });
  const directory = join(lessons, LESSON);
  const scenario = readJson(join(directory, 'scenario.json'));
  delete scenario.plant;
  const changed = { ...scenario, scene: sceneBlock, ...over.scenario };
  write(join(directory, 'scenario.json'), changed);
  const manifest = readJson(join(directory, 'lesson.json'));
  write(join(directory, 'lesson.json'), {
    ...manifest,
    plant: null,
    scene: SCENE,
    scenario: { ...(manifest.scenario as object), sha256: scenarioHash(changed) },
    ...over.manifest,
  });
  write(join(directory, 'plant-map.json'), over.map ?? sceneMap);
  mkdirSync(join(scenes, SCENE));
  write(join(scenes, SCENE, 'scene.json'), over.scene ?? sceneFile);
  return { lessons, scenes, problems: () => loadLessonPackages(lessons, undefined, scenes).problems.filter((p) => p.includes(LESSON)) };
}

describe('a lesson package may name a scene (CRS-003, CRS-004, LNK-001, PLT-013)', () => {
  it('CRS-003 a manifest names the scene the lesson ships', () => {
    const { lessons, scenes, problems } = sceneLessons();
    expect(problems()).toEqual([]);
    const loaded = loadLessonPackages(lessons, undefined, scenes);
    const lesson = loaded.packages.find((p) => p.id === LESSON)!;
    expect(lesson.manifest.scene).toBe(SCENE);
    const entry = buildIndex(loaded.packages, loadCourse(lessons).course!).index.lessons.find((l) => l.id === LESSON)!;
    expect(entry.scene).toBe(SCENE);
    expect(entry.plant).toBeNull();
  });

  it('CRS-004 a scene lesson is data only: adding one changes no application code', () => {
    // The fixture above is a folder of JSON files and nothing else: it loads and indexes with the code of the 2.0 loader.
    const { lessons, scenes } = sceneLessons();
    const files = (root: string): string[] =>
      readdirSync(root, { recursive: true })
        .map(String)
        .filter((f) => statSync(join(root, f)).isFile());
    expect(files(join(lessons, LESSON)).filter((f) => /\.(ts|tsx|js)$/.test(f))).toEqual([]);
    expect(files(join(scenes, SCENE))).toEqual(['scene.json']);
    expect(loadLessonPackages(lessons, undefined, scenes).packages.some((p) => p.id === LESSON)).toBe(true);
  });

  it('PLT-013 a 2.0 manifest, with scene absent, validates exactly as before: 68 packages, none naming a scene', () => {
    const loaded = loadLessonPackages();
    expect(loaded.problems).toEqual([]);
    expect(loaded.packages).toHaveLength(68);
    expect(loaded.packages.filter((p) => p.manifest.scene !== undefined)).toEqual([]);
    const { index } = buildIndex(loaded.packages, loadCourse().course!);
    expect(index.lessons.filter((entry) => 'scene' in entry)).toEqual([]);
  });

  it('LNK-001 a manifest with both plant and scene is rejected with a located message', () => {
    const { problems } = sceneLessons({ manifest: { plant: 'motor-v1' } });
    expect(problems().some((p) => p.startsWith(`${LESSON}/lesson.json: manifest.scene: `) && p.includes('plant'))).toBe(true);
  });

  it('LNK-001 a scene must be a slug, and null means no scene', () => {
    expect(sceneLessons({ manifest: { scene: '../up' } }).problems()[0]).toContain('manifest.scene');
    expect(
      sceneLessons({ manifest: { scene: null } })
        .problems()
        .some((p) => p.includes('scene')),
    ).toBe(true);
  });

  it('LNK-001 the map must target the scene the manifest names, and the scene must ship', () => {
    const wrong = sceneLessons({ map: { ...sceneMap, target: { scene: 'other' } } });
    expect(wrong.problems()).toContain(`${LESSON}/plant-map.json: scene "other" differs from the manifest scene "${SCENE}"`);
    const rmScene = sceneLessons();
    rmSync(join(rmScene.scenes, SCENE), { recursive: true });
    expect(rmScene.problems()).toContain(
      `${LESSON}: the lesson names the scene "${SCENE}" but plant-scenes/${SCENE}/scene.json does not exist`,
    );
    const broken = sceneLessons({ scene: { schemaVersion: 1 } });
    expect(broken.problems().some((p) => p.startsWith(`${LESSON}/scene ${SCENE}: `))).toBe(true);
  });

  it('LNK-001 a scene lesson needs a scene block in its scenario and no plant there', () => {
    const noBlock = sceneLessons();
    const file = join(noBlock.lessons, LESSON, 'scenario.json');
    const bare = readJson(file);
    delete bare.scene;
    write(file, bare);
    expect(noBlock.problems().some((p) => p.includes('has a scenario with a "scene" block'))).toBe(true);
    const both = sceneLessons({ scenario: { plant: 'motor-v1' } });
    expect(both.problems().some((p) => p.includes('scenario.plant'))).toBe(true);
  });
});
