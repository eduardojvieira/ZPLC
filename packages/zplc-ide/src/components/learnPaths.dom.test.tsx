import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';
import { emptyProgress, withPassedIds } from '../../shared/learnProgressModel';

// LRN-043: the Learn home lists each learning path before the full course, in path order, with its own Continue, and a path
// can start a lesson that the rules of the full course would still lock.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useAppSettings } = await import('../store/useAppSettings');
const { useLearnUi } = await import('../learn/learnUi');
const { useLearnProgress } = await import('../learn/progressState');
const { LESSON_INDEX } = await import('../generated/lessonIndex');
const { courseOrder } = await import('../learn/course');
const { LearnHome } = await import('./LearnHome');

// X has no prerequisite; Y needs something other than X, so the full course locks it once X is passed; Z follows Y in the path.
const ordered = courseOrder(LESSON_INDEX);
const X = ordered.find((lesson) => lesson.prerequisites.length === 0)!;
const Y = ordered.find((lesson) => lesson.prerequisites.length > 0 && !lesson.prerequisites.includes(X.id))!;
const Z = ordered.find((lesson) => lesson !== X && lesson !== Y && lesson.prerequisites.length > 0 && lesson.id !== Y.id)!;
const PATH = {
  id: 'fixture-path',
  title: { en: 'Fixture path', es: 'Ruta de prueba' },
  summary: { en: 'A path for the test.', es: 'Una ruta para la prueba.' },
  rationale: { en: 'Because the test says so.', es: 'Porque la prueba lo dice.' },
  language: 'LD' as const,
  lessons: [X.id, Y.id, Z.id],
};
const course = LESSON_INDEX.course as { paths?: unknown };
const before = course.paths;
beforeEach(() => {
  course.paths = [PATH];
  (window as unknown as Record<string, unknown>).showDirectoryPicker = () => undefined;
  dom.patchStore(useAppSettings, {
    settings: { ...useAppSettings.getState().settings, unlockAllLessons: false, language: 'en' },
  } as never);
  dom.patchStore(useLearnUi, { homeOpen: true, starting: false } as never);
});
afterEach(() => {
  course.paths = before;
});
const progress = (passed: string[]) =>
  dom.patchStore(useLearnProgress, { document: withPassedIds(emptyProgress(), passed), loaded: true, failed: false } as never);
const pathList = () => dom.screen.getByRole('list', { name: dom.t('learnReading.path.lessons', { title: PATH.title.en }) });

describe('learning paths on the Learn home (LRN-043)', () => {
  it('LRN-043 shows the path before the full course, with its title, summary and rationale', () => {
    progress([]);
    dom.render(<LearnHome />);
    const section = dom.screen.getByRole('region', { name: PATH.title.en });
    expect(section.textContent).toContain(PATH.summary.en);
    expect(section.textContent).toContain(PATH.rationale.en);
    const modules = document.querySelector('[data-learn-module]')!;
    expect(section.compareDocumentPosition(modules) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('LRN-043 lists the lessons as one numbered list in path order, each with a module label and its state', () => {
    progress([]);
    dom.render(<LearnHome />);
    const rows = [...pathList().querySelectorAll(':scope > li')];
    expect(pathList().tagName).toBe('OL');
    expect(rows.map((row) => row.getAttribute('data-learn-path-lesson'))).toEqual(PATH.lessons);
    expect(rows[0]!.textContent).toContain(dom.t('learnReading.path.module', { number: X.module }));
    expect(rows.map((row) => row.getAttribute('data-state'))).toEqual(['available', 'locked', 'locked']);
  });

  it('LRN-043 Continue of the path opens the first lesson of the path that is not passed', async () => {
    progress([X.id]);
    const started: string[] = [];
    dom.patchStore(useLearnUi, { startLesson: async (id: string) => (started.push(id), true) } as never);
    const { user } = dom.render(<LearnHome />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('learnReading.path.continue', { title: Y.text.en.title }) }));
    expect(started).toEqual([Y.id]);
  });

  it('LRN-043 starts a lesson from the path when the path unlocks it, although the full course keeps it locked', async () => {
    progress([X.id]);
    const started: string[] = [];
    dom.patchStore(useLearnUi, { startLesson: async (id: string) => (started.push(id), true) } as never);
    const { user } = dom.render(<LearnHome />);
    expect(document.querySelector(`[data-learn-module] [data-learn-lesson="${Y.id}"]`)!.getAttribute('data-state')).toBe('locked');
    const row = pathList().querySelector(`[data-learn-path-lesson="${Y.id}"]`)!;
    expect(row.getAttribute('data-state')).toBe('available');
    await user.click(row.querySelector<HTMLElement>('[data-learn-path-start]')!);
    expect(started).toEqual([Y.id]);
  });

  it('LRN-043 a locked lesson of the path cannot be started', () => {
    progress([]);
    dom.render(<LearnHome />);
    const row = pathList().querySelector(`[data-learn-path-lesson="${Z.id}"]`)!;
    expect(row.querySelector<HTMLButtonElement>('[data-learn-path-start]')!.disabled).toBe(true);
  });

  it('LRN-043 the full course below stays as it was, and a course without paths shows no path section', () => {
    progress([]);
    const { unmount } = dom.render(<LearnHome />);
    expect(document.querySelectorAll('[data-learn-module]').length).toBe(LESSON_INDEX.course.modules.length);
    expect(document.querySelectorAll('[data-learn-lesson]').length).toBe(LESSON_INDEX.lessons.length);
    unmount();
    course.paths = undefined;
    dom.render(<LearnHome />);
    expect(dom.screen.queryByRole('heading', { name: dom.t('learnReading.path.heading') })).toBeNull();
  });
});
