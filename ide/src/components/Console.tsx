/**
 * Console Component
 * 
 * Bottom panel with Output, Problems, and Terminal tabs
 */

import {
  ChevronDown,
  ChevronUp,
  Terminal,
  AlertTriangle,
  FileWarning,
  Trash2,
  XCircle,
  AlertCircle,
  Info,
  CheckCircle,
} from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import type { ConsoleEntry, ConsoleTab } from '../types';

export function Console() {
  const {
    consoleEntries,
    activeConsoleTab,
    compilerMessages,
    isConsoleCollapsed,
    toggleConsole,
    setActiveConsoleTab,
    clearConsole,
    clearCompilerMessages,
  } = useIDEStore();

  const tabs: { id: ConsoleTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { 
      id: 'output', 
      label: 'Output', 
      icon: <Terminal size={14} /> 
    },
    {
      id: 'problems',
      label: 'Problems',
      icon: <AlertTriangle size={14} />,
      count: compilerMessages.filter((m) => m.type === 'error').length,
    },
    { 
      id: 'terminal', 
      label: 'Terminal', 
      icon: <FileWarning size={14} /> 
    },
  ];

  const getEntryIcon = (type: ConsoleEntry['type']) => {
    switch (type) {
      case 'error':
        return <XCircle size={14} className="text-[var(--color-accent-red)] flex-shrink-0" />;
      case 'warning':
        return <AlertCircle size={14} className="text-[var(--color-accent-yellow)] flex-shrink-0" />;
      case 'success':
        return <CheckCircle size={14} className="text-[var(--color-accent-green)] flex-shrink-0" />;
      case 'command':
        return <Terminal size={14} className="text-[var(--color-accent-purple)] flex-shrink-0" />;
      default:
        return <Info size={14} className="text-[var(--color-accent-blue)] flex-shrink-0" />;
    }
  };

  const getEntryColor = (type: ConsoleEntry['type']) => {
    switch (type) {
      case 'error':
        return 'text-[var(--color-accent-red)]';
      case 'warning':
        return 'text-[var(--color-accent-yellow)]';
      case 'success':
        return 'text-[var(--color-accent-green)]';
      case 'command':
        return 'text-[var(--color-accent-purple)]';
      default:
        return 'text-[var(--color-surface-200)]';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Collapsed state - just show header bar
  if (isConsoleCollapsed) {
    return (
      <div className="h-8 bg-[var(--color-surface-800)] border-t border-[var(--color-surface-600)] flex items-center px-2">
        <button
          onClick={toggleConsole}
          className="flex items-center gap-1 text-sm text-[var(--color-surface-300)] hover:text-[var(--color-surface-100)] transition-colors"
        >
          <ChevronUp size={16} />
          <span>Console</span>
        </button>
        
        {/* Quick status */}
        <div className="ml-4 flex items-center gap-3 text-xs">
          {compilerMessages.filter((m) => m.type === 'error').length > 0 && (
            <span className="flex items-center gap-1 text-[var(--color-accent-red)]">
              <XCircle size={12} />
              {compilerMessages.filter((m) => m.type === 'error').length} errors
            </span>
          )}
          {compilerMessages.filter((m) => m.type === 'warning').length > 0 && (
            <span className="flex items-center gap-1 text-[var(--color-accent-yellow)]">
              <AlertCircle size={12} />
              {compilerMessages.filter((m) => m.type === 'warning').length} warnings
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-52 flex flex-col bg-[var(--color-surface-800)] border-t border-[var(--color-surface-600)]">
      {/* Tab Bar */}
      <div className="h-8 flex items-center border-b border-[var(--color-surface-600)] px-2">
        {/* Collapse Button */}
        <button
          onClick={toggleConsole}
          className="p-1 mr-2 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)]"
          title="Collapse Console"
        >
          <ChevronDown size={16} />
        </button>

        {/* Tabs */}
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveConsoleTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm transition-colors ${
              activeConsoleTab === tab.id
                ? 'text-[var(--color-surface-100)] border-b-2 border-[var(--color-accent-blue)]'
                : 'text-[var(--color-surface-300)] hover:text-[var(--color-surface-100)]'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-accent-red)] text-white">
                {tab.count}
              </span>
            )}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clear Button */}
        <button
          onClick={() => {
            if (activeConsoleTab === 'output') clearConsole();
            if (activeConsoleTab === 'problems') clearCompilerMessages();
          }}
          className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-400)] hover:text-[var(--color-surface-200)]"
          title="Clear"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto font-mono text-sm">
        {activeConsoleTab === 'output' && (
          <div className="p-2 space-y-0.5">
            {consoleEntries.length === 0 ? (
              <div className="text-[var(--color-surface-400)] italic">
                No output yet
              </div>
            ) : (
              consoleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 py-0.5 hover:bg-[var(--color-surface-700)] px-1 rounded"
                >
                  {getEntryIcon(entry.type)}
                  <span className="text-[var(--color-surface-400)] text-xs min-w-[60px]">
                    [{formatTime(entry.timestamp)}]
                  </span>
                  {entry.source && (
                    <span className="text-[var(--color-surface-500)] text-xs">
                      [{entry.source}]
                    </span>
                  )}
                  <span className={getEntryColor(entry.type)}>
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {activeConsoleTab === 'problems' && (
          <div className="p-2 space-y-1">
            {compilerMessages.length === 0 ? (
              <div className="text-[var(--color-surface-400)] italic">
                No problems detected
              </div>
            ) : (
              compilerMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 py-1 px-2 hover:bg-[var(--color-surface-700)] rounded cursor-pointer"
                >
                  {msg.type === 'error' && (
                    <XCircle size={14} className="text-[var(--color-accent-red)] mt-0.5 flex-shrink-0" />
                  )}
                  {msg.type === 'warning' && (
                    <AlertCircle size={14} className="text-[var(--color-accent-yellow)] mt-0.5 flex-shrink-0" />
                  )}
                  {msg.type === 'info' && (
                    <Info size={14} className="text-[var(--color-accent-blue)] mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <span className="text-[var(--color-surface-100)]">{msg.message}</span>
                    {msg.file && (
                      <span className="ml-2 text-[var(--color-surface-400)] text-xs">
                        {msg.file}
                        {msg.line !== undefined && `:${msg.line}`}
                        {msg.column !== undefined && `:${msg.column}`}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeConsoleTab === 'terminal' && (
          <div className="p-2">
            <div className="text-[var(--color-surface-400)] italic">
              Terminal emulator coming soon...
            </div>
            <div className="mt-2 text-[var(--color-accent-green)]">
              $ <span className="animate-pulse">_</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
