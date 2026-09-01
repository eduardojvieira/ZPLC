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
  readonly kill = mock(() => true);
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

function writeHelloResponse(childProcess: FakeChildProcess, requestId: string): void {
  childProcess.stdout.write(
    `${JSON.stringify({
      id: requestId,
      type: NATIVE_MESSAGE_TYPE.RESPONSE,
      result: {
        protocol_version: '1.0',
        runtime_kind: 'native-posix',
        runtime_version: '1.5.0',
        capability_profile: { profile_id: 'cap-01', features: [] },
      },
    })}\n`,
  );
}

async function startReadySession(
  supervisor: NativeSimulationSupervisor,
  childProcess: FakeChildProcess,
): Promise<void> {
  const pendingStart = supervisor.startSession();
  const hello = JSON.parse(await waitForStdInLine(childProcess.stdin)) as { id: string };
  writeHelloResponse(childProcess, hello.id);
  await pendingStart;
}

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const ELECTRON_DIR = path.dirname(TEST_FILE_PATH);

describe('NativeSimulationSupervisor', () => {
  let child: FakeChildProcess;
  const originalResourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');

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

  it('passes an explicit environment unchanged to the spawned simulator', async () => {
    const environment = { ZPLC_NATIVE_SIM_BIN: '/isolated/runtime', ZPLC_SCENARIO: '1' };
    let receivedEnvironment: NodeJS.ProcessEnv | undefined;
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide',
      clientVersion: '1.4.8',
      environment,
      spawnProcess: (received) => {
        receivedEnvironment = received;
        return child;
      },
    });

    const pendingHello = supervisor.startSession();
    const hello = JSON.parse(await waitForStdInLine(child.stdin)) as { id: string };

    expect(receivedEnvironment).toBe(environment);
    expect(receivedEnvironment).toEqual(environment);
    writeHelloResponse(child, hello.id);
    await pendingHello;
  });

  it('shares one hello handshake between concurrent session starts', async () => {
    const spawnProcess = mock(() => child);
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide',
      clientVersion: '1.4.8',
      spawnProcess,
    });
    const helloRequests: Array<{ id: string; method: string }> = [];
    child.stdin.on('data', (chunk: Buffer) => {
      helloRequests.push(JSON.parse(chunk.toString()) as { id: string; method: string });
    });

    const firstStart = supervisor.startSession();
    const secondStart = supervisor.startSession();

    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(helloRequests).toHaveLength(1);
    expect(helloRequests[0]?.method).toBe('session.hello');
    writeHelloResponse(child, helloRequests[0]?.id ?? 'missing');

    const [firstHello, secondHello] = await Promise.all([firstStart, secondStart]);
    expect(firstHello).toBe(secondHello);
  });

  it('shares one shutdown request between concurrent session stops', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess: () => child,
    });
    await startReadySession(supervisor, child);
    const shutdownLines: string[] = [];
    child.stdin.on('data', (chunk: Buffer) => shutdownLines.push(chunk.toString()));

    const firstStop = supervisor.stopSession();
    const secondStop = supervisor.stopSession();
    const shutdown = JSON.parse(shutdownLines[0] ?? '') as { id: string; method: string };

    expect(shutdownLines).toHaveLength(1);
    expect(shutdown.method).toBe('session.shutdown');
    child.stdout.write(`${JSON.stringify({ id: shutdown.id, type: NATIVE_MESSAGE_TYPE.RESPONSE, result: {} })}\n`);
    child.emit('exit', 0, null);
    await expect(Promise.all([firstStop, secondStop])).resolves.toEqual([undefined, undefined]);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('rejects public requests while stopping without writing to the child', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess: () => child,
    });
    await startReadySession(supervisor, child);
    const requestLines: string[] = [];
    child.stdin.on('data', (chunk: Buffer) => requestLines.push(chunk.toString()));

    const pendingStop = supervisor.stopSession();
    const shutdown = JSON.parse(requestLines[0] ?? '') as { id: string; method: string };
    await expect(supervisor.request(createNativeRequest('during-stop', 'status.get', {}))).rejects.toThrow('stopping');
    expect(requestLines).toHaveLength(1);
    expect(shutdown.method).toBe('session.shutdown');

    child.stdout.write(`${JSON.stringify({ id: shutdown.id, type: NATIVE_MESSAGE_TYPE.RESPONSE, result: {} })}\n`);
    child.emit('exit', 0, null);
    await pendingStop;
  });

  it('terminates a timed-out public request and keeps the child owned until exit', async () => {
    const nextChild = new FakeChildProcess();
    const spawnProcess = mock().mockImplementationOnce(() => child).mockImplementationOnce(() => nextChild);
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', lifecycleTimeoutMs: 5, requestTimeoutMs: 5, spawnProcess,
    });
    await startReadySession(supervisor, child);

    await expect(supervisor.request(createNativeRequest('hung-request', 'status.get', {}))).rejects.toThrow('status.get timed out');
    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');

    const pendingStop = supervisor.stopSession();
    const pendingRestart = supervisor.startSession();
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');

    child.emit('exit', null, 'SIGKILL');
    const hello = JSON.parse(await waitForStdInLine(nextChild.stdin)) as { id: string };
    writeHelloResponse(nextChild, hello.id);
    await expect(pendingStop).resolves.toBeUndefined();
    await expect(pendingRestart).resolves.toMatchObject({ runtime_kind: 'native-posix' });
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    nextChild.stdin.end(); nextChild.stdout.end(); nextChild.stderr.end();
  });

  it('keeps a timed-out hello child owned until it actually exits before retrying', async () => {
    const retryChild = new FakeChildProcess();
    const spawnProcess = mock()
      .mockImplementationOnce(() => child)
      .mockImplementationOnce(() => retryChild);
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', lifecycleTimeoutMs: 5, spawnProcess,
    });

    await expect(supervisor.startSession()).rejects.toThrow('session.hello timed out');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    const pendingRetry = supervisor.startSession();
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    child.emit('exit', null, 'SIGTERM');
    const hello = JSON.parse(await waitForStdInLine(retryChild.stdin)) as { id: string };
    writeHelloResponse(retryChild, hello.id);
    await pendingRetry;
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    retryChild.stdin.end();
    retryChild.stdout.end();
    retryChild.stderr.end();
  });

  it('permits a retry after a synchronous spawn failure', async () => {
    const retryChild = new FakeChildProcess();
    const spawnProcess = mock()
      .mockImplementationOnce(() => {
        throw new Error('spawn failed');
      })
      .mockImplementationOnce(() => retryChild);
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess,
    });

    await expect(supervisor.startSession()).rejects.toThrow('spawn failed');
    await startReadySession(supervisor, retryChild);
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    retryChild.stdin.end();
    retryChild.stdout.end();
    retryChild.stderr.end();
  });

  it('kills a shutdown that times out only after the child actually exits', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', lifecycleTimeoutMs: 5, spawnProcess: () => child,
    });
    await startReadySession(supervisor, child);

    const pendingStatus = supervisor.request(createNativeRequest('pending-status', 'status.get', {}));
    const pendingStatusResult = pendingStatus.then(
      () => null,
      (error: unknown) => error,
    );
    const pendingStop = supervisor.stopSession();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('exit', null, 'SIGTERM');
    await expect(pendingStop).resolves.toBeUndefined();
    await expect(pendingStatusResult).resolves.toThrow('session.shutdown timed out');
  });

  it('waits for stop before starting a new child session', async () => {
    const nextChild = new FakeChildProcess();
    const spawnProcess = mock()
      .mockImplementationOnce(() => child)
      .mockImplementationOnce(() => nextChild);
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess,
    });
    await startReadySession(supervisor, child);

    const pendingStop = supervisor.stopSession();
    const pendingRestart = supervisor.startSession();
    const shutdown = JSON.parse(await waitForStdInLine(child.stdin)) as { id: string };
    expect(spawnProcess).toHaveBeenCalledTimes(1);

    child.stdout.write(`${JSON.stringify({ id: shutdown.id, type: NATIVE_MESSAGE_TYPE.RESPONSE, result: {} })}\n`);
    child.emit('exit', 0, null);
    const hello = JSON.parse(await waitForStdInLine(nextChild.stdin)) as { id: string };
    writeHelloResponse(nextChild, hello.id);
    await pendingStop;
    await expect(pendingRestart).resolves.toMatchObject({ runtime_kind: 'native-posix' });
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    nextChild.stdin.end();
    nextChild.stdout.end();
    nextChild.stderr.end();
  });

  it('ignores stale child output, errors, and exits after a new session starts', async () => {
    const nextChild = new FakeChildProcess();
    const spawnProcess = mock()
      .mockImplementationOnce(() => child)
      .mockImplementationOnce(() => nextChild);
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess,
    });
    const events: string[] = [];
    const unsubscribe = supervisor.onEvent((event) => events.push(event.method));
    await startReadySession(supervisor, child);

    const pendingStop = supervisor.stopSession();
    const shutdown = JSON.parse(await waitForStdInLine(child.stdin)) as { id: string };
    child.stdout.write(`${JSON.stringify({ id: shutdown.id, type: NATIVE_MESSAGE_TYPE.RESPONSE, result: {} })}\n`);
    child.emit('exit', 0, null);
    await pendingStop;
    await startReadySession(supervisor, nextChild);
    events.length = 0;

    const pendingStatus = supervisor.request(createNativeRequest('next-status', 'status.get', {}));
    const status = JSON.parse(await waitForStdInLine(nextChild.stdin)) as { id: string };
    child.stdout.write(`${JSON.stringify({ type: NATIVE_MESSAGE_TYPE.EVENT, method: 'status.changed', params: {} })}\n`);
    child.stderr.write('stale error\n');
    child.emit('error', new Error('stale child error'));
    child.emit('exit', 1, null);
    nextChild.stdout.write(`${JSON.stringify({ id: status.id, type: NATIVE_MESSAGE_TYPE.RESPONSE, result: { state: 'idle' } })}\n`);

    await expect(pendingStatus).resolves.toEqual({ state: 'idle' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([]);
    unsubscribe();
    nextChild.stdin.end();
    nextChild.stdout.end();
    nextChild.stderr.end();
  });

  it('queues a fresh start after stopping a child with a pending hello', async () => {
    const nextChild = new FakeChildProcess();
    const spawnProcess = mock().mockImplementationOnce(() => child).mockImplementationOnce(() => nextChild);
    const supervisor = new NativeSimulationSupervisor({ clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess });
    const firstStart = supervisor.startSession();
    const stop = supervisor.stopSession();
    const restart = supervisor.startSession();
    const lines: string[] = [];
    child.stdin.on('data', (chunk: Buffer) => lines.push(chunk.toString()));

    child.emit('exit', 1, null);
    await expect(stop).resolves.toBeUndefined();
    await expect(firstStart).rejects.toThrow('session terminated');
    const nextHello = JSON.parse(await waitForStdInLine(nextChild.stdin)) as { id: string };
    writeHelloResponse(nextChild, nextHello.id);
    await expect(restart).resolves.toMatchObject({ runtime_kind: 'native-posix' });
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    nextChild.stdin.end(); nextChild.stdout.end(); nextChild.stderr.end();
  });

  it('treats an exit during requested shutdown as a completed disconnect and can restart', async () => {
    const nextChild = new FakeChildProcess();
    const spawnProcess = mock().mockImplementationOnce(() => child).mockImplementationOnce(() => nextChild);
    const supervisor = new NativeSimulationSupervisor({ clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess });
    await startReadySession(supervisor, child);

    const stop = supervisor.stopSession();
    child.emit('exit', 1, null);
    await expect(stop).resolves.toBeUndefined();
    await startReadySession(supervisor, nextChild);
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    nextChild.stdin.end(); nextChild.stdout.end(); nextChild.stderr.end();
  });

  it('kills a child that acknowledges shutdown without exiting', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', lifecycleTimeoutMs: 5, spawnProcess: () => child,
    });
    await startReadySession(supervisor, child);
    const lines: string[] = [];
    child.stdin.on('data', (chunk: Buffer) => lines.push(chunk.toString()));

    const stop = supervisor.stopSession();
    const shutdown = JSON.parse(lines[0] ?? '') as { id: string };
    child.stdout.write(`${JSON.stringify({ id: shutdown.id, type: NATIVE_MESSAGE_TYPE.RESPONSE, result: {} })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('exit', null, 'SIGTERM');
    await expect(stop).resolves.toBeUndefined();
  });

  it('fails closed until a child ignoring SIGTERM is killed and actually exits', async () => {
    const nextChild = new FakeChildProcess();
    const spawnProcess = mock()
      .mockImplementationOnce(() => child)
      .mockImplementationOnce(() => nextChild);
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', lifecycleTimeoutMs: 5, spawnProcess,
    });
    await startReadySession(supervisor, child);

    const pendingStop = supervisor.stopSession();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');

    const pendingRestart = supervisor.startSession();
    expect(spawnProcess).toHaveBeenCalledTimes(1);

    child.emit('exit', null, 'SIGKILL');
    const hello = JSON.parse(await waitForStdInLine(nextChild.stdin)) as { id: string };
    writeHelloResponse(nextChild, hello.id);
    await expect(pendingStop).resolves.toBeUndefined();
    await expect(pendingRestart).resolves.toMatchObject({ runtime_kind: 'native-posix' });
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    nextChild.stdin.end(); nextChild.stdout.end(); nextChild.stderr.end();
  });

  it('keeps a protocol-failed child owned until it exits before retrying', async () => {
    const nextChild = new FakeChildProcess();
    const spawnProcess = mock()
      .mockImplementationOnce(() => child)
      .mockImplementationOnce(() => nextChild);
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess,
    });
    await startReadySession(supervisor, child);

    const failedRequest = supervisor.request(createNativeRequest('bad-protocol', 'status.get', {}));
    child.stdout.write('{invalid}\n');
    await expect(failedRequest).rejects.toThrow('Native simulator session terminated');

    const pendingRetry = supervisor.startSession();
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    child.emit('exit', null, 'SIGTERM');
    const hello = JSON.parse(await waitForStdInLine(nextChild.stdin)) as { id: string };
    writeHelloResponse(nextChild, hello.id);
    await pendingRetry;
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    nextChild.stdin.end(); nextChild.stdout.end(); nextChild.stderr.end();
  });

  it('reuses termination for stops after a protocol failure without writing shutdown', async () => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess: () => child,
    });
    await startReadySession(supervisor, child);
    const lines: string[] = [];
    child.stdin.on('data', (chunk: Buffer) => lines.push(chunk.toString()));

    const failedRequest = supervisor.request(createNativeRequest('stop-after-failure', 'status.get', {}));
    child.stdout.write('{invalid}\n');
    await expect(failedRequest).rejects.toThrow('Native simulator session terminated');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    const lineCountBeforeStop = lines.length;

    const firstStop = supervisor.stopSession();
    const secondStop = supervisor.stopSession();
    expect(firstStop).toBe(secondStop);
    expect(lines).toHaveLength(lineCountBeforeStop);

    child.emit('exit', null, 'SIGTERM');
    await expect(Promise.all([firstStop, secondStop])).resolves.toEqual([undefined, undefined]);
  });

  it('rejects duplicate request ids before writing a second line', async () => {
    const supervisor = new NativeSimulationSupervisor({ clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess: () => child });
    await startReadySession(supervisor, child);
    const lines: string[] = [];
    child.stdin.on('data', (chunk: Buffer) => lines.push(chunk.toString()));
    const first = supervisor.request(createNativeRequest('duplicate', 'status.get', {}));
    const firstResult = first.then(() => null, (error: unknown) => error);
    await expect(supervisor.request(createNativeRequest('duplicate', 'status.get', {}))).rejects.toThrow('already pending');
    expect(lines).toHaveLength(1);
    child.emit('exit', 1, null);
    await expect(firstResult).resolves.toThrow('session terminated');
  });

  for (const [label, output] of [
    ['invalid JSON', '{invalid}\n'],
    ['oversized output', `${'A'.repeat(8192)}\n`],
    ['oversized whitespace output', `${' '.repeat(8192)}\n`],
    ['oversized remainder', 'A'.repeat(8192)],
  ] as const) {
    it(`terminates only the child on ${label}`, async () => {
      const supervisor = new NativeSimulationSupervisor({ clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess: () => child });
      const events: string[] = [];
      supervisor.onEvent((event) => events.push(event.method));
      await startReadySession(supervisor, child);
      const pending = supervisor.request(createNativeRequest(`bad-${label}`, 'status.get', {}));
      const result = pending.then(() => null, (error: unknown) => error);
      child.stdout.write(output);
      await expect(result).resolves.toThrow('Native simulator session terminated');
      expect(events).toEqual([]);
      child.emit('exit', null, 'SIGTERM');
      expect(events).toEqual(['session.exited']);
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });
  }

  it('does not forward a later event from a chunk after a protocol failure', async () => {
    const supervisor = new NativeSimulationSupervisor({ clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess: () => child });
    const events: string[] = [];
    supervisor.onEvent((event) => events.push(event.method));
    await startReadySession(supervisor, child);
    const pending = supervisor.request(createNativeRequest('bad-chunk', 'status.get', {}));
    const result = pending.then(() => null, (error: unknown) => error);
    child.stdout.write('{invalid}\n{"type":"event","method":"status.changed","params":{}}\n');
    await expect(result).resolves.toThrow('Native simulator session terminated');
    expect(events).toEqual([]);
    child.emit('exit', null, 'SIGTERM');
    expect(events).toEqual(['session.exited']);
  });

  it('uses explicit .js extensions for Electron runtime imports', () => {
    const mainSource = readFileSync(path.join(ELECTRON_DIR, 'main.ts'), 'utf8');
    const supervisorSource = readFileSync(path.join(ELECTRON_DIR, 'nativeSimulationSupervisor.ts'), 'utf8');
    const preloadSource = readFileSync(path.join(ELECTRON_DIR, 'preload.ts'), 'utf8');
    const firmwareBuildGatewaySource = readFileSync(path.join(ELECTRON_DIR, 'firmwareBuildGateway.ts'), 'utf8');
    const workspaceTestGatewaySource = readFileSync(path.join(ELECTRON_DIR, 'workspaceTestGateway.ts'), 'utf8');

    expect(mainSource).toContain("import type { NativeSimulationRequest } from './nativeSimulationIpc.js'");
    expect(mainSource).toContain("from './nativeSimulationSupervisor.js'");
    expect(supervisorSource).toContain("from './nativeSimulationIpc.js'");
    expect(preloadSource).toContain("import type {");
    expect(preloadSource).toContain("} from './nativeSimulationIpc.js'");
    expect(firmwareBuildGatewaySource).toContain("from './security.js'");
    expect(workspaceTestGatewaySource).toContain("from './security.js'");
    expect(mainSource).toContain("const NATIVE_SIMULATION_CHANNEL = {");
    expect(preloadSource).toContain("const NATIVE_SIMULATION_CHANNEL = {");
  });

  it('keeps the Electron boundary deny-by-default', () => {
    const mainSource = readFileSync(path.join(ELECTRON_DIR, 'main.ts'), 'utf8');

    expect(mainSource).toContain('sandbox: true');
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('nodeIntegration: false');
    expect(mainSource).toContain('webSecurity: true');
    expect(mainSource).toContain('onHeadersReceived');
    expect(mainSource).toContain('const isDev = !app.isPackaged;');
    expect(mainSource).not.toContain("process.env.NODE_ENV === 'development'");
    expect(mainSource).toContain("app.commandLine.hasSwitch('zplc-smoke-port')");
    expect(mainSource).toContain("if (!app.commandLine.hasSwitch('headless')) throw new Error('--zplc-smoke-port requires --headless');");
    expect(mainSource).toContain("app.commandLine.getSwitchValue('zplc-smoke-port')");
    expect(mainSource).toContain('const rendererDevelopmentPort = developmentRendererPort();');
    expect(mainSource).toContain('trustedDevelopmentRendererUrl(rendererDevelopmentPort)');
    expect(mainSource).toContain('mainWindow.loadURL(expectedRendererUrl());');
    expect(mainSource).toContain('createContentSecurityPolicy(isDev, rendererDevelopmentPort)');
    expect(mainSource).toContain("if (!app.commandLine.hasSwitch('headless')) {");
    expect(mainSource).toContain('mainWindow.webContents.openDevTools();');
    expect(mainSource).not.toContain('experimentalFeatures');
    expect(mainSource).toContain("permission === 'serial'");
    expect(mainSource).toContain('serialRendererIsCurrent(webContents)');
    expect(mainSource).toContain('setPermissionRequestHandler((_webContents, _permission, callback) => {');
    expect(mainSource).toContain('callback(false);');
    expect(mainSource).not.toContain('setDevicePermissionHandler');
    expect(mainSource).not.toContain('knownVendors');
    expect(mainSource).not.toContain('portList[0]');
    expect(mainSource).toContain("event.preventDefault();");
    expect(mainSource).toContain('selectSerialPort({');
    expect(mainSource).toContain("sess.on('serial-port-removed'");
    expect(mainSource).toContain("sess.removeListener('serial-port-removed'");
    expect(mainSource).toContain("contents.setWindowOpenHandler(() => ({ action: 'deny' }))");
    expect(mainSource).toContain("contents.on('will-navigate'");
    expect(mainSource).toContain("contents.on('will-redirect', (details) => {");
    expect(mainSource).toContain('if (!isExpectedRendererDocument(details.url, expectedRendererUrl())) {');
    expect(mainSource).toContain('details.preventDefault();');
    expect(mainSource).toContain("contents.on('will-attach-webview'");
    expect(mainSource).not.toContain('open-external');
    expect(mainSource).toContain("ipcMain.handle('get-app-info', (event)");
    expect(mainSource).toContain('isTrustedRenderer(event, mainWindow, expectedRendererUrl())');
    expect(mainSource).toContain('isAllowedNativeSimulationRequest(request)');
  });

  it('revokes renderer authority for every replaced document and fences native events by document epoch', () => {
    const mainSource = readFileSync(path.join(ELECTRON_DIR, 'main.ts'), 'utf8');

    expect(mainSource).toContain('function revokeRendererOwner(ownerId: number): void {');
    expect(mainSource).toContain("webContents.on('render-process-gone', () => revokeRendererOwner(ownerWebContentsId));");
    expect(mainSource).toContain("webContents.on('destroyed', () => revokeRendererOwner(ownerWebContentsId));");
    expect(mainSource).toContain("webContents.on('did-start-navigation', (details) => {");
    expect(mainSource).toContain('if (details.isMainFrame && !details.isSameDocument) {');
    const navigationStart = mainSource.indexOf("webContents.on('did-start-navigation'");
    const navigationCommit = mainSource.indexOf("webContents.on('did-navigate'");
    expect(mainSource.slice(navigationStart, navigationCommit)).toContain('revokeRendererOwner(ownerWebContentsId);');
    expect(mainSource.slice(navigationStart, navigationCommit)).not.toContain('activateRendererDocument(ownerWebContentsId);');
    expect(mainSource).toContain("webContents.on('did-navigate', (_event, url) => {");
    expect(mainSource).toContain('if (!webContents.isDestroyed() && isExpectedRendererDocument(url, expectedRendererUrl())) {');
    expect(mainSource.slice(navigationCommit)).toContain('activateRendererDocument(ownerWebContentsId);');
    expect(mainSource).toContain('const owner = currentRendererOwner(event);');
    expect(mainSource).toContain('nativeSimulationOwner = owner;');
    expect(mainSource).toContain('activeRendererOwner.epoch === owner.epoch');
    expect(mainSource).toContain('nativeSimulationOwner.epoch === owner.epoch');
    expect(mainSource).toContain('if (!nativeSimulationBelongsTo(owner)) return;');
    expect(mainSource).toContain('nativeSimulationSupervisor !== supervisor');
    expect(mainSource).toContain('mainWindow.webContents.isDestroyed()');
    expect(mainSource).toContain('isExpectedRendererDocument(mainWindow.webContents.getURL(), expectedRendererUrl())');
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
    child.emit('exit', 0, null);

    await expect(pendingStop).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('emits neutral runtime.output events from stderr output', async () => {
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
        method: 'runtime.output',
        params: {
          stream: 'stderr',
          message: '[native-sim] host warning',
        },
      },
    ]);

    unsubscribe();
  });

  it('forwards protocol runtime errors and emits one exit event for requested shutdown', async () => {
    const supervisor = new NativeSimulationSupervisor({ clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess: () => child });
    const events: string[] = [];
    supervisor.onEvent((event) => events.push(event.method));
    await startReadySession(supervisor, child);
    child.stdout.write('{"type":"event","method":"runtime.error","params":{"code":"RUNTIME","message":"fault"}}\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const lines: string[] = [];
    child.stdin.on('data', (chunk: Buffer) => lines.push(chunk.toString()));
    const stop = supervisor.stopSession();
    const shutdown = JSON.parse(lines[0] ?? '') as { id: string };
    child.stdout.write(`${JSON.stringify({ id: shutdown.id, type: NATIVE_MESSAGE_TYPE.RESPONSE, result: {} })}\n`);
    child.stdout.write('{"type":"event","method":"session.exited","params":{}}\n');
    child.emit('exit', 0, null);
    await stop;
    expect(events).toEqual(['runtime.error', 'session.exited']);
  });

  it('emits one session exit for an unexpected OS exit', async () => {
    const supervisor = new NativeSimulationSupervisor({ clientName: 'zplc-ide', clientVersion: '1.4.8', spawnProcess: () => child });
    const events: string[] = [];
    supervisor.onEvent((event) => events.push(event.method));
    await startReadySession(supervisor, child);
    child.emit('exit', 1, null);
    expect(events).toEqual(['session.exited']);
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

  it('keeps a packaged native runtime pinned despite inherited development overrides', () => {
    const environmentSource = readFileSync(path.join(ELECTRON_DIR, 'nativeSimulationEnvironment.ts'), 'utf8');
    const bundledRuntime = '/tmp/zplc-packaged-app/resources/native-runtime/zplc_runtime';
    const repoRuntime = '/workspace/ZPLC/firmware/lib/zplc_core/build/zplc_runtime';

    expect(environmentSource).toContain('childEnvironment.ZPLC_NATIVE_SIM_BIN = path.join(');
    expect(environmentSource).toContain("resourcesPath,\n      'native-runtime'");
    expect(environmentSource).toContain("platform === 'win32' ? 'zplc_runtime.exe' : 'zplc_runtime'");
    expect(resolveDefaultSimulatorBinaryPathForTests({
      cwd: '/workspace/ZPLC/packages/zplc-ide',
      resourcesPath: '/tmp/zplc-packaged-app/resources',
      envPath: bundledRuntime,
      existingPaths: [repoRuntime],
    })).toBe(bundledRuntime);
  });

  it('falls back to repo lookup when Electron resourcesPath is unavailable', () => {
    const resolvedPath = resolveDefaultSimulatorBinaryPathForTests({
      cwd: '/workspace/ZPLC/packages/zplc-ide',
    });

    expect(resolvedPath).toContain('firmware/lib/zplc_core/build/zplc_runtime');
  });
});

describe('Electron product version', () => {
  it('uses the packaged app version instead of Git metadata', () => {
    const mainSource = readFileSync(path.join(ELECTRON_DIR, 'main.ts'), 'utf8');

    expect(mainSource).toContain('const appVersion = app.getVersion();');
    expect(mainSource).not.toContain('git describe');
  });
});
