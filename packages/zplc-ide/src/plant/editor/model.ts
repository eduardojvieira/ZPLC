import type { PlantSceneFile, PlantSignalDef, ScenePart, Vec3 } from '../contracts';
import type { Catalogue } from '../core/catalogue';
import { sceneSignals } from '../core/scene';
import { freshIdentity, snapPlacement, snapRotation, updatePart, withoutPart, withPart } from './commands';
import { validateAt, type ProblemAt } from './validate';

export { GRID_M } from './commands';
export { TEMPLATES } from './templates';
export type { ProblemAt };

export interface EditorState {
  scene: PlantSceneFile;
  selection: string | null;
  problems: ProblemAt[];
  past: number;
  future: number;
  running: boolean;
}

export interface SceneEditor {
  state(): EditorState;
  select(id: string | null): void;
  place(partId: string, catalogueId: string, at: Vec3, rotationYDeg?: number): string | { problem: string };
  move(id: string, to: Vec3): void;
  rotate(id: string, deg: number): void;
  duplicate(id: string): string;
  remove(id: string): void;
  configure(id: string, patch: { name?: string; config?: Record<string, number | string | boolean> }): ProblemAt[];
  signals(): PlantSignalDef[];
  undo(): void;
  redo(): void;
  setRunning(running: boolean): void;
  load(scene: PlantSceneFile): void;
  toFile(): PlantSceneFile;
}

const EMPTY: PlantSceneFile = { schemaVersion: 1, name: 'Empty floor', parts: [], cameras: [] };
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
// The scene is plain data: a JSON round trip is the deep copy, and keeps history snapshots independent.
const copy = (scene: PlantSceneFile): PlantSceneFile => JSON.parse(JSON.stringify(scene)) as PlantSceneFile;

/** History is a stack of whole-scene snapshots: undo of any edit is exact by construction. No global state. */
export function createSceneEditor(catalogue: Catalogue, initial: PlantSceneFile = EMPTY): SceneEditor {
  let scene = copy(initial);
  let past: PlantSceneFile[] = [];
  let future: PlantSceneFile[] = [];
  let selection: string | null = null;
  let running = false;

  const guard = () => {
    if (running) throw new Error('the scene can only be edited while the plant is stopped');
  };
  const find = (id: string): ScenePart => {
    const p = scene.parts.find((q) => q.id === id);
    if (!p) throw new Error(`no part "${id}" in the scene`);
    return p;
  };
  const commit = (next: PlantSceneFile) => {
    past.push(scene);
    future = [];
    scene = next;
  };

  return {
    state: () => ({
      scene: copy(scene),
      selection,
      problems: validateAt(scene, catalogue),
      past: past.length,
      future: future.length,
      running,
    }),
    select(id) {
      if (id !== null) find(id);
      selection = id;
    },
    place(partId, catalogueId, at, rotationYDeg = 0) {
      guard();
      const def = catalogue.get(catalogueId);
      const identity = freshIdentity(scene, { id: catalogueId });
      const snapped = snapPlacement(scene, catalogue, catalogueId, at, rotationYDeg);
      const config = Object.fromEntries(Object.entries(def?.config ?? {}).map(([k, f]) => [k, f.default]));
      const next = withPart(scene, { id: partId, part: catalogueId, name: identity.name, ...snapped, config });
      // Only a part that cannot exist at all is refused; every other problem is shown at the part (SCN-015).
      const last = next.parts.length - 1;
      const refusal = validateAt(next, catalogue).find((p) => p.path === `parts[${last}].id` || p.path === `parts[${last}].part`);
      if (refusal) return { problem: `${refusal.path}: ${refusal.message}` };
      commit(next);
      selection = partId;
      return partId;
    },
    move(id, to) {
      guard();
      const p = find(id);
      const s = snapPlacement(scene, catalogue, p.part, to, p.rotationYDeg, id);
      commit(updatePart(scene, id, { position: s.position, rotationYDeg: s.rotationYDeg }));
    },
    rotate(id, deg) {
      guard();
      find(id);
      commit(updatePart(scene, id, { rotationYDeg: snapRotation(deg) }));
    },
    duplicate(id) {
      guard();
      const p = find(id);
      const identity = freshIdentity(scene, { id: p.part });
      const at: Vec3 = [p.position[0] + 0.25, p.position[1], p.position[2] + 0.25];
      commit(withPart(scene, { ...p, id: identity.id, name: identity.name, position: at, config: { ...p.config } }));
      selection = identity.id;
      return identity.id;
    },
    remove(id) {
      guard();
      find(id);
      commit(withoutPart(scene, id));
      if (selection === id) selection = null;
    },
    configure(id, patch) {
      guard();
      const p = find(id);
      const next = updatePart(scene, id, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        config: { ...p.config, ...patch.config },
      });
      const here = validateAt(next, catalogue).filter((q) => q.partId === id);
      // A duplicate name stays visible as a problem (SCN-015); anything else that is wrong is not applied (SCN-009).
      const duplicateName =
        patch.name !== undefined && NAME.test(patch.name) && scene.parts.some((q) => q.id !== id && q.name === patch.name);
      const refused = here.filter((q) => !(duplicateName && q.path.endsWith('.name')));
      if (refused.length > 0) return refused;
      commit(next);
      return here;
    },
    signals: () => sceneSignals(scene, catalogue),
    undo() {
      guard();
      const prev = past.pop();
      if (!prev) return;
      future.push(scene);
      scene = prev;
    },
    redo() {
      guard();
      const next = future.pop();
      if (!next) return;
      past.push(scene);
      scene = next;
    },
    setRunning(value) {
      running = value;
    },
    load(file) {
      guard();
      scene = copy(file);
      past = [];
      future = [];
      selection = null;
    },
    toFile: () => copy(scene),
  };
}
