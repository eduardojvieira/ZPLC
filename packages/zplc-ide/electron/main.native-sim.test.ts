import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { NativeSimulationSupervisor } from './nativeSimulationSupervisor';
import { resolveDefaultSimulatorBinaryPathForTests } from './nativeSimulationSupervisor';

const NATIVE_MESSAGE_TYPE = {
  REQUEST: 'request',
  RESPONSE: 'response',
  EVENT: 'event',
} as const;

function createNativeRequest(id: string, method: string, params: Record<string, unknown>) {
  return {
    id,
    type: NATIVE_MESSAGE_TYPE.REQUEST,
    method,
    params,
  } as const;
}

class FakeChildProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = mock((_signal?: NodeJS.Signals | number) => true);
}

function waitForStdInLine(stream: PassThrough): Promise<string> {
  return new Promise((resolve) => {
    let buffer = '';

    const onData = (chunk: string | Buffer) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex);
      stream.off('data', onData);
      resolve(line);
    };

    stream.on('data', onData);
  });
}

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const ELECTRON_DIR = path.dirname(TEST_FILE_PATH);

describe('NativeSimulationSupervisor', () => {
  let child: FakeChildProcess;
  const originalResourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');

  function setResourcesPathForTest(value: string | undefined): void {
    Object.defineProperty(process, 'resourcesPath', {
      value,
      configurable: true,
      writable: false,
    });
  }

  function restoreResourcesPathForTest(): void {
    if (originalResourcesPathDescriptor) {
      Object.defineProperty(process, 'resourcesPath', originalResourcesPathDescriptor);
      return;
    }

    Reflect.deleteProperty(process, 'resourcesPath');
  }

  beforeEach(() => {
    child = new FakeChildProcess();
    restoreResourcesPathForTest();
  });

  afterEach(() => {
    child.stdin.end();
    child.stdout.end();
    child.stderr.end();
    restoreResourcesPathForTest();
  });

  it('starts a session with a hello handshake', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide',
      clientVersion: '1.4.8',
      spawnProcess: () => child,
    });

    const pendingHello = supervisor.startSession();
    const helloLine = await waitForStdInLine(child.stdin);
    const helloRequest = JSON.parse(helloLine) as {
      id: string;
      type: string;
      method: string;
      params: Record<string, unknown>;
    };

    expect(helloRequest.type).toBe(NATIVE_MESSAGE_TYPE.REQUEST);
    expect(helloRequest.method).toBe('session.hello');
    expect(helloRequest.params.client_name).toBe('zplc-ide');

    child.stdout.write(
      `${JSON.stringify({
        id: helloRequest.id,
        type: NATIVE_MESSAGE_TYPE.RESPONSE,
        result: {
          protocol_version: '1.0',
          runtime_kind: 'native-posix',
          runtime_version: '1.5.0',
          capability_profile: {
            profile_id: 'cap-01',
            features: [{ name: 'pause', status: 'supported' }],
          },
        },
      })}\n`,
    );

    await expect(pendingHello).resolves.toMatchObject({
      runtime_kind: 'native-posix',
      capability_profile: { profile_id: 'cap-01' },
    });
  });

  it('uses explicit .js extensions for Electron runtime imports', () => {
    const mainSource = readFileSync(path.join(ELECTRON_DIR, 'main.ts'), 'utf8');
    const supervisorSource = readFileSync(path.join(ELECTRON_DIR, 'nativeSimulationSupervisor.ts'), 'utf8');
    const preloadSource = readFileSync(path.join(ELECTRON_DIR, 'preload.ts'), 'utf8');

    expect(mainSource).toContain("import type { NativeSimulationRequest } from './nativeSimulationIpc.js'");
    expect(mainSource).toContain("from './nativeSimulationSupervisor.js'");
    expect(supervisorSource).toContain("from './nativeSimulationIpc.js'");
    expect(preloadSource).toContain("import type {");
    expect(preloadSource).toContain("} from './nativeSimulationIpc.js'");
    expect(mainSource).toContain("const NATIVE_SIMULATION_CHANNEL = {");
    expect(preloadSource).toContain("const NATIVE_SIMULATION_CHANNEL = {");
  });

  it('routes requests and resolves structured responses', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide',
      clientVersion: '1.4.8',
      spawnProcess: () => child,
    });

    const pendingHello = supervisor.startSession();
    const helloLine = await waitForStdInLine(child.stdin);
    const helloRequest = JSON.parse(helloLine) as { id: string };
    child.stdout.write(
      `${JSON.stringify({
        id: helloRequest.id,
        type: NATIVE_MESSAGE_TYPE.RESPONSE,
        result: {
          protocol_version: '1.0',
          runtime_kind: 'native-posix',
          runtime_version: '1.5.0',
          capability_profile: { profile_id: 'cap-01', features: [] },
        },
      })}\n`,
    );
    await pendingHello;

    const pendingStatus = supervisor.request(createNativeRequest('req-2', 'status.get', {}));
    const requestLine = await waitForStdInLine(child.stdin);
    const statusRequest = JSON.parse(requestLine) as { id: string; method: string };

    expect(statusRequest.method).toBe('status.get');

    child.stdout.write(
      `${JSON.stringify({
        id: statusRequest.id,
        type: NATIVE_MESSAGE_TYPE.RESPONSE,
        result: {
          state: 'idle',
          uptime_ms: 10,
          stats: { cycles: 3, active_tasks: 1, overruns: 0, program_size: 5 },
          focused_vm: { pc: 4, sp: 1, halted: false, error: 0 },
          tasks: [],
          opi: [0, 1, 0, 0],
          force_entries: [],
        },
      })}\n`,
    );

    await expect(pendingStatus).resolves.toMatchObject({
      state: 'idle',
      focused_vm: { pc: 4 },
    });
  });

  it('forwards runtime events and performs graceful shutdown', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide',
      clientVersion: '1.4.8',
      spawnProcess: () => child,
    });

    const events: Array<{ method: string }> = [];
    const unsubscribe = supervisor.onEvent((event) => {
      events.push({ method: event.method });
    });

    const pendingHello = supervisor.startSession();
    const helloLine = await waitForStdInLine(child.stdin);
    const helloRequest = JSON.parse(helloLine) as { id: string };
    child.stdout.write(
      `${JSON.stringify({
        id: helloRequest.id,
        type: NATIVE_MESSAGE_TYPE.RESPONSE,
        result: {
          protocol_version: '1.0',
          runtime_kind: 'native-posix',
          runtime_version: '1.5.0',
          capability_profile: { profile_id: 'cap-01', features: [] },
        },
      })}\n`,
    );
    await pendingHello;

    child.stdout.write(
      `${JSON.stringify({
        type: NATIVE_MESSAGE_TYPE.EVENT,
        method: 'status.changed',
        params: {
          state: 'running',
          uptime_ms: 42,
          stats: { cycles: 8, active_tasks: 1, overruns: 0, program_size: 5 },
          focused_vm: { pc: 9, sp: 2, halted: false, error: 0 },
          tasks: [],
          opi: [1, 0, 0, 0],
          force_entries: [],
        },
      })}\n`,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([{ method: 'status.changed' }]);

    const pendingStop = supervisor.stopSession();
    const shutdownLine = await waitForStdInLine(child.stdin);
    const shutdownRequest = JSON.parse(shutdownLine) as { id: string; method: string };
    expect(shutdownRequest.method).toBe('session.shutdown');

    child.stdout.write(
      `${JSON.stringify({
        id: shutdownRequest.id,
        type: NATIVE_MESSAGE_TYPE.RESPONSE,
        result: {},
      })}\n`,
    );

    await expect(pendingStop).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('emits runtime.error events from stderr output', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide',
      clientVersion: '1.4.8',
      spawnProcess: () => child,
    });

    const events: Array<{ method: string; params: Record<string, unknown> }> = [];
    const unsubscribe = supervisor.onEvent((event) => {
      events.push({ method: event.method, params: event.params });
    });

    const pendingHello = supervisor.startSession();
    const helloLine = await waitForStdInLine(child.stdin);
    const helloRequest = JSON.parse(helloLine) as { id: string };
    child.stdout.write(
      `${JSON.stringify({
        id: helloRequest.id,
        type: NATIVE_MESSAGE_TYPE.RESPONSE,
        result: {
          protocol_version: '1.0',
          runtime_kind: 'native-posix',
          runtime_version: '1.5.0',
          capability_profile: { profile_id: 'cap-01', features: [] },
        },
      })}\n`,
    );
    await pendingHello;

    child.stderr.write('[native-sim] host warning\n');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toEqual([
      {
        method: 'runtime.error',
        params: {
          code: 'STDERR',
          message: '[native-sim] host warning',
        },
      },
    ]);

    unsubscribe();
  });

  it('forwards capability.updated events to renderer listeners', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide',
      clientVersion: '1.4.8',
      spawnProcess: () => child,
    });

    const events: Array<{ method: string; params: Record<string, unknown> }> = [];
    const unsubscribe = supervisor.onEvent((event) => {
      events.push({ method: event.method, params: event.params });
    });

    const pendingHello = supervisor.startSession();
    const helloLine = await waitForStdInLine(child.stdin);
    const helloRequest = JSON.parse(helloLine) as { id: string };
    child.stdout.write(
      `${JSON.stringify({
        id: helloRequest.id,
        type: NATIVE_MESSAGE_TYPE.RESPONSE,
        result: {
          protocol_version: '1.0',
          runtime_kind: 'native-posix',
          runtime_version: '1.5.0',
          capability_profile: { profile_id: 'cap-01', features: [] },
        },
      })}\n`,
    );
    await pendingHello;

    child.stdout.write(
      `${JSON.stringify({
        type: NATIVE_MESSAGE_TYPE.EVENT,
        method: 'capability.updated',
        params: {
          profile_id: 'cap-02',
          features: [
            { name: 'pause', status: 'supported' },
            { name: 'tasks', status: 'degraded', reason: 'host scheduler parity incomplete' },
          ],
        },
      })}\n`,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([
      {
        method: 'capability.updated',
        params: {
          profile_id: 'cap-02',
          features: [
            { name: 'pause', status: 'supported' },
            { name: 'tasks', status: 'degraded', reason: 'host scheduler parity incomplete' },
          ],
        },
      },
    ]);

    unsubscribe();
  });

  it('keeps packaged native runtime lookup ahead of repo build fallbacks', () => {
    const supervisorSource = readFileSync(path.join(ELECTRON_DIR, 'nativeSimulationSupervisor.ts'), 'utf8');
    const packagedRuntimePath = '/tmp/zplc-packaged-app/Contents/Resources/native-runtime/zplc_runtime';
    const repoRuntimePath = '/workspace/ZPLC/firmware/lib/zplc_core/build/zplc_runtime';
    const resolvedPath = resolveDefaultSimulatorBinaryPathForTests({
      cwd: '/workspace/ZPLC/packages/zplc-ide',
      resourcesPath: '/tmp/zplc-packaged-app/Contents/Resources',
      existingPaths: [repoRuntimePath, packagedRuntimePath],
    });

    expect(supervisorSource).toContain("path.resolve(resourcesPath, 'native-runtime/zplc_runtime')");
    expect(supervisorSource).toContain("path.resolve(resourcesPath, 'native-runtime/zplc_runtime.exe')");
    expect(resolvedPath).toBe(packagedRuntimePath);
  });

  it('falls back to repo lookup when Electron resourcesPath is unavailable', () => {
    const resolvedPath = resolveDefaultSimulatorBinaryPathForTests({
      cwd: '/workspace/ZPLC/packages/zplc-ide',
    });

    expect(resolvedPath).toContain('firmware/lib/zplc_core/build/zplc_runtime');
  });
});
