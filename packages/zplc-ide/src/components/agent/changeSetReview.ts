/**
 * The review and the save of an assistant's change set (IDE-030). Reviewing reads what is on disk, asks the host to compile and
 * test the whole set on a copy, and writes nothing. Saving is the person's click: it checks again that nothing moved, then
 * writes each file through the same store actions as a person's own save. Nothing here is reached by the provider.
 */
import { CANDIDATE_CHANGE_CAP, candidateLanguageOf } from '../../ai/candidatePaths';
import { canonicalManifest, type ProposedChange } from '../../ai/changeSetPrepare';
import { fileNameForNewFile, findFileInTree, readFileContent, writeFileContent } from '../../utils/fileSystem';
import type { FileTreeNode, ZPLCProjectConfig } from '../../types';
import { sha256Text } from '../candidateSources';
import type { CandidateChangeSetReviewPresentation } from '../workspaceTestPresentation';
import { presentChangeSetReview } from './changeSetPresentation';

export interface ChangeSetFileSnapshot {
  path: string;
  kind: 'modify' | 'create';
  /** What is on disk now ('' for a file that does not exist yet). */
  baseline: string;
  /** What the person would save. */
  candidate: string;
  beforeSha256?: string;
  afterSha256: string;
  /** The file in the editor, when it is open: it has to be unsaved-changes free and equal to the disk. */
  fileId?: string;
  handle?: FileSystemFileHandle;
}
export interface ChangeSetSnapshot {
  projectSession: number;
  compilerRunId: number;
  workspaceId: string;
  files: ChangeSetFileSnapshot[];
  /** The project settings as the editor held them, so a change of zplc.json is applied over the same ones. */
  config?: ZPLCProjectConfig;
}

/** The part of the store a change set reads and writes; the real store is passed as `useIDEStore.getState`. */
export interface ChangeSetStore {
  projectSession: number;
  compilerRunId: number;
  isProjectOpen: boolean;
  workspaceScenarioLink: { workspaceId: string; projectSession: number } | null;
  loadedFiles: Map<string, { content: string; isModified: boolean; handle?: FileSystemFileHandle }>;
  fileTree: FileTreeNode | null;
  directoryHandle: FileSystemDirectoryHandle | null;
  projectConfig: ZPLCProjectConfig | null;
  projectConfigDirty: boolean;
  createFile(name: string, language: NonNullable<ReturnType<typeof candidateLanguageOf>>, parentPath?: string): Promise<string>;
  updateFileContent(fileId: string, content: string): void;
  saveFile(fileId: string, options?: { quiet?: boolean }): Promise<boolean>;
  updateProjectConfig(updates: Partial<ZPLCProjectConfig>): void;
  saveProjectConfig(): Promise<void>;
}
export interface ChangeSetReviewBridge {
  review(request: { workspaceId: string; edits: Array<{ path: string; content: string }> }): Promise<unknown>;
}

export type ChangeSetReviewOutcome =
  | { kind: 'result'; snapshot: ChangeSetSnapshot; presentation: CandidateChangeSetReviewPresentation }
  | { kind: 'unsaved'; path: string }
  | { kind: 'no-change' | 'stale' | 'error' };

const fileIdOf = (path: string) => `file:${path}`;

/** The settings the store would hold after the change, and what `saveProjectConfig` would write for them, byte for byte. */
function mergedConfig(
  base: ZPLCProjectConfig,
  proposed: ZPLCProjectConfig,
): { updates: Partial<ZPLCProjectConfig>; content: string } | null {
  const removed = Object.keys(base).filter((key) => !(key in proposed));
  const updates = { ...proposed, ...Object.fromEntries(removed.map((key) => [key, undefined])) } as Partial<ZPLCProjectConfig>;
  const written = canonicalManifest({ ...base, ...updates });
  return 'content' in written ? { updates, content: written.content } : null;
}

async function manifestHandle(state: ChangeSetStore): Promise<FileSystemFileHandle | null> {
  try {
    return (await state.directoryHandle?.getFileHandle('zplc.json')) ?? null;
  } catch {
    return null;
  }
}

/** Reads the disk for each proposed file and builds what the review and the save are bound to; null when it cannot be one. */
async function snapshotOf(
  changes: readonly ProposedChange[],
  workspaceId: string,
  getState: () => ChangeSetStore,
): Promise<ChangeSetSnapshot | { unsaved: string } | 'no-change' | null> {
  const state = getState();
  const link = state.workspaceScenarioLink;
  if (!state.isProjectOpen || !state.fileTree || !link || link.projectSession !== state.projectSession || link.workspaceId !== workspaceId)
    return null;
  if (changes.length < 1 || changes.length > CANDIDATE_CHANGE_CAP) return null;
  const files: ChangeSetFileSnapshot[] = [];
  let config: ZPLCProjectConfig | undefined;
  for (const change of changes) {
    if (change.path === 'zplc.json') {
      const handle = await manifestHandle(state);
      if (!state.projectConfig || !handle || change.kind !== 'modify') return null;
      if (state.projectConfigDirty) return { unsaved: change.path };
      const baseline = await readFileContent(handle);
      if ((await sha256Text(baseline)) !== change.baselineSha256) return null;
      let proposed: ZPLCProjectConfig;
      try {
        proposed = JSON.parse(change.content) as ZPLCProjectConfig;
      } catch {
        return null;
      }
      const merged = mergedConfig(state.projectConfig, proposed);
      if (!merged) return null;
      config = state.projectConfig;
      if (merged.content === baseline) continue;
      files.push({
        path: change.path,
        kind: 'modify',
        baseline,
        candidate: merged.content,
        beforeSha256: change.baselineSha256,
        afterSha256: await sha256Text(merged.content),
        handle,
      });
      continue;
    }
    const node = findFileInTree(state.fileTree, change.path);
    if (change.kind === 'create') {
      if (node) return null;
      files.push({
        path: change.path,
        kind: 'create',
        baseline: '',
        candidate: change.content,
        afterSha256: await sha256Text(change.content),
      });
      continue;
    }
    const loaded = state.loadedFiles.get(fileIdOf(change.path));
    if (!node || node.type !== 'file' || !node.handle) return null;
    if (loaded?.isModified) return { unsaved: change.path };
    const baseline = await readFileContent(node.handle);
    if ((await sha256Text(baseline)) !== change.baselineSha256 || (loaded && loaded.content !== baseline)) return null;
    if (baseline === change.content) continue;
    files.push({
      path: change.path,
      kind: 'modify',
      baseline,
      candidate: change.content,
      beforeSha256: change.baselineSha256,
      afterSha256: await sha256Text(change.content),
      ...(loaded ? { fileId: fileIdOf(change.path) } : {}),
      handle: node.handle,
    });
  }
  if (files.length === 0) return 'no-change';
  return { projectSession: state.projectSession, compilerRunId: state.compilerRunId, workspaceId, files, ...(config ? { config } : {}) };
}

/** Whether the editor still holds what the snapshot was taken from; the disk is checked again when the person saves. */
export function changeSetIsCurrent(snapshot: ChangeSetSnapshot, state: ChangeSetStore): boolean {
  const link = state.workspaceScenarioLink;
  return (
    state.isProjectOpen &&
    state.projectSession === snapshot.projectSession &&
    state.compilerRunId === snapshot.compilerRunId &&
    link?.projectSession === snapshot.projectSession &&
    link.workspaceId === snapshot.workspaceId &&
    (snapshot.config === undefined || (state.projectConfig === snapshot.config && !state.projectConfigDirty)) &&
    snapshot.files.every((file) => {
      if (file.kind === 'create') return state.fileTree !== null && findFileInTree(state.fileTree, file.path) === null;
      if (!file.fileId) return true;
      const loaded = state.loadedFiles.get(file.fileId);
      return loaded !== undefined && !loaded.isModified && loaded.content === file.baseline && loaded.handle === file.handle;
    })
  );
}

/** Reviews a proposal: nothing is written, the host compiles and tests the whole set on a copy of the saved project. */
export async function reviewChangeSet(
  changes: readonly ProposedChange[],
  options: { workspaceId: string; bridge: ChangeSetReviewBridge; getState: () => ChangeSetStore; isCurrent?: () => boolean },
): Promise<ChangeSetReviewOutcome> {
  try {
    const snapshot = await snapshotOf(changes, options.workspaceId, options.getState);
    if (snapshot === 'no-change') return { kind: 'no-change' };
    if (snapshot === null) return { kind: 'stale' };
    if ('unsaved' in snapshot) return { kind: 'unsaved', path: snapshot.unsaved };
    if (options.isCurrent && !options.isCurrent()) return { kind: 'stale' };
    const result = await options.bridge.review({
      workspaceId: snapshot.workspaceId,
      edits: snapshot.files.map(({ path, candidate }) => ({ path, content: candidate })),
    });
    if ((options.isCurrent && !options.isCurrent()) || !changeSetIsCurrent(snapshot, options.getState())) return { kind: 'stale' };
    return {
      kind: 'result',
      snapshot,
      presentation: presentChangeSetReview(
        result,
        snapshot.files.map(({ path, kind, beforeSha256, afterSha256 }) => ({
          path,
          kind,
          afterSha256,
          ...(beforeSha256 ? { beforeSha256 } : {}),
        })),
      ),
    };
  } catch {
    return { kind: 'error' };
  }
}

/** The typed name `createFile` gives the file `path`: the name without its language's extension. */
function newFileName(path: string): { typed: string; language: NonNullable<ReturnType<typeof candidateLanguageOf>> } | null {
  const language = candidateLanguageOf(path);
  const name = path.slice('src/'.length);
  if (!language) return null;
  const typed = name.replace(/\.(st|il|(ld|fbd|sfc)\.json)$/, '');
  return fileNameForNewFile(typed, language) === name ? { typed, language } : null;
}

/** The person's save of a reviewed set: the disk is read again, then new programs, replaced programs and the settings are written. */
export async function saveChangeSet(snapshot: ChangeSetSnapshot, getState: () => ChangeSetStore): Promise<'saved' | 'stale' | 'error'> {
  try {
    if (!changeSetIsCurrent(snapshot, getState())) return 'stale';
    for (const file of snapshot.files) {
      if (file.kind === 'create') continue;
      const handle = file.path === 'zplc.json' ? await manifestHandle(getState()) : file.handle;
      if (!handle || (await sha256Text(await readFileContent(handle))) !== file.beforeSha256) return 'stale';
    }
    const order = (file: ChangeSetFileSnapshot) => (file.kind === 'create' ? 0 : file.path === 'zplc.json' ? 2 : 1);
    for (const file of [...snapshot.files].sort((left, right) => order(left) - order(right))) {
      if (file.path === 'zplc.json') {
        const state = getState();
        const merged = state.projectConfig && mergedConfig(state.projectConfig, JSON.parse(file.candidate) as ZPLCProjectConfig);
        if (!merged || merged.content !== file.candidate) return 'error';
        state.updateProjectConfig(merged.updates);
        await getState().saveProjectConfig();
        if (getState().projectConfigDirty) return 'error';
      } else if (file.kind === 'create') {
        const name = newFileName(file.path);
        if (!name) return 'error';
        const fileId = await getState().createFile(name.typed, name.language, 'src');
        if (fileId !== fileIdOf(file.path)) return 'error';
        getState().updateFileContent(fileId, file.candidate);
        if (!(await getState().saveFile(fileId))) return 'error';
      } else if (file.fileId) {
        getState().updateFileContent(file.fileId, file.candidate);
        if (!(await getState().saveFile(file.fileId))) return 'error';
      } else if (file.handle) await writeFileContent(file.handle, file.candidate);
      else return 'error';
    }
    return 'saved';
  } catch {
    return 'error';
  }
}
