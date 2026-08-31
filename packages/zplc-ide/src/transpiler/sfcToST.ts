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

import { parseIOAddress, parseTimeLiteral, tokenize, TokenType } from '@zplc/compiler';
import { validateSFCModel, type SFCModel, type SFCStep, type SFCVariable } from '../models/sfc';

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

export function transpileSFCToST(input: SFCModel): TranspileResult {
  const errors: string[] = [];
  const lines: string[] = [];
  
  try {
    const model = validateSFCModel(input);
    const preflightErrors = validateSFCForTranspilation(model);
    if (preflightErrors.length > 0) {
      return { success: false, source: '', errors: preflightErrors };
    }

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
    
    lines.push('END_VAR');
    lines.push('');

    emitVariableSection(lines, 'VAR', model.variables?.local);
    emitVariableSection(lines, 'VAR_INPUT', model.variables?.inputs);
    emitVariableSection(lines, 'VAR_OUTPUT', model.variables?.outputs);
    
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
      const fromStep = model.steps.find(s => s.id === transition.fromStep)!;
      const toStep = model.steps.find(s => s.id === transition.toStep)!;
      
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
        const action = model.actions!.find(a => a.id === actionRef.actionName || a.name === actionRef.actionName)!;
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

function validateSFCForTranspilation(model: SFCModel): string[] {
  const errors: string[] = [];
  const steps = Array.isArray(model.steps) ? model.steps : [];
  const transitions = Array.isArray(model.transitions) ? model.transitions : [];
  const actions = Array.isArray(model.actions) ? model.actions : [];

  validateIdentifier(model.name, 'SFC name', errors);

  validateUniqueIds(steps, 'step', errors);
  validateUniqueIds(transitions, 'transition', errors);
  validateUniqueIds(actions, 'action', errors);

  const stepNames = new Set<string>();
  const stepAliases = new Map<string, string>();
  for (const step of steps) {
    if (typeof step.isInitial !== 'boolean') {
      errors.push(`Step ${describeId(step.id)} isInitial must be a boolean`);
    }
    validateIdentifier(step.id, 'Step id', errors);
    if (!isNonEmptyString(step.name)) {
      errors.push(`Step ${describeId(step.id)} name must be non-empty`);
      continue;
    }
    validateIdentifier(step.name, 'Step name', errors);
    validateComment(step.comment, `Step ${describeId(step.id)} comment`, errors);
    if (stepNames.has(step.name.toUpperCase())) {
      errors.push(`Duplicate step name '${step.name}' makes .T references ambiguous`);
    }
    stepNames.add(step.name.toUpperCase());
    for (const alias of [step.id, step.name]) {
      const canonicalAlias = alias.toUpperCase();
      const canonicalStepId = step.id.toUpperCase();
      const owner = stepAliases.get(canonicalAlias);
      if (owner && owner !== canonicalStepId) {
        errors.push(`Step alias '${alias}' makes .T references ambiguous`);
      }
      stepAliases.set(canonicalAlias, canonicalStepId);
    }

    if (step.actions !== undefined && !Array.isArray(step.actions)) {
      errors.push(`Step ${describeId(step.id)} actions must be an array`);
      continue;
    }
    for (const actionRef of step.actions ?? []) {
      if (!isRecord(actionRef)) {
        errors.push(`Step ${describeId(step.id)} action references must be objects`);
        continue;
      }
      if (!isNonEmptyString(actionRef.actionName)) {
        errors.push(`Step ${describeId(step.id)} action reference must be non-empty`);
      }
      if (actionRef.qualifier !== 'N') {
        errors.push(`Step ${describeId(step.id)} only N action qualifier is supported`);
      }
      if (actionRef.time !== undefined) {
        errors.push(`Step ${describeId(step.id)} N action qualifier does not support time`);
      }
      validateComment(actionRef.comment, `Step ${describeId(step.id)} action comment`, errors);
    }
  }

  validateVariables(model.variables, steps.map((step) => step.id), errors);

  const stepIds = new Set(steps.map((step) => step.id));
  for (const transition of transitions) {
    validateIdentifier(transition.id, 'Transition id', errors);
    validateComment(transition.comment, `Transition ${describeId(transition.id)} comment`, errors);
    if (!isNonEmptyString(transition.fromStep) || !stepIds.has(transition.fromStep)) {
      errors.push(`Transition ${describeId(transition.id)} references an unknown step '${String(transition.fromStep)}'`);
    }
    if (!isNonEmptyString(transition.toStep) || !stepIds.has(transition.toStep)) {
      errors.push(`Transition ${describeId(transition.id)} references an unknown step '${String(transition.toStep)}'`);
    }
    if (!isNonEmptyString(transition.condition)) {
      errors.push(`Transition ${describeId(transition.id)} condition must be non-empty`);
    } else {
      validateTransitionCondition(transition.condition, transition.id, errors);
    }
  }

  for (const action of actions) {
    if (!isRecord(action)) {
      errors.push('Action entries must be objects');
      continue;
    }
    validateIdentifier(action.id, 'Action id', errors);
    if (!isNonEmptyString(action.name)) {
      errors.push(`Action ${describeId(action.id)} name must be non-empty`);
    }
    validateIdentifier(action.name, 'Action name', errors);
    validateComment(action.comment, `Action ${describeId(action.id)} comment`, errors);
    if (action.type !== 'ST') {
      errors.push(`Action ${describeId(action.id)} only ST actions are supported`);
    }
    if (typeof action.body !== 'string' || action.body.trim().length === 0) {
      errors.push(`Action ${describeId(action.id)} body must be a non-empty string`);
    } else {
      validateActionBody(action.body, action.id, errors);
    }
  }

  for (const step of steps) {
    for (const actionRef of Array.isArray(step.actions) ? step.actions : []) {
      if (!isRecord(actionRef)) continue;
      if (!isNonEmptyString(actionRef.actionName)) continue;
      const matches = actions.filter((action) => isRecord(action) && (action.id === actionRef.actionName || action.name === actionRef.actionName));
      if (matches.length === 0) {
        errors.push(`Step ${describeId(step.id)} action '${actionRef.actionName}' does not resolve`);
      } else if (matches.length > 1) {
        errors.push(`Step ${describeId(step.id)} action '${actionRef.actionName}' resolves to multiple actions`);
      }
    }
  }

  return errors;
}

function validateUniqueIds(items: unknown[], label: string, errors: string[]): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!isRecord(item)) {
      errors.push(`${label[0].toUpperCase()}${label.slice(1)} entries must be objects`);
      continue;
    }
    if (!isNonEmptyString(item.id)) {
      errors.push(`${label[0].toUpperCase()}${label.slice(1)} id must be non-empty`);
      continue;
    }
    const canonicalId = item.id.toUpperCase();
    if (ids.has(canonicalId)) {
      errors.push(`Duplicate ${label} id '${item.id}'`);
    }
    ids.add(canonicalId);
  }
}

const IEC_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BLOCK_COMMENT_DELIMITERS = /\(\*|\*\)/;

const DECLARATION_OR_UNIT_TOKENS: Set<string> = new Set([
  TokenType.PROGRAM, TokenType.END_PROGRAM, TokenType.FUNCTION, TokenType.END_FUNCTION,
  TokenType.FUNCTION_BLOCK, TokenType.END_FUNCTION_BLOCK, TokenType.TYPE, TokenType.END_TYPE,
  TokenType.METHOD, TokenType.END_METHOD, TokenType.VAR, TokenType.END_VAR,
  TokenType.VAR_INPUT, TokenType.VAR_OUTPUT, TokenType.VAR_TEMP, TokenType.VAR_GLOBAL,
  TokenType.VAR_IN_OUT, TokenType.RETURN,
]);

const CONTROL_TOKENS: Set<string> = new Set([
  TokenType.IF, TokenType.THEN, TokenType.ELSE, TokenType.ELSIF, TokenType.END_IF,
  TokenType.CASE, TokenType.OF, TokenType.END_CASE, TokenType.FOR, TokenType.END_FOR,
  TokenType.WHILE, TokenType.END_WHILE, TokenType.REPEAT, TokenType.UNTIL, TokenType.END_REPEAT,
  TokenType.DO, TokenType.TO, TokenType.BY, TokenType.EXIT, TokenType.CONTINUE,
]);

const BLOCK_START_TOKENS: Set<string> = new Set([
  TokenType.IF, TokenType.CASE, TokenType.FOR, TokenType.WHILE, TokenType.REPEAT,
]);

function validateIdentifier(value: unknown, label: string, errors: string[]): void {
  if (!isNonEmptyString(value) || !IEC_IDENTIFIER.test(value)) {
    errors.push(`${label} must be an IEC identifier`);
    return;
  }
  if (tokenize(value)[0]?.type !== TokenType.IDENTIFIER) errors.push(`${label} may not be an IEC keyword`);
}

function validateType(value: unknown, label: string, errors: string[]): void {
  if (!isNonEmptyString(value) || !IEC_IDENTIFIER.test(value)) errors.push(`${label} must be an IEC identifier`);
}

function validateComment(value: unknown, label: string, errors: string[]): void {
  if (value !== undefined && typeof value !== 'string') {
    errors.push(`${label} must be a string`);
  } else if (typeof value === 'string' && BLOCK_COMMENT_DELIMITERS.test(value)) {
    errors.push(`${label} may not contain ST block-comment delimiters`);
  }
}

function validateVariables(variables: unknown, stepIds: string[], errors: string[]): void {
  if (variables === undefined) return;
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    errors.push('Variables must be an object');
    return;
  }
  const record = variables as Record<string, unknown>;
  const sections: Array<[string, unknown, boolean]> = [
    ['local', record.local, true],
    ['inputs', record.inputs, false],
    ['outputs', record.outputs, true],
  ];
  const names = new Set<string>();
  const reserved = new Set(stepIds.flatMap((id) => [`X_${id}`, `T_${id}`]).map((name) => name.toUpperCase()));
  for (const [section, value, required] of sections) {
    if (value === undefined && !required) continue;
    if (!Array.isArray(value)) {
      errors.push(`Variables ${section} must be an array`);
      continue;
    }
    for (const variable of value) {
      if (!variable || typeof variable !== 'object' || Array.isArray(variable)) {
        errors.push(`Variables ${section} entries must be objects`);
        continue;
      }
      const entry = variable as Record<string, unknown>;
      validateIdentifier(entry.name, `Variable ${section} name`, errors);
      validateType(entry.type, `Variable ${String(entry.name)} type`, errors);
      validateComment(entry.comment, `Variable ${String(entry.name)} comment`, errors);
      if (isNonEmptyString(entry.name)) {
        const canonicalName = entry.name.toUpperCase();
        if (names.has(canonicalName)) errors.push(`Duplicate variable name '${entry.name}'`);
        if (reserved.has(canonicalName)) errors.push(`Variable name '${entry.name}' collides with generated step state`);
        names.add(canonicalName);
      }
      if (entry.address !== undefined) {
        if (!isNonEmptyString(entry.address)) {
          errors.push(`Variable ${String(entry.name)} address must be a non-empty string`);
        } else {
          try { parseIOAddress(entry.address); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
        }
      }
      validateInitialValue(entry.initialValue, entry.type, entry.name, errors);
    }
  }
}

function validateInitialValue(value: unknown, type: unknown, name: unknown, errors: string[]): void {
  if (value === undefined || value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`Variable ${String(name)} initialValue must be finite`);
    return;
  }
  if (typeof value !== 'string') {
    errors.push(`Variable ${String(name)} initialValue has an unsupported type`);
    return;
  }
  if (typeof type === 'string' && type.toUpperCase() === 'TIME') {
    try { parseTimeLiteral(value); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
}

function validateActionBody(body: string, id: string, errors: string[]): void {
  if (BLOCK_COMMENT_DELIMITERS.test(body)) {
    errors.push(`Action ${describeId(id)} body may not contain ST block-comment delimiters`);
    return;
  }
  let tokens;
  try { tokens = tokenize(body); } catch (error) { errors.push(`Action ${describeId(id)} body is invalid: ${error instanceof Error ? error.message : String(error)}`); return; }
  const stack: Array<{ start: string; elseSeen: boolean }> = [];
  const pairs: Map<string, string> = new Map([
    [TokenType.END_IF, TokenType.IF], [TokenType.END_CASE, TokenType.CASE],
    [TokenType.END_FOR, TokenType.FOR], [TokenType.END_WHILE, TokenType.WHILE],
    [TokenType.END_REPEAT, TokenType.REPEAT],
  ]);
  for (const token of tokens) {
    if (DECLARATION_OR_UNIT_TOKENS.has(token.type)) {
      errors.push(`Action ${describeId(id)} body may not contain ${token.type}`);
      return;
    }
    if (BLOCK_START_TOKENS.has(token.type)) {
      stack.push({ start: token.type, elseSeen: false });
    } else if (token.type === TokenType.ELSE || token.type === TokenType.ELSIF) {
      const top = stack.at(-1);
      if (!top || (top.start !== TokenType.IF && top.start !== TokenType.CASE) || (token.type === TokenType.ELSIF && (top.start !== TokenType.IF || top.elseSeen))) {
        errors.push(`Action ${describeId(id)} body has ${token.type} outside a valid branch`);
        return;
      }
      if (token.type === TokenType.ELSE) top.elseSeen = true;
    } else if (token.type === TokenType.UNTIL) {
      if (stack.at(-1)?.start !== TokenType.REPEAT) {
        errors.push(`Action ${describeId(id)} body has UNTIL outside REPEAT`);
        return;
      }
    } else if (pairs.has(token.type)) {
      const expected = pairs.get(token.type)!;
      if (stack.pop()?.start !== expected) {
        errors.push(`Action ${describeId(id)} body has unmatched ${token.type}`);
        return;
      }
    }
  }
  if (stack.length > 0) errors.push(`Action ${describeId(id)} body has unclosed ${stack.at(-1)!.start}`);
}

function validateTransitionCondition(condition: string, id: string, errors: string[]): void {
  if (BLOCK_COMMENT_DELIMITERS.test(condition) || condition.includes('//')) {
    errors.push(`Transition ${describeId(id)} condition may not contain comments`);
    return;
  }
  let tokens;
  try { tokens = tokenize(condition); } catch (error) { errors.push(`Transition ${describeId(id)} condition is invalid: ${error instanceof Error ? error.message : String(error)}`); return; }
  if (tokens.some((token) => token.type === TokenType.ASSIGN || token.type === TokenType.SEMICOLON || CONTROL_TOKENS.has(token.type) || DECLARATION_OR_UNIT_TOKENS.has(token.type))) {
    errors.push(`Transition ${describeId(id)} condition must be a single expression`);
    return;
  }
  let depth = 0;
  for (const token of tokens) {
    if (token.type === TokenType.LPAREN) depth++;
    if (token.type === TokenType.RPAREN && --depth < 0) {
      errors.push(`Transition ${describeId(id)} condition has unmatched ')'`);
      return;
    }
  }
  if (depth !== 0) errors.push(`Transition ${describeId(id)} condition has unbalanced parentheses`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function describeId(value: unknown): string {
  return isNonEmptyString(value) ? `'${value}'` : '<unknown>';
}

function emitVariableSection(lines: string[], section: 'VAR' | 'VAR_INPUT' | 'VAR_OUTPUT', variables: SFCVariable[] | undefined): void {
  if (!variables?.length) return;
  lines.push(section);
  for (const variable of variables) {
    const address = variable.address ? ` AT ${variable.address}` : '';
    const initialValue = variable.initialValue !== undefined ? ` := ${formatValue(variable.initialValue, variable.type)}` : '';
    const comment = variable.comment ? ` (* ${variable.comment} *)` : '';
    lines.push(`    ${variable.name}${address} : ${variable.type}${initialValue};${comment}`);
  }
  lines.push('END_VAR');
  lines.push('');
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
      new RegExp(`\\b${escapeRegExp(step.name)}\\.T\\b`, 'g'),
      new RegExp(`\\b${escapeRegExp(step.id)}\\.T\\b`, 'g'),
    ];
    
    for (const pattern of patterns) {
      result = result.replace(pattern, `T_${step.id}.ET`);
    }
  }
  
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    if (dataType.toUpperCase() === 'TIME') return value;
    // String literals
    return `'${value.replaceAll("'", "''")}'`;
  }
  
  if (typeof value === 'number') {
    if (dataType === 'REAL' || dataType === 'LREAL') {
      return value.toString().includes('.') ? value.toString() : `${value}.0`;
    }
    return value.toString();
  }
  
  return String(value);
}
