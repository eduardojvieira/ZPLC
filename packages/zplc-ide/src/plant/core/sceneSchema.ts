import type { PlantSceneFile } from '../contracts';

export interface SceneProblem {
  path: string; // like 'parts[2].config.speedMps'
  message: string;
}

export const SCENE_SCHEMA_VERSION = 1;
export const MAX_SCENE_PARTS = 512;

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(isNum);

function unknownKeys(obj: Record<string, unknown>, allowed: readonly string[], base: string, out: SceneProblem[]): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) out.push({ path: base ? `${base}.${key}` : key, message: `unknown key "${key}"` });
  }
}

/** Structural check, independent of any catalogue. Hand-written on purpose: no schema library. */
export function checkSceneStructure(value: unknown): SceneProblem[] {
  const out: SceneProblem[] = [];
  if (!isRecord(value)) return [{ path: '', message: 'a scene must be a JSON object' }];
  unknownKeys(value, ['schemaVersion', 'name', 'parts', 'cameras', 'shortestPulseMs'], '', out);
  if (value.schemaVersion !== SCENE_SCHEMA_VERSION) {
    out.push({
      path: 'schemaVersion',
      message: `schemaVersion ${String(value.schemaVersion)} is not supported; this Studio reads ${SCENE_SCHEMA_VERSION}`,
    });
  }
  if (typeof value.name !== 'string' || value.name.length === 0) out.push({ path: 'name', message: 'name must be a non-empty string' });
  if (value.shortestPulseMs !== undefined && !(isNum(value.shortestPulseMs) && value.shortestPulseMs > 0)) {
    out.push({ path: 'shortestPulseMs', message: 'shortestPulseMs must be a positive number' });
  }
  if (!Array.isArray(value.cameras)) out.push({ path: 'cameras', message: 'cameras must be a list' });
  else {
    value.cameras.forEach((c: unknown, i: number) => {
      const base = `cameras[${i}]`;
      if (!isRecord(c)) return void out.push({ path: base, message: 'a camera must be an object' });
      unknownKeys(c, ['name', 'position', 'target'], base, out);
      if (typeof c.name !== 'string') out.push({ path: `${base}.name`, message: 'name must be a string' });
      if (!isVec3(c.position)) out.push({ path: `${base}.position`, message: 'position must be three numbers [x, y, z]' });
      if (!isVec3(c.target)) out.push({ path: `${base}.target`, message: 'target must be three numbers [x, y, z]' });
    });
  }
  if (!Array.isArray(value.parts)) {
    out.push({ path: 'parts', message: 'parts must be a list' });
    return out;
  }
  if (value.parts.length > MAX_SCENE_PARTS) {
    out.push({ path: 'parts', message: `a scene holds at most ${MAX_SCENE_PARTS} parts; this one has ${value.parts.length}` });
    return out;
  }
  const ids = new Map<string, number>();
  const names = new Map<string, number>();
  value.parts.forEach((p: unknown, i: number) => {
    const base = `parts[${i}]`;
    if (!isRecord(p)) return void out.push({ path: base, message: 'a part must be an object' });
    unknownKeys(p, ['id', 'part', 'name', 'position', 'rotationYDeg', 'config'], base, out);
    if (typeof p.id !== 'string' || !ID.test(p.id)) out.push({ path: `${base}.id`, message: 'id must match [a-z][a-z0-9-]{0,31}' });
    else if (ids.has(p.id)) out.push({ path: `${base}.id`, message: `id "${p.id}" is already used by parts[${ids.get(p.id)}]` });
    else ids.set(p.id, i);
    if (typeof p.part !== 'string' || p.part.length === 0) out.push({ path: `${base}.part`, message: 'part must be a catalogue id' });
    if (typeof p.name !== 'string' || !NAME.test(p.name))
      out.push({ path: `${base}.name`, message: 'name must match [A-Za-z][A-Za-z0-9_]{0,23}' });
    else if (names.has(p.name))
      out.push({ path: `${base}.name`, message: `name "${p.name}" is already used by parts[${names.get(p.name)}]` });
    else names.set(p.name, i);
    if (!isVec3(p.position)) out.push({ path: `${base}.position`, message: 'position must be three numbers [x, y, z]' });
    if (!isNum(p.rotationYDeg)) out.push({ path: `${base}.rotationYDeg`, message: 'rotationYDeg must be a number' });
    if (!isRecord(p.config)) out.push({ path: `${base}.config`, message: 'config must be an object' });
    else {
      for (const key of Object.keys(p.config)) {
        const v = p.config[key];
        if (!(isNum(v) || typeof v === 'string' || typeof v === 'boolean')) {
          out.push({ path: `${base}.config.${key}`, message: `${key} must be a number, a string or a boolean` });
        }
      }
    }
  });
  return out;
}

export type { PlantSceneFile };
