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
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { Toolbar } from './components/Toolbar';
import { EditorArea } from './components/EditorArea';
import { Console } from './components/Console';
import { WelcomeScreen } from './components/WelcomeScreen';
import { CloseGuard } from './components/CloseGuard';
import { useTheme } from './hooks/useTheme';
import { initializeTheme, useIDEStore } from './store/useIDEStore';
import { useDebugController } from './hooks/useDebugController';
import { useWorkspaceLayout } from './utils/layoutStorage';

// Apply the stored theme while modules load, before React renders the first frame (UX-016).
initializeTheme();

function App() {
  useTheme();

  const isProjectOpen = useIDEStore((s) => s.isProjectOpen);
  const isConsoleCollapsed = useIDEStore((s) => s.isConsoleCollapsed);

  const debugController = useDebugController();
  const { defaultLayout, onLayoutChanged } = useWorkspaceLayout();

  // usePanelCallbackRef returns [handle | null, setterFn] — destructure accordingly
  const [consolePanel, setConsolePanel] = usePanelCallbackRef();

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
      {/* Unified Toolbar */}
      <Toolbar debugController={debugController} />

      {/* Main resizable workspace */}
      <div className="flex-1 min-h-0 flex ledger-workspace">
        <Group orientation="vertical" className="h-full min-w-0 flex-1" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>

          {/* Editor Area */}
          <Panel id="editor" defaultSize="72%" minSize="30%" className="overflow-hidden">
            <EditorArea />
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
            <Console debugController={debugController} />
          </Panel>

        </Group>
      </div>
    </div>
  );
}

export default App;
