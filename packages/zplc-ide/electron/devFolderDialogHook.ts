/**
 * Test hook for the native folder dialog (T7.5, VF-008). Only a build made for the suite has this module:
 * main.ts loads it by dynamic import when the app is not packaged, and electron-builder.yml leaves the
 * compiled file out of the archive, so a released installer holds neither the module nor the variable name
 * (the packaged smoke scans app.asar for it).
 */
import { readFileSync } from 'node:fs';

/**
 * ZPLC_SMOKE_FOLDER_ANSWER_FILE names a file that holds the folder to "choose" (empty or unreadable means cancel).
 * Returns undefined when the hook is not active, so the real dialog is used; `isPackaged` keeps it inert as a second guard.
 */
export function readFolderDialogHook(isPackaged: boolean, env: Record<string, string | undefined>): string | null | undefined {
  const answerFile = isPackaged ? undefined : env.ZPLC_SMOKE_FOLDER_ANSWER_FILE;
  if (!answerFile) return undefined;
  try {
    return readFileSync(answerFile, 'utf8').trim() || null;
  } catch {
    return null;
  }
}
