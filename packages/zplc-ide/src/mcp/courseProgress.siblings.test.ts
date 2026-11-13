// The MCP course progress shows what the course view shows (M7-K5): the same passed lessons and the same count, an alternative pair
// counted once, the sibling not taken never listed as passed.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { LESSON_INDEX } from '../generated/lessonIndex';
import twoZeroIds from '../../../../tools/ci/two-zero-lesson-ids.json';
import { buildCourseView } from '../learn/course';
import type { LessonIndex } from '../learn/lessonPackage';
import { emptyProgress, withPassedIds } from '../../shared/learnProgressModel';
import { courseProgressResource, openMcpUserData, openMcpWorkspace } from './server';

// The 2.0 lessons of the generated index (tools/ci/two-zero-lesson-ids.json): the owner fixed 2.0 at 68 lessons and no pair.
const TWO_ZERO = new Set<string>(twoZeroIds);
const INDEX_2_0: LessonIndex = { ...LESSON_INDEX, lessons: LESSON_INDEX.lessons.filter((lesson) => TWO_ZERO.has(lesson.id)) };

const ST = 'first-blink-simulation';
const LADDER = `${ST}-ladder`;
const base = LESSON_INDEX.lessons.find((lesson) => lesson.id === ST)!;
const paired: LessonIndex = { ...LESSON_INDEX, lessons: [...LESSON_INDEX.lessons, { ...base, id: LADDER, order: base.order + 0.5 }] };
const temporary: string[] = [];
afterEach(() => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

/** The MCP resource for a progress document with `ids` passed, read from a user-data directory. */
async function resourceFor(index: LessonIndex, ids: string[]): Promise<Record<string, unknown>> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-sib-'));
  const userData = await mkdtemp(join(tmpdir(), 'zplc-mcp-sib-user-'));
  temporary.push(root, userData);
  await mkdir(join(root, 'src'));
  await writeFile(
    join(root, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: 'MCP test',
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
    }),
  );
  await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  await writeFile(join(userData, 'zplc-learn-progress.v2.json'), JSON.stringify(withPassedIds(emptyProgress(), ids)));
  const bound = await openMcpWorkspace(root);
  const user = await openMcpUserData(userData);
  return courseProgressResource({ ...bound!, userData: user! }, index);
}

describe('zplc://course/progress with alternative siblings', () => {
  test('lists only the sibling passed and counts the pair once, as the course view does', async () => {
    const resource = await resourceFor(paired, [LADDER]);
    const view = buildCourseView(paired, withPassedIds(emptyProgress(), [LADDER]), { locale: 'en', unlockAll: false });
    const states = view.modules.flatMap((module) => module.lessons);
    expect(resource.mastered).toEqual([LADDER]);
    expect(states.find((lesson) => lesson.id === ST)!.state).toBe('available');
    expect(states.filter((lesson) => lesson.state === 'passed').map((lesson) => lesson.id)).toEqual(resource.mastered as string[]);
    expect(resource.completed).toBe(view.passed);
    expect(resource.total).toBe(view.total);
    expect(view.total).toBe(LESSON_INDEX.lessons.length);
  });

  test('counts the pair once when both siblings are passed, and lists both', async () => {
    const resource = await resourceFor(paired, [ST, LADDER]);
    const view = buildCourseView(paired, withPassedIds(emptyProgress(), [ST, LADDER]), { locale: 'en', unlockAll: false });
    expect(resource.mastered).toEqual(expect.arrayContaining([ST, LADDER]));
    expect([resource.completed, resource.total]).toEqual([view.passed, view.total]);
    expect(resource.completed).toBe(1);
  });

  test('keeps the 2.0 count of a 2.0-only index', async () => {
    const resource = await resourceFor(INDEX_2_0, [ST]);
    expect(resource).toMatchObject({ ok: true, mastered: [ST], completed: 1, total: 68 });
  });
});
