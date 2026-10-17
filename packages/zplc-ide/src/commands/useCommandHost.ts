/**
 * What the window does for the command system (UX-014, UX-015), mounted once by the application shell: it listens for the
 * keyboard, binds the commands that belong to the shell itself (files, panels, themes, the palette), hears the commands
 * that the operating-system menu chose, and tells the main process the language and the theme for the menu and the
 * window colour (UX-016).
 */
import { useEffect } from 'react';
import { currentLocale, t } from '../i18n';
import { useIDEStore } from '../store/useIDEStore';
import { useAppSettings } from '../store/useAppSettings';
import { exportOpenProjectArchive } from '../utils/projectArchiveActions';
import type { ConsoleTab } from '../types';
import { bindCommands, publishCommandState, runCommand } from './bus';
import { COMMAND_LIST, commandById, isCommandId, type CommandId } from './registry';
import { createShortcutMatcher, parseShortcut } from './shortcuts';
import { openPalette, openShortcuts } from './surfaces';

/** Commands that also work while the focus is in a text field: the others leave a field its own keys. */
const WORKS_IN_TEXT_FIELDS: ReadonlySet<string> = new Set<CommandId>(['view.commandPalette', 'help.shortcuts']);

const isTextField = (target: EventTarget | null): boolean => {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
};

/** Keyboard shortcuts of the registry. */
export function useCommandShortcuts(): void {
  useEffect(() => {
    const matcher = createShortcutMatcher(COMMAND_LIST.flatMap((command) => (command.shortcut ? [{ id: command.id as CommandId, chords: parseShortcut(command.shortcut) }] : [])));
    const onKeyDown = (event: KeyboardEvent): void => {
      const inField = isTextField(event.target);
      const result = matcher.handle(event);
      if (result.id === null || (inField && !WORKS_IN_TEXT_FIELDS.has(result.id))) return;
      // A shortcut runs the handler whatever the state: the handler says in the console what is missing. A command nobody bound
      // (the toolbar is not mounted on the Welcome screen) leaves the key alone.
      if (runCommand(result.id) === 'ran') event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

const showPanel = (tab: ConsoleTab) => (): void => {
  const state = useIDEStore.getState();
  if (state.isConsoleCollapsed) state.toggleConsole();
  state.setActiveConsoleTab(tab);
};

/** The commands the shell owns; the toolbar binds the ones about building and running. */
export function useShellCommands(): void {
  const projectOpen = useIDEStore((s) => s.isProjectOpen);
  useEffect(() => { publishCommandState({ projectOpen }); }, [projectOpen]);
  useEffect(() => bindCommands({
    'file.open': () => { void useIDEStore.getState().openProjectFromFolder(); },
    'file.new': () => { void useIDEStore.getState().createNewProjectInFolder(); },
    'file.export': () => exportOpenProjectArchive(),
    'view.commandPalette': openPalette,
    'help.shortcuts': openShortcuts,
    'view.toggleConsole': () => useIDEStore.getState().toggleConsole(),
    'view.output': showPanel('output'),
    'view.problems': showPanel('problems'),
    'view.tests': showPanel('tests'),
    'view.trace': showPanel('trace'),
    'view.watch': showPanel('watch'),
    'view.themeLight': () => useIDEStore.getState().setTheme('light'),
    'view.themeDark': () => useIDEStore.getState().setTheme('dark'),
    'view.themeHighContrast': () => useIDEStore.getState().setTheme('high-contrast'),
    'view.themeSystem': () => useIDEStore.getState().setTheme('system'),
    'project.settings': () => useIDEStore.getState().toggleSettings(),
  }), []);
}

/** The menu of the operating system and the main process: commands in, language and theme out. */
export function useMainProcessBridge(): void {
  const language = useAppSettings((s) => s.settings.language);
  const theme = useIDEStore((s) => s.theme);
  useEffect(() => window.electronAPI?.menu?.onCommand((id) => {
    if (!isCommandId(id)) return;
    // The menu offers a command in every state; one the state does not offer is said in the console, not run.
    if (runCommand(id, { respectEnabled: true }) === 'unavailable') {
      useIDEStore.getState().addConsoleEntry({ type: 'info', message: t('commands.unavailable', { title: t(commandById(id).titleKey) }), source: 'system' });
    }
  }), []);
  useEffect(() => {
    void window.electronAPI?.windowPreferences?.report({ language: currentLocale(), theme }).catch(() => undefined);
  }, [language, theme]);
}
