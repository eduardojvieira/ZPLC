/**
 * The session of a try-it lab on a lesson reading page (LRN-041): a small Ladder program that the learner runs inside the
 * text. This module is the one place where a Learn page reaches a simulation, and it reaches only its own WebAssembly
 * adapter: never the native session, the serial or connection-manager adapters, the debug controller or the store.
 *
 * It builds the program the way Studio builds a one-file program (`compileSingleFileWithTask`, one cyclic task of 10 ms), so
 * the lab runs what the compiler and the runtime do, and the debug map carries the monitor entries that the power flow of a
 * rung is read from (`compileProject` alone returns neither). Nothing runs until the learner asks: `openTryLab` only
 * compiles; the first `run` creates the session, loads the program and starts it.
 *
 * The verbs describe the lab, not a device, so the Learn code that drives it (src/learn/reading) holds no device operation
 * (tools/ci/learn-physical-guard.ts): `run`, `hold`, `restart`, `press`, `readings` and `close`.
 */
import type { DebugMap } from '@zplc/compiler';
import { compileSingleFileWithTask } from '../compiler';
import { debugPouOf } from '../compiler/debugElements';
import { describePolledDebugVariable } from '../hooks/debugPollingPaths';
import type { MonitorEntry } from '../models/sourceElements';
import { monitorKey, parseMonitorKey, resolveVariable } from '../monitoring/debugVariables';
import { readElementStates, variablesOf, type ElementState, type Read } from '../monitoring/elementStates';
import type { IDebugAdapter, WatchVariable } from './debugAdapter';
import { inputWrite, type DeclaredInput } from './declaredInputs';
import { latestWins } from './faceplateState';
import { createWASMAdapter } from './wasmAdapter';

/** What a lab needs to name: the program file, and the variables it shows or sets. A `LdTryData` of a reading page is one. */
export interface TryLabSpec {
  src: string;
  inputs: ReadonlyArray<{ name: string }>;
  outputs: readonly string[];
  timing?: readonly string[];
}

/** The part of an adapter that the lab uses. */
export type TryLabAdapter = Pick<
  IDebugAdapter,
  'connect' | 'disconnect' | 'loadProgram' | 'start' | 'stop' | 'pause' | 'resume' | 'reset' | 'peek' | 'setValue' | 'readWatchVariables'
>;

export interface TryLabReadings {
  /** The value of a variable of the program, or undefined when it was not read. */
  read: Read;
  /** The state of each element of the rungs, by element id. */
  states: ReadonlyMap<string, ElementState>;
}

export interface TryLab {
  /** Starts the program, or continues it after `hold`. The first call opens the session. */
  run(): Promise<void>;
  /** Freezes the program where it is. */
  hold(): Promise<void>;
  /** Puts the program back to its first state; `run` starts it again. */
  restart(): Promise<void>;
  /** Sets an input; the program sees it at the start of its next scan. */
  press(name: string, on: boolean): Promise<void>;
  readings(): Promise<TryLabReadings>;
  /** Ends the session. Safe to call again, and before `run`. */
  close(): Promise<void>;
}

export type TryLabOpening =
  { ok: true; lab: TryLab } | { ok: false; reason: 'compile'; message: string } | { ok: false; reason: 'input' | 'output'; name: string };

interface Plan {
  zplcFile: Uint8Array;
  debugMap: DebugMap;
  entries: readonly MonitorEntry[];
  inputs: Map<string, DeclaredInput>;
  polled: WatchVariable[];
}

type Planned = { ok: true; plan: Plan } | Exclude<TryLabOpening, { ok: true }>;

/** Builds the program of a lab and resolves its names through the debug map. Pure: no adapter is made. */
export function planTryLab(content: string, spec: TryLabSpec): Planned {
  let built: ReturnType<typeof compileSingleFileWithTask>;
  try {
    const name = (JSON.parse(content) as { name?: unknown }).name;
    built = compileSingleFileWithTask(content, 'LD', {
      sourceRef: spec.src,
      programName: typeof name === 'string' && name !== '' ? name : 'Main',
    });
  } catch (error) {
    return { ok: false, reason: 'compile', message: error instanceof Error ? error.message : String(error) };
  }
  const { debugMap } = built;
  const pou = debugPouOf(debugMap, spec.src);
  const inputs = new Map<string, DeclaredInput>();
  for (const { name } of spec.inputs) {
    // an input of a lab is a variable of the program, mapped to the input image or not
    const found = resolveVariable(debugMap, spec.src, name);
    if (!found || found.type !== 'BOOL') return { ok: false, reason: 'input', name };
    const region = found.region === 'IPI' ? 'IPI' : 'WORK';
    inputs.set(name, {
      path: found.path,
      pou: '',
      name,
      type: found.type,
      region,
      address: found.address,
      size: found.size,
      ...(found.bitOffset === undefined ? {} : { bitOffset: found.bitOffset }),
      origin: region === 'IPI' ? 'mapped' : 'program-input',
    });
  }
  for (const output of spec.outputs) if (!pou?.vars[output]) return { ok: false, reason: 'output', name: output };

  const entries = pou?.monitor ?? [];
  const wanted = new Set([...variablesOf(entries), ...inputs.keys(), ...spec.outputs, ...(spec.timing ?? [])]);
  const polled: WatchVariable[] = [];
  for (const variable of wanted) {
    const described = describePolledDebugVariable(debugMap, monitorKey(spec.src, variable));
    if (described)
      polled.push({
        name: described.name,
        address: described.address,
        type: described.type,
        forceable: false,
        bitOffset: described.bitOffset,
      });
  }
  return { ok: true, plan: { zplcFile: built.zplcFile, debugMap, entries, inputs, polled } };
}

/** What a poll read, by variable name; a variable without a value is unavailable, never FALSE. */
export function readingsOf(results: readonly WatchVariable[]): Read {
  const values = new Map<string, WatchVariable['value']>();
  for (const result of results) {
    const parsed = parseMonitorKey(result.name);
    if (parsed && result.value !== undefined) values.set(parsed.variable, result.value);
  }
  return (variable) => values.get(variable);
}

/** Opens a lab: compiles its program and returns the session, which has made no adapter yet. It runs on the WebAssembly runtime. */
export const openTryLab = (content: string, spec: TryLabSpec): TryLabOpening => openTryLabWith(content, spec, createWASMAdapter);

/** Opens a lab on an adapter of the caller's. For tests only: the Learn guard (LRN-015) refuses it in Learn sources. */
export function openTryLabWith(content: string, spec: TryLabSpec, createAdapter: () => TryLabAdapter): TryLabOpening {
  const planned = planTryLab(content, spec);
  if (!planned.ok) return planned;
  const { plan } = planned;

  let adapter: TryLabAdapter | undefined;
  let opening: Promise<TryLabAdapter> | undefined;
  let closed = false;
  let started = false;
  const senders = new Map<string, (on: boolean) => Promise<void>>();

  const session = (): Promise<TryLabAdapter> =>
    (opening ??= (async () => {
      const made = createAdapter();
      adapter = made;
      await made.connect();
      if (!closed) await made.loadProgram(plan.zplcFile);
      if (closed) {
        await made.disconnect().catch(() => undefined);
        throw new Error('The simulation was closed.');
      }
      return made;
    })());
  const live = (): TryLabAdapter => {
    if (!adapter || closed) throw new Error('The simulation is not running.');
    return adapter;
  };

  const lab: TryLab = {
    async run() {
      const made = await session();
      if (closed) return;
      if (started) await made.resume();
      else await made.start();
      started = true;
    },
    async hold() {
      await live().pause();
    },
    async restart() {
      await live().reset();
      started = false;
    },
    async press(name, on) {
      const input = plan.inputs.get(name);
      if (!input) throw new Error(`${name} is not an input of this lab`);
      let send = senders.get(name);
      if (!send) {
        send = latestWins(async (value: boolean) => {
          const made = live();
          // the typed write of the I/O faceplate (LRN-017): a bit of a shared byte keeps the others
          const byte = input.bitOffset !== undefined ? (await made.peek(input.address, 1))[0] : undefined;
          const write = inputWrite(input, value, byte);
          await made.setValue(write.address, write.bytes);
        });
        senders.set(name, send);
      }
      await send(on);
    },
    async readings() {
      const results = await live().readWatchVariables(plan.polled.map((variable) => ({ ...variable })));
      const read = readingsOf(results);
      return { read, states: readElementStates(plan.entries, read) };
    },
    async close() {
      if (closed) return;
      closed = true;
      const made = adapter ?? (await opening?.catch(() => undefined));
      await made?.stop().catch(() => undefined);
      await made?.disconnect().catch(() => undefined);
    },
  };
  return { ok: true, lab };
}
