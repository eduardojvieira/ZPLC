import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { readWorkspaceProjectFile } from '../cli/workspace';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { runSceneCheck } from '../plant/ci/sceneCheck';
import { lessonCheck, type LessonCheckResult } from './lessonCheck';
import { canonicalJson, type LessonIndexEntry } from './lessonPackage';
import { scenarioHash } from './lessonPackageFiles';

/**
 * A scene lesson in the application (CRS-004, CRS-005, CRS-006, SCN-012). No real scene lesson exists yet, so the fixture is a
 * lesson index entry built over the data of the shipped scene `belt-to-sensor`: its scene, map and scenario are the lesson's
 * data, its reference and starter programs are the learner's. The verdict must equal the CI scene harness's.
 */
const SCENE_DIR = join(import.meta.dir, '..', '..', 'plant-scenes', 'belt-to-sensor');
const read = (file: string): string => readFileSync(join(SCENE_DIR, file), 'utf8');
const scenario = JSON.parse(read('scenario.json')) as { expectations: unknown[] };
const LESSON_ID = 'fixture-belt-to-sensor';
const clock = () => new Date('2026-11-13T12:00:00.000Z');

const entry = {
  id: LESSON_ID,
  version: 1,
  scene: 'belt-to-sensor',
  plant: null,
  scenario: {
    id: 'belt-to-sensor',
    path: 'tests/belt-to-sensor.scenario.json',
    sha256: scenarioHash(scenario),
    tickMs: 10,
    durationMs: 8000,
    assertions: scenario.expectations.length,
    canonical: canonicalJson(scenario),
  },
} as unknown as LessonIndexEntry;

let workRoot = '';
let previousBinary: string | undefined;
let counter = 0;
beforeAll(() => {
  workRoot = mkdtempSync(join(tmpdir(), 'zplc-scene-lesson-'));
  previousBinary = process.env.ZPLC_NATIVE_SIM_BIN;
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
});
afterAll(() => {
  if (previousBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
  else process.env.ZPLC_NATIVE_SIM_BIN = previousBinary;
  rmSync(workRoot, { recursive: true, force: true });
});

/** The project a learner opens: the starter program and, at the project root, the two files of the scene. */
function workspace(program: 'starter' | 'reference', over: { scene?: string; map?: string } = {}): string {
  const root = join(workRoot, `ws-${counter++}`);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: 'Belt to sensor',
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['BeltToSensor.st'] }],
    }),
  );
  writeFileSync(join(root, 'src', 'BeltToSensor.st'), read(`${program}.st`));
  writeFileSync(join(root, 'scene.json'), over.scene ?? read('scene.json'));
  writeFileSync(join(root, 'plant-map.json'), over.map ?? read('plant-map.json'));
  return root;
}
const check = (root: string): Promise<LessonCheckResult> => lessonCheck(root, LESSON_ID, { clock, lessons: [entry] });
const messages = (result: LessonCheckResult): string =>
  (result.evidence?.diagnostics ?? []).map((d) => `${d.path} ${d.message}`).join('\n');

describe('a scene lesson in the application (CRS-004, CRS-005, CRS-006, SCN-012)', () => {
  it('CRS-004 a scene lesson opens its scene.json and plant-map.json in the learner project', async () => {
    const root = workspace('starter');
    for (const file of ['scene.json', 'plant-map.json']) {
      const loaded = await readWorkspaceProjectFile(root, file, 64 * 1024);
      expect(loaded.ok).toBe(true);
      if (loaded.ok) expect(Buffer.from(loaded.bytes).toString('utf8')).toBe(read(file));
    }
    for (const path of ['../scene.json', '/etc/passwd', 'a/../../scene.json', 'src\\x', 'missing.json']) {
      const refused = await readWorkspaceProjectFile(root, path, 64 * 1024);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.diagnostics[0]?.path).toBe(path);
    }
  });

  itNative(
    'CRS-005 Check on the starter fails on a plant fact and passes on the reference, as the CI scene harness says',
    async () => {
      const ci = await runSceneCheck(SCENE_DIR, 'native');
      expect(ci.problems).toEqual([]);
      expect([ci.solution, ci.starter]).toEqual(['pass', 'fail']);
      const starter = await check(workspace('starter'));
      const reference = await check(workspace('reference'));
      expect(starter.ok && reference.ok).toBe(true);
      if (!starter.ok || !reference.ok) return;
      expect(starter.record.result).toBe(ci.starter === 'pass' ? 'passed' : 'failed');
      expect(reference.record.result).toBe(ci.solution === 'pass' ? 'passed' : 'failed');
      expect(starter.record).toMatchObject({ lessonId: LESSON_ID, scenarioSha256: entry.scenario.sha256, time: clock().toISOString() });
      // the starter fails on the plant fact, not only on the outputs
      expect(starter.record.failedAssertions.some((failure) => 'fact:count:EyeFar' in failure.expected)).toBe(true);
      expect(reference.record).toMatchObject({ failedAssertions: [], assertions: { total: entry.scenario.assertions } });
    },
    60_000,
  );

  itNative(
    'SCN-012 a map signal bound to a variable the program lacks is a located message that names the signal',
    async () => {
      const map = JSON.parse(read('plant-map.json')) as { signals: Record<string, { point: string }> };
      map.signals['Belt1.run']!.point = 'BeltToSensor.Nowhere';
      const result = await check(workspace('reference', { map: JSON.stringify(map) }));
      expect(result).toMatchObject({ ok: false, reason: 'not-graded' });
      expect(messages(result)).toContain('plant-map.json');
      expect(messages(result)).toContain('Nowhere');
    },
    60_000,
  );

  itNative(
    'SCN-012 a scene without the part the map names fails with a located message, not with a silent false',
    async () => {
      const scene = read('scene.json').replace(/"EyeFar"/g, '"EyeGone"');
      expect(scene).not.toBe(read('scene.json'));
      const result = await check(workspace('reference', { scene }));
      expect(result.ok).toBe(false);
      expect(messages(result)).toMatch(/scene\.json|plant-map\.json|EyeFar/);
    },
    60_000,
  );

  itNative(
    'SCN-012 a scene or a map that does not parse is a located message',
    async () => {
      const badScene = await check(workspace('reference', { scene: '{ nope' }));
      expect(badScene).toMatchObject({ ok: false, reason: 'not-graded' });
      expect(messages(badScene)).toContain('scene.json');
      const badMap = await check(workspace('reference', { map: '{"schemaVersion":2,"signals":[]}' }));
      expect(badMap).toMatchObject({ ok: false, reason: 'not-graded' });
      expect(messages(badMap)).toContain('plant-map.json');
    },
    60_000,
  );

  itNative(
    'CRS-006 the grade runs headless and finishes in at most 60000 ms',
    async () => {
      const startedAt = performance.now();
      const result = await check(workspace('reference'));
      expect(performance.now() - startedAt).toBeLessThanOrEqual(60_000);
      expect(result.ok).toBe(true);
    },
    70_000,
  );

  itNative(
    'PLT-013 a 2.0 plant lesson opens and grades as before: the starter fails, the reference passes',
    async () => {
      const lesson = LESSON_INDEX.lessons.find((candidate) => candidate.id === 'motor-plant-feedback')!;
      expect(lesson.scene).toBeUndefined();
      const projects = join(import.meta.dir, '..', '..', 'projects');
      const root = join(workRoot, `ws-${counter++}`);
      cpSync(join(projects, lesson.starter.project), root, { recursive: true });
      const starter = await lessonCheck(root, lesson.id, { clock });
      expect(starter.ok && starter.record.result).toBe('failed');
      writeFileSync(join(root, lesson.starter.program), readFileSync(join(projects, lesson.solution.project, lesson.solution.program)));
      const solved = await lessonCheck(root, lesson.id, { clock });
      expect(solved.ok && solved.record.result).toBe('passed');
    },
    60_000,
  );

  it('CRS-004 a lesson that is not in the index is unknown, scene or not', async () => {
    expect(await lessonCheck(workspace('starter'), 'no-such-lesson', { lessons: [entry] })).toEqual({
      ok: false,
      reason: 'unknown-lesson',
    });
  });
});
