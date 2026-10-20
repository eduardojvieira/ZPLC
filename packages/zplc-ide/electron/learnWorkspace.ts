/**
 * The app-owned workspace of a lesson (LRN-003): `<userData>/learn-workspaces/<lessonId>`, made here by the main process so that
 * starting a lesson asks the learner for no folder. The path is built from the lesson id and nothing else: an id must look
 * like a lesson id (`isLessonId`), so no separator, dot segment or drive can occur, and the entry found at that path must be
 * a real directory, never a link or a file. This module only makes and inspects the folder. It writes nothing into it, so
 * what the learner edited is never touched on a reopen; the renderer copies the starter in when `fresh` says the folder holds
 * no project yet.
 */
import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isLessonId } from '../shared/learnProgressModel.js';

export interface PreparedLearnWorkspace {
  directory: string;
  /** True while the folder holds no project file: the starter has not been copied in (or the copy never finished). */
  fresh: boolean;
}

const isMissing = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

export async function prepareLearnWorkspace(root: string, lessonId: string): Promise<PreparedLearnWorkspace> {
  if (!isLessonId(lessonId)) throw new Error('Invalid lesson id');
  const directory = path.join(root, lessonId);
  try {
    if (!(await lstat(directory)).isDirectory()) throw new Error('The lesson workspace is not a folder');
  } catch (error) {
    if (!isMissing(error)) throw error;
    await mkdir(directory, { recursive: true });
  }
  const fresh = await readFile(path.join(directory, 'zplc.json')).then(() => false, (error: unknown) => {
    if (isMissing(error)) return true;
    throw error;
  });
  return { directory, fresh };
}
