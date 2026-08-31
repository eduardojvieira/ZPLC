import {
  getAllFBNames,
  getAllFnNames,
  getFB,
  getFn,
  LexerError,
  parse,
  ParseError,
  tokenize,
  TokenType,
  type CompilationUnit,
  type VarDecl,
} from '@zplc/compiler';
import type * as MonacoEditor from 'monaco-editor';
import type { STLiveDiagnostic } from '../types';
import { ST_LANGUAGE_ID } from '../utils/monaco-languages';

// ponytail: synchronous parsing is capped at 200 KiB; move this service to a worker/LSP if measured ST files exceed it.
export const ST_LANGUAGE_SERVICE_SOURCE_LIMIT = 200_000;
const MAX_COMPLETIONS = 256;

type CompletionKind = 'variable' | 'function' | 'functionBlock';

export interface STCompletion {
  label: string;
  kind: CompletionKind;
  detail: string;
}

export interface STHover {
  value: string;
}

export interface STDefinition {
  name: string;
  line: number;
  column: number;
}

export interface STReference {
  name: string;
  line: number;
  column: number;
}

export interface STOutlineSymbol {
  name: string;
  kind: 'Program' | 'Function' | 'FunctionBlock' | 'Interface' | 'Struct' | 'Enum';
  line: number;
  column: number;
}

/**
 * Parses one editor buffer with the compiler's canonical ST frontend.
 * This intentionally stops at syntax: project semantics belong to Build.
 */
export function getSTSyntaxDiagnostics(source: string): STLiveDiagnostic[] {
  if (!isSupportedSource(source)) {
    return [{
      code: 'ST_SOURCE_LIMIT',
      type: 'warning',
      message: `Live ST syntax analysis skipped for files over ${ST_LANGUAGE_SERVICE_SOURCE_LIMIT.toLocaleString()} characters.`,
    }];
  }

  try {
    parse(source);
    return [];
  } catch (error) {
    if (error instanceof LexerError) {
      return [{ code: 'ST_LEXER', type: 'error', message: error.message, line: error.line, column: error.column }];
    }
    if (error instanceof ParseError) {
      return [{ code: 'ST_PARSER', type: 'error', message: error.message, line: error.line, column: error.column }];
    }
    return [{ code: 'ST_ANALYSIS_UNAVAILABLE', type: 'warning', message: 'Live ST syntax analysis is temporarily unavailable.' }];
  }
}

const registeredMonacoInstances = new WeakSet<object>();

export function ensureSTLanguageService(monaco: typeof MonacoEditor): void {
  if (registeredMonacoInstances.has(monaco)) return;
  registeredMonacoInstances.add(monaco);

  monaco.languages.registerCompletionItemProvider(ST_LANGUAGE_ID, {
    provideCompletionItems(model, position, _context, token) {
      if (token.isCancellationRequested) return { suggestions: [] };
      try {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return {
          suggestions: getSTCompletions(model.getValue(), position.lineNumber).map((item) => ({
            ...item,
            kind: completionItemKind(monaco, item.kind),
            insertText: item.label,
            range,
          })),
        };
      } catch {
        return { suggestions: [] };
      }
    },
  });

  monaco.languages.registerHoverProvider(ST_LANGUAGE_ID, {
    provideHover(model, position, token) {
      if (token.isCancellationRequested) return null;
      try {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const hover = getSTHover(model.getValue(), word.word, position.lineNumber);
        return hover ? { contents: [{ value: hover.value }] } : null;
      } catch {
        return null;
      }
    },
  });

  monaco.languages.registerDocumentSymbolProvider(ST_LANGUAGE_ID, {
    provideDocumentSymbols(model, token) {
      if (token.isCancellationRequested) return [];
      try {
        return getSTOutline(model.getValue()).map((symbol) => {
          const lineNumber = clamp(symbol.line, 1, model.getLineCount());
          const startColumn = clamp(symbol.column, 1, model.getLineMaxColumn(lineNumber));
          const endColumn = clamp(startColumn + symbol.name.length, startColumn, model.getLineMaxColumn(lineNumber));
          const range = { startLineNumber: lineNumber, startColumn, endLineNumber: lineNumber, endColumn };
          return {
            name: symbol.name,
            detail: symbol.kind,
            kind: outlineSymbolKind(monaco, symbol.kind),
            range,
            selectionRange: range,
            tags: [],
            children: [],
          };
        });
      } catch {
        return [];
      }
    },
  });

  monaco.languages.registerDefinitionProvider(ST_LANGUAGE_ID, {
    provideDefinition(model, position, token) {
      if (token.isCancellationRequested) return null;
      try {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const definition = getSTDefinition(model.getValue(), word.word, position.lineNumber, position.column);
        if (!definition) return null;
        return {
          uri: model.uri,
          range: {
            startLineNumber: definition.line,
            startColumn: definition.column,
            endLineNumber: definition.line,
            endColumn: definition.column + definition.name.length,
          },
        };
      } catch {
        return null;
      }
    },
  });

  monaco.languages.registerReferenceProvider(ST_LANGUAGE_ID, {
    provideReferences(model, position, context, token) {
      if (token.isCancellationRequested) return [];
      try {
        const word = model.getWordAtPosition(position);
        if (!word) return [];
        const source = model.getValue();
        const references = getSTReferences(source, word.word, position.lineNumber, position.column);
        const declaration = context.includeDeclaration ? null : getSTDefinition(source, word.word, position.lineNumber, position.column);
        if (!context.includeDeclaration && !declaration) return [];
        return references
          .filter((reference) => context.includeDeclaration || reference.line !== declaration!.line || reference.column !== declaration!.column)
          .map((reference) => ({
            uri: model.uri,
            range: {
              startLineNumber: reference.line,
              startColumn: reference.column,
              endLineNumber: reference.line,
              endColumn: reference.column + reference.name.length,
            },
          }));
      } catch {
        return [];
      }
    },
  });
}

export function getSTCompletions(source: string, line: number): STCompletion[] {
  const completions = new Map<string, STCompletion>();
  if (isSupportedSource(source)) {
    for (const variable of sourceVariablesForAssistance(source, line)) {
      addCompletion(completions, {
        label: variable.name,
        kind: 'variable',
        detail: `${variable.section} ${formatDataType(variable)}`,
      });
    }
  }
  for (const name of getAllFnNames()) addCompletion(completions, { label: name, kind: 'function', detail: 'Standard function' });
  for (const name of getAllFBNames()) addCompletion(completions, { label: name, kind: 'functionBlock', detail: 'Standard function block' });

  return [...completions.values()]
    .sort((left, right) => compareName(left.label, right.label))
    .slice(0, MAX_COMPLETIONS);
}

export function getSTHover(source: string, word: string, line = 1): STHover | null {
  if (!word) return null;

  const variable = isSupportedSource(source)
    ? sourceVariablesForAssistance(source, line).find((entry) => sameName(entry.name, word))
    : undefined;
  if (variable) return { value: formatVariableHover(variable) };

  const fn = getFn(word);
  if (fn) return { value: `**${fn.name}** — standard function  \n${fn.variadic ? 'Variadic arguments' : `${fn.argCount} argument${fn.argCount === 1 ? '' : 's'}`}` };

  const fb = getFB(word);
  if (!fb) return null;
  const publicMembers = fb.members.filter((member) => !member.isInternal && (member.isInput || member.isOutput));
  const members = publicMembers.length === 0
    ? 'No public members'
    : publicMembers.map((member) => `- ${member.isInput ? 'Input' : 'Output'} \`${member.name}\`: ${member.dataType ? formatType(member.dataType) : `${member.size} byte${member.size === 1 ? '' : 's'}`}`).join('\n');
  return { value: `**${fb.name}** — standard function block\n\n${members}` };
}

export function getSTDefinition(source: string, word: string, line: number, column?: number): STDefinition | null {
  if (!word || !isSupportedSource(source)) return null;
  const parsed = tryParse(source);
  if (!parsed) return null;
  const variable = resolvedSourceVariable(parsed, word, line, column);
  if (!variable) return null;
  return { name: variable.name, line: variable.line, column: variable.column };
}

export function getSTReferences(source: string, word: string, line: number, column: number): STReference[] {
  if (!word || !isSupportedSource(source)) return [];
  const parsed = tryParse(source);
  if (!parsed) return [];
  const declaration = resolvedSourceVariable(parsed, word, line, column);
  if (!declaration) return [];
  return parsed.tokens.flatMap((token, index) => {
    if (token.type !== TokenType.IDENTIFIER || !sameName(token.value, word) || isExcludedIdentifier(parsed.tokens, index)) return [];
    const resolved = resolvedSourceVariable(parsed, token.value, token.line, token.column);
    return resolved && sameDeclaration(resolved, declaration) ? [{ name: declaration.name, line: token.line, column: token.column }] : [];
  });
}

export function getSTOutline(source: string): STOutlineSymbol[] {
  const parsed = isSupportedSource(source) ? tryParse(source) : null;
  if (!parsed) return [];
  const { unit } = parsed;

  return [
    ...unit.programs.map((entry) => outlineFor(parsed, entry, 'Program', TokenType.PROGRAM)),
    ...unit.functions.map((entry) => outlineFor(parsed, entry, 'Function', TokenType.FUNCTION)),
    ...unit.functionBlocks.map((entry) => outlineFor(parsed, entry, 'FunctionBlock', TokenType.FUNCTION_BLOCK)),
    ...unit.interfaces.map((entry) => outlineFor(parsed, entry, 'Interface', TokenType.INTERFACE)),
    ...unit.typeDefinitions.map((entry) => outlineFor(parsed, entry, entry.kind === 'StructDecl' ? 'Struct' : 'Enum', TokenType.TYPE)),
  ].filter((entry): entry is STOutlineSymbol => entry !== null).sort((left, right) => left.line - right.line || left.column - right.column);
}

interface ParsedSource {
  unit: CompilationUnit;
  tokens: ReturnType<typeof tokenize>;
}

function tryParse(source: string): ParsedSource | null {
  try {
    const tokens = tokenize(source);
    return { unit: parse(source), tokens };
  } catch {
    return null;
  }
}

function sourceVariables(parsed: ParsedSource, line: number): VarDecl[] {
  const { unit, tokens } = parsed;
  const globals = unit.globalVars.flatMap((block) => block.variables);
  const declarations = [
    ...unit.programs.map((entry) => scopedDeclaration(tokens, entry.line, entry.column, TokenType.PROGRAM, TokenType.END_PROGRAM, entry.varBlocks.flatMap((block) => block.variables))),
    ...unit.functions.map((entry) => scopedDeclaration(tokens, entry.line, entry.column, TokenType.FUNCTION, TokenType.END_FUNCTION, [...entry.inputs, ...entry.locals])),
    ...unit.functionBlocks.map((entry) => scopedDeclaration(tokens, entry.line, entry.column, TokenType.FUNCTION_BLOCK, TokenType.END_FUNCTION_BLOCK, [...entry.inputs, ...entry.outputs, ...entry.inouts, ...entry.locals])),
  ].filter((entry): entry is ScopedDeclaration => entry !== null);
  const active = declarations.find((entry) => entry.startLine <= line && line <= entry.endLine);
  return [...globals, ...(active?.variables ?? [])];
}

function resolvedSourceVariable(parsed: ParsedSource, word: string, line: number, column?: number): VarDecl | null {
  if (hasTopLevelSymbolCollision(parsed.unit, word)) return null;
  if (column !== undefined) {
    const tokenIndex = parsed.tokens.findIndex((token) => token.type === TokenType.IDENTIFIER
      && token.line === line
      && token.column <= column
      && column <= token.column + token.value.length
      && sameName(token.value, word));
    if (tokenIndex < 0 || isExcludedIdentifier(parsed.tokens, tokenIndex)) return null;
  }
  const matches = sourceVariables(parsed, line).filter((variable) => sameName(variable.name, word));
  return matches.length === 1 ? matches[0] : null;
}

function sameDeclaration(left: VarDecl, right: VarDecl): boolean {
  return sameName(left.name, right.name) && left.line === right.line && left.column === right.column;
}

function isExcludedIdentifier(tokens: ReturnType<typeof tokenize>, index: number): boolean {
  const previous = tokens[index - 1]?.type;
  return previous === TokenType.DOT || (tokens[index + 1]?.type === TokenType.ASSIGN && (previous === TokenType.LPAREN || previous === TokenType.COMMA));
}

function hasTopLevelSymbolCollision(unit: CompilationUnit, word: string): boolean {
  return [...unit.programs, ...unit.functions, ...unit.functionBlocks, ...unit.interfaces, ...unit.typeDefinitions]
    .some((entry) => sameName(entry.name, word));
}

function sourceVariablesForAssistance(source: string, line: number): VarDecl[] {
  const parsed = tryParse(source);
  if (parsed) return sourceVariables(parsed, line);

  try {
    return recoverClosedDeclarations(source, line);
  } catch {
    // A lexer failure has no trustworthy token boundaries for declaration recovery.
    return [];
  }
}

type PouType = typeof TokenType.PROGRAM | typeof TokenType.FUNCTION | typeof TokenType.FUNCTION_BLOCK;

interface PouRange {
  type: PouType;
  startIndex: number;
  endIndex: number;
  endType: typeof TokenType.END_PROGRAM | typeof TokenType.END_FUNCTION | typeof TokenType.END_FUNCTION_BLOCK;
  closed: boolean;
}

interface TokenRange {
  startIndex: number;
  endIndex: number;
}

const POU_END_TYPES: Record<PouType, PouRange['endType']> = {
  [TokenType.PROGRAM]: TokenType.END_PROGRAM,
  [TokenType.FUNCTION]: TokenType.END_FUNCTION,
  [TokenType.FUNCTION_BLOCK]: TokenType.END_FUNCTION_BLOCK,
};

const ALL_VAR_BLOCK_START_TYPES: Set<string> = new Set([
  TokenType.VAR,
  TokenType.VAR_GLOBAL,
  TokenType.VAR_INPUT,
  TokenType.VAR_OUTPUT,
  TokenType.VAR_IN_OUT,
  TokenType.VAR_TEMP,
]);

const POU_VAR_BLOCK_START_TYPES: Record<PouType, Set<string>> = {
  [TokenType.PROGRAM]: new Set([TokenType.VAR, TokenType.VAR_INPUT, TokenType.VAR_OUTPUT]),
  [TokenType.FUNCTION]: new Set([TokenType.VAR, TokenType.VAR_INPUT, TokenType.VAR_TEMP]),
  [TokenType.FUNCTION_BLOCK]: new Set([TokenType.VAR, TokenType.VAR_INPUT, TokenType.VAR_OUTPUT, TokenType.VAR_IN_OUT, TokenType.VAR_TEMP]),
};

function recoverClosedDeclarations(source: string, line: number): VarDecl[] {
  const tokens = tokenize(source);
  const lineOffsets = lineStartOffsets(source);
  const pous = findPouRanges(tokens);
  let activePou: PouRange | undefined;
  for (const pou of pous) {
    if (pou.closed && tokens[pou.startIndex].line <= line && line <= tokens[pou.endIndex].line) activePou = pou;
  }
  const globalBlocks = findClosedVarBlocks(tokens, 0, tokens.length, new Set([TokenType.VAR_GLOBAL]))
    .filter((block) => !pous.some((pou) => pou.startIndex <= block.startIndex && block.startIndex < pou.endIndex));
  const methodRanges = activePou?.type === TokenType.FUNCTION_BLOCK
    ? findMethodRanges(tokens, activePou.startIndex + 1, activePou.endIndex)
    : [];
  const activeBlocks = activePou && methodRanges !== null
    ? findClosedVarBlocks(tokens, activePou.startIndex + 1, activePou.endIndex, POU_VAR_BLOCK_START_TYPES[activePou.type])
      .filter((block) => !methodRanges.some((method) => method.startIndex <= block.startIndex && block.startIndex <= method.endIndex))
    : [];
  const recoveredSource = [
    ...globalBlocks.map((block) => sourceForTokenRange(source, lineOffsets, tokens, block)),
    ...(activePou && activeBlocks.length > 0 ? [sourceForPou(source, lineOffsets, activePou, activeBlocks, tokens)] : []),
  ].join('\n');
  if (!recoveredSource) return [];

  const recovered = parse(recoveredSource);
  const globals = recovered.globalVars.flatMap((block) => block.variables);
  if (!activePou) return globals;
  const activeVariables = activePou.type === TokenType.PROGRAM
    ? recovered.programs[0]?.varBlocks.flatMap((block) => block.variables)
    : activePou.type === TokenType.FUNCTION
      ? recovered.functions[0] && [...recovered.functions[0].inputs, ...recovered.functions[0].locals]
      : recovered.functionBlocks[0] && [
        ...recovered.functionBlocks[0].inputs,
        ...recovered.functionBlocks[0].outputs,
        ...recovered.functionBlocks[0].inouts,
        ...recovered.functionBlocks[0].locals,
      ];
  return [...globals, ...(activeVariables ?? [])];
}

function findPouRanges(tokens: ReturnType<typeof tokenize>): PouRange[] {
  const starts = tokens.reduce<number[]>((result, token, index) => {
    if (token.type === TokenType.PROGRAM || token.type === TokenType.FUNCTION || token.type === TokenType.FUNCTION_BLOCK) result.push(index);
    return result;
  }, []);
  return starts.map((startIndex, index) => {
    const type = tokens[startIndex].type as PouType;
    const nextStart = starts[index + 1] ?? tokens.length - 1;
    const endType = POU_END_TYPES[type];
    const matchingEnd = tokens.slice(startIndex + 1, nextStart).findIndex((token) => token.type === endType);
    const endIndex = matchingEnd < 0 ? nextStart : startIndex + matchingEnd + 1;
    return { type, startIndex, endIndex, endType, closed: matchingEnd >= 0 };
  });
}

function findClosedVarBlocks(tokens: ReturnType<typeof tokenize>, startIndex: number, endIndex: number, allowedStarts: Set<string>): TokenRange[] {
  const ranges: TokenRange[] = [];
  for (let index = startIndex; index < endIndex; index++) {
    if (!allowedStarts.has(tokens[index].type)) continue;
    let end = index + 1;
    while (end < endIndex && tokens[end].type !== TokenType.END_VAR && !ALL_VAR_BLOCK_START_TYPES.has(tokens[end].type)) end++;
    if (end < endIndex && tokens[end].type === TokenType.END_VAR) {
      ranges.push({ startIndex: index, endIndex: end });
      index = end;
    }
  }
  return ranges;
}

function findMethodRanges(tokens: ReturnType<typeof tokenize>, startIndex: number, endIndex: number): TokenRange[] | null {
  const ranges: TokenRange[] = [];
  for (let index = startIndex; index < endIndex; index++) {
    if (tokens[index].type === TokenType.END_METHOD) return null;
    if (tokens[index].type !== TokenType.METHOD) continue;
    const end = tokens.slice(index + 1, endIndex).findIndex((token) => token.type === TokenType.END_METHOD || token.type === TokenType.METHOD);
    if (end < 0 || tokens[index + end + 1].type !== TokenType.END_METHOD) return null;
    ranges.push({ startIndex: index, endIndex: index + end + 1 });
    index += end + 1;
  }
  return ranges;
}

function sourceForPou(source: string, lineOffsets: number[], pou: PouRange, blocks: TokenRange[], tokens: ReturnType<typeof tokenize>): string {
  const header = source.slice(tokenOffset(lineOffsets, tokens[pou.startIndex]), tokenOffset(lineOffsets, tokens[blocks[0].startIndex]));
  const endOffset = tokenOffset(lineOffsets, tokens[pou.endIndex]);
  const closing = source.slice(endOffset, endOffset + tokens[pou.endIndex].value.length);
  return [header, ...blocks.map((block) => sourceForTokenRange(source, lineOffsets, tokens, block)), closing].join('\n');
}

function sourceForTokenRange(source: string, lineOffsets: number[], tokens: ReturnType<typeof tokenize>, range: TokenRange): string {
  const start = tokenOffset(lineOffsets, tokens[range.startIndex]);
  const end = tokenOffset(lineOffsets, tokens[range.endIndex]) + tokens[range.endIndex].value.length;
  return source.slice(start, end);
}

function lineStartOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') offsets.push(index + 1);
  }
  return offsets;
}

function tokenOffset(lineOffsets: number[], target: { line: number; column: number }): number {
  return lineOffsets[target.line - 1] + target.column - 1;
}

interface ScopedDeclaration {
  startLine: number;
  endLine: number;
  variables: VarDecl[];
}

function scopedDeclaration(tokens: ReturnType<typeof tokenize>, line: number, column: number, startType: typeof TokenType.PROGRAM | typeof TokenType.FUNCTION | typeof TokenType.FUNCTION_BLOCK, endType: typeof TokenType.END_PROGRAM | typeof TokenType.END_FUNCTION | typeof TokenType.END_FUNCTION_BLOCK, variables: VarDecl[]): ScopedDeclaration | null {
  const startIndex = tokens.findIndex((token) => token.type === startType && token.line === line && token.column === column);
  if (startIndex < 0) return null;
  const end = tokens.slice(startIndex + 1).find((token) => token.type === endType);
  return end ? { startLine: line, endLine: end.line, variables } : null;
}

function outlineFor(parsed: ParsedSource, entry: { name: string; line: number; column: number }, kind: STOutlineSymbol['kind'], startType: typeof TokenType.PROGRAM | typeof TokenType.FUNCTION | typeof TokenType.FUNCTION_BLOCK | typeof TokenType.INTERFACE | typeof TokenType.TYPE): STOutlineSymbol | null {
  const startIndex = parsed.tokens.findIndex((token) => token.type === startType && token.line === entry.line && token.column === entry.column);
  const name = startIndex < 0 ? undefined : parsed.tokens.slice(startIndex + 1).find((token) => token.type === TokenType.IDENTIFIER);
  return name ? outline(entry.name, kind, name.line, name.column) : null;
}

function addCompletion(completions: Map<string, STCompletion>, completion: STCompletion): void {
  const key = completion.label.toUpperCase();
  if (!completions.has(key)) completions.set(key, completion);
}

function completionItemKind(monaco: typeof MonacoEditor, kind: CompletionKind): MonacoEditor.languages.CompletionItemKind {
  if (kind === 'variable') return monaco.languages.CompletionItemKind.Variable;
  return kind === 'function' ? monaco.languages.CompletionItemKind.Function : monaco.languages.CompletionItemKind.Class;
}

function outlineSymbolKind(monaco: typeof MonacoEditor, kind: STOutlineSymbol['kind']): MonacoEditor.languages.SymbolKind {
  switch (kind) {
    case 'Program': return monaco.languages.SymbolKind.Object;
    case 'Function': return monaco.languages.SymbolKind.Function;
    case 'FunctionBlock': return monaco.languages.SymbolKind.Class;
    case 'Interface': return monaco.languages.SymbolKind.Interface;
    case 'Struct': return monaco.languages.SymbolKind.Struct;
    case 'Enum': return monaco.languages.SymbolKind.Enum;
  }
}

function formatVariableHover(variable: VarDecl): string {
  const address = variable.ioAddress ? `  \nAddress: \`${formatAddress(variable)}\`` : '';
  return `**${variable.name}** — \`${formatDataType(variable)}\`  \nSection: \`${variable.section}\`${address}`;
}

function formatDataType(variable: VarDecl): string {
  return formatType(variable.dataType);
}

function formatType(dataType: VarDecl['dataType']): string {
  if (typeof dataType === 'string') return dataType;
  if (dataType.kind === 'ArrayType') return `ARRAY[${dataType.dimensions.map((dimension) => `${dimension.lowerBound}..${dimension.upperBound}`).join(', ')}] OF ${dataType.elementType}`;
  return `REF_TO ${formatType(dataType.baseType)}`;
}

function formatAddress(variable: VarDecl): string {
  const address = variable.ioAddress!;
  const size = address.size ?? '';
  const bit = address.size === 'X' || address.bitOffset !== 0 ? `.${address.bitOffset}` : '';
  return `%${address.type}${size}${address.index}${bit}`;
}

function outline(name: string, kind: STOutlineSymbol['kind'], line: number, column: number): STOutlineSymbol {
  return { name, kind, line, column };
}

function isSupportedSource(source: string): boolean {
  return source.length <= ST_LANGUAGE_SERVICE_SOURCE_LIMIT;
}

function sameName(left: string, right: string): boolean {
  return left.toUpperCase() === right.toUpperCase();
}

function compareName(left: string, right: string): number {
  return left.toUpperCase().localeCompare(right.toUpperCase()) || left.localeCompare(right);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
