/**
 * The change of the store that new readings of watched variables make (IDE-013).
 *
 * A value that did not change is not a change of the store: the readings that the runtime returns every 100 ms are
 * mostly the values they were, and a region that shows one of them must not render again for the others. When
 * nothing changed the state itself is returned, which the store does not publish.
 */

import type { IDEState, LiveValue } from './useIDEStore';

export function withLiveValues(state: IDEState, readings: Iterable<readonly [string, LiveValue]>): IDEState | Pick<IDEState, 'debug'> {
  let next: Map<string, LiveValue> | undefined;
  for (const [path, value] of readings) {
    if (state.debug.liveValues.has(path) && state.debug.liveValues.get(path) === value) continue;
    next ??= new Map(state.debug.liveValues);
    next.set(path, value);
  }
  return next ? { debug: { ...state.debug, liveValues: next } } : state;
}
