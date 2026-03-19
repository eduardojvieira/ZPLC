/**
 * ZPLC IDE Main Application
 *
 * Industrial-grade PLC development environment
 *
 * Layout (when project is open):
 * ┌─────────────────────────────────────────────┐
 * │ Toolbar (unified controls)                  │
 * ├──────────╥──────────────────────────────────┤
 * │          ║                                  │
 * │ Sidebar  ║ EditorArea (Monaco/ReactFlow)    │
 * │          ║                                  │
 * │          ╠══════════════════════════════════╡
 * │          ║ Console (resizable / collapsible)│
 * └══════════╩══════════════════════════════════┘
 *
 * ║ = horizontal drag handle  ═ = vertical drag handle
 *
 * When no project is open, shows WelcomeScreen.
 */

import { useEffect } from 'react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { Console } from './components/Console';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useTheme } from './hooks/useTheme';
import { useIDEStore } from './store/useIDEStore';
import { useDebugController } from './hooks/useDebugController';

function App() {
  useTheme();

  const isProjectOpen = useIDEStore((s) => s.isProjectOpen);
  const isSidebarCollapsed = useIDEStore((s) => s.isSidebarCollapsed);
  const isConsoleCollapsed = useIDEStore((s) => s.isConsoleCollapsed);

  const debugController = useDebugController();

  // usePanelCallbackRef returns [handle | null, setterFn] — destructure accordingly
  const [sidebarPanel, setSidebarPanel] = usePanelCallbackRef();
  const [consolePanel, setConsolePanel] = usePanelCallbackRef();

  // Sync sidebar panel collapse state → panel imperative API
  useEffect(() => {
    if (!sidebarPanel) return;
    if (isSidebarCollapsed) {
      sidebarPanel.collapse();
    } else {
      sidebarPanel.expand();
    }
  }, [isSidebarCollapsed, sidebarPanel]);

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
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface-900)]">
      {/* Unified Toolbar */}
      <Toolbar debugController={debugController} />

      {/* Main resizable workspace */}
      <div className="flex-1 min-h-0">
        <Group orientation="horizontal" className="h-full">

          {/* ── Sidebar panel ── */}
          <Panel
            id="sidebar"
            panelRef={setSidebarPanel}
            defaultSize="16%"
            minSize="8%"
            maxSize="35%"
            collapsible
            collapsedSize={48}
            className="overflow-hidden"
          >
            <Sidebar />
          </Panel>

          <Separator />

          {/* ── Editor + Console stacked vertically ── */}
          <Panel id="main" className="overflow-hidden min-h-0">
            <Group orientation="vertical" className="h-full">

              {/* Editor Area */}
              <Panel id="editor" defaultSize="72%" minSize="30%" className="overflow-hidden">
                <EditorArea />
              </Panel>

              <Separator />

              {/* Console panel */}
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
          </Panel>

        </Group>
      </div>
    </div>
  );
}

export default App;
