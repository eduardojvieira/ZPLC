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

import type { LDBranch } from '../models/ld';

/**
 * Element with its position in the grid
 */
interface PositionedElement {
  element: LDElement;
  row: number;
  col: number;
}

/**
 * Collect all contacts from the grid with their positions
 */
function collectContacts(rung: LDRung): PositionedElement[] {
  const contacts: PositionedElement[] = [];
  
  if (!rung.grid) return contacts;
  
  rung.grid.forEach((row, rowIdx) => {
    row.forEach((cell, colIdx) => {
      if (cell.element && isContact(cell.element.type)) {
        contacts.push({
          element: cell.element,
          row: rowIdx,
          col: cell.element.col ?? colIdx,
        });
      }
    });
  });
  
  return contacts;
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
 * Generate expression for a rung by analyzing column regions
 * 
 * Strategy:
 * 1. Identify branch regions (startCol to endCol)
 * 2. For contacts OUTSIDE any branch: series (AND)
 * 3. For contacts INSIDE a branch: parallel by row (OR), then AND with rest
 * 
 * Example Rung 1 of motor control:
 *   Row 0: [StopPB_NC @ col0] [Overload_NC @ col1] [StartPB_NO @ col2] ... [Coil @ col7]
 *   Row 1:                                         [MotorRunning @ col2]
 *   Branch: { startCol: 2, endCol: 4, rows: [0, 1] }
 * 
 * Result: NOT StopPB AND NOT Overload AND (StartPB OR MotorRunning)
 */
function generateRungExpression(rung: LDRung): string {
  const contacts = collectContacts(rung);
  
  if (contacts.length === 0) {
    return 'TRUE';
  }
  
  const branches = rung.branches || [];
  
  // No branches: simple series (AND all contacts on row 0)
  if (branches.length === 0) {
    const row0Contacts = contacts.filter(c => c.row === 0);
    row0Contacts.sort((a, b) => a.col - b.col);
    const exprs = row0Contacts.map(c => elementToExpression(c.element)).filter(e => e !== '');
    return exprs.length > 0 ? exprs.join(' AND ') : 'TRUE';
  }
  
  // With branches: need to build expression respecting column regions
  
  // Group columns into regions: "series" (outside branches) or "parallel" (inside a branch)
  interface Region {
    type: 'series' | 'parallel';
    startCol: number;
    endCol: number;
    branch?: LDBranch;
  }
  
  const regions: Region[] = [];
  let currentCol = 0;
  const numCols = rung.gridConfig?.cols || 8;
  
  // Sort branches by startCol
  const sortedBranches = [...branches].sort((a, b) => a.startCol - b.startCol);
  
  for (const branch of sortedBranches) {
    // Add series region before this branch (if any)
    if (branch.startCol > currentCol) {
      regions.push({
        type: 'series',
        startCol: currentCol,
        endCol: branch.startCol - 1,
      });
    }
    
    // Add parallel region for this branch
    regions.push({
      type: 'parallel',
      startCol: branch.startCol,
      endCol: branch.endCol,
      branch,
    });
    
    currentCol = branch.endCol + 1;
  }
  
  // Add trailing series region (if any)
  if (currentCol < numCols) {
    regions.push({
      type: 'series',
      startCol: currentCol,
      endCol: numCols - 1,
    });
  }
  
  // Now generate expression for each region
  const regionExprs: string[] = [];
  
  for (const region of regions) {
    const regionContacts = contacts.filter(c => c.col >= region.startCol && c.col <= region.endCol);
    
    if (regionContacts.length === 0) continue;
    
    if (region.type === 'series') {
      // All contacts in series (AND)
      // Only use row 0 contacts for series regions
      const row0Contacts = regionContacts.filter(c => c.row === 0);
      row0Contacts.sort((a, b) => a.col - b.col);
      
      for (const c of row0Contacts) {
        const expr = elementToExpression(c.element);
        if (expr) regionExprs.push(expr);
      }
    } else {
      // Parallel region: group by row, OR between rows
      const branch = region.branch!;
      const rowExprs: string[] = [];
      
      for (const rowIdx of branch.rows) {
        const rowContacts = regionContacts.filter(c => c.row === rowIdx);
        rowContacts.sort((a, b) => a.col - b.col);
        
        // AND contacts within the same row
        const exprs = rowContacts.map(c => elementToExpression(c.element)).filter(e => e !== '');
        if (exprs.length > 0) {
          rowExprs.push(exprs.length === 1 ? exprs[0] : `(${exprs.join(' AND ')})`);
        }
      }
      
      // OR between rows
      if (rowExprs.length > 1) {
        regionExprs.push(`(${rowExprs.join(' OR ')})`);
      } else if (rowExprs.length === 1) {
        regionExprs.push(rowExprs[0]);
      }
    }
  }
  
  return regionExprs.length > 0 ? regionExprs.join(' AND ') : 'TRUE';
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
    
    // Generate input variable declarations
    if (model.variables.inputs && model.variables.inputs.length > 0) {
      lines.push('VAR_INPUT');
      for (const v of model.variables.inputs) {
        const address = v.address ? ` AT ${v.address}` : '';
        const comment = v.comment ? ` (* ${v.comment} *)` : '';
        lines.push(`    ${v.name}${address} : ${v.type};${comment}`);
      }
      lines.push('END_VAR');
      lines.push('');
    }
    
    // Generate local variable declarations
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
  
  // Collect all elements from the grid
  const allElements: LDElement[] = [];
  if (gridRung.grid) {
    gridRung.grid.forEach(row => {
      row.forEach(cell => {
        if (cell.element) {
          allElements.push(cell.element);
        }
      });
    });
  }
  
  const coils = allElements.filter(e => isCoil(e.type));
  const fbs = allElements.filter(e => isFunctionBlock(e.type));
  
  // Generate rung expression (contacts only) using the new column-aware algorithm
  const rungExpr = generateRungExpression(gridRung);
  
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
