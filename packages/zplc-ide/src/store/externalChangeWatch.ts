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
  /** For `scene.json` or `plant-map.json` while the Scene Editor is open on the project's scene: the editor's scene as text. */
  scene?: { mine: string };
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
  /** Why the last Restore did not happen, as the notice says it. */
  error?: string;
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

// A notice is about the text the file had when it was replaced: the first edit of that file, or its save, ends it (an edit
// marks the file modified before any save).
useIDEStore.subscribe((state, previous) => {
  if (state.loadedFiles === previous.loadedFiles) return;
  const notices = useExternalConflicts.getState().notices;
  if (notices.length === 0) return;
  const edited = new Set([...state.loadedFiles.values()].filter((file) => file.isModified).map((file) => file.path));
  if (!notices.some((notice) => edited.has(notice.path))) return;
  const review = useExternalConflicts.getState().review;
  useExternalConflicts.setState({
    notices: notices.filter((notice) => !edited.has(notice.path)),
    ...(review && edited.has(review.path) ? { review: null } : {}),
  });
});

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

/** Says on the notice of `path` why its Restore did not happen; the notice stays. */
function noticeError(path: string, error: string): void {
  useExternalConflicts.setState((state) => ({
    notices: state.notices.map((item) => (item.path === path ? { ...item, error } : item)),
  }));
  announce(error, 'assertive');
}

/**
 * Writes back what Studio had before the file was replaced from outside. It refuses when the notice is stale: the disk no
 * longer holds the text the notice showed, or the open file is not that text as saved, so nothing written since is lost.
 * The editor shows the restored text only once the write succeeded; a failure leaves everything as it was and says why on
 * the notice.
 */
export async function restoreExternal(path: string): Promise<void> {
  const notice = useExternalConflicts.getState().notices.find((item) => item.path === path);
  if (notice?.before === undefined || notice.after === undefined) return;
  const { before, after } = notice;
  const state = useIDEStore.getState();
  const file = [...state.loadedFiles.values()].find((candidate) => candidate.path === path);
  const handle = file?.handle ?? (state.fileTree ? findFileInTree(state.fileTree, path)?.handle : undefined);
  const stale = () => noticeError(path, t('studio.notice.restoreStale', { name: notice.name }));
  if (!handle || (file && (file.isModified || file.content !== after))) return stale();
  if ((await readDisk(handle)) !== after) return stale();
  recordOwnWrite(path, before);
  try {
    await writeFileContent(handle, before);
  } catch (error) {
    forgetOwnWrite(path);
    const reason = error instanceof Error ? error.message : String(error);
    noticeError(path, t('studio.notice.restoreFailed', { name: notice.name, reason }));
    return;
  }
  dismissNotice(path);
  closeReview();
  const latest = useIDEStore.getState();
  const current = file ? latest.loadedFiles.get(file.id) : undefined;
  if (current && !current.isModified && current.content === after)
    useIDEStore.setState({
      loadedFiles: new Map(latest.loadedFiles).set(current.id, { ...current, content: before, isModified: false, diskContent: before }),
    });
  announce(t('studio.notice.restored', { name: notice.name }));
}

/**
 * Reads every open file from the disk and applies what `planExternalChanges` decides; returns the paths it reloaded. A
 * path in `quiet` holds Studio's own write: it is reloaded like any other, without a notice.
 */
export async function checkOpenFiles(quiet: ReadonlySet<string> = new Set()): Promise<string[]> {
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
    const outsideReload = plan.reload.some((reload) => !quiet.has(reload.path));
    useIDEStore.setState((current) => {
      const remaining = current.compilerMessages.filter((message) => message.file === undefined || !reloaded.has(message.file));
      const clearedMarkers = remaining.length < current.compilerMessages.length;
      return {
        compilerMessages: remaining,
        compilerRunId: current.compilerRunId + 1,
        ...(clearedMarkers || (outsideReload && current.compilerMessagesChecked) ? { compilerResultsFromEarlierBuild: true } : {}),
      };
    });
  }
  for (const reload of plan.reload) {
    const file = byPath.get(reload.path)!;
    if (!quiet.has(file.path)) addNotice({ path: file.path, name: file.name, kind: 'file', before: file.content, after: reload.content });
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
        conflict.settings !== undefined ||
        conflict.scene !== undefined ||
        (open.has(conflict.path) && !plan.conflicts.some((next) => next.path === conflict.path)),
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
  if (conflict.scene) {
    // Loading from disk ends the editing session and reads the scene again; keeping leaves the editor as it is.
    if (choice === 'disk') {
      usePlantEdit.getState().end();
      usePlantDocument.getState().notifyExternalPlantChange();
    }
    return;
  }
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
      if (after === before) return;
      addNotice({ path, name: node.name, kind: 'file', before, after });
    }),
  );
}

/** The text on disk at a project path: through its open file, its tree node, or the root for a root file. */
async function readProjectText(path: string): Promise<string | null | undefined> {
  const state = useIDEStore.getState();
  const open = [...state.loadedFiles.values()].find((file) => file.path === path)?.handle;
  const handle = open ?? (state.fileTree ? findFileInTree(state.fileTree, path)?.handle : undefined);
  if (handle) return readDisk(handle);
  if (!state.directoryHandle || path.includes('/')) return undefined;
  try {
    return await readDisk(await state.directoryHandle.getFileHandle(path));
  } catch {
    return undefined;
  }
}

/** The paths of the batch whose disk text is what Studio wrote there itself; each match is used once. */
async function ownWritesIn(paths: readonly string[]): Promise<Set<string>> {
  const own = new Set<string>();
  await Promise.all(
    [...new Set(paths)].filter(hasOwnWrite).map(async (path) => {
      const text = await readProjectText(path);
      if (typeof text !== 'string') forgetOwnWrite(path);
      else if (takeOwnWrite(path, text)) own.add(path);
    }),
  );
  return own;
}

/** The person's version of a scene file being edited in the Scene Editor on the project's scene, as a save would write it. */
function editedSceneText(path: string): string | undefined {
  const { editor, mapEditor, sceneRef } = usePlantEdit.getState();
  if (!editor || sceneRef !== 'project') return undefined;
  if (path === 'scene.json') return `${JSON.stringify(editor.toFile(), null, 2)}\n`;
  return mapEditor ? JSON.stringify(mapEditor.map()) : undefined;
}

/** What one batch of changes made outside Studio does to the open project. */
export async function followExternalChange(change: { paths: readonly string[]; overflow: boolean }): Promise<void> {
  const { paths, overflow } = change;
  const touched = (test: (path: string) => boolean) => overflow || paths.some(test);
  // Studio's own writes are told first, for every path of the batch, so that nothing below takes them for news.
  const own = await ownWritesIn(overflow ? [...paths, ...SCENE_FILES] : paths);
  // What the editors indexed is read before the tree, whose refresh has the indexed sources read again.
  const known = new Map(useProjectSources.getState().sources.map((source) => [source.path, source.content]));
  await useIDEStore.getState().refreshFileTree();
  const reloaded = await checkOpenFiles(own);
  await noticeClosedFiles(
    paths.filter((path) => !own.has(path)),
    known,
  );
  if (touched((path) => path === 'zplc.json')) await reloadProjectConfig();
  if (touched((path) => path.startsWith('tests/'))) await useProjectTests.getState().refresh();
  const scenes = overflow ? [...SCENE_FILES] : paths.filter((path) => SCENE_FILES.has(path));
  const conflicted = new Set(useExternalConflicts.getState().conflicts.map((conflict) => conflict.path));
  // An open scene file with unsaved changes is asked about already.
  const followed = scenes.filter((path) => !own.has(path) && !conflicted.has(path));
  if (followed.length === 0) return;
  const edited = followed.map((path) => ({ path, mine: editedSceneText(path) }));
  if (edited.some((item) => item.mine !== undefined)) {
    // The Scene Editor holds the person's version of the project's scene: they choose, and nothing is dropped (§5.2 gap 3a).
    const asked: ExternalConflict[] = [];
    for (const { path, mine } of edited) {
      const disk = await readProjectText(path);
      if (mine !== undefined && typeof disk === 'string' && disk !== mine) asked.push({ path, name: path, disk, scene: { mine } });
    }
    setConflicts((previous) => [...previous.filter((item) => !asked.some((next) => next.path === item.path)), ...asked]);
    return;
  }
  usePlantDocument.getState().notifyExternalPlantChange();
  // An open scene file that was reloaded already has its notice, with what changed.
  for (const path of followed) if (!reloaded.includes(path)) addNotice({ path, name: path, kind: 'plant' });
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
