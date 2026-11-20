import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom, stubMonaco, stubProjectLoader } from '../../test/dom';

// SHL-011, SHL-012, FND-001: Preferences is a document of its own, open with or without a project, with the one theme control.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../../store/useIDEStore');
const { useAppSettings } = await import('../../store/useAppSettings');
const { usePreferencesDocument } = await import('../../store/usePreferencesDocument');
const { usePreferencesCommands } = await import('../../commands/bind/preferences');
const { setPreferenceAnchor } = await import('../../commands/preferenceAnchor');
const { runCommand, resetCommandsForTest } = await import('../../commands/bus');
const { WelcomeScreen } = await import('../WelcomeScreen');
const { Toolbar } = await import('../Toolbar');
const { PreferencesDocument } = await import('./PreferencesDocument');
const { ProjectSettings } = await import('./ProjectSettings');
const { AssistantView } = await import('../AssistantView');
const { useShellCommands } = await import('../../commands/useCommandHost');

function Binder() {
  usePreferencesCommands();
  return null;
}
function ShellBinder() {
  useShellCommands();
  return null;
}

const closed = { open: false, active: false, requests: 0, anchor: null };
// another test file may have left the document open: this one sets what it asserts
beforeEach(() => usePreferencesDocument.setState(closed));
afterEach(() => {
  usePreferencesDocument.setState(closed);
  setPreferenceAnchor(null);
  resetCommandsForTest();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('Preferences (SHL-011, SHL-012) in a DOM', () => {
  it('SHL-011 Preferences opens with no project open', async () => {
    dom.patchStore(useIDEStore, { isProjectOpen: false, recentProjects: [], refreshRecentProjects: async () => undefined });
    const { user } = dom.render(
      <>
        <Binder />
        <WelcomeScreen />
      </>,
    );
    await user.click(dom.screen.getByRole('button', { name: dom.t('welcome.preferences.open') }));
    expect(await dom.screen.findByRole('heading', { level: 1, name: dom.t('preferences.title') })).toBeTruthy();
    expect(document.querySelector('[data-app-preferences]')).not.toBeNull();
    expect(dom.screen.queryByRole('heading', { level: 1, name: dom.t('welcome.title') })).toBeNull();
    // the command runs the same with no project, from its shortcut or the palette
    await user.click(dom.screen.getByRole('button', { name: dom.t('preferences.back') }));
    expect(usePreferencesDocument.getState().open).toBe(false);
    expect(dom.screen.getByRole('heading', { level: 1, name: dom.t('welcome.title') })).toBeTruthy();
    expect(runCommand('file.preferences', { respectEnabled: true })).not.toBe('unavailable');
    expect(usePreferencesDocument.getState().active).toBe(true);
  });

  it('SHL-011 Preferences holds none of the project fields and Project settings none of the preferences', () => {
    dom.patchStore(useIDEStore, {
      projectConfig: { name: 'plant', version: '1.0.0', tasks: [] } as never,
      saveProjectConfig: async () => undefined,
    });
    const preferences = dom.render(<PreferencesDocument />);
    for (const key of ['settings.metadata.name', 'settings.metadata.version', 'project.projectMetadata', 'project.saveConfig'] as const) {
      expect(preferences.queryAllByText(dom.t(key))).toHaveLength(0);
    }
    expect(preferences.container.querySelector('[data-app-preferences]')).not.toBeNull();
    preferences.unmount();
    const project = dom.render(<ProjectSettings />);
    expect(project.container.querySelector('[data-app-preferences]')).toBeNull();
    expect(project.container.querySelector('[data-theme-control]')).toBeNull();
    for (const key of ['preferences.heading', 'preferences.density', 'preferences.language', 'preferences.fontSize'] as const) {
      expect(project.queryAllByText(dom.t(key))).toHaveLength(0);
    }
    expect(project.getAllByText(dom.t('project.projectMetadata')).length).toBeGreaterThan(0);
  });

  it('SHL-012 the theme has one control in the whole application', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: false, recentProjects: [], refreshRecentProjects: async () => undefined });
    const welcome = dom.render(<WelcomeScreen />);
    expect(welcome.container.querySelectorAll('[data-theme-control]')).toHaveLength(0);
    welcome.unmount();
    const bar = dom.render(<Toolbar debugController={{} as never} />);
    expect(bar.container.querySelectorAll('[data-theme-control]')).toHaveLength(0);
    bar.unmount();
    // everything that shows together: the start page, the command bar and Preferences
    const together = dom.render(
      <>
        <Toolbar debugController={{} as never} />
        <WelcomeScreen />
        <PreferencesDocument />
      </>,
    );
    expect(together.container.querySelectorAll('[data-theme-control]')).toHaveLength(1);
  });

  it('SHL-012 theme, density and language commands change the same state as the control', async () => {
    const { user } = dom.render(
      <>
        <ShellBinder />
        <PreferencesDocument />
      </>,
    );
    const theme = () => (document.querySelector('[data-theme-control]') as HTMLSelectElement).value;
    // the four theme commands drive the one control
    for (const [id, value] of [
      ['view.themeDark', 'dark'],
      ['view.themeLight', 'light'],
      ['view.themeHighContrast', 'high-contrast'],
    ] as const) {
      dom.act(() => void runCommand(id));
      await dom.waitFor(() => expect(theme()).toBe(value));
      expect(useIDEStore.getState().theme).toBe(value);
    }
    // and the control drives the state the commands write
    await user.selectOptions(document.querySelector('[data-theme-control]') as HTMLSelectElement, 'dark');
    expect(useIDEStore.getState().theme).toBe('dark');
    // density and language have no command of their own: their control writes the one stored setting
    await user.selectOptions(document.querySelector('[data-setting="density"]') as HTMLSelectElement, 'compact');
    expect(useAppSettings.getState().settings.density).toBe('compact');
    await user.selectOptions(document.querySelector('[data-setting="language"]') as HTMLSelectElement, 'es');
    expect(useAppSettings.getState().settings.language).toBe('es');
    useAppSettings.getState().update({ density: 'comfortable', language: 'auto' });
  });

  it('SHL-011 a preference edited in the document keeps the stored keys and values', async () => {
    // `saveSettings` writes `JSON.stringify(settings)` under one key (its module is not touched); the store is built before the
    // document exists, so the document it holds is what is compared, field by field.
    useAppSettings.getState().update({ density: 'comfortable', editorFontSize: 14 });
    const { user } = dom.render(<PreferencesDocument />);
    const before = { ...useAppSettings.getState().settings };
    await user.click(document.querySelector('[data-setting="density"]') as HTMLSelectElement);
    // looking at the document writes nothing
    expect(useAppSettings.getState().settings).toEqual(before);
    await user.selectOptions(document.querySelector('[data-setting="editorFontSize"]') as HTMLSelectElement, '20');
    const after = { ...useAppSettings.getState().settings };
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect({ ...after, editorFontSize: before.editorFontSize }).toEqual(before);
    expect(after.editorFontSize).toBe(20);
    useAppSettings.getState().update({ editorFontSize: 14 });
  });

  it('FND-001 Preferences scrolls to the anchor a palette entry sets', async () => {
    dom.render(
      <>
        <Binder />
        <PreferencesDocument />
      </>,
    );
    // what choosing "Editor font size" in the palette does
    setPreferenceAnchor('editorFontSize');
    dom.act(() => void runCommand('file.preferences'));
    const field = document.querySelector('[data-setting="editorFontSize"]') as HTMLElement;
    await dom.waitFor(() => expect(isFocused(field)).toBe(true));
    // the anchor is read once: the next request without one does not go back to it
    dom.act(() => void runCommand('file.preferences'));
    await dom.waitFor(() => expect(isFocused(field)).toBe(false));
  });

  it('SHL-011 the assistant provider form is a section of Preferences', async () => {
    const saveConfig = mock<(config: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    const storeKey = mock<(key: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      aiProvider: {
        getStatus: async () => ({ configured: false, enabled: false, keyStored: false, vaultAvailable: true }),
        getConfig: async () => ({ enabled: true, endpoint: 'https://example.test/v1', model: 'm1' }),
        saveConfig,
        storeKey,
        clearKey: async () => ({ ok: true }),
      },
    };
    const logged: unknown[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void logged.push(args);
    const { user } = dom.render(<PreferencesDocument />);
    const section = document.querySelector('[data-assistant-settings]') as HTMLElement;
    expect(section).not.toBeNull();
    expect(dom.within(section).getByRole('heading', { name: dom.t('preferences.assistant.heading') })).toBeTruthy();
    const endpoint = dom.within(section).getByLabelText(dom.t('console.endpoint')) as HTMLInputElement;
    await dom.waitFor(() => expect(endpoint.value).toBe('https://example.test/v1'));
    // the key is write-only: it goes to the bridge once, the field is emptied and no text of the page shows it
    const secret = 'sk-test-secret-123';
    const field = dom.within(section).getByLabelText(dom.t('console.apiKey')) as HTMLInputElement;
    expect(field.type).toBe('password');
    await user.type(field, secret);
    await user.click(dom.within(section).getByRole('button', { name: dom.t('console.storeKey') }));
    await dom.waitFor(() => expect(storeKey).toHaveBeenCalledWith(secret));
    await dom.waitFor(() => expect(field.value).toBe(''));
    expect(document.body.innerHTML.includes(secret)).toBe(false);
    expect(JSON.stringify(logged).includes(secret)).toBe(false);
    console.log = log;
    await user.click(dom.within(section).getByRole('button', { name: dom.t('configEditor.save') }));
    expect(saveConfig).toHaveBeenCalledWith({ enabled: true, endpoint: 'https://example.test/v1', model: 'm1' });
  });

  it('SHL-011 the Assistant view holds no provider form and offers Preferences at the Assistant section', async () => {
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      aiProvider: {
        getStatus: async () => ({ configured: true, enabled: true, keyStored: true, vaultAvailable: true }),
        getConfig: async () => ({ enabled: true, endpoint: 'https://example.test/v1', model: 'm1' }),
      },
    };
    const { user } = dom.render(<AssistantView />);
    await dom.settle();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(dom.screen.queryByLabelText(dom.t('console.apiKey'))).toBeNull();
    expect(dom.screen.queryByText(dom.t('console.providerSettings'))).toBeNull();
    await user.click(dom.screen.getByRole('button', { name: dom.t('preferences.assistant.open') }));
    expect(usePreferencesDocument.getState()).toMatchObject({ open: true, active: true, anchor: 'assistant' });
  });
});
