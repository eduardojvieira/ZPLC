import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
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
const { useIDEStore } = await import('../../store/useIDEStore');
const { useShellLayout } = await import('../../store/useShellLayout');
const { PrimarySidebar } = await import('../../shell/Sidebars');
const { buildCourseOutlineRows, moduleNodeId, pathNodeId } = await import('./courseOutline');
const { LearnOutline } = await import('./LearnOutline');

const FIRST_MODULE_1 = 'ld-what-is-a-plc';
const IN_PROGRESS_ID = 'first-blink-simulation';
const AVAILABLE_ID = 'ld-scan-cycle';
const LOCKED_ID = 'scan-cycle-one-scan-memory';

const restores: Array<() => void> = [];

function withoutFolderAccess(): void {
  const host = window as unknown as Record<string, unknown>;
  const before = Object.fromEntries(['electronAPI', 'showDirectoryPicker'].filter((key) => key in host).map((key) => [key, host[key]]));
  delete host.electronAPI;
  delete host.showDirectoryPicker;
  restores.push(() => {
    Object.assign(host, before);
  });
}

function withFolderAccess(): void {
  const host = window as unknown as Record<string, unknown>;
  const had = 'showDirectoryPicker' in host;
  const previous = host.showDirectoryPicker;
  host.showDirectoryPicker = () => undefined;
  restores.push(() => {
    if (had) host.showDirectoryPicker = previous;
    else delete host.showDirectoryPicker;
  });
}

function setProgress(document: LearnProgress | null): void {
  dom.patchStore(useLearnProgress, { document, loaded: true, failed: false } as never);
}

beforeEach(() => {
  dom.patchStore(useAppSettings, {
    settings: { ...useAppSettings.getState().settings, unlockAllLessons: false, language: 'en' },
  } as never);
  setProgress(emptyProgress());
  dom.patchStore(useLearnUi, { selected: null, starting: false, workspace: null, reading: null, homeOpen: false } as never);
  dom.patchStore(useShellLayout, { activityView: 'project', primaryVisible: true } as never);
});

afterEach(() => {
  while (restores.length > 0) restores.pop()!();
});

const tree = () => dom.screen.getByRole('tree', { name: dom.t('u3Learn.outline.title') });
const rowById = (rowId: string): HTMLElement => document.querySelector<HTMLElement>(`[data-row="${CSS.escape(rowId)}"]`)!;

describe('The Learn activity course outline (GDE-002, UX-024, UX-026)', () => {
  it('GDE-002 the outline lists paths and modules that open and close', async () => {
    const { user } = dom.render(<LearnOutline />);
    expect(tree()).toBeTruthy();

    const paths = LESSON_INDEX.course.paths ?? [];
    const modules = LESSON_INDEX.course.modules;
    expect(paths.length).toBeGreaterThan(0);
    expect(modules.length).toBeGreaterThan(0);

    for (const path of paths) {
      const node = rowById(pathNodeId(path.id));
      expect(node).toBeTruthy();
      expect(node.getAttribute('role')).toBe('treeitem');
      expect(node.getAttribute('aria-level')).toBe('1');
      expect(node.getAttribute('aria-expanded')).toBe('false');
    }
    for (const mod of modules) {
      const node = rowById(moduleNodeId(mod.id));
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

  it('GDE-002 each lesson has a state icon and a text equivalent, and the current lesson is marked', () => {
    const progress = withNote(
      withPassedIds(emptyProgress(), [FIRST_MODULE_1]),
      { lessonId: IN_PROGRESS_ID, started: true, last: true },
      '2026-11-26T10:00:00.000Z',
    );
    setProgress(progress);
    dom.patchStore(useLearnUi, { selected: IN_PROGRESS_ID } as never);

    const { unmount } = dom.render(<LearnOutline />);
    const checks = [
      { id: FIRST_MODULE_1, state: 'passed' },
      { id: IN_PROGRESS_ID, state: 'in-progress' },
      { id: AVAILABLE_ID, state: 'available' },
      { id: LOCKED_ID, state: 'locked' },
    ] as const;

    for (const item of checks) {
      const row = rowById(`module:1:lesson:${item.id}`);
      expect(row).toBeTruthy();
      expect(row.getAttribute('data-state')).toBe(item.state);
      const icon = row.querySelector(`[data-outline-state-icon="${item.state}"] svg`);
      expect(icon).not.toBeNull();
      expect(icon!.getAttribute('aria-hidden')).toBe('true');
      const stateText = row.querySelector('[data-outline-state-text]')?.textContent?.trim();
      expect(stateText).toBe(dom.t(`learn.state.${item.state}`));
    }

    const currentRow = rowById(`module:1:lesson:${IN_PROGRESS_ID}`);
    expect(currentRow.getAttribute('aria-current')).toBe('true');
    expect(currentRow.textContent).toContain(dom.t('u3Learn.outline.current'));
    expect(rowById(`module:1:lesson:${FIRST_MODULE_1}`).getAttribute('aria-current')).toBeNull();

    unmount();
    dom.render(<LearnOutline />, { locale: 'es' });
    const esT = dom.tFor('es');
    expect(rowById(`module:1:lesson:${FIRST_MODULE_1}`).querySelector('[data-outline-state-text]')?.textContent?.trim()).toBe(
      esT('learn.state.passed'),
    );
    expect(rowById(`module:1:lesson:${LOCKED_ID}`).querySelector('[data-outline-state-text]')?.textContent?.trim()).toBe(
      esT('learn.state.locked'),
    );
    expect(rowById(`module:1:lesson:${IN_PROGRESS_ID}`).textContent).toContain(esT('u3Learn.outline.current'));
  });

  it('GDE-002 a locked lesson says what unlocks it on hover and on focus', async () => {
    const view = buildCourseView(LESSON_INDEX, emptyProgress(), { locale: 'en', unlockAll: false });
    const firstPath = view.paths[0]!;
    const pathLockedLesson = firstPath.lessons.find((lesson) => lesson.state === 'locked')!;
    const pathPreviousTitle = view.titles[pathLockedLesson.missing[0]!] ?? pathLockedLesson.missing[0]!;

    const { user } = dom.render(<LearnOutline />);
    await user.click(rowById(moduleNodeId(1)));
    const lockedModuleRow = rowById(`module:1:lesson:${LOCKED_ID}`);
    expect(lockedModuleRow.getAttribute('aria-disabled')).toBe('true');
    expect(dom.screen.queryByRole('tooltip')).toBeNull();

    await user.hover(lockedModuleRow);
    await dom.waitFor(() => {
      const tip = dom.screen.getByRole('tooltip');
      expect(tip.textContent).toContain(view.titles[IN_PROGRESS_ID]!);
    });
    expect(lockedModuleRow.getAttribute('aria-describedby')).toBe(dom.screen.getByRole('tooltip').id);
    await user.unhover(lockedModuleRow);
    await dom.waitFor(() => expect(dom.screen.queryByRole('tooltip')).toBeNull());

    await user.click(rowById(pathNodeId(firstPath.id)));
    const lockedPathRow = rowById(`path:${firstPath.id}:lesson:${pathLockedLesson.id}`);
    await dom.act(async () => {
      lockedPathRow.focus();
    });
    const tip = dom.screen.getByRole('tooltip');
    expect(tip.textContent).toContain(pathPreviousTitle);
    expect(lockedPathRow.getAttribute('aria-describedby')).toBe(tip.id);

    // No raw HTML title attributes anywhere in the outline.
    expect(document.querySelector('[data-learn-outline] [title]:not(svg title)')).toBeNull();
  });

  it('GDE-002 the filter narrows by title and id and keeps the open state', async () => {
    const { user } = dom.render(<LearnOutline />);
    const module1Row = rowById(moduleNodeId(1));
    const module3Row = rowById(moduleNodeId(3));

    await user.click(module1Row);
    expect(module1Row.getAttribute('aria-expanded')).toBe('true');
    expect(module3Row.getAttribute('aria-expanded')).toBe('false');

    const filterInput = dom.screen.getByRole('textbox', { name: dom.t('u3Learn.outline.filterLabel') });
    await user.type(filterInput, 'timers-on-delay-off-delay');

    expect(rowById('module:3:lesson:timers-on-delay-off-delay')).toBeTruthy();
    expect(rowById(moduleNodeId(3)).getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector(`[data-row="${CSS.escape(moduleNodeId(1))}"]`)).toBeNull();

    await user.clear(filterInput);
    const targetLesson = LESSON_INDEX.lessons.find((lesson) => lesson.id === 'timers-on-delay-off-delay')!;
    await user.type(filterInput, targetLesson.text.en.title.slice(0, 12));
    expect(rowById('module:3:lesson:timers-on-delay-off-delay')).toBeTruthy();

    await user.clear(filterInput);
    await user.type(filterInput, 'zzz-no-such-lesson');
    expect(dom.screen.getByText(dom.t('u3Learn.outline.filterEmpty', { query: 'zzz-no-such-lesson' }))).toBeTruthy();

    await user.clear(filterInput);
    expect(rowById(moduleNodeId(1)).getAttribute('aria-expanded')).toBe('true');
    expect(rowById(moduleNodeId(3)).getAttribute('aria-expanded')).toBe('false');
  });

  it('GDE-002 the outline is a tree operable by keyboard alone', async () => {
    withoutFolderAccess();
    const { user } = dom.render(<LearnOutline />);
    const paths = LESSON_INDEX.course.paths ?? [];
    const firstPath = paths[0]!;
    const firstPathNode = rowById(pathNodeId(firstPath.id));

    await user.tab();
    expect(isFocused(dom.screen.getByRole('textbox', { name: dom.t('u3Learn.outline.filterLabel') }))).toBe(true);
    await user.tab();
    expect(isFocused(firstPathNode)).toBe(true);

    // ArrowRight opens the closed path; ArrowRight again moves to its first lesson child.
    await user.keyboard('{ArrowRight}');
    expect(firstPathNode.getAttribute('aria-expanded')).toBe('true');
    expect(isFocused(firstPathNode)).toBe(true);

    const firstChildId = `path:${firstPath.id}:lesson:${firstPath.lessons[0]!}`;
    await user.keyboard('{ArrowRight}');
    await dom.waitFor(() => expect(isFocused(rowById(firstChildId))).toBe(true));

    // ArrowDown moves to the second lesson (locked in path 0), ArrowLeft returns to parent, ArrowLeft closes it.
    const secondChildId = `path:${firstPath.id}:lesson:${firstPath.lessons[1]!}`;
    await user.keyboard('{ArrowDown}');
    await dom.waitFor(() => expect(isFocused(rowById(secondChildId))).toBe(true));
    await user.keyboard('{Enter}');
    expect(useLearnUi.getState().selected).toBeNull();

    await user.keyboard('{ArrowLeft}');
    await dom.waitFor(() => expect(isFocused(firstPathNode)).toBe(true));
    await user.keyboard('{ArrowLeft}');
    expect(firstPathNode.getAttribute('aria-expanded')).toBe('false');

    // End and Home jump across visible rows.
    const lastModuleId = moduleNodeId(LESSON_INDEX.course.modules[LESSON_INDEX.course.modules.length - 1]!.id);
    await user.keyboard('{End}');
    await dom.waitFor(() => expect(isFocused(rowById(lastModuleId))).toBe(true));
    await user.keyboard('{Home}');
    await dom.waitFor(() => expect(isFocused(firstPathNode)).toBe(true));

    // Open the path again, enter the unlocked first lesson, and confirm it opens/selects.
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{ArrowDown}');
    await dom.waitFor(() => expect(isFocused(rowById(firstChildId))).toBe(true));
    await user.keyboard('{Enter}');
    expect(useLearnUi.getState().selected).toBe(firstPath.lessons[0]!);
  });

  it('GDE-002 a 111-lesson course builds and renders within budget', () => {
    expect(LESSON_INDEX.lessons.length).toBeGreaterThanOrEqual(111);
    const view = buildCourseView(LESSON_INDEX, emptyProgress(), { locale: 'en', unlockAll: false });
    const allContainers = new Set([
      ...view.paths.map((path) => pathNodeId(path.id)),
      ...view.modules.map((mod) => moduleNodeId(mod.id)),
    ]);

    const t0 = performance.now();
    const rows = buildCourseOutlineRows(view, { expanded: allContainers, filter: '', currentLessonId: FIRST_MODULE_1 });
    const buildMs = performance.now() - t0;
    expect(rows.filter((row) => row.kind === 'lesson' && row.moduleId !== null)).toHaveLength(LESSON_INDEX.lessons.length);
    expect(buildMs).toBeLessThan(100);

    const t1 = performance.now();
    dom.render(<LearnOutline />);
    const renderMs = performance.now() - t1;
    expect(renderMs).toBeLessThan(100);
  });

  it('GDE-002 choosing an unlocked lesson starts it when folder access is available and opens reading otherwise', async () => {
    withFolderAccess();
    const started: string[] = [];
    dom.patchStore(useLearnUi, { startLesson: async (id: string) => (started.push(id), true) } as never);
    const { user, unmount } = dom.render(<LearnOutline />);
    await user.click(rowById(moduleNodeId(1)));
    await user.click(rowById(`module:1:lesson:${FIRST_MODULE_1}`));
    expect(useLearnUi.getState().selected).toBe(FIRST_MODULE_1);
    expect(started).toEqual([FIRST_MODULE_1]);
    unmount();
    while (restores.length > 0) restores.pop()!();

    withoutFolderAccess();
    const readingEntry = LESSON_INDEX.lessons.find((lesson) => lesson.id === FIRST_MODULE_1)!;
    expect(readingEntry.reading).toBeDefined();
    dom.patchStore(useLearnUi, { selected: null, reading: null } as never);
    const second = dom.render(<LearnOutline />);
    await second.user.click(rowById(moduleNodeId(1)));
    await second.user.click(rowById(`module:1:lesson:${FIRST_MODULE_1}`));
    expect(useLearnUi.getState().selected).toBe(FIRST_MODULE_1);
    expect(useLearnUi.getState().reading).toBe(FIRST_MODULE_1);
  });

  it('GDE-002 LearnBody renders LearnOutline in the primary sidebar with and without a lesson workspace open', () => {
    dom.patchStore(useShellLayout, { activityView: 'learn' } as never);
    const first = dom.render(<PrimarySidebar />);
    expect(dom.screen.getByRole('tree', { name: dom.t('u3Learn.outline.title') })).toBeTruthy();
    first.unmount();

    dom.patchStore(useLearnUi, {
      workspace: { lessonId: FIRST_MODULE_1, session: useIDEStore.getState().projectSession },
    } as never);
    dom.render(<PrimarySidebar />);
    expect(dom.screen.getByRole('tree', { name: dom.t('u3Learn.outline.title') })).toBeTruthy();
  });
});
