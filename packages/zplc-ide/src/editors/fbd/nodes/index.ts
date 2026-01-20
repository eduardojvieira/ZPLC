/**
 * FBD Custom Node Types Registry
 * 
 * Exports all custom node components and the nodeTypes mapping
 * for ReactFlow.
 */

import FunctionBlockNode from './FunctionBlockNode';
import LogicGateNode from './LogicGateNode';
import ConstantNode from './ConstantNode';
import VariableNode from './VariableNode';
import ComparisonNode from './ComparisonNode';
import MathNode from './MathNode';
import { isLogicGate, isComparison, isMathOperator, isFunctionBlock } from '../../../models/fbd';

// Export individual components
export {
  FunctionBlockNode,
  LogicGateNode,
  ConstantNode,
  VariableNode,
  ComparisonNode,
  MathNode,
};

// ReactFlow nodeTypes mapping
export const nodeTypes = {
  functionBlock: FunctionBlockNode,
  logicGate: LogicGateNode,
  constant: ConstantNode,
  variable: VariableNode,
  comparison: ComparisonNode,
  math: MathNode,
};

/**
 * Determine which node type to use for a given FBD block type
 */
export function getNodeType(blockType: string): string {
  // Special block types
  if (blockType === 'constant') return 'constant';
  if (blockType === 'variable' || blockType === 'input' || blockType === 'output') {
    return 'variable';
  }
  
  // Categorized blocks
  if (isLogicGate(blockType)) return 'logicGate';
  if (isComparison(blockType)) return 'comparison';
  if (isMathOperator(blockType)) return 'math';
  if (isFunctionBlock(blockType)) return 'functionBlock';
  
  // Functions like MAX, MIN, LIMIT, SEL also use math node style
  if (['MAX', 'MIN', 'LIMIT', 'SEL', 'MUX'].includes(blockType)) return 'math';
  
  // Default to function block for unknown types
  return 'functionBlock';
}
