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

const tooLarge = (name: string) => new Error(`The scene "${name}" is larger than ${MAX_SCENE_BYTES} bytes.`);

export async function saveScene(root: FileSystemDirectoryHandle, name: string, scene: PlantSceneFile): Promise<void> {
  sceneFilePath(name);
  const text = `${JSON.stringify(scene, null, 2)}\n`;
  if (new TextEncoder().encode(text).length > MAX_SCENE_BYTES) throw tooLarge(name);
  const folder = await root.getDirectoryHandle(SCENES_FOLDER, { create: true });
  const writable = await (await folder.getFileHandle(`${name}.scene.json`, { create: true })).createWritable();
  await writable.write(text);
  await writable.close();
}

/** The scene, or its located problems; an older schema opens through the migration, a newer one names its version. */
export async function openScene(root: FileSystemDirectoryHandle, name: string): Promise<ReturnType<typeof parseScene>> {
  sceneFilePath(name);
  const folder = await root.getDirectoryHandle(SCENES_FOLDER);
  const file = await (await folder.getFileHandle(`${name}.scene.json`)).getFile();
  if (file.size > MAX_SCENE_BYTES) throw tooLarge(name);
  return parseScene(await file.text());
}
