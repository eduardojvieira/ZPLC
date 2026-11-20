import { describe, expect, test } from 'bun:test';
import { create } from 'zustand';
import { createDebugActions } from './debugActions';
import type { IDEState } from './ideStoreTypes';

/** The actions alone over a minimal state: the store itself needs the bundled-project loader. */
const make = () =>
  create<IDEState>(
    (set, get, api) => ({ compilerRunId: 7, debug: { debugMap: null }, ...createDebugActions(set, get, api) }) as unknown as IDEState,
  );

describe('the run of the debug map', () => {
  test('FND-004 setDebugMap records the compiler run it was made in, and clearing the map clears it', () => {
    const store = make();
    store.getState().setDebugMap({ pou: {} } as never);
    expect(store.getState().debug.debugMapRunId).toBe(7);
    expect(store.getState().debug.debugMap).toEqual({ pou: {} } as never);
    store.setState({ compilerRunId: 8 });
    expect(store.getState().debug.debugMapRunId).toBe(7);
    store.getState().setDebugMap(null);
    expect(store.getState().debug.debugMap).toBeNull();
    expect(store.getState().debug.debugMapRunId).toBeNull();
  });
});
