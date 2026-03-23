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
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export interface NativeSimulationSupervisorOptions {
  clientName: string;
  clientVersion: string;
  spawnProcess?: () => NativeSimulationChildProcess;
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
  return typeof value === 'object' && value !== null && 'type' in value && 'id' in value;
}

function isNativeEventMessage(value: unknown): value is NativeEventMessage {
  return typeof value === 'object' && value !== null && 'type' in value && 'method' in value;
}

function createSessionTerminatedError(message: string): Error {
  return new Error(`Native simulator session terminated: ${message}`);
}

function getDefaultSimulatorBinaryPath(): string {
  const envPath = process.env.ZPLC_NATIVE_SIM_BIN;
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const candidates = [
    path.resolve(currentDir, '../../../firmware/lib/zplc_core/build/zplc_runtime'),
    path.resolve(process.cwd(), 'firmware/lib/zplc_core/build/zplc_runtime'),
    path.resolve(process.cwd(), '../firmware/lib/zplc_core/build/zplc_runtime'),
    path.resolve(process.cwd(), '../../firmware/lib/zplc_core/build/zplc_runtime'),
    path.resolve(process.cwd(), '../../../firmware/lib/zplc_core/build/zplc_runtime'),
  ];

  if (envPath) {
    return envPath;
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? path.resolve(process.cwd(), 'firmware/lib/zplc_core/build/zplc_runtime');
}

function createDefaultSpawnProcess(): NativeSimulationChildProcess {
  const binaryPath = getDefaultSimulatorBinaryPath();
  if (!existsSync(binaryPath)) {
    throw new Error(
      `Native simulator binary not found at ${binaryPath}. Set ZPLC_NATIVE_SIM_BIN or build the POSIX host runtime first.`,
    );
  }

  return spawn(binaryPath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;
}

export class NativeSimulationSupervisor {
  private readonly clientName: string;
  private readonly clientVersion: string;
  private readonly spawnProcess: () => NativeSimulationChildProcess;
  private readonly events = new EventEmitter();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private process: NativeSimulationChildProcess | null = null;
  private stdoutBuffer = '';
  private requestCount = 0;

  constructor(options: NativeSimulationSupervisorOptions) {
    this.clientName = options.clientName;
    this.clientVersion = options.clientVersion;
    this.spawnProcess = options.spawnProcess ?? createDefaultSpawnProcess;
  }

  onEvent(callback: (event: NativeEventMessage) => void): () => void {
    this.events.on('event', callback);
    return () => {
      this.events.off('event', callback);
    };
  }

  async startSession(): Promise<NativeHelloResult> {
    if (this.process) {
      return this.request<NativeHelloResult>(
        createNativeRequest(this.nextRequestId(), 'session.hello', {
          client_name: this.clientName,
          client_version: this.clientVersion,
          protocol_version: '1.0',
        }),
      );
    }

    this.process = this.spawnProcess();
    this.bindProcess(this.process);

    return this.request<NativeHelloResult>(
      createNativeRequest(this.nextRequestId(), 'session.hello', {
        client_name: this.clientName,
        client_version: this.clientVersion,
        protocol_version: '1.0',
      }),
    );
  }

  async stopSession(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      await this.request(createNativeRequest(this.nextRequestId(), 'session.shutdown', {}));
    } finally {
      this.cleanupProcess();
    }
  }

  async request<TResult = unknown>(request: NativeRequestMessage): Promise<TResult> {
    const currentProcess = this.process;
    if (!currentProcess) {
      throw new Error('Native simulator session is not active');
    }

    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(request.id, {
        resolve: (value) => {
          resolve(value as TResult);
        },
        reject,
      });
      currentProcess.stdin.write(`${JSON.stringify(request)}\n`, 'utf8', (error) => {
        if (!error) {
          return;
        }

        this.pendingRequests.delete(request.id);
        reject(error);
      });
    });
  }

  private nextRequestId(): string {
    this.requestCount += 1;
    return `native-supervisor-${this.requestCount}`;
  }

  private bindProcess(childProcess: NativeSimulationChildProcess): void {
    childProcess.stdout.on('data', (chunk: string | Buffer) => {
      this.stdoutBuffer += chunk.toString();

      let newlineIndex = this.stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          this.handleLine(line);
        }

        newlineIndex = this.stdoutBuffer.indexOf('\n');
      }
    });

    childProcess.stderr.on('data', (chunk: string | Buffer) => {
      const message = chunk.toString().trim();
      if (message.length === 0) {
        return;
      }

      this.events.emit('event', {
        type: NATIVE_MESSAGE_TYPE.EVENT,
        method: 'runtime.error',
        params: {
          code: 'STDERR',
          message,
        },
      } satisfies NativeEventMessage);
    });

    childProcess.on('error', (error) => {
      this.rejectAllPending(error);
      this.events.emit('event', {
        type: NATIVE_MESSAGE_TYPE.EVENT,
        method: 'session.exited',
        params: {
          message: error.message,
        },
      } satisfies NativeEventMessage);
      this.cleanupProcess();
    });

    childProcess.on('exit', (code, signal) => {
      const message = `code=${code ?? 'null'} signal=${signal ?? 'null'}`;
      this.rejectAllPending(createSessionTerminatedError(message));
      this.events.emit('event', {
        type: NATIVE_MESSAGE_TYPE.EVENT,
        method: 'session.exited',
        params: {
          code,
          signal,
        },
      } satisfies NativeEventMessage);
      this.cleanupProcess();
    });
  }

  private handleLine(line: string): void {
    const message = parseJsonLine(line);

    if (isNativeEventMessage(message) && message.type === NATIVE_MESSAGE_TYPE.EVENT) {
      this.events.emit('event', message);
      return;
    }

    if (!isNativeResponseMessage(message) || message.type !== NATIVE_MESSAGE_TYPE.RESPONSE) {
      throw new Error(`Unexpected native simulator message: ${line}`);
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAllPending(error: unknown): void {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      this.pendingRequests.delete(requestId);
      pending.reject(error);
    }
  }

  private cleanupProcess(): void {
    this.process = null;
    this.stdoutBuffer = '';
  }
}
