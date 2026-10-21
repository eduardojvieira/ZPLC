/**
 * The one way the main process answers an invoke channel (IDE-017). Pure TypeScript with no Electron import: the
 * `ipcMain` object, the sender check and the freshness check are handed in, so a test drives the real registration
 * with a stand-in for Electron.
 *
 * For every channel of `ipcContract.ts` there is exactly one handler in the table, and for no other channel:
 * `registerIpcHandlers` refuses a table that differs from the contract before it registers anything. Each call then
 * goes through the same three steps, in this order, and a handler body never sees a call that failed one of them:
 *
 *   1. the sender is the trusted renderer document of the window (`authorize`), else the call is denied;
 *   2. the whole argument list is acceptable to the handler's schema (`accepts`), else the call is denied;
 *   3. the handler runs, and the answer is released only while that document is still the current one.
 *
 * A failure inside a handler reaches the renderer as one fixed message, never as the text of the internal error.
 */
import { IPC_INVOKE_CHANNELS } from './ipcContract.js';

export const IPC_DENIED = 'Request denied';

export interface IpcHandler<Owner> {
  /** True when the whole argument list has exactly the shape this channel takes (arity included). */
  accepts(args: readonly unknown[]): boolean;
  /** Runs for a trusted sender with an accepted argument list. */
  run(owner: Owner, args: readonly unknown[]): unknown;
  /** What the renderer is told when `run` throws; the denial text when absent. */
  failure?: string;
}

export type IpcHandlerTable<Owner> = Readonly<Record<string, IpcHandler<Owner>>>;

export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export interface IpcGuard<Owner> {
  /** The window owner of a call from the trusted renderer document, or null for any other sender. */
  authorize(event: unknown): Owner | null;
  /** Whether the document that made the call is still the one that owns the window. */
  isCurrent(owner: Owner): boolean;
}

/** The channels of the contract that the table lacks, and the channels of the table that the contract lacks. */
export function ipcTableMismatch(table: Readonly<Record<string, unknown>>): { missing: string[]; extra: string[] } {
  return {
    missing: IPC_INVOKE_CHANNELS.filter((channel) => !Object.hasOwn(table, channel)),
    extra: Object.keys(table).filter((channel) => !IPC_INVOKE_CHANNELS.includes(channel)),
  };
}

export function registerIpcHandlers<Owner>(ipc: IpcMainLike, table: IpcHandlerTable<Owner>, guard: IpcGuard<Owner>): void {
  const { missing, extra } = ipcTableMismatch(table);
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`IPC handlers differ from the contract: missing [${missing.join(', ')}], not in the contract [${extra.join(', ')}]`);
  }
  for (const channel of IPC_INVOKE_CHANNELS) {
    const handler = table[channel]!;
    ipc.handle(channel, async (event, ...args) => {
      const owner = guard.authorize(event);
      if (owner === null || !handler.accepts(args)) throw new Error(IPC_DENIED);
      let answer: unknown;
      try {
        answer = await handler.run(owner, args);
      } catch {
        throw new Error(guard.isCurrent(owner) ? (handler.failure ?? IPC_DENIED) : IPC_DENIED);
      }
      if (!guard.isCurrent(owner)) throw new Error(IPC_DENIED);
      return answer;
    });
  }
}
