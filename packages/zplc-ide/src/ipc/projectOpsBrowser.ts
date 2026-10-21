/**
 * The project operations of projectOps.ts on a browser folder (a directory handle from the picker or from the store of the
 * web build), where no main process confines the paths (REL-037, IDE-001). The confinement is done here: a path is
 * relative, has no empty, `.` or `..` segment, and a rename never lands on an existing name or inside itself.
 */

function segments(path: string): string[] {
  const parts = path.split('/');
  if (path === '' || parts.some((part) => part === '' || part === '.' || part === '..' || part.includes('\\'))) {
    throw Object.assign(new Error('The file name is not allowed.'), { name: 'TypeError' });
  }
  return parts;
}

async function parentOf(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const parts = segments(path);
  let parent = root;
  for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part, { create });
  return { parent, name: parts[parts.length - 1]! };
}

async function kindOf(parent: FileSystemDirectoryHandle, name: string): Promise<'file' | 'directory' | null> {
  try {
    await parent.getFileHandle(name);
    return 'file';
  } catch {
    /* not a file */
  }
  try {
    await parent.getDirectoryHandle(name);
    return 'directory';
  } catch {
    return null;
  }
}

export async function readBrowserFile(root: FileSystemDirectoryHandle, path: string): Promise<Uint8Array> {
  const { parent, name } = await parentOf(root, path, false);
  return new Uint8Array(await (await (await parent.getFileHandle(name)).getFile()).arrayBuffer());
}

export async function writeBrowserFile(root: FileSystemDirectoryHandle, path: string, bytes: Uint8Array): Promise<void> {
  const { parent, name } = await parentOf(root, path, true);
  const writable = await (await parent.getFileHandle(name, { create: true })).createWritable();
  await writable.write(bytes as unknown as FileSystemWriteChunkType);
  await writable.close();
}

export async function createBrowserFolder(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  let directory = root;
  for (const part of segments(path)) directory = await directory.getDirectoryHandle(part, { create: true });
}

export async function removeBrowserEntry(root: FileSystemDirectoryHandle, path: string, recursive: boolean): Promise<void> {
  const { parent, name } = await parentOf(root, path, false);
  await parent.removeEntry(name, { recursive });
}

async function copyEntry(
  from: FileSystemDirectoryHandle,
  name: string,
  kind: 'file' | 'directory',
  to: FileSystemDirectoryHandle,
  newName: string,
): Promise<void> {
  if (kind === 'file') {
    const bytes = new Uint8Array(await (await (await from.getFileHandle(name)).getFile()).arrayBuffer());
    const writable = await (await to.getFileHandle(newName, { create: true })).createWritable();
    await writable.write(bytes as unknown as FileSystemWriteChunkType);
    await writable.close();
    return;
  }
  const source = await from.getDirectoryHandle(name);
  const target = await to.getDirectoryHandle(newName, { create: true });
  for await (const child of source.values()) await copyEntry(source, child.name, child.kind, target, child.name);
}

/**
 * Rename and move: the browser has no atomic move across folders, so the entry is copied and then removed; a failure while copying leaves
 * the original.
 */
export async function renameBrowserEntry(root: FileSystemDirectoryHandle, from: string, to: string): Promise<void> {
  const source = await parentOf(root, from, false);
  const kind = await kindOf(source.parent, source.name);
  if (kind === null) throw Object.assign(new Error('The folder, or a file in it, was not found.'), { name: 'NotFoundError' });
  if (to === from || to.startsWith(`${from}/`))
    throw Object.assign(new Error('An entry cannot be moved onto itself.'), { name: 'InvalidModificationError' });
  const target = await parentOf(root, to, true);
  if ((await kindOf(target.parent, target.name)) !== null)
    throw Object.assign(new Error('An entry with that name already exists.'), { name: 'InvalidModificationError' });
  await copyEntry(source.parent, source.name, kind, target.parent, target.name);
  await source.parent.removeEntry(source.name, { recursive: true });
}

/** True for a directory handle of the browser, which is what these operations take. */
export const isBrowserFolder = (handle: unknown): handle is FileSystemDirectoryHandle =>
  typeof handle === 'object' && handle !== null && typeof (handle as { getDirectoryHandle?: unknown }).getDirectoryHandle === 'function';
