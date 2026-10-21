/**
 * @file DebugEdge.tsx
 * @brief Custom ReactFlow edge with live value display for debugging
 *
 * Shows a small badge with the current value being transmitted along
 * the wire, in the signal vocabulary (see edgeSignal): the tone, a heavier or
 * dashed line and a glyph, never a glow.
 */

import { memo } from 'react';
import { SIGNAL_CHIP_CLASS } from '../../../theme/signalTone';
import { edgeSignal } from './edgeSignal';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

interface DebugEdgeData {
  /** Live value flowing through this edge */
  liveValue?: number | boolean | string | null;
  /** Data type for formatting */
  dataType?: string;
  /** Whether debug mode is active */
  debugActive?: boolean;
  /** The source variable is forced, or could not be read (UX-009). */
  forced?: boolean;
  fault?: boolean;
}

const DebugEdge = memo(({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps) => {
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
  const signal = edgeSignal({ liveValue, dataType, forced: edgeData.forced, fault: edgeData.fault });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: signal.stroke,
          strokeWidth: signal.width,
          strokeDasharray: signal.dash,
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
              data-signal={signal.tone}
              className={
                `px-1.5 py-0.5 rounded text-[length:var(--font-size-caption)] font-mono ` + `font-medium ${SIGNAL_CHIP_CLASS[signal.tone]}`
              }
            >
              {signal.label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

DebugEdge.displayName = 'DebugEdge';

export default DebugEdge;
