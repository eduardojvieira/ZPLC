/**
 * The three channels of the MCP connection panel (AIX-007), as entries of the table in `ipcHandlers.ts`.
 *
 * The window sends a client name (or the client and the text it was shown), never a path: the main process takes the window's
 * project folder, computes the config path of the client itself (`src/mcp/clientConfig.ts`) and writes only the text that the
 * preview shows at that moment. The self-check runs the local `zplc-mcp --self-check` on that folder through the spawn
 * allow-list; it reads files and reaches no device, serial port or network peer (AGENTS.md rule 8).
 */
import { MCP_CONNECTION_CHANNEL } from './ipcContract.js';
import type { IpcHandler } from './ipcRegistry.js';
import { IPC_DENIED } from './ipcRegistry.js';
import { isMcpClient, previewClientConfig, writeClientConfig, type McpClient } from '../src/mcp/clientConfig.js';

export interface McpSelfCheckRequest {
  command: string;
  workspace: string;
  userData?: string;
}

export interface McpConfigDeps {
  /** The real path of the window's project folder, or null when it has none. */
  folder(ownerId: number): string | null;
  userData(): string | null;
  command(): string;
  selfCheck(request: McpSelfCheckRequest): Promise<{ code: number | null; stdout: string }>;
}

const MAX_TEXT = 64 * 1024;
const isWriteRequest = (value: unknown): value is { client: McpClient; expected: string } => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    isMcpClient(record.client) &&
    typeof record.expected === 'string' &&
    record.expected.length <= MAX_TEXT
  );
};
const message = (error: unknown): { ok: false; message: string } => ({
  ok: false,
  message: error instanceof Error ? error.message : 'The config could not be read or written.',
});

export function createMcpConfigHandlers<Owner extends { ownerId: number }>(deps: McpConfigDeps): Record<string, IpcHandler<Owner>> {
  const where = (owner: Owner) => {
    const folder = deps.folder(owner.ownerId);
    if (folder === null) throw new Error(IPC_DENIED);
    const userData = deps.userData();
    return { folder, options: { command: deps.command(), ...(userData ? { userData } : {}) } };
  };
  return {
    [MCP_CONNECTION_CHANNEL.PREVIEW]: {
      accepts: (args) => args.length === 1 && isMcpClient(args[0]),
      run: async (owner, [client]) => {
        const { folder, options } = where(owner);
        try {
          return { ok: true, ...(await previewClientConfig(client as McpClient, folder, options)) };
        } catch (error) {
          return message(error);
        }
      },
    },
    [MCP_CONNECTION_CHANNEL.WRITE]: {
      accepts: (args) => args.length === 1 && isWriteRequest(args[0]),
      run: async (owner, [request]) => {
        const { folder, options } = where(owner);
        const { client, expected } = request as { client: McpClient; expected: string };
        try {
          return { ok: true, ...(await writeClientConfig(client, folder, options, expected)) };
        } catch (error) {
          return message(error);
        }
      },
    },
    [MCP_CONNECTION_CHANNEL.SELF_CHECK]: {
      accepts: (args) => args.length === 0,
      run: async (owner) => {
        const { folder, options } = where(owner);
        const answer = await deps.selfCheck({
          command: options.command,
          workspace: folder,
          ...(options.userData ? { userData: options.userData } : {}),
        });
        try {
          const report: unknown = JSON.parse(answer.stdout);
          if (typeof report === 'object' && report !== null && !Array.isArray(report))
            return { ok: true, ready: answer.code === 0, report };
        } catch {
          /* not a report: said below */
        }
        return { ok: false, message: 'zplc-mcp did not answer a self-check report; is it installed and on the PATH?' };
      },
    },
  };
}
