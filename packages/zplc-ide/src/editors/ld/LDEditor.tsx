/**
 * LDEditor - Ladder Diagram Editor
 * 
 * Visual editor for IEC 61131-3 LD programs.
 * Features:
 * - Grid-based rung layout with power rails
 * - Drag-and-drop element placement from toolbox
 * - Support for parallel branches (OR logic)
 * - Element selection and property editing
 */

import { useCallback, useState, useMemo } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Rows3 } from 'lucide-react';
import {
  type LDModel,
  type LDRung,
  type LDElement as LDElementType,
  createEmptyRung,
  addRow,
  removeElementAt,
  isGridBasedRung,
  convertToGridRung,
} from '../../models/ld';
import LDToolbox from './LDToolbox';
import LDRungGrid from './LDRungGrid';
import { useIDEStore } from '../../store/useIDEStore';
import { useDebugValues } from '../../hooks/useDebugValue';

// =============================================================================
// Props
// =============================================================================

interface LDEditorProps {
  model: LDModel;
  onChange?: (model: LDModel) => void;
  readOnly?: boolean;
}

// =============================================================================
// Element Properties Editor
// =============================================================================

interface ElementPropertiesProps {
  element: LDElementType;
  onChange: (updated: LDElementType) => void;
  onClose: () => void;
}

function ElementProperties({ element, onChange, onClose }: ElementPropertiesProps) {
  const [variable, setVariable] = useState(element.variable || '');
  const [fbInstance, setFbInstance] = useState(element.instance || '');
  const [comment, setComment] = useState(element.comment || '');

  const handleSave = () => {
    onChange({
      ...element,
      variable: variable || undefined,
      instance: fbInstance || undefined,
      comment: comment.trim() || undefined,
    });
    onClose();
  };

  const isFB = element.type === 'function_block';

  return (
    <div className="absolute top-0 right-0 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-200">Element Properties</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 text-lg"
        >
          ×
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <div className="text-sm text-slate-200 font-mono bg-slate-700 px-2 py-1 rounded">
            {isFB ? element.fbType : element.type}
          </div>
        </div>

        {!isFB && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Variable</label>
            <input
              type="text"
              value={variable}
              onChange={(e) => setVariable(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200
                         focus:outline-none focus:border-blue-500"
              placeholder="Variable name"
            />
          </div>
        )}

        {isFB && (
          <>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Instance Name</label>
              <input
                type="text"
                value={fbInstance}
                onChange={(e) => setFbInstance(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200
                           focus:outline-none focus:border-blue-500"
                placeholder="Instance name"
              />
            </div>

            {element.fbType === 'TON' || element.fbType === 'TOF' || element.fbType === 'TP' ? (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Preset Time (PT)</label>
                <input
                  type="text"
                  defaultValue={element.parameters?.PT || 'T#1s'}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200
                             focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="T#1s"
                />
              </div>
            ) : null}
          </>
        )}

        {/* Comment field - available for all element types */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Comment</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200
                       focus:outline-none focus:border-blue-500 resize-none"
            placeholder="Optional description..."
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm py-1.5 rounded
                       transition-colors"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm py-1.5 rounded
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

export default function LDEditor({ model, onChange, readOnly = false }: LDEditorProps) {
  const [selectedElement, setSelectedElement] = useState<LDElementType | null>(null);
  const [selectedRungId, setSelectedRungId] = useState<string | null>(null);

  // Get debug mode from store
  const debugMode = useIDEStore((state) => state.debug.mode);

  // Ensure all rungs are grid-based
  const normalizedModel: LDModel = {
    ...model,
    rungs: model.rungs.map(rung =>
      isGridBasedRung(rung) ? rung : convertToGridRung(rung)
    ),
  };

  // Extract all variable names from the model for debug value lookup
  // This includes FB port paths for rich value display
  const allVariables = useMemo(() => {
    const vars: string[] = [];
    for (const rung of normalizedModel.rungs) {
      if (!rung.grid) continue;
      for (const row of rung.grid) {
        for (const cell of row) {
          const el = cell.element;
          if (!el) continue;
          // Contacts and coils use variable
          if (el.variable) {
            vars.push(el.variable);
          }
          // Function blocks: get ALL output ports for display
          if (el.instance && el.fbType) {
            // Add common output ports based on FB type
            switch (el.fbType) {
              case 'TON':
              case 'TOF':
              case 'TP':
                vars.push(`${el.instance}.Q`);
                vars.push(`${el.instance}.ET`);
                break;
              case 'CTU':
              case 'CTD':
                vars.push(`${el.instance}.Q`);
                vars.push(`${el.instance}.CV`);
                break;
              case 'CTUD':
                vars.push(`${el.instance}.QU`);
                vars.push(`${el.instance}.QD`);
                vars.push(`${el.instance}.CV`);
                break;
              case 'R_TRIG':
              case 'F_TRIG':
                vars.push(`${el.instance}.Q`);
                break;
              default:
                vars.push(`${el.instance}.Q`);
            }
          }
        }
      }
    }
    return vars;
  }, [normalizedModel.rungs]);

  // Get live values for all variables (only when debugging)
  const debugValues = useDebugValues(debugMode !== 'none' ? allVariables : []);

  // Build energized map: varName -> boolean
  const energizedVariables = useMemo(() => {
    const map = new Map<string, boolean>();
    if (debugMode === 'none') return map;

    for (const varPath of allVariables) {
      const result = debugValues.get(varPath);
      if (result?.exists && result.value !== null) {
        // For BOOL: direct value
        // For other types: non-zero = true
        const isEnergized = result.type === 'BOOL'
          ? !!result.value
          : Number(result.value) !== 0;
        map.set(varPath, isEnergized);
      }
    }
    return map;
  }, [debugMode, allVariables, debugValues]);

  // Add a new rung
  const handleAddRung = useCallback(() => {
    if (readOnly || !onChange) return;

    const newRungNumber = normalizedModel.rungs.length + 1;
    const newRung = createEmptyRung(newRungNumber);

    onChange({
      ...normalizedModel,
      rungs: [...normalizedModel.rungs, newRung],
    });
  }, [normalizedModel, onChange, readOnly]);

  // Delete a rung
  const handleDeleteRung = useCallback((rungId: string) => {
    if (readOnly || !onChange) return;

    // Renumber remaining rungs
    const filtered = normalizedModel.rungs.filter(r => r.id !== rungId);
    const renumbered = filtered.map((r, idx) => ({ ...r, number: idx + 1 }));

    onChange({
      ...normalizedModel,
      rungs: renumbered,
    });

    setSelectedElement(null);
    setSelectedRungId(null);
  }, [normalizedModel, onChange, readOnly]);

  // Update a rung
  const handleRungChange = useCallback((rungId: string, updatedRung: LDRung) => {
    if (readOnly || !onChange) return;

    onChange({
      ...normalizedModel,
      rungs: normalizedModel.rungs.map(r => r.id === rungId ? updatedRung : r),
    });
  }, [normalizedModel, onChange, readOnly]);

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

    onChange({
      ...normalizedModel,
      rungs: renumbered,
    });
  }, [normalizedModel, onChange, readOnly]);

  // Move rung down
  const handleMoveRungDown = useCallback((rungId: string) => {
    if (readOnly || !onChange) return;

    const idx = normalizedModel.rungs.findIndex(r => r.id === rungId);
    if (idx < 0 || idx >= normalizedModel.rungs.length - 1) return;

    const newRungs = [...normalizedModel.rungs];
    [newRungs[idx], newRungs[idx + 1]] = [newRungs[idx + 1], newRungs[idx]];

    // Renumber
    const renumbered = newRungs.map((r, i) => ({ ...r, number: i + 1 }));

    onChange({
      ...normalizedModel,
      rungs: renumbered,
    });
  }, [normalizedModel, onChange, readOnly]);

  // Handle element deletion
  const handleElementDelete = useCallback((rungId: string, element: LDElementType) => {
    if (readOnly || !onChange) return;
    
    const rung = normalizedModel.rungs.find(r => r.id === rungId);
    if (!rung || element.row === undefined || element.col === undefined) return;
    
    const updatedRung = removeElementAt(rung, element.row, element.col);
    handleRungChange(rungId, updatedRung);
    setSelectedElement(null);
  }, [normalizedModel, handleRungChange, readOnly, onChange]);

  // Handle element selection
  const handleElementSelect = useCallback((element: LDElementType | null, rungId: string) => {
    setSelectedElement(element);
    setSelectedRungId(rungId);
  }, []);

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

    handleRungChange(selectedRungId, { ...rung, grid: newGrid });
    setSelectedElement(updated);
  }, [normalizedModel, selectedRungId, handleRungChange, onChange]);

  // Handle element deletion (via keyboard)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedElement && selectedRungId && !readOnly && onChange) {
        const rung = normalizedModel.rungs.find(r => r.id === selectedRungId);
        if (rung && selectedElement.row !== undefined && selectedElement.col !== undefined) {
          const updatedRung = removeElementAt(rung, selectedElement.row, selectedElement.col);
          handleRungChange(selectedRungId, updatedRung);
          setSelectedElement(null);
        }
      }
    }
    if (e.key === 'Escape') {
      setSelectedElement(null);
      setSelectedRungId(null);
    }
  }, [selectedElement, selectedRungId, normalizedModel, handleRungChange, readOnly, onChange]);

  return (
    <div
      className="w-full h-full flex bg-slate-900 overflow-hidden"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Toolbox sidebar */}
      {!readOnly && <LDToolbox />}

      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-600">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-200">
              {normalizedModel.name}
            </span>
            <span className="text-xs text-slate-400">
              {normalizedModel.rungs.length} rung{normalizedModel.rungs.length !== 1 ? 's' : ''}
            </span>
          </div>

          {!readOnly && (
            <button
              onClick={handleAddRung}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-200 
                         bg-slate-700 hover:bg-slate-600 rounded border border-slate-600
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
                <p className="text-slate-400 text-sm">No rungs defined</p>
                {!readOnly && (
                  <button
                    onClick={handleAddRung}
                    className="mt-2 text-blue-400 hover:text-blue-300 text-sm underline"
                  >
                    Add your first rung
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {normalizedModel.rungs.map((rung, idx) => (
                <div key={rung.id} className="relative group">
                  <LDRungGrid
                    rung={rung}
                    onChange={(updated) => handleRungChange(rung.id, updated)}
                    onElementSelect={(el) => handleElementSelect(el, rung.id)}
                    onElementDelete={(el) => handleElementDelete(rung.id, el)}
                    selectedElementId={selectedRungId === rung.id ? selectedElement?.id : null}
                    readOnly={readOnly}
                    energizedVariables={debugMode !== 'none' ? energizedVariables : undefined}
                    debugValues={debugMode !== 'none' ? debugValues : undefined}
                  />

                  {/* Rung controls */}
                  {!readOnly && (
                    <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Add row button */}
                      <button
                        onClick={() => handleAddRow(rung.id)}
                        className="p-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
                        title="Add parallel branch"
                      >
                        <Rows3 size={12} />
                      </button>

                      {/* Move up */}
                      {idx > 0 && (
                        <button
                          onClick={() => handleMoveRungUp(rung.id)}
                          className="p-1 rounded bg-slate-600 hover:bg-slate-500 text-white"
                          title="Move rung up"
                        >
                          <ChevronUp size={12} />
                        </button>
                      )}

                      {/* Move down */}
                      {idx < normalizedModel.rungs.length - 1 && (
                        <button
                          onClick={() => handleMoveRungDown(rung.id)}
                          className="p-1 rounded bg-slate-600 hover:bg-slate-500 text-white"
                          title="Move rung down"
                        >
                          <ChevronDown size={12} />
                        </button>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteRung(rung.id)}
                        className="p-1 rounded bg-red-600 hover:bg-red-500 text-white"
                        title="Delete rung"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-4 py-2 bg-slate-800 border-t border-slate-600">
          <div className="flex items-center gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="font-mono text-green-400">| |</span> NO Contact
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-red-400">|/|</span> NC Contact
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-blue-400">( )</span> Coil
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-cyan-400">(S)</span> Set
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-orange-400">(R)</span> Reset
            </span>
            <span className="flex items-center gap-1 ml-auto text-slate-500">
              Drag elements from toolbox • Click to select • Delete to remove
            </span>
          </div>
        </div>

        {/* Element properties panel */}
        {selectedElement && !readOnly && (
          <ElementProperties
            element={selectedElement}
            onChange={handleElementUpdate}
            onClose={() => setSelectedElement(null)}
          />
        )}
      </div>
    </div>
  );
}
