import type { TaskDefinition } from '../../types';

export function getTaskIntervalMs(task: TaskDefinition): number {
  return task.interval_ms ?? task.interval ?? 100;
}

export function getTaskWatchdogMs(task: TaskDefinition): number | '' {
  return task.watchdog_ms ?? task.watchdog ?? '';
}
