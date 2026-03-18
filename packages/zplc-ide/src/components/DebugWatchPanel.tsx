/**
 * @file DebugWatchPanel.tsx
 * @brief Debug Watch Panel using IDE Store hooks
 *
 * A simpler watch panel that integrates with the useIDEStore
 * debug state and useDebugValues hooks. This provides a clean
 * interface for the IDE's debug panel.
 */

import { useState, useCallback, useRef } from 'react';
import { Plus, X, Trash2, Eye, EyeOff } from 'lucide-react';
import { formatDebugValue } from '../hooks/useDebugValue';
import { useIDEStore } from '../store/useIDEStore';
import { buildDebugWatchRows } from './debugWatchRows';
import type { WatchVariable } from '../runtime/debugAdapter';

/**
 * Format address for display
 */
function formatAddress(address: number | null): string {
  if (address === null) return '---';
  return `0x${address.toString(16).padStart(4, '0').toUpperCase()}`;
}

type ForceValueFn = (
  address: number,
  value: number | boolean | string,
  type: WatchVariable['type'],
  maxLength?: number,
) => Promise<void>;

interface DebugWatchPanelProps {
  forceValue?: ForceValueFn;
}

/** Inline editor state — only one cell editable at a time */
interface EditingCell {
  path: string;
  address: number;
  type: WatchVariable['type'];
  maxLength?: number;
  draft: string;
}

/**
 * Debug Watch Panel Component
 */
export function DebugWatchPanel({ forceValue }: DebugWatchPanelProps): React.ReactElement {
  const [newVarInput, setNewVarInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get debug state from store
  const debugMode = useIDEStore((state) => state.debug.mode);
  const isPolling = useIDEStore((state) => state.debug.isPolling);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const liveValues = useIDEStore((state) => state.debug.liveValues);
  const watchVariables = useIDEStore((state) => state.debug.watchVariables);
  const addWatch = useIDEStore((state) => state.addWatchVariable);
  const removeWatch = useIDEStore((state) => state.removeWatchVariable);
  const clearAll = useIDEStore((state) => state.clearWatchVariables);
  const variables = buildDebugWatchRows(watchVariables, debugMap, liveValues, isPolling);

  // Handle adding a new watch variable
  const handleAddVariable = useCallback(() => {
    const varPath = newVarInput.trim();
    if (!varPath) return;

    addWatch(varPath);
    setNewVarInput('');
    setShowAddForm(false);
  }, [newVarInput, addWatch]);

  // Handle key press in "add variable" input
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

  // Begin editing a value cell on double-click
  const handleValueDoubleClick = useCallback(
    (
      path: string,
      address: number | null,
      type: WatchVariable['type'] | undefined,
      currentValue: number | boolean | string | undefined,
      maxLength?: number,
    ) => {
      if (!forceValue || address === null || !type) return;
      // Only allow forcing when debug is active
      if (debugMode === 'none') return;

      const draft =
        currentValue === undefined
          ? ''
          : typeof currentValue === 'boolean'
            ? currentValue ? '1' : '0'
            : String(currentValue);

      setEditing({ path, address, type, maxLength, draft });
      // Focus input after React re-renders
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    },
    [forceValue, debugMode],
  );

  const handleForceKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!editing || !forceValue) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const raw = editing.draft.trim();
        let coerced: number | boolean | string;

        if (editing.type === 'BOOL') {
          coerced = raw === '1' || raw.toLowerCase() === 'true';
        } else if (editing.type === 'STRING') {
          coerced = raw;
        } else {
          const n = Number(raw);
          if (isNaN(n)) {
            setEditing(null);
            return;
          }
          coerced = n;
        }

        await forceValue(editing.address, coerced, editing.type, editing.maxLength);
        setEditing(null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(null);
      }
    },
    [editing, forceValue],
  );

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
                  <td
                    className="px-3 py-1.5 font-mono"
                    title={
                      forceValue && result.address !== null && debugMode !== 'none'
                        ? 'Double-click to force value'
                        : undefined
                    }
                    onDoubleClick={() =>
                      handleValueDoubleClick(
                        path,
                        result.address,
                        result.type as WatchVariable['type'] | undefined ?? undefined,
                        result.value ?? undefined,
                        undefined,
                      )
                    }
                  >
                    {editing?.path === path ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editing.draft}
                        onChange={(e) =>
                          setEditing((prev) => prev ? { ...prev, draft: e.target.value } : null)
                        }
                        onKeyDown={handleForceKeyDown}
                        onBlur={() => setEditing(null)}
                        className="w-full bg-[var(--color-surface-900)] border border-amber-500
                                   rounded px-1 py-0 text-xs text-amber-300
                                   focus:outline-none focus:border-amber-400"
                      />
                    ) : result.loading ? (
                      <span className="text-[var(--color-surface-400)] animate-pulse">...</span>
                    ) : result.error ? (
                      <span className="text-red-400 text-xs" title={result.error}>
                        {result.exists ? '???' : 'N/A'}
                      </span>
                    ) : (
                      <span
                        className={`${
                          result.type === 'BOOL'
                            ? result.value ? 'text-green-400' : 'text-red-400'
                            : 'text-blue-400'
                        } ${
                          forceValue && result.address !== null && debugMode !== 'none'
                            ? 'cursor-pointer hover:underline decoration-dotted underline-offset-2'
                            : ''
                        }`}
                      >
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

      {/* Footer with hints */}
      {debugMode === 'none' && variables.length > 0 && (
        <div className="px-3 py-2 bg-[var(--color-surface-700)] border-t border-[var(--color-surface-600)]
                        text-[10px] text-[var(--color-surface-400)]">
          Start debugging to see live values
        </div>
      )}
      {debugMode !== 'none' && forceValue && variables.length > 0 && (
        <div className="px-3 py-2 bg-[var(--color-surface-700)] border-t border-[var(--color-surface-600)]
                        text-[10px] text-[var(--color-surface-400)]">
          Double-click a value to force it · Enter to confirm · Esc to cancel
        </div>
      )}
    </div>
  );
}

export default DebugWatchPanel;
