// AIX-014 (unit AIX-U9, plan-aix §7): the private simulation debugger. A debug session is a host runtime the MCP server starts
// for the agent alone: it stops at a breakpoint in every language, steps, takes inputs and plant actions, answers variables,
// function block members, SFC steps and plant facts by name, holds at most two sessions per connection for 300 s of idleness,
// keeps each session to itself, and leaves no process behind. Everything goes through the tools as a client calls them.
import { afterAll, afterEach, beforeAll, describe, expect } from 'bun:test';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { LEARN_POLICY_FILENAME } from '../../shared/learnPolicyModel';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { McpDebugSessionManager } from './debugSession';
import * as toolApi from '../cli/toolApi';
import { buildMcpServer, createMcpDispatcher, MCP_TOOL_NAMES, openMcpUserData, openMcpWorkspace, type McpWorkspace } from './server';

const projects = fileURLToPath(new URL('../../projects/', import.meta.url));
const temporary: string[] = [];
const savedBinary = process.env.ZPLC_NATIVE_SIM_BIN;
beforeAll(() => {
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
});
afterAll(() => {
  if (savedBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
  else process.env.ZPLC_NATIVE_SIM_BIN = savedBinary;
});
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

/** A copy of a bundled project, or a new one-program ST project. */
async function project(name: string): Promise<McpWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-debug-'));
  temporary.push(root);
  await cp(join(projects, name), root, { recursive: true });
  return (await openMcpWorkspace(root))!;
}

async function stProject(source: string, tasks = 1): Promise<McpWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-debug-'));
  temporary.push(root);
  await mkdir(join(root, 'src'));
  const programs = Array.from({ length: tasks }, (_, index) => (index === 0 ? 'Main.st' : `Other${index}.st`));
  await writeFile(
    join(root, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: 'Debug',
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: programs.map((program, index) => ({
        name: `T${index}`,
        trigger: 'cyclic',
        interval_ms: 10,
        priority: index + 1,
        programs: [program],
      })),
    }),
  );
  await writeFile(join(root, 'src', 'Main.st'), source);
  for (const program of programs.slice(1))
    await writeFile(join(root, 'src', program), `PROGRAM ${program.slice(0, -3)}\nVAR n : INT; END_VAR\nn := n + 1;\nEND_PROGRAM\n`);
  return (await openMcpWorkspace(root))!;
}

// a tool answer as JSON, read by the assertions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Answer = Record<string, any>;
function client(workspace: McpWorkspace, manager?: McpDebugSessionManager) {
  const dispatch = createMcpDispatcher(workspace, toolApi, manager);
  const signal = new AbortController().signal;
  return async (tool: string, args: Record<string, unknown> = {}): Promise<Answer> => {
    const result = await dispatch(tool as never, args, signal);
    expect(result.content[0]!.text).toBe(JSON.stringify(result.structuredContent));
    expect(result.isError === true).toBe(result.structuredContent.ok !== true);
    return result.structuredContent as Answer;
  };
}

/** The host runtimes this test process started that still run (ps; Windows has no ps and answers none). */
function runtimeChildren(): number[] {
  if (process.platform === 'win32') return [];
  const out = Bun.spawnSync(['ps', '-A', '-o', 'ppid=,pid=,args=']).stdout.toString();
  return out
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([ppid, , command]) => Number(ppid) === process.pid && command !== undefined && basename(command) === basename(nativeRuntimeBinary),
    )
    .map(([, pid]) => Number(pid));
}

async function settled(check: () => boolean, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  while (!check() && Date.now() < until) await Bun.sleep(25);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// x, y and z are written on lines 3, 4 and 5: a stop at line 4 has x written and y not yet
const COUNTER = 'PROGRAM Main\nVAR x : INT; y : INT; z : INT; END_VAR\nx := x + 1;\ny := x * 2;\nz := z + 1;\nEND_PROGRAM\n';
const IO =
  'PROGRAM Main\nVAR_INPUT\n  Start AT %I0.0 : BOOL;\n  Level AT %IW2 : INT;\nEND_VAR\nVAR_OUTPUT\n  Lamp AT %Q0.0 : BOOL;\n  ' +
  'Twice AT %QW2 : INT;\nEND_VAR\nVAR\n  Delay : TON;\nEND_VAR\nDelay(IN := Start, PT := T#50ms);\n' +
  'Lamp := Delay.Q;\nTwice := Level * 2;\nEND_PROGRAM\n';

describe('AIX-014 a breakpoint stops a private session at its element, in each of the five languages', () => {
  // one element of each kind of place the author names: a line of ST and IL, a rung cell of LD, a block of FBD, a step of SFC
  const cases = [
    { project: 'blinky_st', file: 'src/main.st', element: 'line:29' },
    { project: 'blinky_il', file: 'src/main.il', element: 'line:35' },
    { project: 'blinky', file: 'src/main.ld.json', element: 'rung:rung_1' },
    { project: 'blinky_fbd', file: 'src/main.fbd.json', element: 'block:ton_on' },
    { project: 'blinky_sfc', file: 'src/main.sfc.json', element: 'step:step_led_on' },
  ];
  for (const place of cases)
    itNative(`${place.file}: ${place.element}`, async () => {
      const call = client(await project(place.project));
      const started = await call('debug_session_start');
      expect(started).toMatchObject({
        ok: true,
        evidenceLevel: 'host-simulation',
        atMs: 0,
        cycles: 0,
        state: 'idle',
        sceneAttached: false,
        idleTimeoutSec: 300,
      });
      const { sessionId } = started;
      const location = place.element.startsWith('line:')
        ? { file: place.file, line: Number(place.element.slice(5)) }
        : { file: place.file, element: place.element };
      const armed = await call('debug_breakpoints', { sessionId, action: 'set', locations: [location] });
      expect(armed).toMatchObject({ ok: true, breakpoints: [{ file: place.file, element: place.element, active: true }] });
      const pc = armed.breakpoints[0].pc;
      const stopped = await call('debug_step', { sessionId, mode: 'continue', maxCycles: 5000 });
      expect(stopped).toMatchObject({
        ok: true,
        stopReason: 'breakpoint',
        state: 'paused',
        location: { file: place.file, element: place.element, pc },
      });
      await call('debug_session_stop', { sessionId });
    });
});

describe('AIX-014 step, continue, inputs and plant actions', () => {
  itNative('a stop is mid-scan: x is written and y not yet; one more cycle ends the scan, continue stops at the next scan', async () => {
    const call = client(await stProject(COUNTER));
    const { sessionId, scanIntervalMs } = await call('debug_session_start');
    expect(scanIntervalMs).toBe(10);
    await call('debug_breakpoints', { sessionId, action: 'set', locations: [{ file: 'src/Main.st', line: 4 }] });
    const held = await call('debug_step', { sessionId, watch: ['Main.x', 'Main.y'] });
    expect(held).toMatchObject({ stopReason: 'breakpoint', cycles: 0, cyclesExecuted: 0, values: { 'Main.x': 1, 'Main.y': 0 } });
    expect(held.location).toMatchObject({ file: 'src/Main.st', line: 4, element: 'line:4' });
    const ended = await call('debug_breakpoints', { sessionId, action: 'clear' });
    expect(ended.breakpoints).toEqual([]);
    const stepped = await call('debug_step', { sessionId, cycles: 2, watch: ['Main.y', 'Main.z'] });
    expect(stepped).toMatchObject({
      stopReason: 'stepped',
      state: 'idle',
      cycles: 2,
      atMs: 20,
      cyclesExecuted: 2,
      values: { 'Main.y': 4, 'Main.z': 2 },
    });
    expect(stepped.location).toBeUndefined();
    await call('debug_breakpoints', { sessionId, action: 'add', locations: [{ file: 'src/Main.st', element: 'line:5' }] });
    const next = await call('debug_step', { sessionId, mode: 'continue' });
    expect(next).toMatchObject({ stopReason: 'breakpoint', cycles: 2, location: { element: 'line:5' } });
    const ms = await call('debug_step', { sessionId, mode: 'ms', durationMs: 30, watch: ['Main.z'] });
    // the held scan ends first and the next scan holds again at line 5
    expect(ms).toMatchObject({ stopReason: 'breakpoint', cycles: 3, cyclesExecuted: 1 });
    await call('debug_breakpoints', { sessionId, action: 'remove', locations: [{ file: 'src/Main.st', line: 5 }] });
    expect(await call('debug_step', { sessionId, mode: 'ms', durationMs: 30 })).toMatchObject({
      stopReason: 'stepped',
      cycles: 6,
      atMs: 60,
    });
    await call('debug_session_stop', { sessionId });
  });

  itNative('inputs set by name drive the program, and a value of the wrong type is refused', async () => {
    const call = client(await stProject(IO));
    const { sessionId } = await call('debug_session_start');
    const staged = await call('debug_set_inputs', { sessionId, inputs: { 'Main.Start': true, 'Main.Level': 21 } });
    expect(staged).toMatchObject({ ok: true, stagedInputs: ['Main.Start', 'Main.Level'], stagedPlantActions: 0 });
    const after = await call('debug_step', { sessionId, cycles: 1, watch: ['Main.Twice', 'Main.Lamp'] });
    expect(after.values).toEqual({ 'Main.Twice': 42, 'Main.Lamp': false });
    expect((await call('debug_step', { sessionId, mode: 'ms', durationMs: 60, watch: ['Main.Lamp'] })).values).toEqual({
      'Main.Lamp': true,
    });
    expect(await call('debug_set_inputs', { sessionId, inputs: { 'Main.Level': 40000 } })).toMatchObject({
      ok: false,
      error: 'MCP_INVALID_ARGUMENTS',
    });
    expect(await call('debug_set_inputs', { sessionId, inputs: { 'Main.Start': 1 } })).toMatchObject({
      ok: false,
      error: 'MCP_INVALID_ARGUMENTS',
    });
    // an output is not an input: refused with the input names
    expect(await call('debug_set_inputs', { sessionId, inputs: { 'Main.Lamp': true } })).toMatchObject({
      ok: false,
      error: 'MCP_NOT_FOUND',
      validValues: ['Main.Level', 'Main.Start'],
    });
    await call('debug_session_stop', { sessionId });
  });

  itNative('with the scene, a sensor input belongs to the plant and a plant action drives it', async () => {
    const call = client(await project('plant_belt_to_sensor'));
    const started = await call('debug_session_start');
    expect(started).toMatchObject({
      ok: true,
      sceneAttached: true,
      boundSignals: { commands: ['Belt1.run', 'Emitter1.emit'], sensors: ['StartButton.pressed', 'EyeFar.detect'] },
    });
    const { sessionId } = started;
    expect(await call('debug_set_inputs', { sessionId, inputs: { 'BeltToSensor.Start': true } })).toMatchObject({
      ok: false,
      error: 'MCP_DEBUG_INPUT_OWNED_BY_PLANT',
    });
    expect(
      await call('debug_set_inputs', { sessionId, plantActions: [{ kind: 'operate', signal: 'Nowhere.pressed', value: true }] }),
    ).toMatchObject({
      ok: false,
      error: 'MCP_NOT_FOUND',
      validValues: expect.arrayContaining(['StartButton.pressed', 'Belt1']),
    });
    expect(
      await call('debug_set_inputs', { sessionId, plantActions: [{ kind: 'operate', signal: 'StartButton.pressed', value: true }] }),
    ).toMatchObject({
      ok: true,
      stagedPlantActions: 1,
    });
    const stepped = await call('debug_step', {
      sessionId,
      cycles: 3,
      watch: ['BeltToSensor.Running', 'BeltToSensor.Start'],
      includeFacts: true,
    });
    expect(stepped.values).toEqual({ 'BeltToSensor.Running': true, 'BeltToSensor.Start': true });
    expect(typeof stepped.plantFacts).toBe('object');
    const seen = await call('debug_inspect', { sessionId, signals: ['BeltToSensor.Run'] });
    expect(seen.signals['BeltToSensor.Run']).toEqual({ type: 'BOOL', region: 'OPI', value: true });
    expect(seen.plant.signals['StartButton.pressed']).toBe(true);
    expect(typeof seen.plant.facts).toBe('object');
    await call('debug_session_stop', { sessionId });
  });
});

describe('AIX-014 inspecting a variable, a function block member and an SFC step', () => {
  itNative('variables by name with type and region, and the members of a TON instance', async () => {
    const call = client(await stProject(IO));
    const { sessionId } = await call('debug_session_start');
    await call('debug_set_inputs', { sessionId, inputs: { 'Main.Start': true } });
    await call('debug_step', { sessionId, cycles: 3 });
    const seen = await call('debug_inspect', { sessionId, functionBlocks: ['Main.Delay'] });
    expect(seen.signals).toMatchObject({
      'Main.Start': { type: 'BOOL', region: 'IPI', value: true },
      'Main.Lamp': { type: 'BOOL', region: 'OPI', value: false },
    });
    expect(seen.functionBlocks['Main.Delay']).toMatchObject({ IN: true, PT: 50, Q: false });
    expect(seen.functionBlocks['Main.Delay'].ET).toBeGreaterThan(0);
    // a bare instance name is looked for in the program
    expect((await call('debug_inspect', { sessionId, functionBlocks: ['Delay'] })).functionBlocks['Main.Delay']).toBeDefined();
    await call('debug_session_stop', { sessionId });
  });

  itNative('an SFC chart answers its active step and its transitions', async () => {
    const call = client(await project('blinky_sfc'));
    const { sessionId } = await call('debug_session_start');
    await call('debug_step', { sessionId, cycles: 1 });
    const seen = await call('debug_inspect', { sessionId });
    expect(seen.sfc).toHaveLength(1);
    expect(seen.sfc[0]).toMatchObject({ pou: 'Blinky', file: 'src/main.sfc.json' });
    expect(seen.sfc[0].activeSteps.map((step: { id: string }) => step.id)).toEqual(['step_led_on']);
    expect(seen.sfc[0].transitions.map((transition: { id: string }) => transition.id).sort()).toEqual([
      'trans_off_to_on',
      'trans_on_to_off',
    ]);
    await call('debug_breakpoints', { sessionId, action: 'set', locations: [{ file: 'src/main.sfc.json', element: 'step:step_led_off' }] });
    await call('debug_step', { sessionId, mode: 'continue', maxCycles: 5000 });
    await call('debug_breakpoints', { sessionId, action: 'clear' });
    await call('debug_step', { sessionId, cycles: 1 });
    const on = await call('debug_inspect', { sessionId, includeSfc: true });
    expect(on.sfc[0].activeSteps.map((step: { id: string }) => step.id)).toEqual(['step_led_off']);
    expect((await call('debug_inspect', { sessionId, includeSfc: false })).sfc).toBeUndefined();
    await call('debug_session_stop', { sessionId });
  });
});

describe('AIX-014 session limits, isolation and teardown', () => {
  itNative('a third session is refused with MCP_DEBUG_SESSION_LIMIT naming the two open ones', async () => {
    const call = client(await stProject(COUNTER));
    const first = await call('debug_session_start');
    const second = await call('debug_session_start');
    const third = await call('debug_session_start');
    expect(third).toMatchObject({ ok: false, error: 'MCP_DEBUG_SESSION_LIMIT' });
    expect([...third.validValues].sort()).toEqual([first.sessionId, second.sessionId].sort());
    expect(third.cause).toContain(first.sessionId);
    await call('debug_session_stop', { sessionId: first.sessionId });
    const again = await call('debug_session_start');
    expect(again.ok).toBe(true);
    await call('debug_session_stop', { sessionId: second.sessionId });
    await call('debug_session_stop', { sessionId: again.sessionId });
  });

  itNative('an idle session is torn down after the idle limit and its id answers MCP_DEBUG_SESSION_NOT_FOUND', async () => {
    const workspace = await stProject(COUNTER);
    const before = runtimeChildren().length;
    const call = client(workspace, new McpDebugSessionManager(workspace, { idleMs: 400 }));
    const { sessionId, idleTimeoutSec } = await call('debug_session_start');
    expect(idleTimeoutSec).toBe(0.4);
    expect(runtimeChildren().length).toBe(before + 1);
    // a call keeps it alive
    await Bun.sleep(250);
    expect((await call('debug_step', { sessionId })).ok).toBe(true);
    await Bun.sleep(250);
    expect((await call('debug_inspect', { sessionId })).ok).toBe(true);
    await Bun.sleep(700);
    const gone = await call('debug_step', { sessionId });
    expect(gone).toMatchObject({ ok: false, error: 'MCP_DEBUG_SESSION_NOT_FOUND', validValues: [] });
    expect(gone.message).toContain('without a call');
    await settled(() => runtimeChildren().length === before);
    expect(runtimeChildren().length).toBe(before);
  });

  itNative('two sessions keep their own state, ids are unguessable, and another connection cannot reach them', async () => {
    const workspace = await stProject(IO);
    const call = client(workspace);
    const a = (await call('debug_session_start')).sessionId as string;
    const b = (await call('debug_session_start')).sessionId as string;
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
    await call('debug_set_inputs', { sessionId: a, inputs: { 'Main.Level': 5 } });
    await call('debug_step', { sessionId: a, cycles: 1 });
    await call('debug_step', { sessionId: b, cycles: 1 });
    expect((await call('debug_inspect', { sessionId: a, signals: ['Main.Twice'] })).signals['Main.Twice'].value).toBe(10);
    expect((await call('debug_inspect', { sessionId: b, signals: ['Main.Twice'] })).signals['Main.Twice'].value).toBe(0);
    expect((await call('debug_breakpoints', { sessionId: a, action: 'set', locations: [{ file: 'src/Main.st', line: 15 }] })).ok).toBe(
      true,
    );
    expect((await call('debug_breakpoints', { sessionId: b, action: 'list' })).breakpoints).toEqual([]);
    // another connection: the ids of this one are unknown there, and not offered as valid values
    const other = client(workspace);
    for (const tool of ['debug_step', 'debug_inspect', 'debug_session_stop', 'debug_breakpoints', 'debug_set_inputs']) {
      const args = tool === 'debug_breakpoints' ? { sessionId: a, action: 'list' } : { sessionId: a };
      const refused = await other(tool, args);
      expect(refused).toMatchObject({ ok: false, error: 'MCP_DEBUG_SESSION_NOT_FOUND', validValues: [] });
    }
    // an id that is not a uuid is not even an argument
    expect(await call('debug_step', { sessionId: 'session-1' })).toMatchObject({ ok: false, error: 'MCP_INVALID_ARGUMENTS' });
    await call('debug_session_stop', { sessionId: a });
    expect((await call('debug_step', { sessionId: b })).ok).toBe(true);
    await call('debug_session_stop', { sessionId: b });
  });

  itNative('closing the MCP connection stops every session, and no runtime process is left behind', async () => {
    const workspace = await stProject(COUNTER);
    const before = runtimeChildren().length;
    const server = buildMcpServer(workspace);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const answers = new Map<number, Answer>();
    clientSide.onmessage = (message) => {
      const reply = message as { id?: number; result?: Answer };
      if (typeof reply.id === 'number') answers.set(reply.id, reply.result ?? (reply as Answer));
    };
    await clientSide.start();
    let id = 0;
    const request = async (method: string, params: Record<string, unknown>) => {
      const mine = ++id;
      await clientSide.send({ jsonrpc: '2.0', id: mine, method, params } as never);
      await settled(() => answers.has(mine), 10_000);
      return answers.get(mine)!;
    };
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    await clientSide.send({ jsonrpc: '2.0', method: 'notifications/initialized' } as never);
    for (let index = 0; index < 2; index++) {
      const started = await request('tools/call', { name: 'debug_session_start', arguments: {} });
      expect(started.structuredContent).toMatchObject({ ok: true });
    }
    expect(runtimeChildren().length).toBe(before + 2);
    await clientSide.close();
    await settled(() => runtimeChildren().length === before);
    expect(runtimeChildren().length).toBe(before);
  });
});

describe('AIX-014 lessons, bounds and actionable errors', () => {
  itNative(
    'in a lesson with hidden solutions the session runs the learner program, says so, and no argument can name another',
    async () => {
      const LESSON = 'ld-no-nc-contacts';
      const entry = LESSON_INDEX.lessons.find((lesson) => lesson.id === LESSON)!;
      const userData = await mkdtemp(join(tmpdir(), 'zplc-mcp-debug-lesson-'));
      temporary.push(userData);
      const root = join(userData, 'learn-workspaces', LESSON);
      await mkdir(join(userData, 'learn-workspaces'));
      await cp(join(projects, entry.starter.project), root, { recursive: true });
      await writeFile(join(userData, LEARN_POLICY_FILENAME), JSON.stringify({ hideSolutions: true }));
      const workspace = { ...(await openMcpWorkspace(root))!, userData: (await openMcpUserData(userData))! };
      const call = client(workspace);
      const started = await call('debug_session_start');
      expect(started).toMatchObject({ ok: true, lesson: { lessonId: LESSON, solutionsHidden: true } });
      const seen = await call('debug_inspect', { sessionId: started.sessionId });
      const text = JSON.stringify([started, seen]);
      expect(text).not.toContain(entry.solution.project);
      expect(text).not.toMatch(/"solution"/i);
      for (const extra of [{ project: entry.solution.project }, { solution: true }, { path: '../solution' }, { workspace: '/' }]) {
        expect(await call('debug_session_start', extra)).toMatchObject({ ok: false, error: 'MCP_INVALID_ARGUMENTS' });
      }
      await call('debug_session_stop', { sessionId: started.sessionId });
    },
  );

  itNative('the step budgets are caps: over them is refused by name, continue without a stop ends at maxCycles', async () => {
    const call = client(await stProject(COUNTER));
    const { sessionId } = await call('debug_session_start');
    for (const [args, field] of [
      [{ cycles: 1001 }, 'cycles'],
      [{ mode: 'continue', maxCycles: 5001 }, 'maxCycles'],
      [{ mode: 'ms', durationMs: 60_001 }, 'durationMs'],
      [{ watch: Array.from({ length: 33 }, () => 'Main.x') }, 'watch'],
      [{ mode: 'instruction' }, 'mode'],
    ] as const) {
      const refused = await call('debug_step', { sessionId, ...args });
      expect(refused).toMatchObject({ ok: false, error: 'MCP_INVALID_ARGUMENTS' });
      expect(refused.cause).toStartWith(field);
    }
    expect((await call('debug_step', { sessionId, mode: 'oops' })).validValues).toEqual(['cycles', 'ms', 'continue']);
    expect(await call('debug_step', { sessionId, mode: 'ms', durationMs: 15 })).toMatchObject({
      ok: false,
      error: 'MCP_INVALID_ARGUMENTS',
    });
    expect(await call('debug_inspect', { sessionId, signals: Array.from({ length: 65 }, () => 'Main.x') })).toMatchObject({
      ok: false,
      error: 'MCP_INVALID_ARGUMENTS',
    });
    const inputs = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`Main.v${index}`, true]));
    expect(await call('debug_set_inputs', { sessionId, inputs })).toMatchObject({ ok: false, error: 'MCP_INVALID_ARGUMENTS' });
    const run = await call('debug_step', { sessionId, mode: 'continue', maxCycles: 7 });
    expect(run).toMatchObject({ ok: true, stopReason: 'budget_reached', cyclesExecuted: 7, cycles: 7, atMs: 70 });
    await call('debug_session_stop', { sessionId });
  });

  itNative('an unknown file, element, variable or instance is answered with its valid values', async () => {
    const call = client(await stProject(IO));
    const { sessionId } = await call('debug_session_start');
    const file = await call('debug_breakpoints', { sessionId, action: 'set', locations: [{ file: 'src/Other.st', line: 3 }] });
    expect(file).toMatchObject({ ok: false, error: 'MCP_NOT_FOUND', validValues: ['src/Main.st'] });
    const element = await call('debug_breakpoints', { sessionId, action: 'set', locations: [{ file: 'src/Main.st', line: 2 }] });
    expect(element).toMatchObject({ ok: false, error: 'MCP_NOT_FOUND', validValues: ['line:13', 'line:14', 'line:15'] });
    expect(element.cause).toContain("'line:2'");
    // nothing was armed by the refused call
    expect((await call('debug_breakpoints', { sessionId, action: 'list' })).breakpoints).toEqual([]);
    const variable = await call('debug_inspect', { sessionId, signals: ['Main.Nope'] });
    expect(variable).toMatchObject({ ok: false, error: 'MCP_NOT_FOUND', nextStep: expect.any(String) });
    expect(variable.validValues).toEqual(expect.arrayContaining(['Main.Start', 'Main.Lamp', 'Main.Delay.Q']));
    expect((await call('debug_step', { sessionId, watch: ['Nope'] })).error).toBe('MCP_NOT_FOUND');
    const block = await call('debug_inspect', { sessionId, functionBlocks: ['Main.Start'] });
    expect(block).toMatchObject({ ok: false, error: 'MCP_NOT_FOUND', validValues: ['Main.Delay'] });
    expect(await call('debug_breakpoints', { sessionId, action: 'set' })).toMatchObject({ ok: false, error: 'MCP_INVALID_ARGUMENTS' });
    expect(await call('debug_set_inputs', { sessionId, plantActions: [{ kind: 'emit', item: 'box', at: [0, 0, 0] }] })).toMatchObject({
      ok: false,
      error: 'MCP_INVALID_ARGUMENTS',
    });
    await call('debug_session_stop', { sessionId });
    expect(await call('debug_session_stop', { sessionId })).toMatchObject({ ok: false, error: 'MCP_DEBUG_SESSION_NOT_FOUND' });
  });

  itNative('a project with two tasks steps and inspects, and refuses breakpoints naming the limit', async () => {
    const call = client(await stProject(COUNTER, 2));
    const { sessionId } = await call('debug_session_start');
    const refused = await call('debug_breakpoints', { sessionId, action: 'set', locations: [{ file: 'src/Main.st', line: 3 }] });
    expect(refused).toMatchObject({ ok: false, error: 'MCP_INVALID_ARGUMENTS' });
    expect(refused.cause).toContain('2 tasks');
    expect((await call('debug_step', { sessionId, cycles: 2 })).ok).toBe(true);
    expect((await call('debug_inspect', { sessionId, signals: ['Main.x'] })).signals['Main.x'].value).toBeGreaterThan(0);
    await call('debug_session_stop', { sessionId });
  });
});

describe('AIX-014 the recorded simulation tools answer as before', () => {
  itNative('simulation_start keeps its 2.0 answer: a recorded first sample, no session', async () => {
    const call = client(await project('motor_start_stop'));
    const scenarios = await call('scenarios_list');
    const scenarioId = scenarios.summary.scenarios[0].id;
    const answer = await call('simulation_start', { scenarioId });
    expect(Object.keys(answer).sort()).toEqual(
      [
        'ok',
        'evidenceLevel',
        'scope',
        'cursor',
        'totalSamples',
        'done',
        'snapshot',
        'traceSha256',
        'evidence',
        'execution',
        'note',
        'audit',
      ].sort(),
    );
    expect(answer).toMatchObject({ ok: true, evidenceLevel: 'host-simulation', scope: 'recorded-native-posix-host', cursor: 0 });
    expect(answer.note).toBe('Recorded native POSIX host result; not live runtime, hardware, or HIL.');
    expect(MCP_TOOL_NAMES).toContain('simulation_start');
  });
});

describe('AIX-014 a debug session reports when its source changed', () => {
  itNative('start -> step is stale: false, workspace_write changes the program -> inspect is stale: true with nextStep, stop and start -> stale: false and new program runs', async () => {
    const workspace = await stProject(COUNTER);
    const call = client(workspace);
    const first = await call('debug_session_start');
    const step1 = await call('debug_step', { sessionId: first.sessionId, cycles: 1, watch: ['Main.x'] });
    expect(step1).toMatchObject({ ok: true, stale: false, values: { 'Main.x': 1 } });
    expect(step1.nextStep).toBeUndefined();

    const updated = 'PROGRAM Main\nVAR x : INT; y : INT; z : INT; END_VAR\nx := x + 10;\ny := x * 2;\nz := z + 1;\nEND_PROGRAM\n';
    const written = await call('workspace_write', { files: [{ path: 'src/Main.st', content: updated }] });
    expect(written.ok).toBe(true);

    const inspected = await call('debug_inspect', { sessionId: first.sessionId, signals: ['Main.x'] });
    expect(inspected).toMatchObject({ ok: true, stale: true, nextStep: expect.any(String) });
    expect(inspected.nextStep).toMatch(/stop/i);
    expect(inspected.nextStep).toMatch(/start/i);

    const bp = await call('debug_breakpoints', { sessionId: first.sessionId, action: 'list' });
    expect(bp).toMatchObject({ ok: true, stale: true, nextStep: expect.any(String) });

    const setIn = await call('debug_set_inputs', { sessionId: first.sessionId, inputs: {} });
    expect(setIn).toMatchObject({ ok: true, stale: true, nextStep: expect.any(String) });

    await call('debug_session_stop', { sessionId: first.sessionId });
    const second = await call('debug_session_start');
    const step2 = await call('debug_step', { sessionId: second.sessionId, cycles: 1, watch: ['Main.x'] });
    expect(step2).toMatchObject({ ok: true, stale: false, values: { 'Main.x': 10 } });
    expect(step2.nextStep).toBeUndefined();
    await call('debug_session_stop', { sessionId: second.sessionId });
  });

  itNative('deleting a compiled file or referencing a new source file in a task marks the session stale: true', async () => {
    const workspace = await stProject(COUNTER);
    const call = client(workspace);
    const { sessionId } = await call('debug_session_start');
    expect((await call('debug_step', { sessionId, cycles: 1 })).stale).toBe(false);

    // Adding a new source file referenced by a task in zplc.json makes the session stale
    const helper = 'PROGRAM Helper\nVAR k : INT; END_VAR\nk := k + 1;\nEND_PROGRAM\n';
    const manifest = JSON.stringify({
      schemaVersion: 2,
      name: 'Debug',
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: [{ name: 'T0', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st', 'Helper.st'] }],
    });
    expect(
      (
        await call('workspace_write', {
          files: [
            { path: 'src/Helper.st', content: helper },
            { path: 'zplc.json', content: manifest },
          ],
        })
      ).ok,
    ).toBe(true);
    expect(await call('debug_inspect', { sessionId })).toMatchObject({ ok: true, stale: true, nextStep: expect.any(String) });

    // Deleting a compiled file makes the session stale
    await rm(join(workspace.root, 'src', 'Main.st'));
    const afterDelete = await call('debug_step', { sessionId, cycles: 1 });
    expect(afterDelete).toMatchObject({ ok: true, stale: true, nextStep: expect.any(String) });
    await call('debug_session_stop', { sessionId });
  });

  itNative('debug_step keeps all existing fields unchanged when stale is added', async () => {
    const workspace = await stProject(COUNTER);
    const call = client(workspace);
    const { sessionId } = await call('debug_session_start');
    const answer = await call('debug_step', { sessionId, cycles: 2, watch: ['Main.x', 'Main.y'] });
    expect(Object.keys(answer).sort()).toEqual(
      ['ok', 'evidenceLevel', 'sessionId', 'stopReason', 'atMs', 'cycles', 'state', 'cyclesExecuted', 'values', 'stale', 'audit'].sort(),
    );
    expect(answer).toMatchObject({
      ok: true,
      evidenceLevel: 'host-simulation',
      sessionId,
      stopReason: 'stepped',
      atMs: 20,
      cycles: 2,
      state: 'idle',
      cyclesExecuted: 2,
      values: { 'Main.x': 2, 'Main.y': 4 },
      stale: false,
    });
    await call('debug_session_stop', { sessionId });
  });
});
