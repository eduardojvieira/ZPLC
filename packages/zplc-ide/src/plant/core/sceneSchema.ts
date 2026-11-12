import { t } from '../../i18n';
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
    if (!allowed.includes(key)) out.push({ path: base ? `${base}.${key}` : key, message: t('plantScene.unknownKey', { key }) });
  }
}

/** Structural check, independent of any catalogue. Hand-written on purpose: no schema library. */
export function checkSceneStructure(value: unknown): SceneProblem[] {
  const out: SceneProblem[] = [];
  if (!isRecord(value)) return [{ path: '', message: t('plantScene.notObject') }];
  unknownKeys(value, ['schemaVersion', 'name', 'parts', 'cameras', 'shortestPulseMs'], '', out);
  if (value.schemaVersion !== SCENE_SCHEMA_VERSION) {
    out.push({
      path: 'schemaVersion',
      message: t('plantScene.versionUnsupported', { found: String(value.schemaVersion), supported: SCENE_SCHEMA_VERSION }),
    });
  }
  if (typeof value.name !== 'string' || value.name.length === 0) out.push({ path: 'name', message: t('plantScene.nameEmpty') });
  if (value.shortestPulseMs !== undefined && !(isNum(value.shortestPulseMs) && value.shortestPulseMs > 0)) {
    out.push({ path: 'shortestPulseMs', message: t('plantScene.pulse') });
  }
  if (!Array.isArray(value.cameras)) out.push({ path: 'cameras', message: t('plantScene.camerasList') });
  else {
    value.cameras.forEach((c: unknown, i: number) => {
      const base = `cameras[${i}]`;
      if (!isRecord(c)) return void out.push({ path: base, message: t('plantScene.cameraObject') });
      unknownKeys(c, ['name', 'position', 'target'], base, out);
      if (typeof c.name !== 'string') out.push({ path: `${base}.name`, message: t('plantScene.cameraName') });
      if (!isVec3(c.position)) out.push({ path: `${base}.position`, message: t('plantScene.cameraPosition') });
      if (!isVec3(c.target)) out.push({ path: `${base}.target`, message: t('plantScene.cameraTarget') });
    });
  }
  if (!Array.isArray(value.parts)) {
    out.push({ path: 'parts', message: t('plantScene.partsList') });
    return out;
  }
  if (value.parts.length > MAX_SCENE_PARTS) {
    out.push({ path: 'parts', message: t('plantScene.partsTooMany', { max: MAX_SCENE_PARTS, count: value.parts.length }) });
    return out;
  }
  const ids = new Map<string, number>();
  const names = new Map<string, number>();
  value.parts.forEach((p: unknown, i: number) => {
    const base = `parts[${i}]`;
    if (!isRecord(p)) return void out.push({ path: base, message: t('plantScene.partObject') });
    unknownKeys(p, ['id', 'part', 'name', 'position', 'rotationYDeg', 'config'], base, out);
    if (typeof p.id !== 'string' || !ID.test(p.id)) out.push({ path: `${base}.id`, message: t('plantScene.idPattern') });
    else if (ids.has(p.id)) out.push({ path: `${base}.id`, message: t('plantScene.idDuplicate', { id: p.id, index: ids.get(p.id) ?? 0 }) });
    else ids.set(p.id, i);
    if (typeof p.part !== 'string' || p.part.length === 0) out.push({ path: `${base}.part`, message: t('plantScene.partId') });
    if (typeof p.name !== 'string' || !NAME.test(p.name)) out.push({ path: `${base}.name`, message: t('plantScene.namePattern') });
    else if (names.has(p.name))
      out.push({ path: `${base}.name`, message: t('plantScene.nameDuplicate', { name: p.name, index: names.get(p.name) ?? 0 }) });
    else names.set(p.name, i);
    if (!isVec3(p.position)) out.push({ path: `${base}.position`, message: t('plantScene.position') });
    if (!isNum(p.rotationYDeg)) out.push({ path: `${base}.rotationYDeg`, message: t('plantScene.rotation') });
    if (!isRecord(p.config)) out.push({ path: `${base}.config`, message: t('plantScene.configObject') });
    else {
      for (const key of Object.keys(p.config)) {
        const v = p.config[key];
        if (!(isNum(v) || typeof v === 'string' || typeof v === 'boolean')) {
          out.push({ path: `${base}.config.${key}`, message: t('plantScene.configValue', { key }) });
        }
      }
    }
  });
  return out;
}

export type { PlantSceneFile };
