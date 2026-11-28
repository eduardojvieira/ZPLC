import { describe, expect, test } from 'bun:test';
import path from 'node:path';

import { LESSON_INDEX } from '../generated/lessonIndex';
import { MCP_CONTEXT_CAPS } from '../mcp/resources';
import { buildProjectContext, capContext, CONTEXT_CAPS, lessonIdOfWorkspace, type ProjectContextInput } from './projectContext';

const lessonEntry = LESSON_INDEX.lessons.find((lesson) => lesson.id === 'ld-no-nc-contacts')!;
const lessonText = {
  schemaVersion: 1,
  title: 'A stop button wired normally closed',
  summary: 'Stop the motor when the wire breaks.',
  scope: 'LD',
  objectives: ['Use an NC contact for Stop'],
  stages: [
    { key: 'objective', title: 'Goal', body: 'b', checkpoint: 'c' },
    { key: 'edit', title: 'Change the rung', body: 'b', checkpoint: 'c' },
  ],
  hints: [{ level: 1, text: 'Which contact opens when the wire breaks?' }],
  faultCases: [],
};

const input = (): ProjectContextInput => ({
  manifest: {
    name: 'Belt',
    network: { wifi: { ssid: 'lab', password: 'hunter2' } },
    communication: { mqtt: { broker: 'b', awsClaimKeyPath: '/claim', apiToken: 'tok' } },
  },
  scene: {
    schemaVersion: 1,
    name: 'Belt to sensor',
    parts: [{ id: 'belt-1', part: 'belt', name: 'Belt', position: { x: 1, y: 0, z: 0 }, rotationYDeg: 0, config: { secret: 's' } }],
    cameras: [],
  },
  plantMap: {
    schemaVersion: 2,
    target: { scene: 'belt' },
    signals: {
      'Belt.Run': { direction: 'command', type: 'BOOL', point: 'Main.Run' },
      'Eye.Level': {
        direction: 'sensor',
        type: 'REAL',
        point: 'Main.Level',
        range: { raw_min: 0, raw_max: 100, eng_min: 0, eng_max: 1, unit: 'm' },
      },
    },
  },
  bindingProblems: ['Eye.Level: Main.Level is not an input of the program'],
  scenarios: [
    {
      path: 'tests/belt.scenario.json',
      input: {
        schemaVersion: 1,
        id: 'Belt',
        tickMs: 10,
        durationMs: 500,
        scene: { file: 'plant-scenes/belt/scene.json', map: 'plant-scenes/belt/plant-map.json' },
        events: [{ atMs: 0, set: { 'Main.Start': true } }],
        expectations: [{ kind: 'within', fromMs: 0, withinMs: 100, condition: { 'Belt.Run': true, 'fact:itemsDropped': false } }],
      },
    },
  ],
  failedScenarios: [
    {
      id: 'Belt',
      assertions: [{ index: 0, kind: 'within', atMs: 100, checks: [{ signal: 'Belt.Run', expected: true, observed: false }] }],
    },
  ],
  facts: { 'fact:itemsDropped': 2, 'Main.Run': true },
  diagnostics: [{ code: 'E_TYPE', message: 'x'.repeat(400), path: 'src/Main.ld.json', line: 3, column: 7, element: 'rung:r1' }],
  lesson: { manifest: lessonEntry, text: lessonText, stage: 'edit' },
});

describe('one project context for the assistant and an MCP client (AIX-001)', () => {
  test('reads the scene, the plant map, the scenarios, the failed checks, the facts and the diagnostics with their message', () => {
    const context = buildProjectContext(input(), { solutionsHidden: false });
    expect(context.plant).toEqual({
      scene: { name: 'Belt to sensor', parts: [{ id: 'belt-1', name: 'Belt', part: 'belt' }] },
      signals: [
        { name: 'Belt.Run', direction: 'command', type: 'BOOL', point: 'Main.Run' },
        {
          name: 'Eye.Level',
          direction: 'sensor',
          type: 'REAL',
          point: 'Main.Level',
          range: { raw_min: 0, raw_max: 100, eng_min: 0, eng_max: 1, unit: 'm' },
        },
      ],
      problems: ['Eye.Level: Main.Level is not an input of the program'],
    });
    expect(context.scenarios).toEqual([
      {
        id: 'Belt',
        path: 'tests/belt.scenario.json',
        tickMs: 10,
        durationMs: 500,
        scene: 'plant-scenes/belt/scene.json',
        events: 1,
        expectations: [{ kind: 'within', fromMs: 0, withinMs: 100, signals: ['Belt.Run', 'fact:itemsDropped'] }],
      },
    ]);
    expect(context.failedScenarios).toEqual(input().failedScenarios);
    expect(context.facts).toEqual({ 'fact:itemsDropped': 2 });
    expect(context.diagnostics).toEqual([
      { code: 'E_TYPE', message: 'x'.repeat(256), path: 'src/Main.ld.json', line: 3, column: 7, element: 'rung:r1' },
    ]);
  });

  test('never carries a credential field: the manifest goes through the assistant filter, scene configs are left out', () => {
    const text = JSON.stringify(buildProjectContext(input(), { solutionsHidden: false }));
    expect(text).not.toMatch(/hunter2|password|awsClaimKeyPath|\/claim|apiToken|"tok"|secret/);
    expect(text).toContain('"ssid":"lab"');
  });

  test('bounds the failed checks it passes on: 4 scenarios, 8 assertions, 8 checks', () => {
    const checks = Array.from({ length: 10 }, (_, i) => ({ signal: `S${i}`, expected: true, observed: false }));
    const assertions = Array.from({ length: 10 }, (_, index) => ({ index, kind: 'at', atMs: 0, checks }));
    const failedScenarios = Array.from({ length: 6 }, (_, i) => ({ id: `F${i}`, assertions }));
    const context = buildProjectContext({ ...input(), failedScenarios }, { solutionsHidden: false });
    expect(context.failedScenarios).toHaveLength(4);
    expect(context.failedScenarios![0]!.assertions).toHaveLength(8);
    expect(context.failedScenarios![0]!.assertions[0]!.checks).toHaveLength(8);
  });
});

describe('the lesson in the context (AIX-002, D-32)', () => {
  test('gives the goal and the stage, and never a solution, whether solutions are shown or hidden', () => {
    for (const solutionsHidden of [false, true]) {
      const context = buildProjectContext(input(), { solutionsHidden });
      expect(context.lesson).toMatchObject({
        lessonId: 'ld-no-nc-contacts',
        title: 'A stop button wired normally closed',
        languages: ['LD'],
        goal: 'Stop the motor when the wire breaks.',
        objectives: ['Use an NC contact for Stop'],
        stage: { key: 'edit', title: 'Change the rung' },
        solutionsHidden,
      });
      expect(JSON.stringify(context)).not.toContain(lessonEntry.solution.project);
    }
  });

  test('with solutions hidden the last hint, which gives the answer away, is left out; shown, every hint is there', () => {
    const two = {
      ...input(),
      lesson: {
        ...input().lesson!,
        text: { ...lessonText, hints: [...lessonText.hints, { level: 2, text: 'Swap the contact for a normally open one.' }] },
      },
    };
    expect(buildProjectContext(two, { solutionsHidden: true }).lesson?.hints).toEqual([
      { level: 1, text: 'Which contact opens when the wire breaks?' },
    ]);
    expect(buildProjectContext(two, { solutionsHidden: false }).lesson?.hints).toHaveLength(2);
    expect(JSON.stringify(buildProjectContext(two, undefined))).not.toContain('normally open one');
  });

  test('a renderer-side value cannot turn solutions back on: only the policy the main process read decides', () => {
    const forged = {
      ...input(),
      hideSolutions: false,
      solutionsHidden: false,
      lesson: { ...input().lesson!, solutionsHidden: false, hideSolutions: false },
    } as unknown as ProjectContextInput;
    expect(buildProjectContext(forged, { solutionsHidden: true }).lesson?.solutionsHidden).toBe(true);
  });

  test('knows a lesson workspace by its folder under learn-workspaces, and nothing else', () => {
    const root = path.join('/u', 'learn-workspaces');
    expect(lessonIdOfWorkspace(path.join(root, 'ld-no-nc-contacts'), root)).toBe('ld-no-nc-contacts');
    expect(lessonIdOfWorkspace(path.join(root, 'ld-no-nc-contacts', 'src'), root)).toBeUndefined();
    expect(lessonIdOfWorkspace(path.join(root, '..', 'project'), root)).toBeUndefined();
    expect(lessonIdOfWorkspace('/home/me/project', root)).toBeUndefined();
  });

  test('without a policy, or with a null one, solutions are hidden', () => {
    for (const policy of [undefined, null]) {
      expect(buildProjectContext(input(), policy as never).lesson?.solutionsHidden).toBe(true);
    }
  });
});

describe('the bounds of the context are the ones of the MCP side (AIX-001)', () => {
  test('CONTEXT_CAPS is MCP_CONTEXT_CAPS', () => {
    expect(CONTEXT_CAPS).toEqual(MCP_CONTEXT_CAPS);
  });

  test('capContext cuts lists, text, keys and depth to those caps', () => {
    const wide = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, i]));
    const deep = (n: number): unknown => (n === 0 ? 'leaf' : { next: deep(n - 1) });
    const capped = capContext({ list: Array.from({ length: 100 }, (_, i) => i), text: 'x'.repeat(400), wide, deep: deep(12) }) as {
      list: number[];
      text: string;
      wide: Record<string, number>;
      deep: unknown;
    };
    expect(capped.list).toHaveLength(64);
    expect(capped.text).toHaveLength(256);
    expect(Object.keys(capped.wide)).toHaveLength(64);
    expect(JSON.stringify(capped.deep).match(/next/g)).toHaveLength(7);
  });
});
