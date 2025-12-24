/**
 * SFC to Structured Text Transpiler
 * 
 * Converts SFC (Sequential Function Chart) models to IEC 61131-3 Structured Text.
 * This enables the visual editor to leverage the existing ST compiler pipeline.
 * 
 * SFC is a state machine language where:
 * - Steps represent states with associated actions
 * - Transitions define conditions to move between steps
 * - Actions are executed when a step is active
 * 
 * Strategy:
 * 1. Generate step active flags (X_step_name : BOOL)
 * 2. Generate step timers (T_step_name : TIME for .T property)
 * 3. Generate transition logic
 * 4. Generate action execution based on active steps
 */

import type { SFCModel, SFCStep } from '../models/sfc';

// =============================================================================
// Types
// =============================================================================

interface TranspileResult {
  success: boolean;
  source: string;
  errors: string[];
}

// =============================================================================
// Transpiler
// =============================================================================

export function transpileSFCToST(model: SFCModel): TranspileResult {
  const errors: string[] = [];
  const lines: string[] = [];
  
  try {
    // Generate program header
    lines.push(`PROGRAM ${model.name}`);
    lines.push('');
    lines.push('(* SFC Generated from Visual Editor *)');
    lines.push('');
    
    // Generate variable declarations
    lines.push('VAR');
    
    // Step active flags
    lines.push('    (* Step Active Flags *)');
    for (const step of model.steps) {
      const initial = step.isInitial ? ' := TRUE' : ' := FALSE';
      const comment = step.comment 
        ? ` (* Step: ${step.name} - ${step.comment} *)` 
        : ` (* Step: ${step.name} *)`;
      lines.push(`    X_${step.id} : BOOL${initial};${comment}`);
    }
    lines.push('');
    
    // Step timers (for .T property)
    lines.push('    (* Step Elapsed Timers *)');
    for (const step of model.steps) {
      lines.push(`    T_${step.id} : TON; (* Timer for ${step.name} *)`);
    }
    lines.push('');
    
    // Local variables from model
    if (model.variables?.local && model.variables.local.length > 0) {
      lines.push('    (* Local Variables *)');
      for (const v of model.variables.local) {
        const init = v.initialValue !== undefined ? ` := ${formatValue(v.initialValue, v.type)}` : '';
        const comment = v.comment ? ` (* ${v.comment} *)` : '';
        lines.push(`    ${v.name} : ${v.type}${init};${comment}`);
      }
      lines.push('');
    }
    
    lines.push('END_VAR');
    lines.push('');
    
    // Output variables (I/O mapped)
    if (model.variables?.outputs && model.variables.outputs.length > 0) {
      lines.push('VAR_OUTPUT');
      for (const v of model.variables.outputs) {
        const address = v.address ? ` AT ${v.address}` : '';
        const comment = v.comment ? ` (* ${v.comment} *)` : '';
        lines.push(`    ${v.name}${address} : ${v.type};${comment}`);
      }
      lines.push('END_VAR');
      lines.push('');
    }
    
    // =========================================================================
    // Step Timers - Track elapsed time in each step
    // =========================================================================
    lines.push('(* === Step Timers === *)');
    for (const step of model.steps) {
      lines.push(`T_${step.id}(IN := X_${step.id}, PT := T#24h);`);
    }
    lines.push('');
    
    // =========================================================================
    // Transition Logic
    // =========================================================================
    lines.push('(* === Transition Logic === *)');
    
    for (const transition of model.transitions) {
      const fromStep = model.steps.find(s => s.id === transition.fromStep);
      const toStep = model.steps.find(s => s.id === transition.toStep);
      
      if (!fromStep || !toStep) {
        errors.push(`Invalid transition ${transition.id}: step not found`);
        continue;
      }
      
      // Transform condition to replace step.T with timer access
      const condition = transformCondition(transition.condition, model.steps);
      
      // Build transition comment
      const transComment = transition.comment 
        ? `Transition: ${fromStep.name} -> ${toStep.name} (${transition.comment})`
        : `Transition: ${fromStep.name} -> ${toStep.name}`;
      
      lines.push(`(* ${transComment} *)`);
      lines.push(`IF X_${fromStep.id} AND (${condition}) THEN`);
      lines.push(`    X_${fromStep.id} := FALSE;`);
      lines.push(`    X_${toStep.id} := TRUE;`);
      lines.push(`END_IF;`);
      lines.push('');
    }
    
    // =========================================================================
    // Action Execution
    // =========================================================================
    lines.push('(* === Action Execution === *)');
    
    for (const step of model.steps) {
      if (!step.actions || step.actions.length === 0) continue;
      
      // Build step comment
      const stepComment = step.comment 
        ? `Step: ${step.name} - ${step.comment}`
        : `Step: ${step.name}`;
      
      lines.push(`(* ${stepComment} *)`);
      lines.push(`IF X_${step.id} THEN`);
      
      for (const actionRef of step.actions) {
        // Find the action definition
        const action = model.actions?.find(a => a.id === actionRef.actionName || a.name === actionRef.actionName);
        if (action) {
          // Add action comment if present
          if (action.comment) {
            lines.push(`    (* Action: ${action.name} - ${action.comment} *)`);
          } else {
            lines.push(`    (* Action: ${action.name} *)`);
          }
          // Add action qualifier comment if applicable
          if (actionRef.comment) {
            lines.push(`    (* ${actionRef.comment} *)`);
          }
          // Embed the action body
          const actionLines = action.body.split('\n');
          for (const line of actionLines) {
            lines.push(`    ${line.trim()}`);
          }
        } else {
          lines.push(`    (* Action not found: ${actionRef.actionName} *)`);
        }
      }
      
      lines.push('END_IF;');
      lines.push('');
    }
    
    lines.push('END_PROGRAM');
    
    if (errors.length > 0) {
      return {
        success: false,
        source: '',
        errors,
      };
    }
    
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
// Helpers
// =============================================================================

/**
 * Transform SFC-specific condition syntax to standard ST.
 * Replaces step.T with timer elapsed time access.
 */
function transformCondition(condition: string, steps: SFCStep[]): string {
  let result = condition;
  
  // Replace step_name.T with T_step_id.ET
  for (const step of steps) {
    // Match "step_name.T" or "step.T" patterns
    const patterns = [
      new RegExp(`${step.name}\\.T`, 'g'),
      new RegExp(`${step.id}\\.T`, 'g'),
    ];
    
    for (const pattern of patterns) {
      result = result.replace(pattern, `T_${step.id}.ET`);
    }
  }
  
  return result;
}

/**
 * Format a value for ST code generation.
 */
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
