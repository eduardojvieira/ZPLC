import { describe, expect, it } from 'bun:test';

import {
  WASM_SIMULATION_DISABLED_ERROR,
  WASM_SIMULATION_ENABLED,
  WASMAdapter,
  verifierWorkspaceBytes,
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

describe('verifierWorkspaceBytes', () => {
  it('matches ZPLC_LOADER_VERIFY_WORKSPACE_SIZE of the C loader at the default CODE size', () => {
    // 5632 boundary bits + 704 rank index + 5760 depth intervals + 360 pending bits + 2688 frame records.
    expect(verifierWorkspaceBytes(0xB000)).toBe(15144);
  });

  it('grows with the CODE size the runtime accepts', () => {
    expect(verifierWorkspaceBytes(0x2000)).toBeLessThan(verifierWorkspaceBytes(0xB000));
  });
});
