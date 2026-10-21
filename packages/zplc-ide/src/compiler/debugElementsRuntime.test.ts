import { afterEach, describe, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { compileSingleFileWithTask, type DebugMap, type PLCLanguage } from './index';
import { elementAtPc, elementBreakpointLine } from './debugElements';

// LNG-004: a breakpoint set on an element of the source the author edited stops the real VM at that element. The program is
// compiled the way a build compiles it, loaded into the native POSIX runtime, and run on its own clock until it stops.
const projects = join(import.meta.dir, '../../projects');
const read = (path: string): string => readFileSync(join(projects, path), 'utf8');

interface Session {
  adapter: NativeAdapter;
  hits: number[];
  stop(): Promise<void>;
}
const open: Session[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((session) => session.stop()));
});

async function session(
  language: PLCLanguage,
  content: string,
  sourceRef: string,
): Promise<{ session: Session; map: DebugMap; ref: string }> {
  const built = compileSingleFileWithTask(content, language, { sourceRef, programName: 'Main' });
  const persist = await mkdtemp(join(tmpdir(), 'zplc-element-breakpoint-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-element-breakpoint',
    clientVersion: productManifest.version,
    environment: { ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_PERSIST_ROOT: persist },
  });
  const adapter = new NativeAdapter(supervisor);
  const hits: number[] = [];
  const current: Session = {
    adapter,
    hits,
    async stop() {
      await adapter.disconnect().catch(() => undefined);
      await supervisor.stopSession().catch(() => undefined);
      await rm(persist, { recursive: true, force: true });
    },
  };
  open.push(current);
  adapter.setEventHandlers({ onBreakpointHit: (pc) => hits.push(pc) });
  await adapter.connect();
  await adapter.loadProgram(built.zplcFile);
  return { session: current, map: built.debugMap, ref: sourceRef };
}

async function runUntilStop(current: Session, pc: number, waitMs = 3000): Promise<number | undefined> {
  expect(await current.adapter.setBreakpoint(pc)).toBe(true);
  await current.adapter.start();
  const deadline = Date.now() + waitMs;
  while (current.hits.length === 0 && Date.now() < deadline) await Bun.sleep(10);
  return current.hits[0];
}

function pcOf(map: DebugMap, ref: string, element: string): number {
  const line = elementBreakpointLine(map, ref, element);
  expect(line).toBeDefined();
  const location = Object.values(map.pou)
    .find((pou) => pou.sourceRef === ref)!
    .breakpoints.find((candidate) => candidate.line === line)!;
  return location.pc;
}

describe('LNG-004 a breakpoint on an element stops the VM at the element', () => {
  itNative(
    'stops at a rung of a Ladder diagram',
    async () => {
      const content = read('blinky/src/main.ld.json');
      const { session: current, map, ref } = await session('LD', content, 'src/main.ld.json');
      const rungs = (JSON.parse(content) as { rungs: Array<{ id: string }> }).rungs;
      const last = rungs[rungs.length - 1]!.id;
      const pc = pcOf(map, ref, `rung:${last}`);

      expect(await runUntilStop(current, pc)).toBe(pc);
      expect(elementAtPc(map, ref, pc)).toMatch(new RegExp(`^rung:${last}`));
    },
    20_000,
  );

  itNative(
    'stops at a block of an FBD diagram',
    async () => {
      const content = read('blinky_fbd/src/main.fbd.json');
      const { session: current, map, ref } = await session('FBD', content, 'src/main.fbd.json');
      const pc = pcOf(map, ref, 'block:not_led');

      expect(await runUntilStop(current, pc)).toBe(pc);
      expect(elementAtPc(map, ref, pc)).toBe('block:not_led');
    },
    20_000,
  );

  itNative(
    'stops at an IL line',
    async () => {
      const content =
        'PROGRAM Main\nVAR\n  Sw AT %IX0.0 : BOOL;\n  Lamp AT %QX0.0 : BOOL;\nEND_VAR\n  LD Sw\n  JMPC skip\n  ST Lamp\nskip: LD Sw\n ' +
        ' ST Lamp\nEND_PROGRAM\n';
      const { session: current, map, ref } = await session('IL', content, 'src/main.il');
      const pc = pcOf(map, ref, 'line:10');

      expect(await runUntilStop(current, pc)).toBe(pc);
      expect(elementAtPc(map, ref, pc)).toBe('line:10');
    },
    20_000,
  );

  const chart = (condition: string) =>
    JSON.stringify({
      name: 'Chart',
      variables: { local: [], outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }] },
      steps: [
        { id: 's_a', name: 'A', isInitial: true, position: { x: 0, y: 0 }, actions: [{ qualifier: 'N', actionName: 'Mark' }] },
        { id: 's_b', name: 'B', isInitial: false, position: { x: 0, y: 100 } },
      ],
      transitions: [{ id: 't_ab', fromStep: 's_a', toStep: 's_b', condition }],
      actions: [{ id: 'mark', name: 'Mark', type: 'ST', body: 'Lamp := TRUE;' }],
    });

  itNative(
    'stops at a transition when it fires, and at a step when it is entered',
    async () => {
      const fired = await session('SFC', chart('TRUE'), 'src/main.sfc.json');
      const firePc = pcOf(fired.map, fired.ref, 'transition:t_ab');
      expect(elementAtPc(fired.map, fired.ref, firePc)).toBe('transition:t_ab/fire');
      expect(await runUntilStop(fired.session, firePc)).toBe(firePc);

      const entered = await session('SFC', chart('TRUE'), 'src/main.sfc.json');
      const enterPc = pcOf(entered.map, entered.ref, 'step:s_b');
      expect(elementAtPc(entered.map, entered.ref, enterPc)).toBe('step:s_b/enter');
      expect(await runUntilStop(entered.session, enterPc)).toBe(enterPc);
    },
    20_000,
  );

  itNative(
    'does not stop at a transition that never fires, though its condition is evaluated on every scan',
    async () => {
      const quiet = await session('SFC', chart('FALSE'), 'src/main.sfc.json');
      const firePc = pcOf(quiet.map, quiet.ref, 'transition:t_ab');
      expect(await runUntilStop(quiet.session, firePc, 600)).toBeUndefined();

      // the evaluation of the condition is on the line the transition's own statement is on: it does run, every scan
      const evaluating = await session('SFC', chart('FALSE'), 'src/main.sfc.json');
      const evaluation = Object.values(evaluating.map.pou)[0]!.sourceMap.find((range) => range.element === 'transition:t_ab')!;
      expect(await runUntilStop(evaluating.session, evaluation.pc)).toBe(evaluation.pc);
    },
    20_000,
  );
});
