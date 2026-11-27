/**
 * What the Plant activity (plan-u3 P2) and the plant document tell each other. `shown` is the scene of the panel that published last,
 * which the activity lists. `request` is a scene the activity asks that panel to show: the panel takes it once, and it is gone, so no
 * other panel and no panel opened later ever adopts it; a project switch discards it. Neither holds an edit: that is the session's.
 */
import { create } from 'zustand';
import type { PlantMapV2 } from '../../plants/plantMap';
import { useIDEStore } from '../../store/useIDEStore';
import type { PlantSceneFile } from '../contracts';
import type { SceneRef } from './usePlantSession';

export interface ShownScene {
  /** The panel that shows it. */
  panel: string;
  key: string;
  scene: PlantSceneFile;
  map: PlantMapV2 | undefined;
}

export const usePlantChoice = create<{
  request: { panel: string; ref: SceneRef } | undefined;
  shown: ShownScene | undefined;
  /** Asks the panel that is shown to open `ref`. */
  ask: (ref: SceneRef) => void;
  /** The request for `panel`, which is cleared by taking it; undefined when there is none for it. */
  take: (panel: string) => SceneRef | undefined;
  show: (shown: ShownScene | undefined) => void;
}>()((set, get) => ({
  request: undefined,
  shown: undefined,
  ask: (ref) => {
    const { shown } = get();
    if (shown) set({ request: { panel: shown.panel, ref: { ...ref } } });
  },
  take: (panel) => {
    const { request } = get();
    if (request?.panel !== panel) return undefined;
    set({ request: undefined });
    return request.ref;
  },
  show: (shown) => set(shown ? { shown } : { shown: undefined, request: undefined }),
}));

// A scene of one project is not a scene of the next.
useIDEStore.subscribe((state, previous) => {
  if (state.directoryHandle !== previous.directoryHandle && usePlantChoice.getState().request)
    usePlantChoice.setState({ request: undefined });
});
