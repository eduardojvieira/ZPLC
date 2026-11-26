// The read tools and resources an agent uses to learn the open project before it changes anything (AIX-001, AIX-007,
// AIX-008, AIX-013): the plant scene and its map, the scenarios, the six file formats, a self-check of the server, plain
// descriptions and the server's instructions. Every answer is bounded (MCP_CONTEXT_CAPS) and stays under MAX_OUTPUT_BYTES.
import { afterEach, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { FORMATS } from '../formats';
import { runMcpEntrypoint } from './index';
import { MCP_CONTEXT_CAPS } from './resources';
import {
  MAX_OUTPUT_BYTES,
  MCP_BOUNDARY,
  MCP_PROMPT_NAMES,
  MCP_RESOURCE_TEMPLATES,
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
  buildMcpServer,
  createMcpDispatcher,
  openMcpWorkspace,
  type McpOperations,
  type McpWorkspace,
} from './server';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function copyProject(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-read-'));
  temporary.push(root);
  await cp(fileURLToPath(new URL(`../../projects/${name}`, import.meta.url)), root, { recursive: true });
  return root;
}

async function plain(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-read-'));
  temporary.push(root);
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tests'));
  await writeFile(
    join(root, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: 'Plain',
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
    }),
  );
  await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nVAR_OUTPUT Run : BOOL; END_VAR\nEND_PROGRAM\n');
  return root;
}

async function bind(root: string): Promise<McpWorkspace> {
  const bound = await openMcpWorkspace(root);
  expect(bound).toBeDefined();
  return bound!;
}

const signal = () => new AbortController().signal;
/** The JSON answer of a tool, read by path: each test asserts the fields it reads. */
const answer = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0]!.text);

/** Builds the real server and returns its registered resources and the options it was built with. */
function captured(workspace: McpWorkspace) {
  const proto = McpServer.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const original = { registerResource: proto.registerResource, registerTool: proto.registerTool, registerPrompt: proto.registerPrompt };
  const resources = new Map<
    string,
    { config: Record<string, unknown>; read: (...args: unknown[]) => Promise<{ contents: Array<{ text: string }> }> }
  >();
  const tools = new Map<string, Record<string, unknown>>();
  const prompts: string[] = [];
  proto.registerResource = function (this: unknown, name: string, uri: unknown, config: Record<string, unknown>, read: never) {
    resources.set(typeof uri === 'string' ? uri : name, { config, read });
    return original.registerResource.call(this, name, uri, config, read);
  } as never;
  proto.registerTool = function (this: unknown, name: string, config: Record<string, unknown>, callback: unknown) {
    tools.set(name, config);
    return original.registerTool.call(this, name, config, callback);
  } as never;
  proto.registerPrompt = function (this: unknown, name: string, ...rest: unknown[]) {
    prompts.push(name);
    return original.registerPrompt.call(this, name, ...rest);
  } as never;
  let server: McpServer;
  try {
    server = buildMcpServer(workspace);
  } finally {
    Object.assign(proto, original);
  }
  const read = async (key: string, uri = key) => {
    const resource = resources.get(key);
    expect(resource, key).toBeDefined();
    const out = await resource!.read(new URL(uri), uri === key ? {} : templateVariables(key, uri), { mcpReq: { signal: signal() } });
    expect(Buffer.byteLength(out.contents[0]!.text, 'utf8')).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    return JSON.parse(out.contents[0]!.text) as Record<string, unknown>;
  };
  return { server: server!, resources, tools, prompts, read };
}

function templateVariables(name: string, uri: string): Record<string, string> {
  if (name === 'project-scenario') return { scenarioId: uri.slice('zplc://project/scenario/'.length) };
  throw new Error(`no variables for ${name}`);
}

describe('AIX-001 plant_inspect reads the scene, its signals and the plant map with their binding to the program', () => {
  test('a scene project answers its parts, the signals the scene offers, the map and no binding problem', async () => {
    const result = await createMcpDispatcher(await bind(await copyProject('plant_belt_to_sensor')))('plant_inspect', {}, signal());
    expect(result.isError ?? false).toBe(false);
    const body = answer(result);
    expect(body.evidenceLevel).toBe('host-static');
    expect(body.summary.hasScene).toBe(true);
    expect(body.summary.hasPlantMap).toBe(true);
    expect(body.summary.scene.name).toBe('Belt to sensor');
    expect(body.summary.scene.parts.map((part: { name: string }) => part.name)).toEqual(['Belt1', 'Emitter1', 'EyeFar', 'StartButton']);
    // a part's configuration never reaches an agent (it may hold a credential)
    expect(JSON.stringify(body.summary.scene.parts)).not.toContain('speedMps');
    expect(body.summary.offeredSignals).toContainEqual({ name: 'Belt1.run', direction: 'command', type: 'BOOL' });
    expect(body.summary.offeredSignals).toContainEqual({ name: 'EyeFar.detect', direction: 'sensor', type: 'BOOL' });
    expect(body.summary.plantMap.signals).toContainEqual({
      name: 'Belt1.run',
      direction: 'command',
      type: 'BOOL',
      point: 'BeltToSensor.Run',
    });
    expect(body.summary.plantMap.bindingProblems).toEqual([]);
    expect(body.summary.factNames).toContain('itemsDropped');
  });

  test('a map point the compiled program does not have is a binding problem that names the signal and the point', async () => {
    const root = await copyProject('plant_belt_to_sensor');
    const map = JSON.parse(await readFile(join(root, 'plant-map.json'), 'utf8'));
    map.signals['Belt1.run'].point = 'BeltToSensor.Missing';
    await writeFile(join(root, 'plant-map.json'), JSON.stringify(map));
    const result = await createMcpDispatcher(await bind(root))('plant_inspect', {}, signal());
    const problems = answer(result).summary.plantMap.bindingProblems as string[];
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Belt1.run');
    expect(problems[0]).toContain('BeltToSensor.Missing');
  });

  test('a project without a scene answers ok with hasScene and hasPlantMap false', async () => {
    const result = await createMcpDispatcher(await bind(await plain()))('plant_inspect', {}, signal());
    expect(result.isError ?? false).toBe(false);
    expect(answer(result).summary).toMatchObject({ hasScene: false, hasPlantMap: false });
  });

  test(
    'a scene file named explicitly that does not exist is MCP_NOT_FOUND; a broken scene is MCP_VALIDATION_FAILED with its ' + 'place',
    async () => {
      const root = await copyProject('plant_belt_to_sensor');
      const dispatch = createMcpDispatcher(await bind(root));
      const missing = await dispatch('plant_inspect', { sceneFile: 'plant-scenes/other/scene.json' }, signal());
      expect(missing.isError).toBe(true);
      expect(missing.structuredContent).toMatchObject({ ok: false, error: 'MCP_NOT_FOUND' });
      await writeFile(
        join(root, 'scene.json'),
        JSON.stringify({ schemaVersion: 1, name: 'x', parts: [{ id: 'a', part: 'nope' }], cameras: [] }),
      );
      const broken = await dispatch('plant_inspect', {}, signal());
      expect(broken.isError).toBe(true);
      expect(broken.structuredContent).toMatchObject({ ok: false, error: 'MCP_VALIDATION_FAILED' });
      expect((answer(broken).diagnostics as Array<{ code: string }>)[0]!.code).toBe('SCENE_INVALID');
    },
  );
});

describe('AIX-001 scenarios_list and the scenario resources list each scenario and its expectations', () => {
  test('scenarios_list answers id, path, timing, scene and a summary of each expectation', async () => {
    const result = await createMcpDispatcher(await bind(await copyProject('plant_belt_to_sensor')))('scenarios_list', {}, signal());
    expect(result.isError ?? false).toBe(false);
    const body = answer(result);
    expect(body.evidenceLevel).toBe('host-static');
    expect(body.summary.count).toBe(1);
    expect(body.summary.scenarios[0]).toMatchObject({
      id: 'belt-to-sensor',
      path: 'tests/belt-to-sensor.scenario.json',
      tickMs: 10,
      durationMs: 8000,
      scene: 'scene.json',
      events: 0,
    });
    expect(body.summary.scenarios[0].expectations[1]).toEqual({
      kind: 'EVENTUALLY',
      fromMs: 0,
      withinMs: 8000,
      signals: ['fact:count:EyeFar'],
    });
  });

  test('zplc://project/scenario/{scenarioId} reads one scenario; an unknown id is MCP_NOT_FOUND with the valid ids', async () => {
    const { read } = captured(await bind(await copyProject('plant_belt_to_sensor')));
    const found = await read('project-scenario', 'zplc://project/scenario/belt-to-sensor');
    expect(found).toMatchObject({ ok: true, path: 'tests/belt-to-sensor.scenario.json', scenario: { id: 'belt-to-sensor', tickMs: 10 } });
    expect(await read('project-scenario', 'zplc://project/scenario/belt-1')).toEqual({
      ok: false,
      error: 'MCP_NOT_FOUND',
      validValues: ['belt-to-sensor'],
    });
  });

  test('zplc://project/scenarios, zplc://project/scene and zplc://project/plant-map answer what the tools answer', async () => {
    const { read } = captured(await bind(await copyProject('plant_belt_to_sensor')));
    expect(await read('zplc://project/scenarios')).toMatchObject({ ok: true, count: 1, scenarios: [{ id: 'belt-to-sensor' }] });
    expect(await read('zplc://project/scene')).toMatchObject({ ok: true, scene: { name: 'Belt to sensor' } });
    expect(await read('zplc://project/plant-map')).toMatchObject({ ok: true, plantMap: { bindingProblems: [] } });
    const none = captured(await bind(await plain()));
    expect(await none.read('zplc://project/scene')).toMatchObject({ ok: false, error: 'MCP_NOT_FOUND' });
  });
});

describe('AIX-001 the context an agent reads is bounded by MCP_CONTEXT_CAPS', () => {
  test('the caps are the ones below', () => {
    expect(MCP_CONTEXT_CAPS).toEqual({ listItems: 64, textChars: 256, objectKeys: 64, depth: 8 });
  });

  test('a scenario with more expectations, longer texts and more signals than the caps is cut and says truncated', async () => {
    const root = await plain();
    const long = 'L'.repeat(1000);
    const condition = Object.fromEntries(Array.from({ length: 70 }, (_, index) => [`Main.S${index}`, true]));
    await writeFile(
      join(root, 'tests', 'big.scenario.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: long.slice(0, 120),
        tickMs: 10,
        durationMs: 100,
        events: [],
        expectations: Array.from({ length: 80 }, () => ({ kind: 'AT', atMs: 0, condition })),
      }),
    );
    // the workspace reader takes at most 64 scenario files, as many as listItems
    for (let index = 0; index < 63; index += 1)
      await writeFile(
        join(root, 'tests', `s${index}.scenario.json`),
        JSON.stringify({ schemaVersion: 1, id: `s${index}`, tickMs: 10, durationMs: 10, events: [], expectations: [] }),
      );
    const result = await createMcpDispatcher(await bind(root))('scenarios_list', {}, signal());
    const body = answer(result);
    expect(body.truncated).toBe(true);
    expect(body.summary.count).toBe(64);
    expect(body.summary.scenarios.length).toBeLessThanOrEqual(MCP_CONTEXT_CAPS.listItems);
    const big = body.summary.scenarios.find((scenario: { path: string }) => scenario.path === 'tests/big.scenario.json');
    expect(big.id).toHaveLength(120);
    expect(big.expectations).toHaveLength(MCP_CONTEXT_CAPS.listItems);
    expect(big.expectations[0].signals).toHaveLength(MCP_CONTEXT_CAPS.listItems);
    expect(Buffer.byteLength(result.content[0]!.text, 'utf8')).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
  });

  test('a string longer than textChars is cut to textChars', async () => {
    const root = await plain();
    await writeFile(
      join(root, 'tests', 'x.scenario.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'x',
        tickMs: 10,
        durationMs: 10,
        events: [],
        expectations: [{ kind: 'AT', atMs: 0, condition: { ['M'.repeat(900)]: true } }],
      }),
    );
    const result = await createMcpDispatcher(await bind(root))('scenarios_list', {}, signal());
    const body = answer(result);
    expect(body.summary.scenarios[0].expectations[0].signals[0]).toHaveLength(MCP_CONTEXT_CAPS.textChars);
    expect(body.truncated).toBe(true);
  });
});

describe('AIX-013 zplc://formats/{id} serves the six format modules an agent writes', () => {
  test('each format resource carries its schema, its accepted values and its worked examples, under the output limit', async () => {
    const { read } = captured(await bind(await plain()));
    for (const format of FORMATS) {
      const body = await read(`zplc://formats/${format.id}`);
      expect(body.ok, format.id).toBe(true);
      expect(body.id).toBe(format.id);
      expect(body.filePattern).toBe(format.filePattern);
      expect(body.schema).toEqual(JSON.parse(JSON.stringify(format.schema)));
      expect(body.acceptedValues).toEqual(JSON.parse(JSON.stringify(format.acceptedValues)));
      expect((body.examples as unknown[]).length).toBe(format.examples.length);
    }
  });
});

describe('AIX-007 server_self_check and zplc-mcp --self-check report the folder, the tools and the boundary', () => {
  const refuse = new Proxy({} as McpOperations, {
    get: (_target, name) => () => {
      throw new Error(`the self-check called ${String(name)}`);
    },
  });

  test('server_self_check answers counts, protocols, the boundary and the simulator, and calls no operation', async () => {
    const root = await plain();
    const result = await createMcpDispatcher(await bind(root), refuse)('server_self_check', {}, signal());
    expect(result.isError ?? false).toBe(false);
    const body = answer(result);
    expect(body.evidenceLevel).toBe('repository-metadata');
    expect(body.summary).toMatchObject({
      workspaceName: 'Plain',
      workspaceValid: true,
      hasRepository: false,
      hasUserData: false,
      toolCount: MCP_TOOL_NAMES.length,
      resourceCount: MCP_RESOURCE_URIS.length + MCP_RESOURCE_TEMPLATES.length,
      boundary: MCP_BOUNDARY,
    });
    expect(body.summary.protocolsServed).toEqual(expect.arrayContaining(['2026-07-28', '2025-11-25']));
    expect(typeof body.summary.nativeSimulatorReady).toBe('boolean');
    // a tool answer confirms the folder by the project's name, never by its path
    expect(result.content[0]!.text).not.toContain(root);
  });

  test('the counts are 18 tools and 22 fixed resources plus 4 templates', () => {
    expect(MCP_TOOL_NAMES.length).toBe(18);
    expect(MCP_RESOURCE_URIS.length).toBe(22);
    expect(MCP_RESOURCE_TEMPLATES.length).toBe(4);
  });

  async function selfCheck(args: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const stdout = process.stdout.write;
    const stderr = process.stderr.write;
    process.stdout.write = ((chunk: string) => out.push(String(chunk)) > 0) as never;
    process.stderr.write = ((chunk: string) => err.push(String(chunk)) > 0) as never;
    try {
      const code = await runMcpEntrypoint(args);
      return { code, out: out.join(''), err: err.join('') };
    } finally {
      process.stdout.write = stdout;
      process.stderr.write = stderr;
    }
  }

  test('--self-check prints the folder, the tool count, the protocols and the boundary, and exits with 0 when ready', async () => {
    const root = await plain();
    const previous = process.env.ZPLC_NATIVE_SIM_BIN;
    const fake = join(root, 'zplc_runtime');
    await writeFile(fake, '');
    process.env.ZPLC_NATIVE_SIM_BIN = fake;
    try {
      const done = await selfCheck(['--workspace', root, '--self-check']);
      expect(done.code).toBe(0);
      const report = JSON.parse(done.out);
      expect(report).toMatchObject({
        ready: true,
        folder: root,
        workspaceName: 'Plain',
        toolCount: 18,
        boundary: MCP_BOUNDARY,
        problems: [],
      });
      expect(report.protocolsServed).toEqual(expect.arrayContaining(['2026-07-28', '2025-11-25']));
      expect(report.nativeSimulatorReady).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = previous;
    }
  });

  test('--self-check on a folder that is not a project, or without the simulator, exits with 1 and says why and what to do', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'zplc-mcp-read-'));
    temporary.push(empty);
    const bad = await selfCheck(['--workspace', empty, '--self-check']);
    expect(bad.code).toBe(1);
    const report = JSON.parse(bad.out);
    expect(report.ready).toBe(false);
    expect(report.problems[0].cause).toContain('zplc.json');
    expect(report.problems[0].nextStep.length).toBeGreaterThan(10);

    const root = await plain();
    const previous = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = join(root, 'no-such-runtime');
    try {
      const missing = await selfCheck(['--workspace', root, '--self-check']);
      expect(missing.code).toBe(1);
      const why = JSON.parse(missing.out);
      expect(why.nativeSimulatorReady).toBe(false);
      expect(why.problems.map((problem: { nextStep: string }) => problem.nextStep).join(' ')).toContain('ZPLC_NATIVE_SIM_BIN');
    } finally {
      if (previous === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = previous;
    }
  });
});

describe('AIX-008 every tool and resource says in plain words what it returns, and the server tells an agent how to work', () => {
  test('every tool description and every resource description is a plain sentence of some length', async () => {
    const { tools, resources } = captured(await bind(await plain()));
    expect([...tools.keys()].sort()).toEqual([...MCP_TOOL_NAMES].sort());
    for (const [name, config] of tools) {
      expect(String(config.description).length, name).toBeGreaterThanOrEqual(60);
      expect(String(config.description), name).toMatch(/\.$/);
    }
    for (const [uri, { config }] of resources) {
      expect(String(config.description ?? '').length, uri).toBeGreaterThanOrEqual(40);
      expect(String(config.title), uri).not.toMatch(/^zplc:\/\//);
    }
  });

  test('the instructions name the order of work, the formats, the evidence level and the 2.0 boundary of AGENTS.md rule 8', async () => {
    const { server } = captured(await bind(await plain()));
    const instructions = String((server.server as unknown as { _instructions?: string })._instructions ?? '');
    for (const part of [
      'project_inspect',
      'plant_inspect',
      'scenarios_list',
      'zplc://formats/',
      'compiler_check',
      'scenario_run',
      'evidenceLevel',
      MCP_BOUNDARY,
    ])
      expect(instructions, part).toContain(part);
    // the proposed rule 8 sentence for private simulators waits for the owner (plan-aix §2.1a)
    expect(instructions).not.toMatch(/private (host )?simulat|set inputs and step/i);
  });

  test('the registered prompts are the closed list', async () => {
    const { prompts } = captured(await bind(await plain()));
    expect(prompts).toEqual([...MCP_PROMPT_NAMES]);
  });

  test('every successful tool result states its evidence level once, at the top', async () => {
    const dispatch = createMcpDispatcher(await bind(await plain()));
    for (const tool of ['project_inspect', 'project_validate', 'compiler_check', 'symbols_list', 'safety_check'] as const) {
      const result = await dispatch(tool, {}, signal());
      expect((result.structuredContent as Record<string, unknown>).evidenceLevel, tool).toBe('host-static');
      expect(result.content[0]!.text.match(/"evidenceLevel"/g), tool).toHaveLength(1);
    }
  });
});

describe('AIX-007 AIX-008 review advisories: cut errors say so, the catalogue is checked, arguments are described', () => {
  test('a plant map with 300 bad signals answers 64 diagnostics and truncated: true, from the tool and the resource', async () => {
    const root = await copyProject('plant_belt_to_sensor');
    const signals = Object.fromEntries(
      Array.from({ length: 300 }, (_, index) => [`Bad${index}.x`, { direction: 'up', type: 'BOOL', point: 'A.B' }]),
    );
    await writeFile(join(root, 'plant-map.json'), JSON.stringify({ schemaVersion: 2, target: { scene: 'belt-to-sensor' }, signals }));
    const workspace = await bind(root);
    const result = await createMcpDispatcher(workspace)('plant_inspect', {}, signal());
    const body = answer(result);
    expect(body.error).toBe('MCP_VALIDATION_FAILED');
    expect(body.diagnostics).toHaveLength(MCP_CONTEXT_CAPS.listItems);
    expect(body.truncated).toBe(true);
    const resource = await captured(workspace).read('zplc://project/plant-map');
    expect(resource).toMatchObject({ ok: false, error: 'MCP_VALIDATION_FAILED', truncated: true });
  });

  test('a scene part the catalogue does not have is a located SCENE_INVALID diagnostic', async () => {
    const root = await copyProject('plant_belt_to_sensor');
    const scene = JSON.parse(await readFile(join(root, 'scene.json'), 'utf8'));
    scene.parts[0].part = 'nope';
    await writeFile(join(root, 'scene.json'), JSON.stringify(scene));
    const body = answer(await createMcpDispatcher(await bind(root))('plant_inspect', {}, signal()));
    expect(body.error).toBe('MCP_VALIDATION_FAILED');
    expect(body.diagnostics[0]).toMatchObject({ code: 'SCENE_INVALID', path: 'scene.json' });
    expect(body.diagnostics[0].message).toContain('parts[0].part');
  });

  test('every argument of plant_inspect says what it is', async () => {
    const { tools } = captured(await bind(await plain()));
    const shape = (tools.get('plant_inspect')!.inputSchema as { shape: Record<string, { description?: string }> }).shape;
    for (const key of ['sceneFile', 'mapFile']) expect(String(shape[key]!.description ?? '').length, key).toBeGreaterThanOrEqual(30);
  });

  test(
    '--self-check with a relative workspace path answers the JSON report with the cause and the next step, and exits with ' + '1',
    async () => {
      const out: string[] = [];
      const stdout = process.stdout.write;
      const stderr = process.stderr.write;
      process.stdout.write = ((chunk: string) => out.push(String(chunk)) > 0) as never;
      process.stderr.write = (() => true) as never;
      let code: number;
      try {
        code = await runMcpEntrypoint(['--workspace', 'projects/blinky', '--self-check']);
      } finally {
        process.stdout.write = stdout;
        process.stderr.write = stderr;
      }
      expect(code).toBe(1);
      const report = JSON.parse(out.join(''));
      expect(report.ready).toBe(false);
      expect(report.problems[0].cause).toContain('absolute path');
      expect(report.problems[0].nextStep).toContain('--workspace');
    },
  );
});
