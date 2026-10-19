import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
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
const packages = loaded.packages;
const LOCALES = ['en', 'es'] as const;
/** Rioplatense voseo: a verb ending in a stressed -á, -é or -í (agregá, tené, elegí) or an -ás/-és/-ís form (necesitás), or "vos". */
const VOSEO = /\b(?:vos|[A-Za-zñ]+(?:á|é|í|ás|és|ís))(?![A-Za-zñ])/gi;
const NOT_VOSEO = new Set(['está', 'esté', 'así', 'además', 'demás', 'qué', 'través', 'después', 'más', 'país']);

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
  return check.ok ? { built: true, result: check.record.result, failed: check.record.failedAssertions.length } : { built: false, failed: 0 };
}

/** Copies the shipped starter into a scratch folder so no run can touch the checked-in example. */
function scratchStarter(lesson: LessonPackage): string {
  const root = join(workRoot, `${lesson.manifest.starter.project}-${counter++}`);
  cpSync(join(PROJECTS_DIRECTORY, lesson.manifest.starter.project), root, { recursive: true });
  return root;
}

function apply(root: string, check: LessonProgramCheck): void {
  for (const file of check.remove ?? []) rmSync(join(root, file), { force: true });
  for (const [file, content] of Object.entries(check.files)) writeFileSync(join(root, file), content);
}

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

describe('lesson packages (LRN-009, LRN-010, LRN-027)', () => {
  it('are all valid, and form one course', () => {
    expect(loaded.problems).toEqual([]);
    expect(validateCourse(packages)).toEqual([]);
    expect(packages.length).toBeGreaterThanOrEqual(10);
  });
});

for (const lesson of packages) {
  const { manifest, scenario, checks } = lesson;
  const starterRoot = join(PROJECTS_DIRECTORY, manifest.starter.project);

  describe(`lesson ${manifest.id} (LRN-025)`, () => {
    it('ships the reference scenario in its starter, byte for byte in content', () => {
      const shipped = JSON.parse(readFileSync(join(starterRoot, manifest.scenario.path), 'utf8')) as unknown;
      expect(canonicalJson(shipped)).toBe(lesson.scenarioBytes);
    });

    it('lists as regression checks only scenarios its starter ships', () => {
      const shipped = new Set(readdirSync(join(starterRoot, 'tests')).map((file) => (JSON.parse(readFileSync(join(starterRoot, 'tests', file), 'utf8')) as { id: string }).id));
      for (const id of manifest.regressionScenarios) expect(shipped.has(id)).toBe(true);
      expect(shipped.has(scenario.id)).toBe(true);
    });

    it('grades with a real scenario: at least 3 assertions', () => {
      expect(scenario.expectations.length).toBeGreaterThanOrEqual(3);
    });

    for (const locale of LOCALES) {
      it(`${locale}: every time and value it quotes exists in the reference scenario`, () => {
        expect(expandText(lesson.texts[locale], scenario).problems).toEqual([]);
      });

      it(`${locale}: every file it cites exists in the starter`, () => {
        const { text } = expandText(lesson.texts[locale], scenario);
        const strings = [text.title, text.summary, text.scope, ...text.objectives, ...text.faultCases, ...text.hints.map((hint) => hint.text), ...text.stages.flatMap((stage) => [stage.body, stage.checkpoint])];
        for (const file of strings.flatMap(citedFiles)) expect({ file, exists: existsSync(join(starterRoot, file)) }).toEqual({ file, exists: true });
      });

      it(`${locale}: states the real number of assertions in its Run stage`, () => {
        const { text } = expandText(lesson.texts[locale], scenario);
        const run = text.stages.find((stage) => stage.key === 'run')!;
        expect(run.checkpoint).toContain(String(scenario.expectations.length));
      });
    }

    it('es: addresses the learner as usted, never with voseo', () => {
      const { text } = expandText(lesson.texts.es, scenario);
      const strings = [text.title, text.summary, text.scope, ...text.objectives, ...text.faultCases, ...text.hints.map((hint) => hint.text), ...text.stages.flatMap((stage) => [stage.body, stage.checkpoint, stage.title])];
      const voseo = strings.flatMap((value) => value.match(VOSEO) ?? []).filter((word) => !NOT_VOSEO.has(word.toLowerCase()));
      expect(voseo).toEqual([]);
    });

    it('has the same structure in English and Spanish', () => {
      expect(textShape(lesson.texts.es)).toBe(textShape(lesson.texts.en));
    });

    itNative('starter is RED because an assertion fails, not because it does not build', async () => {
      expect(await grade(scratchStarter(lesson), lesson)).toMatchObject({ built: true, result: 'failed' });
      const check = await lessonCheck(scratchStarter(lesson), lesson.id, { clock });
      if (!check.ok) throw new Error('the starter must build and run');
      // LRN-026: every failed assertion names what was expected and where in the trace it failed.
      expect(check.record.failedAssertions.length).toBeGreaterThan(0);
      for (const failure of check.record.failedAssertions) {
        expect(Object.keys(failure.expected).length).toBeGreaterThan(0);
        expect(failure.trace).not.toBeNull();
      }
    }, 60_000);

    itNative(`reference solution (${manifest.solution.project}/${manifest.solution.program}) PASSES the reference scenario`, async () => {
      const root = scratchStarter(lesson);
      writeFileSync(join(root, manifest.starter.program), readFileSync(join(PROJECTS_DIRECTORY, manifest.solution.project, manifest.solution.program), 'utf8'));
      const check = await lessonCheck(root, lesson.id, { clock });
      expect(check.ok && { result: check.record.result, assertions: check.record.assertions, scenario: check.record.scenarioSha256 }).toEqual({ result: 'passed', assertions: { total: scenario.expectations.length, passed: scenario.expectations.length }, scenario: manifest.scenario.sha256 });
    }, 60_000);

    for (const { intent, ...check } of checks?.alsoGreen ?? []) {
      itNative(`another correct solution (${intent}) also PASSES`, async () => {
        const root = scratchStarter(lesson);
        apply(root, { intent, ...check });
        expect({ intent, ...await grade(root, lesson) }).toMatchObject({ intent, built: true, result: 'passed' });
      }, 60_000);
    }

    for (const { intent, ...check } of checks?.wrong ?? []) {
      itNative(`wrong program that ${intent} stays RED`, async () => {
        const root = scratchStarter(lesson);
        apply(root, { intent, ...check });
        expect({ intent, ...await grade(root, lesson) }).toMatchObject({ intent, built: true, result: 'failed' });
      }, 60_000);
    }
  });
}
