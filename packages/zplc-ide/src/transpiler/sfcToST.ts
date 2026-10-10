/**
 * SFC to Structured Text Transpiler
 * 
 * Converts SFC (Sequential Function Chart) models to IEC 61131-3 Structured Text.
 * This enables the visual editor to leverage the existing ST compiler pipeline.
 * 
 * SFC is a state machine language where:
 * - Steps represent states with associated actions
 * - Transitions define conditions to move between steps
 * - Actions are executed according to their qualifier while a step is active
 * 
 * One scan runs in this order, so that every step that became active runs its actions for at least
 * one scan and a sequence crosses at most one transition per scan (LNG-024):
 * 1. Step timers (the time .T of each step) are updated.
 * 2. Actions run on the state the scan started with: N while the step is active, S until an R,
 *    L for a time, D after a time, P/P1 when the step was entered, P0 when it was left.
 * 3. Transitions are evaluated against that same state, in priority order within a step (the first
 *    that holds wins), and only then applied: all the steps they leave are cleared, then all the
 *    steps they enter are set (simultaneous divergence and convergence).
 * Anything the transpiler cannot translate (an unknown qualifier, a reference to a missing step...)
 * is an error that names the step, transition or action.
 */

import { parseIOAddress, parseTimeLiteral, tokenize, TokenType } from '@zplc/compiler';
import { validateSFCModel, type SFCAction, type SFCModel, type SFCStep, type SFCTransition, type SFCVariable } from '../models/sfc';
import {
  ElementError, Listing, Problems, actionElement, stepElement, transitionElement,
  type ElementDiagnostic, type SourceElementId, type SourceMapRange,
} from '../models/sourceElements';

// =============================================================================
// Types
// =============================================================================

interface TranspileResult {
  success: boolean;
  source: string;
  errors: string[];
  /** The errors with the element each is about (LNG-003, LNG-026). */
  diagnostics?: ElementDiagnostic[];
  /** For each element, the lines of `source` written for it (LNG-004). */
  sourceMap?: SourceMapRange[];
}

// =============================================================================
// Transpiler
// =============================================================================

export function transpileSFCToST(input: SFCModel): TranspileResult {
  const errors: string[] = [];
  const lines = new Listing();
  
  try {
    const model = validateSFCModel(input);
    const preflight = validateSFCForTranspilation(model);
    if (preflight.length > 0) {
      return { success: false, source: '', errors: preflight.messages, diagnostics: preflight.diagnostics };
    }

    const stepIds = model.steps.map((step) => step.id);
    const stepById = new Map(model.steps.map((step) => [step.id, step]));
    const actions = model.actions ?? [];

    // The actions of the chart, in the order the steps first use them, with every association
    interface Association { step: SFCStep; qualifier: string; time?: string }
    const used = new Map<string, { action: SFCAction; associations: Association[] }>();
    for (const step of model.steps) {
      for (const ref of step.actions ?? []) {
        const action = actions.find((a) => a.id === ref.actionName || a.name === ref.actionName)!;
        const entry = used.get(action.id) ?? { action, associations: [] };
        entry.associations.push({ step, qualifier: ref.qualifier, time: ref.time });
        used.set(action.id, entry);
      }
    }
    const edgeSteps = new Set<string>();
    const storedActions = new Set<string>();
    for (const { action, associations } of used.values()) {
      for (const { step, qualifier } of associations) {
        if (qualifier === 'P' || qualifier === 'P0' || qualifier === 'P1') edgeSteps.add(step.id);
        if (qualifier === 'S' || qualifier === 'R') storedActions.add(action.id);
      }
    }

    // Transitions in the order they are evaluated: priority first, then the order of the file
    const evaluation = model.transitions
      .map((transition, index) => ({ transition, index }))
      .sort((a, b) => ((a.transition.priority ?? a.index) - (b.transition.priority ?? b.index)) || a.index - b.index)
      .map((entry) => entry.transition);
    const leaves = (transition: SFCTransition): string[] => transition.fromSteps ?? [transition.fromStep];
    const enters = (transition: SFCTransition): string[] => transition.toSteps ?? [transition.toStep];

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
      lines.push(`    X_${step.id} : BOOL${initial};${comment}`, stepElement(step.id));
    }
    lines.push('');
    
    // Step timers (for .T property)
    lines.push('    (* Step Elapsed Timers *)');
    for (const step of model.steps) {
      lines.push(`    T_${step.id} : TON; (* Timer for ${step.name} *)`, stepElement(step.id));
    }
    lines.push('');

    // What the scan has to remember: the previous state of a step (for edges), the transitions that
    // fire in this scan, and the stored actions
    if (edgeSteps.size > 0) {
      lines.push('    (* Previous Step State (P, P0 and P1 pulses) *)');
      for (const id of stepIds.filter((candidate) => edgeSteps.has(candidate))) lines.push(`    _XP_${id} : BOOL := FALSE;`, stepElement(id));
      lines.push('');
    }
    if (model.transitions.length > 0) {
      lines.push('    (* Transitions That Fire In This Scan *)');
      for (const transition of model.transitions) lines.push(`    _F_${transition.id} : BOOL;`, transitionElement(transition.id));
      lines.push('');
    }
    if (storedActions.size > 0) {
      lines.push('    (* Stored Actions (S until R) *)');
      for (const id of storedActions) lines.push(`    _S_${id} : BOOL := FALSE;`, actionElement(id));
      lines.push('');
    }
    
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
      lines.push(`T_${step.id}(IN := X_${step.id}, PT := T#24h);`, stepElement(step.id));
    }
    lines.push('');
    
    // =========================================================================
    // Action Execution - on the state the scan started with
    // =========================================================================
    lines.push('(* === Action Execution === *)');

    // S sets and R resets the stored state; R is applied last so that it wins
    for (const { action, associations } of used.values()) {
      for (const { step, qualifier } of associations) {
        if (qualifier === 'S') lines.push(`IF X_${step.id} THEN _S_${action.id} := TRUE; END_IF;`, actionElement(action.id));
      }
    }
    for (const { action, associations } of used.values()) {
      for (const { step, qualifier } of associations) {
        if (qualifier === 'R') lines.push(`IF X_${step.id} THEN _S_${action.id} := FALSE; END_IF;`, actionElement(action.id));
      }
    }
    
    for (const { action, associations } of used.values()) {
      const active: string[] = [];
      for (const { step, qualifier, time } of associations) {
        let term: string;
        switch (qualifier) {
          case 'N': term = `X_${step.id}`; break;
          case 'S':
          case 'R': term = `_S_${action.id}`; break;
          case 'P':
          case 'P1': term = `(X_${step.id} AND NOT _XP_${step.id})`; break;
          case 'P0': term = `(NOT X_${step.id} AND _XP_${step.id})`; break;
          case 'L': term = `(X_${step.id} AND T_${step.id}.ET < ${time})`; break;
          default: term = `(X_${step.id} AND T_${step.id}.ET >= ${time})`; break; // D
        }
        if (!active.includes(term)) active.push(term);
      }

      // Add action comment if present; the statements of the action are its own, and so is an error in them (LNG-026)
      const at = actionElement(action.id);
      lines.push(action.comment ? `(* Action: ${action.name} - ${action.comment} *)` : `(* Action: ${action.name} *)`, at);
      lines.push(`IF ${active.join(' OR ')} THEN`, at);
      // Embed the action body
      for (const line of replaceStepReferences(action.body, model.steps).split('\n')) {
        lines.push(`    ${line.trim()}`, at);
      }
      lines.push('END_IF;', at);
      lines.push('');
    }

    // The state this scan ran on becomes the previous state of the next one
    for (const id of stepIds.filter((candidate) => edgeSteps.has(candidate))) lines.push(`_XP_${id} := X_${id};`, stepElement(id));
    if (edgeSteps.size > 0) lines.push('');
    
    // =========================================================================
    // Transition Logic - evaluated first, applied after
    // =========================================================================
    lines.push('(* === Transition Logic === *)');
    
    evaluation.forEach((transition, position) => {
      const from = leaves(transition).map((id) => stepById.get(id)!);
      const to = enters(transition).map((id) => stepById.get(id)!);
      
      // Transform condition to replace step.X and step.T with the generated state
      const condition = replaceStepReferences(transition.condition, model.steps);
      
      // A transition that shares a step with one evaluated before it fires only when that one did not
      const blockers = evaluation.slice(0, position).filter((earlier) => leaves(earlier).some((id) => leaves(transition).includes(id)));
      const guards = [...from.map((step) => `X_${step.id}`), `(${condition})`, ...blockers.map((earlier) => `NOT _F_${earlier.id}`)];

      // Build transition comment
      const names = (steps: SFCStep[]) => steps.map((step) => step.name).join(' & ');
      const transComment = transition.comment 
        ? `Transition: ${names(from)} -> ${names(to)} (${transition.comment})`
        : `Transition: ${names(from)} -> ${names(to)}`;
      
      lines.push(`(* ${transComment} *)`, transitionElement(transition.id));
      lines.push(`_F_${transition.id} := ${guards.join(' AND ')};`, transitionElement(transition.id));
    });
    if (evaluation.length > 0) lines.push('');

    // Apply: every step a fired transition leaves is cleared before any step it enters is set
    for (const transition of model.transitions) {
      for (const step of leaves(transition).map((id) => stepById.get(id)!)) {
        lines.push(`IF _F_${transition.id} THEN X_${step.id} := FALSE; END_IF;`, transitionElement(transition.id));
      }
    }
    for (const transition of model.transitions) {
      for (const step of enters(transition).map((id) => stepById.get(id)!)) {
        lines.push(`IF _F_${transition.id} THEN X_${step.id} := TRUE; END_IF;`, transitionElement(transition.id));
      }
    }
    lines.push('');
    
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
      source: lines.toString(),
      errors: [],
      sourceMap: lines.sourceMap(),
    };
  } catch (e) {
    const message = `Transpiler error: ${e instanceof Error ? e.message : String(e)}`;
    errors.push(message);
    return {
      success: false,
      source: '',
      errors,
      diagnostics: [e instanceof ElementError && e.element !== undefined ? { message, element: e.element } : { message }],
    };
  }
}

function validateSFCForTranspilation(model: SFCModel): Problems {
  const errors = new Problems();
  const steps = Array.isArray(model.steps) ? model.steps : [];
  const transitions = Array.isArray(model.transitions) ? model.transitions : [];
  const actions = Array.isArray(model.actions) ? model.actions : [];

  validateIdentifier(model.name, 'SFC name', errors);

  validateUniqueIds(steps, 'step', stepElement, errors);
  validateUniqueIds(transitions, 'transition', transitionElement, errors);
  validateUniqueIds(actions, 'action', actionElement, errors);

  const stepNames = new Set<string>();
  const stepAliases = new Map<string, string>();
  for (const step of steps) {
    errors.focus(stepElement(String(step.id)));
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
      const qualifier = String(actionRef.qualifier);
      if (!SUPPORTED_QUALIFIERS.has(qualifier)) {
        errors.push(`Step ${describeId(step.id)} action qualifier '${qualifier}' is not supported (supported: N, S, R, L, D, P, P0, P1)`);
      } else if (TIMED_QUALIFIERS.has(qualifier)) {
        if (!isNonEmptyString(actionRef.time)) {
          errors.push(`Step ${describeId(step.id)} ${qualifier} action qualifier needs a time, such as T#2s`);
        } else {
          try { parseTimeLiteral(actionRef.time); } catch (error) {
            errors.push(`Step ${describeId(step.id)} ${qualifier} action qualifier has an invalid time: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } else if (actionRef.time !== undefined) {
        errors.push(`Step ${describeId(step.id)} ${qualifier} action qualifier does not support time`);
      }
      validateComment(actionRef.comment, `Step ${describeId(step.id)} action comment`, errors);
    }
  }
  errors.focus(undefined);

  const generated = [
    ...steps.flatMap((step) => [`X_${step.id}`, `T_${step.id}`, `_XP_${step.id}`]),
    ...transitions.map((transition) => `_F_${transition.id}`),
    ...actions.filter(isRecord).map((action) => `_S_${String(action.id)}`),
  ];
  const stepReferences = new Set(steps.flatMap((step) => [step.id, step.name]).filter(isNonEmptyString).map((name) => name.toUpperCase()));
  validateVariables(model.variables, generated, stepReferences, errors);

  const stepIds = new Set(steps.map((step) => step.id));
  for (const transition of transitions) {
    errors.focus(transitionElement(String(transition.id)));
    validateIdentifier(transition.id, 'Transition id', errors);
    validateComment(transition.comment, `Transition ${describeId(transition.id)} comment`, errors);
    if (!isNonEmptyString(transition.fromStep) || !stepIds.has(transition.fromStep)) {
      errors.push(`Transition ${describeId(transition.id)} references an unknown step '${String(transition.fromStep)}'`);
    }
    if (!isNonEmptyString(transition.toStep) || !stepIds.has(transition.toStep)) {
      errors.push(`Transition ${describeId(transition.id)} references an unknown step '${String(transition.toStep)}'`);
    }
    for (const [label, list, first] of [['fromSteps', transition.fromSteps, transition.fromStep], ['toSteps', transition.toSteps, transition.toStep]] as const) {
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.length === 0 || list.some((id) => !isNonEmptyString(id) || !stepIds.has(id))) {
        errors.push(`Transition ${describeId(transition.id)} ${label} must list known steps`);
      } else if (list[0] !== first) {
        errors.push(`Transition ${describeId(transition.id)} ${label} must start with ${label === 'fromSteps' ? 'fromStep' : 'toStep'} '${first}'`);
      } else if (new Set(list).size !== list.length) {
        errors.push(`Transition ${describeId(transition.id)} ${label} lists a step twice`);
      }
    }
    if (transition.priority !== undefined && (typeof transition.priority !== 'number' || !Number.isFinite(transition.priority))) {
      errors.push(`Transition ${describeId(transition.id)} priority must be a number`);
    }
    if (!isNonEmptyString(transition.condition)) {
      errors.push(`Transition ${describeId(transition.id)} condition must be non-empty`);
    } else {
      validateTransitionCondition(transition.condition, transition.id, errors);
    }
  }
  errors.focus(undefined);

  for (const action of actions) {
    if (!isRecord(action)) {
      errors.push('Action entries must be objects');
      continue;
    }
    errors.focus(actionElement(String(action.id)));
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
      for (const match of action.body.matchAll(/(?<![A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(X|T)\s*:=/gi)) {
        if (stepReferences.has(match[1].toUpperCase())) {
          errors.push(`Action ${describeId(action.id)} assigns to the step ${match[2].toUpperCase() === 'X' ? 'flag' : 'time'} '${match[1]}.${match[2]}', which is read only`);
        }
      }
    }
  }

  errors.focus(undefined);
  for (const step of steps) {
    errors.focus(stepElement(String(step.id)));
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
  errors.focus(undefined);

  return errors;
}

function validateUniqueIds(items: unknown[], label: string, elementOf: (id: string) => SourceElementId, errors: Problems): void {
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
      errors.push(`Duplicate ${label} id '${item.id}'`, elementOf(item.id));
    }
    ids.add(canonicalId);
  }
}

/** Action qualifiers the transpiler translates; L and D take a time. */
const SUPPORTED_QUALIFIERS = new Set(['N', 'S', 'R', 'L', 'D', 'P', 'P0', 'P1']);
const TIMED_QUALIFIERS = new Set(['L', 'D']);

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

function validateIdentifier(value: unknown, label: string, errors: Problems): void {
  if (!isNonEmptyString(value) || !IEC_IDENTIFIER.test(value)) {
    errors.push(`${label} must be an IEC identifier`);
    return;
  }
  if (tokenize(value)[0]?.type !== TokenType.IDENTIFIER) errors.push(`${label} may not be an IEC keyword`);
}

function validateType(value: unknown, label: string, errors: Problems): void {
  if (!isNonEmptyString(value) || !IEC_IDENTIFIER.test(value)) errors.push(`${label} must be an IEC identifier`);
}

function validateComment(value: unknown, label: string, errors: Problems): void {
  if (value !== undefined && typeof value !== 'string') {
    errors.push(`${label} must be a string`);
  } else if (typeof value === 'string' && BLOCK_COMMENT_DELIMITERS.test(value)) {
    errors.push(`${label} may not contain ST block-comment delimiters`);
  }
}

function validateVariables(variables: unknown, generatedNames: string[], stepReferences: Set<string>, errors: Problems): void {
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
  const reserved = new Set(generatedNames.map((name) => name.toUpperCase()));
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
        if (stepReferences.has(canonicalName)) errors.push(`Variable name '${entry.name}' collides with a step, so '${entry.name}.T' would be ambiguous`);
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

function validateInitialValue(value: unknown, type: unknown, name: unknown, errors: Problems): void {
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

function validateActionBody(body: string, id: string, errors: Problems): void {
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

function validateTransitionCondition(condition: string, id: string, errors: Problems): void {
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

function emitVariableSection(lines: Listing, section: 'VAR' | 'VAR_INPUT' | 'VAR_OUTPUT', variables: SFCVariable[] | undefined): void {
  if (!variables?.length) return;
  lines.push(section);
  for (const variable of variables) {
    const address = variable.address ? ` AT ${variable.address}` : '';
    const initialValue = variable.initialValue !== undefined && variable.initialValue !== null ? ` := ${formatValue(variable.initialValue, variable.type)}` : '';
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
 * Replaces the step flag and the step time of SFC with the state the transpiler generates:
 * `Step.X` becomes the active flag and `Step.T` the elapsed time of the step's timer. A step is
 * named by its name or its id, in any case; string literals are left alone.
 */
function replaceStepReferences(text: string, steps: SFCStep[]): string {
  const byName = new Map<string, SFCStep>();
  for (const step of steps) {
    byName.set(step.name.toUpperCase(), step);
    byName.set(step.id.toUpperCase(), step);
  }
  return text.split(/('(?:[^']|'')*')/).map((part, index) => index % 2 === 1 ? part : part.replace(
    /(?<![A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(X|T)(?![A-Za-z0-9_])/gi,
    (whole: string, name: string, member: string) => {
      const step = byName.get(name.toUpperCase());
      if (!step) return whole;
      return member.toUpperCase() === 'X' ? `X_${step.id}` : `T_${step.id}.ET`;
    },
  )).join('');
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
