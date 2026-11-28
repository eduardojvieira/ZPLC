import { describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { useNewProjectDialog } = await import('../store/newProjectDialog');
const { useLearnUi } = await import('../learn/learnUi');
const { EXAMPLE_CATALOG, EXAMPLE_GROUPS } = await import('../utils/exampleCatalog');
const { useAppSettings } = await import('../store/useAppSettings');
const { WelcomeScreen } = await import('./WelcomeScreen');

const exampleId = Object.entries(EXAMPLE_CATALOG).find(([, entry]) => entry.showOnWelcome)![0];
const exampleTitle = EXAMPLE_CATALOG[exampleId]!.title;

function prepare(over: Partial<ReturnType<typeof useIDEStore.getState>> = {}) {
  (window as unknown as { showDirectoryPicker: () => void }).showDirectoryPicker = () => undefined;
  const openProjectFromFolder = mock(async () => true);
  const copyExampleProjectToFolder = mock<(id: string) => Promise<boolean>>(async () => true);
  const openRecentProject = mock<(id: string) => Promise<boolean>>(async () => true);
  dom.patchStore(useIDEStore, {
    openProjectFromFolder,
    copyExampleProjectToFolder,
    openRecentProject,
    getExampleProjects: () => [{ id: exampleId, name: exampleTitle, description: '' }] as never,
    refreshRecentProjects: async () => undefined,
    recentProjects: [],
    projectOpenError: null,
    ...over,
  });
  return { openProjectFromFolder, copyExampleProjectToFolder, openRecentProject };
}

describe('Welcome screen (UX-022, IDE-008) in a DOM', () => {
  it('is the main landmark, with the title as the first heading and the start actions as named buttons', () => {
    prepare();
    dom.render(<WelcomeScreen />);
    expect(dom.screen.getByRole('main')).toBeTruthy();
    expect(dom.screen.getByRole('heading', { level: 1 }).textContent).toBe(dom.t('welcome.title'));
    for (const key of ['welcome.open.title', 'welcome.new.title', 'welcome.learn.title'] as const) {
      expect(dom.screen.getByRole('button', { name: new RegExp(dom.t(key)) })).toBeTruthy();
    }
  });

  it('Open runs the open action by click and by keyboard', async () => {
    const { openProjectFromFolder } = prepare();
    const { user } = dom.render(<WelcomeScreen />);
    const open = dom.screen.getByRole('button', { name: new RegExp(dom.t('welcome.open.title')) });
    await user.click(open);
    expect(openProjectFromFolder).toHaveBeenCalledTimes(1);
    open.focus();
    await user.keyboard('{Enter}');
    expect(openProjectFromFolder).toHaveBeenCalledTimes(2);
  });

  it('New opens the new project dialog and Learn opens the Learn home', async () => {
    prepare();
    const { user } = dom.render(<WelcomeScreen />);
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('welcome.new.title')) }));
    expect(useNewProjectDialog.getState().open).toBe(true);
    useNewProjectDialog.getState().hide();
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('welcome.learn.title')) }));
    expect(useLearnUi.getState().homeOpen).toBe(true);
    useLearnUi.getState().hideHome();
  });

  it('lists a bundled example under its topic and copies it when chosen', async () => {
    const { copyExampleProjectToFolder } = prepare();
    const { user } = dom.render(<WelcomeScreen />);
    expect(dom.screen.getByRole('heading', { level: 2, name: dom.t('welcome.examples.heading') })).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: new RegExp(exampleTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
    expect(copyExampleProjectToFolder).toHaveBeenCalledWith(exampleId);
  });

  it('shows the recent projects, reopens one, and says why an unavailable one cannot be opened', async () => {
    const { openRecentProject } = prepare({
      recentProjects: [
        { recentId: 'r1', displayName: 'Boiler', lastOpenedAt: Date.now(), available: true },
        { recentId: 'r2', displayName: 'Gone', lastOpenedAt: Date.now(), available: false },
      ],
    });
    const { user } = dom.render(<WelcomeScreen />);
    await dom.settle();
    expect(dom.screen.getByRole('heading', { level: 2, name: dom.t('welcome.recent.heading') })).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: /Boiler/ }));
    expect(openRecentProject).toHaveBeenCalledWith('r1');
    const gone = dom.screen.getByRole('button', { name: /^Gone/ }) as HTMLButtonElement;
    expect(gone.disabled).toBe(true);
    expect(gone.textContent).toContain(dom.t('welcome.recent.unavailable'));
    expect(dom.screen.getByRole('button', { name: dom.t('welcome.recent.forgetLabel', { name: 'Gone' }) })).toBeTruthy();
  });

  it('announces a failure to open a project in an alert', () => {
    prepare({ projectOpenError: 'Folder is not a ZPLC project' });
    dom.render(<WelcomeScreen />);
    expect(dom.screen.getByRole('alert').textContent).toContain('Folder is not a ZPLC project');
  });

  it('reaches the start actions in reading order with Tab', async () => {
    prepare();
    const { user } = dom.render(<WelcomeScreen />);
    const seen: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      seen.push(document.activeElement?.textContent?.slice(0, 20) ?? '');
    }
    expect(seen.some((text) => text.startsWith(dom.t('welcome.open.title')))).toBe(true);
    expect(isFocused(document.body)).toBe(false);
  });

  it('has a working language choice in its preferences', async () => {
    prepare();
    dom.render(<WelcomeScreen />, { locale: 'es' });
    expect(dom.screen.getByRole('heading', { level: 1 }).textContent).toBe(dom.tFor('es')('welcome.title'));
  });
  it('shows every example title and summary and every group heading and intro in Spanish (UXV-004)', () => {
    const es = dom.tFor('es');
    const en = dom.t;
    const shown = Object.entries(EXAMPLE_CATALOG).filter(([, entry]) => entry.showOnWelcome);
    prepare({ getExampleProjects: () => shown.map(([id]) => ({ id, name: id, description: '' })) as never });
    // Rendered in English first: the language changes while the Welcome screen is open, as when the setting is read.
    dom.render(<WelcomeScreen />);
    dom.act(() => useAppSettings.getState().update({ language: 'es' }));
    const text = document.body.textContent ?? '';
    for (const [id] of shown) {
      for (const field of ['title', 'summary'] as const) {
        const key = `examples.${id}.${field}` as Parameters<typeof es>[0];
        expect(es(key).length).toBeGreaterThan(0);
        expect(text).toContain(es(key));
        if (es(key) !== en(key)) expect(text).not.toContain(en(key));
      }
    }
    for (const group of EXAMPLE_GROUPS.filter((g) => shown.some(([, entry]) => entry.group === g.id))) {
      expect(dom.screen.getByText(es(group.titleKey))).toBeTruthy();
      if (group.blurbKey) {
        expect(text).toContain(es(group.blurbKey));
        expect(text).not.toContain(en(group.blurbKey));
      }
    }
  });
});
