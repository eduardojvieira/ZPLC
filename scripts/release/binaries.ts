// The CLI and the MCP server as standalone executables (REL-026, IDE-026): `bun build --compile` embeds the
// runtime, so a person who downloads one needs neither Node nor Bun nor a checkout.
//
//   bun scripts/release/binaries.ts --targets host --out dist-bin --smoke
//   bun scripts/release/binaries.ts --targets linux-arm64,win-x64 --out dist-bin
//   bun scripts/release/binaries.ts --targets win-arm64 --out dist-bin --smoke --native    on a Windows on Arm runner
//
// File names follow the scheme of the installers (REL-020): <tool>-<version>-<os>-<arch>[.exe], with the os words
// mac, win and linux that electron-builder uses. Cross-compiling downloads the target's runtime from the bun
// releases; the release workflow builds each target on a runner of its own architecture and smokes it there.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface BinaryTarget {
  os: 'linux' | 'mac' | 'win';
  arch: 'x64' | 'arm64';
  /** The name `bun build --target` takes. */
  bun: string;
  /** The hosted runner that builds and smokes it natively. */
  runner: string;
}

export interface BinaryTool {
  name: 'zplc-cli' | 'zplc-mcp';
  entry: string;
}

export const TARGETS: readonly BinaryTarget[] = [
  { os: 'linux', arch: 'x64', bun: 'bun-linux-x64', runner: 'ubuntu-24.04' },
  { os: 'linux', arch: 'arm64', bun: 'bun-linux-arm64', runner: 'ubuntu-24.04-arm' },
  { os: 'mac', arch: 'x64', bun: 'bun-darwin-x64', runner: 'macos-15-intel' },
  { os: 'mac', arch: 'arm64', bun: 'bun-darwin-arm64', runner: 'macos-15' },
  { os: 'win', arch: 'x64', bun: 'bun-windows-x64', runner: 'windows-2025' },
  { os: 'win', arch: 'arm64', bun: 'bun-windows-arm64', runner: 'windows-11-vs2026-arm' },
];

export const TOOLS: readonly BinaryTool[] = [
  { name: 'zplc-cli', entry: 'packages/zplc-ide/src/cli/index.ts' },
  { name: 'zplc-mcp', entry: 'packages/zplc-ide/src/mcp/index.ts' },
];

export function binaryName(tool: BinaryTool, version: string, target: BinaryTarget): string {
  return `${tool.name}-${version}-${target.os}-${target.arch}${target.os === 'win' ? '.exe' : ''}`;
}

export function buildCommand(repoRoot: string, tool: BinaryTool, target: BinaryTarget, outfile: string): string[] {
  return ['bun', 'build', '--compile', '--minify', '--target', target.bun, join(repoRoot, tool.entry), '--outfile', outfile];
}

/** The target of the machine this runs on, by the names of Node's process.platform and process.arch. */
export function hostTarget(platform: string = process.platform, arch: string = process.arch): BinaryTarget | undefined {
  const os = platform === 'linux' ? 'linux' : platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : undefined;
  const cpu = arch === 'x64' || arch === 'arm64' ? arch : undefined;
  return TARGETS.find((target) => target.os === os && target.arch === cpu);
}

function run(command: string[], options: { cwd?: string; input?: string } = {}): { status: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(command, {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    stdin: options.input === undefined ? 'ignore' : Buffer.from(options.input),
  });
  return { status: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

/** Starts the MCP server executable, asks it for its tools the way a 2026-07-28 client does, and returns their count. */
async function mcpToolCount(executable: string, workspace: string): Promise<number> {
  const child = Bun.spawn([executable, '--workspace', workspace], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  try {
    const envelope = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'zplc-release-smoke', version: '0' },
      'io.modelcontextprotocol/clientCapabilities': {},
    };
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: envelope } })}\n`);
    child.stdin.flush();
    const reader = child.stdout.getReader();
    const deadline = Date.now() + 30_000;
    let buffer = '';
    while (Date.now() < deadline) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value);
        continue;
      }
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim() === '') continue;
      const message = JSON.parse(line) as { id?: number; result?: { tools?: unknown[] }; error?: { message?: string } };
      if (message.id !== 1) continue;
      if (message.error || !Array.isArray(message.result?.tools)) throw new Error(`tools/list failed: ${JSON.stringify(message)}`);
      return message.result.tools.length;
    }
    throw new Error('the MCP server did not answer tools/list in 30 s');
  } finally {
    child.kill();
  }
}

/** What a person would try first with each executable: its version, a compile, the list of tools. */
async function smoke(directory: string, repoRoot: string, version: string, target: BinaryTarget): Promise<string[]> {
  const cli = join(directory, binaryName(TOOLS[0]!, version, target));
  const mcp = join(directory, binaryName(TOOLS[1]!, version, target));
  const project = join(repoRoot, 'packages/zplc-ide/projects/blinky');
  const lines: string[] = [];
  // from a folder with no checkout around it, so nothing is found by walking up to a repository
  const away = join(directory, '..');

  const reported = run([cli, '--version'], { cwd: away });
  if (reported.status !== 0 || reported.stdout.trim() !== `zplc-cli ${version}`)
    throw new Error(`${cli} --version printed "${reported.stdout.trim()}" ${reported.stderr}`);
  lines.push(reported.stdout.trim());

  const compiled = run([cli, 'compile', project, '--json'], { cwd: away });
  const parsed = compiled.stdout.trim() === '' ? undefined : (JSON.parse(compiled.stdout.trim().split('\n').at(-1)!) as { ok?: boolean });
  if (compiled.status !== 0 || parsed?.ok !== true)
    throw new Error(`${cli} compile ${project} failed: ${compiled.stdout} ${compiled.stderr}`);
  lines.push(`zplc-cli compile ${project}: compile passed`);

  const count = await mcpToolCount(mcp, project);
  if (count === 0) throw new Error(`${mcp} lists no tools`);
  lines.push(`zplc-mcp tools/list: ${count} tools`);
  return lines;
}

async function main(argv: string[]): Promise<number> {
  const options = { targets: 'host', out: '', version: '', smoke: false, native: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--targets') options.targets = argv[++index] ?? '';
    else if (flag === '--out') options.out = argv[++index] ?? '';
    else if (flag === '--version') options.version = argv[++index] ?? '';
    else if (flag === '--smoke') options.smoke = true;
    else if (flag === '--native') options.native = true;
    else {
      console.error(`binaries: unknown argument ${flag}`);
      return 2;
    }
  }
  if (!options.out) {
    console.error('usage: binaries.ts --out <dir> [--targets host|all|linux-x64,...] [--version <v>] [--smoke] [--native]');
    return 2;
  }
  const root = resolve(import.meta.dir, '..', '..');
  const productVersion = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;
  if (options.version !== '' && options.version !== productVersion) {
    console.error(`binaries: version ${options.version} is not the product version ${productVersion} of package.json`);
    return 1;
  }
  if (!existsSync(join(root, 'packages/zplc-compiler/dist/index.js'))) {
    console.error('binaries: the compiler package is not built: run `bun run build:compiler` first');
    return 1;
  }
  const selected =
    options.targets === 'all'
      ? [...TARGETS]
      : options.targets === 'host'
        ? [hostTarget()].filter((target): target is BinaryTarget => target !== undefined)
        : options.targets.split(',').map((key) => TARGETS.find((target) => `${target.os}-${target.arch}` === key));
  if (selected.length === 0 || selected.some((target) => target === undefined)) {
    console.error(`binaries: unknown or unsupported target in "${options.targets}"`);
    return 2;
  }
  const out = resolve(options.out);
  mkdirSync(out, { recursive: true });
  for (const target of selected as BinaryTarget[]) {
    for (const tool of TOOLS) {
      const file = join(out, binaryName(tool, productVersion, target));
      const built = Bun.spawnSync(buildCommand(root, tool, target, file), { stdout: 'inherit', stderr: 'inherit' });
      if (built.exitCode !== 0) {
        console.error(`binaries: building ${file} failed`);
        return 1;
      }
      console.log(`binaries: ${file} (${Bun.file(file).size} bytes)`);
    }
    // --native: the runner is of the architecture of the target even where Bun reports another one (an emulated x64 Bun on
    // Windows on Arm), so the executables are run
    const host = hostTarget();
    if (options.smoke && (options.native || (host && host.os === target.os && host.arch === target.arch))) {
      try {
        for (const line of await smoke(out, root, productVersion, target)) console.log(line);
      } catch (error) {
        console.error(`binaries: smoke of ${target.os}-${target.arch} failed: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    } else if (options.smoke) {
      console.log(`binaries: ${target.os}-${target.arch} is not this machine; it is smoked on a ${target.runner} runner`);
    }
  }
  return 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
