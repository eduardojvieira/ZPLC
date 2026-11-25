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
  const child = Bun.spawn(['bun', 'run', '--cwd=packages/zplc-ide', 'mcp', '--workspace', workspace], {
    cwd: ROOT,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'ignore',
  });
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
  } finally {
    child.kill();
  }
  return answers;
}

describe('MCP guide: the protocol revision of the server is the one the page shows (DOC-009)', () => {
  it('accepts the 2025-11-25 handshake of the guide and lists the tools, in English and in Spanish', async () => {
    for (const guide of GUIDES) {
      const [request] = jsonFences(guide).filter((fence) => fence.method === 'tools/list');
      expect(request?.params?._meta?.['io.modelcontextprotocol/protocolVersion']).toBe('2026-07-28');
      const older = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'docs-check', version: '0' } },
      };
      const [accepted, listed] = await ask([older, request!]);
      expect({ guide, version: accepted?.result?.protocolVersion }).toEqual({ guide, version: '2025-11-25' });
      expect({ guide, tools: Array.isArray(listed?.result?.tools) && listed!.result.tools.length > 0 }).toEqual({ guide, tools: true });
    }
  });

  it('serves a request without a revision, and one without the capabilities, as the guide says', async () => {
    const [withoutRevision, withoutCapabilities] = await ask([
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } },
    ]);
    expect(withoutRevision?.error).toBeUndefined();
    expect(withoutRevision?.result?.tools?.length).toBeGreaterThan(0);
    expect(withoutCapabilities?.error).toBeUndefined();
    expect(withoutCapabilities?.result?.tools?.length).toBeGreaterThan(0);
    const text = readFileSync(join(ROOT, GUIDES[0]!), 'utf8').replace(/\s+/g, ' ');
    expect(text).toContain('A request that names no revision is served as a request of that older era.');
    const spanish = readFileSync(join(ROOT, GUIDES[1]!), 'utf8').replace(/\s+/g, ' ');
    expect(spanish).toContain('Una solicitud que no nombra ninguna revisión se atiende como una de esa era anterior.');
  });
});
