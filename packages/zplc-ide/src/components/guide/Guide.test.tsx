import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../../test/dom';

// GDE-003: the Guide is built from the real generated lesson index, never from a hand-typed lesson.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { LESSON_INDEX } = await import('../../generated/lessonIndex');
const { useAppSettings } = await import('../../store/useAppSettings');
const { useIDEStore } = await import('../../store/useIDEStore');
const { useLearnUi } = await import('../../learn/learnUi');
const { useLearnProgress } = await import('../../learn/progressState');
const { learnLessonCatalog } = await import('../learnLesson');
const { LearnPanel } = await import('../LearnPanel');
const { buildCourseView } = await import('../../learn/course');
const { Guide } = await import('./Guide');

const lessonEntry = LESSON_INDEX.lessons.find((entry) => entry.reading) ?? LESSON_INDEX.lessons[0]!;
const lesson = learnLessonCatalog.en.find((candidate) => candidate.id === lessonEntry.id)!;

// The lesson check exists on the desktop host only; the Guide shows Check where it does.
const host = window as unknown as { electronAPI?: Record<string, unknown> };
const before = host.electronAPI;
afterEach(() => {
  host.electronAPI = before;
});

function open(withCheck = true) {
  host.electronAPI = { ...before, ...(withCheck ? { workspaceTests: { lessonCheck: async () => ({ status: 'unavailable' }) } } : {}) };
  dom.patchStore(useAppSettings, {
    settings: { ...useAppSettings.getState().settings, unlockAllLessons: true, hideSolutions: false },
  } as never);
  dom.patchStore(useLearnProgress, { document: null, loaded: true, failed: false } as never);
  dom.patchStore(useLearnUi, {
    selected: lesson.id,
    starting: false,
    workspace: { lessonId: lesson.id, session: useIDEStore.getState().projectSession },
  } as never);
}

const hardwareEntry = LESSON_INDEX.lessons.find((entry) => entry.hardware)!;
const hardwareLesson = learnLessonCatalog.en.find((candidate) => candidate.id === hardwareEntry.id)!;

function passed(id: string) {
  dom.patchStore(useLearnProgress, {
    document: {
      schemaVersion: 2,
      last: null,
      lessons: {
        [id]: { state: 'passed', grade: null, passedAt: null, startedAt: null, hintsShown: [], solutionShown: false, hardware: null },
      },
    },
  } as never);
}

describe('The Guide (GDE-003)', () => {
  it('GDE-003 the Guide shows the title, the position, one stage with Back and Next, the hints and an action bar', async () => {
    open();
    const { user } = dom.render(<Guide />);
    expect(dom.screen.getByRole('heading', { level: 2, name: lesson.title })).toBeTruthy();
    expect(document.querySelector('[data-guide-position]')!.textContent).toMatch(/^Lesson \d+ of \d+/);
    // one stage at a time
    expect(document.querySelectorAll('[data-guide-stage]')).toHaveLength(1);
    expect(dom.screen.getByText(lesson.stages[0]!.title)).toBeTruthy();
    expect((dom.screen.getByRole('button', { name: dom.t('u3Guide.back') }) as HTMLButtonElement).disabled).toBe(true);
    if (lesson.stages.length > 1) {
      await user.click(dom.screen.getByRole('button', { name: dom.t('u3Guide.next') }));
      expect(dom.screen.getByText(lesson.stages[1]!.title)).toBeTruthy();
      expect(document.querySelectorAll('[data-guide-stage]')).toHaveLength(1);
    }
    expect(dom.screen.getByRole('region', { name: dom.t('learn.hints') })).toBeTruthy();
    expect(document.querySelector('[data-guide-actions]')).not.toBeNull();
  });

  it('GDE-003 the action bar is the last element and Check is the first control in it', () => {
    open();
    const { container } = dom.render(<Guide />);
    const bar = document.querySelector('[data-guide-actions]')!;
    const root = container.firstElementChild!;
    expect(root.lastElementChild).toBe(bar);
    const controls = [...bar.querySelectorAll('button')];
    expect(controls[0]!.hasAttribute('data-learn-check')).toBe(true);
    const order = ['data-learn-check', 'data-learn-reset', 'data-learn-read-again', 'data-learn-show-solution'];
    const at = order.map((name) => controls.findIndex((control) => control.hasAttribute(name)));
    expect(at).toEqual([0, 1, 2, 3]);
  });

  it('GDE-002 the Guide contains no list of lessons', () => {
    open();
    dom.render(<Guide />);
    expect(document.querySelector('[data-learn-lesson-button]')).toBeNull();
    expect(dom.screen.queryByRole('group', { name: dom.t('learn.lesson') })).toBeNull();
  });

  it('PLT-013 the grade states and the data-learn attributes of 2.0 are unchanged', () => {
    open();
    const names = (root: ParentNode) =>
      new Set(
        [...root.querySelectorAll('*')].flatMap((element) => element.getAttributeNames().filter((name) => name.startsWith('data-learn-'))),
      );
    const panel = dom.render(<LearnPanel />);
    const old = names(document);
    const oldGrade = document.querySelector('[data-learn-grade]')!.getAttribute('data-learn-grade');
    panel.unmount();
    dom.render(<Guide />);
    const now = names(document);
    for (const name of [
      'data-learn-grade',
      'data-learn-check',
      'data-learn-check-status',
      'data-learn-reset',
      'data-learn-read-again',
      'data-learn-show-solution',
    ]) {
      expect(old.has(name)).toBe(true);
      expect(now.has(name)).toBe(true);
    }
    expect(document.querySelector('[data-learn-grade]')!.getAttribute('data-learn-grade')).toBe(oldGrade);
  });

  it('GDE-005 file paths and the scenario id are inside a closed disclosure and there is no language control', () => {
    open();
    dom.render(<Guide />);
    const files = document.querySelector('[data-guide-files]') as HTMLDetailsElement;
    expect(files.tagName).toBe('DETAILS');
    expect(files.open).toBe(false);
    expect(files.querySelector('summary')!.textContent).toBe(dom.t('u3Guide.files.title'));
    expect(files.textContent).toContain(lesson.sourcePath);
    expect(files.textContent).toContain(lesson.scenarioPath);
    expect(files.textContent).toContain(lesson.requiredScenario);
    // nothing of it outside the disclosure
    for (const text of [lesson.sourcePath, lesson.scenarioPath]) {
      const outside = [...document.querySelectorAll('p, span, code')].filter((el) => el.textContent?.startsWith(text) && !files.contains(el));
      expect(outside.map((el) => el.outerHTML.slice(0, 200))).toEqual([]);
    }
    expect(dom.screen.queryByRole('group', { name: dom.t('learn.lessonLanguage') })).toBeNull();
    expect(dom.screen.queryByRole('button', { name: 'Español' })).toBeNull();
  });

  it('GDE-008 after a pass the Guide offers the next lesson of the path', () => {
    open();
    const view = buildCourseView(LESSON_INDEX, null, { locale: 'en', unlockAll: true });
    const path = view.paths.find((candidate) => candidate.lessons.some((item) => item.id === lesson.id))!;
    const at = path.lessons.findIndex((item) => item.id === lesson.id);
    expect(at).toBeLessThan(path.lessons.length - 1);
    const next = path.lessons[at + 1]!;
    // before a pass: nothing
    const first = dom.render(<Guide />);
    expect(document.querySelector('[data-guide-next-lesson]')).toBeNull();
    first.unmount();
    passed(lesson.id);
    dom.render(<Guide />);
    const button = document.querySelector('[data-guide-next-lesson]') as HTMLButtonElement;
    expect(button.textContent).toContain(dom.t('u3Guide.nextLesson'));
    expect(button.textContent).toContain(next.title);
    expect(document.querySelector('[data-guide-actions]')!.contains(button)).toBe(true);
  });

  it('GDE-008 the last lesson of a path offers nothing after a pass', () => {
    const view = buildCourseView(LESSON_INDEX, null, { locale: 'en', unlockAll: true });
    const path = view.paths[0]!;
    const final = path.lessons[path.lessons.length - 1]!;
    open();
    dom.patchStore(useLearnUi, { selected: final.id, workspace: null } as never);
    passed(final.id);
    dom.render(<Guide />);
    expect(document.querySelector('[data-guide-next-lesson]')).toBeNull();
  });

  it('GDE-009 the board track is closed until opened and shows the connection indicator', async () => {
    open();
    dom.patchStore(useLearnUi, { selected: hardwareLesson.id, workspace: null } as never);
    const { user } = dom.render(<Guide />);
    const board = document.querySelector('[data-guide-board]') as HTMLDetailsElement;
    expect(board.tagName).toBe('DETAILS');
    expect(board.open).toBe(false);
    expect(board.querySelector('summary [data-connection]')).not.toBeNull();
    expect(board.querySelector('[data-learn-board-lesson]')).not.toBeNull();
    await user.click(board.querySelector('summary')!);
    expect(board.open).toBe(true);
  });

  it('GDE-009 a lesson without a board track has no board section', () => {
    open();
    dom.render(<Guide />);
    if (!lessonEntry.hardware) expect(document.querySelector('[data-guide-board]')).toBeNull();
  });
});
