/**
 * The inputs of the running program, settable from Studio (IDE-024). The list comes from the debug map of the program that
 * is loaded, not from a list of names; a value is written with the typed write of `useDeclaredInputs` (`setDeclaredInput`), and a
 * force goes through the same force operation as the Watch table, so "set" and "forced" mean here what they mean there.
 */
import { useEffect, useMemo, useState } from 'react';

import type { DebugController } from '../hooks/useDebugController';
import { useDeclaredInputs } from '../hooks/useDeclaredInputs';
import { inputWrite, listDeclaredInputs, type DeclaredInput } from '../runtime/declaredInputs';
import type { WatchVariable } from '../runtime/debugAdapter';
import { useIDEStore } from '../store/useIDEStore';
import { SimulationInputsList, type SimulationInputRow } from './SimulationInputsList';

/** The types a force carries: the Watch table's own (up to 32 bits). */
const FORCE_TYPES = new Set<string>(['BOOL', 'BYTE', 'INT', 'WORD', 'DINT', 'DWORD', 'REAL', 'TIME']);
const REFRESH_MS = 400;

export function SimulationInputsPanel({ controller }: { controller: DebugController | undefined }) {
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const forcedValues = useIDEStore((state) => state.debug.forcedValues);
  const inputs = useMemo(() => listDeclaredInputs(debugMap), [debugMap]);
  const adapter = controller?.adapter ?? null;
  const connected = Boolean(adapter?.connected);
  const simulated = adapter !== null && adapter.type !== 'serial';
  const { setDeclaredInput, readDeclaredInputs } = useDeclaredInputs(adapter);
  const [values, setValues] = useState<ReadonlyMap<string, boolean | number>>(new Map());
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    if (!connected || !simulated || inputs.length === 0) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const read = await readDeclaredInputs(inputs);
        if (!cancelled) setValues(read);
      } catch { /* the next refresh asks again; a lost connection ends this effect */ }
      if (!cancelled) timer = setTimeout(() => { void refresh(); }, REFRESH_MS);
    };
    void refresh();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [connected, simulated, readDeclaredInputs, inputs]);

  const rows: SimulationInputRow[] = inputs.map((input) => ({
    input,
    value: connected && simulated ? values.get(input.path) ?? null : null,
    forced: forcedValues.get(input.path)?.state === 'forced',
    forceable: FORCE_TYPES.has(input.type),
  }));

  const unavailable = !debugMap ? 'Build the project and connect the simulator to see the inputs of the program.'
    : !connected ? 'Connect the simulator to set inputs.'
      : !simulated ? 'Inputs are set in simulation. Use Force in the Watch table on hardware.'
        : undefined;

  /** Forces the input at `value`: the whole byte, as it is now with this bit changed, for a bit that shares its byte. */
  const forceAt = async (input: DeclaredInput, value: boolean | number) => {
    if (!controller || !adapter) return;
    const current = input.bitOffset !== undefined ? (await adapter.peek(input.address, 1))[0] : undefined;
    const write = inputWrite(input, value, current);
    if (input.bitOffset !== undefined) await controller.toggleForceValue(input.path, input.address, write.bytes[0]!, 'BYTE', true);
    else await controller.toggleForceValue(input.path, input.address, value, input.type as WatchVariable['type'], true);
  };

  const run = async (action: () => Promise<void>) => {
    setMessage(undefined);
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'The input could not be changed.'); }
  };

  return (
    <SimulationInputsList
      rows={rows}
      unavailable={unavailable}
      message={message}
      onSet={(input, value) => { void run(async () => {
        if (!controller) return;
        if (forcedValues.get(input.path)?.state === 'forced') await forceAt(input, value);
        else await setDeclaredInput(input, value);
      }); }}
      onForce={(input, force) => { void run(async () => {
        if (!controller) return;
        const present = values.get(input.path);
        if (!force) await controller.toggleForceValue(input.path, input.address, null, input.bitOffset !== undefined ? 'BYTE' : input.type as WatchVariable['type'], false);
        else if (present !== undefined) await forceAt(input, present);
      }); }}
    />
  );
}
