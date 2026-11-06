/**
 * LDFunctionBox - the box of an IEC function in a rung (LNG-028): the name of the function on top, its operands down the left
 * side in pin order, and its output on the right. A comparison has no output: it passes power when it holds.
 *
 * The left wire is EN, the power that reaches the box, and the right wire is ENO, the power that leaves it. Online they take the
 * state the debug map gives them (LNG-006), so a comparison that fails shows power on its left wire and none on its right.
 * The box fits the 80x60 cell of the grid; a name too long for it is cut and shown whole in its tooltip.
 */

import { ldFunctionLabel, ldFunctionSpec } from '../../models/ldSupport';
import type { LDElement as LDElementModel } from '../../models/ld';
import { SIGNAL_PAINT } from '../../theme/signalTone';
import { CELL_HEIGHT, CELL_WIDTH, COLORS, WIRE_Y } from './LDElement';

const BOX_WIDTH = 70;
const BOX_HEIGHT = 54;
const BOX_X = (CELL_WIDTH - BOX_WIDTH) / 2;
const BOX_Y = (CELL_HEIGHT - BOX_HEIGHT) / 2;
const STROKE_WIDTH = 2;
const ENERGIZED_STROKE_WIDTH = 3;
const MAX_NAME = 7;

export interface LDFunctionBoxProps {
  element: LDElementModel;
  /** Grid column and row (0-based). */
  x: number;
  y: number;
  selected?: boolean;
  /** EN: power reaches the box. */
  energized?: boolean;
  /** ENO: power leaves the box. */
  energizedOut?: boolean;
  onClick?: () => void;
  onDragStart?: (element: LDElementModel) => void;
  draggable?: boolean;
}

/** An operand or output as it fits the box. */
const clip = (text: string): string => (text.length > MAX_NAME ? `${text.slice(0, MAX_NAME - 1)}…` : text);

const wireOf = (energized: boolean | undefined) => ({
  color: energized ? SIGNAL_PAINT.true.border : COLORS.wire,
  width: energized ? ENERGIZED_STROKE_WIDTH : STROKE_WIDTH,
});

export default function LDFunctionBox({
  element,
  x,
  y,
  selected,
  energized,
  energizedOut,
  onClick,
  onDragStart,
  draggable = false,
}: LDFunctionBoxProps) {
  const pins = ldFunctionSpec(element.functionName)?.pins ?? [];
  const operands = element.operands ?? [];
  const stroke = selected ? COLORS.selected : COLORS.fb;
  const left = wireOf(energized);
  const right = wireOf(energizedOut);
  const label = ldFunctionLabel(element);
  const selectable = Boolean(onClick);

  return (
    <g transform={`translate(${x * CELL_WIDTH}, ${y * CELL_HEIGHT})`} data-ld-function={element.functionName}>
      <title>{label}</title>
      <rect
        x={0}
        y={0}
        width={CELL_WIDTH}
        height={CELL_HEIGHT}
        fill={selected ? 'color-mix(in srgb, var(--color-accent-blue) 15%, transparent)' : 'transparent'}
        style={{ pointerEvents: 'none' }}
      />
      <line x1={0} y1={WIRE_Y} x2={BOX_X} y2={WIRE_Y} stroke={left.color} strokeWidth={left.width} data-wire="en" />
      <line x1={BOX_X + BOX_WIDTH} y1={WIRE_Y} x2={CELL_WIDTH} y2={WIRE_Y} stroke={right.color} strokeWidth={right.width} data-wire="eno" />
      <rect
        x={BOX_X}
        y={BOX_Y}
        width={BOX_WIDTH}
        height={BOX_HEIGHT}
        fill="var(--color-surface-700)"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        rx={3}
      />
      <text
        x={CELL_WIDTH / 2}
        y={BOX_Y + 11}
        fill={stroke}
        fontSize={10}
        fontWeight="bold"
        textAnchor="middle"
        fontFamily="sans-serif"
        data-ld-function-name=""
      >
        {element.functionName ?? '?'}
      </text>
      <line x1={BOX_X + 2} y1={BOX_Y + 15} x2={BOX_X + BOX_WIDTH - 2} y2={BOX_Y + 15} stroke={COLORS.wire} strokeWidth={0.5} />
      {operands.map((operand, index) => (
        <text
          key={`${pins[index] ?? index}`}
          x={BOX_X + 4}
          y={BOX_Y + 26 + index * 10}
          fill={operand === '' ? COLORS.wire : COLORS.textDim}
          fontSize={8}
          fontFamily="monospace"
          data-ld-operand={pins[index] ?? `IN${index + 1}`}
        >
          <title>{operand}</title>
          {operand === '' ? '—' : clip(operand)}
        </text>
      ))}
      {element.output ? (
        <text
          x={BOX_X + BOX_WIDTH - 4}
          y={BOX_Y + 26 + (Math.max(operands.length, 1) - 1) * 5}
          fill={COLORS.text}
          fontSize={8}
          fontFamily="monospace"
          textAnchor="end"
          data-ld-output=""
        >
          <title>{element.output}</title>
          {clip(element.output)}
        </text>
      ) : null}
      {/* foreignObject overlay for selection, keyboard and drag, as the other elements have */}
      <foreignObject x={0} y={0} width={CELL_WIDTH} height={CELL_HEIGHT}>
        <div
          data-ld-element-id={element.id}
          className={selectable ? 'focus-ring' : undefined}
          draggable={draggable}
          onDragStart={(event) => {
            if (!draggable) return;
            event.dataTransfer.setData(
              'application/zplc-ld-element',
              JSON.stringify({ type: element.type, isMove: true, elementId: element.id, fromRow: element.row, fromCol: element.col }),
            );
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setDragImage(event.currentTarget, CELL_WIDTH / 2, CELL_HEIGHT / 2);
            onDragStart?.(element);
          }}
          onClick={onClick}
          onKeyDown={(event) => {
            if (
              !onClick ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey ||
              (event.key !== 'Enter' && event.key !== ' ')
            )
              return;
            event.preventDefault();
            onClick();
          }}
          tabIndex={selectable ? 0 : undefined}
          role={selectable ? 'button' : undefined}
          aria-pressed={selectable ? selected : undefined}
          aria-label={selectable ? label : undefined}
          style={{
            width: '100%',
            height: '100%',
            cursor: draggable ? 'grab' : onClick ? 'pointer' : 'default',
            background: 'transparent',
          }}
          // @ts-expect-error xmlns required for foreignObject children
          xmlns="http://www.w3.org/1999/xhtml"
        />
      </foreignObject>
    </g>
  );
}
