import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { compileScenario, runScenario, type ScenarioRuntimePort } from '../test-engine';
import { createPlantRun, type PlantKind, type Signals } from './plantEngine';

/**
 * D-19 / PLT-013: the live model of each Learn plant behaves as the model the grader runs inside the scenario engine.
 * Both are driven with the same command script and must give the same sensor signals at every scan.
 */
interface Shape {
  readonly program: string;
  readonly outputs: readonly string[];
  readonly inputs: readonly string[];
  /** Scenario signal for each live read name. */
  readonly commands: Readonly<Record<string, string>>;
}
const SHAPES: Record<PlantKind, Shape> = {
  'motor-v1': { program: 'MotorPlant', outputs: ['Command'], inputs: ['AtSpeed'], commands: { command: 'Command' } },
  'conveyor-v1': {
    program: 'Conveyor',
    outputs: ['BeltCommand', 'DiverterCommand'],
    inputs: ['PartAtClassifier', 'MetalDetected', 'PartAtDiverter', 'JamDetected'],
    commands: { belt: 'BeltCommand', diverter: 'DiverterCommand' },
  },
  'tank-v1': { program: 'TankLevel', outputs: ['Pump'], inputs: ['LevelLow', 'LevelHigh'], commands: { pump: 'Pump' } },
  'pedestrian-v1': { program: 'PedestrianCrossing', outputs: ['PedWalk'], inputs: ['PedRequest'], commands: { pedWalk: 'PedWalk' } },
};

const debugMap = (shape: Shape): DebugMap => ({
  version: '1.0.0',
  programName: shape.program,
  compilerVersion: 'test',
  generatedAt: '',
  memoryLayout: {
    ipiBase: 0,
    ipiSize: 1,
    opiBase: 0x1000,
    opiSize: 1,
    workBase: 0x2000,
    workSize: 1,
    retainBase: 0x3000,
    retainSize: 1,
    codeBase: 0x4000,
    codeSize: 1,
  },
  pou: {
    [shape.program]: {
      type: 'PROGRAM',
      sourceMap: [],
      breakpoints: [],
      vars: {
        ...Object.fromEntries(shape.inputs.map((n, i) => [n, { addr: 0, bitOffset: i, type: 'BOOL', region: 'IPI', size: 1 }])),
        ...Object.fromEntries(shape.outputs.map((n, i) => [n, { addr: 0x1000, bitOffset: i, type: 'BOOL', region: 'OPI', size: 1 }])),
      },
    },
  },
});

/** The graded side: the scenario engine with a scripted program standing in for the PLC. */
class ScriptedPort implements ScenarioRuntimePort {
  private readonly outputs = new Map<string, boolean>();
  constructor(
    private readonly shape: Shape,
    private readonly script: (tick: number) => Record<string, boolean>,
  ) {}
  async loadProgram(): Promise<void> {}
  async reset(): Promise<void> {}
  async hasForces(): Promise<boolean> {
    return false;
  }
  async setInput(): Promise<void> {}
  async step(atMs: number): Promise<void> {
    const commands = this.script(atMs / 10);
    this.shape.outputs.forEach((name, i) => this.outputs.set(`${0x1000}.${i}`, commands[name] === true));
  }
  async readOutput(address: number, bitOffset: number): Promise<boolean> {
    return this.outputs.get(`${address}.${bitOffset}`) === true;
  }
}

const SCRIPTS: Record<PlantKind, Array<(tick: number) => Record<string, boolean>>> = {
  'motor-v1': [(t) => ({ Command: t % 50 < 30 }), (t) => ({ Command: t >= 3 && t < 4 })],
  'conveyor-v1': [
    // belt always on: the part reaches the diverter, is passed on, and the graded belt then jams by itself
    (t) => ({ BeltCommand: true, DiverterCommand: t % 7 < 4 }),
    (t) => ({ BeltCommand: t % 9 < 6, DiverterCommand: false }),
  ],
  'tank-v1': [(t) => ({ Pump: t % 20 < 12 }), (t) => ({ Pump: t >= 2 })],
  'pedestrian-v1': [(t) => ({ PedWalk: t >= 6 }), (t) => ({ PedWalk: t % 11 > 5 })],
};

const TICKS = 80;

describe('live plants behave as the graded ones (PLT-013, D-19)', () => {
  for (const kind of Object.keys(SHAPES) as PlantKind[]) {
    SCRIPTS[kind].forEach((script, index) => {
      it(`${kind}: script ${index + 1} gives the same sensors at every scan`, async () => {
        const shape = SHAPES[kind];
        const events: unknown[] = [];
        const compiled = compileScenario(
          {
            schemaVersion: 1,
            id: shape.program,
            plant: kind,
            tickMs: 10,
            durationMs: (TICKS - 1) * 10,
            events,
            expectations: [{ kind: 'AT', atMs: 0, condition: { [`${shape.program}.${shape.outputs[0]}`]: true } }],
          },
          debugMap(shape),
        );
        const graded = (await runScenario(compiled, new Uint8Array([1]), new ScriptedPort(shape, script))).trace.map(
          (s) => s.plant as Record<string, unknown>,
        );

        const run = createPlantRun(kind);
        const live: Array<Record<string, boolean>> = [];
        for (let tick = 0; tick < TICKS; tick += 1) {
          live.push(run.sense());
          const commands = script(tick);
          const reads: Record<string, boolean> = {};
          for (const [read, name] of Object.entries(shape.commands)) reads[read] = commands[name] === true;
          run.step(reads as Signals);
        }

        const expected = graded.map((p) => {
          switch (kind) {
            case 'motor-v1':
              return { atSpeed: p.atSpeedInput };
            case 'conveyor-v1':
              return {
                partAtClassifier: p.partAtClassifierInput,
                metalDetected: p.metalDetectedInput,
                partAtDiverter: p.partAtDiverterInput,
                jamDetected: p.jamDetectedInput,
              };
            case 'tank-v1':
              return { levelLow: p.levelLowInput, levelHigh: p.levelHighInput };
            case 'pedestrian-v1':
              return { pedRequest: p.requestInput };
          }
        });
        const sensed = live.map((s) => Object.fromEntries(Object.keys(expected[0]!).map((k) => [k, s[k]])));
        expect(sensed as unknown).toEqual(expected);
        if (kind === 'conveyor-v1' && index === 0) expect(sensed.some((s) => s.jamDetected)).toBe(true);
      });
    });
  }

  it('the tank starts at 200 and the motor counts as at speed only from 1000', () => {
    expect(createPlantRun('tank-v1').state.level).toBe(200);
    const motor = createPlantRun('motor-v1');
    motor.step({ command: true });
    expect(motor.sense().atSpeed).toBe(false);
    motor.step({ command: true });
    expect(motor.sense().atSpeed).toBe(true);
  });
});
