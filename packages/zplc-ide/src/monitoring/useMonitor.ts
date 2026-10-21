/**
 * The hooks an editor uses to show online values (LNG-006): they ask the poll to read the variables of the program the
 * debug map built from the file, and give the editor what was read. A diagram editor reads the monitor entries of the
 * map (`useMonitor`); a text editor reads the variables that its source names (`useMonitoredVariables`).
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useIDEStore } from '../store/useIDEStore';
import { debugPouOf } from '../compiler/debugElements';
import type { MonitorEntry } from '../models/sourceElements';
import { monitorKey, resolveVariable } from './debugVariables';
import { readElementStates, variablesOf, type ElementState, type FlagsOf, type Reading } from './elementStates';
import { clearReadFaults, readFaultKeys, subscribeReadFaults } from './readFaults';
import { setMonitorKeys } from './registry';
import { signalFlagsOf } from './signalFlags';

const NO_ENTRIES: readonly MonitorEntry[] = [];

export interface MonitoredValue {
  /** What was read; undefined while it has not been, or when the map has no such variable. */
  reading: Reading;
  /** The type the map gives it; '' when it has none. */
  type: string;
  /** The map has the variable. */
  known: boolean;
}

/**
 * The values of `variables` of the program of `sourceRef`, read while a program runs under Studio. A variable the map
 * does not have is returned as not known, and is not asked for. Only these values render the caller again (IDE-013).
 */
export function useMonitoredVariables(
  sourceRef: string | undefined,
  variables: readonly string[],
  enabled = true,
): ReadonlyMap<string, MonitoredValue> {
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const mode = useIDEStore((state) => state.debug.mode);
  const on = enabled && mode !== 'none' && sourceRef !== undefined && debugMap !== null;

  const known = useMemo(
    () => (on ? variables.filter((variable) => resolveVariable(debugMap, sourceRef!, variable) !== undefined) : []),
    [debugMap, on, sourceRef, variables],
  );
  const keys = useMemo(() => known.map((variable) => monitorKey(sourceRef!, variable)), [known, sourceRef]);

  useEffect(() => {
    const owner = `${sourceRef ?? ''}:${variables.length > 0 ? 'v' : ''}${keys.length}:${keys[0] ?? ''}`;
    setMonitorKeys(owner, keys);
    return () => setMonitorKeys(owner, []);
  }, [keys, sourceRef, variables.length]);

  const readings = useIDEStore(useShallow((state) => keys.map((key) => state.debug.liveValues.get(key))));

  return useMemo(() => {
    const values = new Map<string, MonitoredValue>();
    if (!on) return values;
    const byVariable = new Map(known.map((variable, index) => [variable, readings[index]] as const));
    for (const variable of variables) {
      const resolved = byVariable.has(variable) ? resolveVariable(debugMap, sourceRef!, variable) : undefined;
      values.set(variable, { reading: byVariable.get(variable), type: resolved?.type ?? '', known: resolved !== undefined });
    }
    return values;
  }, [debugMap, known, on, readings, sourceRef, variables]);
}

export interface Monitor {
  /** The program runs under Studio, and the build of this file has monitor entries. */
  active: boolean;
  /** The state of each element, by its element id. */
  states: ReadonlyMap<string, ElementState>;
  /** Each variable the entries name: its value, or not known to the map. */
  values: ReadonlyMap<string, MonitoredValue>;
  /** Whether a variable of this file is forced by the user, or could not be read (UX-009). */
  flagsOf: FlagsOf;
}

const NOTHING: Monitor = { active: false, states: new Map(), values: new Map(), flagsOf: () => undefined };

/** The monitor of the diagram in the active editor. */
export function useMonitor(): Monitor {
  const sourceRef = useIDEStore((state) => (state.activeFileId ? state.loadedFiles.get(state.activeFileId)?.path : undefined));
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const mode = useIDEStore((state) => state.debug.mode);

  const entries = useMemo(
    () => (mode !== 'none' && sourceRef !== undefined ? debugPouOf(debugMap, sourceRef)?.monitor : undefined) ?? NO_ENTRIES,
    [debugMap, mode, sourceRef],
  );
  const variables = useMemo(() => variablesOf(entries), [entries]);
  const values = useMonitoredVariables(sourceRef, variables, entries.length > 0);

  // the same two sources for every editor: the force table, and the variables the poll could not read (UX-009)
  const forcedValues = useIDEStore((state) => state.debug.forcedValues);
  const faults = useSyncExternalStore(subscribeReadFaults, readFaultKeys);
  useEffect(() => {
    if (mode === 'none') clearReadFaults();
  }, [mode]);
  const flagsOf = useMemo(() => signalFlagsOf(debugMap, sourceRef, forcedValues, faults), [debugMap, sourceRef, forcedValues, faults]);

  return useMemo((): Monitor => {
    if (entries.length === 0) return NOTHING;
    return { active: true, states: readElementStates(entries, (variable) => values.get(variable)?.reading, flagsOf), values, flagsOf };
  }, [entries, values, flagsOf]);
}
