/**
 * LD to Structured Text Transpiler
 * 
 * Converts LD (Ladder Diagram) models to IEC 61131-3 Structured Text.
 * 
 * Strategy:
 * - Each rung becomes a boolean expression
 * - Contacts in series (same row) are AND logic
 * - Contacts in parallel (different rows with vertical links) are OR logic
 * - Coils are assignments to outputs
 * - Function blocks are called inline
 * 
 * Supports both grid-based and legacy linear models.
 */

import type { 
  LDModel, 
  LDRung, 
  LDElement, 
} from '../models/ld';
import { isGridBasedRung, convertToGridRung, isContact, isCoil, isFunctionBlock } from '../models/ld';

// =============================================================================
// Types
// =============================================================================

interface TranspileResult {
  success: boolean;
  source: string;
  errors: string[];
}

// =============================================================================
// Grid Analysis Helpers
// =============================================================================

/**
 * Represents a "branch" - a horizontal path through the rung
 */
interface Branch {
  row: number;
  elements: LDElement[];
}

/**
 * Analyze the grid to extract branches and their OR relationships
 */
function analyzeGrid(rung: LDRung): { branches: Branch[]; orGroups: number[][] } {
  if (!rung.grid || rung.grid.length === 0) {
    return { branches: [], orGroups: [] };
  }
  
  const branches: Branch[] = [];
  
  // Extract elements from each row
  rung.grid.forEach((row, rowIdx) => {
    const elements: LDElement[] = [];
    row.forEach(cell => {
      if (cell.element) {
        elements.push(cell.element);
      }
    });
    
    if (elements.length > 0) {
      branches.push({ row: rowIdx, elements });
    }
  });
  
  // Analyze vertical links to determine OR groups
  const verticalLinks = rung.verticalLinks || [];
  const orGroups: number[][] = [];
  
  if (verticalLinks.length > 0) {
    // Group connected rows together
    const rowConnections = new Map<number, Set<number>>();
    
    verticalLinks.forEach(link => {
      if (!rowConnections.has(link.fromRow)) {
        rowConnections.set(link.fromRow, new Set([link.fromRow]));
      }
      if (!rowConnections.has(link.toRow)) {
        rowConnections.set(link.toRow, new Set([link.toRow]));
      }
      
      // Merge the sets
      const fromSet = rowConnections.get(link.fromRow)!;
      const toSet = rowConnections.get(link.toRow)!;
      
      const mergedSet = new Set([...fromSet, ...toSet]);
      mergedSet.forEach(r => rowConnections.set(r, mergedSet));
    });
    
    // Convert to groups (avoid duplicates)
    const seen = new Set<string>();
    rowConnections.forEach(group => {
      const sortedGroup = [...group].sort((a, b) => a - b);
      const key = sortedGroup.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        orGroups.push(sortedGroup);
      }
    });
  }
  
  return { branches, orGroups };
}

/**
 * Generate expression for a single element
 */
function elementToExpression(element: LDElement): string {
  switch (element.type) {
    case 'contact_no':
      return element.variable || 'FALSE';
    case 'contact_nc':
      return `NOT ${element.variable || 'FALSE'}`;
    case 'contact_p':
      // Rising edge - would need previous state tracking
      return `(${element.variable || 'FALSE'} AND NOT _prev_${element.variable})`;
    case 'contact_n':
      // Falling edge
      return `(NOT ${element.variable || 'FALSE'} AND _prev_${element.variable})`;
    default:
      return '';
  }
}

/**
 * Generate expression for a branch (row) - AND all contacts together
 */
function branchToExpression(branch: Branch): string {
  const contacts = branch.elements.filter(e => isContact(e.type));
  
  if (contacts.length === 0) {
    return 'TRUE';
  }
  
  const exprs = contacts.map(e => elementToExpression(e)).filter(e => e !== '');
  return exprs.length > 0 ? exprs.join(' AND ') : 'TRUE';
}

/**
 * Generate expression for a rung with OR groups
 */
function generateRungExpression(
  branches: Branch[], 
  orGroups: number[][]
): string {
  if (branches.length === 0) {
    return 'TRUE';
  }
  
  if (branches.length === 1 || orGroups.length === 0) {
    // Simple case: all in series
    return branchToExpression(branches[0]);
  }
  
  // Complex case: handle OR groups
  const branchExprs: string[] = [];
  const processedRows = new Set<number>();
  
  // First, handle OR groups
  for (const group of orGroups) {
    const groupExprs = group
      .map(rowIdx => branches.find(b => b.row === rowIdx))
      .filter((b): b is Branch => b !== undefined)
      .map(b => branchToExpression(b));
    
    if (groupExprs.length > 1) {
      branchExprs.push(`(${groupExprs.join(' OR ')})`);
    } else if (groupExprs.length === 1) {
      branchExprs.push(groupExprs[0]);
    }
    
    group.forEach(r => processedRows.add(r));
  }
  
  // Then, handle rows not in any OR group (they're in series)
  for (const branch of branches) {
    if (!processedRows.has(branch.row)) {
      branchExprs.push(branchToExpression(branch));
    }
  }
  
  return branchExprs.length > 0 ? branchExprs.join(' AND ') : 'TRUE';
}

// =============================================================================
// Transpiler
// =============================================================================

export function transpileLDToST(model: LDModel): TranspileResult {
  const errors: string[] = [];
  const lines: string[] = [];
  
  try {
    // Generate program header
    lines.push(`PROGRAM ${model.name}`);
    lines.push('');
    
    // Generate variable declarations
    lines.push('VAR');
    
    // Local variables from model
    for (const v of model.variables.local) {
      const init = v.initialValue !== undefined ? ` := ${formatValue(v.initialValue, v.type)}` : '';
      const comment = v.comment ? ` (* ${v.comment} *)` : '';
      
      // Special handling for FB types
      if (['TON', 'TOF', 'TP', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG', 'SR', 'RS'].includes(v.type)) {
        lines.push(`    ${v.name} : ${v.type};${comment}`);
      } else {
        lines.push(`    ${v.name} : ${v.type}${init};${comment}`);
      }
    }
    
    // Internal rung results
    for (let i = 0; i < model.rungs.length; i++) {
      lines.push(`    _rung${i + 1}_result : BOOL;`);
    }
    
    lines.push('END_VAR');
    lines.push('');
    
    // Output variables
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
    lines.push('(* LD Execution - Auto-generated *)');
    lines.push('');
    
    for (const rung of model.rungs) {
      const rungCode = generateRungCode(rung);
      if (rung.comment) {
        lines.push(`(* Rung ${rung.number}: ${rung.comment} *)`);
      } else {
        lines.push(`(* Rung ${rung.number} *)`);
      }
      lines.push(...rungCode);
      lines.push('');
    }
    
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
// Rung Code Generation
// =============================================================================

function generateRungCode(rung: LDRung): string[] {
  // Convert to grid-based if necessary
  const gridRung = isGridBasedRung(rung) ? rung : convertToGridRung(rung);
  
  const lines: string[] = [];
  const { branches, orGroups } = analyzeGrid(gridRung);
  
  // Collect coils and function blocks from all branches
  const allElements: LDElement[] = [];
  branches.forEach(b => allElements.push(...b.elements));
  
  const coils = allElements.filter(e => isCoil(e.type));
  const fbs = allElements.filter(e => isFunctionBlock(e.type));
  
  // Generate rung expression (contacts only)
  const rungExpr = generateRungExpression(branches, orGroups);
  
  // Store rung result
  lines.push(`_rung${rung.number}_result := ${rungExpr};`);
  
  // Generate function block calls
  for (const fb of fbs) {
    if (fb.fbType && fb.instance) {
      const params: string[] = [];
      
      // Input parameters
      if (fb.parameters) {
        for (const [key, value] of Object.entries(fb.parameters)) {
          if (value === 'CONNECTED') {
            params.push(`${key} := _rung${rung.number}_result`);
          } else {
            params.push(`${key} := ${value}`);
          }
        }
      } else {
        // Default: connect IN to rung result for timers/triggers
        if (['TON', 'TOF', 'TP', 'R_TRIG', 'F_TRIG'].includes(fb.fbType)) {
          params.push(`IN := _rung${rung.number}_result`);
        } else if (['CTU', 'CTD'].includes(fb.fbType)) {
          params.push(`CU := _rung${rung.number}_result`);
        }
      }
      
      lines.push(`${fb.instance}(${params.join(', ')});`);
      
      // Output bindings
      if (fb.outputs) {
        for (const [port, variable] of Object.entries(fb.outputs)) {
          lines.push(`${variable} := ${fb.instance}.${port};`);
        }
      }
    }
  }
  
  // Generate coil assignments
  for (const coil of coils) {
    if (!coil.variable) continue;
    
    switch (coil.type) {
      case 'coil':
        lines.push(`${coil.variable} := _rung${rung.number}_result;`);
        break;
      case 'coil_negated':
        lines.push(`${coil.variable} := NOT _rung${rung.number}_result;`);
        break;
      case 'coil_set':
        lines.push(`IF _rung${rung.number}_result THEN ${coil.variable} := TRUE; END_IF;`);
        break;
      case 'coil_reset':
        lines.push(`IF _rung${rung.number}_result THEN ${coil.variable} := FALSE; END_IF;`);
        break;
      case 'coil_p':
        // One-shot on rising edge - would need previous state tracking
        lines.push(`(* P-coil: ${coil.variable} - requires edge detection *)`);
        lines.push(`${coil.variable} := _rung${rung.number}_result AND NOT _prev_rung${rung.number};`);
        break;
      case 'coil_n':
        // One-shot on falling edge
        lines.push(`(* N-coil: ${coil.variable} - requires edge detection *)`);
        lines.push(`${coil.variable} := NOT _rung${rung.number}_result AND _prev_rung${rung.number};`);
        break;
    }
  }
  
  return lines;
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
    if (value.startsWith('T#')) return value;
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
