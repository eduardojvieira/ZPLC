/**
 * The state of each element of a diagram, from the monitor entries of the debug map and the values read (LNG-006).
 *
 * The entries say which variable holds each state, or, for the power flow of a rung, the expression of the variables
 * the power is made of. A variable whose value was not read is unavailable, and so is every state that depends on it:
 * `undefined`, which a display shows as unavailable and never as FALSE or as a guess from a name.
 */

import type { MonitorEntry, PowerExpr } from '../models/sourceElements';

/** What a read returns: the value, or undefined when it is not available. */
export type Reading = number | boolean | string | undefined;
export type Read = (variable: string) => Reading;

/** How a variable is shown besides its value: the user forces it, or it could not be read (UX-009). */
export interface SignalFlags { forced?: boolean; fault?: boolean }
export type FlagsOf = (variable: string) => SignalFlags | undefined;

export interface ElementState {
  /** LD: the power that reaches the element, and the power that leaves it. */
  power?: boolean;
  powerOut?: boolean;
  /** The value of the variable an element names. */
  value?: Reading;
  /** The value each output pin holds, by port. */
  pins: Record<string, Reading>;
  /** The flags of the variable of the value, step or condition, and of the variable of each output pin. */
  flags?: SignalFlags;
  pinFlags: Record<string, SignalFlags>;
  /** SFC: a step is active, and for how long; a transition's condition holds, and it fired in this scan. */
  active?: boolean;
  time?: number;
  condition?: boolean;
  fired?: boolean;
}

export const truthy = (value: Reading): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return value.toUpperCase() === 'TRUE' || (value !== '' && Number(value) !== 0 && !Number.isNaN(Number(value)));
};

/** The power an expression is, from the values read; undefined when a variable it needs was not read and nothing decides it. */
export function evaluatePower(expression: PowerExpr, read: Read): boolean | undefined {
  switch (expression.op) {
    case 'true': return true;
    case 'var': {
      const value = truthy(read(expression.variable));
      return value === undefined ? undefined : expression.not ? !value : value;
    }
    case 'and': {
      let unknown = false;
      for (const term of expression.terms) {
        const value = evaluatePower(term, read);
        if (value === false) return false;
        if (value === undefined) unknown = true;
      }
      return unknown ? undefined : true;
    }
    case 'or': {
      let unknown = false;
      for (const term of expression.terms) {
        const value = evaluatePower(term, read);
        if (value === true) return true;
        if (value === undefined) unknown = true;
      }
      return unknown ? undefined : false;
    }
  }
}

/** The variables a set of entries reads, once each: what the runtime is asked for. */
export function variablesOf(entries: readonly MonitorEntry[]): string[] {
  const found = new Set<string>();
  const visit = (expression: PowerExpr | undefined): void => {
    if (!expression) return;
    if (expression.op === 'var') found.add(expression.variable);
    else if (expression.op === 'and' || expression.op === 'or') expression.terms.forEach(visit);
  };
  for (const entry of entries) {
    if (entry.variable !== undefined) found.add(entry.variable);
    visit(entry.in);
    visit(entry.out);
  }
  return [...found];
}

/** `flagsOf` says which variables are forced or could not be read; without it no element carries a flag. */
export function readElementStates(entries: readonly MonitorEntry[], read: Read, flagsOf?: FlagsOf): Map<string, ElementState> {
  const states = new Map<string, ElementState>();
  const stateOf = (element: string): ElementState => {
    let state = states.get(element);
    if (!state) states.set(element, (state = { pins: {}, pinFlags: {} }));
    return state;
  };
  for (const entry of entries) {
    const state = stateOf(entry.element);
    const value = entry.variable === undefined ? undefined : read(entry.variable);
    const flags = entry.variable === undefined ? undefined : flagsOf?.(entry.variable);
    switch (entry.role) {
      case 'power':
        state.power = entry.in ? evaluatePower(entry.in, read) : undefined;
        state.powerOut = entry.out ? evaluatePower(entry.out, read) : undefined;
        break;
      case 'value': state.value = value; state.flags = flags; break;
      case 'output': state.pins[entry.port ?? 'OUT'] = value; if (flags) state.pinFlags[entry.port ?? 'OUT'] = flags; break;
      case 'step': state.active = truthy(value); state.flags = flags; break;
      case 'time': state.time = typeof value === 'number' ? value : undefined; break;
      case 'condition': state.condition = truthy(value); state.flags = flags; break;
      case 'fired': state.fired = truthy(value); break;
    }
  }
  return states;
}
