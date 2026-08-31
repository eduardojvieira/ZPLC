import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import type {
  NativeSimulationEvent as NativeEventMessage,
  NativeSimulationHelloResult as NativeHelloResult,
  NativeSimulationRequest as NativeRequestMessage,
} from './nativeSimulationIpc.js';

const NATIVE_MESSAGE_TYPE = {
  REQUEST: 'request',
  RESPONSE: 'response',
  EVENT: 'event',
} as const;

interface NativeErrorPayload {
  message: string;
}

interface NativeResponseMessage<TResult = unknown> {
  id: string;
  type: typeof NATIVE_MESSAGE_TYPE.RESPONSE;
  result?: TResult;
  error?: NativeErrorPayload;
}

function createNativeRequest<TParams extends Record<string, unknown>>(
  id: string,
  method: string,
  params: TParams,
): NativeRequestMessage {
  return {
    id,
    type: NATIVE_MESSAGE_TYPE.REQUEST,
    method,
    params,
  };
}

interface NativeSimulationChildProcess {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

interface PendingRequest {
  childProcess: NativeSimulationChildProcess;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

interface ChildExitWaiter {
  promise: Promise<void>;
  resolve: () => void;
}

function createVoidDeferred(): ChildExitWaiter {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  if (!resolve) {
    throw new Error('Failed to create native simulator exit waiter');
  }
  return { promise, resolve };
}

export interface NativeSimulationSupervisorOptions {
  clientName: string;
  clientVersion: string;
  lifecycleTimeoutMs?: number;
  requestTimeoutMs?: number;
  environment?: NodeJS.ProcessEnv;
  spawnProcess?: (environment: NodeJS.ProcessEnv) => NativeSimulationChildProcess;
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse native simulator message: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isNativeResponseMessage(value: unknown): value is NativeResponseMessage {
  return typeof value === 'object' && value !== null
    && 'type' in value && 'id' in value
    && typeof value.type === 'string' && typeof value.id === 'string'
    && (!('error' in value) || value.error === undefined || (typeof value.error === 'object' && value.error !== null && 'message' in value.error && typeof value.error.message === 'string'));
}

function isNativeEventMessage(value: unknown): value is NativeEventMessage {
  return typeof value === 'object' && value !== null
    && 'type' in value && 'method' in value
    && typeof value.type === 'string' && typeof value.method === 'string';
}

function createSessionTerminatedError(message: string): Error {
  return new Error(`Native simulator session terminated: ${message}`);
}

interface SimulatorBinaryResolutionOptions {
  cwd: string;
  currentDir: string;
  envPath?: string;
  pathExists: (candidate: string) => boolean;
  resourcesPath: string | null;
}

function getDefaultSimulatorBinaryCandidates(options: Pick<SimulatorBinaryResolutionOptions, 'cwd' | 'currentDir' | 'resourcesPath'>): string[] {
  const { cwd, currentDir, resourcesPath } = options;

  return [
    ...(resourcesPath
      ? [
          path.resolve(resourcesPath, 'native-runtime/zplc_runtime'),
          path.resolve(resourcesPath, 'native-runtime/zplc_runtime.exe'),
        ]
      : []),
    path.resolve(currentDir, '../../../firmware/lib/zplc_core/build/zplc_runtime'),
    path.resolve(currentDir, '../../../firmware/lib/zplc_core/build/zplc_runtime.exe'),
    path.resolve(cwd, 'firmware/lib/zplc_core/build/zplc_runtime'),
    path.resolve(cwd, 'firmware/lib/zplc_core/build/zplc_runtime.exe'),
    path.resolve(cwd, '../firmware/lib/zplc_core/build/zplc_runtime'),
    path.resolve(cwd, '../firmware/lib/zplc_core/build/zplc_runtime.exe'),
    path.resolve(cwd, '../../firmware/lib/zplc_core/build/zplc_runtime'),
    path.resolve(cwd, '../../firmware/lib/zplc_core/build/zplc_runtime.exe'),
    path.resolve(cwd, '../../../firmware/lib/zplc_core/build/zplc_runtime'),
    path.resolve(cwd, '../../../firmware/lib/zplc_core/build/zplc_runtime.exe'),
  ];
}

function resolveDefaultSimulatorBinaryPath(options: SimulatorBinaryResolutionOptions): string {
  const { envPath, pathExists, resourcesPath } = options;
  const candidates = getDefaultSimulatorBinaryCandidates(options);

  if (envPath) {
    return envPath;
  }

  for (const candidate of candidates) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }

  return resourcesPath
    ? path.resolve(resourcesPath, 'native-runtime/zplc_runtime')
    : path.resolve(options.cwd, 'firmware/lib/zplc_core/build/zplc_runtime');
}

function getDefaultSimulatorBinaryPath(environment: NodeJS.ProcessEnv = process.env): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);

  return resolveDefaultSimulatorBinaryPath({
    cwd: process.cwd(),
    currentDir,
    envPath: environment.ZPLC_NATIVE_SIM_BIN,
    pathExists: existsSync,
    resourcesPath: typeof process.resourcesPath === 'string' ? process.resourcesPath : null,
  });
}

export function resolveDefaultSimulatorBinaryPathForTests(
  overrides: Partial<Omit<SimulatorBinaryResolutionOptions, 'pathExists'>> & {
    existingPaths?: readonly string[];
  } = {},
): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const existingPaths = new Set(overrides.existingPaths ?? []);

  return resolveDefaultSimulatorBinaryPath({
    cwd: overrides.cwd ?? process.cwd(),
    currentDir: overrides.currentDir ?? currentDir,
    envPath: overrides.envPath,
    pathExists: (candidate) => existingPaths.has(candidate),
    resourcesPath:
      overrides.resourcesPath ??
      (typeof process.resourcesPath === 'string' ? process.resourcesPath : null),
  });
}

function createDefaultSpawnProcess(environment: NodeJS.ProcessEnv): NativeSimulationChildProcess {
  const binaryPath = getDefaultSimulatorBinaryPath(environment);
  if (!existsSync(binaryPath)) {
    throw new Error(
      `Native simulator binary not found at ${binaryPath}. Set ZPLC_NATIVE_SIM_BIN or build the POSIX host runtime first.`,
    );
  }

  return spawn(binaryPath, [], {
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;
}

export class NativeSimulationSupervisor {
  private readonly clientName: string;
  private readonly clientVersion: string;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly spawnProcess: (environment: NodeJS.ProcessEnv) => NativeSimulationChildProcess;
  private readonly lifecycleTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly events = new EventEmitter();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly exitWaiters = new Map<NativeSimulationChildProcess, ChildExitWaiter>();
  private readonly terminationPromises = new Map<NativeSimulationChildProcess, Promise<void>>();
  private process: NativeSimulationChildProcess | null = null;
  private startPromise: Promise<NativeHelloResult> | null = null;
  private stopPromise: Promise<void> | null = null;
  private requestCount = 0;

  constructor(options: NativeSimulationSupervisorOptions) {
    this.clientName = options.clientName;
    this.clientVersion = options.clientVersion;
    this.lifecycleTimeoutMs = options.lifecycleTimeoutMs ?? 5000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.environment = options.environment ?? process.env;
    this.spawnProcess = options.spawnProcess ?? createDefaultSpawnProcess;
  }

  onEvent(callback: (event: NativeEventMessage) => void): () => void {
    this.events.on('event', callback);
    return () => {
      this.events.off('event', callback);
    };
  }

  startSession(): Promise<NativeHelloResult> {
    if (this.stopPromise) {
      return this.stopPromise.then(() => this.startSession());
    }
    const termination = this.process ? this.terminationPromises.get(this.process) : undefined;
    if (termination) {
      return termination.then(() => this.startSession());
    }
    if (this.startPromise) return this.startPromise;

    const startPromise = this.process
      ? this.startExistingSession(this.process)
      : this.startNewSession();
    this.startPromise = startPromise;
    void startPromise.then(
      () => {
        if (this.startPromise === startPromise) this.startPromise = null;
      },
      () => {
        if (this.startPromise === startPromise) this.startPromise = null;
      },
    );
    return startPromise;
  }

  stopSession(): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise;
    }
    if (!this.process) {
      return Promise.resolve();
    }

    const childProcess = this.process;
    const termination = this.terminationPromises.get(childProcess);
    if (termination) {
      this.stopPromise = termination;
      void termination.then(() => {
        if (this.stopPromise === termination) this.stopPromise = null;
      });
      return termination;
    }
    const stopPromise = this.stopCurrentSession(childProcess);
    this.stopPromise = stopPromise;
    void stopPromise.then(
      () => {
        if (this.stopPromise === stopPromise) this.stopPromise = null;
      },
      () => {
        if (this.stopPromise === stopPromise) this.stopPromise = null;
      },
    );
    return stopPromise;
  }

  async request<TResult = unknown>(request: NativeRequestMessage): Promise<TResult> {
    if (this.stopPromise) {
      throw new Error('Native simulator session is stopping');
    }

    const childProcess = this.process;
    if (!childProcess) {
      throw new Error('Native simulator session is not active');
    }
    if (this.terminationPromises.has(childProcess)) {
      throw new Error('Native simulator session is terminating');
    }

    return this.waitForRequest<TResult>(childProcess, request);
  }

  private async waitForRequest<TResult>(childProcess: NativeSimulationChildProcess, request: NativeRequestMessage): Promise<TResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.requestForChild<TResult>(childProcess, request),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            const error = createSessionTerminatedError(`request ${request.method} timed out`);
            void this.terminateChild(childProcess, error);
            reject(error);
          }, this.requestTimeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async startNewSession(): Promise<NativeHelloResult> {
    const childProcess = this.spawnProcess(this.environment);
    this.process = childProcess;
    this.bindProcess(childProcess);

    return this.startExistingSession(childProcess);
  }

  private async startExistingSession(childProcess: NativeSimulationChildProcess): Promise<NativeHelloResult> {
    try {
      const hello = await this.waitForLifecycle(
        this.requestForChild<NativeHelloResult>(childProcess, createNativeRequest(this.nextRequestId(), 'session.hello', {
          client_name: this.clientName,
          client_version: this.clientVersion,
          protocol_version: '1.0',
        })),
      );
      if (hello === undefined) {
        throw createSessionTerminatedError('session.hello timed out');
      }
      return hello;
    } catch (error) {
      void this.terminateChild(childProcess, error);
      throw error;
    }
  }

  private async stopCurrentSession(childProcess: NativeSimulationChildProcess): Promise<void> {
    const exited = this.waitForChildExit(childProcess);
    try {
      const shutdown = await this.waitForLifecycle(
        this.requestForChild(childProcess, createNativeRequest(this.nextRequestId(), 'session.shutdown', {})),
      );
      if (shutdown === undefined) {
        await this.terminateChild(childProcess, createSessionTerminatedError('session.shutdown timed out'));
        return;
      }
    } catch {
      /* An exit/error during requested shutdown is a definitive disconnect. */
    }
    if (await this.waitForLifecycle(exited) === undefined) {
      await this.terminateChild(childProcess, createSessionTerminatedError('session.shutdown exit timed out'));
    }
  }

  private requestForChild<TResult = unknown>(childProcess: NativeSimulationChildProcess, request: NativeRequestMessage): Promise<TResult> {
    if (this.process !== childProcess) {
      return Promise.reject(new Error('Native simulator session is not active'));
    }
    if (this.pendingRequests.has(request.id)) {
      return Promise.reject(new Error(`Native simulator request is already pending: ${request.id}`));
    }
    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(request.id, {
        childProcess,
        resolve: (value) => {
          resolve(value as TResult);
        },
        reject,
      });
      childProcess.stdin.write(`${JSON.stringify(request)}\n`, 'utf8', (error) => {
        if (!error) {
          return;
        }

        const pending = this.pendingRequests.get(request.id);
        if (pending?.childProcess === childProcess) {
          this.pendingRequests.delete(request.id);
        }
        reject(error);
      });
    });
  }

  private async waitForLifecycle<TResult>(request: Promise<TResult>): Promise<TResult | undefined> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        request,
        new Promise<undefined>((resolve) => {
          timeout = setTimeout(() => resolve(undefined), this.lifecycleTimeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private nextRequestId(): string {
    this.requestCount += 1;
    return `native-supervisor-${this.requestCount}`;
  }

  private bindProcess(childProcess: NativeSimulationChildProcess): void {
    this.createChildExitWaiter(childProcess);
    let stdoutBuffer = '';

    childProcess.stdout.on('data', (chunk: string | Buffer) => {
      if (this.process !== childProcess || this.terminationPromises.has(childProcess)) return;
      stdoutBuffer += chunk.toString();

      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const rawLine = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

        if (new TextEncoder().encode(rawLine).length > 8191) {
          this.failChildProtocol(childProcess, 'native simulator response exceeded 8191 bytes');
          return;
        }

        const line = rawLine.trim();

        if (line.length > 0) {
          this.handleLine(childProcess, line);
          if (this.process !== childProcess || this.terminationPromises.has(childProcess)) return;
        }

        newlineIndex = stdoutBuffer.indexOf('\n');
      }

      if (new TextEncoder().encode(stdoutBuffer).length > 8191) {
        this.failChildProtocol(childProcess, 'native simulator response exceeded 8191 bytes');
      }
    });

    childProcess.stderr.on('data', (chunk: string | Buffer) => {
      if (this.process !== childProcess || this.terminationPromises.has(childProcess)) return;
      const message = chunk.toString().trim();
      if (message.length === 0) {
        return;
      }

      this.events.emit('event', {
        type: NATIVE_MESSAGE_TYPE.EVENT,
        method: 'runtime.output',
        params: {
          stream: 'stderr',
          message,
        },
      } satisfies NativeEventMessage);
    });

    childProcess.on('error', (error) => {
      if (this.process !== childProcess) return;
      void this.terminateChild(childProcess, error);
    });

    childProcess.on('exit', (code, signal) => {
      this.resolveChildExit(childProcess);
      if (this.process !== childProcess) return;
      const message = `code=${code ?? 'null'} signal=${signal ?? 'null'}`;
      const error = createSessionTerminatedError(message);
      this.rejectPendingForChild(childProcess, error);
      if (this.stopPromise) {
        this.cleanupProcess(childProcess, error);
        return;
      }
      this.events.emit('event', {
        type: NATIVE_MESSAGE_TYPE.EVENT,
        method: 'session.exited',
        params: {
          code,
          signal,
        },
      } satisfies NativeEventMessage);
      this.cleanupProcess(childProcess, error);
    });
  }

  private handleLine(childProcess: NativeSimulationChildProcess, line: string): void {
    if (this.process !== childProcess || this.terminationPromises.has(childProcess)) return;
    let message: unknown;
    try {
      message = parseJsonLine(line);
    } catch (error) {
      this.failChildProtocol(childProcess, error instanceof Error ? error.message : String(error));
      return;
    }

    if (isNativeEventMessage(message) && message.type === NATIVE_MESSAGE_TYPE.EVENT) {
      this.events.emit('event', message);
      return;
    }

    if (!isNativeResponseMessage(message) || message.type !== NATIVE_MESSAGE_TYPE.RESPONSE) {
      this.failChildProtocol(childProcess, `Unexpected native simulator message: ${line}`);
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending || pending.childProcess !== childProcess) {
      return;
    }

    this.pendingRequests.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectPendingForChild(childProcess: NativeSimulationChildProcess, error: unknown): void {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      if (pending.childProcess !== childProcess) continue;
      this.pendingRequests.delete(requestId);
      pending.reject(error);
    }
  }

  private terminateChild(childProcess: NativeSimulationChildProcess, error: unknown): Promise<void> {
    const existingTermination = this.terminationPromises.get(childProcess);
    if (existingTermination) return existingTermination;
    if (this.process !== childProcess) return Promise.resolve();

    this.rejectPendingForChild(childProcess, error);
    const exited = this.waitForChildExit(childProcess);
    const { promise: termination, resolve: resolveTermination } = createVoidDeferred();
    this.terminationPromises.set(childProcess, termination);

    void (async () => {
      this.sendSignal(childProcess, 'SIGTERM');
      if (await this.waitForLifecycle(exited) === undefined) {
        this.sendSignal(childProcess, 'SIGKILL');
        await exited;
      }
      if (this.terminationPromises.get(childProcess) === termination) {
        this.terminationPromises.delete(childProcess);
      }
      resolveTermination();
    })();
    return termination;
  }

  private waitForChildExit(childProcess: NativeSimulationChildProcess): Promise<void> {
    return this.exitWaiters.get(childProcess)?.promise ?? Promise.resolve();
  }

  private createChildExitWaiter(childProcess: NativeSimulationChildProcess): void {
    if (this.exitWaiters.has(childProcess)) return;
    this.exitWaiters.set(childProcess, createVoidDeferred());
  }

  private resolveChildExit(childProcess: NativeSimulationChildProcess): void {
    const waiter = this.exitWaiters.get(childProcess);
    if (!waiter) return;
    this.exitWaiters.delete(childProcess);
    waiter.resolve();
  }

  private failChildProtocol(childProcess: NativeSimulationChildProcess, message: string): void {
    if (this.process !== childProcess) return;
    const error = createSessionTerminatedError(message);
    void this.terminateChild(childProcess, error);
  }

  private sendSignal(childProcess: NativeSimulationChildProcess, signal: NodeJS.Signals): void {
    try {
      childProcess.kill(signal);
    } catch {
      /* Keep ownership until the OS reports exit, even if signalling fails. */
    }
  }

  private cleanupProcess(childProcess: NativeSimulationChildProcess, error: unknown): boolean {
    if (this.process !== childProcess) return false;
    this.process = null;
    this.rejectPendingForChild(childProcess, error);
    return true;
  }
}
