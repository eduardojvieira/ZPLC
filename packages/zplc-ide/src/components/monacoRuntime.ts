/**
 * The one place that brings Monaco into the application (IDE-015). Only the editor core and the contributions Studio
 * uses (find, folding, suggestions, hover, go to definition and references, the diff editor) are imported: not the
 * language services of CSS, HTML, JSON and TypeScript, whose workers weigh several megabytes, and not the eighty
 * basic languages but the one Studio edits in, Structured Text. Instruction List has no Monaco grammar; the code
 * editor registers its own.
 *
 * Importing this module installs the bundled Monaco as the one the React wrapper uses, so that it never fetches
 * Monaco from a CDN, and gives it its single worker. A module that mounts a Monaco editor takes the wrapper's
 * `DiffEditor` and `Monaco` from here, and nothing outside those modules imports Monaco, so the code editor stays
 * out of the code that shows the Welcome screen.
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main';
// The one language Monaco itself provides that Studio uses: its Structured Text grammar and editing rules.
import 'monaco-editor/esm/vs/basic-languages/st/st.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { setEditorModelHost } from './editorModels';
import { resolveTokens } from '../theme/tokens';

export { DiffEditor, type Monaco } from '@monaco-editor/react';

const environment = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: () => Worker };
};

environment.MonacoEnvironment ??= { getWorker: () => new EditorWorker() };
// The wrapper types its `monaco` option as the full package; the editor core is what it needs.
loader.config({ monaco: monaco as unknown as NonNullable<Parameters<typeof loader.config>[0]['monaco']> });
setEditorModelHost(monaco.editor);

// The code typeface is a token (--font-mono) and a bundled file (UX-006): every editor and diff editor uses it unless it asks
// for another. Monaco measures its characters when an editor is created, so it measures again once the file has loaded.
(monaco.editor.EditorOptions.fontFamily as { defaultValue: string }).defaultValue = resolveTokens('light')['--font-mono'];
if (typeof document !== 'undefined' && 'fonts' in document) {
  void document.fonts
    .load("13px 'JetBrains Mono'")
    .then(() => {
      monaco.editor.remeasureFonts();
    })
    .catch(() => undefined);
}

/** The editor namespace of the bundled Monaco, for the code that acts on every model rather than on one editor. */
export const monacoEditor = monaco.editor;
