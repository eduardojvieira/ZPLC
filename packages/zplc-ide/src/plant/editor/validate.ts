import type { PlantSceneFile } from '../contracts';
import type { Catalogue } from '../core/catalogue';
import { validateScene } from '../core/scene';

/** A problem shown at the part that causes it (SCN-015); `partId` is null for a problem of the scene itself. */
export interface ProblemAt {
  partId: string | null;
  path: string;
  message: string;
}

/** Scene validation with each problem located at its part. */
export function validateAt(scene: PlantSceneFile, catalogue: Catalogue): ProblemAt[] {
  return validateScene(scene, catalogue).map((p) => {
    const index = /^parts\[(\d+)\]/.exec(p.path)?.[1];
    return { partId: index === undefined ? null : (scene.parts[Number(index)]?.id ?? null), ...p };
  });
}
