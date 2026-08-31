import { describe, expect, it } from 'bun:test';
import {
  ensureSTLanguageService,
  getSTCompletions,
  getSTDefinition,
  getSTHover,
  getSTOutline,
  getSTReferences,
  getSTSyntaxDiagnostics,
  ST_LANGUAGE_SERVICE_SOURCE_LIMIT,
} from './stLanguageService';

const SOURCE = `VAR_GLOBAL
  Shared : BOOL;
END_VAR

FUNCTION_BLOCK Counter
VAR_INPUT
  Enable : BOOL;
END_VAR
VAR_OUTPUT
  Done : BOOL;
END_VAR
VAR
  Count : INT;
END_VAR
END_FUNCTION_BLOCK

PROGRAM First
VAR
  Local : INT;
  Timer : TON;
END_VAR
END_PROGRAM

PROGRAM Second
VAR
  Other : BOOL;
END_VAR
END_PROGRAM
`;

const REFERENCE_SOURCE = `VAR_GLOBAL
  Shared : BOOL;
  Q : BOOL;
END_VAR

PROGRAM First
VAR
  Local : INT;
  Timer : TON;
END_VAR
  Shared := Local;
  Timer . Q := Q;
END_PROGRAM

PROGRAM Second
VAR
  Local : INT;
END_VAR
  shared := local;
END_PROGRAM
`;

describe('ST language service', () => {
  it('offers globals and only the active POU variables alongside sorted stdlib names', () => {
    const names = getSTCompletions(SOURCE, 19).map((item) => item.label);

    expect(names).toContain('Shared');
    expect(names).toContain('Local');
    expect(names).toContain('Timer');
    expect(names).not.toContain('Other');
    expect(names).toContain('TON');
    expect(names).toContain('MAX');
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'accent' })));
    expect(new Set(names.map((name) => name.toUpperCase())).size).toBe(names.length);
  });

  it('keeps stdlib completion and hover available after parse failure', () => {
    const broken = 'PROGRAM Broken\nVAR\n  Value : BOOL;\n';
    expect(getSTCompletions(broken, 2).map((item) => item.label)).toContain('TON');
    expect(getSTCompletions(broken, 2).map((item) => item.label)).not.toContain('Value');
    expect(getSTHover(broken, 'ton')?.value).toContain('TON');
    expect(getSTHover(broken, 'TON')?.value).toContain('IN');
    expect(getSTHover(broken, 'TON')?.value).not.toContain('elapsed');
    expect(getSTHover(broken, 'mux')?.value).toContain('Variadic');
    expect(getSTHover(broken, 'unknown')).toBeNull();
  });

  it('recovers only closed declarations for the active POU after a later parse error', () => {
    const broken = `VAR_GLOBAL
  Shared : BOOL;
END_VAR

PROGRAM First
VAR
  Local : INT;
END_VAR
  Local := ;
END_PROGRAM

PROGRAM Second
VAR
  Other : BOOL;
END_VAR
END_PROGRAM
`;

    const names = getSTCompletions(broken, 9).map((item) => item.label);
    expect(names).toContain('Shared');
    expect(names).toContain('Local');
    expect(names).not.toContain('Other');
    expect(getSTHover(broken, 'shared', 9)?.value).toContain('VAR_GLOBAL');
    expect(getSTHover(broken, 'local', 9)?.value).toContain('VAR');
    expect(getSTHover(broken, 'other', 9)).toBeNull();
    expect(getSTOutline(broken)).toEqual([]);
  });

  it('does not infer incomplete declarations or recover source names after a lexer error', () => {
    const incomplete = `PROGRAM Broken
VAR
  Complete : BOOL;
END_VAR
VAR
  Incomplete : INT;
END_PROGRAM
`;
    const incompleteNames = getSTCompletions(incomplete, 3).map((item) => item.label);
    expect(incompleteNames).toContain('Complete');
    expect(incompleteNames).not.toContain('Incomplete');

    const lexerBroken = `${incomplete}@`;
    const lexerNames = getSTCompletions(lexerBroken, 3).map((item) => item.label);
    expect(lexerNames).toContain('TON');
    expect(lexerNames).not.toContain('Complete');
    expect(getSTHover(lexerBroken, 'complete', 3)).toBeNull();
  });

  it('fails closed for incomplete POU headers and missing POU closures', () => {
    const missingFunctionReturnType = `FUNCTION MissingReturn
VAR_INPUT
  Input : BOOL;
END_VAR
END_FUNCTION
`;
    const incompleteFbExtends = `FUNCTION_BLOCK MissingBase EXTENDS
VAR
  State : BOOL;
END_VAR
END_FUNCTION_BLOCK
`;
    const missingProgramClosure = `PROGRAM MissingEnd
VAR
  Value : BOOL;
END_VAR
`;

    expect(getSTCompletions(missingFunctionReturnType, 3).map((item) => item.label)).not.toContain('Input');
    expect(getSTCompletions(incompleteFbExtends, 3).map((item) => item.label)).not.toContain('State');
    expect(getSTCompletions(missingProgramClosure, 3).map((item) => item.label)).not.toContain('Value');
  });

  it('recovers VAR_TEMP in a closed function but never method locals as function block variables', () => {
    const functionWithTemp = `FUNCTION Compute : INT
VAR_TEMP
  Scratch : INT;
END_VAR
  Scratch := ;
END_FUNCTION
`;
    expect(getSTCompletions(functionWithTemp, 5).map((item) => item.label)).toContain('Scratch');

    const functionBlockWithMethod = `FUNCTION_BLOCK Controller
VAR
  Before : BOOL;
END_VAR
METHOD Helper
VAR
  Hidden : BOOL;
END_VAR
END_METHOD
VAR
  After : BOOL;
END_VAR
  After := ;
END_FUNCTION_BLOCK
`;
    for (const line of [3, 12]) {
      const names = getSTCompletions(functionBlockWithMethod, line).map((item) => item.label);
      expect(names).toContain('Before');
      expect(names).toContain('After');
      expect(names).not.toContain('Hidden');
    }

    const unclosedMethod = `FUNCTION_BLOCK UnsafeMethod
VAR
  Outside : BOOL;
END_VAR
METHOD Broken
VAR
  Hidden : BOOL;
END_VAR
END_FUNCTION_BLOCK
`;
    const names = getSTCompletions(unclosedMethod, 3).map((item) => item.label);
    expect(names).not.toContain('Outside');
    expect(names).not.toContain('Hidden');
  });

  it('recovers dense closed declaration blocks without changing their token boundaries', () => {
    const blocks = Array.from({ length: 4_000 }, (_, index) => `VAR\n  Value${index} : BOOL;\nEND_VAR`).join('\n');
    const broken = `PROGRAM Dense\n${blocks}\n  Broken := ;\nEND_PROGRAM\n`;

    expect(getSTHover(broken, 'Value3999', 2)?.value).toContain('Value3999');
  });

  it('describes source variables case-insensitively without leaking another POU', () => {
    expect(getSTHover(SOURCE, 'local', 19)?.value).toContain('VAR');
    expect(getSTHover(SOURCE, 'local', 25)).toBeNull();
    expect(getSTHover(SOURCE, 'shared', 25)?.value).toContain('VAR_GLOBAL');
  });

  it('finds exactly one canonical variable declaration in the active scope', () => {
    expect(getSTDefinition(SOURCE, 'shared', 19)).toEqual({ name: 'Shared', line: 2, column: 3 });
    expect(getSTDefinition(SOURCE, 'local', 19)).toEqual({ name: 'Local', line: 19, column: 3 });
    expect(getSTDefinition(SOURCE, 'other', 19)).toBeNull();
    expect(getSTDefinition(SOURCE, 'unknown', 19)).toBeNull();
  });

  it('fails closed for synthetic, oversized, and ambiguous definition sources', () => {
    const broken = `VAR_GLOBAL
  Shared : BOOL;
END_VAR

PROGRAM First
VAR
  Local : INT;
END_VAR
  Local := ;
END_PROGRAM
`;
    const ambiguous = `VAR_GLOBAL
  Duplicate : BOOL;
END_VAR

PROGRAM First
VAR
  Duplicate : BOOL;
END_VAR
END_PROGRAM
`;

    expect(getSTDefinition(broken, 'Shared', 9)).toBeNull();
    expect(getSTDefinition('X'.repeat(ST_LANGUAGE_SERVICE_SOURCE_LIMIT + 1), 'X', 1)).toBeNull();
    expect(getSTDefinition(ambiguous, 'duplicate', 7)).toBeNull();
  });

  it('resolves only unqualified source variables and finds honest buffer-local references', () => {
    expect(getSTDefinition(REFERENCE_SOURCE, 'q', 12, 11)).toBeNull();
    expect(getSTDefinition(REFERENCE_SOURCE, 'timer', 12, 3)).toEqual({ name: 'Timer', line: 9, column: 3 });
    expect(getSTReferences(REFERENCE_SOURCE, 'shared', 11, 3)).toEqual([
      { name: 'Shared', line: 2, column: 3 },
      { name: 'Shared', line: 11, column: 3 },
      { name: 'Shared', line: 19, column: 3 },
    ]);
    expect(getSTReferences(REFERENCE_SOURCE, 'LOCAL', 11, 13)).toEqual([
      { name: 'Local', line: 8, column: 3 },
      { name: 'Local', line: 11, column: 13 },
    ]);
    expect(getSTReferences(REFERENCE_SOURCE, 'local', 19, 13)).toEqual([
      { name: 'Local', line: 17, column: 3 },
      { name: 'Local', line: 19, column: 13 },
    ]);
    expect(getSTReferences(REFERENCE_SOURCE, 'q', 12, 16)).toEqual([
      { name: 'Q', line: 3, column: 3 },
      { name: 'Q', line: 12, column: 16 },
    ]);
    expect(getSTReferences(REFERENCE_SOURCE, 'q', 12, 11)).toEqual([]);
  });

  it('fails closed for broken, oversized, and ambiguous reference sources', () => {
    const ambiguous = `VAR_GLOBAL
  Duplicate : BOOL;
END_VAR

PROGRAM First
VAR
  Duplicate : BOOL;
END_VAR
END_PROGRAM
`;

    expect(getSTReferences('PROGRAM Broken\nVAR\n  Value : BOOL;\n', 'Value', 3, 3)).toEqual([]);
    expect(getSTReferences('X'.repeat(ST_LANGUAGE_SERVICE_SOURCE_LIMIT + 1), 'X', 1, 1)).toEqual([]);
    expect(getSTReferences(ambiguous, 'duplicate', 7, 3)).toEqual([]);
  });

  it('excludes named argument labels and fails closed on top-level type collisions', () => {
    const namedArgument = `VAR_GLOBAL
  Enable : BOOL;
END_VAR

PROGRAM P
VAR
  Timer : TON;
  Start : BOOL;
END_VAR
  Timer(Enable := Start);
END_PROGRAM
`;
    const typeCollision = `VAR_GLOBAL
  State : BOOL;
END_VAR
TYPE State : STRUCT
  Value : BOOL;
END_STRUCT
END_TYPE
PROGRAM P
  State := TRUE;
END_PROGRAM
`;

    expect(getSTReferences(namedArgument, 'enable', 2, 3)).toEqual([{ name: 'Enable', line: 2, column: 3 }]);
    expect(getSTDefinition(typeCollision, 'state', 9, 3)).toBeNull();
    expect(getSTReferences(typeCollision, 'state', 9, 3)).toEqual([]);
  });

  it('offers only globals between top-level POUs', () => {
    for (const line of [16, 23]) {
      const names = getSTCompletions(SOURCE, line).map((item) => item.label);
      expect(names).toContain('Shared');
      expect(names).not.toContain('Count');
      expect(names).not.toContain('Local');
      expect(names).not.toContain('Timer');
    }
  });

  it('returns a source-ordered honest top-level outline', () => {
    const outline = getSTOutline(`${SOURCE}\nTYPE Alarm : STRUCT\nEND_STRUCT\nEND_TYPE\n`);
    expect(outline.map((item) => item.name)).toEqual(['Counter', 'First', 'Second', 'Alarm']);
    expect(outline.map((item) => item.kind)).toEqual(['FunctionBlock', 'Program', 'Program', 'Struct']);
    expect(outline.map((item) => item.column)).toEqual([16, 9, 9, 6]);
  });

  it('fails closed for oversized source and cancellation', () => {
    const huge = 'X'.repeat(ST_LANGUAGE_SERVICE_SOURCE_LIMIT + 1);
    expect(getSTCompletions(huge, 1).map((item) => item.label)).toContain('TON');
    expect(getSTHover(huge, 'TON')?.value).toContain('TON');
    expect(getSTOutline(huge)).toEqual([]);
  });

  it('uses the canonical parser for live syntax diagnostics without claiming a build result', () => {
    expect(getSTSyntaxDiagnostics('PROGRAM Motor\nEND_PROGRAM')).toEqual([]);
    expect(getSTSyntaxDiagnostics('PROGRAM Motor\n@\nEND_PROGRAM')).toMatchObject([
      { code: 'ST_LEXER', type: 'error', line: 2, column: 1 },
    ]);
    expect(getSTSyntaxDiagnostics('PROGRAM Motor\nVAR\n  Ready : BOOL;\n')).toMatchObject([
      { code: 'ST_PARSER', type: 'error' },
    ]);
    expect(getSTSyntaxDiagnostics('X'.repeat(ST_LANGUAGE_SERVICE_SOURCE_LIMIT + 1))).toMatchObject([
      { code: 'ST_SOURCE_LIMIT', type: 'warning' },
    ]);
  });

  it('registers the five providers once per Monaco instance and again for a distinct instance', () => {
    const first = createMonacoMock();
    const second = createMonacoMock();

    ensureSTLanguageService(first.monaco);
    ensureSTLanguageService(first.monaco);
    ensureSTLanguageService(second.monaco);

    expect(first.registrations).toEqual(['completion', 'hover', 'outline', 'definition', 'reference']);
    expect(second.registrations).toEqual(['completion', 'hover', 'outline', 'definition', 'reference']);

    const cancellation = { isCancellationRequested: true };
    const model = {
      getValue: () => SOURCE,
      getWordUntilPosition: () => ({ startColumn: 1, endColumn: 4, word: 'Loc' }),
      getWordAtPosition: () => ({ startColumn: 1, endColumn: 6, word: 'Local' }),
      getLineCount: () => 32,
      getLineMaxColumn: () => 100,
      uri: 'inmemory://zplc/main.st',
    };
    const position = { lineNumber: 19, column: 4 };
    expect((first.providers[0] as CompletionProvider).provideCompletionItems(model, position, {}, cancellation)).toEqual({ suggestions: [] });
    expect((first.providers[1] as HoverProvider).provideHover(model, position, cancellation)).toBeNull();
    expect((first.providers[2] as OutlineProvider).provideDocumentSymbols(model, cancellation)).toEqual([]);
    expect((first.providers[3] as DefinitionProvider).provideDefinition(model, position, cancellation)).toBeNull();
    expect((first.providers[4] as ReferenceProvider).provideReferences(model, position, { includeDeclaration: true }, cancellation)).toEqual([]);

    const active = { isCancellationRequested: false };
    const completions = (first.providers[0] as CompletionProvider).provideCompletionItems(model, position, {}, active) as { suggestions: Array<{ label: string; range: { startLineNumber: number; endLineNumber: number; startColumn: number; endColumn: number } }> };
    const hover = (first.providers[1] as HoverProvider).provideHover(model, position, active) as { contents: Array<{ value: string }> } | null;
    const outline = (first.providers[2] as OutlineProvider).provideDocumentSymbols(model, active) as Array<{ name: string; kind: number; selectionRange: { startLineNumber: number; startColumn: number; endColumn: number } }>;
    const definition = (first.providers[3] as DefinitionProvider).provideDefinition(model, position, active);
    const references = (first.providers[4] as ReferenceProvider).provideReferences(model, position, { includeDeclaration: true }, active);
    expect(completions.suggestions.find((item) => item.label === 'Local')?.range).toEqual({ startLineNumber: 19, endLineNumber: 19, startColumn: 1, endColumn: 4 });
    expect(hover?.contents[0]?.value).toContain('Local');
    expect(outline.find((item) => item.name === 'Counter')).toMatchObject({ kind: 3, selectionRange: { startLineNumber: 5, startColumn: 16, endColumn: 23 } });
    expect(outline.find((item) => item.name === 'First')).toMatchObject({ kind: 1, selectionRange: { startLineNumber: 17, startColumn: 9, endColumn: 14 } });
    expect(definition).toEqual({
      uri: 'inmemory://zplc/main.st',
      range: { startLineNumber: 19, startColumn: 3, endLineNumber: 19, endColumn: 8 },
    });
    expect(references).toEqual([{
      uri: 'inmemory://zplc/main.st',
      range: { startLineNumber: 19, startColumn: 3, endLineNumber: 19, endColumn: 8 },
    }]);
    expect((first.providers[4] as ReferenceProvider).provideReferences(model, position, { includeDeclaration: false }, active)).toEqual([]);
    expect((first.providers[4] as ReferenceProvider).provideReferences({ ...model, getValue: () => { throw new Error('unavailable'); } }, position, { includeDeclaration: true }, active)).toEqual([]);

    const lateGlobalSource = `PROGRAM First
VAR
  Local : BOOL;
END_VAR
  Shared := Local;
END_PROGRAM

VAR_GLOBAL
  Shared : BOOL;
END_VAR
`;
    const lateGlobalModel = { ...model, getValue: () => lateGlobalSource, getWordAtPosition: () => ({ startColumn: 3, endColumn: 9, word: 'Shared' }) };
    const lateGlobalPosition = { lineNumber: 5, column: 3 };
    expect((first.providers[4] as ReferenceProvider).provideReferences(lateGlobalModel, lateGlobalPosition, { includeDeclaration: true }, active)).toEqual([
      { uri: 'inmemory://zplc/main.st', range: { startLineNumber: 5, startColumn: 3, endLineNumber: 5, endColumn: 9 } },
      { uri: 'inmemory://zplc/main.st', range: { startLineNumber: 9, startColumn: 3, endLineNumber: 9, endColumn: 9 } },
    ]);
    expect((first.providers[4] as ReferenceProvider).provideReferences(lateGlobalModel, lateGlobalPosition, { includeDeclaration: false }, active)).toEqual([
      { uri: 'inmemory://zplc/main.st', range: { startLineNumber: 5, startColumn: 3, endLineNumber: 5, endColumn: 9 } },
    ]);
  });
});

interface TestModel {
  getValue(): string;
  getWordUntilPosition(position: { lineNumber: number; column: number }): { startColumn: number; endColumn: number; word: string };
  getWordAtPosition(position: { lineNumber: number; column: number }): { startColumn: number; endColumn: number; word: string } | null;
  getLineCount(): number;
  getLineMaxColumn(line: number): number;
  uri: unknown;
}

interface Cancellation {
  isCancellationRequested: boolean;
}

interface CompletionProvider {
  provideCompletionItems(model: TestModel, position: { lineNumber: number; column: number }, context: object, token: Cancellation): unknown;
}

interface HoverProvider {
  provideHover(model: TestModel, position: { lineNumber: number; column: number }, token: Cancellation): unknown;
}

interface OutlineProvider {
  provideDocumentSymbols(model: TestModel, token: Cancellation): unknown;
}

interface DefinitionProvider {
  provideDefinition(model: TestModel, position: { lineNumber: number; column: number }, token: Cancellation): unknown;
}

interface ReferenceProvider {
  provideReferences(model: TestModel, position: { lineNumber: number; column: number }, context: { includeDeclaration: boolean }, token: Cancellation): unknown;
}

function createMonacoMock(): { monaco: Parameters<typeof ensureSTLanguageService>[0]; registrations: string[]; providers: unknown[] } {
  const registrations: string[] = [];
  const providers: unknown[] = [];
  const monaco = {
    languages: {
      CompletionItemKind: { Variable: 1, Function: 2, Class: 3 },
      SymbolKind: { Object: 1, Function: 2, Class: 3, Interface: 4, Struct: 5, Enum: 6 },
      registerCompletionItemProvider: (_language: string, provider: unknown) => { registrations.push('completion'); providers.push(provider); return { dispose() {} }; },
      registerHoverProvider: (_language: string, provider: unknown) => { registrations.push('hover'); providers.push(provider); return { dispose() {} }; },
      registerDocumentSymbolProvider: (_language: string, provider: unknown) => { registrations.push('outline'); providers.push(provider); return { dispose() {} }; },
      registerDefinitionProvider: (_language: string, provider: unknown) => { registrations.push('definition'); providers.push(provider); return { dispose() {} }; },
      registerReferenceProvider: (_language: string, provider: unknown) => { registrations.push('reference'); providers.push(provider); return { dispose() {} }; },
    },
  } as unknown as Parameters<typeof ensureSTLanguageService>[0];
  return { monaco, registrations, providers };
}
