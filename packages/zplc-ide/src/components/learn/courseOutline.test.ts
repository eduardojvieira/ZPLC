import { describe, expect, it } from 'bun:test';
import { emptyProgress, withPassedIds } from '../../../shared/learnProgressModel';
import { LESSON_INDEX } from '../../generated/lessonIndex';
import { buildCourseView } from '../../learn/course';
import { buildCourseOutlineRows, initialExpanded, lessonNodeId, moduleNodeId, pathNodeId } from './courseOutline';

// GDE-002: the rows of the Learn activity outline, built from the real generated index.
const view = buildCourseView(LESSON_INDEX, emptyProgress(), { locale: 'en', unlockAll: false });
const none = new Set<string>();

describe('The rows of the course outline (GDE-002)', () => {
  it('GDE-002 closed, the outline is one row per path then one per module', () => {
    const rows = buildCourseOutlineRows(view, { expanded: none, filter: '', currentLessonId: null });
    expect(rows.map((row) => row.id)).toEqual([
      ...view.paths.map((path) => pathNodeId(path.id)),
      ...view.modules.map((mod) => moduleNodeId(mod.id)),
    ]);
    expect(rows.every((row) => row.level === 1 && row.expandable && !row.expanded)).toBe(true);
  });

  it('GDE-002 an open module lists its lessons with their state, and a locked one names what unlocks it', () => {
    const rows = buildCourseOutlineRows(view, { expanded: new Set([moduleNodeId(1)]), filter: '', currentLessonId: 'ld-scan-cycle' });
    const lessons = rows.filter((row) => row.kind === 'lesson');
    expect(lessons.map((row) => row.lessonId)).toEqual(view.modules.find((mod) => mod.id === 1)!.lessons.map((lesson) => lesson.id));
    expect(lessons.every((row) => row.level === 2 && row.parent === moduleNodeId(1) && row.moduleId === 1 && row.pathId === null)).toBe(true);
    const locked = rows.find((row) => row.id === lessonNodeId(moduleNodeId(1), 'scan-cycle-one-scan-memory'))!;
    expect(locked.state).toBe('locked');
    expect(locked.unlockedBy).toEqual([view.titles['first-blink-simulation']!]);
    expect(rows.find((row) => row.lessonId === 'ld-scan-cycle')!.current).toBe(true);
    expect(rows.filter((row) => row.current)).toHaveLength(1);
  });

  it('GDE-002 a locked lesson of a path waits for the lesson before it in the path', () => {
    const ladder = view.paths[0]!;
    const rows = buildCourseOutlineRows(view, { expanded: new Set([pathNodeId(ladder.id)]), filter: '', currentLessonId: null });
    const second = rows.find((row) => row.id === lessonNodeId(pathNodeId(ladder.id), ladder.lessons[1]!.id))!;
    expect(second.state).toBe('locked');
    expect(second.pathId).toBe(ladder.id);
    expect(second.unlockedBy).toEqual([ladder.lessons[0]!.title]);
  });

  it('GDE-002 the filter matches a title or an id, opens what matches and hides the rest', () => {
    const byId = buildCourseOutlineRows(view, { expanded: none, filter: 'TIMERS-ON-DELAY', currentLessonId: null });
    expect(byId.map((row) => row.id)).toContain(lessonNodeId(moduleNodeId(3), 'timers-on-delay-off-delay'));
    expect(byId.filter((row) => row.kind === 'lesson').every((row) => row.lessonId!.includes('timers-on-delay'))).toBe(true);
    expect(byId.filter((row) => row.kind !== 'lesson').every((row) => row.expanded)).toBe(true);
    expect(byId.map((row) => row.id)).not.toContain(moduleNodeId(1));
    const title = view.titles['ld-what-is-a-plc']!;
    const byTitle = buildCourseOutlineRows(view, { expanded: none, filter: title.toLowerCase(), currentLessonId: null });
    expect(byTitle.filter((row) => row.kind === 'lesson').map((row) => row.lessonId)).toContain('ld-what-is-a-plc');
    expect(buildCourseOutlineRows(view, { expanded: none, filter: 'zzz-no-such-lesson', currentLessonId: null })).toEqual([]);
  });

  it('GDE-002 the module of the current lesson starts open, and a passed lesson is passed in the path too', () => {
    expect([...initialExpanded(view, 'ld-scan-cycle')]).toEqual([moduleNodeId(1)]);
    expect([...initialExpanded(view, null)]).toEqual([]);
    const passed = buildCourseView(LESSON_INDEX, withPassedIds(emptyProgress(), ['ld-what-is-a-plc']), { locale: 'en', unlockAll: false });
    const rows = buildCourseOutlineRows(passed, { expanded: new Set([pathNodeId('ladder')]), filter: '', currentLessonId: null });
    expect(rows.find((row) => row.lessonId === 'ld-what-is-a-plc')!.state).toBe('passed');
  });
});
