import { describe, expect, it } from 'bun:test';

import { assemble } from '@zplc/compiler';

import { builtWasmModule, itWasm } from '../cli/wasmModuleGuard';
import { getWasmCapabilities } from './debugCapabilities';
import { WASM_SIMULATION_ENABLED, WASMAdapter } from './wasmAdapter';

describe('WASMAdapter (IDE-025)', () => {
  it('is enabled: the browser runtime is built with the IDE, and a build without it says why on connect', () => {
    expect(WASM_SIMULATION_ENABLED).toBe(true);
  });

  it('reports its type before it connects, so that the interface can show the degraded label', () => {
    expect(new WASMAdapter({ loadModule: async () => new Uint8Array() }).type).toBe('wasm');
  });

  it('fails a connection without a module with the reason the build gave, and stays disconnected', async () => {
    const adapter = new WASMAdapter({
      loadModule: async () => {
        throw new Error('clang not found on the PATH');
      },
    });
    await expect(adapter.connect()).rejects.toThrow('clang not found on the PATH');
    expect(adapter.connected).toBe(false);
  });

  itWasm('runs a program on the module it is given and shows what its capability profile says', async () => {
    const adapter = new WASMAdapter({ loadModule: async () => builtWasmModule().bytes, retainStorage: 'project' });
    await adapter.connect();
    expect(adapter.capabilities?.profile_id).toBe('wasm-browser');
    expect(adapter.capabilities).toEqual(JSON.parse(JSON.stringify(adapter.capabilities)));
    await adapter.loadProgram(assemble('    PUSH8 9\n    STORE8 0x1000\n    HALT\n').zplcFile);
    await adapter.start();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await adapter.peek(0x1000, 1))[0]).toBe(9);
    await adapter.disconnect();
  });

  it('takes the capabilities of the controller from the same profile that the handshake reports', () => {
    const capabilities = getWasmCapabilities();
    expect(capabilities.supportsPause && capabilities.supportsResume && capabilities.supportsStep && capabilities.supportsBreakpoints).toBe(
      true,
    );
    expect(capabilities.features['simulation-inputs']?.status).toBe('supported');
  });
});
