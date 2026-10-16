/**
 * What the open diagrams and files ask the runtime to read (LNG-006).
 *
 * An editor that shows online values names the variables it needs; the poll of the debug controller reads them with the
 * watch table. Each owner (an editor) replaces its own list, and a list that is empty takes its owner out.
 */

const owners = new Map<string, readonly string[]>();
let snapshot: readonly string[] = [];
const listeners = new Set<() => void>();

/** The most variables that the open editors have read for them: a diagram of a hundred elements has a few hundred. */
export const MONITOR_KEY_LIMIT = 512;

export function setMonitorKeys(owner: string, keys: readonly string[]): void {
  const before = owners.get(owner);
  if (keys.length === 0 ? before === undefined : before !== undefined && before.length === keys.length && before.every((key, index) => key === keys[index])) return;
  if (keys.length === 0) owners.delete(owner); else owners.set(owner, keys);
  snapshot = [...new Set([...owners.values()].flat())].slice(0, MONITOR_KEY_LIMIT);
  for (const listener of listeners) listener();
}

/** The keys to read, as one list that keeps its identity until an owner changes. */
export function monitoredKeys(): readonly string[] {
  return snapshot;
}

export function subscribeMonitorKeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
