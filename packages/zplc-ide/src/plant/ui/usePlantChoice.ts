/**
 * What the Plant activity (plan-u3 P2) and the plant document tell each other: `request` is a scene the activity asks the document
 * to show (each panel adopts it, and a panel that mounts later starts on it); `shown` is the scene a panel is showing, which the
 * activity lists. Neither holds an edit: that is the edit session's.
 */
import { create } from 'zustand';
import type { PlantMapV2 } from '../../plants/plantMap';
import type { PlantSceneFile } from '../contracts';
import type { SceneRef } from './usePlantSession';

export interface ShownScene {
  key: string;
  scene: PlantSceneFile;
  map: PlantMapV2 | undefined;
}

export const usePlantChoice = create<{
  request: SceneRef | undefined;
  shown: ShownScene | undefined;
  ask: (ref: SceneRef) => void;
  show: (shown: ShownScene | undefined) => void;
}>()((set) => ({
  request: undefined,
  shown: undefined,
  ask: (request) => set({ request: { ...request } }),
  show: (shown) => set({ shown }),
}));
