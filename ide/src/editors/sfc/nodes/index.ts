/**
 * SFC Custom Node Types Registry
 * 
 * Exports all custom node components and the nodeTypes mapping
 * for ReactFlow.
 */

import SFCStepNode from './SFCStepNode';
import SFCTransitionNode from './SFCTransitionNode';

// Export individual components
export {
  SFCStepNode,
  SFCTransitionNode,
};

// ReactFlow nodeTypes mapping
export const nodeTypes = {
  step: SFCStepNode,
  transition: SFCTransitionNode,
};

/**
 * Determine which node type to use for a given SFC element type
 */
export function getSFCNodeType(elementType: string): string {
  switch (elementType) {
    case 'step':
    case 'initial_step':
      return 'step';
    case 'transition':
      return 'transition';
    default:
      return 'step';
  }
}
