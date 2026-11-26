/**
 * The one edit state of the plant (spec 013 PLS-005, plan-u3 Task P1): the scene editor and the plant-map editor that every view of
 * the scene being edited reads (the editor in the plant document today; the part list, the Inspector and the signal table later).
 * An edit through the session's editor bumps `version`, so each view that reads it re-renders. Rule R-P1: begin, undo and redo do
 * nothing while the plant runs (SCN-008); the views say why from the plant state.
 */
import { create } from 'zustand';
import type { PlantMapV2 } from '../plants/plantMap';
import type { PlantSceneFile } from './contracts';
import { catalogue } from './core/catalogue';
import { createMapEditor, type MapEditor } from './editor/mapEditor';
import { createSceneEditor, type SceneEditor } from './editor/model';

export interface PlantEditSession {
  /** Null while no scene is being edited. */
  readonly editor: SceneEditor | null;
  readonly mapEditor: MapEditor | null;
  /** Bumped after every edit, undo and redo, so views that read the editor re-render. */
  readonly version: number;
  /** The scene the session was opened on: the reference of the plant document that owns it. */
  readonly sceneRef: string | null;
  /** The plant runs: nothing is edited (SCN-008). */
  readonly running: boolean;
  /** The scene opened with a plant map: ending keeps a map text although nothing is bound. */
  readonly hadMap: boolean;
}

export interface PlantEditActions {
  begin(ready: { scene: PlantSceneFile; map: PlantMapV2 | null }, ref: string): void;
  /** The texts the plant core is rebuilt from (the SceneOverride of usePlantSession), or null when nothing was edited. */
  end(): { scene: string; map: string } | null;
  undo(): void;
  redo(): void;
  setMapEditor(mapEditor: MapEditor): void;
  setRunning(running: boolean): void;
  touch(): void;
}

const CLOSED = { editor: null, mapEditor: null, sceneRef: null, hadMap: false } as const;

export const usePlantEdit = create<PlantEditSession & PlantEditActions>()((set, get) => {
  const touch = () => set((state) => ({ version: state.version + 1 }));
  // Each change made through the session's editor is seen by every view of it.
  const after =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const result = fn(...args);
      touch();
      return result;
    };
  const observed = (editor: SceneEditor): SceneEditor => ({
    ...editor,
    select: after(editor.select),
    place: after(editor.place),
    move: after(editor.move),
    rotate: after(editor.rotate),
    duplicate: after(editor.duplicate),
    remove: after(editor.remove),
    configure: after(editor.configure),
    load: after(editor.load),
    undo: after(editor.undo),
    redo: after(editor.redo),
  });

  return {
    ...CLOSED,
    version: 0,
    running: false,
    begin(ready, ref) {
      if (get().running) return;
      const editor = createSceneEditor(catalogue, ready.scene);
      const mapEditor = createMapEditor(editor.signals(), ready.scene.name);
      if (ready.map) mapEditor.load(ready.map);
      set((state) => ({ editor: observed(editor), mapEditor, sceneRef: ref, hadMap: ready.map !== null, version: state.version + 1 }));
    },
    end() {
      const { editor, mapEditor, hadMap } = get();
      if (!editor || !mapEditor) return null;
      const map = mapEditor.map();
      const bound = Object.keys(map.signals).length > 0 || hadMap;
      set((state) => ({ ...CLOSED, version: state.version + 1 }));
      return { scene: JSON.stringify(editor.toFile()), map: bound ? JSON.stringify(map) : '' };
    },
    undo() {
      if (!get().running) get().editor?.undo();
    },
    redo() {
      if (!get().running) get().editor?.redo();
    },
    setMapEditor: (mapEditor) => set({ mapEditor }),
    setRunning(running) {
      get().editor?.setRunning(running);
      set({ running });
    },
    touch,
  };
});
