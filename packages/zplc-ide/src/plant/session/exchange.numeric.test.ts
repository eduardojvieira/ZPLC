import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import productManifest from '../../../../../package.json';
import { NativeSimulationSupervisor } from '../../../shared/nativeSimulationSupervisor';
import { itNative, nativeRuntimeBinary } from '../../cli/nativeRuntimeGuard';
import { compileSingleFileWithTask, type DebugMap } from '../../compiler';
import { NativeAdapter } from '../../runtime/nativeAdapter';
import { listIoMap } from '../../runtime/ioMap';
import type { PlantMapV2, SignalRange } from '../../plants/plantMap';
import { exchangeScan } from '../../test-engine/scenePort';
import type { PlantCore } from '../contracts';
import { exchangeOnce, planExchange } from './exchange';
import { createPlantSession } from './plantSession';

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
const LEVEL = range([0, 1000], [0, 10]);
const TEMP = range([0, 10], [0, 100], 'degC');
const VALVE = range([0, 1000], [0, 100], '%');
const FLOW = range([0, 10], [0, 50], 'L/s');

const vars = {
  Level: v(0, 'INT', 'IPI'),
  Temp: v(4, 'REAL', 'IPI'),
  Start: v(8, 'BOOL', 'IPI', 1),
  Valve: v(0x1000, 'INT', 'OPI'),
  Flow: v(0x1004, 'REAL', 'OPI'),
  Run: v(0x1008, 'BOOL', 'OPI', 3),
};
const ioMap = listIoMap(debug(vars));
const map: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'tank' },
  signals: {
    'level.m': { direction: 'sensor', type: 'INT', point: 'Cell.Level', range: LEVEL },
    'temp.c': { direction: 'sensor', type: 'REAL', point: 'Cell.Temp', range: TEMP },
    'start.pressed': { direction: 'sensor', type: 'BOOL', point: 'Cell.Start' },
    'valve.pct': { direction: 'command', type: 'INT', point: 'Cell.Valve', range: VALVE },
    'flow.lps': { direction: 'command', type: 'REAL', point: 'Cell.Flow', range: FLOW },
    'pump.run': { direction: 'command', type: 'BOOL', point: 'Cell.Run' },
  },
};

/** A runtime memory with a call log; the input image starts with Faceplate bytes the plant does not drive. */
function fakeRuntime(outputImage: Uint8Array) {
  const ipi = new Uint8Array(32).fill(0xaa);
  const calls: string[] = [];
  return {
    ipi,
    calls,
    port: {
      peek: async (address: number, length: number) => {
        calls.push(`peek@${address}+${length}`);
        return address >= 0x1000 ? outputImage.slice(address - 0x1000, address - 0x1000 + length) : ipi.slice(address, address + length);
      },
      pokeN: async (address: number, bytes: Uint8Array) => {
        calls.push(`poke@${address}+${bytes.length}`);
        ipi.set(bytes, address);
      },
    },
  };
}

/** A plant that records what it is told and reports fixed sensor values. */
function fakeCore(sensed: Record<string, boolean | number>) {
  const applied: Array<Record<string, boolean | number>> = [];
  const core = {
    stepMs: 5,
    signals: [],
    apply: (commands: Record<string, boolean | number>) => void applied.push({ ...commands }),
    advance: () => undefined,
    sense: () => sensed,
    operate: () => undefined,
  } as unknown as PlantCore;
  return { core, applied };
}

const outputImage = (valve: number, flow: number, run: boolean) => {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setInt16(0, valve, true);
  view.setFloat32(4, flow, true);
  bytes[8] = run ? 8 : 0;
  return bytes;
};

describe('the numeric slots of the lock-step exchange', () => {
  it('PLT-003 planExchange lays out INT and REAL slots with their widths and offsets', () => {
    const plan = planExchange(map, ioMap);
    expect([plan.inputBase, plan.inputLength, plan.outputBase, plan.outputLength]).toEqual([0, 9, 0x1000, 9]);
    expect(plan.sensors).toEqual([
      { name: 'level.m', byte: 0, width: 2, type: 'INT' },
      { name: 'temp.c', byte: 4, width: 4, type: 'REAL' },
      { name: 'start.pressed', byte: 8, width: 1, type: 'BOOL', bit: 1 },
    ]);
    expect(plan.commands.map(({ name, byte, width, type, bit }) => ({ name, byte, width, type, bit }))).toEqual([
      { name: 'valve.pct', byte: 0, width: 2, type: 'INT', bit: undefined },
      { name: 'flow.lps', byte: 4, width: 4, type: 'REAL', bit: undefined },
      { name: 'pump.run', byte: 8, width: 1, type: 'BOOL', bit: 3 },
    ]);
  });

  it('PLT-003 a REAL sensor is written as float32 little-endian and an INT as int16, after scaling', async () => {
    const plan = planExchange(map, ioMap);
    const rt = fakeRuntime(outputImage(0, 0, false));
    const plant = fakeCore({ 'level.m': 2.5, 'temp.c': 25, 'start.pressed': true });
    await exchangeOnce(plant.core, rt.port, map, plan, 5, 5);
    const view = new DataView(rt.ipi.buffer);
    expect(view.getInt16(0, true)).toBe(250); // 2.5 m of 0..10 on 0..1000
    expect(view.getFloat32(4, true)).toBe(2.5); // 25 degC of 0..100 on 0..10
    expect(rt.ipi[8]).toBe(0xaa | 2); // the Start bit set, the Faceplate bits kept
    expect([rt.ipi[2], rt.ipi[3], rt.ipi[9]]).toEqual([0xaa, 0xaa, 0xaa]); // bytes the plant map does not drive are kept
  });

  it('PLT-003 a REAL and an INT command are read from the output image and scaled to engineering units', async () => {
    const plan = planExchange(map, ioMap);
    const rt = fakeRuntime(outputImage(500, 2.5, true));
    const plant = fakeCore({});
    await exchangeOnce(plant.core, rt.port, map, plan, 5, 5);
    expect(plant.applied).toEqual([{ 'valve.pct': 50, 'flow.lps': 12.5, 'pump.run': true }]);
  });

  it('PLT-003 a value outside its range saturates and never wraps', async () => {
    const plan = planExchange(map, ioMap);
    const rt = fakeRuntime(outputImage(32767, 1000, false));
    const plant = fakeCore({ 'level.m': 99, 'temp.c': -40 });
    await exchangeOnce(plant.core, rt.port, map, plan, 5, 5);
    expect(plant.applied[0]).toEqual({ 'valve.pct': 100, 'flow.lps': 50, 'pump.run': false });
    const view = new DataView(rt.ipi.buffer);
    expect([view.getInt16(0, true), view.getFloat32(4, true)]).toEqual([1000, 0]);
  });

  it('LNK-002 a numeric signal bound to a variable of another type is a located problem', () => {
    const wrong: PlantMapV2 = {
      ...map,
      signals: { 'level.m': { direction: 'sensor', type: 'REAL', point: 'Cell.Level', range: LEVEL } },
    };
    expect(() => planExchange(wrong, ioMap)).toThrow('level.m: Cell.Level is INT, the signal is REAL');
  });

  it('LNK-002 a numeric signal needs its range in the map', () => {
    const bare: PlantMapV2 = { ...map, signals: { 'level.m': { direction: 'sensor', type: 'INT', point: 'Cell.Level' } } };
    expect(() => planExchange(bare, ioMap)).toThrow('level.m: a numeric signal needs its range in the map');
  });

  it('LNK-003 one read of the output image and one write of the input image per scan, numeric slots included', async () => {
    const plan = planExchange(map, ioMap);
    const rt = fakeRuntime(outputImage(0, 0, false));
    const plant = fakeCore({ 'level.m': 1, 'temp.c': 1 });
    await exchangeOnce(plant.core, rt.port, map, plan, 5, 5);
    expect(rt.calls).toEqual(['peek@4096+9', 'peek@0+9', 'poke@0+9']);
  });

  it('PLT-016 a span of more than 64 bytes counts the widths of the slots and says what to do', () => {
    // 62 + 4 = 66 bytes: the last address alone would say 63
    const far = ioMap.inputs.map((input) => (input.path === 'Cell.Temp' ? { ...input, address: 62 } : input));
    const tight = ioMap.inputs.map((input) => (input.path === 'Cell.Temp' ? { ...input, address: 60 } : input));
    const message = 'the sensors span 66 bytes; one exchange carries at most 64; map them closer together';
    expect(() => planExchange(map, { ...ioMap, inputs: far.map((i) => (i.path === 'Cell.Start' ? { ...i, address: 2 } : i)) })).toThrow(
      message,
    );
    expect(() =>
      planExchange(map, { ...ioMap, inputs: tight.map((i) => (i.path === 'Cell.Start' ? { ...i, address: 2 } : i)) }),
    ).not.toThrow();
  });

  it('PLT-003 a numeric slot never overlaps a BOOL bit another signal owns', () => {
    const clash = ioMap.inputs.map((input) => (input.path === 'Cell.Start' ? { ...input, address: 1 } : input));
    expect(() => planExchange(map, { ...ioMap, inputs: clash })).toThrow(
      'level.m and start.pressed share a byte of the sensors image; a numeric signal needs its own bytes',
    );
  });

  it('PLT-003 the BOOL behaviour of M1 holds', async () => {
    const boolMap: PlantMapV2 = {
      schemaVersion: 2,
      target: { scene: 'cell' },
      signals: {
        'pump.run': { direction: 'command', type: 'BOOL', point: 'Cell.Run' },
        'start.pressed': { direction: 'sensor', type: 'BOOL', point: 'Cell.Start' },
      },
    };
    const plan = planExchange(boolMap, ioMap);
    expect([plan.inputBase, plan.inputLength, plan.outputBase, plan.outputLength]).toEqual([8, 1, 0x1008, 1]);
    const rt = fakeRuntime(outputImage(0, 0, true));
    const plant = fakeCore({ 'start.pressed': true });
    await exchangeOnce(plant.core, rt.port, boolMap, plan, 5, 5);
    expect(plant.applied).toEqual([{ 'pump.run': true }]);
    expect(rt.ipi[8]).toBe(0xaa | 2);
  });
});

// The program echoes its input image into its output image, so a value is seen on both sides of the scaling.
const SOURCE = `PROGRAM Echo
VAR
  Level AT %IW0 : INT;
  Temp AT %ID1 : REAL;
END_VAR
VAR_OUTPUT
  Valve AT %QW0 : INT;
  Flow AT %QD1 : REAL;
END_VAR
Valve := Level;
Flow := Temp;
END_PROGRAM`;
const built = compileSingleFileWithTask(SOURCE, 'ST', { programName: 'Echo', intervalMs: 10 });
const echoIo = listIoMap(built.debugMap);
const echoMap: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'echo' },
  signals: {
    'level.m': { direction: 'sensor', type: 'INT', point: 'Echo.Level', range: LEVEL },
    'temp.c': { direction: 'sensor', type: 'REAL', point: 'Echo.Temp', range: TEMP },
    'valve.pct': { direction: 'command', type: 'INT', point: 'Echo.Valve', range: VALVE },
    'flow.lps': { direction: 'command', type: 'REAL', point: 'Echo.Flow', range: FLOW },
  },
};
const SCANS = 12;
/** The plant raises its level and temperature a little every advance and records what the program commanded. */
function ramp() {
  let n = 0;
  const applied: Array<Record<string, boolean | number>> = [];
  const core = {
    stepMs: 5,
    signals: [],
    apply: (commands: Record<string, boolean | number>) => void applied.push({ ...commands }),
    advance: () => void (n += 1),
    sense: () => ({ 'level.m': n * 0.5, 'temp.c': n * 7 }),
    operate: () => undefined,
  } as unknown as PlantCore;
  return { core, applied };
}

const open: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of open.splice(0)) await stop();
});
async function nativeAdapter(): Promise<NativeAdapter> {
  const persist = await mkdtemp(join(tmpdir(), 'zplc-plant-numeric-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-plant-numeric',
    clientVersion: productManifest.version,
    environment: { ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_PERSIST_ROOT: persist },
  });
  const adapter = new NativeAdapter(supervisor);
  open.push(async () => {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
  });
  await adapter.connect();
  await adapter.loadProgram(built.zplcFile);
  return adapter;
}

describe('numeric signals over the real native runtime', () => {
  itNative(
    'PLT-003 PLT-017 a numeric sensor reaches the program scaled and a numeric command reaches the plant scaled, live equals graded',
    async () => {
      const liveAdapter = await nativeAdapter();
      const liveCore = ramp();
      const session = createPlantSession({
        core: liveCore.core,
        runtime: liveAdapter,
        map: echoMap,
        ioMap: echoIo,
        paceMs: async () => {
          if (session.scans >= SCANS) session.pause();
        },
      });
      open.push(() => session.stop().catch(() => undefined));
      await session.start();
      await session.settled();
      expect(session.scans).toBe(SCANS);

      // The graded path: the same exchangeScan with raw closures over the same memory, then the runtime's own scan.
      const adapter = await nativeAdapter();
      await adapter.setClockMode('virtual');
      const gradedCore = ramp();
      const port = { core: gradedCore.core, map: echoMap };
      const at = (name: string) => echoIo.inputs.find((i) => i.path === name)!.address;
      let image: Uint8Array = new Uint8Array(16);
      for (let scan = 0; scan < SCANS; scan += 1) {
        await exchangeScan(
          port,
          async (point) => {
            if (scan === 0) return 0;
            const view = new DataView(image.buffer);
            return point === 'Echo.Valve' ? view.getInt16(0, true) : view.getFloat32(4, true);
          },
          async (sensed) => {
            const bytes = new Uint8Array(8);
            const view = new DataView(bytes.buffer);
            view.setInt16(0, sensed['level.m'] as number, true);
            view.setFloat32(4, sensed['temp.c'] as number, true);
            await adapter.pokeN(at('Echo.Level'), bytes);
          },
          scan * 10,
          10,
        );
        await adapter.scenarioStep(scan * 10);
        image = await adapter.peek(echoIo.outputs[0]!.address, 8);
      }

      expect(liveCore.applied.length).toBe(SCANS);
      expect(liveCore.applied[0]).toEqual({ 'valve.pct': 0, 'flow.lps': 0 });
      // After scan i-1 the plant senses i * 0.5 m and i * 7 degC; the program echoes the raw values (i * 50, i * 0.7) and the
      // plant reads them back scaled by the command ranges: i * 5 % and i * 3.5 L/s.
      for (let i = 1; i < SCANS; i += 1) {
        expect(liveCore.applied[i]!['valve.pct']).toBeCloseTo(i * 5, 9);
        expect(liveCore.applied[i]!['flow.lps']).toBeCloseTo(i * 3.5, 3);
      }
      expect(gradedCore.applied).toEqual(liveCore.applied);
    },
  );
});
