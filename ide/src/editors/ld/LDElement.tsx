/**
 * LDElement - SVG Ladder Diagram Element Rendering
 * 
 * Renders individual LD elements as SVG:
 * - Contacts (NO, NC, P, N) with proper IEC symbols
 * - Coils (Standard, Negated, Set, Reset)
 * - Function Blocks (TON, TOF, CTU, etc.)
 * 
 * All elements are designed to fit within an 80x60 cell grid.
 */

import { type LDElement as LDElementType, isContact, isCoil, isFunctionBlock } from '../../models/ld';

// =============================================================================
// Constants
// =============================================================================

const CELL_WIDTH = 80;
const CELL_HEIGHT = 60;
const WIRE_Y = CELL_HEIGHT / 2;
const STROKE_WIDTH = 2;

// Colors
const COLORS = {
  wire: 'var(--color-surface-400)',
  contact: 'var(--color-accent-green)',
  contactNC: 'var(--color-accent-red)',
  coil: 'var(--color-accent-blue)',
  coilSet: 'var(--color-accent-blue)', // simplified
  coilReset: 'var(--color-accent-orange)',
  fb: 'var(--color-accent-yellow)',
  text: 'var(--color-surface-100)',
  textDim: 'var(--color-surface-200)',
  selected: 'var(--color-accent-yellow)',
  hover: 'rgba(255,255,255,0.1)',
};

// =============================================================================
// Props
// =============================================================================

interface LDElementProps {
  element: LDElementType;
  x: number;  // Grid column (0-based)
  y: number;  // Grid row (0-based)
  selected?: boolean;
  onClick?: () => void;
  onDragStart?: (element: LDElementType) => void;
  draggable?: boolean;
}

// =============================================================================
// Contact Symbol Component
// =============================================================================

interface ContactSymbolProps {
  type: 'contact_no' | 'contact_nc' | 'contact_p' | 'contact_n';
  variable?: string;
  selected?: boolean;
}

function ContactSymbol({ type, variable, selected }: ContactSymbolProps) {
  const isNC = type === 'contact_nc';
  const isEdge = type === 'contact_p' || type === 'contact_n';
  const edgeLetter = type === 'contact_p' ? 'P' : type === 'contact_n' ? 'N' : '';

  const strokeColor = selected ? COLORS.selected : (isNC ? COLORS.contactNC : COLORS.contact);
  const boxWidth = 20;
  const boxHeight = 24;
  const boxX = (CELL_WIDTH - boxWidth) / 2;
  const boxY = (CELL_HEIGHT - boxHeight) / 2 - 4;

  return (
    <g>
      {/* Left wire segment */}
      <line
        x1={0}
        y1={WIRE_Y}
        x2={boxX}
        y2={WIRE_Y}
        stroke={COLORS.wire}
        strokeWidth={STROKE_WIDTH}
      />

      {/* Right wire segment */}
      <line
        x1={boxX + boxWidth}
        y1={WIRE_Y}
        x2={CELL_WIDTH}
        y2={WIRE_Y}
        stroke={COLORS.wire}
        strokeWidth={STROKE_WIDTH}
      />

      {/* Contact box (vertical lines) */}
      <line
        x1={boxX}
        y1={boxY}
        x2={boxX}
        y2={boxY + boxHeight}
        stroke={strokeColor}
        strokeWidth={STROKE_WIDTH}
      />
      <line
        x1={boxX + boxWidth}
        y1={boxY}
        x2={boxX + boxWidth}
        y2={boxY + boxHeight}
        stroke={strokeColor}
        strokeWidth={STROKE_WIDTH}
      />

      {/* NC diagonal line */}
      {isNC && (
        <line
          x1={boxX + 3}
          y1={boxY + boxHeight - 3}
          x2={boxX + boxWidth - 3}
          y2={boxY + 3}
          stroke={strokeColor}
          strokeWidth={STROKE_WIDTH}
        />
      )}

      {/* Edge detection letter */}
      {isEdge && (
        <text
          x={CELL_WIDTH / 2}
          y={WIRE_Y + 1}
          fill={strokeColor}
          fontSize={12}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {edgeLetter}
        </text>
      )}

      {/* Variable name below */}
      <text
        x={CELL_WIDTH / 2}
        y={CELL_HEIGHT - 6}
        fill={COLORS.textDim}
        fontSize={9}
        textAnchor="middle"
        fontFamily="monospace"
      >
        {variable?.substring(0, 10) || '???'}
      </text>
    </g>
  );
}

// =============================================================================
// Coil Symbol Component
// =============================================================================

interface CoilSymbolProps {
  type: 'coil' | 'coil_negated' | 'coil_set' | 'coil_reset' | 'coil_p' | 'coil_n';
  variable?: string;
  selected?: boolean;
}

function CoilSymbol({ type, variable, selected }: CoilSymbolProps) {
  const radius = 12;
  const centerX = CELL_WIDTH / 2;
  const centerY = WIRE_Y;

  // Determine color and inner symbol
  let strokeColor = COLORS.coil;
  let innerText = '';

  switch (type) {
    case 'coil_negated':
      strokeColor = selected ? COLORS.selected : COLORS.contactNC;
      innerText = '/';
      break;
    case 'coil_set':
      strokeColor = selected ? COLORS.selected : COLORS.coilSet;
      innerText = 'S';
      break;
    case 'coil_reset':
      strokeColor = selected ? COLORS.selected : COLORS.coilReset;
      innerText = 'R';
      break;
    case 'coil_p':
      strokeColor = selected ? COLORS.selected : COLORS.coil;
      innerText = 'P';
      break;
    case 'coil_n':
      strokeColor = selected ? COLORS.selected : COLORS.coil;
      innerText = 'N';
      break;
    default:
      strokeColor = selected ? COLORS.selected : COLORS.coil;
  }

  return (
    <g>
      {/* Left wire segment */}
      <line
        x1={0}
        y1={WIRE_Y}
        x2={centerX - radius}
        y2={WIRE_Y}
        stroke={COLORS.wire}
        strokeWidth={STROKE_WIDTH}
      />

      {/* Right wire segment */}
      <line
        x1={centerX + radius}
        y1={WIRE_Y}
        x2={CELL_WIDTH}
        y2={WIRE_Y}
        stroke={COLORS.wire}
        strokeWidth={STROKE_WIDTH}
      />

      {/* Coil circle (parentheses shape) */}
      <ellipse
        cx={centerX}
        cy={centerY}
        rx={radius}
        ry={radius - 2}
        fill="none"
        stroke={strokeColor}
        strokeWidth={STROKE_WIDTH}
      />

      {/* Inner symbol */}
      {innerText && (
        <text
          x={centerX}
          y={centerY + 1}
          fill={strokeColor}
          fontSize={10}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {innerText}
        </text>
      )}

      {/* Variable name below */}
      <text
        x={CELL_WIDTH / 2}
        y={CELL_HEIGHT - 6}
        fill={COLORS.textDim}
        fontSize={9}
        textAnchor="middle"
        fontFamily="monospace"
      >
        {variable?.substring(0, 10) || '???'}
      </text>
    </g>
  );
}

// =============================================================================
// Function Block Symbol Component
// =============================================================================

interface FBSymbolProps {
  fbType?: string;
  instance?: string;
  selected?: boolean;
}

function FBSymbol({ fbType, instance, selected }: FBSymbolProps) {
  const boxWidth = 60;
  const boxHeight = 40;
  const boxX = (CELL_WIDTH - boxWidth) / 2;
  const boxY = (CELL_HEIGHT - boxHeight) / 2 - 2;
  const strokeColor = selected ? COLORS.selected : COLORS.fb;

  return (
    <g>
      {/* Left wire segment */}
      <line
        x1={0}
        y1={WIRE_Y}
        x2={boxX}
        y2={WIRE_Y}
        stroke={COLORS.wire}
        strokeWidth={STROKE_WIDTH}
      />

      {/* Right wire segment */}
      <line
        x1={boxX + boxWidth}
        y1={WIRE_Y}
        x2={CELL_WIDTH}
        y2={WIRE_Y}
        stroke={COLORS.wire}
        strokeWidth={STROKE_WIDTH}
      />

      {/* FB box */}
      <rect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        fill="#1e293b"
        stroke={strokeColor}
        strokeWidth={STROKE_WIDTH}
        rx={3}
      />

      {/* FB type */}
      <text
        x={CELL_WIDTH / 2}
        y={boxY + 14}
        fill={strokeColor}
        fontSize={11}
        fontWeight="bold"
        textAnchor="middle"
        fontFamily="sans-serif"
      >
        {fbType || 'FB'}
      </text>

      {/* Instance name */}
      <text
        x={CELL_WIDTH / 2}
        y={boxY + 28}
        fill={COLORS.textDim}
        fontSize={8}
        textAnchor="middle"
        fontFamily="monospace"
      >
        {instance?.substring(0, 8) || ''}
      </text>
    </g>
  );
}

// =============================================================================
// Wire (empty cell with wire)
// =============================================================================

interface WireProps {
  hasWire: boolean;
}

function Wire({ hasWire }: WireProps) {
  if (!hasWire) return null;

  return (
    <line
      x1={0}
      y1={WIRE_Y}
      x2={CELL_WIDTH}
      y2={WIRE_Y}
      stroke={COLORS.wire}
      strokeWidth={STROKE_WIDTH}
    />
  );
}

// =============================================================================
// Main Element Component
// =============================================================================

export default function LDElement({ element, x, y, selected, onClick, onDragStart, draggable = false }: LDElementProps) {
  const translateX = x * CELL_WIDTH;
  const translateY = y * CELL_HEIGHT;

  // Handle drag start for moving elements
  // This is called from the foreignObject div which supports HTML5 drag
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggable) return;
    
    // Set drag data with element info for move operation
    const data = JSON.stringify({
      type: element.type,
      fbType: element.fbType,
      category: element.type === 'function_block' ? 'function_block' : 
                element.type.startsWith('contact') ? 'contact' : 'coil',
      isMove: true,
      elementId: element.id,
      fromRow: element.row,
      fromCol: element.col,
    });
    e.dataTransfer.setData('application/zplc-ld-element', data);
    e.dataTransfer.effectAllowed = 'move';
    
    // Set a custom drag image (optional - browser default works too)
    if (e.currentTarget) {
      e.dataTransfer.setDragImage(e.currentTarget, CELL_WIDTH / 2, CELL_HEIGHT / 2);
    }
    
    onDragStart?.(element);
  };

  // Render the appropriate symbol based on element type
  const renderElement = () => {
    if (isContact(element.type)) {
      return (
        <ContactSymbol
          type={element.type as 'contact_no' | 'contact_nc' | 'contact_p' | 'contact_n'}
          variable={element.variable}
          selected={selected}
        />
      );
    }

    if (isCoil(element.type)) {
      return (
        <CoilSymbol
          type={element.type as 'coil' | 'coil_negated' | 'coil_set' | 'coil_reset' | 'coil_p' | 'coil_n'}
          variable={element.variable}
          selected={selected}
        />
      );
    }

    if (isFunctionBlock(element.type)) {
      return (
        <FBSymbol
          fbType={element.fbType}
          instance={element.instance}
          selected={selected}
        />
      );
    }

    // Default: just draw a wire
    return <Wire hasWire />;
  };

  return (
    <g transform={`translate(${translateX}, ${translateY})`}>
      {/* Background rect for selection highlight */}
      <rect
        x={0}
        y={0}
        width={CELL_WIDTH}
        height={CELL_HEIGHT}
        fill={selected ? 'rgba(251, 191, 36, 0.15)' : 'transparent'}
        className="hover:fill-white/5 transition-colors"
        style={{ pointerEvents: 'none' }}
      />

      {/* Element content (SVG graphics) */}
      {renderElement()}

      {/* foreignObject overlay for drag-and-drop support */}
      {/* SVG <g> elements don't support HTML5 drag, so we use foreignObject */}
      <foreignObject x={0} y={0} width={CELL_WIDTH} height={CELL_HEIGHT}>
        <div
          draggable={draggable}
          onDragStart={handleDragStart}
          onClick={onClick}
          style={{
            width: '100%',
            height: '100%',
            cursor: draggable ? 'grab' : (onClick ? 'pointer' : 'default'),
            background: 'transparent',
          }}
          // Using namespace for React/SVG foreignObject compatibility
          // @ts-expect-error xmlns required for foreignObject children
          xmlns="http://www.w3.org/1999/xhtml"
        />
      </foreignObject>
    </g>
  );
}

// Export constants for use in other components
export { CELL_WIDTH, CELL_HEIGHT, WIRE_Y, COLORS };
