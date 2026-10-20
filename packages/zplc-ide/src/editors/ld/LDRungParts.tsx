/**
 * The parts of a rung drawing that are not the grid itself: power rails, vertical links, branch connectors, drop
 * zones and the rung header. Split out of LDRungGrid.tsx (IDE-014).
 */

import { useState, useRef, useEffect } from 'react';
import { type LDRung, type LDBranch } from '../../models/ld';
import { CELL_WIDTH, CELL_HEIGHT, WIRE_Y, COLORS } from './LDElement';
import { t } from '../../i18n';
import { TextField, Tooltip } from '../../ui';

export const RAIL_WIDTH = 20;
export const PADDING = 10;
export const STROKE_WIDTH = 2;

// =============================================================================
// Power Rail Component
// =============================================================================

interface PowerRailProps {
  side: 'left' | 'right';
  x: number;
  height: number;
  rows: number;
}

export function PowerRail({ side, x, height, rows }: PowerRailProps) {
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

export function VerticalLink({ col, fromRow, toRow, gridOffsetX, position }: VerticalLinkProps) {
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

export function BranchConnector({ branch, gridOffsetX, readOnly, onDelete }: BranchConnectorProps) {
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
            // @ts-expect-error React's SVG rect props omit the browser-supported draggable attribute.
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
              <circle r={8} fill="var(--color-accent-red)" />
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
  onDragOver: (col: number, row: number) => void;
  onDragLeave: () => void;
  hasElement: boolean;
  isDragging: boolean;  // New: track if any drag is happening
  /** The cell was clicked: the keyboard cursor goes there. */
  onPick?: (col: number, row: number) => void;
}

export function DropZone({
  col,
  row,
  gridOffsetX,
  isOver,
  onDragOver,
  onDragLeave,
  hasElement,
  isDragging,
  onPick,
}: DropZoneProps) {
  const x = gridOffsetX + col * CELL_WIDTH;
  const y = PADDING + row * CELL_HEIGHT;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    onDragOver(col, row);
  };

  // Visual states: default, dragging (highlight available), hover (strong highlight)
  let fillColor = 'transparent';
  let strokeColor = 'transparent';

  if (!hasElement) {
    if (isOver) {
      // Hovering over this cell
      fillColor = 'color-mix(in srgb, var(--color-accent-blue) 30%, transparent)';
      strokeColor = 'color-mix(in srgb, var(--color-accent-blue) 80%, transparent)';
    } else if (isDragging) {
      // Dragging but not over this cell - subtle hint
      fillColor = 'color-mix(in srgb, var(--color-accent-blue) 8%, transparent)';
      strokeColor = 'color-mix(in srgb, var(--color-accent-blue) 30%, transparent)';
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
      onDragLeave={onDragLeave}
      onClick={() => onPick?.(col, row)} data-ld-drop-zone={`${row},${col}`}
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
  /** Changes when the keyboard asks for the comment to be edited (LNG-012). */
  editRequest?: number;
}

export function RungHeader({ rung, cols, rows, readOnly, onChange, editRequest }: RungHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [commentDraft, setCommentDraft] = useState(rung.comment || '');
  const inputRef = useRef<HTMLInputElement>(null);
  // The keyboard asks for the comment to be edited: the draft starts from the comment, during this render, not after it
  const [seenRequest, setSeenRequest] = useState(editRequest);
  if (editRequest !== seenRequest) {
    setSeenRequest(editRequest);
    if (!readOnly) {
      setCommentDraft(rung.comment || '');
      setIsEditing(true);
    }
  }

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (readOnly) return;
    setCommentDraft(rung.comment || '');
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
        {t('editors.ld.rungWord')} {rung.number}
      </span>

      {isEditing ? (
        <TextField bare
          aria-label={t('a11y.ld.comment')} ref={inputRef} type="text"
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 text-xs italic bg-[var(--color-surface-800)] border border-[var(--color-surface-500)] 
                     rounded px-2 py-0.5 text-[var(--color-surface-100)]"
          placeholder={t('editors.ld.addRungComment')}
        />
      ) : (
        <Tooltip content={readOnly ? rung.comment : t('editors.ld.editComment')}>
          <span
            onClick={handleStartEdit}
            className={`flex-1 min-w-0 text-xs italic truncate ${readOnly ? '' : 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] rounded px-1 -mx-1'
              } ${rung.comment ? 'text-[var(--color-surface-200)]' : 'text-[var(--color-surface-400)]'}`}
          >
            {rung.comment ? `— ${rung.comment}` : (readOnly ? '' : t('editors.ld.clickToComment'))}
          </span>
        </Tooltip>
      )}

      <span className="text-[length:var(--font-size-caption)] text-[var(--color-surface-300)] shrink-0">
        {cols}×{rows}
      </span>
    </div>
  );
}
