import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { VOSEO_MARKERS } from '../../../../tools/ci/i18n-guard';
import { starterMayBeUngraded } from '../../../../tools/ci/scene-lessons';
import { itNative, nativeRuntimeBinary, platformLimit } from '../cli/nativeRuntimeGuard';
import { lessonCheck } from './lessonCheck';
import { citedFiles, canonicalJson, expandText, textShape, type LessonProgramCheck } from './lessonPackage';
import { PROJECTS_DIRECTORY, loadLessonPackages, validateCourse, type LessonPackage } from './lessonPackageFiles';

/**
 * Lesson CI (LRN-025). Every lesson package is checked, in both languages, against the real compiler, test engine and
 * native POSIX runtime:
 *   1. the starter FAILS the reference scenario because an assertion fails, not because it does not build;
 *   2. the reference solution PASSES it;
 *   3. each deliberately wrong program stays RED, and every other correct program is GREEN, so the scenario grades
 *      behaviour and not one technique;
 *   4. every time and value the text quotes exists in the reference scenario, and every file it cites exists in the starter.
 * The lesson list is the lesson packages: adding a lesson adds its tests, with no change here.
 */

const loaded = loadLessonPackages();
/**
 * The lessons that a Windows simulator cannot grade: it has no Modbus, MQTT, loopback or device link (firmware/lib/zplc_core/
 * CMakeLists.txt, if(NOT WIN32)), so their passing programs get 2 of 6 assertions there. The Guide of each lesson says so. On
 * those lessons the "PASSES" cases are registered as skips that carry this reason; Linux and macOS run them.
 */
const NO_COMMUNICATION_ON_WINDOWS = Object.fromEntries(
  ['modbus-coil-fbd', 'modbus-register-round-trip', 'mqtt-publish-subscribe'].map((id) => [
    id,
    'known limit on win32: the Windows simulator has no Modbus, MQTT, loopback or device link',
  ]),
);
/**
 * CI runs this file in parts (tools/ci/test-shards.ts): ZPLC_LESSON_PART=i/n keeps every n-th lesson package from the i-th,
 * and part 1 also keeps the two describes that belong to no lesson. Without the variable (or with it empty) every case runs.
 */
const partOption = process.env.ZPLC_LESSON_PART || '1/1';
const [, part = 0, parts = 0] = (/^(\d+)\/(\d+)$/.exec(partOption) ?? []).map(Number);
if (part < 1 || part > parts) throw new Error(`ZPLC_LESSON_PART must be i/n with 1 <= i <= n, not "${partOption}"`);
const packages = loaded.packages.filter((_, index) => index % parts === part - 1);
const LOCALES = ['en', 'es'] as const;
/**
 * The voseo forms in one string, from the deny-list of actual voseo forms the catalog guard uses (UX-030): "vos", "tenés",
 * "agregá". A rule on stressed endings would also reject correct Spanish such as "será" or "entre sí".
 */
const VOSEO = new RegExp(VOSEO_MARKERS.source, 'giu');
const voseoIn = (value: string): string[] => value.match(VOSEO) ?? [];

let workRoot = '';
let previousBinary: string | undefined;
/**
 * The session Studio starts gives a program a Modbus server and an MQTT broker of their own (COM-009), and the
 * Communications lessons are graded against them. The lesson CI runs the same session environment, so a lesson that
 * talks to an endpoint is graded the way the product grades it.
 */
const COMMUNICATION_ENVIRONMENT = { ZPLC_NATIVE_COMM: '1', ZPLC_NATIVE_LOOPBACK: '1' } as const;
const previousCommunication: Record<string, string | undefined> = {};
let counter = 0;
const clock = () => new Date('2026-10-10T12:00:00.000Z');
/** The grade the product gives the program of `root` for the lesson: its reference scenario, not the workspace's. */
async function grade(root: string, lesson: LessonPackage): Promise<{ built: boolean; result?: string; failed: number }> {
  const check = await lessonCheck(root, lesson.id, { clock });
  return check.ok
    ? { built: true, result: check.record.result, failed: check.record.failedAssertions.length }
    : { built: false, failed: 0 };
}

/** Copies the shipped starter into a scratch folder so no run can touch the checked-in example. */
function scratchStarter(lesson: LessonPackage): string {
  const root = join(workRoot, `${lesson.manifest.starter.project}-${counter++}`);
  cpSync(join(PROJECTS_DIRECTORY, lesson.manifest.starter.project), root, { recursive: true });
  return root;
}

/**
 * A scene-building lesson's starter has not built its scene yet, so a program of a check cannot be graded on it: the check runs
 * on the scene and plant map of the solution (a learner who built the scene right and wrote another program).
 */
function onBuiltScene(root: string, lesson: LessonPackage): void {
  if (!lesson.manifest.scene) return;
  const starter = join(PROJECTS_DIRECTORY, lesson.manifest.starter.project);
  const solution = join(PROJECTS_DIRECTORY, lesson.manifest.solution.project);
  if (readFileSync(join(starter, 'scene.json'), 'utf8') === readFileSync(join(solution, 'scene.json'), 'utf8')) return;
  for (const file of ['scene.json', 'plant-map.json']) cpSync(join(solution, file), join(root, file));
}

function apply(root: string, check: LessonProgramCheck): void {
  for (const file of check.remove ?? []) rmSync(join(root, file), { force: true });
  for (const [file, content] of Object.entries(check.files)) writeFileSync(join(root, file), content);
}

/**
 * A compile plus a native run of one lesson, 9 s at a load average of 50: a hang guard that the grade does not measure (the lesson clock is
 * injected).
 */
const LOADED_NATIVE_MS = 240_000;

beforeAll(() => {
  workRoot = mkdtempSync(join(tmpdir(), 'zplc-lesson-ci-'));
  previousBinary = process.env.ZPLC_NATIVE_SIM_BIN;
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
  for (const [name, value] of Object.entries(COMMUNICATION_ENVIRONMENT)) {
    previousCommunication[name] = process.env[name];
    process.env[name] = value;
  }
});
afterAll(() => {
  if (previousBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
  else process.env.ZPLC_NATIVE_SIM_BIN = previousBinary;
  for (const [name, value] of Object.entries(previousCommunication)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(workRoot, { recursive: true, force: true });
});

if (part === 1) {
  describe('the voseo guard of the lesson text (LRN-029)', () => {
    it('LRN-029 names actual voseo forms and leaves correct Spanish alone: future forms, "sí", "así"', () => {
      expect(voseoIn('El resultado será el mismo, entre sí, y quedará así; la planta lo mostrará.')).toEqual([]);
      expect(voseoIn('Agregá el contacto, guardá el archivo y tenés el resultado.')).toEqual(['Agregá', 'guardá', 'tenés']);
    });
  });

  describe('lesson packages (LRN-009, LRN-010, LRN-027)', () => {
    it('registers a Windows known limit only for lessons that exist', () => {
      const ids = new Set(loaded.packages.map(({ id }) => id));
      expect(Object.keys(NO_COMMUNICATION_ON_WINDOWS).filter((id) => !ids.has(id))).toEqual([]);
    });

    it('are all valid, and form one course', () => {
      expect(loaded.problems).toEqual([]);
      expect(validateCourse(loaded.packages)).toEqual([]);
      expect(loaded.packages.length).toBeGreaterThanOrEqual(10);
    });
  });
}

for (const lesson of packages) {
  const { manifest, scenario, checks } = lesson;
  const limit = platformLimit(NO_COMMUNICATION_ON_WINDOWS, lesson.id);
  /** A case that needs the communication peers: a skip named with its reason where the platform has none. */
  const itPeers = (
    limit ? (name: string, ...rest: unknown[]) => (it.skip as (...args: unknown[]) => unknown)(`${name} (${limit})`, ...rest) : itNative
  ) as typeof itNative;
  const starterRoot = join(PROJECTS_DIRECTORY, manifest.starter.project);

  describe(`lesson ${manifest.id} (LRN-025)`, () => {
    it('ships the reference scenario in its starter, byte for byte in content', () => {
      const shipped = JSON.parse(readFileSync(join(starterRoot, manifest.scenario.path), 'utf8')) as unknown;
      expect(canonicalJson(shipped)).toBe(lesson.scenarioBytes);
    });

    it('lists as regression checks only scenarios its starter ships', () => {
      const shipped = new Set(
        readdirSync(join(starterRoot, 'tests')).map(
          (file) => (JSON.parse(readFileSync(join(starterRoot, 'tests', file), 'utf8')) as { id: string }).id,
        ),
      );
      for (const id of manifest.regressionScenarios) expect(shipped.has(id)).toBe(true);
      expect(shipped.has(scenario.id)).toBe(true);
    });

    it('grades with a real scenario: at least 3 assertions', () => {
      expect(scenario.expectations.length).toBeGreaterThanOrEqual(3);
    });

    for (const locale of LOCALES) {
      it(`${locale}: every time and value it quotes exists in the reference scenario`, () => {
        expect(expandText(lesson.texts[locale], scenario, locale).problems).toEqual([]);
      });

      it(`${locale}: every file it cites exists in the starter`, () => {
        const { text } = expandText(lesson.texts[locale], scenario, locale);
        const strings = [
          text.title,
          text.summary,
          text.scope,
          ...text.objectives,
          ...text.faultCases,
          ...text.hints.map((hint) => hint.text),
          ...text.stages.flatMap((stage) => [stage.body, stage.checkpoint]),
        ];
        for (const file of strings.flatMap(citedFiles))
          expect({ file, exists: existsSync(join(starterRoot, file)) }).toEqual({ file, exists: true });
      });

      it(`${locale}: states the real number of assertions in its Run stage`, () => {
        const { text } = expandText(lesson.texts[locale], scenario, locale);
        const run = text.stages.find((stage) => stage.key === 'run')!;
        expect(run.checkpoint).toContain(String(scenario.expectations.length));
      });
    }

    it('LRN-029 es: addresses the learner as usted, never with voseo', () => {
      const { text } = expandText(lesson.texts.es, scenario, 'es');
      const strings = [
        text.title,
        text.summary,
        text.scope,
        ...text.objectives,
        ...text.faultCases,
        ...text.hints.map((hint) => hint.text),
        ...text.stages.flatMap((stage) => [stage.body, stage.checkpoint, stage.title]),
      ];
      const voseo = strings.flatMap(voseoIn);
      expect(voseo).toEqual([]);
    });

    it('LRN-029 has the same structure in English and Spanish', () => {
      expect(textShape(lesson.texts.es)).toBe(textShape(lesson.texts.en));
    });

    itNative(
      'starter is RED because an assertion fails, not because it does not build',
      async () => {
        const root = scratchStarter(lesson);
        const first = await lessonCheck(root, lesson.id, { clock });
        // A scene-building starter lacks parts the scenario names: the Check says which and grades nothing (the guard's rule).
        if (!first.ok && manifest.scene) {
          const sceneOf = (project: string) => readFileSync(join(PROJECTS_DIRECTORY, project, 'scene.json'), 'utf8');
          const codes = (first.evidence?.diagnostics ?? []).map(({ code }) => code);
          expect({
            codes,
            allowed: starterMayBeUngraded(sceneOf(manifest.starter.project), sceneOf(manifest.solution.project), codes),
          }).toEqual({
            codes,
            allowed: true,
          });
          return;
        }
        expect(await grade(root, lesson)).toMatchObject({ built: true, result: 'failed' });
        const check = await lessonCheck(scratchStarter(lesson), lesson.id, { clock });
        if (!check.ok) throw new Error('the starter must build and run');
        // LRN-026: every failed assertion names what was expected and where in the trace it failed.
        expect(check.record.failedAssertions.length).toBeGreaterThan(0);
        for (const failure of check.record.failedAssertions) {
          expect(Object.keys(failure.expected).length).toBeGreaterThan(0);
          expect(failure.trace).not.toBeNull();
        }
      },
      LOADED_NATIVE_MS,
    );

    itPeers(
      `reference solution (${manifest.solution.project}/${manifest.solution.program}) PASSES the reference scenario`,
      async () => {
        const root = scratchStarter(lesson);
        onBuiltScene(root, lesson);
        writeFileSync(
          join(root, manifest.starter.program),
          readFileSync(join(PROJECTS_DIRECTORY, manifest.solution.project, manifest.solution.program), 'utf8'),
        );
        const check = await lessonCheck(root, lesson.id, { clock });
        expect(
          check.ok && { result: check.record.result, assertions: check.record.assertions, scenario: check.record.scenarioSha256 },
        ).toEqual({
          result: 'passed',
          assertions: { total: scenario.expectations.length, passed: scenario.expectations.length },
          scenario: manifest.scenario.sha256,
        });
      },
      LOADED_NATIVE_MS,
    );

    for (const { intent, ...check } of checks?.alsoGreen ?? []) {
      itPeers(
        `another correct solution (${intent}) also PASSES`,
        async () => {
          const root = scratchStarter(lesson);
          onBuiltScene(root, lesson);
          apply(root, { intent, ...check });
          expect({ intent, ...(await grade(root, lesson)) }).toMatchObject({ intent, built: true, result: 'passed' });
        },
        LOADED_NATIVE_MS,
      );
    }

    for (const { intent, ...check } of checks?.wrong ?? []) {
      itNative(
        `wrong program that ${intent} stays RED`,
        async () => {
          const root = scratchStarter(lesson);
          onBuiltScene(root, lesson);
          apply(root, { intent, ...check });
          expect({ intent, ...(await grade(root, lesson)) }).toMatchObject({ intent, built: true, result: 'failed' });
        },
        LOADED_NATIVE_MS,
      );
    }
  });
}
