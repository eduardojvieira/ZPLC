/**
 * The diagnostics of the project as markers on the Monaco model of each file that is open (LNG-015): the range the
 * compiler's front end gave, not the character the cursor was at. A model that has none has its markers cleared, so an
 * error that was fixed goes away the next time the project is checked.
 */

import type * as MonacoEditor from 'monaco-editor';
import type { STLiveDiagnostic } from '../types';
import { projectPathFromModelPath } from '../utils/sessionState';

type Monaco = typeof MonacoEditor;

/** Sets the markers of `owner`; `fallbackFile` is the file of a diagnostic that names none. Returns what clears them. */
export function applyProjectMarkers(
  monaco: Monaco,
  owner: string,
  diagnostics: readonly STLiveDiagnostic[],
  fallbackFile: string,
): () => void {
  const touched: MonacoEditor.editor.ITextModel[] = [];
  for (const model of monaco.editor.getModels()) {
    const path = projectPathFromModelPath(model.uri.path);
    if (path === null) continue;
    const markers = diagnostics
      .filter((diagnostic) => (diagnostic.file ?? fallbackFile) === path && diagnostic.line !== undefined && diagnostic.line >= 1)
      .map((diagnostic) => {
        const startLineNumber = Math.min(diagnostic.line!, model.getLineCount());
        const startColumn = Math.min(Math.max(1, diagnostic.column ?? 1), model.getLineMaxColumn(startLineNumber));
        const endLineNumber = Math.min(Math.max(diagnostic.endLine ?? startLineNumber, startLineNumber), model.getLineCount());
        const endColumn =
          diagnostic.endLine !== undefined || diagnostic.endColumn !== undefined
            ? Math.min(
                Math.max(diagnostic.endColumn ?? startColumn + 1, endLineNumber === startLineNumber ? startColumn + 1 : 1),
                model.getLineMaxColumn(endLineNumber),
              )
            : Math.min(startColumn + 1, model.getLineMaxColumn(startLineNumber));
        return {
          message: diagnostic.message,
          ...(diagnostic.errorCode === undefined ? {} : { code: diagnostic.errorCode }),
          severity: diagnostic.type === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          startLineNumber,
          startColumn,
          endLineNumber,
          endColumn,
        };
      });
    monaco.editor.setModelMarkers(model, owner, markers);
    touched.push(model);
  }
  return () => {
    for (const model of touched) if (!model.isDisposed()) monaco.editor.setModelMarkers(model, owner, []);
  };
}
