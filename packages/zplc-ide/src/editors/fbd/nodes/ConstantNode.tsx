/**
 * ConstantNode - Custom ReactFlow node for constant values
 * 
 * Renders BOOL, INT, REAL, TIME constants with appropriate styling.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import NodeComment from './NodeComment';

interface ConstantData {
  dataType?: string;
  value?: unknown;
  comment?: string;
  onChangeData?: (nodeId: string, data: Record<string, unknown>) => void;
  readOnly?: boolean;
}

const ConstantNode = memo(({ id, data, selected }: NodeProps) => {
  const { dataType = 'ANY', value, comment, onChangeData, readOnly } = data as ConstantData;

  // The type is named by the label of the node; it is never a hue (UX-010), and amber and purple are not types.
  const getTypeColor = () => 'border-[var(--border-color)]';

  // Format value display
  const formatValue = () => {
    if (value === undefined || value === null) return '?';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'string') {
      // TIME values
      if (value.startsWith('T#')) return value;
      // String values
      return `'${value}'`;
    }
    return String(value);
  };

  return (
    <div className="zplc-visual-node flex flex-col items-center">
      <div
        className={`
          zplc-visual-card relative min-w-[80px] rounded border-2 
          bg-[var(--visual-node)] ${getTypeColor()}
          ${selected ? 'ring-2 ring-[var(--color-accent-blue)]' : ''}
        `}
        title={comment}
      >
        {/* Value display */}
        <div className="px-3 py-2 text-center">
          <span className="block max-w-[160px] break-words text-[var(--text-primary)] font-mono text-sm font-medium" title={formatValue()}>
            {formatValue()}
          </span>
        </div>

        {/* Type label */}
        <div className="bg-[var(--color-surface-700)] px-2 py-0.5 text-center border-t border-[var(--border-color)]">
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
            {dataType}
          </span>
        </div>

        {/* Output handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="OUT"
          className="!w-3 !h-3 !rounded-full !bg-[var(--visual-wire)] !border-2 !border-[var(--color-surface-300)]"
        />
      </div>
      <NodeComment nodeId={id} comment={comment} onChange={onChangeData} readOnly={readOnly} />
    </div>
  );
});

ConstantNode.displayName = 'ConstantNode';

export default ConstantNode;
