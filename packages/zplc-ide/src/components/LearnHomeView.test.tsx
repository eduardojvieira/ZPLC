// The Learn home (LRN-001, LRN-002, LRN-005, LRN-011): tracks, modules in order with level, prerequisites and time, the state of
// every lesson in words (not colour), a Continue action, the lock rule with its reason, and the tracks a lesson does not support.
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { emptyProgress, withNote, withPassedIds, type LearnProgress } from '../../shared/learnProgressModel';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { alternativePairs } from '../learn/lessonSiblings';
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
      view={view}
      index={LESSON_INDEX}
      locale="en"
      continueId={continueId}
      fresh={!progress?.last}
      loaded
      failed={false}
      unlockAll={unlockAll}
      hideSolutions={false}
      onHideSolutions={() => undefined}
      folderAccess
      busy={false}
      transfer="idle"
      onUnlockAll={() => undefined}
      onStart={() => undefined}
      onClose={() => undefined}
      onExport={() => undefined}
      onImportFile={() => undefined}
      {...over}
    />,
  );
}
const lessonRow = (out: string, id: string): string => out.split('<li ').find((chunk) => chunk.includes(`data-learn-lesson="${id}"`)) ?? '';
const AT = '2026-10-19T10:00:00.000Z';

describe('the classroom setting of the Learn home (LRN-033)', () => {
  it('LRN-033 offers a switch that hides the reference solutions, named and described in words, and shows its state', () => {
    const off = render(emptyProgress());
    expect(off).toContain('data-learn-hide-solutions');
    expect(off).toContain('Classroom: hide reference solutions');
    expect(off).not.toMatch(/<input[^>]*data-learn-hide-solutions[^>]*checked=""|<input[^>]*checked=""[^>]*data-learn-hide-solutions/);
    expect(render(emptyProgress(), { hideSolutions: true })).toMatch(
      /<input[^>]*data-learn-hide-solutions[^>]*checked=""|<input[^>]*checked=""[^>]*data-learn-hide-solutions/,
    );
    expect(auditMarkup(render(emptyProgress(), { hideSolutions: true }))).toEqual([]);
  });
});

describe('the Learn home', () => {
  it('lists the tracks and the twenty modules in order with level, required module and time, the empty ones without lessons', () => {
    const out = render(emptyProgress());
    const headings = [...out.matchAll(/data-learn-module="(\d+)"/g)].map((match) => Number(match[1]));
    expect(headings).toEqual(Array.from({ length: 20 }, (_, index) => index));
    expect(out).toContain('Simulation');
    expect(out).toContain('Foundation. Requires module 0. About 75 min.');
    expect(out).toContain('Intermediate. Requires module 3.');
    expect((out.match(/No lessons yet\./g) ?? []).length).toBe(
      LESSON_INDEX.course.modules.filter((module) => !LESSON_INDEX.lessons.some((lesson) => lesson.module === module.id)).length,
    );
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
    expect(locked).toMatch(
      /<button[^>]*disabled[^>]*data-learn-start="motor-start-stop-safe"|<button[^>]*data-learn-start="motor-start-stop-safe"[^>]*disabled/,
    );
    expect(lessonRow(render(emptyProgress()), FIRST)).toContain('Available');
  });

  it('offers Continue with the lesson to resume: the first lesson for a new learner, the last one worked on after that', () => {
    expect(render(emptyProgress())).toMatch(/data-learn-continue[^>]*>[^<]*Start the course: [^<]*<\/button>|Start the course: /);
    const progress = withNote(withPassedIds(emptyProgress(), [FIRST]), { lessonId: SECOND, started: true, last: true }, AT);
    const out = render(progress);
    expect(out).toContain('Continue: ');
    expect(out).toContain(LESSON_INDEX.lessons.find((lesson) => lesson.id === SECOND)!.text.en.title);
    const done = render(
      withPassedIds(
        emptyProgress(),
        LESSON_INDEX.lessons.map((lesson) => lesson.id),
      ),
    );
    expect(done).toContain('Every lesson is passed');
    expect(done).not.toContain('data-learn-continue');
  });

  it('LRN-006 tells the learner why the course is in this order, and why each module sits where it does', () => {
    const out = render(emptyProgress());
    const { course } = LESSON_INDEX;
    expect(out).toContain('Why this order');
    expect(out).toContain(course.rationale.en);
    for (const module of course.modules) {
      const block = out.split('<li ').find((chunk) => chunk.startsWith(`data-learn-module="${module.id}"`)) ?? '';
      expect([module.id, block.includes(`data-learn-module-why="${module.id}"`) && block.includes(module.why.en)]).toEqual([
        module.id,
        true,
      ]);
    }
    const spanish = renderToStaticMarkup(
      <LearnHomeView
        view={buildCourseView(LESSON_INDEX, emptyProgress(), { locale: 'es', unlockAll: false })}
        index={LESSON_INDEX}
        locale="es"
        continueId={null}
        fresh
        loaded
        failed={false}
        unlockAll={false}
        hideSolutions={false}
        onHideSolutions={() => undefined}
        folderAccess
        busy={false}
        transfer="idle"
        onUnlockAll={() => undefined}
        onStart={() => undefined}
        onClose={() => undefined}
        onExport={() => undefined}
        onImportFile={() => undefined}
      />,
    );
    expect(spanish).toContain(course.rationale.es);
    expect(spanish).toContain(course.modules[1]!.why.es);
  });

  it('counts the lessons passed', () => {
    expect(render(withPassedIds(emptyProgress(), [FIRST]))).toContain(
      `1 of ${LESSON_INDEX.lessons.length - alternativePairs(LESSON_INDEX).length} lessons passed`,
    );
  });

  it('says which tracks a lesson supports and, for one it does not, why and what to do instead (LRN-011)', () => {
    const row = lessonRow(render(emptyProgress()), FIRST);
    expect(row).toContain('Tracks: Simulation.');
    expect(row).toContain('Hardware: not available for this lesson.');
    // The lesson's own reason and alternative (LRN-011), not the generic words of the track.
    const own = LESSON_INDEX.lessons.find((lesson) => lesson.id === FIRST)!.unsupported.hardware!;
    expect(row).toContain(own.reason.en);
    expect(row).toContain(own.instead.en);
    expect(row).not.toContain('No check against a trace recorded from a board has been written for this lesson yet.');
  });

  it('unlocks every lesson when the setting is on, and shows the switch as on', () => {
    const out = render(emptyProgress(), {}, true);
    expect(out).not.toContain('data-state="locked"');
    expect(out).toMatch(/<input[^>]*role="switch"[^>]*checked=""|<input[^>]*checked=""[^>]*role="switch"/);
    expect(render(emptyProgress())).not.toMatch(/role="switch"[^>]*checked=""/);
  });

  it('keeps the markup order the screen-reader check walks: Continue, the path, Unlock, Export', () => {
    const out = render(emptyProgress());
    const at = ['data-learn-continue', 'data-learn-path-continue', 'data-learn-unlock-all', 'data-learn-export'].map((name) =>
      out.indexOf(name),
    );
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
  });

  it('shows the reason an import was refused, and that the progress is unchanged', () => {
    const out = render(emptyProgress(), { transfer: { error: 'unknown-version', version: 3 } });
    expect(out).toContain('The file is version 3, which this version of ZPLC cannot read. Your progress is unchanged.');
    expect(render(emptyProgress(), { transfer: 'imported' })).toContain('Progress imported and merged.');
  });

  it('says folder access is missing when it is, and passes the accessibility audit', () => {
    expect(render(emptyProgress(), { folderAccess: false })).toContain('Starting a lesson needs access to a folder');
    expect(auditMarkup(render(withPassedIds(emptyProgress(), [FIRST])))).toEqual([]);
  });
});

// The Tab order of the home (GDE-011): the tab stops of the markup in order, leaving out whatever sits in a closed <details>.
function tabStops(out: string): string[] {
  const visible = out.replace(/<details(?![^>]*\sopen)[^>]*>[\s\S]*?<\/details>/g, '');
  return [...visible.matchAll(/<(?:button|a|summary|input)\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => !/\sdisabled=""/.test(tag))
    .map((tag) => /data-learn-[a-z-]+/.exec(tag)?.[0] ?? tag.slice(0, 12));
}
const LADDER_FIRST = LESSON_INDEX.course.paths![0]!.lessons[0]!;
const PLANT_FIRST = LESSON_INDEX.course.paths![1]!.lessons[0]!;
const inLadder = withNote(emptyProgress(), { lessonId: LADDER_FIRST, started: true, last: true }, AT);

describe('the Tab order of the Learn home (GDE-011)', () => {
  it('GDE-011 Continue is the first control and the skip link the second', () => {
    for (const progress of [emptyProgress(), inLadder]) {
      const stops = tabStops(render(progress));
      expect(stops.slice(0, 2)).toEqual(['data-learn-continue', 'data-learn-skip']);
    }
  });

  it('GDE-011 a path that holds no lesson to continue is closed and its Start buttons are not in the tab order', () => {
    const out = render(inLadder);
    expect(out).toMatch(/<details[^>]*data-learn-path="ladder"[^>]*\sopen|<details[^>]*\sopen[^>]*data-learn-path="ladder"/);
    expect(out).not.toMatch(/<details[^>]*data-learn-path="plant-st"[^>]*\sopen/);
    const stops = tabStops(out);
    const ladderStarts = LESSON_INDEX.course.paths![0]!.lessons.length;
    expect(stops.filter((stop) => stop === 'data-learn-path-start').length).toBeGreaterThan(0);
    expect(stops.filter((stop) => stop === 'data-learn-path-start').length).toBeLessThanOrEqual(ladderStarts);
    // the plant path is closed: none of its first lesson's controls is a tab stop
    expect(render(inLadder)).toContain(`data-learn-path-start="${PLANT_FIRST}"`);
    expect(tabStops(render(emptyProgress())).filter((stop) => stop === 'data-learn-path-start')).toEqual([]);
  });

  it('GDE-011 a learner reaches the switches within 4 Tab presses', () => {
    for (const progress of [emptyProgress(), inLadder]) {
      const out = render(progress);
      const stops = tabStops(out);
      // Tab to the skip link, Enter on it: the focus is on the switch. That is the presses a learner makes.
      const presses = stops.indexOf('data-learn-skip') + 1 + 1;
      expect(presses).toBeLessThanOrEqual(4);
      const href = /<a\b[^>]*data-learn-skip[^>]*>/.exec(out)?.[0] ?? '';
      expect(href).toContain('href="#learn-switches"');
      expect(out).toContain('id="learn-switches"');
      expect(out.indexOf('id="learn-switches"')).toBeLessThan(out.indexOf('data-learn-unlock-all'));
      expect(stops).toContain('data-learn-unlock-all');
    }
  });

  it('GDE-011 the hardware track is not pinned over the lessons', () => {
    const out = render(emptyProgress());
    const hardware = out.indexOf('data-learn-track="hardware"');
    expect(hardware).toBeGreaterThan(-1);
    expect(hardware).toBeGreaterThan(out.lastIndexOf('data-learn-path-lesson='));
    expect(hardware).toBeGreaterThan(out.lastIndexOf('data-learn-lesson='));
  });
});
