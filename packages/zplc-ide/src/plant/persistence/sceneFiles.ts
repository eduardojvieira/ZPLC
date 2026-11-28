/**
 * Scenes saved with the project (SCN-006): `<project>/scenes/<name>.scene.json`, through the same directory handle every other
 * project file uses, so the main-process rules (containment, size caps) apply unchanged. Only a bare name is accepted, never a path.
 */
import type { PlantSceneFile } from '../contracts';
import { parseScene } from '../core/scene';

/** Plan choice: a scene is data, a megabyte holds thousands of parts. */
export const MAX_SCENE_BYTES = 1024 * 1024;
const SCENES_FOLDER = 'scenes';
const NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,63}$/;

function checkedName(name: string): string {
  if (!NAME.test(name) || name.includes('..') || name.endsWith('.')) {
    throw new Error(`"${name}" is not a valid scene name: use letters, digits, spaces, "-", "_" and "." (at most 64 characters).`);
  }
  return name;
}

export function sceneFilePath(name: string): string {
  return `${SCENES_FOLDER}/${checkedName(name)}.scene.json`;
}

/**
 * What Studio last wrote itself to a project path, until the watcher reports it (AIX-012): a change whose text is the one
 * recorded here is Studio's own write, and raises no external-change notice. Every scene save records its root files here,
 * and the restore of a file replaced from outside records its own write (`store/externalChangeWatch.ts`).
 */
const ownWrites = new Map<string, string>();

export function recordOwnWrite(path: string, text: string): void {
  ownWrites.set(path, text);
}

export function forgetOwnWrite(path: string): void {
  ownWrites.delete(path);
}

/** Whether `text` on disk at `path` is what Studio wrote there itself; a match is used once. */
export function takeOwnWrite(path: string, text: string): boolean {
  const own = ownWrites.get(path);
  ownWrites.delete(path);
  return own !== undefined && own === text;
}

export function hasOwnWrite(path: string): boolean {
  return ownWrites.has(path);
}

export function clearOwnWrites(): void {
  ownWrites.clear();
}

const tooLarge = (name: string) => new Error(`The scene "${name}" is larger than ${MAX_SCENE_BYTES} bytes.`);

async function write(folder: FileSystemDirectoryHandle, file: string, text: string): Promise<void> {
  const writable = await (await folder.getFileHandle(file, { create: true })).createWritable();
  await writable.write(text);
  await writable.close();
}

/** Saves the scene, and its plant map next to it (`<name>.plant-map.json`) when one is given. */
export async function saveScene(root: FileSystemDirectoryHandle, name: string, scene: PlantSceneFile, map?: string): Promise<void> {
  sceneFilePath(name);
  const text = `${JSON.stringify(scene, null, 2)}\n`;
  if (new TextEncoder().encode(text).length > MAX_SCENE_BYTES) throw tooLarge(name);
  const folder = await root.getDirectoryHandle(SCENES_FOLDER, { create: true });
  await write(folder, `${name}.scene.json`, text);
  if (map) await write(folder, `${name}.plant-map.json`, map);
}

/**
 * Saves the project's own scene: `scene.json` and `plant-map.json` at the project root, where a scene lesson's Check and the Tool API
 * read them. Creates no folder.
 */
export async function saveProjectScene(root: FileSystemDirectoryHandle, scene: PlantSceneFile, map?: string): Promise<void> {
  const text = `${JSON.stringify(scene, null, 2)}\n`;
  if (new TextEncoder().encode(text).length > MAX_SCENE_BYTES) throw tooLarge(scene.name);
  recordOwnWrite('scene.json', text);
  if (map) recordOwnWrite('plant-map.json', map);
  try {
    await write(root, 'scene.json', text);
    if (map) await write(root, 'plant-map.json', map);
  } catch (error) {
    forgetOwnWrite('scene.json');
    forgetOwnWrite('plant-map.json');
    throw error;
  }
}

/** Saves only the plant map of the project's own scene: `scene.json` is not touched. */
export async function saveProjectPlantMap(root: FileSystemDirectoryHandle, map: string): Promise<void> {
  recordOwnWrite('plant-map.json', map);
  try {
    await write(root, 'plant-map.json', map);
  } catch (error) {
    forgetOwnWrite('plant-map.json');
    throw error;
  }
}

/** Saves only the plant map of a scene saved in the project (`scenes/<name>.plant-map.json`). */
export async function saveScenePlantMap(root: FileSystemDirectoryHandle, name: string, map: string): Promise<void> {
  sceneFilePath(name);
  await write(await root.getDirectoryHandle(SCENES_FOLDER, { create: true }), `${name}.plant-map.json`, map);
}

/**
 * The texts of the project's own scene at its root (`plant-map.json` empty when it has none), or none when the project has no `scene.json`.
 */
export async function readProjectSceneTexts(root: FileSystemDirectoryHandle): Promise<{ scene: string; map: string } | undefined> {
  const read = async (file: string) => {
    const opened = await (await root.getFileHandle(file)).getFile();
    if (opened.size > MAX_SCENE_BYTES) throw tooLarge(file);
    return opened.text();
  };
  try {
    return { scene: await read('scene.json'), map: await read('plant-map.json').catch(() => '') };
  } catch {
    return undefined;
  }
}

/** The names of the scenes saved in the project, sorted; none when the project has no scenes folder. */
export async function listScenes(root: FileSystemDirectoryHandle): Promise<string[]> {
  const folder = await root.getDirectoryHandle(SCENES_FOLDER).catch(() => undefined);
  if (!folder) return [];
  const names: string[] = [];
  for await (const entry of folder.values()) {
    const name = entry.kind === 'file' && entry.name.endsWith('.scene.json') ? entry.name.slice(0, -'.scene.json'.length) : '';
    if (NAME.test(name)) names.push(name);
  }
  return names.sort();
}

/** The texts of a saved scene and of its plant map (empty when it has none), for the plant core to be built from. */
export async function readSceneTexts(root: FileSystemDirectoryHandle, name: string): Promise<{ scene: string; map: string }> {
  sceneFilePath(name);
  const folder = await root.getDirectoryHandle(SCENES_FOLDER);
  const read = async (file: string) => {
    const opened = await (await folder.getFileHandle(file)).getFile();
    if (opened.size > MAX_SCENE_BYTES) throw tooLarge(name);
    return opened.text();
  };
  return { scene: await read(`${name}.scene.json`), map: await read(`${name}.plant-map.json`).catch(() => '') };
}

/** The scene, or its located problems; an older schema opens through the migration, a newer one names its version. */
export async function openScene(root: FileSystemDirectoryHandle, name: string): Promise<ReturnType<typeof parseScene>> {
  sceneFilePath(name);
  const folder = await root.getDirectoryHandle(SCENES_FOLDER);
  const file = await (await folder.getFileHandle(`${name}.scene.json`)).getFile();
  if (file.size > MAX_SCENE_BYTES) throw tooLarge(name);
  return parseScene(await file.text());
}
