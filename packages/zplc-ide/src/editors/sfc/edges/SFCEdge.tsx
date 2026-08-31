import { BaseEdge, type EdgeProps } from '@xyflow/react';

/**
 * IEC SFC uses a vertical spine. A returning transition is deliberately routed
 * through one left-side lane so it never crosses the action/guard annotations.
 */
export default function SFCEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style }: EdgeProps) {
  const returning = targetY < sourceY;
  const aligned = Math.abs(sourceX - targetX) < 1;
  const laneX = Math.min(sourceX, targetX) - 80;
  const path = returning
    ? `M ${sourceX},${sourceY} L ${laneX},${sourceY} L ${laneX},${targetY - 16} L ${targetX},${targetY - 16} L ${targetX},${targetY}`
    : aligned
      ? `M ${sourceX},${sourceY} L ${targetX},${targetY}`
      : `M ${sourceX},${sourceY} L ${sourceX},${sourceY + 16} L ${targetX},${sourceY + 16} L ${targetX},${targetY}`;

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={returning ? markerEnd : undefined}
      style={style}
      className={`sfc-edge-path ${returning ? 'sfc-edge-return' : 'sfc-edge-forward'}`}
      data-sfc-return-lane={returning ? String(laneX) : undefined}
    />
  );
}
