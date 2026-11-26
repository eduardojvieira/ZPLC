#!/usr/bin/env bun
import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { buildMcpServer, mcpSelfCheck, MCP_SERVER_VERSION, openMcpRepository, openMcpUserData, openMcpWorkspace } from './server';

export function parseMcpWorkspaceArgument(
  args: string[],
): { workspace: string; repository?: string; userData?: string; selfCheck?: true } | undefined {
  if (args.length === 1 && args[0] === '--help') return undefined;
  if (args.filter((arg) => arg === '--workspace' || arg.startsWith('--workspace=')).length !== 1) return undefined;
  if (args.filter((arg) => arg === '--repository' || arg.startsWith('--repository=')).length > 1) return undefined;
  if (args.filter((arg) => arg === '--user-data' || arg.startsWith('--user-data=')).length > 1) return undefined;
  if (args.filter((arg) => arg.startsWith('--self-check')).length > 1) return undefined;
  try {
    const parsed = parseArgs({
      args,
      options: {
        workspace: { type: 'string' },
        repository: { type: 'string' },
        'user-data': { type: 'string' },
        'self-check': { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    });
    return typeof parsed.values.workspace === 'string' &&
      parsed.values.workspace.length > 0 &&
      (parsed.values.repository === undefined || (typeof parsed.values.repository === 'string' && parsed.values.repository.length > 0)) &&
      (parsed.values['user-data'] === undefined ||
        (typeof parsed.values['user-data'] === 'string' && parsed.values['user-data'].length > 0))
      ? {
          workspace: parsed.values.workspace,
          ...(typeof parsed.values.repository === 'string' ? { repository: parsed.values.repository } : {}),
          ...(typeof parsed.values['user-data'] === 'string' ? { userData: parsed.values['user-data'] } : {}),
          ...(parsed.values['self-check'] === true ? { selfCheck: true as const } : {}),
        }
      : undefined;
  } catch {
    return undefined;
  }
}

const USAGE =
  'Usage: zplc-mcp --workspace <absolute-path-of-a-project> [--repository <absolute-path-of-a-checkout>] [--user-data ' +
  '<absolute-path-of-a-folder>] [--self-check]\n';

/** Why a folder given on the command line cannot be served: the cause and the next step, in one line. */
async function whyUnavailable(option: string, path: string, needsFile?: string): Promise<string> {
  if (!isAbsolute(path)) return `the ${option} folder must be an absolute path: ${path}`;
  const info = await stat(path).catch((error: NodeJS.ErrnoException) => error);
  if (info instanceof Error) {
    return info.code === 'ENOENT' ? `${path} does not exist` : `${path} cannot be read (${info.code ?? 'error'})`;
  }
  if (!info.isDirectory()) return `${path} is not a folder`;
  if (needsFile && !(await stat(join(path, needsFile)).catch(() => undefined))?.isFile()) {
    return `${path} is not a ZPLC ${option === 'workspace' ? 'project' : 'checkout'}: it has no ${needsFile}`;
  }
  return `${path} cannot be served: it must be a real folder, not a link, ${
    option === 'workspace' ? 'with a project ZPLC can inspect' : option === 'repository' ? 'holding a ZPLC checkout' : 'you can read'
  }`;
}

/**
 * `--self-check` (AIX-007): prints what the server would serve and every problem with its cause and next step, as JSON on
 * standard output, and exits with 0 when it is ready or 1 when not. It looks at files only and never starts the server, a
 * process, a board, a port or a socket (AGENTS.md rule 8).
 */
async function selfCheck(
  parsed: { workspace: string; repository?: string; userData?: string },
  workspace: Parameters<typeof mcpSelfCheck>[0],
): Promise<number> {
  const summary = await mcpSelfCheck(workspace);
  const problems: Array<{ cause: string; nextStep: string }> = [];
  if (!workspace)
    problems.push({
      cause: await whyUnavailable('workspace', parsed.workspace, 'zplc.json'),
      nextStep: 'Pass --workspace the absolute path of a ZPLC project folder, the one that holds zplc.json.',
    });
  if (parsed.repository && !workspace?.repository)
    problems.push({
      cause: `repository is unavailable: ${await whyUnavailable('repository', parsed.repository, 'firmware/app/boards/boards.json')}`,
      nextStep:
        'Pass --repository the absolute path of a ZPLC checkout, or leave it out: only boards_list, toolchain_inspect and firmware_build ' +
        'need it.',
    });
  if (parsed.userData && !workspace?.userData)
    problems.push({
      cause: `user data is unavailable: ${await whyUnavailable('user-data', parsed.userData)}`,
      nextStep: 'Pass --user-data the folder where ZPLC Studio keeps your lessons, or leave it out: lessons then hide their solutions.',
    });
  if (!summary.nativeSimulatorReady)
    problems.push({
      cause: 'the host simulator zplc_runtime was not found on this computer',
      nextStep:
        'Set ZPLC_NATIVE_SIM_BIN to the zplc_runtime of this ZPLC, or build the POSIX host runtime; tests_run, scenario_run and the ' +
        'trace tools need it.',
    });
  const report = { ready: problems.length === 0, folder: parsed.workspace, ...summary, problems };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.ready ? 0 : 1;
}

export async function runMcpEntrypoint(args = Bun.argv.slice(2)): Promise<number> {
  if (args.length === 1 && args[0] === '--help') {
    process.stderr.write(USAGE);
    return 0;
  }
  if (args.length === 1 && args[0] === '--version') {
    process.stdout.write(`zplc-mcp ${MCP_SERVER_VERSION}\n`);
    return 0;
  }
  const parsed = parseMcpWorkspaceArgument(args);
  if (!parsed) {
    process.stderr.write(
      `ZPLC MCP: ${args.length === 0 ? 'no arguments given' : 'the arguments are not valid'}; start it with a project folder.\n${USAGE}`,
    );
    return 2;
  }
  for (const [option, path] of [
    ['workspace', parsed.workspace],
    ['repository', parsed.repository],
    ['user-data', parsed.userData],
  ] as const) {
    // the self-check answers a relative path in its report, with the cause and the next step (AIX-007)
    if (path !== undefined && !isAbsolute(path) && !parsed.selfCheck) {
      process.stderr.write(`ZPLC MCP: ${await whyUnavailable(option, path)}\n`);
      return 2;
    }
  }
  const workspace = await openMcpWorkspace(parsed.workspace);
  const repository = await openMcpRepository(parsed.repository);
  const userData = await openMcpUserData(parsed.userData);
  if (parsed.selfCheck)
    return selfCheck(parsed, workspace && { ...workspace, ...(repository ? { repository } : {}), ...(userData ? { userData } : {}) });
  if (!workspace) {
    process.stderr.write(`ZPLC MCP: ${await whyUnavailable('workspace', parsed.workspace, 'zplc.json')}\n`);
    return 1;
  }
  if (parsed.repository && !repository) {
    const why = await whyUnavailable('repository', parsed.repository, 'firmware/app/boards/boards.json');
    process.stderr.write(`ZPLC MCP: repository is unavailable: ${why}\n`);
    return 1;
  }
  if (parsed.userData && !userData) {
    process.stderr.write(`ZPLC MCP: user data is unavailable: ${await whyUnavailable('user-data', parsed.userData)}\n`);
    return 1;
  }
  const handle = serveStdio(
    () => buildMcpServer({ ...workspace, ...(repository ? { repository } : {}), ...(userData ? { userData } : {}) }),
    { legacy: 'serve', onerror: () => process.stderr.write('ZPLC MCP transport error\n') },
  );
  const close = async () => {
    try {
      await handle.close();
    } catch {
      process.stderr.write('ZPLC MCP shutdown error\n');
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGINT', () => {
    void close();
  });
  process.once('SIGTERM', () => {
    void close();
  });
  return 0;
}

if (import.meta.main) process.exitCode = await runMcpEntrypoint();
