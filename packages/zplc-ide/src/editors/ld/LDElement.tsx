/**
 * LDElement - SVG Ladder Diagram Element Rendering
 *
 * Renders individual LD elements as SVG:
 * - Contacts (NO, NC, P, N) with proper IEC symbols
 * - Coils (Standard, Negated, Set, Reset)
 * - Function Blocks (TON, TOF, CTU, etc.)
 *
 * All elements are designed to fit within an 80x60 cell grid.
 *
 * Debug mode shows:
 * - Energized state (green wires, glow effects)
 * - Live values for contacts/coils (TRUE/FALSE or numeric)
 * - Function block port values (Q, ET, CV, etc.)
 */

import { t } from '../../i18n';
import { type LDElement as LDElementType, isContact, isCoil, isFunctionBlock } from '../../models/ld';
import { ldElementKind } from '../../models/ldSupport';
import { splitFBIdentifier } from './fbLabel';
import type { DebugValueResult } from '../../hooks/useDebugValue';
import { SIGNAL_PAINT, sampleTone, signalMark, type SignalTone } from '../../theme/signalTone';

// =============================================================================
// Types
// =============================================================================

/** Map of variable paths to their debug values, and whether the user forces the variable (UX-009). */
export type DebugValuesMap = Map<string, DebugValueResult & { forced?: boolean }>;

// =============================================================================
// Constants
// =============================================================================

const CELL_WIDTH = 80;
const CELL_HEIGHT = 60;
const WIRE_Y = CELL_HEIGHT / 2;
const STROKE_WIDTH = 2;
/** Power flow is a heavier wire as well as a green one: the line says it where the colour cannot (UX-009). */
const ENERGIZED_STROKE_WIDTH = 3;

// Colors
const COLORS = {
  wire: 'var(--color-surface-400)',
  contact: 'var(--color-surface-300)',
  contactNC: 'var(--color-surface-300)',
  coil: 'var(--color-accent-blue)',
  coilSet: 'var(--color-accent-blue)', // simplified
  coilReset: 'var(--color-accent-orange)',
  fb: 'var(--color-accent-yellow)',
  text: 'var(--color-surface-100)',
  textDim: 'var(--color-surface-200)',
  selected: 'var(--color-accent-blue)',
};

/** The wire of a state: TRUE power flow is the TRUE token and heavier; an idle wire is neutral. */
const wireOf = (energized: boolean | undefined) => ({
  color: energized ? SIGNAL_PAINT.true.border : COLORS.wire,
  width: energized ? ENERGIZED_STROKE_WIDTH : STROKE_WIDTH,
});

// =============================================================================
// Props
// =============================================================================

interface LDElementProps {
  element: LDElementType;
  x: number; // Grid column (0-based)
  y: number; // Grid row (0-based)
  selected?: boolean;
  energized?: boolean; // True when power flows through this element (debug mode)
  /** Debug values map for rich value display */
  debugValues?: DebugValuesMap;
  onClick?: () => void;
  onDragStart?: (element: LDElementType) => void;
  draggable?: boolean;
}

// =============================================================================
// Value Formatting Helpers
// =============================================================================

/**
 * Format a debug value for display
 */
function formatValue(info: DebugValueResult | undefined): string {
  // a value that was not read is unavailable: the dash says so, and it is not a FALSE (LNG-006)
  if (!info || !info.exists || info.value === undefined || info.value === null) {
    return '—';
  }

  if (info.type === 'BOOL') {
    return info.value ? 'T' : 'F';
  }
  if (info.type === 'TIME') {
    const ms = typeof info.value === 'number' ? info.value : 0;
    if (ms >= 60000) {
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      return `${mins}m${secs}s`;
    }
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  }
  if (typeof info.value === 'number') {
    return Number.isInteger(info.value) ? info.value.toString() : info.value.toFixed(1);
  }
  return String(info.value);
}

/** The glyph and the value of a state: the glyph is the cue that does not depend on colour. */
const markedValue = (tone: SignalTone, text: string): string => [signalMark(tone), text].filter(Boolean).join(' ');

/**
 * The live value of an element in a small badge. Its border and text take the state's tokens; an unread value is dashed.
 */
function ValueBadge({ x, y, tone, text, fontSize = 9 }: { x: number; y: number; tone: SignalTone; text: string; fontSize?: number }) {
  const label = markedValue(tone, text);
  const width = Math.max(14, label.length * 6 + 6);
  return (
    <g data-signal={tone}>
      <rect
        x={x}
        y={y}
        width={width}
        height={12}
        fill="var(--color-surface-800)"
        stroke={SIGNAL_PAINT[tone].border}
        strokeWidth={1}
        strokeDasharray={tone === 'unknown' ? '2 2' : undefined}
        rx={2}
      />
      <text
        x={x + width / 2}
        y={y + 7}
        fill={SIGNAL_PAINT[tone].fg}
        fontSize={fontSize}
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="monospace"
      >
        <title>{tone}</title>
        {label}
      </text>
    </g>
  );
}

// =============================================================================
// Contact Symbol Component
// =============================================================================

interface ContactSymbolProps {
  type: 'contact_no' | 'contact_nc' | 'contact_p' | 'contact_n';
  variable?: string;
  selected?: boolean;
  energized?: boolean;
  /** Value display string (e.g., "T" for TRUE, "F" for FALSE) */
  valueDisplay?: string;
  /** The state of the value (UX-009) */
  valueTone?: SignalTone;
}

function ContactSymbol({ type, variable, selected, energized, valueDisplay, valueTone }: ContactSymbolProps) {
  const isNC = type === 'contact_nc';
  const isEdge = type === 'contact_p' || type === 'contact_n';
  const edgeLetter = type === 'contact_p' ? 'P' : type === 'contact_n' ? 'N' : '';

  const strokeColor = selected ? COLORS.selected : isNC ? COLORS.contactNC : COLORS.contact;
  const wire = wireOf(energized);
  const boxWidth = 20;
  const boxHeight = 24;
  const boxX = (CELL_WIDTH - boxWidth) / 2;
  const boxY = (CELL_HEIGHT - boxHeight) / 2 - 4;

  return (
    <g>
      {/* Left wire segment */}
      <line x1={0} y1={WIRE_Y} x2={boxX} y2={WIRE_Y} stroke={wire.color} strokeWidth={wire.width} />

      {/* Right wire segment */}
      <line x1={boxX + boxWidth} y1={WIRE_Y} x2={CELL_WIDTH} y2={WIRE_Y} stroke={wire.color} strokeWidth={wire.width} />

      {/* Contact box (vertical lines) */}
      <line x1={boxX} y1={boxY} x2={boxX} y2={boxY + boxHeight} stroke={strokeColor} strokeWidth={STROKE_WIDTH} />
      <line x1={boxX + boxWidth} y1={boxY} x2={boxX + boxWidth} y2={boxY + boxHeight} stroke={strokeColor} strokeWidth={STROKE_WIDTH} />

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

      {/* Live value indicator (top right corner) */}
      {valueDisplay && <ValueBadge x={boxX + boxWidth + 2} y={boxY - 2} tone={valueTone ?? 'unknown'} text={valueDisplay} />}

      {/* Variable name below */}
      <text x={CELL_WIDTH / 2} y={CELL_HEIGHT - 6} fill={COLORS.textDim} fontSize={9} textAnchor="middle" fontFamily="monospace">
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
  energized?: boolean;
  /** Value display string */
  valueDisplay?: string;
  /** The state of the value (UX-009) */
  valueTone?: SignalTone;
}

function CoilSymbol({ type, variable, selected, energized, valueDisplay, valueTone }: CoilSymbolProps) {
  const radius = 12;
  const centerX = CELL_WIDTH / 2;
  const centerY = WIRE_Y;
  const wire = wireOf(energized);

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
      <line x1={0} y1={WIRE_Y} x2={centerX - radius} y2={WIRE_Y} stroke={wire.color} strokeWidth={wire.width} />

      {/* Right wire segment */}
      <line x1={centerX + radius} y1={WIRE_Y} x2={CELL_WIDTH} y2={WIRE_Y} stroke={wire.color} strokeWidth={wire.width} />

      {/* Coil circle (parentheses shape) */}
      <ellipse cx={centerX} cy={centerY} rx={radius} ry={radius - 2} fill="none" stroke={strokeColor} strokeWidth={STROKE_WIDTH} />

      {/* Inner symbol */}
      {innerText && (
        <text x={centerX} y={centerY + 1} fill={strokeColor} fontSize={10} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
          {innerText}
        </text>
      )}

      {/* Live value indicator (top right of coil) */}
      {valueDisplay && <ValueBadge x={centerX + radius + 2} y={centerY - radius - 2} tone={valueTone ?? 'unknown'} text={valueDisplay} />}

      {/* Variable name below */}
      <text x={CELL_WIDTH / 2} y={CELL_HEIGHT - 6} fill={COLORS.textDim} fontSize={9} textAnchor="middle" fontFamily="monospace">
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
  energized?: boolean;
  /** Debug values map for port value display */
  debugValues?: DebugValuesMap;
}

/**
 * Get the ports for a function block type (mirrors FBD model)
 */
function getFBPorts(fbType: string): { inputs: string[]; outputs: Array<{ name: string; type: string }> } {
  switch (fbType) {
    case 'TON':
    case 'TOF':
    case 'TP':
      return {
        inputs: ['IN', 'PT'],
        outputs: [
          { name: 'Q', type: 'BOOL' },
          { name: 'ET', type: 'TIME' },
        ],
      };
    case 'CTU':
      return {
        inputs: ['CU', 'R', 'PV'],
        outputs: [
          { name: 'Q', type: 'BOOL' },
          { name: 'CV', type: 'INT' },
        ],
      };
    case 'CTD':
      return {
        inputs: ['CD', 'LD', 'PV'],
        outputs: [
          { name: 'Q', type: 'BOOL' },
          { name: 'CV', type: 'INT' },
        ],
      };
    case 'R_TRIG':
    case 'F_TRIG':
      return {
        inputs: ['CLK'],
        outputs: [{ name: 'Q', type: 'BOOL' }],
      };
    case 'COMM_PUBLISH':
      return {
        inputs: ['EN', 'IN'],
        outputs: [
          { name: 'OUT', type: 'ANY' },
          { name: 'DONE', type: 'BOOL' },
        ],
      };
    case 'COMM_SUBSCRIBE':
      return {
        inputs: ['EN'],
        outputs: [
          { name: 'OUT', type: 'ANY' },
          { name: 'VALID', type: 'BOOL' },
        ],
      };
    case 'COMM_MODBUS':
      return {
        inputs: ['EN', 'IN'],
        outputs: [
          { name: 'OUT', type: 'ANY' },
          { name: 'STATUS', type: 'BOOL' },
        ],
      };
    case 'COMM_CONNECT':
      return {
        inputs: ['EN'],
        outputs: [
          { name: 'CONNECTED', type: 'BOOL' },
          { name: 'ERROR', type: 'BOOL' },
        ],
      };
    case 'MB_COIL':
    case 'MB_DISCRETE_INPUT':
    case 'MB_INPUT_REGISTER':
    case 'MB_HOLDING_REGISTER':
      return {
        inputs: ['EN', 'IN', 'ADDR'],
        outputs: [
          { name: 'OUT', type: 'ANY' },
          { name: 'STATUS', type: 'BOOL' },
        ],
      };
    default:
      return {
        inputs: ['IN'],
        outputs: [{ name: 'Q', type: 'BOOL' }],
      };
  }
}

function FBSymbol({ fbType, instance, selected, energized, debugValues }: FBSymbolProps) {
  const boxWidth = 70; // Wider to accommodate values
  const boxHeight = 44;
  const boxX = (CELL_WIDTH - boxWidth) / 2;
  const boxY = (CELL_HEIGHT - boxHeight) / 2 - 2;
  const strokeColor = selected ? COLORS.selected : COLORS.fb;
  const wire = wireOf(energized);

  // Get ports for this FB type
  const ports = fbType ? getFBPorts(fbType) : { inputs: [], outputs: [] };
  const showsOutputValues = Boolean(debugValues && instance && ports.outputs.length > 0);
  const typeLines = splitFBIdentifier(fbType || 'FB');
  const instanceLines = splitFBIdentifier(instance || '').slice(0, showsOutputValues ? 1 : 2);

  // Get debug value for a port
  const getPortDebug = (portName: string): DebugValueResult | undefined => {
    if (!debugValues || !instance) return undefined;
    return debugValues.get(`${instance}.${portName}`);
  };

  return (
    <g>
      {/* Left wire segment */}
      <line x1={0} y1={WIRE_Y} x2={boxX} y2={WIRE_Y} stroke={wire.color} strokeWidth={wire.width} />

      {/* Right wire segment */}
      <line x1={boxX + boxWidth} y1={WIRE_Y} x2={CELL_WIDTH} y2={WIRE_Y} stroke={wire.color} strokeWidth={wire.width} />

      {/* FB box */}
      <rect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        fill="var(--color-surface-700)"
        stroke={strokeColor}
        strokeWidth={STROKE_WIDTH}
        rx={3}
      />

      {/* FB type */}
      <text
        x={CELL_WIDTH / 2}
        y={boxY + (typeLines.length > 1 ? 9 : 12)}
        fill={strokeColor}
        fontSize={typeLines.length > 1 ? 7 : 10}
        fontWeight="bold"
        textAnchor="middle"
        fontFamily="sans-serif"
      >
        <title>{fbType || t('editors.ld.fb')}</title>
        {typeLines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={CELL_WIDTH / 2} dy={index === 0 ? 0 : 7}>
            {line}
          </tspan>
        ))}
      </text>

      {/* Instance name remains inside the fixed IEC block. */}
      <title>{instance || fbType || t('editors.ld.fb')}</title>
      {instanceLines.map((line, index) => (
        <text
          key={`${line}-${index}`}
          x={CELL_WIDTH / 2}
          y={boxY + 24 + index * 9}
          fill={COLORS.textDim}
          fontSize={9}
          textAnchor="middle"
          fontFamily="monospace"
        >
          {line}
        </text>
      ))}

      {/* Output port values (shown inside the box at bottom) */}
      {showsOutputValues && (
        <g>
          {/* Divider line */}
          <line x1={boxX + 2} y1={boxY + 28} x2={boxX + boxWidth - 2} y2={boxY + 28} stroke={COLORS.wire} strokeWidth={0.5} />

          {/* Output values row */}
          {ports.outputs.map((port, idx) => {
            const info = getPortDebug(port.name);
            const displayVal = formatValue(info);
            const tone = sampleTone(info);
            const xPos = boxX + 8 + (idx * (boxWidth - 16)) / Math.max(ports.outputs.length, 1);

            return (
              <g key={port.name}>
                {/* Port name */}
                <text x={xPos + 12} y={boxY + 35} fill={COLORS.textDim} fontSize={9} textAnchor="middle" fontFamily="monospace">
                  {port.name}
                </text>
                {/* Port value */}
                {displayVal && (
                  <text
                    x={xPos + 12}
                    y={boxY + 43}
                    fill={SIGNAL_PAINT[tone].fg}
                    data-signal={tone}
                    fontSize={8}
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    {markedValue(tone, displayVal)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}

// =============================================================================
// Wire (empty cell with wire)
// =============================================================================

interface WireProps {
  hasWire: boolean;
  energized?: boolean;
}

function Wire({ hasWire, energized }: WireProps) {
  if (!hasWire) return null;

  return <line x1={0} y1={WIRE_Y} x2={CELL_WIDTH} y2={WIRE_Y} stroke={wireOf(energized).color} strokeWidth={wireOf(energized).width} />;
}

// =============================================================================
// Main Element Component
// =============================================================================

export default function LDElement({
  element,
  x,
  y,
  selected,
  energized,
  debugValues,
  onClick,
  onDragStart,
  draggable = false,
}: LDElementProps) {
  const translateX = x * CELL_WIDTH;
  const translateY = y * CELL_HEIGHT;
  const selectable = Boolean(onClick);
  const elementName = isFunctionBlock(element.type) ? [element.fbType, element.instance].filter(Boolean).join(' ') : element.variable;
  const elementKind = ldElementKind(element.type);
  const selectionLabel = `Select ${elementKind}${elementName ? ` ${elementName}` : ''}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onClick();
  };

  // Handle drag start for moving elements
  // This is called from the foreignObject div which supports HTML5 drag
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggable) return;

    // Set drag data with element info for move operation
    const data = JSON.stringify({
      type: element.type,
      fbType: element.fbType,
      category: element.type === 'function_block' ? 'function_block' : element.type.startsWith('contact') ? 'contact' : 'coil',
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

  // Get debug value info for this element (for contacts and coils)
  const getElementDebug = (): { display: string; tone: SignalTone } | undefined => {
    if (!debugValues || !element.variable) return undefined;
    const info = debugValues.get(element.variable);
    return {
      display: formatValue(info),
      tone: sampleTone(info),
    };
  };

  const elementDebug = getElementDebug();

  // Render the appropriate symbol based on element type
  const renderElement = () => {
    if (isContact(element.type)) {
      return (
        <ContactSymbol
          type={element.type as 'contact_no' | 'contact_nc' | 'contact_p' | 'contact_n'}
          variable={element.variable}
          selected={selected}
          energized={energized}
          valueDisplay={elementDebug?.display}
          valueTone={elementDebug?.tone}
        />
      );
    }

    if (isCoil(element.type)) {
      return (
        <CoilSymbol
          type={element.type as 'coil' | 'coil_negated' | 'coil_set' | 'coil_reset' | 'coil_p' | 'coil_n'}
          variable={element.variable}
          selected={selected}
          energized={energized}
          valueDisplay={elementDebug?.display}
          valueTone={elementDebug?.tone}
        />
      );
    }

    if (isFunctionBlock(element.type)) {
      return (
        <FBSymbol fbType={element.fbType} instance={element.instance} selected={selected} energized={energized} debugValues={debugValues} />
      );
    }

    // Default: just draw a wire
    return <Wire hasWire energized={energized} />;
  };

  return (
    <g transform={`translate(${translateX}, ${translateY})`}>
      {/* Background rect for selection highlight */}
      <rect
        x={0}
        y={0}
        width={CELL_WIDTH}
        height={CELL_HEIGHT}
        fill={selected ? 'color-mix(in srgb, var(--color-accent-blue) 15%, transparent)' : 'transparent'}
        className="transition-colors"
        style={{ pointerEvents: 'none' }}
      />

      {/* Element content (SVG graphics) */}
      {renderElement()}

      {/* foreignObject overlay for drag-and-drop support */}
      {/* SVG <g> elements don't support HTML5 drag, so we use foreignObject */}
      <foreignObject x={0} y={0} width={CELL_WIDTH} height={CELL_HEIGHT}>
        <div
          data-ld-element-id={element.id}
          className={selectable ? 'focus-ring' : undefined}
          draggable={draggable}
          onDragStart={handleDragStart}
          onClick={onClick}
          onKeyDown={handleKeyDown}
          tabIndex={selectable ? 0 : undefined}
          role={selectable ? 'button' : undefined}
          aria-pressed={selectable ? selected : undefined}
          aria-label={selectable ? selectionLabel : undefined}
          style={{
            width: '100%',
            height: '100%',
            cursor: draggable ? 'grab' : onClick ? 'pointer' : 'default',
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

// Export constants and types for use in other components
export { CELL_WIDTH, CELL_HEIGHT, WIRE_Y, COLORS };
