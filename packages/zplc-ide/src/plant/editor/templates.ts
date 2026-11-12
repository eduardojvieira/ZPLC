import type { PlantSceneFile } from '../contracts';

/** Starting templates (SCN-016). Reference scenes are added through the scene index by the F tasks, not here. */
export const TEMPLATES: readonly { id: string; names: { en: string; es: string }; scene: PlantSceneFile }[] = [
  {
    id: 'empty-floor',
    names: { en: 'Empty floor', es: 'Suelo vacío' },
    scene: { schemaVersion: 1, name: 'Empty floor', parts: [], cameras: [] },
  },
];
