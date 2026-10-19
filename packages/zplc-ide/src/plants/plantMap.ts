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

export interface PlantMap {
  schemaVersion: 1;
  plant: PlantKind;
  /** Plant signal the program writes -> the program output that carries it. */
  reads: Record<string, string>;
  /** Plant signal the plant sets -> the program input that receives it. */
  drives: Record<string, string>;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const POINT = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

function checkSide(side: unknown, name: 'reads' | 'drives', expected: readonly string[], problems: string[]): void {
  if (!isObject(side)) { problems.push(`plant map.${name}: must be an object`); return; }
  for (const signal of expected) if (!(signal in side)) problems.push(`plant map.${name}: the signal "${signal}" is not mapped`);
  for (const [signal, point] of Object.entries(side)) {
    if (!expected.includes(signal)) problems.push(`plant map.${name}: "${signal}" is not a signal of this plant`);
    else if (typeof point !== 'string' || !POINT.test(point)) problems.push(`plant map.${name}.${signal}: must be "Program.Name"`);
  }
}

/** Every problem of a mapping as authored; an empty list means it is valid. */
export function validatePlantMap(value: unknown): string[] {
  if (!isObject(value)) return ['plant map: must be an object'];
  const problems: string[] = [];
  for (const key of Object.keys(value)) if (!['schemaVersion', 'plant', 'reads', 'drives'].includes(key)) problems.push(`plant map: unknown key "${key}"`);
  if (value.schemaVersion !== 1) problems.push('plant map.schemaVersion: must be 1');
  if (!PLANT_KINDS.includes(value.plant as PlantKind)) { problems.push(`plant map.plant: must be one of ${PLANT_KINDS.join(', ')}`); return problems; }
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

/** Binds a valid mapping to the I/O map of the loaded program. */
export function resolvePlantMap(map: PlantMap, ioMap: IoMap): ResolvedPlantMap {
  const resolved: ResolvedPlantMap = { reads: {}, drives: {}, problems: [] };
  for (const [signal, path] of Object.entries(map.reads)) {
    const found = ioMap.outputs.find((output) => output.path === path);
    if (found) resolved.reads[signal] = found; else resolved.problems.push(`${signal}: the program has no output ${path}`);
  }
  for (const [signal, path] of Object.entries(map.drives)) {
    const found = ioMap.inputs.find((input) => input.path === path);
    if (found) resolved.drives[signal] = found; else resolved.problems.push(`${signal}: the program has no input ${path}`);
  }
  return resolved;
}
