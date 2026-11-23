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
import { exportOpenProjectArchive, exportProjectAsJson } from '../utils/projectArchiveActions';
import { openLearnHome } from '../learn/learnUi';
import { openConfigEditorFromNavigator } from '../navigator/openConfigEditor';
import { useNewProjectDialog } from '../store/newProjectDialog';
import { useShellLayout } from '../store/useShellLayout';
import { usePlantDocument } from '../store/usePlantDocument';
import { bindCommands, publishCommandState, runCommand } from './bus';
import { COMMAND_LIST, commandById, isCommandId, type CommandId } from './registry';
import { createShortcutMatcher, parseShortcut } from './shortcuts';
import { openPalette, openShortcuts } from './surfaces';
import { useU2Commands } from './bind';
import { focusSoon, showActivity, showPanel } from './bind/layout';

/** Commands that also work while the focus is in a text field: the others leave a field its own keys. */
const WORKS_IN_TEXT_FIELDS: ReadonlySet<string> = new Set<CommandId>(['view.commandPalette', 'help.shortcuts']);

const isTextField = (target: EventTarget | null): boolean => {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
};

/** Keyboard shortcuts of the registry. */
export function useCommandShortcuts(): void {
  useEffect(() => {
    const matcher = createShortcutMatcher(
      COMMAND_LIST.flatMap((command) =>
        command.shortcut ? [{ id: command.id as CommandId, chords: parseShortcut(command.shortcut) }] : [],
      ),
    );
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

const showPlant = (): void => {
  usePlantDocument.getState().show();
  focusSoon('#editor-tab-plant');
};

/** The commands the shell owns; the toolbar binds the ones about building and running. */
export function useShellCommands(): void {
  const projectOpen = useIDEStore((s) => s.isProjectOpen);
  useU2Commands();
  useEffect(() => {
    publishCommandState({ projectOpen });
  }, [projectOpen]);
  useEffect(
    () =>
      bindCommands({
        'file.open': () => {
          void useIDEStore.getState().openProjectFromFolder();
        },
        'file.new': () => {
          useNewProjectDialog.getState().show();
        },
        'file.export': () => exportOpenProjectArchive(),
        'file.exportProjectJson': () => exportProjectAsJson(),
        'view.commandPalette': openPalette,
        'help.shortcuts': openShortcuts,
        'help.learn': openLearnHome,
        'view.toggleConsole': () => useIDEStore.getState().toggleConsole(),
        'view.togglePrimarySidebar': () => useShellLayout.getState().togglePrimary(),
        'view.toggleSecondarySidebar': () => useShellLayout.getState().toggleSecondary(),
        'view.showProject': () => showActivity('project'),
        'view.showSearch': () => showActivity('search'),
        'view.showLearn': () => showActivity('learn'),
        'view.plant': showPlant,
        'view.output': showPanel('output'),
        'view.problems': showPanel('problems'),
        'view.trace': showPanel('trace'),
        'view.watch': showPanel('watch'),
        'view.terminal': showPanel('terminal'),
        'project.tasks': () => openConfigEditorFromNavigator('tasks'),
        'project.io': () => openConfigEditorFromNavigator('io'),
        'project.network': () => openConfigEditorFromNavigator('network'),
        'project.communication': () => openConfigEditorFromNavigator('communication'),
        'project.target': () => openConfigEditorFromNavigator('target'),
        'view.themeLight': () => useIDEStore.getState().setTheme('light'),
        'view.themeDark': () => useIDEStore.getState().setTheme('dark'),
        'view.themeHighContrast': () => useIDEStore.getState().setTheme('high-contrast'),
        'view.themeSystem': () => useIDEStore.getState().setTheme('system'),
        'project.settings': () => useIDEStore.getState().toggleSettings(),
      }),
    [],
  );
}

/** The menu of the operating system and the main process: commands in, language and theme out. */
export function useMainProcessBridge(): void {
  const language = useAppSettings((s) => s.settings.language);
  const theme = useIDEStore((s) => s.theme);
  useEffect(
    () =>
      window.electronAPI?.menu?.onCommand((id) => {
        if (!isCommandId(id)) return;
        // The menu offers a command in every state; one the state does not offer is said in the console, not run.
        if (runCommand(id, { respectEnabled: true }) === 'unavailable') {
          useIDEStore.getState().addConsoleEntry({
            type: 'warning',
            message: t('commands.unavailable', { title: t(commandById(id).titleKey) }),
            source: 'system',
          });
        }
      }),
    [],
  );
  useEffect(() => {
    void window.electronAPI?.windowPreferences?.report({ language: currentLocale(), theme }).catch(() => undefined);
  }, [language, theme]);
}
