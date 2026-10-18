/**
 * LDEditor - Ladder Diagram Editor
 * 
 * Visual editor for IEC 61131-3 LD programs.
 * Features:
 * - Grid-based rung layout with power rails
 * - Drag-and-drop element placement from toolbox
 * - Support for parallel branches (OR logic)
 * - Element selection and property editing
 * - Every action from the keyboard: a cursor, the element palette, binding from the declared symbols (LNG-012)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Rows3 } from 'lucide-react';
import {
  type LDModel,
  type LDRung,
  type LDElement as LDElementType,
  addRow,
  removeElementAt,
  isGridBasedRung,
  convertToGridRung,
} from '../../models/ld';
import LDToolbox from './LDToolbox';
import LDRungGrid from './LDRungGrid';
import LDPrompts, { type LDAsk } from './LDPrompts';
import { insertRungAfter, runLDCommand, type LDCursor, type LDInsert, type LDOutcome } from './keyboard';
import type { LDDropData } from './ldDragData';
import { actionFor, keysBelongToControl } from '../keymap';
import { useProjectBlocks } from '../useProjectBlocks';
import { declaredSymbols } from '../symbols';
import { copyLDRungFragment, ldSelectionIds as selectionIds, ldSelectionOfIds as selectionOfIds, NO_LD_SELECTION, pasteLDRungFragment, type LDClipboardFragment, type LDSelection } from './graphModel';
import { useMonitor } from '../../monitoring/useMonitor';
import { useIDEStore } from '../../store/useIDEStore';
import type { DebugValuesMap } from './LDElement';
import { useElementSelection } from '../elementSelection';
import { useElementBreakpoints } from '../elementBreakpoints';
import { parseElement, rungElement, type SourceElementId } from '../../models/sourceElements';
import { getVisualSelection, setVisualSelection, useVisualFileKey } from '../visualSelection';
import type { VisualGesture } from '../visualHistory';

// =============================================================================
// Props
// =============================================================================

interface LDEditorProps {
  model: LDModel;
  /** Called once for each gesture of the user (LNG-010), with what the history needs to know of it. */
  onChange?: (model: LDModel, gesture?: VisualGesture) => void;
  readOnly?: boolean;
}

// =============================================================================
// Element Properties Editor
// =============================================================================

interface ElementPropertiesProps {
  element: LDElementType;
  /** The names the variable can be bound to: the declared symbols of the document (LNG-012). */
  symbols?: string[];
  onChange: (updated: LDElementType) => void;
  onClose: () => void;
}

function ElementProperties({ element, symbols = [], onChange, onClose }: ElementPropertiesProps) {
  const [variable, setVariable] = useState(element.variable || '');
  const [fbInstance, setFbInstance] = useState(element.instance || '');
  const [comment, setComment] = useState(element.comment || '');
  const [presetTime, setPresetTime] = useState(element.parameters?.PT ?? 'T#1s');
  const isFB = element.type === 'function_block';
  const isTimer = element.fbType === 'TON' || element.fbType === 'TOF' || element.fbType === 'TP';

  const handleSave = () => {
    onChange({
      ...element,
      variable: variable || undefined,
      instance: fbInstance || undefined,
      comment: comment.trim() || undefined,
      ...(isTimer ? { parameters: { ...element.parameters, PT: presetTime } } : {}),
    });
    onClose();
  };

  return (
    <div className="zplc-visual-node absolute top-0 right-0 w-64 border rounded-lg z-50 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Element Properties</h3>
        <button
          onClick={onClose}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-lg"
        >
          ×
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--text-tertiary)] mb-1">Type</label>
          <div className="text-sm text-[var(--text-secondary)] font-mono bg-[var(--color-surface-700)] px-2 py-1 rounded">
            {isFB ? element.fbType : element.type}
          </div>
        </div>

        {!isFB && (
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">Variable</label>
            <input
              type="text"
              value={variable}
              onChange={(e) => setVariable(e.target.value)}
              className="w-full bg-[var(--color-surface-700)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-[var(--text-secondary)]"
              placeholder="Variable name"
              list="ld-declared-symbols"
            />
            <datalist id="ld-declared-symbols">
              {symbols.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
        )}

        {isFB && (
          <>
            <div>
              <label className="block text-xs text-[var(--text-tertiary)] mb-1">Instance Name</label>
              <input
                type="text"
                value={fbInstance}
                onChange={(e) => setFbInstance(e.target.value)}
                className="w-full bg-[var(--color-surface-700)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-[var(--text-secondary)]"
                placeholder="Instance name"
              />
            </div>

            {isTimer ? (
              <div>
                <label className="block text-xs text-[var(--text-tertiary)] mb-1">Preset Time (PT)</label>
                <input
                  type="text"
                  value={presetTime}
                  onChange={(e) => setPresetTime(e.target.value)}
                  aria-label="Preset Time (PT)"
                  className="w-full bg-[var(--color-surface-700)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-[var(--text-secondary)] font-mono"
                  placeholder="T#1s"
                />
              </div>
            ) : null}
          </>
        )}

        {/* Comment field - available for all element types */}
        <div>
          <label className="block text-xs text-[var(--text-tertiary)] mb-1">Comment</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="w-full bg-[var(--color-surface-700)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-[var(--text-secondary)] resize-none"
            placeholder="Optional description..."
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-[var(--color-accent-blue)] hover:opacity-90 text-[var(--color-on-accent)] text-sm py-1.5 rounded
                       transition-colors"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-[var(--color-surface-700)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] text-[var(--text-secondary)] text-sm py-1.5 rounded
                       transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

const NO_SELECTION = NO_LD_SELECTION;

/** What the keys do in a diagram that is not edited (a program is running): moving, reading and the breakpoint. */
const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  'cursorLeft', 'cursorRight', 'cursorUp', 'cursorDown', 'rowStart', 'rowEnd', 'previousRung', 'nextRung', 'firstRung', 'lastRung',
  'toggleBreakpoint', 'showCommands', 'clearSelection',
]);

export default function LDEditor({ model, onChange, readOnly = false }: LDEditorProps) {
  const [selection, setSelection] = useState<LDSelection>(NO_SELECTION);
  const clipboardRef = useRef<LDClipboardFragment | undefined>(undefined);
  // The selection is not part of the document: it is remembered by file, and undo gives back the one from before (LNG-010)
  const fileKey = useVisualFileKey();
  const selectionRef = useRef(selection);
  const select = useCallback((next: LDSelection) => {
    selectionRef.current = next;
    setSelection(next);
    setVisualSelection(fileKey, selectionIds(next));
  }, [fileKey]);
  // The cursor of the keyboard editing: a cell of a rung (LNG-012)
  const [cursor, setCursorState] = useState<LDCursor | null>(null);
  const cursorRef = useRef<LDCursor | null>(null);
  const placeCursor = useCallback((next: LDCursor | null) => {
    cursorRef.current = next;
    setCursorState(next);
  }, []);
  const [ask, setAsk] = useState<LDAsk | null>(null);
  const [status, setStatus] = useState('');
  // the element whose properties are open: the panel is asked for, selecting an element by keyboard does not open it
  const [propertiesFor, setPropertiesFor] = useState<string | null>(null);
  const [commentRequest, setCommentRequest] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const projectBlocks = useProjectBlocks();

  const lastModelRef = useRef(model);
  useEffect(() => {
    if (lastModelRef.current === model) return;
    lastModelRef.current = model;
    const remembered = selectionOfIds(getVisualSelection(fileKey));
    selectionRef.current = remembered;
    setSelection(remembered);
  }, [fileKey, model]);

  // Online values and power flow come from the debug map of the build of this file (LNG-006)
  const monitor = useMonitor();
  // the variables the user forces are drawn as forced, not as the value they hold (UX-009)
  const forcedValues = useIDEStore((state) => state.debug.forcedValues);
  // Breakpoints on rungs: execution stops at the first statement of the rung's code (LNG-004)
  const breakpoints = useElementBreakpoints();

  // Ensure all rungs are grid-based
  const normalizedModel = useMemo<LDModel>(() => ({
    ...model,
    rungs: model.rungs.map(rung =>
      isGridBasedRung(rung) ? rung : convertToGridRung(rung)
    ),
  }), [model]);
  const latestModelRef = useRef(normalizedModel);

  useEffect(() => {
    latestModelRef.current = normalizedModel;
  }, [normalizedModel]);

  // The values of the variables the elements show: what the map says the program holds, and unavailable otherwise
  const debugValues = useMemo<DebugValuesMap | undefined>(() => {
    if (!monitor.active) return undefined;
    const values: DebugValuesMap = new Map();
    for (const [variable, { reading, type }] of monitor.values) {
      values.set(variable, { value: reading ?? null, type: type || null, address: null, region: null, size: null, loading: false, exists: true, error: null, forced: forcedValues.has(variable) });
    }
    return values;
  }, [monitor, forcedValues]);

  const symbolNames = useMemo(() => declaredSymbols(normalizedModel.variables).map((symbol) => symbol.name), [normalizedModel.variables]);
  const askedElement = useMemo<LDElementType | null>(() => {
    if (ask?.kind !== 'bind') return null;
    return normalizedModel.rungs.flatMap((rung) => rung.grid?.flat() ?? []).find((cell) => cell.element?.id === ask.elementId)?.element ?? null;
  }, [ask, normalizedModel]);

  const selectedRungId = selection.rungId;
  const selectedElement = useMemo<LDElementType | null>(() => {
    if (selection.rungId === null || selection.elementId === null) return null;
    const rung = normalizedModel.rungs.find((candidate) => candidate.id === selection.rungId);
    return rung?.grid?.flat().find((cell) => cell.element?.id === selection.elementId)?.element ?? null;
  }, [normalizedModel, selection]);

  /** One gesture is one commit: the document, and the selection from before it and after it (LNG-010). */
  const commit = useCallback((next: LDModel, after: LDSelection = selectionRef.current, coalesce?: string) => {
    if (readOnly || !onChange) return;
    onChange(next, {
      ...(coalesce === undefined ? {} : { coalesce }),
      selection: { before: selectionIds(selectionRef.current), after: selectionIds(after) },
    });
    select(after);
  }, [onChange, readOnly, select]);

  // Add a new rung
  const handleAddRung = useCallback(() => {
    if (readOnly || !onChange) return;

    // an id that no rung has, also after one was deleted
    const { model: next } = insertRungAfter(normalizedModel, null);
    commit(next);
  }, [commit, normalizedModel, onChange, readOnly]);

  // Delete a rung
  const handleDeleteRung = useCallback((rungId: string) => {
    if (readOnly || !onChange) return;

    // Renumber remaining rungs
    const filtered = normalizedModel.rungs.filter(r => r.id !== rungId);
    const renumbered = filtered.map((r, idx) => ({ ...r, number: idx + 1 }));

    commit({
      ...normalizedModel,
      rungs: renumbered,
    }, NO_SELECTION);
  }, [commit, normalizedModel, onChange, readOnly]);

  // Update a rung
  const handleRungChange = useCallback((rungId: string, updatedRung: LDRung, after?: LDSelection, coalesce?: string) => {
    if (readOnly || !onChange) return;

    commit({
      ...normalizedModel,
      rungs: normalizedModel.rungs.map(r => r.id === rungId ? updatedRung : r),
    }, after, coalesce);
  }, [commit, normalizedModel, onChange, readOnly]);

  // Add a row to a rung (for parallel branches)
  const handleAddRow = useCallback((rungId: string) => {
    if (readOnly || !onChange) return;

    const rung = normalizedModel.rungs.find(r => r.id === rungId);
    if (!rung) return;

    const updatedRung = addRow(rung);
    handleRungChange(rungId, updatedRung);
  }, [normalizedModel, handleRungChange, readOnly, onChange]);

  // Move rung up
  const handleMoveRungUp = useCallback((rungId: string) => {
    if (readOnly || !onChange) return;

    const idx = normalizedModel.rungs.findIndex(r => r.id === rungId);
    if (idx <= 0) return;

    const newRungs = [...normalizedModel.rungs];
    [newRungs[idx - 1], newRungs[idx]] = [newRungs[idx], newRungs[idx - 1]];

    // Renumber
    const renumbered = newRungs.map((r, i) => ({ ...r, number: i + 1 }));

    commit({
      ...normalizedModel,
      rungs: renumbered,
    });
  }, [commit, normalizedModel, onChange, readOnly]);

  // Move rung down
  const handleMoveRungDown = useCallback((rungId: string) => {
    if (readOnly || !onChange) return;

    const idx = normalizedModel.rungs.findIndex(r => r.id === rungId);
    if (idx < 0 || idx >= normalizedModel.rungs.length - 1) return;

    const newRungs = [...normalizedModel.rungs];
    [newRungs[idx], newRungs[idx + 1]] = [newRungs[idx + 1], newRungs[idx]];

    // Renumber
    const renumbered = newRungs.map((r, i) => ({ ...r, number: i + 1 }));

    commit({
      ...normalizedModel,
      rungs: renumbered,
    });
  }, [commit, normalizedModel, onChange, readOnly]);

  // Handle element deletion
  const handleElementDelete = useCallback((rungId: string, element: LDElementType) => {
    if (readOnly || !onChange) return;
    
    const rung = normalizedModel.rungs.find(r => r.id === rungId);
    if (!rung || element.row === undefined || element.col === undefined) return;
    
    const updatedRung = removeElementAt(rung, element.row, element.col);
    handleRungChange(rungId, updatedRung, { rungId, elementId: null });
  }, [normalizedModel, handleRungChange, readOnly, onChange]);

  // Handle element selection
  const handleElementSelect = useCallback((element: LDElementType | null, rungId: string) => {
    select({ rungId, elementId: element?.id ?? null });
    setPropertiesFor(element?.id ?? null);
    if (element && element.row !== undefined && element.col !== undefined) placeCursor({ rungId, row: element.row, col: element.col });
  }, [placeCursor, select]);

  // Activating a problem of this diagram selects the rung and the cell it is about, and scrolls to the rung (LNG-003)
  const selectSourceElement = useCallback((element: SourceElementId) => {
    const parsed = parseElement(element);
    if (!parsed || (parsed.kind !== 'rung' && parsed.kind !== 'cell' && parsed.kind !== 'element')) return;
    const rungId = parsed.kind === 'rung' ? parsed.id : parsed.rung!;
    // a rung that has no id is named by its place in the file: #3 is the third
    const rung = rungId.startsWith('#') ? normalizedModel.rungs[Number(rungId.slice(1)) - 1] : normalizedModel.rungs.find((candidate) => candidate.id === rungId);
    if (!rung) return;
    let selected: LDElementType | null = null;
    if (parsed.kind === 'cell') selected = rung.grid?.[parsed.row!]?.[parsed.col!]?.element ?? null;
    if (parsed.kind === 'element') selected = rung.grid?.flat().find((cell) => cell.element?.id === parsed.id)?.element ?? null;
    select({ rungId: rung.id, elementId: selected?.id ?? null });
    setPropertiesFor(selected?.id ?? null);
    if (parsed.kind === 'cell') placeCursor({ rungId: rung.id, row: parsed.row!, col: parsed.col! });
    else if (selected && selected.row !== undefined && selected.col !== undefined) placeCursor({ rungId: rung.id, row: selected.row, col: selected.col });
    requestAnimationFrame(() => {
      [...document.querySelectorAll('[data-ld-rung-id]')].find((node) => node.getAttribute('data-ld-rung-id') === rung.id)
        ?.scrollIntoView?.({ block: 'center' });
    });
  }, [normalizedModel, placeCursor, select]);
  useElementSelection(selectSourceElement);

  // Handle element property update
  const handleElementUpdate = useCallback((updated: LDElementType) => {
    if (!selectedRungId || !onChange) return;

    const rung = normalizedModel.rungs.find(r => r.id === selectedRungId);
    if (!rung || !rung.grid) return;

    // Find and update the element in the grid
    const newGrid = rung.grid.map(row =>
      row.map(cell => {
        if (cell.element?.id === updated.id) {
          return { ...cell, element: updated };
        }
        return cell;
      })
    );

    handleRungChange(selectedRungId, { ...rung, grid: newGrid }, { rungId: selectedRungId, elementId: updated.id }, `element:${updated.id}`);
  }, [normalizedModel, selectedRungId, handleRungChange, onChange]);

  // What a command of the keyboard leaves: the cursor, what is announced, the document as one gesture, and what to ask next
  const applyOutcome = useCallback((outcome: LDOutcome) => {
    placeCursor(outcome.cursor);
    setStatus(outcome.say);
    if (outcome.changed) {
      latestModelRef.current = outcome.model;
      commit(outcome.model, outcome.selection ?? selectionRef.current);
    } else if (outcome.selection) {
      select(outcome.selection);
    }
    const next = outcome.prompt;
    if (next?.kind === 'comment') setCommentRequest((count) => count + 1);
    else if (next?.kind === 'select') setPropertiesFor(next.elementId);
    else if (next) setAsk(next);
    // a question has the focus itself; the focus goes to the cursor when there is none
    if (!next || next.kind === 'select' || next.kind === 'comment') setFocusRequest((count) => count + 1);
  }, [commit, placeCursor, select]);

  const runCommand = useCallback((command: string, argument?: Parameters<typeof runLDCommand>[3], at: LDCursor | null = cursorRef.current) => {
    switch (command) {
      case 'copyRung': {
        if (readOnly || !selectedRungId) return;
        const fragment = copyLDRungFragment(latestModelRef.current, selectedRungId);
        if (fragment) clipboardRef.current = fragment;
        return;
      }
      case 'pasteRung': {
        if (readOnly || !onChange || !selectedRungId || !clipboardRef.current) return;
        const pasted = pasteLDRungFragment(latestModelRef.current, clipboardRef.current, selectedRungId);
        if (!pasted) return;
        latestModelRef.current = pasted;
        const copiedRung = pasted.rungs[pasted.rungs.findIndex((rung) => rung.id === selectedRungId) + 1];
        commit(pasted, copiedRung ? { rungId: copiedRung.id, elementId: null } : NO_SELECTION);
        return;
      }
      case 'toggleBreakpoint':
        if (selectedRungId) breakpoints.toggle(rungElement(selectedRungId));
        return;
      case 'showCommands':
        setAsk({ kind: 'commands' });
        return;
      case 'clearSelection':
        select(NO_SELECTION);
        setPropertiesFor(null);
        return;
      default:
        applyOutcome(runLDCommand(latestModelRef.current, at, command, argument));
    }
  }, [applyOutcome, breakpoints, commit, onChange, readOnly, select, selectedRungId]);

  // The keys of the table (../keymap.ts): the cursor and the commands of the ladder
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (keysBelongToControl(e.target)) return;
    const command = actionFor('ld', e);
    if (!command) return;
    if (readOnly && !READ_ONLY_COMMANDS.has(command)) return;
    if (command === 'clearSelection' && !selectedElement && !selectedRungId) return;
    if (command === 'toggleBreakpoint' && !selectedRungId) return;
    e.preventDefault();
    runCommand(command);
  }, [readOnly, runCommand, selectedElement, selectedRungId]);

  // an item of the toolbox, pressed or dropped, is inserted where the cursor (or the drop) is
  const insertItem = useCallback((item: LDInsert, at: LDCursor | null = cursorRef.current) => {
    if (readOnly) return;
    const outcome = runLDCommand(latestModelRef.current, at, 'insertElement', { insert: item });
    // a drop does not ask for the variable: the element stays unbound, as a dragged one always did
    applyOutcome(at === cursorRef.current ? outcome : { ...outcome, prompt: undefined });
  }, [applyOutcome, readOnly]);

  const dropItem = useCallback((item: LDDropData, rungId: string, row: number, col: number) => {
    insertItem({ type: item.type, fbType: item.fbType, category: item.category }, { rungId, row, col });
  }, [insertItem]);

  // after a command the cursor is made visible, and the focus is on its element so that a reader announces it
  useEffect(() => {
    const at = cursorRef.current;
    if (focusRequest === 0 || !at) return;
    let frame = 0;
    // the list that was just answered is still being removed in the first frame: the focus waits for it
    const focus = (attempt: number) => {
      frame = requestAnimationFrame(() => {
        if (document.querySelector('[data-keyboard-picker]')) {
          if (attempt < 20) focus(attempt + 1);
          return;
        }
        const rung = [...document.querySelectorAll('[data-ld-rung-id]')].find((node) => node.getAttribute('data-ld-rung-id') === at.rungId);
        rung?.querySelector('[data-ld-cursor]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        const element = rung?.querySelector(`[data-ld-cell="${at.row},${at.col}"] [data-ld-element-id]`) as HTMLElement | null;
        (element ?? rootRef.current)?.focus({ preventScroll: true });
      });
    };
    focus(0);
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  return (
    <div
      ref={rootRef}
      className="zplc-visual-editor w-full h-full flex overflow-hidden"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="Ladder diagram editor"
      aria-keyshortcuts="F1"
      data-ld-cursor-at={cursor ? `${cursor.rungId}:${cursor.row},${cursor.col}` : undefined}
      data-ld-ask={ask?.kind}
    >
      {/* Toolbox sidebar */}
      {!readOnly && <LDToolbox onInsert={(item) => { insertItem({ type: item.type, fbType: item.fbType, category: item.category }); rootRef.current?.focus({ preventScroll: true }); }} />}

      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-800)] border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {normalizedModel.name}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {normalizedModel.rungs.length} rung{normalizedModel.rungs.length !== 1 ? 's' : ''}
            </span>
          </div>

          {!readOnly && (
            <button
              onClick={handleAddRung}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--text-primary)]
                         bg-[var(--color-surface-700)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] rounded border border-[var(--border-color)]
                         transition-colors"
            >
              <Plus size={14} />
              Add Rung
            </button>
          )}
        </div>

        {/* Rungs container */}
        <div className="flex-1 overflow-y-auto p-4">
          {normalizedModel.rungs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-[var(--text-tertiary)] text-sm">No rungs defined</p>
                {!readOnly && (
                  <button
                    onClick={handleAddRung}
                    className="mt-2 text-[var(--color-accent-blue)] hover:opacity-80 text-sm underline"
                  >
                    Add your first rung
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {normalizedModel.rungs.map((rung, idx) => {
                const at = rungElement(rung.id);
                const paused = breakpoints.pausedAt !== undefined && (breakpoints.pausedAt === at || breakpoints.pausedAt.startsWith(`${at}/`));
                const armed = breakpoints.isSet(at);
                const settable = breakpoints.canSet(at);
                return (
                <div key={rung.id} className={`relative group${paused ? ' ring-2 ring-[var(--color-accent-yellow)] rounded' : ''}`} data-ld-rung-id={rung.id}>
                  <button
                    type="button"
                    data-breakpoint-rung={rung.id}
                    aria-pressed={armed}
                    aria-label={`Breakpoint on rung ${rung.number}`}
                    title={!settable ? 'This rung has no statement to stop at'
                        : armed && breakpoints.inactiveReason ? `Breakpoint on rung ${rung.number} is not active: ${breakpoints.inactiveReason}`
                          : !breakpoints.mapped ? `Toggle the breakpoint on rung ${rung.number}: it is armed when the program is loaded (F9 on the selected rung)`
                            : `Toggle the breakpoint on rung ${rung.number} (F9 on the selected rung)`}
                    disabled={!settable && !armed}
                    onClick={() => breakpoints.toggle(at)}
                    className={`absolute -left-3 top-2 z-10 h-3 w-3 rounded-full border transition-opacity disabled:opacity-30 ${
                      armed
                        ? breakpoints.inactiveReason
                          ? 'border-[var(--color-surface-400)] bg-transparent'
                          : 'border-[var(--color-accent-red)] bg-[var(--color-accent-red)]'
                        : 'border-[var(--color-surface-500)] bg-transparent opacity-60 hover:opacity-100'
                    }`}
                  />
                  <LDRungGrid
                    rung={rung}
                    onChange={(updated) => handleRungChange(rung.id, updated)}
                    onElementSelect={(el) => handleElementSelect(el, rung.id)}
                    onElementDelete={(el) => handleElementDelete(rung.id, el)}
                    selectedElementId={selectedRungId === rung.id ? selectedElement?.id : null}
                    onInsert={(item, row, col) => dropItem(item, rung.id, row, col)}
                    cursor={cursor?.rungId === rung.id ? cursor : null}
                    onCursor={(row, col) => placeCursor({ rungId: rung.id, row, col })}
                    commentRequest={cursor?.rungId === rung.id ? commentRequest : undefined}
                    readOnly={readOnly}
                    elementStates={monitor.active ? monitor.states : undefined}
                    debugValues={debugValues}
                  />

                  {/* Rung controls */}
                  {!readOnly && (
                    <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Add row button */}
                      <button
                        onClick={() => handleAddRow(rung.id)}
                        className="p-1 rounded bg-[var(--color-accent-blue)] hover:opacity-90 text-[var(--color-on-accent)]"
                        title="Add parallel branch"
                      >
                        <Rows3 size={12} />
                      </button>

                      {/* Move up */}
                      {idx > 0 && (
                        <button
                          onClick={() => handleMoveRungUp(rung.id)}
                        className="p-1 rounded bg-[var(--visual-panel)] border border-[var(--border-color)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] text-[var(--text-primary)]"
                          title="Move rung up"
                        >
                          <ChevronUp size={12} />
                        </button>
                      )}

                      {/* Move down */}
                      {idx < normalizedModel.rungs.length - 1 && (
                        <button
                          onClick={() => handleMoveRungDown(rung.id)}
                        className="p-1 rounded bg-[var(--visual-panel)] border border-[var(--border-color)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] text-[var(--text-primary)]"
                          title="Move rung down"
                        >
                          <ChevronDown size={12} />
                        </button>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteRung(rung.id)}
                        className="focus-ring p-1 rounded bg-[var(--color-accent-red)] hover:opacity-90 text-[var(--color-on-accent)]"
                        title="Delete rung"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-4 py-2 bg-[var(--color-surface-800)] border-t border-[var(--border-color)]">
          <div className="flex items-center gap-4 text-[10px] text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1">
              <span className="font-mono text-[var(--text-primary)]">| |</span> NO Contact
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-[var(--text-primary)]">|/|</span> NC Contact
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-[var(--text-primary)]">( )</span> Coil
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-[var(--text-primary)]">(S)</span> Set
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-[var(--text-primary)]">(R)</span> Reset
            </span>
            <span className="flex items-center gap-1 ml-auto text-[var(--text-tertiary)]">
              Arrows move the cursor • I opens the palette • F2 binds a variable • F1 lists every key • Ctrl/Cmd+C/V copies the selected rung • Delete removes
            </span>
          </div>
        </div>

        {/* Element properties panel */}
        {selectedElement && !readOnly && propertiesFor === selectedElement.id && (
          <ElementProperties
            key={selectedElement.id}
            element={selectedElement}
            symbols={symbolNames}
            onChange={handleElementUpdate}
            onClose={() => { select({ rungId: selectedRungId, elementId: null }); setPropertiesFor(null); }}
          />
        )}

        {/* What the keyboard asks: the element to insert, the variable to bind, the command to run (LNG-012) */}
        {ask && (!readOnly || ask.kind === 'commands') ? (
          <LDPrompts
            ask={ask}
            model={normalizedModel}
            element={askedElement}
            projectBlocks={projectBlocks}
            onInsert={(item) => { setAsk(null); insertItem(item); }}
            onBind={(name) => { setAsk(null); runCommand('bindVariable', { variable: name }); }}
            onCommand={(command) => { setAsk(null); runCommand(command); }}
            onClose={() => setAsk(null)}
          />
        ) : null}
        <div role="status" aria-live="polite" data-visual-status className="sr-only">{status}</div>
      </div>
    </div>
  );
}
