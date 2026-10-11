// REL-026 (IDE-026): the CLI and the MCP server are released as standalone executables for every desktop platform
// and architecture, built with `bun build --compile`, so that they need no JavaScript runtime and no checkout.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TARGETS, TOOLS, binaryName, buildCommand, hostTarget } from './binaries';

const root = join(import.meta.dir, '..', '..');
const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;

describe('the release binaries (REL-026)', () => {
  test('cover the six desktop platform and architecture pairs, once each', () => {
    expect(TARGETS.map((target) => `${target.os}-${target.arch}`).sort()).toEqual(['linux-arm64', 'linux-x64', 'mac-arm64', 'mac-x64', 'win-arm64', 'win-x64']);
    expect(new Set(TARGETS.map((target) => target.bun)).size).toBe(TARGETS.length);
  });

  test('name each file <tool>-<version>-<os>-<arch>, lower case, with .exe on Windows only', () => {
    const cli = TOOLS.find((tool) => tool.name === 'zplc-cli')!;
    const mcp = TOOLS.find((tool) => tool.name === 'zplc-mcp')!;
    const target = (key: string) => TARGETS.find((candidate) => `${candidate.os}-${candidate.arch}` === key)!;
    expect(binaryName(cli, '2.0.0-rc.4', target('linux-x64'))).toBe('zplc-cli-2.0.0-rc.4-linux-x64');
    expect(binaryName(mcp, '2.0.0-rc.4', target('mac-arm64'))).toBe('zplc-mcp-2.0.0-rc.4-mac-arm64');
    expect(binaryName(cli, '2.0.0-rc.4', target('win-arm64'))).toBe('zplc-cli-2.0.0-rc.4-win-arm64.exe');
    const names = TOOLS.flatMap((tool) => TARGETS.map((candidate) => binaryName(tool, '2.0.0-rc.4', candidate)));
    expect(new Set(names).size).toBe(12);
    for (const name of names) expect(name).toMatch(/^[a-z0-9.-]+$/);
  });

  test('every bun target name is one the installed bun supports', () => {
    // A supported target with a missing entry point fails on the entry point, without downloading its runtime; an
    // unknown name fails first on the name. The output tells the two apart without any network.
    for (const target of TARGETS) {
      const result = spawnSync('bun', ['build', '--compile', `--target=${target.bun}`, join(tmpdir(), 'zplc-no-such-entry.ts'), '--outfile', join(tmpdir(), 'zplc-no-such-out')], { encoding: 'utf8' });
      expect(`${result.stdout}${result.stderr}`, target.bun).not.toContain('Unsupported target');
    }
    const bogus = spawnSync('bun', ['build', '--compile', '--target=bun-bogus-x64', join(tmpdir(), 'zplc-no-such-entry.ts'), '--outfile', join(tmpdir(), 'zplc-no-such-out')], { encoding: 'utf8' });
    expect(`${bogus.stdout}${bogus.stderr}`).toContain('Unsupported target');
  });

  test('build with --compile for the named bun target, from the entry point of the tool', () => {
    const target = TARGETS.find((candidate) => candidate.os === 'win' && candidate.arch === 'x64')!;
    const command = buildCommand(root, TOOLS[0]!, target, '/out/zplc-cli.exe');
    expect(command).toEqual(['bun', 'build', '--compile', '--minify', '--target', 'bun-windows-x64', join(root, 'packages/zplc-ide/src/cli/index.ts'), '--outfile', '/out/zplc-cli.exe']);
  });

  test('know the target of the machine they run on', () => {
    expect(hostTarget('linux', 'x64')?.bun).toBe('bun-linux-x64');
    expect(hostTarget('darwin', 'arm64')?.bun).toBe('bun-darwin-arm64');
    expect(hostTarget('win32', 'arm64')?.bun).toBe('bun-windows-arm64');
    expect(hostTarget('freebsd', 'x64')).toBeUndefined();
  });
});

describe('the standalone binaries of this machine run without a JavaScript runtime (REL-026)', () => {
  const host = hostTarget();
  const output = mkdtempSync(join(tmpdir(), 'zplc-binaries-'));
  const run = (args: string[]) => spawnSync('bun', ['scripts/release/binaries.ts', ...args], { cwd: root, encoding: 'utf8' });

  test.skipIf(host === undefined)('are built, report the product version and compile a bundled project', () => {
    const built = run(['--targets', 'host', '--out', output, '--smoke']);
    expect(built.status, `${built.stdout}${built.stderr}`).toBe(0);
    for (const tool of TOOLS) {
      const file = join(output, binaryName(tool, version, host!));
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(10_000_000);
    }
    expect(built.stdout).toContain(`zplc-cli ${version}`);
    expect(built.stdout).toMatch(/compile passed|"ok":true/);
    expect(built.stdout).toMatch(/tools\/list: \d+ tools/);
    rmSync(output, { recursive: true, force: true });
  });

  test('refuse a version that is not the one of the root package.json, so a file name cannot lie', () => {
    const refused = run(['--targets', 'host', '--out', join(output, 'x'), '--version', '9.9.9']);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(version);
  });
});
