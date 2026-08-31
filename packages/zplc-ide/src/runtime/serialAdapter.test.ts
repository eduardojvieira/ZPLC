import { describe, expect, it } from 'bun:test';

import type { SerialConnection } from '../uploader/webserial';
import { WATCH_FORCE_STATE } from './debugAdapter';
import { SerialAdapter } from './serialAdapter';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe('SerialAdapter program control', () => {
  it('caches only a complete bounded system-info handshake', async () => {
    const adapter = new SerialAdapter();
    const internals = adapter as unknown as { sendJsonCommand: () => Promise<unknown>; systemInfoCache: unknown };
    internals.sendJsonCommand = async () => ({
      board: 'rpi_pico', board_profile: 'rpi_pico/rp2040', zplc_version: '1.0.0', zephyr_version: '4.0.0',
      uptime_ms: 0, cpu_freq_mhz: 1, device_protocol_version: 1, bytecode_abi_major: 1, bytecode_abi_minor: 0,
      capabilities: { fpu: false, mpu: false, scheduler: true, max_tasks: 4 },
      memory: { work_size: 1, retain_size: 1, ipi_size: 1, opi_size: 1 },
    });
    await expect(adapter.getSystemInfo()).resolves.toMatchObject({ board_profile: 'rpi_pico/rp2040' });
    expect(internals.systemInfoCache).not.toBeNull();

    internals.sendJsonCommand = async () => ({ board: 'secret', legacy: true });
    await expect(adapter.getSystemInfo()).rejects.toThrow('ZPLC_DEVICE_HANDSHAKE_INVALID');
    expect(internals.systemInfoCache).toBeNull();
  });
  it('withholds split terminal echoes until they can be redacted as a complete line', () => {
    const adapter = new SerialAdapter();
    const connection = { _rxBuffer: 'zplc config set wifi_pass "test-' } as SerialConnection;
    const internals = adapter as unknown as { connection: SerialConnection };
    internals.connection = connection;

    expect(adapter.getRxBuffer()).toBe('');
    expect(connection._rxBuffer).toContain('test-');

    connection._rxBuffer += 'secret"\n';
    expect(adapter.getRxBuffer()).toBe('zplc config set wifi_pass "***"\n');
  });

  it('keeps a deployed program idle until explicit start', async () => {
    const transcript: string[] = [];
    const connection = {
      _rxBuffer: '',
      isConnected: true,
      writer: {
        write: async (data: Uint8Array) => {
          const command = new TextDecoder().decode(data).trim();
          if (command) {
            transcript.push(command);
            connection._rxBuffer = 'OK: accepted\\n';
          }
        },
      },
    } as unknown as SerialConnection;
    const adapter = new SerialAdapter();
    const internals = adapter as unknown as {
      _connected: boolean;
      connection: SerialConnection;
    };
    internals._connected = true;
    internals.connection = connection;

    await adapter.loadProgram(new Uint8Array([0x01]));

    expect(adapter.state).toBe('idle');
    expect(transcript).not.toContain('zplc start');

    await adapter.start();

    expect(adapter.state).toBe('running');
    expect(transcript.at(-1)).toBe('zplc start');
  });

  it('rejects and closes the port when the initial ZPLC status handshake fails', async () => {
    let closeCalls = 0;
    const serialConnection = {
      _rxBuffer: '',
      isConnected: true,
      _reader: null,
      _readerTask: null,
      _dataListeners: new Set(),
      writer: { releaseLock: () => undefined },
      port: { close: async () => { closeCalls += 1; } },
    } as unknown as SerialConnection;
    const adapter = new SerialAdapter();
    const internals = adapter as unknown as {
      _connected: boolean;
      connection: SerialConnection;
      port: SerialPort;
      connectionAttempt: number;
      failInitialStatusHandshake: (connection: SerialConnection, attempt: number) => Promise<never>;
    };
    internals._connected = true;
    internals.connection = serialConnection;
    internals.port = serialConnection.port;
    internals.connectionAttempt = 1;

    await expect(internals.failInitialStatusHandshake(serialConnection, 1)).rejects.toThrow('Initial ZPLC status handshake failed');
    expect(closeCalls).toBe(1);
    expect(adapter.connected).toBe(false);
    expect(adapter.state).toBe('disconnected');
  });

  it('rejects malformed status responses without exposing their payload', async () => {
    const adapter = new SerialAdapter();
    (adapter as unknown as { sendJsonCommand: () => Promise<unknown> }).sendJsonCommand = async () => ({
      state: 'not-a-zplc-state',
      uptime_ms: 1,
      stats: { cycles: 1 },
      opi: [0],
      secret_payload: 'must-not-leak',
    });

    await expect(adapter.getStatus()).rejects.toThrow('Invalid ZPLC status response');
    await expect(adapter.getStatus()).rejects.not.toThrow('must-not-leak');
  });

  it('accepts only a complete, internally consistent force-list response', async () => {
    const adapter = new SerialAdapter();
    const internals = adapter as unknown as { _connected: boolean; sendJsonCommand: () => Promise<unknown> };
    internals._connected = true;
    internals.sendJsonCommand = async () => ({ count: 0, items: [] });
    await expect(adapter.listForcedValues()).resolves.toEqual([]);

    internals.sendJsonCommand = async () => ({ count: 1, items: [{ addr: 16, size: 2, bytes: '0aFF' }] });
    await expect(adapter.listForcedValues()).resolves.toEqual([{
      path: '0x0010', address: 16, size: 2, type: 'WORD', bytesHex: '0aFF', state: WATCH_FORCE_STATE.FORCED,
    }]);
  });

  it('rejects malformed force-list responses without exposing their payload', async () => {
    const adapter = new SerialAdapter();
    const internals = adapter as unknown as { _connected: boolean; sendJsonCommand: () => Promise<unknown> };
    internals._connected = true;
    internals.sendJsonCommand = async () => ({ items: [], secret_payload: 'must-not-leak' });

    await expect(adapter.listForcedValues()).rejects.toThrow('Invalid force list response');
    await expect(adapter.listForcedValues()).rejects.not.toThrow('must-not-leak');
  });

  it('rejects force-list entries outside the runtime force contract', async () => {
    const adapter = new SerialAdapter();
    const internals = adapter as unknown as { _connected: boolean; sendJsonCommand: () => Promise<unknown> };
    internals._connected = true;

    for (const response of [
      { count: 9, items: Array.from({ length: 9 }, (_, index) => ({ addr: index * 2, size: 1, bytes: '00' })) },
      { count: 1, items: [{ addr: 0x10000, size: 1, bytes: '00' }] },
      { count: 1, items: [{ addr: 0, size: 261, bytes: '00'.repeat(261) }] },
      { count: 1, items: [{ addr: 0x0fff, size: 2, bytes: '0000' }] },
      { count: 2, items: [{ addr: 0, size: 2, bytes: '0000' }, { addr: 1, size: 1, bytes: '00' }] },
    ]) {
      internals.sendJsonCommand = async () => response;
      await expect(adapter.listForcedValues()).rejects.toThrow('Invalid force list response');
    }
  });

  it('requires an explicit OK confirmation for force mutations', async () => {
    const adapter = new SerialAdapter();
    const internals = adapter as unknown as { _connected: boolean; sendDebugCommand: () => Promise<string> };
    internals._connected = true;
    internals.sendDebugCommand = async () => 'OK: applied';

    await expect(adapter.forceValue(16, new Uint8Array([1]))).resolves.toBeUndefined();
    await expect(adapter.clearForcedValue(16)).resolves.toBeUndefined();
    await expect(adapter.clearAllForcedValues()).resolves.toBeUndefined();

    for (const response of ['WARN: pending', '', 'ERROR: secret-payload']) {
      internals.sendDebugCommand = async () => response;
      await expect(adapter.forceValue(16, new Uint8Array([1]))).rejects.toThrow('Force command confirmation failed');
      await expect(adapter.clearForcedValue(16)).rejects.toThrow('Force command confirmation failed');
      await expect(adapter.clearAllForcedValues()).rejects.toThrow('Force command confirmation failed');
      await expect(adapter.forceValue(16, new Uint8Array([1]))).rejects.not.toThrow('secret-payload');
    }

    internals.sendDebugCommand = async () => { throw new Error('transport secret-payload'); };
    await expect(adapter.clearForcedValue(16)).rejects.toThrow('Force command confirmation failed');
    await expect(adapter.clearForcedValue(16)).rejects.not.toThrow('secret-payload');
  });

  it('handles reader loss once and ignores callbacks from an old connection', async () => {
    const terminations: string[] = [];
    const adapter = new SerialAdapter((_adapter, message) => terminations.push(message));
    const oldConnection = {
      _rxBuffer: '', isConnected: false, _reader: null, _readerTask: null, _dataListeners: new Set(),
      writer: { releaseLock: () => undefined }, port: { close: async () => undefined },
    } as unknown as SerialConnection;
    const replacement = {
      _rxBuffer: '', isConnected: true, _reader: null, _readerTask: null, _dataListeners: new Set(),
      writer: { releaseLock: () => undefined }, port: { close: async () => undefined },
    } as unknown as SerialConnection;
    const internals = adapter as unknown as {
      connection: SerialConnection;
      port: SerialPort;
      _connected: boolean;
      connectionAttempt: number;
      handleUnexpectedReaderTermination: (connection: SerialConnection, attempt: number, message: string) => void;
    };
    internals.connection = oldConnection;
    internals.port = oldConnection.port;
    internals._connected = true;
    internals.connectionAttempt = 1;

    internals.handleUnexpectedReaderTermination(oldConnection, 1, 'reader lost');
    expect(adapter.connected).toBe(false);
    expect(adapter.state).toBe('disconnected');
    expect(terminations).toEqual(['reader lost']);

    internals.connection = replacement;
    internals.port = replacement.port;
    internals._connected = true;
    internals.connectionAttempt = 2;
    internals.handleUnexpectedReaderTermination(oldConnection, 1, 'old reader lost');
    expect(adapter.connected).toBe(true);
    expect(terminations).toEqual(['reader lost']);
  });

  it('serializes raw terminal writes behind an in-flight command', async () => {
    const gate = deferred<void>();
    const writes: string[] = [];
    const connection = {
      _rxBuffer: '',
      isConnected: true,
      writer: { write: async (data: Uint8Array) => writes.push(new TextDecoder().decode(data)) },
    } as unknown as SerialConnection;
    const adapter = new SerialAdapter();
    const internals = adapter as unknown as {
      connection: SerialConnection;
      withCommandMutex: <T>(fn: () => Promise<T>) => Promise<T>;
    };
    internals.connection = connection;

    const command = internals.withCommandMutex(() => gate.promise);
    const rawWrite = adapter.sendRaw('terminal command\n');
    await Promise.resolve();
    expect(writes).toEqual([]);

    gate.resolve();
    await command;
    await rawWrite;

    expect(writes).toEqual(['terminal command\n']);
  });

  it('does not let passthrough reads consume an in-flight command response', async () => {
    const gate = deferred<void>();
    const connection = { _rxBuffer: 'status response\n' } as SerialConnection;
    const adapter = new SerialAdapter();
    const internals = adapter as unknown as {
      connection: SerialConnection;
      withCommandMutex: <T>(fn: () => Promise<T>) => Promise<T>;
    };
    internals.connection = connection;

    const command = internals.withCommandMutex(() => gate.promise);
    await Promise.resolve();
    expect(adapter.getRxBuffer()).toBe('');
    adapter.clearRxBuffer();
    expect(connection._rxBuffer).toBe('status response\n');

    gate.resolve();
    await command;
    expect(adapter.getRxBuffer()).toBe('status response\n');
    adapter.clearRxBuffer();
    expect(connection._rxBuffer).toBe('');
  });
});
