/**
 * ZPLC main application
 *
 * Industrial-grade PLC development environment
 *
 * Layout (when a project is open), see shell/WorkbenchShell.tsx (UX-011):
 * ┌──────────────────────────────────────────────────────┐
 * │ Command bar + operational status                     │
 * ├────┬─────────┬─────────────────────────┬─────────────┤
 * │ A  │ Primary │ Editor area             │ Secondary   │
 * │ c  │ sidebar ├─────────────────────────┤ sidebar     │
 * │ t  │         │ Results panel           │             │
 * └────┴─────────┴─────────────────────────┴─────────────┘
 *
 * When no project is open, shows WelcomeScreen.
 */

import { useEffect, useState, type ComponentType } from 'react';
import { LearnHome } from './components/LearnHome';
import { WelcomeScreen } from './components/WelcomeScreen';
import { NewProjectDialog } from './components/NewProjectDialog';
import { useLearnUi } from './learn/learnUi';
import { CloseGuard } from './components/CloseGuard';
import { SerialPortChooser } from './components/SerialPortChooser';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevFaultProbe } from './components/DevFaultProbe';
import { ActionConfirmHost } from './components/ActionConfirmHost';
import { RecoveryOffer } from './components/RecoveryOffer';
import { ExternalChangePrompt } from './components/ExternalChangePrompt';
import { useTheme } from './hooks/useTheme';
import { initializeTheme, useIDEStore } from './store/useIDEStore';
import { useDebugController, type DebugController } from './hooks/useDebugController';
import { WorkbenchShell } from './shell/WorkbenchShell';
import { startSessionPersistence } from './store/sessionPersistence';
import { startRecoveryPersistence } from './store/recoveryPersistence';
import { startAutosave } from './store/autosave';
import { trackProjectSources } from './store/projectSources';
import { startExternalChangeWatch } from './store/externalChangeWatch';
import { initializeSettings, useAppSettings } from './store/useAppSettings';
import { startUpdateCheck } from './ipc/updateCheckBridge';
import { UpdateNoticeBanner } from './components/UpdateNotice';
import { useUpdateNotice } from './store/updateNotice';
import { ZPLC_REPO_VERSION } from './version';
import { Button, ErrorState, LoadingState } from './ui';
import { CommandPalette } from './commands/CommandPalette';
import { ShortcutReference } from './commands/ShortcutReference';
import { useCommandShortcuts, useMainProcessBridge, useShellCommands } from './commands/useCommandHost';
import { useT } from './i18n';
import { windowTitle } from './productName';
import { useStatusAnnouncements } from './hooks/useStatusAnnouncements';

interface WorkbenchParts {
  Toolbar: ComponentType<{ debugController: DebugController }>;
  EditorArea: ComponentType;
  Console: ComponentType<{ debugController: DebugController }>;
}

let workbenchParts: Promise<WorkbenchParts> | null = null;

/**
 * The toolbar, the editor area and the lower panel are code of their own (IDE-015): they load once, when the first project
 * opens, so the Welcome screen is the window, the store and the debug controller, with no Monaco, no visual editors and no
 * settings. The three come together so that the resizable group mounts with all of its panels, as it always did.
 */
function loadWorkbench(): Promise<WorkbenchParts> {
  workbenchParts ??= Promise.all([import('./components/Toolbar'), import('./components/EditorArea'), import('./components/Console')])
    .then(([toolbar, editor, panels]) => ({ Toolbar: toolbar.Toolbar, EditorArea: editor.EditorArea, Console: panels.Console }))
    .catch((error: unknown) => { workbenchParts = null; throw error; });
  return workbenchParts;
}

// Apply the stored theme while modules load, before React renders the first frame (UX-016).
initializeTheme();
// The density and the language of the saved preferences, before the first frame.
initializeSettings();

function App() {
  const { t } = useT();
  useTheme();
  // The keyboard, the shell's own commands and the application menu all run the same registered commands (UX-014, UX-015).
  useCommandShortcuts();
  useShellCommands();
  useMainProcessBridge();

  const isProjectOpen = useIDEStore((s) => s.isProjectOpen);
  const projectName = useIDEStore((s) => s.projectName);
  const learnHomeOpen = useLearnUi((s) => s.homeOpen);

  const debugController = useDebugController();
  const [workbench, setWorkbench] = useState<WorkbenchParts | null>(null);
  const [workbenchFailure, setWorkbenchFailure] = useState<{ message: string; attempt: number } | null>(null);
  const [workbenchAttempt, setWorkbenchAttempt] = useState(0);

  // The open project's tabs, cursors and panel split are saved as they change (IDE-008).
  useStatusAnnouncements();
  useEffect(() => startSessionPersistence(useIDEStore), []);

  // The declarations of the project's files and library folders, for the tree and the editors (IDE-023).
  useEffect(() => trackProjectSources(useIDEStore), []);

  // The window takes the page title: the open project's name before the product's (UX-016).
  useEffect(() => { document.title = windowTitle(projectName); }, [projectName]);

  // A change made outside ZPLC reloads an unmodified file and asks about a modified one (IDE-004).
  useEffect(() => startExternalChangeWatch(), []);

  // Autosave (IDE-007): off unless the user chose an interval; it saves modified files after the typing stops.
  useEffect(() => {
    const autosave = startAutosave(useIDEStore, {
      seconds: () => useAppSettings.getState().settings.autosaveSeconds,
      save: () => useIDEStore.getState().saveAllFiles({ quiet: true }),
    });
    const unsubscribe = useAppSettings.subscribe((state, previous) => {
      if (state.settings.autosaveSeconds !== previous.settings.autosaveSeconds) autosave.settingsChanged();
    });
    return () => { unsubscribe(); autosave.stop(); };
  }, []);

  // The update check (IDE-010) runs only while the user has it turned on: at start, and when it is turned on.
  const checkForUpdates = useAppSettings((s) => s.settings.checkForUpdates);
  useEffect(() => startUpdateCheck(checkForUpdates, window.electronAPI?.updateCheck, ZPLC_REPO_VERSION, (result) => {
    // A newer release shows the dismissible notice; an answer that says nothing, or that could not be had, shows nothing (REL-021).
    useUpdateNotice.getState().report(result);
  }), [checkForUpdates]);

  // Modified files are kept in the main process a moment after the last keystroke, so that a crash loses nothing (IDE-006).
  useEffect(() => startRecoveryPersistence(useIDEStore), []);

  // The workbench code is fetched when a project opens; a failure to fetch it is shown with a way to try again.
  useEffect(() => {
    if (!isProjectOpen || workbench) return undefined;
    let current = true;
    loadWorkbench().then(
      (parts) => { if (current) setWorkbench(parts); },
      (error: unknown) => { if (current) setWorkbenchFailure({ message: error instanceof Error ? error.message : String(error), attempt: workbenchAttempt }); },
    );
    return () => { current = false; };
  }, [isProjectOpen, workbench, workbenchAttempt]);

  if (!isProjectOpen) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface-900)]">
        <UpdateNoticeBanner />
        {learnHomeOpen ? <main aria-label={t('learn.home.title')} className="flex min-h-0 flex-1 flex-col"><LearnHome /></main> : <WelcomeScreen />}
        <CloseGuard />
        <SerialPortChooser />
        <CommandPalette />
        <NewProjectDialog />
        <ShortcutReference />
      </div>
    );
  }

  if (!workbench) {
    const failed = workbenchFailure !== null && workbenchFailure.attempt === workbenchAttempt;
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface-900)]">
        <CloseGuard />
        <SerialPortChooser />
        <CommandPalette />
        <NewProjectDialog />
        <ShortcutReference />
        <div className="flex flex-1 items-center justify-center">
          {failed
            ? <ErrorState title={t('app.workbenchFailedTitle')} message={t('app.workbenchFailed', { message: workbenchFailure.message })} action={<Button onClick={() => setWorkbenchAttempt((attempt) => attempt + 1)}>{t('common.retry')}</Button>} />
            : <LoadingState label={t('app.workbenchLoading')} />}
        </div>
      </div>
    );
  }
  const { Toolbar, EditorArea, Console } = workbench;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface-900)]">
      <CloseGuard />
      <SerialPortChooser />
        <CommandPalette />
        <NewProjectDialog />
        <ShortcutReference />
      <RecoveryOffer />
      <ExternalChangePrompt />
      <ActionConfirmHost />
      <UpdateNoticeBanner />
      {/* Unified Toolbar */}
      <ErrorBoundary region="Toolbar">
        <DevFaultProbe region="Toolbar" />
        <Toolbar debugController={debugController} />
      </ErrorBoundary>

      <WorkbenchShell EditorArea={EditorArea} Console={Console} debugController={debugController} />
    </div>
  );
}

export default App;
