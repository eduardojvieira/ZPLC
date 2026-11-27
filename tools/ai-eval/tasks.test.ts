/**
 * AIX-009: the fixed evaluation task set is only trustworthy if every task is well formed and its seeded failure is real.
 * No model is involved: the reference solution passes, the starter or the seeded program does not.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyReference, gradeBuild, gradeExplanation, loadTasks, stageTask, validateTasks, type EvalTask } from './lib';
import { nativeRuntimeBinary } from '../../packages/zplc-ide/src/cli/nativeRuntimeGuard';

process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
const scratch = mkdtempSync(join(tmpdir(), 'zplc-ai-eval-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const tasks = loadTasks();
const LANGUAGES = ['ST', 'IL', 'LD', 'FBD', 'SFC'];

describe('the task set shape', () => {
  it('has 15 must tasks: five languages times write, repair and explain', () => {
    expect(tasks.length).toBe(15);
    expect(validateTasks(tasks)).toEqual([]);
    for (const language of LANGUAGES)
      expect(tasks.filter((task) => task.language === language).map((task) => task.type).sort()).toEqual(['explain', 'repair', 'write']);
    expect(tasks.every((task) => task.level === 'must')).toBe(true);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(15);
  });

  it('keeps at least one seeded plant scene failure among the repair tasks and checks every fixture exists', () => {
    expect(tasks.some((task) => task.type === 'repair' && task.failure === 'scenario' && existsSync(join(task.dir, 'project', 'scene.json')))).toBe(
      true,
    );
    for (const task of tasks) expect(existsSync(join(task.dir, 'project', 'zplc.json'))).toBe(true);
  });

  it('rejects a malformed set with a message naming the task', () => {
    const broken = [{ ...tasks[0]!, type: 'rewrite' }] as unknown as EvalTask[];
    expect(validateTasks(broken).join('\n')).toContain(tasks[0]!.id);
  });
});

describe('write tasks: the starter fails, the reference solution passes', () => {
  for (const task of tasks.filter((entry) => entry.type === 'write'))
    it(`${task.id}`, async () => {
      const root = await stageTask(task, scratch);
      expect((await gradeBuild(task, root)).pass).toBe(false);
      await applyReference(task, root);
      expect((await gradeBuild(task, root)).pass).toBe(true);
    }, 60_000);
});

describe('repair tasks: the seeded program fails, the reference repair passes', () => {
  for (const task of tasks.filter((entry) => entry.type === 'repair'))
    it(`${task.id}`, async () => {
      const root = await stageTask(task, scratch);
      expect((await gradeBuild(task, root)).pass).toBe(false);
      await applyReference(task, root);
      expect((await gradeBuild(task, root)).pass).toBe(true);
    }, 60_000);
});

describe('explain tasks: the seeded failure is real and the rubric tells a good explanation from a vague one', () => {
  for (const task of tasks.filter((entry) => entry.type === 'explain'))
    it(`${task.id}`, async () => {
      const root = await stageTask(task, scratch);
      const graded = await gradeBuild(task, root);
      expect(graded.pass).toBe(false);
      // a build failure fails the check; a plant scenario failure builds and fails the run
      expect(graded.check).toBe(task.failure === 'scenario');
      expect(gradeExplanation(task.referenceExplanation!, task.rubric!).pass).toBe(true);
      expect(gradeExplanation('It does not work, something is wrong with the program.', task.rubric!).pass).toBe(false);
    }, 60_000);
});
