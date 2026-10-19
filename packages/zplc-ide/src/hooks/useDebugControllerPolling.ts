/**
 * The poll of watched values while the runtime is connected and running (IDE-014: split out of useDebugController.ts).
 */

import { useEffect, type RefObject } from 'react';
import { monitoredKeys } from '../monitoring/registry';
import { recordReadFaults } from '../monitoring/readFaults';
import { useIDEStore, type LiveValue } from '../store/useIDEStore';
import type { IDebugAdapter, VMState } from '../runtime/debugAdapter';
import type { DebugMap } from '../compiler';
import { buildPolledDebugPaths, describePolledDebugVariable } from './debugPollingPaths';
import { debugLog } from '../utils/debugLog';

export function useDebugControllerPolling({ adapter, adapterRef, vmState, watchVariables, pollingInterval, debugMap, mpeekEnabled, monitored, pollingIntervalRef }: {
  adapter: IDebugAdapter | null;
  adapterRef: RefObject<IDebugAdapter | null>;
  vmState: VMState;
  watchVariables: string[];
  pollingInterval: number;
  debugMap: DebugMap | null;
  mpeekEnabled: boolean;
  monitored: ReturnType<typeof monitoredKeys>;
  pollingIntervalRef: RefObject<ReturnType<typeof setInterval> | null>;
}) {
  const setPolling = useIDEStore((state) => state.setPolling);
  const updateLiveValues = useIDEStore((state) => state.updateLiveValues);

  useEffect(() => {
    // Poll whenever connected and running/paused.
    // Explicit watch-table variables are always polled.
    // Extra debug-map variables for inline editor preview are only added when
    // the Live button is enabled in hardware mode.
    const shouldPoll =
      adapter?.connected &&
      (vmState === 'running' || vmState === 'paused');

    if (shouldPoll) {
      // Always clear any existing interval before (re-)starting.
      // This ensures that when `debugMap` arrives late via a store update the
      // effect re-runs and the new closure captures the up-to-date debugMap
      // instead of keeping the stale null-closure that was registered first.
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setPolling(true);

      let isPollingWatch = false;
      // The poll handles its own errors, so the timer only starts it and does not wait for it. A disconnect that lands while a read is in flight ends that session on purpose and is not logged as a polling failure.
      const pollWatch = async (): Promise<void> => {
        const polled = adapterRef.current;
        if (!polled?.connected || isPollingWatch) return;

        try {
          isPollingWatch = true;
          // Build the set of variable paths to poll.
          // 1. Explicit watch-table variables are always included.
          // 2. Inline editor preview variables are added only when the Live
          //    button is enabled.
          const pathSet = new Set<string>(
            buildPolledDebugPaths(watchVariables, debugMap, mpeekEnabled, 64, monitoredKeys()),
          );

          const variables = Array.from(pathSet)
            .map((varPath) => describePolledDebugVariable(debugMap, varPath))
            .filter((v): v is NonNullable<ReturnType<typeof describePolledDebugVariable>> => v !== null);

          if (variables.length === 0) {
            debugLog('[useDebugController] No variables to poll');
            return;
          }

          debugLog(`[useDebugController] Polling ${variables.length} variables. mpeekEnabled: ${mpeekEnabled}`);

          // a variable that comes back without a value, or a read that fails, is shown as a fault in the diagrams (UX-009)
          const names = variables.map((variable) => variable.name);
          const results = await polled.readWatchVariables(variables, { useMpeek: mpeekEnabled }).catch((err: unknown) => { recordReadFaults(names, []); throw err; });
          const newValues = new Map<string, LiveValue>();
          for (const result of results) if (result.value !== undefined) newValues.set(result.name, result.value);
          recordReadFaults(names, newValues.keys());

          if (newValues.size > 0) {
            debugLog(`[useDebugController] Updating live values with ${newValues.size} items`, Array.from(newValues.entries()));
            updateLiveValues(newValues);
          } else {
            debugLog(`[useDebugController] readWatchVariables returned 0 new values! results:`, results);
          }
        } catch (err) {
          if (adapterRef.current === polled && polled.connected) console.error('Polling error:', err);
        } finally {
          isPollingWatch = false;
        }
      };
      pollingIntervalRef.current = setInterval(() => { void pollWatch(); }, pollingInterval);
    } else if (!shouldPoll && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      setPolling(false);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [
    adapter,
    adapterRef,
    pollingIntervalRef,
    vmState,
    watchVariables,
    pollingInterval,
    debugMap,
    mpeekEnabled,
    monitored,
    setPolling,
    updateLiveValues,
  ]);
}
