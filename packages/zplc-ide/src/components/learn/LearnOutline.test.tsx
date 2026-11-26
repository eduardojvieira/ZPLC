import { beforeEach, describe, expect, it } from 'bun:test';
import { emptyProgress, withNote, withPassedIds, type LearnProgress } from '../../../shared/learnProgressModel';
import { isFocused, setupDom, stubMonaco, stubProjectLoader } from '../../test/dom';

// GDE-002: the Learn activity outline, tested against the real generated index and DOM events.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();

const { LESSON_INDEX } = await import('../../generated/lessonIndex');
const { buildCourseView } = await import('../../learn/course');
const { useLearnUi } = await import('../../learn/learnUi');
const { useLearnProgress } = await import('../../learn/progressState');
const { useAppSettings } = await import('../../store/useAppSettings');
const { useShellLayout } = await import('../../store/useShellLayout');
const { announcementsSnapshot } = await import('../../utils/announce');
const { PrimarySidebar } = await import('../../shell/Sidebars');
const { buildCourseOutlineRows, lessonNodeId, moduleNodeId, pathNodeId } = await import('./courseOutline');
const { LearnOutline } = await import('./LearnOutline');
const { allOpenLessonRows, syntheticCourse } = await import('./syntheticCourse');

const PASSED_ID = 'ld-what-is-a-plc'; // module 1
const IN_PROGRESS_ID = 'first-blink-simulation'; // module 0
const AVAILABLE_ID = 'ld-scan-cycle'; // module 1, needs PASSED_ID
const LOCKED_ID = 'scan-cycle-one-scan-memory'; // module 1, needs IN_PROGRESS_ID

const started: string[] = [];

function setProgress(document: LearnProgress | null): void {
  dom.patchStore(useLearnProgress, { document, loaded: true, failed: false } as never);
}

beforeEach(() => {
  started.length = 0;
  dom.patchStore(useAppSettings, {
    settings: { ...useAppSettings.getState().settings, unlockAllLessons: false, language: 'en' },
  } as never);
  setProgress(emptyProgress());
  dom.patchStore(useLearnUi, {
    selected: null,
    starting: false,
    workspace: null,
    reading: null,
    homeOpen: false,
    startLesson: async (id: string) => (started.push(id), true),
  } as never);
  dom.patchStore(useShellLayout, { activityView: 'project', primaryVisible: true } as never);
});

const tree = () => dom.screen.getByRole('tree', { name: dom.t('u3Learn.outline.title') });
const rowById = (rowId: string): HTMLElement => document.querySelector<HTMLElement>(`[data-row="${CSS.escape(rowId)}"]`)!;
const moduleLesson = (module: number, id: string) => rowById(lessonNodeId(moduleNodeId(module), id));
const filterBox = () => dom.screen.getByRole('textbox', { name: dom.t('u3Learn.outline.filterLabel') });
// Select all and delete, as a person does; user.clear left React's value tracker behind once the list was empty (happy-dom).
async function clearFilter(user: ReturnType<typeof dom.render>['user']): Promise<void> {
  await user.tripleClick(filterBox());
  await user.keyboard('{Backspace}');
}

describe('The Learn activity course outline (GDE-002)', () => {
  it('GDE-002 the outline lists paths and modules that open and close', async () => {
    const { user } = dom.render(<LearnOutline />);
    expect(tree()).toBeTruthy();

    const paths = LESSON_INDEX.course.paths ?? [];
    const modules = LESSON_INDEX.course.modules;
    expect(paths.length).toBeGreaterThan(0);
    expect(modules.length).toBeGreaterThan(0);

    for (const id of [...paths.map((path) => pathNodeId(path.id)), ...modules.map((mod) => moduleNodeId(mod.id))]) {
      const node = rowById(id);
      expect(node).toBeTruthy();
      expect(node.getAttribute('role')).toBe('treeitem');
      expect(node.getAttribute('aria-level')).toBe('1');
      expect(node.getAttribute('aria-expanded')).toBe('false');
    }
    expect(document.querySelectorAll('[role="treeitem"][aria-level="2"]')).toHaveLength(0);

    const firstPath = paths[0]!;
    const pathRow = rowById(pathNodeId(firstPath.id));
    await user.click(pathRow);
    expect(pathRow.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll(`[role="treeitem"][data-outline-path="${firstPath.id}"][aria-level="2"]`)).toHaveLength(
      firstPath.lessons.length,
    );

    await user.click(pathRow);
    expect(pathRow.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll(`[role="treeitem"][data-outline-path="${firstPath.id}"][aria-level="2"]`)).toHaveLength(0);

    const module1Row = rowById(moduleNodeId(1));
    await user.click(module1Row);
    expect(module1Row.getAttribute('aria-expanded')).toBe('true');
    const module1Count = LESSON_INDEX.lessons.filter((lesson) => lesson.module === 1).length;
    expect(document.querySelectorAll('[role="treeitem"][data-outline-module="1"][aria-level="2"]')).toHaveLength(module1Count);

    await user.click(module1Row);
    expect(module1Row.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('[role="treeitem"][data-outline-module="1"][aria-level="2"]')).toHaveLength(0);
  });

  it('GDE-002 each lesson has a state icon and a text equivalent, and the current lesson is marked', async () => {
    const progress = withNote(
      withPassedIds(emptyProgress(), [PASSED_ID]),
      { lessonId: IN_PROGRESS_ID, started: true, last: true },
      '2026-11-26T10:00:00.000Z',
    );
    setProgress(progress);
    dom.patchStore(useLearnUi, { selected: IN_PROGRESS_ID } as never);

    const { user, unmount } = dom.render(<LearnOutline />);
    // The module of the current lesson starts open.
    expect(rowById(moduleNodeId(0)).getAttribute('aria-expanded')).toBe('true');
    await user.click(rowById(moduleNodeId(1)));
    const checks = [
      { module: 1, id: PASSED_ID, state: 'passed' },
      { module: 0, id: IN_PROGRESS_ID, state: 'in-progress' },
      { module: 1, id: AVAILABLE_ID, state: 'available' },
      { module: 1, id: LOCKED_ID, state: 'locked' },
    ] as const;

    for (const item of checks) {
      const row = moduleLesson(item.module, item.id);
      expect(row).toBeTruthy();
      expect(row.getAttribute('data-state')).toBe(item.state);
      const icon = row.querySelector(`[data-outline-state-icon="${item.state}"] svg`);
      expect(icon).not.toBeNull();
      expect(icon!.getAttribute('aria-hidden')).toBe('true');
      expect(row.querySelector('[data-outline-state-text]')?.textContent?.trim()).toBe(dom.t(`learn.state.${item.state}`));
    }

    const currentRow = moduleLesson(0, IN_PROGRESS_ID);
    expect(currentRow.getAttribute('aria-current')).toBe('true');
    expect(currentRow.textContent).toContain(dom.t('u3Learn.outline.current'));
    expect(moduleLesson(1, PASSED_ID).getAttribute('aria-current')).toBeNull();

    unmount();
    dom.render(<LearnOutline />, { locale: 'es' });
    const esT = dom.tFor('es');
    expect(moduleLesson(0, IN_PROGRESS_ID).querySelector('[data-outline-state-text]')?.textContent?.trim()).toBe(
      esT('learn.state.in-progress'),
    );
    expect(moduleLesson(0, IN_PROGRESS_ID).textContent).toContain(esT('u3Learn.outline.current'));
  });

  it('GDE-002 a locked lesson says what unlocks it on hover and on focus', async () => {
    const view = buildCourseView(LESSON_INDEX, emptyProgress(), { locale: 'en', unlockAll: false });
    const firstPath = view.paths[0]!;
    const pathLockedLesson = firstPath.lessons.find((lesson) => lesson.state === 'locked')!;
    const pathPreviousTitle = view.titles[pathLockedLesson.missing[0]!]!;

    const { user } = dom.render(<LearnOutline />);
    await user.click(rowById(moduleNodeId(1)));
    const lockedModuleRow = moduleLesson(1, LOCKED_ID);
    expect(lockedModuleRow.getAttribute('aria-disabled')).toBe('true');
    expect(dom.screen.queryByRole('tooltip')).toBeNull();

    await user.hover(lockedModuleRow);
    await dom.waitFor(() => {
      expect(dom.screen.getByRole('tooltip').textContent).toContain(view.titles[IN_PROGRESS_ID]!);
    });
    expect(lockedModuleRow.getAttribute('aria-describedby')).toBe(dom.screen.getByRole('tooltip').id);
    await user.unhover(lockedModuleRow);
    await dom.waitFor(() => expect(dom.screen.queryByRole('tooltip')).toBeNull());

    await user.click(rowById(pathNodeId(firstPath.id)));
    const lockedPathRow = rowById(lessonNodeId(pathNodeId(firstPath.id), pathLockedLesson.id));
    await dom.act(async () => {
      lockedPathRow.focus();
    });
    const reason = dom.t('u3Learn.outline.lockedByPath', { lessons: pathPreviousTitle });
    const tip = dom.screen.getByRole('tooltip');
    expect(tip.textContent).toContain(reason);
    expect(lockedPathRow.getAttribute('aria-describedby')).toBe(tip.id);

    // A locked lesson does not open; its reason is announced.
    await user.keyboard('{Enter}');
    expect(useLearnUi.getState().selected).toBeNull();
    expect(useLearnUi.getState().reading).toBeNull();
    expect(started).toEqual([]);
    expect(announcementsSnapshot().polite.message).toBe(reason);

    // No raw HTML title attributes anywhere in the outline.
    expect(document.querySelector('[data-learn-outline] [title]')).toBeNull();
  });

  it('GDE-002 the filter narrows by title and keeps the open state', async () => {
    const { user } = dom.render(<LearnOutline />);
    const module1Row = rowById(moduleNodeId(1));
    await user.click(module1Row);
    expect(module1Row.getAttribute('aria-expanded')).toBe('true');
    expect(rowById(moduleNodeId(3)).getAttribute('aria-expanded')).toBe('false');

    await user.type(filterBox(), 'timers-on-delay-off-delay');
    expect(moduleLesson(3, 'timers-on-delay-off-delay')).toBeTruthy();
    expect(rowById(moduleNodeId(3)).getAttribute('aria-expanded')).toBe('true');
    expect(rowById(moduleNodeId(1))).toBeNull();

    await clearFilter(user);
    const targetLesson = LESSON_INDEX.lessons.find((lesson) => lesson.id === 'timers-on-delay-off-delay')!;
    await user.type(filterBox(), targetLesson.text.en.title.slice(0, 12));
    expect(moduleLesson(3, 'timers-on-delay-off-delay')).toBeTruthy();

    await clearFilter(user);
    await user.type(filterBox(), 'zzz-no-such-lesson');
    expect(dom.screen.getByText(dom.t('u3Learn.outline.filterEmpty', { query: 'zzz-no-such-lesson' }))).toBeTruthy();

    await clearFilter(user);
    expect(rowById(moduleNodeId(1)).getAttribute('aria-expanded')).toBe('true');
    expect(rowById(moduleNodeId(3)).getAttribute('aria-expanded')).toBe('false');
  });

  it('GDE-002 the outline is a tree operable by keyboard alone', async () => {
    const { user } = dom.render(<LearnOutline />);
    const firstPath = (LESSON_INDEX.course.paths ?? [])[0]!;
    const firstPathNode = rowById(pathNodeId(firstPath.id));
    const firstChildId = lessonNodeId(pathNodeId(firstPath.id), firstPath.lessons[0]!);
    const secondChildId = lessonNodeId(pathNodeId(firstPath.id), firstPath.lessons[1]!);

    await user.tab();
    expect(isFocused(filterBox())).toBe(true);
    await user.tab();
    expect(isFocused(firstPathNode)).toBe(true);

    // Right opens the closed path; Right again moves to its first lesson.
    await user.keyboard('{ArrowRight}');
    expect(firstPathNode.getAttribute('aria-expanded')).toBe('true');
    expect(isFocused(firstPathNode)).toBe(true);
    await user.keyboard('{ArrowRight}');
    await dom.waitFor(() => expect(isFocused(rowById(firstChildId))).toBe(true));

    // Down to the second lesson (locked in the path): Enter does not open it. Up, then Left goes to the path, Left closes it.
    await user.keyboard('{ArrowDown}');
    await dom.waitFor(() => expect(isFocused(rowById(secondChildId))).toBe(true));
    await user.keyboard('{Enter}');
    expect(useLearnUi.getState().selected).toBeNull();
    await user.keyboard('{ArrowUp}');
    await dom.waitFor(() => expect(isFocused(rowById(firstChildId))).toBe(true));
    await user.keyboard('{ArrowLeft}');
    await dom.waitFor(() => expect(isFocused(firstPathNode)).toBe(true));
    await user.keyboard('{ArrowLeft}');
    expect(firstPathNode.getAttribute('aria-expanded')).toBe('false');

    // End and Home jump across the visible rows.
    const modules = LESSON_INDEX.course.modules;
    await user.keyboard('{End}');
    await dom.waitFor(() => expect(isFocused(rowById(moduleNodeId(modules[modules.length - 1]!.id)))).toBe(true));
    await user.keyboard('{Home}');
    await dom.waitFor(() => expect(isFocused(firstPathNode)).toBe(true));

    // Open the path again: Enter on its first lesson opens its reading page.
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{ArrowDown}');
    await dom.waitFor(() => expect(isFocused(rowById(firstChildId))).toBe(true));
    await user.keyboard('{Enter}');
    expect(useLearnUi.getState().selected).toBe(firstPath.lessons[0]!);
    expect(useLearnUi.getState().reading).toBe(firstPath.lessons[0]!);

    // Type-ahead: letters typed on a row go to the filter.
    await user.keyboard('timers-on');
    expect(isFocused(filterBox())).toBe(true);
    expect((filterBox() as HTMLInputElement).value).toBe('timers-on');
    expect(moduleLesson(3, 'timers-on-delay-off-delay')).toBeTruthy();
  });

  it('GDE-002 a 111-lesson course renders within the budget', async () => {
    // The generated course of syntheticCourse.ts: 111 lessons and the paths of lessons/course.json. The budget is the plan's (Task
    // G3: the tree is virtualised only if a render over a 111-lesson fixture takes over 100 ms); its worst case, every row open, is
    // timed with production React in LearnOutline.browser.test.ts.
    const synthetic = syntheticCourse();
    const pathLessons = allOpenLessonRows(synthetic) - synthetic.lessons.length;
    expect(synthetic.course.paths?.length ?? 0).toBeGreaterThan(0);
    const view = buildCourseView(synthetic, emptyProgress(), { locale: 'en', unlockAll: false });
    const all = new Set([...view.paths.map((path) => pathNodeId(path.id)), ...view.modules.map((mod) => moduleNodeId(mod.id))]);
    const t0 = performance.now();
    const rows = buildCourseOutlineRows(view, { expanded: all, filter: '', currentLessonId: null });
    expect(performance.now() - t0).toBeLessThan(100);
    expect(rows.filter((row) => row.kind === 'lesson')).toHaveLength(111 + pathLessons);

    // The first mount the learner sees: a current lesson, so its module is open. Each time is the median of five samples, so that
    // one slice the scheduler gives another process does not decide it.
    const median = (samples: number[]) => samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;
    const current = 'synthetic-45';
    dom.patchStore(useLearnUi, { selected: current } as never);
    const mounts: number[] = [];
    let mounted = dom.render(<LearnOutline index={synthetic} />);
    mounted.unmount();
    for (let sample = 0; sample < 5; sample++) {
      if (sample > 0) mounted.unmount();
      const t1 = performance.now();
      mounted = dom.render(<LearnOutline index={synthetic} />);
      mounts.push(performance.now() - t1);
    }
    expect(median(mounts)).toBeLessThan(100);
    const currentModule = synthetic.lessons.find((lesson) => lesson.id === current)!.module;
    expect(rowById(moduleNodeId(currentModule)).getAttribute('aria-expanded')).toBe('true');
    expect(moduleLesson(currentModule, current).getAttribute('aria-current')).toBe('true');

    // Every lesson shown at once: a filter that matches them all opens every path and module. The plan's budget is the mount above;
    // this render of every row is checked for its rows only here (happy-dom is not a browser).
    const { user } = mounted;
    await user.type(filterBox(), 'synthetic');
    expect(document.querySelectorAll('[role="treeitem"][aria-level="2"]')).toHaveLength(111 + pathLessons);
  });

  it('GDE-002 choosing a lesson opens its reading page, or starts it when it has none', async () => {
    // Which shipped lessons have a reading page changes as pages land, so both lessons are picked from the index when the test runs;
    // every lesson is unlocked so that neither is held back by its prerequisites.
    const withReading = LESSON_INDEX.lessons.find((lesson) => lesson.reading);
    const withoutReading = LESSON_INDEX.lessons.find((lesson) => !lesson.reading);
    expect(withReading).toBeDefined();
    expect(withoutReading).toBeDefined();
    dom.patchStore(useAppSettings, { settings: { ...useAppSettings.getState().settings, unlockAllLessons: true } } as never);
    const { user } = dom.render(<LearnOutline />);
    await user.click(rowById(moduleNodeId(withReading!.module)));
    await user.click(moduleLesson(withReading!.module, withReading!.id));
    expect(useLearnUi.getState().selected).toBe(withReading!.id);
    expect(useLearnUi.getState().reading).toBe(withReading!.id);
    expect(started).toEqual([]);

    if (withoutReading!.module !== withReading!.module) await user.click(rowById(moduleNodeId(withoutReading!.module)));
    await user.click(moduleLesson(withoutReading!.module, withoutReading!.id));
    expect(started).toEqual([withoutReading!.id]);
  });

  it('GDE-002 the Learn activity shows the outline when no lesson workspace is open', () => {
    dom.patchStore(useShellLayout, { activityView: 'learn' } as never);
    dom.render(<PrimarySidebar />);
    expect(tree()).toBeTruthy();
  });
});
