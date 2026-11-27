/**
 * A scripted MCP client for the automated Journey 5 (JRN-005): it starts the real `zplc-mcp` entry on stdio over a project
 * folder and speaks newline-delimited JSON-RPC to it, in either of the two protocol eras the server answers: the
 * initialize handshake of 2025-11-25 and the per-request envelope of 2026-07-28 (opened with `server/discover`).
 */
import { join } from 'node:path';

/** What came over the wire, read field by field by the journey that asserts on it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Wire = any;

export type McpEra = '2025-11-25' | '2026-07-28';

export interface McpToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, Wire>;
}

export interface McpClient {
  readonly era: McpEra;
  /** What the server said when the client connected: `initialize` (2025-11-25) or `server/discover` (2026-07-28). */
  readonly hello: Record<string, Wire>;
  request(method: string, params?: Record<string, unknown>): Promise<Wire>;
  tools(): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, Wire> }>>;
  /** The result of a tool, its `structuredContent` the way an agent reads it. */
  call(name: string, args?: Record<string, unknown>): Promise<McpToolResult & { body: Record<string, Wire> }>;
  readResource(uri: string): Promise<{ text: string; mimeType?: string }>;
  close(): void;
}

const ENTRY = join(import.meta.dir, '..', '..', 'src', 'mcp', 'index.ts');
const ENVELOPE = 'io.modelcontextprotocol/';

export async function connectMcp(
  era: McpEra,
  options: { workspace: string; userData?: string; env?: Record<string, string> },
): Promise<McpClient> {
  const args = [ENTRY, '--workspace', options.workspace, ...(options.userData ? ['--user-data', options.userData] : [])];
  const child = Bun.spawn([process.execPath, ...args], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...options.env },
  });
  const reader = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let nextId = 1;
  const send = (message: object) => {
    void child.stdin.write(`${JSON.stringify(message)}\n`);
    void child.stdin.flush();
  };
  const read = async (id: number): Promise<Wire> => {
    for (;;) {
      const at = buffer.indexOf('\n');
      if (at >= 0) {
        const message = JSON.parse(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
        if (message.id === id) return message;
        continue;
      }
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`zplc-mcp did not answer request ${id} in 120 s`)), 120_000)),
      ]);
      if (chunk.done) throw new Error('zplc-mcp closed before it answered');
      buffer += chunk.value;
    }
  };
  /** Under 2026-07-28 every request names its protocol revision and its client in `_meta`. */
  const envelope = () => ({
    [`${ENVELOPE}protocolVersion`]: era,
    [`${ENVELOPE}clientInfo`]: { name: 'journey-agent', version: '1' },
    [`${ENVELOPE}clientCapabilities`]: {},
  });
  const request = async (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    send({ jsonrpc: '2.0', id, method, params: era === '2026-07-28' ? { ...params, _meta: envelope() } : params });
    const answer = await read(id);
    if (answer.error) throw new Error(`${method}: ${JSON.stringify(answer.error)}`);
    return answer.result;
  };
  let hello: Record<string, Wire>;
  if (era === '2025-11-25') {
    hello = await request('initialize', { protocolVersion: era, capabilities: {}, clientInfo: { name: 'journey-agent', version: '1' } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  } else {
    hello = await request('server/discover');
  }
  const client: McpClient = {
    era,
    hello,
    request,
    tools: async () => (await request('tools/list')).tools,
    async call(name, toolArgs = {}) {
      const result = (await request('tools/call', { name, arguments: toolArgs })) as McpToolResult;
      // a refusal may carry only its text, which is the same JSON
      const parsed = (() => {
        try {
          return JSON.parse(result.content?.[0]?.text ?? '{}') as Record<string, Wire>;
        } catch {
          return {};
        }
      })();
      return { ...result, body: result.structuredContent ?? parsed };
    },
    async readResource(uri) {
      const result = await request('resources/read', { uri });
      const content = result.contents[0];
      return { text: content.text ?? '', mimeType: content.mimeType };
    },
    close: () => {
      child.kill();
      void reader.cancel().catch(() => undefined);
    },
  };
  return client;
}
