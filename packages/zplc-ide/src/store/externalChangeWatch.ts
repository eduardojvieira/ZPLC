/**
 * Changes made outside Studio (IDE-004), as seen by the open project: while a project is open the main process watches
 * its folder and sends batches of changed paths; each batch reads the tree again and checks every open file against the
 * disk. An unmodified file is reloaded silently, a deleted one is closed, and a modified one that changed on disk is
 * asked about: keep the user's version, or load the one on disk. The decision itself is `planExternalChanges`.
 */
import { create } from 'zustand';
import { t } from '../i18n';
import { parseProjectChange } from '../../electron/projectFilesProtocol';
import { projectRootId } from '../ipc/projectFilesHandles';
import { readFileContent } from '../utils/fileSystem';
import { debugLog } from '../utils/debugLog';
import { planExternalChanges } from './externalChanges';
import { useIDEStore } from './useIDEStore';

export interface ExternalConflict {
  path: string;
  name: string;
  /** The text on disk, or null when the file was deleted. */ disk: string | null;
}

export const useExternalConflicts = create<{ conflicts: ExternalConflict[] }>(() => ({ conflicts: [] }));

const setConflicts = (update: (previous: ExternalConflict[]) => ExternalConflict[]) =>
  useExternalConflicts.setState((state) => ({ conflicts: update(state.conflicts) }));

async function readDisk(handle: FileSystemFileHandle): Promise<string | null | undefined> {
  try {
    return await readFileContent(handle);
  } catch (error) {
    return error instanceof Error && error.name === 'NotFoundError' ? null : undefined;
  }
}

const note = (message: string) => useIDEStore.getState().addConsoleEntry({ type: 'info', message, source: 'system' });

/** Reads every open file from the disk and applies what `planExternalChanges` decides. */
export async function checkOpenFiles(): Promise<void> {
  const before = useIDEStore.getState();
  const session = before.projectSession;
  const checked = [...before.loadedFiles.values()].filter((file) => file.handle);
  const disk = new Map<string, string | null | undefined>();
  await Promise.all(
    checked.map(async (file) => {
      disk.set(file.path, await readDisk(file.handle!));
    }),
  );
  const state = useIDEStore.getState();
  if (state.projectSession !== session) return;

  const files = [...state.loadedFiles.values()];
  const plan = planExternalChanges(files, disk);
  const loadedFiles = new Map(state.loadedFiles);
  let changed = false;
  const byPath = new Map(files.map((file) => [file.path, file]));
  // What Studio knows of the disk follows it, so that a later change is told from this one.
  for (const [path, onDisk] of disk) {
    const file = byPath.get(path);
    if (!file || typeof onDisk !== 'string' || file.diskContent === onDisk) continue;
    if (!file.isModified || file.content === onDisk) {
      loadedFiles.set(file.id, { ...file, diskContent: onDisk });
      changed = true;
    }
  }
  for (const reload of plan.reload) {
    const file = byPath.get(reload.path)!;
    loadedFiles.set(file.id, { ...file, content: reload.content, isModified: false, diskContent: reload.content });
    changed = true;
    note(t('statusText.reloadedFromDisk', { name: file.name }));
  }
  if (changed) useIDEStore.setState({ loadedFiles });
  for (const path of plan.close) {
    const file = byPath.get(path)!;
    useIDEStore.getState().discardFile(file.id);
    note(t('statusText.closedDeleted', { name: file.name }));
  }
  const open = new Set(files.map((file) => file.path));
  setConflicts((previous) => [
    ...previous.filter((conflict) => open.has(conflict.path) && !plan.conflicts.some((next) => next.path === conflict.path)),
    ...plan.conflicts.map((conflict) => ({ ...conflict, name: byPath.get(conflict.path)!.name })),
  ]);
}

/** The user's answer for one file: keep their version (the disk is then the known base) or take the disk's. */
export function resolveConflict(path: string, choice: 'mine' | 'disk'): void {
  const conflict = useExternalConflicts.getState().conflicts.find((item) => item.path === path);
  if (!conflict) return;
  const state = useIDEStore.getState();
  const file = [...state.loadedFiles.values()].find((candidate) => candidate.path === path);
  setConflicts((previous) => previous.filter((item) => item.path !== path));
  if (!file) return;
  if (choice === 'mine') {
    useIDEStore.setState({ loadedFiles: new Map(state.loadedFiles).set(file.id, { ...file, diskContent: conflict.disk }) });
  } else if (conflict.disk === null) {
    state.discardFile(file.id);
  } else {
    useIDEStore.setState({
      loadedFiles: new Map(state.loadedFiles).set(file.id, {
        ...file,
        content: conflict.disk,
        isModified: false,
        diskContent: conflict.disk,
      }),
    });
  }
}

/**
 * Watches the folder of whatever project the store has open. Returns the function that stops it. Only the desktop app
 * has a watch; elsewhere nothing happens.
 */
export function startExternalChangeWatch(): () => void {
  const bridge = typeof window === 'undefined' ? undefined : window.electronAPI?.projectFiles;
  const watch = bridge?.watch?.bind(bridge);
  const onChanged = bridge?.onChanged?.bind(bridge);
  if (!watch || !onChanged) return () => undefined;
  let watched: string | null = null;
  let running = false;
  let again = false;

  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await useIDEStore.getState().refreshFileTree();
        await checkOpenFiles();
      } while (again);
    } catch (error) {
      debugLog('[ExternalChanges] check failed', error);
    } finally {
      running = false;
    }
  };

  const follow = () => {
    const state = useIDEStore.getState();
    const rootId = state.isProjectOpen ? projectRootId(state.directoryHandle) : null;
    if (rootId === watched) return;
    watched = rootId;
    useExternalConflicts.setState({ conflicts: [] });
    if (rootId !== null)
      void Promise.resolve(watch({ rootId })).catch((error: unknown) => debugLog('[ExternalChanges] watch failed', error));
  };

  follow();
  const unsubscribe = useIDEStore.subscribe((state, previous) => {
    if (state.directoryHandle !== previous.directoryHandle || state.isProjectOpen !== previous.isProjectOpen) follow();
  });
  const stopListening = onChanged((raw) => {
    const change = parseProjectChange(raw);
    if (change && change.rootId === watched) void run();
  });
  return () => {
    unsubscribe();
    stopListening();
  };
}
