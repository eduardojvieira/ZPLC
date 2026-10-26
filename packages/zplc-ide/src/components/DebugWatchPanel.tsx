/**
 * @file DebugWatchPanel.tsx
 * @brief Debug Watch Panel using IDE Store hooks
 *
 * A simpler watch panel that integrates with the useIDEStore
 * debug state and useDebugValues hooks. This provides a clean
 * interface for the IDE's debug panel.
 */

import { useMemo, useRef, useState } from 'react';
import { Plus, X, Trash2, Eye, AlertTriangle, LoaderCircle } from 'lucide-react';
import { SIGNAL_TEXT_CLASS, signalTone } from '../theme/signalTone';
import { useIDEStore } from '../store/useIDEStore';
import { buildDebugWatchRows } from './debugWatchRows';
import { WATCH_FORCE_STATE, type WatchVariable } from '../runtime/debugAdapter';
import { confirmForce, confirmForceChange, confirmRelease, confirmReleaseAll, proceedAfterConfirmation } from './physicalActions';
import {
  completeWatchSymbols,
  formatWatchValue,
  parseWatchDraft,
  sortWatchRows,
  WATCH_FORMATS,
  WATCH_FORMAT,
  type WatchFormat,
  type WatchSortDirection,
  type WatchSortKey,
} from './watchTable';
import { canEditWatchValue, canReleaseForces, canToggleForce, resolveWatchCommitAction, WATCH_COMMIT_ACTION } from './debugWatchPanelLogic';
import { Button, Checkbox, IconButton, Select, TextField, Tooltip } from '../ui';
import { useT } from '../i18n';
import { announce } from '../utils/announce';
import { PanelEmptyState } from './panelStates';

/** What the force checkbox of a row says when the pointer or the focus is on it. */
function forceHint(state: string | undefined, forcesUnconfirmed: boolean, forceable: boolean): string {
  if (forcesUnconfirmed) return 'Force state unconfirmed. Reconnect and verify before operating.';
  if (state === WATCH_FORCE_STATE.FORCED) return 'Forced until cleared';
  if (!forceable) return 'Waiting for the first value of this variable';
  return 'Force current value';
}

/**
 * Format address for display
 */
function formatAddress(address: number | null): string {
  if (address === null) return '---';
  return `0x${address.toString(16).padStart(4, '0').toUpperCase()}`;
}

type SetValueFn = (address: number, value: number | boolean | string, type: WatchVariable['type'], maxLength?: number) => Promise<void>;

type ToggleForceValueFn = (
  path: string,
  address: number,
  value: number | boolean | string | null,
  type: WatchVariable['type'],
  force: boolean,
  maxLength?: number,
) => Promise<void>;

interface DebugWatchPanelProps {
  setValue?: SetValueFn;
  toggleForceValue?: ToggleForceValueFn;
  clearAllForcedValues?: () => Promise<void>;
  hasActiveSerialSession?: boolean;
}

/** Inline editor state — only one cell editable at a time */
interface EditingCell {
  path: string;
  address: number;
  type: WatchVariable['type'];
  maxLength?: number;
  draft: string;
}

type SortState = { key: WatchSortKey | null; direction: WatchSortDirection };

/** A column header that sorts: ascending, then descending, then the order the variables were added. */
function SortHeader({
  column,
  label,
  sort,
  setSort,
  t,
  className = '',
}: {
  column: WatchSortKey;
  label: string;
  sort: SortState;
  setSort: (next: SortState) => void;
  t: ReturnType<typeof useT>['t'];
  className?: string;
}): React.ReactElement {
  const active = sort.key === column;
  const next = (): SortState =>
    !active
      ? { key: column, direction: 'asc' }
      : sort.direction === 'asc'
        ? { key: column, direction: 'desc' }
        : { key: null, direction: 'asc' };
  return (
    <th
      className={`px-3 py-1.5 font-medium ${className}`}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Button
        variant="ghost"
        size="sm"
        className="uppercase tracking-wide"
        aria-label={t('panel.watch.sort', { column: label })}
        onClick={() => setSort(next())}
      >
        {label}
        {active ? (sort.direction === 'asc' ? ' \u2191' : ' \u2193') : ''}
      </Button>
    </th>
  );
}

/**
 * Debug Watch Panel Component
 */
export function DebugWatchPanel({
  setValue,
  toggleForceValue,
  clearAllForcedValues,
  hasActiveSerialSession = false,
}: DebugWatchPanelProps): React.ReactElement {
  const { t, tn } = useT();
  const [newVarInput, setNewVarInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [forceChangeError, setForceChangeError] = useState<string | null>(null);
  const [format, setFormat] = useState<WatchFormat>(WATCH_FORMAT.AUTO);
  const [sort, setSort] = useState<{ key: WatchSortKey | null; direction: WatchSortDirection }>({ key: null, direction: 'asc' });
  // values typed ahead and not written yet (IDE-019): the user writes them all with one explicit action
  const [prepared, setPrepared] = useState<Map<string, EditingCell & { value: number | boolean | string }>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // Get debug state from store
  const debugMode = useIDEStore((state) => state.debug.mode);
  const isPolling = useIDEStore((state) => state.debug.isPolling);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const liveValues = useIDEStore((state) => state.debug.liveValues);
  const forcedValues = useIDEStore((state) => state.debug.forcedValues);
  const forcesUnconfirmed = useIDEStore((state) => state.debug.forcesUnconfirmed);
  const watchVariables = useIDEStore((state) => state.debug.watchVariables);
  const addWatch = useIDEStore((state) => state.addWatchVariable);
  const removeWatch = useIDEStore((state) => state.removeWatchVariable);
  const clearAll = useIDEStore((state) => state.clearWatchVariables);
  // the panel renders at every reading: the candidates are worked out when the program or the typed text changes, not then
  const symbols = useMemo(() => (showAddForm ? completeWatchSymbols(debugMap, newVarInput) : []), [showAddForm, debugMap, newVarInput]);
  const variables = sortWatchRows(
    buildDebugWatchRows(watchVariables, debugMap, liveValues, forcedValues, isPolling),
    sort.key,
    sort.direction,
  );
  const hasForceEvidence = forcedValues.size > 0 || forcesUnconfirmed;
  const controlsBlocked = debugMode === 'none' || forcesUnconfirmed;
  const releaseEnabled = canReleaseForces(hasActiveSerialSession, hasForceEvidence, releaseBusy);
  // Only a real device is asked before a force changes (UX-020); a simulation has nothing physical to protect.
  const device = hasActiveSerialSession ? 'hardware' : 'simulate';

  // Handle adding a new watch variable
  const handleAddVariable = () => {
    const varPath = newVarInput.trim();
    if (!varPath) return;

    addWatch(varPath);
    announce(t('workbench.watch.added', { path: varPath }));
    closeAddForm();
  };

  /** The field leaves the page with the form, so the focus goes back to the control that opened it (UX-025, UX-028). */
  const closeAddForm = () => {
    setNewVarInput('');
    setShowAddForm(false);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  // Handle key press in "add variable" input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddVariable();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAddForm();
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
    if (address === null || !type || controlsBlocked) return;

    const forceState = variables.find((entry) => entry.path === path)?.result.forceEntry?.state;
    const action = resolveWatchCommitAction(forceState, hasActiveSerialSession);
    if (!canEditWatchValue(action, Boolean(setValue), Boolean(toggleForceValue))) return;

    const draft = currentValue === undefined ? '' : typeof currentValue === 'boolean' ? (currentValue ? '1' : '0') : String(currentValue);

    setEditing({ path, address, type, maxLength, draft });
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const parseDraftValue = parseWatchDraft;

  /** Write one value the way the row allows: a set, or a change of the force it holds. Errors become the force-change error. */
  const commitValue = async (cell: EditingCell, coerced: number | boolean | string): Promise<void> => {
    const currentRow = variables.find((entry) => entry.path === cell.path);
    const action = resolveWatchCommitAction(currentRow?.result.forceEntry?.state, hasActiveSerialSession);
    if (!canEditWatchValue(action, Boolean(setValue), Boolean(toggleForceValue))) return;
    setForceChangeError(null);
    try {
      if (action === WATCH_COMMIT_ACTION.UPDATE_FORCE) {
        if (!toggleForceValue) return;
        if (!(await proceedAfterConfirmation(device, () => confirmForceChange(cell.path, coerced)))) return;
        await toggleForceValue(cell.path, cell.address, coerced, cell.type, true, cell.maxLength);
      } else {
        if (!setValue) return;
        await setValue(cell.address, coerced, cell.type, cell.maxLength);
      }
    } catch {
      setForceChangeError('Force change could not be confirmed. Verify device state before operating.');
    }
  };

  const handleWritePrepared = async () => {
    const entries = [...prepared.values()];
    setPrepared(new Map());
    for (const entry of entries) await commitValue(entry, entry.value);
  };

  // Catches its own errors and shows them as the force-change error; the input starts it with `void`.
  const handleSetKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!editing || forcesUnconfirmed) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const coerced = parseDraftValue(editing.draft.trim(), editing.type);
      if (coerced === null) {
        setEditing(null);
        return;
      }
      if (e.shiftKey) {
        // Shift+Enter prepares the value; "Write prepared values" writes it
        setPrepared((prev) => new Map(prev).set(editing.path, { ...editing, value: coerced }));
        setEditing(null);
        return;
      }
      await commitValue(editing, coerced);
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
    if (!toggleForceValue || address === null || !type || controlsBlocked) {
      return;
    }

    const draftValue = editing?.path === path ? parseDraftValue(editing.draft.trim(), editing.type) : currentValue;

    // Forcing holds a value, so it needs one; releasing a force never does.
    if (!canToggleForce(nextForced, draftValue !== null)) {
      return;
    }

    setForceChangeError(null);
    try {
      if (!(await proceedAfterConfirmation(device, () => (nextForced ? confirmForce(path, draftValue) : confirmRelease(path))))) return;
      await toggleForceValue(path, address, draftValue, type, nextForced, maxLength);
    } catch {
      setForceChangeError('Force change could not be confirmed. Verify device state before operating.');
    }
  };

  const handleReleaseAllForces = async () => {
    if (!clearAllForcedValues || !releaseEnabled) return;
    if (!(await proceedAfterConfirmation(device, confirmReleaseAll))) return;
    setReleaseBusy(true);
    setReleaseError(null);
    try {
      await clearAllForcedValues();
    } catch {
      setReleaseError('Force release could not be confirmed. Reconnect and verify before operating.');
    } finally {
      setReleaseBusy(false);
    }
  };

  // Status indicator color
  const statusColor =
    debugMode === 'none'
      ? 'bg-[var(--color-status-stopped)]'
      : isPolling
        ? 'bg-[var(--color-status-running)]'
        : 'bg-[var(--color-status-warning)]';

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-800)] text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)]">
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-[var(--color-surface-300)]" />
          <span className="font-medium text-[var(--color-surface-100)]">{t('workbench.watch.title')}</span>
          <span
            role="img"
            aria-label={t('workbench.watch.debugMode', { mode: debugMode })}
            className={`w-2 h-2 rounded-full ${statusColor}`}
          />
        </div>
        <div className="flex items-center gap-1">
          <Select
            aria-label={t('panel.watch.format')}
            value={format}
            onChange={(e) => setFormat(e.target.value as WatchFormat)}
            className="w-auto text-[11px]"
          >
            {WATCH_FORMATS.map((entry) => (
              <option key={entry} value={entry}>
                {t(`panel.watch.format.${entry}`)}
              </option>
            ))}
          </Select>
          <IconButton
            ref={addButtonRef}
            label={t('workbench.watch.addVariable')}
            variant="ghost"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowAddForm(!showAddForm)}
          />
          {variables.length > 0 && (
            <IconButton label={t('workbench.watch.clearAll')} variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={clearAll} />
          )}
        </div>
      </div>

      {forceChangeError && (
        <div
          role="alert"
          className={
            'mx-3 mt-2 rounded border border-[var(--color-accent-red)]/60 bg-[var(--color-accent-red)]/10 px-2 py-1.5 text-xs ' +
            'text-[var(--color-surface-100)]'
          }
        >
          {forceChangeError}
        </div>
      )}

      {hasForceEvidence && (
        <div
          className={`mx-3 mt-3 rounded-md border px-3 py-2 ${
            forcesUnconfirmed
              ? 'border-[var(--color-accent-yellow)] bg-[var(--color-surface-700)] text-[var(--color-surface-100)]'
              : 'border-[var(--color-surface-500)] bg-[var(--color-surface-700)] text-[var(--color-surface-200)]'
          }`}
          role={forcesUnconfirmed ? 'alert' : 'status'}
          aria-live={forcesUnconfirmed ? 'assertive' : 'polite'}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={16}
              className={
                forcesUnconfirmed
                  ? 'mt-0.5 shrink-0 text-[var(--color-accent-yellow)]'
                  : 'mt-0.5 shrink-0 text-[var(--color-accent-yellow)]'
              }
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">
                {forcesUnconfirmed ? t('workbench.watch.forceUnconfirmed') : tn('workbench.watch.activeForces', forcedValues.size)}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--color-surface-300)]">
                {forcesUnconfirmed ? t('workbench.watch.mayRetain') : t('workbench.watch.remainActive')}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void handleReleaseAllForces();
              }}
              disabled={!clearAllForcedValues || !releaseEnabled}
              className="motion-reduce:transition-none"
            >
              {releaseBusy && <LoaderCircle size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t('workbench.watch.releaseAll')}
            </Button>
            {releaseError && <span className="text-[11px] text-[var(--color-accent-yellow)]">{releaseError}</span>}
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)]">
          <TextField
            list="watch-symbols"
            value={newVarInput}
            onChange={(e) => setNewVarInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('workbench.watch.pathPlaceholder')}
            className="flex-1"
            autoFocus
            aria-label={t('workbench.watch.pathPlaceholder')}
          />
          <datalist id="watch-symbols">
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol} />
            ))}
          </datalist>
          <Button variant="primary" size="sm" onClick={handleAddVariable}>
            {t('workbench.watch.add')}
          </Button>
          <IconButton
            label={t('workbench.watch.closeForm')}
            variant="ghost"
            size="sm"
            icon={<X size={14} />}
            onClick={() => {
              setShowAddForm(false);
              setNewVarInput('');
            }}
          />
        </div>
      )}

      {prepared.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)] text-xs">
          <span className="flex-1">{t('panel.watch.prepared.count', { count: prepared.size })}</span>
          <Button
            variant="primary"
            size="sm"
            disabled={controlsBlocked}
            onClick={() => {
              void handleWritePrepared();
            }}
          >
            {t('panel.watch.prepared.write')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPrepared(new Map())}>
            {t('panel.watch.prepared.discard')}
          </Button>
        </div>
      )}

      {/* Variable List */}
      <div className="flex-1 overflow-y-auto">
        {variables.length === 0 ? (
          <PanelEmptyState
            title={t('panel.watch.empty.title')}
            description={t('panel.watch.empty.description')}
            actionLabel={t('panel.watch.empty.action')}
            onAction={() => setShowAddForm(true)}
          />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-[var(--color-surface-700)]">
              <tr className="text-left text-[11px] text-[var(--text-tertiary)] uppercase tracking-wide">
                <SortHeader column="name" label={t('panel.watch.col.name')} sort={sort} setSort={setSort} t={t} />
                <SortHeader column="value" label={t('panel.watch.col.value')} sort={sort} setSort={setSort} t={t} />
                <th className="px-3 py-1.5 font-medium w-16">{t('workbench.watch.force')}</th>
                <SortHeader column="type" label={t('panel.watch.col.type')} sort={sort} setSort={setSort} t={t} className="w-20" />
                <SortHeader column="address" label={t('panel.watch.col.address')} sort={sort} setSort={setSort} t={t} className="w-16" />
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {variables.map(({ path, result }) => {
                const action = resolveWatchCommitAction(result.forceEntry?.state, hasActiveSerialSession);
                const forceable = canToggleForce(!result.forced, result.value !== null || editing?.path === path);
                const valueEditable =
                  result.address !== null && !controlsBlocked && canEditWatchValue(action, Boolean(setValue), Boolean(toggleForceValue));

                return (
                  <tr key={path} className="border-t border-[var(--color-surface-700)] hover:bg-[var(--color-surface-700)]/50">
                    <td className="px-3 py-1.5 font-mono text-[var(--color-surface-200)]">{path}</td>
                    <td
                      className="px-3 py-1.5 font-mono ui-tabular"
                      onDoubleClick={() =>
                        handleValueDoubleClick(
                          path,
                          result.address,
                          (result.type as WatchVariable['type'] | undefined) ?? undefined,
                          result.value ?? undefined,
                          result.maxLength,
                        )
                      }
                    >
                      {editing?.path === path ? (
                        <TextField
                          aria-label={t('workbench.watch.newValue', { path })}
                          ref={inputRef}
                          value={editing.draft}
                          onChange={(e) => setEditing((prev) => (prev ? { ...prev, draft: e.target.value } : null))}
                          onKeyDown={(event) => {
                            void handleSetKeyDown(event);
                          }}
                          onBlur={() => setEditing(null)}
                          className="w-full"
                        />
                      ) : result.loading ? (
                        <span className="text-[var(--color-surface-400)]">...</span>
                      ) : result.error ? (
                        <Tooltip content={result.error}>
                          <span tabIndex={0} className={`${SIGNAL_TEXT_CLASS.fault} text-xs`}>
                            {result.exists ? '???' : t('workbench.watch.notAvailable')}
                          </span>
                        </Tooltip>
                      ) : (
                        <span
                          className={`${SIGNAL_TEXT_CLASS[signalTone(result)]} ${result.forced ? 'font-semibold' : ''} ${
                            valueEditable ? 'cursor-pointer hover:underline decoration-dotted underline-offset-2' : ''
                          }`}
                          data-forced={result.forced ? 'true' : 'false'}
                          tabIndex={valueEditable ? 0 : undefined}
                          onKeyDown={
                            valueEditable
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === 'F2') {
                                    e.preventDefault();
                                    handleValueDoubleClick(
                                      path,
                                      result.address,
                                      (result.type as WatchVariable['type'] | undefined) ?? undefined,
                                      result.value ?? undefined,
                                      result.maxLength,
                                    );
                                  }
                                }
                              : undefined
                          }
                        >
                          {formatWatchValue(result.value, result.type, format)}
                        </span>
                      )}
                      {prepared.has(path) && editing?.path !== path && (
                        <span className="ml-2 text-[11px] text-[var(--color-accent-yellow)]" data-prepared="true">
                          {t('panel.watch.prepared.value', { value: formatWatchValue(prepared.get(path)!.value, result.type, format) })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-surface-400)] text-xs">
                      {result.forceEntry?.state === WATCH_FORCE_STATE.UNCONFIRMED ? (
                        <span className="font-medium text-[var(--color-accent-yellow)]">{t('workbench.watch.unconfirmed')}</span>
                      ) : (
                        <Tooltip content={forceHint(result.forceEntry?.state, forcesUnconfirmed, forceable)}>
                          <Checkbox
                            label={t('workbench.watch.forcePath', { path })}
                            hideLabel
                            checked={result.forced}
                            disabled={!toggleForceValue || result.address === null || controlsBlocked || !result.exists || !forceable}
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
                        </Tooltip>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-surface-400)] text-xs">{result.type || '?'}</td>
                    <td className="px-3 py-1.5 text-[var(--color-surface-500)] text-xs font-mono">{formatAddress(result.address)}</td>
                    <td className="px-1">
                      <IconButton
                        label={t('workbench.watch.remove')}
                        variant="ghost"
                        size="sm"
                        icon={<X size={12} />}
                        onClick={() => removeWatch(path)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with hints */}
      {debugMode === 'none' && variables.length > 0 && (
        <div
          className="px-3 py-2 bg-[var(--color-surface-700)] border-t border-[var(--color-surface-600)]
                        text-[11px] text-[var(--text-tertiary)]"
        >
          {t('workbench.watch.startDebugging')}
        </div>
      )}
      {debugMode !== 'none' && (setValue || toggleForceValue) && variables.length > 0 && (
        <div
          className="px-3 py-2 bg-[var(--color-surface-700)] border-t border-[var(--color-surface-600)]
                        text-[11px] text-[var(--text-tertiary)]"
        >
          {hasActiveSerialSession ? t('workbench.watch.hintSerial') : t('workbench.watch.hintSimulation')}
        </div>
      )}
    </div>
  );
}

export default DebugWatchPanel;
