import type { TaskDefinition } from '../../types';

export function getTaskIntervalMs(task: TaskDefinition): number {
  return task.interval_ms ?? task.interval ?? 100;
}
