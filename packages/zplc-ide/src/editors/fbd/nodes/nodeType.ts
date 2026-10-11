/**
 * Which canvas node draws a block of the diagram. A pure table, apart from the node components, so that the keyboard
 * editing of the diagram (LNG-012) can make a node without loading them.
 */

import { isLogicGate, isComparison, isMathOperator, isFunctionBlock } from '../../../models/fbd';

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
