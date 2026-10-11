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

export { getNodeType } from './nodeType';
