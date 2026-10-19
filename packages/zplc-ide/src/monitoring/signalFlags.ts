/**
 * Which variables a diagram shows as forced or faulted (UX-009, LNG-006).
 *
 * A variable is forced when the force table holds an entry of that name at the address the debug map gives the variable
 * in this file: a `Count` of another program is another variable, and its force is not shown here. It is faulted when
 * the poll could not read it. The same function serves Ladder, FBD and SFC, so the three cannot disagree.
 */

import type { DebugMap } from '@zplc/compiler';
import { monitorKey, resolveVariable } from './debugVariables';
import type { FlagsOf, SignalFlags } from './elementStates';

export function signalFlagsOf(
  debugMap: DebugMap | null | undefined,
  sourceRef: string | undefined,
  forced: ReadonlyMap<string, { address: number }>,
  faults: ReadonlySet<string>,
): FlagsOf {
  // the map does not change while this lives, and the monitor asks for every entry at every reading
  const addresses = new Map<string, number | undefined>();
  const addressOf = (variable: string): number | undefined => {
    if (!addresses.has(variable)) addresses.set(variable, sourceRef === undefined ? undefined : resolveVariable(debugMap, sourceRef, variable)?.address);
    return addresses.get(variable);
  };
  return (variable) => {
    if (sourceRef === undefined) return undefined;
    const address = addressOf(variable);
    if (address === undefined) return undefined;
    const flags: SignalFlags = {};
    if (forced.get(variable)?.address === address) flags.forced = true;
    if (faults.has(monitorKey(sourceRef, variable))) flags.fault = true;
    return flags.forced || flags.fault ? flags : undefined;
  };
}
