/**
 * Puts the starter of a lesson back over the learner's edits (LRN-003). It writes only the files the starter has, so a note or
 * a file the learner added stays; every path is checked before the first write, so a bad one writes nothing. It only ever
 * writes under the folder handle it is given, which is the lesson workspace the window has open.
 */
export interface StarterFile {
  path: string;
  content: string;
}

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

function segmentsOf(path: string): string[] {
  const segments = path.split('/');
  if (segments.length === 0 || !segments.every((segment) => segment !== '.' && segment !== '..' && SEGMENT.test(segment)))
    throw new Error('A starter file path leaves the workspace');
  return segments;
}

async function write(handle: FileSystemFileHandle, content: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/** Writes the starter's files; the project file (`zplc.json`) is written by the caller, which has the parsed project. */
export async function restoreStarterFiles(root: FileSystemDirectoryHandle, files: readonly StarterFile[]): Promise<void> {
  const checked = files.map((file) => ({ segments: segmentsOf(file.path), content: file.content }));
  for (const { segments, content } of checked) {
    let directory = root;
    for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment, { create: true });
    await write(await directory.getFileHandle(segments.at(-1)!, { create: true }), content);
  }
}
