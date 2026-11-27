/**
 * The Plant group of the object navigator and its "Add a plant" action (spec 013 PLS-011, spec 012 SCN-016): the scenes the project
 * holds, or the starting templates when it holds none (the empty floor and each shipped scene, as `SceneChooser` lists them), and
 * the save of a template into the project under a name.
 */
import { SCENE_INDEX } from '../generated/sceneIndex';
import { runCommand } from '../commands/bus';
import { parseScene } from '../plant/core/scene';
import { saveScene } from '../plant/persistence/sceneFiles';
import { usePlantChoice } from '../plant/ui/usePlantChoice';
import { EMPTY, type SceneRef } from '../plant/ui/usePlantSession';

export interface PlantItem {
  key: string;
  /** The scene's name, or undefined for the plant map, which the view labels. */
  label?: string;
  ref: SceneRef;
}

export interface PlantTemplate {
  value: string;
  label: string;
}

/** What the view draws: the project's scenes, the templates `Add a plant` offers, and the names a new scene may not take. */
export interface PlantGroupModel {
  items: PlantItem[];
  templates: PlantTemplate[];
  existing: string[];
  onOpen: (ref: SceneRef) => void;
  onAdd: (template: string, name: string) => Promise<void>;
}

/** The scene of the project root and each saved scene, then the plant map; none when the project has no scene. */
export function plantItems(rootScene: boolean, saved: readonly string[]): PlantItem[] {
  const scenes: PlantItem[] = [
    ...(rootScene ? [{ key: 'scene:root', label: 'scene.json', ref: { kind: 'project' } as SceneRef }] : []),
    ...saved.map((name) => ({ key: `scene:${name}`, label: name, ref: { kind: 'file', name } as SceneRef })),
  ];
  return scenes.length === 0 ? [] : [...scenes, { key: 'plant-map', ref: scenes[0]!.ref }];
}

/** The empty floor, then each shipped scene, named in the language. */
export function plantTemplates(emptyFloor: string, locale: string): PlantTemplate[] {
  return [
    { value: EMPTY, label: emptyFloor },
    ...SCENE_INDEX.map((scene) => ({ value: scene.id, label: scene.names[locale === 'es' ? 'es' : 'en'] })),
  ];
}

// The empty floor as `usePlantSession` builds it; that file is not this unit's to export from.
const EMPTY_FLOOR = {
  scene: JSON.stringify({
    schemaVersion: 1,
    name: 'Empty floor',
    parts: [],
    cameras: [{ name: 'Overview', position: [0, 8, 8], target: [0, 0, 0] }],
  }),
  map: '',
};

/** A name for the template that the project does not hold yet. */
export function defaultPlantName(template: string, existing: readonly string[]): string {
  const base = template === EMPTY ? 'plant' : template;
  let name = base;
  for (let n = 2; existing.includes(name); n += 1) name = `${base}-${n}`;
  return name;
}

export interface AddPlantDeps {
  shippedScene: (id: string) => Promise<{ scene: string; map: string } | undefined>;
  open: (ref: SceneRef) => void;
}

/** Saves the template under `name` into the project (the `saveScene` flow of the plant panel) and opens the plant document on it. */
export async function addPlant(root: FileSystemDirectoryHandle, template: string, name: string, deps: AddPlantDeps): Promise<void> {
  const texts = template === EMPTY ? EMPTY_FLOOR : await deps.shippedScene(template);
  if (!texts) throw new Error(template);
  const parsed = parseScene(texts.scene);
  if ('problems' in parsed) throw new Error(parsed.problems.map((problem) => problem.message).join('; '));
  await saveScene(root, name, parsed.scene, texts.map || undefined);
  deps.open({ kind: 'file', name });
}

/** Opens the plant document on `ref`: the panel takes the request once it shows its scene. */
export function openPlant(ref: SceneRef): void {
  runCommand('view.plant');
  const { shown, ask } = usePlantChoice.getState();
  if (shown) return ask(ref);
  const off = usePlantChoice.subscribe((state) => {
    if (!state.shown) return;
    off();
    state.ask(ref);
  });
}
