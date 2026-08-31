import { describe, expect, it } from 'bun:test';

import { ConnectionManager } from './connectionManager';
import { ZPLC_CONSTANTS } from '@zplc/compiler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createAdapter(overrides: Partial<Record<string, unknown>> = {}) {
  const adapter = {
    connected: false,
    disableAutoPolling: false,
    connect: async () => { adapter.connected = true; },
    disconnect: async () => { adapter.connected = false; },
    setPassthroughMode: () => undefined,
    getSystemInfo: async () => ({ board: 'test' }),
    getCommunicationMap: async () => [],
    getMqttStatus: async () => null,
    getStatus: async () => ({ state: 'idle', uptime_ms: 0, stats: { cycles: 0 }, opi: [] }),
    getRuntimeSnapshot: async () => ({}),
    ...overrides,
  };
  return adapter;
}

function injectAdapter(manager: ConnectionManager, adapter: object): void {
  (manager as unknown as { adapter: object | null }).adapter = adapter;
}

function validSystemInfo() {
  return {
    board: 'stm32f746g_disco', board_profile: 'stm32f746g_disco/stm32f746xx',
    zplc_version: '1.0.0', zephyr_version: '4.0.0', uptime_ms: 0, cpu_freq_mhz: 216,
    device_protocol_version: 1, bytecode_abi_major: 1, bytecode_abi_minor: 0,
    capabilities: { fpu: true, mpu: true, scheduler: true, max_tasks: 4 },
    memory: { work_size: 1, retain_size: 1, ipi_size: 1, opi_size: 1 },
  };
}

function validArtifact(): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZPLC_CONSTANTS.MAGIC, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  return bytes;
}

function readyManager(adapter: ReturnType<typeof createAdapter>): ConnectionManager {
  const manager = new ConnectionManager();
  injectAdapter(manager, adapter);
  const internals = manager as unknown as { connectionPublished: boolean; _systemInfo: unknown };
  internals.connectionPublished = true;
  internals._systemInfo = validSystemInfo();
  adapter.connected = true;
  return manager;
}

describe('ConnectionManager lifecycle', () => {
  it('never starts a physical load for denied or stale hardware admission', async () => {
    let loads = 0;
    const adapter = createAdapter({ connected: true, loadProgram: async () => { loads += 1; } });
    const manager = readyManager(adapter);
    await expect(manager.deployProgram(validArtifact(), 'nucleo_h743zi')).rejects.toThrow('ZPLC_DEVICE_BOARD_PROFILE_MISMATCH');
    await expect(manager.deployProgram(validArtifact(), undefined)).rejects.toThrow('ZPLC_DEVICE_PROJECT_TARGET_MISSING');
    let connectedChecks = 0;
    Object.defineProperty(adapter, 'connected', {
      configurable: true,
      get: () => ++connectedChecks === 1,
    });
    await expect(manager.deployProgram(validArtifact(), 'stm32f746g_disco')).rejects.toThrow('ZPLC_DEVICE_PREFLIGHT_STALE');
    expect(loads).toBe(0);
  });

  it('loads the exact admitted artifact once and reports an unknown result after a session change', async () => {
    const gate = deferred<void>();
    let loaded: Uint8Array | null = null;
    const adapter = createAdapter({ connected: true, loadProgram: async (bytes: Uint8Array) => { loaded = bytes; await gate.promise; } });
    const manager = readyManager(adapter);
    const bytes = validArtifact();
    const deploy = manager.deployProgram(bytes, 'stm32f746g_disco');
    await Promise.resolve();
    expect(loaded).toBe(bytes);
    (manager as unknown as { generation: number }).generation = 1;
    gate.resolve();
    await expect(deploy).rejects.toThrow('ZPLC_DEVICE_RESULT_UNKNOWN');
  });
  it('shares concurrent connects and publishes connected once', async () => {
    const gate = deferred<void>();
    const adapter = createAdapter({ connect: async () => { await gate.promise; adapter.connected = true; } });
    const manager = new ConnectionManager();
    injectAdapter(manager, adapter);
    const notifications: boolean[] = [];
    manager.onConnectionChange((connected) => notifications.push(connected));

    const first = manager.connect();
    const second = manager.connect();
    expect(first).toBe(second);
    gate.resolve();
    await first;
    await manager.disconnect();

    expect(notifications).toEqual([false, true, false]);
  });

  it('cancels a deferred connect when disconnected and never publishes stale success', async () => {
    const gate = deferred<void>();
    const adapter = createAdapter({ connect: async () => { await gate.promise; adapter.connected = true; } });
    const manager = new ConnectionManager();
    injectAdapter(manager, adapter);
    const notifications: boolean[] = [];
    manager.onConnectionChange((connected) => notifications.push(connected));

    const connectAttempt = manager.connect();
    const disconnectAttempt = manager.disconnect();
    gate.resolve();
    await expect(connectAttempt).rejects.toThrow('Connection attempt cancelled');
    await disconnectAttempt;

    expect(manager.serialAdapter).toBeNull();
    expect(notifications).toEqual([false]);
  });

  it('discards auxiliary results that resolve after disconnect', async () => {
    const systemInfo = deferred<{ board: string }>();
    const adapter = createAdapter({ getSystemInfo: async () => systemInfo.promise });
    const manager = new ConnectionManager();
    injectAdapter(manager, adapter);
    const notifications: boolean[] = [];
    manager.onConnectionChange((connected) => notifications.push(connected));

    const connectAttempt = manager.connect();
    await Promise.resolve();
    const disconnectAttempt = manager.disconnect();
    systemInfo.resolve({ board: 'stale' });
    await expect(connectAttempt).rejects.toThrow('Connection attempt cancelled');
    await disconnectAttempt;

    expect(manager.systemInfo).toBeNull();
    expect(notifications).toEqual([false, true, false]);
  });

  it('shares a failed disconnect and publishes false once', async () => {
    const close = deferred<void>();
    const closeError = new Error('close failed');
    const adapter = createAdapter({ connected: true, disconnect: async () => close.promise });
    const manager = new ConnectionManager();
    injectAdapter(manager, adapter);
    (manager as unknown as { connectionPublished: boolean }).connectionPublished = true;
    const notifications: boolean[] = [];
    manager.onConnectionChange((connected) => notifications.push(connected));

    const first = manager.disconnect();
    const second = manager.disconnect();
    expect(first).toBe(second);
    close.reject(closeError);
    await expect(first).rejects.toBe(closeError);
    await expect(second).rejects.toBe(closeError);

    expect(manager.serialAdapter).toBeNull();
    expect(notifications).toEqual([true, false]);
  });

  it('discards a system-info refresh that resolves after disconnect', async () => {
    const result = deferred<{ board: string }>();
    const adapter = createAdapter({ connected: true, getSystemInfo: async () => result.promise });
    const manager = new ConnectionManager();
    injectAdapter(manager, adapter);
    (manager as unknown as { connectionPublished: boolean }).connectionPublished = true;
    const updates: { board: string }[] = [];
    manager.onSystemInfoUpdate((info) => updates.push(info));

    const refresh = manager.refreshSystemInfo();
    const close = manager.disconnect();
    result.resolve({ board: 'stale' });

    await close;
    await expect(refresh).resolves.toBeNull();
    expect(manager.systemInfo).toBeNull();
    expect(updates).toEqual([]);
  });

  it('discards a communication-map refresh that resolves after disconnect', async () => {
    const result = deferred<{ index: number }[]>();
    const adapter = createAdapter({ connected: true, getCommunicationMap: async () => result.promise });
    const manager = new ConnectionManager();
    injectAdapter(manager, adapter);
    (manager as unknown as { connectionPublished: boolean }).connectionPublished = true;
    const updates: { index: number }[][] = [];
    manager.onCommunicationMapUpdate((entries) => updates.push(entries as { index: number }[]));

    const refresh = manager.refreshCommunicationMap();
    const close = manager.disconnect();
    result.resolve([{ index: 1 }]);

    await close;
    await expect(refresh).resolves.toEqual([]);
    expect(manager.communicationMap).toEqual([]);
    expect(updates).toEqual([[], []]);
  });

  it('does not publish an in-flight poll after passthrough is enabled', async () => {
    const status = deferred<{ state: string; uptime_ms: number; stats: { cycles: number }; opi: number[] }>();
    let snapshots = 0;
    let mqtt = 0;
    const adapter = createAdapter({
      connected: true,
      getStatus: async () => status.promise,
      getRuntimeSnapshot: async () => { snapshots += 1; return {}; },
      getMqttStatus: async () => { mqtt += 1; return null; },
    });
    const manager = new ConnectionManager();
    injectAdapter(manager, adapter);
    (manager as unknown as { connectionPublished: boolean }).connectionPublished = true;
    const updates: unknown[] = [];
    manager.onStatusUpdate((value) => updates.push(value));

    const poll = (manager as unknown as {
      poll: (generation: number, currentAdapter: typeof adapter) => Promise<void>;
    }).poll(0, adapter);
    manager.enablePassthrough();
    status.resolve({ state: 'idle', uptime_ms: 0, stats: { cycles: 0 }, opi: [] });
    await poll;

    expect(updates).toEqual([]);
    expect(snapshots).toBe(0);
    expect(mqtt).toBe(0);
  });
});
