import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { assemble, createMultiTaskZplcFile, TASK_TYPE, ZPLC_CONTRACT } from '@zplc/compiler';

import { builtWasmModule, itWasm } from '../cli/wasmModuleGuard';
import { NativeAdapter } from './nativeAdapter';
import { SCHEDULER_TRACE_KIND, WasmRuntime, createWasmSimulationApi, type SchedulerDecision, type WasmSimulationApi } from './wasmRuntime';

// IDE-025, RT-008, RT-009: the runtime that the browser simulation runs is the session of the native runtime, the
// scheduler core and the loader with its verifier, built to WebAssembly by tools/wasm-core. These tests drive that module
// the way the IDE does, through the adapter that speaks the session protocol (NativeAdapter) over the transport of
// wasmRuntime.ts, and hold what it decides to what the native runtime decides: the trace cases of the scheduler core are
// the file the POSIX and Zephyr runtimes are held to (firmware/lib/zplc_core/tests/include/zplc_sched_trace_cases.h).

const OPI = ZPLC_CONTRACT.MEMORY_REGION.OPI.base;
const WORK = ZPLC_CONTRACT.MEMORY_REGION.WORK.base;

/** A runtime whose clock the test sets and whose poll loop it runs by hand, so that nothing depends on a timer. */
function open(options: { retainStorage?: 'project' | 'memory' } = {}) {
  const clock = { now: 0, reads: null as number[] | null, read: 0 };
  const queued: Array<() => void> = [];
  const api: WasmSimulationApi = createWasmSimulationApi({
    loadModule: async () => builtWasmModule().bytes,
    clock: () => {
      if (clock.reads === null) return clock.now;
      const value = clock.reads[Math.min(clock.read, clock.reads.length - 1)]!;
      clock.read += 1;
      return value;
    },
    schedule: (callback) => {
      queued.push(callback);
      return queued.length;
    },
    cancel: () => undefined,
    ...(options.retainStorage ? { retainStorage: options.retainStorage } : {}),
  });
  const adapter = new NativeAdapter(api);
  return {
    api,
    adapter,
    clock,
    /** Sets the time and runs the poll of the runtime once, as the timer of the page does. */
    poll(nowMs: number) {
      clock.now = nowMs;
      queued.splice(0).forEach((callback) => callback());
    },
  };
}

function toHexFile(bytes: Uint8Array): Uint8Array {
  return bytes;
}

describe('the module of the WebAssembly runtime (IDE-025)', () => {
  itWasm('imports nothing but the five calls of the host that its HAL port lists', () => {
    const imports = WebAssembly.Module.imports(new WebAssembly.Module(new Uint8Array(builtWasmModule().bytes)))
      .map((entry) => `${entry.module}.${entry.name}`)
      .sort();
    expect(imports).toEqual([
      'zplc_host.clock_ms',
      'zplc_host.log',
      'zplc_host.persist_delete',
      'zplc_host.persist_load',
      'zplc_host.persist_save',
    ]);
  });

  itWasm('says which build it is: the commit and the contract draft it was built from', async () => {
    const { api } = open();
    const hello = await api.startSession() as unknown as { runtime_kind: string; draft_counter: number; build: { board: string; commit: string; draft_counter: number; version: string } };
    expect(hello.build.board).toBe('wasm');
    expect(hello.build.commit).toBe(builtWasmModule().manifest.commit);
    expect(hello.build.version).toBe(builtWasmModule().manifest.version);
    expect(hello.draft_counter).toBe(ZPLC_CONTRACT.DRAFT_COUNTER);
    expect(hello.build.draft_counter).toBe(ZPLC_CONTRACT.DRAFT_COUNTER);
    await api.stopSession();
  });

  itWasm('reports itself as the browser runtime with the capability profile of spec 009', async () => {
    const { api } = open({ retainStorage: 'project' });
    const hello = await api.startSession() as unknown as { runtime_kind: string; capability_profile: { profile_id: string; features: Array<{ name: string; status: string; reason?: string; recommended_action?: string }> } };
    expect(hello.runtime_kind).toBe('wasm');
    expect(hello.capability_profile.profile_id).toBe('wasm-browser');
    const features = new Map(hello.capability_profile.features.map((feature) => [feature.name, feature]));
    for (const name of ['pause', 'resume', 'step', 'breakpoints', 'simulation-inputs']) expect(features.get(name)?.status).toBe('supported');
    for (const name of ['tasks', 'timing', 'retentive-memory']) expect(features.get(name)?.status).toBe('degraded');
    for (const name of ['modbus', 'mqtt', 'cloud', 'serial', 'physical-io']) expect(features.get(name)?.status).toBe('unavailable');
    // spec 009: a feature that is not supported says why and what to do instead
    for (const feature of hello.capability_profile.features) {
      if (feature.status !== 'supported') {
        expect(feature.reason?.length ?? 0).toBeGreaterThan(20);
        expect(feature.recommended_action?.length ?? 0).toBeGreaterThan(10);
      }
    }
    await api.stopSession();
  });
});

describe('a program on the WebAssembly runtime, through the adapter (IDE-025)', () => {
  itWasm('is loaded, runs on the poll of the runtime and shows its output', async () => {
    const { adapter, poll } = open();
    await adapter.connect();
    expect(adapter.type).toBe('wasm');
    await adapter.loadProgram(toHexFile(assemble('    PUSH8 7\n    STORE8 0x1000\n    HALT\n').zplcFile));
    await adapter.start();
    poll(100);
    expect((await adapter.peek(OPI, 1))[0]).toBe(7);
    const snapshot = await adapter.getRuntimeSnapshot();
    expect(snapshot.state).toBe('running');
    expect(snapshot.stats.cycles).toBeGreaterThanOrEqual(1);
    await adapter.disconnect();
  });

  itWasm('stops at a breakpoint, steps, and resumes from where it stopped', async () => {
    const { adapter, poll } = open();
    const hits: number[] = [];
    adapter.setEventHandlers({ onBreakpointHit: (pc) => hits.push(pc) });
    await adapter.connect();
    // PUSH8 at 0, PUSH8 at 2, ADD at 4, STORE8 at 5
    await adapter.loadProgram(assemble('    PUSH8 1\n    PUSH8 2\n    ADD\n    STORE8 0x1000\n    HALT\n').zplcFile);
    expect(await adapter.setBreakpoint(4)).toBe(true);
    await adapter.start();
    poll(100);
    expect(hits).toEqual([4]);
    expect(adapter.state).toBe('paused');
    expect((await adapter.peek(OPI, 1))[0]).toBe(0);
    await adapter.resume();
    poll(200);
    expect((await adapter.peek(OPI, 1))[0]).toBe(3);
    await adapter.disconnect();
  });

  itWasm('keeps a forced value over what the program writes', async () => {
    const { adapter, poll } = open();
    await adapter.connect();
    await adapter.loadProgram(assemble('    PUSH8 7\n    STORE8 0x1000\n    HALT\n').zplcFile);
    await adapter.forceValue(OPI, new Uint8Array([0x55]));
    expect((await adapter.listForcedValues()).map((entry) => entry.address)).toEqual([OPI]);
    await adapter.start();
    poll(100);
    expect((await adapter.peek(OPI, 1))[0]).toBe(0x55);
    await adapter.clearAllForcedValues();
    poll(200);
    expect((await adapter.peek(OPI, 1))[0]).toBe(7);
    await adapter.disconnect();
  });

  itWasm('refuses, through the verifier of the loader, a program that takes a value from an empty stack', async () => {
    const { adapter } = open();
    await adapter.connect();
    await expect(adapter.loadProgram(assemble('    ADD\n    HALT\n').zplcFile)).rejects.toThrow();
    // the refusal leaves the session usable: a valid program loads after it
    await adapter.loadProgram(assemble('    PUSH8 1\n    HALT\n').zplcFile);
    await adapter.disconnect();
  });

  itWasm('keeps one poll loop when a session is started again without being stopped', async () => {
    const live = new Set<number>();
    let issued = 0;
    const api = createWasmSimulationApi({
      loadModule: async () => builtWasmModule().bytes,
      clock: () => 0,
      schedule: () => { issued += 1; live.add(issued); return issued; },
      cancel: (handle) => { live.delete(handle as number); },
    });
    await api.startSession();
    await api.startSession();
    expect(live.size).toBe(1);
    await api.stopSession();
    expect(live.size).toBe(0);
  });

  itWasm('answers a request that is too long with the error of the native runtime and keeps running', async () => {
    const runtime = await WasmRuntime.instantiate(builtWasmModule().bytes, { clock: () => 0 });
    const answer = runtime.request(`{"id":"x","type":"request","method":"program.load","params":{"bytecode_hex":"${'AB'.repeat(200_000)}"}}`);
    expect(JSON.parse(answer.response).error.code).toBe('INVALID_REQUEST');
    expect(JSON.parse(runtime.request('{"id":"y","type":"request","method":"status.get","params":{}}').response).result.state).toBe('idle');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// RT-008: the decisions of the scheduler core
// ---------------------------------------------------------------------------------------------------------------------

const traceHeader = readFileSync(new URL('../../../../firmware/lib/zplc_core/tests/include/zplc_sched_trace_cases.h', import.meta.url), 'utf8');

/** The text between the first `open` after `name` and the `close` that ends the initialiser: one array of the trace file. */
function arrayOf(name: string): string {
  const start = traceHeader.indexOf(name);
  if (start < 0) throw new Error(`${name} is not in the trace cases`);
  const end = traceHeader.indexOf('};', start);
  return traceHeader.slice(traceHeader.indexOf('{', start), end);
}

interface TraceTask { id: number; priority: number; intervalMs: number; output: number }
interface TraceBatch { atMs: number; reads: number[] }

function parseTasks(): TraceTask[] {
  return [...arrayOf('ZPLC_TRACE_TASKS[').matchAll(/\{(\d+)U, (\d+)U, (\d+)U, (0x[0-9A-Fa-f]+)U\}/g)]
    .map((match) => ({ id: Number(match[1]), priority: Number(match[2]), intervalMs: Number(match[3]), output: Number(match[4]) }));
}

function parseBatches(): TraceBatch[] {
  return [...arrayOf('ZPLC_TRACE_BATCHES[').matchAll(/\{(\d+)U, 0x[0-9a-fA-F]+U, (\d+)U, \{([^}]*)\}\}/g)].map((match) => {
    const reads = match[3]!.split(',').map((value) => Number(value.trim().replace(/U$/, '')));
    return { atMs: Number(match[1]), reads: reads.slice(0, Number(match[2])) };
  });
}

function parseGolden(name: string): string[] {
  return [...arrayOf(name).matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

/** One program of the cases: each task stores its value in its own output byte, then halts (PUSH8, STORE8 address, HALT). */
function traceProgram(tasks: TraceTask[]): Uint8Array {
  const bytecode = new Uint8Array(tasks.length * 6);
  tasks.forEach((task, index) => {
    bytecode.set([0x40, task.output, 0x84, (OPI + index) & 0xff, (OPI + index) >> 8, 0x01], index * 6);
  });
  return createMultiTaskZplcFile(bytecode, tasks.map((task, index) => ({
    id: task.id, type: TASK_TYPE.CYCLIC, priority: task.priority, intervalUs: task.intervalMs * 1000, entryPoint: index * 6, stackSize: 16,
  })));
}

/** The text of a decision, as zplc_trace_render() of the trace cases writes it. */
export function render(decision: SchedulerDecision): string {
  const t = `t${decision.taskId}`;
  switch (decision.kind) {
    case SCHEDULER_TRACE_KIND.ADMIT: return `ADMIT ${t} ${decision.a}`;
    case SCHEDULER_TRACE_KIND.COALESCE: return `COALESCE ${t}`;
    case SCHEDULER_TRACE_KIND.ORDER: return `ORDER ${t} ${decision.a}`;
    case SCHEDULER_TRACE_KIND.LATCH: return `LATCH ${decision.a}`;
    case SCHEDULER_TRACE_KIND.TASK: return `TASK ${t} ${decision.a} ${decision.b}`;
    case SCHEDULER_TRACE_KIND.MISS: return `MISS ${t} ${decision.a} ${decision.b}`;
    case SCHEDULER_TRACE_KIND.FAULT: return `FAULT ${t} ${decision.a}`;
    case SCHEDULER_TRACE_KIND.COMMIT: return `COMMIT ${decision.a}`;
    case SCHEDULER_TRACE_KIND.PAUSE: return 'PAUSE';
    default: return '?';
  }
}

describe('the scheduler of the WebAssembly runtime decides what the native runtime decides (RT-008)', () => {
  it('reads the scenario of the scheduler core test suite: three tasks, five batches, a golden trace', () => {
    expect(parseTasks()).toHaveLength(3);
    expect(parseBatches()).toHaveLength(5);
    expect(parseGolden('ZPLC_TRACE_GOLDEN[]').length).toBeGreaterThan(35);
  });

  itWasm('gives the golden trace for tasks of 100 and 200 ms whose third batch runs late and whose fifth latches the fault', async () => {
    const { api, adapter, clock } = open();
    await adapter.connect();
    await adapter.loadProgram(traceProgram(parseTasks()));
    api.runtime!.traceEnable(true);
    await adapter.start();
    const decisions: SchedulerDecision[] = [];
    for (const batch of parseBatches()) {
      // the poll is the host's: it names the instant it dispatches the batch, and the module reads its clock for the scan
      clock.reads = batch.reads;
      clock.read = 0;
      api.runtime!.tick(batch.atMs);
      clock.reads = null;
      decisions.push(...api.runtime!.traceDrain());
    }
    expect(decisions.map(render)).toEqual(parseGolden('ZPLC_TRACE_GOLDEN[]'));
    // the third miss in a row of task 1 latched the fault: the runtime is in error and says why
    const status = JSON.parse(api.runtime!.request('{"id":"s","type":"request","method":"status.get","params":{}}').response).result;
    expect(status.state).toBe('error');
    expect(JSON.stringify(status)).toContain('deadline_miss');
    await adapter.disconnect();
  });

  itWasm('gives the one-task trace for a program of one task whose last three scans run late', async () => {
    const { api, adapter, clock } = open();
    const idLine = /#define ZPLC_TRACE_ONE_TASK_ID (\d+)U/.exec(traceHeader)!;
    const interval = /#define ZPLC_TRACE_ONE_INTERVAL_MS (\d+)U/.exec(traceHeader)!;
    const output = /#define ZPLC_TRACE_ONE_OUTPUT (0x[0-9A-Fa-f]+)U/.exec(traceHeader)!;
    const batches = [...arrayOf('ZPLC_TRACE_ONE_BATCHES[').matchAll(/\{(\d+)U, (\d+)U, (\d+)U\}/g)]
      .map((match) => ({ atMs: Number(match[1]), reads: [Number(match[2]), Number(match[3])] }));
    expect(batches).toHaveLength(7);
    await adapter.connect();
    await adapter.loadProgram(traceProgram([{ id: Number(idLine[1]), priority: 0, intervalMs: Number(interval[1]), output: Number(output[1]) }]));
    api.runtime!.traceEnable(true);
    await adapter.start();
    const decisions: SchedulerDecision[] = [];
    for (const batch of batches) {
      // the poll is the host's: it names the instant it dispatches the batch, and the module reads its clock for the scan
      clock.reads = batch.reads;
      clock.read = 0;
      api.runtime!.tick(batch.atMs);
      clock.reads = null;
      decisions.push(...api.runtime!.traceDrain());
    }
    expect(decisions.map(render)).toEqual(parseGolden('ZPLC_TRACE_ONE_GOLDEN[]'));
    await adapter.disconnect();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// RT-009: the input image of a scan
// ---------------------------------------------------------------------------------------------------------------------

describe('the process image of the WebAssembly runtime (RT-009)', () => {
  itWasm('lets every task of a batch read one input image, and a simulation pulse last one batch', async () => {
    const { adapter, poll } = open();
    // each task copies the first input byte into a cell of its own in WORK memory, then halts
    const cell = (task: number) => WORK + 4 * task;
    const code = new Uint8Array(14);
    [0, 1].forEach((task) => code.set([0x80, 0x00, 0x00, 0x84, cell(task) & 0xff, cell(task) >> 8, 0x01], task * 7));
    const program = createMultiTaskZplcFile(code, [
      { id: 1, type: TASK_TYPE.CYCLIC, priority: 1, intervalUs: 10_000, entryPoint: 0, stackSize: 16 },
      { id: 2, type: TASK_TYPE.CYCLIC, priority: 2, intervalUs: 40_000, entryPoint: 7, stackSize: 16 },
    ]);
    await adapter.connect();
    await adapter.loadProgram(program);
    await adapter.start();
    const copied = async (task: number) => (await adapter.peek(cell(task), 1))[0];

    await adapter.setSimulationInput('motor.start', true);
    poll(0);
    expect([await copied(0), await copied(1)]).toEqual([1, 1]);
    // the pulse ended with the batch that read it
    expect((await adapter.peek(0, 1))[0]! & 1).toBe(0);

    await adapter.setSimulationInput('motor.start', true);
    poll(10);
    expect(await copied(0)).toBe(1);
    poll(20);
    poll(30);
    expect(await copied(0)).toBe(0);
    await adapter.disconnect();
  });
});

describe('the communication blocks of the WebAssembly runtime (IDE-025)', () => {
  itWasm('answer STATUS 10 (UNAVAILABLE): a browser module has no network', async () => {
    // a Modbus block with EN true: the request fails at once, in the scan of the edge, with the code of the table
    const { compilerCompile } = await import('../cli/toolApi');
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = await mkdtemp(join(tmpdir(), 'zplc-wasm-comm-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'src', 'main.st'), [
        'PROGRAM Link',
        'VAR',
        '  Pub : MQTT_PUBLISH;',
        '  Rd : MB_READ_HREG;',
        '  Code AT %QD1 : DINT;',
        '  Err AT %QX0.0 : BOOL;',
        '  Done AT %QX0.1 : BOOL;',
        '  Other AT %QD2 : DINT;',
        'END_VAR',
        "  Rd(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, HOST := '127.0.0.1', PORT := 502);",
        "  Pub(EN := TRUE, QOS := 0, RETAIN := FALSE, TOPIC := 'a', PAYLOAD := 'b');",
        '  Code := Rd.STATUS;',
        '  Other := Pub.STATUS;',
        '  Err := Rd.ERROR;',
        '  Done := Rd.DONE;',
        'END_PROGRAM',
        '',
      ].join('\n'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({
        schemaVersion: 2, name: 'comm', version: '1.0.0', target: { board: 'posix' },
        tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }],
      }));
      const built = await compilerCompile(root);
      expect(built.ok).toBe(true);
      const { adapter, poll } = open();
      await adapter.connect();
      await adapter.loadProgram(built.zplcFile!);
      await adapter.start();
      poll(10);
      const bytes = await adapter.peek(OPI, 12);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getInt32(4, true)).toBe(10);
      expect(view.getInt32(8, true)).toBe(10);
      expect(bytes[0]! & 1).toBe(1); // ERROR
      expect(bytes[0]! & 2).toBe(0); // DONE: no block reports success without acting
      await adapter.disconnect();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
