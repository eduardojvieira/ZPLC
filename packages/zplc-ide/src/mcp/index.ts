#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { buildMcpServer, openMcpWorkspace } from './server';

export function parseMcpWorkspaceArgument(args: string[]): string | undefined {
  if (args.length === 1 && args[0] === '--help') return undefined;
  if (args.filter((arg) => arg === '--workspace' || arg.startsWith('--workspace=')).length !== 1) return undefined;
  try {
    const parsed = parseArgs({ args, options: { workspace: { type: 'string' } }, strict: true, allowPositionals: false });
    return typeof parsed.values.workspace === 'string' && parsed.values.workspace.length > 0 ? parsed.values.workspace : undefined;
  } catch { return undefined; }
}

export async function runMcpEntrypoint(args = Bun.argv.slice(2)): Promise<number> {
  if (args.length === 1 && args[0] === '--help') { process.stderr.write('Usage: zplc-mcp --workspace <absolute-real-directory>\n'); return 0; }
  const root = parseMcpWorkspaceArgument(args); const workspace = root ? await openMcpWorkspace(root) : undefined;
  if (!workspace) { process.stderr.write('ZPLC MCP workspace is unavailable\n'); return 1; }
  const handle = serveStdio(() => buildMcpServer(workspace), { legacy: 'reject', onerror: () => process.stderr.write('ZPLC MCP transport error\n') });
  const close = async () => { try { await handle.close(); } catch { process.stderr.write('ZPLC MCP shutdown error\n'); } finally { process.exit(0); } };
  process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
  return 0;
}

if (import.meta.main) process.exitCode = await runMcpEntrypoint();
