/**
 * Runs compile, safety check, tests and candidate review outside the main process (IDE-012).
 *
 * Each request gets a process of its own (a worker built from `toolWorker.ts`); the main process only sends the request
 * and waits for the answer, so a long or runaway compile cannot block the window. The process is the unit of
 * cancellation: an abort asks the worker to stop and, when it does not answer within the grace period (it is busy in a
 * synchronous compile), kills it, and a deadline kills it the same way. The worker is one-shot and is always killed once
 * it has answered, and with it the native runtime it started, which exits when its input closes.
 *
 * Pure TypeScript over an injected spawner (Electron's `utilityProcess` in the application, `child_process.fork` in the
 * tests), so the whole lifecycle is observable without a window.
 */
import { randomUUID } from 'node:crypto';

import type { ToolWorkerCommand, ToolWorkerReply, ToolWorkerRequest } from './toolWorkerProtocol.js';

export interface ToolWorkerProcess {
  readonly pid?: number;
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  /** The process ended, for whatever reason (code is null when it was killed). */
  onExit(listener: (code: number | null) => void): void;
  kill(): void;
}

export type ToolWorkerSpawner = () => ToolWorkerProcess;

/** Why a run produced no answer. `cancelled` and `timeout` are what the caller asked for or set; `failed` is the worker's. */
export class ToolWorkerError extends Error {
  readonly reason: 'cancelled' | 'timeout' | 'failed';
  constructor(reason: 'cancelled' | 'timeout' | 'failed') {
    super(`Tool worker ${reason}`);
    this.name = 'ToolWorkerError';
    this.reason = reason;
  }
}

export interface ToolWorkerHostOptions {
  spawn: ToolWorkerSpawner;
  /** The most one run may take before its process is killed. */
  timeoutMs?: number;
  /** How long a cancelled worker may take to answer by itself (the cancelled result of a test run) before it is killed. */
  cancelGraceMs?: number;
}

export const TOOL_WORKER_TIMEOUT_MS = 120_000;
export const TOOL_WORKER_CANCEL_GRACE_MS = 1_500;

export function createToolWorkerHost(options: ToolWorkerHostOptions) {
  const timeoutMs = options.timeoutMs ?? TOOL_WORKER_TIMEOUT_MS;
  const cancelGraceMs = options.cancelGraceMs ?? TOOL_WORKER_CANCEL_GRACE_MS;
  /** The workers that are running, each with the function that ends its run as cancelled. */
  const live = new Map<ToolWorkerProcess, () => void>();

  function run(request: ToolWorkerRequest, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) return Promise.reject(new ToolWorkerError('cancelled'));
    return new Promise<unknown>((resolve, reject) => {
      const id = randomUUID();
      let child: ToolWorkerProcess;
      try {
        child = options.spawn();
      } catch {
        reject(new ToolWorkerError('failed'));
        return;
      }
      let settled = false;
      const timers: { deadline?: ReturnType<typeof setTimeout>; grace?: ReturnType<typeof setTimeout> } = {};

      const finish = (outcome: { value: unknown } | { error: ToolWorkerError }): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timers.deadline);
        clearTimeout(timers.grace);
        signal.removeEventListener('abort', onAbort);
        live.delete(child);
        try {
          child.kill();
        } catch {
          /* it already exited */
        }
        if ('error' in outcome) reject(outcome.error);
        else resolve(outcome.value);
      };

      live.set(child, () => finish({ error: new ToolWorkerError('cancelled') }));

      function onAbort(): void {
        if (settled) return;
        try {
          child.postMessage({ type: 'cancel' } satisfies ToolWorkerCommand);
        } catch {
          /* the process is gone: its exit settles the run */
        }
        timers.grace = setTimeout(() => finish({ error: new ToolWorkerError('cancelled') }), cancelGraceMs);
      }

      child.onMessage((message) => {
        const reply = message as Partial<ToolWorkerReply> | null;
        if (!reply || typeof reply !== 'object' || reply.id !== id) return;
        if (reply.type === 'result') finish({ value: reply.value });
        else if (reply.type === 'error') finish({ error: new ToolWorkerError(signal.aborted ? 'cancelled' : 'failed') });
      });
      child.onExit(() => finish({ error: new ToolWorkerError(signal.aborted ? 'cancelled' : 'failed') }));
      signal.addEventListener('abort', onAbort, { once: true });
      timers.deadline = setTimeout(() => finish({ error: new ToolWorkerError('timeout') }), timeoutMs);
      try {
        child.postMessage({ type: 'run', id, ...request } satisfies ToolWorkerCommand);
      } catch {
        finish({ error: new ToolWorkerError('failed') });
      }
    });
  }

  return {
    run,
    /** Processes that are running now (a test asserts that none is left). */
    active: (): number => live.size,
    /** Kills every running worker and ends its run as cancelled: the application is quitting. */
    dispose(): void {
      for (const end of [...live.values()]) end();
    },
  };
}

export type ToolWorkerHost = ReturnType<typeof createToolWorkerHost>;
