import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../../compiler';
import { listIoMap } from '../../runtime/ioMap';
import type { PlantMapV2, SignalRange } from '../../plants/plantMap';
import type { PlantCore } from '../contracts';
import { exchangeOnce, planExchange } from '../session/exchange';
import { createPlantIoController, type PlantIoController } from './boardPlantLink';
import { createFakeBoard, type FakeBoardOptions } from './fakeBoard';

const layout = {
  ipiBase: 0,
  ipiSize: 128,
  opiBase: 0x1000,
  opiSize: 128,
  workBase: 0x2000,
  workSize: 1,
  retainBase: 0x3000,
  retainSize: 1,
  codeBase: 0x4000,
  codeSize: 1,
};
const v = (addr: number, type: 'BOOL' | 'INT' | 'REAL', region: 'IPI' | 'OPI', bitOffset?: number) => ({
  addr,
  type,
  region,
  size: type === 'REAL' ? 4 : type === 'INT' ? 2 : 1,
  ...(bitOffset === undefined ? {} : { bitOffset }),
});
const debug = (vars: Record<string, ReturnType<typeof v>>): DebugMap => ({
  version: '1.0.0',
  programName: 'Cell',
  compilerVersion: 'test',
  generatedAt: '',
  memoryLayout: layout,
  pou: { Cell: { type: 'PROGRAM', sourceMap: [], breakpoints: [], vars } },
});
const range = (raw: [number, number], eng: [number, number], unit = 'm'): SignalRange => ({
  raw_min: raw[0],
  raw_max: raw[1],
  eng_min: eng[0],
  eng_max: eng[1],
  unit,
});
const ioMap = listIoMap(
  debug({
    Level: v(0, 'INT', 'IPI'),
    Temp: v(4, 'REAL', 'IPI'),
    Start: v(8, 'BOOL', 'IPI', 1),
    Valve: v(0x1000, 'INT', 'OPI'),
    Flow: v(0x1004, 'REAL', 'OPI'),
    Run: v(0x1008, 'BOOL', 'OPI', 3),
  }),
);
const map: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'tank' },
  signals: {
    'level.m': { direction: 'sensor', type: 'INT', point: 'Cell.Level', range: range([0, 1000], [0, 10]) },
    'temp.c': { direction: 'sensor', type: 'REAL', point: 'Cell.Temp', range: range([0, 10], [0, 100], 'degC') },
    'start.pressed': { direction: 'sensor', type: 'BOOL', point: 'Cell.Start' },
    'valve.pct': { direction: 'command', type: 'INT', point: 'Cell.Valve', range: range([0, 1000], [0, 100], '%') },
    'flow.lps': { direction: 'command', type: 'REAL', point: 'Cell.Flow', range: range([0, 10], [0, 50], 'L/s') },
    'pump.run': { direction: 'command', type: 'BOOL', point: 'Cell.Run' },
  },
};

type Sensed = Record<string, boolean | number>;
function stubCore(sensed: Sensed = { 'level.m': 5, 'temp.c': 50, 'start.pressed': true }) {
  const applied: Record<string, boolean | number>[] = [];
  const advances: number[] = [];
  const core = {
    stepMs: 5,
    signals: [],
    apply: (c: Record<string, boolean | number>) => void applied.push({ ...c }),
    advance: (ms: number) => void advances.push(ms),
    sense: () => sensed,
  } as unknown as PlantCore;
  return { core, applied, advances, sensed };
}

const yieldTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await yieldTurn();
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The board's program outputs: Valve 500, Flow 2.5, Run true, in the order of the output descriptors. */
const program = (): FakeBoardOptions['program'] => () => [500, 2.5, true];

function setup(
  options: FakeBoardOptions & {
    rtt?: number[];
    frameMs?: number;
    timeoutMs?: number;
    sensed?: Sensed;
    pulse?: number;
    supported?: boolean;
  } = {},
) {
  const clock = { t: 0 };
  const stub = stubCore(options.sensed);
  let frames = 0;
  const board = createFakeBoard({
    program: program(),
    ...options,
    beforeAnswer: async (seq) => {
      clock.t += options.rtt?.[frames++] ?? 8;
      await options.beforeAnswer?.(seq);
    },
  });
  const controller: PlantIoController = createPlantIoController({
    link: board.port,
    core: stub.core,
    map,
    ioMap,
    scanMs: 10,
    frameMs: options.frameMs ?? 20,
    timeoutMs: options.timeoutMs ?? 500,
    shortestPulseMs: options.pulse,
    now: () => clock.t,
    pace: async (ms) => {
      clock.t += ms;
      await yieldTurn();
    },
  });
  return { clock, board, controller, ...stub };
}

describe('board plant link', () => {
  it('start enters with the layout of planExchange and mirror off', async () => {
    const { board, controller } = setup();
    await controller.start();
    const wanted = planExchange(map, ioMap);
    expect(controller.snapshot().phase).toBe('active');
    expect(board.state.inputs).toHaveLength(wanted.sensors.length);
    expect(board.state.outputs).toHaveLength(wanted.commands.length);
    expect(board.state.inputs).toContainEqual({ offset: 8, type: 'BOOL', bit: 1 });
    expect(board.state.outputs).toContainEqual({ offset: 8, type: 'BOOL', bit: 3 });
    expect(board.state.mirror).toBe(false);
    expect(controller.snapshot().mirror).toBe(false);
    await controller.stop();
  });

  it('a frame carries the sensors in descriptor order and the response commands reach the core', async () => {
    const { board, controller, applied } = setup();
    await controller.start();
    await until(() => board.received.length >= 3 && applied.length >= 3, 'three frames');
    const byOffset = (i: number) => (slot: { offset: number; bit?: number }) =>
      board.received[i]!.inputs[board.state.inputs.findIndex((d) => d.offset === slot.offset && d.bit === slot.bit)];
    expect(byOffset(1)({ offset: 0 })).toBe(500);
    expect(byOffset(1)({ offset: 4 })).toBe(5);
    expect(byOffset(1)({ offset: 8, bit: 1 })).toBe(true);
    // the first answer is the board's initial image; the program's outputs arrive with the second
    expect(applied.at(-1)).toEqual({ 'valve.pct': 50, 'flow.lps': 12.5, 'pump.run': true });
    await controller.stop();
  });

  it('a scene run against the fake board reaches the same facts as the same scene against the simulated runtime', async () => {
    const { board, controller, applied } = setup();
    await controller.start();
    await until(() => applied.length >= 3, 'frames');
    const simulated = stubCore();
    const opi = new Uint8Array(16);
    new DataView(opi.buffer).setInt16(0, 500, true);
    new DataView(opi.buffer).setFloat32(4, 2.5, true);
    opi[8] = 1 << 3;
    await exchangeOnce(
      simulated.core,
      {
        peek: async (address, length) =>
          address >= 0x1000 ? opi.slice(address - 0x1000, address - 0x1000 + length) : new Uint8Array(length),
        pokeN: async () => {},
      },
      map,
      planExchange(map, ioMap),
      5,
      10,
    );
    expect(applied.at(-1)).toEqual(simulated.applied.at(-1)!);
    expect(board.received.length).toBeGreaterThan(0);
    await controller.stop();
  });

  it('INT and REAL signals round trip with their ranges', async () => {
    const { board, controller } = setup({ sensed: { 'level.m': 1e9, 'temp.c': -50, 'start.pressed': false } });
    await controller.start();
    await until(() => board.received.length >= 2, 'frames');
    const at = (offset: number) => board.received[1]!.inputs[board.state.inputs.findIndex((d) => d.offset === offset)];
    expect(at(0)).toBe(1000); // saturates at the raw range, never wraps (R-S2)
    expect(at(4)).toBe(0);
    await controller.stop();
  });

  it('rtt and gap statistics come from every exchange', async () => {
    const { board, controller } = setup({ rtt: [8, 8, 40, 8] });
    await controller.start();
    await until(() => board.received.length >= 5, 'frames');
    const snap = controller.snapshot();
    expect(snap.rttMs.max).toBe(40);
    expect(snap.gapMs.worst).toBe(52); // frame 3 answered 40 ms after it was sent, 52 ms after the previous answer
    expect(snap.frames).toBeGreaterThanOrEqual(4);
    await controller.stop();
  });

  it('late and rejected counters come from the response', async () => {
    const { board, controller } = setup({ scansPerFrame: 3 });
    await controller.start();
    board.state.rejected = 2;
    await until(() => controller.snapshot().late >= 4 && controller.snapshot().rejected === 2, 'late and rejected');
    await controller.stop();
  });

  it('a device exit event ends the controller in phase left with the reason and pauses the plant', async () => {
    const { board, controller, advances } = setup();
    await controller.start();
    await until(() => advances.length >= 3, 'advances');
    board.raiseExit('RUN_CONTROL');
    expect(controller.snapshot()).toMatchObject({ phase: 'left', reason: 'RUN_CONTROL' });
    const stopped = advances.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(advances.length).toBe(stopped);
  });

  it('a missed response for more than timeoutMs exits and leaves', async () => {
    const { board, controller, advances } = setup({
      timeoutMs: 50,
      beforeAnswer: (seq) => (seq >= 3 ? new Promise<void>(() => {}) : undefined),
    });
    await controller.start();
    await until(() => controller.snapshot().phase === 'left', 'left');
    expect(controller.snapshot().reason).toBe('TIMEOUT');
    await until(() => !board.state.active, 'the exit request');
    const stopped = advances.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(advances.length).toBe(stopped);
  });

  it('stop sends exit, pauses the plant and leaves it in left', async () => {
    const { board, controller, advances } = setup();
    await controller.start();
    await until(() => advances.length >= 2, 'advances');
    await controller.stop();
    expect(board.state.active).toBe(false);
    expect(controller.snapshot()).toMatchObject({ phase: 'left', reason: 'CLOSED' });
    const stopped = advances.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(advances.length).toBe(stopped);
  });

  it('setMirror sends PLANT_MIRROR and the snapshot flag follows only the response', async () => {
    const { board, controller } = setup();
    await controller.start();
    expect(controller.snapshot().mirror).toBe(false);
    await controller.setMirror(true);
    expect(board.state.mirror).toBe(true);
    expect(controller.snapshot().mirror).toBe(true);
    await controller.setMirror(false);
    expect(controller.snapshot().mirror).toBe(false);
    await controller.stop();
  });

  it('pulseWarning appears when the rolling worst gap plus scanMs exceeds the shortest pulse and not otherwise', async () => {
    const slow = setup({ rtt: [8, 40, 8], pulse: 50 });
    await slow.controller.start();
    await until(() => slow.board.received.length >= 4, 'frames');
    expect(slow.controller.snapshot().pulseWarning).toMatchObject({ sceneMs: 50, scanMs: 10 });
    await slow.controller.stop();
    const fine = setup({ rtt: [8, 8, 8], pulse: 500 });
    await fine.controller.start();
    await until(() => fine.board.received.length >= 4, 'frames');
    expect(fine.controller.snapshot().pulseWarning).toBeUndefined();
    await fine.controller.stop();
  });

  it('unsupported firmware: phase unsupported with the reason in both languages and no frame is ever sent', async () => {
    const { board, controller } = setup({ supported: false });
    await controller.start();
    const snap = controller.snapshot();
    expect(snap.phase).toBe('unsupported');
    expect(snap.unsupported?.en.length).toBeGreaterThan(0);
    expect(snap.unsupported?.es.length).toBeGreaterThan(0);
    expect(board.received).toHaveLength(0);
    expect(board.state.active).toBe(false);
  });

  it('start refuses without a mapped signal or when planExchange throws, with the located message', async () => {
    const empty = createPlantIoController({
      ...setupPorts(),
      map: { schemaVersion: 2, target: { scene: 'x' }, signals: {} },
    });
    await expect(empty.start()).rejects.toThrow(/no signal/);
    expect(empty.snapshot().phase).toBe('idle');
    const broken = createPlantIoController({
      ...setupPorts(),
      map: { ...map, signals: { ...map.signals, 'start.pressed': { direction: 'sensor', type: 'BOOL', point: 'Cell.Missing' } } },
    });
    await expect(broken.start()).rejects.toThrow(/Cell\.Missing/);
    expect(broken.snapshot().phase).toBe('idle');
  });
});

function setupPorts() {
  const board = createFakeBoard();
  return { link: board.port, core: stubCore().core, map, ioMap, scanMs: 10, frameMs: 20, timeoutMs: 500 };
}
