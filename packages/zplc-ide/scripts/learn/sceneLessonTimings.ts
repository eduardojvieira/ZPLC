// Records the grade, the trace hash and the wall time of the starter and the solution of every scene lesson, graded through the
// application's own Check, so a change to the runtime exchange can be proven not to change any grade or trace.
//
//   bun scripts/learn/sceneLessonTimings.ts --out run.json [--compare old.json]
//
// `--compare` exits 1 and lists every lesson whose grade or traceSha256 differs; times are reported, never compared.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, uptime } from 'node:os';
import { join, resolve } from 'node:path';

import { LESSON_INDEX } from '../../src/generated/lessonIndex';
import { lessonCheck } from '../../src/learn/lessonCheck';
import type { LessonIndexEntry } from '../../src/learn/lessonPackage';

export interface TimedGrade {
  grade: string;
  traceSha256: string;
  ms: number;
}
export interface TimingsFile {
  commit: string;
  uptime: string;
  lessons: Array<{ id: string; starter: TimedGrade; solution: TimedGrade }>;
}

/** One line per lesson program whose grade or trace hash differs between two runs; times are never compared. */
export function compareTimings(before: TimingsFile, after: TimingsFile): string[] {
  const problems: string[] = [];
  for (const old of before.lessons) {
    const now = after.lessons.find((lesson) => lesson.id === old.id);
    if (!now) {
      problems.push(`${old.id}: missing from the new run`);
      continue;
    }
    for (const name of ['starter', 'solution'] as const)
      for (const key of ['grade', 'traceSha256'] as const)
        if (old[name][key] !== now[name][key]) problems.push(`${old.id} ${name}: ${key} ${old[name][key]} -> ${now[name][key]}`);
  }
  for (const now of after.lessons) if (!before.lessons.some((lesson) => lesson.id === now.id)) problems.push(`${now.id}: missing from the old run`);
  return problems;
}

const IDE = resolve(import.meta.dir, '../..');

async function gradeProgram(lesson: LessonIndexEntry, project: string): Promise<TimedGrade> {
  const source = join(IDE, 'projects', project);
  if (!existsSync(source)) throw new Error(`${lesson.id}: project ${project} does not exist`);
  const root = mkdtempSync(join(tmpdir(), 'zplc-scene-timings-'));
  try {
    cpSync(source, root, { recursive: true });
    const startedAt = performance.now();
    const result = await lessonCheck(root, lesson.id, { lessons: [lesson] });
    const ms = Math.round(performance.now() - startedAt);
    const traceSha256 = result.evidence?.artifacts.find((artifact) => artifact.kind === 'trace')?.sha256 ?? '';
    return { grade: result.ok ? result.record.result : result.reason, traceSha256, ms };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  const out = process.argv.includes('--out') ? arg('--out') : undefined;
  const compare = process.argv.includes('--compare') ? arg('--compare') : undefined;
  if (!out) {
    console.error('usage: sceneLessonTimings.ts --out <file> [--compare <old.json>]');
    process.exit(2);
  }
  process.env.ZPLC_NATIVE_SIM_BIN ??= resolve(IDE, '../../firmware/lib/zplc_core/build/zplc_runtime');
  const lessons: TimingsFile['lessons'] = [];
  for (const lesson of LESSON_INDEX.lessons.filter((entry) => entry.scene !== undefined)) {
    const starter = await gradeProgram(lesson, lesson.starter.project);
    const solution = await gradeProgram(lesson, lesson.solution.project);
    lessons.push({ id: lesson.id, starter, solution });
    console.log(`${lesson.id}: starter ${starter.grade} ${starter.ms} ms, solution ${solution.grade} ${solution.ms} ms`);
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: IDE, encoding: 'utf8' }).trim();
  const result: TimingsFile = { commit, uptime: `${Math.round(uptime())} s`, lessons };
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  const times = lessons.flatMap((lesson) => [lesson.starter.ms, lesson.solution.ms]);
  console.log(`${lessons.length} lessons, total ${times.reduce((a, b) => a + b, 0)} ms, slowest ${Math.max(...times)} ms`);
  if (compare) {
    const problems = compareTimings(JSON.parse(readFileSync(compare, 'utf8')) as TimingsFile, result);
    for (const problem of problems) console.error(problem);
    process.exit(problems.length === 0 ? 0 : 1);
  }
}
