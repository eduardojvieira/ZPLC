// LNG-006 end to end: a diagram is built, loaded into the VM of the native runtime and scanned; the values of the
// variables that its debug map names are read from VM memory, and the states of its elements are what the diagram
// would show. The trace is the runtime's, not a recorded guess: the same names, the same addresses.
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect } from 'bun:test';
import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compileSingleFileWithTask, type DebugMap, type PLCLanguage } from '../compiler';
import { cellLocation } from '../conformance/cases';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { readElementStates, variablesOf, type ElementState, type Reading } from './elementStates';
import { resolveVariable } from './debugVariables';

const root = join(import.meta.dir, '../..');

function decode(type: string, bytes: Uint8Array, bit?: number): Reading {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (type.toUpperCase()) {
    case 'BOOL':
      return (bytes[0]! & (1 << (bit ?? 0))) !== 0 || (bit === undefined && bytes[0] !== 0);
    case 'SINT':
      return view.getInt8(0);
    case 'USINT':
    case 'BYTE':
      return view.getUint8(0);
    case 'INT':
      return view.getInt16(0, true);
    case 'UINT':
    case 'WORD':
      return view.getUint16(0, true);
    case 'DINT':
      return view.getInt32(0, true);
    case 'UDINT':
    case 'DWORD':
    case 'TIME':
      return view.getUint32(0, true);
    case 'REAL':
      return view.getFloat32(0, true);
    default:
      return undefined;
  }
}

/** Runs `scans` of the diagram, `inputs` set before each, and returns the states after each scan. */
async function run(options: {
  path: string;
  text?: string;
  language: PLCLanguage;
  scans: number;
  scanMs?: number;
  inputs?: Record<number, Array<{ at: string; value: boolean }>>;
}): Promise<{ map: DebugMap; states: Array<Map<string, ElementState>> }> {
  const text = options.text ?? readFileSync(join(root, options.path), 'utf8');
  const built = compileSingleFileWithTask(text, options.language, {
    sourceRef: options.path,
    programName: 'Main',
    intervalMs: options.scanMs ?? 10,
  });
  const pou = Object.values(built.debugMap.pou).find((candidate) => candidate.sourceRef === options.path)!;
  const persist = await mkdtemp(join(tmpdir(), 'zplc-monitor-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-monitor-test',
    clientVersion: productManifest.version,
    environment: {
      ...process.env,
      ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary,
      ZPLC_PERSIST_ROOT: persist,
      ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1',
    },
  });
  const adapter = new NativeAdapter(supervisor);
  const states: Array<Map<string, ElementState>> = [];
  try {
    await adapter.connect();
    await adapter.loadProgram(built.zplcFile);
    for (let scan = 1; scan <= options.scans; scan++) {
      for (const input of options.inputs?.[scan] ?? []) {
        const { address, bit } = cellLocation(input.at, 'BOOL');
        const [current] = await adapter.peek(address, 1);
        await adapter.pokeN(address, new Uint8Array([input.value ? current! | (1 << bit!) : current! & ~(1 << bit!)]));
      }
      await adapter.scenarioStep((scan - 1) * (options.scanMs ?? 10));
      const values = new Map<string, Reading>();
      for (const variable of variablesOf(pou.monitor ?? [])) {
        const found = resolveVariable(built.debugMap, options.path, variable);
        if (!found) continue;
        values.set(variable, decode(found.type, await adapter.peek(found.address, found.size), found.bitOffset));
      }
      states.push(readElementStates(pou.monitor ?? [], (variable) => values.get(variable)));
    }
    return { map: built.debugMap, states };
  } finally {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
  }
}

describe('online monitoring of the five languages against the real runtime (LNG-006)', () => {
  itNative(
    'Ladder: the power of each element follows the rung through the branch, and the coil holds',
    async () => {
      // StartPB %I0.0, StopPB %I0.1, Overload %I0.2; the rung is Stop NC, Overload NC, (Start NO | seal-in), coil
      const { states } = await run({
        path: 'projects/motor_control/src/main.ld.json',
        language: 'LD',
        scans: 4,
        inputs: { 2: [{ at: '%IX0.0', value: true }], 3: [{ at: '%IX0.0', value: false }], 4: [{ at: '%IX0.1', value: true }] },
      });
      const stop = 'rung:rung_1/cell:0,0';
      const start = 'rung:rung_1/cell:0,2';
      const seal = 'rung:rung_1/cell:1,2';
      const coil = 'rung:rung_1/cell:0,7';
      // nothing pressed: the power reaches the Stop contact and passes it, and stops at the Start contact and the seal-in
      expect(states[0]!.get(stop)).toMatchObject({ power: true, powerOut: true, value: false });
      expect(states[0]!.get(start)).toMatchObject({ power: true, powerOut: false, value: false });
      expect(states[0]!.get(coil)).toMatchObject({ power: false, value: false });
      // Start pressed: the power reaches the coil, and the seal-in contact is powered through the branch
      expect(states[1]!.get(start)).toMatchObject({ power: true, powerOut: true, value: true });
      expect(states[1]!.get(coil)).toMatchObject({ power: true, value: true });
      // Start released: the coil holds itself through the seal-in contact
      expect(states[2]!.get(start)).toMatchObject({ powerOut: false, value: false });
      expect(states[2]!.get(seal)).toMatchObject({ power: true, powerOut: true, value: true });
      expect(states[2]!.get(coil)).toMatchObject({ power: true, value: true });
      // Stop pressed: the power is cut before the branch
      expect(states[3]!.get(stop)).toMatchObject({ power: true, powerOut: false, value: true });
      expect(states[3]!.get(seal)).toMatchObject({ power: false });
      expect(states[3]!.get(coil)).toMatchObject({ power: false, value: false });
    },
    60_000,
  );

  itNative(
    'FBD: the pins of blocks hold the values the runtime computed, by the temporaries the map names',
    async () => {
      const { states } = await run({ path: 'projects/blinky_fbd/src/main.fbd.json', language: 'FBD', scans: 140, scanMs: 10 });
      const first = states[0]!;
      // the OffTimer runs while the LED is off; its Q is not yet true, and its elapsed time is a number
      expect(first.get('block:ton_off')!.pins.Q).toBe(false);
      expect(typeof first.get('block:ton_off')!.pins.ET).toBe('number');
      // the timers of the blinker complete in turn (500 ms each): the pins of both blocks show it
      expect(states.some((state) => state.get('block:ton_off')!.pins.Q === true)).toBe(true);
      expect(states.some((state) => state.get('block:ton_on')!.pins.Q === true)).toBe(true);
      // and the variable block shows the LED it reads changing
      const leds = states.map((state) => state.get('block:var_led_read')!.pins.OUT);
      expect(new Set(leds).size).toBe(2);
    },
    60_000,
  );

  itNative(
    'SFC: the active step, its time, and whether each condition holds and fired, from the chart state',
    async () => {
      const chart = JSON.stringify({
        name: 'Chart',
        variables: { local: [], inputs: [{ name: 'Go', type: 'BOOL', address: '%I0.0' }], outputs: [] },
        steps: [
          { id: 'idle', name: 'Idle', isInitial: true, position: { x: 0, y: 0 } },
          { id: 'work', name: 'Work', isInitial: false, position: { x: 0, y: 200 } },
        ],
        transitions: [
          { id: 'start', fromStep: 'idle', toStep: 'work', condition: 'Go', position: { x: 0, y: 100 } },
          { id: 'finish', fromStep: 'work', toStep: 'idle', condition: 'NOT Go', position: { x: 0, y: 300 } },
        ],
      });
      const { states } = await run({
        path: 'src/chart.sfc.json',
        text: chart,
        language: 'SFC',
        scans: 4,
        inputs: { 3: [{ at: '%IX0.0', value: true }] },
      });
      // scan 1 and 2: idle is active, Go is false: the condition does not hold and nothing fires
      expect(states[0]!.get('step:idle')!.active).toBe(true);
      expect(states[0]!.get('step:work')!.active).toBe(false);
      expect(states[0]!.get('transition:start')).toMatchObject({ condition: false, fired: false });
      // the condition of the transition after the active step is false while Work is not active, and it is shown
      expect(states[0]!.get('transition:finish')!.condition).toBe(true);
      expect(states[0]!.get('transition:finish')!.fired).toBe(false);
      // scan 3: Go is set; the first transition fires and Work becomes the active step
      expect(states[2]!.get('transition:start')).toMatchObject({ condition: true, fired: true });
      expect(states[2]!.get('step:work')!.active).toBe(true);
      expect(states[2]!.get('step:idle')!.active).toBe(false);
      // scan 4: Go is still set, so the second transition's condition is false and Work stays active
      expect(states[3]!.get('transition:finish')).toMatchObject({ condition: false, fired: false });
      expect(states[3]!.get('step:work')!.active).toBe(true);
      expect(typeof states[3]!.get('step:work')!.time).toBe('number');
    },
    60_000,
  );
});
