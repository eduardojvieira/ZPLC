/**
 * Value writes and forces of the debug controller, and the refresh of the forces a device reports (IDE-014: split out of useDebugController.ts).
 */

import { useEffect, useCallback, type RefObject } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import type { IDebugAdapter, WatchVariable, WatchForceEntry, WatchForceState } from '../runtime/debugAdapter';
import { WATCH_FORCE_STATE, bytesToHex, valueToBytes } from '../runtime/debugAdapter';
import type { DebugMap } from '../compiler';
import { findVariable } from '../compiler';
import { isCurrentSerialAdapter, shouldMarkForceCommandFailureUnconfirmed } from './forceReconciliation';

export function useDebugControllerForces({ adapter, adapterRef, forcesUnconfirmed, watchVariables, debugMap }: {
  adapter: IDebugAdapter | null;
  adapterRef: RefObject<IDebugAdapter | null>;
  forcesUnconfirmed: boolean;
  watchVariables: string[];
  debugMap: DebugMap | null;
}) {
  const setForcedValue = useIDEStore((state) => state.setForcedValue);
  const clearForcedValue = useIDEStore((state) => state.clearForcedValue);
  const clearForcedValues = useIDEStore((state) => state.clearForcedValues);
  const markForcedValuesUnconfirmed = useIDEStore((state) => state.markForcedValuesUnconfirmed);

  const setValue = useCallback(
    async (
      address: number,
      value: number | boolean | string,
      type: WatchVariable['type'],
      maxLength?: number
    ) => {
      const currentAdapter = adapterRef.current;
      if (!currentAdapter) return;
      if (currentAdapter.type === 'serial') {
        throw new Error('Direct value edits are simulation-only. Use Force for hardware.');
      }
      if (forcesUnconfirmed) {
        throw new Error('Force state unconfirmed. Reconnect and verify before operating.');
      }
      const bytes = valueToBytes(value, type, maxLength);
      await currentAdapter.setValue(address, bytes);
    },
    [adapterRef, forcesUnconfirmed]
  );

  const buildForceEntry = useCallback((
    path: string,
    address: number,
    type: WatchVariable['type'],
    bytes: Uint8Array,
    maxLength: number | undefined,
    state: WatchForceState,
  ): WatchForceEntry => ({
    path,
    address,
    size: bytes.length,
    type,
    bytesHex: bytesToHex(bytes),
    maxLength,
    state,
  }), []);

  const toggleForceValue = useCallback(
    async (
      path: string,
      address: number,
      value: number | boolean | string | null,
      type: WatchVariable['type'],
      force: boolean,
      maxLength?: number,
    ) => {
      if (forcesUnconfirmed) {
        throw new Error('Force state unconfirmed. Reconnect and verify before operating.');
      }
      const currentAdapter = adapterRef.current;
      if (!currentAdapter) return;
      if (force && value === null) {
        throw new Error('A value that has not been read cannot be forced.');
      }

      try {
        if (force) {
          const bytes = valueToBytes(value as number | boolean | string, type, maxLength);
          await currentAdapter.forceValue(address, bytes);
          setForcedValue(buildForceEntry(path, address, type, bytes, maxLength, WATCH_FORCE_STATE.FORCED));
          return;
        }

        await currentAdapter.clearForcedValue(address);
        clearForcedValue(path);
      } catch (error) {
        if (shouldMarkForceCommandFailureUnconfirmed(adapterRef.current, currentAdapter)) {
          markForcedValuesUnconfirmed();
        }
        throw error;
      }
    },
    [adapterRef, buildForceEntry, clearForcedValue, forcesUnconfirmed, markForcedValuesUnconfirmed, setForcedValue],
  );

  const clearAllForcedValues = useCallback(async () => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter) return;
    const isHardware = currentAdapter.type === 'serial';
    try {
      await currentAdapter.clearAllForcedValues();
      if (isHardware && isCurrentSerialAdapter(adapterRef.current, currentAdapter) && currentAdapter.connected) {
        clearForcedValues();
      } else if (!useIDEStore.getState().debug.forcesUnconfirmed) {
        clearForcedValues();
      }
    } catch (error) {
      if (isHardware && isCurrentSerialAdapter(adapterRef.current, currentAdapter)) {
        markForcedValuesUnconfirmed();
      }
      throw error;
    }
  }, [adapterRef, clearForcedValues, markForcedValuesUnconfirmed]);

  useEffect(() => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter || currentAdapter.type !== 'serial') {
      return;
    }
    let cancelled = false;

    void currentAdapter.listForcedValues()
      .then((entries) => {
        if (cancelled || !isCurrentSerialAdapter(adapterRef.current, currentAdapter) || !currentAdapter.connected) {
          return;
        }
        clearForcedValues();

        for (const entry of entries) {
          const matchedPath = watchVariables.find((watchPath) => watchPath === entry.path)
            ?? watchVariables.find((watchPath) => {
              if (!debugMap) {
                return false;
              }
              const found = findVariable(debugMap, watchPath);
              return found?.absoluteAddr === entry.address;
            });

          setForcedValue({
            ...entry,
            path: matchedPath ?? entry.path,
          });
        }
      })
      .catch((err) => {
        if (cancelled || !isCurrentSerialAdapter(adapterRef.current, currentAdapter)) {
          return;
        }
        console.warn('[DebugController] failed to refresh forced values:', err);
        markForcedValuesUnconfirmed();
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, adapterRef, clearForcedValues, debugMap, markForcedValuesUnconfirmed, setForcedValue, watchVariables]);

  return { setValue, toggleForceValue, clearAllForcedValues };
}
