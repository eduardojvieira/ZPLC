/**
 * The explicit binding of a plant to a program's I/O (LRN-018): plant signal -> `Program.Name`, resolved against the I/O map
 * of the loaded program (`runtime/ioMap.ts`). A lesson ships its mapping next to its starter (LRN-021); no signal is ever
 * found by guessing a variable name.
 *
 * Pure TypeScript with no Electron, store or component import.
 */
import type { DeclaredInput } from '../runtime/declaredInputs';
import type { DeclaredOutput, IoMap } from '../runtime/ioMap';
import { PLANT_KINDS, PLANT_MODELS, type PlantKind } from './plantEngine';

/** Schema 1, as the ten 2.0 lessons ship it: BOOL signals only, by side. */
export interface PlantMapV1 {
  schemaVersion: 1;
  plant: PlantKind;
  /** Plant signal the program writes -> the program output that carries it. */
  reads: Record<string, string>;
  /** Plant signal the plant sets -> the program input that receives it. */
  drives: Record<string, string>;
}

export type SignalDirection = 'command' | 'sensor';
/** `INT` is the 16-bit integer. */
export type SignalType = 'BOOL' | 'INT' | 'REAL';

/**
 * The scaling of a numeric signal to the program's variable, in the shape and with the names of the `range` of an analog
 * channel of a board description (`firmware/zephyr/scripts/zplc_boards.py`, IO-006): the raw value of the program variable
 * (`raw_min`..`raw_max`) is the engineering value (`eng_min`..`eng_max`, in `unit`) of the plant, linearly.
 */
export interface SignalRange {
  raw_min: number;
  raw_max: number;
  eng_min: number;
  eng_max: number;
  unit: string;
}

export interface PlantSignal {
  name: string;
  /** command: program to plant; sensor: plant to program (PLT-003). */
  direction: SignalDirection;
  type: SignalType;
  /** The program point, `Program.Name`. */
  point: string;
  /** Required for INT and REAL, absent for BOOL. */
  range?: SignalRange;
}

export type PlantTarget = { plant: PlantKind } | { scene: string };

/** Schema 2: the typed form (LNK-001). */
export interface PlantMapV2 {
  schemaVersion: 2;
  target: PlantTarget;
  signals: Record<string, Omit<PlantSignal, 'name'>>;
}

export type PlantMap = PlantMapV1 | PlantMapV2;

/** The typed form every map is read in. */
export interface TypedPlantMap {
  target: PlantTarget;
  signals: PlantSignal[];
}

/** A schema 1 map becomes typed in memory (every 2.0 plant signal is BOOL); the file is never rewritten. */
export function normalizePlantMap(map: PlantMap): TypedPlantMap {
  if (map.schemaVersion === 2)
    return { target: map.target, signals: Object.entries(map.signals).map(([name, signal]) => ({ name, ...signal })) };
  const bool = (direction: SignalDirection, side: Record<string, string>) =>
    Object.entries(side).map(([name, point]): PlantSignal => ({ name, direction, type: 'BOOL', point }));
  return { target: { plant: map.plant }, signals: [...bool('command', map.reads), ...bool('sensor', map.drives)] };
}

/** The 2.0 plant a map names, or undefined for a scene. */
export const plantKindOf = (map: PlantMap): PlantKind | undefined => {
  const target = normalizePlantMap(map).target;
  return 'plant' in target ? target.plant : undefined;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const POINT = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

function checkSide(side: unknown, name: 'reads' | 'drives', expected: readonly string[], problems: string[]): void {
  if (!isObject(side)) {
    problems.push(`plant map.${name}: must be an object`);
    return;
  }
  for (const signal of expected) if (!(signal in side)) problems.push(`plant map.${name}: the signal "${signal}" is not mapped`);
  for (const [signal, point] of Object.entries(side)) {
    if (!expected.includes(signal)) problems.push(`plant map.${name}: "${signal}" is not a signal of this plant`);
    else if (typeof point !== 'string' || !POINT.test(point)) problems.push(`plant map.${name}.${signal}: must be "Program.Name"`);
  }
}

export const DIRECTIONS: readonly string[] = ['command', 'sensor'];
export const TYPES: readonly string[] = ['BOOL', 'INT', 'REAL'];
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function checkRange(range: unknown, type: unknown, at: string, problems: string[]): void {
  if (type === 'BOOL') {
    if (range !== undefined) problems.push(`${at}.range: a BOOL signal has no range`);
    return;
  }
  if (!isObject(range)) {
    problems.push(`${at}.range: an INT or REAL signal needs its range with the scaling (raw_min, raw_max, eng_min, eng_max, unit)`);
    return;
  }
  for (const key of Object.keys(range))
    if (!['raw_min', 'raw_max', 'eng_min', 'eng_max', 'unit'].includes(key)) problems.push(`${at}.range: unknown key "${key}"`);
  for (const key of ['raw_min', 'raw_max', 'eng_min', 'eng_max'])
    if (!isNumber(range[key])) problems.push(`${at}.range.${key}: must be a number`);
  if (typeof range.unit !== 'string' || range.unit === '') problems.push(`${at}.range.unit: must name the engineering unit`);
  if (isNumber(range.raw_min) && isNumber(range.raw_max)) {
    if (range.raw_max <= range.raw_min) problems.push(`${at}.range.raw_max: must be greater than raw_min`);
    if (type === 'INT' && (range.raw_min < -32768 || range.raw_max > 32767))
      problems.push(`${at}.range.raw_max: an INT signal's raw range must fit -32768..32767`);
  }
}

function checkSignal(name: string, signal: unknown, problems: string[]): void {
  const at = `plant map.signals.${name}`;
  if (!isObject(signal)) {
    problems.push(`${at}: must be an object`);
    return;
  }
  for (const key of Object.keys(signal))
    if (!['direction', 'type', 'point', 'range'].includes(key)) problems.push(`${at}: unknown key "${key}"`);
  if (!DIRECTIONS.includes(signal.direction as string)) problems.push(`${at}.direction: must be one of ${DIRECTIONS.join(', ')}`);
  if (!TYPES.includes(signal.type as string)) problems.push(`${at}.type: must be one of ${TYPES.join(', ')}`);
  else checkRange(signal.range, signal.type, at, problems);
  if (typeof signal.point !== 'string' || !POINT.test(signal.point)) problems.push(`${at}.point: must be "Program.Name"`);
}

function validateV2(value: Record<string, unknown>, problems: string[]): void {
  for (const key of Object.keys(value))
    if (!['schemaVersion', 'target', 'signals'].includes(key)) problems.push(`plant map: unknown key "${key}"`);
  const target = value.target;
  let kind: PlantKind | undefined;
  if (!isObject(target) || 'plant' in target === 'scene' in target)
    problems.push('plant map.target: must name exactly one of "plant" or "scene"');
  else if ('plant' in target) {
    if (PLANT_KINDS.includes(target.plant as PlantKind)) kind = target.plant as PlantKind;
    else problems.push(`plant map.target.plant: must be one of ${PLANT_KINDS.join(', ')}`);
  } else if (typeof target.scene !== 'string' || target.scene === '') problems.push('plant map.target.scene: must be a non-empty string');
  const signals = value.signals;
  if (!isObject(signals) || Object.keys(signals).length === 0) {
    problems.push('plant map.signals: must be an object with at least one signal');
    return;
  }
  for (const [name, signal] of Object.entries(signals)) checkSignal(name, signal, problems);
  // A scene does not exist yet (2.1): for a scene target only the shape and the signal declarations are validated above.
  // The signals of a 2.0 plant are fixed, all BOOL, by direction.
  if (kind === undefined) return;
  const model = PLANT_MODELS[kind];
  const expected: Array<[string, SignalDirection]> = [
    ...model.reads.map((n): [string, SignalDirection] => [n, 'command']),
    ...model.drives.map((n): [string, SignalDirection] => [n, 'sensor']),
  ];
  for (const [name] of expected) if (!(name in signals)) problems.push(`plant map.signals: the signal "${name}" is not mapped`);
  for (const [name, signal] of Object.entries(signals)) {
    const want = expected.find(([n]) => n === name);
    if (!want) problems.push(`plant map.signals.${name}: is not a signal of this plant`);
    else if (isObject(signal)) {
      if (DIRECTIONS.includes(signal.direction as string) && signal.direction !== want[1])
        problems.push(`plant map.signals.${name}.direction: must be "${want[1]}" for this plant`);
      if (TYPES.includes(signal.type as string) && signal.type !== 'BOOL')
        problems.push(`plant map.signals.${name}.type: must be BOOL for this plant`);
    }
  }
}

/** Every problem of a mapping as authored; an empty list means it is valid. */
export function validatePlantMap(value: unknown): string[] {
  if (!isObject(value)) return ['plant map: must be an object'];
  const problems: string[] = [];
  if (value.schemaVersion === 2) {
    validateV2(value, problems);
    return problems;
  }
  for (const key of Object.keys(value))
    if (!['schemaVersion', 'plant', 'reads', 'drives'].includes(key)) problems.push(`plant map: unknown key "${key}"`);
  if (value.schemaVersion !== 1) problems.push('plant map.schemaVersion: must be 1 or 2');
  if (!PLANT_KINDS.includes(value.plant as PlantKind)) {
    problems.push(`plant map.plant: must be one of ${PLANT_KINDS.join(', ')}`);
    return problems;
  }
  const model = PLANT_MODELS[value.plant as PlantKind];
  checkSide(value.reads, 'reads', model.reads, problems);
  checkSide(value.drives, 'drives', model.drives, problems);
  return problems;
}

export interface ResolvedPlantMap {
  reads: Record<string, DeclaredOutput>;
  drives: Record<string, DeclaredInput>;
  /** Mapped points the loaded program does not declare. */
  problems: string[];
}

/** Binds a valid mapping to the I/O map of the loaded program, checking the type of every signal against its point:
 * BOOL against BOOL, and an INT or REAL signal against a variable of exactly that type (LNK-002). */
export function resolvePlantMap(map: PlantMap, ioMap: IoMap): ResolvedPlantMap {
  const resolved: ResolvedPlantMap = { reads: {}, drives: {}, problems: [] };
  for (const { name, direction, type, point } of normalizePlantMap(map).signals) {
    const found =
      direction === 'command' ? ioMap.outputs.find((output) => output.path === point) : ioMap.inputs.find((input) => input.path === point);
    if (!found) resolved.problems.push(`${name}: the program has no ${direction === 'command' ? 'output' : 'input'} ${point}`);
    else if (type === 'BOOL' ? found.type !== 'BOOL' : found.type !== type)
      resolved.problems.push(`${name}: ${point} is ${found.type}, the signal is ${type}`);
    else if (direction === 'command') resolved.reads[name] = found as DeclaredOutput;
    else resolved.drives[name] = found as DeclaredInput;
  }
  return resolved;
}
