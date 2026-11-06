import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { isFocused, setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

// LRN-039: a lesson with a reading page opens it full screen first; Practice, Back to course, Esc and Read again move between the
// reading view, the lesson panel and the Learn home. Driven through the public store actions and user events.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { useAppSettings } = await import('../store/useAppSettings');
const { useLearnUi } = await import('../learn/learnUi');
const { useLearnProgress } = await import('../learn/progressState');
const { LESSON_INDEX } = await import('../generated/lessonIndex');
const { LearnPanel } = await import('./LearnPanel');
const { LearnHome } = await import('./LearnHome');
const { LearnReadingView } = await import('./LearnReadingView');

const [WITH, WITHOUT] = [LESSON_INDEX.lessons[0]!, LESSON_INDEX.lessons[1]!];
const original = WITH.reading;
const PAGE = { en: '## Hello page\n\nA paragraph.', es: '## Página de hola\n\nUn párrafo.', files: {}, images: [] };

/** The shell in small: the panel beside the editor, the home and the reading view over it. */
function Shell() {
  const home = useLearnUi((state) => state.homeOpen);
  return (
    <>
      <LearnPanel />
      {home && <LearnHome />}
      <LearnReadingView />
    </>
  );
}

beforeEach(() => {
  (WITH as { reading?: unknown }).reading = PAGE;
  delete (WITHOUT as { reading?: unknown }).reading;
  (window as unknown as Record<string, unknown>).showDirectoryPicker = () => undefined;
  dom.patchStore(useAppSettings, {
    settings: { ...useAppSettings.getState().settings, unlockAllLessons: true, language: 'en' },
  } as never);
  dom.patchStore(useLearnProgress, { document: null, loaded: true, failed: false } as never);
  dom.patchStore(useLearnUi, { selected: null, starting: false, workspace: null, homeOpen: false, reading: null } as never);
  dom.patchStore(useIDEStore, {
    recentProjects: [{ recentId: 'r', available: true, lastOpenedAt: Date.now() + 600_000 }],
    refreshRecentProjects: async () => undefined,
    copyExampleProjectToFolder: async () => true,
    openRecentProject: async () => true,
  } as never);
});
afterEach(() => {
  (WITH as { reading?: unknown }).reading = original;
});

const open = async (id: string, locale?: 'es') => {
  const view = dom.render(<Shell />, locale ? { locale } : {});
  await dom.act(async () => {
    await useLearnUi.getState().startLesson(id);
  });
  return view;
};
const dialog = () => dom.screen.queryByRole('dialog', { name: WITH.text.en.title });

describe('the reading view (LRN-039)', () => {
  it('LRN-039 starting a lesson with a reading page shows it full screen: module, title as h1, time and the page', async () => {
    await open(WITH.id);
    const view = dialog()!;
    expect(view).toBeTruthy();
    expect(dom.within(view).getByRole('heading', { level: 1, name: WITH.text.en.title })).toBeTruthy();
    expect(dom.within(view).getByRole('heading', { level: 2, name: 'Hello page' })).toBeTruthy();
    expect(view.textContent).toContain(dom.t('learnReading.view.minutes', { minutes: WITH.estimatedMinutes }));
    expect(useLearnUi.getState().workspace?.lessonId).toBe(WITH.id);
    expect(useLearnUi.getState().homeOpen).toBe(false);
  });

  it('LRN-039 reads the page in the language of the app', async () => {
    await open(WITH.id, 'es');
    expect(dom.screen.getByRole('heading', { level: 2, name: 'Página de hola' })).toBeTruthy();
  });

  it('LRN-039 Practice closes the view and moves the focus to the lesson panel', async () => {
    const { user } = await open(WITH.id);
    await user.click(dom.within(dialog()!).getByRole('button', { name: dom.t('learnReading.view.practice') }));
    expect(dialog()).toBeNull();
    expect(useLearnUi.getState().reading).toBeNull();
    expect(isFocused(dom.screen.getByRole('heading', { level: 2, name: WITH.text.en.title }))).toBe(true);
  });

  it('LRN-039 Escape does what Practice does', async () => {
    const { user } = await open(WITH.id);
    await user.keyboard('{Escape}');
    expect(dialog()).toBeNull();
    expect(isFocused(dom.screen.getByRole('heading', { level: 2, name: WITH.text.en.title }))).toBe(true);
  });

  it('LRN-039 Back to course closes the view and opens the Learn home, never both at once', async () => {
    const { user } = await open(WITH.id);
    await user.click(dom.within(dialog()!).getByRole('button', { name: dom.t('learnReading.view.back') }));
    expect(dialog()).toBeNull();
    expect(useLearnUi.getState().homeOpen).toBe(true);
    expect(document.querySelector('[data-learn-home]')).toBeTruthy();
  });

  it('LRN-039 keeps the focus inside the view: Tab from the last control wraps to the first', async () => {
    const { user } = await open(WITH.id);
    const buttons = dom.within(dialog()!).getAllByRole('button');
    buttons[buttons.length - 1]!.focus();
    await user.tab();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    expect(isFocused(buttons[0]!)).toBe(true);
  });

  it('LRN-039 the lesson panel offers Read again, which reopens the page', async () => {
    const { user } = await open(WITH.id);
    await user.keyboard('{Escape}');
    await user.click(dom.screen.getByRole('button', { name: dom.t('learnReading.view.readAgain') }));
    expect(dialog()).toBeTruthy();
  });

  it('LRN-039 a lesson without a reading page opens as before: the workspace, the lesson panel and no reading view', async () => {
    dom.patchStore(useLearnUi, { homeOpen: true } as never);
    await open(WITHOUT.id);
    expect(useLearnUi.getState()).toMatchObject({ reading: null, homeOpen: false, selected: WITHOUT.id });
    expect(useLearnUi.getState().workspace?.lessonId).toBe(WITHOUT.id);
    expect(dom.screen.queryByRole('dialog')).toBeNull();
    expect(dom.screen.queryByRole('button', { name: dom.t('learnReading.view.readAgain') })).toBeNull();
  });

  it('LRN-039 a page that does not parse shows a short error and the way out, never a crash', async () => {
    (WITH as { reading?: unknown }).reading = { ...PAGE, en: '# Not allowed' };
    const { user } = await open(WITH.id);
    expect(dom.within(dialog()!).getByRole('alert').textContent).toContain(dom.t('learnReading.view.error'));
    await user.click(dom.within(dialog()!).getByRole('button', { name: dom.t('learnReading.view.practice') }));
    expect(dialog()).toBeNull();
  });
});
