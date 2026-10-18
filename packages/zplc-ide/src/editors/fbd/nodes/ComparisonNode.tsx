/**
 * ComparisonNode - Custom ReactFlow node for comparison operators
 * 
 * Renders EQ, NE, LT, LE, GT, GE blocks.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import NodeComment from './NodeComment';

interface ComparisonData {
  type: string;
  comment?: string;
  onChangeData?: (nodeId: string, data: Record<string, unknown>) => void;
  readOnly?: boolean;
}

const ComparisonNode = memo(({ id, data, selected }: NodeProps) => {
  const { type, comment, onChangeData, readOnly } = data as unknown as ComparisonData;

  // Get operator symbol
  const getSymbol = () => {
    switch (type) {
      case 'EQ': return '=';
      case 'NE': return '≠';
      case 'LT': return '<';
      case 'LE': return '≤';
      case 'GT': return '>';
      case 'GE': return '≥';
      default: return '?';
    }
  };

  return (
    <div className="zplc-visual-node flex flex-col items-center">
      <div
        className={`
          w-16 rounded border-2 
          zplc-visual-card relative bg-[var(--visual-node)] border-[var(--color-accent-blue)]
          ${selected ? 'ring-2 ring-[var(--color-accent-blue)]' : ''}
        `}
        title={comment || type}
      >
        {/* Comparison body */}
        <div className="relative h-14 flex items-center justify-center">
          {/* Input handles */}
          <Handle
            type="target"
            position={Position.Left}
            id="IN1"
            className="!w-3 !h-3 !rounded-[2px] !bg-[var(--visual-wire)] !border-2 !border-[var(--color-surface-300)]"
            style={{ top: '30%' }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="IN2"
            className="!w-3 !h-3 !rounded-[2px] !bg-[var(--visual-wire)] !border-2 !border-[var(--color-surface-300)]"
            style={{ top: '70%' }}
          />

          {/* Symbol */}
          <span className="text-2xl font-bold text-[var(--text-primary)]">
            {getSymbol()}
          </span>

          {/* Output handle */}
          <Handle
            type="source"
            position={Position.Right}
            id="OUT"
            className="!w-3 !h-3 !rounded-full !bg-[var(--visual-wire)] !border-2 !border-[var(--color-surface-300)]"
          />
        </div>

        {/* Type label */}
        <div className="bg-[var(--color-surface-700)] px-1 py-0.5 text-center rounded-b border-t border-[var(--border-color)]">
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
            {type}
          </span>
        </div>
      </div>
      <NodeComment nodeId={id} comment={comment} onChange={onChangeData} readOnly={readOnly} />
    </div>
  );
});

ComparisonNode.displayName = 'ComparisonNode';

export default ComparisonNode;
