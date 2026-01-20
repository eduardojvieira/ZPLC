/**
 * @file DebugEdge.tsx
 * @brief Custom ReactFlow edge with live value display for debugging
 *
 * Shows a small badge with the current value being transmitted along
 * the wire. Uses color coding:
 * - Green wire + glow: TRUE/non-zero value
 * - Gray wire: FALSE/zero value
 * - Blue badge: numeric value display
 */

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';

interface DebugEdgeData {
  /** Live value flowing through this edge */
  liveValue?: number | boolean | string | null;
  /** Data type for formatting */
  dataType?: string;
  /** Whether debug mode is active */
  debugActive?: boolean;
}

/**
 * Format a value for display on the edge
 */
function formatValue(value: unknown, dataType?: string): string {
  if (value === null || value === undefined) return '?';
  
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  
  if (typeof value === 'number') {
    // Format based on type
    if (dataType === 'REAL') {
      return value.toFixed(2);
    }
    if (dataType === 'TIME') {
      return `${value}ms`;
    }
    // Integer types
    return value.toString();
  }
  
  if (typeof value === 'string') {
    // Truncate long strings
    return value.length > 8 ? value.slice(0, 8) + '…' : value;
  }
  
  return String(value);
}

/**
 * Determine if value is "energized" (truthy)
 */
function isEnergized(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return false;
}

const DebugEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) => {
  const edgeData = (data as DebugEdgeData) || {};
  const { liveValue, dataType, debugActive } = edgeData;
  
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const hasValue = debugActive && liveValue !== undefined && liveValue !== null;
  const energized = hasValue && isEnergized(liveValue);
  
  // Wire colors
  const strokeColor = energized ? '#22c55e' : '#64748b'; // green-500 or slate-500
  const strokeWidth = energized ? 3 : 2;
  const glowFilter = energized ? 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.6))' : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          filter: glowFilter,
          transition: 'stroke 0.2s, stroke-width 0.2s',
        }}
      />
      
      {/* Value label - only show when debugging and has value */}
      {hasValue && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              zIndex: 10,
            }}
          >
            <div
              className={`
                px-1.5 py-0.5 rounded text-[10px] font-mono font-medium
                shadow-md border
                ${energized 
                  ? 'bg-green-600 text-white border-green-500' 
                  : 'bg-slate-700 text-slate-300 border-slate-600'
                }
                ${typeof liveValue === 'boolean' ? '' : 'bg-blue-600 border-blue-500'}
              `}
            >
              {formatValue(liveValue, dataType)}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

DebugEdge.displayName = 'DebugEdge';

export default DebugEdge;
