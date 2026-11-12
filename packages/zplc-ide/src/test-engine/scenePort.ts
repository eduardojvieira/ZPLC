/**
 * The scenario seam for plant scenes (S1, C7): the optional `"scene"` block of a `scenario.json`, its validation against a
 * scene, and the one scan exchange the graded run and the live lock-step session share. Pure TypeScript: it knows the
 * `PlantCore` interface, never Jolt. A scenario without the block never reaches this file.
 */
import type { FactValue, PlantCore, PlantSceneFile, Vec3 } from '../plant/contracts';
import type { Catalogue } from '../plant/core/catalogue';
import type { PlantMapV2 } from '../plants/plantMap';

export interface ScenarioPlantPort {
  core: PlantCore;
  map: PlantMapV2;
}

export type SceneScriptEvent =
  | { atMs: number; operate: { signal: string; value: boolean | number } }
  | { atMs: number; emit: { kind: string; at: Vec3 } }
  | { atMs: number; fault: { part: string; action: string } };

export interface SceneScenarioBlock {
  file: string;
  map: string;
  script: SceneScriptEvent[];
}

export const MAX_SCENE_SCRIPT = 256;
/** `fact:itemsRemoved`, `fact:delivered:Out1`, `fact:position:box:0`. */
export const FACT_READ = /^fact:[A-Za-z][A-Za-z0-9_-]*(:[A-Za-z0-9_-]+)*$/;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const fileName = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\\/]/.test(value) && !value.includes('..');

/** The data shape of the block; the checks that need the scene (parts, actions, signals) are `validateSceneScript`. */
export function compileSceneBlock(input: unknown): SceneScenarioBlock | { problems: string[] } {
  const problems: string[] = [];
  if (!isObject(input)) return { problems: ['scene: must be an object'] };
  const keys = Object.keys(input);
  if (keys.length !== 3 || !['file', 'map', 'script'].every((key) => keys.includes(key)))
    problems.push('scene: must have exactly the keys file, map, script');
  if (!fileName(input.file)) problems.push('scene.file: must be a file name');
  if (!fileName(input.map)) problems.push('scene.map: must be a file name');
  const script: SceneScriptEvent[] = [];
  if (!Array.isArray(input.script)) problems.push('scene.script: must be an array');
  else if (input.script.length > MAX_SCENE_SCRIPT) problems.push(`scene.script: must have at most ${MAX_SCENE_SCRIPT} events`);
  else
    input.script.forEach((raw: unknown, index) => {
      const path = `scene.script[${index}]`;
      if (!isObject(raw)) return problems.push(`${path}: must be an object`);
      const kinds = ['operate', 'emit', 'fault'].filter((kind) => Object.hasOwn(raw, kind));
      if (kinds.length !== 1 || Object.keys(raw).length !== 2 || !Object.hasOwn(raw, 'atMs'))
        return problems.push(`${path}: must have atMs and exactly one of operate, emit, fault`);
      if (!Number.isInteger(raw.atMs) || (raw.atMs as number) < 0) return problems.push(`${path}.atMs: must be a non-negative integer`);
      const atMs = raw.atMs as number;
      const body = raw[kinds[0]!];
      if (!isObject(body)) return problems.push(`${path}.${kinds[0]}: must be an object`);
      if (kinds[0] === 'operate') {
        if (typeof body.signal !== 'string' || (typeof body.value !== 'boolean' && !Number.isFinite(body.value)))
          return problems.push(`${path}.operate: needs a signal name and a boolean or number value`);
        script.push({ atMs, operate: { signal: body.signal, value: body.value as boolean | number } });
      } else if (kinds[0] === 'emit') {
        const at = body.at;
        if (typeof body.kind !== 'string' || !Array.isArray(at) || at.length !== 3 || !at.every((n) => Number.isFinite(n)))
          return problems.push(`${path}.emit: needs a kind and an at of three numbers`);
        script.push({ atMs, emit: { kind: body.kind, at: [at[0], at[1], at[2]] as unknown as Vec3 } });
      } else {
        if (typeof body.part !== 'string' || typeof body.action !== 'string')
          return problems.push(`${path}.fault: needs a part and an action`);
        script.push({ atMs, fault: { part: body.part, action: body.action } });
      }
    });
  if (problems.length > 0) return { problems };
  return { file: input.file as string, map: input.map as string, script };
}

/** Located problems of a script against the scene it runs on: unknown panel signals, parts and fault actions. */
export function validateSceneScript(script: readonly SceneScriptEvent[], scene: PlantSceneFile, port: ScenarioPlantPort, catalogue: Catalogue): string[] {
  const problems: string[] = [];
  const panel = new Set(port.core.signals.filter((signal) => signal.direction === 'sensor').map((signal) => signal.name));
  script.forEach((event, index) => {
    const path = `scene.script[${index}]`;
    if ('operate' in event && !panel.has(event.operate.signal))
      problems.push(`${path}.operate.signal: "${event.operate.signal}" is not a signal of the scene`);
    if ('fault' in event) {
      const part = scene.parts.find((candidate) => candidate.name === event.fault.part);
      if (!part) problems.push(`${path}.fault.part: "${event.fault.part}" is not a part of the scene`);
      else {
        const actions = catalogue.get(part.part)?.actions ?? [];
        if (!actions.includes(event.fault.action))
          problems.push(`${path}.fault.action: "${event.fault.action}" is not an action of ${part.name}; it has: ${actions.join(', ') || 'none'}`);
      }
    }
  });
  return problems;
}

/** A fact is true-ish when a number is above 0, a boolean is true or a string is not empty. */
export const factTruthy = (value: FactValue | undefined): boolean =>
  typeof value === 'number' ? value > 0 : typeof value === 'string' ? value.length > 0 : value === true;

/**
 * One scan of the plant, the same for the graded run and the live session. Order: the script events due at `atMs`; read
 * the command image (one read of every mapped command); `apply`; `advance(scanMs)`; write the sensor image (one write of
 * every mapped sensor). The runtime's own scan for `atMs` follows the write.
 */
export async function exchangeScan(
  port: ScenarioPlantPort,
  readCommand: (point: string) => Promise<boolean | number>,
  writeSensors: (sensors: Record<string, boolean | number>) => Promise<void>,
  atMs: number,
  scanMs: number,
  script: readonly SceneScriptEvent[] = [],
): Promise<void> {
  const { core, map } = port;
  for (const event of script) {
    if (event.atMs !== atMs) continue;
    if ('operate' in event) core.operate(event.operate.signal, event.operate.value);
    else if ('emit' in event) core.addItem(event.emit.kind, event.emit.at);
    else core.act(event.fault.part, event.fault.action);
  }
  const commands: Record<string, boolean | number> = {};
  for (const [name, signal] of Object.entries(map.signals)) if (signal.direction === 'command') commands[name] = await readCommand(signal.point);
  core.apply(commands);
  core.advance(scanMs);
  const sensed = core.sense();
  const sensors: Record<string, boolean | number> = {};
  for (const [name, signal] of Object.entries(map.signals)) if (signal.direction === 'sensor' && name in sensed) sensors[name] = sensed[name]!;
  await writeSensors(sensors);
}
