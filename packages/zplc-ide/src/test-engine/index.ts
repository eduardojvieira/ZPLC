import type { DebugMap, DebugVarInfo } from '../compiler';

const MAX_EVENTS = 256;
const MAX_EXPECTATIONS = 256;
const MAX_SIGNALS = 64;
const MAX_SAMPLES = 10_000;
const MAX_TRACE_VALUES = 1_000_000;
const SIGNAL = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;
export type ScenarioKind = 'AT' | 'WITHIN' | 'FOR' | 'EVENTUALLY' | 'ALWAYS' | 'NEVER' | 'UNTIL' | 'RISING' | 'FALLING';
const compiledScenarios = new WeakSet<CompiledScenario>();

export interface ScenarioRuntimePort {
  loadProgram(zplc: Uint8Array): Promise<void>;
  reset(): Promise<void>;
  hasForces(): Promise<boolean>;
  setInput(address: number, bitOffset: number, value: boolean): Promise<void>;
  step(atMs: number): Promise<void>;
  readOutput(address: number, bitOffset: number): Promise<boolean>;
}

export interface ResolvedSignal {
  readonly signal: string;
  readonly address: number;
  readonly bitOffset: number;
  readonly value: boolean;
}

export interface CompiledScenario {
  readonly id: string;
  readonly tickMs: number;
  readonly durationMs: number;
  readonly events: ReadonlyArray<{ readonly atMs: number; readonly writes: ReadonlyArray<ResolvedSignal> }>;
  readonly expectations: ReadonlyArray<{
    readonly kind: ScenarioKind;
    readonly reads: ReadonlyArray<ResolvedSignal>;
    readonly atMs?: number;
    readonly fromMs?: number;
    readonly withinMs?: number;
    readonly forMs?: number;
    readonly untilReads?: ReadonlyArray<ResolvedSignal>;
  }>;
  readonly plant?: {
    readonly kind: 'motor-v1';
    readonly command: ResolvedSignal;
    readonly atSpeed: ResolvedSignal;
  } | {
    readonly kind: 'conveyor-v1';
    readonly beltCommand: ResolvedSignal;
    readonly diverterCommand: ResolvedSignal;
    readonly partAtClassifier: ResolvedSignal;
    readonly metalDetected: ResolvedSignal;
    readonly partAtDiverter: ResolvedSignal;
    readonly jamDetected: ResolvedSignal;
  } | {
    readonly kind: 'tank-v1';
    readonly pump: ResolvedSignal;
    readonly levelLow: ResolvedSignal;
    readonly levelHigh: ResolvedSignal;
  } | {
    readonly kind: 'pedestrian-v1';
    readonly pedRequest: ResolvedSignal;
    readonly pedWalk: ResolvedSignal;
  };
}

export interface ScenarioTraceSample {
  atMs: number;
  outputs: Record<string, boolean>;
  plant?: { kind: 'motor-v1'; atSpeedInput: boolean; speedPermilleAfterTick: number }
    | { kind: 'conveyor-v1'; seed: 0; partAtClassifierInput: boolean; metalDetectedInput: boolean; partAtDiverterInput: boolean; jamDetectedInput: boolean; classifiedCountAfterTick: number }
    | { kind: 'tank-v1'; levelLowInput: boolean; levelHighInput: boolean; levelPermilleAfterTick: number }
    | { kind: 'pedestrian-v1'; requestInput: boolean; phaseAfterTick: 'approaching' | 'waiting' | 'crossing' | 'cleared' };
}

export interface ScenarioAssertionResult {
  kind: CompiledScenario['expectations'][number]['kind'];
  passed: boolean;
  /** First matching/failing sample according to the temporal assertion kind. */
  atMs?: number;
}

export interface ScenarioRunResult {
  passed: boolean;
  trace: ScenarioTraceSample[];
  assertions: ScenarioAssertionResult[];
}

type UnknownRecord = Record<string, unknown>;

function fail(message: string): never { throw new Error(`Invalid test scenario: ${message}`); }
function record(value: unknown, path: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
  let prototype: object | null;
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch { fail(`${path} must be a plain JSON object`); }
  if ((prototype !== Object.prototype && prototype !== null) || Object.values(descriptors).some((descriptor) => !('value' in descriptor))) fail(`${path} must be a plain JSON object`);
  return value as UnknownRecord;
}
function exact(object: UnknownRecord, keys: string[], path: string): void {
  if (Object.keys(object).some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(object, key))) fail(`${path} has invalid keys`);
}
function dataArray(value: unknown, path: string, max: number, minimum = 1): unknown[] {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  let prototype: object | null;
  let descriptors: Record<string, PropertyDescriptor>;
  let keys: PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    keys = Reflect.ownKeys(value);
  } catch { fail(`${path} must be a plain JSON array`); }
  if (prototype !== Array.prototype || value.length < minimum || value.length > max || keys.length !== value.length + 1 || !keys.includes('length')) fail(`${path} must contain ${minimum}-${max} entries`);
  for (let index = 0; index < value.length; index++) if (!descriptors[index] || !('value' in descriptors[index])) fail(`${path} must be a dense data array`);
  return value;
}
function integer(value: unknown, path: string, max: number): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max) fail(`${path} must be a non-negative integer`);
  return value as number;
}
function aligned(value: unknown, path: string, tickMs: number, durationMs: number): number {
  const result = integer(value, path, durationMs);
  if (result % tickMs !== 0) fail(`${path} must align to tickMs`);
  return result;
}
function namedSignal(signal: unknown, path: string): string {
  if (typeof signal !== 'string' || !SIGNAL.test(signal)) fail(`${path} must be an explicit POU.variable signal`);
  return signal;
}
function signalSet(value: unknown, path: string): Array<{ signal: string; value: boolean }> {
  const set = record(value, path);
  const entries = Object.entries(set);
  if (entries.length === 0 || entries.length > MAX_SIGNALS) fail(`${path} must contain 1-${MAX_SIGNALS} signals`);
  return entries.map(([signal, expected]) => {
    if (typeof expected !== 'boolean') fail(`${path}.${signal} must be boolean`);
    return { signal: namedSignal(signal, path), value: expected };
  }).sort((left, right) => left.signal < right.signal ? -1 : left.signal > right.signal ? 1 : 0);
}

function resolve(debugMap: DebugMap, signal: string, expectedRegion: 'IPI' | 'OPI', value: boolean): ResolvedSignal {
  const [pouName, variableName] = signal.split('.');
  const variable = pouName === undefined || variableName === undefined ? undefined : debugMap.pou[pouName]?.vars[variableName];
  if (!variable) fail(`unknown signal ${signal}`);
  validateAddress(variable, debugMap, expectedRegion, signal);
  return { signal, address: variable.addr, bitOffset: variable.bitOffset!, value };
}

function validateAddress(variable: DebugVarInfo, debugMap: DebugMap, expectedRegion: 'IPI' | 'OPI', signal: string): void {
  if (variable.type !== 'BOOL' || variable.region !== expectedRegion || variable.size < 1 || !Number.isInteger(variable.size)) fail(`${signal} must be a BOOL ${expectedRegion} signal`);
  if (!Number.isInteger(variable.addr) || !Number.isInteger(variable.bitOffset) || variable.bitOffset! < 0 || variable.bitOffset! > 7) fail(`${signal} has invalid bit address`);
  const base = expectedRegion === 'IPI' ? debugMap.memoryLayout.ipiBase : debugMap.memoryLayout.opiBase;
  const size = expectedRegion === 'IPI' ? debugMap.memoryLayout.ipiSize : debugMap.memoryLayout.opiSize;
  if (!Number.isInteger(base) || !Number.isInteger(size) || size < 1 || variable.addr < base || variable.addr + variable.size > base + size) fail(`${signal} is outside ${expectedRegion} memory`);
}
function location(signal: Pick<ResolvedSignal, 'address' | 'bitOffset'>): string { return `${signal.address}:${signal.bitOffset}`; }

function freezeScenario(scenario: CompiledScenario): CompiledScenario {
  for (const event of scenario.events) {
    event.writes.forEach(Object.freeze);
    Object.freeze(event.writes);
    Object.freeze(event);
  }
  for (const expectation of scenario.expectations) {
    expectation.reads.forEach(Object.freeze);
    Object.freeze(expectation.reads);
    expectation.untilReads?.forEach(Object.freeze);
    if (expectation.untilReads) Object.freeze(expectation.untilReads);
    Object.freeze(expectation);
  }
  Object.freeze(scenario.events);
  Object.freeze(scenario.expectations);
  if (scenario.plant) {
    if (scenario.plant.kind === 'motor-v1') {
      Object.freeze(scenario.plant.command);
      Object.freeze(scenario.plant.atSpeed);
    } else if (scenario.plant.kind === 'conveyor-v1') {
      Object.freeze(scenario.plant.beltCommand);
      Object.freeze(scenario.plant.diverterCommand);
      Object.freeze(scenario.plant.partAtClassifier);
      Object.freeze(scenario.plant.metalDetected);
      Object.freeze(scenario.plant.partAtDiverter);
      Object.freeze(scenario.plant.jamDetected);
    } else if (scenario.plant.kind === 'tank-v1') {
      Object.freeze(scenario.plant.pump);
      Object.freeze(scenario.plant.levelLow);
      Object.freeze(scenario.plant.levelHigh);
    } else {
      Object.freeze(scenario.plant.pedRequest);
      Object.freeze(scenario.plant.pedWalk);
    }
    Object.freeze(scenario.plant);
  }
  Object.freeze(scenario);
  compiledScenarios.add(scenario);
  return scenario;
}

export function compileScenario(input: unknown, debugMap: DebugMap): CompiledScenario {
  const source = record(input, 'scenario');
  const hasPlant = Object.hasOwn(source, 'plant');
  exact(source, hasPlant ? ['schemaVersion', 'id', 'plant', 'tickMs', 'durationMs', 'events', 'expectations'] : ['schemaVersion', 'id', 'tickMs', 'durationMs', 'events', 'expectations'], 'scenario');
  if (source.schemaVersion !== 1 || typeof source.id !== 'string' || source.id.length === 0 || source.id.length > 128) fail('schemaVersion or id');
  const tickMs = integer(source.tickMs, 'tickMs', 60_000);
  if (tickMs === 0) fail('tickMs must be positive');
  const durationMs = integer(source.durationMs, 'durationMs', 3_600_000);
  if (durationMs === 0 || durationMs % tickMs !== 0) fail('durationMs must be positive and align to tickMs');
  if (durationMs / tickMs + 1 > MAX_SAMPLES) fail(`scenario exceeds ${MAX_SAMPLES} samples`);
  const plant = hasPlant ? (() => {
    if (source.plant === 'motor-v1') {
      if (tickMs !== 10) fail('motor-v1 requires tickMs 10');
      return { kind: 'motor-v1' as const, command: resolve(debugMap, 'MotorPlant.Command', 'OPI', false), atSpeed: resolve(debugMap, 'MotorPlant.AtSpeed', 'IPI', false) };
    }
    if (source.plant === 'conveyor-v1') {
      if (tickMs !== 10) fail('conveyor-v1 requires tickMs 10');
      return {
        kind: 'conveyor-v1' as const,
        beltCommand: resolve(debugMap, 'Conveyor.BeltCommand', 'OPI', false),
        diverterCommand: resolve(debugMap, 'Conveyor.DiverterCommand', 'OPI', false),
        partAtClassifier: resolve(debugMap, 'Conveyor.PartAtClassifier', 'IPI', false),
        metalDetected: resolve(debugMap, 'Conveyor.MetalDetected', 'IPI', false),
        partAtDiverter: resolve(debugMap, 'Conveyor.PartAtDiverter', 'IPI', false),
        jamDetected: resolve(debugMap, 'Conveyor.JamDetected', 'IPI', false),
      };
    }
    if (source.plant === 'tank-v1') {
      if (tickMs !== 10) fail('tank-v1 requires tickMs 10');
      return {
        kind: 'tank-v1' as const,
        pump: resolve(debugMap, 'TankLevel.Pump', 'OPI', false),
        levelLow: resolve(debugMap, 'TankLevel.LevelLow', 'IPI', false),
        levelHigh: resolve(debugMap, 'TankLevel.LevelHigh', 'IPI', false),
      };
    }
    if (source.plant === 'pedestrian-v1') {
      if (tickMs !== 10) fail('pedestrian-v1 requires tickMs 10');
      return {
        kind: 'pedestrian-v1' as const,
        pedRequest: resolve(debugMap, 'PedestrianCrossing.PedRequest', 'IPI', false),
        pedWalk: resolve(debugMap, 'PedestrianCrossing.PedWalk', 'OPI', false),
      };
    }
    fail('plant must be motor-v1, conveyor-v1, tank-v1, or pedestrian-v1');
  })() : undefined;
  const eventInputs = dataArray(source.events, 'events', MAX_EVENTS, 0);
  const expectationInputs = dataArray(source.expectations, 'expectations', MAX_EXPECTATIONS);

  const duplicates = new Set<string>();
  const physicalWrites = new Map<string, boolean>();
  const events = eventInputs.map((raw, index) => {
    const event = record(raw, `events[${index}]`);
    exact(event, ['atMs', 'set'], `events[${index}]`);
    const atMs = aligned(event.atMs, `events[${index}].atMs`, tickMs, durationMs);
    const writes = signalSet(event.set, `events[${index}].set`).map(({ signal, value }) => {
      const key = `${atMs}:${signal}`;
      if (duplicates.has(key)) fail(`duplicate event for ${signal} at ${atMs}ms`);
      duplicates.add(key);
      const resolved = resolve(debugMap, signal, 'IPI', value);
      if (plant?.kind === 'motor-v1' && location(resolved) === location(plant.atSpeed)) fail(`events[${index}].set cannot write plant-owned MotorPlant.AtSpeed`);
      if (plant?.kind === 'conveyor-v1' && [plant.partAtClassifier, plant.metalDetected, plant.partAtDiverter, plant.jamDetected].some((owned) => location(resolved) === location(owned))) fail(`events[${index}].set cannot write conveyor-v1 plant-owned input`);
      if (plant?.kind === 'tank-v1' && [plant.levelLow, plant.levelHigh].some((owned) => location(resolved) === location(owned))) fail(`events[${index}].set cannot write tank-v1 plant-owned input`);
      if (plant?.kind === 'pedestrian-v1' && location(resolved) === location(plant.pedRequest)) fail(`events[${index}].set cannot write pedestrian-v1 plant-owned input`);
      const physicalKey = `${atMs}:${location(resolved)}`;
      const previous = physicalWrites.get(physicalKey);
      if (previous !== undefined && previous !== value) fail(`conflicting event for IPI location at ${atMs}ms`);
      physicalWrites.set(physicalKey, value);
      return resolved;
    });
    return { atMs, writes };
  }).sort((left, right) => left.atMs - right.atMs);

  const expectations = expectationInputs.map((raw, index) => {
    const expectation = record(raw, `expectations[${index}]`);
    if (expectation.kind !== 'AT' && expectation.kind !== 'WITHIN' && expectation.kind !== 'FOR' && expectation.kind !== 'EVENTUALLY' && expectation.kind !== 'ALWAYS' && expectation.kind !== 'NEVER' && expectation.kind !== 'UNTIL' && expectation.kind !== 'RISING' && expectation.kind !== 'FALLING') fail(`expectations[${index}].kind`);
    const kind = expectation.kind as ScenarioKind;
    const keys = kind === 'AT' ? ['kind', 'atMs', 'condition']
      : kind === 'WITHIN' || kind === 'EVENTUALLY' || kind === 'RISING' || kind === 'FALLING' ? ['kind', 'fromMs', 'withinMs', 'condition']
        : kind === 'FOR' ? ['kind', 'fromMs', 'forMs', 'condition']
        : kind === 'UNTIL' ? ['kind', 'fromMs', 'condition', 'until'] : ['kind', 'condition'];
    exact(expectation, keys, `expectations[${index}]`);
    const reads = signalSet(expectation.condition, `expectations[${index}].condition`).map(({ signal, value }) => resolve(debugMap, signal, 'OPI', value));
    if (kind === 'AT') return { kind, reads, atMs: aligned(expectation.atMs, `expectations[${index}].atMs`, tickMs, durationMs) };
    if (kind === 'WITHIN' || kind === 'EVENTUALLY' || kind === 'RISING' || kind === 'FALLING') {
      const fromMs = aligned(expectation.fromMs, `expectations[${index}].fromMs`, tickMs, durationMs);
      const withinMs = aligned(expectation.withinMs, `expectations[${index}].withinMs`, tickMs, durationMs);
      if (fromMs + withinMs > durationMs) fail(`expectations[${index}] window exceeds durationMs`);
      if ((kind === 'RISING' || kind === 'FALLING') && (reads.length !== 1 || reads[0]!.value !== (kind === 'RISING'))) fail(`expectations[${index}].condition must be exactly one ${kind === 'RISING' ? 'true' : 'false'} BOOL OPI signal`);
      return { kind, reads, fromMs, withinMs };
    }
    if (kind === 'FOR') {
      const fromMs = aligned(expectation.fromMs, `expectations[${index}].fromMs`, tickMs, durationMs);
      const forMs = aligned(expectation.forMs, `expectations[${index}].forMs`, tickMs, durationMs);
      if (fromMs + forMs > durationMs) fail(`expectations[${index}] window exceeds durationMs`);
      return { kind, reads, fromMs, forMs };
    }
    if (kind === 'UNTIL') return { kind, reads, fromMs: aligned(expectation.fromMs, `expectations[${index}].fromMs`, tickMs, durationMs), untilReads: signalSet(expectation.until, `expectations[${index}].until`).map(({ signal, value }) => resolve(debugMap, signal, 'IPI', value)) };
    return { kind, reads };
  });
  const samples = durationMs / tickMs + 1;
  const observationReads = [...expectations.flatMap((expectation) => [...expectation.reads, ...(expectation.untilReads ?? [])]), ...(plant?.kind === 'motor-v1' ? [plant.command] : plant?.kind === 'conveyor-v1' ? [plant.beltCommand, plant.diverterCommand] : plant?.kind === 'tank-v1' ? [plant.pump] : plant?.kind === 'pedestrian-v1' ? [plant.pedWalk] : [])];
  const uniqueReads = new Set(observationReads.map((read) => read.signal)).size;
  const conditionReads = observationReads.length;
  if (uniqueReads > MAX_SIGNALS || samples * uniqueReads > MAX_TRACE_VALUES || samples * conditionReads > MAX_TRACE_VALUES) fail('scenario observation budget exceeded');
  return freezeScenario({ id: source.id, tickMs, durationMs, events, expectations, ...(plant ? { plant } : {}) });
}

function matches(reads: ReadonlyArray<ResolvedSignal>, outputs: Record<string, boolean>): boolean { return reads.every(({ signal, value }) => outputs[signal] === value); }

export async function runScenario(scenario: CompiledScenario, zplc: Uint8Array, runtime: ScenarioRuntimePort): Promise<ScenarioRunResult> {
  if (!compiledScenarios.has(scenario)) throw new Error('Scenario must be produced by compileScenario');
  if (await runtime.hasForces()) throw new Error('Cannot run scenario with active forces');
  await runtime.loadProgram(zplc);
  await runtime.reset();
  const reads = new Map<string, ResolvedSignal>();
  for (const expectation of scenario.expectations) for (const read of expectation.reads) reads.set(read.signal, read);
  if (scenario.plant?.kind === 'motor-v1') reads.set(scenario.plant.command.signal, scenario.plant.command);
  if (scenario.plant?.kind === 'conveyor-v1') {
    reads.set(scenario.plant.beltCommand.signal, scenario.plant.beltCommand);
    reads.set(scenario.plant.diverterCommand.signal, scenario.plant.diverterCommand);
  }
  if (scenario.plant?.kind === 'tank-v1') reads.set(scenario.plant.pump.signal, scenario.plant.pump);
  if (scenario.plant?.kind === 'pedestrian-v1') reads.set(scenario.plant.pedWalk.signal, scenario.plant.pedWalk);
  const terminalReads = new Map<string, ResolvedSignal>();
  for (const expectation of scenario.expectations) for (const read of expectation.untilReads ?? []) terminalReads.set(read.signal, read);
  const orderedReads = [...reads.values()].sort((left, right) => left.signal < right.signal ? -1 : left.signal > right.signal ? 1 : 0);
  const trace: ScenarioTraceSample[] = [];
  const inputs = new Map<string, boolean>([...terminalReads.values()].map((read) => [location(read), false]));
  const inputSnapshots: Record<string, boolean>[] = [];
  let speedPermille = 0;
  let conveyorState: 'idle' | 'classifier' | 'diverter' | 'transfer' | 'jammed' = 'idle';
  let classifiedCount = 0;
  let levelPermille = 200;
  let pedestrianPhase: 'approaching' | 'waiting' | 'crossing' | 'cleared' = 'approaching';
  let crossingTicks = 0;
  for (let atMs = 0; atMs <= scenario.durationMs; atMs += scenario.tickMs) {
    const atSpeedInput = scenario.plant?.kind === 'motor-v1' ? speedPermille >= 1000 : undefined;
    if (scenario.plant?.kind === 'motor-v1') {
      inputs.set(location(scenario.plant.atSpeed), atSpeedInput!);
      await runtime.setInput(scenario.plant.atSpeed.address, scenario.plant.atSpeed.bitOffset, atSpeedInput!);
    }
    const conveyorInputs = scenario.plant?.kind === 'conveyor-v1' ? {
      partAtClassifier: conveyorState === 'classifier', metalDetected: conveyorState === 'classifier',
      partAtDiverter: conveyorState === 'diverter', jamDetected: conveyorState === 'jammed',
    } : undefined;
    if (scenario.plant?.kind === 'conveyor-v1') for (const [signal, value] of [[scenario.plant.partAtClassifier, conveyorInputs!.partAtClassifier], [scenario.plant.metalDetected, conveyorInputs!.metalDetected], [scenario.plant.partAtDiverter, conveyorInputs!.partAtDiverter], [scenario.plant.jamDetected, conveyorInputs!.jamDetected]] as const) {
      inputs.set(location(signal), value); await runtime.setInput(signal.address, signal.bitOffset, value);
    }
    const tankInputs = scenario.plant?.kind === 'tank-v1' ? { levelLow: levelPermille <= 250, levelHigh: levelPermille >= 750 } : undefined;
    if (scenario.plant?.kind === 'tank-v1') for (const [signal, value] of [[scenario.plant.levelLow, tankInputs!.levelLow], [scenario.plant.levelHigh, tankInputs!.levelHigh]] as const) {
      inputs.set(location(signal), value); await runtime.setInput(signal.address, signal.bitOffset, value);
    }
    const pedestrianRequest = scenario.plant?.kind === 'pedestrian-v1' ? atMs >= 10 && (pedestrianPhase === 'approaching' || pedestrianPhase === 'waiting') : undefined;
    if (scenario.plant?.kind === 'pedestrian-v1') {
      inputs.set(location(scenario.plant.pedRequest), pedestrianRequest!);
      await runtime.setInput(scenario.plant.pedRequest.address, scenario.plant.pedRequest.bitOffset, pedestrianRequest!);
    }
    const writes = scenario.events.filter((event) => event.atMs === atMs).flatMap((event) => event.writes).sort((left, right) => left.signal < right.signal ? -1 : left.signal > right.signal ? 1 : 0);
    for (const write of writes) {
      inputs.set(location(write), write.value);
      await runtime.setInput(write.address, write.bitOffset, write.value);
    }
    await runtime.step(atMs);
    const outputs: Record<string, boolean> = {};
    for (const read of orderedReads) outputs[read.signal] = await runtime.readOutput(read.address, read.bitOffset);
    if (scenario.plant?.kind === 'motor-v1') speedPermille = outputs[scenario.plant.command.signal] ? Math.min(1000, speedPermille + 500) : Math.max(0, speedPermille - 1000);
    if (scenario.plant?.kind === 'conveyor-v1' && outputs[scenario.plant.beltCommand.signal]) {
      if (conveyorState === 'idle') conveyorState = 'classifier';
      else if (conveyorState === 'classifier') conveyorState = 'diverter';
      else if (conveyorState === 'diverter') { if (outputs[scenario.plant.diverterCommand.signal]) classifiedCount = 1; conveyorState = 'transfer'; }
      else if (conveyorState === 'transfer') conveyorState = 'jammed';
    }
    if (scenario.plant?.kind === 'tank-v1') levelPermille = outputs[scenario.plant.pump.signal] ? Math.min(1000, levelPermille + 100) : Math.max(0, levelPermille - 20);
    if (scenario.plant?.kind === 'pedestrian-v1') {
      if (pedestrianPhase === 'approaching' && pedestrianRequest) pedestrianPhase = 'waiting';
      if (pedestrianPhase === 'waiting' && outputs[scenario.plant.pedWalk.signal]) { pedestrianPhase = 'crossing'; crossingTicks = 0; }
      else if (pedestrianPhase === 'crossing') { crossingTicks++; if (crossingTicks >= 3) pedestrianPhase = 'cleared'; }
    }
    trace.push({ atMs, outputs,
      ...(scenario.plant?.kind === 'motor-v1' ? { plant: { kind: 'motor-v1', atSpeedInput: atSpeedInput!, speedPermilleAfterTick: speedPermille } } : {}),
      ...(scenario.plant?.kind === 'conveyor-v1' ? { plant: { kind: 'conveyor-v1', seed: 0, partAtClassifierInput: conveyorInputs!.partAtClassifier, metalDetectedInput: conveyorInputs!.metalDetected, partAtDiverterInput: conveyorInputs!.partAtDiverter, jamDetectedInput: conveyorInputs!.jamDetected, classifiedCountAfterTick: classifiedCount } } : {}),
      ...(scenario.plant?.kind === 'tank-v1' ? { plant: { kind: 'tank-v1', levelLowInput: tankInputs!.levelLow, levelHighInput: tankInputs!.levelHigh, levelPermilleAfterTick: levelPermille } } : {}),
      ...(scenario.plant?.kind === 'pedestrian-v1' ? { plant: { kind: 'pedestrian-v1', requestInput: pedestrianRequest!, phaseAfterTick: pedestrianPhase } } : {}),
    });
    inputSnapshots.push(Object.fromEntries([...terminalReads.values()].map((read) => [read.signal, inputs.get(location(read)) ?? false])));
  }
  const assertions = scenario.expectations.map((expectation): ScenarioAssertionResult => {
    const samples = expectation.kind === 'AT' ? trace.filter((sample) => sample.atMs === expectation.atMs)
      : expectation.kind === 'WITHIN' || expectation.kind === 'EVENTUALLY' ? trace.filter((sample) => sample.atMs >= expectation.fromMs! && sample.atMs <= expectation.fromMs! + expectation.withinMs!)
        : expectation.kind === 'FOR' ? trace.filter((sample) => sample.atMs >= expectation.fromMs! && sample.atMs <= expectation.fromMs! + expectation.forMs!) : trace;
    const firstMatch = samples.find((sample) => matches(expectation.reads, sample.outputs));
    if (expectation.kind === 'AT' || expectation.kind === 'WITHIN' || expectation.kind === 'EVENTUALLY') return { kind: expectation.kind, passed: firstMatch !== undefined, atMs: firstMatch?.atMs ?? samples.at(-1)?.atMs };
    if (expectation.kind === 'FOR') {
      const failure = samples.find((sample) => !matches(expectation.reads, sample.outputs));
      return { kind: expectation.kind, passed: failure === undefined, atMs: failure?.atMs ?? samples.at(-1)?.atMs };
    }
    if (expectation.kind === 'UNTIL') {
      const terminal = trace.findIndex((sample, index) => sample.atMs >= expectation.fromMs! && matches(expectation.untilReads!, inputSnapshots[index]!));
      if (terminal < 0) return { kind: expectation.kind, passed: false, atMs: scenario.durationMs };
      const failure = trace.find((sample, index) => sample.atMs >= expectation.fromMs! && index < terminal && !matches(expectation.reads, sample.outputs));
      return failure ? { kind: expectation.kind, passed: false, atMs: failure.atMs } : { kind: expectation.kind, passed: true, atMs: trace[terminal]!.atMs };
    }
    if (expectation.kind === 'RISING' || expectation.kind === 'FALLING') {
      const target = expectation.kind === 'RISING';
      const edge = trace.find((sample, index) => index > 0 && sample.atMs >= expectation.fromMs! && sample.atMs <= expectation.fromMs! + expectation.withinMs! && sample.outputs[expectation.reads[0]!.signal] === target && trace[index - 1]!.outputs[expectation.reads[0]!.signal] !== target);
      return { kind: expectation.kind, passed: edge !== undefined, atMs: edge?.atMs ?? expectation.fromMs! + expectation.withinMs! };
    }
    if (expectation.kind === 'ALWAYS') {
      const failure = samples.find((sample) => !matches(expectation.reads, sample.outputs));
      return { kind: expectation.kind, passed: failure === undefined, atMs: failure?.atMs };
    }
    return { kind: expectation.kind, passed: firstMatch === undefined, atMs: firstMatch?.atMs };
  });
  return { passed: assertions.every((assertion) => assertion.passed), trace, assertions };
}
