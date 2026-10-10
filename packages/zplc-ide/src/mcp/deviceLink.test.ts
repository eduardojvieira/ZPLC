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
// (a child process that exits) and a local cross-build: both are listed below by the module that spawns them.
// The hardware scenario and bench commands of HIL-003 and HIL-012 are not in the tree yet; their test is the
// todo at the end of this file and is the other half of COM-030.
import { afterEach, describe, expect, test } from 'bun:test';
import dgram from 'node:dgram';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { McpServer } from '@modelcontextprotocol/server';
import { buildMcpServer, createMcpDispatcher, MCP_RESOURCE_URIS, MCP_TOOL_NAMES, openMcpWorkspace } from './server';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-link-')); temporary.push(root);
  await mkdir(join(root, 'src')); await mkdir(join(root, 'tests'));
  await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'MCP link', version: '1.0.0', target: { board: 'posix' }, tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }] }));
  await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  return root;
}

interface Registered { tools: Array<{ name: string; inputSchema: { shape: Record<string, unknown>; safeParse: (value: unknown) => { success: boolean } }; annotations: Record<string, unknown> }>; resources: Array<{ name: string; uri: string | { uriTemplate: { toString(): string } }; read: (...args: unknown[]) => Promise<{ contents: Array<{ text: string }> }> }> }

/** Builds the real server and returns what it registered, read from the registration calls themselves. */
async function registered(): Promise<Registered> {
  const root = await workspace();
  const bound = await openMcpWorkspace(root);
  expect(bound).toBeDefined();
  const record: Registered = { tools: [], resources: [] };
  const proto = McpServer.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const registerTool = proto.registerTool; const registerResource = proto.registerResource;
  proto.registerTool = function (this: unknown, name: string, config: Registered['tools'][number], callback: unknown) {
    record.tools.push({ name, inputSchema: config.inputSchema, annotations: config.annotations });
    return registerTool.call(this, name, config, callback);
  } as never;
  proto.registerResource = function (this: unknown, name: string, uri: Registered['resources'][number]['uri'], config: unknown, read: Registered['resources'][number]['read']) {
    record.resources.push({ name, uri, read });
    return registerResource.call(this, name, uri, config, read);
  } as never;
  try { buildMcpServer(bound!); } finally { proto.registerTool = registerTool; proto.registerResource = registerResource; }
  return record;
}

describe('COM-030: the MCP server cannot open the device link', () => {
  test('the registered tools and resources are the fixed list, and none takes a device argument', async () => {
    const { tools, resources } = await registered();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    const staticUris = resources.filter((resource) => typeof resource.uri === 'string').map((resource) => resource.uri as string);
    expect(staticUris.sort()).toEqual([...MCP_RESOURCE_URIS].sort());
    expect(resources.filter((resource) => typeof resource.uri !== 'string')).toHaveLength(2);

    // The only arguments any tool takes name a scenario, a position in a recorded trace, or a board profile.
    const allowed = new Set(['scenarioId', 'cursor', 'traceSha256', 'ideId']);
    for (const tool of tools) {
      for (const key of Object.keys(tool.inputSchema.shape)) expect(allowed.has(key), `${tool.name} takes '${key}'`).toBe(true);
      // And an argument that names a port, a device or a session is refused, whatever else is supplied.
      const base = tool.name.startsWith('simulation_step') || tool.name === 'runtime_snapshot'
        ? { scenarioId: 'smoke', cursor: 0, traceSha256: 'a'.repeat(64) }
        : tool.name === 'firmware_build' ? { ideId: 'posix' }
          : ['scenario_run', 'simulation_start', 'trace_get'].includes(tool.name) ? { scenarioId: 'smoke' } : {};
      for (const extra of ['port', 'serialPort', 'device', 'baud', 'host', 'address', 'session', 'deploy', 'command']) {
        expect(tool.inputSchema.safeParse({ ...base, [extra]: 'x' }).success, `${tool.name} accepted '${extra}'`).toBe(false);
      }
    }
    // Nothing the server offers writes to a device: one tool is not read-only (a local cross-build) and none
    // reaches outside the workspace and the repository.
    expect(tools.filter((tool) => tool.annotations.readOnlyHint !== true).map((tool) => tool.name)).toEqual(['firmware_build']);
    expect(tools.every((tool) => tool.annotations.openWorldHint === false)).toBe(true);
  });

  test('the module graph of the MCP entry point holds no serial, upload or socket module', async () => {
    const built = await Bun.build({ entrypoints: [join(import.meta.dir, 'index.ts')], target: 'bun', minify: false, metafile: true } as never);
    expect(built.success).toBe(true);
    const metafile = (built as unknown as { metafile: { inputs: Record<string, { imports: Array<{ path: string; external?: boolean; kind: string }> }> } }).metafile;
    const modules = Object.keys(metafile.inputs);
    expect(modules.length).toBeGreaterThan(20);

    // The modules of the IDE that talk to a device: the Web Serial and node serial back ends, the link
    // manager, the upload and deploy protocol, the handshake, and the Electron main process that owns the
    // port selection. None of them is in the graph.
    const deviceLink = /(?:^|\/)(?:runtime\/(?:serialAdapter|serialConsole|connectionManager|deviceHandshake|uploadProtocol|uploadTrace|provisioningCommands)|uploader\/|electron\/(?:main|preload|serialPortSelection))/;
    expect(modules.filter((path) => deviceLink.test(path))).toEqual([]);

    // Nor a node module that opens a socket or a port.
    const external = new Set<string>();
    for (const input of Object.values(metafile.inputs)) for (const edge of input.imports) if (!edge.path.startsWith('.') && !edge.path.startsWith('/')) external.add(edge.path.replace(/^node:/, ''));
    for (const forbidden of ['net', 'dgram', 'tls', 'http', 'https', 'http2', 'serialport', '@serialport/bindings-cpp', 'ws', 'usb', 'worker_threads', 'cluster']) {
      expect(external.has(forbidden), `the MCP graph imports '${forbidden}'`).toBe(false);
    }

    // The artifact itself: no Web Serial entry point and no port opener in what a client runs.
    const text = await built.outputs[0]!.text();
    for (const primitive of ['navigator.serial', 'requestPort', 'SerialPort', 'serialport', 'createConnection', 'dgram']) {
      expect(text.includes(primitive), `the bundle mentions '${primitive}'`).toBe(false);
    }

    // Processes: the graph spawns the repository's own tools and nothing else: the local cross-build, the
    // stateless runs of the host runtime for a scenario (toolApi), and the supervisor of that host runtime,
    // which Studio's simulation shares. A fourth spawner would be a new way out and must be added here on
    // purpose.
    const spawners = modules.filter((path) => metafile.inputs[path]!.imports.some((edge) => edge.path.replace(/^node:/, '') === 'child_process')).sort();
    expect(spawners).toEqual(['electron/nativeSimulationSupervisor.ts', 'src/cli/firmwareBuildRunner.ts', 'src/cli/toolApi.ts']);
  });

  test('running the tools and reading the resources opens no socket, port or datagram', async () => {
    const root = await workspace();
    const bound = await openMcpWorkspace(root);
    expect(bound).toBeDefined();

    const touched: string[] = [];
    const trap = (what: string) => () => { touched.push(what); throw new Error(`device link touched: ${what}`); };
    const originalNet = net.Socket.prototype.connect; const originalDgram = dgram.createSocket; const originalTls = tls.connect; const originalNetConnect = net.connect;
    const serial = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const bunRecord = Bun as unknown as Record<string, unknown>;
    const originalBun = { connect: bunRecord.connect, listen: bunRecord.listen, udpSocket: bunRecord.udpSocket };
    net.Socket.prototype.connect = trap('net.Socket.connect') as never;
    net.connect = trap('net.connect') as never;
    (dgram as unknown as Record<string, unknown>).createSocket = trap('dgram.createSocket');
    (tls as unknown as Record<string, unknown>).connect = trap('tls.connect');
    bunRecord.connect = trap('Bun.connect'); bunRecord.listen = trap('Bun.listen'); bunRecord.udpSocket = trap('Bun.udpSocket');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serial: new Proxy({}, { get: trap('navigator.serial'), has: trap('navigator.serial') }) } });
    try {
      const dispatch = createMcpDispatcher(bound!);
      const signal = new AbortController().signal;
      for (const tool of ['project_inspect', 'project_validate', 'compiler_check', 'compiler_compile', 'symbols_list', 'safety_check'] as const) {
        const result = await dispatch(tool, {}, signal);
        expect(result.isError ?? false, `${tool}: ${JSON.stringify(result.structuredContent)}`).toBe(false);
      }
      const { resources } = await registered();
      for (const resource of resources.filter((entry) => typeof entry.uri === 'string' && !(entry.uri as string).includes('progress'))) {
        const out = await resource.read(new URL(resource.uri as string), {}, { mcpReq: { signal } });
        expect(out.contents.length).toBeGreaterThan(0);
      }
    } finally {
      net.Socket.prototype.connect = originalNet as never; net.connect = originalNetConnect;
      (dgram as unknown as Record<string, unknown>).createSocket = originalDgram; (tls as unknown as Record<string, unknown>).connect = originalTls;
      Object.assign(bunRecord, originalBun);
      if (serial) Object.defineProperty(globalThis, 'navigator', serial); else delete (globalThis as Record<string, unknown>).navigator;
    }
    expect(touched).toEqual([]);
  });

  // HIL-003 and HIL-012: the hardware scenario run and the bench command are started by a person, through a
  // command, and exit with an error when there is no interactive terminal. Neither command is in the tree
  // (tools/hil holds device scripts of the shell grammar only), so there is nothing to start without a
  // terminal yet; this is the test that goes here when they land.
  test.todo('the hardware scenario and bench commands (HIL-003, HIL-012) exit with an error without an interactive terminal', () => {});
});
