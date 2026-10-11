import { afterEach, describe, expect, it } from 'bun:test';

import { builtWasmModule, itWasm } from '../cli/wasmModuleGuard';
import { connectSimulationAdapter } from './simulationAdapterFactory';

// IDE-025: the browser runtime runs where the native one is not, and says why it does.

interface Entry { type: string; message: string; source: string }

/** What the preload gives a renderer: a session that starts with the handshake of a native runtime, or fails to. */
function installNativeBridge(startSession: () => Promise<unknown>): void {
  (globalThis as { window?: unknown }).window = {
    electronAPI: {
      nativeSimulation: {
        startSession,
        stopSession: async () => undefined,
        request: async () => ({}),
        onEvent: () => () => undefined,
      },
    },
  };
}

const nativeHello = {
  protocol_version: '1.0',
  runtime_kind: 'native-posix',
  runtime_version: '2.0.0',
  capability_profile: { profile_id: 'native-posix-mvp', features: [{ name: 'pause', status: 'supported' }] },
};

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('the runtime a simulation runs on', () => {
  it('is the native runtime when it starts, with nothing reported', async () => {
    installNativeBridge(async () => nativeHello);
    const entries: Entry[] = [];
    const adapter = await connectSimulationAdapter({ report: (entry) => entries.push(entry), loadModule: async () => { throw new Error('not needed'); } });
    expect(adapter.type).toBe('native');
    expect(adapter.connected).toBe(true);
    expect(entries).toEqual([]);
  });

  itWasm('is the browser runtime, with the reason in the console, when the native runtime cannot start', async () => {
    installNativeBridge(async () => { throw new Error('Native simulator binary not found at /opt/zplc/zplc_runtime.'); });
    const entries: Entry[] = [];
    const adapter = await connectSimulationAdapter({ report: (entry) => entries.push(entry), loadModule: async () => builtWasmModule().bytes });
    expect(adapter.type).toBe('wasm');
    expect(adapter.connected).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe('warning');
    expect(entries[0]!.message).toContain('Native simulator binary not found at /opt/zplc/zplc_runtime.');
    expect(entries[0]!.message).toContain('degraded');
    await adapter.disconnect();
  });

  itWasm('is the browser runtime without a notice where there is no native runtime to try (the web build)', async () => {
    const entries: Entry[] = [];
    const adapter = await connectSimulationAdapter({ report: (entry) => entries.push(entry), loadModule: async () => builtWasmModule().bytes });
    expect(adapter.type).toBe('wasm');
    expect(entries).toEqual([]);
    await adapter.disconnect();
  });

  it('says both reasons when neither runtime can start', async () => {
    installNativeBridge(async () => { throw new Error('Native simulation is switched off by ZPLC_RUNTIME=wasm.'); });
    await expect(connectSimulationAdapter({ loadModule: async () => { throw new Error('clang and wasm-ld were not found'); } }))
      .rejects.toThrow(/switched off by ZPLC_RUNTIME=wasm.*could not start either: clang and wasm-ld were not found/s);
  });
});
