// COM-030: no MCP tool and no AI path may open the device link.
//
// Three proofs, none of them a reading of the product's source text:
//   1. the tools and resources the server registers are enumerated from the live server, and none of them takes
//      a device, port or session argument;
//   2. the module graph the bundler builds for the MCP entry point (the artifact a client runs) holds no module
//      that opens a serial port or a socket, and no node module that could;
//   3. the tools that need no runtime binary are run with traps on every way out of the process that a link
//      would use, and none of them is touched.
//
// What the MCP can do beside the stateless checks is run the repository's own native runtime for a scenario
// (a child process that exits), run it as a private debug session the server started for the agent alone (AIX-014),
// and a local cross-build: they are listed below by the module that spawns them, and the debug tools run under the traps too.
// The other half of COM-030 is the last test of this file: the hardware scenario command (packages/zplc-hil) and the
// bench commands of tools/hil (the chain of HIL-012 and the comparison of HIL-015), started without an interactive
// terminal, exit with an error before they open anything.
import { afterEach, describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import dgram from 'node:dgram';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { McpServer } from '@modelcontextprotocol/server';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { buildMcpServer, createMcpDispatcher, MCP_RESOURCE_URIS, MCP_TOOL_NAMES, openMcpWorkspace } from './server';

const temporary: string[] = [];
const SESSION = '7c9e6679-7425-40de-944b-e07fc1f99a4b';
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-link-'));
  temporary.push(root);
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tests'));
  await writeFile(
    join(root, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: 'MCP link',
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
    }),
  );
  await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  return root;
}

interface Registered {
  tools: Array<{
    name: string;
    inputSchema: { shape: Record<string, unknown>; safeParse: (value: unknown) => { success: boolean } };
    annotations: Record<string, unknown>;
  }>;
  resources: Array<{
    name: string;
    uri: string | { uriTemplate: { toString(): string } };
    read: (...args: unknown[]) => Promise<{ contents: Array<{ text: string }> }>;
  }>;
}

/** Builds the real server and returns what it registered, read from the registration calls themselves. */
async function registered(): Promise<Registered> {
  const root = await workspace();
  const bound = await openMcpWorkspace(root);
  expect(bound).toBeDefined();
  const record: Registered = { tools: [], resources: [] };
  const proto = McpServer.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const registerTool = proto.registerTool;
  const registerResource = proto.registerResource;
  proto.registerTool = function (this: unknown, name: string, config: Registered['tools'][number], callback: unknown) {
    record.tools.push({ name, inputSchema: config.inputSchema, annotations: config.annotations });
    return registerTool.call(this, name, config, callback);
  } as never;
  proto.registerResource = function (
    this: unknown,
    name: string,
    uri: Registered['resources'][number]['uri'],
    config: unknown,
    read: Registered['resources'][number]['read'],
  ) {
    record.resources.push({ name, uri, read });
    return registerResource.call(this, name, uri, config, read);
  } as never;
  try {
    buildMcpServer(bound!);
  } finally {
    proto.registerTool = registerTool;
    proto.registerResource = registerResource;
  }
  return record;
}

/** Runs `body` with a trap on every way out of the process a device link would use; answers the traps that were touched. */
async function withLinkTraps(body: () => Promise<void>): Promise<string[]> {
  const touched: string[] = [];
  const trap = (what: string) => () => {
    touched.push(what);
    throw new Error(`device link touched: ${what}`);
  };
  const originalNet = net.Socket.prototype.connect;
  const originalDgram = dgram.createSocket;
  const originalTls = tls.connect;
  const originalNetConnect = net.connect;
  const serial = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const bunRecord = Bun as unknown as Record<string, unknown>;
  const originalBun = { connect: bunRecord.connect, listen: bunRecord.listen, udpSocket: bunRecord.udpSocket };
  net.Socket.prototype.connect = trap('net.Socket.connect') as never;
  net.connect = trap('net.connect') as never;
  (dgram as unknown as Record<string, unknown>).createSocket = trap('dgram.createSocket');
  (tls as unknown as Record<string, unknown>).connect = trap('tls.connect');
  bunRecord.connect = trap('Bun.connect');
  bunRecord.listen = trap('Bun.listen');
  bunRecord.udpSocket = trap('Bun.udpSocket');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serial: new Proxy({}, { get: trap('navigator.serial'), has: trap('navigator.serial') }) },
  });
  try {
    await body();
  } finally {
    net.Socket.prototype.connect = originalNet as never;
    net.connect = originalNetConnect;
    (dgram as unknown as Record<string, unknown>).createSocket = originalDgram;
    (tls as unknown as Record<string, unknown>).connect = originalTls;
    Object.assign(bunRecord, originalBun);
    if (serial) Object.defineProperty(globalThis, 'navigator', serial);
    else delete (globalThis as Record<string, unknown>).navigator;
  }
  return touched;
}

describe('IDE-030: the tools an assistant can call are a closed list that names no physical operation (AGENTS.md rule 8)', () => {
  test('the list is the one below, and no name flashes, deploys, forces, stops, resets or opens a serial line or a shell', () => {
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
      'plant_inspect',
      'scenarios_list',
      'server_self_check',
      'workspace_check_write',
      'workspace_write',
      'debug_session_start',
      'debug_session_stop',
      'debug_set_inputs',
      'debug_breakpoints',
      'debug_step',
      'debug_inspect',
    ]);
    // plan-aix §2.4: `plant` alone is a read (plant_inspect); plant I/O mode is what stays forbidden. `write` alone is a write of
    // a project file (workspace_write, AIX-011); writing course progress is what stays forbidden. `debug` and `stop` name the
    // private simulation debugger (AIX-014): debug_session_stop ends a session the server started for the agent, never a board
    for (const name of MCP_TOOL_NAMES)
      expect(name, name).not.toMatch(
        new RegExp(
          'flash|deploy|force|upload|connect|serial|shell|poke|erase|provision|reset|board_|plant_io|feed|mirror|attach|' +
            'delete|remove|progress_write|unlock|solution',
        ),
      );
    // and the words that stay forbidden alone are only ever the debugger's own, on a debug_ tool
    for (const name of MCP_TOOL_NAMES.filter((tool) => /stop|debug/.test(tool))) expect(name).toMatch(/^debug_/);
  });

  test('the resources are read-only documents and snapshots: none of them is a command', () => {
    for (const uri of MCP_RESOURCE_URIS)
      expect(uri, uri).toMatch(/^zplc:\/\/(project|target|runtime|course|docs|lesson|formats)\/[a-z-]+$/);
  });
});

describe('COM-030: the MCP server cannot open the device link', () => {
  test('the registered tools and resources are the fixed list, and none takes a device argument', async () => {
    const { tools, resources } = await registered();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    const staticUris = resources.filter((resource) => typeof resource.uri === 'string').map((resource) => resource.uri as string);
    expect(staticUris.sort()).toEqual([...MCP_RESOURCE_URIS].sort());
    // the replay of a trace, the replay of a snapshot, the text of one program (IDE-030) and one scenario: templates, all reads
    expect(resources.filter((resource) => typeof resource.uri !== 'string')).toHaveLength(4);

    // The only arguments any tool takes name a scenario, a position in a recorded trace, a board profile, or a scene file, or
    // say how much of a recorded trace to read and which program variables to watch in the run (AIX-015, AI-08), or are the
    // project files to check or write with how to check them (AIX-011): a path and a text, never a device, port or session.
    const trace = ['mode', 'signals', 'includeInputs', 'watchSignals', 'fromMs', 'toMs', 'fromSample', 'limit'];
    const write = ['files', 'compileCheck', 'requireCompile', 'expectedBaseSha256'];
    // the private debugger (AIX-014): a session the server started, named by its id, and how to step, set and read it
    const debug = ['sessionId', 'withScene', 'inputs', 'plantActions', 'action', 'locations', 'cycles', 'durationMs', 'maxCycles'];
    const debugReads = ['watch', 'includeFacts', 'functionBlocks', 'includeSfc', 'includePlant'];
    const allowed = new Set([
      'scenarioId',
      'cursor',
      'traceSha256',
      'ideId',
      'sceneFile',
      'mapFile',
      ...trace,
      ...write,
      ...debug,
      ...debugReads,
    ]);
    for (const tool of tools) {
      for (const key of Object.keys(tool.inputSchema.shape)) expect(allowed.has(key), `${tool.name} takes '${key}'`).toBe(true);
      // And an argument that names a port, a device or a session is refused, whatever else is supplied.
      const base =
        tool.name.startsWith('simulation_step') || tool.name === 'runtime_snapshot'
          ? { scenarioId: 'smoke', cursor: 0, traceSha256: 'a'.repeat(64) }
          : tool.name === 'firmware_build'
            ? { ideId: 'posix' }
            : ['scenario_run', 'simulation_start', 'trace_get'].includes(tool.name)
              ? { scenarioId: 'smoke' }
              : tool.name.startsWith('workspace_')
                ? { files: [{ path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM\n' }] }
                : tool.name === 'debug_breakpoints'
                  ? { sessionId: SESSION, action: 'list' }
                  : tool.name.startsWith('debug_') && tool.name !== 'debug_session_start'
                    ? { sessionId: SESSION }
                    : {};
      expect(tool.inputSchema.safeParse(base).success, `${tool.name} refused its base arguments`).toBe(true);
      for (const extra of [
        'port',
        'serialPort',
        'device',
        'baud',
        'host',
        'address',
        'session',
        'studioSession',
        'deploy',
        'flash',
        'force',
        'command',
        'shell',
        'boardRun',
        'boardStop',
        'plantIo',
        'mirror',
      ]) {
        expect(tool.inputSchema.safeParse({ ...base, [extra]: 'x' }).success, `${tool.name} accepted '${extra}'`).toBe(false);
      }
    }
    // Nothing the server offers writes to a device: the tools that are not read-only are a local cross-build, a write of project
    // files inside the workspace and the private debugger's five commands on a simulation it started (plan-aix §2.4); only the
    // write replaces files, and none reaches outside the workspace and the repository.
    expect(
      tools
        .filter((tool) => tool.annotations.readOnlyHint !== true)
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(
      [
        'workspace_write',
        'debug_session_start',
        'debug_session_stop',
        'debug_set_inputs',
        'debug_breakpoints',
        'debug_step',
        'firmware_build',
      ].sort(),
    );
    expect(tools.every((tool) => tool.annotations.openWorldHint === false)).toBe(true);
    expect(tools.filter((tool) => tool.annotations.destructiveHint !== false).map((tool) => tool.name)).toEqual(['workspace_write']);
  });

  test('the module graph of the MCP entry point holds no serial, upload or socket module', async () => {
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, 'index.ts')],
      target: 'bun',
      minify: false,
      metafile: true,
    } as never);
    expect(built.success).toBe(true);
    const metafile = (
      built as unknown as { metafile: { inputs: Record<string, { imports: Array<{ path: string; external?: boolean; kind: string }> }> } }
    ).metafile;
    const modules = Object.keys(metafile.inputs);
    expect(modules.length).toBeGreaterThan(20);

    // The modules of the IDE that talk to a device: the Web Serial and node serial back ends, the link
    // manager, the upload and deploy protocol, the handshake, and the Electron main process that owns the
    // port selection. None of them is in the graph.
    const deviceLink = new RegExp(
      String.raw`(?:^|[\\/])(?:runtime\/(?:serialAdapter|serialConsole|connectionManager|deviceHandshake|uploadProtocol|uploadTrace|` +
        String.raw`provisioningCommands)|uploader\/|electron\/(?:main|preload|serialPort))`,
    );
    expect(modules.filter((path) => deviceLink.test(path))).toEqual([]);

    // Nor a node module that opens a socket or a port.
    const external = new Set<string>();
    for (const input of Object.values(metafile.inputs))
      for (const edge of input.imports)
        if (!edge.path.startsWith('.') && !edge.path.startsWith('/')) external.add(edge.path.replace(/^node:/, ''));
    for (const forbidden of [
      'net',
      'dgram',
      'tls',
      'http',
      'https',
      'http2',
      'serialport',
      '@serialport/bindings-cpp',
      'ws',
      'usb',
      'worker_threads',
      'cluster',
    ]) {
      expect(external.has(forbidden), `the MCP graph imports '${forbidden}'`).toBe(false);
    }

    // The artifact itself: no Web Serial entry point and no port opener in what a client runs.
    const text = await built.outputs[0]!.text();
    for (const primitive of ['navigator.serial', 'requestPort', 'SerialPort', 'serialport', 'createConnection', 'dgram']) {
      expect(text.includes(primitive), `the bundle mentions '${primitive}'`).toBe(false);
    }

    // Processes: the graph spawns the repository's own tools and nothing else, and every command is an entry of
    // the closed list of shared/spawnAllowList.ts (IDE-017): the local cross-build, the stateless runs of the
    // host runtime for a scenario (toolApi), and the supervisor of that host runtime, which Studio's simulation
    // shares. A module that imports child_process, or asks the list, and is not named here is a new way out and
    // must be added on purpose.
    // (an edge is the specifier as written or the resolved absolute path, so the list is matched by its file name)
    const importing = (target: RegExp) =>
      modules.filter((path) => metafile.inputs[path]!.imports.some((edge) => target.test(edge.path))).sort();
    expect(importing(/^(?:node:)?child_process$/)).toEqual(['shared/spawnAllowList.ts', 'src/cli/firmwareBuildRunner.ts']);
    expect(importing(/(?:^|[\\/])spawnAllowList(?:\.(?:js|ts))?$/)).toEqual([
      'shared/nativeSimulationSupervisor.ts',
      'src/cli/firmwareBuildRunner.ts',
      'src/cli/toolApiToolchain.ts',
    ]);
  });

  test('running the tools and reading the resources opens no socket, port or datagram', async () => {
    const root = await workspace();
    const bound = await openMcpWorkspace(root);
    expect(bound).toBeDefined();
    const touched = await withLinkTraps(async () => {
      const dispatch = createMcpDispatcher(bound!);
      const signal = new AbortController().signal;
      for (const tool of [
        'project_inspect',
        'project_validate',
        'compiler_check',
        'compiler_compile',
        'symbols_list',
        'safety_check',
        'plant_inspect',
        'scenarios_list',
        'server_self_check',
      ] as const) {
        const result = await dispatch(tool, {}, signal);
        expect(result.isError ?? false, `${tool}: ${JSON.stringify(result.structuredContent)}`).toBe(false);
      }
      // the check and the write of a project file (AIX-011) open nothing either
      const files = [{ path: 'src/Extra.st', content: 'PROGRAM Extra\nEND_PROGRAM\n' }];
      for (const tool of ['workspace_check_write', 'workspace_write'] as const) {
        const result = await dispatch(tool, { files }, signal);
        expect(result.isError ?? false, `${tool}: ${JSON.stringify(result.structuredContent)}`).toBe(false);
      }
      const { resources } = await registered();
      for (const resource of resources.filter((entry) => typeof entry.uri === 'string' && !(entry.uri as string).includes('progress'))) {
        const out = await resource.read(new URL(resource.uri as string), {}, { mcpReq: { signal } });
        expect(out.contents.length).toBeGreaterThan(0);
      }
    });
    expect(touched).toEqual([]);
  });

  // AIX-014 and AGENTS.md rule 8: the six debug tools run a private host runtime over its stdio pipes, with the plant of the
  // scene in this process; with every way out to a socket, a datagram or a serial port poisoned, none of them is touched
  itNative('the six debug tools, with a scene attached, open no socket, port or datagram', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-link-'));
    temporary.push(root);
    await cp(fileURLToPath(new URL('../../projects/plant_belt_to_sensor/', import.meta.url)), root, { recursive: true });
    const bound = await openMcpWorkspace(root);
    const saved = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
    const answers: unknown[] = [];
    try {
      const touched = await withLinkTraps(async () => {
        const dispatch = createMcpDispatcher(bound!);
        const signal = new AbortController().signal;
        const call = async (tool: (typeof MCP_TOOL_NAMES)[number], args: Record<string, unknown>) => {
          const result = await dispatch(tool, args, signal);
          answers.push(result.structuredContent);
          expect(result.isError ?? false, `${tool}: ${JSON.stringify(result.structuredContent)}`).toBe(false);
          return result.structuredContent as Record<string, unknown>;
        };
        const { sessionId } = await call('debug_session_start', { withScene: 'always' });
        const location = { file: 'src/BeltToSensor.st', line: 22 };
        await call('debug_breakpoints', { sessionId, action: 'set', locations: [location] });
        await call('debug_set_inputs', { sessionId, plantActions: [{ kind: 'operate', signal: 'StartButton.pressed', value: true }] });
        await call('debug_step', { sessionId, mode: 'continue', maxCycles: 10, watch: ['BeltToSensor.Running'], includeFacts: true });
        await call('debug_inspect', { sessionId });
        await call('debug_session_stop', { sessionId });
      });
      expect(touched).toEqual([]);
      expect(answers).toHaveLength(6);
    } finally {
      if (saved === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = saved;
    }
  });

  // AIX-007 and AGENTS.md rule 8: the self-check only looks at files; it starts no process, so no board, flash, deploy or port.
  test('server_self_check and zplc-mcp --self-check start no process and open no socket', async () => {
    const root = await workspace();
    const bound = await openMcpWorkspace(root);
    const started: string[] = [];
    const childProcess = (await import('node:child_process')).default as unknown as Record<string, unknown>;
    const bunRecord = Bun as unknown as Record<string, unknown>;
    const names = ['spawn', 'spawnSync', 'exec', 'execFile', 'execSync', 'execFileSync', 'fork'] as const;
    const saved = Object.fromEntries(names.map((name) => [name, childProcess[name]]));
    const savedBun = { spawn: bunRecord.spawn, spawnSync: bunRecord.spawnSync, connect: bunRecord.connect };
    const savedNet = net.connect;
    const trap = (what: string) => () => {
      started.push(what);
      throw new Error(`self-check started ${what}`);
    };
    for (const name of names) childProcess[name] = trap(`child_process.${name}`);
    bunRecord.spawn = trap('Bun.spawn');
    bunRecord.spawnSync = trap('Bun.spawnSync');
    bunRecord.connect = trap('Bun.connect');
    net.connect = trap('net.connect') as never;
    const stdout = process.stdout.write;
    try {
      const result = await createMcpDispatcher(bound!)('server_self_check', {}, new AbortController().signal);
      expect(result.isError ?? false).toBe(false);
      process.stdout.write = (() => true) as never;
      const { runMcpEntrypoint } = await import('./index');
      await runMcpEntrypoint(['--workspace', root, '--self-check']);
    } finally {
      process.stdout.write = stdout;
      Object.assign(childProcess, saved);
      Object.assign(bunRecord, savedBun);
      net.connect = savedNet;
    }
    expect(started).toEqual([]);
  });

  // HIL-003 and HIL-012: the hardware scenario run and the bench commands are started by a person, through a
  // command, and exit with an error when there is no interactive terminal (stdin here is not one). A serial port
  // may not be opened by any of them in this run (ZPLC_HIL_FORBID_SERIAL).
  test('the hardware scenario and bench commands (HIL-003, HIL-012) exit with an error without an interactive terminal', () => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    const python = Bun.which('python3');
    const project = join(root, 'packages/zplc-ide/projects/motor_start_stop');
    const commands: string[][] = [
      [
        process.execPath,
        join(root, 'packages/zplc-hil/src/cli.ts'),
        'run',
        '--board',
        'rpi_pico',
        '--workspace',
        project,
        '--scenario',
        join(project, 'tests/motor-start-stop.scenario.json'),
      ],
      ...(python
        ? [
            [python, '-B', join(root, 'tools/hil/run_chain.py'), 'rpi_pico'],
            [python, '-B', join(root, 'tools/hil/compare_sim.py'), 'rpi_pico'],
          ]
        : []),
    ];
    expect(commands.length).toBe(3);
    const env = { ...process.env, ZPLC_HIL_FORBID_SERIAL: '1', ZPLC_SERIAL_PORT: '' };
    for (const command of commands) {
      const done = Bun.spawnSync(command, { cwd: root, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
      expect({
        command: command.slice(1, 3).join(' '),
        exit: done.exitCode,
        says: done.stderr.toString().includes('interactive terminal'),
      }).toEqual({ command: command.slice(1, 3).join(' '), exit: 2, says: true });
    }
  }, 60_000);
});
