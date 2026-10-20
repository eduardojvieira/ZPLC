import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compileSingleFileWithTask, type PLCLanguage } from '../compiler';
import { getDefaultPorts, isFunctionBlock, type FBDBlock, type FBDConnection, type FBDModel, type FBDPort } from '../models/fbd';
import { getToolboxItems } from '../models/ld';
import { LD_COIL_TYPES, LD_CONTACT_TYPES } from '../models/ldSupport';
import { SFC_PALETTE } from '../models/sfcSupport';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { getBlockCategories, getFunctionBlockNamesForVisualEditors } from '../catalog/blockCatalog';
import { fbdPaletteBlocks } from './fbd/palette';

// LNG-007: every element that a palette offers is placed in a program, built, loaded into the real VM and run. The lists
// are the ones the palettes read, so an element that is added to a palette without a scenario here fails this file.
const IN = { Sw: { byte: 0x0000, bit: 0 }, Sw2: { byte: 0x0000, bit: 1 } } as const;
const OUT = { Lamp: { byte: 0x1000, bit: 0 } } as const;
type Inputs = Partial<Record<keyof typeof IN, boolean>>;
type Expected = Partial<Record<keyof typeof OUT, boolean>> & { Count?: number };

interface Scan { in?: Inputs; out?: Expected }

const open: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((stop) => stop()));
});

/** Compile the program the way a build does, run it for the scans on the virtual clock, and return the differences from the expected outputs. */
async function run(language: PLCLanguage, content: string, scans: Scan[]): Promise<string[]> {
  const built = compileSingleFileWithTask(content, language, { sourceRef: `src/main.${language.toLowerCase()}`, programName: 'Main', intervalMs: 10 });
  const persist = await mkdtemp(join(tmpdir(), 'zplc-palette-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-palette',
    clientVersion: productManifest.version,
    environment: { ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_PERSIST_ROOT: persist, ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1' },
  });
  const adapter = new NativeAdapter(supervisor);
  open.push(async () => {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
  });
  await adapter.connect();
  await adapter.loadProgram(built.zplcFile);
  const failures: string[] = [];
  const inputs = new Map<string, boolean>();
  for (const [index, scan] of scans.entries()) {
    for (const [name, value] of Object.entries(scan.in ?? {}) as Array<[keyof typeof IN, boolean]>) inputs.set(name, value);
    let image = 0;
    for (const [name, value] of inputs) if (value) image |= 1 << IN[name as keyof typeof IN].bit;
    await adapter.pokeN(IN.Sw.byte, new Uint8Array([image]));
    await adapter.scenarioStep(index * 10);
    for (const [name, wanted] of Object.entries(scan.out ?? {}) as Array<[string, boolean | number]>) {
      if (name === 'Count') {
        const [low, high] = await adapter.peek(0x1002, 2);
        const seen = (low! | (high! << 8)) << 16 >> 16;
        if (seen !== wanted) failures.push(`scan ${index + 1}: Count is ${seen}, expected ${wanted}`);
      } else {
        const place = OUT[name as keyof typeof OUT];
        const [byte] = await adapter.peek(place.byte, 1);
        const seen = (byte! & (1 << place.bit)) !== 0;
        if (seen !== wanted) failures.push(`scan ${index + 1}: ${name} is ${seen}, expected ${wanted}`);
      }
    }
  }
  return failures;
}

// =============================================================================
// Ladder
// =============================================================================

interface LdCellSpec { id: string; type: string; variable?: string; fbType?: string; instance?: string; parameters?: Record<string, string> }
const wire = { element: null, hasWire: true };
const placed = (spec: LdCellSpec, col: number, row = 0) => ({ element: { ...spec, row, col }, hasWire: true });

function ldProgram(rungs: Array<{ cells: LdCellSpec[]; branch?: LdCellSpec }>, local: Array<{ name: string; type: string }> = []): string {
  return JSON.stringify({
    name: 'Palette',
    variables: {
      local,
      inputs: [{ name: 'Sw', type: 'BOOL', address: '%IX0.0' }, { name: 'Sw2', type: 'BOOL', address: '%IX0.1' }],
      outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }],
    },
    rungs: rungs.map((rung, index) => {
      const cols = Math.max(rung.cells.length, 2);
      const row0 = Array.from({ length: cols }, (_, col) => (rung.cells[col] ? placed(rung.cells[col]!, col) : wire));
      const grid = rung.branch
        ? [row0, Array.from({ length: cols }, (_, col) => (col === 0 ? placed(rung.branch!, 0, 1) : { element: null, hasWire: false }))]
        : [row0];
      return {
        id: `rung_${index + 1}`, number: index + 1,
        gridConfig: { rows: grid.length, cols, cellWidth: 80, cellHeight: 60 },
        grid,
        branches: rung.branch ? [{ id: 'br', startCol: 0, endCol: 0, rows: [0, 1] }] : [],
        verticalLinks: [],
      };
    }),
  });
}

const contact = (type: string, variable: string, id = type): LdCellSpec => ({ id, type, variable });
const coil = (type: string, variable = 'Lamp', id = type): LdCellSpec => ({ id, type, variable });

const toggled = (values: boolean[]): Scan[] => values.map((value) => ({ in: { Sw: value } }));

/** What each contact and coil does, scan by scan; the table is keyed by the type, so a type without a scenario does not compile. */
const CONTACTS: Record<(typeof LD_CONTACT_TYPES)[number], { inputs: boolean[]; lamp: boolean[] }> = {
  contact_no: { inputs: [false, true, false], lamp: [false, true, false] },
  contact_nc: { inputs: [false, true, false], lamp: [true, false, true] },
  contact_p: { inputs: [false, true, true, false, true], lamp: [false, true, false, false, true] },
  contact_n: { inputs: [false, true, false, false, true, false], lamp: [false, false, true, false, false, true] },
};
const COILS: Record<(typeof LD_COIL_TYPES)[number], { inputs: boolean[]; lamp: boolean[] }> = {
  coil: { inputs: [false, true, false], lamp: [false, true, false] },
  coil_negated: { inputs: [false, true, false], lamp: [true, false, true] },
  coil_set: { inputs: [false, true, false], lamp: [false, true, true] },
  coil_reset: { inputs: [false, true, false], lamp: [false, false, false] }, // a reset coil alone: see the set/reset scenario below
  coil_p: { inputs: [false, true, true, false, true], lamp: [false, true, false, false, true] },
  coil_n: { inputs: [true, false, false, true, false], lamp: [false, true, false, false, true] },
};

describe('LNG-007 every contact of the Ladder palette is run', () => {
  for (const type of LD_CONTACT_TYPES) {
    itNative(`${type}`, async () => {
      const { inputs, lamp } = CONTACTS[type];
      const scans = toggled(inputs).map((scan, index) => ({ ...scan, out: { Lamp: lamp[index]! } }));
      expect(await run('LD', ldProgram([{ cells: [contact(type, 'Sw'), coil('coil', 'Lamp', 'k')] }]), scans)).toEqual([]);
    }, 20_000);
  }
});

describe('LNG-007 every coil of the Ladder palette is run', () => {
  for (const type of LD_COIL_TYPES) {
    itNative(`${type}`, async () => {
      if (type === 'coil_reset') {
        // set by Sw2 on one rung, reset by Sw on the next
        const program = ldProgram([{ cells: [contact('contact_no', 'Sw2', 'a'), coil('coil_set', 'Lamp', 's')] }, { cells: [contact('contact_no', 'Sw', 'b'), coil('coil_reset', 'Lamp', 'r')] }]);
        expect(await run('LD', program, [
          { in: { Sw2: true }, out: { Lamp: true } },
          { in: { Sw2: false }, out: { Lamp: true } },
          { in: { Sw: true }, out: { Lamp: false } },
        ])).toEqual([]);
        return;
      }
      const { inputs, lamp } = COILS[type];
      const scans = toggled(inputs).map((scan, index) => ({ ...scan, out: { Lamp: lamp[index]! } }));
      expect(await run('LD', ldProgram([{ cells: [contact('contact_no', 'Sw', 'c'), coil(type, 'Lamp', 'k')] }]), scans)).toEqual([]);
    }, 20_000);
  }
});

describe('LNG-007 the branch of the Ladder palette is run', () => {
  itNative('two contacts in parallel feed one coil', async () => {
    const program = ldProgram([{ cells: [contact('contact_no', 'Sw', 'a'), coil('coil', 'Lamp', 'k')], branch: contact('contact_no', 'Sw2', 'b') }]);
    expect(await run('LD', program, [
      { in: { Sw: false, Sw2: false }, out: { Lamp: false } },
      { in: { Sw: true }, out: { Lamp: true } },
      { in: { Sw: false, Sw2: true }, out: { Lamp: true } },
      { in: { Sw2: false }, out: { Lamp: false } },
    ])).toEqual([]);
  }, 20_000);
});

describe('LNG-007 every function block of the Ladder palette is placed, built and run', () => {
  const blocks = getToolboxItems().filter((item) => item.category === 'function_block').map((item) => item.fbType!);

  it('offers function blocks', () => {
    expect(blocks.length).toBeGreaterThan(20);
  });

  for (const fbType of blocks) {
    itNative(`${fbType}`, async () => {
      const helper = fbType.startsWith('MB_') && !fbType.includes('_READ_') && !fbType.includes('_WRITE_');
      const element: LdCellSpec = helper
        ? { id: 'f', type: 'function_block', fbType, instance: 'tag', parameters: { IN: 'Reg', ADDR: '1' } }
        : { id: 'f', type: 'function_block', fbType, instance: 'inst' };
      const local = helper ? [{ name: 'Reg', type: 'INT' }] : [{ name: 'inst', type: fbType }];
      const program = ldProgram([{ cells: [contact('contact_no', 'Sw', 'c'), element, coil('coil', 'Lamp', 'k')] }], local);
      // the program runs scans with the rung powered and not, and the VM does not fault
      expect(await run('LD', program, toggled([false, true, true, false, true]))).toEqual([]);
    }, 20_000);
  }
});

describe('LNG-007 the Ladder palette does not hide what the transpiler translates and offers nothing it refuses', () => {
  const offered = new Set(getToolboxItems().filter((item) => item.category === 'function_block').map((item) => item.fbType));
  const withheld = getFunctionBlockNamesForVisualEditors().filter((name) => !offered.has(name));

  it('withholds the communication blocks that no Ladder file can declare', () => {
    expect(withheld.sort()).toEqual(['COMM_CONNECT', 'COMM_MODBUS', 'COMM_PUBLISH', 'COMM_SUBSCRIBE']);
  });

  for (const fbType of withheld) {
    it(`${fbType} is refused when it is placed`, () => {
      const program = ldProgram([{ cells: [contact('contact_no', 'Sw', 'c'), { id: 'f', type: 'function_block', fbType, instance: 'inst' }, coil('coil', 'Lamp', 'k')] }], [{ name: 'inst', type: fbType }]);
      expect(() => compileSingleFileWithTask(program, 'LD', { sourceRef: 'src/main.ld', programName: 'Main' })).toThrow();
    });
  }
});

// =============================================================================
// Function block diagram
// =============================================================================

const GATES: Record<string, Array<[Inputs, boolean]>> = {
  AND: [[{ Sw: true, Sw2: true }, true], [{ Sw2: false }, false]],
  OR: [[{ Sw: false, Sw2: false }, false], [{ Sw: true }, true]],
  XOR: [[{ Sw: true, Sw2: false }, true], [{ Sw2: true }, false]],
  NAND: [[{ Sw: true, Sw2: true }, false], [{ Sw2: false }, true]],
  NOR: [[{ Sw: false, Sw2: false }, true], [{ Sw: true }, false]],
  NOT: [[{ Sw: false }, true], [{ Sw: true }, false]],
};
/** The value each comparison and arithmetic block gives for its two inputs 1 and 1 (one for LIMIT and SEL, 1 and 1 and 1). */
const FIXED: Record<string, boolean | number> = {
  EQ: true, NE: false, LT: false, LE: true, GT: false, GE: true,
  ADD: 2, SUB: 0, MUL: 1, DIV: 1, MOD: 0, ABS: 1,
  MAX: 1, MIN: 1, LIMIT: 1, SEL: 1,
};

function constantFor(type: string, id: string): FBDBlock {
  const upper = type.toUpperCase();
  const base = { id, type: 'constant', position: { x: 0, y: 0 }, inputs: [], outputs: [{ name: 'OUT', type: 'ANY' }] };
  if (upper === 'TIME') return { ...base, dataType: 'TIME', value: 'T#10ms' };
  if (upper === 'REAL' || upper === 'LREAL') return { ...base, dataType: 'REAL', value: 1.5 };
  if (upper === 'STRING' || upper === 'WSTRING') return { ...base, dataType: 'STRING', value: 'a' };
  if (upper === 'BOOL') return { ...base, dataType: 'BOOL', value: true };
  if (['USINT', 'UINT', 'UDINT', 'BYTE', 'WORD', 'DWORD', 'SINT', 'DINT'].includes(upper)) return { ...base, dataType: upper, value: 1 };
  return { ...base, dataType: 'INT', value: 1 };
}

/** A diagram with one block of `type`, every input fed (a BOOL from the switches, anything else from a constant) and its first BOOL output, or its first output, written. */
function fbdProgram(type: string): { content: string; output: 'Lamp' | 'Count' | undefined } {
  const ports = getDefaultPorts(type);
  const block: FBDBlock = { id: 'blk', type, position: { x: 200, y: 0 }, inputs: ports.inputs, outputs: ports.outputs };
  const variables: FBDModel['variables'] = { local: [], inputs: [{ name: 'Sw', type: 'BOOL', address: '%IX0.0' }, { name: 'Sw2', type: 'BOOL', address: '%IX0.1' }], outputs: [] };
  const operator = ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'EQ', 'NE', 'LT', 'LE', 'GT', 'GE', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'ABS', 'MAX', 'MIN', 'LIMIT', 'SEL'].includes(type);
  if (['MB_COIL', 'MB_DISCRETE_INPUT', 'MB_INPUT_REGISTER', 'MB_HOLDING_REGISTER'].includes(type)) {
    // the Modbus helpers bind a variable to an address: they have no instance
    block.variableName = 'Reg';
    variables.local.push({ name: 'Reg', type: 'INT' });
  } else if (!operator) {
    block.instanceName = 'inst';
    // the timers, counters and bistables are declared by the transpiler; the other blocks are variables of their type
    if (!isFunctionBlock(type)) variables.local.push({ name: 'inst', type });
  }
  const blocks: FBDBlock[] = [block];
  const connections: FBDConnection[] = [];
  let switches = 0;
  ports.inputs.forEach((port: FBDPort, index) => {
    const source = port.type.toUpperCase() === 'BOOL' && switches < 2
      ? { id: `in${index}`, type: 'input', variableName: switches++ === 0 ? 'Sw' : 'Sw2', position: { x: 0, y: 0 }, inputs: [{ name: 'IN', type: 'ANY' }], outputs: [{ name: 'OUT', type: 'ANY' }] } as FBDBlock
      : constantFor(port.type === 'ANY' || port.type === 'ANY_NUM' ? 'INT' : port.type, `in${index}`);
    blocks.push(source);
    connections.push({ id: `w${index}`, from: { block: source.id, port: 'OUT' }, to: { block: 'blk', port: port.name } });
  });
  const bool = ports.outputs.find((port) => port.type.toUpperCase() === 'BOOL');
  const chosen = bool ?? ports.outputs[0];
  let output: 'Lamp' | 'Count' | undefined;
  if (chosen) {
    const asBool = Boolean(bool) || ['EQ', 'NE', 'LT', 'LE', 'GT', 'GE'].includes(type);
    output = asBool ? 'Lamp' : 'Count';
    variables.outputs.push(asBool ? { name: 'Lamp', type: 'BOOL', address: '%QX0.0' } : { name: 'Count', type: 'INT', address: '%QW1' });
    blocks.push({ id: 'sink', type: 'output', variableName: output, position: { x: 400, y: 0 }, inputs: [{ name: 'IN', type: 'ANY' }], outputs: [] });
    connections.push({ id: 'wout', from: { block: 'blk', port: chosen.name }, to: { block: 'sink', port: 'IN' } });
  }
  return { content: JSON.stringify({ name: 'Palette', variables, blocks, connections }), output };
}

describe('LNG-007 every block of the FBD palette is placed, built and run', () => {
  const types = fbdPaletteBlocks().filter((type) => !['constant', 'variable', 'input', 'output'].includes(type));

  it('offers blocks, of every family', () => {
    for (const family of ['AND', 'EQ', 'ADD', 'TON', 'CTU', 'MAX', 'BLINK']) expect(types).toContain(family);
  });

  for (const type of types) {
    itNative(`${type}`, async () => {
      const { content, output } = fbdProgram(type);
      const scans: Scan[] = [{ in: { Sw: false, Sw2: false } }, { in: { Sw: true } }, { in: { Sw: true, Sw2: true } }, { in: { Sw: false } }];
      const gate = GATES[type];
      if (gate) {
        const checks = gate.map(([inputs, lamp]): Scan => ({ in: inputs, out: { Lamp: lamp } }));
        expect(await run('FBD', content, checks)).toEqual([]);
      } else if (type in FIXED && output) {
        const value = FIXED[type]!;
        expect(await run('FBD', content, [{ in: { Sw: true }, out: typeof value === 'boolean' ? { Lamp: value } : { Count: value } }])).toEqual([]);
      } else {
        expect(await run('FBD', content, scans)).toEqual([]);
      }
    }, 20_000);
  }

  // The catalogue also names functions of the library and blocks of the runtime that no diagram can place. They are not
  // offered; and a catalogue block that is not offered is one a diagram cannot build, so the palette hides nothing that works.
  const withheld = getBlockCategories().flatMap((category) => category.blocks).filter((block) => !fbdPaletteBlocks().includes(block));

  it('withholds the functions of the library and the communication blocks that a diagram cannot build', () => {
    expect(withheld.length).toBeGreaterThan(30);
    for (const name of ['SQRT', 'SIN', 'LEN', 'CONCAT', 'INT_TO_REAL', 'COMM_PUBLISH', 'SHL']) expect(withheld).toContain(name);
  });

  for (const type of withheld) {
    it(`${type} is refused when it is placed`, () => {
      const { content } = fbdProgram(type);
      expect(() => compileSingleFileWithTask(content, 'FBD', { sourceRef: 'src/main.fbd.json', programName: 'Main' })).toThrow();
    });
  }

  itNative('constant, variable, input and output carry a value through', async () => {
    const content = JSON.stringify({
      name: 'Palette',
      variables: { local: [{ name: 'Held', type: 'BOOL' }], inputs: [{ name: 'Sw', type: 'BOOL', address: '%IX0.0' }], outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }] },
      blocks: [
        { id: 'sw', type: 'input', variableName: 'Sw', position: { x: 0, y: 0 }, inputs: [{ name: 'IN', type: 'ANY' }], outputs: [{ name: 'OUT', type: 'ANY' }] },
        { id: 'held', type: 'variable', variableName: 'Held', position: { x: 100, y: 0 }, inputs: [{ name: 'IN', type: 'ANY' }], outputs: [{ name: 'OUT', type: 'ANY' }] },
        { id: 'lamp', type: 'output', variableName: 'Lamp', position: { x: 200, y: 0 }, inputs: [{ name: 'IN', type: 'ANY' }], outputs: [] },
      ],
      connections: [
        { id: 'w1', from: { block: 'sw', port: 'OUT' }, to: { block: 'held', port: 'IN' } },
        { id: 'w2', from: { block: 'held', port: 'OUT' }, to: { block: 'lamp', port: 'IN' } },
      ],
    });
    expect(await run('FBD', content, [{ in: { Sw: false }, out: { Lamp: false } }, { in: { Sw: true }, out: { Lamp: true } }])).toEqual([]);
    const constant = JSON.stringify({
      name: 'Palette',
      variables: { local: [], inputs: [], outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }] },
      blocks: [constantFor('BOOL', 'on'), { id: 'lamp', type: 'output', variableName: 'Lamp', position: { x: 200, y: 0 }, inputs: [{ name: 'IN', type: 'ANY' }], outputs: [] }],
      connections: [{ id: 'w', from: { block: 'on', port: 'OUT' }, to: { block: 'lamp', port: 'IN' } }],
    });
    expect(await run('FBD', constant, [{ out: { Lamp: true } }])).toEqual([]);
  }, 20_000);
});

// =============================================================================
// Sequential function chart
// =============================================================================

function chart(kinds: string[]): string {
  const hasStep = kinds.includes('step');
  return JSON.stringify({
    name: 'Palette',
    variables: { local: [], inputs: [{ name: 'Sw', type: 'BOOL', address: '%IX0.0' }], outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }] },
    steps: [
      { id: 'init', name: 'Init', isInitial: true, position: { x: 0, y: 0 }, actions: [] },
      ...(hasStep ? [{ id: 'run', name: 'Run', isInitial: false, position: { x: 0, y: 200 }, actions: [{ qualifier: 'N', actionName: 'Light' }] }] : []),
    ],
    transitions: hasStep ? [{ id: 'go', fromStep: 'init', toStep: 'run', condition: 'Sw' }, { id: 'back', fromStep: 'run', toStep: 'init', condition: 'NOT Sw' }] : [],
    actions: [{ id: 'light', name: 'Light', type: 'ST', body: 'Lamp := TRUE;' }],
  });
}

describe('LNG-007 every element of the SFC palette is run', () => {
  const byType = new Map(SFC_PALETTE.map((element) => [element.type, element]));

  it('offers the step, the initial step and the transition', () => {
    expect([...byType.keys()].sort()).toEqual(['initial_step', 'step', 'transition']);
  });

  itNative('initial_step: the chart starts in it', async () => {
    const initial = JSON.stringify({
      name: 'Palette',
      variables: { local: [], outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }] },
      steps: [{ id: 'init', name: 'Init', isInitial: true, position: { x: 0, y: 0 }, actions: [{ qualifier: 'N', actionName: 'Light' }] }],
      transitions: [],
      actions: [{ id: 'light', name: 'Light', type: 'ST', body: 'Lamp := TRUE;' }],
    });
    expect(await run('SFC', initial, [{ out: { Lamp: true } }])).toEqual([]);
  }, 20_000);

  itNative('step: a step is entered by its transition and its action runs there', async () => {
    expect(await run('SFC', chart(['step', 'transition']), [
      { in: { Sw: false }, out: { Lamp: false } },
      { in: { Sw: true } },
      { out: { Lamp: true } },
    ])).toEqual([]);
  }, 20_000);

  itNative('transition: a transition holds until its condition does, and one crosses in one scan', async () => {
    expect(await run('SFC', chart(['step', 'transition']), [
      { in: { Sw: false }, out: { Lamp: false } },
      { out: { Lamp: false } },
      { in: { Sw: true } },
      { in: { Sw: true }, out: { Lamp: true } },
    ])).toEqual([]);
  }, 20_000);
});
