/**
 * IDE-012: compile, safety check and tests run in a process of their own, can be cancelled, and cannot make the caller
 * unresponsive. The lifecycle is proven twice: against a scripted stand-in for the process (every branch, deterministic
 * clocks), and against real child processes (a worker stuck in a busy loop is killed and is really gone, while the
 * caller's event loop keeps ticking; the real tool worker answers a compile with the artifact bytes).
 */
import { afterEach, describe, expect, it, onTestFinished } from 'bun:test';
import { fork } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { itNative, nativeRuntimeBinary } from '../src/cli/nativeRuntimeGuard';
import { compilerCompile } from '../src/cli/toolApi';
import { createToolWorkerHost, ToolWorkerError, type ToolWorkerProcess, type ToolWorkerSpawner } from './toolWorkerHost';
import { parseToolWorkerCommand } from './toolWorkerProtocol';

const scratches: string[] = [];
afterEach(() => {
  for (const directory of scratches.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const scratch = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'zplc-tool-worker-'));
  scratches.push(directory);
  return directory;
};

/** A process that the test drives by hand. */
function scripted() {
  const posted: unknown[] = [];
  let message: (value: unknown) => void = () => undefined;
  let exit: (code: number | null) => void = () => undefined;
  let killed = 0;
  const process: ToolWorkerProcess = {
    postMessage: (value) => {
      posted.push(value);
    },
    onMessage: (listener) => {
      message = listener;
    },
    onExit: (listener) => {
      exit = listener;
    },
    kill: () => {
      killed += 1;
    },
  };
  return { process, posted, answer: (value: unknown) => message(value), exit: (code: number | null) => exit(code), killed: () => killed };
}

type Outcome = { value: unknown; error?: undefined } | { error: unknown; value?: undefined };
const settle = async (promise: Promise<unknown>): Promise<Outcome> =>
  promise.then(
    (value): Outcome => ({ value }),
    (error: unknown): Outcome => ({ error }),
  );
const reasonOf = (outcome: Outcome) => (outcome.error instanceof ToolWorkerError ? outcome.error.reason : String(outcome.error));

describe('the tool worker host (IDE-012)', () => {
  it('sends one named run to a fresh process, resolves with its answer, and kills the process afterwards', async () => {
    const worker = scripted();
    let spawned = 0;
    const host = createToolWorkerHost({
      spawn: () => {
        spawned += 1;
        return worker.process;
      },
    });
    const running = host.run({ operation: 'compile', root: '/p' }, new AbortController().signal);
    expect(host.active()).toBe(1);
    const command = worker.posted[0] as { type: string; id: string; operation: string; root: string };
    expect(command).toMatchObject({ type: 'run', operation: 'compile', root: '/p' });
    expect(parseToolWorkerCommand(command)).not.toBeNull();
    worker.answer({ type: 'result', id: 'someone-elses', value: 'ignored' });
    worker.answer({ type: 'result', id: command.id, value: { ok: true } });
    expect(await running).toEqual({ ok: true });
    expect(spawned).toBe(1);
    expect(worker.killed()).toBe(1);
    expect(host.active()).toBe(0);
  });

  it('rejects when the worker reports a failure or dies before it answers', async () => {
    const reported = scripted();
    const first = createToolWorkerHost({ spawn: () => reported.process }).run(
      { operation: 'safety-check', root: '/p' },
      new AbortController().signal,
    );
    reported.answer({ type: 'error', id: (reported.posted[0] as { id: string }).id });
    expect(reasonOf(await settle(first))).toBe('failed');

    const died = scripted();
    const second = createToolWorkerHost({ spawn: () => died.process }).run({ operation: 'test', root: '/p' }, new AbortController().signal);
    died.exit(139);
    expect(reasonOf(await settle(second))).toBe('failed');

    const failing = createToolWorkerHost({
      spawn: () => {
        throw new Error('no such file');
      },
    });
    expect(reasonOf(await settle(failing.run({ operation: 'test', root: '/p' }, new AbortController().signal)))).toBe('failed');
  });

  it('kills a worker that outlives its deadline, and says it timed out', async () => {
    const worker = scripted();
    const host = createToolWorkerHost({ spawn: () => worker.process, timeoutMs: 20 });
    const outcome = await settle(host.run({ operation: 'compile', root: '/p' }, new AbortController().signal));
    expect(reasonOf(outcome)).toBe('timeout');
    expect(worker.killed()).toBeGreaterThan(0);
    expect(host.active()).toBe(0);
  });

  it('lets a cancelled worker answer within the grace period (the cancelled result of a run), and kills it after', async () => {
    const worker = scripted();
    const host = createToolWorkerHost({ spawn: () => worker.process, cancelGraceMs: 500 });
    const controller = new AbortController();
    const running = host.run({ operation: 'scenario-run', root: '/p', scenarioId: 'start-stop' }, controller.signal);
    controller.abort();
    expect(worker.posted.at(-1)).toEqual({ type: 'cancel' });
    worker.answer({ type: 'result', id: (worker.posted[0] as { id: string }).id, value: { ok: false, cancelled: true } });
    expect(await running).toEqual({ ok: false, cancelled: true });
    expect(worker.killed()).toBe(1);
  });

  it('kills a worker that does not answer a cancel in time, and refuses to start when already cancelled', async () => {
    const worker = scripted();
    const host = createToolWorkerHost({ spawn: () => worker.process, cancelGraceMs: 10 });
    const controller = new AbortController();
    const running = host.run({ operation: 'compile', root: '/p' }, controller.signal);
    controller.abort();
    expect(reasonOf(await settle(running))).toBe('cancelled');
    expect(worker.killed()).toBeGreaterThan(0);

    let spawned = 0;
    const idle = createToolWorkerHost({
      spawn: () => {
        spawned += 1;
        return scripted().process;
      },
    });
    const aborted = new AbortController();
    aborted.abort();
    expect(reasonOf(await settle(idle.run({ operation: 'compile', root: '/p' }, aborted.signal)))).toBe('cancelled');
    expect(spawned).toBe(0);
  });

  it('kills every running worker when it is disposed', async () => {
    const a = scripted();
    const b = scripted();
    const queue = [a, b];
    const host = createToolWorkerHost({ spawn: () => queue.shift()!.process });
    const pending = [
      host.run({ operation: 'compile', root: '/a' }, new AbortController().signal),
      host.run({ operation: 'compile', root: '/b' }, new AbortController().signal),
    ];
    expect(host.active()).toBe(2);
    host.dispose();
    expect(a.killed()).toBe(1);
    expect(b.killed()).toBe(1);
    expect(host.active()).toBe(0);
    for (const outcome of await Promise.all(pending.map(settle))) expect(reasonOf(outcome)).toBe('cancelled');
  });
});

describe('the worker command schema (IDE-012, IDE-017)', () => {
  it('accepts exactly the six operations with exactly their fields, and nothing a caller could use as a command', () => {
    const run = { type: 'run', id: 'a' };
    expect(parseToolWorkerCommand({ ...run, operation: 'compile', root: '/p' })).toEqual({
      type: 'run',
      id: 'a',
      operation: 'compile',
      root: '/p',
    });
    expect(parseToolWorkerCommand({ ...run, operation: 'scenario-run', root: '/p', scenarioId: 'x' })).not.toBeNull();
    expect(
      parseToolWorkerCommand({ ...run, operation: 'change-set-review', root: '/p', edits: [{ path: 'src/A.st', content: '' }] }),
    ).not.toBeNull();
    expect(parseToolWorkerCommand({ ...run, operation: 'lesson-check', root: '/p', lessonId: 'edge-counter-pulses' })).toEqual({
      type: 'run',
      id: 'a',
      operation: 'lesson-check',
      root: '/p',
      lessonId: 'edge-counter-pulses',
    });
    expect(parseToolWorkerCommand({ type: 'cancel' })).toEqual({ type: 'cancel' });
    for (const bad of [
      // The lesson check names a lesson and nothing else: no scenario, no path, no extra field.
      { ...run, operation: 'lesson-check', root: '/p' },
      { ...run, operation: 'lesson-check', root: '/p', lessonId: '../x' },
      { ...run, operation: 'lesson-check', root: '/p', lessonId: 'edge-counter-pulses', scenario: '{}' },
      null,
      'run',
      { ...run, operation: 'shell', root: '/p' },
      { ...run, operation: 'compile' },
      { ...run, operation: 'compile', root: '' },
      { ...run, operation: 'compile', root: '/p', argv: ['rm'] },
      { ...run, operation: 'scenario-run', root: '/p' },
      { ...run, operation: 'change-set-review', root: '/p', edits: [] },
      { ...run, operation: 'change-set-review', root: '/p', edits: [{ path: 'a', content: 'b', mode: 1 }] },
      { type: 'cancel', extra: 1 },
      { type: 'exec', command: 'rm -rf /' },
    ])
      expect(parseToolWorkerCommand(bad)).toBeNull();
  });
});

/** Real child processes: the host is given `child_process.fork` instead of Electron's utility process. */
function forkSpawner(script: string): { spawn: ToolWorkerSpawner; pids: number[] } {
  const pids: number[] = [];
  return {
    pids,
    spawn: () => {
      const child = fork(script, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced', env: process.env });
      if (child.pid) pids.push(child.pid);
      return {
        pid: child.pid,
        postMessage: (message) => {
          child.send(message as never);
        },
        onMessage: (listener) => {
          child.on('message', listener);
        },
        onExit: (listener) => {
          child.on('exit', (code) => listener(code));
        },
        kill: () => {
          child.kill('SIGKILL');
        },
      };
    },
  };
}
// The process is gone when the kernel says so; how long that takes (the parent must reap it) depends on the load, and what
// the tests prove is that it happens, so the bound is a hang guard, not a measurement.
const gone = async (pid: number): Promise<boolean> => {
  for (let attempt = 0; attempt < 1_500; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await Bun.sleep(20);
  }
  return false;
};
// A cold fork of a Bun worker, a compile or a native run takes seconds on a machine at a load average of 40 to 100; the
// default 5 s of a test is a hang guard here, not what these tests measure.
const REAL_PROCESS_TIMEOUT_MS = 90_000;

describe('real worker processes (IDE-012)', () => {
  it(
    'kills a worker stuck in a busy loop, leaves no process behind, and never stops the caller from running',
    async () => {
      const script = path.join(scratch(), 'busy.mjs');
      writeFileSync(script, "process.on('message', () => { for (;;) { /* a compile that never ends */ } });\n");
      const { spawn, pids } = forkSpawner(script);
      const host = createToolWorkerHost({ spawn, cancelGraceMs: 150 });
      const controller = new AbortController();
      let ticks = 0;
      const heartbeat = setInterval(() => {
        ticks += 1;
      }, 10);
      const running = host.run({ operation: 'compile', root: '/p' }, controller.signal);
      // The caller was never blocked: its timer keeps firing while the worker's run is in flight (waited for as an event,
      // not as a fixed time, so a slow fork cannot starve the count).
      while (ticks <= 15) await Bun.sleep(10);
      const aborted = Date.now();
      controller.abort();
      const outcome = await settle(running);
      clearInterval(heartbeat);
      expect(reasonOf(outcome)).toBe('cancelled');
      // A worker that never answers is given its grace first; only then is it killed (a lower bound, no load can break it).
      expect(Date.now() - aborted).toBeGreaterThanOrEqual(150 - 20);
      expect(ticks).toBeGreaterThan(15);
      expect(pids).toHaveLength(1);
      expect(await gone(pids[0]!)).toBe(true);
      expect(host.active()).toBe(0);
    },
    REAL_PROCESS_TIMEOUT_MS,
  );

  it(
    'kills a worker that outlives its deadline, with the process gone',
    async () => {
      const script = path.join(scratch(), 'busy.mjs');
      writeFileSync(script, "process.on('message', () => { for (;;) { } });\n");
      const { spawn, pids } = forkSpawner(script);
      const host = createToolWorkerHost({ spawn, timeoutMs: 200 });
      expect(reasonOf(await settle(host.run({ operation: 'test', root: '/p' }, new AbortController().signal)))).toBe('timeout');
      expect(await gone(pids[0]!)).toBe(true);
    },
    REAL_PROCESS_TIMEOUT_MS,
  );

  it(
    'compiles a project in the real tool worker and answers the artifact bytes the main process needs',
    async () => {
      const root = path.join(scratch(), 'motor');
      cpSync(path.join(import.meta.dir, '..', 'projects', 'motor_start_stop'), root, { recursive: true });
      const { spawn, pids } = forkSpawner(path.join(import.meta.dir, 'toolWorker.ts'));
      const host = createToolWorkerHost({ spawn });
      const answer = (await host.run({ operation: 'compile', root }, new AbortController().signal)) as {
        ok: boolean;
        zplcFile: Uint8Array;
        bytecode: Uint8Array;
        assembly: string;
        debugMap: { pou: object };
        summary: { name: string };
      };
      const direct = (await compilerCompile(root)) as unknown as { zplcFile: Uint8Array };
      expect(answer.ok).toBe(true);
      expect(answer.summary.name).toBe('Motor Start Stop');
      expect(answer.zplcFile).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(answer.zplcFile).equals(Buffer.from(direct.zplcFile))).toBe(true);
      expect(answer.bytecode.byteLength).toBeGreaterThan(0);
      expect(typeof answer.assembly).toBe('string');
      expect(Object.keys(answer.debugMap.pou).length).toBeGreaterThan(0);
      expect(await gone(pids[0]!)).toBe(true);
    },
    REAL_PROCESS_TIMEOUT_MS,
  );

  it(
    'answers a compile failure as a result with diagnostics, not as a crash',
    async () => {
      const root = path.join(scratch(), 'broken');
      cpSync(path.join(import.meta.dir, '..', 'projects', 'motor_start_stop'), root, { recursive: true });
      const source = path.join(root, 'src', 'Motor.st');
      writeFileSync(source, 'PROGRAM Motor\nVAR END_VAR\n  Undeclared := 1;\nEND_PROGRAM\n');
      const { spawn } = forkSpawner(path.join(import.meta.dir, 'toolWorker.ts'));
      const answer = (await createToolWorkerHost({ spawn }).run({ operation: 'compile', root }, new AbortController().signal)) as {
        ok: boolean;
        evidence: { diagnostics: unknown[] };
      };
      expect(answer.ok).toBe(false);
      expect(answer.evidence.diagnostics.length).toBeGreaterThan(0);
    },
    REAL_PROCESS_TIMEOUT_MS,
  );

  itNative(
    'cancels a run of scenarios in the real worker and leaves neither the worker nor the runtime behind',
    async () => {
      // the forked worker inherits this process's environment, and the runtime it spawns is the one the guard found
      const earlier = process.env.ZPLC_NATIVE_SIM_BIN;
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      onTestFinished(() => {
        if (earlier === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
        else process.env.ZPLC_NATIVE_SIM_BIN = earlier;
      });
      const root = path.join(scratch(), 'motor');
      cpSync(path.join(import.meta.dir, '..', 'projects', 'motor_start_stop'), root, { recursive: true });
      // Three scenarios of the longest allowed length (10,000 samples): about 70,000 runtime operations, seconds of work in
      // the runtime, far more than the cancel takes to arrive.
      for (const name of ['LongA', 'LongB', 'LongC']) {
        const scenario = {
          schemaVersion: 1,
          id: name,
          tickMs: 10,
          durationMs: 99_990,
          events: [{ atMs: 0, set: { 'Motor.Start': true, 'Motor.Stop': false, 'Motor.EStop': false, 'Motor.Overload': false } }],
          expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': false, 'Motor.Reverse': false } }],
        };
        writeFileSync(path.join(root, 'tests', `${name}.scenario.json`), JSON.stringify(scenario));
      }
      const { spawn, pids } = forkSpawner(path.join(import.meta.dir, 'toolWorker.ts'));
      const host = createToolWorkerHost({ spawn });
      const controller = new AbortController();
      const running = host.run({ operation: 'test', root }, controller.signal);
      await Bun.sleep(600);
      controller.abort();
      const outcome = await settle(running);
      // Either the worker answered its cancelled evidence in time, or the host killed it; both leave nothing running, and the
      // run was cancelled, not finished (a run that completed would be ok).
      if ('error' in outcome) expect(reasonOf(outcome)).toBe('cancelled');
      else
        expect(JSON.stringify((outcome.value as { evidence: { diagnostics: unknown } }).evidence.diagnostics)).toContain('TEST_CANCELLED');
      expect(await gone(pids[0]!)).toBe(true);
      expect(host.active()).toBe(0);
    },
    REAL_PROCESS_TIMEOUT_MS,
  );
});
