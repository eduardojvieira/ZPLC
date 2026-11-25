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
  dom.patchStore(useAppSettings, { settings: { ...useAppSettings.getState().settings, unlockAllLessons: true, hideSolutions: false } } as never);
  dom.patchStore(useLearnProgress, { document: null, loaded: true, failed: false } as never);
  dom.patchStore(useLearnUi, {
    selected: lesson.id,
    starting: false,
    workspace: { lessonId: lesson.id, session: useIDEStore.getState().projectSession },
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
      new Set([...root.querySelectorAll('*')].flatMap((element) => element.getAttributeNames().filter((name) => name.startsWith('data-learn-'))));
    const panel = dom.render(<LearnPanel />);
    const old = names(document);
    const oldGrade = document.querySelector('[data-learn-grade]')!.getAttribute('data-learn-grade');
    panel.unmount();
    dom.render(<Guide />);
    const now = names(document);
    for (const name of ['data-learn-grade', 'data-learn-check', 'data-learn-check-status', 'data-learn-reset', 'data-learn-read-again', 'data-learn-show-solution']) {
      expect(old.has(name)).toBe(true);
      expect(now.has(name)).toBe(true);
    }
    expect(document.querySelector('[data-learn-grade]')!.getAttribute('data-learn-grade')).toBe(oldGrade);
  });
});
