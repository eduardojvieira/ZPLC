/**
 * FBD to Structured Text Transpiler
 * 
 * Converts FBD (Function Block Diagram) models to IEC 61131-3 Structured Text.
 * This enables the visual editor to leverage the existing ST compiler pipeline.
 * 
 * Strategy:
 * 1. Topological sort blocks by data dependencies
 * 2. Generate variable declarations
 * 3. Generate function block instances
 * 4. Generate execution statements in dependency order
 */

import type { FBDModel, FBDBlock, FBDConnection } from '../models/fbd';
import { isFunctionBlock, isLogicGate, isComparison, isMathOperator } from '../models/fbd';

// =============================================================================
// Types
// =============================================================================

interface TranspileResult {
  success: boolean;
  source: string;
  errors: string[];
}

interface BlockInput {
  port: string;
  sourceBlock: string;
  sourcePort: string;
}

interface BlockOutput {
  port: string;
  tempVar: string;
}

// =============================================================================
// Transpiler
// =============================================================================

export function transpileFBDToST(model: FBDModel): TranspileResult {
  const errors: string[] = [];
  const lines: string[] = [];
  
  try {
    // Build connection map
    const inputMap = buildInputMap(model.connections);
    const outputMap = buildOutputMap(model.blocks, inputMap);
    
    // Topological sort blocks
    const sortedBlocks = topologicalSort(model.blocks, inputMap);
    
    // Generate program header
    lines.push(`PROGRAM ${model.name}`);
    lines.push('');
    
    // Generate variable declarations
    lines.push('VAR');
    
    // Local variables from model
    for (const v of model.variables.local) {
      const init = v.initialValue !== undefined ? ` := ${formatValue(v.initialValue, v.type)}` : '';
      const comment = v.comment ? ` (* ${v.comment} *)` : '';
      lines.push(`    ${v.name} : ${v.type}${init};${comment}`);
    }
    
    // Function block instances
    for (const block of model.blocks) {
      if (isFunctionBlock(block.type) && block.instanceName) {
        const comment = block.comment ? ` (* ${block.comment} *)` : '';
        lines.push(`    ${block.instanceName} : ${block.type};${comment}`);
      }
    }
    
    // Temporary variables for intermediate results
    for (const block of sortedBlocks) {
      const outputs = outputMap.get(block.id);
      if (outputs) {
        for (const output of outputs) {
          const dataType = getOutputType(block, output.port);
          lines.push(`    ${output.tempVar} : ${dataType};`);
        }
      }
    }
    
    lines.push('END_VAR');
    lines.push('');
    
    // Output variables (I/O mapped)
    if (model.variables.outputs.length > 0) {
      lines.push('VAR_OUTPUT');
      for (const v of model.variables.outputs) {
        const address = v.address ? ` AT ${v.address}` : '';
        const comment = v.comment ? ` (* ${v.comment} *)` : '';
        lines.push(`    ${v.name}${address} : ${v.type};${comment}`);
      }
      lines.push('END_VAR');
      lines.push('');
    }
    
    // Generate execution code
    lines.push('(* FBD Execution - Auto-generated *)');
    lines.push('');
    
    for (const block of sortedBlocks) {
      const code = generateBlockCode(block, inputMap, outputMap, model);
      if (code) {
        // Add block comment if present
        if (block.comment) {
          lines.push(`(* ${block.comment} *)`);
        }
        lines.push(code);
      }
    }
    
    lines.push('');
    lines.push('END_PROGRAM');
    
    return {
      success: true,
      source: lines.join('\n'),
      errors: [],
    };
  } catch (e) {
    errors.push(`Transpiler error: ${e instanceof Error ? e.message : String(e)}`);
    return {
      success: false,
      source: '',
      errors,
    };
  }
}

// =============================================================================
// Connection Mapping
// =============================================================================

/**
 * Build a map of block inputs: blockId -> { port -> { sourceBlock, sourcePort } }
 */
function buildInputMap(connections: FBDConnection[]): Map<string, BlockInput[]> {
  const map = new Map<string, BlockInput[]>();
  
  for (const conn of connections) {
    const inputs = map.get(conn.to.block) || [];
    inputs.push({
      port: conn.to.port,
      sourceBlock: conn.from.block,
      sourcePort: conn.from.port,
    });
    map.set(conn.to.block, inputs);
  }
  
  return map;
}

/**
 * Build a map of block outputs that need temp variables
 */
function buildOutputMap(
  blocks: FBDBlock[], 
  inputMap: Map<string, BlockInput[]>
): Map<string, BlockOutput[]> {
  const map = new Map<string, BlockOutput[]>();
  
  // Find all blocks that have connections FROM them
  const usedOutputs = new Set<string>();
  for (const inputs of inputMap.values()) {
    for (const input of inputs) {
      usedOutputs.add(`${input.sourceBlock}.${input.sourcePort}`);
    }
  }
  
  for (const block of blocks) {
    // Skip special blocks that don't need temp vars
    if (block.type === 'constant' || block.type === 'output') continue;
    
    const outputs: BlockOutput[] = [];
    const blockOutputs = block.outputs || [];
    
    for (const port of blockOutputs) {
      const key = `${block.id}.${port.name}`;
      if (usedOutputs.has(key)) {
        outputs.push({
          port: port.name,
          tempVar: `_${block.id}_${port.name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
        });
      }
    }
    
    if (outputs.length > 0) {
      map.set(block.id, outputs);
    }
  }
  
  return map;
}

// =============================================================================
// Topological Sort
// =============================================================================

function topologicalSort(
  blocks: FBDBlock[], 
  inputMap: Map<string, BlockInput[]>
): FBDBlock[] {
  const result: FBDBlock[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const blockMap = new Map(blocks.map(b => [b.id, b]));
  
  function visit(blockId: string) {
    if (visited.has(blockId)) return;
    if (visiting.has(blockId)) {
      throw new Error(`Circular dependency detected involving block: ${blockId}`);
    }
    
    visiting.add(blockId);
    
    // Visit all dependencies first
    const inputs = inputMap.get(blockId) || [];
    for (const input of inputs) {
      visit(input.sourceBlock);
    }
    
    visiting.delete(blockId);
    visited.add(blockId);
    
    const block = blockMap.get(blockId);
    if (block) {
      result.push(block);
    }
  }
  
  for (const block of blocks) {
    visit(block.id);
  }
  
  return result;
}

// =============================================================================
// Code Generation
// =============================================================================

function generateBlockCode(
  block: FBDBlock,
  inputMap: Map<string, BlockInput[]>,
  outputMap: Map<string, BlockOutput[]>,
  model: FBDModel
): string {
  const inputs = inputMap.get(block.id) || [];
  const outputs = outputMap.get(block.id) || [];
  
  // Get input expression for a port
  const getInput = (portName: string): string => {
    const input = inputs.find(i => i.port === portName);
    if (!input) {
      // Check if it's a constant block with a value
      return '0'; // Default
    }
    
    // Find source block
    const sourceBlock = model.blocks.find(b => b.id === input.sourceBlock);
    if (!sourceBlock) return '0';
    
    // Constants
    if (sourceBlock.type === 'constant') {
      return formatValue(sourceBlock.value, sourceBlock.dataType || 'INT');
    }
    
    // Variables (input type)
    if (sourceBlock.type === 'variable' || sourceBlock.type === 'input') {
      return sourceBlock.variableName || '0';
    }
    
    // Other blocks - use temp variable
    const sourceOutputs = outputMap.get(input.sourceBlock);
    if (sourceOutputs) {
      const srcOutput = sourceOutputs.find(o => o.port === input.sourcePort);
      if (srcOutput) return srcOutput.tempVar;
    }
    
    // Function block output - direct access
    if (isFunctionBlock(sourceBlock.type) && sourceBlock.instanceName) {
      return `${sourceBlock.instanceName}.${input.sourcePort}`;
    }
    
    return '0';
  };
  
  // Get output temp var
  const getOutput = (portName: string): string | null => {
    const output = outputs.find(o => o.port === portName);
    return output?.tempVar || null;
  };
  
  // Generate code based on block type
  switch (block.type) {
    case 'constant':
    case 'input':
      // No code needed - values are used directly
      return '';
    
    case 'variable': {
      // Variable write
      const inputExpr = getInput('IN');
      if (block.variableName && inputExpr !== '0') {
        return `${block.variableName} := ${inputExpr};`;
      }
      return '';
    }
    
    case 'output': {
      // Output assignment
      const inputExpr = getInput('IN');
      if (block.variableName) {
        return `${block.variableName} := ${inputExpr};`;
      }
      return '';
    }
    
    // Logic gates
    case 'AND': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} AND ${getInput('IN2')};`;
      return '';
    }
    case 'OR': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} OR ${getInput('IN2')};`;
      return '';
    }
    case 'NOT': {
      const out = getOutput('OUT');
      if (out) return `${out} := NOT ${getInput('IN')};`;
      return '';
    }
    case 'XOR': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} XOR ${getInput('IN2')};`;
      return '';
    }
    case 'NAND': {
      const out = getOutput('OUT');
      if (out) return `${out} := NOT (${getInput('IN1')} AND ${getInput('IN2')});`;
      return '';
    }
    case 'NOR': {
      const out = getOutput('OUT');
      if (out) return `${out} := NOT (${getInput('IN1')} OR ${getInput('IN2')});`;
      return '';
    }
    
    // Comparison operators
    case 'EQ': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} = ${getInput('IN2')};`;
      return '';
    }
    case 'NE': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} <> ${getInput('IN2')};`;
      return '';
    }
    case 'LT': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} < ${getInput('IN2')};`;
      return '';
    }
    case 'LE': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} <= ${getInput('IN2')};`;
      return '';
    }
    case 'GT': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} > ${getInput('IN2')};`;
      return '';
    }
    case 'GE': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} >= ${getInput('IN2')};`;
      return '';
    }
    
    // Math operators
    case 'ADD': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} + ${getInput('IN2')};`;
      return '';
    }
    case 'SUB': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} - ${getInput('IN2')};`;
      return '';
    }
    case 'MUL': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} * ${getInput('IN2')};`;
      return '';
    }
    case 'DIV': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} / ${getInput('IN2')};`;
      return '';
    }
    case 'MOD': {
      const out = getOutput('OUT');
      if (out) return `${out} := ${getInput('IN1')} MOD ${getInput('IN2')};`;
      return '';
    }
    case 'ABS': {
      const out = getOutput('OUT');
      if (out) return `${out} := ABS(${getInput('IN')});`;
      return '';
    }
    case 'MAX': {
      const out = getOutput('OUT');
      if (out) return `${out} := MAX(${getInput('IN1')}, ${getInput('IN2')});`;
      return '';
    }
    case 'MIN': {
      const out = getOutput('OUT');
      if (out) return `${out} := MIN(${getInput('IN1')}, ${getInput('IN2')});`;
      return '';
    }
    case 'LIMIT': {
      const out = getOutput('OUT');
      if (out) return `${out} := LIMIT(${getInput('MN')}, ${getInput('IN')}, ${getInput('MX')});`;
      return '';
    }
    case 'SEL': {
      const out = getOutput('OUT');
      if (out) return `${out} := SEL(${getInput('G')}, ${getInput('IN0')}, ${getInput('IN1')});`;
      return '';
    }
    
    // Function blocks (timers, counters, etc.)
    default:
      if (isFunctionBlock(block.type) && block.instanceName) {
        // Generate FB call with inputs
        const fbInputs: string[] = [];
        
        // Map inputs
        const portMap: Record<string, string[]> = {
          'TON': ['IN', 'PT'],
          'TOF': ['IN', 'PT'],
          'TP': ['IN', 'PT'],
          'R_TRIG': ['CLK'],
          'F_TRIG': ['CLK'],
          'SR': ['S1', 'R'],
          'RS': ['S', 'R1'],
          'CTU': ['CU', 'R', 'PV'],
          'CTD': ['CD', 'LD', 'PV'],
          'CTUD': ['CU', 'CD', 'R', 'LD', 'PV'],
        };
        
        const inputPorts = portMap[block.type] || [];
        for (const port of inputPorts) {
          fbInputs.push(`${port} := ${getInput(port)}`);
        }
        
        return `${block.instanceName}(${fbInputs.join(', ')});`;
      }
      
      return `(* Unknown block type: ${block.type} *)`;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function formatValue(value: unknown, dataType: string): string {
  if (value === undefined || value === null) return '0';
  
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  
  if (typeof value === 'string') {
    // TIME literals
    if (value.startsWith('T#')) return value;
    // String literals
    return `'${value}'`;
  }
  
  if (typeof value === 'number') {
    if (dataType === 'REAL' || dataType === 'LREAL') {
      return value.toString().includes('.') ? value.toString() : `${value}.0`;
    }
    return value.toString();
  }
  
  return String(value);
}

function getOutputType(block: FBDBlock, portName: string): string {
  // Find the port definition
  const port = block.outputs?.find(p => p.name === portName);
  if (port && port.type !== 'ANY' && port.type !== 'ANY_NUM') {
    return port.type;
  }
  
  // Default types by block category
  if (isLogicGate(block.type)) return 'BOOL';
  if (isComparison(block.type)) return 'BOOL';
  if (isMathOperator(block.type)) return 'INT';
  if (['MAX', 'MIN', 'LIMIT', 'SEL'].includes(block.type)) return 'INT';
  
  // FB outputs
  if (isFunctionBlock(block.type)) {
    if (portName === 'Q' || portName === 'Q1' || portName === 'QU' || portName === 'QD') return 'BOOL';
    if (portName === 'ET') return 'TIME';
    if (portName === 'CV') return 'INT';
  }
  
  return 'INT';
}
