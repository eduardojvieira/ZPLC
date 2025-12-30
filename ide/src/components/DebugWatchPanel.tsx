/**
 * @file DebugWatchPanel.tsx
 * @brief Debug Watch Panel using IDE Store hooks
 *
 * A simpler watch panel that integrates with the useIDEStore
 * debug state and useDebugValues hooks. This provides a clean
 * interface for the IDE's debug panel.
 */

import React, { useState, useCallback } from 'react';
import { Plus, X, Trash2, Eye, EyeOff } from 'lucide-react';
import { useWatchVariables, formatDebugValue } from '../hooks/useDebugValue';
import { useIDEStore } from '../store/useIDEStore';

/**
 * Format address for display
 */
function formatAddress(address: number | null): string {
  if (address === null) return '---';
  return `0x${address.toString(16).padStart(4, '0').toUpperCase()}`;
}

/**
 * Debug Watch Panel Component
 */
export function DebugWatchPanel(): React.ReactElement {
  const [newVarInput, setNewVarInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Get debug state from store
  const debugMode = useIDEStore((state) => state.debug.mode);
  const isPolling = useIDEStore((state) => state.debug.isPolling);

  // Use the watch variables hook
  const { variables, addWatch, removeWatch, clearAll } = useWatchVariables();

  // Handle adding a new watch variable
  const handleAddVariable = useCallback(() => {
    const varPath = newVarInput.trim();
    if (!varPath) return;

    addWatch(varPath);
    setNewVarInput('');
    setShowAddForm(false);
  }, [newVarInput, addWatch]);

  // Handle key press in input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddVariable();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowAddForm(false);
      setNewVarInput('');
    }
  }, [handleAddVariable]);

  // Status indicator color
  const statusColor = debugMode === 'none'
    ? 'bg-gray-500'
    : isPolling
      ? 'bg-green-500 animate-pulse'
      : 'bg-yellow-500';

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-800)] text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)]">
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-[var(--color-surface-300)]" />
          <span className="font-medium text-[var(--color-surface-100)]">Watch</span>
          <span className={`w-2 h-2 rounded-full ${statusColor}`} title={debugMode} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="p-1 rounded hover:bg-[var(--color-surface-600)] text-[var(--color-surface-300)]
                       hover:text-[var(--color-surface-100)] transition-colors"
            title="Add variable"
          >
            <Plus size={14} />
          </button>
          {variables.length > 0 && (
            <button
              onClick={clearAll}
              className="p-1 rounded hover:bg-[var(--color-surface-600)] text-[var(--color-surface-300)]
                         hover:text-red-400 transition-colors"
              title="Clear all"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)]">
          <input
            type="text"
            value={newVarInput}
            onChange={(e) => setNewVarInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Variable path (e.g., Counter, Timer1.ET)"
            className="flex-1 bg-[var(--color-surface-800)] border border-[var(--color-surface-500)] 
                       rounded px-2 py-1 text-xs text-[var(--color-surface-100)] 
                       placeholder:text-[var(--color-surface-400)]
                       focus:outline-none focus:border-blue-500"
            autoFocus
          />
          <button
            onClick={handleAddVariable}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => { setShowAddForm(false); setNewVarInput(''); }}
            className="p-1 rounded hover:bg-[var(--color-surface-600)] text-[var(--color-surface-400)]"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Variable List */}
      <div className="flex-1 overflow-y-auto">
        {variables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-surface-400)] p-4">
            <EyeOff size={24} className="mb-2 opacity-50" />
            <p className="text-xs text-center">
              No variables being watched.
              <br />
              Click + to add variables.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-[var(--color-surface-700)]">
              <tr className="text-left text-[10px] text-[var(--color-surface-400)] uppercase tracking-wide">
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="px-3 py-1.5 font-medium">Value</th>
                <th className="px-3 py-1.5 font-medium w-20">Type</th>
                <th className="px-3 py-1.5 font-medium w-16">Addr</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {variables.map(({ path, result }) => (
                <tr
                  key={path}
                  className="border-t border-[var(--color-surface-700)] hover:bg-[var(--color-surface-700)]/50"
                >
                  <td className="px-3 py-1.5 font-mono text-[var(--color-surface-200)]">
                    {path}
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {result.loading ? (
                      <span className="text-[var(--color-surface-400)] animate-pulse">...</span>
                    ) : result.error ? (
                      <span className="text-red-400 text-xs" title={result.error}>
                        {result.exists ? '???' : 'N/A'}
                      </span>
                    ) : (
                      <span className={
                        result.type === 'BOOL'
                          ? result.value ? 'text-green-400' : 'text-red-400'
                          : 'text-blue-400'
                      }>
                        {formatDebugValue(result.value, result.type)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[var(--color-surface-400)] text-xs">
                    {result.type || '?'}
                  </td>
                  <td className="px-3 py-1.5 text-[var(--color-surface-500)] text-xs font-mono">
                    {formatAddress(result.address)}
                  </td>
                  <td className="px-1">
                    <button
                      onClick={() => removeWatch(path)}
                      className="p-1 rounded hover:bg-[var(--color-surface-600)] 
                                 text-[var(--color-surface-500)] hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with hint */}
      {debugMode === 'none' && variables.length > 0 && (
        <div className="px-3 py-2 bg-[var(--color-surface-700)] border-t border-[var(--color-surface-600)]
                        text-[10px] text-[var(--color-surface-400)]">
          Start debugging to see live values
        </div>
      )}
    </div>
  );
}

export default DebugWatchPanel;
