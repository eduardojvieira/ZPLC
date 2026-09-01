import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'bun:test';
import { firmwareBuildExitCode, isFirmwareBuildInvocation, isInterruptibleInvocation, main, testExitCode } from './index';

const demo = fileURLToPath(new URL('../../projects/multitask_demo', import.meta.url));
const motorStartStop = fileURLToPath(new URL('../../projects/motor_start_stop', import.meta.url));
const cli = fileURLToPath(new URL('./index.ts', import.meta.url));
const nativeRuntimeBinary = fileURLToPath(new URL('../../../../firmware/lib/zplc_core/build/zplc_runtime', import.meta.url));
async function legacyMotorStartStop() { const root = await mkdtemp(join(tmpdir(), 'zplc-cli-legacy-motor-')); const manifest = JSON.parse(await readFile(join(motorStartStop, 'zplc.json'), 'utf8')) as Record<string, unknown>; delete manifest.schemaVersion; await mkdir(join(root, 'src')); await writeFile(join(root, 'zplc.json'), JSON.stringify(manifest)); await writeFile(join(root, 'src', 'Motor.st'), await readFile(join(motorStartStop, 'src', 'Motor.st'), 'utf8')); return root; }
function output() { const lines: string[] = []; const errors: string[] = []; return { lines, errors, log: (line: string) => lines.push(line), error: (line: string) => errors.push(line) }; }
async function run(...args: string[]) { const proc = Bun.spawn([process.execPath, 'run', cli, ...args], { stdout: 'pipe', stderr: 'pipe' }); return { code: await proc.exited, stdout: await new Response(proc.stdout).text(), stderr: await new Response(proc.stderr).text() }; }
async function runWithEnv(args: string[], env: Record<string, string>) { const proc = Bun.spawn([process.execPath, 'run', cli, ...args], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...env } }); return { code: await proc.exited, stdout: await new Response(proc.stdout).text(), stderr: await new Response(proc.stderr).text() }; }
async function waitForFile(path: string, timeoutMs = 30_000): Promise<void> { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { try { await lstat(path); return; } catch { await Bun.sleep(25); } } throw new Error(`Timed out waiting for ${path}`); }
async function readyToolchainRoot() {
  const root = await mkdtemp(join(tmpdir(), 'zplc-cli-toolchain-ready-')); const host = await mkdtemp(join(tmpdir(), 'zplc-cli-toolchain-host-')); const bin = join(host, 'bin'); const base = join(host, 'zephyr'); const sdk = join(host, 'sdk');
  await mkdir(join(root, 'firmware', 'app', 'boards'), { recursive: true }); await mkdir(bin); await mkdir(base); await mkdir(join(sdk, 'arm-zephyr-eabi', 'bin'), { recursive: true }); await mkdir(join(sdk, 'xtensa-espressif_esp32s3_zephyr-elf', 'bin'), { recursive: true });
  await writeFile(join(root, 'firmware', 'app', 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20.0)'); await writeFile(join(root, 'west.yml'), 'manifest:\n  projects:\n    - name: zephyr\n      revision: dccb09599635bdff17633fa7e9dab014b91dce90\n');
  const boards = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map((ide_id) => ({ board_id: ide_id, display_name: ide_id, ide_id, zephyr_board: `${ide_id}/board`, variant: 'test', support_assets: [`firmware/app/boards/${ide_id}.conf`], build_command: 'west build', network_class: 'other', validation_level: 'cross-build', evidence_refs: [], docs_ref: 'docs' }));
  for (const board of boards) await writeFile(join(root, board.support_assets[0]!), 'CONFIG_TEST=y'); await writeFile(join(root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json'), JSON.stringify(boards));
  await writeFile(join(sdk, 'arm-zephyr-eabi', 'bin', 'arm-zephyr-eabi-gcc'), 'toolchain'); await writeFile(join(sdk, 'xtensa-espressif_esp32s3_zephyr-elf', 'bin', 'xtensa-espressif_esp32s3_zephyr-elf-gcc'), 'toolchain');
  for (const [command, value] of Object.entries({ west: 'west 1.5.0', python3: 'Python 3.12.0', cmake: 'cmake version 3.30.0', ninja: '1.12.0', git: 'dccb09599635bdff17633fa7e9dab014b91dce90' })) { const args = command === 'git' ? '[ "$#" -eq 5 ] && [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--verify" ] && [ "$5" = "HEAD" ] || exit 64' : '[ "$#" -eq 1 ] && [ "$1" = "--version" ] || exit 64'; const script = join(bin, command); await writeFile(script, `#!/bin/sh\n${args}\nprintf '%s\\n' '${value}'\n`); await chmod(script, 0o755); }
  return { root, host, bin, base, sdk };
}

async function firmwareBuildRoot(blocking = false) {
  const root = await mkdtemp(join(tmpdir(), 'zplc-cli-firmware-root-')); const host = await mkdtemp(join(tmpdir(), 'zplc-cli-firmware-host-')); const bin = join(host, 'bin'); const base = join(host, 'zephyr'); const sdk = join(host, 'sdk'); const marker = join(host, 'west-ran'); const outputMarker = join(host, 'west-output'); const pidMarker = join(host, 'west-pid');
  await mkdir(join(root, 'firmware', 'app', 'boards'), { recursive: true }); await mkdir(bin); await mkdir(base); await mkdir(join(sdk, 'arm-zephyr-eabi', 'bin'), { recursive: true }); await mkdir(join(sdk, 'xtensa-espressif_esp32s3_zephyr-elf', 'bin'), { recursive: true });
  await writeFile(join(root, 'firmware', 'app', 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20.0)');
  await writeFile(join(root, 'west.yml'), 'manifest:\n  projects:\n    - name: zephyr\n      revision: dccb09599635bdff17633fa7e9dab014b91dce90\n');
  const boards = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map((ide_id) => ({ board_id: `${ide_id}-board`, display_name: ide_id, ide_id, zephyr_board: `${ide_id}/board`, variant: 'test', support_assets: [`firmware/app/boards/${ide_id}.conf`], build_command: 'this must never execute', network_class: 'other', validation_level: 'cross-build', evidence_refs: [], docs_ref: 'docs' }));
  for (const board of boards) await writeFile(join(root, board.support_assets[0]!), 'CONFIG_TEST=y');
  await writeFile(join(root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json'), JSON.stringify(boards));
  await writeFile(join(sdk, 'arm-zephyr-eabi', 'bin', 'arm-zephyr-eabi-gcc'), 'toolchain'); await writeFile(join(sdk, 'xtensa-espressif_esp32s3_zephyr-elf', 'bin', 'xtensa-espressif_esp32s3_zephyr-elf-gcc'), 'toolchain');
  for (const [command, value] of Object.entries({ python3: 'Python 3.12.0', cmake: 'cmake version 3.30.0', ninja: '1.12.0', git: 'dccb09599635bdff17633fa7e9dab014b91dce90' })) { const args = command === 'git' ? '[ "$#" -eq 5 ] && [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--verify" ] && [ "$5" = "HEAD" ] || exit 64' : '[ "$#" -eq 1 ] && [ "$1" = "--version" ] || exit 64'; const script = join(bin, command); await writeFile(script, `#!/bin/sh\n${args}\nprintf '%s\\n' '${value}'\n`); await chmod(script, 0o755); }
  const script = blocking
    ? `#!/bin/sh\nif [ "$1" = "--version" ]; then printf '%s\\n' 'west 1.5.0'; exit 0; fi\nout=\nwhile [ "$#" -gt 0 ]; do [ "$1" = -d ] && { out=$2; shift 2; continue; }; shift; done\ntrap 'sleep 1; exit 130' TERM INT\nmkdir -p "$out/zephyr"\nprintf '%s\\n' "$out" > "$ZPLC_FAKE_WEST_OUTPUT"\nprintf '%s\\n' "$$" > "$ZPLC_FAKE_WEST_PID"\ntouch "$out/owned-marker"\nwhile :; do sleep 1; done\n`
    : `#!/bin/sh\nif [ "$1" = "--version" ]; then printf '%s\\n' 'west 1.5.0'; exit 0; fi\nout=\nwhile [ "$#" -gt 0 ]; do [ "$1" = -d ] && { out=$2; shift 2; continue; }; shift; done\nmkdir -p "$out/zephyr"\ntouch "$ZPLC_FAKE_WEST_MARKER"\ndd if=/dev/zero of="$out/zephyr/zephyr.elf" bs=52 count=1 2>/dev/null\nprintf '\\177ELF\\001\\001\\001' | dd of="$out/zephyr/zephyr.elf" bs=1 seek=0 conv=notrunc 2>/dev/null\nprintf '\\002\\000\\003\\000\\001\\000\\000\\000' | dd of="$out/zephyr/zephyr.elf" bs=1 seek=16 conv=notrunc 2>/dev/null\nprintf '\\064\\000' | dd of="$out/zephyr/zephyr.elf" bs=1 seek=40 conv=notrunc 2>/dev/null\n`;
  await writeFile(join(bin, 'west'), script); await chmod(join(bin, 'west'), 0o755);
  return { root, host, bin, base, sdk, marker, outputMarker, pidMarker };
}

describe('CLI JSON boundary', () => {
  it('exposes safety-check as a read-only coverage command without safety claims', async () => {
    const json = output(); expect(await main(['safety-check', motorStartStop, '--json'], json)).toBe(0);
    expect(json.errors).toEqual([]); expect(json.lines).toHaveLength(1);
    expect(JSON.parse(json.lines[0] ?? '{}')).toMatchObject({ ok: true, summary: { configured: true, covered: [{ outputs: ['Motor.Forward', 'Motor.Reverse'] }] }, evidence: { operation: 'safety-check', outcome: 'passed', artifacts: [] } });
    expect(json.lines[0]).not.toContain(motorStartStop); expect(json.lines[0].toLowerCase()).not.toContain('certif');
    const human = output(); expect(await main(['safety-check', demo], human)).toBe(0); expect(human.lines).toEqual(['safety-check: no incompatible outputs declared']); expect(human.errors).toEqual([]);
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-safety-input-')); const alias = join(root, 'workspace-alias');
    try { await symlink(motorStartStop, alias, process.platform === 'win32' ? 'junction' : 'dir');
    for (const args of [['safety-check', motorStartStop, 'extra', '--json'], ['safety-check', motorStartStop, '--output', 'x', '--json'], ['safety-check', motorStartStop, '--language', 'ST', '--json'], ['safety-check', cli, '--json'], ['safety-check', alias, '--json']]) {
      const invalid = output(); expect(await main(args, invalid)).toBe(1); expect(JSON.parse(invalid.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] }, execution: { actor: 'cli', outcome: 'failed', jobId: expect.any(String) } });
    }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.skipIf(process.platform === 'win32')('returns one successful JSON line for a coherent local toolchain', async () => {
    const fixture = await readyToolchainRoot(); const oldPath = process.env.PATH; const oldBase = process.env.ZEPHYR_BASE; const oldSdk = process.env.ZEPHYR_SDK_INSTALL_DIR;
    process.env.PATH = fixture.bin; process.env.ZEPHYR_BASE = fixture.base; process.env.ZEPHYR_SDK_INSTALL_DIR = fixture.sdk;
    try {
      const io = output(); expect(await main(['toolchain-inspect', fixture.root, '--json'], io)).toBe(0); expect(io.errors).toEqual([]); expect(io.lines).toHaveLength(1); expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: true, summary: { ready: true }, evidence: { operation: 'toolchain-inspect', outcome: 'passed', artifacts: [] } });
    } finally {
      if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; if (oldBase === undefined) delete process.env.ZEPHYR_BASE; else process.env.ZEPHYR_BASE = oldBase; if (oldSdk === undefined) delete process.env.ZEPHYR_SDK_INSTALL_DIR; else process.env.ZEPHYR_SDK_INSTALL_DIR = oldSdk;
      await rm(fixture.root, { recursive: true, force: true }); await rm(fixture.host, { recursive: true, force: true });
    }
  });
  it('exposes toolchain inspection as one read-only JSON result and rejects compile options', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-toolchain-'));
    try {
      const io = output(); expect(await main(['toolchain-inspect', root, '--json'], io)).toBe(1);
      expect(io.lines).toHaveLength(1); expect(io.errors).toEqual([]);
      expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: false, summary: { ready: false }, evidence: { operation: 'toolchain-inspect', outcome: 'failed', artifacts: [] } });
      for (const args of [['toolchain-inspect', root, '--output', join(root, 'out'), '--json'], ['toolchain-inspect', root, '--language', 'ST', '--json'], ['toolchain-inspect', root, 'extra', '--json']]) {
        const rejected = output(); expect(await main(args, rejected)).toBe(1); expect(rejected.lines).toHaveLength(1); expect(JSON.parse(rejected.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
      const file = join(root, 'not-a-repository'); await writeFile(file, 'file'); const rejected = output(); expect(await main(['toolchain-inspect', file, '--json'], rejected)).toBe(1); expect(JSON.parse(rejected.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('previews a legacy workspace migration as one value-free JSON line without writing', async () => {
    const root = await legacyMotorStartStop();
    const manifestPath = join(root, 'zplc.json');
    const manifest = await readFile(manifestPath, 'utf8');
    try {
      const io = output();
      expect(await main(['migrate-preview', root, '--json'], io)).toBe(0);
      expect(io.lines).toHaveLength(1); expect(io.errors).toEqual([]);
      expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: true, summary: { sourceSchemaVersion: 1, targetSchemaVersion: 2, changes: [{ op: 'add', path: '/schemaVersion' }] }, evidence: { operation: 'migrate-preview', artifacts: [] } });
      expect(io.lines[0]).not.toContain(root); expect(io.lines[0]).not.toContain('Motor.Start');
      expect(await readFile(manifestPath, 'utf8')).toBe(manifest);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('exports a legacy migration only to an explicit safe output and leaves its source byte-identical', async () => {
    const root = await legacyMotorStartStop(); const manifest = join(root, 'zplc.json'); const target = join(root, 'migration-v2.json'); const before = await readFile(manifest);
    try {
      const json = output(); expect(await main(['migrate', root, '--output', target, '--json'], json)).toBe(0);
      expect(json.errors).toEqual([]); expect(json.lines).toHaveLength(1); expect(json.lines[0]).not.toContain('Motor.Start');
      expect(JSON.parse(json.lines[0] ?? '{}')).toMatchObject({ ok: true, summary: { sourceSchemaVersion: 1, targetSchemaVersion: 2, changed: true }, evidence: { operation: 'migrate', outcome: 'passed', artifacts: [{ kind: 'project-manifest' }] } });
      expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({ schemaVersion: 2 }); expect(await readFile(manifest)).toEqual(before);
      const human = output(); expect(await main(['migrate', root, '--output', join(root, 'migration-copy.json')], human)).toBe(0); expect(human.lines).toEqual(['migrate passed']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('requires a safe explicit migration output before reading or writing the workspace', async () => {
    const root = await legacyMotorStartStop(); const alias = join(dirname(root), `${basename(root)}-src-alias`); const workspaceAlias = join(dirname(root), `${basename(root)}-workspace-alias`);
    const manifest = join(root, 'zplc.json'); const before = await readFile(manifest);
    try {
      await symlink(join(root, 'src'), alias, process.platform === 'win32' ? 'junction' : 'dir'); await symlink(root, workspaceAlias, process.platform === 'win32' ? 'junction' : 'dir');
      for (const args of [
        ['migrate', root, '--json'], ['migrate', root, '--output=', '--json'], ['migrate', root, '--language', 'ST', '--json'], ['migrate', root, 'extra', '--output', join(root, 'out.json'), '--json'],
        ['migrate', root, '--output', manifest, '--json'], ['migrate', root, '--output', join(root, 'src', 'migration.json'), '--json'], ['migrate', root, '--output', join(root, 'tests', 'migration.json'), '--json'], ['migrate', root, '--output', join(alias, 'migration.json'), '--json'], ['migrate', workspaceAlias, '--output', join(dirname(root), 'out.json'), '--json'],
      ]) {
        const io = output(); expect(await main(args, io)).toBe(1); expect(io.lines).toHaveLength(1); expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
      const directoryTarget = join(root, 'directory-target'); await mkdir(directoryTarget);
      const failedWrite = output(); expect(await main(['migrate', root, '--output', directoryTarget, '--json'], failedWrite)).toBe(1); expect(JSON.parse(failedWrite.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { operation: 'migrate', diagnostics: [{ code: 'CLI_INVALID' }] } });
      expect((await readdir(root)).filter((name) => name.includes('.tmp'))).toEqual([]);
      expect(await readFile(manifest)).toEqual(before);
    } finally { await rm(alias, { recursive: true, force: true }); await rm(workspaceAlias, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
  });
  it('validates project references without compiling or writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-validate-'));
    const manifest = join(root, 'zplc.json');
    try {
      await mkdir(join(root, 'src'));
      await writeFile(manifest, JSON.stringify({ schemaVersion: 2, name: 'validate-test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }] }));
      await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM');
      const success = output();
      expect(await main(['validate', root, '--json'], success)).toBe(0);
      expect(success.errors).toEqual([]); expect(success.lines).toHaveLength(1);
      expect(JSON.parse(success.lines[0] ?? '{}')).toMatchObject({ ok: true, summary: { name: 'validate-test', taskCount: 1 }, evidence: { schemaVersion: 1, operation: 'validate', outcome: 'passed', diagnostics: [], artifacts: [] }, execution: { schemaVersion: 1, actor: 'cli', permission: 'project:read', operation: 'validate', outcome: 'passed', jobId: expect.any(String), startedAt: expect.any(String), finishedAt: expect.any(String) } });
      expect(await readFile(manifest, 'utf8')).toContain('validate-test');

      await rm(join(root, 'src', 'Main.st'));
      const failure = output();
      expect(await main(['validate', root, '--json'], failure)).toBe(1);
      expect(failure.errors).toEqual([]); expect(failure.lines).toHaveLength(1);
      expect(JSON.parse(failure.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { operation: 'validate', diagnostics: [{ code: 'PROGRAM_NOT_FOUND' }], artifacts: [] } });
      const humanFailure = output();
      expect(await main(['validate', root], humanFailure)).toBe(1); expect(humanFailure.lines).toEqual([]); expect(humanFailure.errors).toEqual(['Error: Task program could not be resolved from src']);

      const human = output();
      await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM');
      expect(await main(['validate', root], human)).toBe(0); expect(human.lines).toEqual(['validate passed']); expect(human.errors).toEqual([]);
      const subprocess = await run('validate', root, '--json');
      expect(subprocess.code).toBe(0); expect(subprocess.stderr).toBe(''); expect(subprocess.stdout.trim().split('\n')).toHaveLength(1); expect(JSON.parse(subprocess.stdout)).toMatchObject({ ok: true, evidence: { operation: 'validate', outcome: 'passed', artifacts: [] } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('lists validate in help', async () => {
    const io = output();
    expect(await main(['--help'], io)).toBe(0); expect(io.errors).toEqual([]); expect(io.lines.join('\n')).toContain('zplc-cli validate <workspace> --json');
  });
  it('rejects invalid validate inputs before reading a workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-validate-input-'));
    const alias = join(root, 'workspace-alias');
    try {
      await symlink(motorStartStop, alias, process.platform === 'win32' ? 'junction' : 'dir');
      for (const args of [
        ['validate', cli, '--json'],
        ['validate', motorStartStop, 'extra', '--json'],
        ['validate', motorStartStop, '--output', join(root, 'result'), '--json'],
        ['validate', motorStartStop, '--output=', '--json'],
        ['validate', motorStartStop, '--language', 'ST', '--json'],
        ['validate', motorStartStop, '--language=', '--json'],
        ['validate', alias, '--json'],
      ]) {
        const io = output(); expect(await main(args, io)).toBe(1); expect(io.errors).toEqual([]); expect(io.lines).toHaveLength(1); expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('lists sanitized workspace symbols as JSON or a minimal human result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-symbols-input-'));
    const alias = join(root, 'workspace-alias');
    try {
      const json = output(); expect(await main(['symbols', motorStartStop, '--json'], json)).toBe(0);
      expect(json.errors).toEqual([]); expect(json.lines).toHaveLength(1);
      const result = JSON.parse(json.lines[0] ?? '{}');
      expect(result).toMatchObject({ ok: true, summary: { symbols: expect.any(Array) }, evidence: { operation: 'symbols-list', outcome: 'passed', artifacts: [] } });
      expect(json.lines[0]).not.toContain('PROGRAM Motor'); expect(json.lines[0]).not.toContain(motorStartStop); expect(json.lines[0]).not.toContain('debugMap');
      const human = output(); expect(await main(['symbols', motorStartStop], human)).toBe(0); expect(human.lines).toEqual(['symbols passed']); expect(human.errors).toEqual([]);
      const help = output(); expect(await main(['--help'], help)).toBe(0); expect(help.lines.join('\n')).toContain('zplc-cli symbols <workspace> [--json]');
      await symlink(motorStartStop, alias, process.platform === 'win32' ? 'junction' : 'dir');
      for (const args of [
        ['symbols', cli, '--json'], ['symbols', motorStartStop, 'extra', '--json'], ['symbols', motorStartStop, '--output', join(root, 'result'), '--json'], ['symbols', motorStartStop, '--output=', '--json'], ['symbols', motorStartStop, '--language', 'ST', '--json'], ['symbols', motorStartStop, '--language=', '--json'], ['symbols', alias, '--json'],
      ]) {
        const rejected = output(); expect(await main(args, rejected)).toBe(1); expect(rejected.lines).toHaveLength(1); expect(JSON.parse(rejected.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects migration preview files, symlinks, and compile-only options', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-preview-'));
    const alias = join(root, 'workspace-alias');
    try {
      await symlink(motorStartStop, alias, process.platform === 'win32' ? 'junction' : 'dir');
      for (const args of [
        ['migrate-preview', cli, '--json'],
        ['migrate-preview', motorStartStop, '--output', join(root, 'result'), '--json'],
        ['migrate-preview', motorStartStop, '--language', 'ST', '--json'],
        ['migrate-preview', motorStartStop, '--output=', '--json'],
        ['migrate-preview', motorStartStop, '--language=', '--json'],
        ['migrate-preview', alias, '--json'],
      ]) {
        const io = output(); expect(await main(args, io)).toBe(1); expect(io.lines).toHaveLength(1); expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('returns exit codes without changing the caller process and emits exactly one JSON line', async () => {
    const success = output();
    expect(await main(['inspect', demo, '--json'], success)).toBe(0);
    expect(success.lines).toHaveLength(1); expect(success.errors).toEqual([]); expect(JSON.parse(success.lines[0])).toMatchObject({ ok: true });
    const failure = output();
    expect(await main(['check', '/not/a/zplc/project', '--json'], failure)).toBe(1);
    expect(failure.lines).toHaveLength(1); expect(failure.errors).toEqual([]); expect(JSON.parse(failure.lines[0])).toMatchObject({ ok: false });
  });
  it('rejects JSON help rather than mixing machine and human output', async () => {
    const io = output(); expect(await main(['--help', '--json'], io)).toBe(1);
    expect(io.lines).toHaveLength(1); expect(io.errors).toEqual([]); expect(JSON.parse(io.lines[0])).toMatchObject({ ok: false });
  });
  it('spawns one-line JSON success and failure with their OS exit codes', async () => {
    const success = await run('inspect', demo, '--json');
    expect(success.code).toBe(0); expect(success.stderr).toBe(''); expect(success.stdout.trim().split('\n')).toHaveLength(1); expect(JSON.parse(success.stdout)).toMatchObject({ ok: true });
    const failure = await run('wat', demo, '--json');
    expect(failure.code).toBe(1); expect(failure.stderr).toBe(''); expect(failure.stdout.trim().split('\n')).toHaveLength(1); expect(JSON.parse(failure.stdout)).toMatchObject({ ok: false });
  });
  it('does not alter output until compilation succeeds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-output-')); const source = join(root, 'broken.ST'); const artifact = join(root, 'result.ZPLC');
    try {
      await writeFile(source, 'PROGRAM Main\nVAR\n  PasswordSecret : BOOL;\nEND_VAR\n @\nEND_PROGRAM'); await writeFile(artifact, 'sentinel');
      const io = output(); expect(await main(['compile', source, '--json', '--output', artifact], io)).toBe(1);
      expect(await readFile(artifact, 'utf8')).toBe('sentinel'); expect(JSON.stringify(io)).not.toContain('PasswordSecret');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('fails closed when output would overwrite a source, manifest, or direct src entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-protected-')); const source = join(root, 'source.IL'); const workspace = join(root, 'workspace');
    try {
      await mkdir(join(root, 'nested')); await writeFile(source, 'PROGRAM Main\nEND_PROGRAM');
      expect(await main(['compile', source, '--json', '--output', `${root}/nested/../source.IL`], output())).toBe(1); expect(await readFile(source, 'utf8')).toBe('PROGRAM Main\nEND_PROGRAM');
      await mkdir(join(workspace, 'src'), { recursive: true });
      const manifest = join(workspace, 'zplc.json'); const program = join(workspace, 'src', 'Main.st');
      await writeFile(manifest, JSON.stringify({ name: 'test', version: '1.0.0', tasks: [{ name: 'Main', file: 'Main.st' }] })); await writeFile(program, 'PROGRAM Main\nEND_PROGRAM');
      expect(await main(['compile', workspace, '--json', '--output', manifest], output())).toBe(1); expect(await readFile(manifest, 'utf8')).toContain('"test"');
      expect(await main(['compile', workspace, '--json', '--output', `${workspace}/src/../src/Main.st`], output())).toBe(1); expect(await readFile(program, 'utf8')).toBe('PROGRAM Main\nEND_PROGRAM');
      expect(await main(['compile', workspace, '--json', '--output', join(workspace, 'src', 'new.zplc')], output())).toBe(1); await expect(stat(join(workspace, 'src', 'new.zplc'))).rejects.toThrow();
      const alias = join(root, 'external-src-alias'); await symlink(join(workspace, 'src'), alias, process.platform === 'win32' ? 'junction' : 'dir');
      expect(await main(['compile', workspace, '--json', '--output', join(alias, 'aliased-new.zplc')], output())).toBe(1); await expect(stat(join(workspace, 'src', 'aliased-new.zplc'))).rejects.toThrow();
      if (process.platform === 'win32') {
        const alternateCase = manifest.replace('zplc.json', 'ZPLC.JSON');
        expect(await main(['compile', workspace, '--json', '--output', alternateCase], output())).toBe(1); expect(await readFile(manifest, 'utf8')).toContain('"test"');
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('still permits external artifact replacement and creation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-external-output-')); const workspace = join(root, 'workspace'); const existing = join(root, 'existing.zplc'); const fresh = join(root, 'fresh.zplc');
    try {
      await mkdir(join(workspace, 'src'), { recursive: true }); await writeFile(join(workspace, 'zplc.json'), JSON.stringify({ name: 'test', version: '1.0.0', tasks: [{ name: 'Main', file: 'Main.st' }] })); await writeFile(join(workspace, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM'); await writeFile(existing, 'sentinel');
      expect(await main(['compile', workspace, '--output', existing], output())).toBe(0); expect(await readFile(existing, 'utf8')).not.toBe('sentinel');
      expect(await main(['compile', workspace, '--output', fresh], output())).toBe(0); expect((await stat(fresh)).size).toBeGreaterThan(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('replaces a successful artifact atomically and cleans a failed replacement temp file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-replace-')); const source = join(root, 'counter.IL'); const artifact = join(root, 'result.zplc'); const directoryTarget = join(root, 'existing-directory');
    try {
      await writeFile(source, 'PROGRAM Counter\nVAR\n Count : INT;\nEND_VAR\n LD Count\n ADD 1\n ST Count\nEND_PROGRAM'); await writeFile(artifact, 'sentinel');
      expect(await main(['compile', source, '--output', artifact], output())).toBe(0); expect(await readFile(artifact, 'utf8')).not.toBe('sentinel');
      await mkdir(directoryTarget); const io = output(); expect(await main(['compile', source, '--json', '--output', directoryTarget], io)).toBe(1);
      expect((await stat(directoryTarget)).isDirectory()).toBe(true); expect((await readdir(root)).filter(name => name.includes('.tmp'))).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects empty compile options that would otherwise be silently ignored', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-empty-option-'));
    const source = join(root, 'Main.st');
    try {
      await writeFile(source, 'PROGRAM Main\nEND_PROGRAM');
      for (const args of [
        ['compile', demo, '--json', '--language='],
        ['compile', demo, '--json', '--output='],
        ['compile', source, '--json', '--output='],
      ]) {
        const io = output(); expect(await main(args, io)).toBe(1); expect(io.lines).toHaveLength(1); expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('compiles an upper-case IL file through the IDE adapter without generated-ST chatter', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-il-')); const source = join(root, 'counter.IL');
    try {
      await writeFile(source, 'PROGRAM Counter\nVAR\n Count : INT;\nEND_VAR\n LD Count\n ADD 1\n ST Count\nEND_PROGRAM');
      const io = output(); expect(await main(['compile', source], io)).toBe(0); expect(io.errors).toEqual([]); expect(io.lines.join('\n')).not.toContain('Generated ST');
      const artifact = join(root, 'artifact.zplc'); expect(await main(['compile', source, '--output', artifact], output())).toBe(0);
      const bytes = await readFile(artifact); const json = output(); expect(await main(['compile', source, '--json'], json)).toBe(0);
      expect(JSON.parse(json.lines[0])).toMatchObject({ evidence: { artifacts: [{ kind: 'zplc', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }] } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('CLI firmware-build command', () => {
  it('installs SIGINT ownership only when firmware-build is the parsed command', () => {
    expect(isFirmwareBuildInvocation(['firmware-build', '/repo', 'alpha', '--json'])).toBe(true);
    expect(isFirmwareBuildInvocation(['--json', 'firmware-build', '/repo', 'alpha'])).toBe(true);
    expect(isFirmwareBuildInvocation(['test', 'firmware-build', '--json'])).toBe(false);
    expect(isFirmwareBuildInvocation(['inspect', 'firmware-build', '--json'])).toBe(false);
    expect(isFirmwareBuildInvocation(['firmware-build', '/repo', 'alpha', '--timeout', '1'])).toBe(false);
    expect(isInterruptibleInvocation(['test', '/workspace', '--json'])).toBe(true);
    expect(isInterruptibleInvocation(['firmware-build', '/repo', 'alpha', '--json'])).toBe(true);
    expect(isInterruptibleInvocation(['inspect', 'test', '--json'])).toBe(false);
    expect(isInterruptibleInvocation(['--help', 'test'])).toBe(false);
    expect(isInterruptibleInvocation(['--version', 'test'])).toBe(false);
    expect(isInterruptibleInvocation(['--help', 'firmware-build', '/repo', 'alpha'])).toBe(false);
    expect(isInterruptibleInvocation(['--version', 'firmware-build', '/repo', 'alpha'])).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('runs the fixed local cross-build and emits only its evidence', async () => {
    const fixture = await firmwareBuildRoot(); const manifest = await readFile(join(fixture.root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json'), 'utf8'); const cmake = await readFile(join(fixture.root, 'firmware', 'app', 'CMakeLists.txt'), 'utf8');
    const oldPath = process.env.PATH; const oldBase = process.env.ZEPHYR_BASE; const oldSdk = process.env.ZEPHYR_SDK_INSTALL_DIR; const oldMarker = process.env.ZPLC_FAKE_WEST_MARKER;
    process.env.PATH = `${fixture.bin}:${oldPath ?? ''}`; process.env.ZEPHYR_BASE = fixture.base; process.env.ZEPHYR_SDK_INSTALL_DIR = fixture.sdk; process.env.ZPLC_FAKE_WEST_MARKER = fixture.marker;
    try {
      const io = output(); expect(await main(['firmware-build', fixture.root, 'alpha', '--json'], io)).toBe(0);
      expect(io.errors).toEqual([]); expect(io.lines).toHaveLength(1);
      const result = JSON.parse(io.lines[0] ?? '{}');
      expect(result).toMatchObject({ ok: true, summary: { schemaVersion: 1, scope: 'local-ephemeral-cross-build', sourceIdentity: 'unverified', board: { boardId: 'alpha-board', ideId: 'alpha', zephyrBoard: 'alpha/board' }, artifact: { kind: 'firmware-elf', byteLength: 52, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } }, evidence: { schemaVersion: 1, operation: 'firmware-build', outcome: 'passed', diagnostics: [], artifacts: [{ kind: 'firmware-elf' }] } });
      expect(JSON.stringify(result)).not.toMatch(new RegExp(`(?:${fixture.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|PATH|argv|cwd|build_command|flash|deploy|HIL)`, 'i'));
      expect(await readFile(join(fixture.root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json'), 'utf8')).toBe(manifest); expect(await readFile(join(fixture.root, 'firmware', 'app', 'CMakeLists.txt'), 'utf8')).toBe(cmake);
      expect((await lstat(fixture.marker)).isFile()).toBe(true);
    } finally {
      if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; if (oldBase === undefined) delete process.env.ZEPHYR_BASE; else process.env.ZEPHYR_BASE = oldBase; if (oldSdk === undefined) delete process.env.ZEPHYR_SDK_INSTALL_DIR; else process.env.ZEPHYR_SDK_INSTALL_DIR = oldSdk; if (oldMarker === undefined) delete process.env.ZPLC_FAKE_WEST_MARKER; else process.env.ZPLC_FAKE_WEST_MARKER = oldMarker;
      await rm(fixture.root, { recursive: true, force: true }); await rm(fixture.host, { recursive: true, force: true });
    }
  });

  it('rejects invalid firmware-build arguments before west starts', async () => {
    const fixture = await firmwareBuildRoot(); const alias = join(fixture.host, 'repo-link'); const file = join(fixture.host, 'not-a-directory');
    await symlink(fixture.root, alias, 'dir'); await writeFile(file, 'x');
    const oldPath = process.env.PATH; const oldMarker = process.env.ZPLC_FAKE_WEST_MARKER; process.env.PATH = `${fixture.bin}:${oldPath ?? ''}`; process.env.ZPLC_FAKE_WEST_MARKER = fixture.marker;
    try {
      for (const args of [
        ['firmware-build', fixture.root, 'Alpha', '--json'], ['firmware-build', fixture.root, '--json'], ['firmware-build', fixture.root, '', '--json'], ['firmware-build', fixture.root, 'alpha', 'extra', '--json'],
        ['firmware-build', file, 'alpha', '--json'], ['firmware-build', alias, 'alpha', '--json'], ['firmware-build', join(fixture.host, 'missing'), 'alpha', '--json'], ['firmware-build', fixture.root, 'alpha', '--output', 'out', '--json'], ['firmware-build', fixture.root, 'alpha', '--output=', '--json'], ['firmware-build', fixture.root, 'alpha', '--language', 'ST', '--json'], ['firmware-build', fixture.root, 'alpha', '--language=', '--json'], ['firmware-build', fixture.root, 'alpha', '--timeout', '1', '--json'], ['firmware-build', fixture.root, 'alpha', '--board', 'alpha', '--json'],
      ]) {
        const io = output(); expect(await main(args, io)).toBe(1); expect(io.errors).toEqual([]); expect(io.lines).toHaveLength(1); expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
      const unknown = output(); expect(await main(['firmware-build', fixture.root, 'unknown', '--json'], unknown)).toBe(1); expect(JSON.parse(unknown.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { operation: 'firmware-build', diagnostics: [{ code: 'FIRMWARE_BUILD_UNAVAILABLE' }] } });
      await expect(lstat(fixture.marker)).rejects.toThrow();
    } finally {
      if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; if (oldMarker === undefined) delete process.env.ZPLC_FAKE_WEST_MARKER; else process.env.ZPLC_FAKE_WEST_MARKER = oldMarker;
      await rm(fixture.root, { recursive: true, force: true }); await rm(fixture.host, { recursive: true, force: true });
    }
  });

  it('maps firmware build exit codes without changing Tool API results', () => {
    const failed = (code: string) => ({ ok: false as const, evidence: { schemaVersion: 1 as const, operation: 'firmware-build' as const, outcome: 'failed' as const, diagnostics: [{ code, message: 'x' }], artifacts: [] } });
    expect(firmwareBuildExitCode({ ok: true, summary: {} as never, evidence: { schemaVersion: 1, operation: 'firmware-build', outcome: 'passed', diagnostics: [], artifacts: [] } })).toBe(0);
    expect(firmwareBuildExitCode(failed('FIRMWARE_BUILD_CANCELLED'))).toBe(130); expect(firmwareBuildExitCode(failed('FIRMWARE_BUILD_TIMEOUT'))).toBe(124); expect(firmwareBuildExitCode(failed('FIRMWARE_BUILD_OUTPUT_LIMIT'))).toBe(1); expect(firmwareBuildExitCode(failed('FIRMWARE_BUILD_FAILED'))).toBe(1);
  });

  it.skipIf(process.platform === 'win32')('keeps subprocess JSON and exit status honest', async () => {
    const fixture = await firmwareBuildRoot();
    try {
      const success = await runWithEnv(['firmware-build', fixture.root, 'alpha', '--json'], { PATH: `${fixture.bin}:${process.env.PATH ?? ''}`, ZEPHYR_BASE: fixture.base, ZEPHYR_SDK_INSTALL_DIR: fixture.sdk, ZPLC_FAKE_WEST_MARKER: fixture.marker });
      expect(success.code).toBe(0); expect(success.stderr).toBe(''); expect(success.stdout.trim().split('\n')).toHaveLength(1); expect(JSON.parse(success.stdout)).toMatchObject({ ok: true, evidence: { operation: 'firmware-build' } });
      const failure = await runWithEnv(['firmware-build', fixture.root, 'unknown', '--json'], { PATH: `${fixture.bin}:${process.env.PATH ?? ''}`, ZPLC_FAKE_WEST_MARKER: fixture.marker });
      expect(failure.code).toBe(1); expect(failure.stderr).toBe(''); expect(failure.stdout.trim().split('\n')).toHaveLength(1); expect(JSON.parse(failure.stdout)).toMatchObject({ ok: false, evidence: { operation: 'firmware-build' } });
    } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(fixture.host, { recursive: true, force: true }); }
  });

  it.skipIf(process.platform === 'win32')('cancels an owned local build on SIGINT before the CLI exits', async () => {
    const fixture = await firmwareBuildRoot(true);
    try {
      const proc = Bun.spawn([process.execPath, 'run', cli, 'firmware-build', fixture.root, 'alpha', '--json'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH ?? ''}`, ZEPHYR_BASE: fixture.base, ZEPHYR_SDK_INSTALL_DIR: fixture.sdk, ZPLC_FAKE_WEST_OUTPUT: fixture.outputMarker, ZPLC_FAKE_WEST_PID: fixture.pidMarker } });
      await waitForFile(fixture.pidMarker); process.kill(proc.pid, 'SIGINT'); await Bun.sleep(50); process.kill(proc.pid, 'SIGINT');
      const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      expect(code).toBe(130); expect(stderr).toBe(''); expect(stdout.trim().split('\n')).toHaveLength(1); expect(JSON.parse(stdout)).toMatchObject({ ok: false, evidence: { operation: 'firmware-build', diagnostics: [{ code: 'FIRMWARE_BUILD_CANCELLED' }] } });
      const [pid, owned] = await Promise.all([readFile(fixture.pidMarker, 'utf8'), readFile(fixture.outputMarker, 'utf8')]);
      expect(() => process.kill(-Number(pid.trim()), 0)).toThrow(); await expect(lstat(owned.trim())).rejects.toThrow();
    } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(fixture.host, { recursive: true, force: true }); }
  }, 30_000);
});

describe('CLI test command', () => {
  async function workspace(expected = true, durationMs = 10) {
    const root = await mkdtemp(join(tmpdir(), 'zplc-cli-test-'));
    await mkdir(join(root, 'src')); await mkdir(join(root, 'tests'));
    await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Motor.st'] }] }));
    await writeFile(join(root, 'src', 'Motor.st'), 'PROGRAM Motor VAR_INPUT Start AT %I0.0 : BOOL; END_VAR VAR_OUTPUT Forward AT %Q0.0 : BOOL; END_VAR Forward := Start; END_PROGRAM');
    await writeFile(join(root, 'tests', 'motor.scenario.json'), JSON.stringify({ schemaVersion: 1, id: 'MotorStart', tickMs: 10, durationMs, events: [{ atMs: 0, set: { 'Motor.Start': true } }], expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': expected } }] }));
    return root;
  }

  it.skipIf(!existsSync(nativeRuntimeBinary))('runs one named scenario with JSON, human output, and a protected trace artifact', async () => {
    const root = await workspace(); const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    const trace = join(root, 'trace.json'); const outside = await mkdtemp(join(tmpdir(), 'zplc-cli-scenario-output-'));
    try {
      await writeFile(join(root, 'tests', 'other.scenario.json'), JSON.stringify({ schemaVersion: 1, id: 'Other', tickMs: 10, durationMs: 10, events: [{ atMs: 0, set: { 'Motor.Start': false } }], expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': false } }] }));
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      const json = output(); expect(await main(['scenario-run', root, 'motorstart', '--output', trace, '--json'], json)).toBe(0);
      expect(json.lines).toHaveLength(1); expect(JSON.parse(json.lines[0] ?? '{}')).toMatchObject({ ok: true, summary: { scenarios: [{ id: 'MotorStart' }] }, evidence: { operation: 'scenario-run', artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] } });
      expect(JSON.parse(await readFile(trace, 'utf8'))).toMatchObject({ scenarios: [{ id: 'MotorStart' }] });
      const human = output(); expect(await main(['scenario-run', root, 'MotorStart'], human)).toBe(0); expect(human.lines).toEqual(['scenario-run passed']);
      const help = output(); expect(await main(['--help'], help)).toBe(0); expect(help.lines.join('\n')).toContain('zplc-cli scenario-run <workspace> <scenario-id> [--json] [--output <trace.json>]');
      const sourceAlias = join(outside, 'source-alias'); const testsAlias = join(outside, 'tests-alias'); await symlink(join(root, 'src'), sourceAlias, 'dir'); await symlink(join(root, 'tests'), testsAlias, 'dir');
      for (const path of [join(root, 'zplc.json'), join(root, 'src', 'trace.json'), join(root, 'tests', 'trace.json'), join(sourceAlias, 'trace.json'), join(testsAlias, 'trace.json')]) {
        const rejected = output(); expect(await main(['scenario-run', root, 'MotorStart', '--output', path, '--json'], rejected)).toBe(1); expect(JSON.parse(rejected.lines[0] ?? '{}')).toMatchObject({ evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
    } finally { if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN; else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary; await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  }, 30_000);

  it('rejects invalid scenario-run arguments and only makes the real command interruptible', async () => {
    const root = await workspace(); const alias = join(dirname(root), `${basename(root)}-alias`);
    try {
      await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
      for (const args of [
        ['scenario-run', root, '--json'], ['scenario-run', root, '', '--json'], ['scenario-run', root, 'x'.repeat(129), '--json'], ['scenario-run', root, 'A\0', '--json'], ['scenario-run', root, 'A', 'extra', '--json'], ['scenario-run', join(root, 'src', 'Motor.st'), 'A', '--json'], ['scenario-run', alias, 'A', '--json'], ['scenario-run', root, 'A', '--language=', '--json'], ['scenario-run', root, 'A', '--output=', '--json'],
      ]) {
        const io = output(); expect(await main(args, io)).toBe(1); expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
      expect(isInterruptibleInvocation(['scenario-run', root, 'A', '--json'])).toBe(true);
      expect(isInterruptibleInvocation(['--help', 'scenario-run', root, 'A'])).toBe(false);
      expect(isInterruptibleInvocation(['--version', 'scenario-run', root, 'A'])).toBe(false);
    } finally { await rm(alias, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
  });

  it('rejects file inputs and language options', async () => {
    const root = await workspace();
    try {
      for (const args of [['test', join(root, 'src', 'Motor.st'), '--json'], ['test', root, '--language', 'ST', '--json'], ['test', root, '--language=', '--json'], ['test', root, '--output=', '--json']]) {
        const io = output(); expect(await main(args, io)).toBe(1); expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('propagates a pre-aborted signal to tests without touching the requested trace', async () => {
    const root = await workspace();
    try {
      const controller = new AbortController();
      controller.abort();
      const trace = join(root, 'trace.json'); await writeFile(trace, 'sentinel');
      const io = output();
      expect(await main(['test', root, '--output', trace, '--json'], io, { signal: controller.signal })).toBe(130);
      expect(io.errors).toEqual([]); expect(io.lines).toHaveLength(1);
      expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { operation: 'test', diagnostics: [{ code: 'TEST_CANCELLED' }], artifacts: [] } });
      expect(await readFile(trace, 'utf8')).toBe('sentinel');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('maps test cancellation and timeout exit codes without changing Tool API results', () => {
    const failed = (code: string) => ({ ok: false as const, evidence: { schemaVersion: 1 as const, operation: 'test' as const, outcome: 'failed' as const, diagnostics: [{ code, message: 'x' }], artifacts: [] } });
    expect(testExitCode({ ok: true, summary: {} as never, evidence: { schemaVersion: 1, operation: 'test', outcome: 'passed', diagnostics: [], artifacts: [] }, preview: {} as never })).toBe(0);
    expect(testExitCode(failed('TEST_CANCELLED'))).toBe(130); expect(testExitCode(failed('TEST_TIMEOUT'))).toBe(124); expect(testExitCode(failed('RUNTIME_FAILED'))).toBe(1);
  });

  it.skipIf(!existsSync(nativeRuntimeBinary))('exports complete pass and assertion-failure traces without leaking them into JSON', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
    const passing = await workspace(true); const failing = await workspace(false);
    const passedTrace = join(passing, 'trace.json'); const failedTrace = join(failing, 'trace.json');
    try {
      const success = output(); expect(await main(['test', passing, '--output', passedTrace, '--json'], success)).toBe(0);
      expect(success.lines).toHaveLength(1); expect(success.errors).toEqual([]); const successResult = JSON.parse(success.lines[0] ?? '{}'); expect(successResult).toMatchObject({ ok: true, evidence: { operation: 'test' } });
      const failure = output(); expect(await main(['test', failing, '--output', failedTrace, '--json'], failure)).toBe(1);
      expect(failure.lines).toHaveLength(1); expect(failure.errors).toEqual([]); expect(JSON.parse(failure.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED' }] } });
      expect(JSON.stringify(failure)).not.toContain(failing);
      for (const [path, result] of [[passedTrace, successResult], [failedTrace, JSON.parse(failure.lines[0] ?? '{}')]] as const) {
        const bytes = await readFile(path); const trace = result.evidence.artifacts.find((artifact: { kind: string }) => artifact.kind === 'trace');
        expect(JSON.parse(bytes.toString())).toMatchObject({ schemaVersion: 1, scenarios: expect.any(Array) });
        expect(trace).toEqual({ kind: 'trace', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength });
        expect(JSON.stringify(result)).not.toContain('traceFile'); expect(JSON.stringify(result)).not.toContain(path);
      }
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(passing, { recursive: true, force: true }); await rm(failing, { recursive: true, force: true });
    }
  }, 30_000);

  it.skipIf(process.platform === 'win32')('protects workspace inputs and their symlink aliases from trace output', async () => {
    const root = await workspace(); const outside = await mkdtemp(join(tmpdir(), 'zplc-cli-trace-link-'));
    try {
      const sourceAlias = join(outside, 'source-alias'); const testsAlias = join(outside, 'tests-alias');
      await symlink(join(root, 'src'), sourceAlias, 'dir'); await symlink(join(root, 'tests'), testsAlias, 'dir');
      for (const path of [join(root, 'zplc.json'), join(root, 'src', 'trace.json'), join(root, 'tests', 'trace.json'), join(sourceAlias, 'trace.json'), join(testsAlias, 'trace.json')]) {
        const io = output(); expect(await main(['test', root, '--output', path, '--json'], io)).toBe(1);
        expect(JSON.parse(io.lines[0] ?? '{}')).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'CLI_INVALID' }] } });
      }
    } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });

  it.skipIf(process.platform === 'win32' || !existsSync(nativeRuntimeBinary))('cancels an owned native POSIX test session on SIGINT and publishes no partial evidence', async () => {
    const root = await workspace(true, 99_990); const wrapper = join(root, 'native-runtime-wrapper'); const pidMarker = join(root, 'native-runtime.pid'); const trace = join(root, 'trace.json');
    try {
      await writeFile(wrapper, '#!/bin/sh\nprintf \'%s\\n\' "$$" > "$ZPLC_FAKE_RUNTIME_PID"\nexec "$ZPLC_REAL_RUNTIME" "$@"\n'); await chmod(wrapper, 0o755);
      await writeFile(trace, 'sentinel');
      const proc = Bun.spawn([process.execPath, 'run', cli, 'test', root, '--output', trace, '--json'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ZPLC_NATIVE_SIM_BIN: wrapper, ZPLC_REAL_RUNTIME: nativeRuntimeBinary, ZPLC_FAKE_RUNTIME_PID: pidMarker } });
      const stdout = new Response(proc.stdout).text(); const stderr = new Response(proc.stderr).text();
      await waitForFile(pidMarker); process.kill(proc.pid, 'SIGINT');
      const [code, outputText, errorText] = await Promise.all([proc.exited, stdout, stderr]);
      expect(code).toBe(130); expect(errorText).toBe(''); expect(outputText.trim().split('\n')).toHaveLength(1);
      expect(JSON.parse(outputText)).toMatchObject({ ok: false, evidence: { operation: 'test', diagnostics: [{ code: 'TEST_CANCELLED' }], artifacts: [] } });
      expect(await readFile(trace, 'utf8')).toBe('sentinel');
      const pid = Number((await readFile(pidMarker, 'utf8')).trim());
      expect(() => process.kill(pid, 0)).toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);
});
