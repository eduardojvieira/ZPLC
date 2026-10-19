/**
 * Setting and reading the inputs that the running program declares (IDE-024), over the adapter of the debug controller.
 * `setDeclaredInput` changes only the bit or the bytes of its own input; `readDeclaredInputs` reads them back in a few
 * memory reads. Simulation only: on a serial adapter an input is forced from the Watch table.
 */
import { useCallback, useEffect, useRef } from 'react';

import type { IDebugAdapter } from '../runtime/debugAdapter';
import { decodeInput, inputReadPlan, inputWrite, type DeclaredInput, type IoPoint } from '../runtime/declaredInputs';
import { useIDEStore } from '../store/useIDEStore';

export function useDeclaredInputs(adapter: IDebugAdapter | null | undefined) {
  const forcesUnconfirmed = useIDEStore((state) => state.debug.forcesUnconfirmed);
  const adapterRef = useRef(adapter);
  useEffect(() => { adapterRef.current = adapter; }, [adapter]);

  /** Sets any declared input of the program in simulation, changing only its own bit or bytes. */
  const setDeclaredInput = useCallback(async (input: DeclaredInput, value: boolean | number) => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter || !currentAdapter.connected) throw new Error('Connect the simulator before setting an input.');
    if (currentAdapter.type === 'serial') throw new Error('Inputs can be set in simulation only. Use Force for hardware.');
    if (forcesUnconfirmed) throw new Error('Force state unconfirmed. Reconnect and verify before operating.');
    // A bit of a shared byte is set by writing the byte as it is now with that bit changed.
    const current = input.bitOffset !== undefined ? (await currentAdapter.peek(input.address, 1))[0] : undefined;
    const write = inputWrite(input, value, current);
    if (adapterRef.current !== currentAdapter || !currentAdapter.connected) throw new Error('The simulator changed before the input was set.');
    await currentAdapter.setValue(write.address, write.bytes);
  }, [forcesUnconfirmed]);

  /** Reads inputs and outputs of the I/O map back, by path; a point that could not be read is absent from the map. */
  const readDeclaredInputs = useCallback(async (inputs: ReadonlyArray<IoPoint & { path: string }>) => {
    const values = new Map<string, boolean | number>();
    const currentAdapter = adapterRef.current;
    if (!currentAdapter || !currentAdapter.connected || inputs.length === 0) return values;
    const memory = new Map<number, number>();
    for (const range of inputReadPlan(inputs)) {
      const bytes = await currentAdapter.peek(range.address, range.length);
      bytes.forEach((byte, offset) => memory.set(range.address + offset, byte));
    }
    for (const input of inputs) {
      const width = Math.max(1, input.size);
      if (!Array.from({ length: width }, (_, offset) => memory.has(input.address + offset)).every(Boolean)) continue;
      values.set(input.path, decodeInput(input, (address, length) => Uint8Array.from({ length }, (_, offset) => memory.get(address + offset) ?? 0)));
    }
    return values;
  }, []);

  return { setDeclaredInput, readDeclaredInputs };
}
