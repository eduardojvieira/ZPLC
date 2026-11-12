import type { ConfigField, PlantSceneFile, PlantSignalDef } from '../contracts';
import type { Catalogue } from './catalogue';
import { checkSceneStructure, SCENE_SCHEMA_VERSION, type SceneProblem } from './sceneSchema';

export type { SceneProblem };
export { SCENE_SCHEMA_VERSION };

type SceneResult = { scene: PlantSceneFile } | { problems: SceneProblem[] };

/** Opens a scene of any schema version this Studio knows; a newer one fails naming its version (SCN-006). */
export function migrateScene(value: unknown): SceneResult {
  const version = typeof value === 'object' && value !== null ? (value as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (typeof version === 'number' && Number.isInteger(version) && version > SCENE_SCHEMA_VERSION) {
    return {
      problems: [
        {
          path: 'schemaVersion',
          message: `this scene has schemaVersion ${version}, written by a newer Studio; this Studio reads ${SCENE_SCHEMA_VERSION}`,
        },
      ],
    };
  }
  // Version 1 is the only released version: nothing to migrate yet. Add one step per future version here.
  const problems = checkSceneStructure(value);
  return problems.length > 0 ? { problems } : { scene: value as PlantSceneFile };
}

/** Parses scene text. Data only: JSON.parse, no evaluation, no fetch (PLT-002). */
export function parseScene(text: string): SceneResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { problems: [{ path: '', message: `scene is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }] };
  }
  return migrateScene(value);
}

function checkConfigValue(key: string, field: ConfigField, v: number | string | boolean): string | undefined {
  const unit = field.unit ? ` ${field.unit}` : '';
  if (field.kind === 'number') {
    if (typeof v !== 'number') return `${key} must be a number`;
    if (field.max !== undefined && v > field.max) return `${key} ${v} is above the limit ${field.max}${unit}`;
    if (field.min !== undefined && v < field.min) return `${key} ${v} is below the limit ${field.min}${unit}`;
  } else if (field.kind === 'boolean') {
    if (typeof v !== 'boolean') return `${key} must be true or false`;
  } else if (typeof v !== 'string' || !(field.values ?? []).includes(v)) {
    return `${key} ${JSON.stringify(v)} is not one of: ${(field.values ?? []).join(', ')}`;
  }
  return undefined;
}

/** Structural and catalogue validation with located messages (PLT-016). */
export function validateScene(value: unknown, catalogue: Catalogue): SceneProblem[] {
  const structural = checkSceneStructure(value);
  if (structural.length > 0) return structural;
  const out: SceneProblem[] = [];
  (value as PlantSceneFile).parts.forEach((p, i) => {
    const base = `parts[${i}]`;
    const def = catalogue.get(p.part);
    if (!def) {
      out.push({
        path: `${base}.part`,
        message: `unknown part "${p.part}"; the catalogue has: ${catalogue
          .list()
          .map((d) => d.id)
          .join(', ')}`,
      });
      return;
    }
    for (const key of Object.keys(p.config)) {
      const field = def.config[key];
      if (!field) {
        out.push({
          path: `${base}.config.${key}`,
          message: `unknown setting "${key}" for part "${p.part}"; it has: ${Object.keys(def.config).join(', ')}`,
        });
        continue;
      }
      const message = checkConfigValue(key, field, p.config[key]!);
      if (message) out.push({ path: `${base}.config.${key}`, message });
    }
  });
  return out;
}

/** Signals derived from the parts, in part order then the definition's signal order (PLT-003). */
export function sceneSignals(scene: PlantSceneFile, catalogue: Catalogue): PlantSignalDef[] {
  return scene.parts.flatMap((p) => catalogue.get(p.part)?.signals(p) ?? []);
}
