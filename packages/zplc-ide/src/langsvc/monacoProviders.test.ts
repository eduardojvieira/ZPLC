// LNG-015 / LNG-016 in Monaco: the providers answer from the whole project, with the buffer in place of its file.
// Monaco is replaced by a recorder of what is registered; the models are plain objects.
import { beforeEach, describe, expect, it } from 'bun:test';
import { registerSTProviders, type ProjectBridge } from './monacoProviders';
import { setCurrentProject } from './session';

const LIB = `FUNCTION Twice : INT
VAR_INPUT
  X : INT;
END_VAR
  Twice := X * 2;
END_FUNCTION

FUNCTION_BLOCK Motor
VAR_INPUT
  Start : BOOL;
END_VAR
VAR_OUTPUT
  Running : BOOL;
END_VAR
  Running := Start;
END_FUNCTION_BLOCK
`;
const MAIN = `PROGRAM Main
VAR
  M : Motor;
  Count : INT;
  Run : BOOL;
END_VAR
  Count := Twice(X := Count);
  M(Start := Run);
  Run := M.Running;
END_PROGRAM
`;
const FILES = [{ path: 'src/lib/blocks.st', content: LIB }, { path: 'src/main.st', content: MAIN }];

type Provider = Record<string, unknown>;
/** Calls the method `name` of a registered provider. */
const call = (provider: Provider, name: string, ...args: unknown[]): unknown => (provider[name] as (...values: unknown[]) => unknown)(...args);

function fakeMonaco() {
  const providers: Record<string, Provider> = {};
  const models: Array<{ uri: { path: string; scheme: string; toString(): string } }> = [];
  const created: string[] = [];
  const opener: { current?: { openCodeEditor(source: unknown, resource: { path: string }, selection?: unknown): boolean } } = {};
  const register = (name: string) => (_language: string, provider: Provider) => { providers[name] = provider; return { dispose() {} }; };
  const monaco = {
    languages: {
      CompletionItemKind: { Variable: 1, Function: 2, Class: 3, Struct: 4, Field: 5, Method: 6, Property: 7, EnumMember: 8, Keyword: 9 },
      SymbolKind: { Object: 1, Function: 2, Class: 3, Interface: 4, Struct: 5, Enum: 6, TypeParameter: 7, Method: 8, Field: 9, EnumMember: 10, Variable: 11 },
      registerCompletionItemProvider: register('completion'),
      registerHoverProvider: register('hover'),
      registerSignatureHelpProvider: register('signature'),
      registerDocumentSymbolProvider: register('outline'),
      registerDefinitionProvider: register('definition'),
      registerReferenceProvider: register('references'),
      registerRenameProvider: register('rename'),
      registerDocumentFormattingEditProvider: register('format'),
      registerDocumentRangeFormattingEditProvider: register('formatRange'),
    },
    editor: {
      getModels: () => models,
      getModel: (uri: { path: string }) => models.find((model) => model.uri.path === uri.path) ?? null,
      createModel: (_content: string, _language: string, uri: { path: string; scheme: string; toString(): string }) => { models.push({ uri }); created.push(uri.path); return { uri }; },
      registerEditorOpener: (value: typeof opener.current) => { opener.current = value; return { dispose() {} }; },
    },
    Uri: { parse: (value: string) => { const path = decodeURIComponent(value.replace(/^zplc-file:\/\//, '')); return { path, scheme: 'zplc-file', toString: () => value }; } },
  };
  return { monaco: monaco as unknown as Parameters<typeof registerSTProviders>[0], providers, models, created, opener };
}

const modelOf = (path: string, text: string) => {
  const rows = text.split('\n');
  return {
    uri: { path: `/7/file:${path}`, scheme: 'zplc-file', toString: () => `zplc-file:///7/file%3A${path}` },
    getValue: () => text,
    getVersionId: () => 1,
    getLineCount: () => rows.length,
    getLineMaxColumn: (line: number) => (rows[line - 1]?.length ?? 0) + 1,
    getWordUntilPosition: (position: { column: number }) => ({ startColumn: position.column, endColumn: position.column, word: '' }),
    getWordAtPosition: () => null,
  };
};
const live = { isCancellationRequested: false };
const cancelled = { isCancellationRequested: true };

function setup(extra: Partial<ProjectBridge> = {}) {
  const written = new Map<string, string>();
  const opened: Array<[string, number, number]> = [];
  const bridge: ProjectBridge = {
    indentSize: () => 2,
    readFile: async (path) => FILES.find((file) => file.path === path)?.content,
    writeFile: async (path, content) => { written.set(path, content); return true; },
    open: async (path, line, column) => { opened.push([path, line, column]); return true; },
    otherFilesMentioning: () => [],
    ...extra,
  };
  const fake = fakeMonaco();
  registerSTProviders(fake.monaco, bridge);
  return { ...fake, written, opened, bridge };
}

beforeEach(() => setCurrentProject(FILES, 7));

const at = (text: string, marker: string, offset = 0): { lineNumber: number; column: number } => {
  const found = text.indexOf(marker);
  expect(found).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, found + offset);
  return { lineNumber: before.split('\n').length, column: found + offset - before.lastIndexOf('\n') };
};

describe('the language service providers (LNG-015, LNG-016)', () => {
  it('registers every provider once for a Monaco, and the editor opener for files without a tab', () => {
    const first = setup();
    expect(Object.keys(first.providers).sort()).toEqual(['completion', 'definition', 'format', 'formatRange', 'hover', 'outline', 'references', 'rename', 'signature']);
    expect(first.opener.current).toBeDefined();
    const before = first.providers.completion;
    registerSTProviders(first.monaco, first.bridge);
    expect(first.providers.completion).toBe(before);
  });

  it('answers nothing for a request that was cancelled', () => {
    const { providers } = setup();
    const model = modelOf('src/main.st', MAIN);
    const position = { lineNumber: 7, column: 4 };
    expect(call(providers.completion!, 'provideCompletionItems', model, position, {}, cancelled)).toEqual({ suggestions: [] });
    expect(call(providers.hover!, 'provideHover', model, position, cancelled)).toBeNull();
    expect(call(providers.outline!, 'provideDocumentSymbols', model, cancelled)).toEqual([]);
    expect(call(providers.definition!, 'provideDefinition', model, position, cancelled)).toBeNull();
    expect(call(providers.references!, 'provideReferences', model, position, { includeDeclaration: true }, cancelled)).toEqual([]);
  });

  it('completes a member of a block that another file declares', () => {
    const { providers } = setup();
    const buffer = MAIN.replace('Run := M.Running;', 'Run := M.');
    const model = modelOf('src/main.st', buffer);
    const position = at(buffer, 'M.\nEND', 2);
    const result = call(providers.completion!, 'provideCompletionItems', model, position, {}, live) as { suggestions: Array<{ label: string; sortText: string }> };
    expect(result.suggestions.map((item) => item.label)).toEqual(['Running', 'Start']);
  });

  it('goes to the definition in another file, and opens a file that has no tab when asked to show it', () => {
    const { providers, opener, opened } = setup();
    const model = modelOf('src/main.st', MAIN);
    const location = call(providers.definition!, 'provideDefinition', model, at(MAIN, 'Motor;', 1), live) as { uri: { path: string }; range: { startLineNumber: number; startColumn: number; endColumn: number } };
    expect(location.uri.path).toBe('/7/file:src/lib/blocks.st');
    expect(location.range).toEqual({ startLineNumber: 8, startColumn: 16, endLineNumber: 8, endColumn: 21 });
    expect(opener.current!.openCodeEditor(undefined, location.uri, { startLineNumber: 8, startColumn: 16 })).toBe(true);
    expect(opened).toEqual([['src/lib/blocks.st', 8, 16]]);
    expect(opener.current!.openCodeEditor(undefined, { path: '/not/a/project/file' })).toBe(false);
  });

  it('finds the references of a block in every file, with the declaration when asked', () => {
    const { providers, created } = setup();
    const model = modelOf('src/main.st', MAIN);
    const withDeclaration = call(providers.references!, 'provideReferences', model, at(MAIN, 'Motor;', 1), { includeDeclaration: true }, live) as Array<{ uri: { path: string }; range: { startLineNumber: number } }>;
    expect(withDeclaration.map((place) => `${place.uri.path}:${place.range.startLineNumber}`)).toEqual(['/7/file:src/lib/blocks.st:8', '/7/file:src/main.st:3']);
    const without = call(providers.references!, 'provideReferences', model, at(MAIN, 'Motor;', 1), { includeDeclaration: false }, live) as unknown[];
    expect(without).toHaveLength(1);
    // the file of the other place has no tab: a model is made for it so that the peek can show it
    expect(created).toContain('/7/file:src/lib/blocks.st');
  });

  it('shows the signature of the function being called', () => {
    const { providers } = setup();
    const buffer = MAIN.replace('Count := Twice(X := Count);', 'Count := Twice(');
    const model = modelOf('src/main.st', buffer);
    const help = call(providers.signature!, 'provideSignatureHelp', model, at(buffer, 'Twice(', 6), live) as { value: { signatures: Array<{ label: string }>; activeParameter: number } };
    expect(help.value.signatures[0]!.label).toBe('Twice(X : INT) : INT');
    expect(help.value.activeParameter).toBe(0);
  });

  it('lists the outline as a tree', () => {
    const { providers } = setup();
    const model = modelOf('src/lib/blocks.st', LIB);
    const symbols = call(providers.outline!, 'provideDocumentSymbols', model, live) as Array<{ name: string; kind: number; children: Array<{ name: string }> }>;
    expect(symbols.map((symbol) => symbol.name)).toEqual(['Twice', 'Motor']);
    expect(symbols[1]!.children.map((child) => child.name)).toEqual(['Start', 'Running']);
    expect(symbols[1]!.kind).toBe(3);
  });

  it('formats the document by lines, and a range of it', () => {
    const { providers } = setup();
    const messy = 'PROGRAM P\nVAR\nA : INT;\nEND_VAR\nA := 1;\nEND_PROGRAM\n';
    const model = modelOf('src/p.st', messy);
    const edits = call(providers.format!, 'provideDocumentFormattingEdits', model, {}, live) as Array<{ range: { startLineNumber: number }; text: string }>;
    expect(edits.map((edit) => [edit.range.startLineNumber, edit.text])).toEqual([[2, '  VAR'], [3, '    A : INT;'], [4, '  END_VAR'], [5, '  A := 1;']]);
    const range = call(providers.formatRange!, 'provideDocumentRangeFormattingEdits', model, { startLineNumber: 5, endLineNumber: 5 }, {}, live) as unknown[];
    expect(range).toHaveLength(1);
  });

  it('renames across files: the edits of this file go to Monaco, the others are written through the bridge', async () => {
    const { providers, written } = setup();
    const model = modelOf('src/lib/blocks.st', LIB);
    const location = call(providers.rename!, 'resolveRenameLocation', model, at(LIB, 'Running :'), live) as { text: string };
    expect(location.text).toBe('Running');
    const edit = await call(providers.rename!, 'provideRenameEdits', model, at(LIB, 'Running :'), 'IsRunning', live) as { edits: Array<{ resource: unknown; textEdit: { text: string; range: { startLineNumber: number } } }>; rejectReason?: string };
    expect(edit.rejectReason).toBeUndefined();
    expect(edit.edits.map((each) => [each.textEdit.range.startLineNumber, each.textEdit.text])).toEqual([[13, 'IsRunning'], [15, 'IsRunning']]);
    expect(written.get('src/main.st')).toContain('Run := M.IsRunning;');
    expect(written.get('src/main.st')).not.toContain('M.Running');
  });

  it('refuses a rename that could change what a name means, with the reason', async () => {
    const { providers, written } = setup();
    const model = modelOf('src/main.st', MAIN);
    const edit = await call(providers.rename!, 'provideRenameEdits', model, at(MAIN, 'Count : INT'), 'Run', live) as { edits: unknown[]; rejectReason?: string };
    expect(edit.edits).toEqual([]);
    expect(edit.rejectReason).toContain('already declared');
    expect(written.size).toBe(0);
  });

  it('refuses a rename of a name that a diagram of the project mentions, naming the file', async () => {
    const { providers, written } = setup({ otherFilesMentioning: () => ['src/main.ld.json'] });
    const model = modelOf('src/main.st', MAIN);
    const edit = await call(providers.rename!, 'provideRenameEdits', model, at(MAIN, 'Count : INT'), 'Total', live) as { rejectReason?: string };
    expect(edit.rejectReason).toContain('src/main.ld.json');
    expect(written.size).toBe(0);
  });
});
