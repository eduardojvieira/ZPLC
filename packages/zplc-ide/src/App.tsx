/**
 * ZPLC IDE Main Application
 *
 * Industrial-grade PLC development environment
 *
 * Layout (when project is open):
 * ┌─────────────────────────────────────────────┐
 * │ Toolbar + operational truth rail            │
 * ├─────────────────────────────────────────────┤
 * │ EditorArea                                  │
 * ├─────────────────────────────────────────────┤
 * │ Resizable lower tool ledger                 │
 * └─────────────────────────────────────────────┘
 *
 * When no project is open, shows WelcomeScreen.
 */

import { useEffect } from 'react';
import { Group, Panel, Separator, useGroupCallbackRef, usePanelCallbackRef } from 'react-resizable-panels';
import { Toolbar } from './components/Toolbar';
import { EditorArea } from './components/EditorArea';
import { Console } from './components/Console';
import { WelcomeScreen } from './components/WelcomeScreen';
import { CloseGuard } from './components/CloseGuard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevFaultProbe } from './components/DevFaultProbe';
import { RecoveryOffer } from './components/RecoveryOffer';
import { ExternalChangePrompt } from './components/ExternalChangePrompt';
import { useTheme } from './hooks/useTheme';
import { initializeTheme, useIDEStore } from './store/useIDEStore';
import { useDebugController } from './hooks/useDebugController';
import { useWorkspaceLayout } from './utils/layoutStorage';
import { workspaceLayoutFrom } from './utils/sessionState';
import { startSessionPersistence } from './store/sessionPersistence';
import { startRecoveryPersistence } from './store/recoveryPersistence';
import { startAutosave } from './store/autosave';
import { startExternalChangeWatch } from './store/externalChangeWatch';
import { initializeSettings, useAppSettings } from './store/useAppSettings';
import { describeUpdateCheck, runUpdateCheck } from './ipc/updateCheckBridge';
import { ZPLC_REPO_VERSION } from './version';

// Apply the stored theme while modules load, before React renders the first frame (UX-016).
initializeTheme();
// The density and the language of the saved preferences, before the first frame.
initializeSettings();

function App() {
  useTheme();

  const isProjectOpen = useIDEStore((s) => s.isProjectOpen);
  const isConsoleCollapsed = useIDEStore((s) => s.isConsoleCollapsed);
  const sessionLayout = useIDEStore((s) => s.sessionLayout);
  const setSessionLayout = useIDEStore((s) => s.setSessionLayout);
  const projectSession = useIDEStore((s) => s.projectSession);

  const debugController = useDebugController();
  const { defaultLayout, onLayoutChanged } = useWorkspaceLayout();

  // usePanelCallbackRef returns [handle | null, setterFn] — destructure accordingly
  const [consolePanel, setConsolePanel] = usePanelCallbackRef();
  const [groupPanel, setGroupPanel] = useGroupCallbackRef();

  // The open project's tabs, cursors and panel split are saved as they change (IDE-008).
  useEffect(() => startSessionPersistence(useIDEStore), []);

  // A change made outside Studio reloads an unmodified file and asks about a modified one (IDE-004).
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
  useEffect(() => {
    if (!checkForUpdates) return undefined;
    let current = true;
    void runUpdateCheck(window.electronAPI?.updateCheck, ZPLC_REPO_VERSION).then((result) => {
      if (current && result.status === 'available') useIDEStore.getState().addConsoleEntry({ type: 'info', message: describeUpdateCheck(result), source: 'system' });
    });
    return () => { current = false; };
  }, [checkForUpdates]);

  // Modified files are kept in the main process a moment after the last keystroke, so that a crash loses nothing (IDE-006).
  useEffect(() => startRecoveryPersistence(useIDEStore), []);

  // A project that opens while the workbench is already showing brings its own split; the first one is the group's default.
  useEffect(() => {
    const layout = useIDEStore.getState().sessionLayout;
    if (groupPanel && layout) groupPanel.setLayout(layout);
  }, [groupPanel, projectSession]);

  // Sync console panel collapse state → panel imperative API
  useEffect(() => {
    if (!consolePanel) return;
    if (isConsoleCollapsed) {
      consolePanel.collapse();
    } else {
      consolePanel.expand();
    }
  }, [isConsoleCollapsed, consolePanel]);

  if (!isProjectOpen) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface-900)]">
        <WelcomeScreen />
        <CloseGuard />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface-900)]">
      <CloseGuard />
      <RecoveryOffer />
      <ExternalChangePrompt />
      {/* Unified Toolbar */}
      <ErrorBoundary region="Toolbar">
        <DevFaultProbe region="Toolbar" />
        <Toolbar debugController={debugController} />
      </ErrorBoundary>

      {/* Main resizable workspace */}
      <div className="flex-1 min-h-0 flex ledger-workspace">
        <Group
          orientation="vertical"
          className="h-full min-w-0 flex-1"
          defaultLayout={sessionLayout ?? defaultLayout}
          groupRef={setGroupPanel}
          onLayoutChanged={(layout, meta) => {
            onLayoutChanged(layout, meta);
            if (meta.isUserInteraction) {
              const split = workspaceLayoutFrom(layout);
              if (split) setSessionLayout(split);
            }
          }}
        >

          {/* Editor Area */}
          <Panel id="editor" defaultSize="72%" minSize="30%" className="overflow-hidden">
            <ErrorBoundary region="Editor">
              <EditorArea />
            </ErrorBoundary>
          </Panel>

          <Separator id="workspace-separator" aria-label="Resize editor and lower panel" />

          {/* Lower workbench panel */}
          <Panel
            id="console"
            panelRef={setConsolePanel}
            defaultSize="28%"
            minSize="5%"
            maxSize="65%"
            collapsible
            collapsedSize={32}
            className="overflow-hidden"
          >
            <ErrorBoundary region="Panel">
              <Console debugController={debugController} />
            </ErrorBoundary>
          </Panel>

        </Group>
      </div>
    </div>
  );
}

export default App;
