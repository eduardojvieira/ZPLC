/**
 * The queue that batches device log lines into one console update per 100 ms (IDE-014: split out of useDebugController.ts).
 */

import { useCallback, useRef } from 'react';
import { useIDEStore } from '../store/useIDEStore';

const DEVICE_LOG_FLUSH_MS = 100;

export function useDeviceLogQueue(addConsoleEntries: ReturnType<typeof useIDEStore.getState>['addConsoleEntries']) {
  const deviceLogQueueRef = useRef<string[]>([]);
  const deviceLogFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushDeviceLogs = useCallback(() => {
    if (deviceLogFlushTimerRef.current) {
      clearTimeout(deviceLogFlushTimerRef.current);
      deviceLogFlushTimerRef.current = null;
    }

    if (deviceLogQueueRef.current.length === 0) {
      return;
    }

    const queuedLines = deviceLogQueueRef.current;
    deviceLogQueueRef.current = [];

    addConsoleEntries(
      queuedLines.map((line) => ({
        type: 'info' as const,
        message: line,
        source: 'device',
      })),
    );
  }, [addConsoleEntries]);

  const enqueueDeviceLog = useCallback((line: string) => {
    deviceLogQueueRef.current.push(line);

    if (deviceLogFlushTimerRef.current !== null) {
      return;
    }

    deviceLogFlushTimerRef.current = setTimeout(() => {
      flushDeviceLogs();
    }, DEVICE_LOG_FLUSH_MS);
  }, [flushDeviceLogs]);

  return { enqueueDeviceLog, flushDeviceLogs };
}
