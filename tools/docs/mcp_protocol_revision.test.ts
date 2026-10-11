// The MCP guide shows a request that the server accepts and the answer it gives to an older handshake (DOC-009). The test
// starts the real server over standard input and output and compares what it answers with what the page shows, so that
// the page cannot go on describing a protocol the server no longer speaks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

const ROOT = new URL('../../', import.meta.url).pathname;
const GUIDES = ['docs/docs/guides/ai-and-mcp.md', 'docs/i18n/es/docusaurus-plugin-content-docs/current/guides/ai-and-mcp.md'];

/** The JSON fences of a page, parsed. */
function jsonFences(path: string): Array<Record<string, any>> {
  const text = readFileSync(join(ROOT, path), 'utf8');
  return [...text.matchAll(/^```json\n([\s\S]*?)\n```$/gm)].map((match) => JSON.parse(match[1]!) as Record<string, any>);
}

/** Sends each message to a fresh server and returns its answers, in order, one per message. */
async function ask(messages: object[]): Promise<Array<Record<string, any>>> {
  // the server serves one project folder and refuses to start on a folder that is not a project
  const workspace = join(ROOT, 'packages/zplc-ide/projects/blinky_st');
  const child = Bun.spawn(['bun', 'run', '--cwd=packages/zplc-ide', 'mcp', '--workspace', workspace], { cwd: ROOT, stdin: 'pipe', stdout: 'pipe', stderr: 'ignore' });
  const answers: Array<Record<string, any>> = [];
  try {
    const reader = child.stdout.getReader();
    let buffer = '';
    for (const message of messages) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
      child.stdin.flush();
      const deadline = Date.now() + 30_000;
      while (buffer.indexOf('\n') < 0 && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value);
      }
      const newline = buffer.indexOf('\n');
      expect(newline).toBeGreaterThan(-1);
      answers.push(JSON.parse(buffer.slice(0, newline)) as Record<string, any>);
      buffer = buffer.slice(newline + 1);
    }
  } finally { child.kill(); }
  return answers;
}

describe('MCP guide: the protocol revision of the server is the one the page shows (DOC-009)', () => {
  it('answers the request and the older handshake of the guide as the guide says, in English and in Spanish', async () => {
    for (const guide of GUIDES) {
      const [request, error] = jsonFences(guide).filter((fence) => fence.method === 'tools/list' || fence.error !== undefined);
      expect(request?.params?._meta?.['io.modelcontextprotocol/protocolVersion']).toBe('2026-07-28');
      expect(error?.error?.code).toBe(-32022);
      const older = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: error!.error.data.requested, capabilities: {}, clientInfo: { name: 'docs-check', version: '0' } } };
      const [refused, listed] = await ask([older, request!]);
      expect({ guide, refused }).toEqual({ guide, refused: { jsonrpc: '2.0', id: 1, error: error!.error } });
      expect({ guide, tools: Array.isArray(listed?.result?.tools) && listed!.result.tools.length > 0 }).toEqual({ guide, tools: true });
    }
  });

  it('answers a request without a revision, and one without the capabilities, with the codes the guide names', async () => {
    const [withoutRevision, withoutCapabilities] = await ask([
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } },
    ]);
    expect(withoutRevision?.error?.code).toBe(-32022);
    expect(withoutRevision?.error?.message).toBe('Unsupported protocol version: the request did not name a protocol version');
    expect(withoutCapabilities?.error?.code).toBe(-32602);
    expect(withoutCapabilities?.error?.message).toBe('Invalid _meta envelope for protocol revision 2026-07-28: io.modelcontextprotocol/clientCapabilities: missing');
    const text = readFileSync(join(ROOT, GUIDES[0]!), 'utf8').replace(/\s+/g, ' ');
    expect(text).toContain(withoutRevision!.error.message);
    expect(text).toContain(withoutCapabilities!.error.message);
  });
});
