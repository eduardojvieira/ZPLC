/**
 * VariableNode - Custom ReactFlow node for variables (read/write)
 * 
 * Can act as:
 * - Input variable (read): has output handle only
 * - Output variable (write): has input handle only  
 * - Read/Write variable: has both handles
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import NodeComment from './NodeComment';
import type { FBDPort } from '../../../models/fbd';
import { SignalValue } from '../../../ui';
import { SIGNAL_CUES, SIGNAL_TEXT_CLASS, sampleTone } from '../../../theme/signalTone';

interface VariableData {
  type: 'variable' | 'input' | 'output';
  variableName?: string;
  dataType?: string;
  address?: string;  // e.g., "%Q0.0" for physical I/O
  comment?: string;
  onChangeData?: (nodeId: string, data: Record<string, unknown>) => void;
  readOnly?: boolean;
  inputs?: FBDPort[];
  outputs?: FBDPort[];
  /** Online: whether the program is running under Studio, and the value of each pin from the debug map (LNG-006). */
  debugActive?: boolean;
  pinValues?: Record<string, number | boolean | string | undefined>;
  /** Whether the user forces the variable, or it could not be read (UX-009). */
  pinFlags?: Record<string, { forced?: boolean; fault?: boolean } | undefined>;
}

const VariableNode = memo(({ id, data, selected }: NodeProps) => {
  const { 
    type = 'variable', 
    variableName = '???', 
    dataType,
    address,
    comment,
    onChangeData, readOnly, inputs, outputs, debugActive, pinValues, pinFlags,
  } = data as unknown as VariableData;
  // a value the map does not give is unavailable, shown with a dash and not as FALSE
  const live = pinValues?.OUT ?? pinValues?.IN;
  const liveText = live === undefined ? '—' : typeof live === 'boolean' ? (live ? 'TRUE' : 'FALSE') : String(live);
  const flags = pinFlags?.OUT ?? pinFlags?.IN;
  const liveTone = sampleTone({ value: live, type: typeof live === 'boolean' ? 'BOOL' : dataType, forced: flags?.forced, error: flags?.fault ? 'fault' : null });

  const isInput = outputs ? outputs.length > 0 : type === 'input' || type === 'variable';
  const isOutput = inputs ? inputs.length > 0 : type === 'output' || type === 'variable';

  // Direction is a reference, not an energized/fault state.
  const getBorderColor = () => {
    return 'border-[var(--color-accent-blue)]';
  };

  const getHeaderColor = () => {
    return 'bg-[var(--visual-panel)] border-b border-[var(--border-color)]';
  };

  const getIcon = () => {
    if (type === 'input') return '→';
    if (type === 'output') return '←';
    return '↔';
  };

  return (
    <div className="zplc-visual-node flex flex-col items-center">
      <div
        className={`
          min-w-[124px] rounded border-2 
          zplc-visual-card bg-[var(--visual-node)]
          ${getBorderColor()}
          ${selected ? 'ring-2 ring-[var(--color-accent-blue)]' : ''}
        `}
        title={comment}
      >
        {/* Header */}
        <div className={`${getHeaderColor()} px-2 py-1 flex items-center justify-center gap-1 rounded-t`}>
          <span className="text-[var(--text-primary)] text-xs">{getIcon()}</span>
          <span className="text-[var(--text-primary)] font-mono text-xs font-medium">
            {type.toUpperCase()}
          </span>
        </div>

        {/* Variable name */}
        <div className="px-3 py-2 text-center relative">
          <span className="block max-w-[156px] break-words text-[var(--text-primary)] font-mono text-sm" title={variableName}>
            {variableName}
          </span>
          
          {/* Input handle (for output/variable types - receives data) */}
          {isOutput && (
            <Handle
              type="target"
              position={Position.Left}
              id="IN"
              className="!w-3 !h-3 !rounded-[2px] !bg-[var(--visual-wire)] !border-2 !border-[var(--color-surface-300)]"
            />
          )}

          {/* Output handle (for input/variable types - provides data) */}
          {isInput && (
            <Handle
              type="source"
              position={Position.Right}
              id="OUT"
              className="!w-3 !h-3 !rounded-full !bg-[var(--visual-wire)] !border-2 !border-[var(--color-surface-300)]"
            />
          )}
        </div>

        {debugActive && (
          <div className="px-2 py-0.5 text-center font-mono text-xs text-[var(--text-primary)] border-t border-[var(--border-color)]" data-live-value>
            {/* TRUE, FALSE and a dash say their state in words; a force and a fault also get the glyph and the word (UX-009) */}
            {liveTone === 'forced' || liveTone === 'fault'
              ? <SignalValue tone={liveTone}>{`${SIGNAL_CUES[liveTone].label} `}{liveText}</SignalValue>
              : <span data-signal={liveTone} className={SIGNAL_TEXT_CLASS[liveTone]}>{liveText}</span>}
          </div>
        )}

        {/* Footer with type/address info */}
        {(dataType || address) && (
          <div className="bg-[var(--color-surface-700)] px-2 py-0.5 text-center rounded-b border-t border-[var(--border-color)]">
            <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
              {address || dataType}
            </span>
          </div>
        )}
      </div>

      {/* Editable comment below node */}
      <NodeComment nodeId={id} comment={comment} onChange={onChangeData} readOnly={readOnly} />
    </div>
  );
});

VariableNode.displayName = 'VariableNode';

export default VariableNode;
