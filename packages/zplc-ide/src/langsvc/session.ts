/**
 * The project the language service answers about (LNG-015): its Structured Text files, as the project tracker last
 * read them (`store/projectSources.ts`), and the index of them with the buffer being edited in place of its file.
 *
 * The Monaco providers are registered once for every editor and have no project to ask; whoever tracks the project
 * sets it here. The index is kept for the last buffer, so a hover, a completion and a signature help asked of the
 * same text share one reading of the project.
 */

import { buildProjectIndex, type ProjectFile, type ProjectIndex } from './projectIndex';

let files: readonly ProjectFile[] = [];
let session = 0;
let cached: { files: readonly ProjectFile[]; index: ProjectIndex } | undefined;

export function setCurrentProject(next: readonly ProjectFile[], projectSession: number): void {
  files = next;
  session = projectSession;
  cached = undefined;
}

export function currentProjectFiles(): readonly ProjectFile[] {
  return files;
}

export function currentProjectSession(): number {
  return session;
}

/** The files with `path` set to `content`: the buffer of an editor is newer than what the tracker read. */
export function filesWithBuffer(path: string, content: string, base: readonly ProjectFile[] = files): ProjectFile[] {
  let found = false;
  const next = base.map((file) => {
    if (file.path !== path) return file;
    found = true;
    return file.content === content ? file : { path, content };
  });
  return found ? next : [...next, { path, content }];
}

const sameFiles = (left: readonly ProjectFile[], right: readonly ProjectFile[]): boolean =>
  left.length === right.length && left.every((file, at) => file.path === right[at]!.path && file.content === right[at]!.content);

/** The index of the project with the buffer of `path` as it is now. */
export function indexWithBuffer(path: string, content: string): ProjectIndex {
  const next = filesWithBuffer(path, content);
  if (cached && sameFiles(cached.files, next)) return cached.index;
  const index = buildProjectIndex(next);
  cached = { files: next, index };
  return index;
}
