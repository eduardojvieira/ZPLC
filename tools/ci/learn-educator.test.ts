// The educator tools of Learn (LRN-033): verify an exported progress file against the lesson hashes, and print the course
// outline with the objectives of every lesson. Both read the generated index and the file given; no account, no server.
import { describe, expect, it } from 'bun:test';

import { emptyProgress, exportProgress, withGrade, withNote, withPassedIds, type GradeRecord } from '../../packages/zplc-ide/electron/learnProgressModel';
import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex';
import { renderOutline, runEducator, verifyProgress } from './learn-educator';

const LESSON = LESSON_INDEX.lessons.find((lesson) => lesson.id === 'motor-start-stop-safe')!;
const grade = (over: Partial<GradeRecord> = {}): GradeRecord => ({
  schemaVersion: 1, lessonId: LESSON.id, lessonVersion: LESSON.version, track: 'simulation', scenarioId: LESSON.scenario.id, scenarioSha256: LESSON.scenario.sha256, programSha256: 'b'.repeat(64),
  runtimeVersion: '1.0.0', time: '2026-10-10T12:00:00.000Z', result: 'passed', assertions: { total: LESSON.scenario.assertions, passed: LESSON.scenario.assertions }, failedAssertions: [], ...over,
});
const file = (progress = withGrade(emptyProgress(), grade())) => exportProgress(progress);

describe('verifying an exported progress file against the lesson hashes (LRN-033)', () => {
  it('LRN-033 verifies a passed lesson whose grade was taken against the current scenario of the lesson', () => {
    const result = verifyProgress(file(), LESSON_INDEX);
    expect(result).toMatchObject({ ok: true, problem: null });
    expect(result.lessons).toEqual([{ id: LESSON.id, status: 'verified', detail: '' }]);
  });

  it('LRN-033 reports a grade taken against another scenario, another track or another number of assertions as a mismatch', () => {
    for (const forged of [grade({ scenarioSha256: 'c'.repeat(64) }), grade({ track: 'hardware' }), grade({ assertions: { total: LESSON.scenario.assertions + 1, passed: LESSON.scenario.assertions + 1 } }), grade({ scenarioId: 'Other' })]) {
      const result = verifyProgress(file(withGrade(emptyProgress(), forged)), LESSON_INDEX);
      expect(result.ok).toBe(false);
      expect(result.lessons[0]).toMatchObject({ id: LESSON.id, status: 'mismatch' });
    }
  });

  it('LRN-033 lists a lesson passed without a grade record as unverified, a lesson in progress as such, and passes only in strict mode when none is unverified', () => {
    const progress = withNote(withPassedIds(emptyProgress(), [LESSON.id]), { lessonId: 'edge-counter-pulses', started: true }, '2026-10-10T10:00:00.000Z');
    const result = verifyProgress(file(progress), LESSON_INDEX);
    expect(result.lessons.map((lesson) => [lesson.id, lesson.status])).toEqual([['edge-counter-pulses', 'in-progress'], [LESSON.id, 'unverified']]);
    expect(result.ok).toBe(true);
    expect(verifyProgress(file(progress), LESSON_INDEX, { strict: true }).ok).toBe(false);
  });

  it('LRN-033 keeps a lesson this build does not know inert and refuses a file that is not progress', () => {
    const unknown = verifyProgress(file(withPassedIds(emptyProgress(), ['a-lesson-from-the-future'])), LESSON_INDEX);
    expect(unknown.lessons).toEqual([{ id: 'a-lesson-from-the-future', status: 'unknown-lesson', detail: '' }]);
    expect(unknown.ok).toBe(true);
    for (const text of ['{', '{"name":"zplc.json"}', JSON.stringify({ ...JSON.parse(file()), lessons: { [LESSON.id]: { state: 'passed' } } })]) expect(verifyProgress(text, LESSON_INDEX)).toMatchObject({ ok: false, lessons: [] });
  });

  it('LRN-033 exits 0 for a verified file and 1 for a mismatch or an unreadable file, printing one line per lesson', async () => {
    const out: string[] = [];
    const read = (text: string) => async () => text;
    expect(await runEducator(['verify', 'progress.json'], { read: read(file()), write: (line) => out.push(line) })).toBe(0);
    expect(out.join('\n')).toContain(`${LESSON.id}: verified`);
    out.length = 0;
    expect(await runEducator(['verify', 'progress.json'], { read: read(file(withGrade(emptyProgress(), grade({ scenarioSha256: 'c'.repeat(64) })))), write: (line) => out.push(line) })).toBe(1);
    expect(out.join('\n')).toContain(`${LESSON.id}: mismatch`);
    expect(await runEducator(['verify', 'progress.json'], { read: read('not json'), write: () => undefined })).toBe(1);
    expect(await runEducator(['verify'], { read: read(''), write: () => undefined })).toBe(2);
  });
});

describe('the printable outline of the course (LRN-033)', () => {
  it('LRN-033 lists every module and, under it, every lesson with its objectives, in English and in Spanish, in Markdown', () => {
    for (const locale of ['en', 'es'] as const) {
      const outline = renderOutline(LESSON_INDEX, locale, 'markdown');
      for (const module of LESSON_INDEX.course.modules) expect(outline).toContain(module.title[locale]);
      for (const lesson of LESSON_INDEX.lessons) {
        expect(outline).toContain(lesson.text[locale].title);
        for (const objective of lesson.text[locale].objectives) expect(outline).toContain(objective);
      }
    }
  });

  it('LRN-033 prints as a self-contained page: print styles, escaped text, the right language, no script and no external file', () => {
    const page = renderOutline(LESSON_INDEX, 'es', 'html');
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('<html lang="es">');
    expect(page).toContain('@media print');
    expect(page).not.toMatch(/<script|<link|src=|https?:\/\//i);
    const tricky = { ...LESSON_INDEX, lessons: [{ ...LESSON_INDEX.lessons[0]!, text: { ...LESSON_INDEX.lessons[0]!.text, en: { ...LESSON_INDEX.lessons[0]!.text.en, title: '<b>&"x"</b>' } } }] };
    expect(renderOutline(tricky as never, 'en', 'html')).toContain('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
  });

  it('LRN-033 writes the outline to stdout through the command, and refuses a language or format it does not offer', async () => {
    const out: string[] = [];
    expect(await runEducator(['outline', '--locale', 'es', '--format', 'markdown'], { read: async () => '', write: (line) => out.push(line) })).toBe(0);
    expect(out.join('\n')).toContain('Objetivos');
    expect(await runEducator(['outline', '--locale', 'fr'], { read: async () => '', write: () => undefined })).toBe(2);
    expect(await runEducator(['outline', '--format', 'pdf'], { read: async () => '', write: () => undefined })).toBe(2);
  });
});
