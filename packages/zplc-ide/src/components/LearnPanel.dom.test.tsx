import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

// VF-007: the Learn lesson surface, driven through user events. Elements are found by role and by the catalog text.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { useAppSettings } = await import('../store/useAppSettings');
const { useLearnUi } = await import('../learn/learnUi');
const { useLearnProgress } = await import('../learn/progressState');
const { learnLessonCatalog } = await import('./learnLesson');
const { LearnPanel } = await import('./LearnPanel');

const en = learnLessonCatalog.en;
const es = learnLessonCatalog.es;

// What lets a lesson workspace open is the folder access of the host: another test file of the same run can leave it on the window,
// so the test that needs none removes it for its own duration.
const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()!();
});
function withoutFolderAccess(): void {
  const host = window as unknown as Record<string, unknown>;
  const before = Object.fromEntries(['electronAPI', 'showDirectoryPicker'].filter((key) => key in host).map((key) => [key, host[key]]));
  delete host.electronAPI;
  delete host.showDirectoryPicker;
  restores.push(() => {
    Object.assign(host, before);
  });
}

function show(over: { unlockAll?: boolean; hideSolutions?: boolean; selected?: string | null } = {}) {
  dom.patchStore(useAppSettings, {
    settings: {
      ...useAppSettings.getState().settings,
      unlockAllLessons: over.unlockAll ?? true,
      hideSolutions: over.hideSolutions ?? false,
    },
  } as never);
  // choosing a lesson is noted as the last one worked on: every test starts from a progress with nothing in it
  dom.patchStore(useLearnProgress, { document: null, loaded: true, failed: false } as never);
  dom.patchStore(useLearnUi, { selected: over.selected ?? null, starting: false, workspace: null } as never);
  return dom.render(<LearnPanel />);
}

/** The lesson that a button of the lesson toggle group stands for: its label is the title and the state of the lesson. */
const lessonOf = (button: HTMLElement, catalog: typeof en) =>
  catalog.find((lesson) => (button.textContent ?? '').startsWith(`${lesson.title} (`))!;
const lessonButtons = () => dom.within(dom.screen.getByRole('group', { name: dom.t('learn.lesson') })).getAllByRole('button');

describe('Learn lesson panel in a DOM (VF-007, LRN-004)', () => {
  it('is a section named by the title of the lesson, with its objectives, steps and hints as named lists', () => {
    show();
    const lesson = lessonOf(lessonButtons()[0]!, en);
    expect(dom.screen.getByRole('heading', { level: 2, name: lesson.title })).toBeTruthy();
    expect(dom.screen.getByRole('list', { name: dom.t('learn.learningObjectives') }).querySelectorAll('li')).toHaveLength(
      lesson.objectives.length,
    );
    expect(dom.screen.getByRole('list', { name: dom.t('learn.lessonSteps') }).querySelectorAll(':scope > li')).toHaveLength(
      lesson.stages.length,
    );
    expect(dom.screen.getByRole('region', { name: dom.t('learn.hints') })).toBeTruthy();
    expect(dom.screen.getByRole('region', { name: dom.t('learn.lessonEvidence') })).toBeTruthy();
  });

  it('chooses the lesson with a toggle group and shows its title; a lesson that is not unlocked cannot be chosen', async () => {
    const { user } = show();
    const options = lessonButtons();
    expect(options.length).toBe(en.length);
    const second = lessonOf(options[1]!, en);
    await user.click(options[1]!);
    await dom.waitFor(() => expect(dom.screen.getByRole('heading', { level: 2, name: second.title })).toBeTruthy());
    expect(useLearnUi.getState().selected).toBe(second.id);
    expect(lessonButtons()[1]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('with the course locked, a later lesson is disabled and the panel says which lessons come first', async () => {
    show({ unlockAll: false });
    const locked = lessonButtons().find((button) => (button as HTMLButtonElement).disabled);
    expect(locked).toBeDefined();
    useLearnUi.getState().select(lessonOf(locked!, en).id);
    await dom.waitFor(() => expect(document.querySelector('[data-learn-locked]')).not.toBeNull());
    expect(document.querySelector('[data-learn-locked]')!.getAttribute('role')).toBe('status');
    const open = dom.screen.getByRole('button', { name: dom.t('learn.openWorkspace') }) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
  });

  it('the lesson language toggle switches the lesson and the interface to Spanish', async () => {
    const { user } = show();
    const lesson = lessonOf(lessonButtons()[0]!, en);
    const group = dom.screen.getByRole('group', { name: dom.t('learn.lessonLanguage') });
    await user.click(dom.within(group).getByRole('button', { name: 'Español' }));
    await dom.waitFor(() =>
      expect(dom.screen.getByRole('heading', { level: 2, name: es.find((candidate) => candidate.id === lesson.id)!.title })).toBeTruthy(),
    );
    expect(useAppSettings.getState().settings.language).toBe('es');
    expect(dom.screen.getByRole('region', { name: dom.tFor('es')('learn.hints') })).toBeTruthy();
  });

  it('a hint opens on a click on its summary and a stage shows its checkpoint', async () => {
    const { user } = show();
    const hint = dom.screen.getByText(dom.t('learn.hint', { value: 1 }));
    const details = hint.closest('details')!;
    expect(details.open).toBe(false);
    await user.click(hint);
    expect(details.open).toBe(true);
    const checkpoint = dom.screen.getAllByText(dom.t('learn.showExpectedCheckpoint'))[0]!;
    await user.click(checkpoint);
    expect(checkpoint.closest('details')!.open).toBe(true);
  });

  it('the reference solution is asked for in a confirmation, and Cancel keeps it hidden', async () => {
    const { user } = show();
    await user.click(dom.screen.getByRole('button', { name: dom.t('learn.showTheReferenceSolution') }));
    const dialog = await dom.screen.findByRole('alertdialog');
    expect(dom.within(dialog).getByText(dom.t('learn.solution.title'))).toBeTruthy();
    await user.click(dom.within(dialog).getByRole('button', { name: dom.t('learn.solution.cancel') }));
    await dom.waitFor(() => expect(dom.screen.queryByRole('alertdialog')).toBeNull());
    expect(dom.screen.queryByText(dom.t('learn.solution.shown'))).toBeNull();
  });

  it('confirming shows the solution, and with solutions hidden in Preferences the button is replaced by a note', async () => {
    const { user, unmount } = show();
    await user.click(dom.screen.getByRole('button', { name: dom.t('learn.showTheReferenceSolution') }));
    const dialog = await dom.screen.findByRole('alertdialog');
    await user.click(dom.within(dialog).getByRole('button', { name: dom.t('learn.solution.action') }));
    await dom.waitFor(() => expect(dom.screen.getByRole('heading', { name: dom.t('learn.solution.shown') })).toBeTruthy());
    unmount();
    show({ hideSolutions: true });
    expect(dom.screen.queryByRole('button', { name: dom.t('learn.showTheReferenceSolution') })).toBeNull();
    expect(dom.screen.getByText(dom.t('learn.solutionsHidden'))).toBeTruthy();
  });

  it('without folder access the workspace button is disabled and a status says why; Open the tests shows the Tests tab', async () => {
    withoutFolderAccess();
    const { user } = show();
    const open = dom.screen.getByRole('button', { name: dom.t('learn.openWorkspace') }) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    const status = document.querySelector('[data-learn-workspace-status]')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe(dom.t('welcome.folderAccessUnavailable'));
    await user.click(dom.screen.getByRole('button', { name: dom.t('learn.openTests') }));
    expect(useIDEStore.getState().activeConsoleTab).toBe('tests');
  });
});
