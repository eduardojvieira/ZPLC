/**
 * What a change made outside Studio does to an open file (IDE-004), as a decision over data: an unmodified file is
 * reloaded, a modified one is asked about, a deleted unmodified one is closed. "Changed" means the disk differs from
 * what Studio last read or wrote (`diskContent`), so Studio's own save is never a change, and a file the user typed
 * in after saving is not mistaken for one. The effects (reading, reloading, the question) are in
 * `externalChangeWatch.ts`.
 */

export interface OpenFileInfo {
  path: string;
  content: string;
  isModified: boolean;
  /** A string: the content Studio last read or wrote. null: known to be gone. Undefined: not tracked. */
  diskContent?: string | null;
}

/** What the disk held when Studio last looked, or undefined when that is not known for a file with unsaved changes. */
export function knownDiskContent(file: OpenFileInfo): string | null | undefined {
  if (file.diskContent !== undefined) return file.diskContent;
  return file.isModified ? undefined : file.content;
}

export interface ExternalChangePlan {
  reload: Array<{ path: string; content: string }>;
  /** `disk` is the text on disk, or null when the file was deleted. */
  conflicts: Array<{ path: string; disk: string | null }>;
  close: string[];
}

/**
 * `disk` has the current content of the files that were read: a string, null for a file that is gone, undefined for
 * one that could not be read now. A path that is not in the map was not checked and is left alone.
 */
export function planExternalChanges(files: readonly OpenFileInfo[], disk: ReadonlyMap<string, string | null | undefined>): ExternalChangePlan {
  const plan: ExternalChangePlan = { reload: [], conflicts: [], close: [] };
  for (const file of files) {
    if (!disk.has(file.path)) continue;
    const onDisk = disk.get(file.path);
    if (onDisk === undefined) continue;
    const known = knownDiskContent(file);
    if (onDisk === known) continue;
    if (file.isModified) {
      if (onDisk === file.content) continue; // the disk now holds what the buffer holds: nothing to decide
      plan.conflicts.push({ path: file.path, disk: onDisk });
    } else if (onDisk === null) {
      plan.close.push(file.path);
    } else if (onDisk !== file.content) {
      plan.reload.push({ path: file.path, content: onDisk });
    }
  }
  return plan;
}
