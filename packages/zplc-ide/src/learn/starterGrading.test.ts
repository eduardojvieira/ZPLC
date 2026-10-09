import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { scenarioRun } from '../cli/toolApi';
import { learnLessonCatalog } from '../components/learnLesson';
import type { LearnLessonId } from '../components/learnLesson';
import { starterGrading } from './wrongPrograms';

/**
 * The Learn loop is "the starter fails (RED), the learner fixes it, GREEN, mastery is recorded". It is only sound when
 * the graded scenario can tell the lesson's solution from a program that merely turns the scenario green. These tests
 * run the real compiler, test engine and native POSIX runtime over every lesson and pin three properties:
 *   1. the shipped starter is RED because an assertion fails (not because it does not build);
 *   2. the reference solution, dropped into the starter with the starter scenario kept, is GREEN;
 *   3. each deliberately wrong program stays RED, so it cannot record mastery.
 */

const projects = join(import.meta.dir, '..', '..', 'projects');

/** Lessons whose graded scenario is NOT a byte-for-byte copy of the reference project's scenario, and why. */
const ownScenario: Partial<Record<LearnLessonId, string>> = {
  'blinky-ladder-timer-feedback': 'the reference blinky scenario only asserts two edges and describes the Ladder 10 ms blip; the starter teaches the ST 500 ms oscillator and needs duty assertions',
  'temporal-assertions-jam-fault': 'lesson 9 grades the latched jam fault and its Reset timing, which Conveyor01 does not assert; the reference project has no such scenario yet',
};

interface ScenarioFile { readonly id: string; readonly expectations: readonly unknown[] }
const readScenario = (path: string): ScenarioFile => JSON.parse(readFileSync(path, 'utf8')) as ScenarioFile;
const starterProgramFile = (starter: string): string => {
  const manifest = JSON.parse(readFileSync(join(projects, starter, 'zplc.json'), 'utf8')) as { tasks: Array<{ programs: string[] }> };
  return manifest.tasks[0]!.programs[0]!;
};

let workRoot = '';
let previousBinary: string | undefined;
let counter = 0;
/** Copies the shipped starter into a scratch folder so no run can touch the checked-in example. */
function scratchStarter(starter: string): string {
  const root = join(workRoot, `${starter}-${counter++}`);
  cpSync(join(projects, starter), root, { recursive: true });
  return root;
}

beforeAll(() => {
  workRoot = mkdtempSync(join(tmpdir(), 'zplc-learn-grading-'));
  previousBinary = process.env.ZPLC_NATIVE_SIM_BIN;
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
});
afterAll(() => {
  if (previousBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
  else process.env.ZPLC_NATIVE_SIM_BIN = previousBinary;
  rmSync(workRoot, { recursive: true, force: true });
});

describe('Learn starters can tell the lesson solution from a wrong program', () => {
  it('has a wrong-program table for every lesson, with at least two wrong programs each', () => {
    expect(Object.keys(starterGrading)).toEqual(learnLessonCatalog.en.map(({ id }) => id));
    for (const [id, { wrong }] of Object.entries(starterGrading)) expect({ id, wrong: wrong.length >= 2 }).toEqual({ id, wrong: true });
  });

  for (const lesson of learnLessonCatalog.en) {
    const { referenceSource, wrong } = starterGrading[lesson.id];
    const starterFile = starterProgramFile(lesson.starterExampleId);

    describe(lesson.id, () => {
      it('ships the reference scenario in the starter (or documents why it differs)', () => {
        const starter = readScenario(join(projects, lesson.starterExampleId, lesson.scenarioPath));
        expect(starter.id).toBe(lesson.requiredScenario);
        if (ownScenario[lesson.id]) expect(ownScenario[lesson.id]!.length).toBeGreaterThan(40);
        else expect(starter).toEqual(readScenario(join(projects, lesson.referenceExampleId, lesson.scenarioPath)));
      });

      it('grades with a real scenario: at least 3 expectations and exactly the rubric minimum', () => {
        const starter = readScenario(join(projects, lesson.starterExampleId, lesson.scenarioPath));
        expect(starter.expectations.length).toBeGreaterThanOrEqual(3);
        expect(lesson.rubric.minimumAssertions).toBe(starter.expectations.length);
      });

      itNative('starter is RED because an assertion fails, not because it does not build', async () => {
        const result = await scenarioRun(scratchStarter(lesson.starterExampleId), lesson.requiredScenario);
        expect(result.ok).toBe(false);
        expect(result.evidence.diagnostics.map(({ code }) => code)).toEqual(['SCENARIO_ASSERTION_FAILED']);
      }, 60_000);

      itNative(`reference solution (${referenceSource ?? starterFile}) turns the starter GREEN with the starter scenario kept`, async () => {
        const root = scratchStarter(lesson.starterExampleId);
        copyFileSync(join(projects, lesson.referenceExampleId, 'src', referenceSource ?? starterFile), join(root, 'src', starterFile));
        const result = await scenarioRun(root, lesson.requiredScenario);
        expect({ ok: result.ok, diagnostics: result.evidence.diagnostics }).toEqual({ ok: true, diagnostics: [] });
        expect(result.ok && result.preview.scenarios[0]).toMatchObject({ id: lesson.requiredScenario, path: lesson.scenarioPath, passed: true, totalAssertions: lesson.rubric.minimumAssertions });
      }, 60_000);

      for (const { intent, source } of wrong) {
        itNative(`wrong program that ${intent} stays RED`, async () => {
          const root = scratchStarter(lesson.starterExampleId);
          writeFileSync(join(root, 'src', starterFile), source);
          const result = await scenarioRun(root, lesson.requiredScenario);
          expect({ intent, ok: result.ok, codes: result.evidence.diagnostics.map(({ code }) => code) }).toEqual({ intent, ok: false, codes: ['SCENARIO_ASSERTION_FAILED'] });
        }, 60_000);
      }
    });
  }
});
