/**
 * ZPLC IDE Main Application
 * 
 * Industrial-grade PLC development environment
 * 
 * Layout (when project is open):
 * ┌─────────────────────────────────────────────┐
 * │ Toolbar                                     │
 * ├─────────────────────────────────────────────┤
 * │ DebugToolbar (Play/Pause/Step/Status)       │
 * ├──────────┬──────────────────────────────────┤
 * │          │                                  │
 * │ Sidebar  │ EditorArea (Monaco/ReactFlow)    │
 * │          │                                  │
 * │          ├──────────────────────────────────┤
 * │          │ Console (collapsible)            │
 * └──────────┴──────────────────────────────────┘
 * 
 * When no project is open, shows WelcomeScreen.
 */

import { Toolbar } from './components/Toolbar';
import { DebugToolbar } from './components/DebugToolbar';
import { Sidebar } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { Console } from './components/Console';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useTheme } from './hooks/useTheme';
import { useIDEStore } from './store/useIDEStore';
import { useDebugController } from './hooks/useDebugController';

function App() {
  // Initialize theme system
  useTheme();

  // Check if a project is open
  const isProjectOpen = useIDEStore((s) => s.isProjectOpen);

  // Debug controller - manages adapter lifecycle, polling, and events
  const debug = useDebugController();

  // No project open - show welcome screen
  if (!isProjectOpen) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface-900)]">
        <WelcomeScreen />
      </div>
    );
  }

  // Project is open - show full IDE
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface-900)]">
      {/* Top Toolbar */}
      <Toolbar />

      {/* Debug Toolbar - execution controls and status */}
      <DebugToolbar
        adapter={debug.adapter}
        vmState={debug.vmState}
        onStartSimulation={debug.startSimulation}
        onConnectHardware={debug.connectHardware}
        onDisconnect={debug.disconnect}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - File Explorer */}
        <Sidebar />

        {/* Right Side - Editor + Console */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Area */}
          <EditorArea />

          {/* Bottom Console */}
          <Console />
        </div>
      </div>
    </div>
  );
}

export default App;
