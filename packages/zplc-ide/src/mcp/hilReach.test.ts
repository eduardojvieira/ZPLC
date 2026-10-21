import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import { MCP_TOOL_NAMES } from './server';

// HIL-003 and COM-030: a hardware scenario run is started only by a person; it is not reachable from MCP or AI tools.
// Two things are shown by running things, not by reading source: the modules the MCP server loads, at import and while it
// serves tools, are enumerated, and none of them is the HIL package or a serial library; and the commands that drive a
// board exit with an error when started without an interactive terminal.

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const MCP = fileURLToPath(new URL('./index.ts', import.meta.url));
const python = Bun.which('python3');

const PROBE = (workspace: string) =>
  `
const mcp = await import(${JSON.stringify(MCP)});
const server = await import(${JSON.stringify(fileURLToPath(new URL('./server.ts', import.meta.url)))});
const workspace = await server.openMcpWorkspace(${JSON.stringify(workspace)});
const dispatch = server.createMcpDispatcher(workspace);
const served = [];
for (const tool of ['project_inspect', 'project_validate', 'compiler_check', 'compiler_compile', 'symbols_list']) {
  const result = await dispatch(tool, {}, new AbortController().signal);
  served.push([tool, result.isError === true ? 'error' : 'ok']);
}
console.log(JSON.stringify({ loaded: Object.keys(require.cache), served, tools: server.MCP_TOOL_NAMES, entry: typeof ` +
  `mcp.runMcpEntrypoint }));
`;

describe('hardware runs are not reachable from MCP or AI tools (HIL-003, COM-030)', () => {
  test('the tools MCP serves are the fixed list, and none of them names a device, a board or a physical action (HIL-003)', () => {
    expect([...MCP_TOOL_NAMES]).toEqual([
      'project_inspect',
      'project_validate',
      'compiler_check',
      'compiler_compile',
      'symbols_list',
      'safety_check',
      'tests_run',
      'scenario_run',
      'simulation_start',
      'simulation_step',
      'runtime_snapshot',
      'trace_get',
      'boards_list',
      'toolchain_inspect',
      'firmware_build',
    ]);
    const physical = /hil|device|serial|(^|_)port|flash|deploy|force|stop|hardware|bench|(^|_)chain(_|$)|shell|write|record/i;
    expect(MCP_TOOL_NAMES.filter((name) => physical.test(name))).toEqual([]);
  });

  test(
    'no module that the MCP server loads, at import or while it serves its tools, is the HIL package or a serial library ' + '(HIL-003)',
    async () => {
      const workspace = await mkdtemp(join(tmpdir(), 'zplc-hil-mcp-'));
      try {
        await mkdir(join(workspace, 'src'));
        await writeFile(
          join(workspace, 'zplc.json'),
          JSON.stringify({
            schemaVersion: 2,
            name: 'Reach',
            version: '1.0.0',
            target: { board: 'posix' },
            tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
          }),
        );
        await writeFile(join(workspace, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
        const script = join(workspace, 'probe.ts');
        await writeFile(script, PROBE(workspace));
        const done = Bun.spawnSync([process.execPath, script], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
        expect(done.stderr.toString()).toBe('');
        const probe = JSON.parse(done.stdout.toString()) as {
          loaded: string[];
          served: Array<[string, string]>;
          tools: string[];
          entry: string;
        };
        expect(probe.entry).toBe('function');
        expect(probe.served.map(([tool]) => tool)).toEqual([
          'project_inspect',
          'project_validate',
          'compiler_check',
          'compiler_compile',
          'symbols_list',
        ]);
        expect(probe.loaded.some((path) => path.endsWith('/packages/zplc-ide/src/mcp/server.ts'))).toBe(true);
        expect(probe.loaded.length).toBeGreaterThan(20);
        const reaches = probe.loaded.filter((path) =>
          /\/packages\/zplc-hil\/|\/node_modules\/(@?serialport|@serialport)|\/tools\/hil\//.test(path),
        );
        expect(reaches).toEqual([]);
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
    120_000,
  );

  test(
    'the hardware scenario command started without an interactive terminal exits with an error, before it reads or opens anything ' +
      '(HIL-003, COM-030)',
    () => {
      const done = Bun.spawnSync(
        [
          process.execPath,
          'packages/zplc-hil/src/cli.ts',
          'run',
          '--board',
          'rpi_pico',
          '--workspace',
          '/nonexistent',
          '--scenario',
          '/nonexistent/s.json',
        ],
        {
          cwd: ROOT,
          stdin: null,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, ZPLC_HIL_FORBID_SERIAL: '1' },
        },
      );
      expect(done.exitCode).toBe(2);
      expect(done.stderr.toString()).toContain('interactive terminal');
    },
  );

  (python ? test : test.skip)(
    'the chain command for a board started without an interactive terminal exits with an error (HIL-003, HIL-012, COM-030)',
    () => {
      const done = Bun.spawnSync([python!, '-B', 'tools/hil/run_chain.py', 'rpi_pico'], {
        cwd: ROOT,
        stdin: null,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, ZPLC_HIL_FORBID_SERIAL: '1' },
      });
      expect(done.exitCode).toBe(2);
      expect(done.stderr.toString()).toContain('interactive terminal');
    },
  );

  test('no flag turns the guard off: an unknown one is an error of its own, not a bypass (HIL-003)', () => {
    const done = Bun.spawnSync(
      [
        process.execPath,
        'packages/zplc-hil/src/cli.ts',
        'run',
        '--board',
        'rpi_pico',
        '--workspace',
        '/x',
        '--scenario',
        '/y',
        '--yes-i-am-at-the-bench',
      ],
      {
        cwd: ROOT,
        stdin: null,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, ZPLC_HIL_FORBID_SERIAL: '1' },
      },
    );
    expect(done.exitCode).toBe(2);
  });
});
