/**
 * The board session the learner opened, as Learn may see it (LRN-015, LRN-024): whether it is connected, its VM state, the
 * Watch read, and which board and ZPLC version the firmware reported. Nothing else of the session is reachable from here:
 * no connect, deploy, start, stop, force or write. Learn imports this module, never the connection manager.
 */
import { connectionManager } from './connectionManager';
import type { IDebugAdapter } from './debugAdapter';

export type ReadOnlyBoardSession = Pick<IDebugAdapter, 'connected' | 'state' | 'readWatchVariables'>;

export interface BoardSessionView {
  session: ReadOnlyBoardSession;
  /** The board id (boards.json) of the I/O description the firmware reports (IO-004); null when it reports none. */
  boardId: string | null;
  /** The ZPLC version the firmware reported; null when it reported none. */
  runtimeVersion: string | null;
}

/** What the view is made from: the connection manager of the window, or a fake in a test. */
export interface BoardSessionSource {
  readonly connected: boolean;
  readonly serialAdapter: ReadOnlyBoardSession | null;
  readonly systemInfo: { zplc_version?: unknown; io?: { board_id?: unknown } } | null;
}

/** The read-only view of the board session; null when Studio is not connected to a board. */
export function boardSessionOf(source: BoardSessionSource = connectionManager): BoardSessionView | null {
  const adapter = source.serialAdapter;
  if (!source.connected || !adapter) return null;
  const session: ReadOnlyBoardSession = {
    get connected() { return adapter.connected; },
    get state() { return adapter.state; },
    readWatchVariables: (variables, options) => adapter.readWatchVariables(variables, options),
  };
  const info = source.systemInfo;
  return {
    session,
    boardId: typeof info?.io?.board_id === 'string' ? info.io.board_id : null,
    runtimeVersion: typeof info?.zplc_version === 'string' ? info.zplc_version : null,
  };
}
