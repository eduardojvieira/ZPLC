/**
 * Changes made outside Studio (IDE-004), as seen by the open project: while a project is open the main process watches
 * its folder and sends batches of changed paths; each batch reads the tree again and checks every open file against the
 * disk. An unmodified file is reloaded silently, a deleted one is closed, and a modified one that changed on disk is
 * asked about: keep the user's version, or load the one on disk. The decision itself is `planExternalChanges`.
 *
 * Studio follows (AIX-012): each file replaced from outside gets a notice that names it; when Studio knows what the file
 * held (an open file, or a source the editors indexed), the notice shows what changed and restores what Studio had. A
 * change to `zplc.json` reloads the project settings (unsaved ones are asked about, as a modified file is), one under
 * `tests/` lists the tests again, and one to `scene.json` or `plant-map.json` reloads the plant document; Studio's own
 * scene saves are not taken for outside changes (`plant/persistence/sceneFiles.ts` records them).
 */
import { create } from 'zustand';
import { t } from '../i18n';
import { parseProjectChange } from '../../electron/projectFilesProtocol';
import { projectRootId } from '../ipc/projectFilesHandles';
import { findFileInTree, readFileContent, readProjectConfig, writeFileContent } from '../utils/fileSystem';
import { announce } from '../utils/announce';
import { debugLog } from '../utils/debugLog';
import { useProjectTests } from '../projectTests/useProjectTests';
import { planExternalChanges } from './externalChanges';
import { useProjectSources } from './projectSources';
import { useIDEStore } from './useIDEStore';
import { usePlantDocument } from './usePlantDocument';
import { usePlantEdit } from '../plant/editSession';
import { clearOwnWrites, forgetOwnWrite, hasOwnWrite, recordOwnWrite, takeOwnWrite } from '../plant/persistence/sceneFiles';
import type { ZPLCProjectV2 } from '../types';

export interface ExternalConflict {
  path: string;
  name: string;
  /** The text on disk, or null when the file was deleted. */ disk: string | null;
  /** For `zplc.json` with unsaved Project Settings: the person's settings as text, and the settings on disk to load. */
  settings?: { mine: string; config: ZPLCProjectV2 };
}

/**
 * A file replaced from outside. `before` is what Studio had, when it knew (`kind: 'file'` only): with it the notice shows
 * what changed and can restore it. A `plant` or `project` notice only names the file.
 */
export interface ExternalNotice {
  path: string;
  name: string;
  kind: 'file' | 'plant' | 'project';
  before?: string;
  after?: string;
}

/** What "What changed" shows: the text Studio had against the text on disk. */
export interface ExternalReview {
  path: string;
  name: string;
  before: string;
  after: string;
}

export const useExternalConflicts = create<{ conflicts: ExternalConflict[]; notices: ExternalNotice[]; review: ExternalReview | null }>(
  () => ({ conflicts: [], notices: [], review: null }),
);
const NOTICE_LIMIT = 8;

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

const NOTICE_TEXT = {
  file: 'studio.notice.externalUpdated',
  plant: 'studio.notice.externalPlant',
  project: 'studio.notice.externalProject',
} as const;

/** Adds the notice of a file, in place of an earlier one of the same file (whose `before` it keeps), and says it. */
function addNotice(notice: ExternalNotice): void {
  useExternalConflicts.setState((state) => {
    const earlier = state.notices.find((item) => item.path === notice.path);
    const next = earlier?.before !== undefined && notice.before !== undefined ? { ...notice, before: earlier.before } : notice;
    return { notices: [...state.notices.filter((item) => item.path !== notice.path), next].slice(-NOTICE_LIMIT) };
  });
  announce(t(NOTICE_TEXT[notice.kind], { name: notice.name }));
}

export function dismissNotice(path: string): void {
  useExternalConflicts.setState((state) => ({ notices: state.notices.filter((item) => item.path !== path) }));
}

/** Opens what changed in the file of a notice, in the conflict prompt. */
export function showChanges(path: string): void {
  const notice = useExternalConflicts.getState().notices.find((item) => item.path === path);
  if (notice?.before === undefined || notice.after === undefined) return;
  useExternalConflicts.setState({ review: { path, name: notice.name, before: notice.before, after: notice.after } });
}

export function closeReview(): void {
  useExternalConflicts.setState({ review: null });
}

/**
 * Writes back what Studio had before the file was replaced from outside. An open file shows it again, as saved; one with
 * unsaved changes made since is left alone, so that nothing the person typed is lost.
 */
export async function restoreExternal(path: string): Promise<void> {
  const notice = useExternalConflicts.getState().notices.find((item) => item.path === path);
  if (notice?.before === undefined) return;
  const before = notice.before;
  const state = useIDEStore.getState();
  const file = [...state.loadedFiles.values()].find((candidate) => candidate.path === path);
  const handle = file?.handle ?? (state.fileTree ? findFileInTree(state.fileTree, path)?.handle : undefined);
  if (!handle || file?.isModified) return;
  dismissNotice(path);
  closeReview();
  if (file) {
    useIDEStore.setState({
      loadedFiles: new Map(state.loadedFiles).set(file.id, { ...file, content: before, isModified: false, diskContent: before }),
    });
  } else {
    recordOwnWrite(path, before);
  }
  try {
    await writeFileContent(handle, before);
    announce(t('studio.notice.restored', { name: notice.name }));
  } catch (error) {
    forgetOwnWrite(path);
    useIDEStore.getState().addConsoleEntry({
      type: 'error',
      message: t('studio.notice.restoreFailed', { name: notice.name, reason: error instanceof Error ? error.message : String(error) }),
      source: 'system',
    });
  }
}

/** Reads every open file from the disk and applies what `planExternalChanges` decides; returns the paths it reloaded. */
export async function checkOpenFiles(): Promise<string[]> {
  const before = useIDEStore.getState();
  const session = before.projectSession;
  const checked = [...before.loadedFiles.values()].filter((file) => file.handle);
  const known = new Map(checked.map((file) => [file.path, file.diskContent]));
  const disk = new Map<string, string | null | undefined>();
  await Promise.all(
    checked.map(async (file) => {
      disk.set(file.path, await readDisk(file.handle!));
    }),
  );
  const state = useIDEStore.getState();
  if (state.projectSession !== session) return [];
  // A reading taken before Studio wrote the file (a save while it was read: the save's own write is a change the watcher
  // reports) is older than what Studio now knows of the disk. It is dropped; the write brings a check of its own.
  for (const file of state.loadedFiles.values())
    if (disk.has(file.path) && file.diskContent !== known.get(file.path)) disk.delete(file.path);

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
  if (plan.reload.length > 0) {
    // The markers of a reloaded file point at lines of the text it had: they go, and the build results are older.
    const reloaded = new Set(plan.reload.map((reload) => reload.path));
    useIDEStore.setState((current) => ({
      compilerMessages: current.compilerMessages.filter((message) => message.file === undefined || !reloaded.has(message.file)),
      compilerRunId: current.compilerRunId + 1,
    }));
  }
  for (const reload of plan.reload) {
    const file = byPath.get(reload.path)!;
    addNotice({ path: file.path, name: file.name, kind: 'file', before: file.content, after: reload.content });
  }
  for (const path of plan.close) {
    const file = byPath.get(path)!;
    useIDEStore.getState().discardFile(file.id);
    note(t('statusText.closedDeleted', { name: file.name }));
  }
  const open = new Set(files.map((file) => file.path));
  setConflicts((previous) => [
    ...previous.filter(
      (conflict) =>
        conflict.settings !== undefined || (open.has(conflict.path) && !plan.conflicts.some((next) => next.path === conflict.path)),
    ),
    ...plan.conflicts.map((conflict) => ({ ...conflict, name: byPath.get(conflict.path)!.name })),
  ]);
  return plan.reload.map((reload) => reload.path);
}

/** The user's answer for one file: keep their version (the disk is then the known base) or take the disk's. */
export function resolveConflict(path: string, choice: 'mine' | 'disk'): void {
  const conflict = useExternalConflicts.getState().conflicts.find((item) => item.path === path);
  if (!conflict) return;
  const state = useIDEStore.getState();
  const file = [...state.loadedFiles.values()].find((candidate) => candidate.path === path);
  setConflicts((previous) => previous.filter((item) => item.path !== path));
  if (conflict.settings) {
    // Keeping the person's settings leaves them unsaved, as they were; loading takes the ones on disk.
    if (choice === 'disk')
      useIDEStore.setState({
        projectConfig: conflict.settings.config,
        projectName: conflict.settings.config.name,
        projectConfigDirty: false,
      });
    return;
  }
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

const SCENE_FILES = new Set(['scene.json', 'plant-map.json']);

/** Reads the project settings again after `zplc.json` changed on disk; unsaved Project Settings are asked about, never replaced. */
async function reloadProjectConfig(): Promise<void> {
  const before = useIDEStore.getState();
  if (!before.directoryHandle || !before.projectConfig) return;
  const read = await readProjectConfig(before.directoryHandle);
  const state = useIDEStore.getState();
  if (read.kind !== 'valid' || state.projectSession !== before.projectSession || state.directoryHandle !== before.directoryHandle) return;
  if (JSON.stringify(read.config) === JSON.stringify(state.projectConfig)) return;
  if (state.projectConfigDirty) {
    const conflict: ExternalConflict = {
      path: 'zplc.json',
      name: 'zplc.json',
      disk: JSON.stringify(read.config, null, 2),
      settings: { mine: JSON.stringify(state.projectConfig, null, 2), config: read.config },
    };
    setConflicts((previous) => [...previous.filter((item) => item.path !== 'zplc.json'), conflict]);
    return;
  }
  useIDEStore.setState({ projectConfig: read.config, projectName: read.config.name });
  addNotice({ path: 'zplc.json', name: 'zplc.json', kind: 'project' });
}

/** Tells the files that are not open and that Studio knew (the sources it indexed) whose text changed on disk. */
async function noticeClosedFiles(paths: readonly string[], known: ReadonlyMap<string, string>): Promise<void> {
  const state = useIDEStore.getState();
  const open = new Set([...state.loadedFiles.values()].map((file) => file.path));
  await Promise.all(
    paths.map(async (path) => {
      if (open.has(path)) return;
      const before = known.get(path);
      const node = state.fileTree ? findFileInTree(state.fileTree, path) : null;
      if (before === undefined || !node?.handle) return;
      const after = await readDisk(node.handle);
      if (typeof after !== 'string') return;
      if (takeOwnWrite(path, after) || after === before) return;
      addNotice({ path, name: node.name, kind: 'file', before, after });
    }),
  );
}

/** Whether the scene file at the project root holds what a scene save of Studio wrote there. */
async function isOwnSceneWrite(path: string): Promise<boolean> {
  const root = useIDEStore.getState().directoryHandle;
  if (!root || !hasOwnWrite(path)) return false;
  try {
    const text = await (await (await root.getFileHandle(path)).getFile()).text();
    return takeOwnWrite(path, text);
  } catch {
    forgetOwnWrite(path);
    return false;
  }
}

/** What one batch of changes made outside Studio does to the open project. */
export async function followExternalChange(change: { paths: readonly string[]; overflow: boolean }): Promise<void> {
  const { paths, overflow } = change;
  const touched = (test: (path: string) => boolean) => overflow || paths.some(test);
  // What the editors indexed is read before the tree, whose refresh has the indexed sources read again.
  const known = new Map(useProjectSources.getState().sources.map((source) => [source.path, source.content]));
  await useIDEStore.getState().refreshFileTree();
  const reloaded = await checkOpenFiles();
  await noticeClosedFiles(paths, known);
  if (touched((path) => path === 'zplc.json')) await reloadProjectConfig();
  if (touched((path) => path.startsWith('tests/'))) await useProjectTests.getState().refresh();
  const scenes = overflow ? [...SCENE_FILES] : paths.filter((path) => SCENE_FILES.has(path));
  const conflicted = new Set(useExternalConflicts.getState().conflicts.map((conflict) => conflict.path));
  const own = await Promise.all(scenes.map((path) => isOwnSceneWrite(path)));
  // Studio's own save of the scene is not news; an open scene file with unsaved changes is asked about instead; a scene
  // being edited keeps its edits.
  const followed = scenes.filter((path, index) => !own[index] && !conflicted.has(path));
  if (followed.length > 0 && !usePlantEdit.getState().editor) {
    usePlantDocument.getState().notifyExternalPlantChange();
    // An open scene file that was reloaded already has its notice, with what changed.
    for (const path of followed) if (!reloaded.includes(path)) addNotice({ path, name: path, kind: 'plant' });
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

  // The batches that arrive while one is followed are followed together after it.
  let queued = { paths: new Set<string>(), overflow: false };
  const run = async (change: { paths: readonly string[]; overflow: boolean }) => {
    for (const path of change.paths) queued.paths.add(path);
    queued.overflow ||= change.overflow;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const next = queued;
        queued = { paths: new Set(), overflow: false };
        await followExternalChange({ paths: [...next.paths], overflow: next.overflow });
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
    useExternalConflicts.setState({ conflicts: [], notices: [], review: null });
    clearOwnWrites();
    if (rootId !== null)
      void Promise.resolve(watch({ rootId })).catch((error: unknown) => debugLog('[ExternalChanges] watch failed', error));
  };

  follow();
  const unsubscribe = useIDEStore.subscribe((state, previous) => {
    if (state.directoryHandle !== previous.directoryHandle || state.isProjectOpen !== previous.isProjectOpen) follow();
  });
  const stopListening = onChanged((raw) => {
    const change = parseProjectChange(raw);
    if (change && change.rootId === watched) void run(change);
  });
  return () => {
    unsubscribe();
    stopListening();
  };
}
