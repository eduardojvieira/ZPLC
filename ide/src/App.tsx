/**
 * ZPLC IDE Main Application
 * 
 * Industrial-grade PLC development environment
 * 
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │ Toolbar                                     │
 * ├──────────┬──────────────────────────────────┤
 * │          │                                  │
 * │ Sidebar  │ EditorArea (Monaco/ReactFlow)    │
 * │          │                                  │
 * │          ├──────────────────────────────────┤
 * │          │ Console (collapsible)            │
 * └──────────┴──────────────────────────────────┘
 */

import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { Console } from './components/Console';
import { useTheme } from './hooks/useTheme';

function App() {
  // Initialize theme system
  useTheme();

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface-900)]">
      {/* Top Toolbar */}
      <Toolbar />

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
