/**
 * The one edit state of the plant (spec 013 PLS-005, plan-u3 Task P1): the scene editor and the plant-map editor that every view of
 * the scene being edited reads (the editor in the plant document today; the part list, the Inspector and the signal table later).
 * An edit through the session's editor bumps `version`, so each view that reads it re-renders. Rule R-P1: begin, undo and redo do
 * nothing while the plant runs (SCN-008); the views say why from the plant state.
 *
 * One session for the whole window: while one is open, only the plant of its scene reports `running` and ends it, and another
 * begin is refused, so a second plant document never takes or discards its edits.
 */
import { create } from 'zustand';
import type { PlantMapV2 } from '../plants/plantMap';
import type { PlantSceneFile } from './contracts';
import { catalogue } from './core/catalogue';
import { createMapEditor, type MapEditor } from './editor/mapEditor';
import { createSceneEditor, type SceneEditor } from './editor/model';
import { saveProjectScene, saveScene } from './persistence/sceneFiles';
import { registerSaveAllParticipant, type SaveAllResult } from '../store/saveAll';
import { useIDEStore } from '../store/useIDEStore';
import { usePlantDocument } from '../store/usePlantDocument';

export interface PlantEditSession {
  /** Null while no scene is being edited. */
  readonly editor: SceneEditor | null;
  readonly mapEditor: MapEditor | null;
  /** Bumped after every edit, undo and redo, so views that read the editor re-render. */
  readonly version: number;
  /** The scene the session was opened on: the reference of the plant document that owns it. */
  readonly sceneRef: string | null;
  /** The plant of the open session runs, or, with none open, the plant that last said: nothing is edited (SCN-008). */
  readonly running: boolean;
  /** The scene opened with a plant map: ending keeps a map text although nothing is bound. */
  readonly hadMap: boolean;
  /** What the scene was when it was last saved, or when it began: the session is modified when it differs (FLW-005). */
  readonly baseline: string | null;
  /** The project the session began in: what it holds is never written into another one. */
  readonly project: unknown;
  /** Scenes edited and closed with Done and not saved yet, by scene reference: they stay a target of Save and Save all (FLW-005). */
  readonly unsaved: Readonly<Record<string, UnsavedScene>>;
}

/** A scene whose edit session ended with changes that were never saved. */
export interface UnsavedScene {
  file: PlantSceneFile;
  /** The plant map text, empty when nothing is bound. */
  map: string;
  baseline: string | null;
  /** The project it belongs to: another project never receives it. */
  project: unknown;
}

export interface PlantEditActions {
  begin(ready: { scene: PlantSceneFile; map: PlantMapV2 | null }, ref: string): void;
  /** The texts the plant core is rebuilt from (the SceneOverride of usePlantSession), or null when nothing was edited. */
  end(): { scene: string; map: string } | null;
  undo(): void;
  redo(): void;
  setMapEditor(mapEditor: MapEditor): void;
  /** From the plant of scene `ref`; ignored while a session of another scene is open. */
  setRunning(running: boolean, ref?: string): void;
  touch(): void;
}

const CLOSED = { editor: null, mapEditor: null, sceneRef: null, hadMap: false, baseline: null, project: null } as const;

/** The scene and the plant map of a session as Save writes them, and the text that tells whether they changed. */
function textsOf(editor: SceneEditor, mapEditor: MapEditor, hadMap: boolean): { file: PlantSceneFile; map: string; text: string } {
  const file = editor.toFile();
  const map = mapEditor.map();
  const bound = Object.keys(map.signals).length > 0 || hadMap;
  return { file, map: bound ? JSON.stringify(map) : '', text: JSON.stringify([file, bound ? map : null]) };
}

export const usePlantEdit = create<PlantEditSession & PlantEditActions>()((set, get) => {
  // The map editor knows the signals it was built with: when parts change them, it is rebuilt with the bindings kept.
  const signalKey = (editor: SceneEditor) =>
    editor
      .signals()
      .map((signal) => `${signal.name}:${signal.type}:${signal.direction}`)
      .join('|');
  let keyed = '';
  const followSignals = () => {
    const { editor, mapEditor } = get();
    if (!editor || !mapEditor || signalKey(editor) === keyed) return;
    keyed = signalKey(editor);
    const old = mapEditor.map();
    const next = createMapEditor(editor.signals(), 'scene' in old.target ? old.target.scene : editor.state().scene.name);
    next.load(old);
    set({ mapEditor: next });
  };
  const touch = () => {
    followSignals();
    set((state) => ({ version: state.version + 1 }));
  };
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
    unsaved: {},
    version: 0,
    running: false,
    begin(ready, ref) {
      if (get().running || get().editor) return;
      const editor = createSceneEditor(catalogue, ready.scene);
      const mapEditor = createMapEditor(editor.signals(), ready.scene.name);
      if (ready.map) mapEditor.load(ready.map);
      const hadMap = ready.map !== null;
      keyed = signalKey(editor);
      set((state) => {
        // A scene that was edited, closed and not saved goes on from what the disk holds, not from what it was closed with.
        const { [ref]: pending, ...others } = state.unsaved;
        return {
          editor: observed(editor),
          mapEditor,
          sceneRef: ref,
          hadMap,
          baseline: pending ? pending.baseline : textsOf(editor, mapEditor, hadMap).text,
          project: useIDEStore.getState().directoryHandle,
          unsaved: others,
          version: state.version + 1,
        };
      });
    },
    end() {
      const { editor, mapEditor, hadMap, sceneRef, baseline, project } = get();
      if (!editor || !mapEditor || sceneRef === null) return null;
      const { file, map, text } = textsOf(editor, mapEditor, hadMap);
      set((state) => ({
        ...CLOSED,
        unsaved: text === baseline ? state.unsaved : { ...state.unsaved, [sceneRef]: { file, map, baseline, project } },
        version: state.version + 1,
      }));
      return { scene: JSON.stringify(file), map };
    },
    undo() {
      if (!get().running) get().editor?.undo();
    },
    redo() {
      if (!get().running) get().editor?.redo();
    },
    setMapEditor: (mapEditor) => set({ mapEditor }),
    setRunning(running, ref) {
      const { editor, sceneRef } = get();
      if (editor && ref !== undefined && ref !== sceneRef) return;
      editor?.setRunning(running);
      set({ running });
    },
    touch,
  };
});

// Loading a scene from disk, or a change made outside Studio, drops the edits that were closed and never saved.
usePlantDocument.subscribe((state, before) => {
  if (state.sceneRevision !== before.sceneRevision) usePlantEdit.setState({ unsaved: {} });
});

/** Whether the scene of `ref` has edits that Save would write: a session in progress that changed, or one closed and not saved. */
export function hasEditedScene(ref: string): boolean {
  const { editor, mapEditor, sceneRef, hadMap, baseline, unsaved } = usePlantEdit.getState();
  if (editor && mapEditor && sceneRef === ref) return textsOf(editor, mapEditor, hadMap).text !== baseline;
  return ref in unsaved;
}

const sceneFileName = (name: string) => name.replace(/[^A-Za-z0-9._ -]/g, '-').slice(0, 64);

/**
 * Saves the scenes with unsaved edits, or only the one of `only`: the project's own scene at the project root, a saved scene under its
 * name, any other under the name it carries, each with its plant map once anything is bound. Nothing else is written.
 */
export async function saveEditedScenes(only?: string): Promise<SaveAllResult & { names: string[] }> {
  const handle = useIDEStore.getState().directoryHandle;
  const result = { saved: 0, failed: [] as string[], names: [] as string[] };
  if (!handle) return result;
  const targets: Array<{ ref: string; file: PlantSceneFile; map: string; done: () => void }> = [];
  const live = usePlantEdit.getState();
  if (live.editor && live.mapEditor && live.sceneRef !== null && live.project === handle && hasEditedScene(live.sceneRef)) {
    const { file, map, text } = textsOf(live.editor, live.mapEditor, live.hadMap);
    targets.push({ ref: live.sceneRef, file, map, done: () => usePlantEdit.setState({ baseline: text }) });
  }
  for (const [ref, scene] of Object.entries(live.unsaved)) {
    if (scene.project !== handle) usePlantEdit.setState((state) => omit(state, ref));
    else targets.push({ ref, file: scene.file, map: scene.map, done: () => usePlantEdit.setState((state) => omit(state, ref)) });
  }
  for (const target of targets.filter((candidate) => only === undefined || candidate.ref === only)) {
    const name =
      target.ref === 'project'
        ? 'scene.json'
        : `${target.ref.startsWith('file:') ? target.ref.slice(5) : sceneFileName(target.file.name)}.scene.json`;
    try {
      const map = target.map || undefined;
      if (target.ref === 'project') await saveProjectScene(handle, target.file, map);
      else await saveScene(handle, name.slice(0, -'.scene.json'.length), target.file, map);
      target.done();
      result.saved += 1;
      result.names.push(name);
    } catch (error) {
      result.failed.push(error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}

/** The scene of `ref` was written by something else than Save (the panel's own "Save to project"): its closed edits are not pending. */
export function markSceneSaved(ref: string): void {
  usePlantEdit.setState((state) => omit(state, ref));
}

const omit = (state: { unsaved: Readonly<Record<string, UnsavedScene>> }, ref: string) => ({
  unsaved: Object.fromEntries(Object.entries(state.unsaved).filter(([key]) => key !== ref)),
});

// A scene being edited, or closed with Done and not saved, joins "Save all" whether or not the plant document is mounted (FLW-005).
registerSaveAllParticipant(async () => {
  const { saved, failed } = await saveEditedScenes();
  return { saved, failed };
});

/** The names of the scenes with edits that were never saved: the one being edited, if it changed, and those closed with Done. */
export function unsavedSceneNames(): string[] {
  const { editor, mapEditor, sceneRef, hadMap, baseline, unsaved } = usePlantEdit.getState();
  const live =
    editor && mapEditor && sceneRef !== null && textsOf(editor, mapEditor, hadMap).text !== baseline ? [editor.toFile().name] : [];
  return [
    ...live,
    ...Object.entries(unsaved)
      .filter(([ref]) => ref !== sceneRef)
      .map(([, scene]) => scene.file.name),
  ];
}

/** Drops every edit that was not saved: the session in progress without recording it, and the scenes closed with Done. */
export function discardEditedScenes(): void {
  usePlantEdit.setState({ ...CLOSED, unsaved: {}, version: usePlantEdit.getState().version + 1 });
}
