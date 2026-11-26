// AIX-002, D-32: in a lesson an agent reads the goal, the objectives and the hints, never the reference solution. Whether
// solutions are hidden is read from `<userData>/zplc-learn-policy.v1.json` (shared/learnPolicyModel.ts) and fails closed: no
// file, a broken file, or no --user-data at all means hidden. No tool, argument or resource can turn it off.
import { afterEach, describe, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { LEARN_POLICY_FILENAME } from '../../shared/learnPolicyModel';
import { buildProjectContext } from '../ai/projectContext';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { lessonCurrentResource } from './resources';
import { buildMcpServer, openMcpUserData, openMcpWorkspace, type McpWorkspace } from './server';

const LESSON = 'ld-no-nc-contacts';
const entry = LESSON_INDEX.lessons.find((lesson) => lesson.id === LESSON)!;

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

/** A user-data folder holding the lesson's workspace, as Studio lays it out, and the policy file when given. */
async function lessonWorkspace(policy?: string, withUserData = true): Promise<McpWorkspace> {
  const userData = await mkdtemp(join(tmpdir(), 'zplc-mcp-lesson-'));
  temporary.push(userData);
  const root = join(userData, 'learn-workspaces', LESSON);
  await mkdir(join(userData, 'learn-workspaces'));
  await cp(fileURLToPath(new URL(`../../projects/${entry.starter.project}`, import.meta.url)), root, { recursive: true });
  if (policy !== undefined) await writeFile(join(userData, LEARN_POLICY_FILENAME), policy);
  const workspace = await openMcpWorkspace(root);
  expect(workspace).toBeDefined();
  const data = withUserData ? await openMcpUserData(userData) : undefined;
  return { ...workspace!, ...(data ? { userData: data } : {}) };
}

/** The solution program, as the solution project holds it: none of it may reach an agent. */
async function solutionText(): Promise<string> {
  return readFile(fileURLToPath(new URL(`../../projects/${entry.solution.project}/${entry.solution.program}`, import.meta.url)), 'utf8');
}

function expectNoSolution(body: unknown, solution: string) {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/"solution"\s*:/i);
  expect(text).not.toContain(`"${entry.solution.project}"`);
  expect(text).not.toContain(solution.slice(0, 200));
}

describe('AIX-002 zplc://lesson/current reads the lesson goal and never its solution', () => {
  test('with hideSolutions true in <userData>, the lesson answers its goal and hints, solutionsHidden true, and no solution', async () => {
    const body = await lessonCurrentResource(await lessonWorkspace(JSON.stringify({ hideSolutions: true })));
    expect(body).toMatchObject({ ok: true, lesson: { lessonId: LESSON, solutionsHidden: true } });
    const lesson = JSON.parse(JSON.stringify(body)).lesson;
    expect(lesson.goal).toBe(entry.text.en.summary);
    expect(lesson.objectives.length).toBeGreaterThan(0);
    expect(lesson.hints.length).toBeGreaterThan(0);
    expectNoSolution(body, await solutionText());
  });

  test('a missing or broken policy file is read as hidden', async () => {
    for (const policy of [undefined, '{', JSON.stringify({ hideSolutions: 'no' }), JSON.stringify({ hideSolutions: false, extra: 1 })]) {
      const body = await lessonCurrentResource(await lessonWorkspace(policy));
      expect((body as { lesson: { solutionsHidden: boolean } }).lesson.solutionsHidden, String(policy)).toBe(true);
    }
  });

  test('without --user-data the lesson is still found by its folder and its solutions are hidden', async () => {
    const body = await lessonCurrentResource(await lessonWorkspace(JSON.stringify({ hideSolutions: false }), false));
    expect(body).toMatchObject({ ok: true, lesson: { lessonId: LESSON, solutionsHidden: true } });
  });

  test('with hideSolutions false the flag says so, and the resource still carries no solution', async () => {
    const body = await lessonCurrentResource(await lessonWorkspace(JSON.stringify({ hideSolutions: false })));
    expect((body as { lesson: { solutionsHidden: boolean } }).lesson.solutionsHidden).toBe(false);
    expectNoSolution(body, await solutionText());
  });

  test('a project that is not a lesson workspace answers MCP_NOT_FOUND', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-lesson-'));
    temporary.push(root);
    await cp(fileURLToPath(new URL(`../../projects/${entry.starter.project}`, import.meta.url)), root, { recursive: true });
    const workspace = await openMcpWorkspace(root);
    expect(await lessonCurrentResource(workspace!)).toMatchObject({ ok: false, error: 'MCP_NOT_FOUND' });
  });

  test('no tool takes an argument that turns hideSolutions off, and lesson/current takes none', async () => {
    const workspace = await lessonWorkspace(JSON.stringify({ hideSolutions: true }));
    const proto = McpServer.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    const registerTool = proto.registerTool;
    const schemas: Array<[string, { safeParse: (value: unknown) => { success: boolean } }]> = [];
    proto.registerTool = function (this: unknown, name: string, config: { inputSchema: never }, callback: unknown) {
      schemas.push([name, config.inputSchema]);
      return registerTool.call(this, name, config, callback);
    } as never;
    try {
      buildMcpServer(workspace);
    } finally {
      proto.registerTool = registerTool;
    }
    for (const [name, schema] of schemas)
      for (const key of ['hideSolutions', 'solutionsHidden', 'showSolution', 'solution'])
        expect(schema.safeParse({ [key]: false }).success, `${name} accepted '${key}'`).toBe(false);
  });

  test('the assistant context builder carries no solution either, hidden or not', async () => {
    const solution = await solutionText();
    for (const solutionsHidden of [true, false]) {
      const context = buildProjectContext({ lesson: { manifest: entry, text: entry.text.en } }, { solutionsHidden });
      expect(context.lesson?.solutionsHidden).toBe(solutionsHidden);
      expectNoSolution(context, solution);
    }
  });
});
