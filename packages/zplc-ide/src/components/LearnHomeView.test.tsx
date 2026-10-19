// The Learn home (LRN-001, LRN-002, LRN-005, LRN-011): tracks, modules in order with level, prerequisites and time, the state of
// every lesson in words (not colour), a Continue action, the lock rule with its reason, and the tracks a lesson does not support.
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { emptyProgress, withNote, withPassedIds, type LearnProgress } from '../../electron/learnProgressModel';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { buildCourseView, continueTarget } from '../learn/course';
import { auditMarkup } from '../ui/audit';
import { LearnHomeView, type LearnHomeViewProps } from './LearnHomeView';

const FIRST = 'first-blink-simulation';
const SECOND = 'scan-cycle-one-scan-memory';

function render(progress: LearnProgress | null, over: Partial<LearnHomeViewProps> = {}, unlockAll = false): string {
  const view = buildCourseView(LESSON_INDEX, progress, { locale: 'en', unlockAll });
  const continueId = continueTarget(view, progress);
  return renderToStaticMarkup(
    <LearnHomeView
      view={view} index={LESSON_INDEX} locale="en" continueId={continueId} fresh={!progress?.last} loaded failed={false} unlockAll={unlockAll}
      folderAccess busy={false} transfer="idle" onUnlockAll={() => undefined} onStart={() => undefined} onClose={() => undefined}
      onExport={() => undefined} onImportFile={() => undefined} {...over}
    />,
  );
}
const lessonRow = (out: string, id: string): string => out.split('<li ').find((chunk) => chunk.includes(`data-learn-lesson="${id}"`)) ?? '';
const AT = '2026-10-19T10:00:00.000Z';

describe('the Learn home', () => {
  it('lists the tracks and the twelve modules in order with level, required module and time, the empty ones without lessons', () => {
    const out = render(emptyProgress());
    const headings = [...out.matchAll(/data-learn-module="(\d+)"/g)].map((match) => Number(match[1]));
    expect(headings).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(out).toContain('Simulation');
    expect(out).toContain('Foundation. Requires module 0. About 30 min.');
    expect(out).toContain('Intermediate. Requires module 3.');
    expect(out.match(/No lessons yet\./g)?.length).toBe(5);
  });

  it('says the state of each lesson in words, and why a locked lesson is locked', () => {
    const progress = withNote(withPassedIds(emptyProgress(), [FIRST]), { lessonId: SECOND, started: true, last: true }, AT);
    const out = render(progress);
    expect(lessonRow(out, FIRST)).toContain('Passed');
    expect(lessonRow(out, SECOND)).toContain('In progress');
    const locked = lessonRow(out, 'motor-start-stop-safe');
    expect(locked).toContain('data-state="locked"');
    expect(locked).toContain('Locked');
    expect(locked).toContain('Pass first:');
    expect(locked).toMatch(/<button[^>]*disabled[^>]*data-learn-start="motor-start-stop-safe"|<button[^>]*data-learn-start="motor-start-stop-safe"[^>]*disabled/);
    expect(lessonRow(render(emptyProgress()), FIRST)).toContain('Available');
  });

  it('offers Continue with the lesson to resume: the first lesson for a new learner, the last one worked on after that', () => {
    expect(render(emptyProgress())).toMatch(/data-learn-continue[^>]*>[^<]*Start the course: [^<]*<\/button>|Start the course: /);
    const progress = withNote(withPassedIds(emptyProgress(), [FIRST]), { lessonId: SECOND, started: true, last: true }, AT);
    const out = render(progress);
    expect(out).toContain('Continue: ');
    expect(out).toContain(LESSON_INDEX.lessons.find((lesson) => lesson.id === SECOND)!.text.en.title);
    const done = render(withPassedIds(emptyProgress(), LESSON_INDEX.lessons.map((lesson) => lesson.id)));
    expect(done).toContain('Every lesson is passed');
    expect(done).not.toContain('data-learn-continue');
  });

  it('counts the lessons passed', () => {
    expect(render(withPassedIds(emptyProgress(), [FIRST]))).toContain('1 of 13 lessons passed');
  });

  it('says which tracks a lesson supports and, for one it does not, why and what to do instead (LRN-011)', () => {
    const row = lessonRow(render(emptyProgress()), FIRST);
    expect(row).toContain('Tracks: Simulation.');
    expect(row).toContain('Hardware: not available for this lesson.');
    expect(row).toContain('No check against a trace recorded from a board has been written for this lesson yet.');
    expect(row).toContain('Do the lesson in the Simulation track.');
  });

  it('unlocks every lesson when the setting is on, and shows the switch as on', () => {
    const out = render(emptyProgress(), {}, true);
    expect(out).not.toContain('data-state="locked"');
    expect(out).toMatch(/<input[^>]*role="switch"[^>]*checked=""|<input[^>]*checked=""[^>]*role="switch"/);
    expect(render(emptyProgress())).not.toMatch(/role="switch"[^>]*checked=""/);
  });

  it('shows the reason an import was refused, and that the progress is unchanged', () => {
    const out = render(emptyProgress(), { transfer: { error: 'unknown-version', version: 3 } });
    expect(out).toContain('The file is version 3, which this version of Studio cannot read. Your progress is unchanged.');
    expect(render(emptyProgress(), { transfer: 'imported' })).toContain('Progress imported and merged.');
  });

  it('says folder access is missing when it is, and passes the accessibility audit', () => {
    expect(render(emptyProgress(), { folderAccess: false })).toContain('Starting a lesson needs access to a folder');
    expect(auditMarkup(render(withPassedIds(emptyProgress(), [FIRST])))).toEqual([]);
  });
});
