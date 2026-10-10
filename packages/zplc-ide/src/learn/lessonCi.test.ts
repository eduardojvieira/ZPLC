import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { scenarioRun } from '../cli/toolApi';
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

let workRoot = '';
let previousBinary: string | undefined;
let counter = 0;

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
});
afterAll(() => {
  if (previousBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
  else process.env.ZPLC_NATIVE_SIM_BIN = previousBinary;
  rmSync(workRoot, { recursive: true, force: true });
});

describe('lesson packages', () => {
  it('are all valid, and form one course', () => {
    expect(loaded.problems).toEqual([]);
    expect(validateCourse(packages)).toEqual([]);
    expect(packages.length).toBeGreaterThanOrEqual(10);
  });
});

for (const lesson of packages) {
  const { manifest, scenario, checks } = lesson;
  const starterRoot = join(PROJECTS_DIRECTORY, manifest.starter.project);

  describe(`lesson ${manifest.id}`, () => {
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

    it('has the same structure in English and Spanish', () => {
      expect(textShape(lesson.texts.es)).toBe(textShape(lesson.texts.en));
    });

    itNative('starter is RED because an assertion fails, not because it does not build', async () => {
      const result = await scenarioRun(scratchStarter(lesson), scenario.id);
      expect(result.ok).toBe(false);
      expect(result.evidence.diagnostics.map(({ code }) => code)).toEqual(['SCENARIO_ASSERTION_FAILED']);
    }, 60_000);

    itNative(`reference solution (${manifest.solution.project}/${manifest.solution.program}) turns the starter GREEN with the reference scenario kept`, async () => {
      const root = scratchStarter(lesson);
      const source = readFileSync(join(PROJECTS_DIRECTORY, manifest.solution.project, manifest.solution.program), 'utf8');
      writeFileSync(join(root, manifest.starter.program), source);
      const result = await scenarioRun(root, scenario.id);
      expect({ ok: result.ok, diagnostics: result.evidence.diagnostics }).toEqual({ ok: true, diagnostics: [] });
      expect(result.ok && result.preview.scenarios[0]).toMatchObject({ id: scenario.id, path: manifest.scenario.path, passed: true, totalAssertions: scenario.expectations.length });
    }, 60_000);

    for (const { intent, ...check } of checks?.alsoGreen ?? []) {
      itNative(`another correct solution (${intent}) also turns the starter GREEN`, async () => {
        const root = scratchStarter(lesson);
        apply(root, { intent, ...check });
        const result = await scenarioRun(root, scenario.id);
        expect({ intent, ok: result.ok, diagnostics: result.evidence.diagnostics }).toEqual({ intent, ok: true, diagnostics: [] });
      }, 60_000);
    }

    for (const { intent, ...check } of checks?.wrong ?? []) {
      itNative(`wrong program that ${intent} stays RED`, async () => {
        const root = scratchStarter(lesson);
        apply(root, { intent, ...check });
        const result = await scenarioRun(root, scenario.id);
        expect({ intent, ok: result.ok, codes: result.evidence.diagnostics.map(({ code }) => code) }).toEqual({ intent, ok: false, codes: ['SCENARIO_ASSERTION_FAILED'] });
      }, 60_000);
    }
  });
}
