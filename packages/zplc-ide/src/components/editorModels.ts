/**
 * Monaco models for open text files.
 *
 * One model per project session and file keeps content, undo history, cursor and
 * scroll apart: the editor switches models instead of rewriting a shared one.
 */

const EDITOR_MODEL_SCHEME = 'zplc-file';

/** The path handed to Monaco; the session keeps a model of a previous project from being reused. */
export function editorModelPath(projectSession: number, fileId: string): string {
  return `${EDITOR_MODEL_SCHEME}:///${projectSession}/${encodeURIComponent(fileId)}`;
}

/** `uri.path` is the decoded path Monaco reports for a model. */
export function isEditorModelClosed(
  uri: { scheme: string; path: string },
  projectSession: number,
  openFileIds: readonly string[],
): boolean {
  return uri.scheme === EDITOR_MODEL_SCHEME && !openFileIds.some((id) => uri.path === `/${projectSession}/${id}`);
}

interface EditorModelHost {
  getModels(): ReadonlyArray<{ uri: { scheme: string; path: string }; dispose(): void }>;
}

/** Drops the models of closed tabs and of earlier project sessions; `host` is `monaco.editor`. */
export function disposeClosedEditorModels(host: EditorModelHost, projectSession: number, openFileIds: readonly string[]): void {
  for (const model of host.getModels()) {
    if (isEditorModelClosed(model.uri, projectSession, openFileIds)) model.dispose();
  }
}

let loadedHost: EditorModelHost | null = null;

/** Monaco registers itself when its first editor module loads; until then no model exists and there is nothing to drop. */
export function setEditorModelHost(host: EditorModelHost): void {
  loadedHost = host;
}

/** `disposeClosedEditorModels` for the Monaco that is loaded, if any. */
export function disposeClosedModelsOfLoadedEditor(projectSession: number, openFileIds: readonly string[]): void {
  if (loadedHost) disposeClosedEditorModels(loadedHost, projectSession, openFileIds);
}

/** Monaco rejects pending work with this error when a model is swapped; some of its promises are not handled. */
export function isMonacoCancellation(reason: unknown): boolean {
  return reason instanceof Error && reason.name === 'Canceled' && reason.message === 'Canceled';
}
