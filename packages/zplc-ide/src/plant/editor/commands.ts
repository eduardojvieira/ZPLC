import type { PartDefinition, PlantSceneFile, ScenePart, Vec3 } from '../contracts';
import type { Catalogue } from '../core/catalogue';

export const GRID_M = 0.25; // plan choice
export const SNAP_RADIUS_M = 0.15;
export const ROTATION_STEP_DEG = 15;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0; // + 0 turns -0 into 0
const toGrid = (n: number) => round6(Math.round(n / GRID_M) * GRID_M);
export const snapRotation = (deg: number) => round6((((Math.round(deg / ROTATION_STEP_DEG) * ROTATION_STEP_DEG) % 360) + 360) % 360);

/**
 * Snap point positions are local to their part (before its rotation); the world position is part.position plus the
 * point rotated about Y (convention recorded in the E1 commit: the contract does not state it).
 */
function worldPoint(part: ScenePart, local: Vec3): Vec3 {
  const a = (part.rotationYDeg * Math.PI) / 180;
  const [x, y, z] = local;
  return [
    round6(part.position[0] + x * Math.cos(a) + z * Math.sin(a)),
    round6(part.position[1] + y),
    round6(part.position[2] - x * Math.sin(a) + z * Math.cos(a)),
  ];
}

/** Where a part of `catalogueId` dropped at `at` ends up: attached to a near snap point, else on the grid. */
export function snapPlacement(
  scene: PlantSceneFile,
  catalogue: Catalogue,
  catalogueId: string,
  at: Vec3,
  rotationYDeg: number,
  ignoreId?: string,
): { position: Vec3; rotationYDeg: number } {
  let best: { d: number; position: Vec3; rotationYDeg: number } | undefined;
  for (const other of scene.parts) {
    if (other.id === ignoreId) continue;
    for (const sp of catalogue.get(other.part)?.snapPoints(other) ?? []) {
      if (!sp.accepts.includes(catalogueId)) continue;
      const w = worldPoint(other, sp.position);
      const d = Math.hypot(w[0] - at[0], w[1] - at[1], w[2] - at[2]);
      if (d <= SNAP_RADIUS_M && (!best || d < best.d)) {
        best = { d, position: w, rotationYDeg: snapRotation(other.rotationYDeg + sp.normalYDeg) };
      }
    }
  }
  return best ?? { position: [toGrid(at[0]), toGrid(at[1]), toGrid(at[2])], rotationYDeg: snapRotation(rotationYDeg) };
}

/** The first `${part}-N` id and `PartN` name not used in the scene. */
export function freshIdentity(scene: PlantSceneFile, def: Pick<PartDefinition, 'id'>): { id: string; name: string } {
  const ids = new Set(scene.parts.map((p) => p.id));
  const names = new Set(scene.parts.map((p) => p.name));
  const stem = def.id.replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'part';
  const label = (stem.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/^[0-9]+/, '') || 'Part').slice(0, 20);
  for (let n = 1; ; n++) {
    const id = /^[a-z]/.test(stem) ? `${stem}-${n}` : `part-${n}`;
    const name = `${label}${n}`;
    if (!ids.has(id) && !names.has(name)) return { id, name };
  }
}

export const withPart = (scene: PlantSceneFile, part: ScenePart): PlantSceneFile => ({ ...scene, parts: [...scene.parts, part] });
export const withoutPart = (scene: PlantSceneFile, id: string): PlantSceneFile => ({
  ...scene,
  parts: scene.parts.filter((p) => p.id !== id),
});
export const updatePart = (scene: PlantSceneFile, id: string, patch: Partial<ScenePart>): PlantSceneFile => ({
  ...scene,
  parts: scene.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});
