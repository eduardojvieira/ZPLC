#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { buildMcpServer, openMcpRepository, openMcpUserData, openMcpWorkspace } from './server';

export function parseMcpWorkspaceArgument(args: string[]): { workspace: string; repository?: string; userData?: string } | undefined {
  if (args.length === 1 && args[0] === '--help') return undefined;
  if (args.filter((arg) => arg === '--workspace' || arg.startsWith('--workspace=')).length !== 1) return undefined;
  if (args.filter((arg) => arg === '--repository' || arg.startsWith('--repository=')).length > 1) return undefined;
  if (args.filter((arg) => arg === '--user-data' || arg.startsWith('--user-data=')).length > 1) return undefined;
  try {
    const parsed = parseArgs({ args, options: { workspace: { type: 'string' }, repository: { type: 'string' }, 'user-data': { type: 'string' } }, strict: true, allowPositionals: false });
    return typeof parsed.values.workspace === 'string' && parsed.values.workspace.length > 0 && (parsed.values.repository === undefined || typeof parsed.values.repository === 'string' && parsed.values.repository.length > 0) && (parsed.values['user-data'] === undefined || typeof parsed.values['user-data'] === 'string' && parsed.values['user-data'].length > 0) ? { workspace: parsed.values.workspace, ...(typeof parsed.values.repository === 'string' ? { repository: parsed.values.repository } : {}), ...(typeof parsed.values['user-data'] === 'string' ? { userData: parsed.values['user-data'] } : {}) } : undefined;
  } catch { return undefined; }
}

export async function runMcpEntrypoint(args = Bun.argv.slice(2)): Promise<number> {
  if (args.length === 1 && args[0] === '--help') { process.stderr.write('Usage: zplc-mcp --workspace <absolute-real-directory> [--repository <absolute-real-directory>] [--user-data <absolute-real-directory>]\n'); return 0; }
  const parsed = parseMcpWorkspaceArgument(args); const workspace = parsed ? await openMcpWorkspace(parsed.workspace) : undefined; const repository = parsed ? await openMcpRepository(parsed.repository) : undefined; const userData = parsed ? await openMcpUserData(parsed.userData) : undefined;
  if (!workspace) { process.stderr.write('ZPLC MCP workspace is unavailable\n'); return 1; }
  if (parsed?.repository && !repository) { process.stderr.write('ZPLC MCP repository is unavailable\n'); return 1; }
  if (parsed?.userData && !userData) { process.stderr.write('ZPLC MCP user data is unavailable\n'); return 1; }
  const handle = serveStdio(() => buildMcpServer({ ...workspace, ...(repository ? { repository } : {}), ...(userData ? { userData } : {}) }), { legacy: 'reject', onerror: () => process.stderr.write('ZPLC MCP transport error\n') });
  const close = async () => { try { await handle.close(); } catch { process.stderr.write('ZPLC MCP shutdown error\n'); } finally { process.exit(0); } };
  process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
  return 0;
}

if (import.meta.main) process.exitCode = await runMcpEntrypoint();
