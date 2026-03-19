/**
 * @file DebugWatchPanel.tsx
 * @brief Debug Watch Panel using IDE Store hooks
 *
 * A simpler watch panel that integrates with the useIDEStore
 * debug state and useDebugValues hooks. This provides a clean
 * interface for the IDE's debug panel.
 */

import { useRef, useState } from 'react';
import { Plus, X, Trash2, Eye, EyeOff } from 'lucide-react';
import { formatDebugValue } from '../hooks/useDebugValue';
import { useIDEStore } from '../store/useIDEStore';
import { buildDebugWatchRows } from './debugWatchRows';
import { WATCH_FORCE_STATE, type WatchVariable } from '../runtime/debugAdapter';
import { resolveWatchCommitAction, WATCH_COMMIT_ACTION } from './debugWatchPanelLogic';

/**
 * Format address for display
 */
function formatAddress(address: number | null): string {
  if (address === null) return '---';
  return `0x${address.toString(16).padStart(4, '0').toUpperCase()}`;
}

type SetValueFn = (
  address: number,
  value: number | boolean | string,
  type: WatchVariable['type'],
  maxLength?: number,
) => Promise<void>;

type ToggleForceValueFn = (
  path: string,
  address: number,
  value: number | boolean | string,
  type: WatchVariable['type'],
  force: boolean,
  maxLength?: number,
) => Promise<void>;

interface DebugWatchPanelProps {
  setValue?: SetValueFn;
  toggleForceValue?: ToggleForceValueFn;
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
export function DebugWatchPanel({ setValue, toggleForceValue }: DebugWatchPanelProps): React.ReactElement {
  const [newVarInput, setNewVarInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get debug state from store
  const debugMode = useIDEStore((state) => state.debug.mode);
  const isPolling = useIDEStore((state) => state.debug.isPolling);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const liveValues = useIDEStore((state) => state.debug.liveValues);
  const forcedValues = useIDEStore((state) => state.debug.forcedValues);
  const watchVariables = useIDEStore((state) => state.debug.watchVariables);
  const addWatch = useIDEStore((state) => state.addWatchVariable);
  const removeWatch = useIDEStore((state) => state.removeWatchVariable);
  const clearAll = useIDEStore((state) => state.clearWatchVariables);
  const variables = buildDebugWatchRows(watchVariables, debugMap, liveValues, forcedValues, isPolling);

  // Handle adding a new watch variable
  const handleAddVariable = () => {
    const varPath = newVarInput.trim();
    if (!varPath) return;

    addWatch(varPath);
    setNewVarInput('');
    setShowAddForm(false);
  };

  // Handle key press in "add variable" input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddVariable();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowAddForm(false);
      setNewVarInput('');
    }
  };

  // Begin editing a value cell on double-click
  const handleValueDoubleClick = (
    path: string,
    address: number | null,
    type: WatchVariable['type'] | undefined,
    currentValue: number | boolean | string | undefined,
    maxLength?: number,
  ) => {
    if (!setValue || address === null || !type) return;
    if (debugMode === 'none') return;

    const draft =
      currentValue === undefined
        ? ''
        : typeof currentValue === 'boolean'
          ? currentValue ? '1' : '0'
          : String(currentValue);

    setEditing({ path, address, type, maxLength, draft });
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const parseDraftValue = (raw: string, type: WatchVariable['type']): number | boolean | string | null => {
    if (type === 'BOOL') {
      return raw === '1' || raw.toLowerCase() === 'true';
    }

    if (type === 'STRING') {
      return raw;
    }

    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return null;
    }

    return parsed;
  };

  const handleSetKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!editing || !setValue) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const coerced = parseDraftValue(editing.draft.trim(), editing.type);
      if (coerced === null) {
        setEditing(null);
        return;
      }

      const currentRow = variables.find((entry) => entry.path === editing.path);
      const action = resolveWatchCommitAction(currentRow?.result.forceEntry?.state);

      if (action === WATCH_COMMIT_ACTION.UPDATE_FORCE && toggleForceValue) {
        await toggleForceValue(
          editing.path,
          editing.address,
          coerced,
          editing.type,
          true,
          editing.maxLength,
        );
      } else {
        await setValue(editing.address, coerced, editing.type, editing.maxLength);
      }

      setEditing(null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(null);
    }
  };

  const handleForceToggle = async (
    path: string,
    address: number | null,
    type: WatchVariable['type'] | undefined,
    currentValue: number | boolean | string | null,
    nextForced: boolean,
    maxLength?: number,
  ) => {
    if (!toggleForceValue || address === null || !type || debugMode === 'none') {
      return;
    }

    const draftValue = editing?.path === path
      ? parseDraftValue(editing.draft.trim(), editing.type)
      : currentValue;

    if (draftValue === null) {
      return;
    }

    await toggleForceValue(path, address, draftValue, type, nextForced, maxLength);
  };

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
                <th className="px-3 py-1.5 font-medium w-16">Force</th>
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
                      setValue && result.address !== null && debugMode !== 'none'
                        ? 'Double-click to set value'
                        : undefined
                    }
                    onDoubleClick={() =>
                      handleValueDoubleClick(
                        path,
                        result.address,
                        result.type as WatchVariable['type'] | undefined ?? undefined,
                        result.value ?? undefined,
                        result.maxLength,
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
                        onKeyDown={handleSetKeyDown}
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
                          result.forced
                            ? 'text-amber-300'
                            : result.type === 'BOOL'
                            ? result.value ? 'text-green-400' : 'text-red-400'
                            : 'text-blue-400'
                        } ${
                          result.forced ? 'font-semibold decoration-amber-400' : ''
                        } ${
                          setValue && result.address !== null && debugMode !== 'none'
                            ? 'cursor-pointer hover:underline decoration-dotted underline-offset-2'
                            : ''
                        }`}
                        data-forced={result.forced ? 'true' : 'false'}
                      >
                        {formatDebugValue(result.value, result.type)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[var(--color-surface-400)] text-xs">
                    <input
                      type="checkbox"
                      checked={result.forced}
                      disabled={!toggleForceValue || result.address === null || debugMode === 'none' || !result.exists}
                      title={
                        result.forceEntry?.state === WATCH_FORCE_STATE.FORCED
                          ? 'Forced until cleared'
                          : 'Force current value'
                      }
                      onChange={(e) => {
                        void handleForceToggle(
                          path,
                          result.address,
                          result.type as WatchVariable['type'] | undefined,
                          result.value,
                          e.target.checked,
                          result.maxLength,
                        );
                      }}
                    />
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
      {debugMode !== 'none' && (setValue || toggleForceValue) && variables.length > 0 && (
        <div className="px-3 py-2 bg-[var(--color-surface-700)] border-t border-[var(--color-surface-600)]
                        text-[10px] text-[var(--color-surface-400)]">
          Double-click a value to set it once · Use Force to hold the value until cleared
        </div>
      )}
    </div>
  );
}

export default DebugWatchPanel;
