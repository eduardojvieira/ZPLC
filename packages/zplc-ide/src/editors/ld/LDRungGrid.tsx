/**
 * LDRungGrid - SVG Grid for Ladder Rung Visualization
 *
 * Renders a single ladder rung as an SVG grid with:
 * - Left and right power rails
 * - Grid cells for element placement
 * - Horizontal wires connecting elements
 * - Vertical links for parallel branches (OR logic)
 * - Drop zones for drag-and-drop
 */

import { useMemo, useCallback, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  type LDRung,
  type LDElement as LDElementType,
  type LDCell,
  isGridBasedRung,
  DEFAULT_GRID_CONFIG,
  convertToGridRung,
  normalizeGridRung,
  removeBranch,
} from '../../models/ld';
import { LDGridBackground } from './LDGridBackground';
import { drawnRungWidth, useAvailableWidth } from './rungWidth';
import LDElement, { CELL_WIDTH, CELL_HEIGHT, WIRE_Y, COLORS, type DebugValuesMap } from './LDElement';
import { cellElement } from '../../models/sourceElements';
import type { ElementState } from '../../monitoring/elementStates';
import { parseLDDropData, DRAG_MIME_TYPE, type LDDropData } from './ldDragData';
import { t } from '../../i18n';
import { Button } from '../../ui';
import { PowerRail, VerticalLink, BranchConnector, DropZone, RungHeader, RAIL_WIDTH, PADDING, STROKE_WIDTH } from './LDRungParts';

// =============================================================================
// Constants
// =============================================================================

const EMPTY_GRID: LDCell[][] = [];

// =============================================================================
// Props
// =============================================================================

interface LDRungGridProps {
  rung: LDRung;
  onChange?: (rung: LDRung) => void;
  onElementSelect?: (element: LDElementType | null) => void;
  onElementDelete?: (element: LDElementType) => void;
  selectedElementId?: string | null;
  readOnly?: boolean;
  /** The state of each element online, by element id: the power that reaches it comes from the debug map (LNG-006). */
  elementStates?: ReadonlyMap<string, ElementState>;
  /** Full debug values map for rich value display on elements */
  debugValues?: DebugValuesMap;
  /** An item of the toolbox was dropped on an empty cell: the editor inserts it, as it does for the keyboard (LNG-012). */
  onInsert?: (item: LDDropData, row: number, col: number) => void;
  /** The cell of the keyboard cursor, when it is in this rung. */
  cursor?: { row: number; col: number } | null;
  /** A cell was clicked: the cursor goes there. */
  onCursor?: (row: number, col: number) => void;
  /** Changes when the editor asks for the comment of the rung to be edited (Shift+F2). */
  commentRequest?: number;
}

// =============================================================================
// Main Component
// =============================================================================

export default function LDRungGrid({
  rung,
  onChange,
  onElementSelect,
  onElementDelete,
  selectedElementId,
  readOnly = false,
  elementStates,
  debugValues,
  onInsert,
  cursor,
  onCursor,
  commentRequest,
}: LDRungGridProps) {
  const [hoverCell, setHoverCell] = useState<{ col: number; row: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);

  // Whether power reaches an element, from the power flow of its rung as the debug map states it (LNG-006): an element
  // whose state was not read is not shown as energized
  const isElementEnergized = useCallback(
    (element: LDElementType | null, row: number, col: number): boolean => {
      if (!element || !elementStates) return false;
      return elementStates.get(cellElement(rung.id, row, col))?.power === true;
    },
    [elementStates, rung.id],
  );

  // Convert legacy rung to grid-based if needed, then normalize
  const gridRung = useMemo(() => {
    let result: LDRung;
    if (isGridBasedRung(rung)) {
      result = rung;
    } else {
      result = convertToGridRung(rung);
    }
    // Always normalize to ensure proper sizing and hasWire flags
    return normalizeGridRung(result);
  }, [rung]);

  // Grid configuration
  const config = gridRung.gridConfig || DEFAULT_GRID_CONFIG;
  const grid = gridRung.grid || EMPTY_GRID;
  const rows = Math.max(1, grid.length);
  const cols = config.cols;

  // Calculate dimensions
  const gridOffsetX = RAIL_WIDTH + PADDING;
  const gridWidth = cols * CELL_WIDTH;
  const totalWidth = RAIL_WIDTH + PADDING + gridWidth + PADDING + RAIL_WIDTH;
  // a rung is as wide as the view when the view is wider than its content (UX-033)
  const [viewRef, availableWidth] = useAvailableWidth();
  const drawnWidth = drawnRungWidth(totalWidth, availableWidth);
  const totalHeight = PADDING + rows * CELL_HEIGHT + PADDING;

  // Check if rung is empty (no elements)
  const isRungEmpty = grid.every((row) => row.every((cell) => cell.element === null));

  // Find selected element position for delete button overlay
  const selectedElementPosition = (() => {
    if (!selectedElementId) return null;
    for (let rowIdx = 0; rowIdx < grid.length; rowIdx++) {
      for (let colIdx = 0; colIdx < grid[rowIdx].length; colIdx++) {
        const cell = grid[rowIdx][colIdx];
        if (cell.element?.id === selectedElementId) {
          return {
            element: cell.element,
            x: gridOffsetX + colIdx * CELL_WIDTH + CELL_WIDTH - 12,
            y: PADDING + rowIdx * CELL_HEIGHT + 4,
          };
        }
      }
    }
    return null;
  })();

  // Handle drag over
  const handleDragOver = useCallback((col: number, row: number) => {
    setHoverCell({ col, row });
  }, []);

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    setHoverCell(null);
  }, []);

  // Handle native drag/drop at the container level
  const handleContainerDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setDraggedElementId(null);
      if (readOnly || !onChange || !hoverCell) return;

      const { col, row } = hoverCell;

      // Handle BRANCH RESIZE
      const resizeData = e.dataTransfer.getData('application/zplc-ld-branch-resize');
      if (resizeData) {
        try {
          const { branchId } = JSON.parse(resizeData);
          const branchToResize = gridRung.branches?.find((b) => b.id === branchId);
          if (branchToResize) {
            // New end column is where we dropped
            let newEndCol = col;
            // Ensure it ends AFTER startCol
            if (newEndCol <= branchToResize.startCol) {
              newEndCol = branchToResize.startCol + 1;
            }
            // Ensure we don't shrink past elements inside (simplistic check)
            // Ideally we check if excluding columns would hide elements

            const updatedBranches = gridRung.branches?.map((b) => {
              if (b.id === branchId) {
                return { ...b, endCol: newEndCol };
              }
              return b;
            });

            onChange({ ...gridRung, branches: updatedBranches });
            setHoverCell(null);
            return;
          }
        } catch (err) {
          console.error('Failed to parse branch resize data', err);
        }
      }

      const dropData = parseLDDropData(e.dataTransfer);
      if (!dropData) return;

      // A new element and a new branch are inserted by the editor, as they are from the keyboard
      if (!(dropData.isMove && dropData.fromRow !== undefined && dropData.fromCol !== undefined)) {
        onInsert?.(dropData, row, col);
        setHoverCell(null);
        return;
      }

      // Check if cell is occupied (can't drop on occupied cell)
      if (grid[row]?.[col]?.element) {
        console.warn('Cell is occupied');
        setHoverCell(null);
        return;
      }

      // MOVE existing element
      const newGrid = grid.map((r) => [...r]);
      while (newGrid.length <= row) {
        newGrid.push(
          Array(cols)
            .fill(null)
            .map(() => ({ element: null, hasWire: false })),
        );
      }
      const sourceElement = grid[dropData.fromRow]?.[dropData.fromCol]?.element;
      if (!sourceElement) {
        console.warn('Source element not found');
        setHoverCell(null);
        return;
      }
      // Clear source cell but keep wire for continuity
      newGrid[dropData.fromRow]![dropData.fromCol] = { element: null, hasWire: true };
      newGrid[row]![col] = { element: { ...sourceElement, row, col }, hasWire: true };
      onChange({ ...gridRung, grid: newGrid });
      setHoverCell(null);
    },
    [readOnly, onChange, onInsert, hoverCell, grid, cols, gridRung],
  );

  const handleContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      // Check if it's our LD element type
      if (e.dataTransfer.types.includes(DRAG_MIME_TYPE)) {
        e.preventDefault();
        // If we're dragging an existing element, it's a move; otherwise copy
        e.dataTransfer.dropEffect = draggedElementId ? 'move' : 'copy';
        setIsDragging(true);
      }
    },
    [draggedElementId],
  );

  const handleContainerDragLeave = useCallback((e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
      setDraggedElementId(null);
      setHoverCell(null);
    }
  }, []);

  // Handle branch deletion
  const handleBranchDelete = useCallback(
    (branchId: string) => {
      if (readOnly || !onChange) return;
      const updatedRung = removeBranch(gridRung, branchId);
      onChange(updatedRung);
    },
    [readOnly, onChange, gridRung],
  );

  // Handle branch resizing (via drag)
  // Logic moved to handleContainerDrop to support visual drag-drop interaction
  // kept here if needed for direct callbacks later

  // Handle element click
  const handleElementClick = useCallback(
    (element: LDElementType) => {
      if (onElementSelect) {
        onElementSelect(element);
      }
    },
    [onElementSelect],
  );

  // Handle element drag start (for moving existing elements)
  const handleElementDragStart = useCallback((element: LDElementType) => {
    setDraggedElementId(element.id);
    setIsDragging(true);
  }, []);

  // Draw horizontal wires for empty cells
  // Elements draw their own internal wires (left edge to right edge),
  // so we only need to draw wires for empty cells that should have connections.
  //
  // Strategy:
  // - Row 0 (main row): Draw continuous wire for all empty cells
  // - Branch rows: Only draw wires where hasWire=true (within branch region)
  const renderWires = () => {
    const wires: React.ReactNode[] = [];

    grid.forEach((row, rowIdx) => {
      const isMainRow = rowIdx === 0;

      row.forEach((cell, colIdx) => {
        const isEmpty = cell.element === null;

        // Determine if this empty cell should have a wire
        let shouldHaveWire = false;
        if (isEmpty) {
          if (isMainRow) {
            // Main row: always has wire for continuity
            shouldHaveWire = true;
          } else {
            // Branch rows: only where hasWire flag is set
            shouldHaveWire = cell.hasWire === true;
          }
        }

        if (shouldHaveWire) {
          const x1 = gridOffsetX + colIdx * CELL_WIDTH;
          const x2 = gridOffsetX + (colIdx + 1) * CELL_WIDTH;
          const y = PADDING + rowIdx * CELL_HEIGHT + WIRE_Y;

          wires.push(
            <line key={`wire-${rowIdx}-${colIdx}`} x1={x1} y1={y} x2={x2} y2={y} stroke={COLORS.wire} strokeWidth={STROKE_WIDTH} />,
          );
        }
      });
    });

    return wires;
  };

  return (
    <div
      className="bg-[var(--color-surface-800)] rounded-lg border border-[var(--color-surface-600)] overflow-hidden"
      onDrop={handleContainerDrop}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
    >
      {/* Rung header */}
      <RungHeader rung={rung} cols={cols} rows={rows} readOnly={readOnly} onChange={onChange} editRequest={commentRequest} />

      {/* SVG Canvas with delete button overlay */}
      <div ref={viewRef} className="overflow-x-auto relative">
        <svg width={drawnWidth} height={totalHeight} className="block" style={{ minWidth: totalWidth }}>
          {/* Background grid (subtle) */}
          <LDGridBackground
            rungId={rung.id}
            x={gridOffsetX}
            y={PADDING}
            cellWidth={CELL_WIDTH}
            cellHeight={CELL_HEIGHT}
            width={gridWidth}
            height={rows * CELL_HEIGHT}
          />

          {/* Left power rail */}
          <PowerRail side="left" x={RAIL_WIDTH / 2} height={totalHeight} rows={rows} />

          {/* Right power rail */}
          <PowerRail side="right" x={drawnWidth - RAIL_WIDTH / 2} height={totalHeight} rows={rows} />

          {/* Horizontal wires connecting to rails */}
          {Array.from({ length: rows }, (_, rowIdx) => {
            const y = PADDING + rowIdx * CELL_HEIGHT + WIRE_Y;
            // Only main row (0) connects directly to power rails
            // Other rows connect via branches
            const isMainRow = rowIdx === 0;

            if (!isMainRow) {
              // Branch rows don't connect directly to power rails
              return null;
            }

            return (
              <g key={`rail-wires-${rowIdx}`}>
                {/* Left rail to first cell */}
                <line x1={RAIL_WIDTH / 2 + 10} y1={y} x2={gridOffsetX} y2={y} stroke={COLORS.wire} strokeWidth={STROKE_WIDTH} />
                {/* Last cell to right rail */}
                <line
                  x1={gridOffsetX + gridWidth}
                  y1={y}
                  x2={drawnWidth - RAIL_WIDTH / 2 - 10}
                  y2={y}
                  stroke={COLORS.wire}
                  strokeWidth={STROKE_WIDTH}
                />
              </g>
            );
          })}

          {/* Horizontal wires between elements */}
          {renderWires()}

          {/* Branch connectors (parallel paths with solid lines) */}
          {gridRung.branches?.map((branch) => (
            <BranchConnector
              key={`branch-${branch.id}`}
              branch={branch}
              gridOffsetX={gridOffsetX}
              readOnly={readOnly}
              onDelete={handleBranchDelete}
            />
          ))}

          {/* Legacy vertical links (for backward compatibility) */}
          {!gridRung.branches?.length &&
            gridRung.verticalLinks?.map((link, idx) => (
              <VerticalLink
                key={`vlink-${idx}`}
                col={link.col}
                fromRow={link.fromRow}
                toRow={link.toRow}
                gridOffsetX={gridOffsetX}
                position="start"
              />
            ))}

          {/* Empty rung placeholder - drag hint */}
          {!readOnly && isRungEmpty && (
            <text
              x={gridOffsetX + gridWidth / 2}
              y={PADDING + CELL_HEIGHT / 2}
              fill="var(--color-surface-400)"
              fontSize={12}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ pointerEvents: 'none' }}
            >
              {isDragging ? t('editors.ld.dropHere') : t('editors.ld.dragHint')}
            </text>
          )}

          {/* Drop zones (below elements, for drag-drop on empty cells) */}
          {!readOnly &&
            grid.map((row, rowIdx) =>
              row.map((cell, colIdx) => (
                <DropZone
                  key={`drop-${rowIdx}-${colIdx}`}
                  col={colIdx}
                  row={rowIdx}
                  gridOffsetX={gridOffsetX}
                  isOver={hoverCell?.col === colIdx && hoverCell?.row === rowIdx}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  hasElement={cell.element !== null}
                  isDragging={isDragging}
                  onPick={(pickedCol, pickedRow) => onCursor?.(pickedRow, pickedCol)}
                />
              )),
            )}

          {/* Elements (above drop zones to receive clicks) */}
          <g transform={`translate(${gridOffsetX}, ${PADDING})`}>
            {grid.map((row, rowIdx) =>
              row.map((cell, colIdx) =>
                cell.element ? (
                  <g
                    key={cell.element.id}
                    data-ld-cell={`${rowIdx},${colIdx}`}
                    data-powered={elementStates ? isElementEnergized(cell.element, rowIdx, colIdx) : undefined}
                    style={{
                      opacity: draggedElementId === cell.element.id ? 0.4 : 1,
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    <LDElement
                      element={cell.element}
                      x={colIdx}
                      y={rowIdx}
                      selected={cell.element.id === selectedElementId}
                      energized={isElementEnergized(cell.element, rowIdx, colIdx)}
                      debugValues={debugValues}
                      onClick={readOnly ? undefined : () => handleElementClick(cell.element!)}
                      draggable={!readOnly}
                      onDragStart={handleElementDragStart}
                    />
                  </g>
                ) : null,
              ),
            )}
          </g>

          {/* The cursor of the keyboard editing (LNG-012) */}
          {cursor && cursor.row < rows && cursor.col < cols && (
            <rect
              data-ld-cursor={`${cursor.row},${cursor.col}`}
              x={gridOffsetX + cursor.col * CELL_WIDTH + 1}
              y={PADDING + cursor.row * CELL_HEIGHT + 1}
              width={CELL_WIDTH - 2}
              height={CELL_HEIGHT - 2}
              rx={4}
              fill="none"
              stroke="var(--color-accent-blue)"
              strokeWidth={2}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>

        {/* Delete button overlay for selected element */}
        {!readOnly && selectedElementPosition && onElementDelete && (
          <Button
            variant="bare"
            aria-label={t('editors.ld.deleteElement')}
            tooltip={t('editors.ld.deleteElement')}
            onClick={(e) => {
              e.stopPropagation();
              onElementDelete(selectedElementPosition.element);
            }}
            className="absolute w-6 h-6 flex items-center justify-center 
                         bg-[var(--color-accent-red)] hover:opacity-90 text-[var(--color-on-accent)] rounded-full 
                         transition-colors z-10"
            style={{
              left: selectedElementPosition.x,
              top: selectedElementPosition.y + 28, // +28 for header height
            }}
          >
            <Trash2 size={12} />
          </Button>
        )}
      </div>
    </div>
  );
}
