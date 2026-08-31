import { describe, expect, it } from 'bun:test';

import {
  WASM_SIMULATION_DISABLED_ERROR,
  WASM_SIMULATION_ENABLED,
  WASMAdapter,
} from './wasmAdapter';
import { isModuleLoaded, resetModule } from './wasmLoader';

describe('WASMAdapter', () => {
  it('fails closed before loading the browser module', async () => {
    resetModule();
    const adapter = new WASMAdapter();

    expect(WASM_SIMULATION_ENABLED).toBe(false);
    await expect(adapter.connect()).rejects.toThrow(WASM_SIMULATION_DISABLED_ERROR);
    expect(isModuleLoaded()).toBe(false);
  });
});
