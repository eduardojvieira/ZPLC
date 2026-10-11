/**
 * The Structured Text language service in Monaco (LNG-015, LNG-016): completion, hover, signature help, go to
 * definition, find references, the outline, rename and formatting, each answered from the index of the whole project
 * (`projectIndex.ts`) with the buffer of the editor in place of its file. They are registered once per Monaco, for
 * every editor; the project and what they may do to the other files are the session (`session.ts`) and the bridge.
 */

import type * as MonacoEditor from 'monaco-editor';
import { ST_LANGUAGE_ID } from '../utils/monaco-languages';
import { projectPathFromModelPath } from '../utils/sessionState';
import { editorModelPath } from '../components/editorModels';
import { completionsAt, hoverAt, outlineOf, signatureAt, type AssistKind, type OutlineEntry } from './assist';
import { formatEdits } from './format';
import { applyRenameEdits, prepareRename, renameSymbol } from './rename';
import { currentProjectFiles, currentProjectSession, indexWithBuffer } from './session';

/** What the language service may ask of the application beyond the text in front of it. */
export interface ProjectBridge {
  /** The tab size the author chose, for formatting. */
  indentSize(): number;
  /** The content of a project file, open or not; undefined when it cannot be read. */
  readFile(path: string): Promise<string | undefined>;
  /** Replace the content of a project file; it becomes a modified file of the editor, not yet saved. */
  writeFile(path: string, content: string): Promise<boolean>;
  /** Show a place of a file in the editor. */
  open(path: string, line: number, column: number): Promise<boolean>;
  /** Project files that are not Structured Text (diagrams, instruction lists) whose text holds `name`. */
  otherFilesMentioning(name: string): string[];
}

type Monaco = typeof MonacoEditor;
type Model = MonacoEditor.editor.ITextModel;

const registered = new WeakSet<object>();

const pathOf = (model: Model): string => {
  const uri = model.uri as { path?: string } | string | undefined;
  return (typeof uri === 'object' && uri !== null && typeof uri.path === 'string' ? projectPathFromModelPath(uri.path) : null) ?? '<buffer>';
};

function itemKind(monaco: Monaco, kind: AssistKind): MonacoEditor.languages.CompletionItemKind {
  const kinds = monaco.languages.CompletionItemKind;
  switch (kind) {
    case 'variable': return kinds.Variable;
    case 'function': return kinds.Function;
    case 'functionBlock': return kinds.Class;
    case 'type': return kinds.Struct;
    case 'field': return kinds.Field;
    case 'method': return kinds.Method;
    case 'parameter': return kinds.Property;
    case 'enumMember': return kinds.EnumMember;
    default: return kinds.Keyword;
  }
}

function symbolKind(monaco: Monaco, kind: OutlineEntry['kind']): MonacoEditor.languages.SymbolKind {
  const kinds = monaco.languages.SymbolKind;
  switch (kind) {
    case 'program': return kinds.Object;
    case 'function': return kinds.Function;
    case 'functionBlock': return kinds.Class;
    case 'interface': return kinds.Interface;
    case 'struct': return kinds.Struct;
    case 'enum': return kinds.Enum;
    case 'alias': return kinds.TypeParameter;
    case 'method': return kinds.Method;
    case 'field': return kinds.Field;
    case 'enumValue': return kinds.EnumMember;
    default: return kinds.Variable;
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

/** A Monaco URI for a project file: the model of its tab, or the one a tab would have. */
function uriOf(monaco: Monaco, path: string, current: Model): MonacoEditor.Uri {
  if (path === pathOf(current)) return current.uri;
  const open = monaco.editor.getModels().find((model) => pathOf(model) === path);
  return open ? open.uri : monaco.Uri.parse(editorModelPath(currentProjectSession(), `file:${path}`));
}

/**
 * A model for `path`, so that a result in a file that has no tab can be shown in a peek. The editor drops the models
 * of files that are not open the next time its tabs change, and this makes one again when it is asked.
 */
function ensureModel(monaco: Monaco, path: string, content: string, current: Model): void {
  const uri = uriOf(monaco, path, current);
  if (!monaco.editor.getModel(uri)) monaco.editor.createModel(content, ST_LANGUAGE_ID, uri);
}

export function registerSTProviders(monaco: Monaco, bridge: ProjectBridge): void {
  if (registered.has(monaco)) return;
  registered.add(monaco);
  const language = ST_LANGUAGE_ID;

  monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position, _context, token) {
      if (token.isCancellationRequested) return { suggestions: [] };
      try {
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
        const index = indexWithBuffer(pathOf(model), model.getValue());
        return {
          suggestions: completionsAt(index, pathOf(model), position.lineNumber, position.column, model.getValue()).map((item) => ({
            label: item.label,
            kind: itemKind(monaco, item.kind),
            detail: item.detail,
            insertText: item.insertText ?? item.label,
            sortText: `${item.rank}${item.label.toUpperCase()}`,
            range,
          })),
        };
      } catch {
        return { suggestions: [] };
      }
    },
  });

  monaco.languages.registerHoverProvider(language, {
    provideHover(model, position, token) {
      if (token.isCancellationRequested) return null;
      try {
        const hover = hoverAt(indexWithBuffer(pathOf(model), model.getValue()), pathOf(model), position.lineNumber, position.column);
        return hover ? { contents: [{ value: hover.value }] } : null;
      } catch {
        return null;
      }
    },
  });

  monaco.languages.registerSignatureHelpProvider(language, {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model, position, token) {
      if (token.isCancellationRequested) return null;
      try {
        const help = signatureAt(indexWithBuffer(pathOf(model), model.getValue()), pathOf(model), position.lineNumber, position.column, model.getValue());
        if (!help) return null;
        return {
          value: {
            signatures: [{ label: help.label, parameters: help.parameters.map((parameter) => ({ label: parameter.label, documentation: parameter.detail })) }],
            activeSignature: 0,
            activeParameter: help.activeParameter,
          },
          dispose() {},
        };
      } catch {
        return null;
      }
    },
  });

  monaco.languages.registerDocumentSymbolProvider(language, {
    provideDocumentSymbols(model, token) {
      if (token.isCancellationRequested) return [];
      try {
        const index = indexWithBuffer(pathOf(model), model.getValue());
        const toSymbol = (entry: OutlineEntry): MonacoEditor.languages.DocumentSymbol => {
          const startLineNumber = clamp(entry.range.line, 1, model.getLineCount());
          const endLineNumber = clamp(entry.range.endLine, startLineNumber, model.getLineCount());
          const nameLine = clamp(entry.line, 1, model.getLineCount());
          const nameColumn = clamp(entry.column, 1, model.getLineMaxColumn(nameLine));
          return {
            name: entry.name,
            detail: entry.detail,
            kind: symbolKind(monaco, entry.kind),
            tags: [],
            range: { startLineNumber, startColumn: entry.range.column, endLineNumber, endColumn: entry.range.endColumn },
            selectionRange: { startLineNumber: nameLine, startColumn: nameColumn, endLineNumber: nameLine, endColumn: clamp(nameColumn + entry.name.length, nameColumn, model.getLineMaxColumn(nameLine)) },
            children: entry.children.map(toSymbol),
          };
        };
        return outlineOf(index, pathOf(model)).map(toSymbol);
      } catch {
        return [];
      }
    },
  });

  const locationOf = (model: Model, file: string, line: number, column: number, length: number): MonacoEditor.languages.Location => ({
    uri: uriOf(monaco, file, model),
    range: { startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column + length },
  });

  monaco.languages.registerDefinitionProvider(language, {
    provideDefinition(model, position, token) {
      if (token.isCancellationRequested) return null;
      try {
        const index = indexWithBuffer(pathOf(model), model.getValue());
        const reference = index.referenceAt(pathOf(model), position.lineNumber, position.column);
        const symbol = reference ? index.symbol(reference.symbol) : undefined;
        if (!symbol) return null;
        const content = currentProjectFiles().find((file) => file.path === symbol.file)?.content;
        if (content !== undefined) ensureModel(monaco, symbol.file, content, model);
        return locationOf(model, symbol.file, symbol.line, symbol.column, symbol.name.length);
      } catch {
        return null;
      }
    },
  });

  monaco.languages.registerReferenceProvider(language, {
    provideReferences(model, position, context, token) {
      if (token.isCancellationRequested) return [];
      try {
        const index = indexWithBuffer(pathOf(model), model.getValue());
        const reference = index.referenceAt(pathOf(model), position.lineNumber, position.column);
        const symbol = reference ? index.symbol(reference.symbol) : undefined;
        if (!symbol) return [];
        const places = index.referencesTo(symbol.id, context.includeDeclaration);
        for (const file of new Set(places.map((place) => place.file))) {
          const content = index.files.get(file)?.content;
          if (content !== undefined) ensureModel(monaco, file, content, model);
        }
        return places.map((place) => locationOf(model, place.file, place.line, place.column, place.length));
      } catch {
        return [];
      }
    },
  });

  monaco.languages.registerRenameProvider(language, {
    resolveRenameLocation(model, position, token) {
      const nowhere = { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column };
      if (token.isCancellationRequested) return { text: '', range: nowhere, rejectReason: 'Cancelled.' };
      const prepared = prepareRename(indexWithBuffer(pathOf(model), model.getValue()), pathOf(model), position.lineNumber, position.column);
      if (!prepared.ok) return { text: '', range: nowhere, rejectReason: prepared.reason };
      return {
        text: prepared.placeholder,
        range: { startLineNumber: prepared.line, startColumn: prepared.column, endLineNumber: prepared.line, endColumn: prepared.column + prepared.length },
      };
    },
    async provideRenameEdits(model, position, newName, token) {
      const reject = (reason: string): MonacoEditor.languages.WorkspaceEdit & MonacoEditor.languages.Rejection => ({ edits: [], rejectReason: reason });
      if (token.isCancellationRequested) return reject('Cancelled.');
      const here = pathOf(model);
      const index = indexWithBuffer(here, model.getValue());
      const result = renameSymbol(index, here, position.lineNumber, position.column, newName);
      if (!result.ok) return reject(result.reason);
      const outside = bridge.otherFilesMentioning(result.symbol.name);
      if (outside.length > 0) {
        return reject(`${outside.slice(0, 3).join(', ')}${outside.length > 3 ? ' and others' : ''} mention${outside.length === 1 ? 's' : ''} ${result.symbol.name} and are not Structured Text: rename it there as well, then here.`);
      }
      // The files other than this one are changed through the editor's store, so that they are modified files with the
      // edit in them; this file's edits go back to Monaco, which applies them to the model.
      const others = result.files.filter((file) => file !== here);
      const planned = new Map<string, string>();
      for (const file of others) {
        const original = index.files.get(file)?.content ?? await bridge.readFile(file);
        if (original === undefined) return reject(`${file} could not be read, so nothing was renamed.`);
        planned.set(file, applyRenameEdits(original, result.edits.filter((edit) => edit.file === file)));
      }
      for (const [file, content] of planned) {
        if (!await bridge.writeFile(file, content)) return reject(`${file} could not be changed, so the rename is incomplete: undo it in the files that changed.`);
      }
      return {
        edits: result.edits.filter((edit) => edit.file === here).map((edit) => ({
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: { range: { startLineNumber: edit.line, startColumn: edit.column, endLineNumber: edit.line, endColumn: edit.column + edit.length }, text: edit.newText },
        })),
      };
    },
  });

  const lineEdits = (model: Model, from: number, to: number): MonacoEditor.languages.TextEdit[] =>
    formatEdits(model.getValue(), { indentSize: bridge.indentSize() })
      .filter((edit) => edit.line >= from && edit.line <= to)
      .map((edit) => ({
        range: { startLineNumber: edit.line, startColumn: 1, endLineNumber: edit.line, endColumn: model.getLineMaxColumn(edit.line) },
        text: edit.text,
      }));
  monaco.languages.registerDocumentFormattingEditProvider(language, {
    provideDocumentFormattingEdits: (model) => lineEdits(model, 1, model.getLineCount()),
  });
  monaco.languages.registerDocumentRangeFormattingEditProvider(language, {
    provideDocumentRangeFormattingEdits: (model, range) => lineEdits(model, range.startLineNumber, range.endLineNumber),
  });

  // Go to a definition or a reference in a file that has no tab: open the file at the place
  const withOpener = monaco.editor as unknown as {
    registerEditorOpener?: (opener: { openCodeEditor(source: unknown, resource: MonacoEditor.Uri, selection?: unknown): boolean }) => unknown;
  };
  withOpener.registerEditorOpener?.({
    openCodeEditor(_source, resource, selection) {
      const path = projectPathFromModelPath(resource.path);
      if (path === null) return false;
      const at = selection as { startLineNumber?: number; startColumn?: number; lineNumber?: number; column?: number } | undefined;
      void bridge.open(path, at?.startLineNumber ?? at?.lineNumber ?? 1, at?.startColumn ?? at?.column ?? 1);
      return true;
    },
  });
}
