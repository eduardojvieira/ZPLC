/**
 * Project operations that the file-handle interface of the browser has no name for (rename and move, a recursive
 * delete), as typed calls on the project-files bridge of the preload (IDE-001, IDE-004). The folder is named by the
 * opaque id of its handle; every path is relative to it. A failure raises the same errors as the handles do.
 */
import type { ProjectFilesBridge, ProjectFilesResult } from '../../electron/projectFilesProtocol';
import { projectFilesFailure, projectRootId } from './projectFilesHandles';
import {
  createBrowserFolder,
  isBrowserFolder,
  readBrowserFile,
  removeBrowserEntry,
  renameBrowserEntry,
  writeBrowserFile,
} from './projectOpsBrowser';

/** A browser folder (the picker, or the store of the web build) has no bridge: the operations run on its handles (REL-037). */
const inBrowser = (handle: unknown): handle is FileSystemDirectoryHandle =>
  isBrowserFolder(handle) &&
  projectRootId(handle) === null &&
  (typeof window === 'undefined' || window.electronAPI?.projectFiles === undefined);

function target(handle: unknown): { bridge: ProjectFilesBridge; rootId: string } {
  const bridge = typeof window === 'undefined' ? undefined : window.electronAPI?.projectFiles;
  const rootId = projectRootId(handle);
  if (!bridge || rootId === null) throw new Error('Renaming, moving and copying files need the desktop app with a project folder open.');
  return { bridge, rootId };
}

async function settled<T>(call: Promise<ProjectFilesResult<T>>): Promise<T> {
  let answer: ProjectFilesResult<T>;
  try {
    answer = await call;
  } catch {
    throw projectFilesFailure('failed');
  }
  if (!answer.ok) throw projectFilesFailure(answer.code);
  return answer.value;
}

export async function renameProjectEntry(handle: unknown, from: string, to: string): Promise<void> {
  if (inBrowser(handle)) return renameBrowserEntry(handle, from, to);
  const { bridge, rootId } = target(handle);
  await settled(bridge.rename({ rootId, from, to }));
}

export async function createProjectFolder(handle: unknown, path: string): Promise<void> {
  if (inBrowser(handle)) return createBrowserFolder(handle, path);
  const { bridge, rootId } = target(handle);
  await settled(bridge.mkdir({ rootId, path }));
}

export async function removeProjectEntry(handle: unknown, path: string, recursive: boolean): Promise<void> {
  if (inBrowser(handle)) return removeBrowserEntry(handle, path, recursive);
  const { bridge, rootId } = target(handle);
  await settled(bridge.remove({ rootId, path, recursive }));
}

export async function readProjectFile(handle: unknown, path: string): Promise<Uint8Array> {
  if (inBrowser(handle)) return readBrowserFile(handle, path);
  const { bridge, rootId } = target(handle);
  return settled(bridge.read({ rootId, path }));
}

export async function writeProjectFile(handle: unknown, path: string, bytes: Uint8Array): Promise<void> {
  if (inBrowser(handle)) return writeBrowserFile(handle, path, bytes);
  const { bridge, rootId } = target(handle);
  await settled(bridge.write({ rootId, path, bytes }));
}
