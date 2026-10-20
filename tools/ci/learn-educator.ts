// Educator tools of Learn (LRN-033). Both read the generated lesson index and, for `verify`, the file given. No account, no server.
//
//   bun tools/ci/learn-educator.ts verify <progress.json> [--strict]
//       Checks an exported progress file against the lesson hashes: for every passed lesson, the grade record must have been
//       taken in simulation against the current scenario of the lesson (same id, same SHA-256, same number of assertions).
//       Prints one line per lesson. Exit 0 when no lesson is a mismatch (with --strict, also none unverified), 1 when one is
//       or the file is not a progress file, 2 for a wrong command line.
//   bun tools/ci/learn-educator.ts outline [--locale en|es] [--format markdown|html]
//       Prints the course outline with the objectives of every lesson, to stdout; the HTML page is self-contained and prints.
//
// A grade record shows what Studio recorded on the learner's computer; it is evidence of the lesson's current scenario, not proof
// against a learner who edits the file by hand. The tool says so; it does not claim more.
import { readFile } from 'node:fs/promises';

import { parseImport } from '../../packages/zplc-ide/electron/learnProgressModel';
import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex';
import { courseOrder } from '../../packages/zplc-ide/src/learn/course';
import type { LessonIndex, LessonLocale } from '../../packages/zplc-ide/src/learn/lessonPackage';

export type LessonVerdict = 'verified' | 'unverified' | 'mismatch' | 'in-progress' | 'unknown-lesson';
export interface LessonVerification { id: string; status: LessonVerdict; detail: string }
export interface Verification { ok: boolean; problem: string | null; lessons: LessonVerification[] }

export function verifyProgress(text: string, index: LessonIndex, options: { strict?: boolean } = {}): Verification {
  const parsed = parseImport(text);
  if (!parsed.ok) return { ok: false, problem: `not a progress file (${parsed.reason})`, lessons: [] };
  const lessons: LessonVerification[] = Object.entries(parsed.progress.lessons).map(([id, progress]): LessonVerification => {
    const entry = index.lessons.find((candidate) => candidate.id === id);
    if (!entry) return { id, status: 'unknown-lesson', detail: '' };
    if (progress.state === 'in-progress') return { id, status: 'in-progress', detail: '' };
    const grade = progress.grade;
    if (!grade) return { id, status: 'unverified', detail: 'passed without a grade record' };
    const problems = [
      grade.track !== 'simulation' ? `track ${grade.track}` : '',
      grade.scenarioId !== entry.scenario.id ? `scenario ${grade.scenarioId}` : '',
      grade.scenarioSha256 !== entry.scenario.sha256 ? `scenario hash ${grade.scenarioSha256.slice(0, 12)} is not ${entry.scenario.sha256.slice(0, 12)}` : '',
      grade.assertions.total !== entry.scenario.assertions ? `${grade.assertions.total} assertions, not ${entry.scenario.assertions}` : '',
    ].filter(Boolean);
    return problems.length > 0 ? { id, status: 'mismatch', detail: problems.join('; ') } : { id, status: 'verified', detail: '' };
  });
  const failed = lessons.some((lesson) => lesson.status === 'mismatch' || (options.strict === true && lesson.status === 'unverified'));
  return { ok: !failed, problem: null, lessons };
}

const LABELS = {
  en: { course: 'Course outline', objectives: 'Objectives', time: 'About {n} min', prerequisites: 'Requires', languages: 'Languages', tracks: 'Tracks', none: 'none', module: 'Module' },
  es: { course: 'Esquema del curso', objectives: 'Objetivos', time: 'Unos {n} min', prerequisites: 'Requiere', languages: 'Lenguajes', tracks: 'Rutas', none: 'ninguna', module: 'Módulo' },
} as const;

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderOutline(index: LessonIndex, locale: LessonLocale, format: 'markdown' | 'html'): string {
  const label = LABELS[locale];
  const ordered = courseOrder(index);
  const titles = new Map(ordered.map((lesson) => [lesson.id, lesson.text[locale].title]));
  const trackTitle = (id: string): string => index.course.tracks.find((track) => track.id === id)?.title[locale] ?? id;
  const lines: string[] = [];
  const heading = (level: number, text: string): void => { lines.push(format === 'markdown' ? `${'#'.repeat(level)} ${text}` : `<h${level}>${escapeHtml(text)}</h${level}>`); };
  const paragraph = (text: string): void => { lines.push(format === 'markdown' ? text : `<p>${escapeHtml(text)}</p>`); };
  const list = (items: readonly string[]): void => { lines.push(format === 'markdown' ? items.map((item) => `- ${item}`).join('\n') : `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`); };
  heading(1, label.course);
  for (const module of index.course.modules) {
    heading(2, `${label.module} ${module.id}: ${module.title[locale]}`);
    for (const lesson of ordered.filter((candidate) => candidate.module === module.id)) {
      heading(3, lesson.text[locale].title);
      paragraph([
        label.time.replace('{n}', String(lesson.estimatedMinutes)),
        `${label.languages}: ${lesson.languages.join(', ')}`,
        `${label.tracks}: ${lesson.tracks.map(trackTitle).join(', ')}`,
        `${label.prerequisites}: ${lesson.prerequisites.length > 0 ? lesson.prerequisites.map((id) => titles.get(id) ?? id).join(', ') : label.none}`,
      ].join('. ') + '.');
      paragraph(`${label.objectives}:`);
      list(lesson.text[locale].objectives);
    }
  }
  if (format === 'markdown') return `${lines.join('\n\n')}\n`;
  const style = 'body{font:12pt/1.4 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}h2{margin-top:1.6em;break-after:avoid}h3{margin-bottom:.2em;break-after:avoid}p{margin:.2em 0}li{break-inside:avoid}@media print{body{margin:0;max-width:none}h2{break-before:page}h2:first-of-type{break-before:auto}}';
  return `<!doctype html>\n<html lang="${locale}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(label.course)}</title>\n<style>${style}</style>\n</head>\n<body>\n${lines.join('\n')}\n</body>\n</html>\n`;
}

export interface EducatorIo { read(path: string): Promise<string>; write(line: string): void }

export async function runEducator(args: readonly string[], io: EducatorIo): Promise<number> {
  const [command, ...rest] = args;
  const option = (name: string): string | undefined => { const at = rest.indexOf(name); return at >= 0 ? rest[at + 1] : undefined; };
  if (command === 'verify') {
    const path = rest.find((arg) => !arg.startsWith('--'));
    if (!path) { io.write('usage: learn-educator.ts verify <progress.json> [--strict]'); return 2; }
    let text: string;
    try { text = await io.read(path); } catch { io.write(`cannot read ${path}`); return 1; }
    const result = verifyProgress(text, LESSON_INDEX, { strict: rest.includes('--strict') });
    if (result.problem) { io.write(result.problem); return 1; }
    for (const lesson of result.lessons) io.write(`${lesson.id}: ${lesson.status}${lesson.detail ? ` (${lesson.detail})` : ''}`);
    io.write(result.ok ? 'ok: no grade record disagrees with the lesson hashes' : 'failed: see the lines above');
    return result.ok ? 0 : 1;
  }
  if (command === 'outline') {
    const locale = option('--locale') ?? 'en';
    const format = option('--format') ?? 'markdown';
    if ((locale !== 'en' && locale !== 'es') || (format !== 'markdown' && format !== 'html')) { io.write('usage: learn-educator.ts outline [--locale en|es] [--format markdown|html]'); return 2; }
    io.write(renderOutline(LESSON_INDEX, locale, format));
    return 0;
  }
  io.write('usage: learn-educator.ts verify <progress.json> [--strict] | outline [--locale en|es] [--format markdown|html]');
  return 2;
}

if (import.meta.main) process.exit(await runEducator(process.argv.slice(2), { read: (path) => readFile(path, 'utf8'), write: (line) => console.log(line) }));
