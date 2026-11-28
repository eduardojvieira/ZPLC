import type { DebugMap, DebugVarInfo } from '../compiler';
import type { PlantSceneFile } from '../plant/contracts';
import { catalogue as shippedCatalogue, type Catalogue } from '../plant/core/catalogue';
import {
  FACT_READ,
  MAX_SCENE_SCRIPT,
  compileSceneBlock,
  exchangeScan,
  factTruthy,
  validateSceneScript,
  type SceneScriptEvent,
  type ScenarioPlantPort,
} from './scenePort';

const MAX_EVENTS = 256;
const MAX_EXPECTATIONS = 256;
const MAX_SIGNALS = 64;
const MAX_SAMPLES = 10_000;
const MAX_TRACE_VALUES = 1_000_000;
// `Program.variable`, or the name of a VAR_GLOBAL alone: a global is seen by every program, whichever file declares it
const SIGNAL = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
/** The expectation kinds compileScenario accepts, in its order. */
export const SCENARIO_KINDS = ['AT', 'WITHIN', 'FOR', 'EVENTUALLY', 'ALWAYS', 'NEVER', 'UNTIL', 'RISING', 'FALLING'] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];
const compiledScenarios = new WeakSet<CompiledScenario>();

export interface ScenarioRuntimePort {
  loadProgram(zplc: Uint8Array): Promise<void>;
  reset(): Promise<void>;
  hasForces(): Promise<boolean>;
  setInput(address: number, bitOffset: number, value: boolean): Promise<void>;
  step(atMs: number): Promise<void>;
  readOutput(address: number, bitOffset: number): Promise<boolean>;
  /** Writes a raw INT (int16) or REAL (float32) into the input image; a runtime without it cannot run numeric scenes (R-G). */
  setInputNumber?(address: number, type: NumericType, raw: number): Promise<void>;
  /** Reads a raw INT or REAL from the output image. */
  readOutputNumber?(address: number, type: NumericType): Promise<number>;
  /** Reads `size` bytes of program memory after a step; a runtime without it cannot watch variables (AI-08). */
  readMemory?(address: number, size: number): Promise<Uint8Array>;
}

export type NumericType = 'INT' | 'REAL';
/** How a numeric scene signal sits in the image: its program type and byte width. */
export interface NumericBinding {
  readonly type: NumericType;
  readonly size: 2 | 4;
}

export interface ResolvedSignal {
  readonly signal: string;
  readonly address: number;
  readonly bitOffset: number;
  readonly value: boolean;
  /** A numeric fact condition only: the fact name and what it must hold (SCN-005). `signal` is then a unique trace key. */
  readonly fact?: string;
  readonly expect?: FactExpect;
}

/** What a numeric `fact:` condition states: an exact number (integer facts) or an inclusive range (real facts). */
export type FactExpect = number | { min?: number; max?: number };

/** A scene plant bound to the program: the port, the script, and every mapped signal resolved to its address (S1, C7). */
export interface CompiledScene {
  readonly port: ScenarioPlantPort;
  readonly script: ReadonlyArray<SceneScriptEvent>;
  readonly commands: ReadonlyArray<{
    readonly name: string;
    readonly point: string;
    readonly signal: ResolvedSignal;
    readonly numeric?: NumericBinding;
  }>;
  readonly sensors: ReadonlyArray<{ readonly name: string; readonly signal: ResolvedSignal; readonly numeric?: NumericBinding }>;
}

/** What `compileScenario` needs to bind a scenario that has a `"scene"` block (S1). */
export interface SceneScenarioContext {
  readonly port: ScenarioPlantPort;
  readonly scene: PlantSceneFile;
  readonly catalogue?: Catalogue;
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
  readonly scene?: CompiledScene;
  readonly plant?:
    | {
        readonly kind: 'motor-v1';
        readonly command: ResolvedSignal;
        readonly atSpeed: ResolvedSignal;
      }
    | {
        readonly kind: 'conveyor-v1';
        readonly beltCommand: ResolvedSignal;
        readonly diverterCommand: ResolvedSignal;
        readonly partAtClassifier: ResolvedSignal;
        readonly metalDetected: ResolvedSignal;
        readonly partAtDiverter: ResolvedSignal;
        readonly jamDetected: ResolvedSignal;
      }
    | {
        readonly kind: 'tank-v1';
        readonly pump: ResolvedSignal;
        readonly levelLow: ResolvedSignal;
        readonly levelHigh: ResolvedSignal;
      }
    | {
        readonly kind: 'pedestrian-v1';
        readonly pedRequest: ResolvedSignal;
        readonly pedWalk: ResolvedSignal;
      };
}

export interface ScenarioTraceSample {
  atMs: number;
  outputs: Record<string, boolean>;
  plant?:
    | { kind: 'motor-v1'; atSpeedInput: boolean; speedPermilleAfterTick: number }
    | {
        kind: 'conveyor-v1';
        seed: 0;
        partAtClassifierInput: boolean;
        metalDetectedInput: boolean;
        partAtDiverterInput: boolean;
        jamDetectedInput: boolean;
        classifiedCountAfterTick: number;
      }
    | { kind: 'tank-v1'; levelLowInput: boolean; levelHighInput: boolean; levelPermilleAfterTick: number }
    | { kind: 'pedestrian-v1'; requestInput: boolean; phaseAfterTick: 'approaching' | 'waiting' | 'crossing' | 'cleared' };
}

export interface ScenarioAssertionResult {
  kind: CompiledScenario['expectations'][number]['kind'];
  passed: boolean;
  /** First matching/failing sample according to the temporal assertion kind. */
  atMs?: number;
  /** Failed assertion only: its position in `expectations`. */
  index?: number;
  /** Failed assertion only: the signals of its condition (at most 8), the raw expected value and the one observed at `atMs`. */
  checks?: Array<{ signal: string; expected: boolean | FactExpect; observed?: boolean | number }>;
}

export interface ScenarioRunResult {
  passed: boolean;
  trace: ScenarioTraceSample[];
  assertions: ScenarioAssertionResult[];
  /** Only when `runScenario` was asked to observe: a sidecar, one record per trace sample, that is never part of the trace. */
  observed?: ScenarioObservedTrace;
}

/** A variable or a function block member to read after each step (AI-08): its canonical name, address and type. */
export interface ResolvedWatch {
  readonly signal: string;
  readonly address: number;
  readonly type: string;
  readonly size: number;
  readonly bitOffset?: number;
}
/** What a run records beside its trace (AI-08): the inputs it wrote, the watched variables and the raw plant facts. */
export interface ScenarioObserveOptions {
  readonly inputs?: boolean;
  readonly watch?: ReadonlyArray<ResolvedWatch>;
}
export interface ScenarioObservedTrace {
  inputs: Array<Record<string, boolean | number>>;
  watched: Array<Record<string, boolean | number>>;
  facts: Array<Record<string, boolean | number>>;
}

type UnknownRecord = Record<string, unknown>;

const MAX_FAILURE_CHECKS = 8;

function fail(message: string): never {
  throw new Error(`Invalid test scenario: ${message}`);
}
function record(value: unknown, path: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
  let prototype: object | null;
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(`${path} must be a plain JSON object`);
  }
  if ((prototype !== Object.prototype && prototype !== null) || Object.values(descriptors).some((descriptor) => !('value' in descriptor)))
    fail(`${path} must be a plain JSON object`);
  return value as UnknownRecord;
}
function exact(object: UnknownRecord, keys: string[], path: string): void {
  if (Object.keys(object).some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(object, key)))
    fail(`${path} has invalid keys`);
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
  } catch {
    fail(`${path} must be a plain JSON array`);
  }
  if (
    prototype !== Array.prototype ||
    value.length < minimum ||
    value.length > max ||
    keys.length !== value.length + 1 ||
    !keys.includes('length')
  )
    fail(`${path} must contain ${minimum}-${max} entries`);
  for (let index = 0; index < value.length; index++)
    if (!descriptors[index] || !('value' in descriptors[index])) fail(`${path} must be a dense data array`);
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
  if (typeof signal !== 'string' || !SIGNAL.test(signal)) fail(`${path} must be a POU.variable signal, or the name of a global`);
  return signal;
}
// The type of a plant fact by the head of its name (the fact grammar of plant/ci/sceneCheck.ts): counts are integers, positions and
// quantities are reals, and inBand and cell are booleans.
export const REAL_FACTS = new Set(['position', 'level', 'volume', 'spilledL', 'axis']);
export const BOOLEAN_FACTS = new Set(['inBand', 'cell']);
export const INTEGER_FACTS = new Set([
  ...['itemsEmitted', 'itemsRemoved', 'itemsDropped', 'itemsCollided', 'itemsAssembled', 'emitted', 'delivered', 'count', 'highs'],
  ...['picked', 'placed', 'drops', 'sorted', 'misrouted', 'stored', 'produced', 'misfires', 'blocked', 'stacked', 'layers', 'loaded'],
]);
const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A numeric `fact:` condition (SCN-005): an exact whole number for an integer fact, `{ min?, max? }` for a real fact. */
function factExpectation(signal: string, expected: unknown, path: string): { fact: string; expect: FactExpect; key: string } {
  const where = `${path}.${signal}`;
  const head = signal.split(':')[1]!;
  if (BOOLEAN_FACTS.has(head)) fail(`${where} is a boolean fact: state true or false`);
  if (!INTEGER_FACTS.has(head) && !REAL_FACTS.has(head)) fail(`${where} is not a numeric fact: state true or false`);
  const key = (parts: Array<string | false>) => `${signal}:${parts.filter(Boolean).join(':')}`.replaceAll('+', '');
  if (finiteNumber(expected)) {
    if (REAL_FACTS.has(head)) fail(`${where} is a real fact: state a range { "min": …, "max": … }, not an exact number`);
    if (!Number.isInteger(expected)) fail(`${where} must be a whole number`);
    return { fact: signal.slice('fact:'.length), expect: expected, key: key([`eq-${expected}`]) };
  }
  if (expected === null || typeof expected !== 'object' || Array.isArray(expected))
    fail(
      REAL_FACTS.has(head)
        ? `${where} is a real fact: state a range { "min": …, "max": … }`
        : `${where} is an integer fact: state an exact whole number`,
    );
  const range = expected as UnknownRecord;
  const { min, max } = range;
  if (
    !Object.keys(range).every((name) => name === 'min' || name === 'max') ||
    (min === undefined && max === undefined) ||
    (min !== undefined && !finiteNumber(min)) ||
    (max !== undefined && !finiteNumber(max))
  )
    fail(`${where} must be a range with a number min and max, either or both`);
  if (!REAL_FACTS.has(head)) fail(`${where} is an integer fact: state an exact whole number, not a range`);
  if (min !== undefined && max !== undefined && (min as number) > (max as number)) fail(`${where} needs min at most max`);
  return {
    fact: signal.slice('fact:'.length),
    expect: { ...(min === undefined ? {} : { min: min as number }), ...(max === undefined ? {} : { max: max as number }) },
    key: key([min !== undefined && `min-${min}`, max !== undefined && `max-${max}`]),
  };
}
function signalSet(
  value: unknown,
  path: string,
  allowFacts = false,
): Array<{ signal: string; value: boolean; fact?: string; expect?: FactExpect }> {
  const set = record(value, path);
  const entries = Object.entries(set);
  if (entries.length === 0 || entries.length > MAX_SIGNALS) fail(`${path} must contain 1-${MAX_SIGNALS} signals`);
  return entries
    .map(([signal, expected]) => {
      const isFact = allowFacts && FACT_READ.test(signal);
      if (isFact && typeof expected !== 'boolean') {
        const { key, ...numeric } = factExpectation(signal, expected, path);
        return { signal: key, value: true, ...numeric };
      }
      if (typeof expected !== 'boolean') fail(`${path}.${signal} must be boolean`);
      return { signal: isFact ? signal : namedSignal(signal, path), value: expected };
    })
    .sort((left, right) => (left.signal < right.signal ? -1 : left.signal > right.signal ? 1 : 0));
}

/**
 * The variable a signal names, and the signal in its canonical `Program.variable` form. `Program.variable` is a
 * variable of that program, or a VAR_GLOBAL, which every program sees: the map lists a global once, in the POU
 * of the file that declares it, so it is looked for there. A global alone, `Shared`, is read as seen from the
 * first program (CMP-042).
 */
export function findSignalVariable(debugMap: DebugMap, signal: string): { signal: string; variable: DebugVarInfo } | undefined {
  const [first, second, ...rest] = signal.split('.');
  if (first === undefined || rest.length > 0) return undefined;
  const pous = new Map(Object.entries(debugMap.pou));
  const declared = (name: string): DebugVarInfo | undefined => {
    for (const pou of pous.values()) {
      const variable = Object.hasOwn(pou.vars, name) ? pou.vars[name] : undefined;
      if (variable?.scope === 'global') return variable;
    }
    return undefined;
  };
  if (second === undefined) {
    const program = [...pous].find(([, pou]) => pou.type === 'PROGRAM')?.[0];
    const variable = declared(first);
    return variable && program !== undefined ? { signal: `${program}.${first}`, variable } : undefined;
  }
  const pou = pous.get(first);
  const own = pou && Object.hasOwn(pou.vars, second) ? pou.vars[second] : undefined;
  if (own) return { signal, variable: own };
  const global = pou?.type === 'PROGRAM' ? declared(second) : undefined;
  return global ? { signal, variable: global } : undefined;
}

// the byte width of each type a watch can read
const WATCH_SIZES = new Map<string, number>([
  ['BOOL', 1],
  ['SINT', 1],
  ['USINT', 1],
  ['BYTE', 1],
  ['INT', 2],
  ['UINT', 2],
  ['WORD', 2],
  ['DINT', 4],
  ['UDINT', 4],
  ['DWORD', 4],
  ['TIME', 4],
  ['REAL', 4],
  ['LINT', 8],
  ['ULINT', 8],
  ['LWORD', 8],
  ['LREAL', 8],
]);

/** `Program.variable`, a global, or `Program.instance.member` of a block, when its type is one a watch reads (AI-08). */
export function resolveWatch(debugMap: DebugMap, signal: string): ResolvedWatch | undefined {
  const parts = signal.split('.');
  const member = parts.length === 3 ? parts.pop()! : undefined;
  const found = findSignalVariable(debugMap, parts.join('.'));
  if (!found) return undefined;
  const { variable } = found;
  const child =
    member !== undefined && variable.children && Object.hasOwn(variable.children, member) ? variable.children[member] : undefined;
  if (member !== undefined && !child) return undefined;
  const type = child?.type ?? variable.type;
  const size = child?.size ?? variable.size;
  if (WATCH_SIZES.get(type) !== size || !Number.isInteger(variable.addr)) return undefined;
  return {
    signal: child ? `${found.signal}.${member}` : found.signal,
    address: variable.addr + (child?.offset ?? 0),
    type,
    size,
    ...(child === undefined && variable.bitOffset !== undefined ? { bitOffset: variable.bitOffset } : {}),
  };
}

/** Every name of the programs that `resolveWatch` accepts, sorted: the valid values of a wrong watched name. */
export function watchableSignals(debugMap: DebugMap): string[] {
  const names = new Set<string>();
  for (const [pou, info] of Object.entries(debugMap.pou)) {
    if (info.type !== 'PROGRAM') continue;
    for (const [name, variable] of Object.entries(info.vars))
      for (const candidate of [`${pou}.${name}`, ...Object.keys(variable.children ?? {}).map((child) => `${pou}.${name}.${child}`)])
        if (resolveWatch(debugMap, candidate)) names.add(candidate);
  }
  return [...names].sort();
}

/** The value of a watched variable from the bytes read at its address. */
export function readWatch(watch: ResolvedWatch, bytes: Uint8Array): boolean | number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (watch.type) {
    case 'BOOL':
      return watch.bitOffset === undefined ? bytes[0] !== 0 : (bytes[0]! & (1 << watch.bitOffset)) !== 0;
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
    case 'TIME':
      return view.getInt32(0, true);
    case 'UDINT':
    case 'DWORD':
      return view.getUint32(0, true);
    case 'REAL':
      return view.getFloat32(0, true);
    case 'LREAL':
      return view.getFloat64(0, true);
    case 'LINT':
      return Number(view.getBigInt64(0, true));
    default:
      return Number(view.getBigUint64(0, true));
  }
}

function resolve(debugMap: DebugMap, signal: string, expectedRegion: 'IPI' | 'OPI', value: boolean): ResolvedSignal {
  const found = findSignalVariable(debugMap, signal);
  if (!found) fail(`unknown signal ${signal}`);
  validateAddress(found.variable, debugMap, expectedRegion, found.signal);
  return { signal: found.signal, address: found.variable.addr, bitOffset: found.variable.bitOffset!, value };
}

/** A numeric scene signal: an INT (2 bytes) or REAL (4 bytes) variable of the image the direction needs, inside that image. */
function resolveNumeric(
  debugMap: DebugMap,
  signal: string,
  type: NumericType,
  region: 'IPI' | 'OPI',
): { signal: ResolvedSignal; numeric: NumericBinding } | string {
  const found = findSignalVariable(debugMap, signal);
  if (!found) return `unknown signal ${signal}`;
  const { variable } = found;
  const size = type === 'INT' ? 2 : 4;
  if (variable.type !== type || variable.region !== region || variable.size !== size)
    return `${found.signal} must be a ${type} ${region} signal of ${size} bytes`;
  const base = region === 'IPI' ? debugMap.memoryLayout.ipiBase : debugMap.memoryLayout.opiBase;
  const span = region === 'IPI' ? debugMap.memoryLayout.ipiSize : debugMap.memoryLayout.opiSize;
  if (!Number.isInteger(variable.addr) || variable.addr < base || variable.addr + size > base + span)
    return `${found.signal} is outside ${region} memory`;
  return { signal: { signal: found.signal, address: variable.addr, bitOffset: 0, value: false }, numeric: { type, size } };
}

function validateAddress(variable: DebugVarInfo, debugMap: DebugMap, expectedRegion: 'IPI' | 'OPI', signal: string): void {
  if (variable.type !== 'BOOL' || variable.region !== expectedRegion || variable.size < 1 || !Number.isInteger(variable.size))
    fail(`${signal} must be a BOOL ${expectedRegion} signal`);
  if (!Number.isInteger(variable.addr) || !Number.isInteger(variable.bitOffset) || variable.bitOffset! < 0 || variable.bitOffset! > 7)
    fail(`${signal} has invalid bit address`);
  const base = expectedRegion === 'IPI' ? debugMap.memoryLayout.ipiBase : debugMap.memoryLayout.opiBase;
  const size = expectedRegion === 'IPI' ? debugMap.memoryLayout.ipiSize : debugMap.memoryLayout.opiSize;
  if (!Number.isInteger(base) || !Number.isInteger(size) || size < 1 || variable.addr < base || variable.addr + variable.size > base + size)
    fail(`${signal} is outside ${expectedRegion} memory`);
}
function factHolds(fact: number, expect: FactExpect): boolean {
  if (typeof expect === 'number') return fact === expect;
  return (expect.min === undefined || fact >= expect.min) && (expect.max === undefined || fact <= expect.max);
}

function location(signal: Pick<ResolvedSignal, 'address' | 'bitOffset'>): string {
  return `${signal.address}:${signal.bitOffset}`;
}

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
  if (scenario.scene) {
    for (const bound of [...scenario.scene.commands, ...scenario.scene.sensors]) {
      Object.freeze(bound.signal);
      if (bound.numeric) Object.freeze(bound.numeric);
      Object.freeze(bound);
    }
    Object.freeze(scenario.scene.commands);
    Object.freeze(scenario.scene.sensors);
    Object.freeze(scenario.scene.script);
    Object.freeze(scenario.scene);
  }
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

function bindScene(input: unknown, context: SceneScenarioContext, debugMap: DebugMap, tickMs: number, durationMs: number): CompiledScene {
  const block = compileSceneBlock(input);
  if ('problems' in block) return fail(block.problems.join('; '));
  const { port } = context;
  if (tickMs % port.core.stepMs !== 0) fail(`tickMs must be a multiple of the plant step ${port.core.stepMs}`);
  if (block.script.length > MAX_SCENE_SCRIPT) fail('scene script is too long');
  block.script.forEach((event, index) => {
    const path = `scene.script[${index}].atMs`;
    if (event.atMs > durationMs) fail(`${path} ${event.atMs} is after the end of the scenario (durationMs ${durationMs})`);
    aligned(event.atMs, path, tickMs, durationMs);
  });
  const problems = validateSceneScript(block.script, context.scene, port, context.catalogue ?? shippedCatalogue);
  const plantSignals = new Map(port.core.signals.map((signal) => [signal.name, signal]));
  const commands: Array<{ name: string; point: string; signal: ResolvedSignal; numeric?: NumericBinding }> = [];
  const sensors: Array<{ name: string; signal: ResolvedSignal; numeric?: NumericBinding }> = [];
  for (const [name, mapped] of Object.entries(port.map.signals)) {
    const plantSignal = plantSignals.get(name);
    if (!plantSignal || plantSignal.direction !== mapped.direction)
      problems.push(`scene map: "${name}" is not a ${mapped.direction} signal of the scene`);
    else if (mapped.type !== 'BOOL') {
      const region = mapped.direction === 'command' ? 'OPI' : 'IPI';
      const bound = resolveNumeric(debugMap, mapped.point, mapped.type, region);
      if (typeof bound === 'string') problems.push(`scene map: "${name}": ${bound}`);
      else if (mapped.direction === 'command') commands.push({ name, point: mapped.point, ...bound });
      else sensors.push({ name, ...bound });
    } else if (mapped.direction === 'command')
      commands.push({ name, point: mapped.point, signal: resolve(debugMap, mapped.point, 'OPI', false) });
    else sensors.push({ name, signal: resolve(debugMap, mapped.point, 'IPI', false) });
  }
  if (problems.length > 0) fail(problems.join('; '));
  return { port, script: block.script, commands, sensors };
}

export function compileScenario(input: unknown, debugMap: DebugMap, sceneContext?: SceneScenarioContext): CompiledScenario {
  const source = record(input, 'scenario');
  const hasPlant = Object.hasOwn(source, 'plant');
  const hasScene = Object.hasOwn(source, 'scene');
  exact(
    source,
    [
      ...(hasPlant
        ? ['schemaVersion', 'id', 'plant', 'tickMs', 'durationMs', 'events', 'expectations']
        : ['schemaVersion', 'id', 'tickMs', 'durationMs', 'events', 'expectations']),
      ...(hasScene ? ['scene'] : []),
    ],
    'scenario',
  );
  if (hasScene && hasPlant) fail('scene and plant are exclusive');
  if (hasScene && !sceneContext) fail('scene needs the scene plant it runs on');
  if (source.schemaVersion !== 1 || typeof source.id !== 'string' || source.id.length === 0 || source.id.length > 128)
    fail('schemaVersion or id');
  const tickMs = integer(source.tickMs, 'tickMs', 60_000);
  if (tickMs === 0) fail('tickMs must be positive');
  const durationMs = integer(source.durationMs, 'durationMs', 3_600_000);
  if (durationMs === 0 || durationMs % tickMs !== 0) fail('durationMs must be positive and align to tickMs');
  if (durationMs / tickMs + 1 > MAX_SAMPLES) fail(`scenario exceeds ${MAX_SAMPLES} samples`);
  const plant = hasPlant
    ? (() => {
        if (source.plant === 'motor-v1') {
          if (tickMs !== 10) fail('motor-v1 requires tickMs 10');
          return {
            kind: 'motor-v1' as const,
            command: resolve(debugMap, 'MotorPlant.Command', 'OPI', false),
            atSpeed: resolve(debugMap, 'MotorPlant.AtSpeed', 'IPI', false),
          };
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
      })()
    : undefined;
  const scene = hasScene ? bindScene(source.scene, sceneContext!, debugMap, tickMs, durationMs) : undefined;
  const eventInputs = dataArray(source.events, 'events', MAX_EVENTS, 0);
  const expectationInputs = dataArray(source.expectations, 'expectations', MAX_EXPECTATIONS);

  const duplicates = new Set<string>();
  const physicalWrites = new Map<string, boolean>();
  const events = eventInputs
    .map((raw, index) => {
      const event = record(raw, `events[${index}]`);
      exact(event, ['atMs', 'set'], `events[${index}]`);
      const atMs = aligned(event.atMs, `events[${index}].atMs`, tickMs, durationMs);
      const writes = signalSet(event.set, `events[${index}].set`).map(({ signal, value }) => {
        const key = `${atMs}:${signal}`;
        if (duplicates.has(key)) fail(`duplicate event for ${signal} at ${atMs}ms`);
        duplicates.add(key);
        const resolved = resolve(debugMap, signal, 'IPI', value);
        if (plant?.kind === 'motor-v1' && location(resolved) === location(plant.atSpeed))
          fail(`events[${index}].set cannot write plant-owned MotorPlant.AtSpeed`);
        if (
          plant?.kind === 'conveyor-v1' &&
          [plant.partAtClassifier, plant.metalDetected, plant.partAtDiverter, plant.jamDetected].some(
            (owned) => location(resolved) === location(owned),
          )
        )
          fail(`events[${index}].set cannot write conveyor-v1 plant-owned input`);
        if (plant?.kind === 'tank-v1' && [plant.levelLow, plant.levelHigh].some((owned) => location(resolved) === location(owned)))
          fail(`events[${index}].set cannot write tank-v1 plant-owned input`);
        if (plant?.kind === 'pedestrian-v1' && location(resolved) === location(plant.pedRequest))
          fail(`events[${index}].set cannot write pedestrian-v1 plant-owned input`);
        if (scene?.sensors.some((owned) => location(resolved) === location(owned.signal)))
          fail(`events[${index}].set cannot write a scene plant-owned input`);
        const physicalKey = `${atMs}:${location(resolved)}`;
        const previous = physicalWrites.get(physicalKey);
        if (previous !== undefined && previous !== value) fail(`conflicting event for IPI location at ${atMs}ms`);
        physicalWrites.set(physicalKey, value);
        return resolved;
      });
      return { atMs, writes };
    })
    .sort((left, right) => left.atMs - right.atMs);

  const expectations = expectationInputs.map((raw, index) => {
    const expectation = record(raw, `expectations[${index}]`);
    if (
      expectation.kind !== 'AT' &&
      expectation.kind !== 'WITHIN' &&
      expectation.kind !== 'FOR' &&
      expectation.kind !== 'EVENTUALLY' &&
      expectation.kind !== 'ALWAYS' &&
      expectation.kind !== 'NEVER' &&
      expectation.kind !== 'UNTIL' &&
      expectation.kind !== 'RISING' &&
      expectation.kind !== 'FALLING'
    )
      fail(`expectations[${index}].kind`);
    const kind = expectation.kind as ScenarioKind;
    const keys =
      kind === 'AT'
        ? ['kind', 'atMs', 'condition']
        : kind === 'WITHIN' || kind === 'EVENTUALLY' || kind === 'RISING' || kind === 'FALLING'
          ? ['kind', 'fromMs', 'withinMs', 'condition']
          : kind === 'FOR'
            ? ['kind', 'fromMs', 'forMs', 'condition']
            : kind === 'UNTIL'
              ? ['kind', 'fromMs', 'condition', 'until']
              : ['kind', 'condition'];
    exact(expectation, keys, `expectations[${index}]`);
    const reads = signalSet(expectation.condition, `expectations[${index}].condition`, hasScene).map(({ signal, value, ...numeric }) =>
      signal.startsWith('fact:') ? { signal, address: -1, bitOffset: 0, value, ...numeric } : resolve(debugMap, signal, 'OPI', value),
    );
    if (kind === 'AT') return { kind, reads, atMs: aligned(expectation.atMs, `expectations[${index}].atMs`, tickMs, durationMs) };
    if (kind === 'WITHIN' || kind === 'EVENTUALLY' || kind === 'RISING' || kind === 'FALLING') {
      const fromMs = aligned(expectation.fromMs, `expectations[${index}].fromMs`, tickMs, durationMs);
      const withinMs = aligned(expectation.withinMs, `expectations[${index}].withinMs`, tickMs, durationMs);
      if (fromMs + withinMs > durationMs) fail(`expectations[${index}] window exceeds durationMs`);
      if ((kind === 'RISING' || kind === 'FALLING') && (reads.length !== 1 || reads[0]!.value !== (kind === 'RISING')))
        fail(`expectations[${index}].condition must be exactly one ${kind === 'RISING' ? 'true' : 'false'} BOOL OPI signal`);
      return { kind, reads, fromMs, withinMs };
    }
    if (kind === 'FOR') {
      const fromMs = aligned(expectation.fromMs, `expectations[${index}].fromMs`, tickMs, durationMs);
      const forMs = aligned(expectation.forMs, `expectations[${index}].forMs`, tickMs, durationMs);
      if (fromMs + forMs > durationMs) fail(`expectations[${index}] window exceeds durationMs`);
      return { kind, reads, fromMs, forMs };
    }
    if (kind === 'UNTIL')
      return {
        kind,
        reads,
        fromMs: aligned(expectation.fromMs, `expectations[${index}].fromMs`, tickMs, durationMs),
        untilReads: signalSet(expectation.until, `expectations[${index}].until`).map(({ signal, value }) =>
          resolve(debugMap, signal, 'IPI', value),
        ),
      };
    return { kind, reads };
  });
  const samples = durationMs / tickMs + 1;
  const observationReads = [
    ...expectations.flatMap((expectation) => [...expectation.reads, ...(expectation.untilReads ?? [])]),
    ...(plant?.kind === 'motor-v1'
      ? [plant.command]
      : plant?.kind === 'conveyor-v1'
        ? [plant.beltCommand, plant.diverterCommand]
        : plant?.kind === 'tank-v1'
          ? [plant.pump]
          : plant?.kind === 'pedestrian-v1'
            ? [plant.pedWalk]
            : []),
    ...(scene?.commands.map((command) => command.signal) ?? []),
  ];
  const uniqueReads = new Set(observationReads.map((read) => read.signal)).size;
  const conditionReads = observationReads.length;
  if (uniqueReads > MAX_SIGNALS || samples * uniqueReads > MAX_TRACE_VALUES || samples * conditionReads > MAX_TRACE_VALUES)
    fail('scenario observation budget exceeded');
  return freezeScenario({
    id: source.id,
    tickMs,
    durationMs,
    events,
    expectations,
    ...(plant ? { plant } : {}),
    ...(scene ? { scene } : {}),
  });
}

function matches(reads: ReadonlyArray<ResolvedSignal>, outputs: Record<string, boolean>): boolean {
  return reads.every(({ signal, value }) => outputs[signal] === value);
}

export async function runScenario(
  scenario: CompiledScenario,
  zplc: Uint8Array,
  runtime: ScenarioRuntimePort,
  observe?: ScenarioObserveOptions,
): Promise<ScenarioRunResult> {
  if (!compiledScenarios.has(scenario)) throw new Error('Scenario must be produced by compileScenario');
  const watch = observe?.watch ?? [];
  if (watch.length > 0 && !runtime.readMemory) throw new Error('the runtime has no readMemory; it cannot watch variables');
  if (await runtime.hasForces()) throw new Error('Cannot run scenario with active forces');
  for (const bound of [...(scenario.scene?.commands ?? []), ...(scenario.scene?.sensors ?? [])])
    if (bound.numeric && (!runtime.setInputNumber || !runtime.readOutputNumber))
      throw new Error(
        `scene map: "${bound.name}" is ${bound.numeric.type}; the runtime has no numeric methods (setInputNumber, readOutputNumber)`,
      );
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
  const scene = scenario.scene;
  if (scene) {
    for (const command of scene.commands) if (!command.numeric) reads.set(command.signal.signal, command.signal);
    scene.port.core.reset();
  }
  const bySignal = (left: ResolvedSignal, right: ResolvedSignal) => (left.signal < right.signal ? -1 : left.signal > right.signal ? 1 : 0);
  const factReads = [...reads.values()].filter((read) => read.address < 0).sort(bySignal);
  const orderedReads = [...reads.values()].filter((read) => read.address >= 0).sort(bySignal);
  let lastOutputs: Record<string, boolean> = {};
  // raw values of the numeric commands, read after each step like `lastOutputs` for BOOL
  const commandValues: Record<string, number> = {};
  const trace: ScenarioTraceSample[] = [];
  // the number a numeric fact condition read at each time: the trace itself stays boolean
  const rawFacts = new Map<number, Record<string, number>>();
  const inputs = new Map<string, boolean>([...terminalReads.values()].map((read) => [location(read), false]));
  const inputSnapshots: Record<string, boolean>[] = [];
  // the sidecar (AI-08): the inputs by name, every one known from the start, and what each step watched and the plant knew
  const observed: ScenarioObservedTrace | undefined = observe ? { inputs: [], watched: [], facts: [] } : undefined;
  const named: Record<string, boolean | number> | undefined = observe?.inputs ? {} : undefined;
  if (named) {
    for (const read of terminalReads.values()) named[read.signal] = false;
    for (const event of scenario.events) for (const write of event.writes) named[write.signal] = false;
    for (const sensor of scene?.sensors ?? []) named[sensor.signal.signal] = sensor.numeric ? 0 : false;
  }
  const setInput = (signal: ResolvedSignal, value: boolean) => {
    inputs.set(location(signal), value);
    if (named) named[signal.signal] = value;
  };
  let speedPermille = 0;
  let conveyorState: 'idle' | 'classifier' | 'diverter' | 'transfer' | 'jammed' = 'idle';
  let classifiedCount = 0;
  let levelPermille = 200;
  let pedestrianPhase: 'approaching' | 'waiting' | 'crossing' | 'cleared' = 'approaching';
  let crossingTicks = 0;
  for (let atMs = 0; atMs <= scenario.durationMs; atMs += scenario.tickMs) {
    const atSpeedInput = scenario.plant?.kind === 'motor-v1' ? speedPermille >= 1000 : undefined;
    if (scenario.plant?.kind === 'motor-v1') {
      setInput(scenario.plant.atSpeed, atSpeedInput!);
      await runtime.setInput(scenario.plant.atSpeed.address, scenario.plant.atSpeed.bitOffset, atSpeedInput!);
    }
    const conveyorInputs =
      scenario.plant?.kind === 'conveyor-v1'
        ? {
            partAtClassifier: conveyorState === 'classifier',
            metalDetected: conveyorState === 'classifier',
            partAtDiverter: conveyorState === 'diverter',
            jamDetected: conveyorState === 'jammed',
          }
        : undefined;
    if (scenario.plant?.kind === 'conveyor-v1')
      for (const [signal, value] of [
        [scenario.plant.partAtClassifier, conveyorInputs!.partAtClassifier],
        [scenario.plant.metalDetected, conveyorInputs!.metalDetected],
        [scenario.plant.partAtDiverter, conveyorInputs!.partAtDiverter],
        [scenario.plant.jamDetected, conveyorInputs!.jamDetected],
      ] as const) {
        setInput(signal, value);
        await runtime.setInput(signal.address, signal.bitOffset, value);
      }
    const tankInputs = scenario.plant?.kind === 'tank-v1' ? { levelLow: levelPermille <= 250, levelHigh: levelPermille >= 750 } : undefined;
    if (scenario.plant?.kind === 'tank-v1')
      for (const [signal, value] of [
        [scenario.plant.levelLow, tankInputs!.levelLow],
        [scenario.plant.levelHigh, tankInputs!.levelHigh],
      ] as const) {
        setInput(signal, value);
        await runtime.setInput(signal.address, signal.bitOffset, value);
      }
    const pedestrianRequest =
      scenario.plant?.kind === 'pedestrian-v1'
        ? atMs >= 10 && (pedestrianPhase === 'approaching' || pedestrianPhase === 'waiting')
        : undefined;
    if (scenario.plant?.kind === 'pedestrian-v1') {
      setInput(scenario.plant.pedRequest, pedestrianRequest!);
      await runtime.setInput(scenario.plant.pedRequest.address, scenario.plant.pedRequest.bitOffset, pedestrianRequest!);
    }
    const writes = scenario.events
      .filter((event) => event.atMs === atMs)
      .flatMap((event) => event.writes)
      .sort((left, right) => (left.signal < right.signal ? -1 : left.signal > right.signal ? 1 : 0));
    for (const write of writes) {
      setInput(write, write.value);
      await runtime.setInput(write.address, write.bitOffset, write.value);
    }
    if (scene)
      await exchangeScan(
        scene.port,
        async (point) => {
          const command = scene.commands.find((candidate) => candidate.point === point)!;
          return command.numeric ? (commandValues[command.name] ?? 0) : (lastOutputs[command.signal.signal] ?? false);
        },
        async (sensed) => {
          for (const sensor of scene.sensors) {
            if (!(sensor.name in sensed)) continue;
            if (sensor.numeric) {
              await runtime.setInputNumber!(sensor.signal.address, sensor.numeric.type, Number(sensed[sensor.name]));
              if (named) named[sensor.signal.signal] = Number(sensed[sensor.name]);
              continue;
            }
            const value = Boolean(sensed[sensor.name]);
            setInput(sensor.signal, value);
            await runtime.setInput(sensor.signal.address, sensor.signal.bitOffset, value);
          }
        },
        atMs,
        scenario.tickMs,
        scene.script,
      );
    await runtime.step(atMs);
    const outputs: Record<string, boolean> = {};
    for (const read of orderedReads) outputs[read.signal] = await runtime.readOutput(read.address, read.bitOffset);
    if (scene) {
      for (const command of scene.commands)
        if (command.numeric) commandValues[command.name] = await runtime.readOutputNumber!(command.signal.address, command.numeric.type);
      const facts = scene.port.core.facts();
      if (observed)
        observed.facts.push(
          Object.fromEntries(
            Object.entries(facts).flatMap(([name, fact]) => (typeof fact === 'string' ? [] : [[`fact:${name}`, fact] as const])),
          ),
        );
      const raw: Record<string, number> = {};
      for (const read of factReads) {
        const fact = facts[read.fact ?? read.signal.slice('fact:'.length)];
        if (read.expect === undefined) outputs[read.signal] = factTruthy(fact);
        else {
          outputs[read.signal] = typeof fact === 'number' && factHolds(fact, read.expect);
          if (typeof fact === 'number') raw[read.signal] = fact;
        }
      }
      rawFacts.set(atMs, raw);
      lastOutputs = outputs;
    }
    if (scenario.plant?.kind === 'motor-v1')
      speedPermille = outputs[scenario.plant.command.signal] ? Math.min(1000, speedPermille + 500) : Math.max(0, speedPermille - 1000);
    if (scenario.plant?.kind === 'conveyor-v1' && outputs[scenario.plant.beltCommand.signal]) {
      if (conveyorState === 'idle') conveyorState = 'classifier';
      else if (conveyorState === 'classifier') conveyorState = 'diverter';
      else if (conveyorState === 'diverter') {
        if (outputs[scenario.plant.diverterCommand.signal]) classifiedCount = 1;
        conveyorState = 'transfer';
      } else if (conveyorState === 'transfer') conveyorState = 'jammed';
    }
    if (scenario.plant?.kind === 'tank-v1')
      levelPermille = outputs[scenario.plant.pump.signal] ? Math.min(1000, levelPermille + 100) : Math.max(0, levelPermille - 20);
    if (scenario.plant?.kind === 'pedestrian-v1') {
      if (pedestrianPhase === 'approaching' && pedestrianRequest) pedestrianPhase = 'waiting';
      if (pedestrianPhase === 'waiting' && outputs[scenario.plant.pedWalk.signal]) {
        pedestrianPhase = 'crossing';
        crossingTicks = 0;
      } else if (pedestrianPhase === 'crossing') {
        crossingTicks++;
        if (crossingTicks >= 3) pedestrianPhase = 'cleared';
      }
    }
    trace.push({
      atMs,
      outputs,
      ...(scenario.plant?.kind === 'motor-v1'
        ? { plant: { kind: 'motor-v1', atSpeedInput: atSpeedInput!, speedPermilleAfterTick: speedPermille } }
        : {}),
      ...(scenario.plant?.kind === 'conveyor-v1'
        ? {
            plant: {
              kind: 'conveyor-v1',
              seed: 0,
              partAtClassifierInput: conveyorInputs!.partAtClassifier,
              metalDetectedInput: conveyorInputs!.metalDetected,
              partAtDiverterInput: conveyorInputs!.partAtDiverter,
              jamDetectedInput: conveyorInputs!.jamDetected,
              classifiedCountAfterTick: classifiedCount,
            },
          }
        : {}),
      ...(scenario.plant?.kind === 'tank-v1'
        ? {
            plant: {
              kind: 'tank-v1',
              levelLowInput: tankInputs!.levelLow,
              levelHighInput: tankInputs!.levelHigh,
              levelPermilleAfterTick: levelPermille,
            },
          }
        : {}),
      ...(scenario.plant?.kind === 'pedestrian-v1'
        ? { plant: { kind: 'pedestrian-v1', requestInput: pedestrianRequest!, phaseAfterTick: pedestrianPhase } }
        : {}),
    });
    inputSnapshots.push(Object.fromEntries([...terminalReads.values()].map((read) => [read.signal, inputs.get(location(read)) ?? false])));
    if (named) observed!.inputs.push({ ...named });
    if (watch.length > 0) {
      const values: Record<string, boolean | number> = {};
      for (const item of watch) values[item.signal] = readWatch(item, await runtime.readMemory!(item.address, item.size));
      observed!.watched.push(values);
    }
  }
  const outcomes = scenario.expectations.map((expectation): ScenarioAssertionResult => {
    const samples =
      expectation.kind === 'AT'
        ? trace.filter((sample) => sample.atMs === expectation.atMs)
        : expectation.kind === 'WITHIN' || expectation.kind === 'EVENTUALLY'
          ? trace.filter((sample) => sample.atMs >= expectation.fromMs! && sample.atMs <= expectation.fromMs! + expectation.withinMs!)
          : expectation.kind === 'FOR'
            ? trace.filter((sample) => sample.atMs >= expectation.fromMs! && sample.atMs <= expectation.fromMs! + expectation.forMs!)
            : trace;
    const firstMatch = samples.find((sample) => matches(expectation.reads, sample.outputs));
    if (expectation.kind === 'AT' || expectation.kind === 'WITHIN' || expectation.kind === 'EVENTUALLY')
      return { kind: expectation.kind, passed: firstMatch !== undefined, atMs: firstMatch?.atMs ?? samples.at(-1)?.atMs };
    if (expectation.kind === 'FOR') {
      const failure = samples.find((sample) => !matches(expectation.reads, sample.outputs));
      return { kind: expectation.kind, passed: failure === undefined, atMs: failure?.atMs ?? samples.at(-1)?.atMs };
    }
    if (expectation.kind === 'UNTIL') {
      const terminal = trace.findIndex(
        (sample, index) => sample.atMs >= expectation.fromMs! && matches(expectation.untilReads!, inputSnapshots[index]!),
      );
      if (terminal < 0) return { kind: expectation.kind, passed: false, atMs: scenario.durationMs };
      const failure = trace.find(
        (sample, index) => sample.atMs >= expectation.fromMs! && index < terminal && !matches(expectation.reads, sample.outputs),
      );
      return failure
        ? { kind: expectation.kind, passed: false, atMs: failure.atMs }
        : { kind: expectation.kind, passed: true, atMs: trace[terminal]!.atMs };
    }
    if (expectation.kind === 'RISING' || expectation.kind === 'FALLING') {
      const target = expectation.kind === 'RISING';
      const edge = trace.find(
        (sample, index) =>
          index > 0 &&
          sample.atMs >= expectation.fromMs! &&
          sample.atMs <= expectation.fromMs! + expectation.withinMs! &&
          sample.outputs[expectation.reads[0]!.signal] === target &&
          trace[index - 1]!.outputs[expectation.reads[0]!.signal] !== target,
      );
      return { kind: expectation.kind, passed: edge !== undefined, atMs: edge?.atMs ?? expectation.fromMs! + expectation.withinMs! };
    }
    if (expectation.kind === 'ALWAYS') {
      const failure = samples.find((sample) => !matches(expectation.reads, sample.outputs));
      return { kind: expectation.kind, passed: failure === undefined, atMs: failure?.atMs };
    }
    return { kind: expectation.kind, passed: firstMatch === undefined, atMs: firstMatch?.atMs };
  });
  const assertions = outcomes.map((outcome, index): ScenarioAssertionResult => {
    if (outcome.passed) return outcome;
    const observedAt = trace.find((sample) => sample.atMs === outcome.atMs)?.outputs;
    const checks = scenario.expectations[index]!.reads.slice(0, MAX_FAILURE_CHECKS).map(({ signal, value, fact, expect }) => {
      if (expect !== undefined) {
        const observed = rawFacts.get(outcome.atMs!)?.[signal];
        return { signal: `fact:${fact}`, expected: expect, ...(observed === undefined ? {} : { observed }) };
      }
      const observed = observedAt?.[signal];
      return { signal, expected: value, ...(typeof observed === 'boolean' ? { observed } : {}) };
    });
    return { ...outcome, index, checks };
  });
  return { passed: assertions.every((assertion) => assertion.passed), trace, assertions, ...(observed ? { observed } : {}) };
}
