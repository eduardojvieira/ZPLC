/**
 * Where the web build keeps a project that is not in a folder the person chose: the origin private file system of the
 * browser (REL-037, IDE-001). It is a real directory handle, so the open, create, save, example and Learn flows run on it
 * unchanged, in every current browser. The folder is invisible to the person and goes when they clear the site data; the
 * notice of the web build says so. Each project is one folder under `projects/`, and its id is the folder name.
 */
import type { RecentProject } from '../../electron/projectFilesProtocol';

const STORE_FOLDER = 'projects';
const MAX_NAME = 60;

/** The folder name for a project name: letters, digits, dot, dash and underscore, never empty and never a dot path. */
export function storedFolderName(wanted: string): string {
  const cleaned = wanted.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, MAX_NAME);
  return cleaned.length > 0 ? cleaned : 'project';
}

/** True when this browser has the origin private file system. */
export function hasBrowserProjectStore(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

/** The folder that holds the stored projects, or null where the browser has no such store (a private window may refuse it). */
export async function openBrowserProjectStore(): Promise<FileSystemDirectoryHandle | null> {
  if (!hasBrowserProjectStore()) return null;
  try {
    return await (await navigator.storage.getDirectory()).getDirectoryHandle(STORE_FOLDER, { create: true });
  } catch {
    return null;
  }
}

async function exists(root: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try { await root.getDirectoryHandle(name); return true; } catch { return false; }
}

/** A new, empty folder for a project: the name asked for, or the first free `name-2`, `name-3`. */
export async function createStoredFolder(root: FileSystemDirectoryHandle, wanted: string): Promise<FileSystemDirectoryHandle> {
  const base = storedFolderName(wanted);
  let name = base;
  for (let n = 2; await exists(root, name); n += 1) name = `${base.slice(0, MAX_NAME - 5)}-${n}`;
  return root.getDirectoryHandle(name, { create: true });
}

/** The stored projects (the folders that hold a zplc.json), in the shape of the recent-projects list of the Welcome screen. */
export async function listStoredProjects(root: FileSystemDirectoryHandle): Promise<RecentProject[]> {
  const found: RecentProject[] = [];
  for await (const entry of root.values()) {
    if (entry.kind !== 'directory') continue;
    try {
      const file = await (await (entry as FileSystemDirectoryHandle).getFileHandle('zplc.json')).getFile();
      found.push({ recentId: entry.name, displayName: entry.name, lastOpenedAt: file.lastModified, available: true });
    } catch { /* a folder with no zplc.json is not a project */ }
  }
  return found.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

/** The folder of a stored project. An id is a folder name made by `storedFolderName`: anything else is refused, so no id leaves the store. */
export async function openStoredFolder(root: FileSystemDirectoryHandle, recentId: string): Promise<FileSystemDirectoryHandle> {
  if (storedFolderName(recentId) !== recentId) throw new Error('That project is not in this browser.');
  return root.getDirectoryHandle(recentId);
}

export async function forgetStoredFolder(root: FileSystemDirectoryHandle, recentId: string): Promise<void> {
  if (storedFolderName(recentId) !== recentId) return;
  await root.removeEntry(recentId, { recursive: true });
}

// The same, on the store of this browser: what the stores of the application call in the web build.

async function withStore<T>(run: (root: FileSystemDirectoryHandle) => Promise<T>, none: T): Promise<T> {
  const root = await openBrowserProjectStore();
  return root === null ? none : run(root);
}

export const listBrowserProjects = (): Promise<RecentProject[]> => withStore(listStoredProjects, []);
export const forgetBrowserProject = (recentId: string): Promise<void> => withStore((root) => forgetStoredFolder(root, recentId), undefined);
export const openBrowserProject = async (recentId: string): Promise<FileSystemDirectoryHandle> => {
  const root = await openBrowserProjectStore();
  if (root === null) throw new Error('This browser cannot keep projects. Open a folder instead.');
  return openStoredFolder(root, recentId);
};
export const newBrowserProjectFolder = async (name: string): Promise<FileSystemDirectoryHandle> => {
  const root = await openBrowserProjectStore();
  if (root === null) throw new Error('This browser cannot keep projects. Open a folder instead.');
  return createStoredFolder(root, name);
};
