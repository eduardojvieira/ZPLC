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

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import {
  type LDRung,
  type LDElement as LDElementType,
  type LDCell,
  isGridBasedRung,
  DEFAULT_GRID_CONFIG,
  convertToGridRung,
  normalizeGridRung,
  createBranch,
  createNestedBranch,
  removeBranch,
  getBranchesAtCell,
  type LDBranch,
} from '../../models/ld';
import LDElement, { CELL_WIDTH, CELL_HEIGHT, WIRE_Y, COLORS, type DebugValuesMap } from './LDElement';
import { parseLDDropData, DRAG_MIME_TYPE } from './LDToolbox';

// =============================================================================
// Constants
// =============================================================================

const RAIL_WIDTH = 20;
const PADDING = 10;
const STROKE_WIDTH = 2;

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
  /** Map of variable names to their energized (TRUE) state for power flow visualization */
  energizedVariables?: Map<string, boolean>;
  /** Full debug values map for rich value display on elements */
  debugValues?: DebugValuesMap;
}

// =============================================================================
// Power Rail Component
// =============================================================================

interface PowerRailProps {
  side: 'left' | 'right';
  x: number;
  height: number;
  rows: number;
}

function PowerRail({ side, x, height, rows }: PowerRailProps) {
  // Calculate wire connection points for each row
  const wireConnections = Array.from({ length: rows }, (_, i) =>
    PADDING + i * CELL_HEIGHT + WIRE_Y
  );

  return (
    <g>
      {/* Main vertical rail */}
      <line
        x1={x}
        y1={PADDING}
        x2={x}
        y2={height - PADDING}
        stroke={COLORS.fb}
        strokeWidth={4}
      />

      {/* Connection stubs to each row */}
      {wireConnections.map((wy, i) => (
        <line
          key={i}
          x1={x}
          y1={wy}
          x2={side === 'left' ? x + 10 : x - 10}
          y2={wy}
          stroke={COLORS.wire}
          strokeWidth={STROKE_WIDTH}
        />
      ))}
    </g>
  );
}

// =============================================================================
// Vertical Link Component (OR branch) - SOLID LINES
// =============================================================================

interface VerticalLinkProps {
  col: number;
  fromRow: number;
  toRow: number;
  gridOffsetX: number;
  position: 'start' | 'end' | 'middle';  // Where in the cell the vertical line is
}

function VerticalLink({ col, fromRow, toRow, gridOffsetX, position }: VerticalLinkProps) {
  // Position within cell: start = left edge, end = right edge, middle = center
  let xOffset: number;
  switch (position) {
    case 'start':
      xOffset = 0;
      break;
    case 'end':
      xOffset = CELL_WIDTH;
      break;
    default:
      xOffset = CELL_WIDTH / 2;
  }

  const x = gridOffsetX + col * CELL_WIDTH + xOffset;
  const y1 = PADDING + fromRow * CELL_HEIGHT + WIRE_Y;
  const y2 = PADDING + toRow * CELL_HEIGHT + WIRE_Y;

  return (
    <line
      x1={x}
      y1={y1}
      x2={x}
      y2={y2}
      stroke={COLORS.wire}
      strokeWidth={STROKE_WIDTH}
    />
  );
}

// =============================================================================
// Branch Connector Component - Renders branch split/join points
// =============================================================================

interface BranchConnectorProps {
  branch: LDBranch;
  gridOffsetX: number;
  readOnly?: boolean;
  onDelete?: (branchId: string) => void;
}

function BranchConnector({ branch, gridOffsetX, readOnly, onDelete }: BranchConnectorProps) {
  const sortedRows = [...branch.rows].sort((a, b) => a - b);
  const minRow = sortedRows[0];
  const maxRow = sortedRows[sortedRows.length - 1];

  // State for interactions
  const [isHovered, setIsHovered] = useState(false);

  // Start column vertical line (left side of cells at startCol)
  const startX = gridOffsetX + branch.startCol * CELL_WIDTH;
  const startY1 = PADDING + minRow * CELL_HEIGHT + WIRE_Y;
  const startY2 = PADDING + maxRow * CELL_HEIGHT + WIRE_Y;

  // End column vertical line (right side of cells at endCol)
  const endX = gridOffsetX + (branch.endCol + 1) * CELL_WIDTH;
  const endY1 = startY1;
  const endY2 = startY2;

  // Resize handler
  const handleResizeStart = (e: React.DragEvent) => {
    // Only allow resizing right edge
    e.dataTransfer.setData('application/zplc-ld-branch-resize', JSON.stringify({ branchId: branch.id }));
    e.dataTransfer.effectAllowed = 'move';
  };

  // Horizontal stubs connecting to each row in the branch
  const stubs: React.ReactNode[] = [];

  for (const row of sortedRows) {
    const y = PADDING + row * CELL_HEIGHT + WIRE_Y;

    // Start stub (connects vertical line to cell start)
    if (row > minRow) {
      stubs.push(
        <line
          key={`start-stub-${row}`}
          x1={startX}
          y1={y}
          x2={startX + 8}  // Small horizontal connection
          y2={y}
          stroke={isHovered ? COLORS.selected : COLORS.wire}
          strokeWidth={STROKE_WIDTH}
        />
      );
    }

    // End stub
    if (row > minRow) {
      stubs.push(
        <line
          key={`end-stub-${row}`}
          x1={endX - 8}
          y1={y}
          x2={endX}
          y2={y}
          stroke={isHovered ? COLORS.selected : COLORS.wire}
          strokeWidth={STROKE_WIDTH}
        />
      );
    }
  }

  return (
    <g
      className="branch-connector"
      onMouseEnter={() => !readOnly && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left vertical rail */}
      <line
        x1={startX}
        y1={startY1}
        x2={startX}
        y2={startY2}
        stroke={isHovered ? COLORS.selected : COLORS.wire}
        strokeWidth={STROKE_WIDTH}
      />

      {/* Right vertical rail */}
      <line
        x1={endX}
        y1={endY1}
        x2={endX}
        y2={endY2}
        stroke={isHovered ? COLORS.selected : COLORS.wire}
        strokeWidth={STROKE_WIDTH}
      />

      {/* Connection stubs */}
      {stubs}

      {/* Interactive Elements */}
      {!readOnly && isHovered && (
        <>
          {/* Resize Handle (Right Drag) */}
          <rect
            x={endX - 4}
            y={(endY1 + endY2) / 2 - 10}
            width={8}
            height={20}
            fill={COLORS.selected}
            cursor="ew-resize"
            // @ts-ignore - draggable is valid on SVG elements in modern browsers/React
            draggable={true}
            onDragStart={handleResizeStart}
            rx={2}
          />

          {/* Delete Button */}
          {onDelete && (
            <g
              transform={`translate(${endX + 4}, ${endY1 - 8})`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(branch.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle r={8} fill="#EF4444" />
              <line x1={-3} y1={-3} x2={3} y2={3} stroke="white" strokeWidth={1.5} />
              <line x1={3} y1={-3} x2={-3} y2={3} stroke="white" strokeWidth={1.5} />
            </g>
          )}
        </>
      )}
    </g>
  );
}

// =============================================================================
// Drop Zone Overlay Component
// =============================================================================

interface DropZoneProps {
  col: number;
  row: number;
  gridOffsetX: number;
  isOver: boolean;
  onDrop: (col: number, row: number) => void;
  onDragOver: (col: number, row: number) => void;
  onDragLeave: () => void;
  hasElement: boolean;
  isDragging: boolean;  // New: track if any drag is happening
}

function DropZone({
  col,
  row,
  gridOffsetX,
  isOver,
  onDrop,
  onDragOver,
  onDragLeave,
  hasElement,
  isDragging,
}: DropZoneProps) {
  const x = gridOffsetX + col * CELL_WIDTH;
  const y = PADDING + row * CELL_HEIGHT;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    onDragOver(col, row);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDrop(col, row);
  };

  // Visual states: default, dragging (highlight available), hover (strong highlight)
  let fillColor = 'transparent';
  let strokeColor = 'transparent';

  if (!hasElement) {
    if (isOver) {
      // Hovering over this cell
      fillColor = 'rgba(59, 130, 246, 0.3)';
      strokeColor = 'rgba(59, 130, 246, 0.8)';
    } else if (isDragging) {
      // Dragging but not over this cell - subtle hint
      fillColor = 'rgba(59, 130, 246, 0.08)';
      strokeColor = 'rgba(59, 130, 246, 0.3)';
    }
  }

  return (
    <rect
      x={x}
      y={y}
      width={CELL_WIDTH}
      height={CELL_HEIGHT}
      fill={fillColor}
      stroke={strokeColor}
      strokeWidth={isOver ? 2 : 1}
      strokeDasharray={isOver ? 'none' : '4,2'}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={onDragLeave}
      style={{
        cursor: hasElement ? 'default' : 'crosshair',
        pointerEvents: hasElement ? 'none' : 'auto',
      }}
    />
  );
}

// =============================================================================
// Rung Header Component (with editable comment)
// =============================================================================

interface RungHeaderProps {
  rung: LDRung;
  cols: number;
  rows: number;
  readOnly?: boolean;
  onChange?: (rung: LDRung) => void;
}

function RungHeader({ rung, cols, rows, readOnly, onChange }: RungHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [commentDraft, setCommentDraft] = useState(rung.comment || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Sync draft when rung.comment changes externally
  useEffect(() => {
    if (!isEditing) {
      setCommentDraft(rung.comment || '');
    }
  }, [rung.comment, isEditing]);

  const handleStartEdit = () => {
    if (readOnly) return;
    setIsEditing(true);
  };

  const handleSave = () => {
    if (onChange) {
      const trimmed = commentDraft.trim();
      onChange({
        ...rung,
        comment: trimmed || undefined,
      });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setCommentDraft(rung.comment || '');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)]">
      <span className="text-xs font-bold text-[var(--color-surface-100)] shrink-0">
        Rung {rung.number}
      </span>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 text-xs italic bg-[var(--color-surface-800)] border border-[var(--color-surface-500)] 
                     rounded px-2 py-0.5 text-[var(--color-surface-100)] focus:outline-none focus:border-blue-500"
          placeholder="Add rung comment..."
        />
      ) : (
        <span
          onClick={handleStartEdit}
          className={`flex-1 min-w-0 text-xs italic truncate ${readOnly ? '' : 'cursor-pointer hover:bg-[var(--color-surface-600)] rounded px-1 -mx-1'
            } ${rung.comment ? 'text-[var(--color-surface-200)]' : 'text-[var(--color-surface-400)]'}`}
          title={readOnly ? rung.comment : 'Click to edit comment'}
        >
          {rung.comment ? `— ${rung.comment}` : (readOnly ? '' : '(click to add comment)')}
        </span>
      )}

      <span className="text-[10px] text-[var(--color-surface-300)] shrink-0">
        {cols}×{rows}
      </span>
    </div>
  );
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
  energizedVariables,
  debugValues,
}: LDRungGridProps) {
  const [hoverCell, setHoverCell] = useState<{ col: number; row: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);

  // Helper function to check if an element is energized based on its variable value
  const isElementEnergized = useCallback((element: LDElementType | null): boolean => {
    if (!element || !energizedVariables) return false;

    // For contacts: use the variable value directly
    // NO contact: energized when variable is TRUE
    // NC contact: energized when variable is FALSE
    if (element.variable) {
      const value = energizedVariables.get(element.variable);
      if (value === undefined) return false;

      if (element.type === 'contact_nc') {
        return !value; // NC is energized when variable is FALSE
      }
      return !!value; // NO and others are energized when TRUE
    }

    // For function blocks: check the instance Q output
    if (element.instance) {
      const qValue = energizedVariables.get(`${element.instance}.Q`);
      return !!qValue;
    }

    return false;
  }, [energizedVariables]);

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
  const grid = gridRung.grid || [];
  const rows = Math.max(1, grid.length);
  const cols = config.cols;

  // Calculate dimensions
  const gridOffsetX = RAIL_WIDTH + PADDING;
  const gridWidth = cols * CELL_WIDTH;
  const totalWidth = RAIL_WIDTH + PADDING + gridWidth + PADDING + RAIL_WIDTH;
  const totalHeight = PADDING + rows * CELL_HEIGHT + PADDING;

  // Check if rung is empty (no elements)
  const isRungEmpty = useMemo(() => {
    return grid.every(row => row.every(cell => cell.element === null));
  }, [grid]);

  // Find selected element position for delete button overlay
  const selectedElementPosition = useMemo(() => {
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
  }, [selectedElementId, grid, gridOffsetX]);

  // Handle element drop
  const handleDrop = useCallback((_col: number, _row: number) => {
    if (readOnly || !onChange) return;

    // Get the dropped element data from the event
    // This is handled via the native drag event, so we use a workaround
    setHoverCell(null);
  }, [readOnly, onChange]);

  // Handle drag over
  const handleDragOver = useCallback((col: number, row: number) => {
    setHoverCell({ col, row });
  }, []);

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    setHoverCell(null);
  }, []);

  // Handle native drag/drop at the container level
  const handleContainerDrop = useCallback((e: React.DragEvent) => {
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
        const branchToResize = gridRung.branches?.find(b => b.id === branchId);
        if (branchToResize) {
          // New end column is where we dropped
          let newEndCol = col;
          // Ensure it ends AFTER startCol
          if (newEndCol <= branchToResize.startCol) {
            newEndCol = branchToResize.startCol + 1;
          }
          // Ensure we don't shrink past elements inside (simplistic check)
          // Ideally we check if excluding columns would hide elements

          const updatedBranches = gridRung.branches?.map(b => {
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

    const dropData = parseLDDropData(e);
    if (!dropData) return;
    if (resizeData) {
      try {
        const { branchId } = JSON.parse(resizeData);
        const branchToResize = gridRung.branches?.find(b => b.id === branchId);
        if (branchToResize) {
          // New end column is where we dropped
          let newEndCol = col;
          // Ensure it ends AFTER startCol
          if (newEndCol <= branchToResize.startCol) {
            newEndCol = branchToResize.startCol + 1;
          }
          // Ensure we don't shrink past elements inside (simplistic check)
          // Ideally we check if excluding columns would hide elements

          const updatedBranches = gridRung.branches?.map(b => {
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

    // Check if cell is occupied (can't drop on occupied cell)
    if (grid[row]?.[col]?.element) {
      console.warn('Cell is occupied');
      setHoverCell(null);
      return;
    }

    // Handle BRANCH creation
    if (dropData.type === 'branch' && dropData.category === 'structure') {
      // Check for EXISTING branches at drop location to create NESTED branch
      const existingBranches = getBranchesAtCell(gridRung, row, col);

      // Determine end column
      let endCol = cols - 2;
      for (let c = cols - 1; c > col; c--) {
        if (grid[row]?.[c]?.element) {
          endCol = c - 1;
          break;
        }
      }
      if (endCol <= col) {
        endCol = Math.min(col + 2, cols - 1);
      }

      // If dropping ON an existing branch, nest inside it
      if (existingBranches.length > 0) {
        // Use the deepest branch
        // Sort by how "narrow" they are (closest fit) or just pick last one
        const parentBranch = existingBranches[existingBranches.length - 1];

        // Ensure we fit inside parent
        const safeStart = Math.max(col, parentBranch.startCol);
        const safeEnd = Math.min(endCol, parentBranch.endCol);

        if (safeEnd > safeStart) {
          const updatedRung = createNestedBranch(gridRung, parentBranch.id, safeStart, safeEnd, row);
          onChange(updatedRung);
          setHoverCell(null);
          return;
        }
      }

      // Default: Create new top-level branch
      const updatedRung = createBranch(gridRung, col, endCol, row);
      onChange(updatedRung);
      setHoverCell(null);
      return;
    }

    // Check if cell is occupied (can't drop on occupied cell)
    if (grid[row]?.[col]?.element) {
      console.warn('Cell is occupied');
      setHoverCell(null);
      return;
    }

    // Update grid
    const newGrid = grid.map(r => [...r]);

    // Ensure row exists
    while (newGrid.length <= row) {
      const emptyRow: LDCell[] = Array(cols).fill(null).map(() => ({ element: null, hasWire: false }));
      newGrid.push(emptyRow);
    }

    // Ensure cell exists
    while (newGrid[row].length <= col) {
      newGrid[row].push({ element: null, hasWire: false });
    }

    if (dropData.isMove && dropData.fromRow !== undefined && dropData.fromCol !== undefined) {
      // MOVE existing element
      const sourceElement = grid[dropData.fromRow]?.[dropData.fromCol]?.element;
      if (!sourceElement) {
        console.warn('Source element not found');
        setHoverCell(null);
        return;
      }

      // Clear source cell but keep wire for continuity
      if (newGrid[dropData.fromRow] && newGrid[dropData.fromRow][dropData.fromCol]) {
        newGrid[dropData.fromRow][dropData.fromCol] = { element: null, hasWire: true };
      }

      // Place element in new cell with updated position
      const movedElement: LDElementType = {
        ...sourceElement,
        row,
        col,
      };
      newGrid[row][col] = { element: movedElement, hasWire: true };
    } else {
      // CREATE new element
      const newElement: LDElementType = {
        id: `${dropData.type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: dropData.type as LDElementType['type'],
        row,
        col,
        variable: dropData.category === 'function_block' ? undefined : 'NewVar',
        fbType: dropData.fbType,
        instance: dropData.fbType ? `${dropData.fbType}_${Date.now().toString(36).slice(-4)}` : undefined,
      };
      newGrid[row][col] = { element: newElement, hasWire: true };
    }

    onChange({
      ...gridRung,
      grid: newGrid,
    });

    setHoverCell(null);
  }, [readOnly, onChange, hoverCell, grid, cols, gridRung]);

  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    // Check if it's our LD element type
    if (e.dataTransfer.types.includes(DRAG_MIME_TYPE)) {
      e.preventDefault();
      // If we're dragging an existing element, it's a move; otherwise copy
      e.dataTransfer.dropEffect = draggedElementId ? 'move' : 'copy';
      setIsDragging(true);
    }
  }, [draggedElementId]);

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
  const handleBranchDelete = useCallback((branchId: string) => {
    if (readOnly || !onChange) return;
    const updatedRung = removeBranch(gridRung, branchId);
    onChange(updatedRung);
  }, [readOnly, onChange, gridRung]);

  // Handle branch resizing (via drag)
  // Logic moved to handleContainerDrop to support visual drag-drop interaction
  // kept here if needed for direct callbacks later

  // Handle element click
  const handleElementClick = useCallback((element: LDElementType) => {
    if (onElementSelect) {
      onElementSelect(element);
    }
  }, [onElementSelect]);

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
            <line
              key={`wire-${rowIdx}-${colIdx}`}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke={COLORS.wire}
              strokeWidth={STROKE_WIDTH}
            />
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
      <RungHeader
        rung={rung}
        cols={cols}
        rows={rows}
        readOnly={readOnly}
        onChange={onChange}
      />

      {/* SVG Canvas with delete button overlay */}
      <div className="overflow-x-auto relative">
        <svg
          width={totalWidth}
          height={totalHeight}
          className="block"
          style={{ minWidth: totalWidth }}
        >
          {/* Background grid (subtle) */}
          <defs>
            <pattern
              id={`grid-${rung.id}`}
              width={CELL_WIDTH}
              height={CELL_HEIGHT}
              patternUnits="userSpaceOnUse"
              x={gridOffsetX}
              y={PADDING}
            >
              <rect
                width={CELL_WIDTH}
                height={CELL_HEIGHT}
                fill="none"
                stroke="var(--color-surface-600)"
                strokeWidth={0.5}
              />
            </pattern>
          </defs>

          <rect
            x={gridOffsetX}
            y={PADDING}
            width={gridWidth}
            height={rows * CELL_HEIGHT}
            fill={`url(#grid-${rung.id})`}
          />

          {/* Left power rail */}
          <PowerRail
            side="left"
            x={RAIL_WIDTH / 2}
            height={totalHeight}
            rows={rows}
          />

          {/* Right power rail */}
          <PowerRail
            side="right"
            x={totalWidth - RAIL_WIDTH / 2}
            height={totalHeight}
            rows={rows}
          />

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
                <line
                  x1={RAIL_WIDTH / 2 + 10}
                  y1={y}
                  x2={gridOffsetX}
                  y2={y}
                  stroke={COLORS.wire}
                  strokeWidth={STROKE_WIDTH}
                />
                {/* Last cell to right rail */}
                <line
                  x1={gridOffsetX + gridWidth}
                  y1={y}
                  x2={totalWidth - RAIL_WIDTH / 2 - 10}
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
          {!gridRung.branches?.length && gridRung.verticalLinks?.map((link, idx) => (
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
              {isDragging ? '↓ Drop here' : 'Drag elements from toolbox →'}
            </text>
          )}

          {/* Drop zones (below elements, for drag-drop on empty cells) */}
          {!readOnly && grid.map((row, rowIdx) =>
            row.map((cell, colIdx) => (
              <DropZone
                key={`drop-${rowIdx}-${colIdx}`}
                col={colIdx}
                row={rowIdx}
                gridOffsetX={gridOffsetX}
                isOver={hoverCell?.col === colIdx && hoverCell?.row === rowIdx}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                hasElement={cell.element !== null}
                isDragging={isDragging}
              />
            ))
          )}

          {/* Elements (above drop zones to receive clicks) */}
          <g transform={`translate(${gridOffsetX}, ${PADDING})`}>
            {grid.map((row, rowIdx) =>
              row.map((cell, colIdx) =>
                cell.element ? (
                  <g
                    key={cell.element.id}
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
                      energized={isElementEnergized(cell.element)}
                      debugValues={debugValues}
                      onClick={() => handleElementClick(cell.element!)}
                      draggable={!readOnly}
                      onDragStart={handleElementDragStart}
                    />
                  </g>
                ) : null
              )
            )}
          </g>
        </svg>

        {/* Delete button overlay for selected element */}
        {!readOnly && selectedElementPosition && onElementDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onElementDelete(selectedElementPosition.element);
            }}
            className="absolute w-6 h-6 flex items-center justify-center 
                       bg-red-500 hover:bg-red-400 text-white rounded-full 
                       shadow-lg transition-colors z-10"
            style={{
              left: selectedElementPosition.x,
              top: selectedElementPosition.y + 28, // +28 for header height
            }}
            title="Delete element (Del)"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
