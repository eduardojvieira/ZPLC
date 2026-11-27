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
const { LearnOutline } = await import('./learn/LearnOutline');
const { useLearnLayout } = await import('../store/useLearnLayout');
const { usePlantDocument } = await import('../store/usePlantDocument');
const { useShellLayout } = await import('../store/useShellLayout');
const { runCommand } = await import('../commands/bus');
const { useGuideCommands } = await import('../commands/bind/guide');

// WITHOUT is named by id, a lesson with no reading page: the second lesson of the course has one since the explaining lessons
// come first, and deleting it here would strip the real page for every later test of the process.
const WITH = LESSON_INDEX.lessons[0]!;
const WITHOUT = LESSON_INDEX.lessons.find(({ id }) => id === 'pedestrian-crossing-states')!;
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

  it('GDE-002 Practice from a reading page opened in the course outline starts the lesson', async () => {
    const started: string[] = [];
    dom.patchStore(useLearnUi, { startLesson: async (id: string) => (started.push(id), true) } as never);
    const { user } = dom.render(
      <>
        <LearnOutline />
        <LearnReadingView />
      </>,
    );
    await user.type(dom.screen.getByRole('textbox', { name: dom.t('u3Learn.outline.filterLabel') }), WITH.id);
    await user.click(document.querySelector<HTMLElement>(`[data-learn-outline] [data-row$=${JSON.stringify(`:lesson:${WITH.id}`)}]`)!);
    expect(useLearnUi.getState().reading).toBe(WITH.id);
    expect(started).toEqual([]);

    await user.click(dom.within(dialog()!).getByRole('button', { name: dom.t('learnReading.view.practice') }));
    await dom.waitFor(() => expect(useLearnUi.getState().reading).toBeNull());
    expect(started).toEqual([WITH.id]);
    expect(dialog()).toBeNull();
  });

  it('GDE-002 after Practice the workspace is open with the exercise in front, and the page can be read again', async () => {
    const { user } = dom.render(
      <>
        <LearnOutline />
        <LearnReadingView />
      </>,
    );
    await user.type(dom.screen.getByRole('textbox', { name: dom.t('u3Learn.outline.filterLabel') }), WITH.id);
    await user.click(document.querySelector<HTMLElement>(`[data-learn-outline] [data-row$=${JSON.stringify(`:lesson:${WITH.id}`)}]`)!);
    await user.click(dom.within(dialog()!).getByRole('button', { name: dom.t('learnReading.view.practice') }));
    await dom.waitFor(() => expect(useLearnUi.getState().workspace?.lessonId).toBe(WITH.id));
    await dom.waitFor(() => expect(dialog()).toBeNull());
    expect(useLearnUi.getState().reading).toBeNull();
    // With the workspace open, Practice from the page read again only closes it.
    await dom.act(async () => useLearnUi.getState().openReading(WITH.id));
    await user.click(dom.within(dialog()!).getByRole('button', { name: dom.t('learnReading.view.practice') }));
    expect(dialog()).toBeNull();
    expect(useLearnUi.getState().workspace?.lessonId).toBe(WITH.id);
  });
});

// GDE-006, GDE-007: the frame of the page and the layout Practice opens.
const SCENE = LESSON_INDEX.lessons.find(({ id }) => id === 'plant-belt-to-sensor')!;
const NO_PLANT = LESSON_INDEX.lessons.find(({ id }) => id === 'ld-no-nc-contacts')!;
const LAB = LESSON_INDEX.lessons.find(({ id }) => id === 'boolean-logic-two-hand-guard-ladder')!;

function CommandsHost() {
  useGuideCommands();
  return null;
}

/** A workspace of `lesson` is open with the lesson's first file in the tree; the page is showing. */
async function practiceSetup(lesson: (typeof LESSON_INDEX.lessons)[number]) {
  (lesson as { reading?: unknown }).reading = PAGE;
  const opened: string[] = [];
  dom.patchStore(usePlantDocument, { open: false, active: false } as never);
  dom.patchStore(useShellLayout, { secondaryVisible: false } as never);
  dom.patchStore(useIDEStore, {
    fileTree: {
      id: 'dir:/',
      name: 'p',
      type: 'directory',
      path: '',
      children: [{ id: `file:${lesson.starter.program}`, name: 'f', type: 'file', path: lesson.starter.program }],
    },
    openFile: async (id: string) => void opened.push(id),
  } as never);
  dom.patchStore(useLearnUi, {
    workspace: { lessonId: lesson.id, session: useIDEStore.getState().projectSession },
    reading: lesson.id,
  } as never);
  const view = dom.render(
    <>
      <CommandsHost />
      <LearnReadingView />
    </>,
  );
  return { ...view, opened };
}

describe('the reading frame and the lesson layout (GDE-006, GDE-007)', () => {
  it('GDE-006 the header holds Back to course, the title, the position and Practice, and the page raises the reading flag', async () => {
    const { container } = await practiceSetup(NO_PLANT);
    const header = dialog2(NO_PLANT).querySelector('header')!;
    expect(dom.within(header as HTMLElement).getByRole('heading', { level: 1, name: NO_PLANT.text.en.title })).toBeTruthy();
    expect(dom.within(header as HTMLElement).getByRole('button', { name: dom.t('learnReading.view.back') })).toBeTruthy();
    expect(dom.within(header as HTMLElement).getByRole('button', { name: dom.t('learnReading.view.practice') })).toBeTruthy();
    expect(header.querySelector('[data-reading-position]')?.textContent).toMatch(/\d+/);
    expect(useLearnLayout.getState().reading).toBe(true);
    expect(container).toBeTruthy();
  });

  it("GDE-006 the lab's own run controls are present on the page", async () => {
    dom.render(<LearnReadingView />);
    await dom.act(async () => useLearnUi.getState().openReading(LAB.id));
    expect(dom.screen.getByRole('button', { name: 'Run' })).toBeTruthy();
  });

  it('GDE-006 the flag goes down when the page closes', async () => {
    const { user } = await practiceSetup(NO_PLANT);
    await user.keyboard('{Escape}');
    expect(useLearnLayout.getState().reading).toBe(false);
  });

  it('GDE-007 Practice opens the first file, the plant beside it when the lesson names one, and the Guide', async () => {
    const { user, opened } = await practiceSetup(SCENE);
    await user.click(dom.screen.getByRole('button', { name: dom.t('learnReading.view.practice') }));
    expect(opened).toEqual([`file:${SCENE.starter.program}`]);
    expect(usePlantDocument.getState().open).toBe(true);
    expect(useShellLayout.getState().secondaryVisible).toBe(true);
  });

  it('GDE-007 a 2.0 lesson without a plant opens no plant document', async () => {
    const { user, opened } = await practiceSetup(NO_PLANT);
    await user.click(dom.screen.getByRole('button', { name: dom.t('learnReading.view.practice') }));
    expect(opened).toEqual([`file:${NO_PLANT.starter.program}`]);
    expect(usePlantDocument.getState().open).toBe(false);
    expect(useShellLayout.getState().secondaryVisible).toBe(true);
  });

  it('GDE-007 the Lesson layout command restores the layout', async () => {
    const { user, opened } = await practiceSetup(SCENE);
    await user.keyboard('{Escape}');
    dom.patchStore(usePlantDocument, { open: false, active: false } as never);
    dom.patchStore(useShellLayout, { secondaryVisible: false } as never);
    await dom.act(async () => runCommand('view.lessonLayout'));
    expect(opened.length).toBe(1);
    expect(usePlantDocument.getState().open).toBe(true);
    expect(useShellLayout.getState().secondaryVisible).toBe(true);
    expect(user).toBeTruthy();
  });

  it('LRN-039 Escape closes the page and gives the focus back to the Guide', async () => {
    const { user } = await practiceSetup(NO_PLANT);
    const guide = document.createElement('h2');
    guide.id = 'learn-title';
    guide.tabIndex = -1;
    document.body.append(guide);
    await user.keyboard('{Escape}');
    expect(useLearnUi.getState().reading).toBeNull();
    expect(isFocused(guide)).toBe(true);
    guide.remove();
  });
});
const dialog2 = (lesson: { text: { en: { title: string } } }) => dom.screen.getByRole('dialog', { name: lesson.text.en.title });
